'use strict';

/* index.html anchors every slot crop on the upper third, because that is where
   a standing animal's head sits in a tall card. The full-bleed band is the
   opposite shape and its animals graze head-down, so it needs its own anchor.
   These tests exist so the override is not tidied back into the blanket rule. */

const fs = require('fs');
const test = require('node:test');
const assert = require('node:assert');

const html = fs.readFileSync(`${__dirname}/../index.html`, 'utf8');

/* Parses both components. The first version of this hard-coded "50% " in the
   pattern, so when a rule changed its X value the match failed, the helper
   returned null and every check on it was skipped in silence. */
function anchorFor(selector) {
  const rule = html.match(new RegExp(
    selector.replace(/[[\]"^=]/g, '\\$&') + '[^{]*\\{object-position:(\\d+)% (\\d+)%\\}'));
  if (!rule) return null;
  return { x: Number(rule[1]), y: Number(rule[2]) };
}

/* Anything the tests below name must resolve, or they are not testing it. */
function anchorOrFail(selector) {
  const anchor = anchorFor(selector);
  assert.ok(anchor, `no object-position rule matched for ${selector}`);
  return anchor;
}

test('the full-bleed band anchors its crop low, not on the upper third', () => {
  const band = anchorOrFail('[data-slot="fullbleed"] .pfa-slot-frame img');
  const blanket = anchorOrFail('.pfa-slot-frame img');
  assert.ok(band.y > blanket.y,
    `the band anchors at ${band.y}%, the blanket rule at ${blanket.y}%: it must be lower`);
  assert.ok(band.y >= 60, 'a grazing head sits around 70-85% down the frame');
});

test('the horse card anchors low too: its head hangs down', () => {
  /* story-3 was at 25%, above the blanket rule, which held the ears in frame
     and pushed the muzzle out of the bottom. */
  const horse = anchorOrFail('[data-slot="story-3"] .pfa-slot-frame img');
  const blanket = anchorOrFail('.pfa-slot-frame img');
  assert.ok(horse.y > blanket.y, `story-3 anchors at ${horse.y}%, which must be below ${blanket.y}%`);
});

test('cards and tiles keep the upper anchor, where a standing head sits', () => {
  for (const slot of ['card-u1', 'quiz-tile-1', 'card-d1']) {
    const anchor = anchorFor(`[data-slot="${slot}"] .pfa-slot-frame img`);
    if (!anchor) continue;                       // no override is fine; it inherits
    assert.ok(anchor.y < 50, `${slot} anchors at ${anchor.y}%, which would cut a standing head`);
  }
});

test('the band is tall enough that most of the photo survives', () => {
  const frame = html.match(/height:72vh;min-height:(\d+)px"><div class="pfa-slot" data-slot="fullbleed"/);
  assert.ok(frame, 'the full-bleed frame must be found');
  const minHeight = Number(frame[1]);
  /* At 420px on a 1288px viewport only 51% of a 3:2 photo was visible, which
     is what forced the crop to choose between the sky and the animals. */
  const visible = 1.5 / (1288 / minHeight);
  assert.ok(visible > 0.55, `only ${(visible * 100).toFixed(0)}% of the photo would be visible`);
});

test('no layout word is read out as if it described the picture', () => {
  const labels = [...html.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1]);
  const leaked = labels.filter((l) => /^(full-bleed|hero|tile|card)\s*:/i.test(l));
  assert.deepEqual(leaked, [], `a screen reader would announce: ${leaked.join(' | ')}`);
});
