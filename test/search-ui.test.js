'use strict';

/* The search prompt appears twice: as a label in the overlay and as the
   heading on search.html. It is one sentence, so it is set once. */

const fs = require('fs');
const vm = require('vm');
const test = require('node:test');
const assert = require('node:assert');
const { createDocument } = require('./_dom-shim.js');

const ROOT = `${__dirname}/..`;
const css = fs.readFileSync(`${ROOT}/pfa-search.css`, 'utf8');
const js = fs.readFileSync(`${ROOT}/pfa-search.js`, 'utf8');

function fontSizeOf(selector) {
  const rule = css.match(new RegExp(selector.replace(/[.\\]/g, '\\$&') + '\\{([^}]*)\\}'));
  assert.ok(rule, `${selector} not found`);
  const size = rule[1].match(/font-size:\s*([^;}]+)/);
  assert.ok(size, `${selector} has no font-size`);
  return size[1].trim();
}

test('the overlay prompt and the search-page prompt are the same size', () => {
  assert.equal(fontSizeOf('.pfa-search__ask'), fontSizeOf('.pfa-sr__q.is-prompt'),
    'the same question must not be two different sizes');
});

test('the prompt is smaller than the display headline it used to match', () => {
  const prompt = fontSizeOf('.pfa-search__ask');
  const max = Number(prompt.match(/,\s*(\d+)px\)/)[1]);
  assert.ok(max <= 48, `the prompt caps at ${max}px; it labels an input, it is not a headline`);
  /* The query echo on a results page is still display scale — only the
     prompt was oversized. */
  const echo = Number(fontSizeOf('.pfa-sr__q').match(/,\s*(\d+)px\)/)[1]);
  assert.ok(echo > max, 'the query echo keeps its display scale');
});

test('the prompt wraps instead of carrying line breaks tuned for 112px type', () => {
  assert.ok(!/What would<br>/.test(js), 'no hard breaks in the overlay or the results page');
  const html = fs.readFileSync(`${ROOT}/search.html`, 'utf8');
  assert.ok(!/What would<br>/.test(html), 'nor in the static markup');
  assert.match(css, /\.pfa-search__ask\{[^}]*max-width:22ch/, 'width controls the wrap now');
});

test('the prompt still labels the search input', () => {
  assert.match(js, /<label for="pfa-q" class="pfa-search__ask">/);
  assert.match(js, /<input id="pfa-q"/, 'the id the label points at must exist');
});

test('pfa-search.js loads without throwing', () => {
  const doc = createDocument(fs.readFileSync(`${ROOT}/search.html`, 'utf8'));
  const win = {
    document: doc, location: { search: '', pathname: '/search.html', href: 'https://pfa.test/search.html' },
    history: { replaceState: () => {} }, navigator: { sendBeacon: () => true },
    sessionStorage: { _d: {}, getItem(k) { return k in this._d ? this._d[k] : null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } },
    localStorage: { _d: {}, getItem(k) { return k in this._d ? this._d[k] : null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } },
    matchMedia: () => ({ matches: false, addEventListener: () => {} }),
    getComputedStyle: () => ({ display: 'block', position: 'static' }),
    requestAnimationFrame: (fn) => { fn(0); return 1; },
    setTimeout: () => 1, clearTimeout: () => {}, setInterval: () => 1, clearInterval: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, scrollTo: () => {},
    CustomEvent: function CustomEvent() {}, URLSearchParams, URL, console, JSON, Math, Date,
    Number, String, Boolean, Array, Object, RegExp, Error, parseInt, parseFloat, isNaN,
    encodeURIComponent, decodeURIComponent, Promise, Map, Set, Intl,
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) })
  };
  win.window = win; win.self = win; win.globalThis = win;
  vm.runInContext(js, vm.createContext(win), { filename: 'pfa-search.js', timeout: 5000 });
});
