// Shared (client + server) market catalog. Contains NO price generation logic.

export type MarketId = "derived" | "forex" | "indices" | "commodities" | "crypto" | "stocks";
export type Kind = "vol" | "boom" | "crash" | "step" | "jump" | "real";

export interface SymbolDef {
  id: string;
  name: string;
  market: MarketId;
  sub: string;
  kind: Kind;
  base: number;
  digits: number;
  vol: number; // annualised volatility (log)
  interval: number; // seconds per tick
  spikeN?: number; // average ticks between spikes
}

export const MARKETS: { id: MarketId; name: string; icon: string }[] = [
  { id: "derived", name: "Derived", icon: "◈" },
  { id: "forex", name: "Forex", icon: "€" },
  { id: "indices", name: "Stock Indices", icon: "▤" },
  { id: "commodities", name: "Commodities", icon: "◉" },
  { id: "crypto", name: "Cryptocurrencies", icon: "₿" },
  { id: "stocks", name: "Stocks", icon: "▲" },
];

const S: SymbolDef[] = [];
const add = (d: Omit<SymbolDef, "interval" | "kind"> & { interval?: number; kind?: Kind }) =>
  S.push({ interval: 1, kind: "real", ...d });

// ---- Derived: Volatility
const vols: [string, string, number, number, number, number][] = [
  ["R_10", "Volatility 10 Index", 0.1, 6200, 3, 2],
  ["R_25", "Volatility 25 Index", 0.25, 2150, 3, 2],
  ["R_50", "Volatility 50 Index", 0.5, 252, 4, 2],
  ["R_75", "Volatility 75 Index", 0.75, 46500, 4, 2],
  ["R_100", "Volatility 100 Index", 1, 1020, 2, 2],
  ["1HZ10V", "Volatility 10 (1s) Index", 0.1, 7210, 2, 1],
  ["1HZ25V", "Volatility 25 (1s) Index", 0.25, 3480, 2, 1],
  ["1HZ50V", "Volatility 50 (1s) Index", 0.5, 790, 2, 1],
  ["1HZ75V", "Volatility 75 (1s) Index", 0.75, 410, 2, 1],
  ["1HZ100V", "Volatility 100 (1s) Index", 1, 1105, 2, 1],
];
for (const [id, name, vol, base, digits, interval] of vols)
  add({ id, name, market: "derived", sub: "Continuous Indices", kind: "vol", base, digits, vol, interval });

// ---- Derived: Crash / Boom
for (const n of [300, 500, 1000]) {
  add({ id: `BOOM${n}`, name: `Boom ${n} Index`, market: "derived", sub: "Crash/Boom Indices", kind: "boom", base: 9000 + n, digits: 3, vol: 0.3, spikeN: n });
  add({ id: `CRASH${n}`, name: `Crash ${n} Index`, market: "derived", sub: "Crash/Boom Indices", kind: "crash", base: 8000 + n, digits: 3, vol: 0.3, spikeN: n });
}
// ---- Derived: Step
add({ id: "stpRNG", name: "Step Index", market: "derived", sub: "Step Indices", kind: "step", base: 9850, digits: 1, vol: 0.0565 });
// ---- Derived: Jump
for (const v of [10, 25, 50, 75, 100])
  add({ id: `JD${v}`, name: `Jump ${v} Index`, market: "derived", sub: "Jump Indices", kind: "jump", base: 4000 + v * 20, digits: 2, vol: v / 100, spikeN: 1200 });

// ---- Forex
const fx: [string, string, string, number, number, number][] = [
  ["EURUSD", "EUR/USD", "Major Pairs", 1.085, 5, 0.07],
  ["GBPUSD", "GBP/USD", "Major Pairs", 1.27, 5, 0.085],
  ["USDJPY", "USD/JPY", "Major Pairs", 152.8, 3, 0.09],
  ["USDCHF", "USD/CHF", "Major Pairs", 0.905, 5, 0.07],
  ["AUDUSD", "AUD/USD", "Major Pairs", 0.66, 5, 0.095],
  ["USDCAD", "USD/CAD", "Major Pairs", 1.365, 5, 0.06],
  ["NZDUSD", "NZD/USD", "Major Pairs", 0.605, 5, 0.1],
  ["EURGBP", "EUR/GBP", "Minor Pairs", 0.854, 5, 0.06],
  ["EURJPY", "EUR/JPY", "Minor Pairs", 165.8, 3, 0.1],
  ["GBPJPY", "GBP/JPY", "Minor Pairs", 194.0, 3, 0.11],
  ["EURAUD", "EUR/AUD", "Minor Pairs", 1.645, 5, 0.08],
  ["AUDJPY", "AUD/JPY", "Minor Pairs", 100.9, 3, 0.11],
  ["EURCHF", "EUR/CHF", "Minor Pairs", 0.982, 5, 0.05],
  ["GBPAUD", "GBP/AUD", "Minor Pairs", 1.925, 5, 0.09],
  ["AUDCAD", "AUD/CAD", "Minor Pairs", 0.901, 5, 0.08],
  ["USDZAR", "USD/ZAR", "Exotic Pairs", 18.4, 4, 0.15],
  ["USDMXN", "USD/MXN", "Exotic Pairs", 17.1, 4, 0.14],
  ["USDSEK", "USD/SEK", "Exotic Pairs", 10.7, 4, 0.1],
  ["USDNOK", "USD/NOK", "Exotic Pairs", 10.9, 4, 0.1],
  ["USDTRY", "USD/TRY", "Exotic Pairs", 32.5, 4, 0.14],
];
for (const [id, name, sub, base, digits, vol] of fx)
  add({ id: `frx${id}`, name, market: "forex", sub, base, digits, vol });

// ---- Indices
const idx: [string, string, number, number][] = [
  ["OTC_SPC", "US 500", 5150, 0.16],
  ["OTC_DJI", "Wall Street 30", 38900, 0.14],
  ["OTC_NDX", "US Tech 100", 18100, 0.2],
  ["OTC_FTSE", "UK 100", 7950, 0.14],
  ["OTC_GDAXI", "Germany 40", 18300, 0.16],
  ["OTC_FCHI", "France 40", 8050, 0.16],
  ["OTC_N225", "Japan 225", 39400, 0.18],
  ["OTC_AS51", "Australia 200", 7700, 0.13],
  ["OTC_HSI", "Hong Kong 50", 16700, 0.24],
  ["OTC_SX5E", "Euro 50", 5000, 0.16],
];
for (const [id, name, base, vol] of idx)
  add({ id, name, market: "indices", sub: id.includes("SPC") || id.includes("DJI") || id.includes("NDX") ? "Americas" : id.includes("N225") || id.includes("AS51") || id.includes("HSI") ? "Asia / Oceania" : "Europe", base, digits: 2, vol });

// ---- Commodities
const cm: [string, string, string, number, number, number][] = [
  ["frxXAUUSD", "Gold/USD", "Metals", 2350, 2, 0.15],
  ["frxXAGUSD", "Silver/USD", "Metals", 28.5, 4, 0.28],
  ["frxXPDUSD", "Palladium/USD", "Metals", 1010, 2, 0.35],
  ["frxXPTUSD", "Platinum/USD", "Metals", 960, 2, 0.22],
  ["BROUSD", "Oil/USD (Brent)", "Energy", 84.5, 3, 0.35],
  ["WTIUSD", "Oil/USD (WTI)", "Energy", 80.2, 3, 0.35],
  ["NGSUSD", "Natural Gas/USD", "Energy", 2.1, 3, 0.55],
];
for (const [id, name, sub, base, digits, vol] of cm) add({ id, name, market: "commodities", sub, base, digits, vol });

// ---- Crypto
const cr: [string, string, number, number, number][] = [
  ["cryBTCUSD", "BTC/USD", 98000, 2, 0.55],
  ["cryETHUSD", "ETH/USD", 3400, 2, 0.65],
  ["cryLTCUSD", "LTC/USD", 85, 2, 0.7],
  ["cryBCHUSD", "BCH/USD", 480, 2, 0.7],
  ["cryBNBUSD", "BNB/USD", 590, 2, 0.6],
  ["crySOLUSD", "SOL/USD", 165, 2, 0.9],
  ["cryXRPUSD", "XRP/USD", 0.62, 4, 0.8],
  ["cryADAUSD", "ADA/USD", 0.58, 4, 0.85],
  ["cryDOGEUSD", "DOGE/USD", 0.16, 5, 0.95],
];
for (const [id, name, base, digits, vol] of cr) add({ id, name, market: "crypto", sub: "Cryptocurrencies", base, digits, vol });

// ---- Stocks
const st: [string, string, string, number, number][] = [
  ["AAPL", "Apple Inc.", "US Tech", 185.4, 0.28],
  ["MSFT", "Microsoft Corp.", "US Tech", 415, 0.26],
  ["GOOGL", "Alphabet Inc.", "US Tech", 150.3, 0.3],
  ["AMZN", "Amazon.com", "US Tech", 180.5, 0.32],
  ["META", "Meta Platforms", "US Tech", 495, 0.38],
  ["NVDA", "NVIDIA Corp.", "US Tech", 880, 0.55],
  ["TSLA", "Tesla Inc.", "US Tech", 175.2, 0.6],
  ["NFLX", "Netflix Inc.", "US Tech", 610, 0.4],
  ["KO", "Coca-Cola Co.", "US Consumer", 60, 0.15],
  ["MCD", "McDonald's Corp.", "US Consumer", 270, 0.17],
  ["DIS", "Walt Disney Co.", "US Consumer", 110, 0.28],
];
for (const [id, name, sub, base, vol] of st) add({ id: `OTC_${id}`, name, market: "stocks", sub, base, digits: 2, vol });

export const SYMBOLS: SymbolDef[] = S;
export const SYMBOL_MAP: Record<string, SymbolDef> = Object.fromEntries(S.map((s) => [s.id, s]));
export const DEFAULT_SYMBOL = "R_100";

export function getSymbol(id: string): SymbolDef | undefined {
  return SYMBOL_MAP[id];
}

// ---- Contract catalogue (shared metadata)
export type Category =
  | "updown"
  | "highlow"
  | "touch"
  | "matchdiff"
  | "evenodd"
  | "overunder"
  | "accumulator"
  | "multiplier";

export interface CategoryInfo {
  id: Category;
  name: string;
  desc: string;
  sides: { type: string; label: string; color: "green" | "red" }[];
}

export const CATEGORIES: CategoryInfo[] = [
  { id: "updown", name: "Rise/Fall", desc: "Predict whether the exit spot is higher or lower than the entry spot.", sides: [{ type: "CALL", label: "Rise", color: "green" }, { type: "PUT", label: "Fall", color: "red" }] },
  { id: "highlow", name: "Higher/Lower", desc: "Win if the exit spot is strictly higher/lower than your barrier.", sides: [{ type: "HIGHER", label: "Higher", color: "green" }, { type: "LOWER", label: "Lower", color: "red" }] },
  { id: "touch", name: "Touch/No Touch", desc: "Win if the market touches (or never touches) your barrier before expiry.", sides: [{ type: "TOUCH", label: "Touch", color: "green" }, { type: "NOTOUCH", label: "No Touch", color: "red" }] },
  { id: "matchdiff", name: "Matches/Differs", desc: "Predict whether the last digit of the exit spot matches your digit.", sides: [{ type: "DIGITMATCH", label: "Matches", color: "green" }, { type: "DIGITDIFF", label: "Differs", color: "red" }] },
  { id: "evenodd", name: "Even/Odd", desc: "Predict whether the last digit of the exit spot is even or odd.", sides: [{ type: "DIGITEVEN", label: "Even", color: "green" }, { type: "DIGITODD", label: "Odd", color: "red" }] },
  { id: "overunder", name: "Over/Under", desc: "Predict whether the last digit is over or under your prediction.", sides: [{ type: "DIGITOVER", label: "Over", color: "green" }, { type: "DIGITUNDER", label: "Under", color: "red" }] },
  { id: "accumulator", name: "Accumulators", desc: "Your stake grows every tick the market stays inside the barriers. Cash out any time.", sides: [{ type: "ACCU", label: "Buy", color: "green" }] },
  { id: "multiplier", name: "Multipliers", desc: "Amplify your profit with a multiplier. Your loss is capped at your stake.", sides: [{ type: "MULTUP", label: "Up", color: "green" }, { type: "MULTDOWN", label: "Down", color: "red" }] },
];

export const CATEGORY_MAP: Record<string, CategoryInfo> = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

export const TYPE_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORIES.flatMap((c) => c.sides.map((s) => [s.type, s.label])),
);
TYPE_LABELS.ACCU = "Accumulator";
TYPE_LABELS.MULTUP = "Multiplier Up";
TYPE_LABELS.MULTDOWN = "Multiplier Down";

export function categoriesFor(def: SymbolDef): Category[] {
  const out: Category[] = ["updown", "highlow", "touch"];
  if (def.kind === "vol" || def.kind === "jump") out.push("matchdiff", "evenodd", "overunder");
  if (def.kind === "vol" || def.kind === "real") out.push("accumulator");
  out.push("multiplier");
  return out;
}

export function ticksAllowed(def: SymbolDef): boolean {
  return def.market === "derived";
}

export function multipliersFor(def: SymbolDef): number[] {
  return def.market === "derived" ? [20, 50, 100, 200, 400] : def.market === "crypto" ? [5, 10, 20, 30, 50] : [10, 20, 30, 50, 100];
}

export const GROWTH_RATES = [0.01, 0.02, 0.03, 0.04, 0.05];

export const MIN_STAKE = 0.35;
export const MAX_STAKE = 5000;
