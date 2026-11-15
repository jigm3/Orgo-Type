/* ---------- card 8: paper round (exams are handwritten) ---------- */
CARDS.paper = {
  title: "Paper round",
  selfGraded: true,
  async render({ rec: r, body, act, fb, commit }) {
    body.innerHTML = `<p class="cq">On paper: draw the product <b>and</b> the arrows for the key step. Then reveal and check yourself.</p><div class="rx"></div><div class="mbig" hidden></div>`;
    act.innerHTML = btn("Reveal", "primary reveal");
    await rxnRow(body.querySelector(".rx"), r, { product: false, w: 300, h: 180 });
    act.querySelector(".reveal").onclick = async () => {
      const rx = body.querySelector(".rx"), big = body.querySelector(".mbig");
      await rxnRow(rx, r, { w: 280, h: 170 });
      big.hidden = false;
      const mv = await molPanel(big, r._display, { width: 380, height: 240 });
      r.keyStep.arrows.forEach(ar => mv.arrow(...arrowKeys(ar), "ok"));
      fb.hidden = false; fb.className = "cfb";
      fb.innerHTML = `<div class="vd">How did you do?</div>${whyBlock(r)}`;
      act.innerHTML = btn("Missed it", "again") + btn("Shaky", "hard") + btn("Got it", "primary good");
      act.querySelector(".again").onclick = () => commit({ correct: false, rating: "again" });
      act.querySelector(".hard").onclick = () => commit({ correct: true, rating: "hard" });
      act.querySelector(".good").onclick = () => commit({ correct: true, rating: "good" });
    };
  },
};
