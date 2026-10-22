// Trading terminal view
(function () {
  "use strict";
  var A = window.ARENA, S = window.STORE, UI = window.UI, $ = UI.$, esc = UI.esc, usd = UI.usd;
  var FRAMES = [["Ticks", 0], ["1m", 60], ["2m", 120], ["5m", 300], ["15m", 900], ["1h", 3600]];
  var RANGE = { t: [1, 10], s: [15, 3600], m: [1, 1440], h: [1, 24], d: [1, 30] };
  var UNITS = { t: "Ticks", s: "Seconds", m: "Minutes", h: "Hours", d: "Days" };
  var saved = {}; try { saved = JSON.parse(localStorage.getItem("arena_ui_v2")) || {}; } catch (e) {}
  var T = { sym: saved.sym && A.byId(saved.sym) ? saved.sym : "R_100", frame: saved.frame || 0, style: saved.style || "candle", inds: saved.inds || {}, cat: "updown", unit: "t", dur: 5, stake: "10", offset: "", digit: 5, growth: 0.01, mult: null, useTp: false, tp: "10", useSl: false, sl: "5", mtab: "Derived", search: "" };
  var mouse = null, lastList = 0, posSig = "";
  var saveUi = function () { try { localStorage.setItem("arena_ui_v2", JSON.stringify({ sym: T.sym, frame: T.frame, style: T.style, inds: T.inds })); } catch (e) {} };
  var M = function () { return A.byId(T.sym); };

  // ---------- helpers shared with reports
  UI.describe = function (c) {
    if (c.barrier != null && (c.cat === "highlow" || c.cat === "touch")) return "Barrier " + A.fmt({ digits: c.digits }, c.barrier);
    if (c.digit != null && (c.cat === "matchdiff" || c.cat === "overunder")) return "Digit " + c.digit;
    if (c.cat === "accumulator") return "Growth " + Math.round(c.g * 100) + "%" + (c.tp ? " · TP " + usd(c.tp) : "");
    if (c.cat === "multiplier") return "x" + c.mult + (c.tp ? " · TP " + usd(c.tp) : "") + (c.sl ? " · SL " + usd(c.sl) : "");
    return c.label || "";
  };
  UI.remaining = function (c, v) {
    if (c.cat === "accumulator") return c.k + " ticks";
    if (c.cat === "multiplier") return "Open";
    var s = Math.max(0, Math.ceil(v.left));
    if (c.unit === "t") return s + " ticks left";
    var d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    return d > 0 ? d + "d " + h + "h" : h > 0 ? h + "h " + m + "m" : m + ":" + ("0" + (s % 60)).slice(-2);
  };
  UI.positions = function (root, compact) {
    var sig = "";
    function build(list) {
      sig = list.map(function (c) { return c.id; }).join(",");
      root.innerHTML = '<div class="phead"><b>Open positions <span class="chip">' + list.length + '</span></b><span><b class="num" id="ptotal"></b> <a href="#/reports" class="brandlink">All reports →</a></span></div><div class="pbody">' +
        (list.length ? '<table><thead><tr><th>ID</th><th>Market</th><th>Type</th>' + (compact ? "" : "<th>Details</th>") + "<th>Stake</th><th>Entry</th><th>Current</th><th>Time / ticks</th><th>P/L</th><th></th></tr></thead><tbody>" +
          list.map(function (c) { return '<tr data-id="' + c.id + '"><td class="muted num">#' + c.id + "</td><td><b>" + esc(c.name) + '</b></td><td><span class="chip">' + A.TYPE_LABEL[c.type] + "</span></td>" + (compact ? "" : '<td class="muted">' + esc(UI.describe(c)) + "</td>") + '<td class="num">' + usd(c.stake) + '</td><td class="num">' + A.fmt({ digits: c.digits }, c.entry) + '</td><td class="num" data-f="spot"></td><td class="num" data-f="time"></td><td class="num" data-f="pl"></td><td><button class="btn btn-ghost sm" data-sell="' + c.id + '" hidden></button><span class="muted small" data-f="ns"></span></td></tr>'; }).join("") + "</tbody></table>"
          : '<div class="empty">No open positions on your ' + S.active().type + " account. Place a trade and it will appear here in real time.</div>") + "</div>";
    }
    function update() {
      var list = S.openContracts(), s = list.map(function (c) { return c.id; }).join(",");
      if (s !== sig) build(list);
      var total = 0;
      list.forEach(function (c) {
        var row = root.querySelector('tr[data-id="' + c.id + '"]'); if (!row) return;
        var v = S.view(c); total += v.profit;
        row.querySelector('[data-f="spot"]').textContent = A.fmt({ digits: c.digits }, v.spot);
        row.querySelector('[data-f="time"]').textContent = UI.remaining(c, v);
        var pl = row.querySelector('[data-f="pl"]'); pl.textContent = usd(v.profit, true); pl.className = "num " + (v.profit >= 0 ? "up" : "down");
        var b = row.querySelector("[data-sell]"); b.hidden = !v.sellable; b.textContent = "Cash out " + usd(v.value);
        row.querySelector('[data-f="ns"]').textContent = v.sellable || c.cat === "accumulator" || c.cat === "multiplier" ? "" : "Not sellable";
      });
      var pt = root.querySelector("#ptotal"); if (pt) { pt.textContent = list.length ? "Total P/L " + usd(total, true) : ""; pt.className = "num " + (total >= 0 ? "up" : "down"); }
    }
    root.onclick = function (e) {
      var b = e.target.closest("[data-sell]"); if (!b) return;
      try { var c = S.sell(+b.dataset.sell); UI.toast(c.profit >= 0 ? "success" : "info", "Cashed out #" + c.id, "Received " + usd(c.sellPrice) + " · P/L " + usd(c.profit, true)); update(); UI.updateHeader(); } catch (x) { UI.toast("error", "Could not cash out", x.message); }
    };
    sig = "__"; update(); return update;
  };

  // ---------- market list
  function renderList() {
    var host = $("#mrows"); if (!host) return;
    var term = T.search.trim().toLowerCase(), u = S.user();
    var list = A.markets.filter(function (m) { return term ? m.name.toLowerCase().indexOf(term) >= 0 || m.id.toLowerCase().indexOf(term) >= 0 : T.mtab === "Favs" ? u.favs.indexOf(m.id) >= 0 : m.market === T.mtab; });
    var html = "", g = "";
    list.forEach(function (m) {
      var key = term ? m.market : m.sub; if (key !== g) { g = key; html += '<div class="grp">' + esc(g) + "</div>"; }
      var c = A.chg(m);
      html += '<div class="mk' + (m.id === T.sym ? " on" : "") + '" data-id="' + m.id + '"><button class="star' + (u.favs.indexOf(m.id) >= 0 ? " on" : "") + '" data-fav="' + m.id + '">' + (u.favs.indexOf(m.id) >= 0 ? "★" : "☆") + '</button><div style="flex:1;min-width:0"><div class="ell">' + esc(m.name) + "</div><small>" + m.id + '</small></div><div class="r num"><div class="' + (m.price >= m.prev ? "up" : "down") + '">' + A.fmt(m, m.price) + '</div><small class="' + (c >= 0 ? "up" : "down") + '">' + (c >= 0 ? "+" : "") + c.toFixed(2) + "%</small></div></div>";
    });
    var top = host.scrollTop; host.innerHTML = html || '<div class="empty">' + (T.mtab === "Favs" ? "Tap the ☆ next to a market to add it to your favourites." : "No markets found.") + "</div>"; host.scrollTop = top;
  }
  function renderTabs() {
    $("#mtabs").innerHTML = ["Favs"].concat(A.GROUPS).map(function (g) { return '<button class="' + (T.mtab === g && !T.search ? "on" : "") + '" data-tab="' + g + '">' + (g === "Favs" ? "★ Favs" : g) + "</button>"; }).join("");
  }

  // ---------- chart
  function sma(v, n) { var o = [], s = 0; for (var i = 0; i < v.length; i++) { s += v[i]; if (i >= n) s -= v[i - n]; o.push(i >= n - 1 ? s / n : null); } return o; }
  function ema(v, n) { var k = 2 / (n + 1), o = [], p = null; for (var i = 0; i < v.length; i++) { if (i < n - 1) { o.push(null); continue; } if (p === null) { p = 0; for (var j = 0; j < n; j++) p += v[j]; p /= n; } else p = v[i] * k + p * (1 - k); o.push(p); } return o; }
  function bb(v, n, mu) { var mid = sma(v, n), up = [], lo = []; for (var i = 0; i < v.length; i++) { if (mid[i] === null) { up.push(null); lo.push(null); continue; } var s = 0; for (var j = i - n + 1; j <= i; j++) s += Math.pow(v[j] - mid[i], 2); var sd = Math.sqrt(s / n); up.push(mid[i] + mu * sd); lo.push(mid[i] - mu * sd); } return { mid: mid, up: up, lo: lo }; }

  function drawChart() {
    var cv = $("#cv"); if (!cv || !cv.getContext) return; var ctx = cv.getContext("2d"); if (!ctx) return;
    var m = M(), w = cv.clientWidth, h = cv.clientHeight, dpr = window.devicePixelRatio || 1; if (!w || !h) return;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    var pts = [], isTick = T.frame === 0;
    if (isTick) { var hh = m.hist, n0 = Math.min(hh.length, 160); for (var i = hh.length - n0; i < hh.length; i++) pts.push({ t: m.lastT - (hh.length - 1 - i), c: hh[i], o: hh[i], h: hh[i], l: hh[i] }); }
    else pts = A.candles(m, T.frame, 100).map(function (c) { return { t: c.time, o: c.open, h: c.high, l: c.low, c: c.close }; });
    var n = pts.length; if (!n) return;
    var padR = 80, padT = 14, padB = 22, cw = w - padR, ch = h - padT - padB;
    var lo = Infinity, hi = -Infinity; pts.forEach(function (p) { if (p.l < lo) lo = p.l; if (p.h > hi) hi = p.h; });
    var lines = [];
    S.openContracts().filter(function (c) { return c.sym === m.id; }).forEach(function (c) {
      var v = S.view(c); lines.push([c.entry, "#2f8cff", "#" + c.id + " entry"]);
      if (c.barrier) lines.push([c.barrier, "#f5a524", "#" + c.id + " barrier"]);
      if (c.cat === "accumulator") { lines.push([v.barHi, "#00c390", "#" + c.id + " upper"]); lines.push([v.barLo, "#ff444f", "#" + c.id + " lower"]); }
      if (c.cat === "multiplier") { var dir = c.type === "MULTUP" ? 1 : -1; lines.push([c.entry * (1 - (dir * (c.stake - c.comm)) / (c.stake * c.mult)), "#ff444f", "#" + c.id + " stop-out"]); }
    });
    var span0 = hi - lo || 1; lines.forEach(function (l) { if (l[0] > lo - span0 * 3 && l[0] < hi + span0 * 3) { lo = Math.min(lo, l[0]); hi = Math.max(hi, l[0]); } });
    if (hi === lo) { hi += 1; lo -= 1; } var pad = (hi - lo) * 0.1; hi += pad; lo -= pad;
    var y = function (p) { return padT + ((hi - p) / (hi - lo)) * ch; };
    var slot = (cw - 14) / n, x = function (i) { return isTick ? (i / Math.max(1, n - 1)) * (cw - 14) : (i + 0.5) * slot; };
    ctx.font = "11px system-ui"; ctx.lineWidth = 1; ctx.strokeStyle = "#131b25"; ctx.fillStyle = "#6a7a8e";
    for (var g = 0; g <= 5; g++) { var pv = lo + ((hi - lo) * g) / 5, yy = y(pv); ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(cw, yy); ctx.stroke(); ctx.fillText(A.fmt(m, pv), cw + 8, yy + 4); }
    for (var k = 0; k < 5; k++) { var idx = Math.round((k / 4) * (n - 1)), tt = new Date(pts[idx].t * 1000).toISOString(); ctx.fillText(T.frame <= 120 ? tt.slice(11, 19) : tt.slice(5, 16).replace("T", " "), Math.min(Math.max(x(idx) - 22, 2), cw - 60), h - 6); }
    var closes = pts.map(function (p) { return p.c; });
    if (isTick || T.style === "line") {
      ctx.beginPath(); pts.forEach(function (p, i) { i ? ctx.lineTo(x(i), y(p.c)) : ctx.moveTo(x(i), y(p.c)); }); ctx.strokeStyle = "#2f8cff"; ctx.lineWidth = 2; ctx.stroke();
      if (isTick) { var gr = ctx.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "rgba(47,140,255,.28)"); gr.addColorStop(1, "rgba(47,140,255,0)"); ctx.lineTo(x(n - 1), padT + ch); ctx.lineTo(0, padT + ch); ctx.closePath(); ctx.fillStyle = gr; ctx.fill(); }
    } else {
      pts.forEach(function (p, i) { var up = p.c >= p.o, col = up ? "#00c390" : "#ff444f", bw = Math.max(1, slot * 0.7); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x(i), y(p.h)); ctx.lineTo(x(i), y(p.l)); ctx.stroke(); var t0 = y(Math.max(p.o, p.c)), t1 = y(Math.min(p.o, p.c)); ctx.fillRect(x(i) - bw / 2, t0, bw, Math.max(1, t1 - t0)); });
    }
    function ln(arr, col, dash) { ctx.beginPath(); var st = false; arr.forEach(function (v, i) { if (v === null) return; st ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v)); st = true; }); ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.setLineDash(dash ? [4, 3] : []); ctx.stroke(); ctx.setLineDash([]); }
    if (T.inds.sma) ln(sma(closes, 20), "#f5a524"); if (T.inds.ema) ln(ema(closes, 20), "#c084fc");
    if (T.inds.bb) { var b = bb(closes, 20, 2); ln(b.up, "#5b7ea6", true); ln(b.mid, "#5b7ea6"); ln(b.lo, "#5b7ea6", true); }
    lines.forEach(function (l) { var yy = y(l[0]); if (yy < padT - 4 || yy > padT + ch + 4) return; ctx.setLineDash([5, 4]); ctx.strokeStyle = l[1]; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(cw, yy); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = l[1]; ctx.fillText(l[2], 6, yy - 4); });
    var last = pts[n - 1].c, ly = y(last), up2 = last >= m.prev; ctx.fillStyle = up2 ? "#00c390" : "#ff444f"; ctx.fillRect(cw + 2, ly - 9, padR - 4, 18); ctx.fillStyle = "#03130e"; ctx.font = "bold 11px system-ui"; ctx.fillText(A.fmt(m, last), cw + 6, ly + 4);
    if (mouse && mouse.x < cw && mouse.y > padT && mouse.y < padT + ch) {
      ctx.setLineDash([3, 3]); ctx.strokeStyle = "#5b6b80"; ctx.beginPath(); ctx.moveTo(mouse.x, padT); ctx.lineTo(mouse.x, padT + ch); ctx.moveTo(0, mouse.y); ctx.lineTo(cw, mouse.y); ctx.stroke(); ctx.setLineDash([]);
      var pv2 = hi - ((mouse.y - padT) / ch) * (hi - lo); ctx.fillStyle = "#243040"; ctx.fillRect(cw + 2, mouse.y - 9, padR - 4, 18); ctx.fillStyle = "#e6edf5"; ctx.font = "11px system-ui"; ctx.fillText(A.fmt(m, pv2), cw + 6, mouse.y + 4);
    }
  }

  // ---------- ticket
  function isDigitCat() { return T.cat === "matchdiff" || T.cat === "evenodd" || T.cat === "overunder"; }
  function normalize() {
    var m = M(), cats = A.categoriesFor(m);
    if (cats.indexOf(T.cat) < 0) T.cat = "updown";
    var ms = A.multipliersFor(m); if (ms.indexOf(T.mult) < 0) T.mult = ms[1] || ms[0];
    if (T.unit === "t" && !m.derived) { T.unit = "m"; T.dur = 1; }
    if (isDigitCat()) { T.unit = "t"; if (T.dur > 10) T.dur = 5; }
    if ((T.cat === "highlow" || T.cat === "touch") && T.unit === "t" && T.dur < 2) T.dur = 5;
  }
  function req() {
    return { symbol: T.sym, category: T.cat, stake: +T.stake, durationUnit: T.unit, duration: +T.dur, barrierOffset: T.offset === "" ? undefined : +T.offset, digit: T.digit, growthRate: T.growth, multiplier: T.mult, takeProfit: T.useTp ? +T.tp : null, stopLoss: T.useSl ? +T.sl : null };
  }
  function renderTicket() {
    normalize();
    var m = M(), cats = A.categoriesFor(m), info = A.CAT[T.cat], binary = T.cat !== "accumulator" && T.cat !== "multiplier", step = Math.pow(10, -m.digits);
    var h = '<div class="cats">' + A.CATEGORIES.filter(function (c) { return cats.indexOf(c.id) >= 0; }).map(function (c) { return '<button class="' + (T.cat === c.id ? "on" : "") + '" data-set="cat:' + c.id + '">' + c.name + "</button>"; }).join("") + '</div><div class="tbody"><p class="muted small">' + info.desc + "</p>";
    if (binary) {
      var us = Object.keys(UNITS).filter(function (k) { return k !== "t" || m.derived; });
      h += '<label class="l">Duration</label><div class="row2"><select data-k="unit" style="width:110px"' + (isDigitCat() ? " disabled" : "") + ">" + us.map(function (k) { return '<option value="' + k + '"' + (k === T.unit ? " selected" : "") + ">" + UNITS[k] + "</option>"; }).join("") + '</select><input class="num" type="number" data-k="dur" min="' + RANGE[T.unit][0] + '" max="' + RANGE[T.unit][1] + '" value="' + T.dur + '"></div>';
    }
    if (T.cat === "highlow" || T.cat === "touch") h += '<label class="l">Barrier offset <span id="babs" class="muted" style="text-transform:none"></span></label><div class="row2"><input class="num" type="number" data-k="offset" step="' + step + '" value="' + esc(T.offset) + '" placeholder="e.g. +0.50"><button class="btn btn-ghost" data-flip="1" style="padding:6px 12px" title="Flip sign">±</button></div>';
    if (T.cat === "matchdiff" || T.cat === "overunder") h += '<label class="l">' + (T.cat === "matchdiff" ? "Last digit prediction" : "Digit") + '</label><div class="digits">' + [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (i) { return '<button class="' + (T.digit === i ? "on" : "") + '" data-set="digit:' + i + '">' + i + "</button>"; }).join("") + "</div>";
    if (T.cat === "accumulator") h += '<label class="l">Growth rate (per tick)</label><div class="grid5">' + A.GROWTH_RATES.map(function (g) { return '<button class="' + (T.growth === g ? "on" : "") + '" data-set="growth:' + g + '">' + Math.round(g * 100) + "%</button>"; }).join("") + "</div>";
    if (T.cat === "multiplier") h += '<label class="l">Multiplier</label><div class="grid5">' + A.multipliersFor(m).map(function (x) { return '<button class="' + (T.mult === x ? "on" : "") + '" data-set="mult:' + x + '">x' + x + "</button>"; }).join("") + "</div>";
    h += '<label class="l">Stake (USD)</label><div class="row2"><button class="btn btn-ghost" data-bump="-1" style="padding:6px 14px">−</button><input class="num" style="text-align:center" type="number" data-k="stake" min="0.35" step="0.01" value="' + esc(T.stake) + '"><button class="btn btn-ghost" data-bump="1" style="padding:6px 14px">+</button></div><div class="quick">' + [1, 5, 10, 50, 100, 500].map(function (v) { return '<button data-q="' + v + '">$' + v + "</button>"; }).join("") + "</div>";
    if (T.cat === "accumulator" || T.cat === "multiplier") {
      h += '<div class="box"><label class="chk"><input type="checkbox" data-k="useTp"' + (T.useTp ? " checked" : "") + "> Take profit</label>" + (T.useTp ? '<input class="num" type="number" data-k="tp" min="0.01" step="0.01" value="' + esc(T.tp) + '">' : "");
      if (T.cat === "multiplier") h += '<label class="chk"><input type="checkbox" data-k="useSl"' + (T.useSl ? " checked" : "") + "> Stop loss</label>" + (T.useSl ? '<input class="num" type="number" data-k="sl" min="0.01" step="0.01" value="' + esc(T.sl) + '">' : "");
      h += "</div>";
    }
    h += '<div id="extra"></div><div style="display:grid;gap:8px;margin-top:6px">' + info.sides.map(function (s) { return '<div><button class="btn btn-' + s.color + ' sidebtn" data-buy="' + s.type + '"><span class="row"><span>' + s.label + '</span><span class="pl">—</span></span><span class="sub"></span></button><p class="warn small serr"></p></div>'; }).join("") + '</div><p class="muted small" style="text-align:center;margin-top:10px">' + (S.active().type === "demo" ? "Trading with virtual funds on your demo account." : "Trading with real funds. Trade responsibly.") + "</p></div>";
    $("#ticket").innerHTML = h; refreshSides();
  }
  function refreshSides() {
    var host = $("#ticket"); if (!host || !host.querySelector(".sidebtn")) return;
    var p; try { p = S.proposal(req()); } catch (e) { return; }
    var m = M(), binary = T.cat !== "accumulator" && T.cat !== "multiplier";
    if (T.offset === "" && (T.cat === "highlow" || T.cat === "touch")) { T.offset = String(+(T.cat === "highlow" ? p.suggest.highlow : p.suggest.touch).toFixed(m.digits)); var oi = host.querySelector('[data-k="offset"]'); if (oi) oi.value = T.offset; return refreshSides(); }
    var babs = $("#babs"); if (babs) babs.textContent = T.offset !== "" ? "→ " + A.fmt(m, m.price + Number(T.offset)) : "";
    p.sides.forEach(function (s) {
      var b = host.querySelector('[data-buy="' + s.type + '"]'); if (!b) return;
      b.disabled = !!s.error; b.querySelector(".pl").textContent = T.cat === "accumulator" || T.cat === "multiplier" ? "Buy" : s.payout ? usd(s.payout) : "—";
      b.querySelector(".sub").textContent = binary && s.pct != null ? "Payout · profit " + usd(s.profit) + " (" + s.pct.toFixed(1) + "%)" : "";
      b.parentNode.querySelector(".serr").textContent = s.error || "";
    });
    var ex = $("#extra"), st = Number(T.stake) || 0, row = function (k, v) { return '<div class="xr"><span class="muted">' + k + '</span><b class="num">' + v + "</b></div>"; };
    if (ex) ex.innerHTML = T.cat === "accumulator"
      ? '<div class="box">' + row("Barrier range (±)", A.fmt({ digits: m.digits + 1 }, p.extra.range)) + row("Tick survival odds", (p.extra.survival * 100).toFixed(1) + "%") + row("Payout after 10 ticks", usd(st * Math.pow(1 + T.growth, 10))) + row("Payout after 50 ticks", usd(st * Math.pow(1 + T.growth, 50))) + "</div>"
      : T.cat === "multiplier" ? '<div class="box">' + row("Position size", usd(p.extra.notional)) + row("Commission", usd(p.extra.comm)) + row("Stop-out (Up / Down)", A.fmt(m, p.extra.soUp) + " / " + A.fmt(m, p.extra.soDown)) + row("Max loss", usd(st)) + "</div>" : "";
  }

  function topbar() {
    var m = M(), c = A.chg(m);
    $("#mname").textContent = m.name; $("#msub").textContent = m.market + " · " + m.sub + " · 1s ticks";
    var pe = $("#mprice"); pe.textContent = A.fmt(m, m.price); pe.className = "num big " + (m.price >= m.prev ? "up" : "down");
    var ce = $("#mchg"); ce.textContent = (c >= 0 ? "+" : "") + c.toFixed(2) + "%"; ce.className = "num " + (c >= 0 ? "up" : "down");
  }
  function ctools() {
    $("#ctools").innerHTML = FRAMES.map(function (f) { return '<button class="' + (T.frame === f[1] ? "on" : "") + '" data-frame="' + f[1] + '">' + f[0] + "</button>"; }).join("") + '<span class="sep"></span>' +
      (T.frame > 0 ? '<button data-style="1">' + (T.style === "candle" ? "Candles" : "Line") + "</button>" : "") + [["sma", "SMA 20"], ["ema", "EMA 20"], ["bb", "Bollinger"]].map(function (i) { return '<button class="' + (T.inds[i[0]] ? "on" : "") + '" data-ind="' + i[0] + '">' + i[1] + "</button>"; }).join("");
  }

  UI.views["/trade"] = function (main) {
    main.innerHTML = '<div class="term live"><aside class="mlist"><div class="mtools"><input id="msearch" placeholder="Search markets…" value="' + esc(T.search) + '"><div class="mtabs" id="mtabs"></div></div><div id="mrows"></div></aside>' +
      '<section class="center"><div class="chart-top"><div><b id="mname"></b><div class="muted small" id="msub"></div></div><div><span id="mprice"></span> <span id="mchg"></span></div></div><div class="ctools" id="ctools"></div><div class="cwrap"><canvas id="cv"></canvas></div><div id="pos" class="posbox"></div></section>' +
      '<aside class="right" id="ticket"></aside></div>';
    renderTabs(); renderList(); ctools(); topbar(); renderTicket(); if (T.frame) A.ensureLong(M());
    var updPos = UI.positions($("#pos"), true);
    $("#msearch").oninput = function (e) { T.search = e.target.value; renderTabs(); renderList(); };
    $("#mtabs").onclick = function (e) { var b = e.target.closest("[data-tab]"); if (!b) return; T.mtab = b.dataset.tab; T.search = ""; $("#msearch").value = ""; renderTabs(); renderList(); };
    $("#mrows").onclick = function (e) {
      var f = e.target.closest("[data-fav]"); if (f) { S.toggleFav(f.dataset.fav); renderList(); return; }
      var r = e.target.closest(".mk"); if (!r) return; T.sym = r.dataset.id; T.offset = ""; saveUi(); if (T.frame) A.ensureLong(M()); renderList(); topbar(); renderTicket(); drawChart();
    };
    $("#ctools").onclick = function (e) {
      var b = e.target.closest("button"); if (!b) return;
      if (b.dataset.frame != null) { T.frame = +b.dataset.frame; if (T.frame) A.ensureLong(M()); } else if (b.dataset.style) T.style = T.style === "candle" ? "line" : "candle"; else if (b.dataset.ind) T.inds[b.dataset.ind] = !T.inds[b.dataset.ind];
      saveUi(); ctools(); drawChart();
    };
    var cv = $("#cv");
    cv.onmousemove = function (e) { var r = cv.getBoundingClientRect(); mouse = { x: e.clientX - r.left, y: e.clientY - r.top }; drawChart(); };
    cv.onmouseleave = function () { mouse = null; drawChart(); };

    var tk = $("#ticket");
    tk.addEventListener("input", function (e) {
      var k = e.target.dataset && e.target.dataset.k; if (!k || e.target.type === "checkbox" || e.target.tagName === "SELECT") return;
      T[k] = e.target.value; refreshSides();
    });
    tk.addEventListener("change", function (e) {
      var k = e.target.dataset && e.target.dataset.k; if (!k) return;
      if (k === "unit") { T.unit = e.target.value; T.dur = { t: 5, s: 30, m: 1, h: 1, d: 1 }[T.unit]; T.offset = ""; renderTicket(); }
      else if (e.target.type === "checkbox") { T[k] = e.target.checked; renderTicket(); }
      else if (k === "dur") { T.offset = T.cat === "highlow" || T.cat === "touch" ? "" : T.offset; refreshSides(); }
    });
    tk.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      if (b.dataset.set) {
        var kv = b.dataset.set.split(":"), k = kv[0], v = kv[1]; T[k] = k === "cat" ? v : Number(v); if (k === "cat") T.offset = ""; renderTicket();
      } else if (b.dataset.bump) { T.stake = String(Math.max(0.35, Math.round(((+T.stake || 0) + Number(b.dataset.bump)) * 100) / 100)); renderTicket(); }
      else if (b.dataset.q) { T.stake = b.dataset.q; renderTicket(); }
      else if (b.dataset.flip) { T.offset = T.offset === "" ? "" : String(-Number(T.offset)); renderTicket(); }
      else if (b.dataset.buy) {
        try {
          var c = S.buy(Object.assign(req(), { contractType: b.dataset.buy }));
          UI.toast("info", A.TYPE_LABEL[c.type] + " bought · #" + c.id, c.name + " · stake " + usd(c.stake) + (c.payout ? " · payout " + usd(c.payout) : ""));
          UI.updateHeader(); updPos(); drawChart();
        } catch (x) { UI.toast("error", "Could not place trade", x.message); }
      }
    });
    var n = 0;
    return {
      tick: function () {
        topbar(); drawChart(); updPos(); refreshSides();
        if (n++ % 2 === 0) renderList();
      }
    };
  };
})();
