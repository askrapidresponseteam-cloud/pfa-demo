# PFA CCAvenue + Firebase on Vercel

## Payment scope

CCAvenue is connected only to:

1. `give.html` Donate for direct donations
2. `give.html` Give/Send for selected food and volunteer routing
3. `membership.html` for Patron membership

CCAvenue is not connected to `store.html`, cart, product checkout, Paws & Tails or Shopify. Store payment remains with the seller/vendor and is out of scope for this document entirely.

## Production flow

```text
PFA HTML -> /api/payment/create -> Firebase transaction -> encrypted CCAvenue request
CCAvenue -> /api/payment/response -> decrypt + verify -> idempotent Firebase update
```

The server creates the payment ID before encryption:

- Donate: `PFA-DON-XXXXXXXX`
- Give/Send: `PFA-SND-XXXXXXXX`
- Membership: `PFA-MEM-XXXXXXXX`

The callback looks up the stored transaction by `orderId` and uses the stored `type`, `amount` and `currency` as the source of truth. It does not trust a frontend type or callback merchant parameter to decide the payment flow.

Successful membership payments create or update a Firebase member with a separate permanent ID: `PFA-MBR-XXXXXXXX`.

## Step 0 - Find out what's actually live today, before changing anything

If PFA already has a working PHP CCAvenue integration (`ccavRequestHandler.php`, `ccavResponseHandler.php`, `Crypto.php`), there may be more than one copy of the response handler lying around (for example `ccavResponseHandler.php`, `ccavResponseHandler_new.php`, `ccavResponseHandler_24_11_2022.php`). The filenames alone don't tell you which one is real.

1. Log into the CCAvenue merchant dashboard and find the currently configured **Return URL** / **Cancel URL**. Whichever file that URL points to on the live server is the one actually running today - not necessarily the newest-looking filename.
2. Open that specific file. If it does anything beyond decrypt-and-display the result (sends an email receipt, writes to another database, notifies a third system), write that down. `/api/payment/response` in this codebase decrypts, verifies, and updates Firebase - it does **not** replicate any custom side effects an old PHP handler might have had. Anything like that needs to be re-added deliberately, not assumed away.
3. Repeat this for the `usd/` folder if PFA has a USD-capable CCAvenue account: check whether it's a fully separate merchant sub-account (its own login/section in CCAvenue) or the same account with just a different Access Code and Working Key. This changes what you configure in Step 6.

## Step 1 - Pull the real credentials

From the `env` file (or the top of `ccavRequestHandler.php` if not there), get, for INR:

- Merchant ID
- Access Code
- Working Key

And the same three from the `usd/` folder's equivalent files, if PFA is offering USD.

Do not commit any of these to git or paste them anywhere except directly into Vercel's Environment Variables screen - this matches what `.gitignore` in this repo already enforces for the PHP kit itself.

## Step 2 - Firebase (skip if already created)

1. console.firebase.google.com → create a project. Hosting/Auth/Analytics not required, just the project.
2. Firestore Database → Create database → **Production mode**, not Test mode.
3. Set Firestore rules to deny all direct client access (`allow read, write: if false;`) - everything here reads/writes server-side through `firebase-admin`, so nothing should ever need direct client access.
4. Project Settings → Service Accounts → Generate new private key. This JSON file has `project_id`, `client_email`, and `private_key` - the three values below.

## Step 3 - Vercel environment variables

Add these in Project Settings → Environment Variables, then redeploy:

```text
CCAVENUE_MERCHANT_ID=<merchant id>
CCAVENUE_ACCESS_CODE=<existing access code>
CCAVENUE_WORKING_KEY=<existing working key>
CCAVENUE_MODE=production

FIREBASE_PROJECT_ID=<firebase project id>
FIREBASE_CLIENT_EMAIL=<firebase admin client email>
FIREBASE_PRIVATE_KEY=<firebase admin private key, with \n line breaks preserved exactly>

PUBLIC_SITE_URL=https://peopleforanimalsindia.org
```

Only if offering USD, add:

```text
CCAVENUE_USD_ACCESS_CODE=<usd access code>
CCAVENUE_USD_WORKING_KEY=<usd working key>
# Only set this if CCAvenue issued a genuinely separate Merchant ID for USD.
# Leave it unset if USD uses the same Merchant ID as INR with just a
# different Access Code/Working Key - the code falls back to
# CCAVENUE_MERCHANT_ID automatically.
CCAVENUE_USD_MERCHANT_ID=<usd merchant id, only if different from above>
```

You may use `FIREBASE_SERVICE_ACCOUNT_JSON` as one value instead of the three separate Firebase fields.

## Step 4 - Deploy

Connect the repo to Vercel (or `vercel --prod` from the CLI). `npm install` runs automatically as part of the Vercel build and pulls in `firebase-admin` - nothing to do locally for that.

## Step 5 - Point CCAvenue at the new endpoints

- INR: set the Return/Cancel URL in the CCAvenue dashboard to `https://peopleforanimalsindia.org/api/payment/response`
- USD, if a separate sub-account: set its Return/Cancel URL to the same base address. The code appends `?cur=usd` automatically on every USD transaction it starts, so CCAvenue receives the right URL per-request regardless of what's set as the account's static fallback.

Endpoints in this codebase:

- Create payment: `/api/payment/create`
- Verified callback: `/api/payment/response`
- Configuration check: `/api/payment/health`

## Membership pricing enforcement

The server decides the amount - a browser cannot alter it by editing the HTML:

- INR digital Patron membership: ₹365
- INR digital membership plus physical card: ₹514
- USD Patron membership: $10 (digital-only - no physical card internationally)

These are still placeholder figures for USD and the Give/Send USD catalog (`lib/payment.js`, `USD_MEMBERSHIP_PRICE` and `SEND_CATALOG`) - trivial one-line changes once PFA confirms real pricing.

## Test before DNS change

1. Deploy to Preview, set Preview environment variables, and set `PUBLIC_SITE_URL` to the Preview URL.
2. Open `/api/payment/health` and confirm `ok: true`, scope includes `donate`, `send`, `membership`, and `store: false`.
3. Complete one small real Donate payment, one Give/Send payment, and one digital Patron membership payment - in INR.
4. If USD is configured, repeat all three in USD.
5. Confirm each has a matching Firebase `transactions` document with the correct `currency` field, and CCAvenue's own dashboard shows the matching transaction.
6. Resubmit the same callback request (or ask CCAvenue support to trigger a duplicate notification) and confirm it does not create a second transaction or member - this is the idempotency guarantee, worth actually proving once rather than trusting the code.
7. Confirm successful membership creates one `members` document with a `PFA-MBR-XXXXXXXX` ID.
8. Confirm Store checkout still never references CCAvenue and continues working exactly as before.
9. Set the Production environment variables, change `PUBLIC_SITE_URL` back to `https://peopleforanimalsindia.org`, redeploy, and only then switch the domain.

## After launch

- Watch the Firestore `transactions`, `paymentEvents`, and `members` collections for the first real transactions.
- Vercel's function logs print `PFA CCAvenue payment result` on every callback and `PFA CCAvenue response error` on anything that failed verification - worth checking for the first few days.
- `/api/payment/health` is safe to poll periodically as an ongoing configuration check.
