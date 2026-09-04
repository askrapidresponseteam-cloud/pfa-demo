---
name: pfa-website
description: Working rules for the People for Animals (PFA) website repo — a static site plus ONE Vercel serverless function on the Hobby plan, with CCAvenue payments, Firestore, and a Shopify (Paws & Tails) store integration. Use whenever editing, deploying, or debugging this repository.
---

# PFA website — rules for assistants

Read `HANDBOOK.md` (operations) and `ARCHITECTURE.md` (design + security) at the repo root first. The non-negotiables:

## Architecture constraints
- **Vercel Hobby: max 12 functions, crons at most daily.** The whole API is
  ONE function, `api/index.js`. Never add files under `api/` — add handlers in
  `lib/routes/` and register them in the `LOADERS` table in `api/index.js`.
- `vercel.json` rewrites `/api/:path*` → `/api/index?__route=:path*`. Do not
  rely on `api/[...slug].js` catch-alls; they were not picked up on this project.
- Handlers are plain `module.exports = async (request, response)`; they must
  not rely on Next.js-style `config` exports.
- Import depth from `lib/routes/`: `lib/routes/x.js` → `require('../../lib/y')`;
  `lib/routes/a/x.js` → `require('../../../lib/y')`; `lib/routes/a/b/x.js` →
  `require('../../../../lib/y')`. Run `npm test` — import errors surface immediately.

## Before claiming anything works
1. `npm test` → must print `pass 647` (or more) and `fail 0`; `npm run lint` must print nothing.
2. After deploy: `curl -s https://pfa-full-website.vercel.app/api/payment/health`
   must return JSON. Vercel's HTML "page could not be found" means routing is broken.
3. `curl -s …/api/does-not-exist` must return `{"code":"NOT_FOUND",…}` (our JSON).

## Deliverables to the maintainer
- Ship changes as a **complete repo zip**, not as scripts that move files.
  A migration script was run twice on 22 Aug and broke every import.
- The maintainer swaps folders; `.git` may not survive. Recovery is in HANDBOOK §4.
- Deploys happen by `git push origin main` (Vercel Git integration). Never instruct
  `npx vercel --prod`; it deploys the local disk, which has shipped broken folders.
- Commands the maintainer runs use `npx` for firebase-tools (no globals).

## Secrets
- Never paste tokens into code, docs, commit messages, or chat. All secrets are
  Vercel env vars (`npx vercel env ls`). `.env.example` lists names only.
- Shopify webhook receiver refuses everything unless `PFA_SHOPIFY_WEBHOOK_SECRET`
  is set — this is intentional. Do not add a bypass.

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
- `help.html` and the footer put the vet first; keep it that way.
- **PFA offers no services.** No page may take a request for an appointment, vaccination,
  sterilisation, transport or consultation. `test/no-services.test.js` enforces it.

## Emergency help page
- `help.html` is generated in part: the unit list between `<!--PFA_UNITS_START/END-->`
  comes from `assets/data.js` via `npm run build:help` (also run by `build:search`).
  Edit the page around the markers, never inside them. It must keep working with no
  script: no `data.js`, no search index, a real `<form method="post">`.
- Every page's header carries `<a class="header-help" href="help.html">` and the
  mobile menu opens with `a.mobile-help`; `test/help-in-header.test.js` enforces both.

## Product pages
- `/products/<handle>` is server-rendered by `lib/routes/product-page.js` from the
  `product.html` template (markers `<!--PFA_HEAD_START/END-->`, `<!--PFA_DATA-->`).
  Keep those markers; keep `includeFiles: product.html` in `vercel.json`.
- Links to products anywhere on the site must be `/products/<handle>` — never the
  seller's domain, never `products/<handle>.html`.

## Payments
- CCAvenue handles donate / give-send / membership only (`lib/routes/payment/*`).
  Store payments are Shopify's. Never route store money through CCAvenue
  (`lib/payment.js` rejects it; there is a test).
