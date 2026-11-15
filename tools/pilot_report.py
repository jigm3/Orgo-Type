#!/usr/bin/env python3
"""Summarize pilot exports (Settings → Export progress) into the numbers the pilot needs.

    python3 tools/pilot_report.py orgo-type-*.json

For each export: days active, cards answered, first-try accuracy per pattern (week 1 vs week 2),
check-up form A vs form B by pattern, the cards missed most (likely confusing), and reported problems.
No third-party packages needed.
"""
import json, sys
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def reaction_patterns():
    pats = {}
    for f in (ROOT / "content" / "reactions").glob("*.json"):
        for r in json.loads(f.read_text(encoding="utf-8")):
            pats[r["id"]] = r["pattern"]
    return pats


def pct(a, b):
    return f"{100 * a / b:.0f}% ({a}/{b})" if b else "–"


def report(path, pats):
    d = json.loads(Path(path).read_text(encoding="utf-8"))
    print(f"\n=== {d.get('name') or Path(path).name} · exported {d.get('exportedAt', '?')[:10]} · build {d.get('build')}{' (preview)' if d.get('preview') else ''}")
    log = [e for e in d.get("log", []) if "card" in e]
    if not log:
        print("no card answers yet"); return
    days = sorted({e["t"][:10] for e in log})
    start = date.fromisoformat(days[0])
    print(f"active on {len(days)} days ({days[0]} → {days[-1]}), {len(log)} answers, "
          f"{len({e['card'] for e in log})} different cards, streak days {len(d.get('days', []))}")
    mins = sum(min(e.get("ms", 0), 120000) for e in log) / 60000
    print(f"time on cards ≈ {mins:.0f} min total, {mins / len(days):.0f} min per active day")

    # first-try accuracy per pattern, split into week 1 and week 2+
    by = defaultdict(lambda: [[0, 0], [0, 0]])
    for e in log:
        if not e.get("first", True):
            continue
        p = pats.get(e["card"].rsplit(":", 1)[0], "?")
        wk = 0 if (date.fromisoformat(e["t"][:10]) - start).days < 7 else 1
        by[p][wk][1] += 1
        by[p][wk][0] += e["r"] != "again"
    print("first-try accuracy by pattern     week 1          week 2+")
    for p in sorted(by):
        print(f"  {p:<30} {pct(*by[p][0]):<15} {pct(*by[p][1])}")

    by_type = Counter(), Counter()
    for e in log:
        if e.get("first", True):
            t = e["card"].rsplit(":", 1)[1]
            by_type[1][t] += 1
            by_type[0][t] += e["r"] != "again"
    print("first-try accuracy by card type: " + ", ".join(f"{t} {pct(by_type[0][t], by_type[1][t])}" for t in sorted(by_type[1])))

    misses = Counter(e["card"] for e in log if e["r"] == "again")
    if misses:
        print("most-missed cards (check these for confusing wording or wrong chemistry):")
        for c, n in misses.most_common(8):
            print(f"  {n}×  {c}")

    diag = d.get("diag") or {}
    if diag:
        print("check-up quiz:")
        for f in sorted(diag):
            q = diag[f]
            print(f"  form {f} ({q['at'][:10]}, {q.get('minutes', '?')} min): {pct(q['right'], q['total'])}  " +
                  ", ".join(f"{p} {b['right']}/{b['total']}" for p, b in sorted(q["byPattern"].items())))
        if "A" in diag and "B" in diag:
            a, b = diag["A"]["byPattern"], diag["B"]["byPattern"]
            print("  change A → B: " + ", ".join(f"{p} {b.get(p, {}).get('right', 0) - a.get(p, {}).get('right', 0):+d}" for p in sorted(set(a) | set(b))))
    for rep in d.get("reports", []):
        print(f"  reported: {rep['card']}: {rep['text']}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    pats = reaction_patterns()
    for p in sys.argv[1:]:
        report(p, pats)
