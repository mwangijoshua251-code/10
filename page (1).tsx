"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { api, fmtDate, usd } from "@/lib/client";
import type { PaymentView } from "@/lib/types";

interface MethodCfg {
  id: string;
  label: string;
  asset: string;
  network: string;
  kind: "crypto" | "mobile";
  minDeposit: number;
  maxDeposit: number;
  minWithdraw: number;
  maxWithdraw: number;
  withdrawFee: number;
  confirmations: number;
  decimals: number;
}
interface Rates { USDT: number; BTC: number; ETH: number; KES_DEPOSIT: number; KES_WITHDRAW: number }

const ICON: Record<string, { sym: string; color: string }> = {
  usdt_trc20: { sym: "₮", color: "#26a17b" },
  usdt_erc20: { sym: "₮", color: "#627eea" },
  btc: { sym: "₿", color: "#f7931a" },
  eth: { sym: "Ξ", color: "#8a92b2" },
  mpesa: { sym: "M", color: "#4cb848" },
};

const statusStyle = (s: string) =>
  s === "completed" ? "bg-up/15 text-up" : ["pending", "confirming", "processing"].includes(s) ? "bg-warn/15 text-warn" : "bg-down/15 text-down";

function rateFor(m: MethodCfg, r: Rates) {
  return m.asset === "USDT" ? 1 : m.asset === "BTC" ? r.BTC : m.asset === "ETH" ? r.ETH : 1;
}

function MethodPicker({ methods, value, onChange }: { methods: MethodCfg[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {methods.map((m) => (
        <button key={m.id} onClick={() => onChange(m.id)} className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition ${value === m.id ? "border-brand bg-brand/10" : "border-line bg-panel hover:bg-panel2"}`}>
          <span className="flex h-9 w-9 items-center justify-center rounded-full text-lg font-bold text-white" style={{ background: ICON[m.id].color }}>{ICON[m.id].sym}</span>
          <span className="text-xs font-semibold">{m.label}</span>
          <span className="text-[10px] text-muted">{m.kind === "mobile" ? "Instant · KES" : m.network}</span>
        </button>
      ))}
    </div>
  );
}

function Copy({ text, label }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      className="rounded bg-panel2 px-2 py-1 text-[11px] text-slate-200 hover:bg-line"
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setOk(true);
        setTimeout(() => setOk(false), 1500);
      }}
    >
      {ok ? "Copied ✓" : label ?? "Copy"}
    </button>
  );
}

function DepositStatus({ initial, onDone, onNew }: { initial: PaymentView; onDone: () => void; onNew: () => void }) {
  const { refresh, toast } = useApp();
  const [p, setP] = useState(initial);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [pin, setPin] = useState("");

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const final = ["completed", "failed", "expired", "cancelled"].includes(p.status);
  useEffect(() => {
    if (final) return;
    const t = setInterval(async () => {
      try {
        const d = await api<{ payment: PaymentView }>(`/api/payments?id=${p.id}`);
        setP((old) => ({ ...d.payment, qr: d.payment.qr ?? old.qr }));
      } catch {}
    }, 1500);
    return () => clearInterval(t);
  }, [p.id, final]);

  useEffect(() => {
    if (p.status === "completed") {
      refresh();
      onDone();
      toast({ kind: "success", title: "Deposit received", msg: `${usd(p.amountUsd)} has been credited to your account.` });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.status]);

  const act = async (action: "pay" | "cancel") => {
    setBusy(true);
    try {
      const d = await api<{ payment: PaymentView }>(`/api/payments/${p.id}/action`, { body: { action } });
      setP((old) => ({ ...d.payment, qr: d.payment.qr ?? old.qr }));
    } catch (e) {
      toast({ kind: "error", title: "Action failed", msg: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const left = p.expiresAt ? Math.max(0, Math.round((p.expiresAt - now) / 1000)) : 0;
  const mpesa = p.method === "mpesa";

  return (
    <div className="card mx-auto max-w-xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-xs text-muted">Deposit #{p.id} · {p.methodLabel}</div>
          <div className="text-2xl font-bold num">{usd(p.amountUsd)}</div>
        </div>
        <span className={`chip ${statusStyle(p.status)}`}>{p.status.toUpperCase()}</span>
      </div>

      {!mpesa && p.status === "pending" && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
            {p.qr && /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.qr} alt="Deposit QR" className="mx-auto h-[220px] w-[220px] rounded-lg bg-white p-1" />}
            <div className="space-y-3 text-sm">
              <div>
                <div className="label">Send exactly</div>
                <div className="flex items-center gap-2"><span className="num text-lg font-bold">{p.assetAmount} {p.asset}</span><Copy text={String(p.assetAmount)} /></div>
                <div className="text-xs text-muted">≈ {usd(p.amountUsd)} @ {usd(p.rate)} per {p.asset}</div>
              </div>
              <div>
                <div className="label">{p.network} address</div>
                <div className="break-all rounded-lg bg-bg p-2 text-xs num">{p.address}</div>
                <div className="mt-1"><Copy text={p.address ?? ""} label="Copy address" /></div>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-warn/30 bg-warn/10 p-3 text-xs text-warn">
            Only send <b>{p.asset}</b> on the <b>{p.network}</b> network to this address. Funds sent on another network will be lost. Rate locked for {Math.floor(left / 60)}m {left % 60}s.
          </div>
          <div className="rounded-lg border border-dashed border-accent/50 bg-accent/5 p-3 text-xs text-slate-300">
            <b className="text-accent">Sandbox mode:</b> this environment is not connected to a live blockchain or custody provider, so no real coins can arrive. Use the button below to simulate your wallet transfer and watch the confirmations.
            <div className="mt-2 flex gap-2">
              <button className="btn btn-primary !py-1.5 text-xs" disabled={busy} onClick={() => act("pay")}>Simulate incoming transfer</button>
              <button className="btn btn-ghost !py-1.5 text-xs" disabled={busy} onClick={() => act("cancel")}>Cancel request</button>
            </div>
          </div>
        </div>
      )}

      {!mpesa && p.status === "confirming" && (
        <div className="space-y-3 text-sm">
          <p className="text-slate-300">Transfer detected on the {p.network} network. Waiting for confirmations…</p>
          <div className="h-2 overflow-hidden rounded-full bg-panel2"><div className="h-full bg-up transition-all" style={{ width: `${(p.confirmations / Math.max(1, p.requiredConfirmations)) * 100}%` }} /></div>
          <div className="flex justify-between text-xs text-muted"><span>{p.confirmations} / {p.requiredConfirmations} confirmations</span><span className="num">{p.assetAmount} {p.asset}</span></div>
          {p.txHash && <div className="break-all text-[11px] text-muted">Tx: <span className="num">{p.txHash}</span></div>}
        </div>
      )}

      {mpesa && p.status === "pending" && (
        <div className="grid gap-5 sm:grid-cols-[210px_1fr]">
          <div className="mx-auto w-[210px] rounded-[28px] border-4 border-slate-700 bg-slate-950 p-3">
            <div className="mb-3 text-center text-[10px] text-slate-500">STK Push · {p.phone}</div>
            <div className="rounded-xl bg-white p-3 text-slate-900">
              <div className="text-xs font-bold text-[#4cb848]">M-PESA</div>
              <p className="mt-1 text-[11px] leading-snug">Pay <b>KES {p.assetAmount?.toLocaleString()}</b> to <b>ARENA MARKETS</b>. Enter your M-PESA PIN.</p>
              <input className="mt-2 w-full rounded border border-slate-300 px-2 py-1 text-center text-sm tracking-[0.4em]" type="password" maxLength={4} inputMode="numeric" placeholder="••••" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
              <div className="mt-2 grid grid-cols-2 gap-1">
                <button className="rounded bg-slate-200 py-1 text-[11px] font-semibold" disabled={busy} onClick={() => act("cancel")}>Cancel</button>
                <button className="rounded bg-[#4cb848] py-1 text-[11px] font-semibold text-white disabled:opacity-50" disabled={busy || pin.length < 4} onClick={() => act("pay")}>Send</button>
              </div>
            </div>
          </div>
          <div className="space-y-3 text-sm">
            <p className="text-slate-300">We sent an M-Pesa prompt to <b>{p.phone}</b>. Enter your PIN on your phone to approve <b>KES {p.assetAmount?.toLocaleString()}</b> ({usd(p.amountUsd)} @ KES {p.rate}/USD).</p>
            <p className="text-xs text-muted">Request expires in {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}.</p>
            <div className="rounded-lg border border-dashed border-accent/50 bg-accent/5 p-3 text-xs text-slate-300"><b className="text-accent">Sandbox mode:</b> no Safaricom Daraja connection is configured, so the phone on the left simulates your handset. Enter any 4-digit PIN.</div>
          </div>
        </div>
      )}

      {mpesa && p.status === "processing" && (
        <div className="flex items-center gap-3 py-6 text-sm text-slate-300"><span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-up" /> Confirming your payment with Safaricom…</div>
      )}

      {p.status === "completed" && (
        <div className="space-y-2 py-2 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-up/15 text-3xl text-up">✓</div>
          <div className="text-lg font-bold">Deposit successful</div>
          <p className="text-sm text-muted">{usd(p.amountUsd)} was added to your real account.{p.receipt ? ` M-Pesa receipt: ${p.receipt}.` : ""}</p>
          <div className="flex justify-center gap-2 pt-2"><Link href="/trade" className="btn btn-primary">Start trading</Link><button className="btn btn-ghost" onClick={onNew}>New deposit</button></div>
        </div>
      )}
      {["failed", "expired", "cancelled"].includes(p.status) && (
        <div className="space-y-2 py-2 text-center">
          <div className="text-lg font-bold capitalize">Deposit {p.status}</div>
          <p className="text-sm text-muted">{p.note}</p>
          <button className="btn btn-primary" onClick={onNew}>Try again</button>
        </div>
      )}
    </div>
  );
}

export default function CashierPage() {
  const { active, accounts, switchAccount, user, toast, refresh } = useApp();
  const [tab, setTab] = useState<"deposit" | "withdraw" | "history">("deposit");
  const [methods, setMethods] = useState<MethodCfg[]>([]);
  const [rates, setRates] = useState<Rates | null>(null);
  const [method, setMethod] = useState("usdt_trc20");
  const [amount, setAmount] = useState("50");
  const [phone, setPhone] = useState("");
  const [dest, setDest] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState<PaymentView | null>(null);
  const [history, setHistory] = useState<PaymentView[]>([]);

  const loadConfig = useCallback(async () => {
    const d = await api<{ methods: MethodCfg[]; rates: Rates }>("/api/payments/config");
    setMethods(d.methods);
    setRates(d.rates);
  }, []);
  const loadHistory = useCallback(async () => {
    const d = await api<{ payments: PaymentView[] }>("/api/payments");
    setHistory(d.payments);
  }, []);

  useEffect(() => {
    loadConfig();
    loadHistory();
    const q = new URLSearchParams(window.location.search).get("tab");
    if (q === "withdraw" || q === "history") setTab(q);
    const t = setInterval(() => { loadConfig(); }, 15000);
    return () => clearInterval(t);
  }, [loadConfig, loadHistory]);

  useEffect(() => {
    if (tab === "history") {
      loadHistory();
      const t = setInterval(loadHistory, 3000);
      return () => clearInterval(t);
    }
  }, [tab, loadHistory]);

  useEffect(() => {
    if (user?.phone && !phone) setPhone(user.phone);
  }, [user, phone]);

  const m = methods.find((x) => x.id === method);
  const amt = Number(amount) || 0;
  const real = accounts.find((a) => a.type === "real");

  if (!m || !rates) return <div className="p-10 text-center text-sm text-muted">Loading cashier…</div>;

  const dRate = rateFor(m, rates);
  const preview = m.kind === "mobile" ? `KES ${Math.ceil(amt * rates.KES_DEPOSIT).toLocaleString()} (@ KES ${rates.KES_DEPOSIT}/USD)` : `${(amt / dRate).toFixed(m.decimals)} ${m.asset}`;
  const fee = m.kind === "mobile" ? Math.max(0.5, Math.round(amt * m.withdrawFee) / 100) : m.withdrawFee;
  const net = Math.max(0, amt - fee);
  const wPreview = m.kind === "mobile" ? `KES ${Math.floor(net * rates.KES_WITHDRAW).toLocaleString()} (@ KES ${rates.KES_WITHDRAW}/USD)` : `${(net / dRate).toFixed(m.decimals)} ${m.asset}`;

  const deposit = async () => {
    setBusy(true);
    try {
      const d = await api<{ payment: PaymentView }>("/api/payments/deposit", { body: { method, amountUsd: amt, phone } });
      setCurrent(d.payment);
    } catch (e) {
      toast({ kind: "error", title: "Deposit failed", msg: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    setBusy(true);
    try {
      await api("/api/payments/withdraw", { body: { method, amountUsd: amt, destination: m.kind === "mobile" ? phone : dest, password } });
      toast({ kind: "success", title: "Withdrawal requested", msg: `${usd(amt)} submitted. Track it under History.` });
      setPassword("");
      await refresh();
      await loadHistory();
      setTab("history");
    } catch (e) {
      toast({ kind: "error", title: "Withdrawal failed", msg: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id: number) => {
    try {
      await api(`/api/payments/${id}/cancel`, { method: "POST", body: {} });
      toast({ kind: "info", title: "Withdrawal cancelled", msg: "Funds were returned to your account." });
      await refresh();
      await loadHistory();
    } catch (e) {
      toast({ kind: "error", title: "Cannot cancel", msg: (e as Error).message });
    }
  };

  const isDemo = active?.type === "demo";
  const canWithdraw = user && (user.emailVerified || user.phoneVerified) && user.kycStatus === "verified";

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Cashier</h1>
          <p className="text-sm text-muted">Fund your account with crypto or M-Pesa. All balances are held and displayed in USD.</p>
        </div>
        <div className="card px-4 py-2 text-right">
          <div className="text-[10px] uppercase tracking-wide text-muted">{active?.type} balance</div>
          <div className="num text-xl font-bold">{active ? usd(active.balance) : "—"} <span className="text-xs font-normal text-muted">USD</span></div>
        </div>
      </div>

      <div className="mb-6 flex gap-1 border-b border-line">
        {(["deposit", "withdraw", "history"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`border-b-2 px-4 py-2 text-sm font-medium capitalize ${tab === t ? "border-brand text-white" : "border-transparent text-muted hover:text-white"}`}>{t}</button>
        ))}
      </div>

      {isDemo && tab !== "history" && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm text-warn">
          <span>You are on your <b>demo</b> account. Deposits and withdrawals use your real account.</span>
          {real && <button className="btn btn-primary !py-1.5 text-xs" onClick={() => switchAccount(real.id)}>Switch to real account ({real.loginid})</button>}
        </div>
      )}

      {tab === "deposit" && (
        <div className="space-y-6">
          {current ? (
            <DepositStatus key={current.id} initial={current} onDone={loadHistory} onNew={() => setCurrent(null)} />
          ) : (
            <>
              <MethodPicker methods={methods} value={method} onChange={setMethod} />
              <div className="card mx-auto max-w-xl space-y-4 p-5">
                <div>
                  <label className="label">Amount (USD)</label>
                  <input className="input num !text-lg" type="number" min={m.minDeposit} value={amount} onChange={(e) => setAmount(e.target.value)} />
                  <div className="mt-2 flex gap-1.5">
                    {[10, 25, 50, 100, 500, 1000].map((v) => <button key={v} onClick={() => setAmount(String(v))} className="flex-1 rounded bg-panel2 py-1 text-xs hover:bg-line">${v}</button>)}
                  </div>
                  <p className="mt-1.5 text-xs text-muted">Min {usd(m.minDeposit)} · Max {usd(m.maxDeposit)}</p>
                </div>
                {m.kind === "mobile" && (
                  <div>
                    <label className="label">M-Pesa phone number</label>
                    <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712 345 678" />
                  </div>
                )}
                <div className="space-y-1.5 rounded-lg bg-panel2 p-3 text-sm">
                  <div className="flex justify-between"><span className="text-muted">You pay</span><span className="num font-semibold">{preview}</span></div>
                  <div className="flex justify-between"><span className="text-muted">You receive</span><span className="num font-semibold text-up">{usd(amt)}</span></div>
                  <div className="flex justify-between"><span className="text-muted">Deposit fee</span><span className="num">$0.00</span></div>
                  {m.kind === "crypto" && m.asset !== "USDT" && <div className="flex justify-between text-xs"><span className="text-muted">Rate</span><span className="num">1 {m.asset} = {usd(dRate)}</span></div>}
                </div>
                <button className="btn btn-primary w-full !py-3" disabled={busy || isDemo} onClick={deposit}>{busy ? "Please wait…" : m.kind === "mobile" ? "Send M-Pesa prompt" : "Generate deposit address"}</button>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "withdraw" && (
        <div className="space-y-6">
          <MethodPicker methods={methods} value={method} onChange={setMethod} />
          <div className="card mx-auto max-w-xl space-y-4 p-5">
            {!canWithdraw && (
              <div className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-xs text-warn">
                Before withdrawing you need: {(!user?.emailVerified && !user?.phoneVerified) && <b>a verified email or phone</b>}{(!user?.emailVerified && !user?.phoneVerified) && user?.kycStatus !== "verified" && " and "}{user?.kycStatus !== "verified" && <b>verified identity ({user?.kycStatus === "pending" ? "under review" : "not submitted"})</b>}. <Link href="/settings" className="underline">Go to settings</Link>
              </div>
            )}
            <div>
              <div className="flex items-center justify-between"><label className="label !mb-0">Amount (USD)</label><button className="text-xs text-accent" onClick={() => setAmount(String(Math.min(real?.balance ?? 0, m.maxWithdraw)))}>Max</button></div>
              <input className="input num mt-1 !text-lg" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <p className="mt-1.5 text-xs text-muted">Min {usd(m.minWithdraw)} · Max {usd(m.maxWithdraw)} · Available {usd(real?.balance ?? 0)}</p>
            </div>
            <div>
              <label className="label">{m.kind === "mobile" ? "M-Pesa phone number" : `${m.network} address`}</label>
              {m.kind === "mobile" ? <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712 345 678" /> : <input className="input num" value={dest} onChange={(e) => setDest(e.target.value)} placeholder={m.id === "usdt_trc20" ? "T…" : m.id === "btc" ? "bc1…" : "0x…"} />}
            </div>
            <div>
              <label className="label">Account password (to confirm)</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
            <div className="space-y-1.5 rounded-lg bg-panel2 p-3 text-sm">
              <div className="flex justify-between"><span className="text-muted">Withdrawal amount</span><span className="num">{usd(amt)}</span></div>
              <div className="flex justify-between"><span className="text-muted">Fee {m.kind === "mobile" ? `(${m.withdrawFee}%)` : "(network)"}</span><span className="num">−{usd(fee)}</span></div>
              <div className="flex justify-between border-t border-line pt-1.5"><span className="text-muted">You receive</span><span className="num font-semibold text-up">{wPreview}</span></div>
            </div>
            <button className="btn btn-primary w-full !py-3" disabled={busy || isDemo || !password} onClick={withdraw}>{busy ? "Submitting…" : "Request withdrawal"}</button>
            <p className="text-center text-[11px] text-muted">Withdrawals are held for 45 seconds (cancellable) then processed.</p>
          </div>
        </div>
      )}

      {tab === "history" && (
        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>ID</th><th>Date</th><th>Type</th><th>Method</th><th>USD amount</th><th>Fee</th><th>Asset amount</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {history.length === 0 && <tr><td colSpan={9} className="py-10 text-center text-muted">No payments yet.</td></tr>}
              {history.map((p) => (
                <tr key={p.id}>
                  <td className="num text-muted">#{p.id}</td>
                  <td>{fmtDate(p.createdAt)}</td>
                  <td className="capitalize">{p.direction}</td>
                  <td>{p.methodLabel}</td>
                  <td className={`num font-semibold ${p.direction === "deposit" ? "text-up" : "text-slate-200"}`}>{p.direction === "deposit" ? "+" : "−"}{usd(p.amountUsd)}</td>
                  <td className="num text-muted">{p.feeUsd ? usd(p.feeUsd) : "—"}</td>
                  <td className="num">{p.assetAmount ?? "—"} {p.asset}</td>
                  <td><span className={`chip ${statusStyle(p.status)}`}>{p.status}{p.status === "confirming" ? ` ${p.confirmations}/${p.requiredConfirmations}` : ""}</span><div className="mt-0.5 max-w-[240px] truncate text-[10px] text-muted">{p.receipt ? `Receipt ${p.receipt}` : p.note}</div></td>
                  <td>
                    {p.direction === "withdrawal" && p.status === "pending" && <button className="btn btn-ghost !px-2 !py-1 text-xs" onClick={() => cancel(p.id)}>Cancel</button>}
                    {p.direction === "deposit" && p.status === "pending" && <button className="btn btn-ghost !px-2 !py-1 text-xs" onClick={() => { setCurrent(p); setTab("deposit"); }}>Pay</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
