'use strict';

/* Where the presenter credit can actually go.

   It was moved into the announcement bar (owner, 15 Sep 2026) with the note
   that the bar is "above the trophy by definition". That was true, and the
   cost was 115px of black across the top of the page, so v1.341 put the
   credit back over the picture in the sky above the reel. The sky turned out
   not to be a place. It is a function of the window:

     the reel starts at 16.9% of the picture's height, and the picture is
     object-fit:cover, so on 1440x900 there are 28px of sky under the header,
     on 1190x616 there are none - the reel's top is behind the navigation -
     and on 1024x640 the whole top of the trophy is.

   Above the word there is between 275 and 476px of clear frame at every
   shape measured, all of it plinth, rock and blurred ground. Measured with
   the credit there: 28px of clearance from the gold at 1190x616, 61 at
   1512x760, 62 at 1024x640, 87 at 1680x850, 133 at 1440x900, 169 at 420x860.

   So: the credit belongs in the title group, and that is what this holds.

   v1.357 changed the photograph: the trophy with its name on the plinth,
   standing from 12% to 64% of the picture where the old one stood from 17% to
   54%. Those numbers above are the old photograph's. At its 46% frame the new
   one put the credit across the plinth's gold on every common laptop window,
   58px deep at 1366x657, and no frame alone could fix it. The two tests at the
   end hold what does. */

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const html = fs.readFileSync(path.join(__dirname, '..', 'cinekind.html'), 'utf8');

test('the credit reads above the word, inside the title group', () => {
  const foot = /<div class="marquee__foot">([\s\S]*?)<\/div>/.exec(html);
  assert.ok(foot, 'the title group is still where the page keeps it');
  const order = [...foot[1].matchAll(/marquee__eyebrow|marquee__word|marquee__door/g)].map((m) => m[0]);
  assert.deepEqual(order, ['marquee__eyebrow', 'marquee__word', 'marquee__door'],
    'credit, then the word, then the door');
});

test('nothing is parked in the sky, because on a short window there is none', () => {
  /* The failure mode is putting the credit back as a direct child of the
     overlay with space-between, which reads fine on a tall window and lays
     the line across the reel on a short one. */
  const inner = /<div class="marquee__in">([\s\S]*?)<div class="marquee__foot">/.exec(html);
  assert.ok(inner, 'the overlay still opens straight into the title group');
  assert.equal(inner[1].trim(), '', 'the overlay carries the title group and nothing above it');
  const rule = /\.marquee__in\{([^}]*)\}/.exec(html);
  assert.match(rule[1], /justify-content:flex-end/,
    'flex-end keeps the group on the floor of the frame; space-between puts a child back in the sky');
});

test('the overlay still reserves the fixed header', () => {
  /* page-shell.test.js allows a full-bleed hero to reserve on the layer that
     carries its copy rather than on the section. This is that layer. */
  const rule = /\.marquee__in\{([^}]*)\}/.exec(html);
  assert.match(rule[1], /padding:calc\(var\(--ann\) \+ var\(--nav\)/);
});

test('the credit keeps a shadow, because the ground behind it is a photograph', () => {
  const rule = /\.marquee__eyebrow\{([^}]*)\}/.exec(html);
  assert.match(rule[1], /text-shadow:/, 'a photograph has bright patches wherever it likes');
  assert.match(rule[1], /color:rgba\(255,255,255/, 'and the frame under it is dark');
});

/* A size that is not the photograph's own lays the marquee out at the wrong
   shape until the file arrives, which is the moment the leader burns off. */
function webpSize(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') throw new Error('not a WebP file');
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
  if (chunk === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  if (chunk === 'VP8L') { const b = buf.readUInt32LE(21); return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)]; }
  throw new Error(`unknown WebP chunk ${chunk}`);
}

test('the landing photograph\'s width and height on the page are the file\'s own', () => {
  const tag = /<img class="marquee__plate" src="([^"]+)"[^>]*width="(\d+)" height="(\d+)"/.exec(html);
  assert.ok(tag, 'the plate carries its size');
  const [w, h] = webpSize(fs.readFileSync(path.join(__dirname, '..', tag[1])));
  assert.deepEqual([Number(tag[2]), Number(tag[3])], [w, h], `${tag[1]} is ${w}x${h}`);
});

test('where the whole trophy has no room, the word stands down and the photograph drops, at the top level of the sheet', () => {
  /* Measured in Chromium at 34 window shapes (16 Sep 2026): with the frame at
     55% and this rule, the credit clears the plinth's gold and the reel clears
     the announcement bar at every one. The first draft of the rule sat inside
     the page's max-width:640px block, where it could never apply. */
  const at = html.indexOf('@media (min-aspect-ratio:9/5),(max-width:1280px) and (min-aspect-ratio:13/8){');
  assert.ok(at > -1, 'the wide-window rule is on the page');
  const sheet = html.slice(html.lastIndexOf('<style>', at), at).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal((sheet.match(/\{/g) || []).length - (sheet.match(/\}/g) || []).length, 0,
    'nested inside another @media it applies nowhere');
  const rule = html.slice(at, html.indexOf('}}', at) + 2);
  assert.match(rule, /\.marquee__word\{display:none\}/);
  assert.match(rule, /\.marquee__plate\{object-position:50% 28%\}/);
  assert.match(html, /\.marquee__plate\{[^}]*object-position:50% 55%\}/, 'and the frame everywhere else');
});
