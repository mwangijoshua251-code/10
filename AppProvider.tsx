"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiClientError, getToken, setToken, usd } from "@/lib/client";
import type { AccountView, ContractView, QuoteView, UserView } from "@/lib/types";

interface Toast {
  id: number;
  kind: "success" | "error" | "info";
  title: string;
  msg?: string;
}

interface Ctx {
  ready: boolean;
  user: UserView | null;
  setUser: (u: UserView) => void;
  accounts: AccountView[];
  active: AccountView | null;
  open: ContractView[];
  quotes: Record<string, QuoteView>;
  favorites: string[];
  toggleFavorite: (s: string) => Promise<void>;
  switchAccount: (id: number) => Promise<void>;
  resetDemo: () => Promise<void>;
  refresh: () => Promise<void>;
  toast: (t: Omit<Toast, "id">) => void;
  logout: () => Promise<void>;
}

const AppCtx = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside provider");
  return c;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<UserView | null>(null);
  const [accounts, setAccounts] = useState<AccountView[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [open, setOpen] = useState<ContractView[]>([]);
  const [quotes, setQuotes] = useState<Record<string, QuoteView>>({});
  const [favorites, setFavorites] = useState<string[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seen = useRef<Set<number>>(new Set());
  const lastServer = useRef<number>(0);
  const toastId = useRef(1);
  const pollRef = useRef<(() => Promise<void>) | null>(null);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = toastId.current++;
    setToasts((l) => [...l.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((l) => l.filter((x) => x.id !== id)), 6000);
  }, []);

  const onAuthError = useCallback(
    (e: unknown) => {
      if (e instanceof ApiClientError && e.status === 401) {
        setToken(null);
        router.replace("/login");
      }
    },
    [router],
  );

  const loadAccount = useCallback(async () => {
    const d = await api<{ user: UserView; accounts: AccountView[]; activeAccountId: number }>("/api/account");
    setUser(d.user);
    setAccounts(d.accounts);
    setActiveId(d.activeAccountId);
  }, []);

  // initial load
  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    (async () => {
      try {
        await loadAccount();
        const f = await api<{ favorites: string[] }>("/api/favorites");
        setFavorites(f.favorites);
        lastServer.current = Date.now();
        setReady(true);
      } catch (e) {
        onAuthError(e);
      }
    })();
  }, [router, loadAccount, onAuthError]);

  // quotes polling
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const d = await api<{ quotes: QuoteView[] }>("/api/quotes");
        if (stop) return;
        const m: Record<string, QuoteView> = {};
        for (const q of d.quotes) m[q.symbol] = q;
        setQuotes(m);
      } catch {}
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

  // live account / positions polling
  useEffect(() => {
    if (!ready) return;
    let stop = false;
    let busy = false;
    const poll = async () => {
      if (document.hidden || busy) return;
      busy = true;
      try {
        const d = await api<{ serverTime: number; activeAccountId: number; accounts: AccountView[]; open: ContractView[]; closed: ContractView[] }>(
          `/api/live?since=${Math.max(lastServer.current - 8000, 0)}`,
        );
        if (stop) return;
        lastServer.current = d.serverTime;
        setAccounts(d.accounts);
        setActiveId(d.activeAccountId);
        setOpen(d.open);
        for (const c of d.closed) {
          if (seen.current.has(c.id)) continue;
          seen.current.add(c.id);
          if (c.closedAt && Date.now() - c.closedAt > 20000) continue;
          const p = c.profit ?? 0;
          toast({
            kind: p > 0 ? "success" : p < 0 ? "error" : "info",
            title: `${c.typeLabel} · ${c.symbolName}: ${c.status === "sold" ? "cashed out" : c.status === "won" ? "won" : "lost"}`,
            msg: `Profit/loss ${usd(p, true)} (stake ${usd(c.stake)})`,
          });
        }
      } catch (e) {
        onAuthError(e);
      } finally {
        busy = false;
      }
    };
    pollRef.current = poll;
    poll();
    const t = setInterval(poll, 1500);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [ready, toast, onAuthError]);

  const value = useMemo<Ctx>(
    () => ({
      ready,
      user,
      setUser,
      accounts,
      active: accounts.find((a) => a.id === activeId) ?? null,
      open,
      quotes,
      favorites,
      toast,
      refresh: async () => {
        await loadAccount();
        await pollRef.current?.();
      },
      toggleFavorite: async (s: string) => {
        const d = await api<{ favorites: string[] }>("/api/favorites", { body: { symbol: s } });
        setFavorites(d.favorites);
      },
      switchAccount: async (id: number) => {
        await api("/api/account", { body: { action: "switch", accountId: id } });
        setOpen([]);
        await loadAccount();
      },
      resetDemo: async () => {
        await api("/api/account", { body: { action: "reset_demo" } });
        await loadAccount();
        toast({ kind: "success", title: "Demo balance reset", msg: "Your virtual balance is back to $10,000.00" });
      },
      logout: async () => {
        try {
          await api("/api/auth/logout", { method: "POST", body: {} });
        } catch {}
        setToken(null);
        router.replace("/login");
      },
    }),
    [ready, user, accounts, activeId, open, quotes, favorites, toast, loadAccount, router],
  );

  return (
    <AppCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-80 max-w-[90vw] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast-in pointer-events-auto rounded-lg border bg-panel2 p-3 shadow-xl ${
              t.kind === "success" ? "border-up/60" : t.kind === "error" ? "border-down/60" : "border-line"
            }`}
          >
            <div className={`text-sm font-semibold ${t.kind === "success" ? "text-up" : t.kind === "error" ? "text-down" : "text-slate-100"}`}>{t.title}</div>
            {t.msg && <div className="mt-0.5 text-xs text-slate-300">{t.msg}</div>}
          </div>
        ))}
      </div>
    </AppCtx.Provider>
  );
}
