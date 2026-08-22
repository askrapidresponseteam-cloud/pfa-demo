## v1.41 — 22 Aug 2026

- **Checkout works without a Storefront token.** If `PFA_SHOPIFY_STOREFRONT_ACCESS_TOKEN` is absent, `/api/pfa-orders` hands the shopper to Shopify via a cart permalink (`/cart/<variant>:<qty>?attributes[PFA checkout reference]=…`). Address is typed on Shopify's page but order matching for webhooks still works. With the token present, the address-prefilled Storefront cart is used as before. Response reports `checkoutMode` and `addressPrefilled`.

## v1.40 — 22 Aug 2026

- Checkout shows the API's real error message (e.g. "Seller checkout setup is incomplete…") instead of a generic one.
- Location lookup trims "district" from district names.
- `VENDOR-EMAIL.md`: the exact request to Paws & Tails for the Storefront token, Headless publishing, webhook registration + secret, token rotation.
- Handbook: working folder is `~/PFA_Full_Website`; deploy by `git push` only; rollback recovery; patches instead of zips.

## v1.39 — 22 Aug 2026

- **Fix: "Fill PIN, city and state from my location" always failed** in checkout because it called `/api/location-lookup`, which did not exist. Added `lib/routes/location-lookup.js` (BigDataCloud → OpenStreetMap → India Post fallback, India only).
- **Store checkout enabled.** `store.html` gated live orders behind `window.PFA_COMMERCE.liveOrders`, which nothing ever set, so "Pay securely" always stopped with "not connected in this build". New `assets/commerce-config.js` turns it on; set `liveOrders:false` to pause the store.

## v1.38 — 22 Aug 2026

- **Real product pages: `/products/<handle>`.** Until now a product only existed as a quick-view modal with no URL, so site search, shared links, bookmarks and Google all dead-ended at a 404. Each product now has a server-rendered page (same single Vercel function: `lib/routes/product-page.js` + `product.html` template) with proper title/description, Open Graph image and price for WhatsApp previews, JSON-LD for Google, gallery, variant pills, stock, quantity, Add to bag / Buy now (shared bag with the store), prescription notice, a mono "product label" panel, description and related products. Search index (913 entries) now links there; store card titles and the quick-view modal link to it; `store.html?bag=1` / `?checkout=1` / `?category=` let the page hand back to the store.
- **Fix: 404 page rendered unstyled** under nested paths — asset and nav paths are now absolute.

## v1.37 — 22 Aug 2026

- **Single Vercel function.** All 23 API handlers moved to `lib/routes/`; `api/index.js` routes every `/api/*` request via a rewrite in `vercel.json`. Fits Vercel Hobby's 12-function limit. Public URLs unchanged.
- **Shopify order webhooks** (`/api/webhooks/*`): HMAC-verified receiver for orders/create, orders/paid, orders/fulfilled, fulfillments/update, orders/cancelled, refunds/create. Orders mirrored to Firestore `storeOrders`, matched to the shopper via the `PFA checkout reference` cart attribute.
- **Live order status.** `/api/pfa-order-status` now reads real data (`?token=` for the store page, `?id=PFA-ST-…` for tracking). `track-order.html` reads the API instead of localStorage.
- **Catalogue Admin API mode** (optional, `PFA_SHOPIFY_ADMIN_TOKEN`): cursor pagination, stock levels.
- Cron reduced to daily (Hobby limit). Email worker can be triggered manually.
- New: `HANDBOOK.md` (operations, lessons, runbooks), `.claude/skills/pfa-website/SKILL.md`, 13 webhook tests (116 total).

# PFA Website Changelog

Every release gets: a version, a date, what changed, and why.
Zip naming convention: `PFA_Full_Website_v<version>_<YYYY-MM-DD>.zip`

---

## v1.35 - 2026-08-22

- **Patron card type sized for a real card.** On the printed 85.6 mm card the name is now about 12 pt, the member number 8 pt, dates and address 6.5 pt, labels and footer 4 pt. Preview and PDF share the renderer, so both changed together.

## v1.34 - 2026-08-22

- **Patron card: one renderer for screen and print.** The sample PDF looked nothing like the preview because the preview was HTML/CSS and the PDF was a separate canvas drawing. `assets/patron-card-pdf.js` is now the only design: it paints the live preview on membership.html and member.html (a canvas in each face, repainted whenever the card's data changes) and the PDF and PNG are the same functions at 600 dpi, generated from the live card element itself. What is rendered is what prints, by construction. The existing markup and scripts are untouched; the canvas reads name, number, dates, photograph and address lines from the `data-patron-*` elements they already update. PDF pages are painted edge to edge for the print vendor.

## v1.33 - 2026-08-22

- **Caretaker card photograph no longer clipped.** The card drew the photo into a landscape band (4:3 wide), so every passport-shaped portrait was scaled to the band's width and lost the top of the head. The well is now portrait 3:4 (252 x 336 on the 340 x 540 artwork), centred: the shape a passport photo already is, so it fits without cutting. The editor takes its frame ratio from the card renderer (`PFACaretakerCard.PHOTO_ASPECT`) so the two cannot drift apart again, and when a photo is taller than the frame the crop starts near the top, where the head is.

## v1.32 - 2026-08-22

- **Photograph: one control, not two.** On the caretaker and Patron forms the empty photo frame is the upload button ("Tap to add a photograph"); the separate "Choose a photograph" box is gone. Once a photograph is in, a "Change photograph" button sits under the frame. Keyboard-operable.
- **Sample Patron card (testing only, remove before launch).** The membership form has a "Download a sample card PDF" button in a marked box: builds the Patron card PDF on the device with no member number, no payment, nothing saved. Remove by deleting `assets/patron-dummy.js` and the DUMMY-GEN block and script tag in `membership.html`.
- **Patron PDF works from disk.** The emblem is embedded in `patron-card-pdf.js` so a file:// page no longer taints the canvas; the number line is omitted when a card has no number. `membership.html` referenced a missing `media/pfa-card-mark.png`; it now uses the emblem.

## v1.31 - 2026-08-22

Each delivered zip from here on carries its own version number; this release consolidates everything delivered today after v1.30 (header, PDFs, address journey, visible submit errors, dummy card generation).

## v1.30 - 2026-08-22

Platform-wide data-entry and quality-control pass.

- **Cards as PDF.** Both the Colony Caregiver card and the Patron card now download as a print-ready PDF: two pages at true card size (54 × 85.6 mm portrait and 85.6 × 54 mm landscape), 600 dpi. The caretaker issued screen gains a Download PDF button beside the PNG; the member page's old text-file download is replaced by Download card PDF and Download PNG. New `assets/patron-card-pdf.js` draws the Patron card on canvas and shares the PDF writer in `caretaker-card.js`.
- **Home page quote.** "When the heart opens, / it opens for all." now sits on exactly two lines at every width, the second line in PFA blue. The size is driven by the column width (`cqw`) so neither line can wrap.
- **Address journey (every form: caretaker, Patron, replacement card, Give, store checkout).** The address fields are always visible, in postal order: house and street, then PIN, district and state on one row. The location button is now a helper beneath them ("Fill PIN, district and state from my location"), the separate "Enter address manually" button is gone, and typing a PIN still fills district and state. Detected values show a "Not right? Change it" link that unlocks the fields, so nobody is stuck with a wrong district. Every status message on the site now says what to do next in plain words ("Type the PIN code and we fill district and state"); the words "manually", "locked" and "mode" no longer appear anywhere a person reads.
- **Card submission failures were silent.** The global `.error{display:none}` rule (for field messages) also hid the status line under "Issue my card", so any failure looked like nothing happened. The status line is now always visible when it carries an error, scrolls into view, and says exactly what went wrong: a page opened as a file (`file://`) cannot reach the PFA server; a static host without the API says so; incomplete details name the problem and jump to the first bad field. Same for the replacement-card form.
- **DUMMY CARD GENERATION (testing only, remove before launch).** The caretaker form has a clearly marked "Generate a sample card on this device" button that issues the card with no server and no Firebase: no card number, no signature, placeholder QR, nothing stored, printing disabled. The PDF and PNG downloads work on it. To remove: delete `assets/caretaker-dummy.js` and the `<!-- DUMMY-GEN -->` block plus script tag in `caretaker.html`; nothing else references them. The card renderer now also omits the "ID ·" line when a card has no number.
- **Header.** Stories, The Wire and Adopt removed from the desktop nav and the mobile drawer on every page (they remain in the footer). Store, Get involved and Members are now sharp-edged outlined buttons in their own colours that fill on hover and show filled on the active page (`.nav-cta` in `assets/header-footer.css`).

- **One rule file, every field, both sides.** `assets/field-rules.js` now carries a keystroke `filter`, a stored-form `normalise` and a `check` for every kind of field, keyed by name or id. It covers every control on the site, including the ones scripts render later (Circle profile, checkout, Get to Learn, Wildlife Gauntlet). The API routes (`lib/caretaker.js`, `lib/payment.js`, `api/pfa-orders.js`, `api/caretaker/replace.js`, `api/admin/import-members.js`) run through the same file via `parseFields`, so a direct POST cannot store what the form would refuse.
- **No digits in names, no letters in numbers.** `site.js` filters every keystroke and paste site-wide: name, district, state and city fields drop digits and symbols; mobile, PIN, amount and code fields keep digits only; a pasted `+91` or leading zero is stripped from a mobile. `maxlength`, `inputmode` and `autocapitalize` are set from the rule. The caret stays where the person was typing.
- **Title Case on every card.** Names, addresses, districts and states are put into Title Case on blur, in the live card preview, in the stored record and wherever an older record is displayed (card canvas, public verification page, member page, admin tables). `RAO` is `Rao` in a name; `MG Road` and `HSR Layout` keep their initialisms in an address; `12b` becomes `12B`. Applies whether the address was typed or filled by the Location button. Patron card no longer forces uppercase.
- **Field mapping fixes.** The Patron number field on the Meeting form was validated as a person's name and rejected `PFA-MBR-` numbers. Three pages used `require` instead of `required`, so those fields were never mandatory.
- **Firestore.** `circleProfiles` writes now require a valid name (no digits or markup), a lowercase handle, and digit-free city and state, with length caps, in both rule files.
- **Copy.** Inline error messages, labels and placeholders made consistent and specific across all forms; "Patron ID" is "Patron number"; comma spacing fixed in the product index; membership address cap raised from 48 to 160 characters so real addresses no longer clip.
- **Behaviour.** An empty field is no longer flagged red when tabbed past; only a filled-but-invalid entry is, and submit still catches empties.
- 66/66 tests pass, including 11 new in `test/field-rules.test.js`. Verified in headless Chromium on caretaker, membership, meeting, give and checkout pages.
- Open decision: the membership page offers a ₹365 digital-only option while the server prices every INR membership at ₹514 with the printed card. Server rule kept; page needs aligning once PFA confirms.

---

## v1.16.1 - 2026-08-21

- **The portal is in the site's theme.** It already inherited the type and palette by linking `site.css` - body in Archia, headings in Clash Display, `--blue` - but carried none of the mark. It now opens with the PFA logo, an eyebrow and a headline exactly as a page of the site does, and the signed-in view has a branded header bar: logo, an **Admin** label, the signed-in address and Sign out. The bar is the same 78px as the public header and uses the same white, hairline border and blur.
- **It links `assets/header-footer.css` too**, so brand values stay in one place and a change to the palette or the type reaches the portal without a second edit.
- **No public navigation, deliberately.** A member's route through PFA is not an administrator's, so the portal takes the mark and the type but not the nav.
- **Fixed the same word-space fault the public pages had.** The tab read "VERIFY ACARD" - uppercase micro-type in Clash Display closes its word spaces, and the generated correction in `site.css` covers the public classes, not the portal's own. The portal's controls now carry it: tabs, table headers, pills, row buttons and metric labels.
- 55/55 tests pass. Files changed: `admin.html`.

---

## v1.16.0 - 2026-08-21

- **The admin portal is now a working desk, not just two registers.** Seven tabs: Overview, Submissions, Members, Caretakers, Payments, Store and Verify a card.
- **Every form submission arrives in one queue, by category.** All twelve categories the intake route already accepts - adoption, story, help desk, case follow, volunteer, service, wire report, corporate, CineKind, meet, podcast, general - are filterable by category and status, newest first. The overview lists how many are waiting in each and links straight into that queue.
- **Submissions can be worked, not just read.** Taking it / Done / Spam via `POST /api/admin/submission-status`. A register you can only read is a list; a register you can mark is a queue - without it two people work the same complaint and a third is missed. `handledBy` comes from the administrator's own token rather than the browser, so the trail cannot be forged.
- **Payments are visible.** `transactions` - membership and caretaker card payments through CCAvenue - with who paid, how much, and whether it completed.
- **Store orders are in Shopify, and the panel says so rather than pretending.** Checkout runs through the Shopify Storefront API, so orders live in the Shopify admin; `storeCheckoutIntents` in Firestore is only an idempotency lock, not an order record. The Store tab links out. Mirroring Shopify into Firestore with a webhook is possible but is real work, and is called out as a decision rather than done silently.
- **The overview is built from `count()` aggregations**, billed as a few reads rather than one per document, so the first screen an administrator opens does not become the most expensive thing on the site. The 30-day payment total does read documents, so it is capped at 500 and says so when it hits the cap.
- **`BACKEND-SETUP.md` gained the composite index** the submissions queue needs (`kind`, `status`, `receivedAtMs desc`) and how to create it from the error URL in the Vercel log.
- 55/55 tests pass. Files added: `api/admin/metrics.js`, `api/admin/submission-status.js`. Files changed: `admin.html`, `api/admin/records.js`, `BACKEND-SETUP.md`.

---

## v1.15.2 - 2026-08-21

- **`assets/firebase-config.js` filled in** with the real web app config for project `pfa-new-website` (project number 494074297632). The panel now starts instead of refusing: config confirmed loading in the browser, sign-in enabled, placeholder warning gone.
- These four values are public by design - the web API key identifies the project to the SDK and Google documents it as safe in page source. The service account key, which is the secret one, stays out of the repository and belongs only in Vercel's environment variables.

---

## v1.15.1 - 2026-08-21

- **The Firebase web config moved into `assets/firebase-config.js`.** Three values in one file, read by the admin panel and later by the member area, rather than edited inside `admin.html`. The file states plainly that the web API key is not a secret and that the service account key must never go there.
- **The panel now says what is missing instead of failing quietly.** With the config unfilled it names the file and the console path and disables the sign-in button. Those checks run in a plain script, not the module: an ES module whose CDN import fails - no network, a blocked CDN, a proxy - aborts silently and would otherwise leave an inert form with no explanation, so a separate timeout reports that too.
- **Setup guide updated for the state the console is actually in.** Added the missing step - registering a web app when Project settings shows only "Add app" - and the trap that the project **ID** is not the display name ("PFA New Website" is `pfa-new-website-…`). Added a note that Blaze is more than this needs, since Firestore and Auth sit in the free tier and nothing uses Cloud Functions, with a pointer to setting a budget alert.
- 55/55 tests pass. Files added: `assets/firebase-config.js`. Files changed: `admin.html`, `BACKEND-SETUP.md`.

---

## v1.15.0 - 2026-08-21

- **Admin panel at `/admin.html`.** Staff sign in with Firebase email and password; the panel then reads the two registers - `members` and `caretakerPublic`, kept separate exactly as they are in Firestore - and can check any card number. It is a tool, not a page of the site: no header, no footer, `noindex`, and absent from the search directory.
- **One admin login replaces two shared secrets.** There were two schemes - `x-admin-key` on member import and a `Bearer` token on caretaker shipments - and the import route's own comment called it "a minimal stopgap until a real admin panel/login exists". `lib/admin-auth.js` now accepts a Firebase ID token carrying an `admin: true` claim, which is the **same claim `firestore.rules` already checks**, so the panel and the database agree about who is an administrator instead of each deciding separately. Both old secrets still work and the result reports which one let a caller in, because removing them in the same change would take the site down if one were missed - they should be deleted once the panel is in use.
- **The first administrator is made from the command line**, not from a web route: `node scripts/grant-admin.js you@peopleforanimalsindia.org`. There is deliberately no endpoint that grants the claim, so there is never a moment when an unprotected route could mint an admin.
- **`GET /api/admin/records`** answers session, members and caretakers behind that guard. Search is a direct document lookup on card number, plus mobile for members - Firestore cannot do substring search without a search service, and that is not worth adding until the registers are large enough to need it. Browsing pages on document id, so there is no composite index to maintain.
- **`BACKEND-SETUP.md`** documents the wiring in order - service account, the environment variables including `PFA_AUTH_PEPPER` and `PUBLIC_SITE_URL`, deploying `firestore.rules` (which Vercel does **not** do), creating the first admin, and filling in the web config. Each step ends with something checkable, and it is explicit about what is not built and that none of the Firebase code has been run against a live project.
- 55/55 tests pass. Files added: `admin.html`, `lib/admin-auth.js`, `api/admin/records.js`, `scripts/grant-admin.js`, `BACKEND-SETUP.md`.

---

## v1.14.1 - 2026-08-21

- **The total was sitting on the form's border.** `.form-body` carries the 24px padding, and the v1.10.0 edit that removed the stray `</div>` tags closed it one block too early - so the total, the pay button and the fulfilment note fell outside the padded area and pressed flush against the shell. The block is back inside the body; measured at 25px clear on the left and right, matching every other row in the form.
- **Square corners are now stated rather than assumed.** The side toggle already computed to `border-radius: 0` and nothing in the stylesheets rounded it, so the corners are pinned to zero for the toggle, the chips and the buttons - a statement of intent so a broad radius introduced later cannot quietly round them.
- **Checked the same block on the other forms.** `caretaker.html`, `checkout.html`, `give.html` and `lost-card.html` were measured for the same fault; only membership had it, and give.html's action row already cleared at 25px.
- 55/55 tests pass. Files changed: `membership.html`, `assets/site.css`.

---

## v1.14.0 - 2026-08-21

- **The header and footer are one shared component now.** `assets/header-footer.css` holds the only definition of both, and every page links it **last** - after `site.css`, after `journey.css`, and after `index.html`'s own inline `<style>`. Loading last is what makes it authoritative, so a page cannot quietly disagree with it again.
- **This was the cause of the missing colours on the home page.** `index.html` is self-contained and does not link `site.css`, so it carried its own copy of thirty-six header and footer rules. The nav markup had been updated everywhere, but the colours only ever existed in `site.css`, which the home page never loaded. The two copies had also drifted apart in a way nobody would notice until it mattered: a `position:sticky` header on the home page against `position:fixed` on the other thirty-six.
- **Verified identical rather than assumed.** Header position, header height, the three nav colours, nav item count and footer padding were measured on `index.html`, `network.html`, `store.html` and `membership.html` and match across all four. The only variation is the darker shade on whichever destination is the current page, which is the active state doing its job.
- **The home page still behaves.** Moving it from sticky to fixed could have broken the entrance, so it was checked: the opening scene sits flush under the header at 78px with no overlap, and the header stays pinned at the top through scrolling.
- **Finished the Hospitals to Units rename in the copy.** The header was renamed in v1.10.0 but "Hospitals & Rescue" survived in the footer column heading and the home page door card on 37 pages. Two mentions are deliberately left: they are sentences describing the hospitals PFA actually runs, not navigation labels.
- 55/55 tests pass. Files added: `assets/header-footer.css`. Files changed: all 38 pages.

---

## v1.13.1 - 2026-08-21

- **Members is a nav heading, not a chip.** It was added as a bordered green button in the header actions, which made it read as a third call to action beside Donate. It now sits in the desktop nav with the other destinations, in the same size and weight, and in the mobile menu after Get Involved.
- **The three destination headings each carry their own colour** - store in PFA blue, get involved in rust, members in green - with the rest of the nav left in ink and grey. Colour is the only thing separating them, so the bar stays a row of headings rather than turning into a row of buttons. The active underline follows the link's own colour instead of reverting to ink.
- Nine items now sit in the bar; checked at 1500px and 1280px with no wrapping. Files changed: all 37 pages, `assets/site.css`.

---

## v1.13.0 - 2026-08-21

- **The address control is one component now, used everywhere.** Six pages captured an address and each did it differently: membership had no "use current location" at all, lost-card had no manual escape, give.html used a private `.feed-location-action`, and only store.html hid the manual fields until they were asked for. All six now use the same `.location-line` block - locate button, status line, manual escape - and the same behaviour behind it.
- **The crowding is fixed at the cause, not the instance.** The button sat flush against the chips above it because the control carried a bottom margin and no top margin. It now has a 20px top margin in `site.css` and in `journey.css`, which overrides it on the journey pages, so both routes agree. A spacing rule for stacked blocks inside forms was added so the next control dropped into a form cannot land flush against its neighbour either.
- **Manual fields stay out of the way until asked for.** The address grid is marked `data-pfa-address-fields` and hidden; using the location button fills and reveals it, and the manual escape opens it directly.
- **Two faults that hiding the fields would have introduced, found by testing and closed.** A hidden field that is still `required` makes a browser refuse to submit while pointing at something nobody can see. Required flags are now suspended while a block is hidden and restored when it opens. Membership sets those fields required *after* load, when the printed card is chosen, so a `submit` listener would not have caught it - and when validation fails the submit event never fires at all. The `invalid` event is used instead, which does fire: the block opens and the cursor lands in the offending field. Verified: submitting membership with the address hidden and required now reveals it rather than dead-ending.
- Files changed: `assets/pfa-location.js`, `assets/site.css`, `assets/journey.css`, `membership.html`, `caretaker.html`, `checkout.html`, `give.html`, `lost-card.html`.

---

## v1.12.0 - 2026-08-21

- **Member sign-in, built on what is already here.** No Cloud Functions and no new infrastructure: the Vercel routes already run `firebase-admin` with a service account, so `POST /api/member/auth/start` posts a one-time code and `POST /api/member/auth/verify` spends it and returns a Firebase **custom token**. That keeps the member-number lookup private - there is no public `memberId -> email` collection for anyone to enumerate - at no cost beyond the Firestore reads you already pay for.
- **The codes are PFA's, not Firebase's.** Firebase never sends an email here. Codes are generated server-side and delivered through the existing Resend pipeline as `People for Animals <cards@peopleforanimalsindia.org>`, using a new `member_login_code` template in the same house style as the card emails. Firebase only holds the authentication.
- **Passwords are held by Firebase Auth and by nothing else.** A password supplied at verification is passed straight to `admin.auth().updateUser` and is never written to Firestore, logged or returned. Only a `hasPassword` flag is stored. The one-time code is stored as a salted SHA-256 hash and compared in constant time, so a Firestore dump yields nothing reusable and the code cannot be guessed a character at a time.
- **The member number is a username, never a credential.** It is printed on a card that can be photographed, so every route that turns an ID into a session requires the emailed code or the password. `start` answers identically whether or not the member exists, so it cannot be used to discover which numbers are real. Codes expire in ten minutes, survive five wrong attempts, are single-use, and are rate-limited to one a minute.
- **Caretakers are excluded structurally, not by a check that can be forgotten.** A member's Firebase Auth uid *is* their `PFA-MBR` number, and no auth user is ever created for a `PFA-CCT` number - so no token exists that could satisfy a rule in the Membership Area. Their card stays readable at its own public URL, which is a different thing from an account.
- **`firestore.rules` added.** The browser starts with no read access to anything; the API routes use the admin SDK and bypass rules. A signed-in member may read their own `members` document and nothing else; the caretaker collections and everything financial are admin-only or closed outright, and a catch-all denies anything added later until someone decides otherwise.
- **`GET /api/verify-card?id=` added.** One number to check either card family against. It answers only what a person holding a card needs - the holder's name, the card type, and whether it is in date - and never the record behind it. Caretaker checks read the existing `caretakerPublic` projection rather than the applicant record.
- **Cards download as both sides**, and **Members is in the header** with Store in PFA blue, Members in a green chip and Donate keeping the gradient.
- **Fixed a stale test.** `store typography matches the PFA visual system` still asserted the Helvetica stack replaced back in v1.8.0. It now asserts the Clash Display + Archia system is wired, including that synthesis is off. 55/55 pass.
- Files added: `lib/member-auth.js`, `api/member/auth/start.js`, `api/member/auth/verify.js`, `api/verify-card.js`, `firestore.rules`.

---

## v1.11.0 - 2026-08-21

- **Cards download as both sides.** `downloadPng` saved only the side it was given. It now saves front and back when asked for "both", while an explicit `front` or `back` still returns one side, so the per-side buttons are unaffected. The button on the issued screen now reads *Download card (front & back)*.
- **Members is in the header, and Store and Members each carry their own colour.** Store is set in PFA blue, Members in a green outline chip, and Donate keeps the blue gradient - three neighbours that no longer read as one block. Applied to all 36 pages that carry a header. Members collapses below 1180px so the bar does not crowd.
- **Reverted the browser-side card issuance added in v1.10.0.** That change was made on the assumption this was a static build. It is not: `api/caretaker/apply.js` issues the card through `lib/caretaker-store.js` and persists it to Firestore, then queues the issuing email. Minting an ID in the browser would have produced card numbers that exist on no record in Firebase and cannot be verified by anyone. The application posts to the API again and surfaces a real error if it cannot reach it.

---

## v1.10.0 - 2026-08-21

- **The Caretaker card photograph was cropping the head off.** The editor framed at `85.6/54`, a tall portrait, while `assets/caretaker-card.js` draws the photograph into a landscape band (`photoW * 3/4`). A tall crop cover-drawn into a wide box loses the top and bottom, which is why the face was cut. The editor now frames at exactly `3/4`, the ratio the card prints, so what is framed is what appears - the same fix the Patron card needed.
- **Framing no longer starts centred.** Centring is wrong for a portrait: whenever the frame has to crop vertically, the part worth keeping is the face, which sits in the upper third. The crop now starts high and can still be dragged anywhere. This applies to both cards.
- **The digital card is issued on submission, and the printing fee is optional.** The application posts to `/api/caretaker/apply` as before, but if that endpoint is unreachable - which it is on a static build - the card is now issued locally rather than failing with "No connection", so nobody is left at a dead end. The issued screen no longer reads "One step left: pay for printing"; it states that the digital card is complete with nothing to pay, and offers the printed card at ₹100 as an optional extra.
- **Card numbers are generated.** A unique ID in the existing `PFA-CCT-XXXXXXXX` format is produced from `crypto.getRandomValues` plus a time component, using an alphabet with no O/0 or I/1 so it can be read aloud and written down without ambiguity.
- **The year on the card was already dynamic** (`new Date().getFullYear()`); the 2026 on the sample is simply the current year, and it will read 2027 next year with no change.
- **Hospitals is now Units, everywhere.** All 37 pages carry one canonical header: units, stories, the wire, learning, adopt, cinekind, store, **get involved**. Five slightly different versions of that nav existed across the site; they are now generated from a single list, with the active item derived from the page - including detail pages, so `hospital.html` highlights units and `caretaker.html` highlights get involved.
- **The Units page is a directory again, not a complaints desk.** It opened with "Tell us what happened." and put the unit list below a helpdesk. It now opens on the network itself - *Every unit. Every city. Every day.* - with search and the unit grid as the centrepiece. The reporting form is kept, because reporting an animal in trouble is a real need, but it sits below the directory and is framed as "Something not right?" rather than as the page's purpose.
- **The large empty panel on that page is gone.** It was `.location-status`, whose `flex:1` made it stretch to fill every spare pixel of the hero's flex column. It is a single line of reassurance and is now set as one - 14px tall instead of a 300px box.
- Files changed: all 37 pages (header), `network.html`, `caretaker.html`, `assets/caretaker-flow.js`, `assets/photo-editor.js`, `assets/site.css`.

---

## v1.9.0 - 2026-08-21

- **The entrance is now the founder, full frame.** The locker wall and its opening gate on `index.html` are replaced by the supplied portrait of Smt. Maneka Sanjay Gandhi, set to the full height of the viewport. Her words - *When the heart opens, it opens for all.* - the attribution, the standfirst and **Enter PFA** all remain, set beside her on desktop and beneath her on narrow screens.
- **She is never cropped.** The portrait uses `object-fit: contain`, never `cover`, so the whole figure always fits inside its box whatever the viewport. Verified by measurement rather than by eye: at 1440x900, 1920x1080 and 390x844 the drawn image fits inside its box on both axes, while still filling 91-93% of the viewport height on desktop.
- **The supplied file was mostly empty white.** The figure occupied only about 20% of the original 1537x1023 frame. Cropping to her bounding box (plus a small margin, so nothing of her is lost) gives a 369x993 portrait, which is what lets her fill the height instead of sitting as a small shape in the middle of a wide picture.
- **The photograph's ground is now transparent.** Its white measured 254,254,254 against the page's 255, which drew a faint rectangle around her. Near-white is now cleared to transparent with a short feathered ramp, so she sits on the page with no visible edge and will still sit cleanly if the background ever changes.
- **Caution on resolution.** In the supplied file she is only about 308x920 real pixels, so at full viewport height the browser is enlarging her and she will look soft, most visibly on large or high-density screens. Nothing in the code can add detail that is not in the file; a larger original would fix it and would drop straight in over `media/maneka-gandhi.*`.
- Files changed: `index.html`, plus `media/maneka-gandhi.png` and `media/maneka-gandhi.webp` (new, 45 KB WebP served first with a PNG fallback).

---

## v1.8.2 - 2026-08-21

- **The Champion pass shows the real logo again.** `champion.html` carried `.ticket-top img{filter:brightness(0) invert(1)}`, which flattens every pixel to solid white. That kept the wordmark readable on the dark pass but destroyed the emblem - the bird-in-hands artwork collapsed into a white blob. The filter is removed and `media/pfa-logo.png` is shown as drawn, on a white plate so the blue emblem and the black wordmark both read against the dark card. A sweep found this was the only destructive logo filter on the site; every other page already uses the logo as supplied.

---

## v1.8.1 - 2026-08-21

- **"iswaiting" was a typo in the copy, not a spacing fault.** `adopt.html` carried `Someone here iswaiting for you.` in both the hero `h1` and the section `h2` - the space is missing from the markup itself, so no amount of letter-spacing would have separated it. Both fixed. A scan of the visible text on all 38 pages found no other joined words.
- **The display weight is now Medium.** The site declared 650-900 throughout, which Clash Display rendered at its Bold. Every weight of 650 and above across the stylesheets, page `<style>` blocks and inline `style` attributes is now 500. Elements the browser defaults to bold on its own - headings with no declared weight, and `strong`, `b`, `th` - were still coming through at 700 and are pinned to Medium too.
- **Micro-labels keep Semibold, deliberately.** At 9-11px with wide tracking, Clash Display's Medium goes faint and the labels stop holding against the body copy. Uppercase micro-type is set at 600, selected by the tracking and size that mark it as micro-type rather than by hand. The type the page is actually read by stays at Medium.
- **The composite family split moved with the weights.** `"PFA Sans"` previously handed 100-500 to Archia; with the display type now at 500 that would have thrown every heading into the body face. The split is now 100-400 Archia, 401-900 Clash Display.
- **Word-spacing is handled once, not per selector.** The previous pass corrected only uppercase labels, so bold non-uppercase text - form labels, currency chips, the summary values - was still closing up. `word-spacing` inherits, so it is set once on `body` and switched off again for running copy, which is Archia and correctly spaced already. Label classes carry their own value and win on specificity.
- Verified across all 38 pages: correct faces everywhere, nothing rendering heavier than Semibold, no font 404s.

---

## v1.8.0 - 2026-08-21

- **The site is set in Clash Display and Archia.** Clash Display carries the display register - headings, large figures, buttons, uppercase labels, the card name - and Archia carries running body copy, leads, form fields and help text. Both are self-hosted from `assets/fonts` (about 63 KB of woff2, with a woff fallback); no external font requests. Both licences ship alongside them, and Archia's webfont licence is a commercial one that should stay with the project.
- **Archia has one weight, so it is never asked to be bold.** The site declares heavy weights constantly - 46 uses of `font-weight:900` in `site.css` alone - and a single-weight face under those declarations would be synthesised into a smeared fake bold. Rather than rewrite 78 weight declarations, `"PFA Sans"` is registered as a composite family: 100-500 draws Archia, 501-900 draws Clash Display, so every element lands on the right face from the weight it already carries. Clash is loaded as its variable font (200-700), so the 750-900 values clamp to a real Bold. `font-synthesis-weight:none` closes off synthesis entirely.
- **The display scale was re-tracked for the new face.** The headings were tracked as tight as -.064em in `site.css` and -.08em on the home page to make Arial read as a display face. Negative tracking shrinks the word space as well as the letter gaps, and Clash Display is already tight, so headlines closed up until words touched - "One rupee" read as one word. Every display headline is eased to roughly half its original tracking with a little word-space returned. Archia's running text is untouched; its spacing was already correct.
- **Uppercase labels corrected from the stylesheet itself.** At label sizes with wide letter-tracking, Clash's narrow word space made "ENTER CINEKIND" read as one word. The correction is applied to a selector list generated from every rule that sets `text-transform:uppercase`, so it lands on exactly the text that needs it and nowhere else.
- **The printed Caretaker card had never used its intended font.** `assets/caretaker-card.js` requested `media/Inter-Regular.woff2`, which has never been present in the project, so the card fell through to whatever `system-ui` was installed - the printed artefact varied by machine. It now uses the site's own faces through the same composite family. Its **monospace stack is deliberately unchanged**: neither Archia nor Clash Display is monospaced, and the card number and dates depend on fixed-width digits to stay in column.
- **One deliberate exception.** `assets/cinekind-page.css` keeps `--ck-mono:"Courier New"` for the CineKind credit lines. Courier on a film-awards page reads as a screenplay reference rather than an oversight, so it was left as designed. It is a single variable if PFA wants it on the site faces instead.
- Verified across all 38 pages: every page resolves to the new faces and there are no font 404s.
- Files changed: `assets/site.css`, `index.html`, `patron-card-preview.html`, `assets/caretaker-card.js`, and `assets/fonts/*` (new).

---

## v1.7.0 - 2026-08-21

- **The live card sits beside the form and stays put.** Two stray `</div>` tags inside the membership form were closing `.patron-layout` early, so the browser parsed the `<aside>` (card, front/back toggle, summary) as a sibling of the layout rather than a child - no column rule could reach it and it sank below the form. Both tags removed; the card column is now sticky beside the form while it is being filled, and drops below the form on narrow screens.
- **The photograph appears on the card, live.** Three separate faults. `journey-core.js` captured `window.PFA` at load, before `site.js` (which creates it) had run, so the photo editor crashed on mount and the file input was wired to nothing - it now resolves `PFA` at call time. An inline `background: #0b0c0e !important` on the photo well was expanding to `background-image: none !important` and blanking the photograph the instant a script set it - now `background-color`. And `membership.js` repainted the raw upload over the framed one on every keystroke - its photo handling is removed, the editor owns the photograph and paints it as an `<img>` inside the well.
- **The editor frames at the card's own 3:4.** It was cropping to landscape 1.586:1 while the card's photo well is portrait 3:4, so the well had to enlarge the framed image roughly 2.1x - only 47% of the framed width survived, which read as absurd zoom and made framing a fight. Editor stage, export (1200 x 1600) and well now all agree at 3:4: what is framed is exactly what appears, and what would print.
- **The physical card is a choice again.** v1.5.0 made the printed card mandatory for INR memberships; restored as an explicit opt-in on instruction. Digital-only at ₹365 is the default, with the address section hidden entirely; the toggle reveals it, makes its fields required, and moves the total to ₹514. USD stays digital-only at $10 with the toggle hidden. **Caution for the backend:** v1.5.0 also changed the server to derive the charge from currency and ignore `physicalCard` - "a client claiming `physicalCard: no` still pays ₹514". The server must honour the field again, or INR digital-only members will still be charged ₹514 at payment.
- **Search reads the same everywhere.** The overlay now fits one screen (input and result rows compacted, on the home page and in the shared shell), and opening search on any page shows one shared directory - Hospitals & Rescue, Stories, The Wire, Learning Center, Adopt, The PFA Store, Become a Patron, Get involved - instead of the home page showing one list and every other page showing suggestion chips.
- Files changed: `index.html`, `membership.html`, `assets/site.css`, `assets/membership.js`, `assets/journey-core.js`, `assets/pfa-global-search.js`.

---

## v1.6.4 - 2026-08-21

- **Splash quote's second line is blue.** `it opens for all.` is wrapped in `.opening-accent` with `color: var(--blue)`. The first line stays in the theme's ink so the accent carries the emphasis.
- **Header navigation trimmed to five, in the order given.** Hospitals, Learning, Get Involved, Store, CineKind. Every target file exists on disk. Stories, The Wire, Adopt and Become a Patron are removed from the desktop bar; the mobile menu was rebuilt in the same order and still carries Become a Patron because the header has no room for it. Every label reads exactly as requested.

---

## v1.6.3 - 2026-08-21

- **Footer background fixed to white, at its source.** The cause was not a bleed or an inherited colour: `assets/site.css` carried `footer{background:#073BA4;color:#fff}` as a site-wide rule, and `index.html` carried a second copy of the same rule inside its own inline `<style>` block. Both were patched, so the footer is white on every page rather than on the one page that happened to be inspected.
- **Every dependent footer colour flipped with it.** The whole footer palette was white-on-blue - brand paragraph, column headings, links, hover state and the bottom bar and its divider were all `rgba(255,255,255,...)`. Turning only the background white would have produced white text on white. Text is now `--ink`, secondary text `--muted`, hover `--blue`, and the dividers `--line`. A hairline top border replaces the colour block as the separation from the page.
- **Opening screen copy replaced** with the chairperson's line: *When the heart opens, it opens for all.* attributed to Smt. Maneka Sanjay Gandhi, set in sentence case. The attribution deliberately does not use the theme's `<small>` element, which is uppercased by the stylesheet. The headline size and its three responsive overrides were brought down to suit a sentence rather than a two-word slogan, and `Enter PFA` follows as before.

---

## v1.6.2 - 2026-08-21

- **The chairperson's signature is on the card.** Supplied artwork recoloured to pure white against the dark face, transparent ground preserved and the surrounding margin trimmed so it can be placed exactly. It sits on the rule above the authorised-by block, the way a signature sits on a line.
- **The signature is bound to issuance, not to the form.** `hydrate()` fetches it only when the card number matches `PFA-CCT-XXXXXXXX` - a real number from the register. The live preview never shows it, because a signature on a preview would be an authorisation of nothing. The gate is a card-number match rather than a truthiness check, and is covered by a test.
- **Validity removed from the card; issue date kept.** The back now reads `ISSUED ON` and the date, single column. Validity is still tracked, still returned by the card API, still shown on the permanent card page and still in the issuance email - it simply is not printed on the card.
- **Role reads Colony Caregiver**, replacing Colony Caretaker on the card front.
- 55 tests pass.

---

## v1.6.1 - 2026-08-21

- **Back rearranged: the dead band is gone.** The reference reserved roughly 90px for a signature image that PFA has not supplied, which read as a hole. The largest gap on the back is now 24px, down from 89px.
- **The recovered space carries something useful rather than air.** The new artwork had quietly dropped the issue date, and validity had never been on the card at all - so the back now sets **Issued** and **Valid until** as a two-column row in the same label-over-mono rhythm as the address and contact blocks. An expiring card is identification, and a date on it is worth more than an empty band. An expired card prints its validity in red.
- **Signature support kept, sized so it cannot collide.** If `media/pfa-signature.png` is added, it is drawn right-aligned immediately above the rule at a capped height, and leaves no hole when absent.

---

## v1.6.0 - 2026-08-21

- **Caretaker card artwork replaced with the approved reference.** Both faces transcribed from the supplied 340 x 540 design at 1 reference pixel = 54/340 mm, so the card stays ISO/IEC 7810 ID-1 portrait while matching the reference proportionally. Dark `#141416` body, 2.22 mm corners, given name in white over surname in grey, mono `Colony Caretaker` line, full-width 4:3 photograph with square corners, vertical year in the right margin, and the card number centred at the foot. Back: registered address, contact, a scannable code, and the authorised-by block with the chairperson line in `#16B6FF`. The lavender presentation background is not part of the card and was not carried over. **The Patron card is untouched.**
- **A real QR code, on a card that will be shown to police.** `assets/qr.js` is a deliberately narrow encoder - byte mode, error-correction level L, versions 1-5 only - because every one of those versions is a single error-correction block, which removes the block interleaving that is easiest to get quietly wrong. A code that scans to the wrong thing would be worse than no code.
- **The encoder proves itself, since there was no library here to check it against.** `test/qr.test.js` verifies the Galois field tables round-trip, that the Reed-Solomon syndromes are zero at the generator's actual roots, that the codeword count derived from counting free modules in the matrix agrees with the capacity table, that the format information survives its BCH encoding and reads back with the right mask and level, and that the URL comes back byte for byte after walking the finished, masked matrix in reverse.
- **Fonts.** The reference uses Inter and JetBrains Mono; neither can be bundled offline. The stacks fall back to `system-ui` and the platform monospace, and the renderer will pick up `media/Inter-Regular.woff2`, `media/Inter-SemiBold.woff2` and `media/JetBrainsMono-Regular.woff2` automatically if those files are added.
- 53 tests pass. Print output re-verified: two pages at exactly 54 x 85.6 mm.

---

## v1.5.0 - 2026-08-21

- **Both journeys now run on shared modules, not just a shared stylesheet.** `assets/journey-core.js` owns the Begin disclosure, step handling, validation, busy states, the "ship somewhere else" disclosure and the payment hand-off; `assets/photo-editor.js` owns the photograph. The Caretaker Card, the Patron card and the new lost-card journey all call the same functions, so a difference in behaviour between them is now a bug rather than a design choice. The two card faces are untouched and remain completely distinct.
- **Photograph control with framing and an honest resolution warning.** Drag to position, slide to zoom, and a warning derived from print maths rather than a guess: a 54 mm card at 300 dpi needs 638 px across the printed area, so below that it warns of softness and below 351 px it warns of visible pixelation. Zoom is counted in, because zooming in spends pixels. The journey stops once before issuing a card that will print pixelated.
- **The printed card is mandatory in both journeys.** The Caretaker choice screen is gone: the free digital card is issued on application and the ₹100 printing charge follows immediately. Membership's optional toggle is gone too, and the server derives it from currency rather than trusting the browser - a client claiming `physicalCard: no` still pays ₹514. USD memberships stay digital, since PFA does not post internationally.
- **Address captured once, with location capture in both.** The Caretaker journey now has the same Use current location / Enter manually control the membership form has always had, filling PIN, district and state. The address prints on the back of the card and is the delivery address by default; *Ship to a different address* stays closed until needed and is stored separately.
- **Deduplication without OTP, in two layers.** The mobile index is the hard key and blocks outright. A new identity index is the soft key: name and PIN normalised so that "Dr. Asha Kumar", "asha kumar" and "Kumar Asha" collide. A soft match does not block - two people in one household can genuinely both feed animals - it warns, records `softDuplicateOf` on the new card and points at the lost-card journey.
- **Lost printed card journey** (`lost-card.html`, `/api/caretaker/replace`). Card number plus the mobile it was issued against; one message for both "no such card" and "wrong number", so the endpoint cannot be used to discover which card numbers exist. It orders a replacement PARCEL and nothing else: proven in the end-to-end walk that the card number, issue date and validity are all unchanged and no second digital card is created.
- **47 unit tests and an extended end-to-end walk** covering replacement-keeps-the-number, identity dedup, mandatory physical, and the photograph thresholds. Two older membership tests asserted the optional-card rule and were updated to the new one rather than deleted.

---

## v1.4.1 - 2026-08-21

- **The Caretaker Card journey now uses the membership design system, not one of its own.** The bespoke stylesheet it had grown - its own buttons, type scale, spacing and colour tokens - has been deleted. Both journeys are now built from the same components: `hero`, `facts`, `form-shell`, `simple-form-group`, `form-grid`/`field`, `patron-summary`, `payment-note`, `card-toggle`, `pfa-card-hint`, `order-success`, `btn dark`/`btn light`. No new visual style was introduced and no existing element was redesigned.
- **One stylesheet, shared.** The form system that lived inside `membership.html` has moved to `assets/journey.css`, which both pages load. It is one file on purpose: two files that merely resemble each other drift apart on the next edit. Verified that every class used on the membership page still resolves to a rule, so nothing was lost in the move.
- **Page typography is the site's own again.** Absans is still loaded, but only so the canvas can draw the card artwork in it; no page chrome uses it.
- **The UX improvements survived the restyle.** The journey stays closed until Begin; four fields and an optional photograph; the card is issued free before any mention of payment; the printed card is a choice afterwards; the address already given is shown rather than asked for again, with *Ship to a different address* revealing the alternate fields.
- **Membership adopts the same rules.** Its address block was always on screen even for patrons taking the digital card, and `deliverySection` was declared in its script but never used. It is now hidden by default and revealed only when the printed card is switched on - the same rule the Caretaker Card follows. For a digital patron this drops the form from roughly ten visible fields to four.

---

## v1.4.0 - 2026-08-21

**The Caretaker Card journey, rebuilt end to end.** See `CARETAKER_CARD_ARCHITECTURE.md`.

- **The application stays hidden until Begin.** `caretaker.html` is one page with five scenes and no reloads: open → apply → issued → printed → done.
- **Five fields, and not one more.** Photograph, name, mobile, email, address. The PIN is read out of the address instead of being asked for twice. Locality, city, animal counts and the free-text history are all gone: none of them printed on the card or delivered it.
- **The free card is issued first; the printed copy is offered second.** Previously the route was chosen before issuance, which put a payment question between an applicant and a card that costs nothing. `POST /api/caretaker/apply` now mints the number immediately and the choice comes after.
- **No shipping address is ever asked for by default.** The address already given is displayed; *Ship to a different address* reveals the alternate fields, which are stored in their own `caretakerAddresses` record so the address printed on the card is never overwritten.
- **Payments own nothing on the client.** `/api/caretaker/order` proves the caller holds the card, resolves the address server-side, fixes the price server-side and builds the CCAvenue request itself. The browser never carries an amount or an address.
- **Every physical card gets a shipment record** with its own tracking ID, carrier fields, full status history and a forward-only state machine (order confirmed → preparing → dispatched → in transit → out for delivery → delivered, plus exception, cancelled and returned). Enforced in the store transaction, so the admin panel, a courier webhook and a script cannot diverge.
- **Permanent shareable card link** showing the card, number, validity and live delivery tracking. The holder additionally sees their photograph and downloads, because the photograph is device-only and never uploaded.
- **Transactional email** with templates, a Firestore queue, inline best-effort send, exponential-backoff retries via a cron worker, permanent-failure parking and dedupe keys.
- **Read cost designed for a link that gets shared.** The card page reads exactly one denormalised document, cached at the edge for five minutes with a day of stale-while-revalidate and an ETag, so a card doing the rounds costs close to zero Firestore reads rather than one per view.
- **Duplicate prevention** on the mobile index inside the issuing transaction, idempotency keys on application and payment, and a re-entrant payment callback that cannot open a second parcel.
- **43 unit tests plus an end-to-end walk** of the whole journey against an in-memory Firestore double, covering duplicate prevention, token authorisation, address separation, callback replay, state-machine enforcement and the public projection provably not leaking mobile, email or address.

---

## v1.3.3 - 2026-08-21

- **Card back rebuilt around type rather than ornament.** The four hand-drawn icon glyphs are gone: vector or not, small custom glyphs at card scale read as crude, and the calendar and hash marks were carrying no information the labels did not already carry. Rows are now small letter-spaced caps over the value, separated by hairlines, on a 4.4 / 3.6 / 3.0 / 4.8 mm vertical rhythm.
- **The tinted issuer panel is gone.** Whitespace and a shape edge do that work; a translucent box on top of a translucent shape was mud.
- **Both faces now share one piece of geometry.** The chevron from the front label repeats at the foot of the back in a lighter blue, and its edge is the divider above the issuer block - no hairline is drawn over it. The rows are proven to clear the chevron apex by 3.4 mm in the worst case (a three-line address), so a long address can never run into it.
- **One margin everywhere: 6.5 mm.** The front title, the back rows and the last line of the issuer block all land on it, so the two faces read as a pair.
- **Front title margins fixed.** It sat 5 mm from the edge at 5.8 mm type, which crowded it; the type is now sized against the space between the margins rather than set at a fixed size.

---

## v1.3.1 - 2026-08-21

- **Caretaker card redesigned to match the supplied reference.** Front is now the holder's photograph edge to edge on a pure white card, with a two-tone blue diagonal panel at the foot carrying *Colony Animal Caretaker*. Back drops the redundant title, and holds Name, Address, ID number and Issued on as icon-led rows with dividers, closing with the issuer block: *Issued by Smt. Maneka Sanjay Gandhi, Chairperson, People for Animals*.
- **Absans (SIL OFL) shipped in `/media` and registered via `@font-face`.** Canvas now waits on `document.fonts.load('16px Absans')` before drawing so the preview, PNGs and PDF all use the same face rather than falling back to the system sans between renders.
- **Address moved into the always-visible details.** The card back needs it whether the applicant wants a printed copy or not, so `caretakerAddress` is required for the digital route too, validated server-side in `api/caretaker-issue.js`, and stored on the Firestore card record. The paid route still collects PIN, district and state for India Post; the delivery section no longer duplicates the address field.
- **Names and addresses shrink to fit rather than clip.** Long names, long addresses and long area lines are re-measured until they fit the allowed lines; an ID card that truncates its holder's name is not identification.

---

## v1.3.0 - 2026-08-21

- **The Caretaker Card journey is now automated end to end.** Previously "Apply" on Get Involved opened a modal that filed an application and then went nowhere: nobody was ever issued a card. New page `caretaker.html` takes the application with a live card preview that updates as the applicant types, and `caretaker-card.html` shows the issued card with instant downloads. The old dead-end modal has been removed and both Get Involved entry points now link to the journey.
- **Free digital card, issued on submit.** `api/caretaker-issue.js` validates the application server-side (never trusting the browser), mints a `PFA-CCT-XXXXXXXX` card number and writes it to the Firestore `caretakerCards` collection. Issuance is keyed to the mobile number, so re-submitting returns the same card number with details refreshed rather than minting a second identity for the same person. If the register is unreachable the applicant still gets a card, flagged provisional, instead of a dead end.
- **Printed card for Rs 100 shipping.** New `caretaker` payment type in `lib/payment.js` with the price fixed server-side (the browser cannot name its own shipping charge), a `PFA-CAR-` order prefix, and card issuance in `applyPaymentResult` that only fires on a verified CCAvenue payment. The delivery address is mandatory on this route only. The digital card still downloads immediately after payment; the photograph is carried across the gateway hop in sessionStorage the same way the Patron flow already does.
- **The card artwork is generated, not mocked up.** `assets/caretaker-card.js` draws both faces on canvas from millimetre coordinates on the ISO/IEC 7810 ID-1 card turned portrait (54 x 85.6 mm). The same renderer draws the live preview and the downloadable artwork, so the preview cannot drift from what is issued. Downloads: print-ready two-page PDF at true physical size (assembled by hand, no library, validated against its own cross-reference table) plus 600 DPI front and back PNGs. **No lanyard slot is cut into the artwork**, as the instantly issued card is not punched.
- **Card face design.** Front follows the supplied reference: white face, rounded photograph window on the house blue wash, name in blue, COLONY ANIMAL CARETAKER beneath it, the area looked after, and the PFA lockup at the foot. Back carries **Name, Area looked after, Card number, Issued on**, then the issuer block reading *Issued by / Chairperson / People for Animals*, the ABC Rules line and a verification line. Names and addresses shrink to fit rather than clip: an ID card that truncates its holder's name is not identification.
- **Card numbers are safe to show a stranger.** `api/caretaker-status.js` returns only name, area, standing and issue date. The number is printed on a card shown to police and neighbours, so mobile, email and the delivery address are deliberately not exposed by lookup.
- **7 new tests** (37 passing): fixed shipping price, rejection of the free card at the payment gateway, delivery-address requirements, server-side application validation, lookup privacy, and a PDF structure check that walks every cross-reference offset and asserts it lands on the object it claims.

---

## v1.2.0 - 2026-08-21

- **CineKind added to site navigation.** Desktop header ("cinekind", between adopt and store) and mobile menu ("CineKind") on all 34 header-bearing pages, with active state on its own page. Three different header markup variants existed across pages; all covered.
- **CineKind page styled.** Root cause of the "blank/white space": none of the page's 41 `ck-*` classes had CSS anywhere - the page rendered entirely on browser defaults. Authored the full page stylesheet in the house design system (ink cinematic hero with outlined CINEKIND wordmark, timecode bar, two-column about with meta grid, honouree card grid with numbered plates, dense roll-of-honour record rows, scroll-snap ceremony gallery, blue archive/nomination bands mirroring the footer, responsive + reduced-motion). No content changed, no redesign - the intended page finally has its skin.
- **The three CineKind films are now on the page.** `cinekind-elephant/langur/lion.mp4` were shipped in media but referenced nowhere; added a letterboxed "From the frame" film strip (posters from event photography, metadata preload).

---

- **Community forms now reach the admin backend.** New endpoint `api/pfa-submissions.js` writes every submission to the Firestore `submissions` collection (where the admin portal will live), with: kind allowlist matching the site's real reference prefixes (PFA-A adoption, PFA-V volunteer, PFA-CSR corporate, PFA-CAC CineKind, etc.), human-readable kind labels for the admin view, field sanitization and size limits, `status: "new"` for admin workflow, and idempotent writes keyed on the reference number (retries never duplicate). The shared `PFA.saveSubmission` helper in `assets/site.js` now also POSTs to this endpoint; because all community forms (adoption, stories, get-involved, CSR, dispatch, handover, pharmacy, network follow/help, CineKind, services, meet/podcast) route through this one helper, a single change wired every form. Local reference UX unchanged; if the network call fails the visitor still gets their reference.
- **Location button standardized everywhere** (`checkout.html`, `give.html`, `membership.html`, `store.html`): all four now identical `btn light` + "Use current location". Previously two styles and four different labels. Functionality verified as already complete in `assets/pfa-location.js`: browser geolocation, then BigDataCloud reverse geocoding with Nominatim fallback and India PIN-code lookup, auto-filling state/district/locality/PIN on click when permission is granted.
- **Verified zero dead-end links** (`href="#"` count: 0; missing internal targets: 0) and **zero broken images/logos** site-wide.

---

## v1.0.0 - 2026-08-21

First fully clean release: site audit 0 errors, 30/30 tests passing.

### 2026-08-21

- **Fixed `vercel.json`** (`{}` instead of empty functions config). Reason: Vercel's current schema rejects `"api/**/*.js": {}` with "Function must contain at least one property"; the block was unnecessary since Vercel auto-detects `/api` functions.
- **First successful production deployment** to `pfa-full-website.vercel.app` (Vercel project: `pfa-full-website`, all 8 payment/Firebase environment variables configured).
- **Membership card logo fixed** (`membership.html`). Reason: referenced `media/pfa-card-logo.png` was never provided in any export, so the card emblem never rendered. Now uses existing `media/pfa-emblem.png`. Swap in a dedicated card-cropped logo later if one is produced.
- **Copy style violations fixed**: em-dash characters removed from `membership.html` and `patron-card-preview.html` per the site's own no-dash copy rule (`tools/audit_site.py` enforces it).
- **Accessibility: 12 form fields given `aria-label`s** across `adopt.html`, `give.html`, `network.html`, `pharmacy.html`, `stories.html`, `track-order.html`. Reason: search/filter/amount fields had no programmatic labels, so screen readers could not announce their purpose. No visual change.
- **Verified site-wide**: every `<button>` on every page has real CSS (none render as unstyled browser defaults); every `<img>` has alt text.

### 2026-08-20

- **Full audit of the original export.** Found: ~47 of 48 media files missing (incl. PFA logos), Give/Send frontend completely unwired, store catalog fetching a non-deployed endpoint, order-status API a hardcoded stub, order tracking reading only localStorage, 3 stale failing tests, multiple orphaned files, docs describing a home page design that no longer exists.
- **Media restored** from second export (`media/` 1 file → 51 files). Missing-asset audit errors: 148 → 2.
- **USD payment support (backend)** in `lib/payment.js`, `lib/pfa-ccavenue-flow.js`, `lib/firebase.js`, `api/payment/create.js`, `api/payment/response.js`. Reason: PFA wants international donations across Donate, Give/Send and Membership. Currency-scoped CCAvenue credentials (`CCAVENUE_USD_*`, optional separate merchant ID with fallback), distinct callback URL per currency (`?cur=usd`) so the response handler always decrypts with the right key, currency stored on every Firestore transaction, currency verified on callback. USD membership is digital-only (server rejects physical card + USD).
- **USD payment support (frontend)**: currency chips (reusing the existing `.chip` component) on `give.html` (Donate and Give/Send) and `membership.html`; per-item USD prices on food items; currency-aware totals and pay-button labels.
- **Fixed the physical-card switch on `membership.html`**. Reason: the switch had no click handler anywhere in the codebase; selecting a physical card was impossible and pricing never moved to Rs. 514. Also removed a redundant leftover listener.
- **Give/Send frontend wired** (`give.html`, `assets/give.js`). Reason: the whole multi-step food-order flow (route tabs, step navigation, quantity steppers, form submission) was inert markup with zero JS, while the backend was fully built. Also fixed: terms checkbox had no `name` (silently excluded from submission), form had no `action`/`method`, hero shortcut links pointed at a hidden panel.
- **Store catalog endpoint deployed** (`api/paws-catalog.js` copied from the nested `pfa-paws-live-catalog/` helper folder to the real `/api` path, with its tests). Reason: `store.html` fetched `/api/paws-catalog`, which 404'd in production, permanently falling back to the embedded product snapshot instead of live Shopify inventory.
- **Test suite fixed** (`test/store-experience.test.js`). Reason: 3 tests asserted a "cinematic store campaign" feature (packshots, growth experience) that has no footprint in the codebase and whose CSS lived only under the already-removed cinema layer; also expected outdated headline copy and a typography approach never implemented. Tests now assert what the store actually does (live catalog API, order API, accessible filter controls, real font stack). Added USD test coverage in `test/payment.test.js` and catalog tests as `test/paws-catalog.test.js`.
- **Dead code removed** (confirmed unreferenced before deletion): `assets/home-experience.js`/`.css` (superseded home design, loaded by nothing), `assets/pfa-store-experience.css` (1,357 lines, linked by no page), `PFA_store_veg_catalogue.html` (orphan near-duplicate of store.html), `pfa-paws-live-catalog/` (purpose served once its API file was promoted), `file.svg`/`globe.svg`/`window.svg` (scaffold leftovers), root `logo.png` (superseded by `media/pfa-logo.png`). Kept: `patron-card-preview.html` (intentional design-reference document, not dead).
- **Design-system consolidations**: `give.html` form fields moved from parallel unstyled `.feed-field` to the shared `.field` component (restores red-border invalid states); two store modal close buttons (`pfa-checkout-close`, `live-modal-close`) had zero CSS anywhere and now carry the shared `.modal-close` class.
- **Setup docs rewritten** (`VERCEL_CCAVENUE_SETUP.md`, `START_HERE_CCAVENUE.txt`): added identifying the currently-live PHP handler before cutover, Firebase project creation, USD variables, expanded go-live test checklist.

### Known pending

- **USD prices are placeholders** ($10 membership; $7/$6/$4/$8/$18 food items; $5-$60 donate presets). Single constants in `lib/payment.js` + `data-price-usd` attributes in `give.html`.
- **CCAvenue USD credentials do not exist yet** (the `usd/` PHP kit folder has no credentials of its own); USD flows will correctly refuse until `CCAVENUE_USD_*` variables are set.
- **CCAvenue domain whitelisting**: `pfa-full-website.vercel.app` must be whitelisted by CCAvenue support (email service@ccavenue.com + salessupport@ccavenue.com with Merchant ID; up to 48h) and the Return/Cancel URL set to `/api/payment/response` before live payments can round-trip.
- **Vercel project not yet connected to the git repo** (dashboard still shows "Connect Git Repository"); until connected, deploys require `vercel --prod`.
- **Order tracking still localStorage-based** (`track-order.js`) and `api/pfa-order-status.js` is a stub; real tracking depends on an admin surface and/or Shopify webhooks (planned, not started).
- **Admin dashboard** (members/orders/payments): not started.
- `index.html` does not load `assets/site.css`; it carries its own inline duplicate (~84KB). Renders identically today, but the two can drift. Consolidation planned.
