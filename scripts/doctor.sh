#!/usr/bin/env bash
#
# Why is the shop still sending people to the seller's checkout?
#
#   bash scripts/doctor.sh https://pfa-full-website.vercel.app
#
# Asks the live site three questions and answers them in plain words:
#
#   1. Which build is actually deployed? A push that Vercel refused leaves the
#      old build serving, and nothing on the page says so.
#   2. Is direct pay on? It needs credentials; without them the shop falls back
#      to the seller's checkout on purpose.
#   3. Which variables are missing? By name. No value is ever printed or sent.
#
# Nothing here changes anything. It is safe to run against production.

set -uo pipefail

SITE="${1:-}"
[ -n "$SITE" ] || { echo "Usage: bash scripts/doctor.sh https://your-site"; exit 2; }
SITE="${SITE%/}"

LOCAL_BUILD="$(grep -o 'pfa-build" content="v[0-9.]*"' "$(dirname "${BASH_SOURCE[0]}")/../pfa-shop.html" 2>/dev/null | head -1 | sed 's/.*content="//; s/"$//')"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
good() { printf '  \033[32m%s\033[0m\n' "$1"; }
bad()  { printf '  \033[31m%s\033[0m\n' "$1"; }
warn() { printf '  \033[33m%s\033[0m\n' "$1"; }

bold "Asking $SITE"
echo

HEALTH="$(curl -sS --max-time 20 "$SITE/api/pfa-pay-start" 2>/dev/null || true)"

# ------------------------------------------------------------ is it deployed?
if [ -z "$HEALTH" ] || ! printf '%s' "$HEALTH" | grep -q '"directPay"'; then
  bad "The payment route is not there."
  echo
  echo "  That means this build is not deployed. The push may have succeeded"
  echo "  while Vercel refused the deployment; on a Hobby account the two usual"
  echo "  causes are a cron firing more than once a day, and a repository owned"
  echo "  by a GitHub organisation, which Hobby cannot deploy from at all."
  echo
  echo "  Look at the commit in GitHub: a red cross with no detail is the"
  echo "  signature of a deploy Vercel rejected before it started."
  [ -n "$HEALTH" ] && { echo; echo "  What came back:"; printf '%s\n' "$HEALTH" | head -5 | sed 's/^/    /'; }
  exit 1
fi

REMOTE_BUILD="$(printf '%s' "$HEALTH" | sed -n 's/.*"build":"\([^"]*\)".*/\1/p')"
DIRECT="$(printf '%s' "$HEALTH" | sed -n 's/.*"directPay":"\([^"]*\)".*/\1/p')"
MISSING="$(printf '%s' "$HEALTH" | sed -n 's/.*"missing":\[\([^]]*\)\].*/\1/p' | tr -d '"' | tr ',' ' ')"
KILL="$(printf '%s' "$HEALTH" | grep -o '"killSwitch":true' || true)"

bold "1. Which build is live"
if [ -n "$LOCAL_BUILD" ] && [ "$REMOTE_BUILD" != "$LOCAL_BUILD" ]; then
  bad "live: $REMOTE_BUILD   this tree: $LOCAL_BUILD"
  echo "     The deployment is behind. Nothing below will change until it catches up."
else
  good "live: $REMOTE_BUILD"
fi
echo

bold "2. Is the seller's checkout still in the way"
if [ "$DIRECT" = "on" ]; then
  good "No. Direct pay is on: shoppers go straight to Razorpay."
else
  bad "Yes. Direct pay is off, so the shop falls back to the seller's checkout."
fi
echo

bold "3. What is missing"
if [ -n "$KILL" ]; then
  warn "PFA_STORE_DIRECT_PAY is set to 0. That is the kill switch, and it is"
  warn "holding direct pay off regardless of everything else. Remove it or set it to 1."
elif [ -z "$(printf '%s' "$MISSING" | tr -d '[:space:]')" ]; then
  good "Nothing. Every variable direct pay needs is set."
else
  bad "These are unset in Vercel:"
  for v in $MISSING; do printf '    %s\n' "$v"; done
  echo
  echo "  Set them in Vercel > Settings > Environment Variables (Production),"
  echo "  then redeploy. Environment changes do not apply to an existing"
  echo "  deployment; the build has to be made again."
fi
echo

if [ "$DIRECT" = "on" ] && { [ -z "$LOCAL_BUILD" ] || [ "$REMOTE_BUILD" = "$LOCAL_BUILD" ]; }; then
  bold "Nothing left to do. Put something in the bag and press Continue to payment;"
  bold "Razorpay should open over the PFA page without leaving the site."
fi
