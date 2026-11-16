/* ---------- deck: the cards each reaction record produces, and when each unlocks ----------
   CONTENT is inlined by build.py ({reactions, lessons, diagnostic, dev}). */
const TYPES = ["where", "arrows", "mechanism", "intermediates", "product", "draw", "reagent", "why", "change", "back", "paper"];
const TYPE_NAME = {
  where: "Where does it react?", arrows: "Arrows", mechanism: "Full mechanism", intermediates: "Complete the intermediates", draw: "Draw the product", product: "Product", reagent: "Reagent",
  why: "Why?", change: "What changed?", back: "One step back", paper: "Paper round",
};
// a card type unlocks once its prerequisite card has been answered correctly once
const PREREQ = { arrows: "where", mechanism: "arrows", intermediates: "mechanism", draw: "product", product: "arrows", reagent: "product", why: "reagent", change: "product", back: "change", paper: "arrows" };
/* two courses: Orgo 1 (o1-1 … o1-6) and Orgo 2 (0 … 5); each unlocks on its own */
const O1_UNITS = ["o1-1", "o1-2", "o1-3", "o1-4", "o1-5", "o1-6"], O2_UNITS = [0, 1, 2, 3, 4, 5];
const UNITS = [...O1_UNITS, ...O2_UNITS];
const courseOf = u => O1_UNITS.includes(u) ? 1 : 2;
const unitNum = u => courseOf(u) === 1 ? +String(u).slice(3) : u;
const UNIT_NAME = { 0: "Why carbonyls react", 1: "Nucleophilic addition", 2: "Acyl substitution", 3: "1,2 vs 1,4 addition",
  4: "Enolates", 5: "Synthesis",
  "o1-1": "Acids, bases & arrow pushing", "o1-2": "Substitution & elimination", "o1-3": "Alkenes", "o1-4": "Alkynes",
  "o1-5": "Radical reactions", "o1-6": "Alcohols, ethers & epoxides" };
const UNIT_SHORT = { 0: "Carbonyl basics", 1: "Aldehydes & ketones", 2: "Acid derivatives", 3: "Enones", 4: "Enolates", 5: "Synthesis",
  "o1-1": "Acids & bases", "o1-2": "SN1/SN2/E1/E2", "o1-3": "Alkenes", "o1-4": "Alkynes", "o1-5": "Radicals", "o1-6": "Alcohols & ethers" };
const UNIT_DESC = { 0: "C=O polarity, tetrahedral intermediate, leaving groups, α-H acidity",
  1: "aldehydes & ketones: NaBH4/LiAlH4, Grignards, acetals, imines/enamines, Wittig, Wolff–Kishner",
  2: "carboxylic acids & derivatives: acid chlorides, esters, amides, nitriles, hydrolysis, DIBAL",
  3: "α,β-unsaturated carbonyls: Grignard vs Gilman (1,2 vs 1,4), cuprates",
  4: "enols & enolates: halogenation, alkylation, aldol, Claisen, Michael, Robinson, malonic/acetoacetic",
  5: "synthesis",
  "o1-1": "pKa, conjugate acids/bases, which way equilibria lie, the curved-arrow basics",
  "o1-2": "SN1/SN2/E1/E2: substrate, nucleophile/base, solvent, heat; Zaitsev vs Hofmann; stereochemistry",
  "o1-3": "additions to C=C: HX (Markovnikov), hydration, hydroboration, halogenation, halohydrins, epoxidation, ozonolysis",
  "o1-4": "alkyne additions and reductions, Lindlar vs Na/NH3, acetylide alkylation",
  "o1-5": "radical halogenation (Cl2 vs Br2 selectivity), allylic bromination with NBS",
  "o1-6": "oxidation (PCC vs chromic acid), making OH a leaving group, Williamson ethers, epoxide opening" };
const PATTERN_NAME = { A: "Nucleophilic addition", B: "Acyl substitution", C: "1,2 vs 1,4", D: "Enolates", S: "Substitution/elimination", P: "Proton transfer", E: "Electrophilic addition", R: "Radical", X: "Other (oxidation etc.)" };

const REACTIONS = CONTENT.reactions;
const RX = Object.fromEntries(REACTIONS.map(r => [r.id, r]));

function typesFor(r) {
  const noArrows = !r.keyStep;   // radical reactions: no curved-arrow cards
  return TYPES.filter(t => !(r.skipCards || []).includes(t))
              .filter(t => !noArrows || !["where", "arrows", "mechanism", "intermediates", "paper"].includes(t))
              .filter(t => t !== "change" || (r._newCC && r._newCC.length))
              .filter(t => t !== "back" || r.retro)
              .filter(t => t !== "mechanism" || (r.mechanism && r.mechanism.steps && r.mechanism.steps.length))
              .filter(t => t !== "intermediates" || (r.mechanism && r.mechanism.steps.some(s => s._build)))
              .filter(t => t !== "draw" || r._draw);
}
const cardId = (rid, type) => rid + ":" + type;
const parseCard = id => { const i = id.lastIndexOf(":"); return { rid: id.slice(0, i), type: id.slice(i + 1) }; };
const ALL_CARDS = REACTIONS.flatMap(r => typesFor(r).map(t => cardId(r.id, t)));

function prereqOf(r, type) {
  let p = PREREQ[type];
  const have = typesFor(r);
  while (p && !have.includes(p)) p = PREREQ[p] || null;   // e.g. "back" without a "change" card → product
  if (type === "back" && !p) p = "product";
  return p || null;
}
