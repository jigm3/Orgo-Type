/* ---------- structure editor: "complete the structure" (atoms placed, student adds bonds and charges) ----------
   task = { layout, atoms: [{m, el, c}], bonds: [[m1, m2, order, given]] } from tools/compile_content.py.
   Given bonds are drawn and locked. In Bonds mode, tap one atom then another to add a bond, and tap again to
   cycle single → double → triple → none. In Charges mode, tap an atom to cycle 0 → − → +.
   Grading builds a molecule from the student's atoms, bonds and charges (hydrogens implied by normal valences,
   exactly as the build step did for the answer) and compares canonical SMILES, so equivalent answers count. */
const CHG_LABEL = { "-1": "−", "1": "+", "-2": "2−", "2": "2+" };

function molblockOf(atoms, bonds) {
  const idx = Object.fromEntries(atoms.map((a, i) => [a.m, i + 1]));
  const pad = (v, n) => String(v).padStart(n);
  const L = ["", "  orgotype", "", `${pad(atoms.length, 3)}${pad(bonds.filter(b => b[2] > 0).length, 3)}  0  0  0  0  0  0  0  0999 V2000`];
  atoms.forEach(a => L.push(`    0.0000    0.0000    0.0000 ${a.el.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`));
  bonds.filter(b => b[2] > 0).forEach(b => L.push(`${pad(idx[b[0]], 3)}${pad(idx[b[1]], 3)}${pad(b[2], 3)}  0`));
  const ch = atoms.filter(a => a.c);
  for (let k = 0; k < ch.length; k += 8) {
    const part = ch.slice(k, k + 8);
    L.push("M  CHG" + pad(part.length, 3) + part.map(a => ` ${pad(idx[a.m], 3)} ${pad(a.c, 3)}`).join(""));
  }
  L.push("M  END");
  return L.join("\n");
}
async function canonOf(atoms, bonds) {
  const RDKit = await loadRDKit();
  const m = RDKit.get_mol(molblockOf(atoms, bonds));
  if (!m || !m.is_valid()) { if (m) m.delete(); return null; }
  try { return m.get_smiles(); } finally { m.delete(); }
}

/* Draws the editor into `box`. Resolves when drawn, with { result }: a promise of { ok, mine, truth } after Check. */
async function structEditor(box, act, task, { width = 360, height = 240 } = {}) {
  // coordinates come from RDKit's own layout of the right answer
  const d = await depict(task.layout, { width, height, bondLength: 44 });
  const pos = {};
  d.atoms.forEach(a => { if (a.map) pos[a.map] = a; });
  const atoms = task.atoms.map(a => ({ m: a.m, el: a.el, c: 0 }));       // student's charges start at 0
  const A = Object.fromEntries(atoms.map(a => [a.m, a]));
  const key = (x, y) => x < y ? x + "-" + y : y + "-" + x;
  const given = new Map(task.bonds.filter(b => b[3]).map(b => [key(b[0], b[1]), b[2]]));
  const mine = new Map();                                                   // student's bonds: key → order
  let mode = "bond", sel = null;
  box.innerHTML = `<div class="semodes" role="group" aria-label="Tool">
      <button class="pill" data-mode="bond" aria-pressed="true">Bonds</button><button class="pill" data-mode="charge" aria-pressed="false">Charges</button>
      <span class="mute small sehint"></span></div>
    <div class="mol mbig sedit"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="structure to complete"></svg></div>`;
  const svg = box.querySelector("svg"), hint = box.querySelector(".sehint");
  const setHint = () => { hint.textContent = mode === "bond" ? (sel ? "now tap the other atom" : "tap two atoms to add or change a bond") : "tap an atom to set its charge"; };
  box.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => {
    mode = b.dataset.mode; sel = null;
    box.querySelectorAll("[data-mode]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    draw(); setHint();
  });
  function bondLines(x1, y1, x2, y2, order, cls) {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    const sh = 11 / len;                                          // shorten ends near labels
    const ax = x1 + dx * sh, ay = y1 + dy * sh, bx = x2 - dx * sh, by = y2 - dy * sh;
    const offs = order === 1 ? [0] : order === 2 ? [-2.6, 2.6] : [-4, 0, 4];
    return offs.map(o => `<line x1="${(ax + nx * o).toFixed(1)}" y1="${(ay + ny * o).toFixed(1)}" x2="${(bx + nx * o).toFixed(1)}" y2="${(by + ny * o).toFixed(1)}" class="${cls}"/>`).join("");
  }
  function draw(reveal) {
    let h = "";
    const all = new Map([...given].map(([k, o]) => [k, { o, cls: "sb given" }]));
    if (!reveal) mine.forEach((o, k) => all.set(k, { o, cls: "sb mine" }));
    else reveal.bonds.forEach(([k, o, cls]) => all.set(k, { o, cls }));
    all.forEach(({ o, cls }, k) => { const [p, q] = k.split("-").map(Number); h += bondLines(pos[p].x, pos[p].y, pos[q].x, pos[q].y, o, cls); });
    atoms.forEach(a => {
      const p = pos[a.m], c = reveal ? reveal.charges[a.m] : a.c;
      const label = a.el !== "C" || c;
      h += `<g class="sa ${sel === a.m ? "sel" : ""}" data-m="${a.m}"><circle cx="${p.x}" cy="${p.y}" r="15" class="sahit"/>` +
        (label ? `<text x="${p.x}" y="${p.y + 5}" class="sal">${a.el === "C" ? "C" : esc(a.el)}</text>` : `<circle cx="${p.x}" cy="${p.y}" r="2.2" class="sadot"/>`) +
        (c ? `<text x="${p.x + 9}" y="${p.y - 7}" class="sac ${reveal && reveal.badCharge.has(a.m) ? "bad" : ""}">${CHG_LABEL[c] || c}</text>` : "") + `</g>`;
    });
    svg.innerHTML = h;
  }
  svg.addEventListener("click", e => {
    const g = e.target.closest(".sa"); if (!g || box.classList.contains("locked")) return;
    const m = +g.dataset.m;
    if (mode === "charge") { A[m].c = A[m].c === 0 ? -1 : A[m].c === -1 ? 1 : 0; }
    else if (sel === null) sel = m;
    else if (sel === m) sel = null;
    else {
      const k = key(sel, m);
      if (given.has(k)) toast("That bond is already drawn");
      else { const o = ((mine.get(k) || 0) + 1) % 4; if (o) mine.set(k, o); else mine.delete(k); }
      sel = null;
    }
    draw(); setHint();
  });
  act.innerHTML = btn("Clear", "clear") + btn("Check", "primary check");
  act.querySelector(".clear").onclick = () => { mine.clear(); atoms.forEach(a => { a.c = 0; }); sel = null; draw(); setHint(); };
  draw(); setHint();
  return { result: new Promise(resolve => {
    act.querySelector(".check").onclick = async () => {
      box.classList.add("locked");
      const truthBonds = task.bonds.map(b => [b[0], b[1], b[2]]);
      const myBonds = [...given].map(([k, o]) => [...k.split("-").map(Number), o]).concat([...mine].map(([k, o]) => [...k.split("-").map(Number), o]));
      const [a1, a2] = await Promise.all([canonOf(atoms, myBonds), canonOf(task.atoms, truthBonds)]);
      const ok = !!a1 && a1 === a2;
      // reveal: right answer's bonds; the student's wrong or missing ones marked
      const tb = new Map(task.bonds.filter(b => !b[3]).map(b => [key(b[0], b[1]), b[2]]));
      const bonds = [];
      tb.forEach((o, k) => bonds.push([k, o, mine.get(k) === o || ok ? "sb ok" : "sb missed"]));
      mine.forEach((o, k) => { if (!ok && tb.get(k) !== o && !tb.has(k)) bonds.push([k, o, "sb wrongb"]); });
      const charges = Object.fromEntries(task.atoms.map(a => [a.m, a.c]));
      const badCharge = new Set(ok ? [] : task.atoms.filter(a => A[a.m].c !== a.c).map(a => a.m));
      sel = null; draw({ bonds, charges, badCharge });
      act.innerHTML = "";
      resolve({ ok, mine: a1, truth: a2 });
    };
  }) };
}
