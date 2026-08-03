#!/bin/bash
# Rebuild the ink site, and the show/hide layer, from a clean copy of the repo.
set -e
SRC=${1:-/home/claude/site/pfa-demo-main}
DST=${2:-/home/claude/out}
T="$(dirname "$0")"
rm -rf "$DST" && cp -r "$SRC" "$DST"
cp "$T/pfa-visibility.js" "$DST/pfa-visibility.js"
python3 $T/convert.py     "$DST"          # light palette -> ink, band by band
python3 $T/glass.py       "$DST/pfa-glass.css"
python3 $T/index_align.py "$DST/index.html"
python3 $T/pins.py        "$DST"          # measured contrast corrections
python3 $T/visibility.py  "$DST"          # registry, section markers, runtime
python3 $T/admin_panel.py "$DST"          # console panel
python3 $T/tweaks.py      "$DST"          # hand corrections

# ship the machinery and the note alongside the build
mkdir -p "$DST/tools"
cp $T/*.py $T/build.sh "$DST/tools/"
cp $T/README-ink-build.md "$DST/README-ink-build.md"
python3 $T/layout.py      "$DST"          # one opening line everywhere
