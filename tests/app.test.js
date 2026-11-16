// End-to-end test of the preview build (dist/dev/): every card type of every reaction answered correctly
// (and some deliberately wrong), a real session from the home screen, lessons, and the check-up quiz.
// Run: python3 build.py && node tests/app.test.js [--phone] [--only <reaction-id>] [--shots]
const { chromium, devices } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const DIST = path.join(__dirname, "..", "dist"), OUT = path.join(__dirname, "out");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".wasm": "application/wasm", ".png": "image/png", ".webmanifest": "application/manifest+json", ".json": "application/json" };
const args = process.argv.slice(2), phone = args.includes("--phone"), shots = args.includes("--shots");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname); if (p.endsWith("/")) p += "index.html";
  const f = path.join(DIST, p);
  if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res);
});
let failures = 0;
const fail = m => { failures++; console.log("FAIL", m); };

/* read the compiled content straight out of the page */
const contentOf = page => page.evaluate(() => {
  const s = [...document.scripts].map(x => x.textContent).find(t => t.includes("const CONTENT = "));
  return JSON.parse(s.slice(s.indexOf("const CONTENT = ") + 16, s.indexOf(";\n/* ===== engine/store.js")));
});
const ready = page => page.waitForFunction(() => document.querySelector("#view").dataset.ready === "1", null, { timeout: 20000 });
const tap = (page, key) => page.locator(`.cbody .hit[data-key="${key}"]`).first().dispatchEvent("click");
const arrowKeys = ar => [ar.from.lonePair !== undefined ? "a:" + ar.from.lonePair : "b:" + [...ar.from.bond].sort((a, b) => a - b).join("-"),
  ar.to.atom !== undefined ? "a:" + ar.to.atom : "b:" + [...ar.to.bond].sort((a, b) => a - b).join("-")];

async function playCard(page, base, r, type, right = true) {
  await page.evaluate(() => { const v = document.querySelector("#view"); delete v.dataset.ready; delete v.dataset.result; });
  await page.goto(`${base}dev/#/card/${encodeURIComponent(r.id)}/${type}`);
  await page.evaluate(() => { const v = document.querySelector("#view"); delete v.dataset.ready; delete v.dataset.result; });
  await page.reload(); await ready(page);
  const ks = r.keyStep;
  if (type === "where") {
    await tap(page, "a:" + (right ? ks.nucleophileAtom : ks.electrophileAtom));
    await tap(page, "a:" + (right ? ks.electrophileAtom : ks.nucleophileAtom));
    await page.click(".check");
  } else if (type === "arrows") {
    if (right) for (const ar of ks.arrows) { const [t, h] = arrowKeys(ar); await tap(page, t); await tap(page, h); }
    else { const [t, h] = arrowKeys(ks.arrows[0]); await tap(page, h); await tap(page, t); }   // one arrow, backwards
    await page.click(".check");
  } else if (type === "mechanism") {
    const steps = r.mechanism.steps;
    for (let i = 0; i < steps.length; i++) {
      await page.waitForSelector(".mstep .board .hit");
      const tapStep = key => page.locator(`.mstep .board .hit[data-key="${key}"]`).first().dispatchEvent("click");
      if (right || i > 0) for (const ar of steps[i].arrows) { const [t, h] = arrowKeys(ar); await tapStep(t); await tapStep(h); }
      else { const [t, h] = arrowKeys(steps[i].arrows[0]); await tapStep(h); await tapStep(t); }
      await page.click(".check");
      if (i < steps.length - 1) await page.click(".nstep");
    }
  } else if (type === "draw" || type === "intermediates") {
    const tasks = type === "draw" ? [r._draw] : r.mechanism.steps.filter(s => s._build).map(s => s._build);
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      await page.waitForSelector(".mstep .sedit .sa, .cbody > .board .sedit .sa");
      const scope = type === "draw" ? ".cbody .board" : ".mstep .board";
      const tapAtom = m => page.locator(`${scope} .sa[data-m="${m}"]`).first().dispatchEvent("click");
      const todo = t.bonds.filter(b => !b[3]);
      const skipOne = !right && i === 0 && todo.length;
      for (const [k, b] of todo.entries()) {
        if (skipOne && k === 0) continue;
        for (let n = 0; n < b[2]; n++) { await tapAtom(b[0]); await tapAtom(b[1]); }
      }
      const charged = t.atoms.filter(a => a.c);
      if (charged.length) {
        await page.click(`${scope} [data-mode="charge"]`);
        for (const a of charged) for (let n = 0; n < (a.c === -1 ? 1 : 2); n++) await tapAtom(a.m);
      }
      if (!right && i === 0 && !todo.length) { await page.click(`${scope} [data-mode="charge"]`); await tapAtom(t.atoms[0].m); }
      await page.click(".check");
      if (type === "intermediates" && i < tasks.length - 1) await page.click(".nstep");
    }
  } else if (type === "product") {
    const opts = page.locator(".opt");
    const n = await opts.count();
    for (let i = 0; i < n; i++) {
      const smi = await opts.nth(i).getAttribute("data-smiles");
      if ((smi === r.product) === right) { await opts.nth(i).click(); break; }
    }
    await page.click(".check");
  } else if (type === "reagent") {
    await page.fill(".tin", right ? r.reagentAliases[0] : "zzz");
    await page.click(".check");
  } else if (type === "why" || type === "paper") {
    await page.click(".reveal");
    await page.click(right ? ".good" : ".again");
  } else if (type === "change") {
    for (const [a, b] of r._newCC) await tap(page, `b:${a}-${b}`);
    const n = right ? r._added : r._added + 1;
    for (let i = 0; i < n; i++) await page.click(".plus");
    await page.click(".check");
  } else if (type === "back") {
    if (r._newCC.length) await tap(page, `b:${r._newCC[0][0]}-${r._newCC[0][1]}`);
    const opts = page.locator(".opt");
    const n = await opts.count();
    for (let i = 0; i < n; i++) {
      const re = await opts.nth(i).getAttribute("data-reagent"), smi = await opts.nth(i).getAttribute("data-smiles");
      if ((re === r.reagentDisplay && smi === r._start) === right) { await opts.nth(i).click(); break; }
    }
    await page.click(".check");
  }
  await page.waitForFunction(() => document.querySelector("#view").dataset.result, null, { timeout: 5000 });
  const res = await page.evaluate(() => document.querySelector("#view").dataset.result);
  if (shots) await page.screenshot({ path: path.join(OUT, `card-${r.id}-${type}${right ? "" : "-wrong"}.png`), fullPage: true });
  return res;
}

server.listen(0, async () => {
  const base = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext(phone ? { ...devices["iPhone 13"] } : { viewport: { width: 1000, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  fs.mkdirSync(OUT, { recursive: true });
  try {
    await page.goto(base + "dev/");
    await page.waitForSelector(".today");
    const C = await contentOf(page);
    console.log(`preview build: ${C.reactions.length} reactions, ${C.lessons.length} lessons, ${C.diagnostic.length} quiz items`);

    // every card type answered correctly must grade correct
    let n = 0;
    for (const r of C.reactions.filter(r => !only || r.id === only)) {
      const skip = r.skipCards || [];
      const types = ["where", "arrows"].concat(r.mechanism ? ["mechanism"] : []).concat(r.mechanism && r.mechanism.steps.some(s => s._build) ? ["intermediates"] : [])
        .concat(["product"]).concat(r._draw ? ["draw"] : []).concat(["reagent", "why", "paper"]).concat(r._newCC.length ? ["change"] : []).concat(r.retro ? ["back"] : []).filter(t => !skip.includes(t));
      for (const t of types) {
        const res = await playCard(page, base, r, t, true).catch(e => "error: " + e.message.split("\n")[0]);
        n++;
        if (res !== "correct") fail(`${r.id} ${t}: right answer graded "${res}"`);
      }
      // and a wrong answer on the auto-graded types must grade wrong
      for (const t of ["where", "arrows", "product", "reagent"].concat(r.mechanism ? ["mechanism"] : []).concat(r._draw ? ["draw"] : [])
        .concat(r.mechanism && r.mechanism.steps.some(s => s._build) ? ["intermediates"] : []).filter(t => !skip.includes(t))) {
        const res = await playCard(page, base, r, t, false).catch(e => "error: " + e.message.split("\n")[0]);
        n++;
        if (res !== "wrong") fail(`${r.id} ${t}: wrong answer graded "${res}"`);
      }
    }
    console.log(`played ${n} cards`);

    // a real session from the home screen: answer "where" cards correctly, finish, check the streak
    if (!only || args.includes("--session")) {
      await page.goto(base + "dev/#/"); await page.evaluate(() => { localStorage.clear(); }); await page.reload();
      await page.evaluate(() => { const s = JSON.parse(localStorage.getItem("orgotype.dev.v1") || "{}"); s.toured = true; s.placed = true; localStorage.setItem("orgotype.dev.v1", JSON.stringify(s)); });
      await page.reload();
      // finish any lessons for the open units first, so their cards can start
      // play the Unit 0 lesson (taps and choices) for real; mark the others done (each was played through when written)
      for (const l of C.lessons.filter(l => l.unit === 0)) {
        await page.goto(`${base}dev/#/lesson/${encodeURIComponent(l.id)}`);
        for (let i = 0; i < 60; i++) {
          if (await page.locator(".done").count()) break;
          const nx = page.locator(".nx");
          if (await nx.count()) { await nx.click(); continue; }
          // interactive step: click something sensible
          if (await page.locator(".opt").count()) { await page.locator(".opt").first().click(); }
          else if (await page.locator(".hit").count()) { await page.locator(".hit").first().dispatchEvent("click"); }
          else if (await page.locator(".reveal").count()) { await page.click(".reveal"); }
          else if (await page.locator(".check:not([disabled])").count()) { await page.click(".check"); }
          else if (await page.locator(".tin").count()) { await page.fill(".tin", "x"); await page.click(".check"); }
          else { await page.waitForTimeout(300); }
          if (await page.locator(".check:not([disabled])").count()) await page.click(".check");
          await page.waitForTimeout(150);
        }
        if (!(await page.locator(".done").count())) fail(`lesson ${l.id} did not finish`);
      }
      await page.evaluate(ids => { const s = JSON.parse(localStorage.getItem("orgotype.dev.v1")); ids.forEach(id => { s.lessons[id] = s.lessons[id] || "2026-01-01"; }); localStorage.setItem("orgotype.dev.v1", JSON.stringify(s)); }, C.lessons.map(l => l.id));
      await page.goto(base + "dev/#/"); await page.reload();
      await page.goto(base + "dev/#/");
      await page.waitForSelector(".today .btn");
      if (shots) await page.screenshot({ path: path.join(OUT, `home${phone ? "-phone" : ""}.png`), fullPage: true });
      if (await page.locator(".start[disabled]").count()) fail("nothing to study on day one");
      else {
        await page.click(".start");
        let guard = 0;
        while (await page.locator(".card").count() && guard++ < 80) {
          await page.waitForSelector(".cact button");
          const label = await page.locator(".ctype span").nth(1).textContent();
          if (await page.locator(".cont").count()) { await page.click(".cont"); continue; }
          const id = await page.evaluate(() => location.hash);
          // answer via the same helpers: find the reaction from the title
          const hash = await page.evaluate(() => document.querySelector("#sReport") && document.querySelector("#view").dataset.card);
          const r = C.reactions.find(x => x.id === hash);
          if (/where/i.test(label)) { await ready(page); await tap(page, "a:" + r.keyStep.nucleophileAtom); await tap(page, "a:" + r.keyStep.electrophileAtom); await page.click(".check"); }
          else { fail("unexpected first-day card " + label + " " + id); break; }
          await page.waitForSelector(".cont"); await page.evaluate(() => { delete document.querySelector("#view").dataset.ready; }); await page.click(".cont");
        }
        await page.waitForSelector(".done", { timeout: 8000 }).catch(async () => { await page.screenshot({ path: path.join(OUT, "session-stuck.png"), fullPage: true }); throw new Error("session did not finish; see tests/out/session-stuck.png"); });
        const txt = await page.locator(".done").textContent();
        if (!/100% right first try/.test(txt)) fail("session summary: " + txt.replace(/\s+/g, " "));
        if (!/Streak: 1 day/.test(txt)) fail("streak not counted: " + txt.replace(/\s+/g, " "));
        console.log("session:", txt.replace(/\s+/g, " ").trim().slice(0, 120));
      }
    }
  } catch (e) { fail(e.stack || e.message); }
  if (errors.length) fail("console errors: " + JSON.stringify([...new Set(errors)].slice(0, 8)));
  await browser.close(); server.close();
  console.log(failures ? `${failures} failing` : "app test passed");
  process.exitCode = failures ? 1 : 0;
});
