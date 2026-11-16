#!/usr/bin/env python3
"""Apply independent AI-review reports: items judged "pass" or "fixed" become verified, "doubt" items stay out.

    python3 tools/apply_ai_review.py reviews/*.json

Each report is a JSON array of {"id", "verdict": "pass"|"fixed"|"doubt", "notes"} written by a reviewer agent that
did not author the content (see reviews/README.md). Verified items get "verifiedBy": "AI review (YYYY-MM-DD)";
the main app says so openly. A human review (tools/apply_review.py) can later replace it.
Items whose file changed after their review is not detected here; re-run the reviewer after edits.
"""
import json, sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import fmt_content  # noqa: E402

LABEL = f"AI review ({date.today().isoformat()})"


def main(paths):
    verdict = {}
    for p in paths:
        for e in json.loads(Path(p).read_text(encoding="utf-8")):
            verdict[e["id"]] = e["verdict"]
    seen, counts = set(), {"verified": 0, "doubt": 0, "kept-human": 0}
    for f in sorted((ROOT / "content").rglob("*.json")):
        data = json.loads(f.read_text(encoding="utf-8"))
        dirty = False
        for item in data:
            v = verdict.get(item.get("id"))
            if v is None:
                continue
            seen.add(item["id"])
            if item.get("verified") and not str(item.get("verifiedBy", "")).startswith("AI review"):
                counts["kept-human"] += 1   # never overwrite a human reviewer's sign-off
                continue
            if v in ("pass", "fixed"):
                if not item.get("verified") or item.get("verifiedBy") != LABEL:
                    item["verified"], item["verifiedBy"] = True, LABEL
                    dirty = True
                counts["verified"] += 1
            else:
                if item.get("verified"):
                    item["verified"], item["verifiedBy"] = False, None
                    dirty = True
                counts["doubt"] += 1
        if dirty:
            f.write_text(fmt_content.dump(data) + "\n", encoding="utf-8")
    missing = sorted(set(verdict) - seen)
    print(f"{counts['verified']} verified ({LABEL}), {counts['doubt']} left out as doubtful, "
          f"{counts['kept-human']} already human-verified" + (f"; unknown ids: {', '.join(missing)}" if missing else ""))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1:])
