const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const store = fs.readFileSync(path.join(root, 'store.html'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'assets', 'site.css'), 'utf8');

test('store keeps the approved proposition and excludes rejected copy', () => {
  assert.match(store, /Buy what you already need\./);
  assert.match(store, /Good happens automatically\./);
  [
    'Every product lists exactly what it funds',
    'Shop care essentials through PFA',
    'Browse Paws & Tails products inside the PFA store',
    'PFA-curated catalogue',
    'Seller collects payment',
    'Delivery details entered once'
  ].forEach(copy => assert.equal(store.includes(copy), false, copy));
});

test('store uses live products and accessible commerce controls', () => {
  assert.match(store, /API_URL\s*=\s*'\/api\/paws-catalog'/);
  assert.match(store, /ORDER_API_URL\s*=\s*'\/api\/pfa-orders'/);
  assert.match(store, /id="productCategory"/);
  assert.match(store, /id="productAnimal"/);
  assert.ok((store.match(/aria-label/g) || []).length > 0, 'expected accessible aria-label controls');
});

test('store opens directly without a cinematic startup layer', () => {
  assert.equal(store.includes('assets/three.min.js'), false);
  assert.equal(store.includes('assets/pfa-store-cinematic.js'), false);
  assert.equal(store.includes('pfaStoreFilm'), false);
  assert.equal(fs.existsSync(path.join(root, 'assets', 'pfa-store-cinematic.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'assets', 'three.min.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'assets', 'three.module.min.js')), false);
  assert.match(styles, /prefers-reduced-motion/);
});

test('store typography matches the PFA visual system', () => {
  // The site was moved onto Clash Display + Archia. Body copy draws Archia and
  // display weights draw Clash through the "PFA Sans" composite family, so the
  // assertion is that the system is wired, not that a particular fallback
  // stack is still named.
  assert.match(styles, /@font-face/);
  assert.match(styles, /font-family:"Archia"/);
  assert.match(styles, /font-family:"Clash Display"/);
  assert.match(styles, /font-family:"PFA Sans"/);
  assert.match(styles, /body\{[^}]*font-family:var\(--font-ui\)/);
  // Archia has a single weight, so nothing may be synthesised into a fake bold.
  assert.match(styles, /font-synthesis-weight:none/);
});

test('store checkout is switched on and can reach the seller', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const store = fs.readFileSync(path.join(__dirname, '..', 'store.html'), 'utf8');
  const config = fs.readFileSync(path.join(__dirname, '..', 'assets', 'commerce-config.js'), 'utf8');
  assert.match(store, /<script src="assets\/commerce-config\.js"><\/script>/);
  assert.match(config, /liveOrders:\s*true/);
});
