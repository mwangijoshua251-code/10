"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { MarketList } from "@/components/MarketList";
import { Positions } from "@/components/Positions";
import { PriceChart } from "@/components/PriceChart";
import { TradePanel } from "@/components/TradePanel";
import { DEFAULT_SYMBOL, SYMBOL_MAP } from "@/lib/catalog";

export default function TradePage() {
  const { quotes, open } = useApp();
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL);
  const [showMarkets, setShowMarkets] = useState(false);
  const [showPos, setShowPos] = useState(true);

  useEffect(() => {
    const s = window.localStorage.getItem("arena_symbol");
    if (s && SYMBOL_MAP[s]) setSymbol(s);
  }, []);

  const select = (s: string) => {
    setSymbol(s);
    setShowMarkets(false);
    window.localStorage.setItem("arena_symbol", s);
  };
  const def = SYMBOL_MAP[symbol];

  return (
    <div className="grid lg:h-[calc(100vh-3.5rem)] lg:grid-cols-[250px_minmax(0,1fr)_330px]">
      <aside className={`${showMarkets ? "block" : "hidden"} h-[70vh] border-r border-line bg-panel lg:block lg:h-auto lg:min-h-0`}>
        <MarketList selected={symbol} onSelect={select} />
      </aside>
      <section className="flex min-h-0 min-w-0 flex-col">
        <button onClick={() => setShowMarkets(!showMarkets)} className="flex items-center justify-between border-b border-line bg-panel px-3 py-2 text-sm font-medium lg:hidden">
          <span>{def.name}</span>
          <span className="text-xs text-accent">{showMarkets ? "Close markets" : "Change market"}</span>
        </button>
        <div className="h-[380px] min-h-0 lg:h-auto lg:flex-1">
          <PriceChart def={def} quote={quotes[symbol]} contracts={open} />
        </div>
        <div className="border-t border-line bg-panel">
          <button onClick={() => setShowPos(!showPos)} className="flex w-full items-center justify-between px-3 py-1 text-[11px] text-muted hover:text-white lg:hidden">
            <span>Positions ({open.length})</span><span>{showPos ? "▾" : "▸"}</span>
          </button>
          <div className={`${showPos ? "block" : "hidden"} h-56 lg:block`}>
            <Positions compact />
          </div>
        </div>
      </section>
      <aside className="min-h-0 border-t border-line bg-panel lg:border-l lg:border-t-0">
        <TradePanel def={def} quote={quotes[symbol]} />
      </aside>
    </div>
  );
}
