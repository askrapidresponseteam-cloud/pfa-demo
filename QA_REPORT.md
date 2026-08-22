# PFA Website QA Report

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
- Hospital detail and service request
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
