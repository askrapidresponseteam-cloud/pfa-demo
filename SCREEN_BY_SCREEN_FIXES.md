# Screen-by-Screen Visual Fixes

This pass focused on visual failures that made active controls look empty or broken.

## Global controls

- Every `.btn` now owns its text colour instead of inheriting from the surrounding section.
- Light buttons are white with dark text.
- Dark buttons are black with white text.
- Blue buttons are blue with white text.
- Light buttons inside blue sections retain dark, legible text.
- Text-only buttons no longer show browser-default button chrome.
- Focus-visible treatment is consistent across links, buttons and fields.

## Blue campaign sections

Reviewed and corrected on:

- Home funding section
- Learning emergency section
- Get Involved support section
- CineKind entry section
- The Wire hero actions

## Footer

- Removed forced white recolouring of the PFA logo.
- Changed the footer to a light treatment with a PFA blue top rule.
- Original emblem and logotype now render in their supplied colours.
- Footer links and legal text use clear dark-on-light contrast.

## Responsive behaviour

- Mobile hero titles use a safer scale and can wrap long words without clipping.
- Mobile action groups stack into full-width controls.
- Close controls have proper touch height.
- Patron physical-card toggle has a larger touch target.
- Route cards have enough vertical space for long copy on desktop and mobile.
