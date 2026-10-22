"use client";

import { useState, type ReactNode } from "react";
import { AppProvider, useApp } from "@/components/AppProvider";
import { Header } from "@/components/Header";
import { VerifyModal } from "@/components/VerifyModal";
import { api } from "@/lib/client";

function Banner() {
  const { user } = useApp();
  const [target, setTarget] = useState<{ t: string; code?: string } | null>(null);
  if (!user) return null;
  const unverified = !user.emailVerified && !user.phoneVerified;
  const contact = user.email && !user.emailVerified ? user.email : user.phone && !user.phoneVerified ? user.phone : null;
  if (!unverified || !contact) return null;
  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-3 border-b border-warn/30 bg-warn/10 px-3 py-1.5 text-center text-xs text-warn">
        Verify your {contact.includes("@") ? "email" : "phone number"} to unlock withdrawals and secure your account.
        <button
          className="rounded bg-warn px-2 py-0.5 font-semibold text-black"
          onClick={async () => {
            try {
              const d = await api<{ demoCode?: string }>("/api/auth/otp/request", { body: { identifier: contact, purpose: "verify" } });
              setTarget({ t: contact, code: d.demoCode });
            } catch {}
          }}
        >
          Verify now
        </button>
      </div>
      {target && <VerifyModal target={target.t} initialCode={target.code} onClose={() => setTarget(null)} />}
    </>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { ready } = useApp();
  if (!ready)
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted">
        <div className="flex items-center gap-3">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-brand" /> Loading your workspace…
        </div>
      </div>
    );
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <Banner />
      <main className="flex-1">{children}</main>
    </div>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppProvider>
      <Shell>{children}</Shell>
    </AppProvider>
  );
}
