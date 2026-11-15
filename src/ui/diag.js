/* ---------- pilot check-up: a baseline quiz (form A) and a parallel retest (form B) ----------
   New problems that are NOT in the deck, across patterns A–D, synthesis and the SN/E decision.
   No feedback until the end (it's a measurement, not practice). Results are kept in store.diag and
   included in the progress export. Items: content/diagnostic/*.json (see docs/SCHEMA.md). */
let D = null;

function renderDiag(view, form) {
  const forms = [...new Set(CONTENT.diagnostic.map(q => q.form))].sort();
  store.diag = store.diag || {};
  if (!form || !forms.includes(form)) {
    view.innerHTML = `<section class="settings"><div class="eyebrow"><a href="#/">← Home</a></div><h1>Check-up quiz</h1>
      <p class="lead">About 15 problems you haven't practised, across the four patterns, synthesis and SN1/SN2/E1/E2. No hints and no feedback until the end. It takes 10–15 minutes.</p>
      <p class="mute">Take form A before you start using the app, and form B after about two weeks. They're matched in difficulty, so comparing them shows what improved.</p>
      <div class="units">${forms.map(f => {
        const res = store.diag[f];
        return `<div class="unit"><div class="uhead"><span class="tag">Form ${f}</span><b>${f === "A" ? "Baseline" : "Retest"}</b>
          <small>${res ? `taken ${esc(res.at.slice(0, 10))} · ${res.right}/${res.total}` : `${CONTENT.diagnostic.filter(q => q.form === f).length} questions`}</small></div>
          <div class="ubody"><a class="btn sm ${res ? "" : "primary"}" href="#/diag/${f}">${res ? "Retake" : "Start"} form ${f}</a></div></div>`;
      }).join("")}</div></section>`;
    return;
  }
  if (!D || D.form !== form) D = { form, i: 0, answers: [], t0: Date.now(), qs: CONTENT.diagnostic.filter(q => q.form === form) };
  if (D.i >= D.qs.length) return diagDone(view);
  const q = D.qs[D.i];
  view.innerHTML = `
    <div class="sbar"><a class="pill quit" href="#/diag">✕ Quit</a><div class="sprog"><i style="width:${Math.round(100 * D.i / D.qs.length)}%"></i></div>
      <span class="pill static">${D.i + 1} / ${D.qs.length}</span></div>
    <article class="card"><div class="ctype"><span>Check-up · form ${esc(form)}</span><span></span></div>
      <div class="cbody"><p class="cq">${md(q.prompt)}</p>${q.start ? '<div class="rx"></div>' : ""}
        <div class="opts ${q.options.some(o => o.smiles) ? "" : "list"}">${q.options.map((o, k) =>
          `<button class="opt ${o.smiles ? "" : "row"}" data-k="${k}"><span class="optl">${"ABCD"[k]}</span>${o.smiles ? '<div class="optm"></div>' : `<span class="optt">${md(o.text)}</span>`}</button>`).join("")}</div></div>
      <div class="cact">${btn("Next", "primary nx", "disabled")}</div></article>`;
  if (q.start) {
    view.querySelector(".rx").innerHTML = `<div class="rxn"><div class="rs"></div><div class="rarr"><span>${esc(q.reagentDisplay || "")}</span><i></i></div><div class="rp"><div class="qmark">?</div></div></div>`;
    molPanel(view.querySelector(".rs"), q.start, { width: 300, height: 180 });
  }
  view.querySelectorAll(".optm").forEach((el, k) => molPanel(el, q.options.filter(o => o.smiles)[k].smiles, { width: 220, height: 140 }));
  view.querySelector(".quit").onclick = () => { D = null; };
  let pick = -1;
  const box = view.querySelector(".opts");
  box.onclick = e => { const b = e.target.closest(".opt"); if (!b) return; pick = +b.dataset.k;
    box.querySelectorAll(".opt").forEach(x => x.setAttribute("aria-checked", String(+x.dataset.k === pick))); view.querySelector(".nx").disabled = false; };
  view.querySelector(".nx").onclick = () => {
    D.answers.push({ id: q.id, pattern: q.pattern, ok: !!q.options[pick].correct, pick });
    D.i++; renderDiag(view, form); scrollTo(0, 0);
  };
}

function diagDone(view) {
  const by = {};
  for (const a of D.answers) { const b = by[a.pattern] = by[a.pattern] || { right: 0, total: 0 }; b.total++; if (a.ok) b.right++; }
  const right = D.answers.filter(a => a.ok).length;
  store.diag[D.form] = { at: new Date().toISOString(), right, total: D.answers.length, byPattern: by, answers: D.answers, minutes: Math.round((Date.now() - D.t0) / 6e4) };
  save();
  const name = p => PATTERN_NAME[p] || (p === "SYN" ? "Synthesis" : p);
  view.innerHTML = `<section class="done"><div class="eyebrow">Check-up done · form ${esc(D.form)}</div>
    <h1>${right} of ${D.answers.length} right</h1>
    <ul class="bypat">${Object.entries(by).map(([p, b]) => `<li><b>${esc(name(p))}</b> ${b.right}/${b.total}</li>`).join("")}</ul>
    <p class="lead">Saved. ${D.form === "A" ? "Take form B after about two weeks of daily practice to see what changed." : "Use Settings → Export progress to send the results."}</p>
    <div class="actions">${btn("Home", "primary home")}</div></section>`;
  D = null;
  view.querySelector(".home").onclick = () => go("#/");
}
