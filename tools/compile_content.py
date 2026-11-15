#!/usr/bin/env python3
"""Compile validated content into the bundle the app reads (inlined into index.html by build.py).

Adds fields the browser can't easily compute with RDKit.js:
  _display  one dot-joined, atom-mapped SMILES for the key-step picture (species, or reactants + unique reagents)
  _eq       {map: class} - atoms with the same class are symmetry-equivalent in _display (either methyl of acetone)
  _start    dot-joined reactants (the "start" picture)
  _newCC    [[m1, m2], ...] product C–C bonds whose two carbons came from different molecules
  _added    number of product carbons that did not come from reactants[0]

    python3 tools/compile_content.py [--dev]    # prints the bundle as JSON
"""
import json, sys
from pathlib import Path

from rdkit import Chem, RDLogger

RDLogger.DisableLog("rdApp.*")
ROOT = Path(__file__).resolve().parent.parent


_P = Chem.SmilesParserParams()
_P.removeHs = False  # explicit [H:n] atoms stay (arrows can use them)


def mol(smi):
    return Chem.MolFromSmiles(smi, _P)


def strip(m):
    m = Chem.Mol(m)
    for a in m.GetAtoms():
        a.SetAtomMapNum(0)
    return m


def canon(smi):
    return Chem.MolToSmiles(Chem.RemoveHs(strip(mol(smi)), sanitize=False))


def key_maps(ks):
    out = {ks["nucleophileAtom"], ks["electrophileAtom"]}
    for a in ks["arrows"]:
        for end in (a["from"], a["to"]):
            v = end.get("lonePair", end.get("atom"))
            out.update([v] if v is not None else end.get("bond", []))
    return out


def display_for(r):
    ks = r["keyStep"]
    if ks.get("species"):
        return ".".join(ks["species"])
    mols, seen = list(r["reactants"]), set()
    for s in r["reagents"]:
        c = canon(s)
        if c not in seen:
            seen.add(c); mols.append(s)
    shown = {a.GetAtomMapNum() for s in mols for a in mol(s).GetAtoms()}
    if not key_maps(ks) <= shown:  # an arrow uses a duplicate reagent: show them all
        mols = r["reactants"] + r["reagents"]
    return ".".join(mols)


def equivalence(smiles):
    m = mol(smiles)
    ranks = list(Chem.CanonicalRankAtoms(strip(m), breakTies=False))
    return {str(a.GetAtomMapNum()): int(ranks[a.GetIdx()]) for a in m.GetAtoms() if a.GetAtomMapNum()}


def compile_reaction(r):
    r = dict(r)
    r["_display"] = display_for(r)
    r["_eq"] = equivalence(r["_display"])
    r["_start"] = ".".join(r["reactants"])
    if r.get("mechanism"):
        r["mechanism"] = {"steps": [dict(st, _eq=equivalence(".".join(st["species"]))) for st in r["mechanism"]["steps"]]}
    origin = {}
    for i, s in enumerate(r["reactants"] + r["reagents"]):
        for a in mol(s).GetAtoms():
            if a.GetAtomMapNum():
                origin[a.GetAtomMapNum()] = i
    p = mol(r["product"])
    new_cc = []
    for b in p.GetBonds():
        a1, a2 = b.GetBeginAtom(), b.GetEndAtom()
        if a1.GetSymbol() == a2.GetSymbol() == "C" and origin.get(a1.GetAtomMapNum()) != origin.get(a2.GetAtomMapNum()):
            new_cc.append(sorted([a1.GetAtomMapNum(), a2.GetAtomMapNum()]))
    r["_newCC"] = new_cc
    r["_added"] = sum(1 for a in p.GetAtoms() if a.GetSymbol() == "C" and origin.get(a.GetAtomMapNum()) != 0)
    return r


def load_dir(name):
    out = []
    for f in sorted((ROOT / "content" / name).glob("*.json")):
        out += json.loads(f.read_text(encoding="utf-8"))
    return out


def bundle(dev=False):
    ok = lambda r: (dev or r.get("verified") is True) and r.get("source", "shared") == "shared"
    reactions = [compile_reaction(r) for r in load_dir("reactions") if ok(r)]
    ids = {r["id"] for r in reactions}
    for r in reactions:  # drop links to cards that aren't shipping
        r["confusableWith"] = [c for c in r["confusableWith"] if c in ids]
    # a lesson ships only if every reaction it uses ships too
    lessons = [l for l in load_dir("lessons") if ok(l) and all(st.get("reaction") in ids for st in l["steps"] if st["kind"] in ("worked", "card"))]
    diagnostic = [d for d in load_dir("diagnostic") if ok(d)]
    return {"reactions": reactions, "lessons": lessons, "diagnostic": diagnostic, "dev": dev}


if __name__ == "__main__":
    print(json.dumps(bundle("--dev" in sys.argv), ensure_ascii=False, indent=1))
