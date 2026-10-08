'use strict';

/* The sticky subnav under the fixed header.

   Both carried a bottom border, and when the subnav docks they land 51px
   apart with the links fenced between them: two rules where the page only
   needs to say once where the chrome stops and the content starts.

   The subnav docks one pixel higher than the header's bottom edge, and while
   it is docked the header drops its own border (html.wall-docked), so the
   only rule on the strip is the subnav's own at the foot of the bar.

   Until 8 Oct 2026 the subnav did this by sitting a layer ABOVE the header
   (51 against 50) and covering the border with its own white. That also put
   it over the header's menus: the owner's screenshot showed About's menu cut
   in half by it. The header and everything it opens now stay on top
   (test/stacking.test.js); the backgrounds still match, so the pixel the bar
   tucks under the header never shows as a tonal step. */

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

test('and under the header, which hides its own border while the bar is docked', () => {
  const z = Number(/z-index:(\d+)/.exec(rule[1])[1]);
  const header = Number(/header\.site\{[^}]*z-index:(\d+)/.exec(chrome)[1]);
  assert.ok(z < header, `the subnav (${z}) must stay under the header (${header}), or it covers the header's menus`);
  assert.ok(z <= 44, `and under the search box (45) and the phone menu (49): ${z}`);
  assert.match(html, /html\.wall-docked header\.site\{border-bottom-color:transparent/, 'the header drops its border while docked');
  assert.match(html, /classList\.toggle\('wall-docked', bar\.getBoundingClientRect\(\)\.top <= top \+ 1\)/, 'docked means sitting at its sticky top');
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
