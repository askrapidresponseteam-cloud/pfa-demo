# PFA Landing Page: Complete No-Clipping QA

## Scope

The complete PFA landing page was reviewed section by section, including the fixed header, opening gate, entered exploration experience, impact statistics, help routes, public-work cards, participation cards, founder section and footer.

## Section 01: Header and immersive opening

- Constrained the architectural facade to the live viewport.
- Reserved independent zones for the heading, cards, Continue control and Replay control.
- Rebuilt the entered experience as a collision-free grid on desktop and tablet.
- Kept mobile as a contained horizontal snap experience.
- Added compact rules for short screens down to 320 × 480.

## Section 02: Impact

- Removed overflow from the longest statistic.
- Added intrinsic card sizing and safe padding.
- Prevented hover states from moving over neighbouring cards.
- Kept the three-stat composition responsive across desktop, tablet and mobile.

## Section 03: Help

- Removed fixed-height assumptions from the content column.
- Kept all three help routes fully inside the section.
- Added safe wrapping for headings, labels and action text.
- Prevented route hover states and arrows from crossing their row boundaries.

## Section 04: Work made visible

- Converted overlay copy into layout-aware card content.
- Ensured every title and action remains inside its image card.
- Added responsive grid rows that expand with content.
- Prevented card-to-card collisions at all breakpoints.

## Section 05: Every way in

- Contained all decorative circles inside their cards.
- Removed hover movement that could overlap neighbouring cards.
- Added intrinsic widths, safe wrapping and consistent mobile stacking.

## Section 06: Founder and footer

- Repositioned the decorative P, F and A so every letter remains inside the section.
- Constrained the quote, attribution and CTA to the safe content area.
- Added wrapping and minimum-width protection to all footer columns.

## Validation

The page was tested at 13 viewport sizes and in 26 opening/entered states:

- 320 × 480
- 320 × 568
- 360 × 640
- 390 × 844
- 412 × 915
- 640 × 960
- 768 × 1024
- 980 × 720
- 1024 × 768
- 1280 × 720
- 1366 × 768
- 1440 × 900
- 1920 × 1080

Automated checks passed for:

- Document-level horizontal overflow
- Internal section and card overflow
- Content escaping parent containers
- Card-to-card and row-to-row overlap
- Opening and entered-state containment
- Founder decoration containment
- Footer column containment
- Full-site internal links, buttons and JavaScript syntax

The machine-readable results are included in `HOME_PAGE_NO_CLIPPING_AUDIT.json`.
