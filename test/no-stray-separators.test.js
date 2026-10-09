'use strict';

/* No line starts with a dot, and wrapped items start on one edge (owner,
   9 Oct 2026, the footer's two numbers with the second a space in: "phone
   numbers are not perfectly aligned 1 below the other. do a site wide scan
   and ensure no such lapses exist").

   The cause, everywhere it was found: items joined by text (" · ") that
   wrap where the column is narrow, leaving the dot at the end of one line or
   the start of the next. A browser scan of every page at 24 widths from 1920
   to 320 (units unfolded, every question opened) found it in the footer, the
   centre's numbers, the library's facts, the shop's tiles, a unit's numbers,
   two captions and the campaign card, and finds none now. These hold the
   cure: such runs are items in .dots, which draws the dot between them and
   never at a line's start or end, and pages that write one in script use
   PFADots. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const PAGES = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html') && !['admin.html', 'submission-collage.html'].includes(f));
const SEP = /^\s*(·|•|\|)\s*$/;

test('no page joins items with a dot written as text between them', () => {
  const found = [];
  for (const file of PAGES) {
    const doc = new JSDOM(read(file)).window.document;
    doc.querySelectorAll('script, style, template, noscript').forEach((n) => n.remove());
    const walker = doc.createTreeWalker(doc.body, 4);
    let t;
    while ((t = walker.nextNode())) {
      if (!SEP.test(t.nodeValue)) continue;
      const host = t.parentElement;
      /* the footer's spare separator is display:none (for an old stylesheet) */
      if (host && host.classList.contains('pfa-footer__dot')) continue;
      const prev = t.previousSibling;
      const next = t.nextSibling;
      if ((prev && prev.nodeType === 1) || (next && next.nodeType === 1)) {
        found.push(`${file}: "${(host.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 70)}"`);
      }
    }
    /* a span that is only a dot, as the library's facts were written */
    doc.querySelectorAll('span').forEach((s) => {
      if (!s.classList.contains('pfa-footer__dot') && SEP.test(s.textContent) && !s.children.length) found.push(`${file}: a span holding only "${s.textContent.trim()}"`);
    });
  }
  assert.deepEqual(found, [], 'write the run as items in .dots');
});

test('the dots are drawn between items and clipped at the start of every line', () => {
  const css = read('assets/chrome.css');
  const rule = (sel) => (css.match(new RegExp(`(?:^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{([^}]*)\\}`)) || [])[1] || '';
  assert.match(rule('.dots'), /display:flex;flex-wrap:wrap;/);
  assert.match(rule('.dots'), /clip-path:inset\(-\.5em -\.5em -\.5em 0\)/, 'nothing left of the run\'s own edge is drawn');
  assert.match(rule('.dots>*::before'), /right:100%;width:var\(--dots-gap\)/, 'the dot sits in the gap before its item');
  assert.match(rule('.dots>*::before'), /content:"\\00b7" \/ ""/, 'drawn, not read aloud');
  const js = read('assets/chrome.js');
  assert.match(js, /window\.PFADots = function \(el, items\)/);
});

test('every run that wrapped is now a dotted run', () => {
  const has = (file, sel) => new JSDOM(read(file)).window.document.querySelector(sel);
  assert.ok(has('sgacc.html', 'dl.visit dd.dots a[href^="tel:"] + a[href^="tel:"]'), 'the centre\'s numbers');
  assert.ok(has('library.html', 'p.book__facts.dots > span'), 'the library\'s facts');
  assert.ok(has('shop.html', 'p.item__meta.dots > span + span'), 'the shop\'s tiles');
  assert.ok(has('cinekind.html', 'p.shot__note.dots > span + span'));
  assert.ok(has('newsroom.html', '#case-001 figcaption.dots > span + span'));
  assert.ok(has('campaign.html', '#campBy.dots > span + span'));
  assert.match(read('units.html'), /'<span class="u-unit__tel dots">' \+ k\.t\.map\([\s\S]*?\}\)\.join\(''\)/, 'a unit\'s numbers');
  assert.match(read('scripts/build-library.js'), /<p class="book__facts dots">/);
  assert.match(read('assets/shop.js'), /el\('p', 'line__meta dots'\)/);
  for (const [file, el] of [['ask.html', 'fSay'], ['careers.html', 'fSay'], ['report.html', 'fSay'], ['track.html', "$('#tNext')"]]) {
    assert.ok(read(file).includes(`window.PFADots(${el}, `), `${file}: the follow-up line`);
  }
});

test('the footer\'s two numbers stand one under the other, on one edge', () => {
  const css = read('assets/chrome.css');
  assert.match(css, /\.pfa-footer__tel a\{display:block;width:fit-content\}/);
  assert.match(css, /\.pfa-footer__dot\{display:none\}/);
  assert.doesNotMatch(css, /\.pfa-footer__tel a\{display:inline-block\}/, 'side by side, they wrapped with the second a space in');
});
