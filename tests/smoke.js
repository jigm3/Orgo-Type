// Phase 0 smoke test: builds must render molecules on desktop and phone, support atom taps, and work offline.
// Run: python3 build.py && node tests/smoke.js        (serves dist/ itself; screenshots go to tests/out/)
const { chromium, devices } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const DIST = path.join(__dirname, '..', 'dist'), OUT = path.join(__dirname, 'out');
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.wasm':'application/wasm', '.png':'image/png', '.webmanifest':'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(DIST, p);
  if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
const fail = m => { console.error('FAIL', m); process.exitCode = 1; };

async function run(browser, name, ctxOpts, base) {
  const ctx = await browser.newContext(ctxOpts); const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('requestfailed', r => { if (!/fonts\.(googleapis|gstatic)\.com/.test(r.url())) errors.push('request failed: ' + r.url()); });
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(base);
  await page.waitForFunction(() => document.querySelectorAll('.pcard .mol svg').length === 4, null, { timeout: 30000 });
  const paths = await page.$$eval('.pcard .mol svg', s => s.map(x => x.querySelectorAll('path').length));
  if (paths.some(n => n < 3)) fail(`${name}: a pattern molecule drew too few paths ${paths}`);
  await page.waitForSelector('#benchMol svg .hit');
  // CCC(C)=O : atom 4 is the oxygen
  await page.locator('#benchMol .hit[data-idx="4"]').click();
  const r1 = await page.textContent('#readout'); if (!/Tapped O · atom index 4/.test(r1)) fail(`${name}: tap readout "${r1}"`);
  await page.locator('.chip', { hasText: 'Mapped Grignard' }).click();
  await page.waitForFunction(() => /heavy atoms/.test(document.querySelector('#readout').textContent));
  const label = await page.$eval('#benchMol svg', s => s.textContent);
  await page.locator('#benchMol .hit[data-idx="4"]').click();
  const r2 = await page.textContent('#readout'); if (!/map 5/.test(r2)) fail(`${name}: map readout "${r2}"`);
  await page.locator('.chip', { hasText: '2-Butanone' }).click();
  await page.waitForTimeout(400);
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  // theme cycle re-renders in light colours
  await page.click('#themeBtn'); await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, `${name}-paper.png`), fullPage: true });
  await page.click('#themeBtn'); await page.click('#themeBtn'); await page.click('#themeBtn');
  // offline: wait for the service worker to take over, then reload with the network cut
  await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 30000 });
  await page.waitForFunction(async () => { const ks = await caches.keys(); if (!ks.length) return false; const c = await caches.open(ks[0]); return (await c.keys()).length >= 9; }, null, { timeout: 30000 });
  await ctx.setOffline(true); await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('.pcard .mol svg').length === 4, null, { timeout: 30000 }).catch(() => fail(`${name}: offline reload did not render`));
  const off = await page.textContent('#fOff'); if (!/ready offline/.test(off)) fail(`${name}: footer says "${off}"`);
  if (errors.length) fail(`${name}: console errors ${JSON.stringify(errors)}`);
  console.log(`${name}: ok · pattern paths ${paths} · "${r1}" · "${r2}" · ${off}`);
  await ctx.close();
}
server.listen(0, async () => {
  const base = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch();
  try {
    await run(browser, 'desktop', { viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2 }, base);
    await run(browser, 'phone', { ...devices['iPhone 13'] }, base);
  } catch (e) { fail(e.stack || e.message); }
  await browser.close(); server.close();
});
