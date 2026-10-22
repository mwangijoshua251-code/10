// Browser-only "backend": accounts, trading engine, cashier and settings, persisted in localStorage.
// DEMO ONLY: passwords/balances live in the visitor's browser and no real money moves.
(function () {
  "use strict";
  var A = window.ARENA, KEY = "arena_html_v2", MARGIN = 0.04, HAIRCUT = 0.03, COMM = 0.0005;
  var MIN_STAKE = 0.35, MAX_STAKE = 5000;

  var DB = (function () {
    try { var r = JSON.parse(localStorage.getItem(KEY)); if (r && r.users) return r; } catch (e) {}
    return { users: [], otps: [], session: null, nid: 1 };
  })();
  var dirty = false;
  function save() { try { localStorage.setItem(KEY, JSON.stringify(DB)); dirty = false; } catch (e) {} }
  function nid() { return DB.nid++; }
  var r2 = function (x) { return Math.round((x + Number.EPSILON) * 100) / 100; };
  var listeners = [];
  function emit(ev) { listeners.forEach(function (f) { try { f(ev); } catch (e) {} }); }
  function fail(msg) { throw new Error(msg); }

  // ---------- crypto helpers
  function toHex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); }
  function hashPw(pw, salt) {
    var s = salt + ":" + pw;
    if (window.crypto && crypto.subtle && window.TextEncoder) return crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)).then(toHex);
    var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return Promise.resolve("f" + (h >>> 0).toString(16));
  }
  function rndStr(n, chars) { var o = ""; for (var i = 0; i < n; i++) o += chars[Math.floor(Math.random() * chars.length)]; return o; }

  // ---------- identity
  function normEmail(e) { e = String(e || "").trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : null; }
  function normPhone(p) {
    var v = String(p || "").trim().replace(/[\s\-().]/g, "");
    if (!v) return null;
    if (v.indexOf("00") === 0) v = "+" + v.slice(2);
    if (v[0] === "+") return /^\d{8,15}$/.test(v.slice(1)) ? v : null;
    if (!/^\d+$/.test(v)) return null;
    if (v[0] === "0" && v.length === 10) return "+254" + v.slice(1);
    if (v.length === 9 && /^[17]/.test(v)) return "+254" + v;
    if (v.length >= 10 && v.length <= 15) return "+" + v;
    return null;
  }
  function identify(x) {
    x = String(x || "").trim();
    if (x.indexOf("@") >= 0) { var e = normEmail(x); return e ? { kind: "email", value: e } : null; }
    var p = normPhone(x); return p ? { kind: "phone", value: p } : null;
  }
  function findUser(id) { return DB.users.filter(function (u) { return id.kind === "email" ? u.email === id.value : u.phone === id.value; })[0]; }
  function validatePw(pw) {
    if (typeof pw !== "string" || pw.length < 8) fail("Password must be at least 8 characters");
    if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw)) fail("Password must contain upper-case, lower-case letters and a number");
  }
  var attempts = {};
  function rate(key, max, ms) {
    var n = Date.now(), a = attempts[key];
    if (!a || a.reset < n) { attempts[key] = { n: 1, reset: n + ms }; return; }
    if (++a.n > max) fail("Too many attempts. Please try again in a few minutes.");
  }

  function makeOtp(target, purpose) {
    rate("otp:" + target, 5, 600000);
    var code = rndStr(6, "0123456789");
    DB.otps = DB.otps.filter(function (o) { return o.exp > Date.now() && !o.used; });
    DB.otps.push({ target: target, purpose: purpose, code: code, exp: Date.now() + 300000, used: false });
    save();
    return code; // sandbox: no SMS/email provider, so the code is returned to be displayed on screen
  }
  function checkOtp(target, purpose, code) {
    rate("otpv:" + target, 8, 600000);
    var list = DB.otps.filter(function (o) { return o.target === target && o.purpose === purpose && !o.used && o.exp > Date.now(); });
    var o = list[list.length - 1];
    if (!o || o.code !== String(code).trim()) return false;
    o.used = true; save(); return true;
  }

  var S = {};
  S.on = function (f) { listeners.push(f); return function () { listeners = listeners.filter(function (x) { return x !== f; }); }; };
  S.user = function () { return DB.users.filter(function (u) { return u.id === DB.session; })[0] || null; };
  S.accounts = function () { var u = S.user(); return u ? u.accounts : []; };
  S.active = function () { var u = S.user(); if (!u) return null; return u.accounts.filter(function (a) { return a.id === u.activeId; })[0] || u.accounts[0]; };
  S.real = function () { return S.accounts().filter(function (a) { return a.type === "real"; })[0]; };
  S.identify = identify; S.normPhone = normPhone;

  function acctFor(u, id) { return u.accounts.filter(function (a) { return a.id === id; })[0]; }
  function adj(u, acct, delta, type, desc, ref) {
    delta = r2(delta);
    if (delta < 0 && acct.balance + delta < -1e-9) return false;
    acct.balance = r2(acct.balance + delta);
    u.tx.unshift({ id: nid(), acct: acct.id, type: type, amount: delta, bal: acct.balance, desc: desc, ref: ref || null, t: Date.now() });
    if (u.tx.length > 1500) u.tx.length = 1500;
    dirty = true; return true;
  }

  // ---------- auth
  S.register = function (b) {
    var email = b.email && b.email.trim() ? normEmail(b.email) : null, phone = b.phone && b.phone.trim() ? normPhone(b.phone) : null;
    if (b.email && b.email.trim() && !email) fail("Enter a valid email address");
    if (b.phone && b.phone.trim() && !phone) fail("Enter a valid phone number including country code, e.g. +254712345678");
    if (!email && !phone) fail("Enter an email address or a phone number");
    validatePw(b.password);
    if (!b.terms) fail("Please confirm you are 18 or older and accept the terms");
    if ((email && findUser({ kind: "email", value: email })) || (phone && findUser({ kind: "phone", value: phone }))) fail("An account with those details already exists. Try logging in.");
    var salt = rndStr(16, "abcdef0123456789");
    return hashPw(b.password, salt).then(function (hash) {
      var u = { id: nid(), email: email, phone: phone, emailVerified: false, phoneVerified: false, salt: salt, pw: hash, fullName: (b.fullName || "").trim() || null, country: b.country || null, dob: null, address: null, idType: null, idNumber: null, kyc: "none", kycAt: 0, limits: {}, excludedUntil: 0, createdAt: Date.now(), activeId: 0, accounts: [], tx: [], contracts: [], payments: [], favs: [], addr: {} };
      var real = { id: nid(), loginid: "CR" + rndStr(7, "0123456789"), type: "real", balance: 0 };
      var demo = { id: nid(), loginid: "VRTC" + rndStr(7, "0123456789"), type: "demo", balance: 0 };
      u.accounts.push(real, demo); u.activeId = demo.id;
      adj(u, demo, 10000, "reset", "Virtual funds credited");
      DB.users.push(u); DB.session = u.id;
      var target = email || phone, code = makeOtp(target, "verify"); save();
      return { target: target, demoCode: code };
    });
  };
  S.login = function (identifier, password) {
    var id = identify(identifier); if (!id) fail("Enter a valid email address or phone number");
    rate("login:" + id.value, 6, 600000);
    var u = findUser(id); if (!u) fail("Incorrect email/phone or password");
    return hashPw(String(password || ""), u.salt).then(function (h) {
      if (h !== u.pw) fail("Incorrect email/phone or password");
      DB.session = u.id; delete attempts["login:" + id.value]; save(); return u;
    });
  };
  S.otpRequest = function (identifier, purpose) {
    var id = identify(identifier); if (!id) fail("Enter a valid email address or phone number");
    if (purpose === "login") { if (!findUser(id)) fail("No account found with those details"); }
    else { var u = S.user(); if (!u) fail("Please log in first"); if (u.email !== id.value && u.phone !== id.value) fail("That contact is not on your account"); }
    return makeOtp(id.value, purpose);
  };
  S.otpLogin = function (identifier, code) {
    var id = identify(identifier); if (!id) fail("Enter a valid email address or phone number");
    if (!checkOtp(id.value, "login", code)) fail("Invalid or expired code");
    var u = findUser(id); if (!u) fail("No account found");
    if (id.kind === "email") u.emailVerified = true; else u.phoneVerified = true;
    DB.session = u.id; save();
  };
  S.otpVerify = function (target, code) {
    var u = S.user(); if (!u) fail("Please log in first");
    if (!checkOtp(target, "verify", code)) fail("Invalid or expired code");
    if (u.email === target) u.emailVerified = true; if (u.phone === target) u.phoneVerified = true; save();
  };
  S.logout = function () { DB.session = null; save(); };
  S.switchAccount = function (id) { var u = S.user(); if (!acctFor(u, id)) fail("Account not found"); u.activeId = id; save(); };
  S.resetDemo = function () { var u = S.user(), d = u.accounts.filter(function (a) { return a.type === "demo"; })[0]; var delta = 10000 - d.balance; if (delta) adj(u, d, delta, "reset", "Demo balance reset"); save(); };
  S.toggleFav = function (sym) { var u = S.user(), i = u.favs.indexOf(sym); if (i >= 0) u.favs.splice(i, 1); else u.favs.push(sym); save(); };
  S.wipeAll = function () { localStorage.removeItem(KEY); DB = { users: [], otps: [], session: null, nid: 1 }; };

  // ---------- settings
  S.updateProfile = function (name, country) { var u = S.user(); u.fullName = String(name || "").trim().slice(0, 100) || null; u.country = country || null; save(); };
  S.changePassword = function (cur, next) {
    var u = S.user();
    return hashPw(String(cur || ""), u.salt).then(function (h) {
      if (h !== u.pw) fail("Current password is incorrect");
      validatePw(String(next || ""));
      u.salt = rndStr(16, "abcdef0123456789");
      return hashPw(next, u.salt).then(function (nh) { u.pw = nh; save(); });
    });
  };
  S.addContact = function (kind, value) {
    var u = S.user(), v = kind === "email" ? normEmail(value) : normPhone(value);
    if (!v) fail(kind === "email" ? "Enter a valid email" : "Enter a valid phone number with country code");
    var dup = DB.users.filter(function (x) { return x.id !== u.id && (kind === "email" ? x.email === v : x.phone === v); })[0];
    if (dup) fail("That contact is already used by another account");
    if (kind === "email") { u.email = v; u.emailVerified = false; } else { u.phone = v; u.phoneVerified = false; }
    save(); return v;
  };
  S.setLimits = function (l) {
    var u = S.user(), o = {};
    ["maxOpenPositions", "maxDailyLoss", "maxDailyTurnover", "maxStake"].forEach(function (k) {
      if (l[k] === "" || l[k] == null) return; var n = Number(l[k]); if (!isFinite(n) || n <= 0) fail("Limits must be positive numbers"); o[k] = k === "maxOpenPositions" ? Math.floor(n) : n;
    });
    u.limits = o; save();
  };
  S.exclude = function (days, password) {
    var u = S.user();
    return hashPw(String(password || ""), u.salt).then(function (h) {
      if (h !== u.pw) fail("Incorrect password");
      if ([1, 7, 30, 90, 180, 365].indexOf(Number(days)) < 0) fail("Invalid exclusion period");
      u.excludedUntil = Date.now() + days * 86400000; save();
    });
  };
  S.submitKyc = function (k) {
    var u = S.user();
    if (String(k.fullName || "").trim().length < 3 || !k.country || String(k.address || "").trim().length < 5 || !k.idType || String(k.idNumber || "").trim().length < 4) fail("Please complete all verification fields");
    var b = new Date(k.dob); if (isNaN(b.getTime()) || Date.now() - b.getTime() < 18 * 365.25 * 86400000) fail("You must be at least 18 years old");
    u.fullName = k.fullName.trim(); u.dob = k.dob; u.country = k.country; u.address = k.address.trim(); u.idType = k.idType; u.idNumber = k.idNumber.trim(); u.kyc = "pending"; u.kycAt = Date.now(); save();
  };

  // ---------- trading: pricing
  var UNIT_SEC = { s: 1, m: 60, h: 3600, d: 86400 }, UNIT_NAME = { t: ["tick", "ticks"], s: ["second", "seconds"], m: ["minute", "minutes"], h: ["hour", "hours"], d: ["day", "days"] };
  function winProb(type, o) {
    var sd = Math.max(o.sig * Math.sqrt(Math.max(o.tau, 0)), 1e-9), N = A.normCdf;
    var above = function (k) { return N(Math.log(o.spot / k) / sd); };
    var touch = function () { var k = o.barrier == null ? o.entry : o.barrier; return Math.min(1, 2 * N(-Math.abs(Math.log(k / o.spot)) / sd)); };
    var d = o.digit == null ? 0 : o.digit;
    switch (type) {
      case "CALL": return above(o.entry); case "PUT": return 1 - above(o.entry);
      case "HIGHER": return above(o.barrier == null ? o.entry : o.barrier); case "LOWER": return 1 - above(o.barrier == null ? o.entry : o.barrier);
      case "TOUCH": return touch(); case "NOTOUCH": return 1 - touch();
      case "DIGITMATCH": return 0.1; case "DIGITDIFF": return 0.9; case "DIGITEVEN": case "DIGITODD": return 0.5;
      case "DIGITOVER": return (9 - d) / 10; case "DIGITUNDER": return d / 10;
    }
    return 0.5;
  }
  function parseDur(m, cat, unit, value) {
    var u = unit || "t"; if (!UNIT_NAME[u]) fail("Invalid duration unit");
    var v = Number(value); if (!isFinite(v) || Math.floor(v) !== v || v <= 0) fail("Duration must be a whole number");
    var isDigit = cat === "matchdiff" || cat === "evenodd" || cat === "overunder";
    if (u === "t") {
      if (!m.derived) fail("Tick durations are only available on Derived markets");
      var min = cat === "updown" || isDigit ? 1 : 2; if (v < min || v > 10) fail("Ticks must be between " + min + " and 10");
      return { secs: v, unit: u, label: v + " " + UNIT_NAME.t[v === 1 ? 0 : 1] };
    }
    if (isDigit) fail("Digit contracts only support tick durations");
    var s = v * UNIT_SEC[u]; if (s < 15) fail("Minimum duration is 15 seconds"); if (s > 30 * 86400) fail("Maximum duration is 30 days");
    return { secs: s, unit: u, label: v + " " + UNIT_NAME[u][v === 1 ? 0 : 1] };
  }
  function suggest(m, spot, secs, mult) {
    var step = Math.pow(10, -m.digits), raw = spot * m.sig * Math.sqrt(Math.max(secs, 1)) * mult;
    return Math.max(step, Math.round(raw / step) * step);
  }
  function prepare(req) {
    var m = A.byId(req.symbol); if (!m) fail("Unknown market");
    var cat = A.TYPE_CAT[req.contractType]; if (!cat) fail("Unknown contract type");
    if (A.categoriesFor(m).indexOf(cat) < 0) fail(A.TYPE_LABEL[req.contractType] + " is not available on " + m.name);
    var stake = Number(req.stake);
    if (!isFinite(stake) || stake < MIN_STAKE) fail("Minimum stake is $" + MIN_STAKE.toFixed(2));
    if (stake > MAX_STAKE) fail("Maximum stake is $" + MAX_STAKE.toFixed(2));
    var S0 = m.price, t = { m: m, type: req.contractType, cat: cat, stake: r2(stake), entry: S0, payout: null, barrier: null, digit: null, g: null, mult: null, comm: null, tp: null, sl: null, label: "", unit: "t", secs: 0 };
    if (cat === "accumulator") {
      var g = Number(req.growthRate); if (A.GROWTH_RATES.indexOf(g) < 0) fail("Invalid growth rate");
      var tp = req.takeProfit ? Number(req.takeProfit) : null; if (tp !== null && (!isFinite(tp) || tp < 0.01)) fail("Invalid take profit");
      t.g = g; t.tp = tp ? r2(tp) : null; t.label = "Until knock-out / cash-out"; return t;
    }
    if (cat === "multiplier") {
      var mu = Number(req.multiplier); if (A.multipliersFor(m).indexOf(mu) < 0) fail("Invalid multiplier for this market");
      var tp2 = req.takeProfit ? Number(req.takeProfit) : null, sl = req.stopLoss ? Number(req.stopLoss) : null;
      if (tp2 !== null && (!isFinite(tp2) || tp2 < 0.01)) fail("Invalid take profit");
      if (sl !== null && (!isFinite(sl) || sl < 0.01 || sl > stake)) fail("Stop loss must be between $0.01 and your stake");
      t.mult = mu; t.comm = Math.max(0.01, r2(stake * mu * COMM)); t.tp = tp2 ? r2(tp2) : null; t.sl = sl ? r2(sl) : null; t.label = "Until closed"; return t;
    }
    var dur = parseDur(m, cat, req.durationUnit, req.duration);
    if (cat === "highlow" || cat === "touch") {
      var off = Number(req.barrierOffset); if (!isFinite(off) || off === 0) fail("Enter a non-zero barrier offset");
      t.barrier = +(S0 + off).toFixed(m.digits); if (t.barrier <= 0) fail("Barrier must be positive"); if (t.barrier === S0) fail("Barrier too close to spot");
    }
    if (cat === "matchdiff" || cat === "overunder") {
      var d = Number(req.digit); if (!isFinite(d) || Math.floor(d) !== d || d < 0 || d > 9) fail("Select a digit from 0 to 9");
      if (req.contractType === "DIGITOVER" && d > 8) fail("Over: pick a digit from 0 to 8");
      if (req.contractType === "DIGITUNDER" && d < 1) fail("Under: pick a digit from 1 to 9");
      t.digit = d;
    }
    var p = winProb(req.contractType, { spot: S0, entry: S0, barrier: t.barrier, digit: t.digit, tau: dur.secs, sig: m.sig });
    if (p < 0.03) fail("Barrier is too far from spot. Choose a closer barrier.");
    t.payout = r2(stake / (p * (1 + MARGIN)));
    if (t.payout < stake * 1.01) fail("Payout is too low for this barrier/duration. Choose a different one.");
    t.label = dur.label; t.unit = dur.unit; t.secs = dur.secs; return t;
  }
  S.proposal = function (req) {
    var m = A.byId(req.symbol), cat = A.CAT[req.category]; if (!m || !cat) fail("Unknown market");
    var secs = 60; try { secs = parseDur(m, cat.id, req.durationUnit, req.duration).secs; } catch (e) {}
    var out = { spot: m.price, suggest: { highlow: suggest(m, m.price, secs, 0.6), touch: suggest(m, m.price, secs, 1.3) }, sides: [], extra: {} };
    cat.sides.forEach(function (s) {
      try {
        var t = prepare(Object.assign({}, req, { contractType: s.type }));
        out.sides.push({ type: s.type, label: s.label, color: s.color, payout: t.payout, profit: t.payout ? r2(t.payout - t.stake) : null, pct: t.payout ? r2((t.payout / t.stake - 1) * 100) : null, error: null });
      } catch (e) { out.sides.push({ type: s.type, label: s.label, color: s.color, payout: null, profit: null, pct: null, error: e.message }); }
    });
    var stake = Number(req.stake) || 0;
    if (cat.id === "accumulator") {
      var c = A.ACCU_C[String(Number(req.growthRate) || 0.01)] || 2.3;
      out.extra = { range: m.price * m.sig * c, survival: 1 - 2 * A.normCdf(-c) };
    }
    if (cat.id === "multiplier") {
      var mu = Number(req.multiplier) || A.multipliersFor(m)[0], comm = Math.max(0.01, r2(stake * mu * COMM)), k = (stake - comm) / (stake * mu || 1);
      out.extra = { comm: comm, notional: r2(stake * mu), soUp: m.price * (1 - k), soDown: m.price * (1 + k) };
    }
    return out;
  };

  // ---------- trading: lifecycle
  function dayStart() { var d = new Date(); d.setUTCHours(0, 0, 0, 0); return d.getTime(); }
  function checkLimits(u, acct, stake) {
    var l = u.limits || {};
    if (u.excludedUntil > Date.now()) fail("Your account is self-excluded until " + new Date(u.excludedUntil).toUTCString());
    if (l.maxStake && stake > l.maxStake) fail("Stake exceeds your maximum stake limit of $" + l.maxStake);
    var mine = u.contracts.filter(function (c) { return c.acct === acct.id; });
    if (l.maxOpenPositions && mine.filter(function (c) { return c.status === "open"; }).length >= l.maxOpenPositions) fail("You have reached your limit of " + l.maxOpenPositions + " open positions");
    var ds = dayStart();
    if (l.maxDailyTurnover && mine.filter(function (c) { return c.openedAt >= ds; }).reduce(function (a, c) { return a + c.stake; }, 0) + stake > l.maxDailyTurnover) fail("This trade would exceed your daily turnover limit of $" + l.maxDailyTurnover);
    if (l.maxDailyLoss && -mine.filter(function (c) { return c.closedAt >= ds; }).reduce(function (a, c) { return a + (c.profit || 0); }, 0) >= l.maxDailyLoss) fail("You have reached your daily loss limit of $" + l.maxDailyLoss);
  }
  S.buy = function (req) {
    var u = S.user(), acct = S.active(); if (!u) fail("Please log in to continue");
    var t = prepare(req);
    if (acct.type === "real") checkLimits(u, acct, t.stake);
    else if (u.excludedUntil > Date.now()) fail("Your account is self-excluded");
    var c = { id: nid(), acct: acct.id, sym: t.m.id, name: t.m.name, digits: t.m.digits, type: t.type, cat: t.cat, stake: t.stake, payout: t.payout, entry: t.entry, barrier: t.barrier, digit: t.digit, g: t.g, mult: t.mult, comm: t.comm, tp: t.tp, sl: t.sl, label: t.label, unit: t.unit, openedAt: Date.now(), expiry: t.secs ? Date.now() + t.secs * 1000 : 0, status: "open", k: 0, prev: t.entry, exit: null, profit: null, sellPrice: null, closedAt: null };
    if (!adj(u, acct, -t.stake, "buy", "Bought " + A.TYPE_LABEL[t.type] + " on " + t.m.name, "contract:" + c.id)) fail("Insufficient balance. Deposit funds or switch to your demo account.");
    u.contracts.unshift(c); save(); return c;
  };
  function lastDigit(m, p) { return Math.round(p * Math.pow(10, m.digits)) % 10; }
  function close(u, c, status, credit, exit) {
    if (c.status !== "open") return;
    c.status = status; c.exit = exit; c.sellPrice = r2(credit); c.profit = r2(credit - c.stake); c.closedAt = Date.now();
    var acct = acctFor(u, c.acct);
    if (credit > 0 && acct) adj(u, acct, credit, status === "sold" ? "sell" : "payout", A.TYPE_LABEL[c.type] + " " + c.name + " " + (status === "sold" ? "cashed out" : status), "contract:" + c.id);
    dirty = true; if (u.id === DB.session) emit({ kind: "closed", c: c });
  }
  function profitAt(c, p) { var dir = c.type === "MULTUP" ? 1 : -1; return c.stake * c.mult * dir * (p / c.entry - 1) - c.comm; }
  function binWin(c, m, exit) {
    var d = lastDigit(m, exit);
    switch (c.type) {
      case "CALL": return exit > c.entry; case "PUT": return exit < c.entry;
      case "HIGHER": return exit > c.barrier; case "LOWER": return exit < c.barrier;
      case "DIGITMATCH": return d === c.digit; case "DIGITDIFF": return d !== c.digit;
      case "DIGITEVEN": return d % 2 === 0; case "DIGITODD": return d % 2 === 1;
      case "DIGITOVER": return d > c.digit; case "DIGITUNDER": return d < c.digit;
    }
    return false;
  }
  function stepContract(u, c, now) {
    var m = A.byId(c.sym), p = m.price;
    if (c.cat === "accumulator") {
      var cc = A.ACCU_C[String(c.g)] || 2.3;
      if (Math.abs(p - c.prev) > c.prev * m.sig * cc) return close(u, c, "lost", 0, p);
      c.k++; c.prev = p; dirty = true;
      var val = r2(c.stake * Math.pow(1 + c.g, c.k));
      if (c.tp && val - c.stake >= c.tp) close(u, c, "won", val, p);
    } else if (c.cat === "multiplier") {
      var pr = profitAt(c, p), sl = c.sl ? Math.min(c.sl, c.stake) : c.stake;
      if (pr <= -sl) close(u, c, "lost", r2(c.stake - sl), p);
      else if (c.tp && pr >= c.tp) close(u, c, "won", r2(c.stake + c.tp), p);
    } else if (c.cat === "touch") {
      var hit = c.barrier > c.entry ? p >= c.barrier : p <= c.barrier, tch = c.type === "TOUCH";
      if (hit) close(u, c, tch ? "won" : "lost", tch ? c.payout : 0, p);
      else if (now >= c.expiry) close(u, c, tch ? "lost" : "won", tch ? 0 : c.payout, p);
    } else if (now >= c.expiry) {
      var w = binWin(c, m, p); close(u, c, w ? "won" : "lost", w ? c.payout : 0, p);
    }
  }
  S.view = function (c) {
    var m = A.byId(c.sym), now = Date.now(), p = m.price, v = { spot: p, value: 0, sellable: false, left: 0, barHi: null, barLo: null };
    if (c.cat === "accumulator") {
      var half = c.prev * m.sig * (A.ACCU_C[String(c.g)] || 2.3); v.value = r2(c.stake * Math.pow(1 + c.g, c.k)); v.sellable = true; v.barHi = c.prev + half; v.barLo = c.prev - half;
    } else if (c.cat === "multiplier") { v.value = Math.max(0, r2(c.stake + profitAt(c, p))); v.sellable = true; }
    else {
      var tau = Math.max(0, (c.expiry - now) / 1000); v.left = tau;
      var pr = winProb(c.type, { spot: p, entry: c.entry, barrier: c.barrier, digit: c.digit, tau: tau, sig: m.sig });
      v.value = r2(Math.min(c.payout * 0.995, c.payout * pr * (1 - HAIRCUT)));
      v.sellable = ["updown", "highlow", "touch"].indexOf(c.cat) >= 0 && c.unit !== "t" && tau >= 10;
    }
    v.profit = r2(v.value - c.stake); return v;
  };
  S.sell = function (id) {
    var u = S.user(), c = u.contracts.filter(function (x) { return x.id === id; })[0];
    if (!c) fail("Contract not found"); if (c.status !== "open") fail("Contract is already closed");
    var v = S.view(c); if (!v.sellable) fail("This contract cannot be sold right now");
    close(u, c, "sold", v.value, v.spot); save(); return c;
  };
  S.contract = function (id) { var u = S.user(); return u.contracts.filter(function (x) { return x.id === id; })[0]; };
  S.openContracts = function () { var a = S.active(); return a ? S.user().contracts.filter(function (c) { return c.acct === a.id && c.status === "open"; }) : []; };
  S.closedContracts = function () { var a = S.active(); return S.user().contracts.filter(function (c) { return c.acct === a.id && c.status !== "open"; }).sort(function (x, y) { return y.closedAt - x.closedAt; }); };
  S.statement = function (type) { var a = S.active(); return S.user().tx.filter(function (t) { return t.acct === a.id && (!type || t.type === type); }); };

  // ---------- cashier
  var METHODS = {
    usdt_trc20: { id: "usdt_trc20", label: "USDT (TRC20)", asset: "USDT", network: "Tron (TRC20)", kind: "crypto", minD: 10, maxD: 100000, minW: 10, maxW: 50000, fee: 1, conf: 20, every: 1.5, dec: 2, icon: "₮", color: "#26a17b" },
    usdt_erc20: { id: "usdt_erc20", label: "USDT (ERC20)", asset: "USDT", network: "Ethereum (ERC20)", kind: "crypto", minD: 20, maxD: 100000, minW: 25, maxW: 50000, fee: 4, conf: 12, every: 2.5, dec: 2, icon: "₮", color: "#627eea" },
    btc: { id: "btc", label: "Bitcoin (BTC)", asset: "BTC", network: "Bitcoin", kind: "crypto", minD: 10, maxD: 100000, minW: 20, maxW: 50000, fee: 3, conf: 2, every: 12, dec: 8, icon: "₿", color: "#f7931a" },
    eth: { id: "eth", label: "Ethereum (ETH)", asset: "ETH", network: "Ethereum", kind: "crypto", minD: 10, maxD: 100000, minW: 20, maxW: 50000, fee: 2.5, conf: 12, every: 2.5, dec: 6, icon: "Ξ", color: "#8a92b2" },
    mpesa: { id: "mpesa", label: "M-Pesa", asset: "KES", network: "Safaricom M-Pesa (Kenya)", kind: "mobile", minD: 5, maxD: 1900, minW: 5, maxW: 1900, fee: 1.5, conf: 0, every: 0, dec: 2, icon: "M", color: "#4cb848" }
  };
  var KES_D = 130, KES_W = 128;
  S.METHODS = METHODS; S.KES_D = KES_D; S.KES_W = KES_W;
  S.rates = function () { return { USDT: 1, BTC: A.byId("cryBTCUSD").price, ETH: A.byId("cryETHUSD").price }; };
  function rateOf(m) { return m.asset === "USDT" ? 1 : S.rates()[m.asset]; }
  S.withdrawFee = function (m, amt) { return m.kind === "mobile" ? Math.max(0.5, r2(amt * m.fee / 100)) : m.fee; };
  function depAddr(u, m) {
    if (!u.addr[m.id]) {
      var B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz", B32 = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
      u.addr[m.id] = m.id === "usdt_trc20" ? "T" + rndStr(33, B58) : m.id === "btc" ? "bc1q" + rndStr(38, B32) : "0x" + rndStr(40, "0123456789abcdef");
    }
    return u.addr[m.id];
  }
  function validAddr(id, a) {
    if (id === "usdt_trc20") return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a);
    if (id === "usdt_erc20" || id === "eth") return /^0x[a-fA-F0-9]{40}$/.test(a);
    if (id === "btc") return /^(bc1[a-z0-9]{25,60}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(a);
    return false;
  }
  var receipt = function () { return "S" + rndStr(9, "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789"); };
  var txhash = function (id) { var h = rndStr(64, "0123456789abcdef"); return id === "btc" || id === "usdt_trc20" ? h : "0x" + h; };

  S.createDeposit = function (methodId, amountUsd, phone) {
    var u = S.user(), acct = S.active(), m = METHODS[methodId]; if (!m) fail("Unsupported payment method");
    if (acct.type !== "real") fail("Switch to your real account to make a deposit");
    var amt = r2(Number(amountUsd));
    if (!isFinite(amt) || amt < m.minD) fail("Minimum deposit for " + m.label + " is $" + m.minD.toFixed(2));
    if (amt > m.maxD) fail("Maximum deposit for " + m.label + " is $" + m.maxD.toLocaleString());
    if (u.payments.filter(function (p) { return p.dir === "deposit" && p.status === "pending"; }).length >= 5) fail("You have too many unpaid deposit requests. Complete or cancel them first.");
    var p = { id: nid(), acct: acct.id, dir: "deposit", method: m.id, amountUsd: amt, fee: 0, asset: m.asset, status: "pending", conf: 0, reqConf: m.conf, createdAt: Date.now(), sentAt: 0, completedAt: 0, note: "", address: null, phone: null, tx: null, receipt: null };
    if (m.kind === "mobile") {
      var ph = normPhone(phone || u.phone || ""); if (!ph || !/^\+254[17]\d{8}$/.test(ph)) fail("Enter a valid Safaricom number, e.g. 0712 345 678");
      p.phone = ph; p.assetAmount = Math.ceil(amt * KES_D); p.rate = KES_D; p.expiresAt = Date.now() + 120000; p.note = "STK push sent. Waiting for PIN entry on your phone.";
    } else {
      var rate = rateOf(m); p.rate = rate; p.assetAmount = +(amt / rate).toFixed(m.dec); p.address = depAddr(u, m); p.expiresAt = Date.now() + 3600000; p.note = "Waiting for your transfer. The rate is locked for 60 minutes.";
    }
    u.payments.unshift(p); save(); return p;
  };
  S.depositAction = function (id, action, pin) {
    var u = S.user(), p = u.payments.filter(function (x) { return x.id === id && x.dir === "deposit"; })[0]; if (!p) fail("Payment not found");
    var m = METHODS[p.method];
    if (action === "cancel") { if (p.status !== "pending") fail("Only unpaid requests can be cancelled"); p.status = "cancelled"; p.note = "Cancelled by you"; }
    else if (action === "pay") {
      if (p.status !== "pending") fail("This request is no longer awaiting payment");
      if (m.kind === "mobile") { if (!/^\d{4}$/.test(pin || "")) fail("Enter your 4-digit M-Pesa PIN"); p.status = "processing"; p.sentAt = Date.now(); p.note = "PIN accepted. Confirming with Safaricom..."; }
      else { p.status = "confirming"; p.sentAt = Date.now(); p.tx = txhash(m.id); p.note = "Transfer detected. Waiting for network confirmations."; }
    } else fail("Unknown action");
    save(); return p;
  };
  S.createWithdrawal = function (methodId, amountUsd, dest, password) {
    var u = S.user(), acct = S.active(), m = METHODS[methodId]; if (!m) fail("Unsupported payment method");
    if (acct.type !== "real") fail("Withdrawals are only available from your real account");
    return hashPw(String(password || ""), u.salt).then(function (h) {
      if (h !== u.pw) fail("Incorrect password");
      if (!u.emailVerified && !u.phoneVerified) fail("Verify your email or phone number before withdrawing");
      if (u.kyc !== "verified") fail("Complete identity verification (Settings → Verification) before withdrawing");
      if (u.excludedUntil > Date.now()) fail("Your account is currently self-excluded");
      var amt = r2(Number(amountUsd));
      if (!isFinite(amt) || amt < m.minW) fail("Minimum withdrawal for " + m.label + " is $" + m.minW.toFixed(2));
      if (amt > m.maxW) fail("Maximum withdrawal for " + m.label + " is $" + m.maxW.toLocaleString());
      var fee = S.withdrawFee(m, amt), net = r2(amt - fee); if (net <= 0) fail("Amount is too small to cover fees");
      var p = { id: nid(), acct: acct.id, dir: "withdrawal", method: m.id, amountUsd: amt, fee: fee, asset: m.asset, status: "pending", conf: 0, reqConf: 0, createdAt: Date.now(), sentAt: 0, completedAt: 0, address: null, phone: null, tx: null, receipt: null, note: "Awaiting review. You can cancel for the next 45 seconds." };
      if (m.kind === "mobile") { var ph = normPhone(dest); if (!ph || !/^\+254[17]\d{8}$/.test(ph)) fail("Enter a valid Safaricom number"); p.phone = ph; p.rate = KES_W; p.assetAmount = Math.floor(net * KES_W); }
      else { var a = String(dest || "").trim(); if (!validAddr(m.id, a)) fail("That is not a valid " + m.network + " address"); p.address = a; p.rate = rateOf(m); p.assetAmount = +(net / p.rate).toFixed(m.dec); }
      if (!adj(u, acct, -amt, "withdrawal", "Withdrawal via " + m.label, "payment:" + p.id)) fail("Insufficient balance");
      u.payments.unshift(p); save(); return p;
    });
  };
  S.cancelWithdrawal = function (id) {
    var u = S.user(), p = u.payments.filter(function (x) { return x.id === id && x.dir === "withdrawal"; })[0]; if (!p) fail("Payment not found");
    if (p.status !== "pending") fail("This withdrawal is already being processed and cannot be cancelled");
    p.status = "cancelled"; p.note = "Cancelled by you. Funds returned."; adj(u, acctFor(u, p.acct), p.amountUsd, "withdrawal_refund", "Withdrawal cancelled - funds returned", "payment:" + p.id); save();
  };
  S.payments = function () { return S.user().payments; };
  S.payment = function (id) { return S.user().payments.filter(function (x) { return x.id === id; })[0]; };

  function progress(u, now) {
    u.payments.forEach(function (p) {
      var m = METHODS[p.method], age = now - p.createdAt;
      if (["pending", "confirming", "processing"].indexOf(p.status) < 0) return;
      if (p.dir === "deposit") {
        if (p.status === "pending" && p.expiresAt < now) { p.status = m.kind === "mobile" ? "failed" : "expired"; p.note = m.kind === "mobile" ? "Request timed out. No PIN entered." : "Payment window expired"; dirty = true; }
        else if (p.status === "confirming") {
          var conf = Math.min(p.reqConf, Math.floor((now - p.sentAt) / (m.every * 1000)));
          if (conf >= p.reqConf) done(u, p, null); else if (conf !== p.conf) { p.conf = conf; dirty = true; }
        } else if (p.status === "processing" && now - p.sentAt >= 3000) done(u, p, receipt());
      } else {
        if (p.status === "pending" && age >= 45000) { p.status = "processing"; p.note = m.kind === "mobile" ? "Sending to M-Pesa..." : "Broadcasting transaction to the network..."; dirty = true; }
        else if (p.status === "processing" && age >= 100000) { p.status = "completed"; p.completedAt = now; p.tx = m.kind === "crypto" ? txhash(m.id) : null; p.receipt = m.kind === "mobile" ? receipt() : null; p.note = "Withdrawal sent"; dirty = true; emit({ kind: "payment", p: p }); }
      }
    });
  }
  function done(u, p, rc) {
    p.status = "completed"; p.completedAt = Date.now(); p.conf = p.reqConf; if (rc) { p.receipt = rc; p.note = "M-Pesa receipt " + rc; } else p.note = "Deposit confirmed";
    adj(u, acctFor(u, p.acct), p.amountUsd, "deposit", "Deposit via " + METHODS[p.method].label, "payment:" + p.id);
    dirty = true; if (u.id === DB.session) emit({ kind: "payment", p: p });
  }

  // ---------- tick processor
  var lastSave = 0;
  S.process = function () {
    var now = Date.now();
    DB.users.forEach(function (u) {
      u.contracts.forEach(function (c) { if (c.status === "open") { try { stepContract(u, c, now); } catch (e) { console.error(e); } } });
      progress(u, now);
      if (u.kyc === "pending" && now - u.kycAt > 15000) { u.kyc = "verified"; dirty = true; if (u.id === DB.session) emit({ kind: "kyc" }); }
    });
    if (dirty || now - lastSave > 5000) { save(); lastSave = now; }
  };
  window.STORE = S;
})();
