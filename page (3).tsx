"use client";

import { useState } from "react";
import { useApp } from "@/components/AppProvider";
import { VerifyModal } from "@/components/VerifyModal";
import { COUNTRIES, api, fmtDate, setToken } from "@/lib/client";
import type { UserView } from "@/lib/types";
import { useRouter } from "next/navigation";

type Tab = "profile" | "security" | "verification" | "limits";

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <h3 className="font-semibold">{title}</h3>
      {desc && <p className="mb-4 mt-0.5 text-xs text-muted">{desc}</p>}
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const { user, setUser, toast } = useApp();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("profile");
  const [verify, setVerify] = useState<{ t: string; code?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // profile
  const [name, setName] = useState(user?.fullName ?? "");
  const [country, setCountry] = useState(user?.country ?? "Kenya");
  const [newContact, setNewContact] = useState("");
  // password
  const [cur, setCur] = useState("");
  const [nxt, setNxt] = useState("");
  // kyc
  const [k, setK] = useState({ fullName: user?.fullName ?? "", dob: user?.dob ?? "", country: user?.country ?? "Kenya", address: user?.address ?? "", idType: user?.idType ?? "National ID", idNumber: "" });
  // limits
  const [lim, setLim] = useState({
    maxOpenPositions: String(user?.limits.maxOpenPositions ?? ""),
    maxDailyLoss: String(user?.limits.maxDailyLoss ?? ""),
    maxDailyTurnover: String(user?.limits.maxDailyTurnover ?? ""),
    maxStake: String(user?.limits.maxStake ?? ""),
  });
  const [exDays, setExDays] = useState(7);
  const [exPw, setExPw] = useState("");

  if (!user) return null;

  const post = async (action: string, payload: Record<string, unknown>, ok: string) => {
    setBusy(true);
    try {
      const d = await api<{ user?: UserView; target?: string }>("/api/settings", { body: { action, ...payload } });
      if (d.user) setUser(d.user);
      toast({ kind: "success", title: ok });
      return d;
    } catch (e) {
      toast({ kind: "error", title: "Could not save", msg: (e as Error).message });
      return null;
    } finally {
      setBusy(false);
    }
  };

  const startVerify = async (target: string) => {
    try {
      const d = await api<{ demoCode?: string }>("/api/auth/otp/request", { body: { identifier: target, purpose: "verify" } });
      setVerify({ t: target, code: d.demoCode });
    } catch (e) {
      toast({ kind: "error", title: "Could not send code", msg: (e as Error).message });
    }
  };

  const ContactRow = ({ label, value, verified }: { label: string; value: string | null; verified: boolean }) => (
    <div className="flex items-center justify-between rounded-lg bg-panel2 px-3 py-2.5 text-sm">
      <div>
        <div className="text-[11px] uppercase text-muted">{label}</div>
        <div>{value ?? "Not added"}</div>
      </div>
      {value && (verified ? <span className="chip bg-up/15 text-up">Verified</span> : <button className="btn btn-primary !py-1 text-xs" onClick={() => startVerify(value)}>Verify</button>)}
    </div>
  );

  const excluded = user.excludedUntil && user.excludedUntil > Date.now();

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8">
      <h1 className="mb-1 text-2xl font-bold">Account settings</h1>
      <p className="mb-6 text-sm text-muted">Member since {fmtDate(user.createdAt)}</p>
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {([["profile", "Profile"], ["security", "Security"], ["verification", "Verification"], ["limits", "Responsible trading"]] as [Tab, string][]).map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)} className={`shrink-0 border-b-2 px-4 py-2 text-sm font-medium ${tab === t ? "border-brand text-white" : "border-transparent text-muted hover:text-white"}`}>{l}</button>
        ))}
      </div>

      {tab === "profile" && (
        <div className="space-y-5">
          <Section title="Contact details" desc="Log in with either your email or phone number. Verify both for the best account recovery options.">
            <div className="space-y-2">
              <ContactRow label="Email" value={user.email} verified={user.emailVerified} />
              <ContactRow label="Phone" value={user.phone} verified={user.phoneVerified} />
            </div>
            {(!user.email || !user.phone) && (
              <div className="mt-3 flex gap-2">
                <input className="input" placeholder={user.email ? "Add phone e.g. +254712345678" : "Add email address"} value={newContact} onChange={(e) => setNewContact(e.target.value)} />
                <button className="btn btn-ghost" disabled={busy || !newContact} onClick={async () => {
                  const d = await post("add_contact", { kind: user.email ? "phone" : "email", value: newContact }, "Contact added");
                  if (d?.target) { setNewContact(""); startVerify(d.target); }
                }}>Add</button>
              </div>
            )}
          </Section>
          <Section title="Personal details">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label">Full name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div><label className="label">Country</label><select className="input" value={country} onChange={(e) => setCountry(e.target.value)}>{COUNTRIES.map((c) => <option key={c}>{c}</option>)}</select></div>
            </div>
            <button className="btn btn-primary mt-4" disabled={busy} onClick={() => post("profile", { fullName: name, country }, "Profile updated")}>Save changes</button>
          </Section>
        </div>
      )}

      {tab === "security" && (
        <div className="space-y-5">
          <Section title="Change password">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label">Current password</label><input className="input" type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" /></div>
              <div><label className="label">New password</label><input className="input" type="password" value={nxt} onChange={(e) => setNxt(e.target.value)} autoComplete="new-password" /></div>
            </div>
            <button className="btn btn-primary mt-4" disabled={busy || !cur || !nxt} onClick={async () => { if (await post("password", { current: cur, next: nxt }, "Password changed")) { setCur(""); setNxt(""); } }}>Update password</button>
          </Section>
          <Section title="Sessions" desc="Sign out of every device where you are logged in, including this one.">
            <button className="btn btn-ghost" onClick={async () => { await api("/api/settings", { body: { action: "logout_all" } }); setToken(null); router.replace("/login"); }}>Log out of all devices</button>
          </Section>
        </div>
      )}

      {tab === "verification" && (
        <Section title="Identity verification (KYC)" desc="Required before your first withdrawal. Your details are matched against your government ID.">
          <div className="mb-4">
            <span className={`chip ${user.kycStatus === "verified" ? "bg-up/15 text-up" : user.kycStatus === "pending" ? "bg-warn/15 text-warn" : "bg-panel2 text-muted"}`}>
              {user.kycStatus === "verified" ? "Verified" : user.kycStatus === "pending" ? "Under review…" : "Not verified"}
            </span>
            {user.kycStatus === "pending" && <span className="ml-2 text-xs text-muted">Sandbox reviewer approves within ~15 seconds.</span>}
          </div>
          {user.kycStatus === "verified" ? (
            <div className="space-y-1 text-sm">
              <div>Name: <b>{user.fullName}</b></div><div>Date of birth: <b>{user.dob}</b></div><div>Country: <b>{user.country}</b></div><div>{user.idType}: <b>{user.idNumber}</b></div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2"><label className="label">Full legal name</label><input className="input" value={k.fullName} onChange={(e) => setK({ ...k, fullName: e.target.value })} /></div>
              <div><label className="label">Date of birth</label><input className="input" type="date" value={k.dob} onChange={(e) => setK({ ...k, dob: e.target.value })} /></div>
              <div><label className="label">Country of residence</label><select className="input" value={k.country} onChange={(e) => setK({ ...k, country: e.target.value })}>{COUNTRIES.map((c) => <option key={c}>{c}</option>)}</select></div>
              <div className="sm:col-span-2"><label className="label">Residential address</label><input className="input" value={k.address} onChange={(e) => setK({ ...k, address: e.target.value })} /></div>
              <div><label className="label">ID type</label><select className="input" value={k.idType} onChange={(e) => setK({ ...k, idType: e.target.value })}>{["National ID", "Passport", "Driving licence"].map((t) => <option key={t}>{t}</option>)}</select></div>
              <div><label className="label">ID number</label><input className="input" value={k.idNumber} onChange={(e) => setK({ ...k, idNumber: e.target.value })} /></div>
              <div className="sm:col-span-2"><button className="btn btn-primary" disabled={busy || user.kycStatus === "pending"} onClick={() => post("kyc", k, "Verification submitted")}>Submit for verification</button></div>
            </div>
          )}
        </Section>
      )}

      {tab === "limits" && (
        <div className="space-y-5">
          <Section title="Trading limits" desc="Limits apply to your real account. Leave a field empty for no limit.">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label">Max open positions</label><input className="input num" type="number" value={lim.maxOpenPositions} onChange={(e) => setLim({ ...lim, maxOpenPositions: e.target.value })} /></div>
              <div><label className="label">Max stake per trade ($)</label><input className="input num" type="number" value={lim.maxStake} onChange={(e) => setLim({ ...lim, maxStake: e.target.value })} /></div>
              <div><label className="label">Max daily loss ($)</label><input className="input num" type="number" value={lim.maxDailyLoss} onChange={(e) => setLim({ ...lim, maxDailyLoss: e.target.value })} /></div>
              <div><label className="label">Max daily turnover ($)</label><input className="input num" type="number" value={lim.maxDailyTurnover} onChange={(e) => setLim({ ...lim, maxDailyTurnover: e.target.value })} /></div>
            </div>
            <button className="btn btn-primary mt-4" disabled={busy} onClick={() => post("limits", lim, "Limits saved")}>Save limits</button>
          </Section>
          <Section title="Self-exclusion" desc="Take a break from trading. While excluded you cannot open new trades or withdraw. This cannot be reversed early.">
            {excluded ? (
              <div className="rounded-lg border border-down/40 bg-down/10 p-3 text-sm text-down">You are self-excluded until {fmtDate(user.excludedUntil as number)}.</div>
            ) : (
              <div className="flex flex-wrap items-end gap-3">
                <div><label className="label">Exclude me for</label><select className="input !w-40" value={exDays} onChange={(e) => setExDays(Number(e.target.value))}>{[[1, "24 hours"], [7, "7 days"], [30, "30 days"], [90, "3 months"], [180, "6 months"], [365, "1 year"]].map(([d, l]) => <option key={d} value={d}>{l}</option>)}</select></div>
                <div><label className="label">Confirm password</label><input className="input" type="password" value={exPw} onChange={(e) => setExPw(e.target.value)} /></div>
                <button className="btn btn-primary" disabled={busy || !exPw} onClick={() => post("exclude", { days: exDays, password: exPw }, "Self-exclusion activated")}>Exclude me</button>
              </div>
            )}
          </Section>
          <p className="text-xs text-muted">Need help? Gambling and trading can be addictive. Never trade money you cannot afford to lose.</p>
        </div>
      )}
      {verify && <VerifyModal target={verify.t} initialCode={verify.code} onClose={() => setVerify(null)} />}
    </div>
  );
}
