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


CHG_OK = {-1, 0, 1}  # the editor sets −, 0, +; tasks needing ±2 are skipped


def molblock(atoms, bonds):
    """V2000 molblock from [{m, el, c}] and [[m1, m2, order]] (no coordinates needed). The browser builds the
    student's answer the same way, so hydrogens are implied from normal valences on both sides."""
    idx = {a["m"]: i + 1 for i, a in enumerate(atoms)}
    lines = ["", "  orgotype", "", f"{len(atoms):3d}{len(bonds):3d}  0  0  0  0  0  0  0  0999 V2000"]
    lines += [f"    0.0000    0.0000    0.0000 {a['el']:<3} 0  0  0  0  0  0  0  0  0  0  0  0" for a in atoms]
    lines += [f"{idx[b[0]]:3d}{idx[b[1]]:3d}{b[2]:3d}  0" for b in bonds if b[2] > 0]
    chg = [(idx[a["m"]], a["c"]) for a in atoms if a["c"]]
    for k in range(0, len(chg), 8):
        part = chg[k:k + 8]
        lines.append("M  CHG" + f"{len(part):3d}" + "".join(f" {i:3d} {c:3d}" for i, c in part))
    lines.append("M  END")
    return "\n".join(lines)


def struct_task(prev_smiles, target_smiles):
    """A 'complete the structure' task: the target's atoms (placed by the browser from target layout), the bonds
    that are unchanged from `prev` given, everything else (new or changed bonds, all charges) for the student.
    Returns None when the target can't be rebuilt faithfully from atoms + bonds (unusual valences)."""
    def bonds_of(m):
        out = {}
        for b in m.GetBonds():
            a1, a2 = b.GetBeginAtom().GetAtomMapNum(), b.GetEndAtom().GetAtomMapNum()
            if a1 and a2:
                out[frozenset((a1, a2))] = int(b.GetBondTypeAsDouble())
        return out
    prev, tgt = mol(".".join(prev_smiles)), mol(".".join(target_smiles))
    if prev is None or tgt is None:
        return None
    for m in (prev, tgt):
        Chem.Kekulize(m, clearAromaticFlags=True)
    pb, pc = bonds_of(prev), {a.GetAtomMapNum(): a.GetFormalCharge() for a in prev.GetAtoms() if a.GetAtomMapNum()}
    tb = bonds_of(tgt)
    keep_idx = []
    for frag in Chem.GetMolFrags(tgt):
        maps = [tgt.GetAtomWithIdx(i).GetAtomMapNum() for i in frag]
        if not all(maps):
            continue
        ms = set(maps)
        if not ms & set(pc):
            continue  # a reagent added in this step (e.g. H3O+ at workup), not something the arrows made
        changed = any(tgt.GetAtomWithIdx(i).GetFormalCharge() != pc.get(tgt.GetAtomWithIdx(i).GetAtomMapNum(), 0) for i in frag) \
            or any(k <= ms and pb.get(k) != o for k, o in tb.items()) \
            or any(k <= ms and k not in tb for k in pb)
        if changed:
            keep_idx += list(frag)
    if not keep_idx:
        return None
    atoms = [{"m": tgt.GetAtomWithIdx(i).GetAtomMapNum(), "el": tgt.GetAtomWithIdx(i).GetSymbol(),
              "c": tgt.GetAtomWithIdx(i).GetFormalCharge()} for i in keep_idx]
    if any(a["c"] not in CHG_OK for a in atoms):
        return None
    ms = {a["m"] for a in atoms}
    bonds = [[min(k), max(k), o, pb.get(k) == o] for k, o in tb.items() if k <= ms]
    if all(b[3] for b in bonds) and all(a["c"] == pc.get(a["m"], 0) for a in atoms):
        return None  # nothing to do
    # faithful? rebuilding from atoms + bonds with default valences must give the same molecule
    rebuilt = Chem.MolFromMolBlock(molblock(atoms, [b[:3] for b in bonds]))
    sub = Chem.RWMol(tgt)
    for i in sorted(set(range(tgt.GetNumAtoms())) - set(keep_idx), reverse=True):
        sub.RemoveAtom(i)
    same = lambda m: Chem.MolToSmiles(Chem.MolFromSmiles(Chem.MolToSmiles(m))) if m is not None else None
    if rebuilt is None or same(rebuilt) != same(Chem.RemoveHs(strip(sub), sanitize=False)):
        return None
    layout = Chem.MolToSmiles(sub, kekuleSmiles=True)
    return {"layout": layout, "atoms": atoms, "bonds": bonds}


def compile_reaction(r):
    r = dict(r)
    r["_display"] = display_for(r)
    r["_eq"] = equivalence(r["_display"])
    r["_start"] = ".".join(r["reactants"])
    if r.get("mechanism"):
        steps = r["mechanism"]["steps"]
        out = []
        for k, st in enumerate(steps):
            target = steps[k + 1]["species"] if k + 1 < len(steps) else [r["product"]]
            out.append(dict(st, _eq=equivalence(".".join(st["species"])), _build=struct_task(st["species"], target)))
        r["mechanism"] = {"steps": out}
    r["_draw"] = struct_task(r["reactants"] + r["reagents"], [r["product"]])
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
