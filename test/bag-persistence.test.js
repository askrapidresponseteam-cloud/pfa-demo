'use strict';

/* The bag was not retaining items. There were four separate causes, and each
   test below fails against the old code.

   Loading note: assets/bag.js is browser code with no module system, so it is
   evaluated here against a fake window, the same way the other page scripts
   are tested. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'assets', 'bag.js'), 'utf8');
const SHOP = fs.readFileSync(path.join(ROOT, 'pfa-shop.html'), 'utf8');
const PRODUCT = fs.readFileSync(path.join(ROOT, 'product.html'), 'utf8');

/* bag.js runs in a vm context, so the objects it returns carry that realm's
   Object.prototype and assert/strict compares prototypes. Normalise first:
   this is about the realm boundary, not about the values. */
const plain = (o) => JSON.parse(JSON.stringify(o));

/* A storage that behaves like the real thing, including the ways it fails. */
function fakeStorage(opts) {
  const o = opts || {};
  const d = Object.create(null);
  return {
    _d: d,
    getItem(k) { if (o.throwOnRead) throw new Error('denied'); return k in d ? d[k] : null; },
    setItem(k, v) { if (o.throwOnWrite) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } d[k] = String(v); },
    removeItem(k) { delete d[k]; }
  };
}

function load(opts) {
  const o = opts || {};
  const handlers = {};
  const win = {
    localStorage: 'local' in o ? o.local : fakeStorage(),
    sessionStorage: 'session' in o ? o.session : fakeStorage(),
    addEventListener(type, fn) { (handlers[type] = handlers[type] || []).push(fn); },
    dispatchEvent() { return true; },
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init && init.detail; }
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(SRC, win, { filename: 'assets/bag.js' });
  return { bag: win.PFABag, win, fire: (type, e) => (handlers[type] || []).forEach((fn) => fn(e)) };
}

/* ---------------------------------------------------------------- cause 1 */

test('the bag is kept in localStorage, so it survives closing the tab', () => {
  const shared = fakeStorage();
  const first = load({ local: shared });
  first.bag.add('4411', 2);

  /* A new tab is a new page with the same localStorage and a *fresh*
     sessionStorage. This is exactly the case that used to come up empty. */
  const second = load({ local: shared, session: fakeStorage() });
  assert.deepEqual(plain(second.bag.read()), { 4411: 2 }, 'the bag did not survive a new tab');
  assert.equal(second.bag.tier(), 'local');
  assert.ok(second.bag.durable(), 'a bag in sessionStorage is not durable');
});

test('neither shop page reaches for sessionStorage for the bag any more', () => {
  [['pfa-shop.html', SHOP], ['product.html', PRODUCT]].forEach(([name, html]) => {
    assert.ok(!/sessionStorage\.(get|set)Item\(\s*BAG_KEY/.test(html), `${name} still stores the bag per tab`);
    assert.match(html, /assets\/bag\.js/, `${name} does not load the shared bag`);
    assert.match(html, /pfa:store:bag/, `${name} must name the shared key`);
  });
});

/* ---------------------------------------------------------------- cause 2 */

test('an empty catalogue never empties the bag', () => {
  const { bag } = load();
  bag.add('4411', 1);
  bag.add('4412', 3);
  /* A failed fetch and a closed store both arrive here as "no ids at all".
     The old line deleted every key and wrote the empty bag straight back. */
  bag.keepOnly([]);
  assert.deepEqual(plain(bag.read()), { 4411: 1, 4412: 3 }, 'an empty catalogue wiped the bag');
  bag.keepOnly(null);
  assert.deepEqual(plain(bag.read()), { 4411: 1, 4412: 3 });
});

test('the shop only prunes against a live catalogue that actually loaded', () => {
  const fn = /function pruneBag\(\)\{[\s\S]*?\n {2}\}/.exec(SHOP);
  assert.ok(fn, 'pruneBag is gone; the bag is being pruned somewhere unguarded');
  assert.match(fn[0], /catalogSource !== 'live'/, 'a stale snapshot can still prune the bag');
  assert.match(fn[0], /catalogState !== 'ready'/, 'a closed or errored store can still prune the bag');
  assert.match(fn[0], /!ids\.length/, 'an empty catalogue can still prune the bag');
  /* And the unguarded original must not have survived anywhere. */
  assert.ok(!/Object\.keys\(cart\)\.forEach/.test(SHOP), 'an unguarded prune is still in the page');
});

test('a real catalogue still drops what the seller stopped stocking', () => {
  const { bag } = load();
  bag.add('4411', 1);
  bag.add('gone', 2);
  bag.keepOnly(['4411', '4499']);
  assert.deepEqual(plain(bag.read()), { 4411: 1 }, 'the delisted line should go');
});

/* ---------------------------------------------------------------- cause 3 */

test('two tabs adding different things do not overwrite each other', () => {
  const shared = fakeStorage();
  const a = load({ local: shared });
  const b = load({ local: shared });

  a.bag.add('4411', 1);
  b.bag.add('4412', 1);      /* b re-reads before writing */

  assert.deepEqual(plain(a.bag.read()), { 4411: 1, 4412: 1 }, 'one tab clobbered the other');
});

test('a change in another tab is announced to this one', () => {
  const shared = fakeStorage();
  const a = load({ local: shared });
  const b = load({ local: shared });
  const seen = [];
  a.bag.subscribe((items, external) => seen.push({ items, external }));

  b.bag.add('4411', 2);
  /* The browser raises this in every *other* tab. */
  a.fire('storage', { key: 'pfa:store:bag' });

  assert.equal(seen.length, 1);
  assert.equal(seen[0].external, true, 'the listener must know this came from elsewhere');
  assert.deepEqual(plain(seen[0].items), { 4411: 2 });
});

test('both pages listen for another tab and repaint', () => {
  assert.match(SHOP, /PFABag\.subscribe\(/, 'the shop ignores a second tab');
  assert.match(PRODUCT, /PFABag\.subscribe\(/, 'the product page ignores a second tab');
});

/* ---------------------------------------------------------------- cause 4 */

test('a browser that refuses storage still has a working bag', () => {
  /* Safari in private mode exposes localStorage and throws on write. The old
     code caught that and moved on, so every add looked accepted and nothing
     was ever kept. */
  const { bag } = load({ local: fakeStorage({ throwOnWrite: true }), session: fakeStorage({ throwOnWrite: true }) });
  bag.add('4411', 2);
  assert.deepEqual(plain(bag.read()), { 4411: 2 }, 'the bag does not work at all without storage');
  assert.equal(bag.tier(), 'memory');
  assert.ok(!bag.durable(), 'a memory bag must not claim to be durable');
});

test('storage that throws on access does not take the page down', () => {
  const { bag } = load({ local: null, session: null });
  assert.doesNotThrow(() => bag.add('4411', 1));
  assert.deepEqual(plain(bag.read()), { 4411: 1 });
});

/* ------------------------------------------------------------- the shape */

test('a line is capped at 25, the same cap the order route enforces', () => {
  const { bag } = load();
  bag.add('4411', 900);
  assert.deepEqual(plain(bag.read()), { 4411: 25 });
  bag.setQty('4411', 40);
  assert.deepEqual(plain(bag.read()), { 4411: 25 });
});

test('taking the last one off removes the line rather than leaving a zero', () => {
  const { bag } = load();
  bag.add('4411', 1);
  bag.add('4411', -1);
  assert.deepEqual(plain(bag.read()), {}, 'a zero line would be sent to checkout');
});

test('nothing malformed survives a round trip', () => {
  const { bag } = load();
  bag.write({ 4411: 2, bad: 'x', '': 9, 'a b': 1, 4412: -3, 4413: 1.7, 4414: NaN });
  assert.deepEqual(plain(bag.read()), { 4411: 2, 4413: 1 }, 'junk reached the order payload');
});

test('a corrupt or hostile stored value reads as an empty bag, not a crash', () => {
  ['not json', '[1,2,3]', 'null', '{"v":99,"items":{"4411":1}}', '"x"'].forEach((raw) => {
    const store = fakeStorage();
    store.setItem('pfa:store:bag', raw);
    const { bag } = load({ local: store });
    assert.doesNotThrow(() => bag.read(), `${raw} threw`);
    assert.deepEqual(plain(bag.read()), {}, `${raw} was trusted`);
  });
});

test('a bag written by the previous version is carried over, not dropped', () => {
  /* v1 was the bare map under the same key. Someone mid-shop when this ships
     should not lose what they had. */
  const store = fakeStorage();
  store.setItem('pfa:store:bag', JSON.stringify({ 4411: 2, 4412: 1 }));
  const { bag } = load({ local: store });
  assert.deepEqual(plain(bag.read()), { 4411: 2, 4412: 1 }, 'the old bag shape was thrown away');
  bag.add('4413', 1);
  assert.equal(JSON.parse(store.getItem('pfa:store:bag')).v, 2, 'it should be rewritten in the new shape');
});

test('a bag abandoned a month ago is not resurrected', () => {
  const store = fakeStorage();
  const old = Date.now() - 31 * 24 * 60 * 60 * 1000;
  store.setItem('pfa:store:bag', JSON.stringify({ v: 2, at: old, items: { 4411: 2 } }));
  const { bag } = load({ local: store });
  assert.deepEqual(plain(bag.read()), {}, 'a month-old bag came back');

  const fresh = fakeStorage();
  fresh.setItem('pfa:store:bag', JSON.stringify({ v: 2, at: Date.now() - 1000, items: { 4411: 2 } }));
  assert.deepEqual(plain(load({ local: fresh }).bag.read()), { 4411: 2 }, 'a bag from a minute ago must survive');
});

test('a confirmed order clears the bag through the shared store', () => {
  const { bag } = load();
  bag.add('4411', 2);
  bag.clear();
  assert.deepEqual(plain(bag.read()), {});
  /* Both post-order clears in the shop go through it, so the cleared bag is
     actually persisted rather than only emptied in memory. */
  assert.equal((SHOP.match(/PFABag\.clear\(\)/g) || []).length, 2, 'a post-order clear bypasses the store');
});
