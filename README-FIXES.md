# PFA site v1.37

Deploy the contents of this folder as-is. Root serves `index.html`.

## What was broken

`people-for-animals.html` and `submission-collage.html` were not HTML pages.
They were bundler exports: the real markup sat in an escaped JavaScript string,
and every asset was referenced by a bare UUID. Those UUIDs resolved against an
**asset map embedded on a single 258 KB line** that only the bundler's runtime
knew how to read. Vercel never read it, so the font, hero, logo and every layout
script 404'd at once.

## Assets recovered from that map

Extracted and shipped as real files. Verified **byte-identical** by SHA-256:

| File | Size |
|---|---|
| `img/hero-caregiver.webp` | 70.2 KB |
| `fonts/marcellus-latin.woff2` | 13.9 KB |
| `fonts/marcellus-latin-ext.woff2` | 8.5 KB |
| logo (inlined as a data URI) | 9.9 KB |

## Fixes

| Item | Before | After |
|---|---|---|
| Nav clipped under the black bar | `top:{{ navTop }}` — invalid CSS, dropped by the browser | `top:34px` |
| Hero blank | UUID → 404 | recovered WebP |
| Marcellus not loading | UUID → 404 | recovered woff2, self-hosted |
| Logo missing | UUID → 404 | embedded PNG |
| Homepage would not render | needed a runtime never shipped | flattened to static HTML |
| Collage dead | same bundler problem | runtime ported to vanilla JS |
| Root URL 404 | no `index.html` | added |
| Carousel arrows dead | wrong selector | `[data-stories-track]` |
| 4 buttons had no hover state | `style-hover` is runtime-only | real CSS `:hover` rules |

## Fidelity notes

- **Font** — the original `@font-face` block is restored verbatim: same two
  files, same `unicode-range` subsets, same `font-display:swap`, self-hosted.
  No CDN. Loads exactly as it did locally.
- **Values** — `top:34px`, `#fff`, `#111`, `logoFilter:none`, `heroOverlay:0.4`
  were read out of the component's own `renderVals()`, not guessed.
- **Boxes** — all 18 `<image-slot>` parents were checked with a tag-stack walk;
  every one has a definite height, so nothing can collapse.
- **Collage** — keeps its Lehmer RNG (seed 42), inertia 0.94, parallax, tilt and
  shuffle choreography. Layout reproduces exactly: row widths sum to 3288 =
  `blockW - COLS*GAP`, so the block still tiles seamlessly across 48 tiles.
- **Untouched** — the nine original pages are byte-identical to your originals.

## Known gaps (not bugs)

**26 unfilled image slots.** Never filled in the source either — the asset
map holds no images for them, only the briefs below. They render using the
`<image-slot>` component's own shadow-DOM CSS (`rgba(127,127,127,.08)` frame,
13px system-ui caption), so they look exactly as they do locally.

To ship without the captions showing:

```html
<body class="hide-slot-captions">
```

Drop a file at any path below and that slot fills itself and drops its caption —
no HTML edits, no layout shift.

| Save as | What it should show |
|---|---|
| `img/slots/feat-urgent.jpg` |  |
| `img/slots/card-u1.jpg` |  |
| `img/slots/card-u2.jpg` |  |
| `img/slots/card-r1.jpg` |  |
| `img/slots/card-r2.jpg` |  |
| `img/slots/feat-rescued.jpg` |  |
| `img/slots/fullbleed.jpg` |  |
| `img/slots/card-d1.jpg` |  |
| `img/slots/card-d2.jpg` |  |
| `img/slots/card-d3.jpg` |  |
| `img/slots/card-d4.jpg` |  |
| `img/slots/card-p1.jpg` |  |
| `img/slots/card-p2.jpg` |  |
| `img/slots/card-p3.jpg` |  |
| `img/slots/card-p4.jpg` |  |
| `img/slots/story-1.jpg` |  |
| `img/slots/story-2.jpg` |  |
| `img/slots/story-3.jpg` |  |
| `img/slots/story-4.jpg` |  |
| `img/slots/quiz-bg.jpg` |  |
| `img/slots/quiz-tile-1.jpg` |  |
| `img/slots/quiz-tile-2.jpg` |  |
| `img/slots/quiz-tile-3.jpg` |  |
| `img/slots/quiz-tile-4.jpg` |  |
| `img/slots/split-1.jpg` |  |
| `img/slots/split-2.jpg` |  |

**48 optional collage tiles** — `img/submissions/sub-0-0.jpg` … `sub-5-7.jpg`.
The wall works without them.

**CineKind media.** Six of the fifteen were traced to the Film Federation of
India's own events page, which `cinekind.html` already linked to. The numbering
maps 1:1, so `event-14/15/16/18/22/29.webp` now point at
`filmfederation.in/images/events/cinekind/14|15|16|18|22|29.jpg` and load.

Those are hotlinked to a third-party server. To pull them local instead, run
`./localise-cinekind.sh` from the site root — it downloads all six, converts to
webp if `cwebp` is installed, and rewrites `cinekind.html` to match.

Still missing, not on that page and not in any asset map:

| File | Subject |
|---|---|
| `media/cinekind-2025/harsha.webp` | Dr Harsha Atmakuri with his camera |
| `media/cinekind-2025/dolly.webp` | Dolly Vyas Ahuja at a screening of The Land of Ahimsa |
| `media/cinekind-2025/rupali.webp` | Rupali Ganguly embracing a rescued dog |
| `media/cinekind-2025/pooja.webp` | Pooja Bhatt, filmmaker and animal advocate |
| `media/cinekind-2025/sandhya.webp` | Dr Sandhya Sekar on a forest trail |
| `media/cinekind-2025/mohit.webp` | Mohit Chauhan caring for two street dogs |
| `media/cinekind-elephant.mp4` | background video |
| `media/cinekind-langur.mp4` | background video |
| `media/cinekind-lion.mp4` | background video |

**Check the six before publishing.** The filenames map cleanly, but the alt text
makes specific claims about who is in each shot and that could not be verified
from the source page.

## v1.34 — site search

- `search.html` new: results page built on the inner-page shell (same header,
  footer, hero, cursor). Query becomes the display headline; results are
  grouped by section with filter tabs and counts.
- `pfa-search.js` / `pfa-search.css` new, included in the `<head>` of every
  page. "Enter PFA" on the home page opens the "What would you like to do
  today?" overlay; Ctrl/Cmd-K opens it anywhere; `/` opens it on pages without
  their own filter box. Ranking: field weights × IDF, stemming, synonyms,
  prefix matching, typo tolerance, did-you-mean, completions, recent searches.
- `build-index.js` new: `node build-index.js` writes `search-index.json`
  (all 200 law answers, every shop product and kit with price, every event,
  CineKind honourees, and each page section). Re-run after content changes.
- A result can land on a page already filtered: `pfa-shop.html?q=kibble`,
  `laws.html?q=RWA`, `events.html?q=Mumbai` fill that page's own search box.
- YouTube removed from every footer.
- Home page: horse card and horse story photo replaced; face-safe crop
  positioning added for all card, tile and story images.

Not on the site yet, so search points at the nearest real answer: "Report
cruelty" → laws A33; "Apply for a colony caregiver card" → laws A10/A11; hospitals →
`units.html` (placeholder). Footer links to `people-for-animals.html`,
`#` (Volunteer, Foster, Report a rescue, FAQ, Contact) were already dead
and are untouched.

## v1.35

- Marcellus is now self-hosted on every page (same two woff2 files the home
  page already used). Inner pages had relied on Google Fonts alone, so when
  that request was slow or blocked, headlines fell back to Georgia/Times and
  looked like a different face from "A kinder world for every animal".
- Logo/wordmark on every page now links to `index.html` (the Enter PFA hero).
  It pointed at `people-for-animals.html`, which does not exist. The footer's
  Dogs / Cats / Small animals / Our story / Programs links had the same dead
  target and now go to the matching sections on `index.html`.

## v1.36
- Home page: the custom cursor stayed black over the black announcement bar
  because that bar had no `data-cursor="light"` (the inner pages already
  handled `.announce`). Added it, and the cursor now also flips back to dark
  over the white "Enter PFA" button so it never disappears against white.

## v1.37
- Founder page numbers: "2.5L Members and volunteers" → "1M+ Lives touched";
  "165 units" → "90+"; the 1994 founding-year figure removed and the year
  removed from the meta description, hero role line and story paragraph.
  Grid is now four figures wide.
