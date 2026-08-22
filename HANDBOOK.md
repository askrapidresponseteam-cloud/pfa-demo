# PFA Website — Operations Handbook

_Current version: v1.46 (22 Aug 2026). Update this line with every release._

**Companion:** `ARCHITECTURE.md` — system design, money flows, data model, trust boundaries, security controls, known gaps, secrets inventory.

Read this first. It is the one document that explains how the site is built,
how it is deployed, what went wrong on 22 Aug 2026 and why, and exactly what
to do next. Everything else (`BACKEND-SETUP.md`, `PFA_STORE_SHOPIFY_SETUP.md`,
`VERCEL_CCAVENUE_SETUP.md`) is detail referenced from here.

---

## 1. The shape of the system

```
Browser (static HTML/JS in repo root)
   │
   ├── /products/<handle> ──► same function (product-page route)
   ├── /api/*  ──► api/index.js  (ONE Vercel function)
   │                 │  routes by path to lib/routes/<name>.js
   │                 ├── payment/*        CCAvenue  (donate, give/send, membership)
   │                 ├── caretaker/*      Caretaker Card programme
   │                 ├── member/*, member-status
   │                 ├── admin/*          admin.html backend
   │                 ├── paws-catalog     Shopify products → PFA catalogue
   │                 ├── product-page     /products/<handle> server-rendered pages
   │                 ├── pfa-orders       creates Shopify cart, returns checkout URL
   │                 ├── pfa-order-status order confirmation + tracking
   │                 └── webhooks/*       Shopify → PFA order events
   │
   ├── Firestore (via firebase-admin, server-side only)
   ├── CCAvenue  (PFA's own money: donations, membership)
   └── Shopify sg37v1-ta.myshopify.com (Paws & Tails' money: store)
```

**Money never touches PFA for store orders.** The shopper pays on a
Shopify-hosted page. PFA only learns about the order through webhooks.

### Why one function

Vercel Hobby allows 12 Serverless Functions per deployment. The site has 23
API handlers. Instead of upgrading, every handler moved from `api/` to
`lib/routes/` and one router (`api/index.js`) dispatches to them.
`vercel.json` rewrites `/api/:path*` → `/api/index?__route=:path*`. Public
URLs did not change; the frontend needed no edits.

Adding a route = one file in `lib/routes/` + one line in the `LOADERS` table
in `api/index.js`. The function count stays 1.

---

## 2. Lessons from the 22 Aug deployment (read before touching anything)

| What happened | Why | Rule going forward |
| --- | --- | --- |
| Deploy rejected: cron `*/10 * * * *` | Hobby allows at most once-per-day crons | Cron is now `0 3 * * *`. Trigger the email worker manually if needed (see §6). |
| Deploy rejected: 23 functions > 12 | Hobby limit | One function, see §1. Never create files directly under `api/` except `index.js`. |
| Tests passed locally, production API returned 404 | Vercel didn't recognise the `api/[...path].js` catch-all on this project | Use `api/index.js` + explicit `rewrites` in `vercel.json`. Rewrites are boring and always work. |
| Every import broke (`../../../lib/firebase` not found) | A migration script was run twice; it moved files a second level deeper | Patches are now shipped as full-tree zips, never as scripts that mutate the tree. |
| `.git` folder disappeared | Folder was replaced by unzipping over it | History lives on GitHub. Recover with `git init` → `git remote add` → `git fetch` → `git reset --soft origin/main` (see §4). |
| `.env.example` vanished from git | Vercel CLI appended `.env*` to `.gitignore` when it wrote `.env.local` | `.gitignore` ignores `.env` and `.env.*` but explicitly un-ignores `.env.example`. |
| Site search linked to `/products/<handle>.html`, which never existed; 404 page rendered unstyled | Products only lived in a quick-view modal with no URL; 404.html used relative asset paths | Every product has a real page at `/products/<handle>` (v1.38). All product links must use that path. 404.html uses absolute paths. |
| "Store partner payment is not connected in this build" at checkout | `window.PFA_COMMERCE.liveOrders` kill switch existed but nothing set it | `assets/commerce-config.js` sets it `true`. Set `false` only to pause the store. |
| Whole site 404 after a CLI deploy | `npx vercel --prod` uploaded a 5-file skeleton folder | Deploy only via `git push`; Instant Rollback to recover; then `vercel promote` the good build |
| Admin page looked "dead" — no feedback on sign-in | `site.css` has a global `.error{display:none}` for form validation; admin reused the class for its status line, so every message was invisible | `.admin-msg` forced visible, uses `.is-error`. Rule: never reuse `.error`/`.field` classes outside forms. |
| Admin sign-in button did nothing | Two causes: the site-wide `.error{display:none}` hid every status message, and the page depended on an ES module from `www.gstatic.com` | Messages forced visible (`.is-error`); sign-in moved to the Identity Toolkit REST API — no CDN module, no authorised-domain requirement (v1.46) |
| Vendor PDF contained a live Admin API token | Vendor sent credentials in documentation | Credentials go only in Vercel env vars. Ask vendor to rotate the token after go-live. |

**Golden rule:** after any deploy, run
`curl -s https://pfa-full-website.vercel.app/api/payment/health`.
JSON = the API is alive. Vercel's "page could not be found" = routing is broken,
regardless of what the dashboard says. The dashboard does not run the tests.

---


## 2b. Go-live: what depends on what

The public site and the admin portal are independent. You can open the site to
the public today; the admin can follow.

### Public site (ready now)
| Feature | Needs | State |
| --- | --- | --- |
| All content pages | nothing | live |
| Donate / Give / Membership payments | CCAvenue env vars | live (health `ok:true`) |
| Store browse, product pages, search | nothing | live |
| Store checkout → seller payment | `PFA_SHOPIFY_STOREFRONT_ACCESS_TOKEN` | live |
| Order confirmation + tracking | `PFA_SHOPIFY_ADMIN_TOKEN` (now) or webhook secret (later) | live |
| Forms (help desk, caretaker, etc.) | Firebase service account | live — writes go server-side |
| Member area sign-in (member.html) | `PFA_MAIL_API_KEY` (Resend) for sign-in codes, Firestore rules deployed | **check** — if mail isn't configured, members can't get codes |
| The Circle (circle.js) | Firestore rules deployed (client reads) | **run** `npx firebase-tools deploy --only firestore:rules,firestore:indexes` |

Firestore **collections are created automatically** on first write — there is
nothing to "set up". Rules and indexes are the only deploy step, and the API
routes work even before that because they use the admin SDK.

### Admin portal (`/admin.html`) — 4 steps, ~15 minutes
1. Firebase console → Authentication → Sign-in method → **Email/Password → Enable**.
2. Authentication → Users → **Add user** (your email + strong password).
3. Authentication → Settings → Authorized domains → add `pfa-full-website.vercel.app`
   (good practice; since v1.46 sign-in uses the REST API and does not require it).
4. Grant the admin claim from your Mac:
   ```bash
   cd ~/PFA_Full_Website
   npx vercel env pull .env.production.local --environment=production
   set -a; source .env.production.local; set +a
   node scripts/grant-admin.js you@peopleforanimalsindia.org
   rm .env.production.local
   ```
Then sign in at `/admin.html`. Remove the legacy `PFA_ADMIN_TOKEN` /
`PFA_ADMIN_API_KEY` env vars once Firebase login works.

### What the admin sees end to end (v1.45)
Overview counts (submissions, members, caretakers, card payments, **store
orders**, paid-awaiting-shipment) · Submissions queue with status actions ·
Members · Caretakers · Payments (CCAvenue) · **Store** register: every Paws &
Tails order with PFA order number, customer, items, total, status, courier
tracking link, and a direct link to the order in Shopify; search by
`PFA-ST-<n>` or Shopify order id · Verify a card · The Circle · Member import.

## 3. Deploying

**Working folder is `~/PFA_Full_Website`** (a git clone). Not the Desktop —
the Desktop copy was wiped twice on 22 Aug, most likely by iCloud Desktop sync.
Changes from Claude arrive as small `.patch` files: `patch -p1 < file.patch`,
then `npm test`, commit, push.

**Deploy by `git push` only.** The Vercel project is connected to GitHub and
builds `main` automatically. Do not run `npx vercel --prod` from the Desktop
folder: it uploads whatever is on disk, and twice on 22 Aug that was a
half-assembled folder, which put a 404 site into production.

```bash
cd ~/Desktop/PFA_Full_Website
npm test                          # MUST be all pass
git add -A && git commit -m "describe the change"
git push origin main              # Vercel builds and promotes this
# wait ~1 min, then:
curl -s https://pfa-full-website.vercel.app/api/payment/health
```

**If you ever use Instant Rollback**, Vercel pins production and stops
promoting new pushes until you clear it: dashboard → yellow banner →
*re-enable auto-assigning custom domains*, or from the terminal
`npx vercel promote <newest-deployment-url> --yes`.

**Replacing the folder from a zip** (only if you must): `rm -rf` the old folder
first, unzip the full zip, then `git init` + `git remote add` + `git fetch` +
`git reset --soft origin/main` (see §4). Never `unzip -o` a handful of files
into a folder that may not exist — that creates a skeleton.

### Old instructions (kept for reference)

```bash
cd ~/Desktop/PFA_Full_Website
npm install
npm test                          # MUST be: pass 116, fail 0
git add -A
git commit -m "describe the change"
git push origin main              # GitHub integration deploys automatically
# or force a CLI deploy:
npx vercel --prod --force
curl -s https://pfa-full-website.vercel.app/api/payment/health
```

`vercel` and `firebase` are not installed globally — always prefix with `npx`
(`npx vercel`, `npx firebase-tools`).

Project: `pfa-full-website` in team `karthik-dhanyas-projects-22a9a267`.
Alias: `https://pfa-full-website.vercel.app`. The other Vercel projects
(`pfa-demo`, `pfa-demo-p5t7`) are stale; ignore them.

---

## 4. If git gets lost again

```bash
cd ~/Desktop/PFA_Full_Website
git init -q
git remote add origin https://github.com/askrapidresponseteam-cloud/pfa-demo.git
git fetch -q origin
git reset -q --soft origin/main   # adopt GitHub history, keep local files
git branch -M main
git add -A && git commit -m "..." && git push origin main
```

---

## 5. Environment variables (Vercel → Settings → Environment Variables)

Check what's set: `npx vercel env ls`

| Variable | Used by | Status |
| --- | --- | --- |
| `CCAVENUE_MERCHANT_ID`, `CCAVENUE_ACCESS_CODE`, `CCAVENUE_WORKING_KEY`, `CCAVENUE_MODE` | donate / membership | set ✔ (health reports true) |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | everything | set ✔ |
| `PUBLIC_SITE_URL` | payment return URLs | should be the live domain |
| `PFA_SHOPIFY_STORE_DOMAIN` | store checkout, webhooks | `sg37v1-ta.myshopify.com` — **add** |
| `PFA_SHOPIFY_STOREFRONT_ACCESS_TOKEN` | store checkout (address prefilled) | Optional since v1.41: without it checkout falls back to a cart permalink. The seller's **public** storefront token is visible in pawsandtails24.com page source (`storefrontAccessToken`); using it is fine but tell the vendor. |
| `PFA_SHOPIFY_WEBHOOK_SECRET` | webhooks | **waiting on vendor** |
| `PFA_SHOPIFY_ADMIN_TOKEN` | order confirmation fallback (Admin `read_orders`) + catalogue stock levels | **set it** — the `shpat_…` value from the vendor PDF. Without it, PFA confirmation waits for the webhook. |
| `PFA_ADMIN_TOKEN` | email worker manual trigger | set if you want §6 |

After adding variables: `npx vercel --prod --force` (env changes need a redeploy).

---

## 6. Store integration — what to send Paws & Tails

Copy this into an email (also saved as `VENDOR-EMAIL.md`):

> **Subject: PFA Store integration — 4 items needed to go live**
>
> 1. **Storefront API access token.** Checkout uses Shopify's Storefront API,
>    which needs its own token — the `shpat_` Admin token cannot be used.
>    Shopify Admin → Sales channels → Headless → Storefront API → token with
>    `unauthenticated_write_checkouts`, `unauthenticated_read_product_listings`,
>    `unauthenticated_read_checkouts`.
> 2. **Publish all products to the Headless channel.**
> 3. **Register the six webhooks** (JSON, 2026-07) and send the **signing
>    secret** from Settings → Notifications → Webhooks:
>
>    | Topic | URL |
>    | --- | --- |
>    | orders/create | https://pfa-full-website.vercel.app/api/webhooks/order-created |
>    | orders/paid | https://pfa-full-website.vercel.app/api/webhooks/order-paid |
>    | orders/fulfilled | https://pfa-full-website.vercel.app/api/webhooks/order-fulfilled |
>    | fulfillments/update | https://pfa-full-website.vercel.app/api/webhooks/fulfillment-updated |
>    | orders/cancelled | https://pfa-full-website.vercel.app/api/webhooks/order-cancelled |
>    | refunds/create | https://pfa-full-website.vercel.app/api/webhooks/refund-created |
>
> 4. **Rotate the Admin token** after go-live; send secrets via a secure channel, not PDFs.

(Replace the domain with `peopleforanimalsindia.org` once DNS points there.)

When the secret arrives: add `PFA_SHOPIFY_WEBHOOK_SECRET` in Vercel, redeploy,
ask them to click "Send test notification" on `orders/create`, then:

```bash
npx vercel logs --prod        # look for the webhook line
curl -s "https://pfa-full-website.vercel.app/api/pfa-order-status?id=PFA-ST-<order number>"
```

### How an order flows

1. `store.html` → `POST /api/pfa-orders` → Shopify cart created with attribute
   `PFA checkout reference: <token>` → shopper sent to Shopify payment page.
2. `store.html` polls `GET /api/pfa-order-status?token=…` every 2 s.
3. Shopify fires `orders/create` → `lib/store-orders.js` stores it in Firestore
   `storeOrders/{shopifyOrderId}` and links the token → status `CONFIRMED`.
4. If no webhook record exists yet and `PFA_SHOPIFY_ADMIN_TOKEN` is set, the status endpoint asks Shopify's Admin API for recent orders with that reference and persists the match (v1.43).
5. Poll returns `verified:true`, `pfaOrderId: PFA-ST-<order number>` → confirmation screen.
6. Fulfilled / delivered / cancelled / refund webhooks update the same record;
   `track-order.html` reads it via `?id=PFA-ST-…`.

Status values: `AWAITING_PAYMENT → CONFIRMED → FULFILLED`, terminal
`CANCELLED` / `REFUND_RECORDED`. A late-arriving create can never undo a
terminal state. Shopify retries are deduplicated by `X-Shopify-Webhook-Id`.

### Manual email-worker trigger (Hobby cron is daily)

```bash
curl -X POST -H "Authorization: Bearer $PFA_ADMIN_TOKEN" \
  https://pfa-full-website.vercel.app/api/caretaker/email-worker
```

---

## 6b. Product pages (`/products/<handle>`)

Each Paws & Tails product has a real page on PFA's domain. Nothing links to
the seller's site.

- `vercel.json` rewrites `/products/:handle` → `api/index?__route=product-page&handle=…`
- `lib/routes/product-page.js` loads the catalogue (cached 10 min), finds the
  product, and injects into `product.html`: title/description, Open Graph
  image + price (WhatsApp previews), JSON-LD (Google), the product JSON, and
  up to 8 related products. Cached 10 min at the edge.
- `assets/product.js` renders gallery, variants, stock, quantity, Add to bag /
  Buy now (same bag as the store), prescription notice, the "product label"
  panel, description, share, related.
- `store.html` accepts `?bag=1`, `?checkout=1`, `?category=<id>` so the product
  page can hand back to the store.
- `product.html` is a template: keep `<!--PFA_HEAD_START-->…<!--PFA_HEAD_END-->`
  and `<!--PFA_DATA-->`. It also works statically as `product.html?p=<handle>`.
- `functions.api/index.js.includeFiles = product.html` in `vercel.json` ships the
  template with the function. Remove it and every product page 500s.

Check after deploy:
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://pfa-full-website.vercel.app/products/iron-cage   # 200
curl -s https://pfa-full-website.vercel.app/products/iron-cage | grep -o '<title>[^<]*'        # IRON CAGE | PFA Store
```

## 7. Firestore

Deploy rules after any change to `firestore.rules`:

```bash
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules
```

New collections added 22 Aug: `storeOrders` (admin-readable),
`storeWebhookEvents` (server only). `storeCheckoutIntents` already existed.

---

## 8. Troubleshooting quick table

| Symptom | Check |
| --- | --- |
| API returns Vercel's HTML 404 | `vercel.json` rewrites present? `api/index.js` present? |
| `{"code":"NOT_FOUND","message":"Unknown API route."}` | Route missing from `LOADERS` in `api/index.js` |
| `WEBHOOK_NOT_CONFIGURED` | `PFA_SHOPIFY_WEBHOOK_SECRET` not set |
| `INVALID_SIGNATURE` on vendor test | Wrong secret, or vendor pointed a different shop at us |
| `SHOPIFY_STOREFRONT_NOT_CONFIGURED` on checkout | `PFA_SHOPIFY_STOREFRONT_ACCESS_TOKEN` missing |
| Checkout shows "Store partner payment is not connected" | `assets/commerce-config.js` has `liveOrders:false` or isn't loaded by `store.html` |
| Store page says "payment not verified" forever | Webhooks not registered, or order has no `PFA checkout reference` attribute — check `npx vercel logs --prod` |
| `Cannot find module '../../../lib/…'` | Import depth wrong; files under `lib/routes/<dir>/` need `../../` to reach `lib/` |
| Images look stale after a change | `vercel.json` caches `/media/*` for a day at the browser. Rename the file (or add `?v=2`) when you replace an image in place. |
| Home/store page slow to load | Check `curl -s -o /dev/null -w '%{size_download}' …/` — must stay under ~150 KB. Never embed base64 images or full catalogues in HTML (v1.42 lesson). |
| Deploy says "more than 12 functions" | Someone added a file under `api/` — move it to `lib/routes/` |
| `/products/<handle>` returns "template is missing" | `vercel.json` → `functions.api/index.js.includeFiles` must include `product.html` |

---

## 9. Files that matter

| File | Role |
| --- | --- |
| `api/index.js` | The single Vercel function; route table |
| `vercel.json` | Rewrite `/api/*` → router; daily cron |
| `lib/routes/**` | All handlers (formerly `api/**`) |
| `lib/store-orders.js` | Shopify order model, status machine, Firestore persistence |
| `lib/routes/webhooks/shopify.js` | HMAC-verified webhook receiver |
| `lib/routes/pfa-order-status.js` | Confirmation/tracking lookups |
| `lib/routes/location-lookup.js` | Reverse geocode for the checkout's "use my location" button |
| `lib/routes/paws-catalog.js` | Shopify → catalogue (public or Admin API) |
| `lib/routes/product-page.js` + `product.html` | Server-rendered `/products/<handle>` pages (rewrite in `vercel.json`; `includeFiles` ships the template with the function) |
| `assets/product.js` | Product page client: gallery, variants, bag (shares `pfa_shopify_cart_v1` with the store) |
| `assets/track-order.js` | Tracking page (reads API) |
| `test/shopify-webhooks.test.js` | Full order lifecycle tests |
| `firestore.rules` | Access rules incl. new store collections |
| `ARCHITECTURE.md` | Architecture and security reference |
| `.claude/skills/pfa-website/SKILL.md` | Instructions for AI assistants working on this repo |
