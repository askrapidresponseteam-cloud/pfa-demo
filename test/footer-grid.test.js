'use strict';

/* The footer, set on one grid (owner, 8 Oct 2026: "this can be better.
   alignment and look wise.. right now doesnt look that great").

   It had been the name and the office on the left and the four link groups
   packed to the right at their own widths: every gap between the groups was
   different, Get Involved's second column (CSS columns) stood with no label
   over it, and nothing on one side lined up with anything on the other.

   Now the name and the social links share a bar; under it the office and the
   four groups are columns of one width with one gap, each opened by the same
   label on the same hairline, Get Involved across two columns under one
   label; the legal line under all of it. These hold the structure; the
   widths were measured in a browser at 18 widths from 1920 to 320 (every
   label on one line, equal gaps, no sideways scroll, no link wrapped above
   375 wide). */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const FOOTER = fs.readFileSync(path.join(ROOT, 'assets', 'chrome-footer.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'assets', 'chrome.css'), 'utf8');
const doc = new JSDOM(FOOTER).window.document;
const rule = (sel) => {
  const m = CSS.match(new RegExp(`(?:^|\\n|\\})\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{([^}]*)\\}`));
  return m ? m[1] : '';
};

test('the bar carries the name with the mark, and the social links', () => {
  const bar = doc.querySelector('.pfa-footer > .pfa-footer__bar');
  assert.ok(bar, 'the bar opens the footer');
  assert.ok(bar.querySelector('.pfa-footer__mark img.pfa-footer__bird[src="img/mail/logo-mark.png"][alt=""]'), 'the mark beside the name');
  assert.equal(bar.querySelector('.pfa-footer__mark').textContent.trim(), 'People for Animals');
  assert.deepEqual([...bar.querySelectorAll('.pfa-footer__social a')].map((a) => a.textContent), ['Instagram', 'Facebook', 'X']);
  assert.equal(doc.querySelectorAll('.pfa-footer__social').length, 1, 'once, not again in the legal line');
});

test('the office and the four groups are one grid, in the header\'s order, each opened by a label', () => {
  const cells = [...doc.querySelectorAll('.pfa-footer__grid > *')];
  assert.deepEqual(cells.map((c) => c.querySelector('.pfa-footer__label').textContent), ['Registered office', 'Our Work', 'Learn', 'Get Involved', 'About']);
  for (const c of cells) assert.equal(c.firstElementChild.className, 'pfa-footer__label', 'the label comes first, so every column starts on the same line');
  /* the office is not a link group: the visibility rules hide a .pfa-footer__col left with no link */
  assert.equal(cells[0].className, 'pfa-footer__office');
  assert.ok(cells[0].querySelector('address#contact.pfa-footer__where'));
  assert.ok(cells[0].querySelector('#pfaTally[hidden] #pfaTallyOdo[aria-label="Visit counter"]'));
  /* Get Involved: two lists under one label, giving and then joining in */
  const gi = doc.querySelector('.pfa-footer__col--wide');
  assert.deepEqual([...gi.querySelectorAll('ul')].map((u) => [...u.querySelectorAll('a')].map((a) => a.textContent)), [
    ['Donate', 'Make a gift', 'Volunteer', 'Become a member', 'Colony caregiver card'],
    ['The Wall', 'Events', 'CineKind', 'Shop']
  ]);
  assert.deepEqual([...doc.querySelectorAll('.pfa-footer__base p')].map((p) => p.textContent), ['People for Animals © 2026', 'Registered charity · All donations tax-deductible']);
});

test('one width for every column and one gap; Get Involved spans two on the same grid', () => {
  assert.match(rule('.pfa-footer__grid'), /grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
  assert.match(rule('.pfa-footer__grid'), /gap:30px var\(--ff-gap\)/);
  assert.match(rule('.pfa-footer__col--wide'), /grid-column:span 2;display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\);column-gap:var\(--ff-gap\)/);
  assert.match(rule('.pfa-footer__col--wide .pfa-footer__label'), /grid-column:1 \/ -1/);
  assert.match(rule('.pfa-footer__label'), /border-bottom:1px solid var\(--ff-line\)/);
  assert.match(rule('.pfa-footer__label'), /white-space:nowrap/);
  assert.doesNotMatch(CSS, /\.pfa-footer__col--wide ul\{columns:/, 'no CSS columns: they do not land on the grid');
  /* the office's lines sit on the links' lines */
  assert.match(rule('.pfa-footer ul'), /font-size:13px;line-height:1\.45/);
  assert.match(rule('.pfa-footer__where'), /font-style:normal;font-size:13px;line-height:1\.45/);
  assert.match(rule('.pfa-footer ul a'), /padding:4px 0/);
  assert.match(rule('.pfa-footer__where div'), /padding:4px 0/);
});

test('three columns below 1240, two on phones', () => {
  const at = (w) => (CSS.match(new RegExp(`@media \\(max-width:${w}px\\)\\{([\\s\\S]*?)\\n\\}`)) || [])[1] || '';
  assert.match(at(1239), /\.pfa-footer__grid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  const phone = at(719);
  assert.match(phone, /\.pfa-footer__grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(phone, /\.pfa-footer__office\{grid-column:1 \/ -1\}/);
  assert.match(phone, /\.pfa-footer__col--wide\{grid-column:1 \/ -1/);
  assert.match(phone, /\.pfa-footer ul a,\.pfa-footer__where div\{padding:5px 0\}/, 'finger-sized rows');
});

test('the counter is one framed instrument, and the script turns the wheels by the height the stylesheet gives them', () => {
  assert.match(rule('.pfa-tally__odo'), /border:1px solid rgba\(17,17,17,\.2\);border-radius:3px/);
  assert.doesNotMatch(rule('.pfa-tally__d'), /border:|background:/, 'no box per digit');
  const h = rule('.pfa-tally__d').match(/height:([\d.]+)em/)[1];
  assert.match(CSS, new RegExp(`\\.pfa-tally__strip span\\{[^}]*height:${h.replace('.', '\\.')}em`));
  const js = fs.readFileSync(path.join(ROOT, 'assets', 'chrome.js'), 'utf8');
  assert.match(js, new RegExp(`translateY\\(' \\+ \\(-d \\* ${h.replace('.', '\\.')}\\) \\+ 'em\\)'`));
});
