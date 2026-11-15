#!/usr/bin/env python3
"""Arrow-pushing simulator: apply curved arrows to atom-mapped species and see what comes out.

Each arrow moves one electron pair. Bookkeeping per atom: formal charge = V − N − B, so
  lone pair on a → atom c        a: +1, c: −1, new a–c bond
  lone pair on a → bond (a, d)   a: +1, d: −1, a–d bond order +1 (new π)
  bond (x, y) → atom y           x: +1, y: −1, x–y order −1 (pair goes onto y)
  bond (x, y) → atom c (c ∉ x,y) the pair now bonds c to x (or y): order x–y −1, x–c +1; y: +1, c: −1
  bond (x, y) → bond (y, d)      x: +1, d: −1, x–y −1, y–d +1
Hydrogen counts on every atom are frozen first, so only explicit [H:n] atoms can move (protons, hydrides).

Used by validate.py to check that a mechanism's step k arrows really turn step k's species into
step k+1's species, and that the last step gives the record's product.
"""
from itertools import product as cartesian

from rdkit import Chem, RDLogger

RDLogger.DisableLog("rdApp.*")
_P = Chem.SmilesParserParams()
_P.removeHs = False
ORDER = {1: Chem.BondType.SINGLE, 2: Chem.BondType.DOUBLE, 3: Chem.BondType.TRIPLE}


class ArrowError(Exception):
    pass


def load(smiles_list):
    """One RWMol of all species, kekulized, with each atom's H count frozen."""
    m = Chem.MolFromSmiles(".".join(smiles_list), _P)
    if m is None:
        raise ArrowError("species don't parse")
    Chem.Kekulize(m, clearAromaticFlags=True)
    for a in m.GetAtoms():
        a.SetNumExplicitHs(a.GetTotalNumHs())
        a.SetNoImplicit(True)
    return Chem.RWMol(m)


def _plan(mol, arrows, choice):
    """Bond-order and charge changes for a set of arrows. `choice[i]` picks which end of a tail bond
    makes the new bond when an arrow goes from a bond to an outside atom."""
    idx = {a.GetAtomMapNum(): a.GetIdx() for a in mol.GetAtoms() if a.GetAtomMapNum()}
    def at(m):
        if m not in idx:
            raise ArrowError(f"map {m} is not in the species")
        return idx[m]
    dbond, dfc = {}, {}
    key = lambda i, j: (min(i, j), max(i, j))
    def bond(i, j, d): dbond[key(i, j)] = dbond.get(key(i, j), 0) + d
    def fc(i, d): dfc[i] = dfc.get(i, 0) + d
    k = 0
    for ar in arrows:
        src, dst = ar["from"], ar["to"]
        if "lonePair" in src:
            a = at(src["lonePair"])
            if "atom" in dst:
                c = at(dst["atom"]); bond(a, c, +1); fc(a, +1); fc(c, -1)
            else:
                c, d = (at(x) for x in dst["bond"])
                if a not in (c, d):
                    raise ArrowError("a lone pair can only form a π bond to its own atom")
                other = d if a == c else c
                bond(c, d, +1); fc(a, +1); fc(other, -1)
        else:
            x, y = (at(v) for v in src["bond"])
            bond(x, y, -1)
            if "atom" in dst:
                c = at(dst["atom"])
                if c in (x, y):
                    fc(c, -1); fc(y if c == x else x, +1)
                else:
                    keep = (x, y)[choice[k]]; k += 1
                    bond(keep, c, +1); fc(y if keep == x else x, +1); fc(c, -1)
            else:
                c, d = (at(v) for v in dst["bond"])
                shared = {x, y} & {c, d}
                if not shared:
                    raise ArrowError("a bond-to-bond arrow must share an atom")
                s = shared.pop()
                bond(c, d, +1); fc(y if s == x else x, +1); fc(d if s == c else c, -1)
    return dbond, dfc


def apply(smiles_list, arrows):
    """Every chemically valid outcome of pushing these arrows (usually exactly one).
    Returns a list of result molecules (RDKit Mol, sanitized, may be several fragments)."""
    base = load(smiles_list)
    n_amb = sum(1 for a in arrows if "bond" in a["from"] and "atom" in a["to"]
                and a["to"]["atom"] not in a["from"]["bond"])
    out, errors = [], []
    for choice in cartesian((0, 1), repeat=n_amb):
        m = Chem.RWMol(base)
        try:
            dbond, dfc = _plan(m, arrows, choice)
            for (i, j), d in dbond.items():
                b = m.GetBondBetweenAtoms(i, j)
                order = (int(b.GetBondTypeAsDouble()) if b else 0) + d
                if order < 0 or order > 3:
                    raise ArrowError("bond order out of range")
                if b and order == 0:
                    m.RemoveBond(i, j)
                elif b:
                    b.SetBondType(ORDER[order])
                elif order:
                    m.AddBond(i, j, ORDER[order])
            for i, d in dfc.items():
                a = m.GetAtomWithIdx(i)
                a.SetFormalCharge(a.GetFormalCharge() + d)
            Chem.SanitizeMol(m)
            out.append(m.GetMol())
        except (ArrowError, Chem.rdchem.AtomValenceException, Chem.rdchem.KekulizeException, ValueError) as e:
            errors.append(str(e))
    if not out:
        raise ArrowError("these arrows give an impossible structure" + (f" ({errors[0]})" if errors else ""))
    return out


def canon(mol):
    """Canonical SMILES that keeps heavy-atom maps and charges; hydrogens become counts."""
    p = Chem.RemoveHsParameters()
    p.removeMapped = True
    p.removeDegreeZero = False
    p.removeWithWedgedBond = True
    m = Chem.RemoveHs(Chem.Mol(mol), p, sanitize=False)
    for a in m.GetAtoms():
        if a.GetAtomicNum() == 1:
            a.SetAtomMapNum(0)
    return Chem.MolToSmiles(m)


def frags(mol):
    return Chem.GetMolFrags(mol, asMols=True, sanitizeFrags=False)


def canon_smiles(smi):
    m = Chem.MolFromSmiles(smi, _P)
    return canon(m) if m is not None else None


def touched_maps(arrows):
    s = set()
    for a in arrows:
        for end in (a["from"], a["to"]):
            for k in ("lonePair", "atom"):
                if k in end:
                    s.add(end[k])
            s.update(end.get("bond", []))
    return s


def has_carbon(m):
    return any(a.GetAtomicNum() == 6 for a in m.GetAtoms())


def maps_of(mol):
    return {a.GetAtomMapNum() for a in mol.GetAtoms() if a.GetAtomMapNum() and a.GetAtomicNum() != 1}


def check_step(species, arrows, next_species=None, product=None, keep_maps=()):
    """Return (ok, message) for one mechanism step.
    - every molecule in next_species must come out of these arrows, unless it is a newly added reagent
      (none of its atoms were in this step);
    - every result fragment holding atoms that end up in the product (keep_maps) must appear in next_species,
      while side products (CH3Cu, MgBr⁺, the leaving alcohol…) may drop out;
    - with `product` (the last step), one result fragment must be the product."""
    try:
        results = apply(species, arrows)
    except ArrowError as e:
        return False, str(e)
    here = set().union(*(maps_of(f) for f in frags(load(species))))
    want_prod = canon_smiles(product) if product else None
    if product and want_prod is None:
        return False, "the product doesn't parse"
    keep = set(keep_maps)
    last = None
    for res in results:
        got = {canon(f): maps_of(f) for f in frags(res)}
        if next_species is not None:
            nxt = []
            for s_ in next_species:
                m = Chem.MolFromSmiles(s_, _P)
                if m is None:
                    return False, f"the next step's species {s_!r} doesn't parse"
                nxt += list(frags(m))
            nxt_c = {canon(f): maps_of(f) for f in nxt}
            bad = [c for c, mp in nxt_c.items() if c not in got and mp & here]
            if bad:
                last = f"the next step shows {', '.join(bad)}, but these arrows give {', '.join(got)}"
                continue
            lost = [c for c, mp in got.items() if mp & keep and c not in nxt_c]
            if lost:
                last = f"the arrows give {', '.join(lost)}, which the next step doesn't show"
                continue
        if want_prod and want_prod not in got:
            last = f"the last step gives {', '.join(c for c in got)}, not the product {want_prod}"
            continue
        return True, ""
    return False, last or "no outcome matches"


if __name__ == "__main__":
    import json, sys
    for a in sys.argv[1:]:
        print(a)
