"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { COUNTRIES, api, getToken, setToken } from "@/lib/client";
import { Logo } from "./Header";

function Shell({ children, title, sub }: { children: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden border-r border-line bg-[radial-gradient(ellipse_at_top_left,#3a0f14_0%,#0a0e13_60%)] p-12 lg:flex lg:flex-col lg:justify-between">
        <Link href="/"><Logo size={34} /></Link>
        <div>
          <h2 className="max-w-md text-4xl font-bold leading-tight">Trade 75+ markets with up to <span className="text-brand">95% payouts</span>.</h2>
          <ul className="mt-8 space-y-3 text-slate-300">
            {["Synthetic indices that never sleep — 24/7/365", "Forex, indices, commodities, crypto & stocks", "Rise/Fall, Digits, Accumulators, Multipliers & more", "Fund with USDT, BTC, ETH or M-Pesa — balances in USD"].map((t) => (
              <li key={t} className="flex items-start gap-3"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-up" />{t}</li>
            ))}
          </ul>
        </div>
        <p className="max-w-md text-xs text-muted">Trading CFDs and options involves significant risk and can result in the loss of your invested capital. Trade responsibly.</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-8 block lg:hidden"><Logo /></Link>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mb-6 mt-1 text-sm text-muted">{sub}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

function strength(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 12) s++;
  return s;
}

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"password" | "otp">("password");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [demo, setDemo] = useState<string | undefined>();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (getToken()) api("/api/account").then(() => router.replace("/trade")).catch(() => setToken(null));
  }, [router]);

  const finish = (token: string) => {
    setToken(token);
    router.replace("/trade");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      if (mode === "password") {
        const d = await api<{ token: string }>("/api/auth/login", { body: { identifier, password } });
        finish(d.token);
      } else if (!otpSent) {
        const d = await api<{ demoCode?: string }>("/api/auth/otp/request", { body: { identifier, purpose: "login" } });
        setOtpSent(true);
        setDemo(d.demoCode);
      } else {
        const d = await api<{ token: string }>("/api/auth/otp/verify", { body: { identifier, purpose: "login", code } });
        finish(d.token);
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title="Log in" sub="Use your email address or phone number.">
      <div className="mb-5 grid grid-cols-2 rounded-lg border border-line bg-panel p-1 text-sm">
        {(["password", "otp"] as const).map((m) => (
          <button key={m} onClick={() => { setMode(m); setErr(""); setOtpSent(false); }} className={`rounded-md py-2 font-medium ${mode === m ? "bg-panel2 text-white" : "text-muted"}`}>
            {m === "password" ? "Password" : "One-time code"}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Email or phone number</label>
          <input className="input" placeholder="you@example.com or +254712345678" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required disabled={otpSent} />
        </div>
        {mode === "password" && (
          <div>
            <label className="label">Password</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </div>
        )}
        {mode === "otp" && otpSent && (
          <div>
            <label className="label">6-digit code</label>
            {demo && (
              <div className="mb-2 rounded-lg border border-warn/40 bg-warn/10 p-3 text-xs text-warn">
                Sandbox mode: no SMS/email provider is connected, so your code is shown here: <b className="num text-base tracking-widest">{demo}</b>
              </div>
            )}
            <input className="input num text-center text-xl tracking-[0.5em]" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus />
          </div>
        )}
        {err && <p className="rounded-lg bg-down/10 px-3 py-2 text-sm text-down">{err}</p>}
        <button className="btn btn-primary w-full !py-3" disabled={busy}>
          {busy ? "Please wait…" : mode === "password" ? "Log in" : otpSent ? "Verify & log in" : "Send me a code"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        New to Arena Markets? <Link href="/signup" className="font-semibold text-brand hover:underline">Create a free account</Link>
      </p>
    </Shell>
  );
}

export function SignupForm() {
  const router = useRouter();
  const [kind, setKind] = useState<"email" | "phone">("email");
  const [value, setValue] = useState("");
  const [name, setName] = useState("");
  const [country, setCountry] = useState("Kenya");
  const [password, setPassword] = useState("");
  const [terms, setTerms] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const s = strength(password);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const d = await api<{ token: string }>("/api/auth/register", {
        body: { [kind]: value, password, fullName: name, country, terms },
      });
      setToken(d.token);
      router.replace("/trade");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title="Create your account" sub="Start with $10,000 in virtual funds. No card required.">
      <div className="mb-5 grid grid-cols-2 rounded-lg border border-line bg-panel p-1 text-sm">
        {(["email", "phone"] as const).map((k) => (
          <button key={k} type="button" onClick={() => { setKind(k); setValue(""); }} className={`rounded-md py-2 font-medium ${kind === k ? "bg-panel2 text-white" : "text-muted"}`}>
            {k === "email" ? "Email" : "Phone number"}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">{kind === "email" ? "Email address" : "Phone number"}</label>
          <input className="input" type={kind === "email" ? "email" : "tel"} placeholder={kind === "email" ? "you@example.com" : "+254 712 345 678"} value={value} onChange={(e) => setValue(e.target.value)} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Full name (optional)</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </div>
          <div>
            <label className="label">Country</label>
            <select className="input" value={country} onChange={(e) => setCountry(e.target.value)}>
              {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
          <div className="mt-2 flex gap-1">
            {[1, 2, 3, 4].map((i) => (
              <span key={i} className={`h-1 flex-1 rounded ${i <= s ? (s <= 1 ? "bg-down" : s <= 2 ? "bg-warn" : "bg-up") : "bg-line"}`} />
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">8+ characters with upper-case, lower-case and a number.</p>
        </div>
        <label className="flex items-start gap-2 text-xs text-muted">
          <input type="checkbox" className="mt-0.5" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
          I confirm that I am 18 years or older, I understand that trading involves a high risk of loss, and I accept the Terms &amp; Conditions.
        </label>
        {err && <p className="rounded-lg bg-down/10 px-3 py-2 text-sm text-down">{err}</p>}
        <button className="btn btn-primary w-full !py-3" disabled={busy}>{busy ? "Creating account…" : "Create free account"}</button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        Already registered? <Link href="/login" className="font-semibold text-brand hover:underline">Log in</Link>
      </p>
    </Shell>
  );
}
