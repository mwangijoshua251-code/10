"use client";

import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SymbolDef } from "@/lib/catalog";
import { api, fmtPrice } from "@/lib/client";
import type { ContractView, QuoteView } from "@/lib/types";

const FRAMES: { label: string; g: number }[] = [
  { label: "Ticks", g: 0 },
  { label: "1m", g: 60 },
  { label: "2m", g: 120 },
  { label: "5m", g: 300 },
  { label: "15m", g: 900 },
  { label: "1h", g: 3600 },
  { label: "4h", g: 14400 },
  { label: "1d", g: 86400 },
];

interface Candle { time: number; open: number; high: number; low: number; close: number }
interface Tick { time: number; price: number }

function sma(values: number[], n: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= n) sum -= values[i - n];
    out.push(i >= n - 1 ? sum / n : null);
  }
  return out;
}
function ema(values: number[], n: number): (number | null)[] {
  const k = 2 / (n + 1);
  const out: (number | null)[] = [];
  let prev: number | null = null;
  values.forEach((v, i) => {
    if (i < n - 1) return out.push(null);
    prev = prev === null ? values.slice(0, n).reduce((a, b) => a + b, 0) / n : v * k + prev * (1 - k);
    out.push(prev);
  });
  return out;
}
function boll(values: number[], n: number, m: number) {
  const mid = sma(values, n);
  const up: (number | null)[] = [];
  const lo: (number | null)[] = [];
  values.forEach((_, i) => {
    const mean = mid[i];
    if (mean === null) {
      up.push(null);
      lo.push(null);
      return;
    }
    let s = 0;
    for (let j = i - n + 1; j <= i; j++) s += (values[j] - mean) ** 2;
    const sd = Math.sqrt(s / n);
    up.push(mean + m * sd);
    lo.push(mean - m * sd);
  });
  return { mid, up, lo };
}

type Ind = "sma" | "ema" | "bb";

export function PriceChart({ def, quote, contracts }: { def: SymbolDef; quote?: QuoteView; contracts: ContractView[] }) {
  const el = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainRef = useRef<ISeriesApi<"Area"> | ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | null>(null);
  const indRefs = useRef<Record<string, ISeriesApi<"Line">>>({});
  const ticksRef = useRef<Tick[]>([]);
  const candlesRef = useRef<Candle[]>([]);
  const linesRef = useRef<IPriceLine[]>([]);
  const [g, setG] = useState(0);
  const [style, setStyle] = useState<"candle" | "line">("candle");
  const [inds, setInds] = useState<Ind[]>([]);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showInd, setShowInd] = useState(false);
  const lastTime = useRef(0);

  const priceFormat = useMemo(() => ({ type: "price" as const, precision: def.digits, minMove: Math.pow(10, -def.digits) }), [def.digits]);

  const closes = () => (g === 0 ? ticksRef.current.map((t) => t.price) : candlesRef.current.map((c) => c.close));
  const times = () => (g === 0 ? ticksRef.current.map((t) => t.time) : candlesRef.current.map((c) => c.time));

  const drawIndicators = () => {
    const vals = closes();
    const ts = times();
    const set = (key: string, arr: (number | null)[]) => {
      const s = indRefs.current[key];
      if (!s) return;
      const data: { time: UTCTimestamp; value: number }[] = [];
      arr.forEach((v, i) => {
        if (v !== null) data.push({ time: ts[i] as UTCTimestamp, value: v });
      });
      s.setData(data);
    };
    if (inds.includes("sma")) set("sma", sma(vals, 20));
    if (inds.includes("ema")) set("ema", ema(vals, 20));
    if (inds.includes("bb")) {
      const b = boll(vals, 20, 2);
      set("bbu", b.up);
      set("bbm", b.mid);
      set("bbl", b.lo);
    }
  };

  // build chart + load history
  useEffect(() => {
    if (!el.current) return;
    let cancelled = false;
    const chart = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#0d1319" }, textColor: "#8794a5", fontSize: 11 },
      grid: { vertLines: { color: "#131b25" }, horzLines: { color: "#131b25" } },
      rightPriceScale: { borderColor: "#243040", scaleMargins: { top: 0.12, bottom: 0.1 } },
      timeScale: { borderColor: "#243040", timeVisible: true, secondsVisible: g <= 120, rightOffset: 6 },
      crosshair: { mode: CrosshairMode.Normal },
    });
    chartRef.current = chart;
    indRefs.current = {};
    linesRef.current = [];
    setLoading(true);

    let main: ISeriesApi<"Area"> | ISeriesApi<"Candlestick"> | ISeriesApi<"Line">;
    if (g === 0) {
      main = chart.addSeries(AreaSeries, { lineColor: "#2f8cff", topColor: "rgba(47,140,255,0.28)", bottomColor: "rgba(47,140,255,0.01)", lineWidth: 2, priceFormat });
    } else if (style === "candle") {
      main = chart.addSeries(CandlestickSeries, { upColor: "#00c390", downColor: "#ff444f", borderVisible: false, wickUpColor: "#00c390", wickDownColor: "#ff444f", priceFormat });
    } else {
      main = chart.addSeries(LineSeries, { color: "#2f8cff", lineWidth: 2, priceFormat });
    }
    mainRef.current = main;
    const mk = (color: string, width: 1 | 2 = 1, dashed = false) =>
      chart.addSeries(LineSeries, { color, lineWidth: width, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, lineStyle: dashed ? LineStyle.Dashed : LineStyle.Solid, priceFormat });
    if (inds.includes("sma")) indRefs.current.sma = mk("#f5a524", 2);
    if (inds.includes("ema")) indRefs.current.ema = mk("#c084fc", 2);
    if (inds.includes("bb")) {
      indRefs.current.bbu = mk("#5b7ea6", 1, true);
      indRefs.current.bbm = mk("#5b7ea6", 1);
      indRefs.current.bbl = mk("#5b7ea6", 1, true);
    }

    (async () => {
      try {
        if (g === 0) {
          const d = await api<{ ticks: Tick[] }>(`/api/markets/${def.id}/history?count=600`);
          if (cancelled) return;
          ticksRef.current = d.ticks;
          (main as ISeriesApi<"Area">).setData(d.ticks.map((t) => ({ time: t.time as UTCTimestamp, value: t.price })));
          lastTime.current = d.ticks.length ? d.ticks[d.ticks.length - 1].time : 0;
        } else {
          const d = await api<{ candles: Candle[] }>(`/api/markets/${def.id}/history?granularity=${g}&count=300`);
          if (cancelled) return;
          candlesRef.current = d.candles;
          if (style === "candle") (main as ISeriesApi<"Candlestick">).setData(d.candles.map((c) => ({ ...c, time: c.time as UTCTimestamp })));
          else (main as ISeriesApi<"Line">).setData(d.candles.map((c) => ({ time: c.time as UTCTimestamp, value: c.close })));
          lastTime.current = d.candles.length ? d.candles[d.candles.length - 1].time : 0;
        }
        drawIndicators();
        chart.timeScale().fitContent();
        chart.timeScale().scrollToPosition(6, false);
        setVersion((v) => v + 1);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      chart.remove();
      chartRef.current = null;
      mainRef.current = null;
      indRefs.current = {};
      linesRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def.id, g, style, inds.join(","), priceFormat]);

  // live updates
  useEffect(() => {
    const s = mainRef.current;
    if (!s || !quote || quote.symbol !== def.id || loading) return;
    if (g === 0) {
      if (quote.time <= lastTime.current) return;
      lastTime.current = quote.time;
      ticksRef.current.push({ time: quote.time, price: quote.price });
      if (ticksRef.current.length > 2500) ticksRef.current.shift();
      (s as ISeriesApi<"Area">).update({ time: quote.time as UTCTimestamp, value: quote.price });
    } else {
      const bucket = Math.floor(quote.time / g) * g;
      const arr = candlesRef.current;
      const last = arr[arr.length - 1];
      if (last && last.time === bucket) {
        last.close = quote.price;
        last.high = Math.max(last.high, quote.price);
        last.low = Math.min(last.low, quote.price);
      } else if (!last || bucket > last.time) {
        arr.push({ time: bucket, open: quote.price, high: quote.price, low: quote.price, close: quote.price });
      } else return;
      const c = arr[arr.length - 1];
      if (style === "candle") (s as ISeriesApi<"Candlestick">).update({ ...c, time: c.time as UTCTimestamp });
      else (s as ISeriesApi<"Line">).update({ time: c.time as UTCTimestamp, value: c.close });
    }
    if (inds.length) drawIndicators();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote?.tick, quote?.symbol, loading]);

  // contract overlays
  useEffect(() => {
    const s = mainRef.current;
    if (!s) return;
    for (const l of linesRef.current) {
      try {
        s.removePriceLine(l);
      } catch {}
    }
    linesRef.current = [];
    for (const c of contracts.filter((x) => x.symbol === def.id)) {
      linesRef.current.push(s.createPriceLine({ price: c.entrySpot, color: "#2f8cff", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `#${c.id} entry` }));
      if (c.barrier) linesRef.current.push(s.createPriceLine({ price: c.barrier, color: "#f5a524", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `#${c.id} barrier` }));
      if (c.current?.barrierHigh) {
        linesRef.current.push(s.createPriceLine({ price: c.current.barrierHigh, color: "#00c390", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: `#${c.id} upper` }));
        linesRef.current.push(s.createPriceLine({ price: c.current.barrierLow ?? 0, color: "#ff444f", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: `#${c.id} lower` }));
      }
      if (c.category === "multiplier" && c.multiplier) {
        const dir = c.contractType === "MULTUP" ? 1 : -1;
        const so = c.entrySpot * (1 - (dir * (c.stake - (c.commission ?? 0))) / (c.stake * c.multiplier));
        linesRef.current.push(s.createPriceLine({ price: so, color: "#ff444f", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `#${c.id} stop-out` }));
      }
    }
  }, [contracts, version, def.id]);

  const up = quote ? quote.price >= quote.prev : true;

  return (
    <div className="flex h-full min-h-[340px] flex-col">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-3 py-2">
        <div>
          <div className="text-sm font-semibold">{def.name}</div>
          <div className="text-[11px] text-muted">{def.sub} · {def.interval}s ticks</div>
        </div>
        {quote && (
          <div className="flex items-baseline gap-2">
            <span className={`num text-xl font-bold ${up ? "text-up" : "text-down"}`}>{fmtPrice(quote.price, def.digits)}</span>
            <span className={`num text-xs ${quote.change >= 0 ? "text-up" : "text-down"}`}>{quote.change >= 0 ? "+" : ""}{quote.change.toFixed(2)}%</span>
          </div>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {FRAMES.map((f) => (
            <button key={f.g} onClick={() => setG(f.g)} className={`rounded px-2 py-1 text-xs font-medium ${g === f.g ? "bg-accent/20 text-accent" : "text-muted hover:text-white"}`}>
              {f.label}
            </button>
          ))}
          {g > 0 && (
            <button onClick={() => setStyle(style === "candle" ? "line" : "candle")} className="rounded border border-line px-2 py-1 text-xs text-slate-300 hover:bg-panel2">
              {style === "candle" ? "Candles" : "Line"}
            </button>
          )}
          <div className="relative">
            <button onClick={() => setShowInd(!showInd)} className="rounded border border-line px-2 py-1 text-xs text-slate-300 hover:bg-panel2">
              Indicators{inds.length ? ` (${inds.length})` : ""}
            </button>
            {showInd && (
              <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-line bg-panel p-2 shadow-xl">
                {([["sma", "SMA (20)"], ["ema", "EMA (20)"], ["bb", "Bollinger Bands"]] as [Ind, string][]).map(([k, label]) => (
                  <label key={k} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-panel2">
                    <input type="checkbox" checked={inds.includes(k)} onChange={() => setInds((l) => (l.includes(k) ? l.filter((x) => x !== k) : [...l, k]))} />
                    {label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        <div ref={el} className="absolute inset-0" />
        {loading && <div className="absolute inset-0 flex items-center justify-center bg-bg/60 text-xs text-muted">Loading chart…</div>}
        <div className="pointer-events-none absolute bottom-1 left-2 text-[10px] text-muted/70">Times in UTC</div>
      </div>
    </div>
  );
}
