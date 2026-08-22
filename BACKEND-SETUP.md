# Wiring the backend

Everything here runs on Vercel with `firebase-admin`. There is no separate
server to stand up and no Cloud Functions: the routes in `api/` are the
backend, and Firestore is the database.

Work through this in order. Each step ends with something you can check, so you
find out immediately if a value is wrong rather than three steps later.

---

## 0. A note on the plan

Blaze (pay-as-you-go) is more than this needs - Firestore and Authentication
both sit inside the free tier, and nothing here uses Cloud Functions. Blaze is
fine, but set a ceiling so a mistake cannot run up a bill: Google Cloud console
→ Billing → **Budgets & alerts** → create a budget with an alert at a small
amount. Firestore reads are the only thing that scales with traffic, and the
admin panel pages 25 records at a time precisely to keep that flat.

## 1. Firebase project

1. Firebase console → your project → **Project settings → Service accounts →
   Generate new private key**. That downloads a JSON file. Keep it out of git.
2. **Build → Firestore Database → Create database.** Production mode. Pick the
   region closest to your users (`asia-south1` for India).
3. **Build → Authentication → Get started → Email/Password → Enable.** This is
   how staff sign in to the admin panel and how member passwords are held.

## 2. Environment variables on Vercel

Project → Settings → Environment Variables. Set these for **Production** and
**Preview**.

| Variable | What it is |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | The whole JSON file from step 1, pasted as one line. Simpler than the three separate variables below. |
| `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` | Use these **instead** if you prefer. In `FIREBASE_PRIVATE_KEY` the newlines must be written `\n`. |
| `PFA_AUTH_PEPPER` | A long random string. It is mixed into the hash of member sign-in codes. Generate with `openssl rand -hex 32`. Changing it invalidates codes in flight, which is harmless. |
| `PFA_MAIL_API_KEY` | Resend API key. Without it no email is sent and sign-in codes never arrive. |
| `PFA_MAIL_FROM` | Defaults to `People for Animals <cards@peopleforanimalsindia.org>`. The domain must be verified in Resend or mail will be rejected. |
| `PUBLIC_SITE_URL` | e.g. `https://peopleforanimalsindia.org`. Used to build the card URLs that go into emails. Get this wrong and every card link points at the wrong host. |
| `CCAVENUE_*` | Payments. Already documented in the payment code; unchanged by this work. |
| `PFA_ADMIN_API_KEY`, `PFA_ADMIN_TOKEN` | The two older shared secrets. Keep them set for now - see step 5. |

Check it: deploy, then open `/api/payment/health`. It reports whether Firebase
and the payment keys are configured. It should say Firebase is fine.

## 3. Security rules

Rules are **not** deployed by Vercel. Push them separately.

`firebase.json` in this repository configures the CLI for Firestore only. It
has no `hosting` block on purpose: everything under `/api` is a Node function
and cannot run on Firebase Hosting, so deploying this directory there would
publish `admin.html` with every request behind it returning 404. If you have
opened `<project>.firebaseapp.com` and seen "Site Not Found", that is correct -
that address is the Firebase **auth domain**, used for sign-in, and is not
where this site lives. The site is at your Vercel domain, and the panel is at
`/admin.html` on it.


```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules --project <your-project-id>
```

`firestore.rules` starts from "the browser can read nothing" and opens only a
member's own record to that member. The API routes use the admin SDK and are
not affected by rules - which is why the site keeps working even though the
rules look restrictive.

Check it: in the Firebase console → Firestore → Rules, the playground should
deny a read of `members/PFA-MBR-XXXXXXXX` for an unauthenticated user.

## 4. Your first administrator

Admin access is a custom claim on a Firebase Auth user. There is no web route
that grants it - the first one has to come from someone holding the service
account, so there is never an unprotected endpoint that can mint an admin.

1. Firebase console → Authentication → Users → **Add user**. Give them an email
   and a password.
2. From a machine with the same `FIREBASE_*` variables exported:

```bash
node scripts/grant-admin.js you@peopleforanimalsindia.org
```

To remove access later: `node scripts/grant-admin.js someone@… --revoke`.

A claim is read from the sign-in token, so anyone already signed in must sign
out and back in before it takes effect.

## 5. The admin panel

`/admin.html`. Before it will work, fill in **`assets/firebase-config.js`** - one file, three values, read by the panel and later by the member area:

```js
window.PFA_FIREBASE_API_KEY = 'AIza…';
window.PFA_FIREBASE_AUTH_DOMAIN = '<project>.firebaseapp.com';
window.PFA_FIREBASE_PROJECT_ID = '<project>';
```

Get them from Firebase console → Project settings → General → **Your apps**. If
that section shows only an **Add app** button, no web app exists yet: click it,
choose the web icon (`</>`), give it any nickname, and skip the Hosting offer.
Registering a web app creates nothing billable - it just issues this config.

Note the **project ID is not the display name**. A project called
"PFA New Website" will have an ID like `pfa-new-website-4a1c7`. Use the ID.

That web API key is **not** a secret; it identifies the project to the SDK and
is meant to be in page source. What protects the data is the admin claim, the
security rules, and the server verifying the token on every request. The
service account key is the secret one, and it belongs only in Vercel.

If the file is still unfilled, the panel says so and disables the sign-in
button rather than failing somewhere inside the SDK.

The panel gives you:

- **Members** - the `members` collection: number, name, contact, dates, and
  whether the card is in date.
- **Caretakers** - the `caretakerPublic` collection, kept separate.
- **Verify a card** - the same check anyone can run, for when someone is on the
  phone holding a card.

Search takes a full card number, or a mobile number for members. It is a direct
document lookup, not a substring search - Firestore cannot do "contains"
without a search service, and that is not worth adding until the registers are
big enough to need it.

**About the two older secrets.** `PFA_ADMIN_API_KEY` and `PFA_ADMIN_TOKEN` are
single shared passwords with no named user and no audit trail. They still work,
because removing them in the same change that introduced the new login would
take the site down if one were missed. Once the panel is in use, delete both
variables and the routes will accept only real admin accounts.

## 6. Members signing in

Members sign in with their member number and a code emailed to them, then set a
password. The flow is `POST /api/member/auth/start` → `POST /api/member/auth/verify`.

Firebase never sends these emails; codes go out through Resend in PFA's own
name, so a member never sees Firebase branding. Passwords are held by Firebase
Auth and never written to Firestore - only a `hasPassword` flag is stored.

Check it end to end once deployed:

```bash
curl -X POST https://<your-site>/api/member/auth/start \
  -H 'Content-Type: application/json' \
  -d '{"memberId":"PFA-MBR-XXXXXXXX"}'
```

It always answers the same way whether or not the member exists - that is
deliberate, so the route cannot be used to discover which member numbers are
real. The proof it worked is the email arriving.

## What is not built yet

- **The member-facing Membership Area.** The authentication behind it is done
  and deployed by the steps above; the signed-in pages a member sees are not.
- **Card artwork on the public card URL.** `caretaker-card.html?id=…` exists;
  the equivalent for member cards is not wired.
- None of the Firebase code has been run against a live project. It is
  reviewed and syntax-checked, not tested. Expect the first deploy to surface
  something - start with `/api/payment/health` and the `curl` above.

---

## 8. What the portal shows, and one index you will need

| Tab | Reads | Notes |
|---|---|---|
| Overview | counts across everything | Uses Firestore `count()` aggregations, billed as a few reads rather than one per document |
| Submissions | `submissions` | All twelve form categories. Filter by category and status; mark **Taking it / Done / Spam** |
| Members | `members` | |
| Caretakers | `caretakerPublic` | |
| Payments | `transactions` | Membership and caretaker card payments through CCAvenue |
| Store | - | Links out to Shopify; see below |
| Verify a card | public API | |

**Store orders are not in Firestore.** Checkout runs through the Shopify
Storefront API (`sg37v1-ta.myshopify.com`), so the order, the customer and the
fulfilment status live in the Shopify admin. `storeCheckoutIntents` in Firestore
is only an idempotency lock that stops a double-submit becoming two orders - it
is not an order record. Showing store orders in this panel would mean mirroring
Shopify into Firestore with a webhook, which is a real piece of work and worth
doing only if you want one screen for everything. Until then the Store tab links
straight to Shopify.

**One composite index.** The submissions queue filters by category *and* status
while sorting by arrival time. Firestore needs an index for that. The first time
you use those filters together the API will fail and the Vercel log will contain
a long `https://console.firebase.google.com/…/indexes?create_composite=…` URL - open it and click Create. It takes a minute to build. Fields, if you prefer to
add it by hand under Firestore → Indexes → Composite:

- Collection `submissions`: `kind` (asc), `status` (asc), `receivedAtMs` (desc)

**Marking submissions records who did it.** `handledBy` is taken from the
administrator's own token, not from the browser, so the audit trail cannot be
forged by editing the request.
