/* ---------- arrow board: draw curved arrows on a molecule picture, check once ----------
   Tap where an arrow starts (an atom = its lone pair, or a bond square), then where it goes (an atom or a bond).
   Used by the arrows card (key step) and the mechanism card (one board per step).
   Resolves once it's drawn, with { result }: a promise of { ok, mine, right } after the student presses Check
   (the board then shows the answer). */
async function arrowBoard(box, act, { smiles, answer, eq, given = 0, width = 360, height = 260 }) {
  const n = answer.length;
  box.innerHTML = `<div class="mbig"></div><p class="hint" aria-live="polite"></p>`;
  act.innerHTML = btn("Undo", "undo", "disabled") + btn("Check", "primary check", "disabled");
  const drawn = answer.slice(0, given).map(arrowKeys); let tail = null, mv;
  const hint = box.querySelector(".hint");
  const redraw = () => {
    mv.clearArrows(); mv.clearMarks();
    drawn.forEach(([t, h], i) => mv.arrow(t, h, i < given ? "show" : "user"));
    if (tail) mv.mark(tail, "tail", "start");
    hint.textContent = tail ? `Arrow ${drawn.length + 1}: now tap where it goes.` : drawn.length < n ? `Arrow ${drawn.length + 1}: tap where it starts.` : "Check when ready.";
    act.querySelector(".undo").disabled = !tail && drawn.length <= given;
    act.querySelector(".check").disabled = drawn.length <= given || !!tail;
  };
  mv = await molPanel(box.querySelector(".mbig"), smiles, { width, height, bondLength: 44, tap: "atoms+bonds",
    onTap: key => {
      if (!tail) { if (drawn.length < n + 2) tail = key; }
      else if (key === tail) tail = null;
      else { drawn.push([tail, key]); tail = null; }
      redraw();
    } });
  redraw();
  return { result: new Promise(resolve => {
    act.querySelector(".undo").onclick = () => { if (tail) tail = null; else if (drawn.length > given) drawn.pop(); redraw(); };
    act.querySelector(".check").onclick = () => {
      mv.lock();
      const mine = drawn.map(([t, h]) => arrowFromKeys(t, h));
      const g = gradeArrows(mine, answer, eq);
      mv.clearArrows(); mv.clearMarks();
      if (!g.ok) mine.forEach((ar, i) => { if (!g.right[i]) mv.arrow(...arrowKeys(ar), "bad"); });
      answer.forEach(ar => mv.arrow(...arrowKeys(ar), "ok"));
      hint.textContent = "";
      act.innerHTML = "";
      resolve({ ok: g.ok, mine, right: g.right });
    };
  }) };
}

/* ---------- card 2: arrows for the key step ---------- */
CARDS.arrows = {
  title: "Arrows",
  async render({ rec: r, body, act, fb, commit, given = 0 }) {
    const n = r.keyStep.arrows.length;   // `given` (lessons): the first arrows are pre-drawn, the student adds the rest
    body.innerHTML = `<p class="cq">Draw the key step: <b>${n} arrow${n > 1 ? "s" : ""}</b>${given ? ` (${given} drawn for you)` : ""}. Tap where an arrow starts (an atom for a lone pair, or a bond square), then where it goes.</p>
      <p class="cond">Conditions: ${esc(r.reagentDisplay)}</p><div class="board"></div>`;
    const board = await arrowBoard(body.querySelector(".board"), act, { smiles: r._display, answer: r.keyStep.arrows, eq: r._eq, given });
    board.result.then(res => {
    verdict(fb, res.ok, (res.ok ? "" : `<p>Green arrows are the key step${res.right.some(x => !x) ? "; red ones weren't part of it" : ""}.</p>`) + whyBlock(r));
    commit({ correct: res.ok, detail: { arrows: res.mine } });
    });
  },
};
