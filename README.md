# PFA Full Website

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
- Unit detail and service request
- Stories, story detail, comments and submissions
- The Wire and case detail
- Learning Center, guide detail, ABC rules and games
- Adoption directory, animal detail and application
- Store, product, pharmacy, cart, checkout, confirmation and tracking
- Patron membership and instant digital card issuance
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
