/* ---------- card 6: what changed? (atom mapping for synthesis)
   Tap the new C–C bond(s) in the product and say how many carbons were added. ---------- */
CARDS.change = {
  title: "What changed?",
  async render({ rec: r, body, act, fb, commit }) {
    body.innerHTML = `<p class="cq">Compare start and product. Tap every <b>new C–C bond</b> in the product, then say how many carbons were added.</p>
      <div class="rxn"><div class="rs"></div><div class="rarr"><span>${esc(r.reagentDisplay)}</span><i></i></div><div class="rp"></div></div>
      <label class="stepper">Carbons added: <button class="btn sm minus" aria-label="fewer">−</button><output class="cnum">0</output><button class="btn sm plus" aria-label="more">+</button></label>`;
    act.innerHTML = btn("Check", "primary check", "disabled");
    const picked = new Set(); let n = 0, mv;
    const out = body.querySelector(".cnum");
    const upd = () => { out.textContent = n; act.querySelector(".check").disabled = !picked.size; };
    body.querySelector(".minus").onclick = e => { e.preventDefault(); n = Math.max(0, n - 1); upd(); };
    body.querySelector(".plus").onclick = e => { e.preventDefault(); n = Math.min(20, n + 1); upd(); };
    const [, p] = await Promise.all([
      molPanel(body.querySelector(".rs"), r._start, { width: 280, height: 180 }),
      molPanel(body.querySelector(".rp"), r.product, { width: 280, height: 180, tap: "bonds",
        onTap: key => { picked.has(key) ? (picked.delete(key), mv.unmark(key)) : (picked.add(key), mv.mark(key, "tail")); upd(); } }),
    ]);
    mv = p;
    act.querySelector(".check").onclick = () => {
      mv.lock(); mv.clearMarks();
      const want = new Set(r._newCC.map(([a, b]) => bondKey(a, b)));
      const bondsOk = want.size === picked.size && [...picked].every(k => want.has(k));
      const countOk = n === r._added;
      picked.forEach(k => { if (!want.has(k)) mv.mark(k, "wrong"); });
      want.forEach(k => mv.mark(k, "ok"));
      const msg = [];
      if (!bondsOk) msg.push(`The new C–C bond${want.size > 1 ? "s are" : " is"} marked in green.`);
      if (!countOk) msg.push(`${r._added} carbon${r._added === 1 ? " was" : "s were"} added (you said ${n}).`);
      verdict(fb, bondsOk && countOk, (msg.length ? `<p>${msg.join(" ")}</p>` : "") + whyBlock(r));
      commit({ correct: bondsOk && countOk, detail: { bonds: [...picked], n } });
    };
  },
};
