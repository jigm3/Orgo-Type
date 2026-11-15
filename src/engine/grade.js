/* ---------- grading: typed reagents, arrows, taps, FSRS ratings ---------- */

/* Typed reagent answers. Normalize both sides, then accept an exact match or a small typo
   (1 edit for answers of 6+ characters, 2 for 12+). Workup ("H3O+") and step numbers are ignored. */
const SUBSCRIPTS = { "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9", "⁺": "+", "⁻": "-" };
function normReagent(s) {
  let t = String(s || "").toLowerCase().replace(/[₀-₉⁺⁻]/g, c => SUBSCRIPTS[c]);
  t = t.replace(/[–—−]/g, "-").replace(/\b[12]\s*[.)]\s*/g, " ");   // "1. ... 2. ..."
  const squash = x => x.replace(/[\s,;.]+/g, "").replace(/[()[\]{}]/g, "");
  // drop a trailing workup ("…, then H3O+"), unless the workup is the whole answer (acetal hydrolysis: H3O+)
  const noWorkup = t.replace(/(,|;|\bthen\b|\band\b)?\s*(h3o\+|h\+\s*\/\s*h2o|aqueous acid|acid workup|workup|aq\.?\s*acid)\s*$/g, "");
  return squash(noWorkup) || squash(t);
}
function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
function matchReagent(input, aliases) {
  const x = normReagent(input);
  if (!x) return { ok: false };
  for (const al of aliases) {
    const y = normReagent(al);
    if (!y) continue;
    if (x === y) return { ok: true, exact: true, alias: al };
    const tol = y.length >= 12 ? 2 : y.length >= 6 ? 1 : 0;
    if (tol && editDistance(x, y) <= tol) return { ok: true, exact: false, alias: al };
  }
  return { ok: false };
}

/* Arrows. An arrow is {from:{lonePair:m}|{bond:[m,m]}, to:{atom:m}|{bond:[m,m]}} in map numbers.
   `eq` maps each map number to a symmetry class, so equivalent atoms grade the same. */
function arrowKey(ar, eq) {
  const c = m => String(eq && eq[m] !== undefined ? eq[m] : m);
  const end = (e, kinds) => {
    for (const k of kinds) if (e && e[k] !== undefined)
      return k + ":" + (Array.isArray(e[k]) ? e[k].map(c).sort().join("-") : c(e[k]));
    return "?";
  };
  return end(ar.from, ["lonePair", "bond"]) + ">" + end(ar.to, ["atom", "bond"]);
}
function gradeArrows(given, answer, eq) {
  const want = answer.map(a => arrowKey(a, eq)).sort(), got = given.map(a => arrowKey(a, eq)).sort();
  const wantSet = new Set(want);
  const right = given.map(a => wantSet.has(arrowKey(a, eq)));
  return { ok: want.length === got.length && want.every((k, i) => k === got[i]), right };
}

/* Taps on atoms (where-does-it-react): right if the tapped atom is equivalent to the answer atom. */
const sameAtom = (m1, m2, eq) => m1 === m2 || (eq && eq[m1] !== undefined && eq[m1] === eq[m2]);

/* Rating map from the plan: wrong → Again, right but slow (> 20 s) → Hard, right → Good. */
const SLOW_MS = 20000;
function ratingFor(correct, ms) { return !correct ? "again" : ms > SLOW_MS ? "hard" : "good"; }
