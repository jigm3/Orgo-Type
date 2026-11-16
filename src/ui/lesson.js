/* ---------- lessons: worked example → faded steps → solve, with "why" prompts ----------
   Step kinds (content/lessons/*.json, see docs/SCHEMA.md):
     read    { text, smiles?, lit?: {map: "nu"|"el"|"lg"} }        ≤ ~30 s of reading, never longer
     tap     { text, smiles, answer: [maps], explain }             tap one atom
     choice  { text, smiles?, options: [{ text, correct?, explains }] }
     worked  { reaction, text? }                                    full reaction + key-step arrows + why
     card    { reaction, card, given?, text? }                      any card type; `given` pre-draws arrows (fading)
   Lesson practice isn't scheduled; the unit's cards start in the daily session once the lesson is done. */
const LESSONS = Object.fromEntries(CONTENT.lessons.map(l => [l.id, l]));
const md = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\*(.+?)\*/g, "<i>$1</i>");
const LIT = { nu: "--accent", el: "--accent2", lg: "--bad" };

function renderLesson(view, id, i = 0) {
  const L = LESSONS[id];
  if (!L) { view.innerHTML = `<p>Lesson not found. <a href="#/">Home</a></p>`; return; }
  if (i >= L.steps.length) return finishLesson(view, L);
  const st = L.steps[i];
  view.innerHTML = `
    <div class="sbar"><a class="pill" href="#/">✕ Close</a>
      <div class="sprog"><i style="width:${Math.round(100 * i / L.steps.length)}%"></i></div><span class="pill static">${i + 1} / ${L.steps.length}</span></div>
    <article class="card lesson">
      <div class="ctype"><span>${courseOf(L.unit) === 1 ? "Orgo 1" : "Orgo 2"} · Unit ${unitNum(L.unit)} · lesson</span><span>${esc(L.title)}</span></div>
      <div class="cbody"></div><div class="cfb" hidden aria-live="polite"></div><div class="cact"></div>
    </article>`;
  const body = view.querySelector(".cbody"), act = view.querySelector(".cact"), fb = view.querySelector(".cfb");
  const next = () => { renderLesson(view, id, i + 1); scrollTo(0, 0); };
  const nextBtn = (label = "Next") => { act.insertAdjacentHTML("beforeend", btn(label, "primary nx")); act.querySelector(".nx").onclick = next; act.querySelector(".nx").focus({ preventScroll: true }); };
  const logStep = ok => (store.log = store.log || []).push({ t: new Date().toISOString(), lesson: id, step: i, ok });

  if (st.kind === "read") {
    body.innerHTML = `<div class="ltext">${md(st.text)}</div>${st.smiles ? '<div class="mbig"></div>' : ""}`;
    if (st.smiles) molPanel(body.querySelector(".mbig"), st.smiles, { width: 360, height: 220 }).then(mv =>
      Object.entries(st.lit || {}).forEach(([m, k]) => mv.mark("a:" + m, k === "nu" ? "nu" : k === "el" ? "el" : "wrong", k === "nu" ? "Nu" : k === "el" ? "E+" : "LG")));
    nextBtn();
  } else if (st.kind === "tap") {
    body.innerHTML = `<div class="ltext">${md(st.text)}</div><div class="mbig"></div>`;
    let done = false, mv;
    molPanel(body.querySelector(".mbig"), st.smiles, { width: 360, height: 220, tap: "atoms", onTap: key => {
      if (done) return; done = true;
      const m = +key.slice(2), ok = st.answer.includes(m);
      mv.lock(); mv.mark(key, ok ? "ok" : "wrong"); st.answer.forEach(a => mv.mark("a:" + a, "ok"));
      verdict(fb, ok, `<p>${md(st.explain)}</p>`); logStep(ok); ok ? chime() : buzz(); nextBtn();
    } }).then(x => { mv = x; });
  } else if (st.kind === "choice") {
    body.innerHTML = `<div class="ltext">${md(st.text)}</div>${st.smiles ? '<div class="mbig"></div>' : ""}
      <div class="opts list">${shuffle(st.options.map((_, k) => k), Math.random).map((k, pos) => `<button class="opt row" data-k="${k}"><span class="optl">${"ABCD"[pos]}</span><span class="optt">${md(st.options[k].text)}</span></button>`).join("")}</div>`;
    if (st.smiles) molPanel(body.querySelector(".mbig"), st.smiles, { width: 360, height: 200 });
    const box = body.querySelector(".opts");
    box.onclick = e => {
      const b = e.target.closest(".opt"); if (!b || box.classList.contains("locked")) return;
      box.classList.add("locked");
      const o = st.options[+b.dataset.k], ok = !!o.correct;
      box.querySelectorAll(".opt").forEach(x => x.classList.add(st.options[+x.dataset.k].correct ? "right" : x === b ? "wrong" : "other"));
      const right = st.options.find(x => x.correct);
      verdict(fb, ok, `<p>${md(ok ? (o.explains || right.explains || "") : o.explains)}</p>${!ok && right.explains ? `<p>${md(right.explains)}</p>` : ""}`);
      logStep(ok); ok ? chime() : buzz(); nextBtn();
    };
  } else if (st.kind === "worked") {
    const r = RX[st.reaction];
    body.innerHTML = `<p class="eyebrow">Worked example</p><h2 class="ctitle">${esc(r.title)}</h2>${st.text ? `<div class="ltext">${md(st.text)}</div>` : ""}
      <div class="rx"></div><p class="cq">Key step:</p><div class="mbig"></div>${whyBlock(r)}`;
    rxnRow(body.querySelector(".rx"), r, { w: 280, h: 170 });
    molPanel(body.querySelector(".mbig"), r._display, { width: 380, height: 240 }).then(mv => {
      mv.mark("a:" + r.keyStep.nucleophileAtom, "nu", "Nu"); mv.mark("a:" + r.keyStep.electrophileAtom, "el", "E+");
      r.keyStep.arrows.forEach(ar => mv.arrow(...arrowKeys(ar), "show"));
    });
    nextBtn();
  } else if (st.kind === "card") {
    const r = RX[st.reaction], C = CARDS[st.card];
    body.innerHTML = `${st.text ? `<div class="ltext">${md(st.text)}</div>` : ""}<p class="eyebrow">${st.given ? "Your turn, with help" : "Your turn"} · ${esc(C.title)}</p><div class="inner"></div>`;
    C.render({ rec: r, body: body.querySelector(".inner"), act, fb, given: st.given || 0, commit: res => {
      logStep(res.correct); if (!C.selfGraded) res.correct ? chime() : buzz();
      act.querySelectorAll(".again,.good,.hard").forEach(b => b.remove());
      nextBtn();
    } });
  }
}

function finishLesson(view, L) {
  const first = !lessonDone(L.id);
  store.lessons = store.lessons || {};
  if (first) { store.lessons[L.id] = today(); store.xp = (store.xp || 0) + XP_PER_LESSON; }
  save();
  const s = summary();
  view.innerHTML = `<section class="done"><div class="eyebrow">Lesson done${first ? ` · +${XP_PER_LESSON} XP` : ""}</div>
    <h1>${esc(L.title)}</h1>
    <p class="lead">Now the real practice: mixed cards from every open unit, spaced out over the coming days. That's what makes it stick.</p>
    <div class="actions">${btn(s.due + s.newLeft ? "Start practising" : "Home", "primary go")}${btn("Home", "home")}</div></section>`;
  view.querySelector(".go").onclick = () => s.due + s.newLeft ? startSession() : go("#/");
  view.querySelector(".home").onclick = () => go("#/");
}
