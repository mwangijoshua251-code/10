(function () {
  var A = window.ARENA; if (!A) { var s = document.createElement("script"); s.src = "assets/markets-data.js"; s.onload = start; document.head.appendChild(s); } else start();
  function start() {
    A = window.ARENA;
    var F = ["R_100", "BOOM1000", "CRASH500", "frxEURUSD", "frxGBPUSD", "frxXAUUSD", "cryBTCUSD", "cryETHUSD", "OTC_NDX", "OTC_NVDA", "OTC_TSLA"].map(A.byId).filter(Boolean);
    var snap = document.getElementById("snap"), tick = document.getElementById("tick");
    function render() {
      F.forEach(function (m) { A.step(m); });
      if (snap) snap.innerHTML = F.slice(0, 8).map(function (m) { var c = A.chg(m); return '<div class="card"><div class="muted" style="font-size:.75rem">' + m.name + '</div><div class="p num ' + (m.price >= m.prev ? "up" : "down") + '">' + A.fmt(m, m.price) + '</div><div class="num ' + (c >= 0 ? "up" : "down") + '" style="font-size:.75rem">' + (c >= 0 ? "+" : "") + c.toFixed(2) + "%</div></div>"; }).join("");
      if (tick) tick.innerHTML = F.map(function (m) { var c = A.chg(m); return '<div><span class="muted">' + m.name + '</span><b class="num ' + (m.price >= m.prev ? "up" : "down") + '">' + A.fmt(m, m.price) + '</b><span class="num ' + (c >= 0 ? "up" : "down") + '">' + (c >= 0 ? "▲" : "▼") + " " + Math.abs(c).toFixed(2) + "%</span></div>"; }).join("");
    }
    render(); setInterval(render, 1500);
  }
})();
