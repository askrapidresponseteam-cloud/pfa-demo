'use strict';
/* Neither search may come back empty for a real query. Typos are corrected,
   run-together words split, and when nothing matches at all the closest
   pages or products are shown and labelled as approximate. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const load = require('./_search-engine.js');

const ROOT = path.join(__dirname, '..');
const S = load(path.join(ROOT, 'pfa-search.js'));
const first = (q) => S.search(q, { limit: 3 }).rows.map((r) => r.t)[0];

test('site search: typos, run-together words and short forms still land on the right page', () => {
  assert.equal(first('reportcruelty'), 'Report cruelty');
  assert.equal(first('hosptial'), 'Animal hospitals');
  assert.equal(first('colony caregivr card'), 'Apply for a colony caregiver card');
  assert.equal(first('donte'), 'Donate');
  assert.equal(first('shp'), 'Shop');
  assert.equal(first('cruality report'), 'Report cruelty');
});

test('site search: nonsense still returns the closest pages, marked as such', () => {
  const res = S.search('xqzvwt plork', { limit: 3 });
  assert.ok(res.rows.length > 0, 'never empty');
  assert.equal(res.via, 'closest');
  const ok = S.search('report cruelty', { limit: 3 });
  assert.equal(ok.via, null, 'an exact query is not marked approximate');
});

/* The shop's search lives inside pfa-shop.html's script; lift the search
   section and visible() out and run them against a small catalogue. */
function shop() {
  const html = fs.readFileSync(path.join(ROOT, 'pfa-shop.html'), 'utf8');
  const script = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)].filter((m) => !/src=/.test(m[1])).map((m) => m[2]).find((c) => /function visible\(\)/.test(c));
  const body = script.slice(script.indexOf('  /* ---------------- search ----------------'), script.indexOf('  function control('));
  const ctx = { P: [
    { n: 'Boehringer Ingelheim NexGard 136mg Chewable Tablet For Dogs | Flea & Tick Control', s: 'Ticks & Fleas', c: 'health', pet: 'dog', p: 900, handle: 'nexgard-136' },
    { n: 'Royal Canin Maxi Adult Dry Dog Food 4kg', s: 'Dry food', c: 'food', pet: 'dog', p: 2500, handle: 'royal-canin-maxi' },
    { n: 'Whiskas Ocean Fish Adult Cat Food 1.2kg', s: 'Dry food', c: 'food', pet: 'cat', p: 400, handle: 'whiskas-ocean' },
    { n: 'Drools Puppy Chicken & Egg 3kg', s: 'Dry food', c: 'food', pet: 'dog', p: 800, handle: 'drools-puppy' }
  ], pet: 'all', cat: 'all', q: '', sort: 'default', SORTS: { default: null },
    /* visible() also reads the shelf and brand state, the same way it reads pet and cat */
    shelf: '', SHELVES: [], onShelf: (z, x) => (z.f ? z.f(x) : z.m.test(x.n + ' ' + x.s)),
    brand: '',
    console, Math, Object, String, Array, Number, RegExp };
  vm.createContext(ctx);
  vm.runInContext(body + '\nthis.visible = visible; this.note = function () { return searchNote; };', ctx);
  return { find: (q) => { ctx.q = q; return ctx.visible().map((x) => x.n); }, note: () => ctx.note() };
}

test('store search: brand typos, misspelt words and multi-word queries rank the right product first', () => {
  const s = shop();
  assert.match(s.find('nexguard')[0], /NexGard/);
  assert.match(s.find('royal cainin')[0], /Royal Canin/);
  assert.match(s.find('dog fod')[0], /Dog Food/);
  assert.match(s.find('chewble tablet')[0], /Chewable Tablet/);
  assert.match(s.find('puppy food chicken')[0], /Drools Puppy/);
  assert.equal(s.note(), '', 'a resolvable query is not marked approximate');
});

test('store search: nothing matching still shows the closest products, and says so', () => {
  const s = shop();
  const rows = s.find('zzqx plonk');
  assert.ok(rows.length > 0, 'never empty');
  assert.equal(s.note(), 'closest');
  const html = fs.readFileSync(path.join(ROOT, 'pfa-shop.html'), 'utf8');
  assert.match(html, /No exact match for/, 'the count line tells the shopper');
});
