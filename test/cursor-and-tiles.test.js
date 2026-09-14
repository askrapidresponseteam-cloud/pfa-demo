'use strict';

/* The shared stylesheet contains `body,body *{cursor:none!important}`. Any page
   that takes the stylesheet and not the layer that draws the replacement has no
   pointer at all — which is what happened to quiz.html. This checks every page
   in the tree, so it cannot happen to the next one either. */

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const ROOT = path.join(__dirname, '..');
const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));

test('sanity: there are pages to check', () => {
  assert.ok(pages.length >= 8, `found ${pages.length}`);
});

/* Three pages draw the pointer three different ways — the shop's cursor-layer
   with cursorSvg, index.html with pfaCursorSvg, submission-collage.html with
   curSvg. What matters is not which one, only that a page hiding the native
   pointer draws something and moves it. */
function cursorState(html) {
  const hidesPointer = /cursor:\s*none\s*!important/.test(html);
  const hasCursor = /[Cc]ur(sor)?(Svg|Path)|cursor-layer|function cursor\(\)/.test(html);
  const movesIt = /pointermove|mousemove/.test(html);
  return { hidesPointer, ok: hasCursor && movesIt, hasCursor, movesIt };
}

test('the detector itself works', () => {
  /* Guards the guard: the first version looked only for the shop's markup and
     called two perfectly good pages broken. */
  assert.equal(cursorState('<style>body,body *{cursor:none!important}</style>').ok, false,
    'a page with nothing but the hiding rule must be reported');
  assert.equal(cursorState('body,body *{cursor:none!important}<svg id="curSvg"></svg>addEventListener("pointermove")').ok,
    true, 'the abbreviated naming in submission-collage.html must count');
  assert.equal(cursorState('body,body *{cursor:none!important}<svg id="pfaCursorSvg"></svg>onpointermove').ok,
    true, 'and the naming in index.html');
  assert.equal(cursorState('<div class="cursor-layer"></div>pointermove').hidesPointer, false,
    'a page that never hides the pointer is not a problem');
});

test('no page hides the native cursor without drawing a replacement', () => {
  const broken = [];
  for (const page of pages) {
    const state = cursorState(fs.readFileSync(path.join(ROOT, page), 'utf8'));
    if (!state.hidesPointer || state.ok) continue;
    const missing = [];
    if (!state.hasCursor) missing.push('a cursor to draw');
    if (!state.movesIt) missing.push('anything to move it');
    broken.push(`${page} (no ${missing.join(', ')})`);
  }
  assert.deepEqual(broken, [], `these pages would leave a visitor with no pointer: ${broken.join('; ')}`);
});

test('the cursor is drawn once, by the shared chrome, on every page that hides the pointer', () => {
  /* Fourteen copies of the cursor, each with its own list of "dark"
     selectors, is how the Wall got an ink chevron smeared over its black
     video frames. One copy followed. What that copy should do took three
     goes: a sampler that read only on mouseover (stale under a still hand -
     black on black, 31 Aug 2026 afternoon), then a difference blend (glyphs
     inverted through the chevron and it read as underneath the text, that
     evening), then a fixed pair that never switched at all. The pair now
     switches, from a reading taken on a heartbeat rather than on hover.
     Read, don't guess; paint, don't blend; and read again, because the
     surface moves even when the pointer does not.

     What the colour actually comes out as is not pinned here - grepping for
     the word "luminance" proves nothing about a chevron. test/cursor-
     contrast.test.js boots this file over a page and asks it. */
  const css = fs.readFileSync(path.join(ROOT, 'assets', 'chrome.css'), 'utf8');
  const js = fs.readFileSync(path.join(ROOT, 'assets', 'chrome.js'), 'utf8');
  assert.equal(cursorState(css).hidesPointer, true, 'chrome.css hides the native pointer');
  assert.equal(cursorState(js).ok, true, 'chrome.js draws and moves the replacement');
  assert.match(js, /cursorCase[\s\S]{0,120}stroke-width="6\.4"/, 'the casing is wider than the ink');
  assert.match(js, /cursorPath[\s\S]{0,120}stroke-width="3\.4"/, 'the ink rides on top');
  assert.match(js, /casePath\.setAttribute\('d', d\)/, 'both follow the same jitter');
  /* Both strokes come from a custom property whose default is the
     light-surface pair. A page that loads the stylesheet and never manages
     to take a reading keeps a legible chevron, not half a switched one. */
  assert.match(css, /#cursorCase\{stroke:var\(--cursor-case,#f2f0ec\)\}/, 'bone casing by default');
  assert.match(css, /#cursorPath\{stroke:var\(--cursor-ink,var\(--ink,#111\)\)\}/, 'ink stroke by default');
  assert.match(js, /setProperty\('--cursor-ink'/, 'and the script is what swaps them');
  assert.ok(!/mix-blend-mode/.test(css), 'no blend: nothing to x-ray text, no stacking context to trip on');
  /* The heartbeat is the whole difference between this sampler and the one
     that failed. Without it a surface that changes under a still pointer -
     a button inverting on hover, a drawer opening, a film playing - is not
     noticed until the hand moves again. */
  assert.match(js, /setInterval\(function \(\) \{ if \(vis && !document\.hidden && !standDown\(\)\) recolour\(\); \}, (\d+)\)/,
    'the surface is re-read on a heartbeat, not only on hover - and the same beat stands the chevron down under a modal');
  const beat = Number(/if \(vis && !document\.hidden && !standDown\(\)\) recolour\(\); \}, (\d+)\)/.exec(js)[1]);
  assert.ok(beat > 0 && beat <= 120, `a stale reading must not outlive a glance: ${beat}ms`);
  assert.match(js, /elementsFromPoint/, 'the reading is of what is painted, not of a list of selectors');
  assert.match(js, /pointerEvents !== 'none'/, 'including the scrims hit testing cannot see');
  for (const page of pages) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const usesChrome = /assets\/chrome\.css/.test(html);
    if (usesChrome) {
      assert.match(html, /<script src="\/?assets\/chrome\.js"><\/script>/, `${page} takes the stylesheet, so it must take the script`);
      assert.ok(!/function cursor\(\)|id="cursorSvg"|id="pfaCursorSvg"/.test(html), `${page} still carries its own cursor`);
    }
  }
});

/* ---- the option tiles ---- */

test('a quiz option tile is square regardless of the photograph in it', () => {
  const html = fs.readFileSync(path.join(ROOT, 'quiz.html'), 'utf8');
  const rule = html.match(/\.qz__shot\{([^}]*)\}/);
  assert.ok(rule, '.qz__shot must exist');
  assert.match(rule[1], /aspect-ratio:1/);
  /* Without this, a flex item's min-height:auto lets the image's intrinsic
     height win and the row of options comes out ragged. */
  assert.match(rule[1], /min-height:0/, 'min-height:auto would let the image override the ratio');
  assert.match(rule[1], /position:relative/);

  const img = html.match(/\.qz__shot img\{([^}]*)\}/);
  assert.ok(img, '.qz__shot img must exist');
  assert.match(img[1], /position:absolute/, 'out of flow, so it cannot resize its tile');
  assert.match(img[1], /object-fit:contain/, 'and the face is never cropped');
});

test('options in a row are the same height with their labels in line', () => {
  const html = fs.readFileSync(path.join(ROOT, 'quiz.html'), 'utf8');
  assert.match(html, /\.qz__options>li\{display:flex\}/, 'the li must stretch');
  assert.match(html, /\.qz__opt\{[^}]*flex:1/, 'and the button must fill it');
  assert.match(html, /\.qz__name\{[^}]*margin-top:auto/, 'the label sits at the bottom');
});
