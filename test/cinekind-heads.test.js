'use strict';

/* CineKind, 9 Oct 2026. The owner, on the grid of eleven portraits: "why no
   header for this section". Two things were wrong.

   1. The roll of the 2026 honours followed the red carpet film and the reels
      with no heading of its own; the section's title was a screen or more
      above. It now has one, the way the 2025 roll is headed: "Roll of honour"
      over "The eleven honours.", without a section number of its own.

   2. Every section head on the page was invisible. assets/pfa-theme.css
      sets a deep band's head for dark ground (white label, number and rule),
      and this page's deep bands are paper: "This year", "About", "Roll of
      honour" and the rest were white on white. Measured in a browser on all
      22 pages: CineKind was the only page with a section label, number or
      rule below 3:1 (each was 1:1), and after the fix none is. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(ROOT, 'cinekind.html'), 'utf8');
const css = (page.match(/<style[^>]*>([\s\S]*?)<\/style>/g) || []).join('\n');
const doc = new JSDOM(page).window.document;

test('the 2026 roll has its own heading, after the reels and before the portraits', () => {
  const sec = doc.getElementById('honours-2026');
  const head = sec.querySelector('#roll-2026.roll__head');
  assert.ok(head, 'the roll is headed');
  assert.equal(head.querySelector('.eyebrow').textContent, 'Roll of honour');
  assert.equal(head.querySelector('h3.display').textContent.replace(/\u00a0/g, ' '), 'The eleven honours.');
  assert.equal(head.nextElementSibling.tagName, 'OL');
  assert.equal(head.nextElementSibling.className, 'roll');
  assert.equal(sec.querySelector('.roll').children.length, 11, 'eleven, as the heading says');
  assert.ok(head.previousElementSibling.classList.contains('ckreels'), 'after the reels');
  /* not a numbered section head: a direct .band__head child of the band would
     take the next number and renumber every section after it */
  assert.equal(head.classList.contains('band__head'), false);
  assert.equal(sec.querySelectorAll(':scope > .band__head').length, 1);
  assert.match(css, /\.honours \.roll__head\{[^}]*border-top:1px solid var\(--ink\)/);
  assert.match(css, /\.honours \.roll__head \.eyebrow\{color:var\(--ink\)\}/);
});

test('the section heads on this page are ink on paper, not the theme\'s white for dark bands', () => {
  assert.match(css, /\.band--deep\{background:var\(--stone\);color:var\(--ink\)\}/, 'the page\'s deep bands are paper');
  assert.match(css, /\.band\.band--deep > \.band__head\{border-top-color:var\(--ink\)\}/);
  assert.match(css, /\.band\.band--deep > \.band__head > \.eyebrow\{color:var\(--ink\)\}/);
  assert.match(css, /body:has\(\.band ~ \.band\) \.band\.band--deep > \.band__head > \.eyebrow::before\{color:var\(--muted\)\}/);
  /* each override outranks the theme's rule it answers (one more class) */
  const theme = fs.readFileSync(path.join(ROOT, 'assets', 'pfa-theme.css'), 'utf8');
  assert.match(theme, /\.band--deep > \.band__head > \.eyebrow\{color:#fff\}/);
  assert.ok(doc.querySelectorAll('.band.band--deep > .band__head > .eyebrow').length >= 8, 'every section head on the page is covered');
});
