'use strict';

/* The picture under the word on donate.html.

   The panel was a heading, a screen of nothing, and one sentence pinned to
   the floor. The ring goes in the nothing. What these check is the part of
   that which is easy to undo by accident: the order of the three children,
   the description, and the height cap that keeps the sentence on screen. */

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..');
const ART = path.join(ROOT, 'img', 'donate-lifering.webp');
const html = fs.readFileSync(path.join(ROOT, 'donate.html'), 'utf8');

test('the panel shows the picture between the word and the sentence about the gift', () => {
  /* Order is the whole mechanism. .give__side is a flex column set to
     space-between, so the figure being the middle of three children is what
     puts it under the heading and leaves the impact line on the floor of the
     panel. Move it and the layout is not wrong, it is just somewhere else. */
  const side = /<div class="give__side">([\s\S]*?)<div class="give__form">/.exec(html);
  assert.ok(side, 'the donate panel is where it was');
  const order = [...side[1].matchAll(/id="sideHead"|class="ring"|id="sideGive"/g)].map((m) => m[0]);
  assert.deepEqual(order, ['id="sideHead"', 'class="ring"', 'id="sideGive"'],
    'heading, then picture, then what the gift buys');
});

test('the picture is described, and reserves its space before it arrives', () => {
  const tag = /<figure class="ring">\s*<img[^>]*>/.exec(html);
  assert.ok(tag, 'the figure carries an image');
  assert.match(tag[0], /src="img\/donate-lifering\.webp"/);
  assert.match(tag[0], /width="\d+" height="\d+"/, 'the ratio is known before the file loads');
  assert.match(tag[0], /alt="[^"]{20,}"/, 'a real description, not alt=""');
});

test('the height is capped, because the panel it sits in is the viewport tall', () => {
  /* .give__side is sticky and full height on a desktop, with overflow-y:auto.
     An uncapped picture makes that panel scroll, which takes the impact line
     off the screen: the one sentence the panel exists to carry. */
  assert.match(html, /\.ring img\{[^}]*max-height:42vh/);
  assert.match(html, /\.ring img\{[^}]*object-fit:contain/, 'capped by height without being squeezed');
});

test('the file is really there and is not a placeholder-sized stub', () => {
  assert.ok(fs.existsSync(ART), 'img/donate-lifering.webp is missing');
  const bytes = fs.readFileSync(ART);
  assert.equal(bytes.slice(0, 4).toString('ascii'), 'RIFF', 'a real webp');
  assert.equal(bytes.slice(8, 12).toString('ascii'), 'WEBP');
  assert.ok(bytes.length > 20 * 1024, 'too small to be the photograph');
  /* The panel never draws it wider than 420 CSS pixels. Past a few hundred
     kilobytes somebody has put the camera original back. */
  assert.ok(bytes.length < 400 * 1024, `${Math.round(bytes.length / 1024)}KB is more than this panel can spend`);
});

/* One picture for every donor (owner, 6 Oct 2026): a red and white life ring
   with a heart and a paw, in place of the ring made of a rupee note that
   swapped for a dollar note. No currency in the picture, so nothing swaps. */

/* Canvas size out of the RIFF header: VP8X (alpha), then plain lossless and
   lossy, so a re-export in another mode still reads. */
function webpSize(bytes) {
  const kind = bytes.slice(12, 16).toString('ascii');
  if (kind === 'VP8X') return [1 + bytes.readUIntLE(24, 3), 1 + bytes.readUIntLE(27, 3)];
  if (kind === 'VP8L') { const b = bytes.readUInt32LE(21); return [1 + (b & 0x3fff), 1 + ((b >>> 14) & 0x3fff)]; }
  if (kind === 'VP8 ') return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff];
  return null;
}

test('the box the page reserves is the size of the file', () => {
  const tag = /<figure class="ring">\s*<img[^>]*>/.exec(html)[0];
  const box = /width="(\d+)" height="(\d+)"/.exec(tag).slice(1).map(Number);
  assert.deepEqual(webpSize(fs.readFileSync(ART)), box);
});

test('the money rings are gone, from the page and from the folder', () => {
  assert.ok(!html.includes('donate-lifebuoy'), 'no rupee or dollar ring named anywhere in the page');
  assert.ok(!/showRing|stageRing/.test(html), 'no currency swap left in the script');
  assert.ok(!fs.existsSync(path.join(ROOT, 'img', 'donate-lifebuoy.webp')));
  assert.ok(!fs.existsSync(path.join(ROOT, 'img', 'donate-lifebuoy-usd.webp')));
});

test('choosing dollars and back keeps the same ring', async () => {
  const { JSDOM, VirtualConsole } = require('jsdom');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', virtualConsole: new VirtualConsole(), url: 'https://pfa.test/donate.html',
    beforeParse(w) {
      w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      w.scrollTo = () => {};
      w.fetch = () => new Promise(() => {});
    }
  });
  const doc = dom.window.document;
  const img = doc.querySelector('.ring img');
  const settle = () => new Promise((r) => setTimeout(r, 0));
  try {
    doc.querySelector('[data-gcur="USD"]').click();
    await settle();
    assert.equal(img.getAttribute('src'), 'img/donate-lifering.webp');
    doc.querySelector('[data-gcur="INR"]').click();
    await settle();
    assert.equal(img.getAttribute('src'), 'img/donate-lifering.webp');
    assert.match(img.getAttribute('alt'), /life ring with a red heart and a paw print/);
  } finally {
    dom.window.close();
  }
});
