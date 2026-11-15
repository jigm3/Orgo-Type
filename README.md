# Orgo Type

A gamified, research-based study app for organic chemistry, organized by mechanism pattern
(nucleophilic addition, acyl substitution, 1,2 vs 1,4 addition, enolates) rather than by chapter.
Same family as [Anatomy Type](https://github.com/jigm3/Anatomy-Type).

**Status: Phase 0 (shell).** The page renders molecules with RDKit.js, supports tapping atoms,
installs to the home screen and works offline. No practice cards yet.

## Build and run

```bash
python3 build.py --serve      # builds dist/ and serves http://localhost:8000
node tests/smoke.js           # Playwright: desktop + phone render, atom taps, offline reload
```

Pushing to `main` builds and deploys to GitHub Pages (`.github/workflows/pages.yml`).

## Layout

```
src/index.html        page template; build.py inlines the CSS and JS below into one index.html
src/ui/               tokens.css (themes), app.css, app.js (home screen, molecule bench)
src/engine/store.js   localStorage store
src/chem/rdkit.js     lazy RDKit loader + depict(): theme-coloured SVG and per-atom coordinates
src/sw.js             service worker template (cache name = build hash)
vendor/rdkit/         RDKit MinimalLib 2026.9.1 (BSD-3-Clause), served locally for offline use
content/              reactions and lessons (Phase 1+)
tools/                make_icons.js; validate.py arrives in Phase 1
```

### Drawing molecules

`depict(smiles, {width, height, highlight: {atomIdx: color}})` returns `{svg, atoms}` where each atom has
`idx`, `map` (atom-map number, if any), `el`, and `x, y` in the SVG's coordinates. Atom-mapped SMILES are
drawn without map labels. Every atom is always passed to RDKit as highlighted (unwanted ones transparent),
so the layout never shifts when the highlight changes and atom centres come straight from the SVG.

## Licenses

RDKit is BSD-3-Clause (`vendor/rdkit/LICENSE`). All study content is written for this app.
