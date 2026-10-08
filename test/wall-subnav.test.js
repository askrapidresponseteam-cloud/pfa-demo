'use strict';

/* The sticky subnav under the fixed header.

   Both carried a bottom border, and when the subnav docks they land 51px
   apart with the links fenced between them: two rules where the page only
   needs to say once where the chrome stops and the content starts.

   The subnav docks one pixel higher than the header's bottom edge and sits a
   layer above it, so its own background covers the header's border while
   they touch. That only works if the two backgrounds match; a pure white
   subnav under a 96% white header put a visible tonal step over the black
   panels instead of a line, which is not an improvement. Measured over a
   black panel after the change: the covered border reads 252 against
   neighbours at 252 and 253, and the only rule on the strip is the subnav's
   own at the foot of the bar. */

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'wall.html'), 'utf8');
const chrome = fs.readFileSync(path.join(ROOT, 'assets', 'chrome.css'), 'utf8');
const rule = /(?:^|[}\n])\.subnav\{([^}]*)\}/.exec(html.replace(/\/\*[\s\S]*?\*\//g, ''));

test('the subnav docks a pixel above the header bottom, so it lands on the border', () => {
  assert.ok(rule, 'the subnav rule is still where the page keeps it');
  assert.match(rule[1], /top:calc\(var\(--ann\) \+ var\(--nav\) - 1px\)/,
    'one pixel of overlap is the whole mechanism; without it the header border shows');
});

test('and a layer above it, without climbing over the announcement or the theatre', () => {
  const z = Number(/z-index:(\d+)/.exec(rule[1])[1]);
  const header = Number(/header\.site\{[^}]*z-index:(\d+)/.exec(chrome)[1]);
  assert.ok(z > header, `the subnav (${z}) must paint over the header (${header}) to cover its border`);
  assert.ok(z < 60, `the announcement bar is 60; the subnav (${z}) must stay under it`);
  assert.ok(z < 90, `the theatre is 90 and covers the page; the subnav (${z}) must stay under it`);
});

test('the two backgrounds match, or the covered border becomes a tonal step', () => {
  const headerBg = /header\.site\{[^}]*background:(rgba\([^)]*\))/.exec(chrome)[1];
  assert.match(rule[1], new RegExp('background:' + headerBg.replace(/[().]/g, '\\$&')),
    `the subnav must use the header's own ${headerBg}, not a flat white`);
  assert.match(rule[1], /backdrop-filter:blur\(12px\)/, 'and the same blur, for the same reason');
});

test('exactly one rule closes the bar', () => {
  assert.match(rule[1], /border-bottom:1px solid var\(--line\)/, 'the subnav carries the single line');
  assert.ok(!/border-top:/.test(rule[1]), 'a top border would put the second line straight back');
});
