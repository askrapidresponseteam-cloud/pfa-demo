# The PFA Library

`library.html` is the shelf; `read.html?r=<slug>` is the reader. Every document is one PFA listed on its resources page, under the title and Google Drive file it gave (PFA Resources, Downloadable Links); `test/library.test.js` holds the shelves to that list.

## Files

| What | Where |
| --- | --- |
| The catalogue (titles, shelves, descriptions, Drive ids, PDFs) | `data/library.json`, edited by hand |
| The PDFs | `resources/`, as PFA put them there on 3 Oct 2026, under their own names |
| Reading editions (the text of each PDF, in blocks) | `media/library/<slug>.json`, written by the build |
| Shelves in the page, and the reader's catalogue | `library.html` (between `library:start` and `library:end`, and the hero's `library-stack` markers) and `assets/library-data.js`, written by the build |
| Build | `scripts/build-library.js`; the PDF reading is `scripts/library-extract.js` |
| Library page | `library.html`, `assets/library.css`, `assets/library.js` |
| Reader | `read.html`, `assets/reader.css`, `assets/reader.js`; original pages in `assets/reader-pdf.js` |
| pdf.js 6.3 (legacy build, renamed `.js`, so `minify.js` ships it) | `assets/vendor/pdfjs/`, Apache-2.0 |
| Reading fonts | `fonts/literata-*.woff2`, `fonts/opendyslexic-*.woff2`, both SIL OFL (`fonts/OFL-*.txt`) |

## Commands

```bash
node scripts/build-library.js            # write library.html and assets/library-data.js
node scripts/build-library.js --check    # fail if either is out of date (npm run check:library)
node scripts/build-library.js --extract  # (re)build the editions whose PDF or extractor changed
npm run media:library                    # --fetch: also download from Drive any document with no PDF here
```

Every edition records the size and SHA-1 of the PDF it was read from and the extractor's `VERSION`; `--extract` redoes only what has changed, and `test/library.test.js` fails when an edition is stale. Bump `VERSION` in `scripts/library-extract.js` when a change there would change an edition.

## Adding a document

1. Put the PDF in `resources/`.
2. Add an entry to `data/library.json`: `slug` (lower case, hyphens), `title` as supplied, `shelf`, `drive` (the file id from its Drive link), `pdf` (`"resources/<file name>.pdf"`), `kind` (the label on the cover, such as Handbook), `blurb` (at most 180 characters, and only what the document itself says), and `language` if it is not in English.
3. `node scripts/build-library.js --extract`, then open it in the reader and look.

A document with no `pdf` is still listed. The reader opens it in Google Drive's viewer inside the reading frame, and Download goes to Drive. `npm run media:library` (which `DEPLOY.command` runs) tries to download it into `media/library/<slug>.pdf`; Drive refuses any file not shared with "Anyone with the link".

## What the reader does with a document

- **Reading text.** This is the default when the edition says `text: true`. The document's own words are set in the reader's type. Two settings control the layout: **Turning** (pages or scroll) and **Columns** (one or two, on a wide screen). The Aa panel sets everything else: paper (light, sepia, dark), font (Literata, the site's sans, OpenDyslexic), size, line spacing, paragraph spacing, margins and alignment. Pages of the original that cannot be set as text appear as a card that opens them as printed: pictures, scans, Hindi that the PDF's font has scrambled, and the printed contents page (whose card opens the reader's own Contents).
- **Original pages.** This is the default when the text cannot be trusted, and always one tap away under Aa. pdf.js draws the PDF page by page, using range requests, so a 50 MB report opens on the page being read. Search works on the printed pages too, and hits are marked where they are printed.
- **Drive.** This is used only when no PDF is served by the site.

The extractor declines the reading text, and the reader shows the original pages, when the text layer is:

- **missing:** a scan (Kanha Gaushala);
- **an OCR layer:** the PCA Act is a scanned 1960 Gazette whose OCR reads "Definitions" as "D«ftmt on«", and a law must not be misquoted;
- **a legacy Hindi font:** Kruti Dev stores Devanagari as Latin letters;
- **damaged Unicode Hindi:** some fonts map conjuncts to other scripts' letters (the UP UD handbook and Shvaan Pashu).

On 3 Oct 2026, 14 of the 18 PDFs had a reading edition. Piggery Handbook Uttarakhand has no PDF yet.

## Place, progress and settings

All of this is kept in the visitor's own browser, in localStorage, with every read and write in a try/catch:

- `pfa:library:v1` holds the place in each document: a block and a character for the text, or a page for the original. It also records the last document opened, which is what library.html shows under Continue reading.
- `pfa:library:settings` holds the reader's settings.

A jump to a search result offers "Back to page N". The saved place stays where it was until the reader goes back, or chooses to stay.

## Rules the pages keep

- `read.html` carries no site header or footer: it is in `SKIP` in `scripts/sync-chrome.js` and is exempt in the chrome, header and page-shell tests. It is also left out of site search (`EXCLUDE` in `scripts/build-search-index.js`), and it is `noindex`; `library.html` is the page search engines index.
- Google Drive's viewer is named in the CSP `frame-src` on both hosts. pdf.js runs with `isEvalSupported: false`. `resources/` is published by `scripts/build-firebase.js`.
- A link to a PDF is percent-encoded (the file names carry spaces, brackets and Devanagari); `scripts/audit-site.js` decodes it before looking on disk.
