import { ApiError } from "@/lib/auth";
import { getSymbol } from "@/lib/catalog";
import { candles, history } from "@/lib/engine";
import { json, open } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = open(async ({ req, params }) => {
  const def = getSymbol(params.symbol);
  if (!def) throw new ApiError("Unknown market", 404);
  const url = new URL(req.url);
  const g = Number(url.searchParams.get("granularity") ?? 0);
  const count = Number(url.searchParams.get("count") ?? 300);
  if (!g) return json({ symbol: def.id, granularity: 0, ticks: history(def, count) });
  if (![60, 120, 300, 900, 3600, 14400, 86400].includes(g)) throw new ApiError("Unsupported granularity");
  return json({ symbol: def.id, granularity: g, candles: candles(def, g, count) });
});
