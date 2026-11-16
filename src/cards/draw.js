/* ---------- card: draw the product (atoms placed; add the bonds that formed or changed, and the charges) ---------- */
CARDS.draw = {
  title: "Draw the product",
  async render({ rec: r, body, act, fb, commit }) {
    body.innerHTML = `<p class="cq">Draw the product. Its atoms are placed and the unchanged bonds are drawn: add every new or changed bond, and any formal charges.</p>
      <div class="rx"></div><div class="board"></div>`;
    await rxnRow(body.querySelector(".rx"), r, { product: false, w: 280, h: 160 });
    const ed = await structEditor(body.querySelector(".board"), act, r._draw);
    ed.result.then(res => {
      verdict(fb, res.ok, (res.ok ? "" : `<p>Green bonds are the ones to draw; red ones don't belong.${res.mine ? "" : " (Your structure had an impossible valence.)"}</p>`) + whyBlock(r));
      commit({ correct: res.ok, detail: { drawn: res.mine } });
    });
  },
};

/* ---------- card: complete the intermediates (each mechanism step: arrows shown, draw what they give) ---------- */
CARDS.intermediates = {
  title: "Complete the intermediates",
  async render({ rec: r, body, act, fb, commit }) {
    const steps = r.mechanism.steps.map((st, i) => ({ st, i })).filter(x => x.st._build);
    body.innerHTML = `<p class="cq">Follow the arrows: for each step, draw the structure it produces (bonds and formal charges).</p>
      <p class="cond">Conditions: ${esc(r.reagentDisplay)}</p><div class="msteps"></div><div class="mstep"></div>`;
    const done = body.querySelector(".msteps"), cur = body.querySelector(".mstep"), results = [];
    let firstReady; const ready = new Promise(x => { firstReady = x; });
    (async () => {
      for (const [n, { st, i }] of steps.entries()) {
        const last = n === steps.length - 1;
        cur.innerHTML = `<div class="mhead"><b>Step ${i + 1} of ${r.mechanism.steps.length}</b> · ${esc(st.label)}</div>
          <div class="mol given"></div><p class="mute small">These arrows give…</p><div class="board"></div>`;
        const mv = await molPanel(cur.querySelector(".given"), st.species.join("."), { width: 340, height: 200 });
        st.arrows.forEach(ar => mv.arrow(...arrowKeys(ar), "show"));
        const ed = await structEditor(cur.querySelector(".board"), act, st._build);
        if (n === 0) firstReady();
        const res = await ed.result;
        results.push(res.ok);
        const recEl = document.createElement("div");
        recEl.className = "mdone " + (res.ok ? "good" : "bad");
        recEl.innerHTML = `<div class="mhead"><b>Step ${i + 1}</b> ${res.ok ? "✓" : "✗"} · ${esc(st.label)}</div>`;
        recEl.appendChild(cur.querySelector(".board .sedit"));
        done.appendChild(recEl);
        cur.innerHTML = "";
        if (!last) {
          act.innerHTML = `<span class="mute">${res.ok ? "Right." : "Not quite: green bonds and charges are the answer."}</span>` + btn("Next step", "primary nstep");
          await new Promise(go => { act.querySelector(".nstep").onclick = go; });
        }
      }
      const right = results.filter(Boolean).length, ok = right === results.length;
      verdict(fb, ok, `<p>${right} of ${results.length} structures right.</p>` + whyBlock(r));
      commit({ correct: ok, detail: { steps: results }, nSteps: results.length });
    })();
    return ready;
  },
};
