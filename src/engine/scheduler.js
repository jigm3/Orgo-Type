/* ---------- scheduler: FSRS + successive relearning + mastery ----------
   Per card (store.cards[id]):
     f      FSRS card state (ts-fsrs), dates as ISO strings
     days   local dates on which the card was answered correctly (mastery = 3 separate days)
     right, wrong, intro (date first seen), mastered (date or null)
   A session: due reviews + up to newPerDay new cards, interleaved across patterns, with confusable
   siblings placed next to each other. A miss comes back a few cards later in the same session
   until it's answered correctly. */
const clock = { now: () => new Date() };
const pad2 = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const today = () => ymd(clock.now());
const endOfToday = () => { const d = clock.now(); return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999); };
const dayNum = s => Math.round(new Date(s + "T12:00:00").getTime() / 864e5);

const MASTERY_DAYS = 3, UNLOCK_AT = 0.6, REQUEUE_GAP = [3, 5];
const scheduler = FSRS.fsrs(FSRS.generatorParameters({ request_retention: 0.9, enable_fuzz: true, enable_short_term: false }));
const RATING = { again: FSRS.Rating.Again, hard: FSRS.Rating.Hard, good: FSRS.Rating.Good, easy: FSRS.Rating.Easy };

function settings() {
  store.settings = Object.assign({ newPerDay: 15, unlocked: {}, focus: [], focusTypes: [], covered: {} }, store.settings || {});
  return store.settings;
}
/* topic focus: which units a session draws from (empty = everything). Stored as strings ("1", "side"). */
const FOCUS_PRESETS = { all: [], orgo2: ["0", "1", "2", "3", "4", "5"], orgo1: ["side"] };
/* card-type focus: e.g. ["mechanism"] for mechanism-only practice (empty = every card type) */
const inFocus = id => {
  const f = settings().focus, ft = settings().focusTypes, { rid, type } = parseCard(id);
  return (!f.length || f.includes(String(RX[rid].unit))) && (!ft.length || ft.includes(type));
};
function cardState(id) { return (store.cards = store.cards || {})[id]; }
const reviveF = f => Object.assign({}, f, { due: new Date(f.due), last_review: f.last_review ? new Date(f.last_review) : undefined });
const freezeF = f => Object.assign({}, f, { due: f.due.toISOString(), last_review: f.last_review ? f.last_review.toISOString() : undefined });

/* ---- answering ---- */
function recordAnswer(id, rating, extra = {}) {
  const now = clock.now(), d = ymd(now);
  store.cards = store.cards || {};
  let c = store.cards[id];
  if (!c) c = store.cards[id] = { f: freezeF(FSRS.createEmptyCard(now)), days: [], right: 0, wrong: 0, intro: d, mastered: null };
  const correct = rating !== "again", first = c.last !== d;
  // Only the day's first attempt moves the FSRS schedule and counts toward mastery; a repeat after
  // a miss (successive relearning) just has to be answered correctly before the session ends.
  if (first) {
    c.f = freezeF(scheduler.next(reviveF(c.f), now, RATING[rating]).card);
    if (correct) c.days.push(d);
  }
  c.last = d;
  if (correct) c.right++; else c.wrong++;
  let newlyMastered = false;
  if (!c.mastered && c.days.length >= MASTERY_DAYS) { c.mastered = d; newlyMastered = true; }
  (store.log = store.log || []).push(Object.assign({ t: now.toISOString(), card: id, r: rating, first }, extra));
  if (store.log.length > 20000) store.log.splice(0, store.log.length - 20000);
  return { card: c, newlyMastered };
}

/* ---- mastery and unlocks ---- */
const isMastered = id => !!(cardState(id) && cardState(id).mastered);
function masteryOf(cardIds) {
  if (!cardIds.length) return { pct: 0, mastered: 0, seen: 0, total: 0 };
  const mastered = cardIds.filter(isMastered).length, seen = cardIds.filter(id => cardState(id)).length;
  return { pct: mastered / cardIds.length, mastered, seen, total: cardIds.length };
}
const cardsOfUnit = u => ALL_CARDS.filter(id => RX[parseCard(id).rid].unit === u);
const cardsOfPattern = p => ALL_CARDS.filter(id => RX[parseCard(id).rid].pattern === p);
const lessonsOfUnit = u => CONTENT.lessons.filter(l => l.unit === u);
const lessonDone = id => !!(store.lessons || {})[id];

/* Units 0, 1 and the side deck are open from the start. Unit k (2–5) opens when 60% of the cards in
   units 1..k-1 are learned (answered right on a first try at least once), or by hand. Mastery itself
   (3 separate days) takes ~2–3 weeks with proper spacing, too slow to gate a semester's units. */
const isLearned = id => !!(cardState(id) && cardState(id).days.length);
/* "Where are you in the course?": units already covered in class open straight away, their lesson is
   optional, and their cards skip the warm-up chain (where → arrows → …). */
const isCovered = u => !!(settings().covered || {})[String(u)];
function unitStatus(u) {
  if (isCovered(u)) return { open: true, covered: true };
  if (u === 0 || u === 1 || u === "side") return { open: true };
  if (settings().unlocked[u]) return { open: true, manual: true };
  const priorUnits = [1, 2, 3, 4, 5].filter(k => k < u && !isCovered(k));
  if (!priorUnits.length) return { open: true };
  const prior = priorUnits.flatMap(cardsOfUnit);
  const have = prior.length ? prior.filter(isLearned).length / prior.length : 0;
  return { open: prior.length > 0 && have >= UNLOCK_AT, need: UNLOCK_AT, have };
}
const unitOpen = u => unitStatus(u).open;
/* a unit's new cards wait until its lesson (if any) is done or skipped */
const unitReady = u => unitOpen(u) && (isCovered(u) || lessonsOfUnit(u).every(l => lessonDone(l.id)));

function cardUnlocked(id) {
  const { rid, type } = parseCard(id), r = RX[rid];
  if (!r || !unitReady(r.unit)) return false;
  const p = prereqOf(r, type);
  if (!p || isCovered(r.unit) || (settings().focusTypes || []).includes(type)) return true;   // covered units and focused practice skip the chain
  const ps = cardState(cardId(rid, p));
  return !!(ps && ps.right > 0);
}

/* ---- queue building ---- */
function introducedToday() { const d = today(); return Object.values(store.cards || {}).filter(c => c.intro === d).length; }
function dueCards(everything = false) {
  const end = endOfToday().getTime();
  return ALL_CARDS.filter(id => { const c = cardState(id); return c && (everything || inFocus(id)) && new Date(c.f.due).getTime() <= end; })
    .sort((a, b) => new Date(cardState(a).f.due) - new Date(cardState(b).f.due));
}
function newCandidates() {
  // one candidate per record (its earliest unlocked, unseen card type), in unit order
  const out = [];
  for (const r of REACTIONS) {
    const t = typesFor(r).find(t => inFocus(cardId(r.id, t)) && !cardState(cardId(r.id, t)) && cardUnlocked(cardId(r.id, t)));
    if (t) out.push(cardId(r.id, t));
  }
  const order = u => UNITS.indexOf(u);
  return out.sort((a, b) => order(RX[parseCard(a).rid].unit) - order(RX[parseCard(b).rid].unit));
}
function newCardsForToday() {
  const left = Math.max(0, settings().newPerDay - introducedToday());
  if (!left) return [];
  // round-robin across patterns so new material is mixed from day one
  const byPattern = {};
  for (const id of newCandidates()) (byPattern[RX[parseCard(id).rid].pattern] = byPattern[RX[parseCard(id).rid].pattern] || []).push(id);
  const lanes = Object.values(byPattern), out = [];
  while (out.length < left && lanes.some(l => l.length)) for (const l of lanes) if (l.length && out.length < left) out.push(l.shift());
  return out;
}

function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function shuffle(a, rnd) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* Interleave: shuffle, spread new cards among reviews, avoid the same record twice in a row,
   and pull a confusable sibling's card of the same type in right after its partner. */
function interleave(reviews, fresh, rnd) {
  shuffle(reviews, rnd);
  const q = [...reviews];
  fresh.forEach((id, i) => { const pos = Math.round((i + 1) * (q.length + 1) / (fresh.length + 1)); q.splice(Math.min(pos, q.length), 0, id); });
  for (let i = 0; i < q.length - 1; i++) {
    const a = parseCard(q[i]), conf = RX[a.rid].confusableWith || [];
    const j = q.findIndex((id, k) => k > i + 1 && conf.includes(parseCard(id).rid) && parseCard(id).type === a.type);
    if (j > 0) { const [x] = q.splice(j, 1); q.splice(i + 1, 0, x); i++; }
  }
  for (let i = 1; i < q.length; i++) {
    if (parseCard(q[i]).rid !== parseCard(q[i - 1]).rid) continue;
    const j = q.findIndex((id, k) => k > i && parseCard(id).rid !== parseCard(q[i]).rid && (k + 1 >= q.length || parseCard(q[k + 1]).rid !== parseCard(q[i]).rid));
    if (j > 0) { [q[i], q[j]] = [q[j], q[i]]; }
  }
  return q;
}

function buildSession(opts = {}) {
  const rnd = mulberry(opts.seed !== undefined ? opts.seed : clock.now().getTime());
  const reviews = dueCards().slice(0, opts.maxReviews || 200);
  const fresh = opts.noNew ? [] : newCardsForToday();
  return { queue: interleave(reviews, fresh, rnd), fresh: new Set(fresh), done: [], misses: 0, rnd, started: clock.now().getTime() };
}

/* after an answer: a miss goes back into the queue a few cards later (successive relearning) */
function afterAnswer(session, id, correct) {
  session.done.push({ id, correct });
  if (!correct) {
    session.misses++;
    const gap = REQUEUE_GAP[0] + Math.floor(session.rnd() * (REQUEUE_GAP[1] - REQUEUE_GAP[0] + 1));
    session.queue.splice(Math.min(gap - 1, session.queue.length), 0, id);
  }
}

function summary() {
  const due = dueCards().length, newLeft = newCardsForToday().length;
  return { due, newLeft, dueAll: dueCards(true).length, total: ALL_CARDS.length, mastered: ALL_CARDS.filter(isMastered).length, seen: ALL_CARDS.filter(id => cardState(id)).length };
}
