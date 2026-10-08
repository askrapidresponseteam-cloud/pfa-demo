'use strict';

/* "Before the camera rolls": the answer box lines up with the choices
   (owner, 5 Oct 2026: "the boxes on the left are not in the same pos as the
   one in the right"). It used to start level with the question label, above
   the first choice. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const page = fs.readFileSync(path.join(__dirname, '..', 'cinekind.html'), 'utf8');

test('the answer box shares the choices row, top and bottom', () => {
  assert.match(page, /\.kindset \.tool > div:first-child\{display:contents\}/);
  assert.match(page, /\.kindset \.tool h3\{grid-column:1;grid-row:1\}/);
  assert.match(page, /\.kindset \.choices\{grid-column:1;grid-row:2;align-self:stretch;grid-auto-rows:1fr\}/);
  assert.match(page, /\.kindset \.answer\{grid-column:2;grid-row:2;align-self:stretch;min-height:0\}/);
});

test('on a narrow screen the answer comes after the hint, in one column', () => {
  assert.match(page, /@media \(max-width:860px\)\{\s*\.feature,\.tool\{grid-template-columns:1fr\}\s*\.kindset \.answer\{grid-column:1;grid-row:4/);
});
