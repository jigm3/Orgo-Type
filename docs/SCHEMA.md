# Reaction record schema

Explicit hydrogens are allowed and kept: write `[H:12]` when an arrow needs to start or end on a hydrogen
(hydride transfer, E2 deprotonation, proton transfer). Hydrogens never need map numbers in the product.

One JSON array per file in `content/reactions/` (`u0.json` … `u5.json`, `side.json`). Each element is one
reaction record; the app builds several cards from it (where does it react, arrows, product, reagent, why).

`python3 tools/validate.py` checks every rule marked **(checked)**. Chemistry correctness is not checked:
that is the human review (`verified` / `verifiedBy`), done on `dist/review.html`.

## Fields

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Unique, lowercase-hyphenated, starts with the unit: `u1-grignard-ketone`. **(checked: format, unique)** |
| `unit` | 0–5 or `"side"` | Unit number; `"side"` is the Orgo 1 side deck. **(checked)** |
| `pattern` | `A` `B` `C` `D` `S` `X` | A nucleophilic addition · B acyl substitution · C 1,2 vs 1,4 · D enolate · S substitution/elimination · X other (oxidation, protecting groups…). **(checked)** |
| `title` | string | Short name shown on the card. |
| `reactants` | SMILES[] | The substrate(s), **atom-mapped**. **(checked: parse + sanitize, non-empty)** |
| `reagents` | SMILES[] | Reagent species that contribute atoms, atom-mapped (e.g. `[CH3:5][Mg:6][Br:7]`). Two equivalents = two entries with different map numbers. May be `[]` (e.g. base-catalysed aldol). |
| `reagentDisplay` | string | How the reagents are written on the card: `1. CH3MgBr, ether  2. H3O+`. |
| `reagentAliases` | string[] | Accepted typed answers for the reagent card. **(checked: non-empty)** |
| `product` | SMILES | The major organic product after workup, atom-mapped. Use `@`/`@@` for stereocentres the card is about. |
| `byproducts` | SMILES[] | Optional. Mapped atoms that leave (methanol, Br⁻). Only for the "what changed?" card. |
| `keyStep` | object | See below. |
| `why` | string | One to three sentences: the model answer for the "why" card. |
| `traps` | object[] | 2–4 wrong products: `{ "smiles", "explains" }`. `explains` names the specific mistake. **(checked)** |
| `confusableWith` | id[] | Records to interleave next to this one. **(checked: ids exist, not self)** |
| `tags` | string[] | Free tags (`C-C bond`, `organometallic`…). |
| `retro` | object | Optional. Enables the "one step back" card: `{ "distractors": [{ "precursor", "reagent", "explains" }] }`, 2–3 routes that do **not** make the target (careful: many alternative routes are valid, e.g. ester + 2 RMgX also makes a 3° alcohol, so never use a valid route as a distractor). The correct option is built from `reactants` + `reagentDisplay`. **(checked: count, parse, explanation, not the answer)** |
| `skipCards` | string[] | Optional. Card types to leave out for this record (`where`, `arrows`, `paper`, `change`, `back`), e.g. when the mechanism has no clean key step (Clemmensen). **(checked)** |
| `review` | string | Optional note to the human reviewer about a low-confidence part. Printed as a validator warning and on the review sheet. |
| `source` | `shared` / `personal` | Optional, default `shared`. Personal records (e.g. from Achieve) never ship in the shared build. |
| `verified` | bool | Must be `true` for the card to ship in a normal build. |
| `verifiedBy` | string / null | Who checked it. **(checked: required when verified)** |

## Atom maps

**(checked)**
- Map numbers are unique across all `reactants` + `reagents`.
- **Every heavy atom in the product is mapped**, and each map number comes from a reactant or reagent
  with the same element. (This is what lets the "what changed?" card find new C–C bonds.)
- Reactant/reagent atoms may be missing from the product (leaving groups, MgBr, Li⁺).
- At least one reactant atom ends up in the product.

## keyStep

The single step the arrows card drills (v1 shows the key step only, not the full mechanism).

```json
"keyStep": {
  "species": ["[CH2:1]=[CH:2][O-:3]", "[CH3:4][CH:5]=[O:6]"],
  "nucleophileAtom": 1,
  "electrophileAtom": 5,
  "arrows": [
    { "from": { "lonePair": 3 }, "to": { "bond": [2, 3] } },
    { "from": { "bond": [1, 2] }, "to": { "atom": 5 } },
    { "from": { "bond": [5, 6] }, "to": { "atom": 6 } }
  ]
}
```

- `species` is optional: the molecules present at the key step when they differ from the reactants
  (an enolate, a protonated carbonyl). Defaults to `reactants + reagents`. Its map numbers must exist in the
  reactants/reagents with the same element. **(checked)**
- Arrow tail: `{ "lonePair": map }` or `{ "bond": [map, map] }`. Head: `{ "atom": map }` (new bond to that atom,
  or the electrons land on it) or `{ "bond": [map, map] }` (forms a new π bond there).
- **(checked)** every atom exists in the species; every tail bond exists; a lone-pair tail is on N/O/S/P/halogen
  or a negatively charged atom; some arrow starts at `nucleophileAtom` and some arrow ends at `electrophileAtom`.

## Traps

**(checked)** Each trap parses, has a non-empty `explains`, differs from the product, and differs from every
other trap. Comparison is by **isomeric** canonical SMILES with maps removed, so a "retention" trap that is
accidentally written as the inverted product is caught.

## Cross-record

**(checked)** No duplicate ids. No two records with the same reactants, reagents and product.

# Lessons (`content/lessons/*.json`)

One array of lessons per file. A lesson is short and leads straight into retrieval: worked example →
faded step → solve, with "why" prompts. Lessons aren't scheduled; a unit's new cards start once its lesson is done.

```json
{ "id": "lesson-u1", "unit": 1, "title": "Nucleophiles add to C=O", "verified": false, "verifiedBy": null,
  "review": "optional note to the reviewer",
  "steps": [
    { "kind": "read", "text": "Short text, **bold** allowed. Under ~30 seconds.", "smiles": "[CH3:1][C:2](=[O:3])[CH3:4]", "lit": { "2": "el" } },
    { "kind": "tap", "text": "Tap the electrophilic carbon.", "smiles": "...", "answer": [2], "explain": "..." },
    { "kind": "choice", "text": "Question?", "options": [ { "text": "…", "correct": true, "explains": "…" }, { "text": "…", "explains": "why it's wrong" } ] },
    { "kind": "worked", "reaction": "u1-grignard-ketone", "text": "optional intro" },
    { "kind": "card", "reaction": "u1-grignard-aldehyde", "card": "arrows", "given": 1 },
    { "kind": "card", "reaction": "u1-grignard-formaldehyde", "card": "product" }
  ] }
```

**(checked)** kinds; text present; `read` under 90 words (warning); SMILES parse; `lit` and `answer` maps exist
(`lit` values `nu`/`el`/`lg`); choices have 2–4 options, exactly one correct, every wrong option explained;
`worked`/`card` reactions exist; the card type is available for that reaction; `given` only on arrows cards and
leaves at least one arrow to draw. A lesson only ships when it and every reaction it uses are verified.

# Check-up quiz (`content/diagnostic/*.json`)

Parallel forms for the pilot: form A (baseline) and form B (retest after ~2 weeks), matched item by item through `pair`.
Items must be **new problems that are not in the deck** (transfer), so students can't have memorized them.

```json
{ "id": "dx-a-grignard", "form": "A", "pair": "grignard-alcohol", "pattern": "A",
  "prompt": "What is the major product?", "start": "O=C1CCCC1", "reagentDisplay": "1. CH3CH2MgBr  2. H3O+",
  "options": [ { "smiles": "CCC1(O)CCCC1", "correct": true }, { "smiles": "OC1CCCC1", "explains": "…" } ],
  "verified": false, "verifiedBy": null }
```

`pattern` is A–D, S, X, or `SYN` (synthesis). Options are molecules (`smiles`) or text (`text`, e.g. "SN2" or a
reagent sequence). **(checked)** fields, form, pattern, SMILES, 2–4 options with exactly one correct and wrong ones
explained, no duplicate options, every `pair` has both an A and a B item; a warning if a correct product is also in the deck.
