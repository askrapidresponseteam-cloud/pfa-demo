'use strict';

/* Site search, held to google grade.

   The engine was well built and starving: the client expected a flat array
   and the builder shipped an object, so the crawled layer never merged and
   the search box knew only the curated shortlist. Nothing said so. These
   tests make the whole promise executable: the rows layer must load, real
   queries must return the exact thing rather than the page it lives on,
   every row the engine can hand out must resolve, and every unit in the
   units.html data must be findable, because those units exist only as data
   and would otherwise be invisible to search forever. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createDocument } = require('./_dom-shim.js');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* Load pfa-search.js with fetch serving the real shipped index, and wait
   for the merge, which is promise-chained and settles within two turns. */
function engine() {
  const indexJson = read('search-index.json');
  const doc = createDocument('<html><body></body></html>');
  const win = {
    document: doc,
    location: { search: '', hash: '', pathname: '/index.html', href: 'https://x/' },
    navigator: {}, history: { replaceState() {}, pushState() {} },
    sessionStorage: { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } },
    localStorage: null,
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener() {}, removeEventListener() {},
    setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: () => 1,
    console, JSON, Math, Date, Number, String, Boolean, Array, Object, RegExp, Error,
    parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent,
    Promise, Map, Set, URL, URLSearchParams,
    /* Exact path only. A looser match here once validated a fetch of a
       file that did not exist at that path in a real browser. */
    fetch: (u) => Promise.resolve({
      ok: String(u) === 'search-index.json',
      json: () => Promise.resolve(JSON.parse(indexJson))
    })
  };
  win.window = win; win.self = win; win.globalThis = win; doc.defaultView = win;
  vm.runInContext(read('pfa-search.js'), vm.createContext(win), { filename: 'pfa-search.js' });
  return new Promise((resolve) => {
    setImmediate(() => setImmediate(() => resolve(win.PFASearch)));
  });
}

function tops(S, q, n) {
  return S.search(q, { limit: n || 3 }).rows.slice(0, n || 3);
}

test('the crawled rows layer actually reaches the engine', async () => {
  const S = await engine();
  assert.ok(S.index().length > 350,
    `engine knows ${S.index().length} rows; the rows layer did not merge`);
});

test('the exact thing, not the page it lives on', async () => {
  const S = await engine();
  const expect = [
    ['units in calicut', 'units.html?q=Calicut'],
    ['kozhikode', 'units.html?q=Calicut'],
    ['pfa unit indore contact', 'units.html?q=Indore'],
    ['become a caregiver', 'get-involved.html#caregiver'],
    ['camel slaughter', 'achievements.html#rec-003'],
    ['pet shop rules', 'achievements.html#rec-015'],
    ['snakebite', 'academy.html#e4']
  ];
  const missed = [];
  for (const [q, wants] of expect) {
    const urls = tops(S, q, 3).map((r) => r.u);
    if (!urls.includes(wants)) missed.push(`${q} -> ${urls.join(', ')} (wanted ${wants})`);
  }
  assert.deepEqual(missed, [], 'queries that missed their target:\n  ' + missed.join('\n  '));
});

test('a unit result carries the detail, not a pointer to go look', async () => {
  const S = await engine();
  const calicut = tops(S, 'units in calicut', 1)[0];
  assert.ok(calicut, 'the Calicut unit is the first result');
  assert.match(calicut.d, /Kerala/);
  assert.match(calicut.d, /Madhu Nair/);
  assert.match(calicut.d, /9605770498/);
});

test('every row the engine can hand out resolves', () => {
  const rows = JSON.parse(read('search-index.json')).rows;
  assert.ok(Array.isArray(rows) && rows.length > 300, 'the rows layer is in the shipped index');
  const broken = [];
  for (const row of rows) {
    const [pageAndQuery, anchor] = row.u.split('#');
    const page = pageAndQuery.split('?')[0];
    if (!fs.existsSync(path.join(ROOT, page))) { broken.push(`${row.u} (no such page)`); continue; }
    const html = read(page);
    if (anchor && !html.includes(`id="${anchor}"`)) broken.push(`${row.u} (no such anchor)`);
    if (pageAndQuery.includes('?q=') && !/id="u?q"/.test(html)) broken.push(`${row.u} (no filter box to hand the query to)`);
  }
  assert.deepEqual(broken, [], 'unresolvable rows:\n  ' + broken.join('\n  '));
});

test('every unit in the data is findable by its city', () => {
  const unitsHtml = read('units.html');
  const cities = [...unitsHtml.matchAll(/\{c:'([^']+)',s:'[^']+',p:'[^']*'[^}]*?d:\d+[^}]*\}/g)].map((m) => m[1]);
  assert.ok(cities.length >= 70, `the units data still parses (${cities.length} cities found)`);
  const titles = new Set(JSON.parse(read('search-index.json')).rows.map((r) => r.t));
  const missing = cities.filter((c) => !titles.has(`PFA ${c} unit`));
  assert.deepEqual(missing, [], 'units search cannot find: ' + missing.join(', '));
});
