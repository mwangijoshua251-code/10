"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import type { UserView } from "@/lib/types";
import { useApp } from "./AppProvider";

export function VerifyModal({ target, initialCode, onClose }: { target: string; initialCode?: string; onClose: () => void }) {
  const { setUser, toast } = useApp();
  const [code, setCode] = useState("");
  const [demo, setDemo] = useState<string | undefined>(initialCode);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const resend = async () => {
    setErr("");
    try {
      const d = await api<{ demoCode?: string }>("/api/auth/otp/request", { body: { identifier: target, purpose: "verify" } });
      setDemo(d.demoCode);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const d = await api<{ user: UserView }>("/api/auth/otp/verify", { body: { identifier: target, purpose: "verify", code } });
      setUser(d.user);
      toast({ kind: "success", title: "Verified", msg: `${target} is now verified.` });
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="card w-full max-w-sm p-6">
        <h3 className="text-lg font-bold">Verify {target.includes("@") ? "email" : "phone number"}</h3>
        <p className="mt-1 text-sm text-muted">Enter the 6-digit code we sent to <span className="text-slate-200">{target}</span>.</p>
        {demo && (
          <div className="mt-3 rounded-lg border border-warn/40 bg-warn/10 p-3 text-xs text-warn">
            Sandbox mode: no SMS/email provider is connected, so your code is shown here: <b className="num text-base tracking-widest">{demo}</b>
          </div>
        )}
        <input className="input num mt-4 text-center text-xl tracking-[0.5em]" inputMode="numeric" maxLength={6} placeholder="••••••" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus />
        {err && <p className="mt-2 text-sm text-down">{err}</p>}
        <div className="mt-4 flex gap-2">
          <button type="button" className="btn btn-ghost" onClick={resend}>Resend code</button>
          <button className="btn btn-primary flex-1" disabled={busy || code.length !== 6}>{busy ? "Verifying…" : "Verify"}</button>
        </div>
      </form>
    </div>
  );
}
