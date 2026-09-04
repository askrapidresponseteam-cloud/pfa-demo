'use strict';

/* Drives the prescription control the way a person does: render the product
   page, choose a file, press send.

   The first version of this control was wired directly to #rxFile at script
   load. paint() writes the product body with innerHTML and runs afterwards, so
   the element did not exist yet, the wiring returned silently and the button
   never worked. Nothing caught it because the tests checked that the markup
   and the endpoint were right, not that pressing the button did anything. */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const test = require('node:test');
const assert = require('node:assert');
const { createDocument } = require('./_dom-shim.js');

const ROOT = path.join(__dirname, '..');
const helperSrc = fs.readFileSync(path.join(ROOT, 'pfa-forms.js'), 'utf8');

async function render() {
  const catalog = require('../lib/routes/paws-catalog.js');
  const route = require('../lib/routes/product-page.js');
  const P = catalog._private;
  const product = P.normalizeProduct({
    id: '900', handle: 'c4all-injection', title: 'Alembic C4ALL Injection',
    vendor: 'Example Seller', product_type: 'Injection', tags: ['prescription required'],
    body_html: '<p>Prescription required veterinary antibiotic.</p>',
    images: [{ id: 'i1', src: 'https://cdn.shopify.com/s/files/c.webp', width: 800, height: 800 }],
    variants: [{ id: '46608189325487', title: '50mg', price: '105.00', available: true }]
  });
  const original = catalog.getCatalog;
  catalog.getCatalog = async () => ({ products: [product], collections: [], stats: {}, source: {} });
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
  const url = '/api/index?__route=product-page&handle=c4all-injection';
  await route({ method: 'GET', url, headers: { host: 'pfa.test' }, query: { handle: 'c4all-injection' } }, res);
  catalog.getCatalog = original;
  return res.body;
}

function boot(html) {
  const doc = createDocument(html);
  const errors = [];
  const sent = [];

  const win = {
    document: doc,
    location: { search: '', pathname: '/products/c4all-injection', href: 'https://pfa.test/products/c4all-injection' },
    history: { replaceState() {} }, navigator: { sendBeacon: () => true },
    FileReader: function FileReader() {
      const self = this;
      self.readAsDataURL = function () {
        self.result = 'data:image/jpeg;base64,AAAA';
        Promise.resolve().then(() => self.onload && self.onload());
      };
    },
    Image: function Image() {
      const self = this;
      self.width = 2400; self.height = 1800;
      Object.defineProperty(self, 'src', {
        get() { return self._src; },
        set(v) { self._src = v; Promise.resolve().then(() => self.onload && self.onload()); }
      });
    },
    AbortController: function AbortController() { this.signal = {}; this.abort = () => {}; },
    URL: Object.assign(function () {}, { createObjectURL: () => 'blob:x', revokeObjectURL() {} }),
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    getComputedStyle: () => ({ display: 'block', position: 'static' }),
    requestAnimationFrame: (fn) => { fn(0); return 1; },
    setTimeout: (fn) => { if (typeof fn === 'function') fn(); return 1; },
    clearTimeout() {}, setInterval: () => 1, clearInterval() {},
    addEventListener() {}, removeEventListener() {}, scrollTo() {},
    console, JSON, Math, Date, Number, String, Boolean, Array, Object, RegExp, Error,
    parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent, Promise, Map, Set, Intl,
    URLSearchParams,
    fetch: (url, opts) => {
      sent.push(JSON.parse(opts.body));
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, reference: 'PFA-RX-2026-00001' }) });
    }
  };
  win.window = win; win.self = win; win.globalThis = win;

  doc.createElement = (tag) => {
    if (String(tag).toLowerCase() === 'canvas') {
      return {
        width: 0, height: 0,
        getContext: () => ({ drawImage() {} }),
        toDataURL: () => 'data:image/jpeg;base64,' + 'A'.repeat(400)
      };
    }
    return createDocument('<div></div>').querySelector('div');
  };

  const context = vm.createContext(win);
  vm.runInContext(helperSrc, context, { filename: 'pfa-forms.js' });   // the real helper
  const inline = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
    .filter((m) => !/\bsrc=/.test(m[1]))
    .filter((m) => {
      const type = (m[1].match(/type\s*=\s*["']([^"']+)["']/) || [])[1];
      return !type || /^(text\/javascript|application\/javascript|module)$/i.test(type);
    });
  inline.forEach((m, i) => {
    try { vm.runInContext(m[2], context, { filename: `product#${i}`, timeout: 5000 }); }
    catch (error) { errors.push(`script[${i}]: ${error.message}`); }
  });
  return { doc, errors, sent };
}

test('the control is rendered, and the page boots clean', async () => {
  const { doc, errors } = boot(await render());
  assert.deepEqual(errors, [], errors.join('\n'));
  assert.ok(doc.getElementById('rxFile'), 'the file input must be on the page');
  assert.ok(doc.getElementById('rxSend'), 'the send button must be on the page');
});

test('choosing a photograph enables send, and pressing it posts the image', async () => {
  const { doc, sent } = boot(await render());
  const input = doc.getElementById('rxFile');
  const send = doc.getElementById('rxSend');
  assert.equal(send.disabled, true, 'send starts disabled');

  input.files = [{ type: 'image/jpeg', name: 'rx.jpg' }];
  doc.dispatch('change', { target: input });
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));

  assert.equal(doc.getElementById('rxSend').disabled, false,
    'a chosen photograph must enable the button');

  doc.dispatch('click', { target: doc.getElementById('rxSend'), preventDefault() {} });
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));

  assert.equal(sent.length, 1, 'pressing send must post');
  assert.equal(sent[0].kind, 'PFA-RX');
  assert.ok(Array.isArray(sent[0].photos) && sent[0].photos.length === 1, 'the image must travel with it');
  assert.match(sent[0].photos[0], /^data:image\/jpeg;base64,/);
});

test('the handlers are delegated, so a repaint cannot unwire them', () => {
  const src = fs.readFileSync(path.join(ROOT, 'product.html'), 'utf8');
  /* paint() rewrites the body, so anything bound to #rxFile directly is lost
     on the next variant change even if it were bound after the first paint. */
  assert.match(src, /document\.addEventListener\('change', function \(e\) \{[\s\S]{0,200}closest\('#rxFile'\)/);
  assert.match(src, /e\.target\.closest\('#rxSend'\)/);
  assert.ok(!/getElementById\('rxFile'\)\.addEventListener/.test(src), 'must not bind directly');
});

test('a chosen photograph survives a repaint', () => {
  const src = fs.readFileSync(path.join(ROOT, 'product.html'), 'utf8');
  assert.match(src, /paintCart\(\);\s*\n\s*paintRx\(\);/,
    'paint must restore the control, or a variant change silently disables it again');
});
