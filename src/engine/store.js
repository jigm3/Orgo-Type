/* ---------- store: everything the app remembers, in this browser ----------
   One JSON object in localStorage. `savedAt` stamps every save so a sync layer
   (Phase 3, Firestore sync codes like Anatomy Type) can tell which copy is newer. */
const STORE_KEY = "orgotype.v1";
const store = (() => {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) {}
  return Object.assign({ v: 1, look: { theme: "dark" }, savedAt: 0 }, s || {});
})();
function save() {
  store.savedAt = Date.now();
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) {}
}
