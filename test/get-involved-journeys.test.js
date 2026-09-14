'use strict';

/* One journey at a time. The page opens on the choice; picking Volunteer or
   Colony caregiver shows that one and only that one. Driven, not asserted from
   the markup — a form can be present and still never appear. */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const test = require('node:test');
const assert = require('node:assert');
const { createDocument } = require('./_dom-shim.js');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'get-involved.html'), 'utf8');

function boot(hash) {
  const doc = createDocument(html);
  const errors = [];
  const history = [];
  const win = {
    document: doc,
    location: { hash: hash || '', pathname: '/get-involved.html', search: '' },
    history: {
      pushState(_s, _t, url) { history.push(url); win.location.hash = String(url).startsWith('#') ? url : ''; },
      replaceState() {}
    },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    getComputedStyle: () => ({ display: 'block' }),
    requestAnimationFrame: (fn) => { fn(0); return 1; },
    setTimeout: (fn) => { if (typeof fn === 'function') fn(); return 1; },
    clearTimeout() {}, setInterval: () => 1, clearInterval() {},
    addEventListener() {}, removeEventListener() {}, scrollTo() {},
    console, JSON, Math, Date, Number, String, Boolean, Array, Object, RegExp, Error,
    parseInt, parseFloat, isNaN, Promise, Map, Set, Intl, URLSearchParams,
    encodeURIComponent, decodeURIComponent,
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  };
  win.window = win; win.self = win; win.globalThis = win;
  doc.createElement = (tag) => {
    if (String(tag).toLowerCase() === 'canvas') return { getContext: () => ({}), toDataURL: () => '' };
    return createDocument('<div></div>').querySelector('div');
  };
  const ctx = vm.createContext(win);
  /* Attributes are captured so the JSON-LD block scripts/build-seo.js writes
     into every head is skipped. It is a <script> element but it is data, not
     code, and feeding it to the VM throws on the first colon. */
  [...html.matchAll(/<script(?![^>]*src=)([^>]*)>([\s\S]*?)<\/script>/g)]
    .filter((m) => !/type\s*=\s*["'][^"']*json/i.test(m[1]))
    .forEach((m, i) => {
      try { vm.runInContext(m[2], ctx, { filename: `gi#${i}`, timeout: 5000 }); }
      catch (e) { errors.push(e.message); }
    });
  return { doc, errors, history, win };
}

const wrap = (doc) => doc.querySelector('.gi');
const open = (doc) => doc.querySelectorAll('.gi__section')
  .filter((s) => s.classList.contains('is-open')).map((s) => s.getAttribute('id'));

test('the page boots and starts on the choice, with neither journey showing', () => {
  const { doc, errors } = boot('');
  assert.deepEqual(errors, [], errors.join('\n'));
  assert.ok(wrap(doc).classList.contains('is-guided'), 'the script must take over the hiding');
  assert.deepEqual(open(doc), [], 'no journey should be open on arrival');
  assert.ok(!wrap(doc).classList.contains('has-open'), 'the chooser stays visible');
});

test('choosing Volunteer shows only Volunteer', () => {
  const { doc } = boot('');
  const pick = doc.querySelectorAll('[data-gi-open]').filter((a) => a.getAttribute('data-gi-open') === 'volunteer')[0];
  assert.ok(pick, 'the Volunteer choice must exist');
  doc.dispatch('click', { target: pick, preventDefault() {} });
  assert.deepEqual(open(doc), ['volunteer']);
  assert.ok(wrap(doc).classList.contains('has-open'), 'the chooser gives way to the journey');
});

test('choosing the caregiver card shows only that', () => {
  const { doc } = boot('');
  const pick = doc.querySelectorAll('[data-gi-open]').filter((a) => a.getAttribute('data-gi-open') === 'caregiver')[0];
  doc.dispatch('click', { target: pick, preventDefault() {} });
  assert.deepEqual(open(doc), ['caregiver']);
});

test('a link straight to a journey opens it', () => {
  assert.deepEqual(open(boot('#caregiver').doc), ['caregiver']);
  assert.deepEqual(open(boot('#volunteer').doc), ['volunteer']);
});

test('the choice goes into the address bar, so it can be shared and gone back from', () => {
  const { doc, history } = boot('');
  const pick = doc.querySelectorAll('[data-gi-open]').filter((a) => a.getAttribute('data-gi-open') === 'volunteer')[0];
  doc.dispatch('click', { target: pick, preventDefault() {} });
  assert.deepEqual(history, ['#volunteer']);
});

test('there is a way back to the choice', () => {
  const { doc } = boot('#volunteer');
  assert.deepEqual(open(doc), ['volunteer']);
  const back = doc.querySelectorAll('[data-gi-back]')[0];
  assert.ok(back, 'each journey needs a way back');
  doc.dispatch('click', { target: back, preventDefault() {} });
  assert.deepEqual(open(doc), [], 'both journeys close again');
  assert.ok(!wrap(doc).classList.contains('has-open'));
});

test('an unknown hash falls back to the choice rather than a blank page', () => {
  const { doc } = boot('#nonsense');
  assert.deepEqual(open(doc), []);
  assert.ok(!wrap(doc).classList.contains('has-open'));
});

test('without JavaScript both journeys are shown, not neither', () => {
  /* The hiding hangs off .is-guided, which only the script adds. Hiding in
     plain CSS would leave a no-script visitor two buttons that do nothing. */
  const css = html.replace(/<script[\s\S]*?<\/script>/g, '');
  assert.match(css, /\.gi\.is-guided \.gi__section\{display:none\}/);
  /* Anchored: `.gi.is-guided .gi__section{display:none}` contains
     `.gi__section{display:none}` as a substring, and an unanchored test
     matched the guarded rule it was meant to allow. */
  assert.ok(!/(^|[}\n])\s*\.gi__section\{[^}]*display:none/.test(css),
    'the sections must not be hidden without the script');
});

test('both forms are still on the page, just not both shown', () => {
  assert.match(html, /id="volForm"/);
  assert.match(html, /id="cgForm"/);
  assert.match(html, /action="\/api\/payment\/create"/, 'the caregiver form still pays');
});

test('fields sharing a row share their box height and their top edge', () => {
  /* The parent grid stretches each field to its row's height; without
     align-content:start that stretch was dealt into the field's own rows and
     inflated the input - City or town rendered as a giant empty box next to
     Roughly how many. With subgrid the columns also share their label, input
     and hint rows, so a wrapped label or a hint under one box only can never
     push the boxes apart. The document fields keep their own flow. */
  assert.match(html, /\.field\{display:grid;gap:8px;align-content:start\}/,
    'a field lays its own rows from the top, never stretching the input');
  assert.match(html, /@supports \(grid-template-rows: subgrid\)\{\s*\.gi__fields > \.field:not\(\.gi__doc\)\{display:grid;grid-template-rows:subgrid;grid-row:span 3\}/,
    'paired fields share label, input and hint rows');
});
