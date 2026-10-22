"use client";

import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { Positions, describe } from "@/components/Positions";
import { api, downloadCsv, fmtDate, fmtPrice, usd } from "@/lib/client";
import type { ContractView } from "@/lib/types";

interface StatementRow { id: number; type: string; amount: number; balanceAfter: number; description: string | null; ref: string | null; createdAt: number }
const PAGE = 20;

function Pager({ total, offset, set }: { total: number; offset: number; set: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between border-t border-line px-4 py-3 text-xs text-muted">
      <span>{total === 0 ? 0 : offset + 1}–{Math.min(offset + PAGE, total)} of {total}</span>
      <div className="flex gap-2">
        <button className="btn btn-ghost !px-3 !py-1" disabled={offset === 0} onClick={() => set(Math.max(0, offset - PAGE))}>Previous</button>
        <button className="btn btn-ghost !px-3 !py-1" disabled={offset + PAGE >= total} onClick={() => set(offset + PAGE)}>Next</button>
      </div>
    </div>
  );
}

function ProfitTable() {
  const { active, open } = useApp();
  const [data, setData] = useState<{ rows: ContractView[]; total: number; totalStake: number; totalProfit: number; wins: number } | null>(null);
  const [offset, setOffset] = useState(0);
  const load = useCallback(async () => {
    setData(await api(`/api/trade/history?limit=${PAGE}&offset=${offset}`));
  }, [offset]);
  useEffect(() => {
    load();
  }, [load, active?.id, open.length]);

  if (!data) return <div className="p-10 text-center text-sm text-muted">Loading…</div>;
  const winRate = data.total ? (data.wins / data.total) * 100 : 0;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[["Total trades", String(data.total)], ["Win rate", `${winRate.toFixed(1)}%`], ["Total staked", usd(data.totalStake)], ["Net profit / loss", usd(data.totalProfit, true)]].map(([k, v], i) => (
          <div key={k} className="card p-4">
            <div className="text-[11px] uppercase tracking-wide text-muted">{k}</div>
            <div className={`num mt-1 text-xl font-bold ${i === 3 ? (data.totalProfit >= 0 ? "text-up" : "text-down") : ""}`}>{v}</div>
          </div>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <div className="flex items-center justify-between px-4 py-3">
          <h3 className="text-sm font-semibold">Profit table ({active?.type})</h3>
          <button className="btn btn-ghost !py-1 text-xs" onClick={() => downloadCsv("profit-table.csv", [["Ref", "Opened", "Closed", "Market", "Type", "Details", "Entry", "Exit", "Stake", "Return", "Profit"], ...data.rows.map((c) => [c.id, fmtDate(c.openedAt), c.closedAt ? fmtDate(c.closedAt) : "", c.symbolName, c.typeLabel, describe(c), c.entrySpot, c.exitSpot, c.stake, c.sellPrice, c.profit])])}>Export CSV</button>
        </div>
        <table className="tbl">
          <thead><tr><th>Ref</th><th>Closed</th><th>Market</th><th>Type</th><th>Details</th><th>Entry</th><th>Exit</th><th>Stake</th><th>Return</th><th>Profit/Loss</th></tr></thead>
          <tbody>
            {data.rows.length === 0 && <tr><td colSpan={10} className="py-10 text-center text-muted">No closed trades yet.</td></tr>}
            {data.rows.map((c) => (
              <tr key={c.id}>
                <td className="num text-muted">#{c.id}</td>
                <td>{c.closedAt ? fmtDate(c.closedAt) : "—"}</td>
                <td className="font-medium">{c.symbolName}</td>
                <td><span className="chip bg-panel2">{c.typeLabel}</span></td>
                <td className="text-muted">{describe(c)}</td>
                <td className="num">{fmtPrice(c.entrySpot, c.digits)}</td>
                <td className="num">{c.exitSpot ? fmtPrice(c.exitSpot, c.digits) : "—"}</td>
                <td className="num">{usd(c.stake)}</td>
                <td className="num">{usd(c.sellPrice ?? 0)}{c.status === "sold" && <span className="ml-1 text-[10px] text-muted">(sold)</span>}</td>
                <td className={`num font-semibold ${(c.profit ?? 0) >= 0 ? "text-up" : "text-down"}`}>{usd(c.profit ?? 0, true)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pager total={data.total} offset={offset} set={setOffset} />
      </div>
    </div>
  );
}

const TYPES = ["", "deposit", "withdrawal", "withdrawal_refund", "buy", "payout", "sell", "reset"];

function Statement() {
  const { active } = useApp();
  const [rows, setRows] = useState<StatementRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [type, setType] = useState("");
  useEffect(() => {
    api<{ rows: StatementRow[]; total: number }>(`/api/statement?limit=${PAGE}&offset=${offset}${type ? `&type=${type}` : ""}`).then((d) => {
      setRows(d.rows);
      setTotal(d.total);
    });
  }, [offset, type, active?.id]);
  return (
    <div className="card overflow-x-auto">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <h3 className="text-sm font-semibold">Statement ({active?.type})</h3>
        <div className="flex gap-2">
          <select className="input !w-44 !py-1 text-xs" value={type} onChange={(e) => { setType(e.target.value); setOffset(0); }}>
            {TYPES.map((t) => <option key={t} value={t}>{t ? t.replace("_", " ") : "All transactions"}</option>)}
          </select>
          <button className="btn btn-ghost !py-1 text-xs" onClick={() => downloadCsv("statement.csv", [["ID", "Date", "Type", "Description", "Reference", "Amount (USD)", "Balance (USD)"], ...rows.map((r) => [r.id, fmtDate(r.createdAt), r.type, r.description, r.ref, r.amount, r.balanceAfter])])}>Export CSV</button>
        </div>
      </div>
      <table className="tbl">
        <thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Reference</th><th>Amount</th><th>Balance</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-muted">No transactions.</td></tr>}
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{fmtDate(r.createdAt)}</td>
              <td><span className="chip bg-panel2 capitalize">{r.type.replace("_", " ")}</span></td>
              <td className="max-w-[320px] truncate">{r.description}</td>
              <td className="num text-muted">{r.ref ?? "—"}</td>
              <td className={`num font-semibold ${r.amount >= 0 ? "text-up" : "text-down"}`}>{usd(r.amount, true)}</td>
              <td className="num">{usd(r.balanceAfter)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pager total={total} offset={offset} set={setOffset} />
    </div>
  );
}

export default function ReportsPage() {
  const [tab, setTab] = useState<"open" | "profit" | "statement">("open");
  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <h1 className="mb-1 text-2xl font-bold">Reports</h1>
      <p className="mb-6 text-sm text-muted">Review open positions, closed trades and every movement on your active account.</p>
      <div className="mb-5 flex gap-1 border-b border-line">
        {([["open", "Open positions"], ["profit", "Profit table"], ["statement", "Statement"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`border-b-2 px-4 py-2 text-sm font-medium ${tab === k ? "border-brand text-white" : "border-transparent text-muted hover:text-white"}`}>{l}</button>
        ))}
      </div>
      {tab === "open" && <div className="card min-h-[260px] overflow-hidden"><Positions /></div>}
      {tab === "profit" && <ProfitTable />}
      {tab === "statement" && <Statement />}
    </div>
  );
}
