# Changes in v1_105 (from v1_99)

## Shared site chrome
- Header, announcement bar, footer and the hand-drawn cursor now come from one
  source each: `assets/chrome-header.html`, `assets/chrome-footer.html`,
  `assets/chrome.css`, `assets/chrome.js`. All 14 pages used to carry their own
  copies, which had drifted into three different headers.
- `scripts/sync-chrome.js` stamps them into every page. `npm run sync:chrome`
  applies; `npm run check:chrome` verifies. Its `PAGES` table says which nav
  item is current on each page, which pages show a Cart, and what the bar says.
- The generated pages (product, quiz) apply the chrome last in their builders,
  so a rebuild cannot reintroduce a copied header.
- The logo is a real file, `img/logo.png`, instead of 14 KB of base64 per page.
- Every page has the announcement bar (Get Involved, Quiz, Product had opted out).
- The home page uses the same header as the rest (it had its own inline one
  with a capped nav width and a border line).
- The redundant Google Fonts link for Marcellus is removed; the face is self-hosted.
- `CHROME.md` documents the arrangement.

## Bugs fixed
- Cursor drawn dark on dark surfaces (the smear over The Wall's video frames).
  It now reads the real background under the pointer instead of a per-page
  list of selectors.
- Footer on `wall.html` had "The Wall" and "Get Involved" inside one list item.
- Dead code removed: no-op scroll/flip handlers, three separate
  header-measuring implementations, cart styling on pages with no cart.

## Content and pages
- Get Involved: both application journeys rebuilt as one screen at a time
  (Volunteer 3 steps, Colony caregiver 4) with progress, Back/Continue,
  per-step validation and a no-JS fallback. Field names, endpoints and copy
  unchanged.
- Laws: all Karnataka-specific content rewritten to hold in every State; the
  cattle answers explain the State-subject position; the breed-ban answer was
  checked against the 2024 High Court rulings; citation key `KPSPC Act 2020`
  became `State cattle Act`; search index rebuilt.
- Shop: "Where this shop comes from" band removed.
- Home: the hens-and-pigs block has a section head like the grids below it.

## Tests
- Seven tests updated for the shared chrome; one new file,
  `test/chrome-in-sync.test.js`.
- 385 pass, 21 fail. The 21 are the same pre-existing failures as v1_99; all
  need `help.html`, `admin.html`, `network.html` and other files not in this tree.

## Not done / to know
- No browser was available while making these changes, so layout (the journey
  steps, the header) was checked by reading sizes, not by screenshot.
- The Wall's tile thumbnails 404 on the deployed site (poster files not
  deployed) and there is a large gap between its filter row and "Long Form".
  Both untouched.
- Law page facts beyond the breed ban were not independently re-verified; the
  site's own audit script says the same.
