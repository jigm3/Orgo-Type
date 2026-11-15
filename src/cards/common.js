/* ---------- card helpers ----------
   A card type is { title, render(ctx) }. ctx:
     rec      the reaction record          body / act / fb   elements to draw into
     commit(result)  call exactly once with { correct, rating?, detail? } when the student commits
   One try: after commit the card locks and shows the answer with explanations. */
const CARDS = {};
const btn = (label, cls = "", attrs = "") => `<button class="btn ${cls}" ${attrs}>${label}</button>`;
const firstSentence = s => (String(s).match(/^.*?[.!?](\s|$)/) || [s])[0].trim();
const patternTag = r => `Pattern ${r.pattern} · ${PATTERN_NAME[r.pattern] || ""}`;

/* "start  —reagents→  product (or ?)" */
async function rxnRow(host, r, { product = true, productSmiles, reagent = true, startSmiles, w = 300, h = 190 } = {}) {
  host.innerHTML = `<div class="rxn"><div class="rs"></div><div class="rarr"><span>${reagent ? esc(r.reagentDisplay) : "?"}</span><i></i></div>
    <div class="rp">${product ? "" : '<div class="qmark">?</div>'}</div></div>`;
  const jobs = [molPanel(host.querySelector(".rs"), startSmiles || r._start, { width: w, height: h, label: "starting material" })];
  if (product) jobs.push(molPanel(host.querySelector(".rp"), productSmiles || r.product, { width: w, height: h, label: "product" }));
  return Promise.all(jobs);
}

function verdict(fb, ok, html) {
  fb.hidden = false;
  fb.className = "cfb " + (ok ? "good" : "bad");
  fb.innerHTML = `<div class="vd">${ok ? "Correct" : "Not quite"}</div>${html}`;
}
const whyBlock = r => `<p class="why"><b>Why:</b> ${esc(r.why)}</p>`;
