/* ---------- game layer: rewards follow the right behaviour (clearing reviews, mastery), not volume ----------
   XP only for first-time mastery (correct on 3 separate days) and finished lessons.
   A streak day = a session that ends with every due review cleared. */
const XP_PER_MASTERY = 10, XP_PER_LESSON = 20;

function markStudyDay(cleared) {
  if (!cleared) return;
  const d = today();
  store.days = store.days || [];
  if (!store.days.includes(d)) store.days.push(d);
}
function streak() {
  const days = new Set(store.days || []);
  let n = 0, d = clock.now();
  if (!days.has(ymd(d))) d = new Date(d.getTime() - 864e5);      // today not done yet: count up to yesterday
  while (days.has(ymd(d))) { n++; d = new Date(d.getTime() - 864e5); }
  return n;
}
const studiedToday = () => (store.days || []).includes(today());

/* the pattern map: share of each pattern's cards mastered, and learned (right once) */
function patternProgress() {
  return Object.keys(PATTERN_NAME).map(p => {
    const ids = cardsOfPattern(p);
    const learned = ids.filter(id => cardState(id) && cardState(id).days.length).length;
    return Object.assign({ id: p, name: PATTERN_NAME[p], learned }, masteryOf(ids));
  }).filter(p => p.total > 0);
}
