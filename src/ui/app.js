/* ---------- app shell: router, theme, sound, toast, boot ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const BUILD_ID = "__BUILD_ID__";

/* ---- themes (same four as Anatomy Type) ---- */
const THEMES = [["dark", "Dark"], ["paper", "Paper"], ["sage", "Sage"], ["blueprint", "Blueprint"]];
function applyTheme() {
  const t = THEMES.some(([id]) => id === store.look.theme) ? store.look.theme : "dark";
  document.documentElement.dataset.theme = t;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = cssVar("--bg");
}

/* ---- sound: a soft chime when right, a low tick when wrong (toggle in settings) ---- */
let ac = null;
function tone(f, dur, type = "sine", vol = 0.08, delay = 0) {
  if (store.sound === false) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = f; o.connect(g); g.connect(ac.destination);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.02);
  } catch (e) {}
}
const chime = () => { tone(880, 0.25); tone(1320, 0.3, "sine", 0.06, 0.07); };
const buzz = () => { tone(150, 0.22, "triangle", 0.1); try { navigator.vibrate && navigator.vibrate(40); } catch (e) {} };

function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2600); }

/* ---- router ---- */
function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
function route() {
  const view = $("#view"), h = location.hash || "#/";
  $("#hStreak").textContent = `${streak()}-day streak`;
  $("#hXp").textContent = `${store.xp || 0} XP`;
  if (h.startsWith("#/session")) return renderSession(view);
  if (h.startsWith("#/lesson/")) return renderLesson(view, decodeURIComponent(h.slice(9)));
  if (h.startsWith("#/settings")) return renderSettings(view);
  if (h.startsWith("#/diag")) return renderDiag(view, h.split("/")[2]);
  if (h.startsWith("#/bench") && CONTENT.dev) return renderBench(view);
  if (h.startsWith("#/card/") && CONTENT.dev) { const [, , rid, type] = h.slice(1).split("/"); return renderPreview(view, decodeURIComponent(rid), type); }
  S = null;
  renderHome(view);
  setTimeout(maybeTour, 400);
}

/* ---- boot ---- */
applyTheme();
addEventListener("hashchange", () => { route(); scrollTo(0, 0); });
route();
loadRDKit().catch(() => toast("Couldn't load the chemistry engine. Check your connection and reload."));
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  addEventListener("load", () => navigator.serviceWorker.register("__BASE__sw.js", { scope: "__BASE__" }).catch(() => {}));
  navigator.serviceWorker.addEventListener("controllerchange", () => offlineStatus());
}
