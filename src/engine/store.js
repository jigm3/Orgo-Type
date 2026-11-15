/* ---------- store: everything the app remembers, in this browser ----------
   One JSON object in localStorage. `savedAt` stamps every save so a sync layer
   (src/engine/sync.js, Firestore sync codes like Anatomy Type) can tell which copy is newer. */
const STORE_KEY = CONTENT.dev ? "orgotype.dev.v1" : "orgotype.v1";   // the preview build keeps separate progress
const store = (() => {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) {}
  return Object.assign({ v: 1, look: { theme: "dark" }, savedAt: 0, cards: {}, lessons: {}, log: [], days: [], xp: 0, reports: [] }, s || {});
})();
const saveHooks = [];   // e.g. sync pushes a copy after each save
function save() {
  store.savedAt = Date.now();
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) {}
  saveHooks.forEach(f => { try { f(store); } catch (e) {} });
}
