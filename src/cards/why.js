/* ---------- card 5: why (type one line, see the model answer, grade yourself) ---------- */
CARDS.why = {
  title: "Why?",
  selfGraded: true,
  async render({ rec: r, body, act, fb, commit }) {
    body.innerHTML = `<p class="cq">Why does this reaction go this way? Write one line, then compare.</p><div class="rx"></div>
      <textarea class="tarea" rows="2" aria-label="Your explanation" placeholder="In one line…"></textarea>`;
    act.innerHTML = btn("Show answer", "primary reveal");
    await rxnRow(body.querySelector(".rx"), r, { w: 280, h: 170 });
    const ta = body.querySelector(".tarea");
    act.querySelector(".reveal").onclick = () => {
      ta.disabled = true;
      fb.hidden = false; fb.className = "cfb";
      fb.innerHTML = `<div class="vd">Model answer</div><p>${esc(r.why)}</p><p class="mute">Did yours have the same key idea?</p>`;
      act.innerHTML = btn("Missed it", "again") + btn("Got it", "primary good");
      act.querySelector(".again").onclick = () => commit({ correct: false, rating: "again", detail: { typed: ta.value } });
      act.querySelector(".good").onclick = () => commit({ correct: true, rating: "good", detail: { typed: ta.value } });
    };
  },
};
