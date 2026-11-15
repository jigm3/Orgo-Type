/* ---------- card 7: one step back (retrosynthesis)
   Given the target, tap the bond to disconnect, then pick the precursor + reagent.
   Needs a `retro` block in the record: { distractors: [{ precursor, reagent, explains }] }. ---------- */
CARDS.back = {
  title: "One step back",
  async render({ rec: r, body, act, fb, commit, rnd }) {
    const disconnect = r._newCC.length > 0;
    body.innerHTML = `<p class="cq">Work backward one step. ${disconnect ? "Tap the bond you'd disconnect, then pick" : "Pick"} how you'd make this target.</p>
      <div class="mbig"></div><div class="opts list" role="radiogroup"></div>`;
    const opts = shuffle([{ precursor: r._start, reagent: r.reagentDisplay, correct: true }, ...r.retro.distractors], rnd || Math.random);
    const box = body.querySelector(".opts");
    box.innerHTML = opts.map((o, i) => `<button class="opt row" role="radio" aria-checked="false" data-i="${i}" data-reagent="${esc(o.reagent)}" data-smiles="${esc(o.precursor)}"><span class="optl">${"ABCD"[i]}</span>
      <div class="optm"></div><div class="optr">${esc(o.reagent)}</div><div class="optx"></div></button>`).join("");
    act.innerHTML = btn("Check", "primary check", "disabled");
    let pick = -1, bond = null, mv;
    const ready = () => { act.querySelector(".check").disabled = pick < 0 || (disconnect && !bond); };
    box.onclick = e => {
      const b = e.target.closest(".opt"); if (!b || box.classList.contains("locked")) return;
      pick = +b.dataset.i; box.querySelectorAll(".opt").forEach(x => x.setAttribute("aria-checked", String(+x.dataset.i === pick))); ready();
    };
    [mv] = await Promise.all([
      molPanel(body.querySelector(".mbig"), r.product, { width: 320, height: 200, tap: disconnect ? "bonds" : "",
        onTap: key => { if (bond) mv.unmark(bond); bond = key === bond ? null : key; if (bond) mv.mark(bond, "tail", "✂"); ready(); } }),
      ...opts.map((o, i) => molPanel(box.querySelectorAll(".optm")[i], o.precursor, { width: 180, height: 110 })),
    ]);
    act.querySelector(".check").onclick = () => {
      box.classList.add("locked"); mv.lock(); mv.clearMarks();
      const want = r._newCC.map(([a, b]) => bondKey(a, b));
      const bondOk = !disconnect || want.includes(bond), o = opts[pick], ok = bondOk && !!o.correct;
      if (disconnect) { if (!bondOk) mv.mark(bond, "wrong"); want.forEach(k => mv.mark(k, "ok", "✂")); }
      box.querySelectorAll(".opt").forEach((b, i) => {
        b.classList.add(opts[i].correct ? "right" : i === pick ? "wrong" : "other");
        if (!opts[i].correct) b.querySelector(".optx").textContent = opts[i].explains;
      });
      const msg = [];
      if (!bondOk) msg.push("Disconnect the bond the reaction makes (green).");
      if (!o.correct) msg.push(esc(o.explains));
      verdict(fb, ok, (msg.length ? `<p>${msg.join(" ")}</p>` : "") + whyBlock(r));
      commit({ correct: ok, detail: { bond, pick: o.reagent } });
    };
  },
};
