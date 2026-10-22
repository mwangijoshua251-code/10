"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, fmtPrice, usd } from "@/lib/client";
import type { ContractView } from "@/lib/types";
import { useApp } from "./AppProvider";

export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function remaining(c: ContractView, now: number): string {
  if (c.category === "accumulator") return `${c.current?.ticksSurvived ?? 0} ticks`;
  if (c.category === "multiplier") return "Open";
  if (c.durationLabel?.includes("tick")) return `${c.ticksLeft ?? 0} ticks left`;
  if (!c.expiryTime) return "—";
  const s = Math.max(0, Math.round(c.expiryTime - now / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}:${String(sec).padStart(2, "0")}`;
}

export function describe(c: ContractView): string {
  if (c.barrier !== null && (c.category === "highlow" || c.category === "touch")) return `Barrier ${fmtPrice(c.barrier, c.digits)}`;
  if (c.digit !== null && (c.category === "matchdiff" || c.category === "overunder")) return `Digit ${c.digit}`;
  if (c.category === "accumulator") return `Growth ${((c.growthRate ?? 0) * 100).toFixed(0)}%${c.takeProfit ? ` · TP ${usd(c.takeProfit)}` : ""}`;
  if (c.category === "multiplier") return `x${c.multiplier}${c.takeProfit ? ` · TP ${usd(c.takeProfit)}` : ""}${c.stopLoss ? ` · SL ${usd(c.stopLoss)}` : ""}`;
  return c.durationLabel ?? "";
}

export function Positions({ compact = false }: { compact?: boolean }) {
  const { open, toast, refresh, active } = useApp();
  const now = useNow();
  const [busy, setBusy] = useState<number | null>(null);

  const sell = async (id: number) => {
    setBusy(id);
    try {
      const d = await api<{ contract: ContractView }>("/api/trade/sell", { body: { id } });
      toast({ kind: (d.contract.profit ?? 0) >= 0 ? "success" : "info", title: `Cashed out #${id}`, msg: `Received ${usd(d.contract.sellPrice ?? 0)} · P/L ${usd(d.contract.profit ?? 0, true)}` });
      await refresh();
    } catch (e) {
      toast({ kind: "error", title: "Could not cash out", msg: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const total = open.reduce((a, c) => a + (c.current?.profit ?? 0), 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <div className="text-sm font-semibold">
          Open positions <span className="chip ml-1 bg-panel2 text-slate-300">{open.length}</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {open.length > 0 && <span className={`num font-semibold ${total >= 0 ? "text-up" : "text-down"}`}>Total P/L {usd(total, true)}</span>}
          <Link href="/reports" className="text-accent hover:underline">All reports →</Link>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {open.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6 text-center text-xs text-muted">
            No open positions on your {active?.type} account. Place a trade and it will appear here in real time.
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>ID</th><th>Market</th><th>Type</th>{!compact && <th>Details</th>}<th>Stake</th><th>Entry</th><th>Current</th><th>Time / Ticks</th><th>P/L</th><th></th>
              </tr>
            </thead>
            <tbody>
              {open.map((c) => {
                const pl = c.current?.profit ?? 0;
                return (
                  <tr key={c.id}>
                    <td className="num text-muted">#{c.id}</td>
                    <td className="font-medium">{c.symbolName}</td>
                    <td><span className="chip bg-panel2 text-slate-200">{c.typeLabel}</span></td>
                    {!compact && <td className="text-muted">{describe(c)}</td>}
                    <td className="num">{usd(c.stake)}</td>
                    <td className="num">{fmtPrice(c.entrySpot, c.digits)}</td>
                    <td className="num">{c.current ? fmtPrice(c.current.spot, c.digits) : "—"}</td>
                    <td className="num">{remaining(c, now)}</td>
                    <td className={`num font-semibold ${pl >= 0 ? "text-up" : "text-down"}`}>{usd(pl, true)}</td>
                    <td>
                      {c.current?.sellable ? (
                        <button className="btn btn-ghost !px-2.5 !py-1 text-xs" disabled={busy === c.id} onClick={() => sell(c.id)}>
                          {busy === c.id ? "…" : `Cash out ${usd(c.current.value)}`}
                        </button>
                      ) : (
                        <span className="text-[11px] text-muted">{c.category === "accumulator" || c.category === "multiplier" ? "" : "Not sellable"}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
