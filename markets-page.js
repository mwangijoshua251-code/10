(function () {
  var A = window.ARENA, groups = ["All", "Derived", "Forex", "Stock Indices", "Commodities", "Cryptocurrencies", "Stocks"], cur = "All";
  var tabs = document.getElementById("mtabs"), rows = document.getElementById("mrows");
  function draw() {
    tabs.innerHTML = groups.map(function (g) { return '<button class="' + (g === cur ? "on" : "") + '" data-g="' + g + '">' + g + "</button>"; }).join("");
    tabs.querySelectorAll("button").forEach(function (b) { b.onclick = function () { cur = b.dataset.g; draw(); }; });
    paint();
  }
  function paint() {
    rows.innerHTML = A.markets.filter(function (m) { return cur === "All" || m.market === cur; }).map(function (m) {
      var c = A.chg(m);
      return "<tr><td><b>" + m.name + '</b></td><td class="muted">' + m.sub + '</td><td class="muted">' + m.id + '</td><td class="num ' + (m.price >= m.prev ? "up" : "down") + '" style="text-align:right">' + A.fmt(m, m.price) + '</td><td class="num ' + (c >= 0 ? "up" : "down") + '" style="text-align:right">' + (c >= 0 ? "+" : "") + c.toFixed(2) + "%</td></tr>";
    }).join("");
  }
  draw(); setInterval(function () { A.markets.forEach(A.step); paint(); }, 1500);
})();
