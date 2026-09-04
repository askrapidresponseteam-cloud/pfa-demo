# Deploying to Firebase

The site runs on Vercel today. This adds Firebase as an alternative without
removing that: `vercel.json` is untouched, so both work and you can move back.

## Once

    npm install -g firebase-tools
    firebase login
    cd functions && npm install && cd ..

Environment. Vercel holds these as project variables; Firebase needs them too.
The secret ones go in Secret Manager, not a file:

    firebase functions:secrets:set CCAVENUE_WORKING_KEY
    firebase functions:secrets:set CCAVENUE_ACCESS_CODE
    firebase functions:secrets:set CCAVENUE_MERCHANT_ID
    firebase functions:secrets:set PFA_ADMIN_TOKEN
    firebase functions:secrets:set PFA_AUTH_PEPPER
    firebase functions:secrets:set PFA_MAIL_API_KEY
    firebase functions:secrets:set PFA_SHOPIFY_ADMIN_TOKEN
    firebase functions:secrets:set PFA_SHOPIFY_WEBHOOK_SECRET
    firebase functions:secrets:set CRON_SECRET

The rest (PUBLIC_SITE_URL, PAWS_SHOPIFY_DOMAIN, PFA_MAIL_FROM and so on) go in
`functions/.env`. Firebase credentials are not needed: a function running in
the project authenticates to Firestore on its own, so FIREBASE_PRIVATE_KEY and
FIREBASE_SERVICE_ACCOUNT_JSON can be left out entirely.

## Every time

    npm run deploy:firebase

which is `node scripts/build-firebase.js && firebase deploy --project pfa-new-website`.

The build step assembles two directories:

  public/     19 pages and 44 assets, copied from an allowlist
  functions/  the API and lib/, wrapped as one Cloud Function

## Why an allowlist

Hosting can be pointed at `.` with an "ignore" array. One missing entry there
publishes `lib/ccavenue.js`, and the working key it reads, as a static file
anyone can fetch. The build names what ships instead, so a new server file is
private by default, and it refuses to finish if anything server-side reaches
`public/`. Never set `hosting.public` to `.`.

## What changed from Vercel, and what did not

Nothing in `api/` or `lib/`. `api/index.js` is a plain Node handler with no
Vercel SDK, so it drops into `onRequest` unmodified.

Two routing differences are handled in `functions/index.js`:

  - Vercel rewrote `/api/<x>` to `?__route=<x>`. Hosting cannot add a query
    parameter, but the router already falls back to reading the pathname, so
    all 34 routes resolve on their own.
  - `/products/<handle>` did need injected parameters. The wrapper sets them.

The daily 03:00 caregiver email worker moves from `vercel.json` crons to
Cloud Scheduler via `onSchedule`, same time, Asia/Kolkata.

Functions run in `asia-south1` (Mumbai), beside the Firestore database, so
reads between them do not cross a region.

## After the first deploy

Point these at the Firebase URL, or they will keep talking to Vercel:

  - CCAvenue redirect and cancel URLs in the CCAvenue dashboard
  - the Shopify webhook endpoint
  - PUBLIC_SITE_URL / SITE_URL
  - your domain's DNS, when you are ready to cut over

## Cost

Blaze bills usage with no cap. Set a budget alert in Google Cloud Billing
before the first deploy. On this site's measured payload, hosting is roughly
$0 up to 200k page views a month, and about $5 at 800k.
