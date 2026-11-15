#!/usr/bin/env python3
"""Apply review-sheet results: mark approved items verified, list the ones that need a fix.

    python3 tools/apply_review.py results.json      # the JSON from the review sheet's "Copy results"

Approved items get "verified": true and "verifiedBy": <reviewer>. Items marked "Needs a fix" are printed
(and un-verified if they were verified before) so they can be corrected.
"""
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import fmt_content  # noqa: E402


def main(path):
    res = json.loads(Path(path).read_text(encoding="utf-8"))
    who = res["reviewer"].strip()
    if not who:
        sys.exit("results have no reviewer name")
    ok, fix = set(res.get("approved", [])), {f["id"]: f.get("note", "") for f in res.get("fix", [])}
    seen, changed = set(), []
    for f in sorted((ROOT / "content").rglob("*.json")):
        data = json.loads(f.read_text(encoding="utf-8"))
        dirty = False
        for item in data:
            i = item.get("id")
            if i in ok:
                seen.add(i)
                if not item.get("verified") or item.get("verifiedBy") != who:
                    item["verified"], item["verifiedBy"] = True, who
                    item.pop("review", None)  # the reviewer has resolved the author's doubt
                    dirty = True
            elif i in fix:
                seen.add(i)
                if item.get("verified"):
                    item["verified"], item["verifiedBy"] = False, None
                    dirty = True
        if dirty:
            f.write_text(fmt_content.dump(data) + "\n", encoding="utf-8")
            changed.append(f.relative_to(ROOT).as_posix())
    unknown = (ok | set(fix)) - seen
    print(f"{len(ok & seen)} verified by {who}; files changed: {', '.join(changed) or 'none'}")
    if fix:
        print(f"\n{len(fix)} need a fix:")
        for i, note in fix.items():
            print(f"  {i}: {note}")
    if unknown:
        print("\nunknown ids (renamed or deleted?):", ", ".join(sorted(unknown)))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
