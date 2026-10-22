// Cashier, Reports, Bots, Settings views
(function () {
  "use strict";
  var A = window.ARENA, S = window.STORE, UI = window.UI, $ = UI.$, esc = UI.esc, usd = UI.usd;
  var query = function () { var q = (location.hash.split("?")[1] || ""); return new URLSearchParams(q); };
  var statusCls = function (s) { return s === "completed" ? "up" : ["pending", "confirming", "processing"].indexOf(s) >= 0 ? "warnchip" : "down"; };

  function copyBtn(text, label) { return '<button class="btn btn-ghost sm" data-copy="' + esc(text) + '">' + (label || "Copy") + "</button>"; }
  function bindCopy(root) {
    root.onclick = root.onclick || null;
    UI.$$("[data-copy]", root).forEach(function (b) { b.onclick = function () { try { navigator.clipboard.writeText(b.dataset.copy); } catch (e) {} var o = b.textContent; b.textContent = "Copied ✓"; setTimeout(function () { b.textContent = o; }, 1500); }; });
  }
  function qr(text, el) {
    function make() { try { var q = window.qrcode(0, "M"); q.addData(text); q.make(); el.innerHTML = q.createSvgTag({ cellSize: 5, margin: 2 }); } catch (e) {} }
    if (window.qrcode) return make();
    var s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"; s.onload = make;
    s.onerror = function () { el.innerHTML = '<div class="muted small" style="padding:20px;color:#333">QR unavailable offline — copy the address instead.</div>'; };
    document.head.appendChild(s);
  }
  function pager(total, offset, page) { return '<div class="pager"><span>' + (total ? offset + 1 : 0) + "–" + Math.min(offset + page, total) + " of " + total + '</span><span><button class="btn btn-ghost sm" data-pg="-1"' + (offset === 0 ? " disabled" : "") + '>Previous</button> <button class="btn btn-ghost sm" data-pg="1"' + (offset + page >= total ? " disabled" : "") + ">Next</button></span></div>"; }

  // =================== CASHIER ===================
  UI.views["/cashier"] = function (main) {
    var u = S.user(), q = query();
    var st = { tab: ["deposit", "withdraw", "history"].indexOf(q.get("tab")) >= 0 ? q.get("tab") : "deposit", method: "usdt_trc20", amount: "50", phone: u.phone || "", dest: "", pw: "", cur: null, depSig: "", hisSig: "" };
    var M = S.METHODS, order = ["usdt_trc20", "usdt_erc20", "btc", "eth", "mpesa"];
    var rate = function (m) { return m.asset === "USDT" ? 1 : S.rates()[m.asset]; };

    function picker() {
      return '<div class="mpick">' + order.map(function (id) { var m = M[id]; return '<button class="' + (st.method === id ? "on" : "") + '" data-m="' + id + '"><i style="background:' + m.color + '">' + m.icon + "</i><b>" + m.label + "</b><small>" + (m.kind === "mobile" ? "Instant · KES" : m.network) + "</small></button>"; }).join("") + "</div>";
    }
    function render() {
      u = S.user(); var a = S.active(), real = S.real(), isDemo = a.type === "demo";
      var h = '<div class="page narrow"><div class="phd"><div><h1>Cashier</h1><p class="muted">Fund your account with crypto or M-Pesa. All balances are held and displayed in USD.</p></div><div class="card balcard"><small class="muted">' + a.type.toUpperCase() + ' BALANCE</small><div class="num" style="font-size:1.4rem;font-weight:700">' + usd(a.balance) + ' <small class="muted" style="font-size:.7rem">USD</small></div></div></div><div class="tabs2">' +
        ["deposit", "withdraw", "history"].map(function (t) { return '<button class="' + (st.tab === t ? "on" : "") + '" data-tab="' + t + '">' + t[0].toUpperCase() + t.slice(1) + "</button>"; }).join("") + "</div>";
      if (isDemo && st.tab !== "history") h += '<div class="notice" style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:18px"><span>You are on your <b>demo</b> account. Deposits and withdrawals use your real account.</span><button class="btn btn-primary sm" data-act="real">Switch to real account (' + real.loginid + ")</button></div>";
      if (st.tab === "deposit") h += st.cur ? '<div id="depbox"></div>' : depositForm(isDemo);
      else if (st.tab === "withdraw") h += withdrawForm(isDemo, real);
      else h += '<div class="card tw2" id="hist"></div>';
      main.innerHTML = h + "</div>"; bind(); if (st.cur) { st.depSig = ""; drawDep(); } if (st.tab === "history") drawHist(true);
    }
    function depositForm(isDemo) {
      var m = M[st.method];
      return picker() + '<div class="card form pad" style="max-width:560px;margin:20px auto 0"><div><label class="l">Amount (USD)</label><input class="num big" id="amt" type="number" min="' + m.minD + '" value="' + esc(st.amount) + '"><div class="quick">' + [10, 25, 50, 100, 500, 1000].map(function (v) { return '<button data-q="' + v + '">$' + v + "</button>"; }).join("") + '</div><p class="muted small">Min ' + usd(m.minD) + " · Max " + usd(m.maxD) + "</p></div>" +
        (m.kind === "mobile" ? '<div><label class="l">M-Pesa phone number</label><input id="ph" value="' + esc(st.phone) + '" placeholder="0712 345 678"></div>' : "") + '<div class="box" id="prev"></div><button class="btn btn-primary" style="width:100%;padding:13px" data-act="deposit"' + (isDemo ? " disabled" : "") + ">" + (m.kind === "mobile" ? "Send M-Pesa prompt" : "Generate deposit address") + "</button></div>";
    }
    function withdrawForm(isDemo, real) {
      var m = M[st.method], ok = (u.emailVerified || u.phoneVerified) && u.kyc === "verified";
      var need = []; if (!u.emailVerified && !u.phoneVerified) need.push("<b>a verified email or phone</b>"); if (u.kyc !== "verified") need.push("<b>verified identity (" + (u.kyc === "pending" ? "under review" : "not submitted") + ")</b>");
      return picker() + '<div class="card form pad" style="max-width:560px;margin:20px auto 0">' + (ok ? "" : '<div class="notice">Before withdrawing you need: ' + need.join(" and ") + '. <a href="#/settings" style="text-decoration:underline">Go to settings</a></div>') +
        '<div><div style="display:flex;justify-content:space-between"><label class="l">Amount (USD)</label><a href="#" data-act="max" class="brandlink small">Max</a></div><input class="num big" id="amt" type="number" value="' + esc(st.amount) + '"><p class="muted small">Min ' + usd(m.minW) + " · Max " + usd(m.maxW) + " · Available " + usd(real.balance) + "</p></div>" +
        "<div><label class=\"l\">" + (m.kind === "mobile" ? "M-Pesa phone number" : esc(m.network) + " address") + '</label><input id="dest" class="' + (m.kind === "mobile" ? "" : "num") + '" value="' + esc(m.kind === "mobile" ? st.phone : st.dest) + '" placeholder="' + (m.kind === "mobile" ? "0712 345 678" : m.id === "usdt_trc20" ? "T…" : m.id === "btc" ? "bc1…" : "0x…") + '"></div><div><label class="l">Account password (to confirm)</label><input id="pw" type="password" autocomplete="current-password"></div><div class="box" id="prev"></div><button class="btn btn-primary" style="width:100%;padding:13px" data-act="withdraw"' + (isDemo ? " disabled" : "") + '>Request withdrawal</button><p class="muted small" style="text-align:center">Withdrawals are held for 45 seconds (cancellable) then processed.</p></div>';
    }
    function preview() {
      var el = $("#prev"); if (!el) return; var m = M[st.method], amt = Number(st.amount) || 0, r = function (k, v, c) { return '<div class="xr"><span class="muted">' + k + '</span><b class="num ' + (c || "") + '">' + v + "</b></div>"; };
      if (st.tab === "deposit") {
        var pay = m.kind === "mobile" ? "KES " + Math.ceil(amt * S.KES_D).toLocaleString() + " (@ KES " + S.KES_D + "/USD)" : (amt / rate(m)).toFixed(m.dec) + " " + m.asset;
        el.innerHTML = r("You pay", pay) + r("You receive", usd(amt), "up") + r("Deposit fee", "$0.00") + (m.kind === "crypto" && m.asset !== "USDT" ? r("Rate", "1 " + m.asset + " = " + usd(rate(m))) : "");
      } else {
        var fee = S.withdrawFee(m, amt), net = Math.max(0, amt - fee), get = m.kind === "mobile" ? "KES " + Math.floor(net * S.KES_W).toLocaleString() + " (@ KES " + S.KES_W + "/USD)" : (net / rate(m)).toFixed(m.dec) + " " + m.asset;
        el.innerHTML = r("Withdrawal amount", usd(amt)) + r("Fee " + (m.kind === "mobile" ? "(" + m.fee + "%)" : "(network)"), "−" + usd(fee)) + r("You receive", get, "up");
      }
    }
    function bind() {
      preview();
      var amt = $("#amt"); if (amt) amt.oninput = function () { st.amount = amt.value; preview(); };
      var ph = $("#ph"); if (ph) ph.oninput = function () { st.phone = ph.value; };
      var ds = $("#dest"); if (ds) ds.oninput = function () { if (M[st.method].kind === "mobile") st.phone = ds.value; else st.dest = ds.value; };
      var pw = $("#pw"); if (pw) pw.oninput = function () { st.pw = pw.value; };
    }
    main.onclick = function (e) {
      var b = e.target.closest("button,a"); if (!b) return;
      if (b.dataset.tab) { st.tab = b.dataset.tab; render(); }
      else if (b.dataset.m) { st.method = b.dataset.m; if (st.tab === "withdraw" && M[st.method].kind === "mobile" && !st.phone) st.phone = u.phone || ""; render(); }
      else if (b.dataset.q) { st.amount = b.dataset.q; $("#amt").value = st.amount; preview(); }
      else if (b.dataset.act) { e.preventDefault(); act(b.dataset.act); }
      else if (b.dataset.cancel) { try { S.cancelWithdrawal(+b.dataset.cancel); UI.toast("info", "Withdrawal cancelled", "Funds were returned to your account."); UI.updateHeader(); drawHist(true); } catch (x) { UI.toast("error", "Cannot cancel", x.message); } }
      else if (b.dataset.pay) { st.cur = +b.dataset.pay; st.tab = "deposit"; render(); }
      else if (b.dataset.dep) { try { S.depositAction(st.cur, b.dataset.dep, ($("#pin") || {}).value); st.depSig = ""; drawDep(); } catch (x) { UI.toast("error", "Action failed", x.message); } }
      else if (b.dataset.newdep) { st.cur = null; render(); }
    };
    function act(a) {
      try {
        if (a === "real") { S.switchAccount(S.real().id); UI.route(); }
        else if (a === "max") { st.amount = String(Math.min(S.real().balance, M[st.method].maxW)); $("#amt").value = st.amount; preview(); }
        else if (a === "deposit") { var p = S.createDeposit(st.method, st.amount, st.phone); st.cur = p.id; render(); }
        else if (a === "withdraw") {
          var m = M[st.method];
          S.createWithdrawal(st.method, st.amount, m.kind === "mobile" ? st.phone : st.dest, $("#pw").value).then(function (p) {
            UI.toast("success", "Withdrawal requested", usd(p.amountUsd) + " submitted. Track it under History."); st.pw = ""; st.tab = "history"; UI.updateHeader(); render();
          }, function (x) { UI.toast("error", "Withdrawal failed", x.message); });
        }
      } catch (x) { UI.toast("error", a === "deposit" ? "Deposit failed" : "Error", x.message); }
    }

    function drawDep() {
      var box = $("#depbox"); if (!box) return; var p = S.payment(st.cur); if (!p) { st.cur = null; return render(); }
      var m = M[p.method], mp = m.kind === "mobile", left = Math.max(0, Math.round((p.expiresAt - Date.now()) / 1000)), sig = p.status + ":" + p.conf;
      if (sig === st.depSig) { var lt = $("#dleft"); if (lt) lt.textContent = Math.floor(left / 60) + "m " + (left % 60) + "s"; return; }
      st.depSig = sig;
      var h = '<div class="card pad" style="max-width:640px;margin:0 auto"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"><div><small class="muted">Deposit #' + p.id + " · " + m.label + '</small><div class="num" style="font-size:1.6rem;font-weight:700">' + usd(p.amountUsd) + '</div></div><span class="chip ' + statusCls(p.status) + '">' + p.status.toUpperCase() + "</span></div>";
      if (!mp && p.status === "pending") h += '<div class="depgrid"><div id="qrbox" class="qrbox"></div><div><label class="l">Send exactly</label><div style="display:flex;gap:8px;align-items:center"><b class="num" style="font-size:1.1rem">' + p.assetAmount + " " + p.asset + "</b>" + copyBtn(String(p.assetAmount)) + '</div><div class="muted small">≈ ' + usd(p.amountUsd) + " @ " + usd(p.rate) + " per " + p.asset + '</div><label class="l">' + esc(m.network) + ' address</label><div class="addr num">' + esc(p.address) + "</div>" + copyBtn(p.address, "Copy address") + '</div></div><div class="notice" style="margin:14px 0">Only send <b>' + p.asset + "</b> on the <b>" + esc(m.network) + '</b> network to this address. Funds sent on another network will be lost. Rate locked for <span id="dleft"></span>.</div><div class="sbox"><b style="color:var(--accent)">Sandbox mode:</b> this standalone page is not connected to a blockchain, so no real coins can arrive. Use the button to simulate your wallet transfer and watch the confirmations.<div style="margin-top:10px;display:flex;gap:8px"><button class="btn btn-primary sm" data-dep="pay">Simulate incoming transfer</button><button class="btn btn-ghost sm" data-dep="cancel">Cancel request</button></div></div>';
      else if (!mp && p.status === "confirming") h += '<p style="color:#cbd5e1">Transfer detected on the ' + esc(m.network) + ' network. Waiting for confirmations…</p><div class="bar"><i style="width:' + (p.conf / Math.max(1, p.reqConf)) * 100 + '%"></i></div><div style="display:flex;justify-content:space-between" class="muted small"><span>' + p.conf + " / " + p.reqConf + ' confirmations</span><span class="num">' + p.assetAmount + " " + p.asset + '</span></div><div class="muted small" style="word-break:break-all;margin-top:8px">Tx: <span class="num">' + esc(p.tx) + "</span></div>";
      else if (mp && p.status === "pending") h += '<div class="depgrid"><div class="phone"><small>STK Push · ' + esc(p.phone) + '</small><div class="screen"><b style="color:#4cb848">M-PESA</b><p>Pay <b>KES ' + p.assetAmount.toLocaleString() + '</b> to <b>ARENA MARKETS</b>. Enter your M-PESA PIN.</p><input id="pin" type="password" maxlength="4" inputmode="numeric" placeholder="••••"><div class="r2"><button data-dep="cancel">Cancel</button><button class="ok" data-dep="pay">Send</button></div></div></div><div><p style="color:#cbd5e1">We sent an M-Pesa prompt to <b>' + esc(p.phone) + "</b>. Enter your PIN on your phone to approve <b>KES " + p.assetAmount.toLocaleString() + "</b> (" + usd(p.amountUsd) + " @ KES " + p.rate + '/USD).</p><p class="muted small">Request expires in <span id="dleft"></span>.</p><div class="sbox"><b style="color:var(--accent)">Sandbox mode:</b> no Safaricom Daraja connection is configured, so the phone on the left simulates your handset. Enter any 4-digit PIN.</div></div></div>';
      else if (mp && p.status === "processing") h += '<p style="color:#cbd5e1"><span class="spin"></span> Confirming your payment with Safaricom…</p>';
      else if (p.status === "completed") h += '<div style="text-align:center"><div class="okc">✓</div><h3>Deposit successful</h3><p class="muted">' + usd(p.amountUsd) + " was added to your real account." + (p.receipt ? " M-Pesa receipt: " + p.receipt + "." : "") + '</p><div style="display:flex;gap:8px;justify-content:center;margin-top:14px"><a class="btn btn-primary" href="#/trade">Start trading</a><button class="btn btn-ghost" data-newdep="1">New deposit</button></div></div>';
      else h += '<div style="text-align:center"><h3 style="text-transform:capitalize">Deposit ' + p.status + '</h3><p class="muted">' + esc(p.note) + '</p><button class="btn btn-primary" data-newdep="1" style="margin-top:10px">Try again</button></div>';
      box.innerHTML = h + "</div>"; bindCopy(box);
      var qb = $("#qrbox"); if (qb) qr(m.id === "btc" ? "bitcoin:" + p.address + "?amount=" + p.assetAmount : m.id === "eth" ? "ethereum:" + p.address + "?value=" + p.assetAmount : p.address, qb);
      var lt2 = $("#dleft"); if (lt2) lt2.textContent = Math.floor(left / 60) + "m " + (left % 60) + "s";
    }
    function drawHist(force) {
      var el = $("#hist"); if (!el) return; var list = S.payments(), sig = list.map(function (p) { return p.id + p.status + p.conf; }).join("|");
      if (!force && sig === st.hisSig) return; st.hisSig = sig;
      el.innerHTML = '<table><thead><tr><th>ID</th><th>Date</th><th>Type</th><th>Method</th><th>USD amount</th><th>Fee</th><th>Asset amount</th><th>Status</th><th></th></tr></thead><tbody>' + (list.length ? list.map(function (p) {
        return '<tr><td class="muted num">#' + p.id + "</td><td>" + UI.fdate(p.createdAt) + '</td><td style="text-transform:capitalize">' + p.dir + "</td><td>" + M[p.method].label + '</td><td class="num ' + (p.dir === "deposit" ? "up" : "") + '"><b>' + (p.dir === "deposit" ? "+" : "−") + usd(p.amountUsd) + '</b></td><td class="num muted">' + (p.fee ? usd(p.fee) : "—") + '</td><td class="num">' + p.assetAmount + " " + p.asset + '</td><td><span class="chip ' + statusCls(p.status) + '">' + p.status + (p.status === "confirming" ? " " + p.conf + "/" + p.reqConf : "") + '</span><div class="muted" style="font-size:.68rem;max-width:240px;overflow:hidden;text-overflow:ellipsis">' + esc(p.receipt ? "Receipt " + p.receipt : p.note) + "</div></td><td>" + (p.dir === "withdrawal" && p.status === "pending" ? '<button class="btn btn-ghost sm" data-cancel="' + p.id + '">Cancel</button>' : p.dir === "deposit" && p.status === "pending" ? '<button class="btn btn-ghost sm" data-pay="' + p.id + '">Pay</button>' : "") + "</td></tr>";
      }).join("") : '<tr><td colspan="9" class="empty">No payments yet.</td></tr>') + "</tbody></table>";
    }
    render();
    return { tick: function () { if (st.tab === "deposit" && st.cur) drawDep(); else if (st.tab === "history") drawHist(false); if (st.tab !== "history") preview(); } };
  };

  // =================== REPORTS ===================
  UI.views["/reports"] = function (main) {
    var tab = "open", offset = 0, type = "", PAGE = 20, updPos = null;
    function render() {
      main.innerHTML = '<div class="page"><h1>Reports</h1><p class="muted" style="margin-bottom:18px">Review open positions, closed trades and every movement on your active account.</p><div class="tabs2">' + [["open", "Open positions"], ["profit", "Profit table"], ["statement", "Statement"]].map(function (t) { return '<button class="' + (tab === t[0] ? "on" : "") + '" data-tab="' + t[0] + '">' + t[1] + "</button>"; }).join("") + '</div><div id="rb"></div></div>';
      updPos = null; body();
    }
    function body() {
      var rb = $("#rb"), a = S.active();
      if (tab === "open") { rb.innerHTML = '<div class="card posbox" id="rp" style="min-height:240px"></div>'; updPos = UI.positions($("#rp"), false); }
      else if (tab === "profit") {
        var all = S.closedContracts(), rows = all.slice(offset, offset + PAGE), stake = 0, pl = 0, wins = 0; all.forEach(function (c) { stake += c.stake; pl += c.profit; if (c.profit > 0) wins++; });
        rb.innerHTML = '<div class="stats4">' + [["Total trades", all.length], ["Win rate", (all.length ? (wins / all.length) * 100 : 0).toFixed(1) + "%"], ["Total staked", usd(stake)], ["Net profit / loss", usd(pl, true), pl >= 0 ? "up" : "down"]].map(function (s) { return '<div class="card pad"><small class="muted">' + s[0].toString().toUpperCase() + '</small><div class="num ' + (s[2] || "") + '" style="font-size:1.3rem;font-weight:700;margin-top:4px">' + s[1] + "</div></div>"; }).join("") +
          '</div><div class="card tw2"><div class="tbar"><b>Profit table (' + a.type + ')</b><button class="btn btn-ghost sm" id="exp">Export CSV</button></div><table><thead><tr><th>Ref</th><th>Closed</th><th>Market</th><th>Type</th><th>Details</th><th>Entry</th><th>Exit</th><th>Stake</th><th>Return</th><th>Profit/Loss</th></tr></thead><tbody>' +
          (rows.length ? rows.map(function (c) { var f = { digits: c.digits }; return '<tr><td class="muted num">#' + c.id + "</td><td>" + UI.fdate(c.closedAt) + "</td><td><b>" + esc(c.name) + '</b></td><td><span class="chip">' + A.TYPE_LABEL[c.type] + '</span></td><td class="muted">' + esc(UI.describe(c)) + '</td><td class="num">' + A.fmt(f, c.entry) + '</td><td class="num">' + A.fmt(f, c.exit) + '</td><td class="num">' + usd(c.stake) + '</td><td class="num">' + usd(c.sellPrice) + (c.status === "sold" ? ' <small class="muted">(sold)</small>' : "") + '</td><td class="num ' + (c.profit >= 0 ? "up" : "down") + '"><b>' + usd(c.profit, true) + "</b></td></tr>"; }).join("") : '<tr><td colspan="10" class="empty">No closed trades yet.</td></tr>') + "</tbody></table>" + pager(all.length, offset, PAGE) + "</div>";
        $("#exp").onclick = function () { UI.csv("profit-table.csv", [["Ref", "Opened", "Closed", "Market", "Type", "Details", "Entry", "Exit", "Stake", "Return", "Profit"]].concat(all.map(function (c) { return [c.id, UI.fdate(c.openedAt), UI.fdate(c.closedAt), c.name, A.TYPE_LABEL[c.type], UI.describe(c), c.entry, c.exit, c.stake, c.sellPrice, c.profit]; }))); };
      } else {
        var list = S.statement(type), pg = list.slice(offset, offset + PAGE), types = ["", "deposit", "withdrawal", "withdrawal_refund", "buy", "payout", "sell", "reset"];
        rb.innerHTML = '<div class="card tw2"><div class="tbar"><b>Statement (' + a.type + ')</b><span style="display:flex;gap:8px"><select id="ty" style="width:180px;padding:5px 10px">' + types.map(function (t) { return '<option value="' + t + '"' + (t === type ? " selected" : "") + ">" + (t ? t.replace("_", " ") : "All transactions") + "</option>"; }).join("") + '</select><button class="btn btn-ghost sm" id="exp">Export CSV</button></span></div><table><thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Reference</th><th>Amount</th><th>Balance</th></tr></thead><tbody>' +
          (pg.length ? pg.map(function (r) { return "<tr><td>" + UI.fdate(r.t) + '</td><td><span class="chip" style="text-transform:capitalize">' + r.type.replace("_", " ") + "</span></td><td>" + esc(r.desc) + '</td><td class="muted num">' + esc(r.ref || "—") + '</td><td class="num ' + (r.amount >= 0 ? "up" : "down") + '"><b>' + usd(r.amount, true) + '</b></td><td class="num">' + usd(r.bal) + "</td></tr>"; }).join("") : '<tr><td colspan="6" class="empty">No transactions.</td></tr>') + "</tbody></table>" + pager(list.length, offset, PAGE) + "</div>";
        $("#ty").onchange = function (e) { type = e.target.value; offset = 0; body(); };
        $("#exp").onclick = function () { UI.csv("statement.csv", [["ID", "Date", "Type", "Description", "Reference", "Amount (USD)", "Balance (USD)"]].concat(list.map(function (r) { return [r.id, UI.fdate(r.t), r.type, r.desc, r.ref, r.amount, r.bal]; }))); };
      }
    }
    main.onclick = function (e) {
      var b = e.target.closest("button"); if (!b) return;
      if (b.dataset.tab) { tab = b.dataset.tab; offset = 0; render(); } else if (b.dataset.pg) { offset = Math.max(0, offset + Number(b.dataset.pg) * PAGE); body(); }
    };
    render();
    return { tick: function () { if (updPos) updPos(); } };
  };

  // =================== BOTS ===================
  var STRATS = [["rise", "Always Rise", ["CALL"]], ["fall", "Always Fall", ["PUT"]], ["alt", "Alternate Rise / Fall", ["CALL", "PUT"]], ["even", "Always Even", ["DIGITEVEN"]], ["odd", "Always Odd", ["DIGITODD"]], ["evenodd", "Alternate Even / Odd", ["DIGITEVEN", "DIGITODD"]], ["differs", "Digit Differs", ["DIGITDIFF"], true], ["matches", "Digit Matches", ["DIGITMATCH"], true], ["over", "Digit Over", ["DIGITOVER"], true], ["under", "Digit Under", ["DIGITUNDER"], true]];
  var botState = { running: false, stop: false, log: [], status: "Idle" };
  UI.views["/bots"] = function (main) {
    var derived = A.markets.filter(function (m) { return m.kind === "vol"; }), alive = true;
    var v = { symbol: "R_100", strat: "alt", digit: 4, ticks: 1, stake: "1", mg: "2", tp: "20", sl: "20", max: "50", ack: false };
    function render() {
      var a = S.active(), r = botState.running, st = STRATS.filter(function (s) { return s[0] === v.strat; })[0], dis = r ? " disabled" : "";
      main.innerHTML = '<div class="page"><h1>Trading Bots</h1><p class="muted" style="margin-bottom:18px">Automate tick-based strategies with a martingale recovery, take-profit and stop-loss. Bots run while this page stays open.</p><div class="botgrid"><div class="card pad form"><div><label class="l">Market</label><select data-k="symbol"' + dis + ">" + derived.map(function (m) { return '<option value="' + m.id + '"' + (v.symbol === m.id ? " selected" : "") + ">" + m.name + "</option>"; }).join("") + '</select></div><div><label class="l">Strategy</label><select data-k="strat"' + dis + ">" + STRATS.map(function (s) { return '<option value="' + s[0] + '"' + (v.strat === s[0] ? " selected" : "") + ">" + s[1] + "</option>"; }).join("") + '</select></div><div class="two2">' +
        (st[3] ? '<div><label class="l">Digit</label><input class="num" type="number" min="0" max="9" data-k="digit" value="' + v.digit + '"' + dis + "></div>" : "") +
        [["ticks", "Ticks"], ["stake", "Initial stake ($)"], ["mg", "Martingale ×"], ["tp", "Take profit ($)"], ["sl", "Stop loss ($)"], ["max", "Max trades"]].map(function (f) { return '<div><label class="l">' + f[1] + '</label><input class="num" type="number" step="any" data-k="' + f[0] + '" value="' + v[f[0]] + '"' + dis + "></div>"; }).join("") + "</div>" +
        (a.type === "real" ? '<label class="chk warnbox"><input type="checkbox" data-k="ack"' + (v.ack ? " checked" : "") + '> I understand this bot will trade REAL money automatically and martingale strategies can lose quickly.</label>' : "") +
        (r ? '<button class="btn btn-down" style="padding:13px" id="stop">Stop bot</button>' : '<button class="btn btn-primary" style="padding:13px" id="run"' + (+v.stake >= 0.35 && (a.type === "demo" || v.ack) ? "" : " disabled") + ">Run bot on " + a.type + " account</button>") + '</div><div><div class="stats4" id="bstats"></div><div class="card tw2" style="max-height:460px;overflow:auto" id="blog"></div></div></div></div>';
      stats();
    }
    function stats() {
      var l = botState.log, n = l.length, w = l.filter(function (x) { return x.won; }).length, pl = l.reduce(function (a, x) { return a + x.profit; }, 0);
      $("#bstats").innerHTML = [["Status", botState.status], ["Trades", n + " (" + w + " won)"], ["Win rate", n ? Math.round((w / n) * 100) + "%" : "—"], ["Session P/L", usd(pl, true), pl >= 0 ? "up" : "down"]].map(function (s) { return '<div class="card pad"><small class="muted">' + s[0].toUpperCase() + '</small><div class="' + (s[2] || "") + '" style="font-weight:700;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(s[1]) + '">' + esc(s[1]) + "</div></div>"; }).join("");
      $("#blog").innerHTML = '<table><thead><tr><th>Time</th><th>Contract</th><th>Type</th><th>Stake</th><th>Result</th><th>Profit/Loss</th></tr></thead><tbody>' + (l.length ? l.map(function (x) { return "<tr><td>" + UI.ftime(x.t) + '</td><td class="muted num">#' + x.id + "</td><td>" + x.type + '</td><td class="num">' + usd(x.stake) + '</td><td><span class="chip ' + (x.won ? "up" : "down") + '">' + (x.won ? "WON" : "LOST") + '</span></td><td class="num ' + (x.profit >= 0 ? "up" : "down") + '"><b>' + usd(x.profit, true) + "</b></td></tr>"; }).join("") : '<tr><td colspan="6" class="empty">Bot journal is empty. Configure a strategy and press run.</td></tr>') + "</tbody></table>";
    }
    function run() {
      var st = STRATS.filter(function (s) { return s[0] === v.strat; })[0], cur = +v.stake, base = +v.stake, mult = Math.max(1, +v.mg || 1), pl = 0, n = 0;
      botState.running = true; botState.stop = false; botState.log = []; render();
      (function loop() {
        if (botState.stop || n >= +v.max || !alive && false) { botState.status = botState.stop ? "Stopped by you" : "Max trades reached"; return end(); }
        var type = st[2][n % st[2].length], c;
        botState.status = "Placing " + A.TYPE_LABEL[type] + " trade, stake " + usd(cur) + "…"; if (alive) stats();
        try { c = S.buy({ symbol: v.symbol, contractType: type, stake: cur, durationUnit: "t", duration: +v.ticks, digit: st[3] ? +v.digit : type === "DIGITOVER" ? 3 : undefined }); }
        catch (e) { botState.status = "Stopped: " + e.message; UI.toast("error", "Bot stopped", e.message); return end(); }
        botState.status = "Contract #" + c.id + " running…"; if (alive) stats();
        (function wait() {
          if (c.status === "open") { if (botState.stop) { botState.status = "Stopped (open contract will settle on its own)"; return end(); } return setTimeout(wait, 500); }
          var p = c.profit; pl += p; n++; botState.log.unshift({ t: Date.now(), id: c.id, type: A.TYPE_LABEL[c.type], stake: c.stake, profit: p, won: p > 0 }); botState.log = botState.log.slice(0, 200);
          cur = p > 0 ? base : Math.round(cur * mult * 100) / 100;
          if (+v.tp && pl >= +v.tp) { botState.status = "Take-profit reached (" + usd(pl, true) + ")"; return end(); }
          if (+v.sl && pl <= -+v.sl) { botState.status = "Stop-loss reached (" + usd(pl, true) + ")"; return end(); }
          if (alive) stats(); setTimeout(loop, 400);
        })();
      })();
      function end() { botState.running = false; if (alive) render(); }
    }
    main.addEventListener("input", function (e) { var k = e.target.dataset && e.target.dataset.k; if (!k || e.target.tagName === "SELECT" || e.target.type === "checkbox") return; v[k] = e.target.value; var rb = $("#run"); if (rb) rb.disabled = !(+v.stake >= 0.35 && (S.active().type === "demo" || v.ack)); });
    main.addEventListener("change", function (e) { var k = e.target.dataset && e.target.dataset.k; if (!k) return; v[k] = e.target.type === "checkbox" ? e.target.checked : e.target.value; render(); });
    main.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; if (b.id === "run") run(); if (b.id === "stop") botState.stop = true; });
    render();
    return { tick: function () { if (botState.running) { stats(); UI.updateHeader(); } }, destroy: function () { alive = false; } };
  };

  // =================== SETTINGS ===================
  UI.views["/settings"] = function (main) {
    var tab = "profile";
    function sec(t, d, body) { return '<div class="card pad" style="margin-bottom:18px"><h3>' + t + "</h3>" + (d ? '<p class="muted small" style="margin:2px 0 14px">' + d + "</p>" : "") + body + "</div>"; }
    function contactRow(label, val, ver) { return '<div class="crow"><div><small class="muted">' + label.toUpperCase() + "</small><div>" + (val ? esc(val) : "Not added") + "</div></div>" + (val ? (ver ? '<span class="chip up">Verified</span>' : '<button class="btn btn-primary sm" data-verify="' + esc(val) + '">Verify</button>') : "") + "</div>"; }
    function render() {
      var u = S.user(), h = '<div class="page narrow2"><h1>Account settings</h1><p class="muted" style="margin-bottom:18px">Member since ' + UI.fdate(u.createdAt) + '</p><div class="tabs2">' + [["profile", "Profile"], ["security", "Security"], ["verification", "Verification"], ["limits", "Responsible trading"]].map(function (t) { return '<button class="' + (tab === t[0] ? "on" : "") + '" data-tab="' + t[0] + '">' + t[1] + "</button>"; }).join("") + "</div>";
      if (tab === "profile") {
        h += sec("Contact details", "Log in with either your email or phone number. Verify both for the best account recovery options.", '<div style="display:grid;gap:8px">' + contactRow("Email", u.email, u.emailVerified) + contactRow("Phone", u.phone, u.phoneVerified) + "</div>" + (!u.email || !u.phone ? '<div class="row2" style="margin-top:12px"><input id="nc" placeholder="' + (u.email ? "Add phone e.g. +254712345678" : "Add email address") + '"><button class="btn btn-ghost" data-act="addc">Add</button></div>' : ""));
        h += sec("Personal details", "", '<div class="two2"><div><label class="l">Full name</label><input id="pn" value="' + esc(u.fullName || "") + '"></div><div><label class="l">Country</label><select id="pc">' + UI.opts(UI.COUNTRIES, u.country || "Kenya") + '</select></div></div><button class="btn btn-primary" style="margin-top:14px" data-act="prof">Save changes</button>');
        h += sec("Local data", "This standalone version stores everything in your browser only.", '<button class="btn btn-ghost" data-act="wipe">Delete all local data</button>');
      } else if (tab === "security") {
        h += sec("Change password", "", '<div class="two2"><div><label class="l">Current password</label><input id="cp" type="password" autocomplete="current-password"></div><div><label class="l">New password</label><input id="np" type="password" autocomplete="new-password"></div></div><button class="btn btn-primary" style="margin-top:14px" data-act="pw">Update password</button>');
        h += sec("Sessions", "Sign out of this browser.", '<button class="btn btn-ghost" data-act="lo">Log out</button>');
      } else if (tab === "verification") {
        var k = u.kyc;
        h += sec("Identity verification (KYC)", "Required before your first withdrawal.", '<p style="margin-bottom:14px"><span class="chip ' + (k === "verified" ? "up" : k === "pending" ? "warnchip" : "") + '">' + (k === "verified" ? "Verified" : k === "pending" ? "Under review…" : "Not verified") + "</span> " + (k === "pending" ? '<small class="muted">Sandbox reviewer approves within ~15 seconds.</small>' : "") + "</p>" +
          (k === "verified" ? '<div style="display:grid;gap:4px;font-size:.9rem"><div>Name: <b>' + esc(u.fullName) + "</b></div><div>Date of birth: <b>" + esc(u.dob) + "</b></div><div>Country: <b>" + esc(u.country) + "</b></div><div>" + esc(u.idType) + ": <b>•••• " + esc((u.idNumber || "").slice(-3)) + "</b></div></div>"
            : '<div class="two2"><div style="grid-column:1/-1"><label class="l">Full legal name</label><input id="kn" value="' + esc(u.fullName || "") + '"></div><div><label class="l">Date of birth</label><input id="kd" type="date" value="' + esc(u.dob || "") + '"></div><div><label class="l">Country of residence</label><select id="kc">' + UI.opts(UI.COUNTRIES, u.country || "Kenya") + '</select></div><div style="grid-column:1/-1"><label class="l">Residential address</label><input id="ka" value="' + esc(u.address || "") + '"></div><div><label class="l">ID type</label><select id="kt">' + UI.opts(["National ID", "Passport", "Driving licence"], u.idType || "National ID") + '</select></div><div><label class="l">ID number</label><input id="ki"></div></div><button class="btn btn-primary" style="margin-top:14px" data-act="kyc"' + (k === "pending" ? " disabled" : "") + ">Submit for verification</button>"));
      } else {
        var l = u.limits || {}, ex = u.excludedUntil > Date.now();
        h += sec("Trading limits", "Limits apply to your real account. Leave a field empty for no limit.", '<div class="two2">' + [["maxOpenPositions", "Max open positions"], ["maxStake", "Max stake per trade ($)"], ["maxDailyLoss", "Max daily loss ($)"], ["maxDailyTurnover", "Max daily turnover ($)"]].map(function (f) { return '<div><label class="l">' + f[1] + '</label><input class="num" type="number" data-lim="' + f[0] + '" value="' + (l[f[0]] || "") + '"></div>'; }).join("") + '</div><button class="btn btn-primary" style="margin-top:14px" data-act="lim">Save limits</button>');
        h += sec("Self-exclusion", "Take a break from trading. While excluded you cannot open new trades or withdraw. This cannot be reversed early.", ex ? '<div class="notice" style="border-color:var(--down);color:var(--down)">You are self-excluded until ' + UI.fdate(u.excludedUntil) + ".</div>" : '<div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap"><div><label class="l">Exclude me for</label><select id="exd" style="width:150px">' + [[1, "24 hours"], [7, "7 days"], [30, "30 days"], [90, "3 months"], [180, "6 months"], [365, "1 year"]].map(function (d) { return '<option value="' + d[0] + '">' + d[1] + "</option>"; }).join("") + '</select></div><div><label class="l">Confirm password</label><input id="exp" type="password"></div><button class="btn btn-primary" data-act="ex">Exclude me</button></div>');
        h += '<p class="muted small">Need help? Trading can be addictive. Never trade money you cannot afford to lose.</p>';
      }
      main.innerHTML = h + "</div>";
    }
    var ok = function (t) { UI.toast("success", t); render(); UI.banner(); }, bad = function (e) { UI.toast("error", "Could not save", e.message); };
    main.onclick = function (e) {
      var b = e.target.closest("button"); if (!b) return;
      if (b.dataset.tab) { tab = b.dataset.tab; return render(); }
      if (b.dataset.verify) { try { UI.verifyModal(b.dataset.verify, S.otpRequest(b.dataset.verify, "verify")); } catch (x) { bad(x); } return; }
      var a = b.dataset.act; if (!a) return;
      try {
        if (a === "addc") { var u = S.user(), t = S.addContact(u.email ? "phone" : "email", $("#nc").value); render(); UI.verifyModal(t, S.otpRequest(t, "verify")); }
        else if (a === "prof") { S.updateProfile($("#pn").value, $("#pc").value); ok("Profile updated"); }
        else if (a === "wipe") { if (confirm("This deletes every account stored in this browser. Continue?")) { S.wipeAll(); location.hash = "#/login"; location.reload(); } }
        else if (a === "pw") S.changePassword($("#cp").value, $("#np").value).then(function () { ok("Password changed"); }, bad);
        else if (a === "lo") { S.logout(); location.hash = "#/login"; }
        else if (a === "kyc") { S.submitKyc({ fullName: $("#kn").value, dob: $("#kd").value, country: $("#kc").value, address: $("#ka").value, idType: $("#kt").value, idNumber: $("#ki").value }); ok("Verification submitted"); }
        else if (a === "lim") { var o = {}; UI.$$("[data-lim]").forEach(function (i) { o[i.dataset.lim] = i.value; }); S.setLimits(o); ok("Limits saved"); }
        else if (a === "ex") S.exclude(+$("#exd").value, $("#exp").value).then(function () { ok("Self-exclusion activated"); }, bad);
      } catch (x) { bad(x); }
    };
    render();
    return { tick: function () { if (tab === "verification" && S.user().kyc === "pending") render(); } };
  };
})();
