#!/usr/bin/env python3
"""Content validator for Orgo Type reaction records.

Catches *structural* errors: bad SMILES, broken atom maps, arrows pointing at atoms or bonds
that don't exist, traps identical to the answer, dangling ids. It cannot tell whether the
chemistry is right; that is the human review step (verified / verifiedBy).

    python3 tools/validate.py                  # validate content/reactions/*.json
    python3 tools/validate.py path/to/file.json ...
    python3 tools/validate.py --quiet          # errors only

Exit code 0 = no errors (warnings allowed), 1 = errors.
Schema reference: docs/SCHEMA.md
"""
import json, re, sys
from collections import Counter
from pathlib import Path

from rdkit import Chem, RDLogger

RDLogger.DisableLog("rdApp.*")  # we report parse failures ourselves

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content" / "reactions"

UNITS = {0, 1, 2, 3, 4, 5, "side"}
PATTERNS = {"A", "B", "C", "D", "S", "X"}  # A–D carbonyl patterns · S substitution/elimination · X other (oxidation, protecting groups…)
SOURCES = {"shared", "personal"}
ID_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
REQUIRED = {"id": str, "unit": (int, str), "pattern": str, "title": str, "reactants": list, "reagents": list,
            "reagentDisplay": str, "reagentAliases": list, "product": str, "keyStep": dict, "why": str,
            "traps": list, "confusableWith": list, "tags": list, "verified": bool}
OPTIONAL = {"byproducts": list, "verifiedBy": (str, type(None)), "review": str, "source": str, "notes": str}
MIN_TRAPS, MAX_TRAPS = 2, 4
LONE_PAIR_ELEMENTS = {"N", "O", "S", "F", "Cl", "Br", "I", "P"}


class Report:
    def __init__(self):
        self.errors, self.warnings = [], []

    def err(self, where, code, msg):
        self.errors.append((where, code, msg))

    def warn(self, where, code, msg):
        self.warnings.append((where, code, msg))

    def codes(self):
        return {c for _, c, _ in self.errors}


def parse(smiles):
    """Parse and sanitize. Returns a Mol or None."""
    if not isinstance(smiles, str) or not smiles.strip():
        return None
    return Chem.MolFromSmiles(smiles)  # MolFromSmiles sanitizes by default


def canon(mol):
    """Isomeric canonical SMILES with atom maps removed, so mapped and unmapped forms compare equal."""
    m = Chem.Mol(mol)
    for a in m.GetAtoms():
        a.SetAtomMapNum(0)
    return Chem.MolToSmiles(m)


def mapped_atoms(mol):
    return {a.GetAtomMapNum(): a for a in mol.GetAtoms() if a.GetAtomMapNum()}


def bond_between(mols, m1, m2):
    for mol in mols:
        am = mapped_atoms(mol)
        if m1 in am and m2 in am and mol.GetBondBetweenAtoms(am[m1].GetIdx(), am[m2].GetIdx()):
            return True
    return False


def check_record(r, where, rep):
    # ---- shape ----
    n_before = len(rep.errors)
    for k, t in REQUIRED.items():
        if k not in r:
            rep.err(where, "missing-field", f"missing required field '{k}'")
        elif not isinstance(r[k], t) or (t is int and isinstance(r[k], bool)):
            rep.err(where, "bad-type", f"'{k}' has the wrong type")
    for k in r:
        if k not in REQUIRED and k not in OPTIONAL:
            rep.warn(where, "unknown-field", f"unknown field '{k}' (typo?)")
    if len(rep.errors) > n_before:
        return  # the rest of the checks assume the shape is right

    if not ID_RE.match(r["id"]):
        rep.err(where, "bad-id", f"id '{r['id']}' must be lowercase words joined by hyphens")
    if r["unit"] not in UNITS:
        rep.err(where, "bad-unit", f"unit {r['unit']!r} not in {sorted(map(str, UNITS))}")
    if r["pattern"] not in PATTERNS:
        rep.err(where, "bad-pattern", f"pattern {r['pattern']!r} not in {sorted(PATTERNS)}")
    if r.get("source", "shared") not in SOURCES:
        rep.err(where, "bad-source", f"source must be one of {sorted(SOURCES)}")
    for k in ("title", "why", "reagentDisplay"):
        if not r[k].strip():
            rep.err(where, "empty-text", f"'{k}' is empty")
    aliases = [a for a in r["reagentAliases"] if isinstance(a, str) and a.strip()]
    if not aliases:
        rep.err(where, "no-aliases", "reagentAliases is empty")
    elif len(aliases) != len(r["reagentAliases"]):
        rep.err(where, "bad-alias", "every alias must be a non-empty string")
    if r["verified"] and not r.get("verifiedBy"):
        rep.err(where, "verified-without-reviewer", "verified is true but verifiedBy is empty")
    if r.get("review"):
        rep.warn(where, "needs-review", r["review"])

    # ---- SMILES ----
    def mols_of(field, items):
        out = []
        for i, s in enumerate(items):
            m = parse(s)
            if m is None:
                rep.err(where, "bad-smiles", f"{field}[{i}] does not parse/sanitize: {s!r}")
            out.append(m)
        return out

    reactants = mols_of("reactants", r["reactants"])
    reagents = mols_of("reagents", r["reagents"])
    byproducts = mols_of("byproducts", r.get("byproducts", []))
    product = parse(r["product"])
    if product is None:
        rep.err(where, "bad-smiles", f"product does not parse/sanitize: {r['product']!r}")
    if not r["reactants"]:
        rep.err(where, "no-reactants", "reactants is empty")
    if None in reactants + reagents + byproducts or product is None:
        return

    # ---- atom maps ----
    inputs = reactants + reagents
    in_maps = Counter(n for m in inputs for n in mapped_atoms(m))
    dup = sorted(n for n, c in in_maps.items() if c > 1)
    if dup:
        rep.err(where, "duplicate-map", f"map numbers used twice on the reactant side: {dup}")
    in_atoms = {n: a for m in inputs for n, a in mapped_atoms(m).items()}

    def check_side(mol, label):
        maps = Counter(a.GetAtomMapNum() for a in mol.GetAtoms() if a.GetAtomMapNum())
        d = sorted(n for n, c in maps.items() if c > 1)
        if d:
            rep.err(where, "duplicate-map", f"{label} uses map numbers twice: {d}")
        for a in mol.GetAtoms():
            n = a.GetAtomMapNum()
            if not n:
                rep.err(where, "unmapped-atom", f"{label} atom {a.GetSymbol()}{a.GetIdx()} has no map number (every product heavy atom must come from a reactant or reagent)")
            elif n not in in_atoms:
                rep.err(where, "map-not-in-reactants", f"{label} map {n} does not appear in reactants/reagents")
            elif in_atoms[n].GetSymbol() != a.GetSymbol():
                rep.err(where, "map-element-changed", f"{label} map {n} is {a.GetSymbol()} but {in_atoms[n].GetSymbol()} in the reactants")
        return set(maps)

    used = check_side(product, "product")
    for i, b in enumerate(byproducts):
        both = used & check_side(b, f"byproducts[{i}]")
        if both:
            rep.err(where, "map-reused", f"maps {sorted(both)} appear in both the product and byproducts[{i}]")
    if not any(set(mapped_atoms(m)) & used for m in reactants):
        rep.err(where, "product-unrelated", "no reactant atom ends up in the product")

    # ---- key step ----
    ks = r["keyStep"]
    species_smiles = ks.get("species")
    if species_smiles is not None:
        species = mols_of("keyStep.species", species_smiles)
        if None in species:
            return
        for m in species:
            for n, a in mapped_atoms(m).items():
                if n not in in_atoms:
                    rep.err(where, "species-map-unknown", f"keyStep.species map {n} is not in reactants/reagents")
                elif in_atoms[n].GetSymbol() != a.GetSymbol():
                    rep.err(where, "map-element-changed", f"keyStep.species map {n} changed element")
    else:
        species = inputs
    sp_atoms = {n: a for m in species for n, a in mapped_atoms(m).items()}

    def atom_ok(n, label):
        if not isinstance(n, int) or n not in sp_atoms:
            rep.err(where, "bad-step-atom", f"keyStep {label} refers to map {n!r}, which is not in the key-step species")
            return False
        return True

    nu, el = ks.get("nucleophileAtom"), ks.get("electrophileAtom")
    atom_ok(nu, "nucleophileAtom"); atom_ok(el, "electrophileAtom")
    if nu == el and nu is not None:
        rep.err(where, "bad-step-atom", "nucleophileAtom and electrophileAtom are the same atom")
    arrows = ks.get("arrows")
    if not isinstance(arrows, list) or not arrows:
        rep.err(where, "no-arrows", "keyStep.arrows is empty")
        arrows = []
    for i, ar in enumerate(arrows):
        lab = f"arrows[{i}]"
        src, dst = ar.get("from", {}), ar.get("to", {})
        if "lonePair" in src:
            n = src["lonePair"]
            if atom_ok(n, lab + ".from.lonePair"):
                a = sp_atoms[n]
                if a.GetSymbol() not in LONE_PAIR_ELEMENTS and a.GetFormalCharge() >= 0:
                    rep.err(where, "no-lone-pair", f"{lab}: {a.GetSymbol()} (map {n}) has no lone pair to push")
        elif "bond" in src:
            b = src["bond"]
            if not (isinstance(b, list) and len(b) == 2):
                rep.err(where, "bad-arrow", f"{lab}.from.bond must be two map numbers")
            elif all([atom_ok(x, lab + ".from.bond") for x in b]) and not bond_between(species, *b):
                rep.err(where, "no-such-bond", f"{lab}: there is no bond between maps {b[0]} and {b[1]}")
        else:
            rep.err(where, "bad-arrow", f"{lab}.from must be {{lonePair}} or {{bond}}")
        if "atom" in dst:
            atom_ok(dst["atom"], lab + ".to.atom")
        elif "bond" in dst:
            b = dst["bond"]
            if isinstance(b, list) and len(b) == 2:
                for x in b:
                    atom_ok(x, lab + ".to.bond")
            else:
                rep.err(where, "bad-arrow", f"{lab}.to.bond must be two map numbers")
        else:
            rep.err(where, "bad-arrow", f"{lab}.to must be {{atom}} or {{bond}}")
    tails = set()
    for ar in arrows:
        f = ar.get("from", {})
        tails.update([f["lonePair"]] if "lonePair" in f else f.get("bond", []) if isinstance(f.get("bond"), list) else [])
    if arrows and nu is not None and nu not in tails:
        rep.err(where, "nucleophile-not-pushing", f"no arrow starts at nucleophileAtom (map {nu})")
    heads = set()
    for ar in arrows:
        t = ar.get("to", {})
        heads.update([t["atom"]] if "atom" in t else t.get("bond", []) if isinstance(t.get("bond"), list) else [])
    if arrows and el is not None and el not in heads:
        rep.err(where, "electrophile-not-attacked", f"no arrow points at electrophileAtom (map {el})")

    # ---- traps ----
    traps = r["traps"]
    if not (MIN_TRAPS <= len(traps) <= MAX_TRAPS):
        rep.err(where, "trap-count", f"need {MIN_TRAPS}–{MAX_TRAPS} traps, found {len(traps)}")
    pc = canon(product)
    seen = {}
    for i, t in enumerate(traps):
        if not isinstance(t, dict):
            rep.err(where, "bad-trap", f"traps[{i}] must be an object"); continue
        if not str(t.get("explains", "")).strip():
            rep.err(where, "trap-no-explanation", f"traps[{i}] has no explanation")
        tm = parse(t.get("smiles"))
        if tm is None:
            rep.err(where, "bad-smiles", f"traps[{i}] does not parse/sanitize: {t.get('smiles')!r}"); continue
        tc = canon(tm)
        if tc == pc:
            rep.err(where, "trap-equals-product", f"traps[{i}] is the same molecule as the product ({tc})")
        if tc in seen:
            rep.err(where, "duplicate-trap", f"traps[{i}] is the same molecule as traps[{seen[tc]}]")
        seen.setdefault(tc, i)

    # stash for cross-record checks
    r["_reaction_key"] = ".".join(sorted(canon(m) for m in reactants)) + ">" + \
        ".".join(sorted(canon(m) for m in reagents)) + ">" + pc


def check_all(records, rep):
    """records: list of (where, record)."""
    ids = Counter(r.get("id") for _, r in records if isinstance(r, dict))
    for where, r in records:
        if not isinstance(r, dict):
            rep.err(where, "bad-type", "record must be an object"); continue
        check_record(r, where, rep)
    for i, n in ids.items():
        if n > 1:
            rep.err(f"id {i}", "duplicate-id", f"id '{i}' is used {n} times")
    known = set(ids)
    keys = {}
    for where, r in records:
        if not isinstance(r, dict):
            continue
        for c in r.get("confusableWith", []) if isinstance(r.get("confusableWith"), list) else []:
            if c == r.get("id"):
                rep.err(where, "self-confusable", "confusableWith lists the record itself")
            elif c not in known:
                rep.err(where, "unknown-confusable", f"confusableWith '{c}' is not a known id")
        k = r.pop("_reaction_key", None)
        if k:
            if k in keys:
                rep.err(where, "duplicate-reaction", f"same reactants, reagents and product as {keys[k]}")
            keys.setdefault(k, r.get("id"))


def load(paths, rep):
    records = []
    for p in paths:
        try:
            data = json.loads(Path(p).read_text(encoding="utf-8"))
        except Exception as e:  # noqa: BLE001
            rep.err(str(p), "bad-json", str(e)); continue
        if not isinstance(data, list):
            rep.err(str(p), "bad-json", "file must contain a JSON array of reaction records"); continue
        for i, r in enumerate(data):
            rid = r.get("id", f"#{i}") if isinstance(r, dict) else f"#{i}"
            records.append((f"{Path(p).name}:{rid}", r))
    return records


def main(argv):
    quiet = "--quiet" in argv
    paths = [a for a in argv if not a.startswith("--")] or sorted(CONTENT.glob("*.json"))
    rep = Report()
    records = load(paths, rep)
    check_all(records, rep)
    if not quiet:
        for w, c, m in rep.warnings:
            print(f"warning  {w}  [{c}] {m}")
    for w, c, m in rep.errors:
        print(f"ERROR    {w}  [{c}] {m}")
    n_ver = sum(1 for _, r in records if isinstance(r, dict) and r.get("verified") is True)
    print(f"{len(records)} records in {len(paths)} files · {n_ver} verified · "
          f"{len(rep.errors)} errors · {len(rep.warnings)} warnings")
    return 1 if rep.errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
