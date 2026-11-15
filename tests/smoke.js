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
  // a preview card: tap the Grignard carbon (map 5) and the carbonyl carbon (map 2), then check
  await page.goto(base + 'dev/#/card/u1-grignard-ketone/where'); await page.reload();
  await page.waitForSelector('.cbody .hit[data-key="a:5"]');
  await page.locator('.cbody .hit[data-key="a:5"]').dispatchEvent('click');
  await page.locator('.cbody .hit[data-key="a:2"]').dispatchEvent('click');
  await page.click('.check');
  await page.waitForFunction(() => document.querySelector('#view').dataset.result);
  const r1 = await page.evaluate(() => document.querySelector('#view').dataset.result);
  if (r1 !== 'correct') fail(`${name}: tapping Nu then E+ graded "${r1}"`);
  const r2 = 'n/a';
  await page.goto(base); await page.waitForFunction(() => document.querySelectorAll('.pcard .mol svg').length === 4);
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  // theme cycle re-renders in light colours
  await page.goto(base + '#/settings'); await page.click('[data-theme="paper"]'); await page.goto(base); await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, `${name}-paper.png`), fullPage: true });
  await page.goto(base + '#/settings'); await page.click('[data-theme="dark"]'); await page.goto(base);
  // offline: wait for the service worker to take over, then reload with the network cut
  await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 30000 });
  await page.waitForFunction(async () => { const ks = await caches.keys(); if (!ks.length) return false; const c = await caches.open(ks[0]); return (await c.keys()).length >= 10; }, null, { timeout: 30000 });
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
