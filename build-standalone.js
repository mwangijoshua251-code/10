// Bundles docs/app.html + all its CSS/JS into ONE self-contained file:
//   docs/arena-markets-standalone.html   (open it by double-clicking — no server needed)
// Usage: node scripts/build-standalone.js
const fs = require("fs");
const path = require("path");
const docs = path.join(__dirname, "..", "docs");
let html = fs.readFileSync(path.join(docs, "app.html"), "utf8");

html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) => `<style>\n${fs.readFileSync(path.join(docs, href), "utf8")}\n</style>`);
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
  const code = fs.readFileSync(path.join(docs, src), "utf8").replace(/<\/script/gi, "<\\/script");
  return `<script>\n${code}\n</script>`;
});
html = html.replace("<body>", "<body>\n<script>window.ARENA_STANDALONE = true;</script>");
const out = path.join(docs, "arena-markets-standalone.html");
fs.writeFileSync(out, html);
console.log("Wrote", out, (html.length / 1024).toFixed(0) + " KB");
