# Site chrome: header, announcement bar, footer, cursor

One source, stamped into every page. Nothing here is copied by hand any more.

| What | Where |
|---|---|
| Header + announcement markup | `assets/chrome-header.html` (template) |
| Footer markup | `assets/chrome-footer.html` |
| Header, bar, footer, cursor CSS | `assets/chrome.css` |
| Measuring, closing the bar, drawing the cursor | `assets/chrome.js` |
| The logo | `img/logo.png` (was a 14 KB base64 string in each page) |
| Which item is current, whether a page shows a Cart, what its bar says | `PAGES` in `scripts/sync-chrome.js` |

## Editing

- Change the header for every page: edit the template or the stylesheet, then
  `npm run sync:chrome`.
- Add a page: add a row to `PAGES`, give the page a `<header class="site">`
  placeholder anywhere in `<body>`, run `npm run sync:chrome`.
- `npm run check:chrome` (and `test/chrome-in-sync.test.js`) fails if any page
  has drifted from the source. `build:product` and `build:quiz` apply the chrome
  last, so a rebuild cannot put a copied header back.

## Why

Fourteen pages carried fourteen copies of the header, its CSS and its script.
They had split into three families (founder's, the shop's, and index.html's
inline bundle) with different breakpoints, a different logo position, a capped
nav width on the home page and a border line on CineKind. The cursor was the
same story: each copy had its own hand-written list of "dark" surfaces, so any
surface not on the list (the Wall's black video frames) got the ink chevron
with a white glow drawn over black.

The cursor now reads the real background under the pointer
(`getComputedStyle` up the tree to the first opaque colour, luminance under .35
is dark; photographs and video count as dark). `data-cursor="light"` on an
element still forces the light chevron, `data-cursor="dark"` the ink one.

Also removed: the Google Fonts `<link>` for Marcellus on every page. The face is
self-hosted in `fonts/`, and the CDN copy was overriding it.

## What a page still owns

Its tokens (`:root`), its own sections and their reservation of
`calc(var(--ann) + var(--nav) + ...)` for the fixed header, and any page script.
`window.PFA_CHROME.measure()` re-measures after a page changes its own layout;
`window.PFA_CHROME.recolourCursor()` re-reads the surface under a still pointer
after a page repaints beneath it.
