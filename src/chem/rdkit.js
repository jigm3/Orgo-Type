/* ---------- chemistry rendering: RDKit.js (MinimalLib, WASM) ----------
   Loaded lazily from vendor/rdkit and cached by the service worker for offline use.

   depict(smiles, opts) returns { svg, atoms } where
     svg   : an SVG string (no XML header), transparent background, theme colours
     atoms : [{ idx, map, el, x, y }] in the SVG's own coordinate space
   so card code can lay tap targets and (later) curved arrows on top.

   Atom-mapped SMILES ("[CH3:1][C:2](=[O:3])...") are drawn without the map labels;
   `map` carries the number and mapToIdx() resolves map → atom index.

   Layout trick: RDKit pads the drawing differently depending on which atoms are
   highlighted, so we always pass *every* atom as highlighted and make the ones we
   don't want transparent. That keeps one stable layout and gives us each atom's
   centre from its highlight ellipse. */
const RDKIT_VERSION = "__RDKIT_VERSION__";
let rdkitPromise = null;

function loadRDKit() {
  if (rdkitPromise) return rdkitPromise;
  rdkitPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "vendor/rdkit/RDKit_minimal.js?v=" + RDKIT_VERSION;
    s.onload = () => window.initRDKitModule({
      locateFile: () => "vendor/rdkit/RDKit_minimal.wasm?v=" + RDKIT_VERSION,
    }).then(resolve, reject);
    s.onerror = () => reject(new Error("Couldn't load the chemistry engine"));
    document.head.appendChild(s);
  });
  rdkitPromise.catch(() => { rdkitPromise = null; });   // allow a retry
  return rdkitPromise;
}

const hexToRgb = h => { const n = parseInt(h.replace("#", ""), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/* Element colours per theme family. Carbon uses the theme's ink so skeletons read on any background. */
function molPalette() {
  const light = document.documentElement.dataset.theme && document.documentElement.dataset.theme !== "dark";
  const c = light
    ? { O: "#c8382b", N: "#2c5fc4", S: "#9a7410", P: "#b0601a", F: "#2e8a46", Cl: "#2e8a46", Br: "#8a4a2a", I: "#7a3a9a", Mg: "#2f7a5a", Li: "#7a3a9a", Cu: "#9a5a1a" }
    : { O: "#ff8a7a", N: "#8fb8ff", S: "#e8c95a", P: "#f0a050", F: "#8fdcaa", Cl: "#8fdcaa", Br: "#e09a7a", I: "#cfa0e8", Mg: "#9fd8b8", Li: "#cfa0e8", Cu: "#e8b080" };
  const Z = { H: 1, Li: 3, B: 5, C: 6, N: 7, O: 8, F: 9, Na: 11, Mg: 12, Si: 14, P: 15, S: 16, Cl: 17, K: 19, Cu: 29, Br: 35, I: 53 };
  const ink = hexToRgb(cssVar("--soft") || "#e7e3db");
  const pal = { "-1": ink };
  for (const [el, z] of Object.entries(Z)) pal[z] = c[el] ? hexToRgb(c[el]) : ink;
  return pal;
}

/* map numbers live in the last field of each V3000 atom line */
function atomMaps(mol) {
  return mol.get_v3Kmolblock().split("\n")
    .map(l => l.match(/^M {2}V30 \d+ (\S+) \S+ \S+ \S+ (\d+)/))
    .filter(Boolean).map(m => ({ el: m[1], map: +m[2] }));
}
const stripMaps = smi => smi.replace(/(\[[^\]]*?):\d+\]/g, "$1]");

/* opts: { width, height, highlight:{idx: cssColor}, highlightBonds:{idx: cssColor} } */
async function depict(smiles, opts = {}) {
  const RDKit = await loadRDKit();
  const mapped = RDKit.get_mol(smiles);
  if (!mapped || !mapped.is_valid()) { mapped && mapped.delete(); throw new Error("Not a valid SMILES: " + smiles); }
  const info = atomMaps(mapped); mapped.delete();
  const mol = RDKit.get_mol(stripMaps(smiles));   // same atom order, no map labels drawn
  try {
    const n = mol.get_num_atoms(), all = [...Array(n).keys()], cols = {};
    const clear = [0, 0, 0, 0];
    all.forEach(i => { cols[i] = clear; });
    for (const [i, col] of Object.entries(opts.highlight || {})) cols[i] = [...hexToRgb(col), 0.45];
    const bcols = {};
    for (const [i, col] of Object.entries(opts.highlightBonds || {})) bcols[i] = [...hexToRgb(col), 0.45];
    const raw = mol.get_svg_with_highlights(JSON.stringify({
      width: opts.width || 300, height: opts.height || 200,
      atoms: all, highlightAtomColors: cols,
      bonds: Object.keys(bcols).map(Number), highlightBondColors: bcols,
      clearBackground: false, bondLineWidth: 2, padding: 0.12,
      atomColourPalette: molPalette(), highlightRadius: 0.32,
    }));
    const atoms = [...raw.matchAll(/<ellipse cx='([\d.-]+)' cy='([\d.-]+)'[^>]*class='atom-(\d+)'/g)]
      .map(m => ({ idx: +m[3], x: +m[1], y: +m[2] }))
      .sort((a, b) => a.idx - b.idx)
      .map(a => Object.assign(a, info[a.idx] || {}));
    const svg = raw.replace(/^[\s\S]*?(<svg)/, "$1").replace(/<!-- END OF HEADER -->/, "")
      .replace(/width='[\d.]+px' height='[\d.]+px'/, "");   // let CSS size it; viewBox keeps the geometry
    return { svg, atoms, n };
  } finally { mol.delete(); }
}

function mapToIdx(atoms, map) { const a = atoms.find(a => a.map === map); return a ? a.idx : -1; }
