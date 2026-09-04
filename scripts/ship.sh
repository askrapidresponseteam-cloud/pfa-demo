#!/usr/bin/env bash
#
# One command, start to finish.
#
#   bash scripts/ship.sh you@peopleforanimalsindia.org
#
# Updates ~/Desktop/PFA_Website in place, keeps its git history, confirms
# somebody can actually sign in, and only then pushes and deploys the rules.
#
# The order matters and is not negotiable. This release retires the two shared
# admin secrets, so once it is live the ONLY way into /admin.html is a Firebase
# account carrying the admin claim. Pushing before confirming that claim exists
# locks everyone out of the panel with no way back in over the web. So the
# claim is checked first and nothing is pushed if the check fails.
#
# Nothing here prints a secret. The service account is read from the file on
# your Desktop, held in the environment for the length of this run, and
# cleared at the end.

set -euo pipefail

EMAIL="${1:-}"
LIVE="$HOME/Desktop/PFA_Website"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$HOME/Desktop/PFA_Website_backup_$STAMP"

# The tree this script was unpacked into.
NEW="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
fail() { printf '\n\033[31mSTOPPED: %s\033[0m\n' "$1" >&2; exit 1; }

REMOTE="${2:-https://github.com/askrapidresponseteam-cloud/pfa-demo.git}"

[ -n "$EMAIL" ] || fail "Give your admin email:
  bash scripts/ship.sh YOUR-REAL-EMAIL@example.org"
[ -f "$NEW/admin.html" ] || fail "This does not look like the new tree ($NEW)."

case "$EMAIL" in
  you@*|your@*|admin@example.*|*@example.org|*@example.com)
    fail "\"$EMAIL\" is the example address, not yours.
  Use the email of a real account in Firebase > Authentication > Users." ;;
esac
case "$EMAIL" in *@*.*) ;; *) fail "\"$EMAIL\" is not an email address." ;; esac

# ---------------------------------------------------------------- credential
step "Finding the Firebase service account"
KEY="$(ls -t "$HOME/Desktop"/*firebase-adminsdk*.json "$HOME/Downloads"/*firebase-adminsdk*.json 2>/dev/null | head -1 || true)"
[ -n "$KEY" ] || fail "No *firebase-adminsdk*.json on your Desktop or in Downloads.
  Firebase console > Project settings > Service accounts > Generate new private key.
  Do NOT use 'vercel env pull' - those values come back as the text [SENSITIVE]."
echo "  using $(basename "$KEY")"
export FIREBASE_SERVICE_ACCOUNT_JSON="$(cat "$KEY")"
# A shell that has ever sourced a `vercel env pull` file carries the three
# separate variables holding the literal text [SENSITIVE]. The JSON above takes
# precedence so they change nothing, but they make every check below ambiguous.
unset FIREBASE_PROJECT_ID FIREBASE_CLIENT_EMAIL FIREBASE_PRIVATE_KEY 2>/dev/null || true
cleanup() { unset FIREBASE_SERVICE_ACCOUNT_JSON || true; }
trap cleanup EXIT

# ---------------------------------------------------------------- swap trees
if [ -d "$LIVE" ]; then
  step "Backing up the current tree"
  cp -R "$LIVE" "$BACKUP"
  echo "  $BACKUP"

  step "Updating the tree, keeping .git and node_modules"
  rsync -a --delete --exclude '.git' --exclude 'node_modules' "$NEW"/ "$LIVE"/
else
  step "No tree at $LIVE yet, creating it"
  mkdir -p "$LIVE"
  rsync -a --exclude '.git' --exclude 'node_modules' "$NEW"/ "$LIVE"/
fi
cd "$LIVE"

step "Installing dependencies"
npm install --silent

# ------------------------------------------------------- can anyone sign in?
step "Granting the admin claim to $EMAIL"
# Idempotent: granting an account that already has it changes nothing.
node scripts/grant-admin.js "$EMAIL" || fail "Could not grant the claim.
  If it says there is no user record, create the account first:
  Firebase console > Authentication > Users > Add user. The password is set there."

step "Checking sign-in will work"
node scripts/check-admin-setup.js "$EMAIL" || fail "Sign-in would still fail. Nothing has been pushed.
  Fix what is listed above and run this again. Your old tree is at $BACKUP."

# ------------------------------------------------------------------- verify
step "Running the tests"
# The reporter is pinned, because Node changed which one it defaults to and
# the counts were being parsed out of whichever format happened to appear.
TESTS="$(npm run --silent test:tap 2>&1 || true)"
PASS="$(printf '%s\n' "$TESTS" | grep -E '^# pass [0-9]+' | tail -1 | tr -dc '0-9')"
FAILED="$(printf '%s\n' "$TESTS" | grep -E '^# fail [0-9]+' | tail -1 | tr -dc '0-9')"

if [ -z "$PASS" ]; then
  printf '%s\n' "$TESTS" | tail -25
  fail "The tests did not run at all - their output is above. Nothing has been pushed.
  Your old tree is at $BACKUP."
fi

echo "  $PASS passing, ${FAILED:-0} failing"
# The suite is green. Any failure at all is new, and stops the ship: there is
# no longer a backlog of known failures for a real one to hide behind.
# A collapse in the number passing stops it too.
if [ "$PASS" -lt 500 ]; then
  printf '%s\n' "$TESTS" | grep -E '^not ok' | head -25
  fail "Only $PASS tests passed, which is not right. Nothing has been pushed.
  Your old tree is at $BACKUP."
fi
if [ "${FAILED:-0}" -gt 0 ]; then
  printf '%s\n' "$TESTS" | grep -E '^not ok' | head -25
  fail "${FAILED} tests failed. The suite is green, so this is a regression. Something in this build broke.
  Nothing has been pushed. Your old tree is at $BACKUP."
fi

# --------------------------------------------------------------------- ship
step "Committing"
# The version and the headline are read out of the tree being shipped, not
# typed here. A hardcoded message is how every commit from March to August came
# out saying "v1.106" regardless of what was in it, which made the deployed
# commit useless for telling which build was live.
VERSION="$(grep -o 'pfa-build" content="v[0-9.]*"' pfa-shop.html | head -1 | sed 's/.*content="//; s/"$//')"
SUMMARY="$(awk '/^- /{sub(/^- /,""); gsub(/\*\*/,""); sub(/\. .*$/,""); sub(/\.$/,""); print; exit}' CHANGELOG.md)"
[ -n "$VERSION" ] || VERSION="untagged"
if [ -n "$SUMMARY" ]; then
  MESSAGE="$VERSION: $SUMMARY"
else
  MESSAGE="$VERSION: site update"
fi
# Long enough to be useful in a Vercel deployment list, short enough to read.
MESSAGE="$(printf '%s' "$MESSAGE" | cut -c1-110)"
echo "  message: $MESSAGE"

FRESH=0
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  git init -q
  FRESH=1
  echo "  new repository (the previous .git did not come across)"
fi
git add -A
if git diff --cached --quiet; then
  echo "  nothing changed"
else
  git commit -q -m "$MESSAGE"
  echo "  committed"
fi

step "Pushing"
if ! git remote get-url origin >/dev/null 2>&1; then
  git remote add origin "$REMOTE"
  echo "  added origin $REMOTE"
fi
git branch -M main
if [ "$FRESH" = "1" ]; then
  # A fresh repository shares no history with the remote, so an ordinary push
  # is refused. This is the same force push the previous workflow used: it
  # replaces the remote contents with this tree. The backup above is the way
  # back if that turns out to be wrong.
  echo "  this repository has no shared history with the remote, so the push replaces it"
  git push -u origin main --force
else
  git push -u origin main
fi

step "Deploying the database rules"
# Name the project explicitly. The firebase CLI otherwise uses whichever
# project it last had selected, which is global to the machine and unrelated to
# this directory - on 27 Aug that sent these rules to an unrelated project and
# overwrote its rules. Taking the id from the service account key guarantees
# the rules land on the same project the API and the sign-in use.
PROJECT="$(node -e 'process.stdout.write(String(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON).project_id || ""))')"
[ -n "$PROJECT" ] || fail "Could not read project_id from the service account key."
echo "  project: $PROJECT"
# When the rules have not changed, firebase-tools skips the upload and then
# trips over its own release with "409, Requested entity already exists".
# That is success wearing a red coat: the rules on the project are already
# these rules. Anything else is a real failure and still stops the script.
RULES_LOG="$(mktemp)"
if npx --yes firebase-tools deploy --only firestore:rules --project "$PROJECT" 2>&1 | tee "$RULES_LOG"; then
  :
elif grep -q "already up to date" "$RULES_LOG" && grep -q "409" "$RULES_LOG"; then
  echo "  rules unchanged - already deployed on $PROJECT, nothing to do"
else
  rm -f "$RULES_LOG"
  fail "Deploying the database rules failed. See the output above."
fi
rm -f "$RULES_LOG"

printf '\n\033[32mDone.\033[0m Pushed %s to %s\n' "$MESSAGE" "$REMOTE"
printf 'Backup of the previous tree: %s\n' "$BACKUP"
printf '\nCheck the deployment picked it up:\n'
printf '  The commit shown in Vercel should read "%s".\n' "$MESSAGE"
printf '  If no new deployment appears at all, the deploy was refused before it\n'
printf '  started. On a Hobby account the two usual causes are a cron firing more\n'
printf '  than once a day (guarded by test/vercel-crons.test.js) and a repository\n'
printf '  owned by a GitHub organisation, which Hobby cannot deploy from.\n'
printf '\nThen rotate %s in the Firebase console - it has been sitting on your Desktop.\n' "$(basename "$KEY")"
