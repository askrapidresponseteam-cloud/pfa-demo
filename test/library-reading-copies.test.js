'use strict';

/* The library's books on a phone.

   Owner, 7 Oct 2026: "ensure the books load perfectly on mobile as well.
   resource library ones. pls check and optimise."

   Measured that day on an emulated iPhone over 4G (8 Mbps, 150 ms): most
   books showed their first page in 3 to 8 seconds, and the Hindi gaushala
   manual, a 68 MB scan with its text drawn as outlines, showed nothing for a
   minute and a half. Each document now has a reading copy in resources/read/
   (scripts/build-reading-copies.py): the same pages, photographs sized for a
   screen, outlined pages as one picture each, linearized. Every book then
   showed its first page in 2.6 to 6.8 seconds; the gaushala manual in 6.7.

   These hold the pieces in place: the copies exist, are whole and linearized,
   the reader opens them, Download keeps the original, and a phone's address
   bar or keyboard no longer makes the reader draw every page again. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const lib = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/library.json'), 'utf8'));
const withPdf = lib.items.filter((it) => it.pdf);

function head(file) {
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(1024);
  fs.readSync(fd, buf, 0, 1024, 0);
  fs.closeSync(fd);
  return buf.toString('latin1');
}

function clientItems() {
  const src = fs.readFileSync(path.join(ROOT, 'assets/library-data.js'), 'utf8');
  const window = {};
  new Function('window', src)(window);
  return window.PFA_LIBRARY.items;
}

/* The copies are built on GitHub after a push (they are too large for the
   site's zip), so a fresh checkout may not have them yet. Those that are here
   are checked; the workflow that makes the rest is checked below. */
test('every reading copy that is here is a whole, linearized PDF of its document', () => {
  for (const it of withPdf) {
    const copy = path.join(ROOT, 'resources/read', it.slug + '.pdf');
    if (!fs.existsSync(copy)) continue;
    const top = head(copy);
    assert.match(top, /^%PDF-/, `${it.slug}: not a PDF`);
    const lin = /\/Linearized\s+1[^>]*\/N\s+(\d+)/.exec(top);
    assert.ok(lin, `${it.slug}: not linearized, so a phone reads more of it before the first page`);
    const edition = path.join(ROOT, 'media/library', it.slug + '.json');
    if (fs.existsSync(edition)) {
      const pages = JSON.parse(fs.readFileSync(edition, 'utf8')).pages;
      if (pages) assert.equal(Number(lin[1]), Number(pages), `${it.slug}: the copy has ${lin[1]} pages, the document ${pages}`);
    }
    const original = fs.statSync(path.join(ROOT, it.pdf)).size;
    assert.ok(fs.statSync(copy).size <= original * 1.05, `${it.slug}: the reading copy is heavier than the original`);
  }
});

test('the heaviest books are now light enough for a phone', () => {
  for (const slug of ['kanha-gaushala-up', 'scc-policy-brief']) {
    const it = lib.items.find((i) => i.slug === slug);
    if (!fs.existsSync(path.join(ROOT, 'resources/read', slug + '.pdf'))) continue;
    const before = fs.statSync(path.join(ROOT, it.pdf)).size;
    const after = fs.statSync(path.join(ROOT, 'resources/read', slug + '.pdf')).size;
    assert.ok(after < before * 0.6, `${slug}: ${(after / 1e6).toFixed(1)} MB of ${(before / 1e6).toFixed(1)} MB`);
  }
});

test('the reader opens the reading copy; Download gives the original', () => {
  const items = clientItems();
  for (const it of withPdf) {
    const row = items.find((r) => r.slug === it.slug);
    assert.equal(row.read, 'resources/read/' + encodeURIComponent(it.slug) + '.pdf', it.slug);
    assert.equal(decodeURIComponent(row.file), it.pdf, `${it.slug}: Download must stay the original`);
  }
  const reader = fs.readFileSync(path.join(ROOT, 'assets/reader.js'), 'utf8');
  assert.match(reader, /return from\(item\.read\)\.catch\(function \(error\) \{[^}]*book\.innerHTML = '';\s*return from\(item\.file\);/,
    'a copy not built yet falls back to the original, not to Google Drive');
  assert.match(reader, /var downloadHref = item \? \(item\.file \|\|/);
});

test('the page engine fetches by range and does not redraw for a height-only resize', () => {
  const engine = fs.readFileSync(path.join(ROOT, 'assets/reader-pdf.js'), 'utf8');
  assert.match(engine, /disableAutoFetch:\s*true/);
  assert.match(engine, /disableStream:\s*true/);
  assert.match(engine, /if \(!widthMoved && \(layout === 'scroll' \|\| !heightMoved\)\) return;/);
});

test('GitHub builds the reading copies after a push, from the PDFs in the repository', () => {
  const wf = fs.readFileSync(path.join(ROOT, '.github/workflows/reading-copies.yml'), 'utf8');
  assert.match(wf, /branches: \[main\]/);
  for (const p of ["'resources/\\*\\.pdf'", "'data/library\\.json'", "'scripts/build-reading-copies\\.py'"]) assert.match(wf, new RegExp(p));
  assert.match(wf, /contents: write/);
  assert.match(wf, /apt-get install -y -q poppler-utils/, 'pdftoppm, for pages drawn as outlines');
  assert.match(wf, /pip install --quiet pikepdf pillow/);
  assert.match(wf, /run: python scripts\/build-reading-copies\.py\n/, 'missing copies only, never --force on every push');
  assert.match(wf, /git add resources\/read\n/);
});

/* Owner, 7 Oct 2026: "everything appearing blank in resource library book
   when opened on phone". The same pages drew in Chromium and in WebKit
   (WebKitGTK 2.52, driven here), so every path only an iPhone takes is made
   the plainest one, a drawn page is never thrown away, and a reader who
   still sees nothing is told so and offered the PDF itself. */
test('on an iPhone the reader takes the plain paths, and a drawn page is never thrown away', () => {
  const engine = fs.readFileSync(path.join(ROOT, 'assets/reader-pdf.js'), 'utf8');
  assert.match(engine, /isOffscreenCanvasSupported: !plain, isImageDecoderSupported: !plain/, 'no OffscreenCanvas or ImageDecoder on Safari and iPhones');
  assert.match(engine, /\(iPad\|iPhone\|iPod\)/);
  const put = engine.indexOf("holder.insertBefore(canvas, holder.firstChild);");
  const text = engine.indexOf('return page.getTextContent().then(function (content) {');
  assert.ok(put > -1 && text > put, 'the page goes on screen before, and regardless of, its text layer');
  assert.match(engine, /ctx\.setTransform\(1, 0, 0, 1, 0, 0\);[\s\S]{0,120}globalCompositeOperation = 'multiply'/, 'the paper colour is drawn into the page');
  const css = fs.readFileSync(path.join(ROOT, 'assets/reader.css'), 'utf8');
  assert.doesNotMatch(css, /\.rd-pg canvas\{[^}]*filter:(?!none)/, 'no CSS filter on a page canvas: an iPhone has drawn filtered canvases blank');
  assert.match(css, /\.rd-pg:not\(\.is-drawn\)::after\{content:"Loading page"/, 'an undrawn sheet says it is loading');
});

test('a reader who sees no page after twenty seconds is offered the PDF and Google\'s viewer, and ?debug=1 says why', () => {
  const reader = fs.readFileSync(path.join(ROOT, 'assets/reader.js'), 'utf8');
  assert.match(reader, /\}, 20000\);/);
  assert.match(reader, />Open the PDF<\/a>/);
  assert.match(reader, /openDrive\(\); \}\);/);
  assert.match(reader, /\[\?&\]debug=1/);
  assert.match(reader, / {4}redraw\(\);\n {2}\}/, 'a change of paper draws the pages again, since the colour is in them');
});
