#!/usr/bin/env python3
"""Write a review sheet (HTML) of every reaction record, for the human chemistry check.

Each card shows the reactants with the key-step nucleophile (gold) and electrophile (blue) atoms lit,
the reagents, the product, every trap with its explanation, the "why", the review note, and the
verified status. Build puts it at dist/review.html (on the live site: /review.html).

    python3 tools/review_sheet.py [out.html]
"""
import html, json, sys
from pathlib import Path

from rdkit import Chem
from rdkit.Chem import rdCIPLabeler
from rdkit.Chem.Draw import rdMolDraw2D

sys.path.insert(0, str(Path(__file__).resolve().parent))
import validate  # noqa: E402

GOLD, BLUE = (0.94, 0.71, 0.30), (0.50, 0.70, 1.0)


def svg(smiles, lit=None, w=260, h=170):
    m = Chem.MolFromSmiles(smiles)
    if m is None:
        return f'<div class="bad">unparseable: {html.escape(smiles)}</div>'
    lit = lit or {}
    hl = {}
    for a in m.GetAtoms():
        if a.GetAtomMapNum() in lit:
            hl[a.GetIdx()] = lit[a.GetAtomMapNum()]
        a.SetAtomMapNum(0)
    rdCIPLabeler.AssignCIPLabels(m)
    d = rdMolDraw2D.MolDraw2DSVG(w, h)
    o = d.drawOptions()
    o.clearBackground = False
    o.addStereoAnnotation = True
    o.padding = 0.12
    d.DrawMolecule(m, highlightAtoms=list(hl), highlightAtomColors=hl, highlightBonds=[])
    d.FinishDrawing()
    return d.GetDrawingText().split("?>", 1)[-1]


def card(r):
    e = html.escape
    ks = r["keyStep"]
    lit = {ks["nucleophileAtom"]: GOLD, ks["electrophileAtom"]: BLUE}
    step_mols = ks.get("species") or (r["reactants"] + r["reagents"])
    arrows = "; ".join(
        (f"lone pair on {a['from']['lonePair']}" if "lonePair" in a["from"] else f"bond {a['from']['bond'][0]}–{a['from']['bond'][1]}")
        + " → " + (f"atom {a['to']['atom']}" if "atom" in a["to"] else f"bond {a['to']['bond'][0]}–{a['to']['bond'][1]}")
        for a in ks["arrows"])
    status = (f'<span class="ok">verified by {e(r["verifiedBy"])}</span>' if r.get("verified")
              else '<span class="no">not verified</span>')
    traps = "".join(f'<div class="trap">{svg(t["smiles"], w=200, h=130)}<p>{e(t["explains"])}</p></div>' for t in r["traps"])
    review = f'<p class="review">Reviewer note: {e(r["review"])}</p>' if r.get("review") else ""
    return f"""
<section class="card" id="{e(r['id'])}">
  <header><code>{e(r['id'])}</code> · unit {e(str(r['unit']))} · pattern {e(r['pattern'])} · {status}</header>
  <h2>{e(r['title'])}</h2>
  {review}
  <div class="rxn">
    <div>{''.join(svg(s) for s in r['reactants'])}</div>
    <div class="arrow"><span>{e(r['reagentDisplay'])}</span>⟶</div>
    <div>{svg(r['product'])}</div>
  </div>
  <h3>Key step <small>gold = nucleophile (map {ks['nucleophileAtom']}), blue = electrophile (map {ks['electrophileAtom']})</small></h3>
  <div class="step">{''.join(svg(s, lit, 220, 150) for s in step_mols)}</div>
  <p class="mono">arrows (map numbers): {e(arrows)}</p>
  <p><b>Why:</b> {e(r['why'])}</p>
  <p class="mono">accepted reagent answers: {e(', '.join(r['reagentAliases']))}</p>
  <h3>Wrong options</h3>
  <div class="traps">{traps}</div>
</section>"""


def main(out):
    rep = validate.Report()
    recs = [r for _, r in validate.load(sorted(validate.CONTENT.glob("*.json")), rep) if isinstance(r, dict)]
    body = "".join(card(r) for r in recs)
    n_ver = sum(1 for r in recs if r.get("verified"))
    page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Orgo Type review sheet</title>
<style>
body{{margin:0;padding:16px;font:15px/1.5 -apple-system,system-ui,sans-serif;background:#f6f4ef;color:#1d232b}}
main{{max-width:900px;margin:0 auto}} h1{{font-weight:600;margin:4px 0}}
.card{{background:#fff;border:1px solid #ddd6c8;border-radius:14px;padding:14px 16px;margin:16px 0}}
.card header{{font-size:12.5px;color:#6b6458}} h2{{margin:6px 0 8px;font-size:19px}} h3{{font-size:14px;margin:14px 0 4px}}
h3 small{{font-weight:400;color:#6b6458}} svg{{max-width:100%;height:auto}}
.rxn,.step,.traps{{display:flex;flex-wrap:wrap;align-items:center;gap:8px}}
.arrow{{display:flex;flex-direction:column;align-items:center;font-size:28px;color:#555}} .arrow span{{font-size:12.5px;max-width:180px;text-align:center}}
.trap{{flex:1 1 240px;border:1px solid #eee7da;border-radius:10px;padding:6px 10px}} .trap p{{margin:0;font-size:13.5px}}
.mono{{font:12.5px ui-monospace,Menlo,monospace;color:#555}} .ok{{color:#2e8a46;font-weight:600}} .no{{color:#c8382b;font-weight:600}}
.review{{background:#fff5df;border-left:3px solid #b9761a;padding:6px 10px;margin:6px 0}} .bad{{color:#c8382b}}
</style></head><body><main>
<h1>Orgo Type: review sheet</h1>
<p>{len(recs)} records · {n_ver} verified. Check every card against a trusted source. For each card that's right,
set <code>"verified": true</code> and <code>"verifiedBy": "your name"</code> in its JSON file. Only verified cards ship to students.</p>
{body}</main></body></html>"""
    Path(out).write_text(page, encoding="utf-8")
    print(f"wrote {out} ({len(recs)} records)")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "review.html")
