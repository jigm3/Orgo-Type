/* ---------- card: full mechanism, step by step ----------
   Each step shows the molecules present and (smaller) what the step leads to. The student draws all of that
   step's arrows and commits once; the board then shows the correct arrows, the step's description and note,
   and the next step starts from the correct intermediate. The card is right only if every step was right. */
CARDS.mechanism = {
  title: "Full mechanism",
  async render({ rec: r, body, act, fb, commit }) {
    const steps = r.mechanism.steps, results = [];
    body.innerHTML = `<p class="cq">Push the arrows for the whole mechanism, one step at a time. Each step shows where it leads.</p>
      <p class="cond">Conditions: ${esc(r.reagentDisplay)}</p><div class="msteps"></div><div class="mstep"></div>`;
    const done = body.querySelector(".msteps"), cur = body.querySelector(".mstep");
    let firstReady;
    const ready = new Promise(r_ => { firstReady = r_; });
    (async () => {
    for (let i = 0; i < steps.length; i++) {
      const st = steps[i], last = i === steps.length - 1, n = st.arrows.length;
      cur.innerHTML = `<div class="mhead"><b>Step ${i + 1} of ${steps.length}</b> · ${n} arrow${n > 1 ? "s" : ""}</div>
        <div class="board"></div><div class="mnext"><span class="mute small">${last ? "gives the product" : "leads to"}</span><div class="mol nextmol"></div></div>`;
      molPanel(cur.querySelector(".nextmol"), last ? r.product : steps[i + 1].species.join("."), { width: 300, height: 150 });
      const board = await arrowBoard(cur.querySelector(".board"), act, { smiles: st.species.join("."), answer: st.arrows, eq: st._eq });
      if (i === 0) firstReady();
      const res = await board.result;
      results.push(res.ok);
      // turn the finished step into a compact record and move on
      const rec = document.createElement("div");
      rec.className = "mdone " + (res.ok ? "good" : "bad");
      rec.innerHTML = `<div class="mhead"><b>Step ${i + 1}</b> ${res.ok ? "✓" : "✗"} · ${esc(st.label)}</div>${st.note ? `<p class="mute small">${esc(st.note)}</p>` : ""}`;
      rec.appendChild(cur.querySelector(".board .mbig"));
      done.appendChild(rec);
      cur.innerHTML = "";
      if (!last) {
        act.innerHTML = `<span class="mute">${res.ok ? "Right." : "Not quite: green shows the right arrows."}</span>` + btn("Next step", "primary nstep");
        act.querySelector(".nstep").focus({ preventScroll: true });
        await new Promise(go => { act.querySelector(".nstep").onclick = go; });
      }
    }
    cur.remove();
    const right = results.filter(Boolean).length, ok = right === results.length;
    verdict(fb, ok, `<p>${right} of ${results.length} steps right.${ok ? "" : " The steps you missed are marked ✗ above."}</p>` + whyBlock(r));
    commit({ correct: ok, detail: { steps: results }, nSteps: results.length });
    })();
    return ready;   // the card counts as drawn once step 1 is on screen
  },
};
