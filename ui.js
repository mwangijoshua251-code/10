// UI core: helpers, router, header, auth screens.
(function () {
  "use strict";
  var A = window.ARENA, S = window.STORE;
  var UI = (window.UI = { views: {}, current: null });

  var $ = (UI.$ = function (s, r) { return (r || document).querySelector(s); });
  UI.$$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  UI.esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  UI.usd = function (n, sg) { return (n < 0 ? "-" : sg && n > 0 ? "+" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  UI.fdate = function (ms) { return new Date(ms).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }); };
  UI.ftime = function (ms) { return new Date(ms).toLocaleTimeString("en-GB", { hour12: false }); };
  UI.csv = function (name, rows) {
    var t = rows.map(function (r) { return r.map(function (c) { return '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"'; }).join(","); }).join("\n");
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([t], { type: "text/csv" })); a.download = name; a.click();
  };
  UI.COUNTRIES = ["Kenya", "Uganda", "Tanzania", "Rwanda", "Nigeria", "Ghana", "South Africa", "Ethiopia", "Egypt", "Morocco", "United Kingdom", "Germany", "France", "Spain", "Italy", "Netherlands", "India", "Pakistan", "Indonesia", "Malaysia", "Thailand", "Vietnam", "Philippines", "Brazil", "Mexico", "Colombia", "Argentina", "Canada", "Australia", "United Arab Emirates", "Other"];
  UI.opts = function (list, sel) { return list.map(function (c) { return "<option" + (c === sel ? " selected" : "") + ">" + UI.esc(c) + "</option>"; }).join(""); };

  UI.toast = function (kind, title, msg) {
    var box = $("#toasts"), d = document.createElement("div");
    d.className = "t " + (kind || "info"); d.innerHTML = "<b>" + UI.esc(title) + "</b>" + (msg ? "<div>" + UI.esc(msg) + "</div>" : "");
    box.appendChild(d); while (box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(function () { d.remove(); }, 6000);
  };
  UI.modal = function (html) {
    var o = document.createElement("div"); o.className = "overlay"; o.innerHTML = '<div class="modal card">' + html + "</div>";
    o.addEventListener("mousedown", function (e) { if (e.target === o) o.remove(); });
    document.body.appendChild(o); return { el: o.firstChild, close: function () { o.remove(); } };
  };
  UI.sandbox = function (code) { return code ? '<div class="notice" style="margin:10px 0">Sandbox mode: no SMS/email provider is connected, so your code is shown here: <b class="num" style="font-size:1.1rem;letter-spacing:.2em">' + code + "</b></div>" : ""; };

  UI.verifyModal = function (target, code) {
    var m = UI.modal('<h3>Verify ' + (target.indexOf("@") >= 0 ? "email" : "phone number") + '</h3><p class="muted" style="font-size:.85rem;margin-top:4px">Enter the 6-digit code sent to <b>' + UI.esc(target) + '</b>.</p><div id="vcode">' + UI.sandbox(code) + '</div><input id="vin" class="otp" inputmode="numeric" maxlength="6" placeholder="••••••"><p class="down" id="verr" style="font-size:.85rem;margin-top:8px"></p><div style="display:flex;gap:8px;margin-top:14px"><button class="btn btn-ghost" id="vre">Resend code</button><button class="btn btn-primary" style="flex:1" id="vok">Verify</button></div>');
    $("#vin", m.el).oninput = function (e) { e.target.value = e.target.value.replace(/\D/g, ""); };
    $("#vre", m.el).onclick = function () { try { $("#vcode", m.el).innerHTML = UI.sandbox(S.otpRequest(target, "verify")); } catch (e) { $("#verr", m.el).textContent = e.message; } };
    $("#vok", m.el).onclick = function () { try { S.otpVerify(target, $("#vin", m.el).value); UI.toast("success", "Verified", target + " is now verified."); m.close(); route(); } catch (e) { $("#verr", m.el).textContent = e.message; } };
  };

  // ---------- router
  function route() {
    var p = (location.hash || "#/trade").slice(1).split("?")[0] || "/trade", u = S.user(), pub = p === "/login" || p === "/signup";
    if (!u && !pub) { location.hash = "#/login"; return; }
    if (u && pub) { location.hash = "#/trade"; return; }
    if (UI.current && UI.current.destroy) UI.current.destroy();
    UI.current = null;
    if (pub) return authView(p);
    if (!UI.views[p]) { location.hash = "#/trade"; return; }
    shell(p);
    UI.current = UI.views[p]($("#main")) || null;
  }
  UI.route = route;
  window.addEventListener("hashchange", route);

  // ---------- shell
  var NAV = [["/trade", "Trade"], ["/bots", "Bots"], ["/reports", "Reports"], ["/cashier", "Cashier"], ["/settings", "Settings"]];
  function shell(path) {
    var u = S.user(), a = S.active();
    $("#root").innerHTML =
      '<header class="site"><div class="hwrap"><a class="logo" href="#/trade"><svg width="28" height="28" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#ff444f"/><path d="M7 22l6-7 4 4 8-10" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Arena<b>Markets</b></span></a>' +
      '<nav class="main appnav">' + NAV.map(function (n) { return '<a href="#' + n[0] + '"' + (path === n[0] ? ' class="on"' : "") + ">" + n[1] + "</a>"; }).join("") + (window.ARENA_STANDALONE ? "" : '<a href="index.html">Website</a>') + '</nav>' +
      '<div class="actions" style="position:relative"><button class="bal" id="acctBtn"><span class="chip" id="hType"></span><b class="num" id="hBal"></b><span class="muted">USD ▾</span></button><a class="btn btn-primary hide-sm" href="#/cashier">Deposit</a><button class="avatar" id="userBtn">' + UI.esc((u.fullName || u.email || u.phone || "U").slice(0, 1).toUpperCase()) + '</button><div class="dd" id="dd" hidden></div></div></div></header>' +
      '<div id="banner"></div><main id="main"></main>';
    updateHeader(); banner();
    $("#acctBtn").onclick = function (e) { e.stopPropagation(); acctMenu(); };
    $("#userBtn").onclick = function (e) {
      e.stopPropagation(); var dd = $("#dd");
      dd.hidden = !dd.hidden; dd.className = "dd";
      dd.innerHTML = '<div class="ddh"><b>' + UI.esc(u.fullName || "Trader") + '</b><div class="muted" style="font-size:.75rem">' + UI.esc(u.email || u.phone) + '</div></div><a href="#/settings">Account settings</a><a href="#/reports">Reports</a><a href="#/cashier">Cashier</a><a href="#" id="lo" class="down">Log out</a>';
      $("#lo").onclick = function (ev) { ev.preventDefault(); S.logout(); location.hash = "#/login"; };
    };
  }
  function acctMenu() {
    var dd = $("#dd"); dd.hidden = !dd.hidden; dd.className = "dd wide"; var act = S.active();
    dd.innerHTML = '<div class="ddh muted" style="font-size:.7rem;text-transform:uppercase;letter-spacing:.06em">Your accounts</div>' + S.accounts().map(function (a) {
      return '<button class="acc' + (a.id === act.id ? " on" : "") + '" data-id="' + a.id + '"><span><b>' + (a.type === "real" ? "Real" : "Demo") + ' account</b><small class="muted">' + a.loginid + '</small></span><b class="num">' + UI.usd(a.balance) + "</b></button>";
    }).join("") + '<div style="display:flex;gap:8px;padding:12px;border-top:1px solid var(--line)">' + (act.type === "demo" ? '<button class="btn btn-ghost" style="flex:1;padding:6px" id="rst">Reset demo balance</button>' : '<a class="btn btn-primary" style="flex:1;padding:6px" href="#/cashier">Deposit</a>') + '<a class="btn btn-ghost" style="flex:1;padding:6px" href="#/cashier?tab=withdraw">Withdraw</a></div>';
    UI.$$(".acc", dd).forEach(function (b) { b.onclick = function () { S.switchAccount(+b.dataset.id); dd.hidden = true; route(); }; });
    var r = $("#rst"); if (r) r.onclick = function () { S.resetDemo(); dd.hidden = true; UI.toast("success", "Demo balance reset", "Your virtual balance is back to $10,000.00"); updateHeader(); if (UI.current && UI.current.tick) UI.current.tick(); };
  }
  document.addEventListener("click", function () { var d = $("#dd"); if (d) d.hidden = true; });
  function updateHeader() {
    var a = S.active(); if (!a || !$("#hBal")) return;
    $("#hBal").textContent = UI.usd(a.balance); var t = $("#hType"); t.textContent = a.type === "demo" ? "DEMO" : "REAL"; t.className = "chip " + (a.type === "demo" ? "warnchip" : "up");
  }
  UI.updateHeader = updateHeader;
  function banner() {
    var u = S.user(), b = $("#banner"); if (!b) return;
    var contact = u.email && !u.emailVerified ? u.email : u.phone && !u.phoneVerified ? u.phone : null;
    if ((u.emailVerified || u.phoneVerified) || !contact) { b.innerHTML = ""; return; }
    b.innerHTML = '<div class="notice banner">Verify your ' + (contact.indexOf("@") >= 0 ? "email" : "phone number") + ' to unlock withdrawals and secure your account. <button class="btn btn-primary" style="padding:3px 12px;font-size:.78rem" id="vnow">Verify now</button></div>';
    $("#vnow").onclick = function () { try { UI.verifyModal(contact, S.otpRequest(contact, "verify")); } catch (e) { UI.toast("error", "Could not send code", e.message); } };
  }
  UI.banner = banner;

  // ---------- auth screens
  function authShell(title, sub, body) {
    $("#root").innerHTML = '<div class="auth"><div class="auth-side"><a class="logo" href="index.html"><svg width="34" height="34" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#ff444f"/><path d="M7 22l6-7 4 4 8-10" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Arena<b>Markets</b></span></a><div><h2>Trade 75+ markets with up to <em>95% payouts</em>.</h2><ul class="ticks"><li>Synthetic indices that never sleep — 24/7/365</li><li>Forex, indices, commodities, crypto &amp; stocks</li><li>Rise/Fall, Digits, Accumulators, Multipliers &amp; more</li><li>Fund with USDT, BTC, ETH or M-Pesa — balances in USD</li></ul></div><p class="muted" style="font-size:.75rem">Trading involves significant risk and can result in the loss of your invested capital.</p></div><div class="auth-form"><div style="width:100%;max-width:420px"><h1 style="font-size:1.7rem;margin:0">' + title + '</h1><p class="muted" style="margin:4px 0 20px;font-size:.9rem">' + sub + "</p>" + body + '</div></div></div>';
  }
  function seg(items, cur) { return '<div class="seg">' + items.map(function (i) { return '<button type="button" data-v="' + i[0] + '" class="' + (cur === i[0] ? "on" : "") + '">' + i[1] + "</button>"; }).join("") + "</div>"; }
  function strength(pw) { var s = 0; if (pw.length >= 8) s++; if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++; if (/\d/.test(pw)) s++; if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 12) s++; return s; }

  function authView(p) {
    if (p === "/login") {
      var mode = "password", sent = false, ident = "", demo = "";
      var draw = function () {
        authShell("Log in", "Use your email address or phone number.",
          '<div class="note demo-note">This is the standalone HTML version: accounts are stored only in this browser. Sign up to get a demo account with $10,000.</div>' + seg([["password", "Password"], ["otp", "One-time code"]], mode) +
          '<form id="f" class="form"><div><label class="l">Email or phone number</label><input id="id" placeholder="you@example.com or +254712345678" value="' + UI.esc(ident) + '" autocomplete="username"' + (sent ? " disabled" : "") + ' required></div>' +
          (mode === "password" ? '<div><label class="l">Password</label><input id="pw" type="password" autocomplete="current-password" required></div>' : "") +
          (mode === "otp" && sent ? '<div><label class="l">6-digit code</label>' + UI.sandbox(demo) + '<input id="code" class="otp" inputmode="numeric" maxlength="6" autofocus></div>' : "") +
          '<p class="down errbox" id="err" hidden></p><button class="btn btn-primary" style="width:100%;padding:13px" id="go">' + (mode === "password" ? "Log in" : sent ? "Verify & log in" : "Send me a code") + '</button></form><p class="muted" style="text-align:center;font-size:.88rem;margin-top:22px">New to Arena Markets? <a href="#/signup" class="brandlink">Create a free account</a></p>');
        UI.$$(".seg button").forEach(function (b) { b.onclick = function () { mode = b.dataset.v; sent = false; draw(); }; });
        var cd = $("#code"); if (cd) cd.oninput = function () { cd.value = cd.value.replace(/\D/g, ""); };
        $("#f").onsubmit = function (e) {
          e.preventDefault(); var err = $("#err"); err.hidden = true; ident = $("#id").value;
          var fin = function () { location.hash = "#/trade"; }, bad = function (x) { err.textContent = x.message; err.hidden = false; };
          try {
            if (mode === "password") S.login(ident, $("#pw").value).then(fin, bad);
            else if (!sent) { demo = S.otpRequest(ident, "login"); sent = true; draw(); }
            else { S.otpLogin(ident, $("#code").value); fin(); }
          } catch (x) { bad(x); }
        };
      };
      draw();
    } else {
      var kind = "email", pwv = "";
      var draw2 = function () {
        authShell("Create your account", "Start with $10,000 in virtual funds. No card required.", seg([["email", "Email"], ["phone", "Phone number"]], kind) +
          '<form id="f" class="form"><div><label class="l">' + (kind === "email" ? "Email address" : "Phone number") + '</label><input id="val" type="' + (kind === "email" ? "email" : "tel") + '" placeholder="' + (kind === "email" ? "you@example.com" : "+254 712 345 678") + '" required></div>' +
          '<div class="two2"><div><label class="l">Full name (optional)</label><input id="nm" autocomplete="name"></div><div><label class="l">Country</label><select id="ct">' + UI.opts(UI.COUNTRIES, "Kenya") + '</select></div></div>' +
          '<div><label class="l">Password</label><input id="pw" type="password" autocomplete="new-password" value="' + UI.esc(pwv) + '" required><div class="meter"><i></i><i></i><i></i><i></i></div><p class="muted" style="font-size:.75rem;margin-top:4px">8+ characters with upper-case, lower-case and a number.</p></div>' +
          '<label class="chk"><input type="checkbox" id="tm"> I confirm that I am 18 years or older, I understand that trading involves a high risk of loss, and I accept the Terms &amp; Conditions.</label><p class="down errbox" id="err" hidden></p><button class="btn btn-primary" style="width:100%;padding:13px">Create free account</button></form><p class="muted" style="text-align:center;font-size:.88rem;margin-top:22px">Already registered? <a href="#/login" class="brandlink">Log in</a></p>');
        UI.$$(".seg button").forEach(function (b) { b.onclick = function () { pwv = $("#pw").value; kind = b.dataset.v; draw2(); }; });
        var meter = function () { var s = strength($("#pw").value); UI.$$(".meter i").forEach(function (i, n) { i.style.background = n < s ? (s <= 1 ? "var(--down)" : s <= 2 ? "var(--warn)" : "var(--up)") : "var(--line)"; }); };
        $("#pw").oninput = meter; meter();
        $("#f").onsubmit = function (e) {
          e.preventDefault(); var err = $("#err"); err.hidden = true; var d = { password: $("#pw").value, fullName: $("#nm").value, country: $("#ct").value, terms: $("#tm").checked }; d[kind] = $("#val").value;
          try { S.register(d).then(function () { location.hash = "#/trade"; }, function (x) { err.textContent = x.message; err.hidden = false; }); } catch (x) { err.textContent = x.message; err.hidden = false; }
        };
      };
      draw2();
    }
  }

  // ---------- main loop
  function boot() {
    S.on(function (ev) {
      if (ev.kind === "closed") {
        var c = ev.c, pl = c.profit || 0;
        UI.toast(pl > 0 ? "success" : pl < 0 ? "error" : "info", A.TYPE_LABEL[c.type] + " · " + c.name + ": " + (c.status === "sold" ? "cashed out" : c.status), "Profit/loss " + UI.usd(pl, true) + " (stake " + UI.usd(c.stake) + ")");
      } else if (ev.kind === "payment") {
        UI.toast("success", ev.p.dir === "deposit" ? "Deposit received" : "Withdrawal sent", UI.usd(ev.p.amountUsd) + (ev.p.dir === "deposit" ? " has been credited to your account." : " was sent."));
      } else if (ev.kind === "kyc") { UI.toast("success", "Identity verified", "You can now withdraw."); banner(); }
    });
    route();
    setInterval(function () {
      A.tickAll(); S.process();
      if (S.user()) { updateHeader(); if (UI.current && UI.current.tick) { try { UI.current.tick(); } catch (e) { console.error(e); } } }
    }, 1000);
  }
  UI.boot = boot;
})();
