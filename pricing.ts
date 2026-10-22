import {
  CATEGORIES,
  GROWTH_RATES,
  MAX_STAKE,
  MIN_STAKE,
  TYPE_LABELS,
  categoriesFor,
  getSymbol,
  multipliersFor,
  ticksAllowed,
  type Category,
  type SymbolDef,
} from "./catalog";
import { quote, sigmaPerSecond } from "./engine";
import { r2 } from "./util";

export const MARGIN = 0.04;
export const SELL_HAIRCUT = 0.03;
export const COMMISSION_RATE = 0.0005;

export const ACCU_C: Record<string, number> = { "0.01": 2.55, "0.02": 2.3, "0.03": 2.15, "0.04": 2.04, "0.05": 1.95 };

export class TradeError extends Error {}

export interface TradeRequest {
  symbol: string;
  contractType: string;
  stake: number;
  durationUnit?: string;
  duration?: number;
  barrierOffset?: number;
  digit?: number;
  growthRate?: number;
  multiplier?: number;
  takeProfit?: number | null;
  stopLoss?: number | null;
}

export interface PreparedTrade {
  def: SymbolDef;
  type: string;
  category: Category;
  stake: number;
  payout: number | null;
  entryTick: number;
  exitTick: number | null;
  entrySpot: number;
  barrier: number | null;
  digit: number | null;
  growthRate: number | null;
  multiplier: number | null;
  commission: number | null;
  takeProfit: number | null;
  stopLoss: number | null;
  durationLabel: string;
  unit: string;
}

export function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

export function typeCategory(type: string): Category | null {
  for (const c of CATEGORIES) if (c.sides.some((s) => s.type === type)) return c.id;
  return null;
}

export function winProbability(
  type: string,
  o: { spot: number; entry: number; barrier: number | null; digit: number | null; tauSec: number; sigmaSec: number },
): number {
  const sd = Math.max(o.sigmaSec * Math.sqrt(Math.max(o.tauSec, 0)), 1e-9);
  const above = (k: number) => normCdf(Math.log(o.spot / k) / sd);
  const touch = () => {
    const k = o.barrier ?? o.entry;
    const d = Math.abs(Math.log(k / o.spot)) / sd;
    return Math.min(1, 2 * normCdf(-d));
  };
  const d = o.digit ?? 0;
  switch (type) {
    case "CALL": return above(o.entry);
    case "PUT": return 1 - above(o.entry);
    case "HIGHER": return above(o.barrier ?? o.entry);
    case "LOWER": return 1 - above(o.barrier ?? o.entry);
    case "TOUCH": return touch();
    case "NOTOUCH": return 1 - touch();
    case "DIGITMATCH": return 0.1;
    case "DIGITDIFF": return 0.9;
    case "DIGITEVEN":
    case "DIGITODD": return 0.5;
    case "DIGITOVER": return (9 - d) / 10;
    case "DIGITUNDER": return d / 10;
  }
  return 0.5;
}

const UNIT_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
const UNIT_NAMES: Record<string, [string, string]> = {
  t: ["tick", "ticks"],
  s: ["second", "seconds"],
  m: ["minute", "minutes"],
  h: ["hour", "hours"],
  d: ["day", "days"],
};

function parseDuration(def: SymbolDef, cat: Category, unit: string | undefined, value: number | undefined) {
  const u = unit ?? "t";
  if (!UNIT_NAMES[u]) throw new TradeError("Invalid duration unit");
  const v = Number(value);
  if (!Number.isInteger(v) || v <= 0) throw new TradeError("Duration must be a whole number");
  const isDigit = cat === "matchdiff" || cat === "evenodd" || cat === "overunder";
  if (u === "t") {
    if (!ticksAllowed(def)) throw new TradeError("Tick durations are only available on Derived markets");
    const min = cat === "updown" || isDigit ? 1 : 2;
    if (v < min || v > 10) throw new TradeError(`Ticks must be between ${min} and 10`);
    return { ticks: v, unit: u, label: `${v} ${UNIT_NAMES.t[v === 1 ? 0 : 1]}`, seconds: v * def.interval };
  }
  if (isDigit) throw new TradeError("Digit contracts only support tick durations");
  const seconds = v * UNIT_SECONDS[u];
  if (seconds < 15) throw new TradeError("Minimum duration is 15 seconds");
  if (seconds > 30 * 86400) throw new TradeError("Maximum duration is 30 days");
  return { ticks: Math.max(1, Math.ceil(seconds / def.interval)), unit: u, label: `${v} ${UNIT_NAMES[u][v === 1 ? 0 : 1]}`, seconds };
}

export function suggestOffset(def: SymbolDef, spot: number, seconds: number, mult: number): number {
  const sd = sigmaPerSecond(def) * Math.sqrt(Math.max(seconds, 1));
  const min = Math.pow(10, -def.digits);
  const raw = spot * sd * mult;
  const step = Math.pow(10, -def.digits);
  return Math.max(min, Math.round(raw / step) * step);
}

export function prepare(req: TradeRequest, nowMs = Date.now()): PreparedTrade {
  const def = getSymbol(req.symbol);
  if (!def) throw new TradeError("Unknown market");
  const category = typeCategory(req.contractType);
  if (!category) throw new TradeError("Unknown contract type");
  if (!categoriesFor(def).includes(category))
    throw new TradeError(`${TYPE_LABELS[req.contractType]} is not available on ${def.name}`);
  const stake = Number(req.stake);
  if (!Number.isFinite(stake) || stake < MIN_STAKE) throw new TradeError(`Minimum stake is $${MIN_STAKE.toFixed(2)}`);
  if (stake > MAX_STAKE) throw new TradeError(`Maximum stake is $${MAX_STAKE.toFixed(2)}`);
  const q = quote(def, nowMs);
  const S = q.price;
  const base = {
    def, type: req.contractType, category, stake: r2(stake), entryTick: q.tick, entrySpot: S,
    payout: null as number | null, exitTick: null as number | null, barrier: null as number | null,
    digit: null as number | null, growthRate: null as number | null, multiplier: null as number | null,
    commission: null as number | null, takeProfit: null as number | null, stopLoss: null as number | null,
    durationLabel: "", unit: "t",
  };

  if (category === "accumulator") {
    const g = Number(req.growthRate);
    if (!GROWTH_RATES.includes(g)) throw new TradeError("Invalid growth rate");
    const tp = req.takeProfit ? Number(req.takeProfit) : null;
    if (tp !== null && (!Number.isFinite(tp) || tp < 0.01)) throw new TradeError("Invalid take profit");
    return { ...base, growthRate: g, takeProfit: tp ? r2(tp) : null, durationLabel: "Until knock-out / cash-out" };
  }

  if (category === "multiplier") {
    const m = Number(req.multiplier);
    if (!multipliersFor(def).includes(m)) throw new TradeError("Invalid multiplier for this market");
    const notional = stake * m;
    const commission = Math.max(0.01, r2(notional * COMMISSION_RATE));
    const tp = req.takeProfit ? Number(req.takeProfit) : null;
    const sl = req.stopLoss ? Number(req.stopLoss) : null;
    if (tp !== null && (!Number.isFinite(tp) || tp < 0.01)) throw new TradeError("Invalid take profit");
    if (sl !== null && (!Number.isFinite(sl) || sl < 0.01 || sl > stake)) throw new TradeError("Stop loss must be between $0.01 and your stake");
    return { ...base, multiplier: m, commission, takeProfit: tp ? r2(tp) : null, stopLoss: sl ? r2(sl) : null, durationLabel: "Until closed" };
  }

  const dur = parseDuration(def, category, req.durationUnit, req.duration);
  let barrier: number | null = null;
  let digit: number | null = null;
  if (category === "highlow" || category === "touch") {
    const off = Number(req.barrierOffset);
    if (!Number.isFinite(off) || off === 0) throw new TradeError("Enter a non-zero barrier offset");
    barrier = Number((S + off).toFixed(def.digits));
    if (barrier <= 0) throw new TradeError("Barrier must be positive");
    if (barrier === S) throw new TradeError("Barrier too close to spot");
  }
  if (category === "matchdiff" || category === "overunder") {
    digit = Number(req.digit);
    if (!Number.isInteger(digit) || digit < 0 || digit > 9) throw new TradeError("Select a digit from 0 to 9");
    if (req.contractType === "DIGITOVER" && digit > 8) throw new TradeError("Over: pick a digit from 0 to 8");
    if (req.contractType === "DIGITUNDER" && digit < 1) throw new TradeError("Under: pick a digit from 1 to 9");
  }
  const p = winProbability(req.contractType, { spot: S, entry: S, barrier, digit, tauSec: dur.seconds, sigmaSec: sigmaPerSecond(def) });
  if (p < 0.03) throw new TradeError("Barrier is too far from spot. Choose a closer barrier.");
  const payout = r2(stake / (p * (1 + MARGIN)));
  if (payout < stake * 1.01) throw new TradeError("Payout is too low for this barrier/duration. Choose a different barrier.");
  if (payout > 100000) throw new TradeError("Maximum payout exceeded. Lower your stake.");
  return { ...base, payout, exitTick: q.tick + dur.ticks, barrier, digit, durationLabel: dur.label, unit: dur.unit };
}

export function buildProposal(req: Omit<TradeRequest, "contractType"> & { category: string }, nowMs = Date.now()) {
  const def = getSymbol(req.symbol);
  if (!def) throw new TradeError("Unknown market");
  const cat = CATEGORIES.find((c) => c.id === req.category);
  if (!cat) throw new TradeError("Unknown category");
  const q = quote(def, nowMs);
  const secs = (() => {
    try {
      return parseDuration(def, cat.id, req.durationUnit, req.duration).seconds;
    } catch {
      return 60;
    }
  })();
  const suggestions = {
    highlow: suggestOffset(def, q.price, secs, 0.6),
    touch: suggestOffset(def, q.price, secs, 1.3),
  };
  const sides = cat.sides.map((s) => {
    try {
      const t = prepare({ ...req, contractType: s.type }, nowMs);
      return {
        type: s.type, label: s.label, color: s.color,
        payout: t.payout, profit: t.payout ? r2(t.payout - t.stake) : null,
        pct: t.payout ? r2((t.payout / t.stake - 1) * 100) : null,
        barrier: t.barrier, error: null as string | null,
      };
    } catch (e) {
      if (!(e instanceof TradeError)) throw e;
      return { type: s.type, label: s.label, color: s.color, payout: null, profit: null, pct: null, barrier: null, error: e.message };
    }
  });
  const extra: Record<string, unknown> = {};
  if (cat.id === "accumulator") {
    const g = Number(req.growthRate) || 0.01;
    const c = ACCU_C[String(g)] ?? 2.3;
    const sdTick = sigmaPerSecond(def) * Math.sqrt(def.interval);
    extra.barrierRange = Number((q.price * sdTick * c).toFixed(def.digits + 1));
    extra.survival = Number((1 - 2 * normCdf(-c)).toFixed(4));
  }
  if (cat.id === "multiplier") {
    const m = Number(req.multiplier) || multipliersFor(def)[0];
    const stake = Number(req.stake) || 0;
    const commission = Math.max(0.01, r2(stake * m * COMMISSION_RATE));
    extra.commission = commission;
    extra.stopOutUp = Number((q.price * (1 - (stake - commission) / (stake * m || 1))).toFixed(def.digits));
    extra.stopOutDown = Number((q.price * (1 + (stake - commission) / (stake * m || 1))).toFixed(def.digits));
    extra.notional = r2(stake * m);
  }
  return { symbol: def.id, spot: q.price, tick: q.tick, time: q.time, suggestions, sides, extra };
}
