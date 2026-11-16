#!/usr/bin/env python3
"""Write a review sheet (HTML) of every reaction, lesson and quiz item, for the human chemistry check.

Each item has "Looks right" / "Needs a fix" buttons (kept in the reviewer's browser). "Copy results" gives a
block of JSON; `python3 tools/apply_review.py results.json` marks the approved items verified.

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
    m = validate.parse(smiles)
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
    ks = r.get("keyStep") or {"nucleophileAtom": 0, "electrophileAtom": 0, "arrows": [], "species": r["reactants"] + r["reagents"]}
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
<section class="card" id="{e(r['id'])}" data-kind="reaction">
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
  <p class="mono">play it: <a href="dev/#/card/{e(r['id'])}/product">open its cards in the preview</a></p>
  {VERDICT}
</section>"""


VERDICT = """<div class="verdict"><button class="ok" data-v="ok">Looks right</button><button class="fix" data-v="fix">Needs a fix</button>
  <button class="skip" data-v="">Not sure / skip</button><textarea placeholder="What's wrong? (shown with your results)" rows="2"></textarea></div>"""


def status_of(x):
    return (f'<span class="ok">verified by {html.escape(x["verifiedBy"])}</span>' if x.get("verified")
            else '<span class="no">not verified</span>')


def lesson_card(l):
    e = html.escape
    rows = []
    for i, st in enumerate(l["steps"]):
        k = st["kind"]
        if k in ("read", "tap", "choice"):
            body = f"<p>{e(st['text'])}</p>"
            if st.get("smiles"):
                body += svg(st["smiles"], {int(a): (GOLD if v == "nu" else BLUE if v == "el" else (0.8, 0.3, 0.3)) for a, v in (st.get("lit") or {}).items()}
                            or {a: GOLD for a in st.get("answer", [])}, 240, 150)
            if k == "tap":
                body += f"<p class='mono'>answer: map {st['answer']}</p><p>{e(st['explain'])}</p>"
            if k == "choice":
                body += "<ul>" + "".join(f"<li>{'<b>✓</b> ' if o.get('correct') else ''}{e(o['text'])}<br><small>{e(o.get('explains', ''))}</small></li>" for o in st["options"]) + "</ul>"
        elif k == "worked":
            body = f"<p>Worked example: <a href='#{e(st['reaction'])}'>{e(st['reaction'])}</a>. {e(st.get('text', ''))}</p>"
        else:
            body = f"<p>Card: <b>{e(st['card'])}</b> on <a href='#{e(st['reaction'])}'>{e(st['reaction'])}</a>{' (' + str(st['given']) + ' arrow given)' if st.get('given') else ''}. {e(st.get('text', ''))}</p>"
        rows.append(f"<div class='lstep'><span class='mono'>{i + 1} · {k}</span>{body}</div>")
    review = f'<p class="review">Reviewer note: {e(l["review"])}</p>' if l.get("review") else ""
    return f"""<section class="card" id="{e(l['id'])}" data-kind="lesson"><header><code>{e(l['id'])}</code> · lesson · unit {e(str(l['unit']))} · {status_of(l)}</header>
  <h2>{e(l['title'])}</h2>{review}{''.join(rows)}
  <p class="mono">play it: <a href="dev/#/lesson/{e(l['id'])}">dev/#/lesson/{e(l['id'])}</a></p>{VERDICT}</section>"""


def quiz_card(q):
    e = html.escape
    review = f'<p class="review">Reviewer note: {e(q["review"])}</p>' if q.get("review") else ""
    start = f"<div class='rxn'><div>{svg(q['start'])}</div><div class='arrow'><span>{e(q.get('reagentDisplay', ''))}</span>⟶</div><div>?</div></div>" if q.get("start") else ""
    opts = "".join(f"<div class='trap {'right' if o.get('correct') else ''}'>{svg(o['smiles'], w=180, h=120) if 'smiles' in o else '<p><b>' + e(o['text']) + '</b></p>'}"
                   f"<p>{'<b>✓ correct</b>' if o.get('correct') else e(o.get('explains', ''))}</p></div>" for o in q["options"])
    return f"""<section class="card" id="{e(q['id'])}" data-kind="quiz"><header><code>{e(q['id'])}</code> · quiz form {e(q['form'])} · pair {e(q.get('pair', ''))} · pattern {e(q['pattern'])} · {status_of(q)}</header>
  <h2>{e(q['prompt'])}</h2>{review}{start}<div class="traps">{opts}</div>{VERDICT}</section>"""


def main(out):
    rep = validate.Report()
    recs = [r for _, r in validate.load(sorted(validate.CONTENT.glob("*.json")), rep) if isinstance(r, dict)]
    lessons = [l for _, l in validate.load(sorted((validate.ROOT / "content/lessons").glob("*.json")), rep) if isinstance(l, dict)]
    quiz = [q for _, q in validate.load(sorted((validate.ROOT / "content/diagnostic").glob("*.json")), rep) if isinstance(q, dict)]
    items = recs + lessons + quiz
    n_ver = sum(1 for r in items if r.get("verified"))
    units = {}
    for r in recs:
        units.setdefault(str(r["unit"]), []).append(r)
    order = ["o1-1", "o1-2", "o1-3", "o1-4", "o1-5", "o1-6", "0", "1", "2", "3", "4", "5"]
    name = {f"o1-{k}": f"Orgo 1 · Unit {k}" for k in range(1, 7)} | {str(k): f"Orgo 2 · Unit {k}" for k in range(6)}
    sections = []
    for u in order:
        ls = [l for l in lessons if str(l["unit"]) == u]
        rs = units.get(u, [])
        if ls or rs:
            sections.append(f"<h2 class='unit' id='unit-{u}'>{name.get(u, 'Unit ' + u)} <small>{len(ls)} lesson · {len(rs)} reactions</small></h2>"
                            + "".join(lesson_card(l) for l in ls) + "".join(card(r) for r in rs))
    if quiz:
        sections.append(f"<h2 class='unit' id='quiz'>Check-up quiz <small>{len(quiz)} items</small></h2>" + "".join(quiz_card(q) for q in quiz))
    toc = " · ".join(f"<a href='#unit-{u}'>{name.get(u, 'Unit ' + u)}</a>" for u in order if any(str(x['unit']) == u for x in recs + lessons)) + (" · <a href='#quiz'>Quiz</a>" if quiz else "")
    body = "".join(sections)
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
.trap.right{{border-color:#2e8a46}} .lstep{{border-top:1px solid #eee7da;padding:6px 0}} .lstep ul{{margin:4px 0;padding-left:20px}}
h2.unit{{margin:34px 0 0;font-size:22px}} h2.unit small{{font-size:13px;color:#6b6458;font-weight:400}}
.verdict{{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px;border-top:1px dashed #ddd6c8;padding-top:10px}}
.verdict button{{border:1px solid #bfb6a5;background:#fff;border-radius:999px;padding:8px 14px;font:inherit;cursor:pointer}}
.verdict textarea{{display:none;flex-basis:100%;font:inherit;padding:8px;border:1px solid #bfb6a5;border-radius:8px}}
.card.v-ok{{border-color:#2e8a46;box-shadow:0 0 0 2px #2e8a4633}} .card.v-ok .verdict .ok{{background:#2e8a46;color:#fff;border-color:#2e8a46}}
.card.v-fix{{border-color:#c8382b;box-shadow:0 0 0 2px #c8382b33}} .card.v-fix .verdict .fix{{background:#c8382b;color:#fff;border-color:#c8382b}}
.card.v-fix .verdict textarea{{display:block}}
.bar{{position:sticky;top:0;z-index:5;background:#f6f4efee;backdrop-filter:blur(6px);border-bottom:1px solid #ddd6c8;padding:10px 0;display:flex;flex-wrap:wrap;gap:8px;align-items:center}}
.bar input{{font:inherit;padding:7px 10px;border:1px solid #bfb6a5;border-radius:8px}} .bar button{{font:inherit;padding:7px 14px;border-radius:999px;border:1px solid #1d232b;background:#1d232b;color:#fff;cursor:pointer}}
.bar .count{{font-size:13px;color:#6b6458}}
</style></head><body><main>
<h1>Orgo Type: review sheet</h1>
<p>{len(items)} items ({len(recs)} reactions, {len(lessons)} lessons, {len(quiz)} quiz items) · {n_ver} verified. Only verified items ship to students.</p>
<p><b>How to review:</b> check each item against your notes, a textbook or a TA. Press <b>Looks right</b> or <b>Needs a fix</b> (say what's wrong).
Your choices are saved in this browser, so you can stop and come back. When you're done, press <b>Copy results</b> and paste them to Claude
(or save them as a file and run <code>python3 tools/apply_review.py results.json</code>). Yellow boxes are the author's own doubts: start there.</p>
<p>{toc}</p>
<div class="bar"><input id="who" placeholder="Your name (required)" aria-label="Reviewer name"><span class="count" id="count"></span>
  <button id="copy">Copy results</button></div>
{body}</main>
<script>
const KEY = "orgotype.review.v1", st = (() => {{ try {{ return JSON.parse(localStorage.getItem(KEY)) || {{}}; }} catch (e) {{ return {{}}; }} }})();
st.items = st.items || {{}};
const save = () => {{ try {{ localStorage.setItem(KEY, JSON.stringify(st)); }} catch (e) {{}} count(); }};
const who = document.getElementById("who"); who.value = st.who || ""; who.oninput = () => {{ st.who = who.value.trim(); save(); }};
function paint(sec) {{ const v = st.items[sec.id] || {{}}; sec.classList.toggle("v-ok", v.v === "ok"); sec.classList.toggle("v-fix", v.v === "fix"); sec.querySelector("textarea").value = v.note || ""; }}
function count() {{ const vals = Object.values(st.items); document.getElementById("count").textContent =
  `${{vals.filter(x => x.v === "ok").length}} right · ${{vals.filter(x => x.v === "fix").length}} need a fix · ${{document.querySelectorAll("section.card").length - vals.filter(x => x.v).length}} to go`; }}
document.querySelectorAll("section.card").forEach(sec => {{
  paint(sec);
  sec.querySelectorAll(".verdict button").forEach(b => b.onclick = () => {{ st.items[sec.id] = Object.assign(st.items[sec.id] || {{}}, {{ v: b.dataset.v, kind: sec.dataset.kind }}); if (!b.dataset.v) delete st.items[sec.id]; save(); paint(sec); }});
  sec.querySelector("textarea").oninput = e => {{ st.items[sec.id] = Object.assign(st.items[sec.id] || {{ v: "fix", kind: sec.dataset.kind }}, {{ note: e.target.value }}); save(); }};
}});
document.getElementById("copy").onclick = async () => {{
  if (!st.who) {{ alert("Put your name in first; it's recorded as the reviewer."); who.focus(); return; }}
  const out = {{ reviewer: st.who, at: new Date().toISOString(), approved: [], fix: [] }};
  for (const [id, v] of Object.entries(st.items)) {{ if (v.v === "ok") out.approved.push(id); else if (v.v === "fix") out.fix.push({{ id, note: v.note || "" }}); }}
  const text = JSON.stringify(out, null, 1);
  try {{ await navigator.clipboard.writeText(text); alert(`Copied ${{out.approved.length}} approved and ${{out.fix.length}} to fix. Paste it to Claude.`); }}
  catch (e) {{ prompt("Copy this:", text); }}
}};
count();
</script></body></html>"""
    Path(out).write_text(page, encoding="utf-8")
    print(f"wrote {out} ({len(items)} items)")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "review.html")
