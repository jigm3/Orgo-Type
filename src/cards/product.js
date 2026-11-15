/* ---------- card 3: product (multiple choice; every wrong option explains its mistake) ---------- */
CARDS.product = {
  title: "Product",
  async render({ rec: r, body, act, fb, commit, rnd }) {
    body.innerHTML = `<p class="cq">What is the major product?</p><div class="rx"></div><div class="opts" role="radiogroup"></div>`;
    const opts = shuffle([{ smiles: r.product, correct: true }, ...r.traps.map(t => ({ smiles: t.smiles, explains: t.explains }))], rnd || Math.random);
    const box = body.querySelector(".opts");
    box.innerHTML = opts.map((o, i) => `<button class="opt" role="radio" aria-checked="false" data-i="${i}" data-smiles="${esc(o.smiles)}"><span class="optl">${"ABCD"[i]}</span><div class="optm"></div><div class="optx"></div></button>`).join("");
    act.innerHTML = btn("Check", "primary check", "disabled");
    let pick = -1;
    box.onclick = e => {
      const b = e.target.closest(".opt"); if (!b || box.classList.contains("locked")) return;
      pick = +b.dataset.i;
      box.querySelectorAll(".opt").forEach(x => x.setAttribute("aria-checked", String(+x.dataset.i === pick)));
      act.querySelector(".check").disabled = false;
    };
    await Promise.all([rxnRow(body.querySelector(".rx"), r, { product: false, w: 300, h: 170 }),
      ...opts.map((o, i) => molPanel(box.querySelectorAll(".optm")[i], o.smiles, { width: 180, height: 140, label: "option " + "ABCD"[i] }))]);
    act.querySelector(".check").onclick = () => {
      box.classList.add("locked");
      const o = opts[pick], ok = !!o.correct;
      box.querySelectorAll(".opt").forEach((b, i) => {
        b.classList.add(opts[i].correct ? "right" : i === pick ? "wrong" : "other");
        if (!opts[i].correct) b.querySelector(".optx").textContent = opts[i].explains;
      });
      verdict(fb, ok, (ok ? "" : `<p>${esc(o.explains)}</p>`) + whyBlock(r));
      commit({ correct: ok, detail: { pick: o.smiles } });
    };
  },
};
