'use strict';
/* Brands and offers on the shop, both read straight from the seller's
   Shopify data and neither invented here.

   Brands are the seller's own brand collections: a logo where they set one,
   the name otherwise, and a product belongs to a brand when Shopify lists it
   under that collection (title matching is the fallback). Offers are
   variants whose compare-at price is above their price, and the shop shows
   nothing at all when there are none. These tests run the real code on both
   sides: lib/store-brands.js and listView() on the server, and flatten() and
   the markup in pfa-shop.html. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const brands = require('../lib/store-brands.js');
const catalog = require('../lib/routes/paws-catalog.js');

const html = fs.readFileSync(path.join(ROOT, 'pfa-shop.html'), 'utf8');
const script = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)]
  .map((m) => m[1]).reduce((a, b) => (a.length > b.length ? a : b));

/* ---------------- server: which collections are brands ---------------- */

const product = (id, title) => ({ id: String(id), title });
const collection = (handle, title, image) => ({ id: `c-${handle}`, handle, title, image: image || null });

const PRODUCTS = [
  product(1, 'Farmina N&D Quinoa Urinary Cat 1.5kg'), product(2, 'Farmina Vet Life Renal Feline 2kg'),
  product(3, 'Farmina Growth Puppy Mini 2.5kg'), product(4, 'FARMINA Team Breeder 20kg'),
  product(5, 'Royal Canin Maxi Adult 10kg'), product(6, 'Royal Canin Kitten 2kg'), product(7, 'Royal Canin Mini Puppy 4kg'),
  product(8, 'NexGard Spectra M 3 tabs'), product(9, 'Me-O Persian 7kg'), product(10, 'Me O Tuna 1.2kg'), product(11, 'ME-O Kitten 400g'),
  product(12, 'Dog Shampoo by Someone'), product(13, 'Paws & Tails Gift Card')
];
const COLLECTIONS = [
  collection('farmina', 'Farmina', { src: 'https://cdn.shopify.com/s/files/farmina.png', alt: '' }),
  collection('farmina-growth', 'Farmina Growth'),
  collection('royal-canin', 'Royal Canin'),
  collection('boehringer-ingelheim', 'Boehringer Ingelheim'),
  collection('me-o', 'Me-O'),
  collection('dog-shampoo', 'Dog Shampoo'),
  collection('pet-food', 'Pet Food'),
  collection('paws-tails', 'Paws & Tails\u2122'),
  collection('orange-pet-nutrition', 'Orange Pet Nutrition'),
  collection('orange-pet-nutrition-1', 'Orange Pet Nutrition', { src: 'https://cdn.shopify.com/s/files/opn.png' })
];

test('a collection is a brand when enough products are titled with it, and a line inside a brand is not a brand', () => {
  const found = brands.detectBrandCollections(PRODUCTS, COLLECTIONS, { pinned: null });
  const handles = found.map((b) => b.handle);
  assert.deepEqual(handles, ['farmina', 'me-o', 'royal-canin'], 'most products first, ties by name');
  assert.ok(!handles.includes('farmina-growth'), 'Farmina Growth is a line within Farmina');
  assert.ok(!handles.includes('dog-shampoo'), 'one product titled "Dog Shampoo ..." is a category, not a brand');
  assert.ok(!handles.includes('boehringer-ingelheim'), 'no product title begins with it: title matching alone cannot claim it');
  assert.ok(!handles.includes('paws-tails'), 'the store is never its own brand');
});

test('"Me-O", "Me O" and "ME-O" are one brand; the trademark sign is ignored', () => {
  assert.equal(brands.normalize('Me-O\u2122'), 'me o');
  assert.equal(brands.normalize('ME  O'), 'me o');
  assert.ok(brands.beginsWith('farmina n&d quinoa', 'farmina'));
  assert.ok(!brands.beginsWith('farminas choice', 'farmina'), 'whole words only');
});

test('a pinned list is honoured exactly and in order, an unknown handle is skipped, and "off" turns brands off', () => {
  const pinned = brands.detectBrandCollections(PRODUCTS, COLLECTIONS, { pinned: ['me-o', 'no-such-collection', 'boehringer-ingelheim', 'farmina'] });
  assert.deepEqual(pinned.map((b) => b.handle), ['me-o', 'boehringer-ingelheim', 'farmina']);
  assert.deepEqual(brands.detectBrandCollections(PRODUCTS, COLLECTIONS, { pinned: [] }), []);
});

test('the env var drives pinning: a list pins, "off" disables, unset detects', () => {
  const before = process.env.PAWS_BRAND_COLLECTIONS;
  try {
    process.env.PAWS_BRAND_COLLECTIONS = 'royal-canin, FARMINA';
    assert.deepEqual(brands.detectBrandCollections(PRODUCTS, COLLECTIONS).map((b) => b.handle), ['royal-canin', 'farmina']);
    process.env.PAWS_BRAND_COLLECTIONS = 'off';
    assert.deepEqual(brands.detectBrandCollections(PRODUCTS, COLLECTIONS), []);
    delete process.env.PAWS_BRAND_COLLECTIONS;
    assert.equal(brands.detectBrandCollections(PRODUCTS, COLLECTIONS)[0].handle, 'farmina');
  } finally {
    if (before === undefined) delete process.env.PAWS_BRAND_COLLECTIONS; else process.env.PAWS_BRAND_COLLECTIONS = before;
  }
});

test('the same brand as two collections is one entry, and the one with the logo wins', () => {
  const twice = PRODUCTS.concat([product(20, 'Orange Pet Nutrition Dog 3kg'), product(21, 'Orange Pet Nutrition Cat 1kg'), product(22, 'Orange Pet Nutrition Puppy 1kg')]);
  const found = brands.detectBrandCollections(twice, COLLECTIONS, { pinned: null });
  const orange = found.filter((b) => b.key === 'orange pet nutrition');
  assert.equal(orange.length, 1);
  assert.equal(orange[0].handle, 'orange-pet-nutrition-1', 'the collection that carries the logo');
});

/* ---------------- server: who belongs to which brand ---------------- */

test('a product is in a brand when Shopify lists it there, even if its title never says so', async () => {
  const calls = [];
  const fetchJson = async (url) => {
    calls.push(url);
    if (/collections\/boehringer-ingelheim\/products\.json/.test(url)) return { products: [{ id: 8 }] };
    if (/collections\/farmina\/products\.json/.test(url)) return { products: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 9 }] };
    return { products: [] };
  };
  const env = { shopDomain: 'x.myshopify.com', adminToken: '', warn: () => {} };
  const out = await brands.assignBrands(PRODUCTS, COLLECTIONS, { fetchJson, env, options: { pinned: ['farmina', 'boehringer-ingelheim', 'me-o'] } });
  const brandOf = Object.fromEntries(out.products.map((p) => [p.id, p.brand]));
  assert.equal(brandOf['8'], 'boehringer-ingelheim', 'NexGard is Boehringer because Shopify says so');
  assert.equal(brandOf['9'], 'farmina', 'the first brand in display order keeps a product listed under two');
  assert.equal(brandOf['10'], 'me-o', 'title matching still fills in where the roster is empty');
  assert.equal(brandOf['12'], '', 'a product in no brand has none');
  assert.deepEqual(out.brands.map((b) => [b.handle, b.productCount]), [['farmina', 5], ['boehringer-ingelheim', 1], ['me-o', 2]]);
  assert.deepEqual(out.brands[0].image, { src: 'https://cdn.shopify.com/s/files/farmina.png', alt: 'Farmina' }, 'a missing alt is the title');
  assert.equal(out.brands[2].image, null, 'no logo is sent as none, never as a broken URL');
  assert.ok(calls.every((u) => u.startsWith('https://x.myshopify.com/collections/')), 'public store: the collection product lists');
});

test('a roster fetch that fails leaves that brand on title matches and never fails the catalogue', async () => {
  const fetchJson = async (url) => { if (/farmina/.test(url)) throw new Error('HTTP 429'); return { products: [] }; };
  const warnings = [];
  const out = await brands.assignBrands(PRODUCTS, COLLECTIONS, { fetchJson, env: { shopDomain: 'x', adminToken: '', warn: (m) => warnings.push(m) }, options: { pinned: ['farmina', 'royal-canin'] } });
  assert.equal(out.brands[0].productCount, 4, 'the four Farmina titles');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /farmina/);
});

test('with an Admin token the roster is read through the Admin API, by collection id, paged by cursor', async () => {
  const calls = [];
  const fetchJson = async (url) => {
    calls.push(url);
    const payload = { products: url.includes('page_info=') ? [{ id: 2 }] : [{ id: 1 }] };
    Object.defineProperty(payload, '_link', { value: url.includes('page_info=') ? '' : '<https://x/admin/api/v/products.json?page_info=abc>; rel="next"', enumerable: false });
    return payload;
  };
  const env = { shopDomain: 'x.myshopify.com', adminToken: 'shpat_x', adminApiVersion: '2026-07', nextPageInfo: catalog._private.nextPageInfo, warn: () => {} };
  const out = await brands.assignBrands(PRODUCTS, COLLECTIONS, { fetchJson, env, options: { pinned: ['farmina'] } });
  assert.match(calls[0], /\/admin\/api\/2026-07\/products\.json\?limit=250&fields=id&collection_id=c-farmina$/);
  assert.match(calls[1], /page_info=abc/);
  assert.equal(calls.length, 2);
  assert.equal(out.brands[0].productCount, 4);
});

test('PAWS_BRAND_ROSTER=off skips the roster fetch entirely', async () => {
  const before = process.env.PAWS_BRAND_ROSTER;
  try {
    process.env.PAWS_BRAND_ROSTER = 'off';
    let fetched = 0;
    const out = await brands.assignBrands(PRODUCTS, COLLECTIONS, { fetchJson: async () => { fetched += 1; return { products: [] }; }, env: { shopDomain: 'x' }, options: { pinned: ['farmina'] } });
    assert.equal(fetched, 0);
    assert.equal(out.brands[0].productCount, 4);
  } finally {
    if (before === undefined) delete process.env.PAWS_BRAND_ROSTER; else process.env.PAWS_BRAND_ROSTER = before;
  }
});

/* ---------------- server: what the grid is sent ---------------- */

const variant = (id, price, compareAtPrice) => ({ id: String(id), title: 'Default', sku: '', available: true, stock: null, price, compareAtPrice: compareAtPrice === undefined ? 0 : compareAtPrice, image: null, options: [] });
const full = (id, brand, variants) => ({
  id: String(id), handle: `p-${id}`, title: `P ${id}`, description: '', descriptionBlocks: [], vendor: 'Paws & Tails',
  productType: 'x', tags: [], category: 'medicine', categoryLabel: 'The Pharmacy', animal: 'Dog', prescriptionRequired: false,
  vegetarianFood: false, available: true, minPrice: 1, maxPrice: 1, images: [], variants, updatedAt: null, publishedAt: null, sourceUrl: '', brand
});

test('wasPrice is the compare-at price only when it is a markdown the shop can stand behind', () => {
  assert.equal(catalog.wasPrice(variant(1, 100, 120)), 120, 'a plain markdown');
  assert.equal(catalog.wasPrice(variant(1, 100, 100)), undefined, 'equal is not a markdown');
  assert.equal(catalog.wasPrice(variant(1, 100, 80)), undefined, 'lower is not a markdown');
  assert.equal(catalog.wasPrice(variant(1, 100, 0)), undefined, 'Shopify sends 0 or null for unset');
  assert.equal(catalog.wasPrice(variant(1, 100, 'abc')), undefined);
  assert.equal(catalog.wasPrice(variant(1, 0, 50)), undefined, 'a free item cannot be marked down');
  assert.equal(catalog.wasPrice(variant(1, 996, 1000)), undefined, 'under five percent is rounding');
  assert.equal(catalog.wasPrice(variant(1, 900, 3600)), undefined, 'the three-pack price on the single tablet is not 75% off');
  assert.equal(catalog.wasPrice(variant(1, 725, 2600)), undefined, 'over half off is not a sale on this shelf');
  assert.equal(catalog.wasPrice(variant(1, 500, 1000)), undefined, 'exactly double is a pack of two, not half price');
  assert.equal(catalog.wasPrice(variant(1, 500, 1520)), undefined, 'within three percent of a whole multiple is still a pack');
  assert.equal(catalog.wasPrice(variant(1, 2414, 2600), [2414, 2600, 6299]), undefined, 'the 5 kg price copied onto the 1.5 kg is not a markdown');
  assert.equal(catalog.wasPrice(variant(1, 2414, 2800), [2414, 6299]), 2800, 'a compare-at that matches no other size stands');
  const nexgard = [variant(1, 725, 2600), variant(2, 1430, 2600), variant(3, 2175, 2600)];
  nexgard.forEach((v) => assert.equal(catalog.wasPrice(v, nexgard), undefined, 'one compare-at pasted on every size is not a markdown on any of them'));
  const honest = [variant(1, 725, 900), variant(2, 1430, 1700)];
  assert.equal(catalog.wasPrice(honest[0], honest), 900, 'each size with its own earlier price stands');
  assert.equal(catalog.wasPrice(honest[1], honest), 1700);
  assert.equal(catalog.wasPrice(variant(1, 725, 900), [variant(1, 725, 900), variant(4, 725, 900)]), 900, 'two sizes at the same price and the same compare-at do not cancel each other');
});

/* The page applies the same rule again. Both sides over the same cases. */
test('the page and the server agree on every markdown case', () => {
  const { offPercent } = shopFlatten();
  const cases = [[100, 120], [100, 100], [100, 80], [100, 0], [996, 1000], [900, 3600], [725, 2600], [500, 1000], [500, 1520], [1530, 1800], [3200, 4000], [1650, 1830], [500, 5000], [2414, 2600, [2414, 2600, 6299]], [2414, 2800, [2414, 6299]]];
  cases.push([1430, 2600, [{ price: 725, compareAtPrice: 2600 }, { price: 2175, compareAtPrice: 2600 }]]);
  cases.push([1430, 1700, [{ price: 725, compareAtPrice: 900 }]]);
  for (const [price, was, siblings] of cases) {
    const server = catalog.wasPrice(variant(1, price, was), siblings || []);
    const page = offPercent(was, price, (siblings || []).map((o) => (typeof o === 'object' ? { p: o.price, was: o.compareAtPrice } : o)));
    assert.equal(!!server, page > 0, `server and page disagree on was ${was} / price ${price}`);
    if (server) assert.equal(page, Math.round(((was - price) / was) * 100));
  }
  assert.deepEqual(catalog.MARKDOWN_RULE, { MIN_OFF: 5, MAX_OFF: 50, PACK_TOLERANCE: 0.03 });
  assert.match(script, /var MIN_OFF = 5, MAX_OFF = 50, PACK_TOLERANCE = 0\.03;/, 'the page carries the same three numbers');
});

test('the list view carries brand and was, prunes brands with nothing listed, and sends a closed store no brands', () => {
  const data = {
    brands: [{ handle: 'a', title: 'A', image: null, productCount: 9 }, { handle: 'b', title: 'B', image: null, productCount: 9 }],
    products: [full(1, 'a', [variant(11, 100, 150), variant(12, 100, 100)]), full(2, '', [variant(21, 200)])]
  };
  const list = catalog.listView(data);
  assert.equal(list.products[0].brand, 'a');
  assert.equal(list.products[1].brand, '');
  assert.equal(list.products[0].variants[0].was, 150);
  assert.equal('was' in JSON.parse(JSON.stringify(list.products[0].variants[1])), false, 'no markdown, no bytes');
  assert.equal('compareAtPrice' in list.products[0].variants[0], false, 'the raw field is not sent');
  assert.deepEqual(list.brands.map((b) => [b.handle, b.productCount]), [['a', 1]], 'brand b has nothing listed and is not sent; counts are of listed products');

  const closed = catalog.applyPolicy({ ...data, stats: {}, collections: [] }, { open: false, state: 'closed', label: 'Closed', changedAt: '' });
  assert.deepEqual(closed.brands, []);
  assert.deepEqual(catalog.listView(closed).brands, []);
});

test('a catalogue without brands (an older snapshot) still lists cleanly', () => {
  const list = catalog.listView({ products: [full(1, undefined, [variant(11, 100)])] });
  assert.equal(list.products[0].brand, '');
  assert.deepEqual(list.brands, []);
});

/* ---------------- the page: flatten() and the markup ---------------- */

/* flatten() and the helpers before it, exactly as test/store-count lifts them. */
function shopFlatten() {
  const start = script.indexOf('function flatten(');
  let depth = 0; let end = -1;
  for (let i = script.indexOf('{', start); i < script.length; i += 1) {
    if (script[i] === '{') depth += 1;
    else if (script[i] === '}') { depth -= 1; if (depth === 0) { end = i + 1; break; } }
  }
  const maps = script.slice(script.indexOf('var CAT_MAP'), start);
  return new Function(`${maps}\n${script.slice(start, end)}\nreturn { flatten: flatten, offPercent: offPercent, MAX_OFF: MAX_OFF };`)();
}
const lv = (id, price, was, title) => ({ id: String(id), title: title || 'Default Title', available: true, price, was, image: null });
const lp = (id, variants, brand) => ({ id: String(id), handle: `p-${id}`, title: `P ${id}`, category: 'medicine', animal: 'Dog', productType: 'x', prescriptionRequired: false, available: true, brand, images: [], variants });

test('the shop counts a markdown as a whole percent, and refuses rounding slips, pack prices and typos', () => {
  const { offPercent, MAX_OFF } = shopFlatten();
  assert.equal(offPercent(1800, 1530), 15);
  assert.equal(offPercent(1830, 1650), 10);
  assert.equal(offPercent(1000, 1000), 0, 'equal');
  assert.equal(offPercent(1000, 1200), 0, 'was below now');
  assert.equal(offPercent(1000, 996), 0, 'under five percent is rounding, not an offer');
  assert.equal(offPercent(3600, 900), 0, 'a pack of three on a single tablet is not 75% off');
  assert.equal(offPercent(18000, 1800), 0, `ninety percent off is a typo in Shopify, not a sale (cap is ${MAX_OFF})`);
  assert.equal(offPercent(2600, 2414, [2414, 2600, 6299]), 0, 'another size\u2019s price is not an earlier price');
  assert.equal(offPercent(2600, 1430, [{ p: 725, was: 2600 }, { p: 2175, was: 2600 }]), 0, 'the same figure on every size is a product number, not a markdown');
  assert.equal(offPercent(0, 100), 0);
  assert.equal(offPercent('x', 100), 0);
});

test('flatten carries brand, the struck price of the leading size, the best saving on the product, and which size has it', () => {
  const { flatten } = shopFlatten();
  const P = flatten({ products: [
    lp(1, [lv(40000000001, 1530, 1800)], 'drools'),
    lp(2, [lv(40000000002, 900, undefined, '2 kg'), lv(40000000003, 3200, 4000, '10 kg')], 'alpha'),
    lp(3, [lv(40000000004, 500, 500)], ''),
    lp(4, [lv(40000000005, 500, 5000)], '')
  ] });
  const by = Object.fromEntries(P.map((x) => [x.id, x]));
  assert.equal(by['40000000001'].brand, 'drools');
  assert.equal(by['40000000001'].was, 1800);
  assert.equal(by['40000000001'].off, 15);
  const sizes = by['40000000002'];
  assert.equal(sizes.was, 0, 'the card leads with the 2 kg, which is not marked down, so no struck price on the card');
  assert.equal(sizes.off, 20, 'but the tag and the rail lead with the 10 kg');
  assert.equal(sizes.best.t, '10 kg');
  assert.equal(sizes.v[1].was, 4000);
  assert.equal(by['40000000004'].off, 0, 'equal compare-at');
  assert.equal(by['40000000005'].off, 0, 'a 90% "markdown" is not shown');
  assert.equal(by['40000000005'].was, 0);
});

test('the page has the rail, the On offer shelf and the Biggest saving order, and hides them by default', () => {
  assert.match(html, /<section class="offers" id="offers" aria-label="Best offers" hidden>/);
  assert.match(html, /<option value="saving">Biggest saving<\/option>/);
  assert.match(script, /k:'offers', t:'On offer', f:function\(x\)\{ return x\.off > 0; \}, min:1/);
  assert.match(script, /paintOffers\(\);/, 'repaints with the grid');
});

test('the rail is parked behind one flag, machinery intact, until the presentation is planned', () => {
  assert.match(script, /var OFFERS_RAIL = false;/, 'off is one word, on is one word');
  assert.match(script, /if \(!OFFERS_RAIL\)\{ box\.hidden = true; rail\.innerHTML = ''; offerKey = null; return; \}/,
    'parked means hidden and empty, decided in the painter, nowhere else');
  assert.match(html, /<section class="offers" id="offers" aria-label="Best offers" hidden>/, 'the markup stays, ready');
  assert.match(script, /function offerHTML\(/, 'and so does the tile painter');
});

test('the rail never shows what the seller has not put there', () => {
  assert.match(script, /if \(!shown\.length\)\{ box\.hidden = true; rail\.innerHTML = ''; return; \}/, 'no offers, no section');
  assert.match(script, /if \(brand && !BRANDS\.some\(function\(b\)\{ return b\.handle === brand; \}\)\) brand = '';/, 'an unknown ?brand= is let go');
  assert.doesNotMatch(script, /Seller.s pick|per kilo|Bigger pack/i, 'no invented offer kinds survive from the mockup');
  assert.match(script, /offer__kind">Save</, 'the tile reads "Save 20%", not "Marked down 20%"');
  assert.doesNotMatch(script, /Marked down|marked down by/, 'the shop never says "marked down"');
});

test('Prescription outranks a markdown for the one tag a card carries', () => {
  assert.match(script, /var tag = x\.tag \|\| \(x\.off \? '\\u2212' \+ x\.off \+ '%' : ''\);/);
});

test('the snapshot script writes brands and markdowns along with the rest, because it uses the same list view', () => {
  const build = fs.readFileSync(path.join(ROOT, 'scripts', 'build-catalog.js'), 'utf8');
  assert.match(build, /catalog\.listView\(catalog\.applyPolicy\(full, store\)\)/);
});

test('the env names are documented, and the brand roster word is not the one the repo forbids', () => {
  const env = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
  assert.match(env, /PAWS_BRAND_COLLECTIONS/);
  assert.match(env, /PAWS_BRAND_ROSTER/);
});

test('the logo fetcher reads sources.txt, keeps hand-placed files, and never fails the run', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'fetch-brand-logos.js'), 'utf8');
  assert.match(src, /process\.exit\(0\)/, 'a missing logo is a name on the band, not a broken build');
  assert.match(src, /if \(have && !FORCE\)/, 'a file already in the folder is kept');
  assert.match(src, /not an image/, 'an HTML error page is never saved as a logo');
  const sources = fs.readFileSync(path.join(ROOT, 'img', 'brands', 'sources.txt'), 'utf8');
  const rows = sources.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  assert.ok(rows.length >= 30);
  rows.forEach((r) => assert.match(r, /^[a-z0-9-]+ https:\/\/cdn\.shopify\.com\//, 'every line is a handle and a URL on the seller\u2019s CDN'));
  assert.match(JSON.parse(JSON.stringify(require('../package.json'))).scripts['fetch:logos'], /fetch-brand-logos/);
});

test('one price for every delivery method is a line, not a choice', () => {
  assert.match(script, /function sameRate\(\)/);
  assert.match(script, /if \(sameRate\(\)\) ship\.code = fastest\(\)\.code;/, 'the fastest is taken for the shopper');
  assert.match(script, /if \(same\)\{[\s\S]*?<p class="ship__h">Delivery<\/p>/, 'and shown as one line');
  assert.match(html, /\.ship__one\{/);
});

/* The band of seller logos under the hero was removed on 30 Aug 2026 at
   PFA's request. The brand data stays on the catalogue (search matches a
   brand name); nothing on the page draws it. */
test('the shop has no brand band: no markup, no styles, no painter, no logo manifest', () => {
  assert.doesNotMatch(html, /id="brands"|brands__track|class="brand"|\.brands\{|@keyframes pfa-brands|has-brands/, 'nothing of the band in the page');
  assert.doesNotMatch(html, /assets\/brand-logos\.js/, 'the logo manifest is not loaded');
  assert.doesNotMatch(script, /paintBrands|settleBrands|trimLogo|brandHTML|brandLogo|data-brand|PFA_BRAND_LOGOS/, 'no band code survives');
  assert.match(script, /x\.bt = brandTitle\(x\.brand\)/, 'brand names still feed search');
});

/* A title the seller saved already mangled ("Leash â€“ Durable") is repaired
   once, on the server, before any page sees it. */
test('mojibake in the seller\u2019s titles and descriptions is repaired, and clean text is untouched', () => {
  const { repairText } = require('../lib/routes/paws-catalog.js');
  assert.equal(repairText('Pet Retractable Leash \u00e2\u20ac\u201c Durable'), 'Pet Retractable Leash \u2013 Durable');
  assert.equal(repairText('Paws & Tails\u00e2\u201e\u00a2 Wipes'), 'Paws & Tails\u2122 Wipes');
  assert.equal(repairText('Seller\u00e2\u20ac\u2122s choice'), 'Seller\u2019s choice');
  assert.equal(repairText('Caf\u00c3\u00a9'), 'Caf\u00e9');
  assert.equal(repairText('Paws & Tails\u2122 Dog \u2013 Cats'), 'Paws & Tails\u2122 Dog \u2013 Cats', 'already right: untouched');
  assert.equal(repairText('\u0928\u092e\u0938\u094d\u0924\u0947 dog food'), '\u0928\u092e\u0938\u094d\u0924\u0947 dog food', 'Devanagari is not a misread');
  assert.equal(repairText('Half \u00c3 broken'), 'Half \u00c3 broken', 'a repair that does not decode is abandoned');
  assert.equal(repairText(null), '');
  const mangled = { id: 1, handle: 'x', title: 'Leash \u00e2\u20ac\u201c Durable', body_html: '<p>Strong \u00e2\u20ac\u201d safe</p>', variants: [{ id: 2, title: '32 MM \u00e2\u20ac\u201c Red', price: '270.00', available: true }], images: [] };
  const norm = catalog._private.normalizeProduct(mangled);
  assert.equal(norm.title, 'Leash \u2013 Durable');
  assert.match(norm.description, /Strong \u2014 safe/);
  assert.equal(norm.variants[0].title, '32 MM \u2013 Red');
});

/* ---- the pet and category chips ---- */

test('changing the pet or the category repaints the sidebar, not only the grid', () => {
  /* The shelf counts and the brand list come from filterPool(), which is
     narrowed by the pet and the category. The chip handler repainted the grid
     alone, so the counts beside every shelf stayed on the previous pet: press
     Dogs while Ticks and fleas is open and it still read 73. Nothing in the
     sidebar moved, so the chips read as dead - reported as "clicking ALL is
     not working" (31 Aug 2026), when All was in fact already the pressed one
     and the frozen numbers were the whole of the complaint. */
  const shop = fs.readFileSync(`${__dirname}/../pfa-shop.html`, 'utf8');
  const branch = shop.slice(shop.indexOf("t.hasAttribute('data-pet') || t.hasAttribute('data-cat')"));
  const body = branch.slice(0, branch.indexOf('\n  });'));
  assert.match(body, /paintAll\(\);/, 'the pet and category chips repaint everything');
  assert.ok(!/\bpaintGrid\(\);/.test(body), 'and not the grid on its own');
  /* filterPool is what makes that necessary; if the counts ever stop
     depending on the chips this test is free to go. */
  assert.match(shop, /function filterPool[\s\S]{0,220}pet !== 'all'[\s\S]{0,120}cat !== 'all'/,
    'the pool the counts are drawn from is narrowed by both chips');
});

test('All and Everything clear the shelf and the brand; Dogs, Cats and the categories keep them', () => {
  /* Reported broken twice while Ticks and fleas was open: All was already the
     pressed pet, and 73 tick products stayed on screen, which is not "all" by
     any reading a shopper gives the word. The shelf clears only by pressing it
     a second time - a toggle nothing advertises - so the two buttons that
     promise everything are where that clearing lives. The named chips stay
     narrow on purpose: Dogs inside Ticks and fleas is a sensible place to
     stand, and pulling the shelf out from under it would be its own report. */
  const shop = fs.readFileSync(`${__dirname}/../pfa-shop.html`, 'utf8');
  const branch = shop.slice(shop.indexOf("t.hasAttribute('data-pet') || t.hasAttribute('data-cat')"));
  const body = branch.slice(0, branch.indexOf('\n  });'));
  assert.match(body, /if \(val === 'all'\)\{ shelf = ''; brand = ''; \}/,
    'the all chips reset the narrowing that has no button of its own');
  assert.ok(!/q = ''/.test(body), 'typed searches are never cleared for the visitor');
});
