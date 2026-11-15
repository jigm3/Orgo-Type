# Orgo Type

A gamified, research-based study app for organic chemistry, organized by mechanism pattern
(nucleophilic addition, acyl substitution, 1,2 vs 1,4 addition, enolates) rather than by chapter.
Same family as [Anatomy Type](https://github.com/jigm3/Anatomy-Type).

**Status: Phase 1 (content schema + validator).** The page renders molecules with RDKit.js, supports tapping
atoms, installs to the home screen and works offline. Reaction records and their validator are in place;
practice cards come in Phase 2.

## Build and run

```bash
pip install -r requirements.txt   # Python RDKit, for the validator and review sheet
python3 build.py --serve          # validate, build dist/ and serve http://localhost:8000
python3 build.py --dev            # same, but include unverified cards
python3 tools/validate.py         # check content/reactions/*.json
python3 tools/test_validate.py    # validator tests (good content passes, broken copies fail)
node tests/smoke.js               # Playwright: desktop + phone render, atom taps, offline reload
```

## Adding and checking content

1. Write records in `content/reactions/*.json` following [docs/SCHEMA.md](docs/SCHEMA.md). Mark shaky parts with `"review"`.
2. `python3 tools/validate.py` must pass.
3. Open `dist/review.html` (live: `/review.html`) and check every card against a trusted source.
4. Set `"verified": true, "verifiedBy": "name"` on cards that are right. Only verified cards ship.

Pushing to `main` builds and deploys to GitHub Pages (`.github/workflows/pages.yml`).

## Layout

```
src/index.html        page template; build.py inlines the CSS and JS below into one index.html
src/ui/               tokens.css (themes), app.css, app.js (home screen, molecule bench)
src/engine/store.js   localStorage store
src/chem/rdkit.js     lazy RDKit loader + depict(): theme-coloured SVG and per-atom coordinates
src/sw.js             service worker template (cache name = build hash)
vendor/rdkit/         RDKit MinimalLib 2026.9.1 (BSD-3-Clause), served locally for offline use
content/reactions/    reaction records, one file per unit (docs/SCHEMA.md)
tools/validate.py     content validator; test_validate.py tests it
tools/review_sheet.py HTML sheet for the human chemistry check (dist/review.html)
tools/make_icons.js   app icons
```

### Drawing molecules

`depict(smiles, {width, height, highlight: {atomIdx: color}})` returns `{svg, atoms}` where each atom has
`idx`, `map` (atom-map number, if any), `el`, and `x, y` in the SVG's coordinates. Atom-mapped SMILES are
drawn without map labels. Every atom is always passed to RDKit as highlighted (unwanted ones transparent),
so the layout never shifts when the highlight changes and atom centres come straight from the SVG.

## Licenses

RDKit is BSD-3-Clause (`vendor/rdkit/LICENSE`). All study content is written for this app.
