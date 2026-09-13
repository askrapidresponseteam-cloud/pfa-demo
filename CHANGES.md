# Changes — most asked, search heading, donate and shop wiring

Two zips, unchanged folder names, drop-in replacements:

- `PFA_v1_37/` — the pages (search, donate, shop)
- `PFA_Logic_Backend/` — one new API route and its registration

---

## 1. "Most asked" is now real

**Was:** a hand-written list of eight titles in `pfa-search.js`, shown whether or
not anyone had ever asked for them.

**Now:** `/api/search-popular` counts which destination visitors actually open,
and the list is ranked by that.

**New file:** `lib/routes/search-popular.js`, registered in both tables in
`api/index.js`. No new file under `api/` — the Hobby 12-function cap holds.

Two decisions worth knowing about:

**No query text is stored, ever.** Only a destination path and a counter.
Free-text searches on this site carry names, phone numbers and case details;
there is no lawful reason for PFA to keep them and no product reason either,
since the destination is what "most asked" actually means. Rows like
`events.html?q=Bengaluru` are counted as `events.html`: the interest in events
is recorded, the city the visitor typed is not.

**The endpoint returns bare paths, never titles.** The browser resolves each
path against its own search index to get a title, and drops any path the index
does not have. So nothing written into the counter can put invented words on
the page; a flooded path is ignored at render time. Cross-origin POSTs are
refused, and the path allowlist rejects anything that is not a same-site
`.html` or `.html#fragment`.

Storage is Firestore (`searchPopular`, one doc per path). With Firebase
unconfigured it falls back to process memory, so previews still work. Below
eight recorded opens the curated list still shows — too thin a sample to call
anything "most asked".

**Tests:** `test/search-popular.test.js`, 7 passing.

## 2. It no longer shows everything

The idle search page rendered all eight entries grouped into six sections,
which read as a sitemap. It is now one short ranked list of six
(`popularListHtml`). The grouped layout still applies to real results, where
the section headings earn their space.

## 3. The heading is smaller

`.pfa-sr__q` is also the element that echoes the visitor's query back on a
results page, so the class itself was not shrunk. A new `is-prompt` modifier
applies only to "What would you like to do today?":

    clamp(34px, 6.4vw, 104px)  ->  clamp(24px, 3.1vw, 44px)

Set in `search.html` too, so it is small before JS runs, and removed when the
heading becomes a query echo.

## 4. Donate -> CCAvenue

Both flows now post to `/api/payment/create`. That endpoint answers with an
auto-submitting CCAvenue form, so these are real form navigations, not `fetch`.

**Fields added, because the server requires them and the page never collected
them:** mobile, address and terms acceptance on the money flow; mobile, state,
district, locality and terms on the food flow. Cause is now a select matching
the server's five accepted values.

**The food catalogue was wrong and would have failed at checkout.** The page
offered khichdi, roti, fodder, bird grain and puppy meal. `SEND_CATALOG` in
`lib/payment.js` holds rice, wheat, poha, soya chunks and vegetarian dog food,
prices every line itself, and rejects unknown keys — verified: the old list is
rejected with "One or more selected food items are invalid." The page now
mirrors the server list at the server's prices. **These two lists must change
together**; there is a comment saying so in both files.

Per-item impact claims ("About ten street dogs fed once") were removed. They
had no source in the repo.

**Monthly giving is hidden.** `parseDonation` has no recurring path, so a
monthly choice would have been charged once. Monthly is removed from the DOM
behind `MONTHLY_MANDATE_LIVE = false` in `donate.html`, and `?freq=monthly` is
coerced to `once` so a campaign link cannot select it. Flip the flag **only**
once CCAvenue's subscription/eMandate product is integrated — the flag alone
does not implement recurring billing.

The UPI/Card toggle was removed from both flows. Method is chosen on CCAvenue's
page; offering the choice here implied PFA was taking the payment.

## 5. Shop -> Paws & Tails -> Razorpay

**On Razorpay specifically:** `ARCHITECTURE.md` is explicit that PFA never
touches store money, and `lib/payment.js` rejects store items with a test
enforcing it. Razorpay is the *seller's* gateway inside Shopify checkout. That
is what is wired here. A direct Razorpay integration in this repo would make
PFA merchant of record for goods it does not sell, and would break that test.

- Catalogue: 22 invented products replaced by a live fetch of
  `/api/paws-catalog?view=list`. Each purchasable **variant** is its own line,
  keyed by the real Shopify variant id, which is what `/api/pfa-orders`
  requires. Sold-out products and variants are excluded.
- Checkout: real address form -> `POST /api/pfa-orders` -> redirect to
  `paymentUrl`. The two fake saved addresses are gone.
- Return: `/api/pfa-order-status?token=` — `CONFIRMED`, `FULFILLED` and
  `REFUND_RECORDED` mean paid.
- Product links go to `/products/<handle>` on PFA, never the seller's domain.
- All seller-supplied text is escaped before `innerHTML`.

**Removed, because PFA cannot promise them once Paws & Tails is the merchant:**
the free-delivery threshold, the ₹29 round-up, and "funds N days of care".
Delivery now reads "Calculated at checkout". Kits are assembled from live stock
and priced at the true sum of their parts, so there is no invented saving; the
section hides itself if stock is too thin.

**Two claims on the page were false and had to be rewritten:**

> "We buy at scale for 26 shelters, so the shop price stays close to wholesale
> and the margin funds care."

> "The margin goes straight into rescue and shelter care."

PFA has no shelters (stated in the repo's own skill file), does not set these
prices, and does not take this margin. The ₹150-a-day figure had no source.
Both passages now describe the actual arrangement.

**Tests:** `PFA_v1_37/shop-catalog.test.js`, 10 passing —
`node --test shop-catalog.test.js`.

## 6. Stale product entries removed from search

`search-index.json` still advertised the 22 invented products and 4 kits **with
prices**, so a search for "kibble" returned a product that does not exist at a
price PFA does not set. Those 26 rows are removed; no row carries a price now.

`build-index.js` scraped those product literals out of `pfa-shop.html`. Since
the catalogue is fetched at runtime there is nothing to scrape, so that block
is removed rather than left to silently produce nothing. A build-time snapshot
of a seller's live stock would go stale anyway.

---

## 7. Kits removed — the vendor does not sell them

The shop offered four "kits" that Paws & Tails do not stock. The earlier pass
had rebuilt them from live products priced at the true sum of their parts,
which removed the invented saving but left an invented product. They are gone
now: the section, the hero call to action, the styles, `buildKits()`,
`paintKits()`, `addKit()` and the click handler. The page lists what the vendor
lists, and nothing else.

## 8. The Store switch

One setting, three states, in `lib/store-settings.js`:

| State | What it does |
| --- | --- |
| `veg` | Open. Food must read as vegetarian and carry no animal protein. Everything that is not food is unaffected. **Default.** |
| `all` | Open. Everything Paws & Tails publish. |
| `off` | Closed. Nothing listed, nothing buyable. |

**`off` is a real stop, not a hidden grid.** `/api/pfa-orders` checks the
switch before anything else and returns `503 STORE_CLOSED`, so a shopper with
the page already open, a stale tab, or anything posting straight to the route
is refused too. There is a test for exactly this. Hiding the products alone
would have been a control that looked like it worked.

**The switch takes effect at once.** The vegetarian judgement used to be baked
into the catalogue during normalisation, which meant it sat inside a ten-minute
cache — a switch that took ten minutes to work is not a switch. The judgement
is now a property recorded on each product (`vegetarianOk`), and the policy is
applied per request in `applyPolicy()`. The cache holds everything; the switch
decides what leaves. `/api/paws-catalog` is now `no-store` so the edge cannot
serve a stale answer either.

`PAWS_INCLUDE_ALL_FOOD` is still honoured as the *initial* value, so an
existing deployment does not change underneath itself until somebody presses
the switch.

`test/paws-catalog.test.js` had a test asserting `normalizeProduct` returns
`null` for non-vegetarian food. That guarantee still holds — it is enforced one
layer up now, so the test was **moved to the new layer, not deleted**, and
extended: vegetarian-only hides it, everything lists it, closed sends nothing,
and the internal verdict never reaches the browser.

**Admin route:** `lib/routes/admin/store.js`, registered in `api/index.js`.
Guarded by the **existing** `store` module permission — whoever can see Store
orders can regulate the Store. No new permission key, so there is nothing new
for a super admin to discover and assign.

**Who changed it** is recorded as a hash, not a readable address. The panel
needs to show that a change was made and by which account, not keep a list of
staff emails in a settings document.

## 9. The admin control

`assets/store-control.js` + `assets/store-control.css`. See
`ADMIN-STORE-SWITCH.md` — it is two lines and a container, because `admin.html`
lives in the `PFA_UI_Content` zip and could not be edited from here. It reuses
the panel's own `call()`/`post()` helpers, so there is no second Firebase
initialisation.

The design decisions, since they are easy to undo by accident:

- **The state is a sentence, not a badge.** "The Store is open. Food is limited
  to vegetarian." reads the same to someone who has never seen the panel.
- **Each choice shows what it would list**, with a live count, so the
  consequence is visible before the press rather than discovered after.
- **Closing asks once.** It stops every shopper mid-purchase. The other two do
  not ask, because they are reversible in one press and nothing breaks.
- **No Save button.** Pressing a choice is the change, so there is no
  half-changed state to misread.
- **A database that cannot be reached says so** and shows the last known
  setting, rather than silently implying the Store is in its default state.

## 10. Shopper-facing closed state

Closed is its own state on `pfa-shop.html`, not an empty shelf — an empty shelf
reads as a fault. The products, the filters and the bag bar all go, replaced
by a notice that says nothing has been charged.

---

## Before this goes live

**Nothing here contains a secret, and no value was invented.** These are
already Vercel env vars; confirm they are set in Production:

    CCAVENUE_MERCHANT_ID / CCAVENUE_ACCESS_CODE / CCAVENUE_WORKING_KEY
    FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY
    PFA_SHOPIFY_STORE_DOMAIN / PFA_SHOPIFY_STOREFRONT_ACCESS_TOKEN
    PUBLIC_SITE_URL

Firestore needs rules for the two new collections. Both are written
server-side through the Admin SDK only, so clients need no access:

    match /searchPopular/{doc} { allow read, write: if false; }
    match /settings/{doc}      { allow read, write: if false; }

After deploy, the checks from the repo's own skill file:

    curl -s https://<host>/api/payment/health          # JSON, not Vercel HTML
    curl -s https://<host>/api/search-popular          # {"schemaVersion":1,...}
    curl -s https://<host>/api/admin/store             # 401 without a token
    curl -s https://<host>/api/does-not-exist          # {"code":"NOT_FOUND",...}

## Test status — read this before believing anything works

`npm test` on these two zips merged: **184 tests, 158 pass, 26 fail.**

The 26 failures are **pre-existing and unrelated to these changes**. Verified by
running the same suite on the untouched originals: the failure list is
byte-identical, and the changes add 7 passing tests and remove none.

They fail because these two zips are not the matching pair. `PFA_Logic_Backend`
expects the `PFA_UI_Content` half — `store.html`, `help.html`, `admin.html`,
`membership.html`, `product.html`, `assets/site.css`, `assets/data.js`. The
`PFA v1.37` UI is a different, leaner site that does not contain them, so those
tests hit `ENOENT`. `tools/audit_site.py` dies on the same missing
`assets/site.css`, on the originals too.

So the skill file's "must print pass 116, fail 0" gate **cannot currently be
met with this pairing**, and was not met before these changes either. To reach
it, merge `PFA_Logic_Backend` with `PFA_UI_Content` and re-run.

## Still open

- **Recurring donations.** Needs CCAvenue subscription/eMandate. Monthly stays
  hidden until then.
- **`/products/<handle>`** is server-rendered from a `product.html` template
  that is not in the v1.37 UI zip. Shop links point there correctly; the page
  will 404 until that template ships alongside.
- **Shopify webhooks** must be pointed at `/api/webhooks/order-paid` and the
  rest, with `PFA_SHOPIFY_WEBHOOK_SECRET` set, or order status never leaves
  `AWAITING_PAYMENT`. The receiver refuses everything without that secret,
  which is intentional.
- **`?paid=` return parameter.** `resumeOrder()` looks for `?paid` or `?from`
  on return from checkout. Confirm what Shopify actually appends for this
  store and adjust if it differs.
- USD prices in `SEND_CATALOG` are still the placeholders the file flags for
  PFA to confirm.


---

## 11. Cleanup pass — leftovers from the changes above

Both pages were booted against a DOM shim (`test/_dom-shim.js`) that returns
`null` for elements that do not exist, exactly as a browser does, and the
donate flows were driven through to submission (`test/page-boot.test.js`).
That found and fixed:

- **`okPhone()` in `donate.html`** — dead. Its only call site was replaced when
  the food flow moved to the server's stricter Indian-mobile rule.
- **A permanently empty progress bar in the shop.** `#barProg` was pinned at
  `0%` once the free-delivery threshold went, so the track could never fill. A
  progress bar that never moves reads as broken; removed with its CSS.
- **`Add ₹999 for free delivery` still in the static markup.** The script
  overwrote it on first paint, but it was what a visitor saw for the first
  frame, and PFA no longer sets delivery charges. Now reads "Delivery
  calculated at checkout".
- **17 orphaned CSS rules** — `.ship`, `.ship__track`, `.saved`, `.seg`,
  `.roundup`, `.stat`, `.cta`, `.btn--sm`, `.bar__prog` in the shop and `.pay`
  in donate, all left behind by removed features.

Orphans were separated from pre-existing ones by running the same detector
against the untouched originals. The ~28 unused classes already in
`donate.html` before this work were left alone: removing them is unrelated
risk.

### Verified, and not verified

`npm test` runs 224 tests. What is actually proven:

- Both pages boot with no runtime error and hold no reference to a removed
  element.
- A valid gift fills every hidden field the server reads and locks the button
  against a double post; an invalid mobile or an unticked box blocks it.
- `parsePaymentRequest` accepts exactly what both donate forms send, and the
  server prices the food order itself.
- The shop maps a catalogue response to real Shopify variant ids, drops
  unavailable and malformed ones, and posts to `/api/pfa-orders`.
- A closed Store returns `503 STORE_CLOSED` from the checkout route.

What is **not** proven, because this machine has no network and no browser:

- No request has ever reached CCAvenue, Shopify or Firestore. Every one of
  those is stubbed.
- Nothing has been rendered. Layout, fonts and the hand-drawn cursor are
  unexercised.
- The `?paid=` return parameter is still a guess about what Shopify appends.

The staging run in `ADMIN-STORE-SWITCH.md` is what closes that gap.


---

## 12. Catalogue presentation

From a screenshot of the live grid. The line art the page was built around
tolerated a layout that real product photography did not.

**`object-fit: cover` was cropping every photograph.** A storage canister came
through as a field of green with no object in it. Product shots have to be
shown whole, so tiles are now `contain` with padding. This was the single
biggest thing wrong with the grid.

**The grid was locked to four columns at any width** (`repeat(4,1fr)`), which
gave 280px cards on a laptop and worse on anything wider. Now
`repeat(auto-fill,minmax(200px,1fr))` inside the existing 1440px cap: six
columns on a desktop, five at 1190px, down to one on a phone, with cards
staying between 200 and 350px.

**Tiles are square and white with a hairline border**, not 4:5 on stone. The
vendor's photographs arrive on assorted backgrounds — plain white, marble, a
green sweep — and a common white field with a defined edge is what lets them
read as one set instead of floating cutouts.

**Images were being served at upload resolution.** `cdn()` asks Shopify's CDN
for the size actually being drawn, with a 2x source for retina. The parameter
is only added to their own CDN; any other host is left untouched.

**"Show 213 more" mounted the whole catalogue in one press.** It now grows a
page of 24 at a time and returns focus to the button, so the keyboard is not
thrown back to the top of the page on each press.

Titles clamp to two lines and the sub-line to one, so cards keep a common
height; the prescription tag is inset rather than sitting flush over the
corner of the photograph.

### A classification bug the screenshot exposed

Two products under **Grooming** were `Amitraz and Ivermectin Shampoo` and
`Piroctone Olamine Foam Base Shampoo`, both marked FOR VETERINARY USE ONLY.
`classifyProduct` tested `grooming` before `medicine`, so the word "shampoo"
won outright and antiparasitics were filed next to the coat conditioners.

A clear medicinal signal now outranks the format of the bottle: veterinary
use, prescription, medicated, antiparasitic, or a named drug. Both move to The
Pharmacy; ordinary shampoos and conditioners stay in Grooming. Tested both
ways, including that the new signal does not swallow food or accessories.

### Left alone, but worth a look

The hero still reads **"PFA SHOP · TWO MINUTES, START TO DONE"**. Checkout now
finishes on the vendor's Shopify page, so the last leg of that two minutes is
not PFA's to promise. The in-cart stopwatch is fine — it stops at hand-off —
but the tagline is a brand decision rather than a factual correction, so it
has been left as it is.


---

## 13. `/products/<handle>` — the missing template

`/products/alcovet-alcoat-z-250ml-...` was returning a bare
**"Product page template is missing."** `lib/routes/product-page.js` renders
from a `product.html` at the repo root; that file lives in the
`PFA_UI_Content` half and has never been in this tree. This was the open item
listed at the end of §6.

`product.html` is now built **from `pfa-shop.html` itself**, not written to
resemble it. The self-hosted Marcellus block, the whole stylesheet, the header
and the footer are lifted byte for byte, with the product-page rules appended
inside the shop's own `<style>`. So the tokens, buttons, grid, cards, footer
and hand-drawn cursor are literally the same rules rather than a copy that can
drift. There is a test that asserts the header and footer match the shop's
byte for byte.

It carries the three markers the route needs — `PFA_HEAD_START` /
`PFA_HEAD_END` for title, description, canonical, Open Graph and JSON-LD, and
`PFA_DATA` for the embedded product. `vercel.json` already had
`includeFiles: product.html`, so nothing was needed there.

**`assets/product.js` is deliberately not loaded.** It belongs to the other
half: it renders `pd-*` markup and links to `store.html`, neither of which
exists here, so using it would have been the deviation. The page carries its
own inline script, which is how every other page in this tree is built.

### Two holes this exposed

**The Store switch did not reach product URLs.** `product-page.js` called
`getCatalog()` directly, which returns the unfiltered catalogue, so a closed
Store still served a buyable product page and a product hidden by the
vegetarian policy was still reachable if you knew the handle. It now reads the
switch first and applies the same `applyPolicy()` the grid uses, so the two
cannot disagree. Verified across all three states: vegetarian-only gives 200
for a vegetarian product and 404 for a non-vegetarian one; everything gives
200 for both; closed gives 503 and a noindex page for both.

**The bag was per-page.** The shop kept it in a plain variable, so anything
added on a product page vanished on the way to the grid. Both now share
`sessionStorage['pfa:store:bag']`, keyed by Shopify variant id, and
`pfa-shop.html#bag` opens the drawer on arrival.

### On the test that had to change

`test/product-page.test.js` asserted the 404 page links `/assets/site.css` —
the other half's stylesheet. The guarantee behind it, that a miss is a real
styled page rather than a bare error, is kept: it now checks this tree's own
shell (a stylesheet, the site header, the footer). Same guarantee, checked
against the tree it is actually running in.

`applyPolicy()` filtered on a truthy `vegetarianOk`, which hid any product
that lacked the field entirely. `normalizeProduct` always sets it, so real
data was unaffected, but data from anywhere else would have emptied the shelf
silently. It now hides on an explicit `false`, and a new test asserts
`normalizeProduct` always emits the verdict, so the guarantee holds at source.

**`npm test`: 238 tests, 217 pass.** Five of the pre-existing failures are
fixed by this template arriving; 21 remain, all still waiting on
`PFA_UI_Content`.


---

## 14. Filter bar spacing, and stopping the product page drifting

**The chips sat 12px under the dark hero**, so they crowded a hard colour
boundary. The gap is now on `.hero` as a `margin-bottom` of
`clamp(24px,3.2vw,44px)` — 38px at a 1190px viewport — and deliberately not on
`.filters`.

`.filters` is sticky. Padding added there would be carried for the whole
scroll, fattening the bar under the header where you actually want it lean.
The crowding only exists at rest against the hero, so the space belongs to the
hero and scrolls away with it. The bar keeps its 12px. There is a test for
both halves of that.

### The drift this exposed

`product.html` was built by copying the shop's stylesheet, header and footer.
One CSS edit later it was already stale — the hero gap had not reached it.
That is the exact failure mode of a hand-kept copy.

It is now **generated**. `scripts/build-product-template.js` takes the font
block, the stylesheet, the header and the footer from `pfa-shop.html` on every
run, and preserves everything product-specific between markers:

    /* PFA_PRODUCT_CSS_START */ … /* PFA_PRODUCT_CSS_END */
    /* PFA_PRODUCT_JS_START */  … /* PFA_PRODUCT_JS_END  */

    npm run build:product

`test/product-template.test.js` fails if the two are out of step, naming the
command to run, so a forgotten rebuild is caught rather than shipped. Verified
by editing the shop without rebuilding: the suite fails with
*"pfa-shop.html has changed since product.html was built."* The rebuild is
also idempotent — running it twice reports no change, which it did not at
first: the font region was keyed to `<style>` rather than to the comment above
it, so each run re-inserted the comment.

**`npm test`: 243 tests, 222 pass, 21 fail** — the same 21 waiting on
`PFA_UI_Content`.


---

## 15. The search prompt was still oversized in the overlay

§3 shrank the prompt on `search.html` but missed the overlay, which is where
most people meet it: it opens over `index.html` from the header, Cmd-K or `/`.
The overlay heading is a different element, `.pfa-search__ask`, and it was
still at `clamp(34px,7.2vw,112px)` — about **86px** at a 1190px viewport,
dwarfing the 31px input it labels.

The same question was therefore rendering at two different sizes depending on
where you met it. Both are now `clamp(24px,3.1vw,44px)`: 37px at that
viewport, 44px at the cap. A test asserts the two selectors carry the same
value, so they cannot drift apart again.

The query echo on a results page keeps its display scale — only the prompt was
wrong — and there is a test for that too.

**The hard line breaks are gone.** `What would<br>you like to do<br>today?`
was set for 112px type; at 44px it left a small stack in a wide space. The
sentence now wraps against a `22ch` limit with `text-wrap:balance`, so it
reads as one line on a desktop and breaks naturally on a phone. The `<label
for="pfa-q">` binding is unchanged and tested, so the prompt still focuses the
input when clicked.

**`npm test`: 248 tests, 227 pass, 21 fail** — the same 21 waiting on
`PFA_UI_Content`.


---

## 16. Routing on the product page

The not-found page rendered correctly, but **every link on it was broken.**

`/products/<handle>` is the only page in this tree not served from the site
root. A relative `href="pfa-shop.html"` is correct everywhere else and resolves
to `/products/pfa-shop.html` here. Nineteen URLs were affected, and it was not
just the two buttons:

- the whole header nav — Founder, Laws, Units, The Wire, The Wall, CineKind,
  Shop, Donate, Cart, and the wordmark
- the whole footer, all four columns
- both buttons in the not-found state
- the breadcrumb
- **the self-hosted Marcellus files.** These failed quietly: the Google Fonts
  `<link>` covered for them, so the page looked right while the whole point of
  self-hosting — working when Google is slow or blocked — was gone.

Fixed in `scripts/build-product-template.js` with a `rootify()` applied to the
font block, stylesheet, header and footer as they are copied in, so the shop
keeps its relative links (correct at the root) and the product page gets
root-absolute ones. Schemes, protocol-relative URLs, fragments, `mailto:`,
`data:` and already-absolute paths are left alone; each case is tested. The
page's own links sit between the JS markers and were written absolute by hand.

Verified two ways: no relative URL survives anywhere on the page, and every
`/…` target it links to exists on disk. Reintroducing one relative href fails
the suite with the offending URL named.

### The fallback led nowhere

"Search instead" pointed at `/search.html?q=…`. Product rows were taken out of
the site index in §6 when the catalogue went live, so that search cannot answer
a product query — the fallback for a missing product led to a page that would
never find one.

It now reads **"Search the shop"** and goes to `/pfa-shop.html?q=…`, which
searches live stock. The shop did not read `?q=` at all, so that was added too.

### Two tests had to be retargeted

`the header and footer are the shop’s, byte for byte` and its twin now compare
against `rootify(shop)` rather than the raw shop. The URL rewrite is the one
deliberate difference between the two shells, so a byte-for-byte assertion
would have forced a choice between working links and drift protection. Both
still fail on any real drift — confirmed by editing the shop shell without
rebuilding — and one now also asserts the rewrite actually happened.

**`npm test`: 254 tests, 233 pass, 21 fail** — the same 21 waiting on
`PFA_UI_Content`.


---

## 17. CineKind photographs

Fetched `filmfederation.in/events.php` and read off the CineKind set it
actually publishes: **1–5, 7–29, and `newspaper.jpg`**. Six is absent
deliberately — the source page's own thumbnail for 6 points at `5.jpg`, so
that file looks missing on their side too.

What was wrong on the page:

- **One image used `www.filmfederation.in`** while the other six used the bare
  host. Different origin; if it does not resolve, that picture never appears.
  All references now use the bare host, and a test asserts one spelling.
- **The gallery showed six of twenty-eight available photographs.** It now
  shows twelve, all from the ceremony block the source lists first.
- **No `referrerpolicy`.** Referer-checking hot-link protection is the most
  likely reason these were blank, and sending no referrer is the cheapest
  thing that defeats it. Added to every hot-linked image.
- **`onerror="this.remove()"` left an empty grid cell.** In the gallery it now
  removes the whole `.shot`, so a missing photograph closes up instead of
  leaving a grey box.

### What I could not do, and why it matters

**I could not open the photographs.** They are not reachable from this
environment, so I do not know what any individual frame shows.

The alt text asserted that `18.jpg` is *"Maneka Sanjay Gandhi speaking at
CineKind"* and that `5.jpg` is *"The CineKind trophy, a sculpture by Paresh
Maity"*. Those were guesses about frames nobody had opened. A wrong name on a
photograph of a real, named person is worse than a plain description, so the
alt text is now accurate and general — *"CineKind National Awards 2025,
Kolkata"* — and a test fails if a person is named in alt text again.

Tell me what each frame shows and I will write precise alt text for each. The
body copy still says the trophy is a sculpture by Paresh Maity; that is a
claim about the award, not about a photograph, and it was left alone.

### Hot-linking is still the wrong mechanism

Even with the referrer fix, these load from the Federation's server on every
page view: their bandwidth, and their renumbering breaks PFA's page silently.
`scripts/fetch-cinekind-media.js` downloads the full set and, with
`--rewrite`, points the page at local copies. It refuses to rewrite if any
file failed, because a missing local path fails exactly as silently.

    npm run media:cinekind
    node scripts/fetch-cinekind-media.js --rewrite

**One thing to confirm before running it.** These are the Federation's
photographs, and their site carries an all-rights-reserved notice. CineKind is
co-presented by the Federation and PFA, so PFA is very likely entitled to use
them — but that is worth having in writing rather than assuming, and the
credit line under the gallery should stay either way. It now names the
Federation and links the event page.

### Separately: nine local files are missing

`cinekind.html` also references nine local files that are not in this tree —
six honouree portraits (`media/cinekind-2025/*.webp`) and three videos
(`media/cinekind-*.mp4`). These are **not** Federation photographs and must
not be substituted with ceremony shots: a photograph of an award being
presented is not a portrait of Dr Harsha Atmakuri. `media/**` belongs to the
`PFA_UI_Content` half, which is still outstanding.

**`npm test`: 260 tests, 239 pass, 21 fail** — the same 21.


---

## 18. The grazing cow's face in the full-bleed band

Not the hero — `img/hero-caregiver.webp` is the caregiver and dog. This is the
full-bleed band further down `index.html`, `data-slot="fullbleed"`.

The cause is a rule doing exactly what it was written to do, in the one place
it should not. `index.html` carries:

    /* Anchor the crop on the upper third, where every animal's head sits */
    .pfa-slot-frame img{object-position:50% 30%}

That is correct for a 4:5 card or a square tile, where a standing animal's head
is high in the frame. The full-bleed band is the opposite shape — a 2.9:1
letterbox — and its cattle are grazing **head-down**. Anchoring on the upper
third therefore cut their faces off the *bottom* edge.

At `min-height:420px` on a 1288px viewport, only **51%** of a 3:2 photograph
was visible, and `50% 30%` put that window over 15%–66% of the frame. A grazing
head sits nearer 70–85%, so it fell outside the window entirely.

Two changes, and the band is the only slot that gets them — every other slot is
a 4:5 card, a 220px tile or an inset feature, where the upper anchor is right:

- `[data-slot="fullbleed"] .pfa-slot-frame img{object-position:50% 70%}`
- the band's `min-height` from 420px to 520px, so less of the photograph is
  discarded in the first place and the crop is not forced to choose between the
  mist and the animals

Together the window now covers **28%–88%** of the frame.

The anchor is one number, commented as such: raise it for more ground, lower it
for more sky. Tests assert the band anchors lower than the blanket rule, that
no card or tile picks up the low anchor, and that enough of the photo survives.

**Also on that element:** its `aria-label` read *"full-bleed: cattle grazing on
a misty hilltop in Karnataka"*. A screen reader announced the words
"full-bleed", which is a layout note, not a description; and the location was
never verifiable for a stock photograph. It now reads *"Cattle grazing on a
misty hillside"*, and a test fails if a layout word leaks into an aria-label
again.

**One caveat.** The photograph is served from Pexels and could not be opened
from here, so the 70% figure is derived from the crop geometry and the
screenshot rather than from measuring where the head actually sits. If it is
still not right, it is that one number.

**`npm test`: 264 tests, 243 pass, 21 fail** — the same 21.


---

## 19. The horse in the "Things science did not expect" rail

`story-3`, in the horizontally scrolling Findings rail. It carried an override:

    [data-slot="story-3"] .pfa-slot-frame img{object-position:50% 25%}

25% is **higher** than the blanket 30%, which is the wrong direction for this
photograph. The horse's head hangs low, so anchoring near the top held the ears
and mane in frame and pushed the muzzle out of the bottom. Now `58% 62%`:
anchored low, and nudged right, where the head is.

**Both axes are set deliberately.** The card is 340×460, portrait. Against a
landscape source that crops left/right and the Y value does nothing; against a
portrait source it crops top/bottom and Y is what matters. The axis with no
excess ignores its value, so setting both is correct either way — and I cannot
open the photograph to know which case this is.

Same caveat as §18: this is one number. Raise the second value for more of the
ground, lower it for more sky. If the muzzle is cut in the source photograph
itself, no crop value will recover it and the picture needs replacing.

### A test of mine was quietly not testing anything

The helper added in §18 matched `object-position:50% (\d+)%` with the X value
hard-coded. Changing story-3's X to 58% made the pattern miss, so the helper
returned `null`, and the check on it was **skipped in silence** — the suite
reported a pass for a rule it never looked at.

Both components are parsed now, and a named selector that does not resolve
fails the test instead of being skipped. Confirmed by pointing a test at a slot
that does not exist: it now fails with *"no object-position rule matched"*
where before it would have passed.

**`npm test`: 265 tests, 244 pass, 21 fail** — the same 21.


---

## 20. The quiz

**"Take the quiz" was `href="#"`.** There was no quiz. `quiz.html` is new.

### The questions are sourced, not written

Six questions, each resting on a named, linked paper. Four are the findings
already cited in the home page rail — Rugani 2009, Edgar 2011, Proops 2018,
Briefer 2014. The other two are the ones that section's own copy alludes to
without citation ("remember fifty faces for two years", "excitement when it
works out how to open a gate"); both were verified before use:

- Kendrick, da Costa, Leigh, Hinton and Peirce, *Sheep don't forget a face*,
  Nature **414**, 165–166 (2001)
- Hagen and Broom, *Emotional reactions to learning in cattle*, Applied Animal
  Behaviour Science **85**, 203–213 (2004)

A test asserts every question carries an answer, the finding, a citation and an
`https` link, and that the answer is among its own options.

### The certificate

Drawn on a canvas at 2000×1414 and saved as a PNG. No library and no network:
it works offline and nothing is sent anywhere.

**The logo is read out of the header already on the page**
(`document.querySelector('.wordmark img')`) rather than embedded a second time,
so there is one copy of the wordmark in the repository and the certificate
cannot drift from it. A test asserts exactly one base64 logo exists in the page
and that the certificate reads it from the header. It waits on
`document.fonts.ready` so the display face is the real one, shrinks a long name
to fit rather than overflowing the frame, and falls back to type if the logo
cannot be drawn instead of producing a broken certificate.

### Faces are never cropped

The brief was that faces are always visible in full. For photographs nobody has
opened, an `object-position` value is only ever a guess — so the quiz does not
crop at all: `object-fit: contain` on a neutral tile. The home page quiz tiles
now do the same, and the per-tile nudge that tried to guess where a head sat is
gone. Tested on both pages.

`quiz.html` is generated from `pfa-shop.html` the same way `product.html` is
(`npm run build:quiz`), with a test that fails if it goes stale. It is served
from the root, so unlike the product page its links stay relative and
`rootify()` is deliberately not applied.

### Three real bugs in my own test harness

Driving the quiz end to end exposed them, and all three had been making other
tests weaker than they looked:

1. **Valueless attributes were never parsed.** The attribute regex required
   `=`, so `data-reveal`, `hidden` and `disabled` did not exist as far as the
   shim was concerned, and any selector looking for one matched nothing.
2. **`closest()` returned a stand-in on a miss** instead of `null`, so every
   `if (e.target.closest(x))` branch was true and click routing was meaningless.
   It now walks a real parent chain — the parser builds one — and returns null.
3. **`innerHTML` did not create elements.** Anything a page drew after load was
   invisible to `querySelector`, so no test could touch a rendered result. It
   now injects a findable subtree and clears the previous one.

The shim also reflects `src`, `href`, `id`, `alt` and `type` as properties, as
a browser does.

**`npm test`: 274 tests, 253 pass, 21 fail** — the same 21, with no regressions
from the harness changes.


---

## 21. "The Wire" is now "Dispatches"

Renamed everywhere: **19 places**, including the page file itself.

### Why this name

Not only taste. Two things made the old one a poor fit, and one made the new
one nearly pick itself:

- **thewire.in is a major Indian news publication.** For an Indian charity
  running a news section called The Wire, that is a live confusion.
- **The nav already had The Wall next to it** — two "The W—" sections side by
  side.
- **This project had already half-moved to "Dispatch".** `assets/site.js` and
  the other half's index both point this section at `dispatch.html` while still
  labelling it "The Wire". The slug and the label have been disagreeing for
  some time; the rename settles it in the direction the code had already chosen,
  and now the other half's links resolve.

Shortlist that lost: *The Casebook* (strong, but reads as a legal sub-section
next to Laws), *Field Notes*, *The Record*. Deliberately avoided anything
implying operations PFA does not run — *The Callout*, *Frontline*, *The
Rounds* — and *The Round-Up*, which is a slaughter term.

### How it was done

`scripts/rename-section.js` takes the old and new label and slug, so changing
your mind costs one command rather than another pass:

    npm run rename:section -- "Dispatches" dispatch "New Name" new-slug
    npm run build:product && npm run build:quiz

It skips, on purpose: `_inline-extracts/` (documented read-only snapshots of
the other half's pages), and `CHANGELOG.md`, `UI-CHANGELOG.md`, `QA_REPORT.md`
— **history should not be rewritten to say a section was always called
something it was not.** It also skips itself, which it did not on the first run:
it rewrote its own usage example, since that example contained the old name.

### The old URL still works

`vercel.json` now carries a **permanent** redirect from `/the-wire.html` and
`/the-wire` to `/dispatch.html`, so bookmarks, inbound links and anything
already indexed follow through instead of breaking. And `wire` is kept as a
search keyword on purpose: someone who remembers the old name still lands on
the page.

### Two bits of copy fixed on the way

The section described itself as *"news from the rescue front"* and *"updates
from our units"*. The repo's own rules are explicit that PFA has no rescue
teams and that the entries are local contacts, not units it runs. Both now read
*"cases, campaigns and what changed this week, with the record of how each one
moved"* — which is also how `assets/site.js` already described it.

**`npm test`: 280 tests, 259 pass, 21 fail** — the same 21.


---

## 22. "Dispatches" is now "Newsroom"

The section carries actual news, so it is named the way a news section is
named. **Newsroom** is the term press and visitors look for, it is the standard
convention for an organisation's news section, and it fits the nav's plain-noun
pattern:

    Founder · Laws · Units · Newsroom · The Wall · CineKind · Shop · Donate

### Why "Dispatches" was wrong, and it was not taste

Checking the tree before renaming turned up a collision. **`dispatched` already
means "the card has been posted"** across the caregiver shipment flow —
`lib/caregiver.js`, `lib/caregiver-mail.js`, `lib/caregiver-store.js` and
`assets/caregiver-public.js` — including a user-facing status label
`Dispatched` and the email line *"Your card has been dispatched."*

A news section called Dispatches sitting beside a shipment status called
Dispatched is an ambiguity in the product, not just the prose. The rename
script matches the exact label and the exact slug, so none of that vocabulary
was touched, and there is now a test asserting the shipment status and its
label both survive.

### Both former URLs redirect

`vercel.json` carries permanent redirects from `/the-wire.html`, `/the-wire`,
`/dispatch.html` and `/dispatch` to `/newsroom.html`. `dispatch.html` was never
public here, but `assets/site.js` and the other half's index both pointed at
it, so it gets one too: one section, one canonical URL.

Both old names stay as search keywords, so anyone who remembers The Wire *or*
Dispatches still lands on the page.

**`npm test`: 281 tests, 260 pass, 21 fail** — the same 21.


---

## 23. The quiz page had no pointer, and ragged tiles

Both faults were mine, introduced with the page in §20.

### No cursor at all

The shared stylesheet carries `body,body *{cursor:none!important}`. `quiz.html`
took the stylesheet and I never gave it the layer that draws the replacement —
so the native pointer was hidden and nothing drew one. Not "the cursor did not
render": **there was no pointer on the page.**

The cursor layer and its script are now a part of the shared shell
(`shopParts().cursorMarkup` / `.cursorScript`), pulled from `pfa-shop.html` by
both build scripts, so a new page cannot be given the stylesheet without them.

Extracting it went wrong once first: `/* ---------- hand-drawn cursor */`
appears **twice** in the shop — once in the stylesheet, once in the script —
and searching forward from the first hit swallowed 50 KB of the page. It now
anchors on `(function cursor(){` and walks back to its comment, and throws if
the result is over 8 KB rather than quietly shipping the wrong slice.

### Tiles the wrong size

`.qz__shot` had `aspect-ratio:1`, but it is a flex item, and a flex item's
`min-height:auto` lets its content push past the ratio. A portrait photograph
made its tile taller than a landscape one, so the options came out ragged and
the labels sat at different heights.

Fixed at the root rather than by nudging numbers: the image is taken out of
flow (`position:absolute` inside a `position:relative` tile), so it cannot size
its own container. The tile is square because it says so, and the photograph is
fitted inside it — still `object-fit:contain`, so faces are whole. The `li` now
stretches, the button fills it (`flex:1`) and the label is pinned to the bottom
(`margin-top:auto`), so a row of options is level.

### The check that catches this class of bug

`test/cursor-and-tiles.test.js` checks **every** page in the tree: if it hides
the native pointer, it must draw one and move it.

Writing it found that three pages do this three different ways — the shop's
`cursor-layer`/`cursorSvg`, `index.html`'s `pfaCursorSvg`, and
`submission-collage.html`'s `curSvg`. The first version of the check knew only
the shop's naming and reported the other two working pages as broken. There is
now a test for the detector itself, so a check that is too narrow fails rather
than raising a false alarm — or worse, passing because it recognises nothing.

**`npm test`: 287 tests, 266 pass, 21 fail** — the same 21.


---

## 24. Page edges: the gutter was a phone value on a laptop

The shop's search box sat on the left edge and the item count on the right.
The cause is one token, and it was not local to the shop:

    --gutter: max(16px, (100% - 1440px) / 2)

The second term only exceeds 16px once the viewport passes about **1472px**.
Below that the gutter is a flat **16px** — a phone value — so on any normal
laptop every band on the page ran within 16px of the edge. The hero only
*looked* inset because its headline and lede carry their own `max-width`, not
because the gutter was any wider.

**Every page defined it identically**, `index.html` under the name `--g` and
the rest as `--gutter`, so this was site-wide rather than a shop bug. All
thirteen pages and `pfa-search.css` now use:

    --gutter: max(clamp(16px, 4vw, 72px), (100% - 1440px) / 2)

| viewport | before | after |
| ---: | ---: | ---: |
| 380px | 16px | **16px** |
| 768px | 16px | 31px |
| 1190px | 16px | **48px** |
| 1440px | 16px | 58px |
| 1600px | 80px | **80px** |
| 2380px | 470px | **470px** |

A phone is untouched, a laptop gets real margins, and once the centring term is
the larger of the two — from about 1600px — nothing changes at all, so the
1440px content column on wide screens is exactly as it was.

Because every band on every page reads the same token, they all move together
and stay aligned with each other; `--gutter-lg` was moved in step.

`test/page-gutter.test.js` asserts all pages agree on one definition, that a
phone still gets 16px, that a laptop gets a real margin, and that wide screens
are byte-for-byte unchanged.

The first version of that test filtered `--gutter-lg` out by looking for "-lg"
in the token's *value* rather than its name — no value contains it — so it
compared the large gutter against the normal one and reported the pages as
disagreeing. Fixed to match on the name.

**`npm test`: 291 tests, 270 pass, 21 fail** — the same 21.


---

## 25. Events: invented dates out, real requests in

### What was there

`events.html` carried **24 fabricated dates across 10 cities** — Cubbon Park
Bandstand, Carter Road Promenade, Sunder Nursery Lawns, Regal Cinema and the
rest — with invented badges ("New date", "Few slots"), **49 dead `href="#"`
links**, and copy about "our shelters" and "our teams" that the repo's own
rules say PFA does not have.

Its CineKind rows were invented too: *CineKind 2026*, Mumbai, NCPA and Regal
Cinema in October. The real one is on the record in `cinekind.html` — **the
first edition, Kolkata, 20 December 2025**. That single entry is what remains,
marked as held, linking to the honours.

### What replaces it

An **event request form**. PFA has no standing calendar; drives and camps
happen where someone local asks and can help make one possible. The page now
says that and takes the request: what kind, which city, a place if they have
one, name, mobile, optional email and notes.

The filter bar went with the rows — a search box and five category chips over
one entry is furniture, not a feature — and the hero no longer claims "24
dates · 10 cities · September to December".

### All three forms were lying

This is the part worth reading. **No form on this site sent anything.**

- `cinekind.html` showed *"Nomination received, thank you"* and posted nothing.
- `wall.html` hid the form, showed *"Sent to an editor. You will hear back
  within 48 hours"*, and posted nothing.
- `events.html` had no form at all.

Someone nominating a film-maker, or submitting a video of an animal they had
helped, was told it had arrived when nothing was recorded anywhere.

All three now post to `/api/pfa-submissions`, which was in the backend the
whole time, through one shared helper, `pfa-forms.js`. The rule that helper
exists to enforce: **the server issues the reference, and the page reports
success only if one comes back.** A response without a reference is treated as
a failure, not a thank-you.

| Form | Kind | Reference |
| --- | --- | --- |
| Event request | `PFA-EV` *(new)* | `PFA-EV-2026-00001` |
| CineKind nomination | `PFA-CK` | `PFA-CK-2026-00001` |
| The Wall | `PFA-S` | `PFA-S-2026-00001` |

`PFA-EV` was added to `KIND_LABELS`; references are minted generically, so
nothing else needed changing. The nomination form gained a name and a contact —
it previously collected a film title and no way to reach anyone about it.

Every field name each form sends was checked against `assets/field-rules.js`,
the same rules the server validates with, so nothing is rejected after a round
trip.

### Two things caught while building it

**A `defer` on the helper would have left every form dead.** A deferred script
runs after the document is parsed — that is, *after* the inline script at the
end of the body that wires the form. The helper is loaded blocking, and a test
asserts it is neither `defer` nor `async` and appears before the inline script.

**If the helper is missing, the form now disables itself** and says so, rather
than leaving a button that looks live and does nothing — which is the whole
failure this change is about.

`test/forms-wired.test.js` covers all of it, including that the old
thank-you strings are gone. Its first version matched those strings against the
raw file and failed on the *comment explaining the fix*, which quotes them; it
now strips comments before checking.

Still open: the five `href="#"` links in the shared footer (Volunteer, Foster,
Report a rescue, FAQ, Contact) are on every page and are a separate job.

**`npm test`: 297 tests, 276 pass, 21 fail** — the same 21.


---

## 26. Filter bar inset — and a way to tell which build is live

### The fix from §24 is in the file

`--gutter` is `max(clamp(16px,4vw,72px),(100% - 1440px)/2)` in
`pfa-shop.html`, and `header.site`, `.hero` and the filter bar all inset from
that one token, so they cannot render at different insets. At a 1190px viewport
that is **48px**, not 16px, and at 1440px it is 58px.

The screenshot still shows the old behaviour, and the shipped zip has the new
token, so what is deployed is very likely a build from before v1.79. **Every
page now carries `<meta name="pfa-build" content="v1.81">`**, so this is
checkable rather than a matter of opinion:

    curl -s https://pfa-full-website.vercel.app/pfa-shop.html | grep pfa-build

If that comes back with anything below v1.79, the fix is simply not up yet. If
it says v1.81 and the bar is still tight, it is a real bug and I want to know.

### A real fault found while checking

The inset was on `.filters`, but `.filters__row` is the `overflow-x:auto`
scroll container. Padding on the parent is outside the scroller, so when the
chips overflow they scroll right up to the padding edge and are clipped with no
space at either end of the travel — which is what a phone shows, since the
chips always overflow there.

The padding moved onto the row, where it travels with the content. The outer
band keeps only its background and border, and the `max-width:400px` override
moved with it. Same inset at rest, correct behaviour when scrolling.

`test/filter-bar-inset.test.js` asserts the row, the header and the hero all
inset from the same token — the point being that they read one token, not that
they happen to have matching numbers — that the padding is on the scroller and
not its parent, and that the generated pages inherit it.

One earlier test broke and was moved rather than weakened: it asserted
`.filters{padding:12px var(--gutter)}` under the heading "the sticky bar itself
stays lean". The lean part is the 12px vertical, which still holds; the
assertion now reads it from `.filters__row` and additionally checks the parent
adds none of its own.

**`npm test`: 302 tests, 281 pass, 21 fail** — the same 21.


---

## 27. The events form rendered as a raw browser form

My fault, and a plain one. I wrote the form in §25 against class names taken
from `donate.html` — `.form`, `.field`, `.error`, `.hint`, `.btn--full`,
`.fine` — **without checking that `events.html` defines any of them.** It does
not. The result was an unstyled browser form: labels beside inputs, error text
showing permanently next to every field, no spacing.

The rules are lifted from `donate.html` rather than reinvented, so the two
forms on this site look like the same site. `textarea` had no rule anywhere and
now has one.

The hero and the CineKind entry are intact — that screenshot is scrolled past
them.

### Why nothing caught it

`test/forms-wired.test.js` passed throughout. It checks that the form *sends*
data, which it does. Nothing checked that the form *looks* like part of the
site, and a form can be perfectly wired and still be unusable.

`test/styles-defined.test.js` now checks the other half: every class used in a
page's markup must exist in that page's own stylesheet, or in a local
stylesheet it links.

### It immediately found two more of mine

- **`.btn--ghost` was never in the shop's stylesheet.** It exists in
  `donate.html`, and I used it on `product.html` and `quiz.html`, which inherit
  the shop's. Their secondary buttons — "Keep shopping", "Take it again",
  "Search the shop" — were rendering as solid primaries, two identical buttons
  side by side. Added to the shop, so the build propagates it.
- **`.pd__buybox`** had no rule. It is a grid child holding long product
  titles, so it now carries `min-width:0`, which such a child genuinely needs.

Two false positives were fixed in the detector rather than exempted: pages
build markup by concatenation (`class="item' + (q ? ' has' : '') + '"`), so
only valid CSS identifiers are counted; and a page's linked local stylesheets
count as definitions, since `search.html` styles `.is-prompt` in
`pfa-search.css`. `.pfa-footer__col` is exempt with a comment — it is a grid
child whose layout comes entirely from `.pfa-footer__links`.

The detector has a test of its own, after several checks this session passed
while examining nothing.

**`npm test`: 305 tests, 284 pass, 21 fail** — the same 21.


---

## 28. CineKind placeholders — what the links actually are

`npm run check:media` (new) lists every local file the pages ask for that is
not in the tree. On `cinekind.html` that is **nine**: six honouree portraits
and three ceremony videos. All nine failed silently, which is why the symptom
was grey boxes with nothing to say what was wanted.

### The shared links are citations, not photo sources

Each honouree card carries a source link, and they point at **Times of India,
Filmfare, maakadoodh.in and Mongabay India**. They are there to show why each
person was honoured. The photographs on those pages belong to those
publications and their photographers, and PFA has no licence to republish
them — copying or hot-linking them onto this site would be infringement, and
Times of India in particular pursues it. So they have not been used.

`media/cinekind-2025/README.md` names every missing file, which honouree it
belongs to, and three ways to fill it properly:

1. **Ask the honourees.** PFA gave each of them an award; a portrait they are
   happy for PFA to use is usually one email, and a better photograph than a
   news crop.
2. **Use the ceremony photographs.** The Federation's CineKind set covers the
   evening the awards were presented and PFA is co-presenter, so the rights
   question is answerable. `npm run media:cinekind` downloads it. **Tell me
   which numbered image shows which honouree and I will wire them in** — I
   cannot open the files to tell.
3. **Licence them** from the publications.

### The grey boxes are gone either way

The portraits carried `onerror="this.remove()"`, which removes the image and
leaves the `.shot` behind: an empty stone box at aspect-ratio 4:5. That box was
the placeholder. It now removes the frame, so a card without a photograph reads
as a card without a photograph.

The three videos had **no error handling at all** and rendered empty frames
with nothing to remove them. They now behave the same way.

### A contradiction I introduced last turn

`cinekind.html` states in its title, its announcement bar and its stat block
that the next edition is **Mumbai, 4 October 2026, World Animal Day**. In §25 I
wrote on `events.html` that "dates for the next one are not settled" — I had
stripped that date along with 22 genuine fabrications and did not check whether
the CineKind page asserted it.

The pages no longer disagree: `events.html` points to the CineKind page for
what is known about the next edition, rather than denying it. **If the Mumbai
2026 date is confirmed, say so and I will put it back on the events page as a
dated entry; if it is not, it should come off `cinekind.html` too.**

`test/media-present.test.js` covers the checker, that every missing file is
named in the README, that no frame can fail silently, and that the two pages do
not contradict each other.

**`npm test`: 310 tests, 289 pass, 21 fail** — the same 21.


---

## 29. A sort dropdown on the shop

Five orders, in a labelled `<select>` at the end of the filter row beside the
item count:

- **Featured** — the vendor's own order, the default
- **Price: low to high** / **high to low**
- **Name: A to Z** / **Z to A**

### The details that make it behave

**Ties keep the vendor's order.** Two products at ₹450 would otherwise land in
whatever order the sort happened to leave them, and could swap between
repaints for no reason a shopper can see. The sort decorates each row with its
index and falls back to it, so equal prices are stable.

**The catalogue is not mutated.** `P` is the vendor's order and "Featured" is
that order, so it has to survive being sorted away from and back to. Sorting
works on a copy.

**Name sorts ignore case.** A plain `localeCompare` would exile a product
called *beta carotene* to the end, after Z. It sorts with `sensitivity: 'base'`
and `numeric: true`, so "10 mg" and "2 mg" order sensibly too.

**Sorting composes with the filters** rather than replacing them: the chips and
the search box narrow the list, the dropdown orders what is left.

**Changing the order restarts paging.** Otherwise "show 24 more" carries a page
count from a different order and the grid appears to skip products.

**An unrecognised value falls back to Featured** instead of throwing.

`test/shop-sort.test.js` lifts the real `SORTS` table and `visible()` out of
the page and runs them against a stand-in catalogue, so it tests the behaviour
rather than asserting the markup contains the right words. Ten tests, including
the tie stability, the lowercase title, and that the source array survives.

One earlier test broke and was moved rather than weakened: `.count` used to
carry `margin-left:auto` on its own. It now travels with the sort control in
`.filters__end`, and the group carries it, so the two stay side by side instead
of the sort drifting back into the chips. The assertion reads the group and
additionally checks the count is inside it.

**`npm test`: 320 tests, 299 pass, 21 fail** — the same 21.


---

## 30. Three editorial rules on the laws page

### 1. The reader is not the offender

*"Can I be jailed for poisoning stray dogs?"* asks a fair legal question of the
wrong person. Seven questions seated the reader in the offender's chair and are
now impersonal:

| Was | Is |
| --- | --- |
| Can I be jailed for poisoning stray dogs? | Can **one** be jailed for poisoning stray dogs? |
| Can I abandon my dog? | Can **one** abandon a dog? |
| Can I keep a dog chained all day? | Can **one** keep a dog chained all day? |
| Can I buy a puppy online or on the roadside? | Can **one** buy a puppy online or on the roadside? |
| Is it legal to shoot a dog on my farm? | Is it legal to shoot a dog on **a** farm? |
| Can I sterilise strays myself or through a private vet? | Can strays be sterilised privately, or only through the ABC programme? |

**The other twenty-five first-person questions were left alone**, deliberately.
"Can I report cruelty, and to whom?", "Can I rescue an abandoned or collapsed
horse?", "What can I do if the police refuse to register an FIR?" — the reader
really is that person, and putting them at a distance from their own complaint
would weaken the page. The rule is about who is cast as doing harm, not a ban
on the word. A test checks both directions, so the next pass cannot strip "I"
out wholesale.

### 2. No question headlines a token fine

*"What is the penalty for cruelty under the PCA Act?"* invites the answer *"ten
to fifty rupees"* — a line that tells an abuser what cruelty costs, and one that
travels alone in a search result.

The legal substance is kept and now leads. Both answers already said the PCA is
token and to charge under the BNS; they now open with the section that carries
five years and mention the PCA only as the one not to rely on. **No rupee
figure under ₹5,000 remains in any of the 200 answers.**

- *What is the penalty for cruelty under the PCA Act?* → **Which section
  carries a real sentence for cruelty?**
- *What is the penalty for equine cruelty?* → **Which section carries a real
  sentence for cruelty to a horse?**
- *What is the penalty for overloading dogs in crates or vehicles?* → **What
  can be done when dogs are overloaded in crates or vehicles?** — this one
  promised a penalty and never gave one; the answer is about stopping the
  vehicle and seizing the animals, which is the useful thing.

The Karnataka cattle Act (three to seven years, ₹50,000 to ₹5 lakh) and the
Wildlife Act (three to seven years) questions were **left as they are** — those
penalties are severe, and naming them works for animals rather than against.

### 3. No round total

"200 questions" reads as a target that was filled rather than a body of law
that happens to be that long. Removed from the lede, the meta strip, the count
element and the four part headings, and from the search entry. The count
element is still filled by the script with the live number as the reader
filters, which is where a count earns its place.

`search-index.json` carried all eight old phrasings and would have surfaced
them in search; rebuilt with `node build-index.js`. `test/laws-framing.test.js`
covers all three rules and the index.

**`npm test`: 327 tests, 306 pass, 21 fail** — the same 21.


---

## 31. Add buttons on the same line, always

The buttons stepped up and down the row: a card with a one-line title put its
Add roughly 43px higher than a card with a two-line title.

Two causes, and **neither fix works without the other**:

- `.grid` had `align-items:start`, so a card was only as tall as its own
  content and never filled its row. I added that in §12 and it was wrong.
- `.card__action` had `margin-top:2px`, so the action sat directly under
  whatever the title happened to end on.

Four rules, tested as a set because any one alone leaves the fault in place:

| Rule | Why |
| --- | --- |
| `.grid{align-items:stretch}` | the card is given the full row height |
| `.card{height:100%}` | and actually takes it — a stretched track does nothing on its own |
| `.card__action{margin-top:auto}` | the free space goes above the action, not below |
| `.card__tile{min-height:0;flex:0 0 auto}` | the tile keeps its square and does not absorb the space itself |

That last one is the flexbox fault from §23 again: a flex item's
`min-height:auto` lets its content override `aspect-ratio`, and the product
photograph is in flow inside the tile. Without it, making the card taller could
have stretched the tiles instead of moving the buttons.

Also checked, because it would undo the alignment for one card at a time: **Add
and the stepper it becomes are both 40px.** Different heights would leave a
card whose item is already in the bag sitting a few pixels off its neighbours.
There is a test.

Modelled a row of five cards with mixed title lengths: the spread between the
highest and lowest Add button goes from **43px to 0**.

`test/card-alignment.test.js` also asserts the generated pages inherit it — and
did its job immediately, failing until `product.html` and `quiz.html` were
rebuilt.

**`npm test`: 334 tests, 313 pass, 21 fail** — the same 21.


---

## 32. The laws page: what I checked, and what I cannot certify

**I cannot certify 200 legal answers as 100% correct, and I will not say I
have.** People may file an FIR on the strength of this page; a wrong section
number gets a complaint refused at the counter. That sign-off needs an advocate
practising in this area. What follows is the work that makes their pass short,
plus the corrections I could verify.

### Verified against sources

- **The Supreme Court judgment of 19 May 2026 is real**, and the page states it
  accurately. *In Re: "City Hounded by Strays, Kids Pay Price"*, 2026 SCC
  OnLine SC 894, Justices Vikram Nath, Sandeep Mehta and N.V. Anjaria, upholding
  the directions of 7 November 2025. Six answers rest on it; the sensitive-
  premises exception, the bar on blanket culling, the district ABC centre and
  personal liability of officers all check out.
- **BNS 2023 s.325** — "killing, poisoning, maiming or rendering useless any
  animal", up to five years, replacing IPC 428 and 429. Verified.

### Corrections made from that

**The page barely said the offence is cognizable.** "Cognizable" appeared four
times in 200 answers, though BNS 325 is cited eighteen. That word is the most
useful thing a complainant has at a police counter: it is what obliges the
officer to register rather than take a note and keep it. All three reporting
answers now say it plainly, and one adds that Section 325 applies to **any
animal, owned or not** — a reader looking at a stray would otherwise assume a
mischief-chapter offence needs an owner.

**One answer left the reader nowhere.** "Can one buy a puppy online or on the
roadside?" explained that the sale is unlawful and the buyer has no remedy, and
stopped. It now gives the pro-animal step: report the seller to the State Animal
Welfare Board, the authority those Rules make responsible for registration, and
Section 11 of the PCA Act where the animals are kept in conditions that cause
suffering.

### An audit you can re-run

`npm run audit:laws` lists every answer flagged for a reviewer's eye, then
every one of the 97 provisions with the answers resting on it — so a lawyer
reads by provision rather than hunting through 200 entries.

**A note on how that detector was built, because it matters.** Its first
version flagged 25 answers for "no route for the reader" — including "Do I need
a dog licence?", where answering the question *is* the answer. Narrowed to
answers that name a wrong without saying who to tell, it flagged six; three of
those turned out to give routes my word list did not know ("closed by the food
safety officer", "name the proprietor"). I added those words and stopped at
two, rather than keep adding until it reported zero. **Tuning a check until it
says what you want is not the same as fixing anything**, and its output is
labelled candidates, not verdicts. A test asserts the report keeps saying it
cannot certify correctness.

### What a reviewer should look at first

BNS 2023 s.325 · BNSS 2023 s.173, s.175(3), s.223 · PCA 1960 s.11(1) and s.3 ·
ABC Rules 2023 · SC 19 May 2026. Those six carry most of the page: 97 answers
between them.

`test/laws-audit.test.js` holds the structural guarantees — every answer cited,
no token fine, no offender framing, the court order dated, the reporting
answers stating cognizability.

**`npm test`: 341 tests, 320 pass, 21 fail** — the same 21.


---

## 33. Prescription upload

**Yes, an endpoint already existed.** `/api/pfa-submissions` takes images,
checks them by their bytes rather than their label, and stores them as private
Firestore documents beside the record. They can only be read back through
`/api/admin/attachment`, which is behind the admin guard, and are never
rendered on the site. So this uses that rather than adding a second way to
receive a file.

The button appears in the prescription notice, only on products where one is
actually required. It posts as a new kind, **`PFA-RX` — Prescription**, so a
prescription is not filed as a general form, and returns a reference the
shopper can quote.

### Two things the endpoint made necessary

**Phone photographs are too big.** The limit is 950 KB per image; a photograph
off a phone is several times that. `PFAForms.shrink()` scales to 1600px and
encodes at 82% quality in the browser, dropping to 60% if it is still over,
rather than bouncing someone off a size limit they cannot see.

**PDFs are not accepted** — the endpoint takes JPEG, PNG and WebP only. Rather
than an error code, the page says: photograph the paper, or export the PDF as a
picture.

### Two judgement calls worth your attention

**PFA is not the merchant.** Paws & Tails take the payment and dispatch the
order, and will ask for the prescription at their own checkout. The page
therefore does not claim this replaces that — it says you can send it to PFA
*or* give it to them at checkout. **This only saves the shopper a step if Paws
& Tails accept a prescription forwarded by PFA.** If they do not, the shopper
uploads twice, and the honest fix is to remove the button and leave the notice.
That is an agreement to confirm with them, not something I can settle here.

**A prescription is personal data.** It carries the owner's name, the animal's
details and a vet's registration, which makes PFA a data fiduciary for it under
the DPDP Act 2023 — for a transaction PFA is not party to. Worth a retention
rule (delete once passed on) and a line in the privacy policy before this goes
live. The page already says where the file goes and that it is not shown
anywhere.

`test/prescription-upload.test.js` covers the chain: the kind, the endpoint
accepting a real JPEG, a file that only claims to be an image being refused,
the shrinking, the PDF message, the root-absolute script path (this page is
served one level down at `/products/<handle>`), and that the attachment stays
behind the admin guard.

**`npm test`: 350 tests, 329 pass, 21 fail** — the same 21.


---

## 34. The product photograph opens the product page

Only the name linked. The photograph is the bigger target and the one people
aim at, so the tile is now the same link.

Three details rather than just wrapping it in an anchor:

**A product with no handle gets a plain frame, not a dead link.** There is
nowhere for it to go, and a link that goes nowhere is worse than no link.

**The tile is out of the tab order and hidden from screen readers**
(`tabindex="-1"`, `aria-hidden="true"`). Two links to one destination in every
card is a wasted tab stop and the same destination announced twice; the name
stays the accessible route and the tile is a mouse target. It is not focusable,
so `aria-hidden` on it is legitimate rather than the violation it would
otherwise be.

**Hovering no longer fades the photograph.** The global rule is
`a:hover{opacity:.65}`, which on a product photo reads as a rendering fault
rather than an affordance. The tile keeps full opacity and darkens its border
instead, which is the language the cards already use.

`product.html` had the same latent fault in its related-products grid — it was
already using `<a class="card__tile">` with a name link beneath it, so it had
the duplicate-link problem and would have faded on hover too. Both fixed
together.

Verified by lifting the card builder out of the page and running it: a product
with a handle produces the link with both attributes and the PRESCRIPTION badge
still inside it; one without produces a plain `div`.

**`npm test`: 354 tests, 333 pass, 21 fail** — the same 21.


---

## 35. Get Involved, and the Admin master-record rule

### The critical rule was already being broken

Before building anything I audited the admin routes for deletions.
`lib/routes/admin/circle.js` called `ref.delete()` in **four places**: a post,
all of its replies, an individual reply, and an entire member profile with its
joined list. What survived was a log entry with a 140-character excerpt. The
record was gone.

Moderation now **withdraws**. The original is copied into a `moderation`
subcollection, the parent is marked `status: 'withdrawn'` with who did it and
when, and the record and its history stay.

Two things that had to come with it, or the fix would have been worse than the
bug:

- **The text is blanked on the parent.** Every Circle member can read
  `circlePosts` and the browser did not filter on status, so leaving the text
  in place would have turned moderation into relabelling — the post would still
  have been readable by everyone.
- **The kept original is denied to browsers.** `circle-firestore.rules` now has
  `allow read, write: if false` on the `moderation` subcollections. The Admin
  SDK bypasses rules, so the panel can read them and nobody else can.
- `assets/circle.js` skips withdrawn records, so a member sees the post gone
  rather than a blank card.

`remove-profile` marks the profile removed and keeps it. Its "purge" option now
withdraws the member's contributions instead of destroying them.

**The action names are unchanged** (`delete-post`, `delete-reply`,
`remove-profile`), so the existing panel's buttons keep working — they simply
no longer destroy anything.

`test/admin-master-record.test.js` scans every server file for a delete and
fails with the file and line. Verified by putting one back: the suite fails.

### Get Involved

New page, and a nav link **to the right of The Wall on all 13 pages** that have
a nav. `product.html` needed the root-absolute form and gets it from the build.

**Volunteer** — a Learn section first, with the five areas as selectable cards
that say what the work actually is: Head Office, Shelters, Hospitals, Rescue
Operations, Laws. What you pick is sent with the application, and the form
refuses to send with nothing chosen. Then the form, then the stages, shown on
the page before you apply.

**Colony caregiver** — what the card is and, as plainly, what it is not: not a
permit, and no authority for PFA over your colony. Links to the law on feeding.
Then the application.

Both post to `/api/pfa-submissions`, so they are in the record system the moment
they are sent, with a reference the applicant keeps.

### Stages

Applications now have stage machines of their own, because "Being handled"
tells a volunteer nothing:

- **PFA-V** — Submitted → Under review → Shortlisted → Approved · Not taken
  forward · Withdrawn
- **PFA-CAREGIVER** — Submitted → Under review → Verified → Card issued · Not
  issued · Revoked

Every terminal stage is a refusal or a revocation. None of them removes a
record, and a test asserts no stage is named anything like deletion.

**Admin sections added:** Volunteers and Donations, alongside the existing
Submissions, Circle, Members, Colony caregiver cards, Payments, Store orders and the
tools.

### What I have not built, and why

**The admin panel's own interface.** `admin.html` is in the `PFA_UI_Content`
half and is not in this tree — I have only the read-only snapshot in
`_inline-extracts/`. So the sections, the stages, the audit trail and the
no-delete rule are enforced in the backend, where they cannot be got round by a
button; the panel needs its Volunteers and Donations tabs wired to the modules
now registered. Send me that half and I will do it.

**`npm test`: 362 tests, 341 pass, 21 fail** — the same 21. The new page was
caught immediately by the §23 cursor guard: it took the stylesheet that hides
the native pointer without the layer that draws one. Fixed before packaging.


---

## 36. The prescription control did nothing

My bug, and a plain one.

`product.html` writes its whole body with `innerHTML` inside `paint()`. I wired
the control at script load — `var input = $('#rxFile')` — and **`paint()` runs
afterwards**. So the element did not exist yet, the guard `if (!input || !send)
return;` fired, and the function returned silently. Nothing was ever wired.
Choosing a file did nothing; the button stayed disabled for ever.

Moving the call after `paint()` would not have been enough either: every later
repaint — a variant change, a thumbnail click — rewrites the body and destroys
any listener attached to those elements.

Fixed by delegation, which is what the rest of that page already does for
variants and thumbnails:

- the `change` handler is on `document` and matches `#rxFile` by `closest()`
- send is handled in the click handler the page already has
- the chosen image lives in module scope, not on the element
- `paintRx()` runs at the end of every `paint()`, so a photograph chosen before
  switching from 50mg to 100mg is still there afterwards instead of the button
  silently going back to disabled

### Why nothing caught it

`test/prescription-upload.test.js` passed throughout. It checked that the
markup was present, the endpoint accepted the image, the shrinking existed and
the attachment was private — all true, and all beside the point, because none
of it pressed the button.

`test/prescription-flow.test.js` renders the page through the real route, boots
it with the real `pfa-forms.js`, dispatches a `change` with a file, asserts the
button becomes enabled, clicks it, and asserts a `PFA-RX` request went out with
the image attached. Confirmed it catches the original fault by putting the
direct binding back: two tests fail.

That is the third time in this work a check has passed while the thing it
described was broken. The pattern is the same each time — asserting that the
parts exist rather than that the thing works.

**`npm test`: 366 tests, 345 pass, 21 fail** — the same 21.


---

## 37. Membership and The Circle removed

**No live page referenced either.** The four HTML hits for "circle" were SVG
`<circle>` elements. The whole surface was backend and the other half's assets,
so nothing on the site changes for a visitor.

### Removed

**17 files**, including `lib/member-auth.js`, `lib/routes/member/auth/*`,
`lib/routes/member-status.js`, `lib/routes/admin/circle.js`,
`lib/routes/admin/import-members.js`, `assets/circle.js`,
`assets/membership.js`, `assets/member.js`, `assets/patron-card-pdf.js`,
`assets/patron-dummy.js`, `circle-firestore.rules`, `THE-CIRCLE-NOTES.md`,
`tools/seed-circles.js`.

**Five routes** unregistered from `api/index.js`. All 33 that remain resolve —
a loader pointing at a deleted file would 500 on that path, so there is a test.

**Membership as a payment type is gone.** `parseMembership`,
`USD_MEMBERSHIP_PRICE` and the `PFA-MEM-` order prefix went with it, and
`parseType` no longer accepts it. It is refused explicitly rather than falling
through to a parser that no longer exists.

**In `lib/firebase.js`:** the member-record branch of transaction
verification, `computeMembershipValidity`, `getMember`,
`bulkImportLegacyMembers`.

**Admin sections:** The Circle, Members and Import register. Issue cards is now
colony caregiver cards only, and the payments blurb no longer promises memberships.

Also cleaned: the Patron card email, the member sign-in code email, the Patron
branches of the payment response page, the `membership.html` link on it, the
search index, MANIFEST.md and README.md.

### Kept, deliberately

**The colony caregiver card.** It is a different thing that happens to be a card, and
the colony caregiver work added in §35 depends on it. `verify-card` now serves
only `PFA-CCT-` numbers, and its error message no longer offers `PFA-MBR-` as a
format it accepts.

### Two things worth knowing

**§35's withdraw-instead-of-delete work went with `admin/circle.js`.** That
file was the only place in the tree that deleted records, and it is now gone
rather than fixed. **The no-delete guard in
`test/admin-master-record.test.js` still scans every server file**, so the rule
holds for everything that remains and for anything added later.

**11 tests covered removed features** and were deleted rather than left
failing or weakened to pass. `test/no-membership.test.js` replaces them: it
scans `lib/` and `api/` for any surviving reference, checks the files are
actually gone rather than merely unreferenced, checks every registered route
resolves, and checks the admin panel has no section without a feature behind
it.

That last check found real leftovers after I thought the job was done — a
Patron branch in the card printing batch, the `type must be patron or
caregiver` error message, and a `membership.html` button on the payment result
page.

**`npm test`: 351 tests, 330 pass, 21 fail** — the same 21.


---

## 38. Colony caregiver: the name, and a paid application

### The name

"Caretaker" is gone from **55 files**, and seven files and a directory were
renamed with it (`lib/caregiver.js`, `lib/caregiver-store.js`,
`lib/caregiver-mail.js`, `assets/caregiver-*.js`, `lib/routes/caregiver/`). A
test scans the whole tree and fails on any survivor.

**Two things were deliberately not renamed**, and they should be decided rather
than left to me:

- **The Firestore collection names** (`caretakerCards`, `caretakerPublic`,
  `caretakerApplicants` and the rest). Renaming a collection does not move the
  documents in it; it orphans them. That is a migration, not a rename.
- **The `PFA-CCT-` card prefix.** Changing it invalidates any number already
  issued.

If nothing has been issued in production, both are a few lines and I will do
them. If something has, they need a migration script.

The rename also broke eleven files on the first pass: `Caretaker` inside a
camelCase identifier became `Colony caregiver` — with a space — producing
`function createColony caregiverCardId()`. Caught by parsing every file rather
than trusting the replacement.

### No instant issuance

`/api/caregiver/apply` used to issue a card on the spot. It now returns **410**
with a message pointing at the Get Involved page. A card is not something a
stranger can give themselves.

### The application, and its number

The form on Get Involved is now a **real POST to `/api/payment/create`**, not a
fetch, because the browser has to end up on CCAvenue's page. **₹50**, fixed
server-side — a client that sends its own `amount` is ignored, and there is a
test for that specific trick.

On a **verified** payment the callback creates the submission record and mints
the application number, **`PFA-CG-2026-00001`** — short enough to read down a
phone. It carries the payment (order id, tracking id, bank reference) so the
panel can see the fee cleared without leaving the record, and it lands at
**Submitted** for a named person to move.

CCAvenue delivers the same callback more than once, so the reference is stored
back on the transaction and reused; a repeated callback cannot mint a second
number. `create()`, not `set()`, because the number was just issued.

The page now says what the fee is and what it is not: it confirms the
application and buys it a number, it is not payment for a card, and it is not
refunded if the application is refused, because it pays for the reading.

### A guard I chose not to weaken

`test/submissions.test.js` forbids `{ merge: true }` in **any** file that
touches a submission. My new code merged onto the *transactions* collection,
which is legitimate, but the rule is file-level and flagged it.

Rather than loosen a safety check to accommodate new code, the write became
`update()` — which is also more correct, since it asserts the transaction
exists rather than quietly creating one.

**`npm test`: 361 tests, 340 pass, 21 fail** — the same 21.


---

## 39. The header hung below the top of the page

The fixed header sits at `top: var(--ann)` — the height of the announcement bar
above it — and the shared stylesheet defaults that to **34px**.

**`product.html`, `quiz.html` and `get-involved.html` all took the stylesheet
and none of them has an announcement bar.** So the header floated 34px down the
viewport with the page scrolling through the empty strip behind it: product
photograph above the nav, "In stock" sitting where the bar should have been.

The shop does not have this problem because its `measure()` sets `--ann` to the
bar's real height, or zero when there is none. The three pages that inherited
its stylesheet never inherited that.

Fixed in two places, because one alone is not enough:

- **`:root{--ann:0px}`** in each page's own CSS block, so it is right at first
  paint rather than jumping once script runs.
- **A small `fitHeader()`** that re-measures `--nav` from the header's actual
  height on load and on resize. That one is not cosmetic: `--nav` is a
  hard-coded 69px, and the nav wraps to two lines on a narrow window, which
  tucks the top of the page underneath it.

`test/header-offset.test.js` checks every page: if it pins the header to
`--ann` and has no bar, `--ann` must resolve to 0 — and, the other way round,
a page that *does* have a bar must still reserve room for it. There is also a
test that the check itself notices when the override is removed.

Writing it repeated a mistake from earlier in this work: the first version read
`--ann` out of its own explanatory comment and reported all three fixed pages as
still broken. Comments are stripped before the rules are read.

**`npm test`: 366 tests, 345 pass, 21 fail** — the same 21.


---

## 40. Every page sits under the header the same way

The header is `position:fixed`, so nothing below it is pushed down
automatically — the first section of each page has to reserve the header's
height itself. Twelve pages do that through `.hero`; donate does it through
`.give`, with `padding-top:calc(var(--ann) + var(--nav))`.

**Three did not: `product.html`, `quiz.html` and `get-involved.html`** — the
three I generated or wrote. Each used:

    padding: calc(var(--band) * .55) …

`--band` is `clamp(76px, 8.5vw, 136px)`, so that reserved **42px to 75px
depending on the window**, while the header needs 69px. On a wide screen it
just cleared; at anything under about 1470px the top of the page slid
underneath the header. A fixed-height bar was having its allowance sized off
the viewport, which is why it looked right in one window and wrong in another.

All three now use the same shape as the rest:

    padding: calc(var(--ann) + var(--nav) + clamp(32px,4.4vw,72px)) …

### What I checked before changing anything

The layout tokens were already consistent — `--max`, `--nav` and the gutter
match on all thirteen pages, and the `--ann: 0px` on those three is correct
because they have no announcement bar. Every page also already re-measures the
header on resize. So the tokens were not the fault, and neither was the
fullscreen event: **the Wall's theatre is not browser fullscreen at all**, it is
a `position:fixed; inset:0` overlay, which is why it was never affected.

`test/page-shell.test.js` now holds the rule for every page: the first section
must reserve `--ann` and `--nav`, and must not size that allowance off the
viewport — the second check names `calc(var(--band) * …)` specifically, because
that is the mistake that was made. Founder is checked separately since it has
no `<main>`, and **the theatre is asserted to stay exempt**: fixed, inset 0,
and carrying no site chrome.

`index.html` is out of scope by design — it is a separate layout with its own
tokens and its own inline offsets. If you want it brought onto the shared
shell, say so; it is a bigger change than this one.

**`npm test`: 388 tests, 367 pass, 21 fail** — the same 21.


---

## 41. One header, everywhere

Comparing all fourteen headers turned up four separate faults, three of them
mine.

**1. `wall.html` had no "Get Involved".** Its own nav entry is
`<a href="#top" class="current">The Wall</a>`, so the pass that added the link
in §35 matched only the *footer's* `href="wall.html"` and inserted it there.
The Wall has been the one page without the link since.

**2. `quiz.html` and `get-involved.html` carried the shop's Cart** — and,
worse, **marked "Shop" as the current page**. That is the underline under Shop
on the quiz page in the screenshots. Both are generated from the shop shell and
inherited its furniture. The Cart is gone from both, the current marker is
right, and `build-quiz-template.js` now strips both on every rebuild, so it
cannot come back.

**3. `index.html` hard-coded `padding:0 16px` in six places** — the header and
four content sections. So the whole home page sat 16px from the edge while
every other page used the responsive gutter (48–72px, centred at 1440px on a
wide screen). **This is the difference you were looking at.** All six now use
`var(--g)`.

Its header was also pinned to a literal `top:34px` rather than the bar's
measured height, and it was the only page not re-measuring on resize. Both
fixed, so the home page behaves like the other thirteen.

**4. `donate.html` did not mark its own Donate link.** Added `aria-current` and
deliberately *not* the `.current` class: the Donate CTA is a filled button, and
the underline that marks a current nav link would read as a fault on it. Right
for a screen reader, unchanged to look at.

### The Cart

Kept on `pfa-shop.html` and `product.html`, removed everywhere else. A Cart in
the header of the Founder page is furniture that goes nowhere. If you would
rather have it site-wide, it is one line in the test and a paste into each
header — say so.

`test/header-consistency.test.js` asserts all fourteen list the same items in
the same order, that the Cart appears on shop pages and nowhere else, that no
page marks the wrong item as current or borrows one it has no entry for, that
no header uses a hard-coded gutter, and that a rebuild cannot restore the shop
furniture.

Writing it tripped my own §39 check: the home page's bar is `class="pfa-ann"`,
not `announce`, so the offset guard did not recognise it and called the page
broken. Widened rather than exempted — that is the third time a detector of
mine has known only one naming convention.

**`npm test`: 394 tests, 373 pass, 21 fail** — the same 21.


---

## 42. Get Involved shows one journey at a time

The page opened with everything on it: both explanations, both sets of stages
and both forms, one after the other. It now opens on the choice, and picking
Volunteer or the caregiver card shows that one and only that one.

- **The choice is in the address bar.** `#volunteer` and `#caregiver` are
  pushed, so a journey can be linked to, and the browser's back button returns
  to the choice rather than leaving the page.
- **A link straight to `#caregiver` opens it** — the two paths on the home page
  and anywhere else keep working.
- **There is a way back** at the top of each journey, so a wrong turn is not a
  dead end.
- **An unknown hash falls back to the choice**, not a blank page.

### Without JavaScript, both journeys are shown

The hiding hangs off an `is-guided` class that only the script adds. Hiding the
sections in plain CSS would have left a visitor without JavaScript looking at
two buttons that do nothing and no way to reach either form — strictly worse
than the page they had before. There is a test for it.

### Two faults found by driving it rather than reading it

**The chooser links matched on `href`.** The handler used
`closest('.gi__paths a[href^="#"]')`. That works in a browser, but it makes the
behaviour depend on a descendant selector resolving inside `closest()`, and it
is not obvious from the markup which links are chooser links. They now carry
`data-gi-open="volunteer"`, which says what they are for and needs no selector
subtlety.

**My own test passed a check it should have failed.** The no-JavaScript
assertion looked for `.gi__section{…display:none}` and matched it inside
`.gi.is-guided .gi__section{display:none}` — the guarded rule it was written to
allow. Anchored to a rule boundary.

Worth noting the shim limitation this exposed: `test/_dom-shim.js` resolves a
descendant selector by its last part only, so `querySelectorAll('.gi__paths a')`
returned the first `<a>` on the page — a nav link. The test was selecting the
wrong element and reporting the code as broken. Worth knowing when reading any
test that leans on a compound selector.

**`npm test`: 403 tests, 382 pass, 21 fail** — the same 21.


---

## 43. Removed the attribution line on founder.html

`<p class="sig">Adapted from the chairperson&rsquo;s message, People for
Animals</p>` is gone from the "In her words" section.

Two things went with it rather than being left behind:

- **The `.msg .sig` rule.** It styled that paragraph and nothing else, so it was
  dead the moment the line went. It also carried a `border-top`, which would
  have drawn a rule above whatever paragraph happened to come last if the class
  were ever reused.
- **The search index entry.** `search-index.json` is crawled from the pages, so
  it still held the sentence and would have surfaced it in site search.
  Rebuilt with `node build-index.js`.

The section now ends on Dr Norma Alvares and the Padma Shri, which reads as a
close in its own right.

**`npm test`: 403 tests, 382 pass, 21 fail** — the same 21.
