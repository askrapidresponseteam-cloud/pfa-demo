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
const ART = path.join(ROOT, 'img', 'donate-lifebuoy.webp');
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
  assert.match(tag[0], /src="img\/donate-lifebuoy\.webp"/);
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
  assert.ok(fs.existsSync(ART), 'img/donate-lifebuoy.webp is missing');
  const bytes = fs.readFileSync(ART);
  assert.equal(bytes.slice(0, 4).toString('ascii'), 'RIFF', 'a real webp');
  assert.equal(bytes.slice(8, 12).toString('ascii'), 'WEBP');
  assert.ok(bytes.length > 20 * 1024, 'too small to be the photograph');
  /* The panel never draws it wider than 420 CSS pixels. Past a few hundred
     kilobytes somebody has put the camera original back. */
  assert.ok(bytes.length < 400 * 1024, `${Math.round(bytes.length / 1024)}KB is more than this panel can spend`);
});

/* The ring follows the currency (owner, 16 Sep 2026): a hundred dollar note
   with dollars on, at exactly the rupee ring's size. The two files share one
   frame, so the swap changes the picture and never the panel, and the dollar
   one is fetched on intent rather than with the page. */
const USD_ART = path.join(ROOT, 'img', 'donate-lifebuoy-usd.webp');

/* Canvas size out of the RIFF header: VP8X (alpha, as both of these are),
   then plain lossless and lossy, so a re-export in another mode still reads. */
function webpSize(bytes) {
  const kind = bytes.slice(12, 16).toString('ascii');
  if (kind === 'VP8X') return [1 + bytes.readUIntLE(24, 3), 1 + bytes.readUIntLE(27, 3)];
  if (kind === 'VP8L') { const b = bytes.readUInt32LE(21); return [1 + (b & 0x3fff), 1 + ((b >>> 14) & 0x3fff)]; }
  if (kind === 'VP8 ') return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff];
  return null;
}

test('the dollar ring is a real webp in the rupee ring\'s own frame', () => {
  assert.ok(fs.existsSync(USD_ART), 'img/donate-lifebuoy-usd.webp is missing');
  const usd = fs.readFileSync(USD_ART);
  const inr = fs.readFileSync(ART);
  assert.equal(usd.slice(0, 4).toString('ascii'), 'RIFF', 'a real webp');
  assert.equal(usd.slice(8, 12).toString('ascii'), 'WEBP');
  assert.ok(usd.length > 20 * 1024, 'too small to be the photograph');
  assert.ok(usd.length < 400 * 1024, `${Math.round(usd.length / 1024)}KB is more than this panel can spend`);
  assert.deepEqual(webpSize(usd), webpSize(inr), 'the same pixel size, so the swap cannot move the panel');
  const tag = /<figure class="ring">\s*<img[^>]*>/.exec(html)[0];
  const box = /width="(\d+)" height="(\d+)"/.exec(tag).slice(1).map(Number);
  assert.deepEqual(webpSize(inr), box, 'the box the page reserves is the size of both files');
});

test('a rupee donor never downloads the dollar ring', () => {
  const markup = html.replace(/<script[\s\S]*?<\/script>/g, '');
  assert.ok(!markup.includes('donate-lifebuoy-usd.webp'), 'named only in the script, which fetches it on intent');
});

test('choosing dollars shows the dollar ring, and rupees bring the rupee ring back', async () => {
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
  const box = [img.getAttribute('width'), img.getAttribute('height')];
  /* jsdom has no image decoding, so the swap lands a microtask after the click */
  const settle = () => new Promise((r) => setTimeout(r, 0));
  try {
    doc.querySelector('[data-gcur="USD"]').click();
    await settle();
    assert.equal(img.getAttribute('src'), 'img/donate-lifebuoy-usd.webp');
    assert.match(img.getAttribute('alt'), /hundred dollar note/, 'described as what it now shows');
    assert.deepEqual([img.getAttribute('width'), img.getAttribute('height')], box, 'the same box');
    doc.querySelector('[data-gcur="INR"]').click();
    await settle();
    assert.equal(img.getAttribute('src'), 'img/donate-lifebuoy.webp');
    assert.match(img.getAttribute('alt'), /five hundred rupee note/);
  } finally {
    dom.window.close();
  }
});
