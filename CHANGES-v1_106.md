# Changes in v1_106 (from v1_105)

## The admin panel is in this repository

`admin.html` used to live in the `PFA_UI_Content` half, and `ADMIN-SECURITY.md`
recorded that nobody could confirm what was actually deployed at `/admin.html`.
It is now here, built to the contracts the test suite in this repo already
held for it, and wired to the nine `/api/admin/*` routes that were already
written.

- **Sign-in** mints a Firebase ID token from Google's Identity Toolkit REST
  endpoint. No third-party script loads before someone is admitted, which is
  what the old panel's "the Firebase sign-in library could not be loaded" bug
  came from. The refresh token is held in `sessionStorage`, so a reload keeps
  your place and closing the tab ends the session.
- **What the site collects is what the panel shows.** A form posts to
  `/api/pfa-submissions`, which allocates the reference and writes to the
  `submissions` collection; the panel reads that same collection through
  `/api/admin/records?type=submissions`, newest first, with kind and status
  filters and cursor paging.
- **A case is worked in a drawer, not in its row**: the fields as submitted,
  photographs fetched through `/api/admin/attachment` (they are private, and
  that route is the only way out), the conversation, and the four actions —
  reply by email, internal note, assign from `/api/admin/staff`, move status.
- **Registers**: volunteers and donations as views over submissions and
  payments, colony cards, payments with CSV export, store orders with the
  veg/all/off switch, bulk card issuance, card verification, People.
- **Card faces are drawn by the public site's own renderer**
  (`assets/caregiver-card.js`), so a card printed from the panel is stroke for
  stroke the card its holder sees. Photographs are matched from the office's
  own folder in the browser and are never uploaded.
- **The rail mirrors the server.** It hides what an account does not carry, and
  the API refuses it as well — a hidden link is not a locked door. Volunteers
  and Donations each need two permissions, because they read the submissions
  and payments collections and the server guards those by their own module.

The panel carries no public header, announcement bar or footer, so it is named
as an exception in `scripts/sync-chrome.js` and the three chrome tests, the way
`submission-collage.html` already was.

## The two shared secrets are retired

`PFA_ADMIN_TOKEN` and `PFA_ADMIN_API_KEY` each opened **every** admin route
with no named identity and no per-module limit. `ADMIN-SECURITY.md` called this
the serious gap, and it was: nothing done with either string could be
attributed to a person.

- `lib/admin-auth.js` no longer reads either. `identify()` returns a caller
  only for a verified Firebase identity.
- `PFA_ADMIN_TOKEN` still exists for the caregiver email worker and the
  shipment webhook, which are machine triggers with their own narrow handlers.
  **Holding it no longer opens the panel or any `/api/admin/*` route.**
- `PFA_ADMIN_API_KEY` has no remaining consumer. Remove it from the Vercel
  environment.
- `requireAdmin` now resolves identity through the exports object, so a test
  can replace that one step. Two tests used to reach for a shared secret purely
  to get past the guard, which is exactly the thing being retired.
- `test/admin-hardening.test.js` had a test asserting the gap was open, with a
  note to delete it the day they went. It is now inverted: it fails if either
  string reappears in the guard.

## An append-only audit log

Individual routes recorded fragments — `handledBy` on a status change, the
conversation on a case — but there was no single place that answered "what did
this person do last Tuesday".

- `lib/admin-audit.js` writes one entry per change: replies, notes,
  assignments, status moves, card batches, Store state changes, access changes.
- Entries are written with `create()`, never `set()` or `update()`, so one
  cannot be quietly rewritten. Nothing in the file deletes.
- The actor comes from the verified token, never the request body.
- A failed log write is logged to the function console and swallowed. Refusing
  to assign a case because the log was briefly unreachable would be worse than
  a gap in the log.
- Read it at **Audit log** in the panel or `GET /api/admin/records?type=audit`.
  Both are super-admin only, because the log names people and what they did.
- `test/admin-audit.test.js` pins all of the above.

## Making it work against the real routes

Reading `PFA_Logic_Backend_v1_63.zip` confirmed the panel half is not in it -
that zip is the *logic* half of the older v1_63 split, and everything unique to
it is either the pre-rename `caretaker` spelling or the membership, patron and
circle code that `no-membership.test.js` requires to stay deleted. **Nothing was
copied from it.** What it was useful for was checking the route contracts, which
turned up several places where the panel and the API did not agree:

- **`offscreen` was not exported** by `assets/caregiver-card.js`, so the bulk
  PDF would have thrown on the first click. It is exported now; nothing else
  about the renderer changed.
- **A preview drew no photograph and no signature.** `draw()` neither completes
  the fields nor loads the images - `hydrate()` does both, which is why the
  public download calls it first. The panel now hydrates before it draws.
- **The register and the card use different names.** The register returns
  `issuedAt` and keeps the PIN apart from the street; the card reads `issuedOn`
  and takes the address as lines. Left alone this prints a ghost date and a
  ghost address rather than failing, which is the failure mode
  `card-fields.js` exists to make visible. `cardData()` translates.
- **Donations were filtered with a parameter the server never reads.** The
  filter is called `purpose`, not `type_filter`.
- **The payment outcome filter offered raw Firestore values** rather than the
  names `PAYMENT_STATUSES` translates: `paid`, `failed`, `unverified`,
  `abandoned`, `started`.
- **The colony register showed an email column** the route deliberately never
  returns, because that projection carries no contact details.
- **Verify a card rendered a `message` field** that only exists on the error
  responses. It now reads `found`, `status`, `issuedOn` and `validUntil`.
- **People showed raw module keys** (`submissions, payments`) instead of the
  labels the API sends beside them, ignored the presets, and had no way to
  re-send a password link although `people.js` has always supported `reset`.
- **The rail had a dead branch** showing "Shared credential" for a mode that
  can no longer occur. It now names the pre-roles legacy state instead.
- **The Rescue desk preset still handed out `circle`,** a module removed with
  the rest of that feature. `normaliseModules` silently dropped it, so the
  preset quietly under-delivered.
- **`adminAudit` is now named in `firestore.rules`** - readable by a super
  admin, never writable from a browser - rather than relying on the catch-all
  deny at the bottom of the file.

`test/admin-panel-wiring.test.js` pins all of it by reading `admin.html` as text
and checking both ends of each contract: every route it calls is mounted, every
query parameter is one the server reads, every action is one the route branches
on, every renderer helper is one the renderer exports, and every rail section
maps to a real module.

## The bug that was actually stopping sign-in

`require('firebase-admin').auth()` relies on the package's legacy namespace
surviving its exports map. Under Node 22 and later it does not resolve to a
callable and throws `admin.auth is not a function`. Five files did this, and one
of them was inside `identify()` - the function that decides whether a sign-in is
valid. The throw landed in the catch that treats a failure as a bad credential,
so **every sign-in failed and the panel reported that the account was not an
administrator**, which no amount of granting claims would ever fix.

`lib/firebase.js` was never affected because it has always used the subpaths
(`firebase-admin/app`, `firebase-admin/firestore`), which is why Firestore
worked while auth did not. All five callers now use
`require('firebase-admin/auth').getAuth()`, and a test in
`test/admin-audit.test.js` fails if the root export comes back.

`package.json` declares `"node": ">=20"`, and Vercel now defaults to 22, so this
was live.

## One command

`scripts/ship.sh` does the whole update: backs up the current tree, replaces it
while keeping `.git` and `node_modules`, installs, grants the admin claim,
**confirms sign-in will work, and only then** commits, pushes and deploys the
rules.

    bash scripts/ship.sh you@peopleforanimalsindia.org

The order is deliberate. This release retires the shared admin secrets, so once
it is live the only way into the panel is an account carrying the claim. Pushing
before confirming that claim exists locks everyone out with no way back in over
the web, so seven checks stop the run before anything is pushed.

## Smaller

- `robots.txt` added: `Disallow: /admin.html`, `Disallow: /api/`, and the
  sitemap line `site-integrity.test.js` was already asking for.
- Session revocation was already correct and is now documented:
  `people.js` calls `revokeRefreshTokens` on removal, and the guard verifies
  tokens with the revocation check on, so "remove access" means now.
- `ADMIN-SECURITY.md`, `ARCHITECTURE.md`, `BACKEND-SETUP.md` and `HANDBOOK.md`
  updated to describe what is now true.
- `.gitignore` now ignores Firebase service account keys
  (`*firebase-adminsdk*.json`, `serviceAccount*.json`, `*.pem`, `*.p12`). It
  already covered `.env*`. A service account key is a full-access credential to
  the whole project, it arrives from the console as a `.json` in Downloads, and
  setting up the first administrator requires holding one - so it was a stray
  `cp` away from `git add .`.
- `npm run check:admin` diagnoses a refused sign-in from a machine holding the
  service account. The panel refuses every failure with one sentence on purpose
  (`admin-hardening.test.js` asserts it leaks nothing), so it cannot itself say
  whether the account is unknown, unclaimed or unverifiable. This can, and it
  names the two traps that look identical from outside: the service account
  variables missing, and `vercel env pull` writing the literal text
  `[SENSITIVE]` where a Vercel Secret should be.

## Still open

1. **Multi-factor for admin accounts.** Firebase supports it; nothing insists
   on it. With the shared secrets gone this is the most likely way in.
2. **Restrict where the panel can be reached from** — IP allowlist or Vercel
   deployment protection.
3. **Alerting.** The log records a 3am super-admin grant; nobody is told.
4. **Retention and export for the log.**

## Two stale tests, left failing deliberately

- `admin-cards.test.js` requires `admin.html` to load
  `assets/patron-card-pdf.js`, but `no-membership.test.js` lists that exact
  file as one that must not exist. The patron register was removed on purpose.
  Reintroducing it to turn the assertion green would undo that decision.
- `site-integrity.test.js` asserts the word "caregiver" appears zero times in
  the public pages, with a message saying they should say "Colony caregiver".
  The two cannot both hold. `scripts/rename-section.js` looks to have been run
  twice — the same test expects the renderer to contain
  `var ROLE = 'Colony Colony caregiver'`. It fails on the public pages before
  it ever reaches `admin.html`.

The suite is **411 passing, up from 385**, with no test that passed before now
failing.
