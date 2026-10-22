(function () {
  var APP = (window.ARENA_APP_URL || "").replace(/\/$/, "");
  var NAME = window.ARENA_SITE_NAME || "Arena Markets";
  var page = (location.pathname.split("/").pop() || "index.html");
  var links = [["markets.html", "Markets"], ["trade-types.html", "Trade types"], ["payments.html", "Payments"], ["app.html#/trade", "Platform"], ["risk.html", "Risk & terms"]];
  var logo = '<a class="logo" href="index.html"><svg width="30" height="30" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#ff444f"/><path d="M7 22l6-7 4 4 8-10" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Arena<b>Markets</b></span></a>';
  var login = APP ? APP + "/login" : "app.html#/login", signup = APP ? APP + "/signup" : "app.html#/signup";
  var h = document.getElementById("site-header");
  if (h) h.outerHTML = '<header class="site"><div class="wrap">' + logo +
    '<nav class="main" id="nav">' + links.map(function (l) { return '<a href="' + l[0] + '"' + (page === l[0] ? ' class="on"' : "") + ">" + l[1] + "</a>"; }).join("") + "</nav>" +
    '<div class="actions"><a class="btn btn-ghost" href="' + login + '">Log in</a><a class="btn btn-primary" href="' + signup + '">Sign up free</a>' +
    '<button class="btn btn-ghost menu-btn" id="mb" aria-label="Menu">☰</button></div></div></header>';
  var mb = document.getElementById("mb");
  if (mb) mb.onclick = function () { document.getElementById("nav").classList.toggle("open"); };
  var f = document.getElementById("site-footer");
  if (f) f.outerHTML = '<footer class="site"><div class="wrap">' + logo +
    '<div class="links">' + links.map(function (l) { return '<a href="' + l[0] + '">' + l[1] + "</a>"; }).join("") + "</div>" +
    "<p><b style=\"color:#cbd5e1\">Risk warning:</b> Trading options and CFDs on synthetic, forex, commodity, crypto and equity markets carries a high level of risk and can result in the loss of all your invested capital. Only trade with money you can afford to lose. Prices on this website and in the platform are simulated for demonstration purposes only.</p>" +
    "<p style=\"margin-top:12px\">© " + new Date().getFullYear() + " " + NAME + ". All rights reserved.</p></div></footer>";
  document.querySelectorAll("[data-app]").forEach(function (a) { a.setAttribute("href", a.dataset.app === "login" ? login : signup); });
})();
