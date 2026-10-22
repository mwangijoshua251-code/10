"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { SYMBOLS } from "@/lib/catalog";
import { api, fmtTime, usd } from "@/lib/client";
import type { ContractView } from "@/lib/types";

const STRATEGIES: { id: string; label: string; types: string[]; digit?: boolean }[] = [
  { id: "rise", label: "Always Rise", types: ["CALL"] },
  { id: "fall", label: "Always Fall", types: ["PUT"] },
  { id: "alt", label: "Alternate Rise / Fall", types: ["CALL", "PUT"] },
  { id: "even", label: "Always Even", types: ["DIGITEVEN"] },
  { id: "odd", label: "Always Odd", types: ["DIGITODD"] },
  { id: "evenodd", label: "Alternate Even / Odd", types: ["DIGITEVEN", "DIGITODD"] },
  { id: "differs", label: "Digit Differs", types: ["DIGITDIFF"], digit: true },
  { id: "matches", label: "Digit Matches", types: ["DIGITMATCH"], digit: true },
  { id: "over", label: "Digit Over", types: ["DIGITOVER"], digit: true },
  { id: "under", label: "Digit Under", types: ["DIGITUNDER"], digit: true },
];

interface LogRow { t: number; id: number; type: string; stake: number; profit: number; won: boolean }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function BotsPage() {
  const { active, toast, refresh } = useApp();
  const derived = SYMBOLS.filter((s) => s.kind === "vol");
  const [symbol, setSymbol] = useState("R_100");
  const [strategy, setStrategy] = useState("alt");
  const [digit, setDigit] = useState(4);
  const [ticks, setTicks] = useState(1);
  const [stake, setStake] = useState("1");
  const [martingale, setMartingale] = useState("2");
  const [tp, setTp] = useState("20");
  const [sl, setSl] = useState("20");
  const [maxTrades, setMaxTrades] = useState("50");
  const [ack, setAck] = useState(false);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogRow[]>([]);
  const [status, setStatus] = useState("Idle");
  const stopRef = useRef(false);

  const stats = log.reduce((a, r) => ({ n: a.n + 1, w: a.w + (r.won ? 1 : 0), pl: a.pl + r.profit }), { n: 0, w: 0, pl: 0 });

  useEffect(() => () => { stopRef.current = true; }, []);

  const strat = STRATEGIES.find((s) => s.id === strategy)!;

  const run = async () => {
    stopRef.current = false;
    setRunning(true);
    setLog([]);
    let cur = Number(stake);
    const base = Number(stake);
    const mult = Math.max(1, Number(martingale) || 1);
    let pl = 0;
    let n = 0;
    try {
      while (!stopRef.current && n < Number(maxTrades)) {
        const type = strat.types[n % strat.types.length];
        setStatus(`Placing ${type} trade, stake ${usd(cur)}…`);
        const d = await api<{ contract: ContractView }>("/api/trade/buy", {
          body: { symbol, contractType: type, stake: cur, durationUnit: "t", duration: ticks, digit: strat.digit ? digit : type === "DIGITOVER" ? 3 : undefined },
        });
        let c = d.contract;
        setStatus(`Contract #${c.id} running…`);
        while (c.status === "open" && !stopRef.current) {
          await sleep(1000);
          c = (await api<{ contract: ContractView }>(`/api/trade/contract?id=${c.id}`)).contract;
        }
        if (c.status === "open") {
          setStatus("Stopped (open contract will settle on its own)");
          break;
        }
        const profit = c.profit ?? 0;
        pl += profit;
        n++;
        setLog((l) => [{ t: Date.now(), id: c.id, type: c.typeLabel, stake: c.stake, profit, won: profit > 0 }, ...l].slice(0, 200));
        refresh();
        cur = profit > 0 ? base : Math.round(cur * mult * 100) / 100;
        if (Number(tp) && pl >= Number(tp)) { setStatus(`Take-profit reached (${usd(pl, true)})`); break; }
        if (Number(sl) && pl <= -Number(sl)) { setStatus(`Stop-loss reached (${usd(pl, true)})`); break; }
        await sleep(400);
      }
      if (!stopRef.current && n >= Number(maxTrades)) setStatus("Max trades reached");
      else if (stopRef.current) setStatus("Stopped by you");
    } catch (e) {
      setStatus("Stopped: " + (e as Error).message);
      toast({ kind: "error", title: "Bot stopped", msg: (e as Error).message });
    } finally {
      setRunning(false);
    }
  };

  const canRun = !running && Number(stake) >= 0.35 && (active?.type === "demo" || ack);

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <h1 className="text-2xl font-bold">Trading Bots</h1>
      <p className="mb-6 text-sm text-muted">Automate tick-based strategies with a martingale recovery, take-profit and stop-loss. Bots run while this page stays open.</p>
      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        <div className="card space-y-4 p-5">
          <div>
            <label className="label">Market</label>
            <select className="input" value={symbol} onChange={(e) => setSymbol(e.target.value)} disabled={running}>{derived.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          </div>
          <div>
            <label className="label">Strategy</label>
            <select className="input" value={strategy} onChange={(e) => setStrategy(e.target.value)} disabled={running}>{STRATEGIES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {strat.digit && (
              <div>
                <label className="label">Digit</label>
                <input className="input num" type="number" min={0} max={9} value={digit} onChange={(e) => setDigit(Number(e.target.value))} disabled={running} />
              </div>
            )}
            <div>
              <label className="label">Ticks</label>
              <input className="input num" type="number" min={1} max={10} value={ticks} onChange={(e) => setTicks(Number(e.target.value))} disabled={running} />
            </div>
            <div>
              <label className="label">Initial stake ($)</label>
              <input className="input num" type="number" step="0.01" value={stake} onChange={(e) => setStake(e.target.value)} disabled={running} />
            </div>
            <div>
              <label className="label">Martingale ×</label>
              <input className="input num" type="number" step="0.1" min={1} value={martingale} onChange={(e) => setMartingale(e.target.value)} disabled={running} />
            </div>
            <div>
              <label className="label">Take profit ($)</label>
              <input className="input num" type="number" value={tp} onChange={(e) => setTp(e.target.value)} disabled={running} />
            </div>
            <div>
              <label className="label">Stop loss ($)</label>
              <input className="input num" type="number" value={sl} onChange={(e) => setSl(e.target.value)} disabled={running} />
            </div>
            <div className="col-span-2">
              <label className="label">Max trades</label>
              <input className="input num" type="number" value={maxTrades} onChange={(e) => setMaxTrades(e.target.value)} disabled={running} />
            </div>
          </div>
          {active?.type === "real" && (
            <label className="flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/10 p-3 text-xs text-warn">
              <input type="checkbox" className="mt-0.5" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              I understand this bot will trade REAL money automatically and martingale strategies can lose quickly.
            </label>
          )}
          {running ? (
            <button className="btn btn-down w-full !py-3" onClick={() => { stopRef.current = true; }}>Stop bot</button>
          ) : (
            <button className="btn btn-primary w-full !py-3" disabled={!canRun} onClick={run}>Run bot on {active?.type} account</button>
          )}
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[["Status", status], ["Trades", `${stats.n} (${stats.w} won)`], ["Win rate", stats.n ? `${((stats.w / stats.n) * 100).toFixed(0)}%` : "—"], ["Session P/L", usd(stats.pl, true)]].map(([k, v], i) => (
              <div key={k} className="card p-4">
                <div className="text-[11px] uppercase tracking-wide text-muted">{k}</div>
                <div className={`mt-1 truncate text-sm font-bold ${i === 3 ? (stats.pl >= 0 ? "text-up" : "text-down") : ""}`} title={v}>{running && i === 0 && <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-up" />}{v}</div>
              </div>
            ))}
          </div>
          <div className="card max-h-[460px] overflow-auto">
            <table className="tbl">
              <thead><tr><th>Time</th><th>Contract</th><th>Type</th><th>Stake</th><th>Result</th><th>Profit/Loss</th></tr></thead>
              <tbody>
                {log.length === 0 && <tr><td colSpan={6} className="py-12 text-center text-muted">Bot journal is empty. Configure a strategy and press run.</td></tr>}
                {log.map((r) => (
                  <tr key={r.id}>
                    <td>{fmtTime(r.t)}</td><td className="num text-muted">#{r.id}</td><td>{r.type}</td><td className="num">{usd(r.stake)}</td>
                    <td><span className={`chip ${r.won ? "bg-up/15 text-up" : "bg-down/15 text-down"}`}>{r.won ? "WON" : "LOST"}</span></td>
                    <td className={`num font-semibold ${r.profit >= 0 ? "text-up" : "text-down"}`}>{usd(r.profit, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
