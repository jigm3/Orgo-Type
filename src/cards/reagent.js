/* ---------- card 4: reagent (typed, fuzzy alias matching) ---------- */
CARDS.reagent = {
  title: "Reagent",
  async render({ rec: r, body, act, fb, commit }) {
    body.innerHTML = `<p class="cq">What reagent does this? Type it.</p><div class="rx"></div>
      <form class="typed"><input class="tin" aria-label="Reagent" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" placeholder="e.g. NaBH4"></form>`;
    act.innerHTML = btn("Check", "primary check", "disabled");
    const inp = body.querySelector(".tin");
    inp.oninput = () => { act.querySelector(".check").disabled = !inp.value.trim(); };
    await rxnRow(body.querySelector(".rx"), r, { reagent: false, w: 280, h: 170 });
    const go = () => {
      if (!inp.value.trim() || inp.disabled) return;
      inp.disabled = true;
      const m = matchReagent(inp.value, r.reagentAliases);
      const workup = /h3o\+|h\+|workup/i.test(r.reagentDisplay) ? " The workup step is part of the full answer." : "";
      verdict(fb, m.ok, `<p>Full conditions: <b>${esc(r.reagentDisplay)}</b>.${m.ok && !m.exact ? ` (Read “${esc(inp.value)}” as ${esc(m.alias)}.)` : ""}${workup}</p>`
        + `<p class="mute">Also accepted: ${esc(r.reagentAliases.slice(0, 5).join(", "))}</p>` + whyBlock(r));
      commit({ correct: m.ok, detail: { typed: inp.value } });
    };
    body.querySelector(".typed").onsubmit = e => { e.preventDefault(); go(); };
    act.querySelector(".check").onclick = go;
    setTimeout(() => inp.focus({ preventScroll: true }), 50);
  },
};
