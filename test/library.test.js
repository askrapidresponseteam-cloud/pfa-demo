'use strict';

/* The PFA Library (library.html) and its reader (read.html).

   The shelves hold exactly the documents PFA supplied on its resources
   page (PFA Resources, Downloadable Links), under the titles and Google
   Drive files it gave; the page and the reader's catalogue are in step
   with data/library.json; and the reading editions say only what the PDF
   says. The extraction tests run pdf.js over small PDFs in
   test/fixtures/library/ made to have the shapes of the real documents: a
   cover, running heads and folios, chapters, numbered clauses, bullets, a
   table split over a page turn, a picture page, hyphenated line ends, a
   paragraph across a page break, a scan, and Hindi set in a legacy font. */

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const B = require('../scripts/build-library.js');
const X = require('../scripts/library-extract.js');
const DATA = JSON.parse(read('data/library.json'));
const FIX = path.join(__dirname, 'fixtures', 'library');

/* As supplied, shelf by shelf, in the supplied order. */
const SUPPLIED = {
  essential: [
    ['Prevention of Cruelty to Animals Act 1960', '12aqsaqS6JVgO4AV7dax3hx_6QhsyHvhX'],
    ['Revised Animal Birth Control Module', '12LiBm5L3p6D96-RhOploL_gTafvTgK7w'],
    ['Animal Law Handbook for Urban Local Bodies', '1YhUMAWqUbxZCFlIJ4j7YmWKLnEb_YrG3'],
    ['Law Enforcement Handbook on Animal Welfare Laws', '1Xnb_WxHTdDULwbr7aelo95XlgMyPD2m2'],
    ['Handbook for Veterinary Officers on Animal Welfare Laws', '1jV3sN_CQSrD1sJLVQZEGPgyDZzZ9vRpj']
  ],
  handbooks: [
    ['ABC Training Blue Book, Nagar Nigam, Lucknow', '1Cw8N_-t3DfZKvNC5cynu7XfrdxBg6UyN'],
    ['Delhi Police Handbook', '1xlf_lgf_QF8OrvvKNWMJWuFci1NGJRYv'],
    ['UP UD Handbook', '1qbm0vh0sSzBtlYWRPEfAZ6U2WcNZ5D52'],
    ['EY - Transitioning to Cage-Free', '1vgEnm8yTnIeaFQ607J2Y6jvetpdPUYwR'],
    ['Package Of Practices For Organized Pig Farms', '1xUbK6Vw1rb_YT7U0hg1oiI894vos_vAp'],
    ['Piggery Handbook Uttarakhand', '1XoO45Hs5kq2gPQxFwTbPTfJevSMJnYUS'],
    ['Kanha Gaushala, Govt of UP', '1igF7rS-uUIraStXTPGvTziN664ClPnoI'],
    ['Shvaan Pashu', '17JX79mBQi4rrjEq30zp2aEzXqqBMAfih'],
    ['Minimum Standards for Veterinary Infrastructure', '17ZK8TIqTvPuTrjIvgAlWqUTGUWh068fX']
  ],
  research: [
    ['SCC Policy Brief', '1AD3a39onjZaAexJBH2FCAqzAD7DgzyEo'],
    ['Hidden Costs of Piggery Operations in India', '1OigazDKppHhDateqLwdFmvcsPyNwau0D']
  ],
  scoping: [
    ['Dairy Scoping Report', '1lWohKj71RN0vNrF1S2qgvhHweKBF_Z9N'],
    ['Pig Scoping Report', '1Of6P8rPUGcb1jVm0TG3mpqhipSAA0Rch'],
    ['Poultry Scoping Report', '11-z6biKcSFUIFIeNXN-KQIa3NLez7sSg']
  ]
};

/* ---- the catalogue ------------------------------------------------------ */

test('the shelves hold exactly the supplied documents, as supplied, and nothing else', () => {
  assert.deepEqual(DATA.shelves.map((s) => s.id), Object.keys(SUPPLIED));
  for (const shelf of Object.keys(SUPPLIED)) {
    const got = DATA.items.filter((it) => it.shelf === shelf).map((it) => [it.title, it.drive]);
    assert.deepEqual(got, SUPPLIED[shelf], `shelf ${shelf}`);
  }
  assert.equal(DATA.items.length, 19);
});

test('data/library.json passes its own validation', () => {
  assert.deepEqual(B.validate(DATA), []);
  const broken = JSON.parse(JSON.stringify(DATA));
  broken.items[1].drive = broken.items[0].drive;
  broken.items[2].shelf = 'nowhere';
  const problems = B.validate(broken);
  assert.ok(problems.some((p) => /same file/.test(p)), problems.join('; '));
  assert.ok(problems.some((p) => /not one of the shelves/.test(p)), problems.join('; '));
});

test('library.html and the reader catalogue are in step with the data (run node scripts/build-library.js)', () => {
  const metas = {};
  for (const it of DATA.items) metas[it.slug] = B.metaFor(it);
  const page = read('library.html');
  assert.equal(B.render(page, DATA, metas), page, 'library.html is out of date');
  assert.equal(B.clientData(DATA, metas), read('assets/library-data.js'), 'assets/library-data.js is out of date');
});

test('every document has a card that opens the reader and offers the original', () => {
  const page = read('library.html');
  for (const it of DATA.items) {
    const card = page.slice(page.indexOf(`data-slug="${it.slug}"`));
    assert.match(card, new RegExp(`href="read\\.html\\?r=${it.slug}"`), `${it.slug} has no Read link`);
    const meta = B.metaFor(it);
    if (meta.file) assert.ok(card.includes(`href="${meta.file}"`), `${it.slug} should download the copy served here`);
    else assert.ok(card.includes(`id=${it.drive}`), `${it.slug} should download from the supplied Drive file`);
  }
});

test('every PDF PFA put in resources/ belongs to a document, and every named one is there', () => {
  const named = new Set(DATA.items.filter((it) => it.pdf).map((it) => it.pdf));
  for (const f of fs.readdirSync(path.join(ROOT, 'resources')).filter((x) => /\.pdf$/i.test(x))) {
    assert.ok(named.has(`resources/${f}`), `resources/${f} is on no shelf`);
  }
  for (const rel of named) assert.ok(fs.existsSync(path.join(ROOT, rel)), rel);
});

test('a card links each PDF by its encoded name, and the file is on disk', () => {
  const page = read('library.html');
  for (const m of page.matchAll(/href="((?:resources|media\/library)\/[^"]+)"/g)) {
    assert.ok(fs.existsSync(path.join(ROOT, decodeURIComponent(m[1]))), m[1]);
    assert.doesNotMatch(m[1], /\s|\p{Script=Devanagari}/u, `${m[1]} should be percent-encoded`);
  }
});

test('every reading edition is current with its PDF and with the extractor (run node scripts/build-library.js --extract)', () => {
  const crypto = require('crypto');
  for (const it of DATA.items) {
    const rel = B.pdfPath(it);
    if (!rel) continue;
    const file = path.join(ROOT, 'media', 'library', `${it.slug}.json`);
    assert.ok(fs.existsSync(file), `${it.slug} has no edition`);
    const e = JSON.parse(fs.readFileSync(file, 'utf8'));
    const buf = fs.readFileSync(path.join(ROOT, rel));
    assert.equal(e.x, X.VERSION, `${it.slug} was read by an older extractor`);
    assert.equal(e.src.bytes, buf.length, `${it.slug}: the PDF has changed`);
    assert.equal(e.src.sha1, crypto.createHash('sha1').update(buf).digest('hex'), `${it.slug}: the PDF has changed`);
  }
});

test('reading time reads like a person would say it', () => {
  assert.equal(B.readingTime(0), '');
  assert.equal(B.readingTime(3), '5 min read');
  assert.equal(B.readingTime(22), '20 min read');
  assert.equal(B.readingTime(60), 'About 1 hour');
  assert.equal(B.readingTime(150), 'About 2\u00BD hours');
});

/* ---- the reader -------------------------------------------------------- */

test('the reader bar is Library, title, Aa, Search, Download, in that order', () => {
  const html = read('read.html');
  const bar = html.slice(html.indexOf('<header class="rd-bar"'), html.indexOf('</header>'));
  const order = ['id="rdBack"', 'id="rdTitle"', 'id="rdAaBtn"', 'id="rdFindBtn"', 'id="rdDl"'].map((id) => bar.indexOf(id));
  assert.ok(order.every((i) => i > -1), 'a control is missing from the bar');
  assert.deepEqual(order, order.slice().sort((a, b) => a - b));
});

test('the Aa panel offers every setting asked for', () => {
  const html = read('read.html');
  for (const [k, vs] of Object.entries({
    theme: ['light', 'sepia', 'dark'], font: ['serif', 'sans', 'dyslexic'], line: ['tight', 'normal', 'loose'],
    para: ['book', 'normal', 'open'], margin: ['narrow', 'medium', 'wide'], align: ['left', 'justify'],
    cols: ['1', '2'], flow: ['paged', 'scroll']
  })) for (const v of vs) assert.ok(html.includes(`data-k="${k}" data-v="${v}"`), `${k}=${v}`);
  assert.match(html, /id="rdSizeDown"[\s\S]*id="rdSize"[\s\S]*id="rdSizeUp"/, 'A-, slider, A+');
});

test('the library and the reader keep progress under the same key', () => {
  const key = /'pfa:library:v1'/;
  assert.match(read('assets/library.js'), key);
  assert.match(read('assets/reader.js'), key);
  assert.match(read('read.html'), /pfa:library:settings/);
  assert.match(read('assets/reader.js'), /'pfa:library:settings'/);
});

test('the reader loads the catalogue first, stays out of search engines, and needs no site chrome', () => {
  const html = read('read.html');
  assert.ok(html.indexOf('<script src="assets/library-data.js">') > -1);
  assert.ok(html.indexOf('<script src="assets/library-data.js">') < html.indexOf('<script src="assets/reader.js">'));
  assert.match(html, /<meta name="robots" content="noindex, follow">/);
  assert.doesNotMatch(html, /<header class="site"/);
  assert.match(read('scripts/build-search-index.js'), /'read\.html'\]\);/);
});

test('pdf.js ships as .js under assets/vendor, so the deploy keeps it and lint skips it', () => {
  for (const f of ['pdf.min.js', 'pdf.worker.min.js', 'wasm/jbig2.wasm', 'wasm/openjpeg.wasm', 'LICENSE']) {
    assert.ok(fs.existsSync(path.join(ROOT, 'assets/vendor/pdfjs', f)), f);
  }
  assert.match(read('eslint.config.mjs'), /'assets\/vendor\/\*\*'/);
  assert.match(read('assets/reader-pdf.js'), /isEvalSupported: false/);
});

test('the Drive viewer the reader falls back to is named in the policy on both hosts', () => {
  for (const f of ['vercel.json', 'firebase.json']) assert.match(read(f), /frame-src [^;]*https:\/\/drive\.google\.com/);
});

/* ---- the reading editions ---------------------------------------------- */

const squash = (s) => String(s).toLowerCase().replace(/[\s\u00AD-]+/g, '');

async function edition(name) {
  const raw = await X.readPdf(fs.readFileSync(path.join(FIX, name)));
  return { raw, ed: X.buildEdition(raw) };
}

test('an edition says only what the PDF says: every block is the PDF\'s own text, joined', async () => {
  for (const name of ['legal.pdf', 'hyphen.pdf']) {
    const { raw, ed } = await edition(name);
    /* the PDF's text less its running heads and folios, which an edition drops */
    const pages = raw.pages.map((p) => ({ ...p, lines: p.lines.slice() }));
    X.stripFurniture(pages);
    const source = squash(pages.map((p) => p.lines.map((l) => l.cells.join('')).join('')).join(''));
    for (const b of ed.blocks) {
      if (b[0] === 'fig') continue;
      const text = b[0] === 'table' ? b[1].map((r) => r.join('')).join('') : b[1];
      assert.ok(source.includes(squash(text)), `${name}: "${String(text).slice(0, 60)}" is not in the PDF`);
    }
  }
});

test('running heads and page numbers are dropped, chapters ranked, clauses and bullets kept', async () => {
  const { ed } = await edition('legal.pdf');
  assert.equal(ed.text, true);
  const all = ed.blocks.map((b) => (Array.isArray(b[1]) ? b[1].flat().join(' ') : b[1]));
  assert.ok(!all.some((t) => t === 'Handbook on Animal Welfare Laws'), 'the running head survived');
  assert.ok(!all.some((t) => /^\d+$/.test(t)), 'a folio survived');
  const heads = ed.blocks.filter((b) => /^h\d$/.test(b[0])).map((b) => b[1]);
  assert.ok(heads.includes('CHAPTER I') && heads.includes('Preliminary'));
  const li = ed.blocks.filter((b) => b[0] === 'li');
  assert.deepEqual(li.slice(0, 3).map((b) => b[3]), ['(1)', '(a)', '(b)']);
  assert.ok(li.some((b) => b[3] === '\u2022' && /species, sex/.test(b[1])));
  assert.ok(ed.toc.some((t) => t.t === 'CHAPTER II: Duties of the municipal body'), 'a chapter label and its title make one contents entry');
});

test('a table keeps its rows, and a picture page is pointed to rather than lost', async () => {
  const { ed } = await edition('legal.pdf');
  const table = ed.blocks.find((b) => b[0] === 'table');
  assert.ok(table, 'no table');
  assert.deepEqual(table[1][0], ['Offence', 'First conviction', 'Repeat']);
  assert.equal(table[1].length, 4);
  const fig = ed.blocks.find((b) => b[0] === 'fig');
  assert.ok(fig && fig[2] === 5, 'the picture page is not marked');
});

test('hyphenated line ends join, and a paragraph that crosses a page stays one paragraph', async () => {
  const { ed } = await edition('hyphen.pdf');
  const paras = ed.blocks.filter((b) => b[0] === 'p').map((b) => b[1]);
  assert.ok(paras[0].includes('financial exposure of the sector') && paras[0].includes('the assumptions behind'), paras[0]);
  assert.ok(paras.some((p) => /before the page ended, so the reader must see one paragraph/.test(p)), 'the page break split the paragraph');
  assert.ok(paras.includes('Third paragraph is separate.'));
});

test('a scan, and Hindi in a legacy font, are offered as original pages, not as gibberish', async () => {
  const scan = (await edition('scanned.pdf')).ed;
  assert.equal(scan.text, false);
  assert.match(scan.quality.reason, /scan/);
  assert.deepEqual(scan.blocks, []);
  const legacy = (await edition('legacy-hindi.pdf')).ed;
  assert.equal(legacy.text, false);
  assert.match(legacy.quality.reason, /legacy Hindi font/);
});

test('Devanagari read in visual order is put back, and logical order is left alone', () => {
  const logical = '\u0915\u093F\u0938 \u0938\u092E\u093F\u0924\u093F';
  assert.equal(X.fixDevanagari(logical), logical);
  assert.equal(X.fixDevanagari('\u093F\u0915\u0938 \u093F\u0915\u0924\u093E\u092C \u093F\u0926\u0928'), '\u0915\u093F\u0938 \u0915\u093F\u0924\u093E\u092C \u0926\u093F\u0928');
});

test('Hindi a font has scrambled is recognised, and good Hindi is not', () => {
  const good = '\u0936\u094D\u0935\u093E\u0928 \u092A\u0936\u0941 \u092A\u094D\u0930\u092C\u0928\u094D\u0927\u0928 \u092E\u0948\u0928\u0941\u0905\u0932';
  assert.equal(X.devanagariDamage(good).bad, 0);
  const scrambled = '\u1B6B \u0935\u093E\u0928 \u092A\u1CEF\u0930\u091A\u092F \u092A\u0930\u093E\u092E?\u0930\u094D\u0936\u0940';
  assert.ok(X.devanagariDamage(scrambled).ratio > 0.5);
});

test('bookmarks that are ids or file names are not contents', () => {
  assert.equal(X.saneTitle('Chapter 2: Summary'), true);
  assert.equal(X.saneTitle('ee2613e3defed6fd3d7bb6e5a762c444dbaa4d9e6100348fb392267cc4681b38.pdf'), false);
  assert.equal(X.saneTitle('9bb0e1cce4a8b9ba40b6661b55f47abb8a928015'), false);
});

test('only a hyphen before a lower-case continuation is a line-end hyphen', () => {
  assert.equal(X.joinLine('the ex-', 'posure'), 'the exposure');
  assert.equal(X.joinLine('Section 11 of the PCA-', 'Act'), 'Section 11 of the PCA- Act');
  assert.equal(X.joinLine('one', 'two'), 'one two');
});
