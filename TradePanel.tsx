"use client";

import { useEffect, useMemo, useState } from "react";
import { CATEGORIES, CATEGORY_MAP, GROWTH_RATES, categoriesFor, multipliersFor, ticksAllowed, type Category, type SymbolDef } from "@/lib/catalog";
import { api, fmtPrice, usd } from "@/lib/client";
import type { ContractView, QuoteView } from "@/lib/types";
import { useApp } from "./AppProvider";

interface Side {
  type: string;
  label: string;
  color: "green" | "red";
  payout: number | null;
  profit: number | null;
  pct: number | null;
  barrier: number | null;
  error: string | null;
}
interface Proposal {
  spot: number;
  suggestions: { highlow: number; touch: number };
  sides: Side[];
  extra: { barrierRange?: number; survival?: number; commission?: number; stopOutUp?: number; stopOutDown?: number; notional?: number };
}

const UNITS: Record<string, string> = { t: "Ticks", s: "Seconds", m: "Minutes", h: "Hours", d: "Days" };
const RANGE: Record<string, [number, number]> = { t: [1, 10], s: [15, 3600], m: [1, 1440], h: [1, 24], d: [1, 30] };

export function TradePanel({ def, quote }: { def: SymbolDef; quote?: QuoteView }) {
  const { active, toast, refresh } = useApp();
  const cats = useMemo(() => categoriesFor(def), [def]);
  const [category, setCategory] = useState<Category>("updown");
  const [unit, setUnit] = useState("t");
  const [duration, setDuration] = useState(5);
  const [stake, setStake] = useState("10");
  const [offset, setOffset] = useState("");
  const [digit, setDigit] = useState(5);
  const [growth, setGrowth] = useState(0.01);
  const [mult, setMult] = useState(multipliersFor(def)[1]);
  const [useTp, setUseTp] = useState(false);
  const [tp, setTp] = useState("10");
  const [useSl, setUseSl] = useState(false);
  const [sl, setSl] = useState("5");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [err, setErr] = useState("");
  const [buying, setBuying] = useState<string | null>(null);

  const isDigit = category === "matchdiff" || category === "evenodd" || category === "overunder";
  const isBinary = !["accumulator", "multiplier"].includes(category);

  // keep selections valid when market changes
  useEffect(() => {
    if (!cats.includes(category)) setCategory("updown");
    const ms = multipliersFor(def);
    if (!ms.includes(mult)) setMult(ms[1] ?? ms[0]);
    if (!ticksAllowed(def) && unit === "t") {
      setUnit("m");
      setDuration(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def.id]);

  useEffect(() => {
    if (isDigit && unit !== "t") {
      setUnit("t");
      setDuration(5);
    }
  }, [isDigit, unit]);

  useEffect(() => setOffset(""), [def.id, category, unit, duration]);

  const req = useMemo(
    () => ({
      symbol: def.id,
      category,
      stake: Number(stake),
      durationUnit: unit,
      duration,
      barrierOffset: offset === "" ? undefined : Number(offset),
      digit,
      growthRate: growth,
      multiplier: mult,
      takeProfit: useTp ? Number(tp) : null,
      stopLoss: useSl ? Number(sl) : null,
    }),
    [def.id, category, stake, unit, duration, offset, digit, growth, mult, useTp, tp, useSl, sl],
  );

  useEffect(() => {
    let stop = false;
    const run = async () => {
      try {
        const p = await api<Proposal>("/api/trade/proposal", { body: req });
        if (stop) return;
        setProposal(p);
        setErr("");
        if (offset === "" && (category === "highlow" || category === "touch")) {
          const s = category === "highlow" ? p.suggestions.highlow : p.suggestions.touch;
          setOffset(String(Number(s.toFixed(def.digits))));
        }
      } catch (e) {
        if (!stop) setErr((e as Error).message);
      }
    };
    const t = setTimeout(run, 300);
    const iv = setInterval(run, 4000);
    return () => {
      stop = true;
      clearTimeout(t);
      clearInterval(iv);
    };
  }, [req, offset, category, def.digits]);

  const buy = async (side: Side) => {
    setBuying(side.type);
    try {
      const d = await api<{ contract: ContractView }>("/api/trade/buy", { body: { ...req, contractType: side.type } });
      toast({ kind: "info", title: `${d.contract.typeLabel} bought · #${d.contract.id}`, msg: `${def.name} · stake ${usd(d.contract.stake)}${d.contract.payout ? ` · payout ${usd(d.contract.payout)}` : ""}` });
      await refresh();
    } catch (e) {
      toast({ kind: "error", title: "Could not place trade", msg: (e as Error).message });
    } finally {
      setBuying(null);
    }
  };

  const info = CATEGORY_MAP[category];
  const barrierAbs = offset !== "" && quote ? quote.price + Number(offset) : null;
  const stakeNum = Number(stake) || 0;
  const bumpStake = (d: number) => setStake(String(Math.max(0.35, Math.round((stakeNum + d) * 100) / 100)));

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="grid grid-cols-2 gap-1 border-b border-line p-2">
        {CATEGORIES.filter((c) => cats.includes(c.id)).map((c) => (
          <button key={c.id} onClick={() => setCategory(c.id)} className={`rounded-md px-2 py-1.5 text-xs font-medium transition ${category === c.id ? "bg-brand text-white" : "bg-panel2 text-slate-300 hover:bg-line"}`}>
            {c.name}
          </button>
        ))}
      </div>
      <div className="space-y-3 p-3">
        <p className="text-[11px] leading-snug text-muted">{info.desc}</p>

        {isBinary && (
          <div>
            <label className="label">Duration</label>
            <div className="flex gap-2">
              <select className="input !w-28" value={unit} onChange={(e) => { setUnit(e.target.value); setDuration(RANGE[e.target.value][0] === 1 ? (e.target.value === "t" ? 5 : 1) : RANGE[e.target.value][0]); }} disabled={isDigit}>
                {Object.entries(UNITS).filter(([k]) => k !== "t" || ticksAllowed(def)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input className="input num" type="number" min={RANGE[unit][0]} max={RANGE[unit][1]} value={duration} onChange={(e) => setDuration(Math.round(Number(e.target.value)))} />
            </div>
          </div>
        )}

        {(category === "highlow" || category === "touch") && (
          <div>
            <label className="label">Barrier offset {barrierAbs ? <span className="normal-case text-slate-400">→ {fmtPrice(barrierAbs, def.digits)}</span> : null}</label>
            <div className="flex gap-1">
              <input className="input num" type="number" step={Math.pow(10, -def.digits)} value={offset} onChange={(e) => setOffset(e.target.value)} placeholder="e.g. +0.50" />
              <button className="btn btn-ghost !px-2" onClick={() => setOffset(String(-Number(offset || 0)))} title="Flip sign">±</button>
            </div>
          </div>
        )}

        {(category === "matchdiff" || category === "overunder") && (
          <div>
            <label className="label">{category === "matchdiff" ? "Last digit prediction" : "Digit"}</label>
            <div className="grid grid-cols-10 gap-1">
              {Array.from({ length: 10 }, (_, i) => (
                <button key={i} onClick={() => setDigit(i)} className={`num rounded py-1.5 text-sm font-semibold ${digit === i ? "bg-accent text-white" : "bg-panel2 text-slate-300 hover:bg-line"}`}>{i}</button>
              ))}
            </div>
          </div>
        )}

        {category === "accumulator" && (
          <div>
            <label className="label">Growth rate (per tick)</label>
            <div className="grid grid-cols-5 gap-1">
              {GROWTH_RATES.map((g) => (
                <button key={g} onClick={() => setGrowth(g)} className={`rounded py-1.5 text-sm font-semibold ${growth === g ? "bg-accent text-white" : "bg-panel2 text-slate-300 hover:bg-line"}`}>{Math.round(g * 100)}%</button>
              ))}
            </div>
          </div>
        )}

        {category === "multiplier" && (
          <div>
            <label className="label">Multiplier</label>
            <div className="grid grid-cols-5 gap-1">
              {multipliersFor(def).map((m) => (
                <button key={m} onClick={() => setMult(m)} className={`num rounded py-1.5 text-sm font-semibold ${mult === m ? "bg-accent text-white" : "bg-panel2 text-slate-300 hover:bg-line"}`}>x{m}</button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="label">Stake (USD)</label>
          <div className="flex gap-1">
            <button className="btn btn-ghost !px-3" onClick={() => bumpStake(-1)}>−</button>
            <input className="input num text-center" type="number" min={0.35} step="0.01" value={stake} onChange={(e) => setStake(e.target.value)} />
            <button className="btn btn-ghost !px-3" onClick={() => bumpStake(1)}>+</button>
          </div>
          <div className="mt-1.5 flex gap-1">
            {[1, 5, 10, 50, 100, 500].map((v) => (
              <button key={v} onClick={() => setStake(String(v))} className="flex-1 rounded bg-panel2 py-1 text-[11px] text-slate-300 hover:bg-line">${v}</button>
            ))}
          </div>
        </div>

        {(category === "accumulator" || category === "multiplier") && (
          <div className="space-y-2 rounded-lg border border-line p-2.5">
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={useTp} onChange={(e) => setUseTp(e.target.checked)} /> Take profit</label>
            {useTp && <input className="input num !py-1.5" type="number" min={0.01} step="0.01" value={tp} onChange={(e) => setTp(e.target.value)} />}
            {category === "multiplier" && (
              <>
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={useSl} onChange={(e) => setUseSl(e.target.checked)} /> Stop loss</label>
                {useSl && <input className="input num !py-1.5" type="number" min={0.01} step="0.01" max={stakeNum} value={sl} onChange={(e) => setSl(e.target.value)} />}
              </>
            )}
          </div>
        )}

        {proposal && category === "accumulator" && (
          <div className="space-y-1 rounded-lg bg-panel2 p-2.5 text-xs">
            <Row k="Barrier range (±)" v={fmtPrice(proposal.extra.barrierRange ?? 0, def.digits + 1)} />
            <Row k="Tick survival odds" v={`${((proposal.extra.survival ?? 0) * 100).toFixed(1)}%`} />
            <Row k="Payout after 10 ticks" v={usd(stakeNum * Math.pow(1 + growth, 10))} />
            <Row k="Payout after 50 ticks" v={usd(stakeNum * Math.pow(1 + growth, 50))} />
          </div>
        )}
        {proposal && category === "multiplier" && (
          <div className="space-y-1 rounded-lg bg-panel2 p-2.5 text-xs">
            <Row k="Position size" v={usd(proposal.extra.notional ?? 0)} />
            <Row k="Commission" v={usd(proposal.extra.commission ?? 0)} />
            <Row k="Stop-out (Up / Down)" v={`${fmtPrice(proposal.extra.stopOutUp ?? 0, def.digits)} / ${fmtPrice(proposal.extra.stopOutDown ?? 0, def.digits)}`} />
            <Row k="Max loss" v={usd(stakeNum)} />
          </div>
        )}

        <div className="space-y-2 pt-1">
          {(proposal?.sides ?? info.sides.map((s) => ({ ...s, payout: null, profit: null, pct: null, barrier: null, error: null }))).map((s) => {
            const perSideErr = s.error;
            return (
              <div key={s.type}>
                <button
                  onClick={() => buy(s)}
                  disabled={!!buying || !!err || !!perSideErr || !active}
                  className={`btn w-full flex-col !items-stretch !py-2.5 ${s.color === "green" ? "btn-up" : "btn-down"}`}
                >
                  <span className="flex items-center justify-between text-base">
                    <span>{s.label}</span>
                    <span>{buying === s.type ? "Buying…" : category === "accumulator" ? "Buy" : s.payout ? usd(s.payout) : "—"}</span>
                  </span>
                  {isBinary && s.pct !== null && <span className="text-left text-[11px] font-medium opacity-80">Payout · profit {usd(s.profit ?? 0)} ({s.pct.toFixed(1)}%)</span>}
                </button>
                {perSideErr && !err && <p className="mt-1 text-[11px] text-warn">{perSideErr}</p>}
              </div>
            );
          })}
          {err && <p className="rounded bg-down/10 px-2 py-1.5 text-[11px] text-down">{err}</p>}
          <p className="text-center text-[10px] text-muted">
            {active?.type === "demo" ? "Trading with virtual funds on your demo account." : "Trading with real funds. Trade responsibly."}
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{k}</span>
      <span className="num font-medium">{v}</span>
    </div>
  );
}
