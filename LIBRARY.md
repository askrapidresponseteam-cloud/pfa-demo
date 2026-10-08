# The PFA Library

`library.html` is the shelf; `read.html?r=<slug>` is the reader. Every document is one PFA listed on its resources page, under the title and Google Drive file it gave (PFA Resources, Downloadable Links); `test/library.test.js` holds the shelves to that list.

The reader shows each document as it was published: its own PDF, page by page. Nothing is retyped or reflowed, and the reader adds no title page of its own.

## Files

| What | Where |
| --- | --- |
| The catalogue (titles, shelves, descriptions, Drive ids, PDFs) | `data/library.json`, edited by hand |
| The PDFs | `resources/`, as PFA put them there on 3 Oct 2026, under their own names |
| Covers (each PDF's cover page, drawn as WebP, 520px wide) | `media/library/covers/<slug>.webp`, written by the build |
| Indexes (page count, contents with pages, reading time) | `media/library/<slug>.json`, written by the build |
| Shelves in the page, and the reader's catalogue | `library.html` (between `library:start` and `library:end`, and the hero's `library-stack` markers) and `assets/library-data.js`, written by the build |
| Build | `scripts/build-library.js`; reading the PDFs is `scripts/library-extract.js` |
| Library page | `library.html`, `assets/library.css`, `assets/library.js` |
| Reader | `read.html`, `assets/reader.css`, `assets/reader.js`; the pages are drawn by `assets/reader-pdf.js` |
| pdf.js 6.3 (legacy build, renamed `.js`, so `minify.js` ships it) | `assets/vendor/pdfjs/`, Apache-2.0 |

## Commands

```bash
node scripts/build-library.js            # write library.html and assets/library-data.js
node scripts/build-library.js --check    # fail if either is out of date (npm run check:library)
node scripts/build-library.js --extract  # (re)make the cover and index of every PDF that changed
npm run media:library                    # --fetch: also download from Drive any document with no PDF here
```

Every index records the size and SHA-1 of the PDF it was made from, the extractor's `VERSION`, and the page its cover came from. `--extract` redoes only what has changed, and `test/library.test.js` fails when an index is stale. Bump `VERSION` in `scripts/library-extract.js` when a change there would change an index.

## Adding a document

1. Put the PDF in `resources/`.
2. Add an entry to `data/library.json` with these fields:
   - `slug`: lower case, hyphens.
   - `title`: as supplied.
   - `shelf`.
   - `drive`: the file id from its Drive link.
   - `pdf`: `"resources/<file name>.pdf"`.
   - `kind`: the label on the card, such as Handbook.
   - `blurb`: at most 180 characters, and only what the document itself says.
   - `language`: only if it is not in English.
   - `coverPage`: only if the cover is not page 1. The UP UD handbook has a foreword bound in front of its cover, so its entry says `"coverPage": 2`.
3. Run `node scripts/build-library.js --extract`, then look at the card and open it in the reader.

A document with no `pdf` is still listed. The reader opens it in Google Drive's viewer inside the same frame, and Download goes to Drive. `npm run media:library` (which `DEPLOY.command` runs) tries to download it into `media/library/<slug>.pdf`; Drive refuses any file not shared with "Anyone with the link".

## The reader

- **Pages.** pdf.js draws each page at the screen's resolution, with a transparent text layer over it so text can be selected and search hits marked where they are printed. It uses range requests, so a 68 MB scan opens on the page being read. In **Pages** (the default on a wide screen) a page, or two side by side like an open book, is fitted between the bar and the foot. You turn it with the arrow keys, a click or tap near either edge, a swipe or the wheel, and the next and previous pages are drawn ahead. In **Scroll** (the default on a phone) every page runs down one column. Pages are drawn as they come near the screen and let go when far from it.
- **Aa.** Paper (Light, Sepia, Dark), page size (fit, or smaller and larger by steps), turning (pages or scroll), and one page or two side by side. Paper is a CSS filter on the page's canvas: Sepia warms it, and Dark dims it on a dark desk. Dark does not invert, because inverting turns photographs and covers into negatives.
- **Contents** come from the index, else from the PDF's bookmarks. **Search** reads the PDF's own text layer, lists every hit with its page and section, and marks the chosen one on the page with "Back to page N".
- **Drive** is used only when the site serves no PDF for a document, or the PDF cannot be drawn.

## Contents

The extractor finds each document's contents in this order:

1. **The PDF's bookmarks,** when they are real titles. None of the 18 has any: one PDF's bookmarks are hash file names, another's are "Page 1", "Page 2", and those are refused.
2. **Its printed contents page.** Each entry is read in its own words: page numbers set in a column of their own, chapter numbers set to the left, and titles that run onto a second line. The extractor then finds the page where each entry begins by looking for its title where it starts a line. Printed page numbers seldom equal the PDF's, because a cover and front matter come first and full-page pictures go unnumbered. The offset most entries agree on settles the rest. An entry it cannot place is left out rather than guessed. If fewer than half the entries can be placed, the printed contents is not used.
3. **Its headings,** found by size and weight.

On 3 Oct 2026, 12 of the 18 PDFs used their printed contents. The Revised ABC Module and the Lucknow Blue Book used their headings. The PCA Act (a scanned Gazette with an OCR layer that misreads words), the UP UD handbook and Shvaan Pashu (Hindi their fonts scramble) and Kanha Gaushala (a scan) have no trustworthy text, so they have no contents and no reading time. The reader moves through them by the slider. Piggery Handbook Uttarakhand has no PDF yet.

## Place, progress and settings

All of this is kept in the visitor's own browser, in localStorage, with every read and write in a try/catch:

- `pfa:library:v1` holds the page reached in each document and how far through it is. It also records the last document opened, which is what library.html shows under Continue reading.
- `pfa:library:settings` holds the reader's settings: paper, page size, turning, side by side.

A jump to a search result offers "Back to page N". The saved place stays where it was until the reader goes back, or chooses to stay.

## Rules the pages keep

- `read.html` carries no site header or footer. It is in `SKIP` in `scripts/sync-chrome.js` and is exempt in the chrome, header and page-shell tests. It is also left out of site search (`EXCLUDE` in `scripts/build-search-index.js`), and it is `noindex`; `library.html` is the page search engines index.
- Google Drive's viewer is named in the CSP `frame-src` on both hosts. pdf.js runs with `isEvalSupported: false`. `resources/` is published by `scripts/build-firebase.js`.
- A link to a PDF is percent-encoded, because the file names carry spaces, brackets and Devanagari. `scripts/audit-site.js` decodes it before looking on disk.
