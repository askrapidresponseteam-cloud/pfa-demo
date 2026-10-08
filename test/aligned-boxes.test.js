'use strict';

/* Boxes that sit side by side line up (owner, 5 Oct 2026: "the boxes on the
   left are not in the same pos as the one in the right .. ensure this in all
   pages where such scenario exists"). Every page was measured in a browser at
   1000, 1100, 1280 and 1440px for side-by-side boxes whose tops differ; these
   pin the four places that were out of line. The CineKind scene picker has
   its own test (cinekind-kindset.test.js). The shop's designer mosaic is
   left staggered on purpose. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('the follow-up row: both fields and the button are one height (ask, careers, report)', () => {
  for (const page of ['ask.html', 'careers.html', 'report.html']) {
    assert.match(read(page), /\.follow form input,\.follow form \.btn\{box-sizing:border-box;height:50px;min-height:50px\}/, page);
  }
  /* 50px because the shared button has a 50px floor */
  assert.match(read('assets/pfa-theme.css'), /min-height:50px/);
});

test('events: the two lower columns open with their labels level', () => {
  assert.match(read('events.html'), /\.ev-lower \.band__head \.eyebrow\{margin-top:0\}/);
});

test('someone: the four quiz portraits are a level grid that stays inside the card', () => {
  const page = read('someone.html');
  assert.match(page, /class="pfa-quiztiles" style="display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  const tiles = page.slice(page.indexOf('class="pfa-quiztiles"'), page.indexOf('quiz-tile-4') + 40);
  assert.doesNotMatch(tiles, /translateY/);
});
