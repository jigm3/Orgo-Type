/* ---------- molecule panel: one RDKit drawing + an overlay for taps, marks and curved arrows ----------
   Targets are keyed by atom-map number: atoms "a:5", bonds "b:2-3" (sorted). Unmapped molecules
   (wrong-answer options) get no targets. */
const SVGNS = "http://www.w3.org/2000/svg";
const svgEl = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
};
const bondKey = (m1, m2) => "b:" + [m1, m2].sort((x, y) => x - y).join("-");

async function molPanel(host, smiles, opts = {}) {
  const w = opts.width || 360, h = opts.height || 220;
  host.classList.add("mol");
  host.innerHTML = '<span class="molwait">drawing…</span>';
  const d = await depict(smiles, { width: w, height: h, bondLength: opts.bondLength });
  host.innerHTML = d.svg;
  const svg = host.querySelector("svg");
  svg.setAttribute("role", "img");
  if (opts.label) svg.setAttribute("aria-label", opts.label);
  const defs = svgEl("defs", {}, svg);
  for (const cls of ["user", "ok", "bad", "show"]) {
    const m = svgEl("marker", { id: `ah-${cls}-${molPanel.n = (molPanel.n || 0) + 1}`, viewBox: "0 0 10 10", refX: "8", refY: "5", markerWidth: "7", markerHeight: "7", orient: "auto-start-reverse" }, defs);
    svgEl("path", { d: "M0,0 L10,5 L0,10 z", class: "ahead " + cls }, m);
    defs.dataset[cls] = m.id;
  }
  const gMarks = svgEl("g", { class: "marks" }, svg), gArrows = svgEl("g", { class: "arrows" }, svg), gHits = svgEl("g", { class: "hits" }, svg);
  const byMap = {}, targets = {};
  d.atoms.forEach(a => { if (a.map) byMap[a.map] = a; });
  const cx = d.atoms.reduce((s, a) => s + a.x, 0) / (d.atoms.length || 1), cy = d.atoms.reduce((s, a) => s + a.y, 0) / (d.atoms.length || 1);

  const point = key => {
    if (key.startsWith("a:")) { const a = byMap[+key.slice(2)]; return a && { x: a.x, y: a.y, atom: true }; }
    const [m1, m2] = key.slice(2).split("-").map(Number), a = byMap[m1], b = byMap[m2];
    return a && b && { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, atom: false };
  };

  if (opts.tap) {
    const kinds = opts.tap.split("+");
    if (kinds.includes("bonds")) d.bonds.forEach(b => {
      const A = d.atoms[b.a], B = d.atoms[b.b];
      if (!A.map || !B.map) return;
      const key = bondKey(A.map, B.map);
      const t = svgEl("rect", { x: b.x - 9, y: b.y - 9, width: 18, height: 18, rx: 4, class: "hit bond", tabindex: 0, "aria-label": `bond ${A.el}–${B.el}` }, gHits);
      t.dataset.key = key; targets[key] = t;
    });
    if (kinds.includes("atoms")) d.atoms.forEach(a => {
      if (!a.map) return;
      const key = "a:" + a.map;
      const t = svgEl("circle", { cx: a.x, cy: a.y, r: 15, class: "hit atom", tabindex: 0, "aria-label": `atom ${a.el}` }, gHits);
      t.dataset.key = key; targets[key] = t;
    });
    const fire = e => { const t = e.target.closest(".hit"); if (t && opts.onTap) opts.onTap(t.dataset.key, e); };
    gHits.addEventListener("click", fire);
    gHits.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fire(e); } });
  }

  const marks = {};
  function mark(key, cls, label) {
    unmark(key);
    const p = point(key); if (!p) return;
    const g = svgEl("g", { class: "mk " + cls }, gMarks);
    if (p.atom) svgEl("circle", { cx: p.x, cy: p.y, r: 14 }, g);
    else svgEl("rect", { x: p.x - 8, y: p.y - 8, width: 16, height: 16, rx: 4 }, g);
    if (label) { const t = svgEl("text", { x: p.x + 13, y: p.y - 12, class: "mklabel" }, g); t.textContent = label; }
    marks[key] = g;
  }
  function unmark(key) { if (marks[key]) { marks[key].remove(); delete marks[key]; } }
  function clearMarks() { Object.keys(marks).forEach(unmark); }

  /* a curved arrow between two targets; bends away from the middle of the drawing */
  function arrow(fromKey, toKey, cls = "user") {
    const p = point(fromKey), q = point(toKey);
    if (!p || !q) return null;
    let x0 = p.x, y0 = p.y, x1 = q.x, y1 = q.y;
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len, ny = dx / len;
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    if ((mx + nx - cx) ** 2 + (my + ny - cy) ** 2 < (mx - nx - cx) ** 2 + (my - ny - cy) ** 2) { nx = -nx; ny = -ny; }
    const bend = Math.max(22, len * 0.45);
    if (p.atom) { x0 += nx * 9; y0 += ny * 9; }             // lone pair sits beside the atom
    const ux = dx / len, uy = dy / len;
    if (q.atom) { x1 -= ux * 11; y1 -= uy * 11; }          // stop short of the atom label
    const c1x = mx + nx * bend, c1y = my + ny * bend;
    const path = svgEl("path", { d: `M${x0.toFixed(1)},${y0.toFixed(1)} Q${c1x.toFixed(1)},${c1y.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`,
      class: "arw " + cls, "marker-end": `url(#${defs.dataset[cls]})` }, gArrows);
    if (p.atom) svgEl("g", { class: "lp " + cls }, gArrows).innerHTML =
      `<circle cx="${(p.x + nx * 9 - ny * 3).toFixed(1)}" cy="${(p.y + ny * 9 + nx * 3).toFixed(1)}" r="1.8"/><circle cx="${(p.x + nx * 9 + ny * 3).toFixed(1)}" cy="${(p.y + ny * 9 - nx * 3).toFixed(1)}" r="1.8"/>`;
    return path;
  }
  const clearArrows = () => { gArrows.innerHTML = ""; };
  const lock = () => { gHits.remove(); };
  return { d, svg, targets, mark, unmark, clearMarks, arrow, clearArrows, lock, byMap };
}

/* arrow record <-> target keys */
const arrowFromKeys = (tail, head) => ({
  from: tail.startsWith("a:") ? { lonePair: +tail.slice(2) } : { bond: tail.slice(2).split("-").map(Number) },
  to: head.startsWith("a:") ? { atom: +head.slice(2) } : { bond: head.slice(2).split("-").map(Number) },
});
const arrowKeys = ar => [
  ar.from.lonePair !== undefined ? "a:" + ar.from.lonePair : bondKey(...ar.from.bond),
  ar.to.atom !== undefined ? "a:" + ar.to.atom : bondKey(...ar.to.bond),
];
