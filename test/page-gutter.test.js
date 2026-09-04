'use strict';

/* Every page sets the same side-gutter token. It used to be
   `max(16px,(100% - 1440px)/2)`, which holds a flat 16px until the viewport
   passes about 1472px — so on a laptop every band on the page, including the
   shop's filter bar with its search box and item count, sat 16px from the
   edge. 16px is a phone gutter.

   It now scales with the viewport and only hands over to the centring term
   once that is the larger of the two, so wide screens are unchanged. */

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const ROOT = path.join(__dirname, '..');
const files = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')).concat('pfa-search.css');

/* Returns [name, value]. The first version filtered on the value containing
   "-lg", which no value ever does — so --gutter-lg was compared against
   --gutter and the two were reported as a disagreement. */
function tokensIn(text) {
  return [...text.matchAll(/(--g(?:utter)?(?:-lg)?):\s*([^;]+);/g)]
    .map((m) => [m[1], m[2].trim()]);
}
function mainGutter(text) {
  const hit = tokensIn(text).find(([name]) => !name.endsWith('-lg'));
  return hit && hit[1];
}

/* Mirrors max(clamp(min,vw,max),(100% - 1440px)/2). */
function gutterAt(width, min, vw, max) {
  return Math.max(Math.min(Math.max(min, (vw / 100) * width), max), (width - 1440) / 2);
}

test('every page defines the gutter, and they all define it the same way', () => {
  const seen = new Map();
  for (const file of files) {
    const value = mainGutter(fs.readFileSync(path.join(ROOT, file), 'utf8'));
    if (value) seen.set(value, (seen.get(value) || []).concat(file));
  }
  const definitions = [...seen.keys()];
  assert.ok(definitions.length > 0, 'sanity: a gutter token was found');
  assert.equal(definitions.length, 1,
    `pages disagree about the gutter: ${definitions.join(' | ')}`);
});

test('the gutter is no longer a flat phone value on a laptop', () => {
  const token = mainGutter(fs.readFileSync(path.join(ROOT, 'pfa-shop.html'), 'utf8'));
  const clamp = token.match(/clamp\((\d+)px,([\d.]+)vw,(\d+)px\)/);
  assert.ok(clamp, `the gutter must scale, got: ${token}`);
  const [, min, vw, max] = clamp.map(Number);

  assert.equal(gutterAt(380, min, vw, max), 16, 'a phone keeps its 16px');
  assert.ok(gutterAt(1190, min, vw, max) >= 40,
    `at 1190px the gutter is ${gutterAt(1190, min, vw, max)}px; the filter bar sat on the edge at 16px`);
  assert.ok(gutterAt(1440, min, vw, max) >= 48, 'and more again at 1440px');
});

test('wide screens are unchanged: the centring term still wins', () => {
  const token = mainGutter(fs.readFileSync(path.join(ROOT, 'pfa-shop.html'), 'utf8'));
  const [, min, vw, max] = token.match(/clamp\((\d+)px,([\d.]+)vw,(\d+)px\)/).map(Number);
  for (const width of [1600, 1920, 2380, 2560]) {
    assert.equal(gutterAt(width, min, vw, max), (width - 1440) / 2,
      `at ${width}px the content column must still be centred at 1440px`);
  }
});

test('the generated pages carry the same token as the shop they are built from', () => {
  const shop = mainGutter(fs.readFileSync(path.join(ROOT, 'pfa-shop.html'), 'utf8'));
  for (const page of ['product.html', 'quiz.html']) {
    assert.equal(mainGutter(fs.readFileSync(path.join(ROOT, page), 'utf8')), shop,
      `${page} is out of step; run the build scripts`);
  }
});
