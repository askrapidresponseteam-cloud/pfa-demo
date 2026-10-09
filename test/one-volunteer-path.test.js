'use strict';

/* One way to volunteer (owner, 9 Oct 2026: "is there conflicting volunteer
   option. pls ensure no conflict whatsoever. be it discover or application").

   There were two: the volunteer application on get-involved.html (PFA-V,
   filed under Volunteers) and "Time as a volunteer" on the Animal Care
   Centre's own form (PFA-SG, filed as an offer to the centre), and the menus
   sent people to different places (the header to the Get Involved page, the
   footer to the application, Careers to both). Now there is one application
   and every way in leads to it: the centre is one of its areas, chosen in
   advance when someone comes from the centre's page. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const PAGES = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html') && !['admin.html', 'submission-collage.html'].includes(f));
const THE_ONE = /^get-involved\.html(\?area=[a-z-]+)?#volunteer$/;

test('one form files volunteer applications, and no other form offers volunteering', () => {
  const filers = [];
  for (const file of PAGES) {
    const html = read(file);
    if (/kind:\s*'PFA-V'|PFAForms\.submit\('PFA-V'/.test(html)) filers.push(file);
    const doc = new JSDOM(html).window.document;
    for (const input of doc.querySelectorAll('main input[type="radio"], main input[type="checkbox"], main option')) {
      const value = (input.getAttribute('value') || input.textContent || '').trim();
      if (/volunteer/i.test(value) && !(file === 'csr.html' && value === 'Employee volunteering') && !(file === 'ask.html' && value === 'Volunteering')) {
        assert.fail(`${file} offers "${value}" as a choice: volunteering is applied for on get-involved.html#volunteer only`);
      }
    }
  }
  assert.deepEqual(filers, ['get-involved.html']);
  /* the Animal Care Centre's form takes supplies and group visits only */
  const F = require('../lib/submission-fields.js');
  assert.deepEqual(F.KINDS['PFA-SG'].options.offer, ['Supplies for the animals', 'A visit with a group']);
  assert.doesNotMatch(read('sgacc.html'), /Time as a volunteer/);
});

test('every link that says volunteer leads to the one application', () => {
  const wrong = [];
  const sources = PAGES.map((f) => [f, read(f)]).concat([['assets/chrome-header.html', read('assets/chrome-header.html')], ['assets/chrome-footer.html', read('assets/chrome-footer.html')]]);
  for (const [file, html] of sources) {
    const doc = new JSDOM(html.replace(/\{\{CURRENT:([^|}]+)\|([^|}]+)(?:\|[^}]+)?\}\}/g, '<a href="$1">$2</a>')).window.document;
    for (const a of doc.querySelectorAll('a[href]')) {
      const text = a.textContent.replace(/\s+/g, ' ').trim();
      if (!/^volunteer\b/i.test(text)) continue;
      const href = a.getAttribute('href');
      /* the page's own menu entry points at itself */
      if (file === 'get-involved.html' && (href === '#volunteer' || href === '#top')) continue;
      if (!THE_ONE.test(href)) wrong.push(`${file}: "${text}" -> ${href}`);
    }
  }
  assert.deepEqual(wrong, []);
});

test('the centre is an area of the one application, chosen in advance from its page', () => {
  const gi = read('get-involved.html');
  assert.match(gi, /data-area="Sanjay Gandhi Animal Care Centre" data-area-key="sgacc"/);
  assert.match(gi, /\[data-area-key="' \+ want \+ '"\]/, 'the area named in the link is pressed on arrival');
  const sg = new JSDOM(read('sgacc.html')).window.document;
  assert.ok(sg.querySelector('a[href="get-involved.html?area=sgacc#volunteer"]'), 'the centre sends volunteers to the application');
  assert.equal(sg.querySelectorAll('#sgForm input[name="offer"]').length, 2);
  /* qualified vets have their own way in, and the application says so */
  assert.match(gi, /class="gi__areanote">[^<]*<a href="careers\.html#veterinary-team">Careers<\/a>/);
});

test('in a browser: arriving from the centre, the centre is already chosen', () => {
  const html = read('get-involved.html');
  const dom = new JSDOM(html, { url: 'https://pfa.test/get-involved.html?area=sgacc#volunteer', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = function () {};
  const inline = [...w.document.querySelectorAll('script:not([src])')].map((s) => s.textContent).filter((t) => /data-area-hint/.test(t));
  assert.equal(inline.length, 1);
  try { w.eval(inline[0]); } catch (_) { /* the page's other parts expect their libraries; the areas run first */ }
  const b = w.document.querySelector('[data-area-key="sgacc"]');
  assert.equal(b.getAttribute('aria-pressed'), 'true');
  assert.match(w.document.querySelector('[data-area-hint]').textContent, /Sanjay Gandhi Animal Care Centre/);
});

test('search sends "volunteer", in any of its forms, to the one application', async () => {
  const { createDocument } = require('./_dom-shim.js');
  const indexJson = read('search-index.json');
  const doc = createDocument('<html><body></body></html>');
  const win = {
    document: doc, location: { search: '', hash: '', pathname: '/index.html', href: 'https://x/', protocol: 'https:' },
    navigator: {}, history: { replaceState() {}, pushState() {} },
    sessionStorage: { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } },
    localStorage: null, matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {}, removeEventListener() {},
    setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: () => 1,
    console, JSON, Math, Date, Number, String, Boolean, Array, Object, RegExp, Error, parseInt, parseFloat, isNaN,
    encodeURIComponent, decodeURIComponent, Promise, Map, Set, URL, URLSearchParams,
    fetch: (u) => Promise.resolve({ ok: String(u) === 'search-index.json', json: () => Promise.resolve(JSON.parse(indexJson)) })
  };
  win.window = win; win.self = win; win.globalThis = win; doc.defaultView = win;
  vm.runInContext(read('pfa-search.js'), vm.createContext(win), { filename: 'pfa-search.js' });
  const S = await new Promise((r) => setImmediate(() => setImmediate(() => r(win.PFASearch))));
  for (const q of ['volunteer', 'volunteering', 'volunteer at shelter', 'volunteer in delhi', 'volunteer at sgacc', 'volunteer with animals']) {
    const first = S.search(q, { limit: 1 }).rows[0];
    assert.equal(first && first.u, 'get-involved.html#volunteer', `"${q}" opened ${first && first.u}`);
  }
});
