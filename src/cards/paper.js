/* ---------- card 8: paper round (exams are handwritten) ---------- */
CARDS.paper = {
  title: "Paper round",
  selfGraded: true,
  async render({ rec: r, body, act, fb, commit }) {
    const full = r.mechanism && r.mechanism.steps.length > 1;
    body.innerHTML = `<p class="cq">On paper: draw the product <b>and</b> ${full ? `the <b>complete mechanism</b> (${r.mechanism.steps.length} steps), every intermediate and arrow` : "the arrows for the key step"}. Then reveal and check yourself.</p><div class="rx"></div><div class="mbig" hidden></div><div class="msteps"></div>`;
    act.innerHTML = btn("Reveal", "primary reveal");
    await rxnRow(body.querySelector(".rx"), r, { product: false, w: 300, h: 180 });
    act.querySelector(".reveal").onclick = async () => {
      const rx = body.querySelector(".rx"), big = body.querySelector(".mbig");
      await rxnRow(rx, r, { w: 280, h: 170 });
      if (full) {
        const box = body.querySelector(".msteps");
        for (const [i, st] of r.mechanism.steps.entries()) {
          const d = document.createElement("div");
          d.className = "mdone";
          d.innerHTML = `<div class="mhead"><b>Step ${i + 1}</b> · ${esc(st.label)}</div><div class="mol"></div>`;
          box.appendChild(d);
          const mv = await molPanel(d.querySelector(".mol"), st.species.join("."), { width: 360, height: 220 });
          st.arrows.forEach(ar => mv.arrow(...arrowKeys(ar), "ok"));
        }
      } else {
        big.hidden = false;
        const mv = await molPanel(big, r._display, { width: 380, height: 240 });
        r.keyStep.arrows.forEach(ar => mv.arrow(...arrowKeys(ar), "ok"));
      }
      fb.hidden = false; fb.className = "cfb";
      fb.innerHTML = `<div class="vd">How did you do?</div>${whyBlock(r)}`;
      act.innerHTML = btn("Missed it", "again") + btn("Shaky", "hard") + btn("Got it", "primary good");
      act.querySelector(".again").onclick = () => commit({ correct: false, rating: "again" });
      act.querySelector(".hard").onclick = () => commit({ correct: true, rating: "hard" });
      act.querySelector(".good").onclick = () => commit({ correct: true, rating: "good" });
    };
  },
};
