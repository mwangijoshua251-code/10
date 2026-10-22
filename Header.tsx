"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useApp } from "./AppProvider";
import { usd } from "@/lib/client";

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#ff444f" />
        <path d="M7 22l6-7 4 4 8-10" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-lg font-bold tracking-tight">
        Arena<span className="text-brand">Markets</span>
      </span>
    </span>
  );
}

const NAV = [
  { href: "/trade", label: "Trade" },
  { href: "/bots", label: "Bots" },
  { href: "/reports", label: "Reports" },
  { href: "/cashier", label: "Cashier" },
  { href: "/settings", label: "Settings" },
];

export function Header() {
  const { accounts, active, switchAccount, resetDemo, user, logout, toast } = useApp();
  const path = usePathname();
  const [menu, setMenu] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setMenu(false);
        setUserMenu(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg/95 backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-3 md:px-5">
        <Link href="/trade">
          <Logo />
        </Link>
        <nav className="ml-4 hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${path.startsWith(n.href) ? "bg-panel2 text-white" : "text-muted hover:text-white"}`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2" ref={ref}>
          <div className="relative">
            <button
              onClick={() => {
                setMenu(!menu);
                setUserMenu(false);
              }}
              className="flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-1.5 text-left hover:bg-panel2"
            >
              <span className={`chip ${active?.type === "demo" ? "bg-warn/20 text-warn" : "bg-up/15 text-up"}`}>{active?.type === "demo" ? "DEMO" : "REAL"}</span>
              <span className="num text-sm font-semibold">{active ? usd(active.balance) : "—"}</span>
              <span className="hidden text-xs text-muted sm:inline">USD</span>
              <span className="text-muted">▾</span>
            </button>
            {menu && (
              <div className="absolute right-0 mt-2 w-80 max-w-[92vw] overflow-hidden rounded-xl border border-line bg-panel shadow-2xl">
                <div className="border-b border-line px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">Your accounts</div>
                {accounts.map((a) => (
                  <button
                    key={a.id}
                    onClick={async () => {
                      await switchAccount(a.id);
                      setMenu(false);
                    }}
                    className={`flex w-full items-center justify-between px-4 py-3 text-left hover:bg-panel2 ${a.id === active?.id ? "bg-panel2" : ""}`}
                  >
                    <span>
                      <span className="block text-sm font-semibold">{a.type === "real" ? "Real" : "Demo"} account</span>
                      <span className="block text-xs text-muted">{a.loginid}</span>
                    </span>
                    <span className="num text-sm font-semibold">{usd(a.balance)}</span>
                  </button>
                ))}
                <div className="flex gap-2 border-t border-line p-3">
                  {active?.type === "demo" ? (
                    <button className="btn btn-ghost flex-1 !py-1.5 text-xs" onClick={async () => { await resetDemo(); setMenu(false); }}>
                      Reset demo balance
                    </button>
                  ) : (
                    <Link href="/cashier" onClick={() => setMenu(false)} className="btn btn-primary flex-1 !py-1.5 text-xs">
                      Deposit
                    </Link>
                  )}
                  <Link href="/cashier?tab=withdraw" onClick={() => setMenu(false)} className="btn btn-ghost flex-1 !py-1.5 text-xs">
                    Withdraw
                  </Link>
                </div>
              </div>
            )}
          </div>
          <Link
            href="/cashier"
            onClick={() => {
              if (active?.type === "demo") toast({ kind: "info", title: "Demo account active", msg: "Switch to your real account to deposit." });
            }}
            className="btn btn-primary hidden !py-1.5 sm:inline-flex"
          >
            Deposit
          </Link>
          <div className="relative">
            <button
              onClick={() => {
                setUserMenu(!userMenu);
                setMenu(false);
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-panel2 text-sm font-bold hover:border-accent"
              aria-label="User menu"
            >
              {(user?.fullName ?? user?.email ?? user?.phone ?? "U").slice(0, 1).toUpperCase()}
            </button>
            {userMenu && (
              <div className="absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-line bg-panel shadow-2xl">
                <div className="border-b border-line px-4 py-3">
                  <div className="truncate text-sm font-semibold">{user?.fullName ?? "Trader"}</div>
                  <div className="truncate text-xs text-muted">{user?.email ?? user?.phone}</div>
                </div>
                <Link href="/settings" onClick={() => setUserMenu(false)} className="block px-4 py-2.5 text-sm hover:bg-panel2">Account settings</Link>
                <Link href="/reports" onClick={() => setUserMenu(false)} className="block px-4 py-2.5 text-sm hover:bg-panel2">Reports</Link>
                <button onClick={logout} className="block w-full px-4 py-2.5 text-left text-sm text-down hover:bg-panel2">Log out</button>
              </div>
            )}
          </div>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t border-line px-2 py-1 md:hidden">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={`rounded-md px-3 py-1.5 text-sm font-medium ${path.startsWith(n.href) ? "bg-panel2 text-white" : "text-muted"}`}>
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
