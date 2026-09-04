# PFA Website QA Report

## End-to-end QA — v1.212, 30 Aug 2026

Every action was followed from the first click to the final record, through
the real handlers, with the external services stubbed at the network edge:

| Flow | Chain verified | Outcome |
| --- | --- | --- |
| Form submissions (ask, report, careers, events, volunteer, wall) | browser validation → `/api/pfa-submissions` → reference issued in a transaction → record → acknowledgement email → admin queue → status actions → `track.html` lookup | works; **fixed** duplicate-submission guard, `url` rule, wall field name |
| Donations / Give-Send | form → `/api/payment/create` → CCAvenue (encrypted) → `/api/payment/response` → success / failed / cancelled / tampered → transaction record → result page | works; **fixed** receipt email (never sent), idempotency key (never sent), broken logo |
| Shop cart | add, +/−, remove at zero, totals, cross-tab sync, stale-catalogue guard, closed-store guard | works |
| Shop order, direct pay | `pfa-pay-start` (server prices basket + delivery) → Razorpay sheet → `pfa-pay-confirm` (signature, captured amount in paise) → PAID → one email → Shopify order (claimed, idempotent) → webhook / reconcile as second and third path | works; **fixed** retry reused no order, `ALREADY_PAID` shown as error, confirm failure left no way back |
| Shop order, seller checkout fallback | `pfa-orders` → Shopify cart → seller pays → webhook / Admin lookup → `storeOrders` | works; **fixed** `PREPARING` unhandled, resume never ran |
| Order tracking | confirmation number + email/mobile on `track.html` → `/api/pfa-order-status` | **was broken for every direct-pay order (404)**; fixed and tested through fulfilment |
| Admin visibility | overview counts, Store register, Submissions queue, Caregivers, Payments | **direct-pay orders and PLACEMENT_FAILED were invisible**; fixed, searchable, flagged |
| Caregiver card | documents → ₹50 fee → application record → admin approve → card minted → `card_issued` email → `caregiver-card.html` → QR verification | works; **fixed** email sent same day (was up to 24 h later), page rebuilt (was a dead link) |
| Emails | submission ack, donation receipt, store confirmation, card issued, staff reply | each sent once, keyed, never blocking the response |
| Error handling | every route: bad JSON, missing fields, unknown ids, wrong contact, forged signatures, redelivered callbacks, provider timeouts | refused with the right code; identical wording where enumeration would otherwise be possible |

**v1.213 addendum — The Wall theatre.** Rebuilt as a full player (file / YouTube API / Vimeo API behind one facade): play/pause, prev/next, skip ±10 s, seek bar with buffer, volume, speed, autoplay with an up-next countdown, resume, error and buffering states, copy-link deep links, picture-in-picture, full screen, focus trap, touch gestures, Media Session. `test/wall-theatre.test.js` presses every control in a real DOM (17 tests). 725 tests passing.

Tests: 704 passing (682 before, 22 added across `store-order-followed`,
`donation-flow`, `emailed-links-resolve`, `submissions`, `admin-case`).
`npm run lint` prints nothing.

---


## Build

- 35 connected HTML pages
- 27 JavaScript files
- One shared responsive design system with page-specific extensions
- Original PFA content, logo, colour system and media retained
- New immersive PFA landing experience built from scratch

## Landing experience review

The new home page was rendered and visually reviewed at:

- Desktop: 1920 x 1080 and 1440 x 900
- Laptop: 1280 x 720
- Tablet: 1024 x 768, 820 x 1180 and 768 x 1024
- Mobile: 390 x 844 and 360 x 800

The review covered both the closed-gate opening and the entered PFA world, plus every below-fold section.

## Landing interactions tested

- Enter PFA button
- Scroll and keyboard entry
- Accessible skip link
- Replay opening
- Zoom in, zoom out and reset
- Continue to the next section
- Parallax response on fine-pointer devices
- Horizontal snap carousel on mobile
- Reduced-motion fallback
- Header search
- Mobile navigation
- All six portal destinations

## Existing screen review

Every downstream page remains connected, including:

- Hospitals and Help Desk
- Contact detail
- Stories and story detail
- The Wire and case detail
- Learning Center and guide detail
- Adoption directory and application
- Store, product, pharmacy, checkout, confirmation and tracking
- Patron membership and digital card
- Founder, CSR, PFA X, CineKind and Wildlife Gauntlet
- Watch, Listen, Do, Meet, Get Involved and Give
- Search, privacy, terms and 404 recovery

## Automated checks completed

- Every internal HTML link points to an existing page
- Every internal fragment points to an existing ID
- No dead hash links or JavaScript pseudo-links
- No missing local images, stylesheets or scripts
- Every non-submit button is wired or explicitly recognised by the audit
- Every JavaScript file passes `node --check`
- No forbidden em dash or en dash characters
- No horizontal body overflow at tested viewport sizes
- No visible opening control extends outside the viewport
- No duplicate HTML IDs
- Search and mobile menu remain functional on the new home page

## Production integrations still required

The UI journeys are complete. Production launch still requires live APIs for payment, OTP, email, reverse geocoding, supplier catalogue, inventory, prescription review, fulfilment, shipping webhooks, order lookup and admin review.
