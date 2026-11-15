#!/usr/bin/env python3
"""Reformat content JSON so it stays easy to read and review: one field per line, short arrays/objects inline.
    python3 tools/fmt_content.py              # every file under content/
    python3 tools/fmt_content.py path.json ...
"""
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WIDTH = 110


def dump(v, ind=0):
    flat = json.dumps(v, ensure_ascii=False, separators=(", ", ": "))
    if not isinstance(v, (dict, list)) or len(flat) + ind <= WIDTH:
        return flat
    pad, inner = " " * ind, " " * (ind + 2)
    if isinstance(v, list):
        return "[\n" + ",\n".join(inner + dump(x, ind + 2) for x in v) + "\n" + pad + "]"
    return "{\n" + ",\n".join(f"{inner}{json.dumps(k, ensure_ascii=False)}: {dump(x, ind + 2)}" for k, x in v.items()) + "\n" + pad + "}"


def main(paths):
    for p in paths or sorted((ROOT / "content").rglob("*.json")):
        p = Path(p)
        data = json.loads(p.read_text(encoding="utf-8"))
        p.write_text(dump(data) + "\n", encoding="utf-8")
        print("formatted", p.relative_to(ROOT) if p.is_absolute() else p)


if __name__ == "__main__":
    main(sys.argv[1:])
