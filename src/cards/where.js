/* ---------- card 1: where does it react? (tap nucleophile, then electrophile; product hidden) ---------- */
CARDS.where = {
  title: "Where does it react?",
  async render({ rec: r, body, act, fb, commit }) {
    body.innerHTML = `<p class="cq">Tap the atom that attacks <b class="nu">(nucleophile)</b>, then the atom it attacks <b class="el">(electrophile)</b>.</p>
      <p class="cond">Conditions: ${esc(r.reagentDisplay)}</p><div class="mbig"></div><p class="hint" aria-live="polite">Step 1: tap the nucleophile.</p>`;
    const picks = [];
    let mv;
    const hint = body.querySelector(".hint");
    const redraw = () => {
      mv.clearMarks();
      if (picks[0]) mv.mark(picks[0], "nu", "Nu");
      if (picks[1]) mv.mark(picks[1], "el", "E+");
      hint.textContent = picks.length === 0 ? "Step 1: tap the nucleophile." : picks.length === 1 ? "Step 2: tap the electrophile." : "Check when ready (tap a pick to undo it).";
      act.querySelector(".check").disabled = picks.length < 2;
    };
    act.innerHTML = btn("Check", "primary check", "disabled");
    mv = await molPanel(body.querySelector(".mbig"), r._display, { width: 360, height: 250, bondLength: 44, tap: "atoms",
      onTap: key => { const i = picks.indexOf(key); if (i >= 0) picks.splice(i); else if (picks.length < 2) picks.push(key); redraw(); } });
    act.querySelector(".check").onclick = () => {
      mv.lock();
      const ks = r.keyStep, m = k => +k.slice(2);
      const nuOk = sameAtom(m(picks[0]), ks.nucleophileAtom, r._eq), elOk = sameAtom(m(picks[1]), ks.electrophileAtom, r._eq);
      mv.clearMarks();
      if (!nuOk) mv.mark(picks[0], "wrong", "✗");
      if (!elOk) mv.mark(picks[1], "wrong", "✗");
      mv.mark("a:" + ks.nucleophileAtom, "nu ok", "Nu");
      mv.mark("a:" + ks.electrophileAtom, "el ok", "E+");
      const parts = [];
      if (!nuOk) parts.push("The nucleophile is the marked <b>Nu</b> atom.");
      if (!elOk) parts.push("The electrophile is the marked <b>E+</b> atom.");
      verdict(fb, nuOk && elOk, (parts.length ? `<p>${parts.join(" ")}</p>` : "") + whyBlock(r));
      commit({ correct: nuOk && elOk, detail: { picks } });
    };
  },
};
