/* ---------- deck: the cards each reaction record produces, and when each unlocks ----------
   CONTENT is inlined by build.py ({reactions, lessons, diagnostic, dev}). */
const TYPES = ["where", "arrows", "mechanism", "product", "reagent", "why", "change", "back", "paper"];
const TYPE_NAME = {
  where: "Where does it react?", arrows: "Arrows", mechanism: "Full mechanism", product: "Product", reagent: "Reagent",
  why: "Why?", change: "What changed?", back: "One step back", paper: "Paper round",
};
// a card type unlocks once its prerequisite card has been answered correctly once
const PREREQ = { arrows: "where", mechanism: "arrows", product: "arrows", reagent: "product", why: "reagent", change: "product", back: "change", paper: "arrows" };
const UNITS = [0, 1, 2, 3, 4, 5, "side"];
const UNIT_NAME = { 0: "Why carbonyls react", 1: "Nucleophilic addition", 2: "Acyl substitution", 3: "1,2 vs 1,4 addition",
  4: "Enolates", 5: "Synthesis", side: "Orgo 1 review" };
const PATTERN_NAME = { A: "Nucleophilic addition", B: "Acyl substitution", C: "1,2 vs 1,4", D: "Enolates", S: "SN1/SN2/E1/E2", X: "Other" };

const REACTIONS = CONTENT.reactions;
const RX = Object.fromEntries(REACTIONS.map(r => [r.id, r]));

function typesFor(r) {
  return TYPES.filter(t => !(r.skipCards || []).includes(t))
              .filter(t => t !== "change" || (r._newCC && r._newCC.length))
              .filter(t => t !== "back" || r.retro)
              .filter(t => t !== "mechanism" || (r.mechanism && r.mechanism.steps && r.mechanism.steps.length));
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
