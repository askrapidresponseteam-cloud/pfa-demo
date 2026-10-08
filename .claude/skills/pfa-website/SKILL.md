---
name: pfa-website
description: Working rules for the People for Animals (PFA) website repo - a static site plus ONE Vercel serverless function on the Hobby plan, with CCAvenue payments, Firestore, and a Shopify (Paws & Tails) store integration. Use whenever editing, deploying, or debugging this repository.
---

# PFA website - rules for assistants

Read `HANDBOOK.md` (operations) and `ARCHITECTURE.md` (design + security) at the repo root first. The non-negotiables:

## Architecture constraints
- **Vercel Hobby: max 12 functions, crons at most daily.** The whole API is
  ONE function, `api/index.js`. Never add files under `api/` - add handlers in
  `lib/routes/` and register them in the `LOADERS` table in `api/index.js`.
- `vercel.json` rewrites `/api/:path*` → `/api/index?__route=:path*`. Do not
  rely on `api/[...slug].js` catch-alls; they were not picked up on this project.
- Handlers are plain `module.exports = async (request, response)`; they must
  not rely on Next.js-style `config` exports.
- Import depth from `lib/routes/`: `lib/routes/x.js` → `require('../../lib/y')`;
  `lib/routes/a/x.js` → `require('../../../lib/y')`; `lib/routes/a/b/x.js` →
  `require('../../../../lib/y')`. Run `npm test` - import errors surface immediately.

## Before claiming anything works
1. `npm test` → must print `pass 647` (or more) and `fail 0`; `npm run lint` must print nothing.
2. After deploy: `curl -s https://pfa-full-website.vercel.app/api/payment/health`
   must return JSON. Vercel's HTML "page could not be found" means routing is broken.
3. `curl -s …/api/does-not-exist` must return `{"code":"NOT_FOUND",…}` (our JSON).

## Deliverables to the maintainer
- Ship changes as a **complete repo zip**, not as scripts that move files.
  A migration script was run twice on 22 Aug and broke every import.
- The maintainer swaps folders; `.git` may not survive. Recovery is in HANDBOOK §4.
- Deploys happen by `git push origin main` (Vercel Git integration). Never force-push: scripts/ship.sh fetches first and places the release on top of GitHub's tip (8 Oct 2026, after a force push replaced GitHub's history and the next ship was refused). test/ship-script.test.js runs that step against real git repositories. Never instruct
  `npx vercel --prod`; it deploys the local disk, which has shipped broken folders.
- Commands the maintainer runs use `npx` for firebase-tools (no globals).

## Secrets
- Never paste tokens into code, docs, commit messages, or chat. All secrets are
  Vercel env vars (`npx vercel env ls`). `.env.example` lists names only.
- Shopify webhook receiver refuses everything unless `PFA_SHOPIFY_WEBHOOK_SECRET`
  is set - this is intentional. Do not add a bypass.

## Store integration summary
- Products: `lib/routes/paws-catalog.js` (public Shopify JSON; Admin API if
  `PFA_SHOPIFY_ADMIN_TOKEN` set).
- Brands: `lib/store-brands.js`, from the seller's brand collections (Shopify's
  `vendor` is the store name on every product). Offers are compare-at prices
  above the price, nothing else. The shop hides both when there are none.
- Checkout: `lib/routes/pfa-orders.js` creates a Shopify cart with attribute
  `PFA checkout reference: <token>`; shopper pays on Shopify.
- Orders: `lib/routes/webhooks/shopify.js` → `lib/store-orders.js` → Firestore
  `storeOrders`. Status machine and matching rules are documented in the file header.
- Status: `lib/routes/pfa-order-status.js` (`?token=` for the store page,
  `?id=PFA-ST-<n>` for tracking). Returns no PII.
- Frontend contract for `store.html` polling: `{pfaOrderId, status ∈ CONFIRMED|FULFILLED|REFUND_RECORDED}` means paid. Do not change these names.

## What PFA is, and is not
- PFA has **no hospitals, ambulances, rescue teams, shelters or units** (PFA, 23 Aug 2026).
  The 96 entries in `data.js` are *local contacts*: a named person and a number. Public copy
  must never describe them, or PFA, as more than that. Write "PFA contact", not "unit".
- No "largest", "oldest", "5 lakh members" or any figure without a source in the repo.
- **PFA offers no services.** No page may take a request for an appointment, vaccination,
  sterilisation, transport or consultation. `test/no-services.test.js` enforces it.

## Emergency help, and site search
- There is no help.html any more (retired; its script is in `_retired-assets/help.js`), and no
  `assets/data.js` or `build:help`. The units are data inside `units.html` (`var UNITS`), with
  their contacts beside them; `scripts/build-search-index.js` reads both. Someone with an animal
  in trouble is sent to the nearest unit to call (ask.html says so) and to the Academy's first aid.
- `pfa-search.js` (owner, 8 Oct 2026: "ensure the PFA search is truly supreme"):
  - Curated rows may carry `q`, the searches they are the answer to (best bets); crawled rows get
    theirs by address in `BEST_BETS`. Add a phrase there before touching the ranking maths.
  - `SYNONYMS` values may name several words; Hindi and Hinglish in Roman letters live there.
    A word in SYNONYMS or PLACES is never "corrected".
  - `PLACES` is towns with no unit of their own; a place question there gets the nearest units
    with "About N km from X". If a unit opens in one of them, remove the town (a test says so).
  - Never describe PFA as running hospitals, ambulances, rescue teams or clinics in a row's title
    or description; test/search-supreme.test.js fails if one does.
  - test/search-supreme.test.js is the list of what people type and what must come first. When a
    change breaks one, the change is wrong unless the owner says the answer has changed.
  - After editing a page, `npm run build:search` rebuilds search-index.json, its .js twin and the
    sitemap. Rows never come from inside a form, a hidden block, or an err/empty/done block.

## Product pages
- `/products/<handle>` is server-rendered by `lib/routes/product-page.js` from the
  `product.html` template (markers `<!--PFA_HEAD_START/END-->`, `<!--PFA_DATA-->`).
  Keep those markers; keep `includeFiles: product.html` in `vercel.json`.
- Links to products anywhere on the site must be `/products/<handle>` - never the
  seller's domain, never `products/<handle>.html`.

## Payments
- CCAvenue (PFA's own account) takes every payment whose money is PFA's:
  donate / membership / caregiver application (`lib/routes/payment/*`) and
  the PFA shop (`lib/routes/shop/*`). The shop's money is PFA-owned (owner,
  3 Oct 2026), so shop payments go through CCAvenue, priced only by
  `lib/shop.js`, with orders recorded in the pfa-oldsite backend.
- A gift (donate.html, "Give as a gift"; owner, 8 Oct 2026) is a donation with `gift=yes` and the recipient's details, through the same `/api/payment/create` and CCAvenue path. Rs 1,000 minimum and rupees only, held in lib/payment.js (GIFT_MIN_INR) and on the page. The recipient's name and address never go to CCAvenue. The record is PFA-DON with the gift fields after the amount, so gandhim's copy leads with the certificate to post.
- Money that belongs to someone else never goes through PFA's CCAvenue. That
  was the old Paws & Tails store (the seller's own checkout). `lib/payment.js`
  still refuses a store purchase on `/api/payment/create` (there is a test);
  the PFA shop has its own routes and does not use that path.

## How the site speaks about animals (owner, 5 Oct 2026)
Animals are sentient beings whose safety, welfare and humane treatment stay central. Facts stay facts; framing is from the animal-welfare side. `test/animal-language.test.js` blocks the worst phrasing.
1. No anti-animal framing: never describe animals as nuisances, threats, disposable populations or problems to be eliminated.
2. Do not raise extreme measures where they are not the subject. Blanket culling is prohibited and is not presented or suggested as an option.
3. Describe the situation, not blame the animal. Where an animal is in a sensitive location, state the circumstances and the lawful, humane outcome.
4. Use humane terms: rescue, rehabilitation, relocation only where legally appropriate, responsible management, veterinary care, sterilisation, vaccination, safe placement. Not removal or disposal.
5. Never imply an animal's life or welfare is secondary; public safety is addressed without diminishing it.
6. Where return is not appropriate, say what humane outcome the animal gets (safe placement, care), not that it is prevented from returning.
7. Policy and law are stated accurately and proportionately, never as provocative news. They live on achievements.html and laws.html, not in the newsroom.
8. No "humans versus animals" narrative: people's safety and animal welfare are matters for responsible, humane resolution together.
9. When two wordings mean the same in law, use the one that is more respectful of the animal. Say "community dogs", not "stray dogs", except when quoting a statute.

## Videos and reels play on the PFA site, never on Instagram (owner, 7 Oct 2026)

An implementation requirement, not a design suggestion. It was missed twice on the CineKind reels; do not miss it again.

1. Every film or reel on the site plays inside the PFA site. Pressing Play never redirects to Instagram, YouTube or any external page, and never opens a new tab.
2. Reels use the founder page's pattern (founder.html, "8 films, in her own words"): a tile with its source, its title and a Play button, the still full-bleed and graded grey at rest, and the reel box (.rbox) that opens over the page with Close and Escape. Reuse that pattern; do not invent a second one.
3. A tile is a button, never a link to the platform.
4. Instagram's embed (instagram.com/reel/<id>/embed/) is only acceptable when the reel actually plays inside it. It does for the founder reels (pfa.official, original audio). A reel with licensed music answers "Watch on Instagram" and leaves the site, so such a reel must play from a copy on this site (`<video>` in the reel box). The CineKind reels work this way: media/cinekind-2026/reels/<id>.mp4 and <id>.jpg, fetched by `npm run media:reels` (scripts/fetch-reel-stills.js). A tile whose video is not on the site is removed rather than offered.
5. Stills are served from this site, never hot-linked from a platform CDN. Instagram covers carry a baked-in dark play disc; clean it before using the still as a tile background.
6. YouTube films play in the site's theatre (assets/theatre.js), as on the wall, founder, academy and CineKind pages.
7. test/cinekind-reels.test.js fails the build if a CineKind reel tile becomes a link, uses the Instagram embed, or plays anything other than a local file.

## Every submission reaches gandhim's inbox and the admin panel (owner, 7 Oct 2026)

The owner's words: "need the submissions to work perfectly. it should go to gandhim email id. records to be kept in the admin panel." A standing requirement for every form, new or changed:

- Every form that sends something to PFA files a record in `submissions` (through `/api/pfa-submissions`, or `lib/routes/payment/response.js` for a paid application) with a `receivedAtMs` field. The admin list orders by it, and Firestore leaves out of an ordered query any document without the field, so a record without it is on file but never in the panel.
- Every record is copied to gandhim@exmpls.sansad.in through `lib/submission-forward.js`: Reply-To the sender, every field under the form's own wording (`LABELS` there), photographs and documents attached to the email. That mailbox cannot be integrated or logged into anything; it only receives.
- A new form kind needs a row in `FORMS` in `test/submissions-end-to-end.test.js` (built from what the real page sends); that test fails for any page sending a kind it does not drive.
- Mail leaves the site through PFA's own GoDaddy mailbox, info@peopleforanimalsindia.org, by SMTP (`PFA_SMTP_USER`, `PFA_SMTP_PASS` in Vercel; owner, 7 Oct 2026). Resend (`PFA_MAIL_API_KEY`) is only the fallback when no mailbox is set. The panel's Overview, "Copies to PFA's inbox", shows it, sends a test, and resends copies that were refused.
- Replies come back through the same mailbox (v1.399): the copy to gandhim names info@ as a second Reply-To after the sender, `lib/inbound-mail.js` reads info@ over IMAP (Cloud Scheduler every 10 minutes on Firebase, the daily cron or the panel's "Read the mailbox now" on Vercel) and files each reply on the submission it answers, found from In-Reply-To/References plus the record's `threadId` (`lib/mail-thread.js`). Never match a conversation on a name, address or subject alone. Every email about a submission carries a deterministic Message-ID from `threadHeaders()`; keep that when adding a template.
- Everything sent through the mailbox is also saved in info@'s Sent folder (owner, 8 Oct 2026: "have copies in info@'s Sent folder. fool proof way"), by `lib/sent-copy.js`: kept in Firestore `sentCopies` the moment SMTP accepts it, put into Sent over IMAP at once (Vercel `waitUntil` keeps the function alive), and retried by every reading of replies until it is in; never twice (searched by Message-ID first). It never holds up or fails a send. Do not move the `SENT.keep()` call inside anything that could make a failed copy look like a failed send: that would send the email twice. `PFA_SENT_COPY=off` turns it off; tests run with it off except test/sent-copy.test.js.
- Reading and the Sent copies open the mailbox through `lib/imap-open.js` only: GoDaddy's imap.secureserver.net first, imap.titan.email second, the next tried after a refused login, every server's answer kept for the panel (8 Oct 2026: Titan-first gave "Mailbox could not be read: Command failed"). `npm run check:mailbox` checks reading and sending from a Mac with the real password, at a hidden prompt. Vercel's cron calls with GET (vercel-cron/1.0); `lib/routes/inbound-mail.js` reads on a scheduled GET from it and only reports status on the panel's GET (test/inbound-mail-cron.test.js). Hobby allows one cron run a day; Firebase reads every ten minutes.
- On Firebase, `functions/index.js` carries the two settings that are not secrets (PFA_SMTP_USER, PUBLIC_SITE_URL); the password is the PFA_SMTP_PASS secret. Do not move them back into functions/.env only: a fresh unzip has no such file, and on 8 Oct 2026 that switched email off.
