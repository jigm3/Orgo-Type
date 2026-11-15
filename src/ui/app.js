/* ---------- app shell: home screen, molecule bench, theme ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---- themes (same four as Anatomy Type) ---- */
const THEMES = [["dark", "Dark"], ["paper", "Paper"], ["sage", "Sage"], ["blueprint", "Blueprint"]];
function applyTheme() {
  const t = THEMES.some(([id]) => id === store.look.theme) ? store.look.theme : "dark";
  document.documentElement.dataset.theme = t;
  $("#themeBtn").textContent = "Theme · " + THEMES.find(([id]) => id === t)[1];
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = cssVar("--bg");
}
function cycleTheme() {
  const i = THEMES.findIndex(([id]) => id === store.look.theme);
  store.look.theme = THEMES[(i + 1) % THEMES.length][0];
  save(); applyTheme(); renderAll();
}

/* ---- the four patterns, each with one example molecule and its reactive atom(s) lit ----
   Atom indices follow SMILES order. These are illustration only, not graded content. */
const PATTERNS = [
  { id: "A", name: "Nucleophilic addition", smiles: "CC(C)=O", lit: { 1: "accent" },
    text: "A nucleophile attacks the C=O carbon. Aldehydes and ketones have no leaving group, so it just adds." },
  { id: "B", name: "Nucleophilic acyl substitution", smiles: "CC(=O)Cl", lit: { 1: "accent", 3: "accent2" },
    text: "Same attack, but there's a leaving group (blue), so it adds and then eliminates." },
  { id: "C", name: "1,2 vs 1,4 addition", smiles: "C=CC(C)=O", lit: { 2: "accent", 0: "accent2" },
    text: "Enones have two electrophilic carbons: hard nucleophiles hit C=O (1,2), soft ones hit the β-carbon (1,4)." },
  { id: "D", name: "Enolate as nucleophile", smiles: "C=C(C)[O-]", lit: { 0: "accent" },
    text: "The α-carbon becomes the nucleophile, then runs pattern A, B or C (or SN2)." },
];
const litColors = lit => Object.fromEntries(Object.entries(lit).map(([i, v]) => [i, cssVar("--" + v)]));

function renderPatterns() {
  $("#patterns").innerHTML = PATTERNS.map(p => `
    <article class="pcard">
      <span class="tag">PATTERN ${p.id}</span>
      <div class="mol" id="pm${p.id}">loading…</div>
      <b>${esc(p.name)}</b>
      <p>${esc(p.text)}</p>
    </article>`).join("");
  PATTERNS.forEach(p => depict(p.smiles, { width: 240, height: 160, highlight: litColors(p.lit) })
    .then(d => { $("#pm" + p.id).innerHTML = d.svg; })
    .catch(e => { $("#pm" + p.id).innerHTML = `<span class="err">${esc(e.message)}</span>`; }));
}

/* ---- molecule bench: type or pick a SMILES, tap atoms ---- */
const PRESETS = [
  ["2-Butanone", "CCC(C)=O"],
  ["Cyclohexanone", "O=C1CCCCC1"],
  ["Ethyl acetate", "CCOC(C)=O"],
  ["Benzaldehyde", "O=Cc1ccccc1"],
  ["Mapped Grignard product", "[CH3:1][C:2]([OH:3])([CH3:4])[CH3:5]"],
];
const bench = { smiles: PRESETS[0][1], picked: -1, atoms: [] };

function renderChips() {
  $("#chips").innerHTML = PRESETS.map(([name, smi]) =>
    `<button class="chip" data-smi="${esc(smi)}" aria-pressed="${smi === bench.smiles}">${esc(name)}</button>`).join("");
}
async function renderBench() {
  const box = $("#benchMol"), out = $("#readout");
  const lit = bench.picked >= 0 ? { [bench.picked]: cssVar("--accent") } : {};
  try {
    const d = await depict(bench.smiles, { width: 480, height: 300, highlight: lit });
    bench.atoms = d.atoms;
    box.innerHTML = d.svg;
    const svg = box.querySelector("svg"), NS = "http://www.w3.org/2000/svg";
    d.atoms.forEach(a => {                       // invisible tap targets, one per atom
      const c = document.createElementNS(NS, "circle");
      c.setAttribute("cx", a.x); c.setAttribute("cy", a.y); c.setAttribute("r", 22);
      c.setAttribute("class", "hit"); c.dataset.idx = a.idx;
      c.setAttribute("aria-label", `atom ${a.idx + 1}, ${a.el}`);
      svg.appendChild(c);
    });
    const a = d.atoms[bench.picked];
    out.innerHTML = a
      ? `Tapped <b>${esc(a.el)}</b> · atom index <b>${a.idx}</b>${a.map ? ` · map <b>${a.map}</b>` : ""}`
      : `${d.n} heavy atoms · tap one`;
  } catch (e) {
    box.innerHTML = ""; out.innerHTML = `<span class="err">${esc(e.message)}</span>`;
  }
}
function setSmiles(smi) { bench.smiles = smi.trim(); bench.picked = -1; $("#smi").value = bench.smiles; renderChips(); renderBench(); }

function renderAll() { renderPatterns(); renderBench(); }

/* ---- footer status: engine version + offline readiness ---- */
function status(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(status.t); status.t = setTimeout(() => { t.hidden = true; }, 2600); }
function footer() {
  $("#fVer").textContent = "build __BUILD_ID__";
  loadRDKit().then(R => { $("#fRd").textContent = "RDKit " + R.version(); }, () => { $("#fRd").textContent = "RDKit failed to load"; });
  const off = $("#fOff");
  const upd = () => {
    const ok = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
    off.textContent = ok ? "● ready offline" : "○ not cached yet"; off.className = ok ? "on" : "";
  };
  upd();
  if (navigator.serviceWorker) navigator.serviceWorker.addEventListener("controllerchange", upd);
}

/* ---- boot ---- */
applyTheme();
$("#themeBtn").addEventListener("click", cycleTheme);
$("#chips").addEventListener("click", e => { const b = e.target.closest(".chip"); if (b) setSmiles(b.dataset.smi); });
$("#smiForm").addEventListener("submit", e => { e.preventDefault(); setSmiles($("#smi").value); });
$("#benchMol").addEventListener("click", e => {
  const h = e.target.closest(".hit"); if (!h) return;
  const i = +h.dataset.idx; bench.picked = bench.picked === i ? -1 : i; renderBench();
});
$("#smi").value = bench.smiles;
renderChips(); renderAll(); footer();

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
