#!/usr/bin/env python3
"""Bygger en fristående HTML-fil (allt inbakat) som fungerar offline.

Användning:  python3 scripts/build_single.py [utfil.html] [--fragment]
--fragment tar bort <html>/<head>/<body>-skalet (för inbäddning).
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
args = [a for a in sys.argv[1:] if not a.startswith("--")]
out = Path(args[0]) if args else ROOT / "dist" / "frasmatning.html"
fragment = "--fragment" in sys.argv

html = (ROOT / "index.html").read_text(encoding="utf-8")
for src in ("data/tools.js", "app.js"):
    js = (ROOT / src).read_text(encoding="utf-8").replace("</script", "<\\/script")
    html = html.replace(f'<script src="{src}"></script>', f"<script>\n{js}\n</script>")

# PWA-delarna (manifest, ikoner, service worker) kräver de separata filerna och tas bort i enfilsversionen
html = re.sub(r"<!-- pwa -->.*?<!-- /pwa -->\s*", "", html, flags=re.S)

if fragment:
    html = re.sub(r"<!doctype html>\s*|</?html[^>]*>\s*|</?head>\s*|</?body>\s*", "", html, flags=re.I)
    html = re.sub(r'<meta charset[^>]*>\s*|<meta name="viewport"[^>]*>\s*', "", html)

out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(html, encoding="utf-8")
print(f"{out} ({len(html) // 1024} kB)")
