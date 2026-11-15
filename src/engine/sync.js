/* ---------- sync codes: the same progress on every device, no account (same idea as Anatomy Type) ----------
   Progress is stored in Firestore at sync/{CODE} through the REST API. Anyone with the code can read and
   write that one document, so the code is the secret: 12 characters from a 32-letter alphabet.
   FIREBASE comes from firebase.config.json at build time; without it, sync is switched off. */
const FIREBASE = __FIREBASE__;
const SYNC_KEY = CONTENT.dev ? "orgotype.dev.sync" : "orgotype.sync";
const syncOn = () => !!(FIREBASE && FIREBASE.projectId && FIREBASE.apiKey) && /^https?:$/.test(location.protocol);
const sync = { code: (() => { try { return localStorage.getItem(SYNC_KEY) || ""; } catch (e) { return ""; } })(), busy: false, err: "", at: 0, t: 0 };
const plainCode = c => String(c).toUpperCase().replace(/[^A-Z0-9]/g, "");
const prettyCode = c => plainCode(c).replace(/(.{4})(?=.)/g, "$1-");
function newCode() { const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", r = crypto.getRandomValues(new Uint8Array(12)); return [...r].map(x => A[x % A.length]).join(""); }
const fsBase = () => `https://firestore.googleapis.com/v1/projects/${FIREBASE.projectId}/databases/(default)/documents`;
const docURL = c => `${fsBase()}/${CONTENT.dev ? "syncdev" : "sync"}/${plainCode(c)}?key=${FIREBASE.apiKey}`;
const SYNCED = ["cards", "lessons", "days", "xp", "reports", "diag", "name", "log", "toured"];

/* merge a remote copy into the local store: per card keep the more recently reviewed copy, union the rest */
function mergeStores(L, R) {
  if (!R) return L;
  L.cards = L.cards || {};
  for (const [id, rc] of Object.entries(R.cards || {})) {
    const lc = L.cards[id];
    if (!lc) { L.cards[id] = rc; continue; }
    const lt = new Date(lc.f.last_review || 0).getTime(), rt = new Date(rc.f.last_review || 0).getTime();
    const pick = rt > lt ? rc : lc;
    const mastered = [lc.mastered, rc.mastered].filter(Boolean).sort()[0] || null;
    L.cards[id] = Object.assign({}, pick, {
      days: [...new Set([...(lc.days || []), ...(rc.days || [])])].sort(),
      right: Math.max(lc.right || 0, rc.right || 0), wrong: Math.max(lc.wrong || 0, rc.wrong || 0),
      intro: [lc.intro, rc.intro].filter(Boolean).sort()[0], mastered,
    });
  }
  L.lessons = Object.assign({}, R.lessons || {}, L.lessons || {});
  L.days = [...new Set([...(L.days || []), ...(R.days || [])])].sort();
  L.xp = Math.max(L.xp || 0, R.xp || 0);
  const byKey = (arr, k) => Object.values(Object.fromEntries((arr || []).map(x => [x[k] + (x.card || ""), x])));
  L.reports = byKey([...(L.reports || []), ...(R.reports || [])], "at").sort((a, b) => a.at < b.at ? -1 : 1);
  L.log = byKey([...(L.log || []), ...(R.log || [])], "t").sort((a, b) => a.t < b.t ? -1 : 1).slice(-20000);
  L.diag = Object.assign({}, R.diag || {}, L.diag || {});
  L.name = L.name || R.name;
  L.toured = L.toured || R.toured;
  return L;
}

async function pull() {
  const r = await fetch(docURL(sync.code));
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("couldn't reach sync (" + r.status + ")");
  const doc = await r.json();
  return JSON.parse(doc.fields.json.stringValue);
}
async function push() {
  const body = Object.fromEntries(SYNCED.map(k => [k, store[k]]));
  const r = await fetch(docURL(sync.code), { method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { json: { stringValue: JSON.stringify(body) }, savedAt: { integerValue: String(Date.now()) } } }) });
  if (!r.ok) throw new Error("couldn't save to sync (" + r.status + ")");
}
async function syncNow() {
  if (!syncOn() || !sync.code || sync.busy) return;
  sync.busy = true; sync.err = "";
  try { mergeStores(store, await pull()); store.savedAt = Date.now(); localStorage.setItem(STORE_KEY, JSON.stringify(store)); await push(); sync.at = Date.now(); }
  catch (e) { sync.err = e.message; }
  sync.busy = false;
  const box = document.getElementById("syncBox"); if (box) renderSyncBox(box);
}
saveHooks.push(() => { if (!syncOn() || !sync.code) return; clearTimeout(sync.t); sync.t = setTimeout(() => push().then(() => { sync.at = Date.now(); }, e => { sync.err = e.message; }), 1500); });

/* reports also go to a shared collection so reviewers see them without an export */
function syncReport(rep) {
  if (!syncOn()) return;
  fetch(`${fsBase()}/reports?key=${FIREBASE.apiKey}`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(Object.assign({ preview: String(!!CONTENT.dev) }, rep)).map(([k, v]) => [k, { stringValue: String(v) }])) }) }).catch(() => {});
}

function renderSyncBox(box) {
  if (!syncOn()) { box.innerHTML = `<p class="mute">Sync isn't set up for this site yet. Progress stays in this browser; use Export to move it.</p>`; return; }
  if (!sync.code) {
    box.innerHTML = `<p class="mute">Make a sync code here, then enter it on your other device. Anyone with the code can see and change this progress, so keep it private.</p>
      <div class="actions">${btn("Make a sync code", "primary mk")}</div>
      <form class="smirow" id="codeForm"><input id="codeIn" placeholder="Have a code? XXXX-XXXX-XXXX" autocapitalize="characters" autocomplete="off" aria-label="Sync code"><button class="btn">Use code</button></form>`;
    box.querySelector(".mk").onclick = () => { sync.code = newCode(); localStorage.setItem(SYNC_KEY, sync.code); syncNow(); renderSyncBox(box); };
    box.querySelector("#codeForm").onsubmit = e => { e.preventDefault(); const c = plainCode($("#codeIn").value); if (c.length !== 12) return toast("Codes have 12 letters and numbers"); sync.code = c; localStorage.setItem(SYNC_KEY, c); syncNow(); renderSyncBox(box); };
    return;
  }
  box.innerHTML = `<p>Your sync code: <code class="code">${prettyCode(sync.code)}</code></p>
    <p class="mute">${sync.busy ? "Syncing…" : sync.err ? `<span class="err">${esc(sync.err)}</span>` : sync.at ? "Synced " + new Date(sync.at).toLocaleTimeString() : ""}</p>
    <div class="actions">${btn("Sync now", "now")}${btn("Stop syncing on this device", "stop")}</div>`;
  box.querySelector(".now").onclick = syncNow;
  box.querySelector(".stop").onclick = () => { sync.code = ""; localStorage.removeItem(SYNC_KEY); renderSyncBox(box); };
}
if (syncOn() && sync.code) { syncNow().then(() => { if (!location.hash || location.hash === "#/") route(); }); addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") syncNow(); }); }
