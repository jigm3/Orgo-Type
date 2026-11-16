// Screenshots of chosen screens in the preview build, phone-sized. Run: node tests/shots.js <hash> [<hash> ...]
// e.g. node tests/shots.js "#/card/u1-grignard-ketone/arrows" "#/"
const { chromium, devices } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const DIST = path.join(__dirname, "..", "dist"), OUT = path.join(__dirname, "out");
const T = { ".html": "text/html", ".js": "text/javascript", ".wasm": "application/wasm", ".png": "image/png" };
const srv = http.createServer((q, s) => { let p = decodeURIComponent(new URL(q.url, "http://x").pathname); if (p.endsWith("/")) p += "index.html";
  const f = path.join(DIST, p); if (!fs.existsSync(f)) { s.writeHead(404); return s.end(); } s.writeHead(200, { "Content-Type": T[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(s); });
srv.listen(0, async () => {
  const base = `http://localhost:${srv.address().port}/dev/`;
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices["iPhone 13"] }); const p = await ctx.newPage();
  fs.mkdirSync(OUT, { recursive: true });
  await p.goto(base); await p.evaluate(() => localStorage.setItem("orgotype.dev.v1", JSON.stringify({ toured: true, placed: true })));
  for (const h of process.argv.slice(2)) {
    const [hash, action] = h.split("|");
    await p.goto(base + hash); await p.reload(); await p.waitForTimeout(1800);
    if (action) for (const a of action.split(",")) { if (a.startsWith("tap:")) await p.locator(`.hit[data-key="${a.slice(4)}"]`).first().dispatchEvent("click"); else await p.click(a).catch(() => {}); await p.waitForTimeout(300); }
    const name = hash.replace(/[^a-z0-9]+/gi, "_") + (action ? "_" + action.replace(/[^a-z0-9]+/gi, "_") : "");
    await p.screenshot({ path: path.join(OUT, `shot${name}.png`), fullPage: true });
    console.log("tests/out/shot" + name + ".png");
  }
  await b.close(); srv.close();
});
