"use client";

import { useMemo, useRef, useState } from "react";
import { MARKETS, SYMBOLS, type MarketId } from "@/lib/catalog";
import { fmtPrice } from "@/lib/client";
import { useApp } from "./AppProvider";

function PriceCell({ symbol, digits }: { symbol: string; digits: number }) {
  const { quotes } = useApp();
  const q = quotes[symbol];
  const prev = useRef<number | null>(null);
  const cls = useRef("");
  if (q && prev.current !== null && q.price !== prev.current) cls.current = q.price > prev.current ? "flash-up" : "flash-down";
  if (q) prev.current = q.price;
  if (!q) return <span className="text-muted">—</span>;
  return (
    <div className="text-right">
      <div key={q.tick} className={`num rounded px-1 text-xs font-medium ${cls.current}`}>{fmtPrice(q.price, digits)}</div>
      <div className={`num text-[10px] ${q.change >= 0 ? "text-up" : "text-down"}`}>{q.change >= 0 ? "+" : ""}{q.change.toFixed(2)}%</div>
    </div>
  );
}

export function MarketList({ selected, onSelect }: { selected: string; onSelect: (s: string) => void }) {
  const { favorites, toggleFavorite } = useApp();
  const [tab, setTab] = useState<MarketId | "fav">("derived");
  const [q, setQ] = useState("");

  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = SYMBOLS.filter((s) => {
      if (term) return s.name.toLowerCase().includes(term) || s.id.toLowerCase().includes(term);
      return tab === "fav" ? favorites.includes(s.id) : s.market === tab;
    });
    const m = new Map<string, typeof list>();
    for (const s of list) {
      const key = term ? MARKETS.find((x) => x.id === s.market)!.name : s.sub;
      m.set(key, [...(m.get(key) ?? []), s]);
    }
    return [...m.entries()];
  }, [tab, q, favorites]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line p-2">
        <input className="input !py-1.5" placeholder="Search markets…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="flex gap-1 overflow-x-auto border-b border-line p-2">
        <button onClick={() => setTab("fav")} className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium ${tab === "fav" ? "bg-brand/20 text-brand" : "text-muted hover:text-white"}`}>★ Favs</button>
        {MARKETS.map((m) => (
          <button key={m.id} onClick={() => setTab(m.id)} className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium ${tab === m.id && !q ? "bg-panel2 text-white" : "text-muted hover:text-white"}`}>
            {m.name}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {groups.length === 0 && <div className="p-6 text-center text-xs text-muted">{tab === "fav" ? "Tap the ☆ next to a market to add it to your favourites." : "No markets found."}</div>}
        {groups.map(([name, list]) => (
          <div key={name}>
            <div className="sticky top-0 bg-panel px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">{name}</div>
            {list.map((s) => (
              <div key={s.id} onClick={() => onSelect(s.id)} className={`flex cursor-pointer items-center gap-2 border-l-2 px-3 py-2 hover:bg-panel2 ${selected === s.id ? "border-brand bg-panel2" : "border-transparent"}`}>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleFavorite(s.id); }}
                  className={`text-sm ${favorites.includes(s.id) ? "text-warn" : "text-muted/50 hover:text-warn"}`}
                  aria-label="Toggle favourite"
                >
                  {favorites.includes(s.id) ? "★" : "☆"}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">{s.name}</div>
                  <div className="text-[10px] text-muted">{s.id}</div>
                </div>
                <PriceCell symbol={s.id} digits={s.digits} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
