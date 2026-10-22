// Browser-side market simulator + catalogue. Prices are SIMULATED (not real market data).
(function () {
  var SEC_YEAR = 31536000, ACCEL = 30, LONG = 120000, KAPPA = 1.5e-4;
  var M = [], MAP = {};

  function add(market, sub, id, name, base, digits, vol, kind, spikeN) {
    var m = { market: market, sub: sub, id: id, name: name, base: base, digits: digits, vol: vol, kind: kind || "real", spikeN: spikeN || 0, derived: market === "Derived" };
    m.sig = (vol / Math.sqrt(SEC_YEAR)) * ACCEL; // per-second (= per tick) log volatility
    M.push(m);
    MAP[id] = m;
  }

  // ---- Derived
  [["R_10", "Volatility 10 Index", 0.1, 6200, 3], ["R_25", "Volatility 25 Index", 0.25, 2150, 3], ["R_50", "Volatility 50 Index", 0.5, 252, 4], ["R_75", "Volatility 75 Index", 0.75, 46500, 4], ["R_100", "Volatility 100 Index", 1, 1020, 2],
   ["1HZ10V", "Volatility 10 (1s) Index", 0.1, 7210, 2], ["1HZ25V", "Volatility 25 (1s) Index", 0.25, 3480, 2], ["1HZ50V", "Volatility 50 (1s) Index", 0.5, 790, 2], ["1HZ75V", "Volatility 75 (1s) Index", 0.75, 410, 2], ["1HZ100V", "Volatility 100 (1s) Index", 1, 1105, 2]]
    .forEach(function (v) { add("Derived", "Continuous Indices", v[0], v[1], v[3], v[4], v[2], "vol"); });
  [300, 500, 1000].forEach(function (n) {
    add("Derived", "Crash/Boom Indices", "BOOM" + n, "Boom " + n + " Index", 9000 + n, 3, 0.3, "boom", n);
    add("Derived", "Crash/Boom Indices", "CRASH" + n, "Crash " + n + " Index", 8000 + n, 3, 0.3, "crash", n);
  });
  add("Derived", "Step Indices", "stpRNG", "Step Index", 9850, 1, 0.0565, "step");
  [10, 25, 50, 75, 100].forEach(function (v) { add("Derived", "Jump Indices", "JD" + v, "Jump " + v + " Index", 4000 + v * 20, 2, v / 100, "jump"); });

  // ---- Forex
  [["EURUSD", "EUR/USD", "Major Pairs", 1.085, 5, 0.07], ["GBPUSD", "GBP/USD", "Major Pairs", 1.27, 5, 0.085], ["USDJPY", "USD/JPY", "Major Pairs", 152.8, 3, 0.09], ["USDCHF", "USD/CHF", "Major Pairs", 0.905, 5, 0.07], ["AUDUSD", "AUD/USD", "Major Pairs", 0.66, 5, 0.095], ["USDCAD", "USD/CAD", "Major Pairs", 1.365, 5, 0.06], ["NZDUSD", "NZD/USD", "Major Pairs", 0.605, 5, 0.1],
   ["EURGBP", "EUR/GBP", "Minor Pairs", 0.854, 5, 0.06], ["EURJPY", "EUR/JPY", "Minor Pairs", 165.8, 3, 0.1], ["GBPJPY", "GBP/JPY", "Minor Pairs", 194.0, 3, 0.11], ["EURAUD", "EUR/AUD", "Minor Pairs", 1.645, 5, 0.08], ["AUDJPY", "AUD/JPY", "Minor Pairs", 100.9, 3, 0.11], ["EURCHF", "EUR/CHF", "Minor Pairs", 0.982, 5, 0.05], ["GBPAUD", "GBP/AUD", "Minor Pairs", 1.925, 5, 0.09], ["AUDCAD", "AUD/CAD", "Minor Pairs", 0.901, 5, 0.08],
   ["USDZAR", "USD/ZAR", "Exotic Pairs", 18.4, 4, 0.15], ["USDMXN", "USD/MXN", "Exotic Pairs", 17.1, 4, 0.14], ["USDSEK", "USD/SEK", "Exotic Pairs", 10.7, 4, 0.1], ["USDNOK", "USD/NOK", "Exotic Pairs", 10.9, 4, 0.1], ["USDTRY", "USD/TRY", "Exotic Pairs", 32.5, 4, 0.14]]
    .forEach(function (f) { add("Forex", f[2], "frx" + f[0], f[1], f[3], f[4], f[5]); });

  // ---- Stock indices
  [["OTC_SPC", "US 500", "Americas", 5150, 0.16], ["OTC_DJI", "Wall Street 30", "Americas", 38900, 0.14], ["OTC_NDX", "US Tech 100", "Americas", 18100, 0.2], ["OTC_FTSE", "UK 100", "Europe", 7950, 0.14], ["OTC_GDAXI", "Germany 40", "Europe", 18300, 0.16], ["OTC_FCHI", "France 40", "Europe", 8050, 0.16], ["OTC_SX5E", "Euro 50", "Europe", 5000, 0.16], ["OTC_N225", "Japan 225", "Asia / Oceania", 39400, 0.18], ["OTC_AS51", "Australia 200", "Asia / Oceania", 7700, 0.13], ["OTC_HSI", "Hong Kong 50", "Asia / Oceania", 16700, 0.24]]
    .forEach(function (i) { add("Stock Indices", i[2], i[0], i[1], i[3], 2, i[4]); });

  // ---- Commodities
  [["frxXAUUSD", "Gold/USD", "Metals", 2350, 2, 0.15], ["frxXAGUSD", "Silver/USD", "Metals", 28.5, 4, 0.28], ["frxXPDUSD", "Palladium/USD", "Metals", 1010, 2, 0.35], ["frxXPTUSD", "Platinum/USD", "Metals", 960, 2, 0.22], ["BROUSD", "Oil/USD (Brent)", "Energy", 84.5, 3, 0.35], ["WTIUSD", "Oil/USD (WTI)", "Energy", 80.2, 3, 0.35], ["NGSUSD", "Natural Gas/USD", "Energy", 2.1, 3, 0.55]]
    .forEach(function (c) { add("Commodities", c[2], c[0], c[1], c[3], c[4], c[5]); });

  // ---- Crypto
  [["BTC", 98000, 2, 0.55], ["ETH", 3400, 2, 0.65], ["LTC", 85, 2, 0.7], ["BCH", 480, 2, 0.7], ["BNB", 590, 2, 0.6], ["SOL", 165, 2, 0.9], ["XRP", 0.62, 4, 0.8], ["ADA", 0.58, 4, 0.85], ["DOGE", 0.16, 5, 0.95]]
    .forEach(function (c) { add("Cryptocurrencies", "Cryptocurrencies", "cry" + c[0] + "USD", c[0] + "/USD", c[1], c[2], c[3]); });

  // ---- Stocks
  [["AAPL", "Apple Inc.", "US Tech", 185.4, 0.28], ["MSFT", "Microsoft Corp.", "US Tech", 415, 0.26], ["GOOGL", "Alphabet Inc.", "US Tech", 150.3, 0.3], ["AMZN", "Amazon.com", "US Tech", 180.5, 0.32], ["META", "Meta Platforms", "US Tech", 495, 0.38], ["NVDA", "NVIDIA Corp.", "US Tech", 880, 0.55], ["TSLA", "Tesla Inc.", "US Tech", 175.2, 0.6], ["NFLX", "Netflix Inc.", "US Tech", 610, 0.4], ["KO", "Coca-Cola Co.", "US Consumer", 60, 0.15], ["MCD", "McDonald's Corp.", "US Consumer", 270, 0.17], ["DIS", "Walt Disney Co.", "US Consumer", 110, 0.28]]
    .forEach(function (s) { add("Stocks", s[2], "OTC_" + s[0], s[1], s[3], 2, s[4]); });

  // ---- math
  function gauss() { var u = 1 - Math.random(), v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function normCdf(x) {
    var t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp((-x * x) / 2);
    var p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - p : p;
  }
  function drift(m, p) { return -KAPPA * Math.log(p / m.base); }

  function stepOne(m) {
    m.prev = m.price;
    var r = drift(m, m.price) + m.sig * gauss();
    if (m.kind === "boom") { r -= 0.012 / m.spikeN; if (Math.random() < 1 / m.spikeN) r += 0.012 * (0.6 + 0.8 * Math.random()); }
    if (m.kind === "crash") { r += 0.012 / m.spikeN; if (Math.random() < 1 / m.spikeN) r -= 0.012 * (0.6 + 0.8 * Math.random()); }
    if (m.kind === "jump" && Math.random() < 1 / 600) r += (Math.random() < 0.5 ? -1 : 1) * m.sig * 25;
    var p = m.price * Math.exp(r);
    p = +p.toFixed(m.kind === "step" ? 1 : m.digits);
    m.price = p > 0 ? p : m.prev;
    m.hist.push(m.price);
    m.lastT = Math.floor(Date.now() / 1000);
    var cap = m.long ? LONG + 3000 : 3000;
    if (m.hist.length > cap) m.hist.splice(0, 3000);
    return m.price;
  }

  function backfill(m, n) {
    var arr = [m.price], p = m.price;
    for (var i = 1; i < n; i++) { p = p * Math.exp(drift(m, p) + m.sig * gauss()); arr.push(+p.toFixed(m.digits)); }
    m.hist = arr.reverse();
  }
  function ensureLong(m) {
    if (m.long) return;
    var need = LONG - m.hist.length, p = m.hist[0], back = new Array(need);
    for (var i = need - 1; i >= 0; i--) { p = p * Math.exp(drift(m, p) + m.sig * gauss()); back[i] = +p.toFixed(m.digits); }
    m.hist = back.concat(m.hist);
    m.long = true;
  }

  // ---- init (prices persist across page loads)
  var stored = {};
  try { stored = JSON.parse(localStorage.getItem("arena_prices_v2")) || {}; } catch (e) {}
  var day = new Date().toISOString().slice(0, 10), nowSec = Math.floor(Date.now() / 1000);
  M.forEach(function (m) {
    var s = stored[m.id];
    m.price = s && s[0] > 0 ? s[0] : +(m.base * (1 + (Math.random() - 0.5) * 0.02)).toFixed(m.digits);
    m.prev = m.price; m.lastT = nowSec;
    backfill(m, 600);
    m.open = s && s[2] === day && s[1] > 0 ? s[1] : m.hist[0];
  });
  function persist() {
    var o = {};
    M.forEach(function (m) { o[m.id] = [m.price, m.open, day]; });
    try { localStorage.setItem("arena_prices_v2", JSON.stringify(o)); } catch (e) {}
  }
  window.addEventListener("beforeunload", persist);
  setInterval(persist, 5000);

  // ---- candles from tick history (1 tick = 1 second)
  function candles(m, g, count) {
    ensureLong(m);
    var len = m.hist.length, need = Math.min(len, count * g + g), start = len - need, out = [], cur = null;
    for (var i = start; i < len; i++) {
      var t = m.lastT - (len - 1 - i), b = Math.floor(t / g) * g, p = m.hist[i];
      if (!cur || cur.time !== b) { cur = { time: b, open: p, high: p, low: p, close: p }; out.push(cur); }
      else { if (p > cur.high) cur.high = p; if (p < cur.low) cur.low = p; cur.close = p; }
    }
    return out.slice(-count);
  }

  // ---- contract catalogue
  var CATEGORIES = [
    { id: "updown", name: "Rise/Fall", desc: "Predict whether the exit spot is higher or lower than the entry spot.", sides: [{ type: "CALL", label: "Rise", color: "up" }, { type: "PUT", label: "Fall", color: "down" }] },
    { id: "highlow", name: "Higher/Lower", desc: "Win if the exit spot is strictly higher/lower than your barrier.", sides: [{ type: "HIGHER", label: "Higher", color: "up" }, { type: "LOWER", label: "Lower", color: "down" }] },
    { id: "touch", name: "Touch/No Touch", desc: "Win if the market touches (or never touches) your barrier before expiry.", sides: [{ type: "TOUCH", label: "Touch", color: "up" }, { type: "NOTOUCH", label: "No Touch", color: "down" }] },
    { id: "matchdiff", name: "Matches/Differs", desc: "Predict whether the last digit of the exit spot matches your digit.", sides: [{ type: "DIGITMATCH", label: "Matches", color: "up" }, { type: "DIGITDIFF", label: "Differs", color: "down" }] },
    { id: "evenodd", name: "Even/Odd", desc: "Predict whether the last digit of the exit spot is even or odd.", sides: [{ type: "DIGITEVEN", label: "Even", color: "up" }, { type: "DIGITODD", label: "Odd", color: "down" }] },
    { id: "overunder", name: "Over/Under", desc: "Predict whether the last digit is over or under your prediction.", sides: [{ type: "DIGITOVER", label: "Over", color: "up" }, { type: "DIGITUNDER", label: "Under", color: "down" }] },
    { id: "accumulator", name: "Accumulators", desc: "Your stake grows every tick the market stays inside the barriers. Cash out any time.", sides: [{ type: "ACCU", label: "Buy", color: "up" }] },
    { id: "multiplier", name: "Multipliers", desc: "Amplify your profit with a multiplier. Your loss is capped at your stake.", sides: [{ type: "MULTUP", label: "Up", color: "up" }, { type: "MULTDOWN", label: "Down", color: "down" }] }
  ];
  var CAT = {}, TYPE_LABEL = { ACCU: "Accumulator", MULTUP: "Multiplier Up", MULTDOWN: "Multiplier Down" }, TYPE_CAT = {};
  CATEGORIES.forEach(function (c) { CAT[c.id] = c; c.sides.forEach(function (s) { TYPE_CAT[s.type] = c.id; if (!TYPE_LABEL[s.type]) TYPE_LABEL[s.type] = s.label; }); });
  function categoriesFor(m) {
    var o = ["updown", "highlow", "touch"];
    if (m.kind === "vol" || m.kind === "jump") o.push("matchdiff", "evenodd", "overunder");
    if (m.kind === "vol" || m.kind === "real") o.push("accumulator");
    o.push("multiplier");
    return o;
  }
  function multipliersFor(m) { return m.derived ? [20, 50, 100, 200, 400] : m.market === "Cryptocurrencies" ? [5, 10, 20, 30, 50] : [10, 20, 30, 50, 100]; }

  window.ARENA = {
    markets: M, byId: function (id) { return MAP[id]; }, step: stepOne,
    tickAll: function () { M.forEach(stepOne); }, ensureLong: ensureLong, candles: candles, persist: persist, normCdf: normCdf,
    fmt: function (m, p) { return Number(p).toLocaleString("en-US", { minimumFractionDigits: m.digits, maximumFractionDigits: m.digits }); },
    chg: function (m) { return ((m.price - m.open) / m.open) * 100; },
    CATEGORIES: CATEGORIES, CAT: CAT, TYPE_LABEL: TYPE_LABEL, TYPE_CAT: TYPE_CAT, categoriesFor: categoriesFor, multipliersFor: multipliersFor,
    GROWTH_RATES: [0.01, 0.02, 0.03, 0.04, 0.05], ACCU_C: { "0.01": 2.55, "0.02": 2.3, "0.03": 2.15, "0.04": 2.04, "0.05": 1.95 },
    GROUPS: ["Derived", "Forex", "Stock Indices", "Commodities", "Cryptocurrencies", "Stocks"]
  };
})();
