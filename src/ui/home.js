/* ---------- home: today's session, the pattern map, units and lessons ---------- */
function renderHome(view) {
  const s = summary(), st = streak();
  const empty = !REACTIONS.length;
  const banner = CONTENT.dev
    ? `<div class="banner warn"><b>Preview build.</b> These cards haven't been checked by a reviewer yet, so some may contain mistakes. Use “Report a problem” on any card that looks wrong.</div>`
    : empty ? `<div class="banner">No checked cards yet. While the content is being reviewed, you can try the <a href="dev/">preview build</a>.</div>` : "";
  const startLabel = s.due + s.newLeft ? `Start · ${s.due} review${s.due === 1 ? "" : "s"}${s.newLeft ? ` + ${s.newLeft} new` : ""}` : "All caught up";
  // the next lesson to do in an open unit (new cards in that unit wait for it)
  const nextLesson = UNITS.filter(unitOpen).flatMap(lessonsOfUnit).find(l => !lessonDone(l.id));
  view.innerHTML = `
    ${banner}
    ${store.placed ? "" : placementCard()}
    <section class="today">
      <div class="eyebrow">Today</div>
      <h1>${s.due + s.newLeft ? (s.due ? "Reviews are waiting." : "Ready for something new.") : nextLesson ? "Start with a short lesson." : studiedToday() ? "Done for today." : "Nothing due right now."}</h1>
      <div class="stats">
        <div class="stat"><strong>${st}</strong><small>day streak${studiedToday() ? " · today ✓" : ""}</small></div>
        <div class="stat"><strong>${s.mastered}</strong><small>of ${s.total} cards mastered</small></div>
        <div class="stat"><strong>${store.xp || 0}</strong><small>XP</small></div>
      </div>
      <div class="actions">${s.due + s.newLeft || !nextLesson ? btn(startLabel, "primary big start", s.due + s.newLeft ? "" : "disabled")
        : `<a class="btn primary big" href="#/lesson/${encodeURIComponent(nextLesson.id)}">Lesson: ${esc(nextLesson.title)}</a>`}
        ${s.due + s.newLeft && nextLesson ? `<a class="btn" href="#/lesson/${encodeURIComponent(nextLesson.id)}">Next lesson: ${esc(nextLesson.title)}</a>` : ""}</div>
      ${focusRow()}
      <p class="mute small">Mixed practice from ${settings().focus.length ? "the topics you picked" : "every open unit"}. Cards you miss come back until you get them; a card is <b>mastered</b> once you've got it right on three separate days.</p>
    </section>

    <div class="eyebrow">Pattern map</div>
    <section class="pmap">${patternProgress().map(p => `
      <div class="ptile" style="--fill:${(100 * p.pct).toFixed(1)}%;--seen:${(100 * p.learned / p.total).toFixed(1)}%">
        <span class="tag">${esc(p.id)}</span><b>${esc(p.name)}</b>
        <div class="bar" role="img" aria-label="${p.mastered} of ${p.total} mastered, ${p.learned} learned"><i class="s"></i><i class="m"></i></div>
        <small>${p.mastered}/${p.total} mastered · ${p.learned} learned</small></div>`).join("") || '<p class="mute">The map fills in as cards are added.</p>'}
    </section>

    <div class="eyebrow">Units</div>
    <section class="units">${UNITS.map(unitRow).join("")}</section>

    <div class="eyebrow">The four patterns</div>
    <section class="patterns" id="patterns"></section>
    <footer class="foot">
      <a href="#/settings">Settings &amp; sync</a>${CONTENT.diagnostic.length ? '<a href="#/diag">Check-up quiz</a>' : ""}<a href="review.html">Review sheet</a>${CONTENT.dev ? '<a href="#/bench">Molecule bench</a>' : ""}
      <span>build ${BUILD_ID}</span><span id="fOff"></span>
    </footer>`;
  const st0 = view.querySelector(".start"); if (st0) st0.onclick = () => startSession();
  wirePlacement(view, () => { store.placed = true; save(); renderHome(view); setTimeout(maybeTour, 300); });
  view.querySelectorAll("[data-preset]").forEach(b => b.onclick = () => { settings().focus = [...FOCUS_PRESETS[b.dataset.preset]]; save(); renderHome(view); });
  view.querySelectorAll("[data-types]").forEach(b => b.onclick = () => { settings().focusTypes = b.dataset.types === "all" ? [] : ["mechanism", "intermediates", "draw"]; save(); renderHome(view); });
  view.querySelectorAll("[data-focus]").forEach(b => b.onclick = () => {
    const f = settings().focus, u = b.dataset.focus, i = f.indexOf(u);
    if (i >= 0) f.splice(i, 1); else f.push(u);
    save(); renderHome(view);
  });
  view.querySelectorAll("[data-unlock]").forEach(b => b.onclick = () => {
    const u = isNaN(+b.dataset.unlock) ? b.dataset.unlock : +b.dataset.unlock;
    if (confirm(`Open “${UNIT_NAME[u]}” now? Its cards build on the earlier units.`)) { settings().unlocked[u] = true; save(); renderHome(view); }
  });
  renderPatterns();
  offlineStatus();
}

/* ---- "Where are you in the course?" (first visit, and in Settings) ---- */
const PLACE_UNITS = [0, 1, 2, 3, 4];
function placementList() {
  return PLACE_UNITS.map(u => `<label class="place"><input type="checkbox" data-cover="${u}" ${isCovered(u) ? "checked" : ""}>
    <span><b>${u === 0 ? "Unit 0" : "Unit " + u} · ${esc(UNIT_NAME[u])}</b><small>${esc(UNIT_DESC[u])}</small></span></label>`).join("");
}
let placeStep = 1;   // first visit: 1 = Orgo 1 or 2?, 2 = which unit?
function placementCard() {
  if (placeStep === 1) return `<section class="placecard"><div class="eyebrow">Welcome</div><h1>Where in Orgo are you?</h1>
    <p class="lead">So the app can start where you are.</p>
    <div class="places"><button class="place pick" data-level="1"><span><b>Orgo 1</b><small>SN1/SN2/E1/E2, alcohols, ethers and epoxides (the Orgo 1 review deck)</small></span></button>
      <button class="place pick" data-level="2"><span><b>Orgo 2</b><small>carbonyl chemistry: aldehydes &amp; ketones, acid derivatives, enones, enolates</small></span></button></div>
    <div class="actions">${btn("Skip for now", "placefresh")}</div></section>`;
  return `<section class="placecard"><div class="eyebrow">Orgo 2</div><h1>Which unit?</h1>
    <p class="lead">Tick what you've already covered in class (ticking a unit ticks the ones before it). Those units open now,
      their lessons become optional, and their cards go straight to the real practice. Everything else unlocks as you go.
      You can change this any time in Settings.</p>
    <div class="places">${placementList()}</div>
    <div class="actions">${btn("Save and start", "primary placesave")}${btn("Back", "placeback")}${btn("I'm starting Orgo 2 from the beginning", "placefresh")}</div></section>`;
}
function wirePlacement(view, done) {
  view.querySelectorAll("[data-cover]").forEach(c => c.onchange = () => {
    const cov = settings().covered; if (c.checked) cov[c.dataset.cover] = true; else delete cov[c.dataset.cover];
    // covering a later unit implies the earlier ones
    if (c.checked) PLACE_UNITS.filter(u => u < +c.dataset.cover).forEach(u => { cov[u] = true; view.querySelector(`[data-cover="${u}"]`).checked = true; });
    save();
  });
  view.querySelectorAll("[data-level]").forEach(b => b.onclick = () => {
    if (b.dataset.level === "2") { placeStep = 2; renderHome(view); scrollTo(0, 0); return; }
    // Orgo 1: practise the Orgo 1 review deck; Orgo 2 units stay closed until reached
    settings().level = 1; settings().covered = {}; settings().focus = ["side"]; done();
  });
  const back = view.querySelector(".placeback");
  if (back) back.onclick = () => { placeStep = 1; renderHome(view); };
  const s1 = view.querySelector(".placesave"), s2 = view.querySelector(".placefresh");
  if (s1) s1.onclick = () => { settings().level = 2; done(); };
  if (s2) s2.onclick = () => { settings().covered = {}; done(); };
}

/* "Practising:" presets and unit chips; empty focus = everything */
function focusRow() {
  const f = settings().focus, same = (a, b) => a.length === b.length && a.every(x => b.includes(x));
  const preset = (k, label) => `<button class="pill" data-preset="${k}" aria-pressed="${same(f, FOCUS_PRESETS[k])}">${label}</button>`;
  const units = UNITS.filter(u => cardsOfUnit(u).length).map(u => {
    const open = unitOpen(u), on = f.includes(String(u));
    return `<button class="pill" data-focus="${u}" aria-pressed="${on}" ${open ? "" : 'title="locked"'}>${u === "side" ? "Orgo 1 review" : "Unit " + u}${open ? "" : " 🔒"}</button>`;
  }).join("");
  const ft = settings().focusTypes || [], mech = ft.includes("mechanism");
  const types = `<span class="fsep"></span><button class="pill" data-types="all" aria-pressed="${!ft.length}">All card types</button>
    <button class="pill" data-types="mechanism" aria-pressed="${mech}">Mechanisms &amp; drawing only</button>`;
  const s = summary(), hidden = s.dueAll - s.due;
  return `<div class="focus" role="group" aria-label="Topics to practise"><span class="mute small">Practising:</span>
    ${preset("all", "Everything")}${preset("orgo2", "All of Orgo 2")}<span class="fsep"></span>${units}${types}</div>
    ${f.length && hidden ? `<p class="mute small">${hidden} review${hidden === 1 ? " is" : "s are"} due outside these topics.</p>` : ""}
    ${f.length && !s.due && !s.newLeft && f.some(u => lessonsOfUnit(isNaN(+u) ? u : +u).some(l => !lessonDone(l.id))) ? `<p class="mute small">New cards in these topics start after their lesson (see Units below).</p>` : ""}`;
}

function unitRow(u) {
  const ids = cardsOfUnit(u), lessons = lessonsOfUnit(u);
  if (!ids.length && !lessons.length) return "";
  const st = unitStatus(u), m = masteryOf(ids);
  const learned = ids.filter(id => cardState(id) && cardState(id).days.length).length;
  const lessonBtns = lessons.map(l => `<a class="btn sm ${lessonDone(l.id) ? "" : "primary"}" href="#/lesson/${encodeURIComponent(l.id)}">${lessonDone(l.id) ? "Revisit" : "Start"} lesson: ${esc(l.title)}</a>`).join("");
  const status = st.covered ? `<span class="mute">Covered in class · lesson optional</span>` : !st.open
    ? `<span class="lock">Locked · opens at 60% of earlier units learned (now ${Math.round(100 * (st.have || 0))}%)</span> <button class="link" data-unlock="${u}">Open now</button>`
    : ids.length && lessons.some(l => !lessonDone(l.id)) ? `<span class="mute">New cards start after the lesson.</span>` : "";
  return `<div class="unit ${st.open ? "" : "locked"}">
    <div class="uhead"><span class="tag">${u === "side" ? "Side deck" : "Unit " + u}</span><b>${esc(UNIT_NAME[u])}</b>
      <small>${ids.length ? `${learned}/${ids.length} learned · ${m.mastered} mastered` : ""}</small></div>
    <div class="ubody">${status}${st.open ? lessonBtns : ""}</div></div>`;
}

/* ---- the four pattern cards (illustrations, not graded content) ---- */
const PATTERNS = [
  { id: "A", name: "Nucleophilic addition", smiles: "CC(C)=O", lit: { 1: "accent" },
    text: "A nucleophile attacks the C=O carbon. Aldehydes and ketones have no leaving group, so it just adds." },
  { id: "B", name: "Nucleophilic acyl substitution", smiles: "CC(=O)Cl", lit: { 1: "accent", 3: "accent2" },
    text: "Same attack, but there's a leaving group (blue), so it adds and then eliminates." },
  { id: "C", name: "1,2 vs 1,4 addition", smiles: "C=CC(C)=O", lit: { 2: "accent", 0: "accent2" },
    text: "Enones have two electrophilic carbons: hard nucleophiles hit C=O (1,2), soft ones hit the β-carbon (1,4)." },
  { id: "D", name: "Enolate as nucleophile", smiles: "C=C(C)[O-]", lit: { 0: "accent" },
    text: "The α-carbon becomes the nucleophile, then runs pattern A, B or C (or SN2)." },
];
const litColors = lit => Object.fromEntries(Object.entries(lit).map(([i, v]) => [i, cssVar("--" + v)]));
function renderPatterns() {
  const box = $("#patterns"); if (!box) return;
  box.innerHTML = PATTERNS.map(p => `
    <article class="pcard"><span class="tag">PATTERN ${p.id}</span><div class="mol" id="pm${p.id}">drawing…</div>
      <b>${esc(p.name)}</b><p>${esc(p.text)}</p></article>`).join("");
  PATTERNS.forEach(p => depict(p.smiles, { width: 240, height: 160, highlight: litColors(p.lit) })
    .then(d => { const el = $("#pm" + p.id); if (el) el.innerHTML = d.svg; })
    .catch(e => { const el = $("#pm" + p.id); if (el) el.innerHTML = `<span class="err">${esc(e.message)}</span>`; }));
}

function offlineStatus() {
  const off = $("#fOff"); if (!off) return;
  const ok = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
  off.textContent = ok ? "● ready offline" : "○ not cached yet"; off.className = ok ? "on" : "";
}
