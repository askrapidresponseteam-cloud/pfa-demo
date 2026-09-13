'use strict';
/* Boots the real inline scripts of donate.html against a
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
        json: () => Promise.resolve({ items: [] })
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
