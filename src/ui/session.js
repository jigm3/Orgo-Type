/* ---------- session player: one card at a time, commit → feedback → continue ---------- */
let S = null;   // the running session

function startSession(opts = {}) {
  S = buildSession(opts);
  S.total = S.queue.length; S.firstTry = { right: 0, total: 0 }; S.mastered = [];
  S.seen = new Set();
  if (!S.queue.length) { go("#/"); toast("Nothing due right now"); return; }
  go("#/session");
}

function renderSession(view) {
  if (!S) { go("#/"); return; }
  if (!S.queue.length) return renderSessionDone(view);
  const id = S.queue[0], { rid, type } = parseCard(id), r = RX[rid], C = CARDS[type];
  delete view.dataset.ready;
  const repeat = S.seen.has(id), isNew = !cardState(id);
  view.innerHTML = `
    <div class="sbar"><button class="pill" id="sExit" aria-label="End session">✕ End</button>
      <div class="sprog"><i style="width:${Math.round(100 * (S.done.length) / Math.max(1, S.done.length + S.queue.length))}%"></i></div>
      <span class="pill static">${S.queue.length} left</span></div>
    <article class="card">
      <div class="ctype"><span>${esc(patternTag(r))}</span><span>${isNew ? '<b class="newtag">new</b> ' : repeat ? '<b class="againtag">again</b> ' : ""}${esc(C.title)}</span></div>
      <h2 class="ctitle">${esc(r.title.replace(/\s*→.*$/, ""))}</h2>
      <div class="cbody"></div>
      <div class="cfb" hidden aria-live="polite"></div>
      <div class="cact"></div>
      <div class="cfoot"><button class="link" id="sReport">Report a problem with this card</button>${CONTENT.dev && !r.verified ? '<span class="mute">preview card · not checked yet</span>' : ""}</div>
    </article>`;
  $("#sExit").onclick = () => { if (confirm("End this session? Progress so far is saved.")) { S = null; go("#/"); } };
  $("#sReport").onclick = () => reportProblem(id);
  const body = view.querySelector(".cbody"), act = view.querySelector(".cact"), fb = view.querySelector(".cfb");
  const t0 = performance.now();
  let committed = false;
  const commit = res => {
    if (committed) return; committed = true;
    const ms = performance.now() - t0;
    const rating = res.rating || ratingFor(res.correct, ms / (res.nSteps || 1));   // multi-step cards get time per step
    const { newlyMastered } = recordAnswer(id, rating, { ms: Math.round(ms), type, detail: res.detail });
    if (!repeat) { S.firstTry.total++; if (res.correct) S.firstTry.right++; }
    if (newlyMastered) { S.mastered.push(id); store.xp = (store.xp || 0) + XP_PER_MASTERY; }
    S.seen.add(id);
    S.queue.shift();
    afterAnswer(S, id, res.correct);
    save();
    if (res.correct) chime(); else buzz();
    const next = () => { document.removeEventListener("keydown", onKey); renderSession(view); scrollTo(0, 0); };
    const onKey = e => { if (e.key === "Enter" && !e.target.closest("textarea,input")) { e.preventDefault(); next(); } };
    act.innerHTML = (newlyMastered ? `<span class="mastered">Mastered · +${XP_PER_MASTERY} XP</span>` : "") +
      (!res.correct ? `<span class="mute">It'll come back in a few cards.</span>` : "") + btn("Continue", "primary cont");
    act.querySelector(".cont").onclick = next;
    setTimeout(() => document.addEventListener("keydown", onKey), 50);
    act.querySelector(".cont").focus({ preventScroll: true });
    fb.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };
  C.render({ rec: r, body, act, fb, commit, rnd: S.rnd }).then(() => { view.dataset.ready = "1"; }, e => {
    body.innerHTML = `<p class="err">This card couldn't load: ${esc(e.message)}</p>`;
    act.innerHTML = btn("Skip", "primary");
    act.querySelector("button").onclick = () => { S.queue.shift(); renderSession(view); };
  });
}

function renderSessionDone(view) {
  const ft = S.firstTry, pct = ft.total ? Math.round(100 * ft.right / ft.total) : 0;
  const cleared = dueCards(true).length === 0;   // the streak needs every due review cleared, not just the focused ones
  markStudyDay(cleared);
  save();
  view.innerHTML = `<section class="done">
    <div class="eyebrow">Session done</div>
    <h1>${ft.total} card${ft.total === 1 ? "" : "s"} · ${pct}% right first try</h1>
    <p class="lead">${S.misses ? `You fixed ${S.misses} miss${S.misses === 1 ? "" : "es"} before finishing. Those cards come back tomorrow.` : "No misses."}
      ${S.mastered.length ? ` ${S.mastered.length} card${S.mastered.length === 1 ? "" : "s"} newly mastered (+${S.mastered.length * XP_PER_MASTERY} XP).` : ""}</p>
    <p class="lead">${cleared ? `All due reviews cleared. Streak: <b>${streak()} day${streak() === 1 ? "" : "s"}</b>.`
      : settings().focus.length ? `${dueCards(true).length} review${dueCards(true).length === 1 ? " is" : "s are"} still due in topics outside your focus; clear them to keep your streak.` : "Some reviews are still due."}</p>
    <div class="actions">${btn("Home", "primary home")}</div></section>`;
  view.querySelector(".home").onclick = () => { S = null; go("#/"); };
}

function reportProblem(id) {
  const text = prompt("What's wrong with this card? (wrong answer, unclear wording, bad drawing…)");
  if (!text || !text.trim()) return;
  (store.reports = store.reports || []).push({ card: id, text: text.trim(), at: new Date().toISOString(), build: BUILD_ID });
  save(); if (typeof syncReport === "function") syncReport(store.reports[store.reports.length - 1]);
  toast("Thanks, logged for review");
}

/* preview build only: #/card/<reaction id>/<type> opens any card, unscheduled (for reviewers and tests) */
function renderPreview(view, rid, type) {
  const r = RX[rid], C = CARDS[type];
  if (!r || !C || !typesFor(r).includes(type)) { view.innerHTML = `<p>No such card. <a href="#/">Home</a></p>`; return; }
  view.innerHTML = `<div class="sbar"><a class="pill" href="#/">✕ Home</a><span class="pill static">preview · not scheduled</span></div>
    <nav class="chips">${typesFor(r).map(t => `<a class="pill" href="#/card/${encodeURIComponent(rid)}/${t}" ${t === type ? 'aria-current="page"' : ""}>${esc(TYPE_NAME[t])}</a>`).join("")}</nav>
    <article class="card"><div class="ctype"><span>${esc(patternTag(r))}</span><span>${esc(C.title)}</span></div>
      <h2 class="ctitle">${esc(r.title.replace(/\s*→.*$/, ""))}</h2><div class="cbody"></div><div class="cfb" hidden aria-live="polite"></div><div class="cact"></div></article>`;
  const act = view.querySelector(".cact");
  C.render({ rec: r, body: view.querySelector(".cbody"), act, fb: view.querySelector(".cfb"), commit: res => {
    view.dataset.result = res.correct ? "correct" : "wrong";
    act.innerHTML = `<span class="mute">${res.correct ? "Correct" : "Wrong"} (not recorded)</span>` + btn("Try again", "primary again");
    act.querySelector(".again").onclick = () => renderPreview(view, rid, type);
  } }).then(() => { view.dataset.ready = "1"; });
}
