# PFA Full Website

> **One tree.** This is the logic half (`PFA_Logic_Backend`) and the UI half
> (`PFA v1.37`) merged, which is the shape `MANIFEST.md` says to deploy in:
> neither half runs on its own. `npm test` now covers both.
>
> - `CHANGES-v1_105.md` — what changed in v1_105 and what is still open.
> - `CHROME.md` — the shared header/footer/cursor: one source, `npm run sync:chrome`.
> - `CHANGES.md` — everything changed in this pass, and what is still open.
> - `ADMIN-STORE-SWITCH.md` — wiring the Store switch into `admin.html`.
> - `UI-CHANGELOG.md` — the UI half's own changelog, kept under a new name
>   because both halves shipped a `README.md`. Nothing was overwritten.
>
> **`npm test` reports 210 tests, 184 pass, 26 fail.** The 26 are pre-existing
> and predate this work: they need `store.html`, `help.html`, `admin.html`,
> `assets/site.css` and the rest of the `PFA_UI_Content` half, which is not in
> this tree. `CHANGES.md` has the detail and the verification.


A complete static, end-to-end People for Animals website prototype. Content and media were derived from the supplied PFA_Site_Relit archive. The layouts, components, interaction model and CSS were rebuilt from scratch and do not use the archive's page designs.

## Start

Double-click `SERVE.command` on macOS, or run:

```bash
python3 serve.py
```

Then open `http://localhost:8000`.

## Immersive home experience

The home page opens with an interactive PFA gate and then reveals a tactile, explorable PFA world. Visitors can enter by button, keyboard or scroll, use the zoom controls on desktop, replay the opening, or continue into the complete landing page. On mobile, the PFA world becomes a horizontal snap carousel. Reduced-motion preferences are respected.

Home-specific files:

- `index.html`
- `assets/home-experience.css`
- `assets/home-experience.js`
- `media/home-grain.png`

## Complete routes

- Home
- Hospitals and Help Desk
- Contact detail
- Stories, story detail, comments and submissions
- Newsroom and case detail
- Learning Center, guide detail, ABC rules and games
- Adoption directory, animal detail and application
- Store, product, pharmacy, cart, checkout, confirmation and tracking
- Founder
- Corporate CSR and PFA X
- CineKind, honours, nominations, submissions and volunteering
- Wildlife Gauntlet and certificate
- Watch, Listen, Do, Meet
- Get Involved
- Give
- Search, privacy, terms and 404

## Prototype behavior

The public pages use browser localStorage for presentation-only state such as carts, references, story reactions and game progress. Donate, Give/Send and Patron Membership now use the Vercel server-side CCAvenue layer under `/api/payment/*`, with Firebase transaction/member persistence and callback idempotency. Store/e-commerce payment and order fulfilment remain vendor-owned and separate from CCAvenue. Email, OTP, reverse geocoding, prescription review and fulfilment still require their respective production services before launch.

## Quality checks

Run:

```bash
python3 tools/audit_site.py
```

The audit checks internal links, fragments, assets, JavaScript syntax, forbidden dead hrefs, required button wiring and the no-em-dash rule.
