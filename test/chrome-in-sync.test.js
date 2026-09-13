'use strict';

/* The header, announcement bar and cursor are one thing, stamped into every
   page from assets/chrome-header.html by scripts/sync-chrome.js. This fails
   the moment a page's copy drifts from the source. Fix: npm run sync:chrome. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { run, PAGES } = require('../scripts/sync-chrome.js');

const ROOT = path.join(__dirname, '..');

test('every page carries the chrome exactly as the source renders it', () => {
  const stale = run({ check: true });
  assert.deepEqual(stale, [], `out of date: ${stale.join(', ')} - run npm run sync:chrome`);
});

test('every page in the tree is known to the chrome table', () => {
  const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html') && f !== 'submission-collage.html' && f !== 'admin.html');
  const unknown = pages.filter((p) => !PAGES[p]);
  assert.deepEqual(unknown, [], `add these to PAGES in scripts/sync-chrome.js: ${unknown.join(', ')}`);
});

test('no page carries its own copy of what the chrome provides', () => {
  const pages = Object.keys(PAGES).filter((p) => fs.existsSync(path.join(ROOT, p)));
  const problems = [];
  for (const page of pages) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    if (/data:image\/png;base64,/.test(html)) problems.push(`${page}: inlined logo`);
    if (/\.pfa-footer\{/.test(html)) problems.push(`${page}: footer CSS`);
    if (/header\.site\{position:fixed/.test(html)) problems.push(`${page}: header CSS`);
    if (/cursor:none!important/.test(html)) problems.push(`${page}: cursor hiding`);
    if (/fonts\.googleapis\.com/.test(html)) problems.push(`${page}: Google Fonts (Marcellus is self-hosted)`);
    if ((html.match(/setProperty\(['"]--nav['"]/g) || []).length) problems.push(`${page}: its own header measure`);
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('the registered office and how to reach it are in the footer of every page, from the one source', () => {
  /* Contact details that live on one page go stale on the other eighteen. All
     of it is in assets/chrome-footer.html and nowhere else, so a correction is
     one edit and a sync rather than a search across the tree. */
  const DETAILS = [
    '4-T, DCM Building, 16 Barakhamba Road, New Delhi 110001, India',
    '+91 11 2081 8191',
    '+91 11 2081 8194',
    'gandhim@exmpls.sansad.in'
  ];
  /* The numbers are written with non-breaking spaces so they cannot be split
     across two lines, so compare with whitespace normalised rather than
     writing &nbsp; into the expectations and making them unreadable. */
  const flat = (s) => s.replace(/&nbsp;|\u00a0/g, ' ');
  const footer = flat(fs.readFileSync(path.join(ROOT, 'assets', 'chrome-footer.html'), 'utf8'));
  DETAILS.forEach((d) => assert.ok(footer.includes(d), `the footer source is missing: ${d}`));

  /* A number that is only text cannot be dialled from a phone, and an address
     that is only text cannot be written to without copying it out by hand. */
  assert.match(footer, /href="tel:\+911120818191"/);
  assert.match(footer, /href="tel:\+911120818194"/);
  assert.match(footer, /href="mailto:gandhim@exmpls\.sansad\.in"/);

  /* Block-level, so the three lines stack under any stylesheet. assets/ is
     cached for an hour and the HTML is not, so for up to an hour after a
     deploy this markup is read by the previous chrome.css. Written as inline
     spans, the address, the numbers and the mailbox ran into one paragraph. */
  assert.ok(/<address class="pfa-footer__where">\s*<div>/.test(footer),
    'the contact lines must be block-level in the markup, not styled into place');

  const pages = Object.keys(PAGES).filter((p) => fs.existsSync(path.join(ROOT, p)));
  DETAILS.forEach((d) => {
    const without = pages.filter((p) => !flat(fs.readFileSync(path.join(ROOT, p), 'utf8')).includes(d));
    assert.deepEqual(without, [], `"${d}" missing from: ${without.join(', ')} - run npm run sync:chrome`);
  });

  /* <address> is italic by default and the rest of the footer is not, so the
     override has to exist or the block arrives looking like a quotation. */
  const css = fs.readFileSync(path.join(ROOT, 'assets', 'chrome.css'), 'utf8');
  assert.match(css, /\.pfa-footer__where\{[^}]*font-style:normal/);
});

test('the contact details are written once, not copied into a page that will drift', () => {
  /* Anything that hardcodes them outside the footer source is a second copy to
     keep in step. The stamped pages are the footer, so they are exempt. */
  const stray = fs.readdirSync(ROOT)
    .filter((f) => f.endsWith('.html') && !PAGES[f])
    .filter((f) => /Barakhamba|2081[\s\u00a0]|gandhim@/i.test(fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/&nbsp;/g, ' ')));
  assert.deepEqual(stray, [], `these carry their own copy of the contact details: ${stray.join(', ')}`);
});

test('the logo is animated by the stylesheet, not by changing the artwork', () => {
  /* The mark alights as the page paints: it drops the last few pixels into
     place, once, and leaves nothing running. The file is untouched; this moves
     the <img> around it. */
  const css = fs.readFileSync(path.join(ROOT, 'assets', 'chrome.css'), 'utf8');
  const footer = fs.readFileSync(path.join(ROOT, 'assets', 'chrome-header.html'), 'utf8');

  /* The artwork is used exactly as it was: same file, same intrinsic size. If
     the animation ever needed the image altered to work, it would be the wrong
     animation. */
  assert.match(footer, /<img src="img\/logo\.png" alt="People for Animals" width="231" height="79">/);

  const rule = /\.wordmark img\{[^}]*\}/.exec(css);
  assert.ok(rule, 'the logo rule is gone');
  assert.match(rule[0], /animation:pfa-alight/);
  assert.doesNotMatch(rule[0], /infinite/, 'the mark arrives once; it does not fidget');

  /* The fill mode is the whole trick and the easiest thing to get wrong.
     `backwards` holds the opening frame before the animation starts, so there
     is no flash of the settled mark. `both` or `forwards` would also persist
     the closing frame, and a persisted animated transform outranks a plain
     declaration, so the hover lift below would silently stop working. */
  assert.match(rule[0], /pfa-alight[^;}]*\bbackwards\b/, 'fill mode must be backwards');
  assert.doesNotMatch(rule[0], /pfa-alight[^;}]*\b(both|forwards)\b/,
    'a persisted end state would outrank the hover transform');

  const frames = /@keyframes pfa-alight\{([\s\S]*?)\n\}/.exec(css);
  assert.ok(frames, 'the keyframes are gone');
  assert.match(frames[1], /from\{opacity:0;transform:translateY\(-\d+px\)\}/, 'it comes down into place');
  assert.match(frames[1], /to\{opacity:1;transform:translateY\(0\)\}/);

  /* It is a link home, so it answers a pointer, and both of those stop for
     anyone who asked for less movement. */
  assert.match(css, /\.wordmark:hover img,\s*\n\s*\.wordmark:focus-visible img\{transform:translateY\(-2px\)\}/);
  const still = css.slice(css.indexOf('@media (prefers-reduced-motion:reduce){', css.indexOf('pfa-alight')));
  assert.match(still, /\.wordmark img\{animation:none;transition:none\}/);
  assert.match(still, /\.wordmark:hover img[\s\S]{0,60}transform:none/);

  /* And the anchor carries no transform of its own, so it can never fight
     the image's animation. Until Sep 2026 that was guaranteed by pinning the
     absolute centring (translate(-50%,-50%)); the theme pass replaced that
     placement with a three-track grid - the fix that stops a wide nav
     running under the mark - which guarantees the same property more
     simply: no transform at all. */
  const anchor = /\.wordmark\{[^}]*\}/.exec(css);
  assert.ok(anchor, 'the wordmark rule is gone');
  assert.doesNotMatch(anchor[0], /transform:/, 'the anchor must never carry a transform of its own');
});
