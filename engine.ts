import { SYMBOL_MAP, SYMBOLS, type SymbolDef } from "./catalog";

/**
 * Deterministic market simulator.
 *
 * Every price is a pure function of (symbol, tick index). Paths are built with a
 * hierarchical Brownian-bridge (Lévy construction) in blocks of 2^20 ticks, so any
 * tick can be evaluated in O(log n) and contiguous ranges in O(range). Because prices
 * are reproducible, trades can be settled at any time (even after a restart) against
 * exactly the same tick history the user saw on their chart.
 */

const SECRET = process.env.MARKET_SEED ?? "arena-markets-v1";
const B = 1 << 20;
const SECONDS_PER_YEAR = 31536000;

function mix(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function strSeed(s: string): number {
  let h = 0x811c9dc5;
  const str = s + SECRET;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return mix(h);
}

const seeds = new Map<string, number>();
function seedOf(def: SymbolDef): number {
  let s = seeds.get(def.id);
  if (s === undefined) {
    s = strSeed(def.id);
    seeds.set(def.id, s);
  }
  return s;
}

function rnd(seed: number, a: number, b: number, salt: number): number {
  let h = mix(seed ^ Math.imul(a | 0, 0x9e3779b1));
  h = mix(h ^ Math.imul(b | 0, 0x85ebca6b));
  h = mix(h ^ Math.imul(salt, 0xc2b2ae35));
  return (h + 0.5) / 4294967296;
}

function gauss(seed: number, a: number, b: number): number {
  const u1 = rnd(seed, a, b, 1);
  const u2 = rnd(seed, a, b, 2);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function sigmaPerSecond(def: SymbolDef): number {
  return def.vol / Math.sqrt(SECONDS_PER_YEAR);
}

export function sigmaPerTick(def: SymbolDef): number {
  return sigmaPerSecond(def) * Math.sqrt(def.interval);
}

function bridge(seed: number, k: number, from: number, to: number, out: Float64Array) {
  function rec(lo: number, hi: number, wlo: number, whi: number) {
    if (hi < from || lo > to) return;
    if (lo >= from && lo <= to) out[lo - from] = wlo;
    if (hi >= from && hi <= to) out[hi - from] = whi;
    if (hi - lo <= 1) return;
    const mid = (lo + hi) >>> 1;
    const wm = (wlo + whi) / 2 + gauss(seed, k, mid) * Math.sqrt((hi - lo) / 4);
    rec(lo, mid, wlo, wm);
    rec(mid, hi, wm, whi);
  }
  rec(0, B, 0, 0);
}

function anchor(seed: number, k: number, sigma: number): number {
  return gauss(seed, k, -7) * sigma * Math.sqrt(B) * 0.35;
}

function spikeParams(def: SymbolDef) {
  const sigma = sigmaPerTick(def);
  if (def.kind === "boom" || def.kind === "crash") {
    return { n: def.spikeN ?? 500, amp: 0.005, len: Math.round((def.spikeN ?? 500) * 0.7), sign: def.kind === "boom" ? 1 : -1, random: false };
  }
  if (def.kind === "jump") {
    return { n: def.spikeN ?? 1200, amp: sigma * 30, len: 150, sign: 1, random: true };
  }
  return null;
}

/** Prices for ticks from..to (inclusive). */
export function seriesRange(def: SymbolDef, from: number, to: number): Float64Array {
  const count = to - from + 1;
  const out = new Float64Array(Math.max(count, 0));
  if (count <= 0) return out;
  const seed = seedOf(def);
  const sigma = sigmaPerTick(def);
  const logs = new Float64Array(count);

  const k0 = Math.floor(from / B);
  const k1 = Math.floor(to / B);
  for (let k = k0; k <= k1; k++) {
    const start = k * B;
    const lo = Math.max(from, start) - start;
    const hi = Math.min(to, start + B - 1) - start;
    const w = new Float64Array(hi - lo + 1);
    bridge(seed, k, lo, hi, w);
    const a0 = anchor(seed, k, sigma);
    const a1 = anchor(seed, k + 1, sigma);
    for (let i = lo; i <= hi; i++) {
      const f = i / B;
      logs[start + i - from] = a0 * (1 - f) + a1 * f + sigma * w[i - lo];
    }
  }

  const sp = spikeParams(def);
  if (sp) {
    const spikes: { t: number; a: number }[] = [];
    const p = 1 / sp.n;
    for (let t = from - sp.len; t <= to; t++) {
      if (rnd(seed, t, 0, 77) < p) {
        const mag = sp.amp * (0.6 + 0.8 * rnd(seed, t, 1, 78));
        const dir = sp.random ? (rnd(seed, t, 2, 79) < 0.5 ? -1 : 1) : sp.sign;
        spikes.push({ t, a: dir * mag });
      }
    }
    let first = 0;
    for (let i = 0; i < count; i++) {
      const n = from + i;
      while (first < spikes.length && spikes[first].t <= n - sp.len) first++;
      let add = 0;
      for (let j = first; j < spikes.length && spikes[j].t <= n; j++) {
        add += spikes[j].a * (1 - (n - spikes[j].t) / sp.len);
      }
      logs[i] += add;
    }
  }

  const f = Math.pow(10, def.digits);
  for (let i = 0; i < count; i++) {
    let price = def.base * Math.exp(logs[i]);
    if (def.kind === "step") price = Math.round(price * 10) / 10;
    out[i] = Math.round(price * f) / f;
  }
  return out;
}

export function priceAt(def: SymbolDef, tick: number): number {
  return seriesRange(def, tick, tick)[0];
}

export function tickAt(def: SymbolDef, nowMs: number): number {
  return Math.floor(nowMs / (def.interval * 1000));
}

export function tickTimeMs(def: SymbolDef, tick: number): number {
  return tick * def.interval * 1000;
}

export function lastDigit(price: number, digits: number): number {
  return Math.round(price * Math.pow(10, digits)) % 10;
}

export interface Quote {
  symbol: string;
  tick: number;
  time: number; // seconds
  price: number;
  prev: number;
  change: number; // % vs 24h ago
}

const quoteCache = new Map<string, { tick: number; q: Quote }>();

export function quote(def: SymbolDef, nowMs = Date.now()): Quote {
  const tick = tickAt(def, nowMs);
  const c = quoteCache.get(def.id);
  if (c && c.tick === tick) return c.q;
  const [prev, price] = seriesRange(def, tick - 1, tick);
  const dayAgo = priceAt(def, tick - Math.round(86400 / def.interval));
  const q: Quote = {
    symbol: def.id,
    tick,
    time: tick * def.interval,
    price,
    prev,
    change: dayAgo ? ((price - dayAgo) / dayAgo) * 100 : 0,
  };
  quoteCache.set(def.id, { tick, q });
  return q;
}

export function allQuotes(nowMs = Date.now()): Quote[] {
  return SYMBOLS.map((s) => quote(s, nowMs));
}

export function getDef(id: string): SymbolDef | undefined {
  return SYMBOL_MAP[id];
}

export function history(def: SymbolDef, count: number, nowMs = Date.now()) {
  const end = tickAt(def, nowMs);
  const n = Math.min(Math.max(count, 1), 5000);
  const prices = seriesRange(def, end - n + 1, end);
  return Array.from(prices, (p, i) => ({ time: (end - n + 1 + i) * def.interval, price: p }));
}

export function candles(def: SymbolDef, granularity: number, count: number, nowMs = Date.now()) {
  const nowSec = Math.floor(nowMs / 1000);
  const last = Math.floor(nowSec / granularity) * granularity;
  const n = Math.min(Math.max(count, 1), 500);
  const ticksPer = Math.max(1, Math.round(granularity / def.interval));
  const out: { time: number; open: number; high: number; low: number; close: number }[] = [];
  const nowTick = tickAt(def, nowMs);
  const contiguousLimit = 130;

  for (let i = n - 1; i >= 0; i--) {
    const start = last - i * granularity;
    const t0 = Math.ceil(start / def.interval);
    let t1 = Math.ceil((start + granularity) / def.interval) - 1;
    if (t1 > nowTick) t1 = nowTick;
    if (t1 < t0) continue;
    let arr: Float64Array;
    if (t1 - t0 + 1 <= contiguousLimit || ticksPer <= contiguousLimit) {
      arr = seriesRange(def, t0, t1);
    } else {
      // sample ~14 ticks evenly for long candles
      const samples = 14;
      const ticks: number[] = [];
      for (let s = 0; s < samples; s++) ticks.push(t0 + Math.floor(((t1 - t0) * s) / (samples - 1)));
      arr = Float64Array.from(ticks.map((t) => priceAt(def, t)));
    }
    let hi = -Infinity;
    let lo = Infinity;
    for (const v of arr) {
      if (v > hi) hi = v;
      if (v < lo) lo = v;
    }
    out.push({ time: start, open: arr[0], high: hi, low: lo, close: arr[arr.length - 1] });
  }
  return out;
}
