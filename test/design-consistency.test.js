'use strict';

/* One design, everywhere: close controls, form fields, section labels, and
   overlays that stay inside a phone's screen.

   Owner, 7 Oct 2026:
     "close button cannot be in small caps in 1 place and capitals in
      another. ensure design consistency of all the elements across the
      website pls"
     "currently the cinekind reels are not fully within the boundaries of
      the screen on mobile. can you optimise this across. wherever such
      scenarios exist"
     "how is cinekind reel playing automatically when clicked and founder
      insta reels asks for button to be pressed before playing"

   Measured in a browser that day: every page at 320, 360, 375, 390 and 412
   pixels wide fits its screen; every Close renders the same (11px bold
   capitals, a drawn cross, 44px tall). These tests hold the code that makes
   that so. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));

test('one Close control: the shared component is defined once for the site and once for the admin panel', () => {
  const chrome = read('assets/chrome.css');
  assert.match(chrome, /button\.pfa-close\.pfa-close\{[^}]*font-size:11px;font-weight:700;[^}]*letter-spacing:\.14em;text-transform:uppercase/);
  assert.match(chrome, /button\.pfa-close\.pfa-close::after\{content:""/, 'the cross is drawn, not a font glyph that differs by device');
  assert.match(read('admin.html'), /button\.pfa-close\.pfa-close\{/, 'the admin panel does not load the shared stylesheet, so it carries the same rule');
});

test('every panel, viewer and dialog closes with the same control, worded Close', () => {
  const places = [
    ['cinekind.html', /<button type="button" class="rbox__x pfa-close" id="rboxX">Close<\/button>/],
    ['cinekind.html', /<button type="button" class="nom__exit pfa-close" id="nomExit">Close<\/button>/],
    ['founder.html', /<button type="button" class="rbox__x pfa-close" id="rboxX">Close<\/button>/],
    ['academy.html', /<button type="button" class="deck__close pfa-close" id="deckClose">Close<\/button>/],
    ['admin.html', /<button class="x pfa-close" type="button" id="caseShut">Close<\/button>/],
    ['assets/theatre.js', /class="close pfa-close" id="thClose">Close<\/button>/],
    ['assets/theatre.js', /class="pfa-close" id="thHelpClose">Close<\/button>/],
    ['pfa-search.js', /class="pfa-search__close pfa-close"[^>]*>Close<\/button>/],
    ['assets/form-preview.js', /className: 'pfa-pv__x pfa-close', [^}]*text: 'Close'/]
  ];
  for (const [file, re] of places) assert.match(read(file), re, file);
  const shop = read('shop.html');
  assert.equal((shop.match(/class="x pfa-close"[^>]*>Close<\/button>/g) || []).length, 2, 'the product view and the bag');
  /* no closing control left as a bare cross or times sign */
  for (const page of pages) {
    const html = read(page).replace(/<!--[\s\S]*?-->/g, '');
    for (const m of html.matchAll(/<button\b[^>]*>(\s*(?:&times;|&#215;|&#x2715;|×|✕)\s*)<\/button>/g)) {
      assert.match(m[0], /id="annClose"/, `${page}: ${m[0].slice(0, 90)} should be the Close control`);
    }
  }
});

test('form fields and their labels look the same on every form', () => {
  const standard = '.field label{font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}';
  for (const page of pages) {
    const rules = read(page).match(/\.field label\{[^}]*\}/g) || [];
    if (page === 'admin.html') continue;
    for (const r of rules) assert.equal(r, standard, `${page}: ${r}`);
  }
  for (const page of ['ask.html', 'careers.html', 'report.html']) {
    assert.match(read(page), /\.field input,\.field textarea,\.field select\{border:1px solid var\(--line\);padding:14px;font-size:14px;/, page);
  }
  assert.match(read('events.html'), /\.field select\{[^}]*font-family:inherit;/, 'the Events dropdown was drawn in Arial');
});

test('section labels keep one size wherever they sit', () => {
  assert.match(read('assets/chrome.css'), /\.eyebrow\.eyebrow\.eyebrow\{font-size:11px;letter-spacing:\.14em;text-transform:uppercase\}/);
});

test('overlays stay clear of the notch, the home bar and the browser toolbar', () => {
  const safe = /padding:max\(clamp\(14px,3vw,40px\),env\(safe-area-inset-top,0px\)\) max\(clamp\(14px,3vw,40px\),env\(safe-area-inset-right,0px\)\) max\(clamp\(14px,3vw,40px\),env\(safe-area-inset-bottom,0px\)\) max\(clamp\(14px,3vw,40px\),env\(safe-area-inset-left,0px\)\)/;
  assert.match(read('cinekind.html'), safe, 'CineKind reel box');
  assert.match(read('founder.html'), safe, 'founder reel box');
  assert.match(read('cinekind.html'), /\.nom__panel\{[^}]*env\(safe-area-inset-top,0px\)/);
  assert.match(read('shop.html'), /\.look\{[^}]*env\(safe-area-inset-top,0px\)/);
  const preview = read('assets/form-preview.js');
  assert.equal((preview.match(/max-height:calc\(100dvh - 32px - env\(safe-area-inset-top,0px\) - env\(safe-area-inset-bottom,0px\)\)/g) || []).length, 2,
    'the check-before-sending dialog is sized to the visible screen, not 100vh, so its Send button is never under the toolbar');
});

test('nothing makes a page wider than a 320px phone (the two found on 7 Oct 2026)', () => {
  assert.doesNotMatch(read('cinekind.html'), /permission&nbsp;first/, 'the scene picker heading could not wrap');
  const donate = read('donate.html');
  assert.match(donate, /\.give\{grid-template-columns:minmax\(0,1fr\)\}/, 'plain 1fr will not shrink below its content');
  assert.match(donate, /\.amts\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\);/);
  assert.match(donate, /\.seg\{display:grid;grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\);/);
});

test('rows that scroll sideways show that there is more', () => {
  assert.match(read('assets/chrome.js'), /setAttribute\('data-more-right', ''\)/);
  assert.match(read('assets/chrome.css'), /\[data-more-right\]\{-webkit-mask-image:/);
});

test('a founder reel with a copy on the site plays on the first press, as the CineKind reels do', () => {
  const html = read('founder.html');
  assert.match(html, /if \(v\.file && \/\^media\\\/founder-reels\\\/\[\\w-\]\+\\\.mp4\$\/\.test\(v\.file\)\)/);
  assert.match(html, /vid\.autoplay = true;/);
  assert.match(html, /playing\.pause\(\); playing\.removeAttribute\('src'\);/, 'Close stops the sound');
  for (const m of html.matchAll(/file:'([^']+)'/g)) {
    assert.ok(fs.existsSync(path.join(ROOT, m[1])), `${m[1]} is named on the page but not on disk`);
  }
});
