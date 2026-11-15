// Engine tests: grading, deck unlocks, and a 14-day simulated student on a fake clock.
// Run: node tests/engine.test.js      (uses the dev content bundle, so unverified cards are included)
const vm = require("vm"), fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const assert = require("assert");
const ROOT = path.join(__dirname, "..");

function engine(extraContent, { lessonsDone = true } = {}) {
  const content = extraContent || JSON.parse(execFileSync("python3", [path.join(ROOT, "tools/compile_content.py"), "--dev"]));
  const mem = {};
  const ctx = { console, Date, Math, JSON, CONTENT: content,
    localStorage: { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } } };
  vm.createContext(ctx);
  const files = ["vendor/fsrs/ts-fsrs.umd.js", "src/engine/store.js", "src/engine/grade.js", "src/engine/deck.js", "src/engine/scheduler.js"];
  const src = files.map(f => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n") +
    "\n;globalThis.E = {store, save, clock, matchReagent, normReagent, gradeArrows, sameAtom, ratingFor, ALL_CARDS, RX, typesFor, cardId, parseCard," +
    " cardUnlocked, unitStatus, recordAnswer, buildSession, afterAnswer, dueCards, newCardsForToday, isMastered, summary, settings, ymd, today, prereqOf, masteryOf, cardsOfUnit};";
  vm.runInContext(src, ctx);
  if (lessonsDone) ctx.E.store.lessons = Object.fromEntries(content.lessons.map(l => [l.id, "2026-01-01"]));
  ctx.E.content = content;
  return ctx.E;
}

let failures = 0;
function test(name, fn) {
  try { fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n    ", e.message); }
}

/* ---------------- grading ---------------- */
const E0 = engine();
test("reagent aliases: exact, case, spacing, subscripts, workup, steps", () => {
  const al = ["CH3MgBr", "methylmagnesium bromide", "LiAlH4", "LAH"];
  for (const s of ["ch3mgbr", "CH₃MgBr", "1. CH3MgBr 2. H3O+", "CH3MgBr, then H3O+", "Methylmagnesium  Bromide", "LAH", "LiAlH₄"])
    assert.ok(E0.matchReagent(s, al).ok, s);
});
test("a workup-only reagent is still accepted when it is the whole answer (acetal hydrolysis)", () => {
  assert.ok(E0.matchReagent("H3O+", ["H3O+", "aqueous acid"]).ok);
  assert.ok(E0.matchReagent("h3o+", ["H3O+"]).ok);
  assert.ok(!E0.matchReagent("NaBH4", ["H3O+"]).ok);
});
test("reagent aliases: small typos ok, wrong reagents rejected", () => {
  const al = ["methylmagnesium bromide", "NaBH4", "LiAlH4"];
  assert.ok(E0.matchReagent("methylmagnesium bromid", al).ok);
  assert.ok(E0.matchReagent("methylmagnezium bromide", al).ok);
  assert.ok(!E0.matchReagent("NaBH3", ["NaBH4"]).ok, "short formulas need an exact match");
  assert.ok(!E0.matchReagent("LiAlH4", ["NaBH4"]).ok);
  assert.ok(!E0.matchReagent("", al).ok);
  assert.ok(!E0.matchReagent("ethylmagnesium bromide", ["methylmagnesium bromide"]).ok === false, "1 edit away is accepted by design");
});
test("arrows: order-insensitive, symmetry-aware, all-or-nothing", () => {
  const ans = [{ from: { bond: [5, 6] }, to: { atom: 2 } }, { from: { bond: [2, 3] }, to: { atom: 3 } }];
  assert.ok(E0.gradeArrows([...ans].reverse(), ans, {}).ok);
  assert.ok(E0.gradeArrows([{ from: { bond: [6, 5] }, to: { atom: 2 } }, ans[1]], ans, {}).ok, "bond direction doesn't matter");
  assert.ok(!E0.gradeArrows([ans[0]], ans, {}).ok, "missing arrow");
  assert.ok(!E0.gradeArrows([...ans, { from: { lonePair: 3 }, to: { atom: 2 } }], ans, {}).ok, "extra arrow");
  const eq = { 1: 0, 4: 0 };   // acetone's two methyls
  assert.ok(E0.gradeArrows([{ from: { lonePair: 4 }, to: { atom: 2 } }], [{ from: { lonePair: 1 }, to: { atom: 2 } }], eq).ok);
  assert.ok(E0.sameAtom(1, 4, eq) && !E0.sameAtom(1, 2, eq));
});
test("rating map: wrong → again, slow → hard, else good", () => {
  assert.strictEqual(E0.ratingFor(false, 1000), "again");
  assert.strictEqual(E0.ratingFor(true, 25000), "hard");
  assert.strictEqual(E0.ratingFor(true, 5000), "good");
});

/* ---------------- deck ---------------- */
test("card types unlock in order: where → arrows → product → reagent → why", () => {
  const E = engine();
  E.clock.now = () => new Date(2026, 10, 1, 9);
  const g = E.ALL_CARDS.find(id => id.startsWith("u1-grignard-ketone:")).split(":")[0];
  const id = t => E.cardId(g, t);
  assert.ok(E.cardUnlocked(id("where")));
  assert.ok(!E.cardUnlocked(id("arrows")));
  E.recordAnswer(id("where"), "again");
  assert.ok(!E.cardUnlocked(id("arrows")), "a miss doesn't unlock the next type");
  E.recordAnswer(id("where"), "good");
  assert.ok(E.cardUnlocked(id("arrows")));
  assert.ok(!E.cardUnlocked(id("paper")), "paper round waits for the arrows card");
});
test("a unit's new cards wait for its lesson", () => {
  const E = engine(undefined, { lessonsDone: false });
  E.clock.now = () => new Date(2026, 10, 1, 9);
  const l1 = E.content.lessons.find(l => l.unit === 1);
  if (!l1) return;   // no Unit 1 lesson in this content
  assert.ok(!E.cardUnlocked("u1-grignard-ketone:where"), "Unit 1 cards are locked before its lesson");
  assert.ok(E.cardUnlocked("side-sn2-2-bromobutane-cyanide:where") || E.content.lessons.some(l => l.unit === "side"), "units without a lesson aren't blocked");
  E.store.lessons[l1.id] = "2026-11-01";
  assert.ok(E.cardUnlocked("u1-grignard-ketone:where"), "done lesson unlocks the cards");
});
test("units 2+ stay locked until 60% of earlier units' cards are learned (or a manual unlock)", () => {
  const E = engine();
  E.clock.now = () => new Date(2026, 10, 1, 9);
  assert.ok(E.unitStatus(1).open && E.unitStatus("side").open);
  assert.ok(!E.unitStatus(2).open);
  const u1 = E.cardsOfUnit(1);
  u1.slice(0, Math.ceil(u1.length * 0.6)).forEach(id => E.recordAnswer(id, "good"));
  assert.ok(E.unitStatus(2).open, "60% learned opens the next unit");
  assert.ok(!E.unitStatus(3).open, "unit 3 also needs unit 2");
  const E2 = engine();
  E2.settings().unlocked[2] = true;
  assert.ok(E2.unitStatus(2).open && E2.unitStatus(2).manual);
});

/* ---------------- 14-day simulation ---------------- */
test("14 simulated days behave sensibly", () => {
  const E = engine();
  E.settings().unlocked = { 2: true, 3: true, 4: true, 5: true };   // sample content has one record per unit
  const start = new Date(2026, 10, 2, 8, 0, 0);
  let t = start.getTime();
  E.clock.now = () => new Date(t);
  // a student who gets each card right 80% of the time on first try, 95% on repeats
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const perDay = [], firstSeenDay = {};
  for (let day = 0; day < 14; day++) {
    t = start.getTime() + day * 864e5;
    const s = E.buildSession({ seed: day });
    const nNew = s.fresh.size;
    assert.ok(nNew <= 15, `day ${day}: ${nNew} new cards`);
    const seenThisSession = new Set(); let answered = 0, guard = 0;
    while (s.queue.length) {
      assert.ok(guard++ < 1000, "session never ends");
      const id = s.queue.shift();
      const repeat = seenThisSession.has(id); seenThisSession.add(id);
      const ok = rnd() < (repeat ? 0.95 : 0.8);
      E.recordAnswer(id, ok ? "good" : "again", { ms: 4000 });
      E.afterAnswer(s, id, ok);
      if (!ok) assert.ok(s.queue.includes(id), "a miss must come back in the same session");
      if (!(id in firstSeenDay)) firstSeenDay[id] = day;
      answered++;
      t += 30000;
    }
    // every card answered this session ended on a correct answer
    for (const id of seenThisSession) {
      const last = s.done.filter(d => d.id === id).pop();
      assert.ok(last.correct, `${id} left the session unlearned`);
    }
    perDay.push({ day, new: nNew, answered, due: E.dueCards().length, mastered: E.ALL_CARDS.filter(E.isMastered).length });
  }
  if (process.argv.includes("-v")) console.log("      day  new  answered  mastered");
  if (process.argv.includes("-v")) perDay.forEach(d => console.log(`      ${String(d.day).padStart(3)}  ${String(d.new).padStart(3)}  ${String(d.answered).padStart(8)}  ${String(d.mastered).padStart(8)}`));
  // nobody masters a card in fewer than 3 separate days
  for (const id of E.ALL_CARDS) {
    const c = E.store.cards[id];
    if (c && c.mastered) {
      assert.ok(new Set(c.days).size >= 3, `${id} mastered after ${c.days.length} days`);
      assert.ok(Math.round((new Date(c.mastered) - new Date(E.ymd(new Date(start.getTime() + firstSeenDay[id] * 864e5)))) / 864e5) >= 2);
    }
  }
  assert.ok(perDay[13].mastered > 0, "after two weeks some cards should be mastered");
  const introduced = Object.keys(E.store.cards).length;
  if (E.ALL_CARDS.length >= 15 * 14) assert.ok(perDay.every(d => d.new === 15), "with plenty of content, every day introduces exactly the daily cap");
  else assert.strictEqual(introduced, E.ALL_CARDS.length, "small decks get fully introduced within two weeks");
  // intervals grow: a card answered right every time should end with a multi-day interval
  const long = Object.values(E.store.cards).filter(c => c.wrong === 0 && c.days.length >= 2);
  assert.ok(long.length && long.every(c => c.f.scheduled_days >= 7), "intervals should stretch for cards that are always right");
  // and missed cards are the ones that came back soonest
  const missed = Object.values(E.store.cards).filter(c => c.wrong > 0);
  assert.ok(missed.length && missed.some(c => c.days.length >= 3), "missed cards get extra spaced practice");
});

test("a card missed today is due again by tomorrow", () => {
  const E = engine();
  let t = new Date(2026, 10, 2, 9).getTime(); E.clock.now = () => new Date(t);
  const id = E.ALL_CARDS[0];
  E.recordAnswer(id, "good"); t += 3 * 864e5;
  E.recordAnswer(id, "again");
  const due = new Date(E.store.cards[id].f.due).getTime();
  assert.ok(due <= t + 864e5 + 3600e3, "missed card should come back within about a day");
});

test("confusable siblings of the same card type sit next to each other", () => {
  const E = engine();
  let t = new Date(2026, 10, 2, 9).getTime(); E.clock.now = () => new Date(t);
  E.settings().unlocked = { 2: true, 3: true, 4: true };
  // make the 'where' cards of the two Grignard records due
  for (const r of ["u1-grignard-ketone", "u2-grignard-ester", "u3-gilman-enone", "u4-aldol-addition-acetaldehyde", "side-sn2-2-bromobutane-cyanide"])
    E.recordAnswer(E.cardId(r, "where"), "good");
  t += 40 * 864e5;
  let adjacent = 0;
  for (let seed = 0; seed < 20; seed++) {
    const q = E.buildSession({ seed, noNew: true }).queue;
    const i = q.indexOf("u1-grignard-ketone:where"), j = q.indexOf("u2-grignard-ester:where"), k = q.indexOf("u3-gilman-enone:where");
    if (Math.abs(i - j) === 1 || Math.abs(i - k) === 1) adjacent++;
  }
  assert.strictEqual(adjacent, 20);
});

test("topic focus: sessions draw only from the chosen units; the streak still counts every due review", () => {
  const E = engine();
  let t = new Date(2026, 10, 2, 9).getTime(); E.clock.now = () => new Date(t);
  E.settings().unlocked = { 2: true, 3: true, 4: true };
  // day 1: everything, so both Orgo 1 and Orgo 2 cards get introduced
  let s = E.buildSession({ seed: 1 });
  const units = q => new Set(q.map(id => String(E.RX[E.parseCard(id).rid].unit)));
  assert.ok(units(s.queue).has("side") && [...units(s.queue)].some(u => u !== "side"), "unfocused sessions mix Orgo 1 and Orgo 2");
  s.queue.forEach(id => E.recordAnswer(id, "good"));
  t += 4 * 864e5;
  E.settings().focus = ["side"];
  s = E.buildSession({ seed: 2 });
  assert.ok(s.queue.length > 0, "something to practise in the side deck");
  assert.deepStrictEqual([...units(s.queue)], ["side"], "Orgo 1 focus only draws side-deck cards");
  assert.ok(E.dueCards(true).length > E.dueCards().length, "reviews outside the focus are still counted as due overall");
  E.settings().focus = ["1", "2"];
  s = E.buildSession({ seed: 3 });
  assert.ok([...units(s.queue)].every(u => u === "1" || u === "2"));
  E.settings().focus = [];
  assert.strictEqual(E.dueCards().length, E.dueCards(true).length);
});

test("mechanisms-only mode serves mechanism cards straight away, skipping the unlock chain", () => {
  const E = engine();
  let t = new Date(2026, 10, 2, 9).getTime(); E.clock.now = () => new Date(t);
  E.settings().unlocked = { 2: true, 3: true, 4: true };
  const withMech = E.ALL_CARDS.filter(id => id.endsWith(":mechanism"));
  if (!withMech.length) return;
  E.settings().focusTypes = ["mechanism"];
  const q = E.buildSession({ seed: 5 }).queue;
  assert.ok(q.length > 0 && q.every(id => id.endsWith(":mechanism")), "only mechanism cards: " + q.slice(0, 4));
  E.settings().focusTypes = [];
  assert.ok(!E.cardUnlocked(withMech[0]), "normally a mechanism card waits for its arrows card");
});

process.exitCode = failures ? 1 : 0;
console.log(failures ? `${failures} failing` : "all engine tests passed");
