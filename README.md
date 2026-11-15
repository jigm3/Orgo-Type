# Orgo Type

A study app for organic chemistry built on what the learning research says works: every screen is a question,
practice is spaced and mixed, and reactions are organized by **mechanism pattern** (nucleophilic addition,
acyl substitution, 1,2 vs 1,4 addition, enolates) instead of by chapter. Same family as
[Anatomy Type](https://github.com/jigm3/Anatomy-Type).

- **Live app:** https://jigm3.github.io/Orgo-Type/ shows only cards a human reviewer has checked.
- **Preview:** https://jigm3.github.io/Orgo-Type/dev/ shows everything, including unchecked cards, and keeps separate progress.
- **Review sheet:** https://jigm3.github.io/Orgo-Type/review.html, for checking the chemistry.

## What's in it

- **Eight card types per reaction**, unlocking in order: where does it react (tap the nucleophile and electrophile),
  arrows for the key step, product (multiple choice, every wrong option explains its mistake), reagent (typed, with
  fuzzy matching), why (self-graded), what changed (new C–C bonds, carbons added), one step back (retrosynthesis), and
  a paper round (draw it by hand, then check).
- **Scheduling:** FSRS (target retention 0.9), with successive relearning: misses come back in the same session until
  they're right. A card is mastered when it's right on the first try on 3 separate days. 15 new cards per day by
  default; sessions interleave patterns and put confusable reactions next to each other.
- **Lessons** per unit: worked example → faded step (some arrows drawn for you) → solve, with "why" questions.
- **Game layer:** pattern map, streak (days you clear all due reviews), XP for first-time mastery and lessons, unit
  unlocks (60% of earlier units learned, or open early by hand), first-visit tour, "report a problem" on every card.
- **Pilot tools:** check-up quiz with parallel forms A/B, progress export, `tools/pilot_report.py` (see docs/PILOT.md).
- Works offline and installs to the home screen; four themes; optional sync between devices with a sync code.

## Build and test

```bash
pip install -r requirements.txt   # Python RDKit, for the validator, compiler and review sheet
python3 build.py --serve          # validate, build dist/ (app) and dist/dev/ (preview), serve on :8000
python3 tools/validate.py         # check all content
python3 tools/test_validate.py    # validator tests (good content passes, broken copies fail)
node tests/engine.test.js         # grading, unlocks, 14-day scheduler simulation
node tests/app.test.js            # browser: every card of every reaction answered right and wrong, lessons, a session
node tests/smoke.js               # browser: rendering, atom taps, offline reload (desktop + phone)
```

Pushing to `main` runs the tests and deploys to GitHub Pages (`.github/workflows/pages.yml`).

## Content and review

Reactions, lessons and quiz items live in `content/` as JSON ([docs/SCHEMA.md](docs/SCHEMA.md)). The validator
catches structural mistakes (bad SMILES, broken atom maps, arrows to atoms that don't exist, a wrong option that
is actually the answer), but **not** chemistry mistakes, so every item starts as `"verified": false`.
To publish an item:

1. Open the review sheet (or `#/card/<id>/<type>` in the preview to play any card) and check it against a trusted source.
   Items with a `review` note have a specific doubt written on them.
2. Fix it if needed, then set `"verified": true, "verifiedBy": "<your name>"`.
3. `python3 tools/fmt_content.py && python3 tools/validate.py`, commit, push.

Only verified material ships to the main app; a lesson ships once it and every reaction it uses are verified.

## Sync (optional)

Sync is off until the site has a Firebase project:

1. Create a Firebase project (console.firebase.google.com), add a **Web app**, and create a **Firestore** database.
2. Paste `firestore.rules` from this repo into Firestore → Rules and publish.
3. Commit a `firebase.config.json` at the repo root: `{"projectId": "your-project-id", "apiKey": "your-web-api-key"}`.
   (A Firebase web API key identifies the project and is meant to be public; the rules are what protect the data.)

Settings then offers "Make a sync code"; entering the code on another device merges progress. Problem reports also
land in the `reports` collection.

## Layout

```
content/reactions/    reaction records, one file per unit + side deck
content/lessons/      one lesson per unit
content/diagnostic/   check-up quiz (forms A and B)
src/engine/           store, grading, deck, scheduler (FSRS), game layer, sync
src/chem/rdkit.js     lazy RDKit loader + depict(): theme-coloured SVG with atom and bond coordinates
src/cards/            one module per card type
src/ui/               molecule panel, session, lessons, home, settings, tour, quiz, router
tools/                validate, compile_content, review_sheet, fmt_content, pilot_report, make_icons
vendor/               RDKit MinimalLib 2026.9.1 (BSD-3), ts-fsrs 5.4.2 (MIT)
```

## Licenses

RDKit is BSD-3-Clause, ts-fsrs is MIT (licence files in `vendor/`). All study content is written for this app.
