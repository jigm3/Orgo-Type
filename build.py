#!/usr/bin/env python3
"""Build Orgo Type into dist/.

Assembles src/index.html with the CSS and JS modules inlined (one page, like Anatomy Type),
copies static files, and writes a service worker whose cache name is a hash of everything built,
so phones pick up each new version.

    python3 build.py            # build into dist/
    python3 build.py --serve    # build, then serve dist/ on http://localhost:8000
"""
import hashlib, json, shutil, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC, DIST = ROOT / "src", ROOT / "dist"

# order matters: later modules use earlier ones
CSS = ["ui/tokens.css", "ui/app.css"]
JS = ["engine/store.js", "chem/rdkit.js", "ui/app.js"]
STATIC = ["manifest.webmanifest", "icons", "vendor/rdkit/RDKit_minimal.js",
          "vendor/rdkit/RDKit_minimal.wasm", "vendor/rdkit/LICENSE", ".nojekyll"]


def read(rel):
    return (SRC / rel).read_text(encoding="utf-8")


def module(rel):
    return f"/* ===== {rel} ===== */\n{read(rel).rstrip()}\n"


def main():
    rdkit_version = (ROOT / "vendor/rdkit/VERSION").read_text().strip()
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
            dst.touch()  # e.g. .nojekyll

    css = "\n".join(module(p) for p in CSS)
    js = "\n".join(module(p) for p in JS).replace("__RDKIT_VERSION__", rdkit_version)

    # build id = hash of every input that ends up in dist (so the SW cache busts on any change)
    h = hashlib.sha256()
    h.update(css.encode()); h.update(js.encode()); h.update(read("index.html").encode()); h.update(read("sw.js").encode())
    for f in sorted(p for p in DIST.rglob("*") if p.is_file()):
        h.update(f.relative_to(DIST).as_posix().encode()); h.update(f.read_bytes())
    build_id = h.hexdigest()[:10]

    page = (read("index.html")
            .replace("/*@CSS@*/", css)
            .replace("/*@JS@*/", js.replace("__BUILD_ID__", build_id)))
    (DIST / "index.html").write_text(page, encoding="utf-8")

    v = f"?v={rdkit_version}"
    core = ["./", "index.html", "manifest.webmanifest",
            "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png", "icons/favicon.png",
            "vendor/rdkit/RDKit_minimal.js" + v, "vendor/rdkit/RDKit_minimal.wasm" + v]
    sw = read("sw.js").replace("__CACHE_ID__", build_id).replace("__CORE__", json.dumps(core))
    (DIST / "sw.js").write_text(sw, encoding="utf-8")

    size = (DIST / "index.html").stat().st_size
    print(f"built dist/ · build {build_id} · index.html {size/1024:.1f} KB · RDKit {rdkit_version}")
    return build_id


if __name__ == "__main__":
    main()
    if "--serve" in sys.argv:
        import functools, http.server
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(DIST))
        print("serving http://localhost:8000")
        http.server.ThreadingHTTPServer(("", 8000), handler).serve_forever()
