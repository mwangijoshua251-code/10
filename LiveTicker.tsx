"use client";

import { useEffect, useState } from "react";
import { SYMBOL_MAP } from "@/lib/catalog";
import { fmtPrice } from "@/lib/client";
import type { QuoteView } from "@/lib/types";

const FEATURED = ["R_100", "1HZ75V", "BOOM1000", "CRASH500", "frxEURUSD", "frxGBPUSD", "frxXAUUSD", "cryBTCUSD", "cryETHUSD", "OTC_NDX", "OTC_NVDA", "OTC_TSLA"];

export function LiveTicker({ cards = false }: { cards?: boolean }) {
  const [quotes, setQuotes] = useState<Record<string, QuoteView>>({});
  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const r = await fetch("/api/quotes", { cache: "no-store" });
        const d = (await r.json()) as { quotes: QuoteView[] };
        if (!stop) setQuotes(Object.fromEntries(d.quotes.map((q) => [q.symbol, q])));
      } catch {}
    };
    load();
    const t = setInterval(load, 2000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

  const items = FEATURED.map((id) => ({ def: SYMBOL_MAP[id], q: quotes[id] })).filter((x) => x.def);

  if (cards)
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {items.slice(0, 8).map(({ def, q }) => (
          <div key={def.id} className="card p-4">
            <div className="text-xs text-muted">{def.name}</div>
            <div className={`num mt-1 text-lg font-bold ${q && q.price >= q.prev ? "text-up" : "text-down"}`}>{q ? fmtPrice(q.price, def.digits) : "—"}</div>
            <div className={`num text-xs ${q && q.change >= 0 ? "text-up" : "text-down"}`}>{q ? `${q.change >= 0 ? "+" : ""}${q.change.toFixed(2)}%` : ""}</div>
          </div>
        ))}
      </div>
    );

  return (
    <div className="flex gap-8 overflow-x-auto border-y border-line bg-panel px-4 py-2.5 text-xs">
      {items.map(({ def, q }) => (
        <div key={def.id} className="flex shrink-0 items-center gap-2">
          <span className="text-muted">{def.name}</span>
          <span className={`num font-semibold ${q && q.price >= q.prev ? "text-up" : "text-down"}`}>{q ? fmtPrice(q.price, def.digits) : "—"}</span>
          {q && <span className={`num ${q.change >= 0 ? "text-up" : "text-down"}`}>{q.change >= 0 ? "▲" : "▼"} {Math.abs(q.change).toFixed(2)}%</span>}
        </div>
      ))}
    </div>
  );
}
