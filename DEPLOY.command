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

step "Making sure the library's documents are here"
# resources/ (the library PDFs) and test/fixtures/ (the PDFs the reader's
# tests read) live on GitHub, not in the zip. A deploy without them fails its
# tests, and if it ever got past them it would delete the PDFs from the site.
# Taken from the live tree when it has them, otherwise from GitHub.
# (8 Oct 2026: the live tree on the Desktop had lost resources/ and the
# one-line command stopped at the copy.)
if [ ! -d resources ] || [ ! -d test/fixtures ]; then
  if [ -d "$HOME/Desktop/PFA_Website/resources" ] && [ -d "$HOME/Desktop/PFA_Website/test/fixtures" ]; then
    cp -R "$HOME/Desktop/PFA_Website/resources" . && mkdir -p test && cp -R "$HOME/Desktop/PFA_Website/test/fixtures" test/
  else
    TMP_RES="$(mktemp -d)"
    git clone -q --depth 1 --filter=blob:none --sparse https://github.com/askrapidresponseteam-cloud/pfa-demo.git "$TMP_RES/repo"
    git -C "$TMP_RES/repo" sparse-checkout set resources test/fixtures
    cp -R "$TMP_RES/repo/resources" . && mkdir -p test && cp -R "$TMP_RES/repo/test/fixtures" test/
    rm -rf "$TMP_RES"
  fi
fi
echo "  $(ls resources | wc -l | tr -d ' ') library documents, $(ls test/fixtures/library 2>/dev/null | wc -l | tr -d ' ') test PDFs"


step "Fetching media (best effort; the test suite is the backstop)"
node scripts/fetch-cinekind-media.js --rewrite || echo "  CineKind media fetch failed; continuing, the tests will judge the tree"
npm run media:films -- --rewrite || echo "  founder-film fetch failed; continuing"
npm run media:units || echo "  unit-photo fetch failed; continuing"
npm run media:library || echo "  Some library documents could not be fetched from Google Drive; they open in Drive's viewer until a later run fetches them"
node scripts/build-events.js || echo "  The events list could not be written; the test suite will stop the deploy and name the entry"
node scripts/build-newsroom.js || echo "  The newsroom could not be written; the test suite will stop the deploy and name the story"
node scripts/build-library.js || echo "  The library could not be written; the test suite will stop the deploy and name the entry"

step "Checking every form reaches the admin panel and sends its acknowledgement (offline)"
node scripts/check-emails.js --brief || echo "  The email check found a problem; the test suite in scripts/ship.sh runs it too and will stop the deploy."

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

step "Checking automated email is switched on in production"
HEALTH_URL="${LIVE_URL%/index.html}/api/payment/health"
HEALTH="$(curl -s "$HEALTH_URL" || true)"
case "$HEALTH" in
  *'"mail":true'*)  printf 'EMAIL IS ON: acknowledgements, receipts and welcome letters can be sent.\n' ;;
  *'"mail":false'*) printf '\033[31mEMAIL IS OFF: PFA_MAIL_API_KEY is not set in Vercel.\033[0m\n  Every form still reaches the admin panel, but nobody is sent an acknowledgement or a welcome letter.\n  Add the key in Vercel (Project > Settings > Environment Variables), then deploy again.\n' ;;
  *) printf 'Could not read %s just now. Open it in a browser and look for "mail":true.\n' "$HEALTH_URL" ;;
esac

case "$HEALTH" in
  *'"files":"storage"'*)  printf 'PHOTOS ARE KEPT IN: Firebase Storage (the low-cost store).\n' ;;
  *'"files":"database"'*) printf '\033[33mPHOTOS ARE KEPT IN: the database.\033[0m Switch Storage on to store them for less:\n  Firebase console > pfa-new-website > Storage > Get started (production mode, Mumbai). No deploy needed after.\n' ;;
esac

step "Checking the two servers agree"
# The public site (Vercel) and the admin panel (Firebase) run the same code
# against one database, each with its own settings. Read both and compare
# what must match, without either showing a secret (8 Oct 2026).
PANEL_HEALTH="$(curl -s https://pfa-new-website.web.app/api/payment/health || true)"
field() { printf '%s' "$1" | grep -o "\"$2\":[^,}]*" | head -1 | sed 's/^[^:]*://; s/"//g'; }
if [ -z "$PANEL_HEALTH" ] || [ -z "$HEALTH" ]; then
  printf 'Could not read both servers just now; nothing to compare.\n'
else
  P1="$(field "$HEALTH" pepper)"; P2="$(field "$PANEL_HEALTH" pepper)"
  M2="$(field "$PANEL_HEALTH" mail)"
  if [ "$P1" = "$P2" ]; then
    printf 'BOTH SERVERS AGREE: the same tracking key (PFA_AUTH_PEPPER) on the site and the panel.\n'
  else
    printf '\033[33mThe site and the panel use different PFA_AUTH_PEPPER values.\033[0m Tracking still works on both\n'
    printf '  (each server also checks the email and mobile on the record itself), so nothing is broken.\n'
    printf '  To make them the same, copy the value from Vercel (Project > Settings > Environment Variables)\n'
    printf '  and run:  npx firebase-tools functions:secrets:set PFA_AUTH_PEPPER --project pfa-new-website\n'
    printf '  It takes effect with the next deploy.\n'
  fi
  # Both asked over IPv4 from this computer: the same network should come back.
  S1="$(field "$(curl -4 -s "$HEALTH_URL" || true)" seenAs)"
  S2="$(field "$(curl -4 -s https://pfa-new-website.web.app/api/payment/health || true)" seenAs)"
  if [ -n "$S1" ] && [ -n "$S2" ]; then
    if [ "$S1" = "$S2" ]; then
      printf 'BOTH SERVERS SEE VISITORS CORRECTLY: each saw this computer as %s, so their rate limits count real visitors.\n' "$S1"
    else
      printf '\033[33mThe panel server saw this computer as %s, the site as %s.\033[0m The panel server may be counting\n' "$S2" "$S1"
      printf '  a proxy instead of visitors. Send this line to whoever maintains the site (lib/client-ip.js, PFA_TRUSTED_PROXIES).\n'
    fi
  fi
  case "$M2" in
    true)  printf 'PANEL EMAIL IS ON: replies from the admin panel can be sent.\n' ;;
    false) printf '\033[31mPANEL EMAIL IS OFF on Firebase.\033[0m Run: npx firebase-tools functions:secrets:set PFA_SMTP_PASS --project pfa-new-website, then deploy again.\n' ;;
  esac
fi

printf '\nDone. You can close this window.\n'
