#!/bin/bash
#
# Double-click me to ship this tree.
#
# This is the whole pipeline that used to be one long pasted line, minus the
# `git pull` that opened it. That pull assumed ~/Desktop/PFA_Website was a git
# checkout; it is not one, so the line died on its first step three times in a
# row on 16 Sep 2026 while everything after it, the actual deploy, never ran.
# scripts/ship.sh manages the live tree and its git history itself, so nothing
# here needs to pull anything first.
#
# What this does, in order:
#   1. installs dependencies in THIS folder (wherever it was unzipped)
#   2. fetches the CineKind, founder-film and unit media, best effort: if a
#      third-party site is down the deploy still proceeds, because ship.sh
#      runs the full test suite and the suite is the backstop for half-done
#      media, not this script
#   3. hands over to scripts/ship.sh, which checks the Firebase project, the
#      key, the admin claim and the sign-in, runs all the tests, and only
#      then backs up ~/Desktop/PFA_Website, replaces it, commits and pushes
#   4. waits, then reads the live site's build stamp back so the last line
#      on screen is proof of what is actually deployed
#
# If anything fails, ship.sh prints STOPPED with the reason and the live
# tree and site are untouched. Close the window, fix what it names, and
# double-click again.
#
# macOS may refuse the first double-click of a downloaded script with
# "cannot be opened because it is from an unidentified developer".
# Right-click the file, choose Open, then Open again. Once is enough.

set -euo pipefail

# A double-clicked .command does not read the shell profile, so Homebrew's
# node is not on PATH unless it is put there.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

cd "$(dirname "$0")"

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

EMAIL="${1:-karthik.dhanya11@gmail.com}"
LIVE_URL="https://book.pfaevents.buzz/index.html"

command -v node >/dev/null || { printf '\n\033[31mSTOPPED: node is not installed or not on PATH.\033[0m\n  Install it from nodejs.org or via Homebrew, then double-click again.\n'; exit 1; }

step "Deploying from $(pwd) as $EMAIL"

step "Installing dependencies"
npm install --silent

step "Fetching media (best effort; the test suite is the backstop)"
node scripts/fetch-cinekind-media.js --rewrite || echo "  CineKind media fetch failed; continuing, the tests will judge the tree"
npm run media:films -- --rewrite || echo "  founder-film fetch failed; continuing"
npm run media:units || echo "  unit-photo fetch failed; continuing"

step "Handing over to scripts/ship.sh"
bash scripts/ship.sh "$EMAIL"

step "Reading the live build stamp back"
sleep 45
LIVE="$(curl -s "$LIVE_URL" | grep -o 'pfa-build" content="[^"]*"' || true)"
if [ -n "$LIVE" ]; then
  printf '\nLIVE BUILD IS: %s\n' "$LIVE"
else
  printf '\nCould not read %s just now. Give it a minute and open the site yourself;\nthe deploy above already finished.\n' "$LIVE_URL"
fi

printf '\nDone. You can close this window.\n'
