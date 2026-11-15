#!/usr/bin/env python3
"""Tests for tools/validate.py: the real content passes, and each deliberately broken copy fails
with the expected error code.   Run: python3 tools/test_validate.py"""
import copy, sys, unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import validate  # noqa: E402

FILES = sorted(validate.CONTENT.glob("*.json"))


def run(records):
    rep = validate.Report()
    validate.check_all([(r.get("id", "?") if isinstance(r, dict) else "?", r) for r in records], rep)
    return rep


def good():
    rep = validate.Report()
    recs = [r for _, r in validate.load(FILES, rep)]
    assert not rep.errors, rep.errors
    return recs


def by_id(recs, rid):
    return next(r for r in recs if r["id"] == rid)


# (name, expected error code, mutation applied to a deep copy of the good records)
BREAKS = [
    ("product SMILES does not parse", "bad-smiles",
     lambda R: by_id(R, "u1-grignard-ketone").update(product="[CH3:1][C:2]([OH:3]([CH3:4])[CH3:5]")),
    ("pentavalent carbon fails sanitization", "bad-smiles",
     lambda R: by_id(R, "u1-grignard-ketone").update(product="[CH3:1][C:2](=[OH:3])([CH3:4])[CH3:5]")),
    ("product atom map not in reactants", "map-not-in-reactants",
     lambda R: by_id(R, "u1-grignard-ketone").update(product="[CH3:1][C:2]([OH:3])([CH3:4])[CH3:9]")),
    ("mapped atom changes element", "map-element-changed",
     lambda R: by_id(R, "u1-grignard-ketone").update(product="[CH3:1][C:2]([OH:3])([CH3:4])[NH2:5]")),
    ("unmapped atom in product", "unmapped-atom",
     lambda R: by_id(R, "u1-grignard-ketone").update(product="[CH3:1][C:2]([OH:3])([CH3:4])C")),
    ("map number reused on reactant side", "duplicate-map",
     lambda R: by_id(R, "u1-grignard-ketone").update(reagents=["[CH3:4][Mg:6][Br:7]"])),
    ("arrow points at an atom that isn't there", "bad-step-atom",
     lambda R: by_id(R, "u1-grignard-ketone")["keyStep"]["arrows"][0].update(to={"atom": 42})),
    ("arrow starts at a bond that doesn't exist", "no-such-bond",
     lambda R: by_id(R, "u1-grignard-ketone")["keyStep"]["arrows"][1].update({"from": {"bond": [1, 3]}})),
    ("lone pair on a neutral carbon", "no-lone-pair",
     lambda R: by_id(R, "u1-grignard-ketone")["keyStep"]["arrows"][0].update({"from": {"lonePair": 5}})),
    ("no arrow reaches the electrophile", "electrophile-not-attacked",
     lambda R: by_id(R, "u1-grignard-ketone")["keyStep"].update(electrophileAtom=1)),
    ("trap is the product written differently", "trap-equals-product",
     lambda R: by_id(R, "u1-grignard-ketone")["traps"][0].update(smiles="OC(C)(C)C")),
    ("regression: 'retention' trap that is really the inverted product", "trap-equals-product",
     lambda R: by_id(R, "side-sn2-2-bromobutane-cyanide")["traps"][0].update(smiles="CC[C@@H](C)C#N")),
    ("two identical traps", "duplicate-trap",
     lambda R: by_id(R, "u1-grignard-ketone")["traps"][1].update(smiles="OC(C)C")),
    ("trap without an explanation", "trap-no-explanation",
     lambda R: by_id(R, "u1-grignard-ketone")["traps"][0].update(explains="  ")),
    ("too few traps", "trap-count",
     lambda R: by_id(R, "u1-grignard-ketone").update(traps=by_id(R, "u1-grignard-ketone")["traps"][:1])),
    ("duplicate id", "duplicate-id",
     lambda R: R.append(dict(copy.deepcopy(by_id(R, "u3-gilman-enone")), title="copy"))),
    ("same reaction under a new id", "duplicate-reaction",
     lambda R: R.append(dict(copy.deepcopy(by_id(R, "u3-gilman-enone")), id="u3-gilman-enone-again"))),
    ("confusableWith points nowhere", "unknown-confusable",
     lambda R: by_id(R, "u1-grignard-ketone")["confusableWith"].append("u9-nothing")),
    ("empty alias list", "no-aliases",
     lambda R: by_id(R, "u1-grignard-ketone").update(reagentAliases=[])),
    ("missing required field", "missing-field",
     lambda R: by_id(R, "u1-grignard-ketone").pop("why")),
    ("verified with no reviewer", "verified-without-reviewer",
     lambda R: by_id(R, "u1-grignard-ketone").update(verified=True, verifiedBy=None)),
    ("unknown pattern", "bad-pattern",
     lambda R: by_id(R, "u1-grignard-ketone").update(pattern="E")),
    ("mechanism step missing an arrow (the C=O never reforms)", "mech-step-mismatch",
     lambda R: by_id(R, "u4-michael-malonate-mvk")["mechanism"]["steps"][2].update(arrows=by_id(R, "u4-michael-malonate-mvk")["mechanism"]["steps"][2]["arrows"][1:])),
    ("mechanism arrow to the wrong carbon (1,2 instead of 1,4)", "mech-step-mismatch",
     lambda R: by_id(R, "u3-gilman-enone")["mechanism"]["steps"][0].update(arrows=[{"from": {"bond": [8, 9]}, "to": {"atom": 2}}, {"from": {"bond": [1, 2]}, "to": {"atom": 1}}])),
    ("mechanism intermediate drawn wrong", "mech-step-mismatch",
     lambda R: by_id(R, "u3-gilman-enone")["mechanism"]["steps"][1].update(species=["[O-:1][C:2]1=[CH:3][CH2:4][CH:5]([CH3:8])[CH2:6][CH2:7]1", "[H:20][OH2+:21]"])),
    ("mechanism lone pair on a neutral carbon", "no-lone-pair",
     lambda R: by_id(R, "u4-michael-malonate-mvk")["mechanism"]["steps"][1]["arrows"][1].update({"from": {"lonePair": 6}})),
    ("key-step species with an atom that isn't a reactant", "species-map-unknown",
     lambda R: by_id(R, "u4-aldol-addition-acetaldehyde")["keyStep"].update(species=["[CH2:1]=[CH:2][O-:3]", "[CH3:4][CH:5]=[O:66]"])),
]


class ValidatorTests(unittest.TestCase):
    def test_real_content_passes(self):
        recs = good()
        self.assertGreaterEqual(len(recs), 5)
        rep = run(copy.deepcopy(recs))
        self.assertEqual(rep.errors, [])

    def test_each_break_is_caught(self):
        base = good()
        for name, code, mutate in BREAKS:
            with self.subTest(name):
                recs = copy.deepcopy(base)
                mutate(recs)
                rep = run(recs)
                self.assertIn(code, rep.codes(), f"{name}: got {rep.errors}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
