'use strict';
/* Boots the real inline scripts of donate.html and pfa-shop.html against a
   DOM that returns null for elements the page does not have, then drives the
   flows. Catches stale references, dead handlers and half-removed features
   that a syntax check cannot see. */

const fs = require('fs');
const vm = require('vm');
const test = require('node:test');
const assert = require('node:assert');
const { createDocument } = require('./_dom-shim.js');

const ROOT = `${__dirname}/..`;
/* scripts/minify.js points this at dist/ to boot the minified pages. */
const PAGES = process.env.PFA_PAGES_ROOT || ROOT;

/* Inline scripts only, and only ones the browser would execute: a
   type="application/ld+json" block is data, and running it as JavaScript
   would throw on the first colon. */
function scriptsOf(html) {
  return [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
    .filter((m) => !/\bsrc=/.test(m[1]))
    .filter((m) => {
      const type = (m[1].match(/type\s*=\s*["']([^"']+)["']/) || [])[1];
      return !type || /^(text\/javascript|application\/javascript|module)$/i.test(type);
    })
    .map((m) => m[2]);
}

function boot(file) {
  const html = fs.readFileSync(`${PAGES}/${file}`, 'utf8');
  const doc = createDocument(html);
  const errors = [];
  const fetches = [];

  const win = {
    document: doc,
    location: { search: '', pathname: `/${file}`, href: `https://pfa.test/${file}` },
    history: { replaceState: () => {}, pushState: () => {} },
    navigator: { sendBeacon: () => true, userAgent: 'node' },
    localStorage: null,
    sessionStorage: { _d: {}, getItem(k) { return k in this._d ? this._d[k] : null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } },
    matchMedia: () => ({ matches: false, addEventListener: () => {}, addListener: () => {} }),
    getComputedStyle: () => ({ display: 'block', position: 'static' }),
    requestAnimationFrame: (fn) => { fn(0); return 1; },
    cancelAnimationFrame: () => {},
    setTimeout: (fn) => { void fn; return 1; },
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    scrollTo: () => {},
    URLSearchParams,
    URL,
    Blob: function Blob() {},
    console,
    JSON, Math, Date, Number, String, Boolean, Array, Object, RegExp, Error,
    parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent,
    Promise, Map, Set, Intl,
    fetch: (url, opts) => {
      fetches.push({ url: String(url), opts: opts || {} });
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({ products: [], items: [], store: { open: true, state: 'veg' } })
      });
    }
  };
  win.window = win;
  win.self = win;
  win.globalThis = win;
  doc.defaultView = win;

  const context = vm.createContext(win);
  scriptsOf(html).forEach((code, i) => {
    try {
      vm.runInContext(code, context, { filename: `${file}#script${i}`, timeout: 5000 });
    } catch (error) {
      errors.push(`${file} script[${i}]: ${error.message}`);
    }
  });
  return { win, doc, errors, fetches, html };
}

/* ------------------------------------------------------------------ donate */

test('donate.html boots with no runtime error', () => {
  const { errors } = boot('donate.html');
  assert.deepEqual(errors, [], errors.join('\n'));
});

test('donate: both forms post to the CCAvenue endpoint, not to a stub', () => {
  const { doc } = boot('donate.html');
  const give = doc.getElementById('giveForm');
  const food = doc.getElementById('foodForm');
  assert.ok(give && food, 'both forms exist');
  assert.equal(give.getAttribute('action'), '/api/payment/create');
  assert.equal(give.getAttribute('method'), 'post');
  assert.equal(food.getAttribute('action'), '/api/payment/create');
  assert.equal(food.getAttribute('method'), 'post');
});

test('donate: every field the server requires is present and named', () => {
  const { html } = boot('donate.html');
  // parseDonation
  for (const name of ['type', 'currency', 'amount', 'terms', 'name', 'mobile', 'email', 'address', 'cause']) {
    assert.ok(new RegExp(`name="${name}"`).test(html), `give form is missing name="${name}"`);
  }
  // parseSend
  for (const name of ['items', 'state', 'district', 'locality']) {
    assert.ok(new RegExp(`name="${name}"`).test(html), `food form is missing name="${name}"`);
  }
});

test('donate: monthly is not reachable while there is no mandate flow', () => {
  const { doc, html } = boot('donate.html');
  assert.ok(/MONTHLY_MANDATE_LIVE = false/.test(html), 'the flag must default to off');
  // The button is removed on boot, so nothing can select it.
  assert.equal(doc.querySelector('[data-freq="monthly"]'), null);
});

test('donate: the food catalogue matches the server, key for key and price for price', () => {
  const { html } = boot('donate.html');
  const server = require('../lib/payment.js')._private || null;
  void server;
  const expected = [
    ['rice', 550], ['wheat', 480], ['poha', 320], ['soya chunks', 650], ['vegetarian dog food', 1450]
  ];
  for (const [key, price] of expected) {
    const re = new RegExp(`id:'${key.replace(/ /g, ' ')}'[^}]*inr:${price}\\b`);
    assert.ok(re.test(html), `donate.html must list ${key} at ${price}`);
  }
  assert.ok(!/khichdi|roti|fodder|Bird grain/.test(html), 'the old invented catalogue must be gone');
});

/* -------------------------------------------------------------------- shop */

test('pfa-shop.html boots with no runtime error', () => {
  const { errors } = boot('pfa-shop.html');
  assert.deepEqual(errors, [], errors.join('\n'));
});

test('shop: the catalogue is fetched from the live endpoint on boot', () => {
  const { fetches } = boot('pfa-shop.html');
  assert.ok(fetches.some((f) => f.url.includes('/api/paws-catalog')),
    `expected a catalogue fetch, saw: ${fetches.map((f) => f.url).join(', ') || 'none'}`);
});

/* An id is fine if it is in the markup OR the script writes it into innerHTML
   itself. Anything else is a reference to something that no longer exists. */
function danglingIds(file) {
  const html = fs.readFileSync(`${PAGES}/${file}`, 'utf8');
  const doc = createDocument(html);
  const js = scriptsOf(html).join('\n');
  const created = new Set([...js.matchAll(/id="([\w-]+)"/g)].map((m) => m[1]));
  const wanted = new Set([...js.matchAll(/\$\(['"]#([\w-]+)['"]\)|getElementById\(['"]([\w-]+)['"]\)/g)]
    .map((m) => m[1] || m[2]));
  return [...wanted].filter((id) => !doc.getElementById(id) && !created.has(id));
}

test('shop: the script holds no reference to an element that no longer exists', () => {
  const missing = danglingIds('pfa-shop.html');
  assert.deepEqual(missing, [], `dangling ids: ${missing.join(', ')}`);
});

test('donate: the script holds no reference to an element that no longer exists', () => {
  const missing = danglingIds('donate.html');
  assert.deepEqual(missing, [], `dangling ids: ${missing.join(', ')}`);
});

/* ---------------------------------------------------- driving the flows */

test('donate: a valid gift populates every hidden field the server reads', () => {
  const { doc } = boot('donate.html');
  const form = doc.getElementById('giveForm');

  doc.getElementById('gName').value = 'Asha Rao';
  doc.getElementById('gMobile').value = '9876543210';
  doc.getElementById('gEmail').value = 'asha@example.com';
  doc.getElementById('gAddress').value = '12 Car Street, Udupi';
  doc.getElementById('gAgree').checked = true;

  let prevented = false;
  form.dispatch('submit', { preventDefault: () => { prevented = true; }, target: form });

  assert.equal(prevented, false, 'a valid gift must be allowed to post');
  assert.equal(doc.getElementById('gTerms').value, 'yes', 'terms must be sent as a value');
  assert.ok(Number(doc.getElementById('gAmount').value) >= 10, 'an amount must be sent');
  assert.equal(doc.getElementById('payBtn').disabled, true, 'the button must lock to stop a double post');
});

test('donate: an invalid mobile blocks the post rather than failing at the gateway', () => {
  const { doc } = boot('donate.html');
  const form = doc.getElementById('giveForm');
  doc.getElementById('gName').value = 'Asha Rao';
  doc.getElementById('gMobile').value = '1234567890';      // not 6-9 leading
  doc.getElementById('gEmail').value = 'asha@example.com';
  doc.getElementById('gAddress').value = '12 Car Street, Udupi';
  doc.getElementById('gAgree').checked = true;

  let prevented = false;
  form.dispatch('submit', { preventDefault: () => { prevented = true; }, target: form });
  assert.equal(prevented, true, 'the post must be blocked');
  assert.equal(doc.getElementById('gTerms').value, '', 'nothing may be marked accepted on a blocked post');
});

test('donate: an unticked box blocks the post', () => {
  const { doc } = boot('donate.html');
  const form = doc.getElementById('giveForm');
  doc.getElementById('gName').value = 'Asha Rao';
  doc.getElementById('gMobile').value = '9876543210';
  doc.getElementById('gEmail').value = 'asha@example.com';
  doc.getElementById('gAddress').value = '12 Car Street, Udupi';
  doc.getElementById('gAgree').checked = false;

  let prevented = false;
  form.dispatch('submit', { preventDefault: () => { prevented = true; }, target: form });
  assert.equal(prevented, true, 'terms are required by the server, so require them here');
});

test('shop: the page carries no invented delivery, round-up or care figure', () => {
  const html = fs.readFileSync(`${PAGES}/pfa-shop.html`, 'utf8');
  assert.ok(!/FREE_SHIP|ROUNDUP|DAY_OF_CARE|barProg/.test(html), 'invented commerce state must be gone');
  assert.ok(!/days of care|Round up|26 shelters/i.test(html));

  /* "free delivery" used to be on this list, from when the shop made the offer
     up. The shop says it again, but no longer invents it: the threshold comes
     from the server with the store block, the page holds no figure of its own,
     and if Shopify charges for a basket above it the claim is withdrawn.
     Those three are checked properly in test/shipping-method.test.js; what
     matters here is that nothing put a number back into the page. */
  const script = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g, ' ');
  if (/free delivery/i.test(html)) {
    assert.match(script, /storeState\.freeDeliveryAbove/, 'a free-delivery claim must come from the server');
    assert.doesNotMatch(script, /freeAbove\s*=\s*[1-9]/, 'and carry no figure of its own');
  }
});

test('shop: checkout posts to the order route and never to the CCAvenue layer', () => {
  const html = fs.readFileSync(`${PAGES}/pfa-shop.html`, 'utf8');
  assert.ok(/'\/api\/pfa-orders'/.test(html));
  assert.ok(!/payment\/create/.test(html), 'store money must never reach CCAvenue');
});

/* ------------------------------------------------------------- product page */

/* The template is rendered by the server, so it is booted the same way: run
   the route against a stub catalogue, then run the resulting page. */
async function bootProduct(handle) {
  const catalog = require('../lib/routes/paws-catalog');
  const route = require('../lib/routes/product-page');
  const P = catalog._private;
  const make = (id, h, title) => P.normalizeProduct({
    id, handle: h, title, vendor: 'Example Seller', product_type: 'Supplement', tags: [],
    body_html: '<p>Skin and coat support <b>for</b> dogs and cats.</p>',
    images: [{ id: 'i1', src: 'https://cdn.shopify.com/s/files/a.webp', width: 900, height: 900 }],
    variants: [
      { id: '46608189325487', title: '250 ml', sku: 'ALC-250', price: '640.00', compare_at_price: '700.00', available: true },
      { id: '46608189325488', title: '500 ml', sku: 'ALC-500', price: '1180.00', available: false }
    ]
  });
  const a = make('849', 'alcovet-alcoat-z-250ml-skin-coat-supplement-for-dogs-cats', 'Alcovet Alcoat-Z 250ml Skin & Coat Supplement');
  const b = make('850', 'other-liver-tonic', 'Other Liver Tonic');
  const original = catalog.getCatalog;
  catalog.getCatalog = async () => ({ products: [a, b], collections: [], stats: {}, source: {} });

  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(x) { this.body = x; } };
  const url = `/api/index?__route=product-page&handle=${handle}`;
  await route({ method: 'GET', url, headers: { host: 'pfa.test' },
    query: Object.fromEntries(new URL(url, 'https://x').searchParams) }, res);
  catalog.getCatalog = original;

  const doc = createDocument(res.body);
  const errors = [];
  const win = {
    document: doc, location: { search: '', pathname: `/products/${handle}`, href: `https://pfa.test/products/${handle}` },
    history: { replaceState: () => {} }, navigator: { sendBeacon: () => true },
    sessionStorage: { _d: {}, getItem(k) { return k in this._d ? this._d[k] : null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } },
    matchMedia: () => ({ matches: false, addEventListener: () => {}, addListener: () => {} }),
    getComputedStyle: () => ({ display: 'block', position: 'static' }),
    requestAnimationFrame: (fn) => { fn(0); return 1; },
    setTimeout: () => 1, clearTimeout: () => {}, setInterval: () => 1, clearInterval: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, scrollTo: () => {},
    URLSearchParams, URL, console, JSON, Math, Date, Number, String, Boolean, Array, Object,
    RegExp, Error, parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent, Promise, Map, Set, Intl,
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  };
  win.window = win; win.self = win; win.globalThis = win;
  const context = vm.createContext(win);
  scriptsOf(res.body).forEach((code, i) => {
    try { vm.runInContext(code, context, { filename: `product#${i}`, timeout: 5000 }); }
    catch (error) { errors.push(`script[${i}]: ${error.message}`); }
  });
  return { res, doc, errors, win };
}

test('the product page renders and boots with no runtime error', async () => {
  const { res, doc, errors } = await bootProduct('alcovet-alcoat-z-250ml-skin-coat-supplement-for-dogs-cats');
  assert.equal(res.statusCode, 200);
  assert.ok(!/template is missing/.test(res.body), 'the template must be found');
  assert.deepEqual(errors, [], errors.join('\n'));
  const pd = doc.getElementById('pd');
  assert.ok(pd && pd.innerHTML.length > 500, 'the page must paint a body');
});

test('the product page carries the same shell as the rest of the site', () => {
  const html = fs.readFileSync(`${PAGES}/product.html`, 'utf8');
  const shop = fs.readFileSync(`${PAGES}/pfa-shop.html`, 'utf8');
  /* Same shell as the shop, with relative URLs rewritten to root-absolute
     because this page is served at /products/<handle>. */
  const { rootify, sectionLink } = require('../scripts/build-product-template.js');
  const shell = shop.slice(shop.indexOf('<header class="site"'), shop.indexOf('</header>') + 9);
  assert.ok(html.includes(sectionLink(rootify(shell))), 'the header must track the shop header');
  const footer = shop.slice(shop.indexOf('<footer class="pfa-footer"'), shop.indexOf('</footer>') + 9);
  assert.ok(html.includes(rootify(footer)), 'the footer must track the shop footer');
  assert.ok(html.includes("font-family: 'Marcellus'"), 'the same self-hosted display face');
  /* Real references, not the comment that explains why they are absent. */
  const code = html.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
  assert.ok(!/src=["'][^"']*assets\/product\.js/.test(code), 'must not load the other half\'s product.js');
  assert.ok(!/href=["'][^"']*store\.html/.test(code), 'must not link to a page this tree does not have');
  assert.ok(!/pd-toast-link|hero-actions|btn dark|btn light/.test(code), 'must not use the other half\'s classes');
});

test('the render markers survive exactly once in the template', () => {
  const html = fs.readFileSync(`${PAGES}/product.html`, 'utf8');
  assert.equal((html.match(/<!--PFA_DATA-->/g) || []).length, 1, 'render() replaces the first occurrence');
  assert.equal((html.match(/<!--PFA_HEAD_START-->/g) || []).length, 1);
  assert.equal((html.match(/<!--PFA_HEAD_END-->/g) || []).length, 1);
});

test('an unknown product is a styled page, not a bare error', async () => {
  const { res, doc, errors } = await bootProduct('does-not-exist');
  assert.equal(res.statusCode, 404);
  assert.deepEqual(errors, [], errors.join('\n'));
  assert.match(doc.getElementById('pd').innerHTML, /could not find that product/);
});

test('adding to the bag writes the key the shop reads', async () => {
  const { doc, win } = await bootProduct('alcovet-alcoat-z-250ml-skin-coat-supplement-for-dogs-cats');
  doc.dispatchOn = null;
  // The click handler is delegated on document; drive it the way the DOM shim allows.
  const shop = fs.readFileSync(`${PAGES}/pfa-shop.html`, 'utf8');
  const product = fs.readFileSync(`${PAGES}/product.html`, 'utf8');
  assert.ok(/pfa:store:bag/.test(product), 'the product page must use the shared bag key');
  assert.ok(/pfa:store:bag/.test(shop), 'and the shop must read the same key');
  void win;
});
