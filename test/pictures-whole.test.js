'use strict';

/* A picture with words in it is never cut by its frame.

   Owner, 10 Oct 2026, of the PFA Campus poster ("Main focus", twelve parts)
   in a hero frame that filled itself by cutting the top and bottom away:
   "this looks clipped. can you check and ensure it isnt". A browser scan of
   every page, desktop and phone, measuring how much of each picture a frame
   cuts, found one more: the newsroom's protest panorama, whose wide frame
   lost to a later 3:2 rule and cut the banner's last word and the placards
   at both edges. Photographs framed on purpose (faces, T-shirts, film
   stills) keep their framing. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('the PFA Campus poster is shown whole, and described', () => {
  const html = read('campus.html');
  assert.match(html, /<figure class="m-ph m-ph--whole" data-ph><img src="media\/site\/campus\/campus\.jpg" alt="The main focus of a PFA Campus society, in twelve parts: [^"]{60,}"/);
  const css = read('assets/micro.css');
  assert.match(css, /\.m-ph\.m-ph--whole\{aspect-ratio:auto!important;/, 'its own shape, over any hero ratio');
  assert.match(css, /\.m-ph--whole img\{position:static;display:block;width:auto;height:auto;max-width:100%;max-height:/, 'drawn at its own proportions, never cut');
  assert.match(css, /\.m-ph\.m-ph--whole\.is-gone\{aspect-ratio:4\/3!important;/, 'a picture that did not arrive still leaves its plate');
});

test('no hero picture is cut by more than a quarter', () => {
  /* the old site's campaign graphics and anything added later: past a
     quarter cut away, the frame takes the picture's own shape */
  const js = read('assets/micro.js');
  assert.match(js, /if \(Math\.min\(rn \/ rb, rb \/ rn\) < 0\.75\) fig\.classList\.add\('m-ph--whole'\);/);
  assert.match(js, /\$\$\('\.m-hero__media \.m-ph:not\(\.m-ph--whole\)'\)\.forEach\(keepWhole\);/);
  for (const f of ['campus.html', 'campaign.html', 'csr.html', 'legacy.html', 'sgacc.html', 'careers.html']) {
    assert.match(read(f), /<script src="assets\/micro\.js/, `${f} carries the rule`);
  }
});

test('the newsroom panorama is the shape of the picture, at every width', () => {
  const html = read('newsroom.html');
  const wide = /\.leg__figs \.frame\.frame--wide\{([^}]*)\}/.exec(html);
  assert.ok(wide, 'the wide frame outranks the 3:2 rule');
  assert.match(wide[1], /aspect-ratio:1800\/679/);
  assert.ok(html.indexOf('.leg__figs .frame{aspect-ratio:3/2}') < html.indexOf('.leg__figs .frame.frame--wide{'));
  assert.doesNotMatch(html, /\.leg__figs \.frame--wide\{aspect-ratio:2\/1\}/, 'no phone ratio cutting it again');
});
