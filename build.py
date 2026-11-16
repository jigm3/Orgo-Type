#!/usr/bin/env python3
"""Build Orgo Type into dist/.

Two builds from the same source:
  dist/        the real app: only reaction cards, lessons and quiz items with "verified": true
  dist/dev/    the preview app: everything, unverified included, with a warning banner and separate progress

Each page is one index.html with the CSS, JS modules and content inlined (like Anatomy Type). RDKit and
ts-fsrs are served from vendor/ and cached by one service worker, whose cache name is a hash of the build.

    python3 build.py            # build both into dist/
    python3 build.py --serve    # build, then serve dist/ on http://localhost:8000
    python3 build.py --no-validate   # skip validation (local experiments only; CI always validates)

Content is validated first (tools/validate.py, needs `pip install -r requirements.txt`); any error stops the build.
Sync turns on when firebase.config.json exists ({"projectId": ..., "apiKey": ...}).
"""
import hashlib, json, shutil, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC, DIST = ROOT / "src", ROOT / "dist"
sys.path.insert(0, str(ROOT / "tools"))

# order matters: later modules use earlier ones
CSS = ["ui/tokens.css", "ui/app.css"]
JS = ["engine/store.js", "chem/rdkit.js", "engine/grade.js", "engine/deck.js", "engine/scheduler.js", "engine/game.js",
      "engine/sync.js", "ui/molview.js", "ui/structedit.js", "cards/common.js", "cards/where.js", "cards/arrows.js", "cards/product.js",
      "cards/mechanism.js", "cards/draw.js", "cards/reagent.js", "cards/why.js", "cards/change.js", "cards/back.js", "cards/paper.js",
      "ui/session.js", "ui/lesson.js", "ui/home.js", "ui/settings.js", "ui/tour.js", "ui/diag.js", "ui/app.js"]
STATIC = ["manifest.webmanifest", "icons", "vendor/rdkit/RDKit_minimal.js", "vendor/rdkit/RDKit_minimal.wasm",
          "vendor/rdkit/LICENSE", "vendor/fsrs/ts-fsrs.umd.js", "vendor/fsrs/LICENSE", ".nojekyll"]


def read(rel):
    return (SRC / rel).read_text(encoding="utf-8")


def module(rel):
    return f"/* ===== {rel} ===== */\n{read(rel).rstrip()}\n"


def page(dev, base, versions, firebase, build_id):
    import compile_content
    content = compile_content.bundle(dev=dev)
    css = "\n".join(module(p) for p in CSS)
    js = "\n".join(module(p) for p in JS)
    sub = {"__RDKIT_VERSION__": versions["rdkit"], "__FSRS_VERSION__": versions["fsrs"], "__BASE__": base,
           "__BUILD_ID__": build_id + ("-dev" if dev else ""), "__FIREBASE__": json.dumps(firebase),
           "__STORE_KEY__": "orgotype.dev.v1" if dev else "orgotype.v1"}
    html = read("index.html").replace("/*@CSS@*/", css).replace("/*@JS@*/", js)
    for k, v in sub.items():
        html = html.replace(k, v)
    # content last, so nothing inside it gets substituted
    html = html.replace("/*@CONTENT@*/", json.dumps(content, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/"))
    return html, content


def main():
    if "--no-validate" not in sys.argv and subprocess.run([sys.executable, str(ROOT / "tools/validate.py"), "--quiet"]).returncode:
        sys.exit("build stopped: fix the content errors above")
    versions = {"rdkit": (ROOT / "vendor/rdkit/VERSION").read_text().strip(), "fsrs": (ROOT / "vendor/fsrs/VERSION").read_text().strip()}
    fb_file = ROOT / "firebase.config.json"
    firebase = json.loads(fb_file.read_text()) if fb_file.exists() else None

    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir()
    for rel in STATIC:
        src, dst = ROOT / rel, DIST / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        if src.is_dir():
            shutil.copytree(src, dst)
        elif src.exists():
            shutil.copy2(src, dst)
        else:
            dst.touch()

    # build id = hash of every input
    h = hashlib.sha256()
    for f in sorted(list(SRC.rglob("*")) + list((ROOT / "content").rglob("*.json")) + [p for p in DIST.rglob("*")]):
        if f.is_file():
            h.update(f.name.encode()); h.update(f.read_bytes())
    if firebase:
        h.update(json.dumps(firebase).encode())
    build_id = h.hexdigest()[:10]

    html, content = page(False, "", versions, firebase, build_id)
    (DIST / "index.html").write_text(html, encoding="utf-8")
    (DIST / "dev").mkdir()
    dev_html, dev_content = page(True, "../", versions, firebase, build_id)
    (DIST / "dev" / "index.html").write_text(dev_html, encoding="utf-8")
    subprocess.run([sys.executable, str(ROOT / "tools/review_sheet.py"), str(DIST / "review.html")], check=True, stdout=subprocess.DEVNULL)

    core = ["./", "index.html", "dev/", "dev/index.html", "manifest.webmanifest",
            "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png", "icons/favicon.png",
            f"vendor/rdkit/RDKit_minimal.js?v={versions['rdkit']}", f"vendor/rdkit/RDKit_minimal.wasm?v={versions['rdkit']}",
            f"vendor/fsrs/ts-fsrs.umd.js?v={versions['fsrs']}"]
    sw = read("sw.js").replace("__CACHE_ID__", build_id).replace("__CORE__", json.dumps(core))
    (DIST / "sw.js").write_text(sw, encoding="utf-8")

    def counts(c):
        return f"{len(c['reactions'])} reactions, {len(c['lessons'])} lessons, {len(c['diagnostic'])} quiz items"
    print(f"built dist/ · build {build_id} · app: {counts(content)} · preview (dev/): {counts(dev_content)}"
          f" · sync {'on' if firebase else 'off'} · index.html {(DIST / 'index.html').stat().st_size / 1024:.0f} KB")
    return build_id


if __name__ == "__main__":
    main()
    if "--serve" in sys.argv:
        import functools, http.server
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(DIST))
        print("serving http://localhost:8000")
        http.server.ThreadingHTTPServer(("", 8000), handler).serve_forever()
