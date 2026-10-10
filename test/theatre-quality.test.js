'use strict';

/* Picture quality in the films' player.

   Owner, 10 Oct 2026, of a Quality control that reopened the film with
   YouTube's controls and said the qualities were under YouTube's gear:
   "Don't tell users to use YouTube's quality settings, since the player
   isn't presented as YouTube. Add a quality selector here if supported;
   otherwise, omit it and automatically use the highest available YouTube
   quality."

   Not supported: YouTube's player API has had no quality to set since
   24 Oct 2019 (its revision history: setPlaybackQuality is a no-op and a
   suggested quality is ignored). So there is no control, and the player
   never speaks of YouTube's settings. YouTube picks the quality from the
   size its player is drawn at, so a film this page drives is drawn at the
   size it would have full screen on this screen (at least 1080 lines, at
   most 4K) and shrunk to the stage with a transform. Checked in Chromium:
   the frame takes exactly the stage's box on screen while its own size is
   the larger one. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const FOUNDER = fs.readFileSync(path.join(ROOT, 'founder.html'), 'utf8');
const WALL = fs.readFileSync(path.join(ROOT, 'wall.html'), 'utf8');
const THEATRE_JS = fs.readFileSync(path.join(ROOT, 'assets', 'theatre.js'), 'utf8');
const THEATRE_CSS = fs.readFileSync(path.join(ROOT, 'assets', 'theatre.css'), 'utf8');
const TAG = '<script src="assets/theatre.js"></script>';
const OPEN = [];
test.after(() => OPEN.forEach((d) => { try { d.window.close(); } catch (_) { /* gone */ } }));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* The wall's films come from /api/wall: one YouTube film and one file. */
const FILMS = [
  { wall: 'long', title: 'An embed', credit: '', yt: 'BVbpSc_EXlI' },
  { wall: 'long', title: 'A file', credit: '', src: 'https://films.test/one.mp4', poster: 'https://films.test/one.jpg' }
];
const instant = (value) => ({
  then(onOk) { const out = onOk ? onOk(value) : value; return out && typeof out.then === 'function' ? out : instant(out); },
  catch() { return this; }
});
const feed = () => instant({ ok: true, json: () => instant({ ok: true, films: FILMS.map((f) => Object.assign({}, f)) }) });

/* screen: [width, height] in CSS pixels; stage: the theatre's stage box */
function page(html, url, { screen = [1440, 900], dpr = 2, stage = [1200, 600], saveData = false, api = true } = {}) {
  const dom = new JSDOM(html.replace(TAG, `<script>${THEATRE_JS}</script>`), {
    runScripts: 'dangerously', pretendToBeVisual: true, url,
    beforeParse(w) {
      w.scrollTo = () => {};
      w.Element.prototype.scrollIntoView = function () {};
      w.fetch = feed;
      Object.defineProperty(w.screen, 'width', { value: screen[0], configurable: true });
      Object.defineProperty(w.screen, 'height', { value: screen[1], configurable: true });
      Object.defineProperty(w, 'devicePixelRatio', { value: dpr, configurable: true });
      if (saveData) Object.defineProperty(w.navigator, 'connection', { value: { saveData: true }, configurable: true });
      /* the stage is laid out at this size (jsdom lays out nothing) */
      const cw = Object.getOwnPropertyDescriptor(w.Element.prototype, 'clientWidth');
      const ch = Object.getOwnPropertyDescriptor(w.Element.prototype, 'clientHeight');
      Object.defineProperty(w.Element.prototype, 'clientWidth', { configurable: true, get() { return this.id === 'thStage' ? stage[0] : cw.get.call(this); } });
      Object.defineProperty(w.Element.prototype, 'clientHeight', { configurable: true, get() { return this.id === 'thStage' ? stage[1] : ch.get.call(this); } });
      if (!api) return;
      /* YouTube's player API, already here, so a film opens bare and driven */
      w.YT = {
        PlayerState: { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 },
        Player: function (frame, opts) {
          const me = this;
          me.playVideo = () => {}; me.pauseVideo = () => {}; me.mute = () => {}; me.unMute = () => {};
          me.setVolume = () => {}; me.isMuted = () => true; me.getDuration = () => 600; me.getCurrentTime = () => 42;
          me.seekTo = () => {}; me.getPlayerState = () => 1; me.destroy = () => {}; me.setPlaybackRate = () => {};
          setTimeout(() => opts.events.onReady(), 0);
        }
      };
    }
  });
  OPEN.push(dom);
  const d = dom.window.document;
  return { w: dom.window, d, $: (q) => d.querySelector(q), t: dom.window.PFA_THEATRE };
}
const k = (p) => Number(p.$('#theatre iframe').style.getPropertyValue('--th-k'));
const s = (p) => Number(p.$('#theatre iframe').style.getPropertyValue('--th-s'));

test('no Quality control, no Q key, and not a word about YouTube\'s settings', async () => {
  const p = page(FOUNDER, 'https://pfa.test/founder.html');
  p.t.open(0);
  await wait(20);
  assert.equal(p.$('#thQuality'), null, 'no control that cannot do what it says');
  const src = p.$('#theatre iframe').src;
  assert.match(src, /controls=0/, 'the film plays under this page\'s controls');
  p.$('#theatre').dispatchEvent(new p.w.KeyboardEvent('keydown', { key: 'q', bubbles: true }));
  await wait(20);
  assert.equal(p.$('#theatre iframe').src, src, 'Q does nothing to the film');
  assert.doesNotMatch(p.$('#thHelp').textContent, /Quality|YouTube/, 'the keyboard list');
  assert.doesNotMatch(p.$('#theatre').textContent, /YouTube|gear/i, 'anywhere in the player');
  /* and nowhere in what the player can say (its toasts are strings in the code) */
  const said = (THEATRE_JS.replace(/\/\*[\s\S]*?\*\//g, '').match(/say\([^;]*/g) || []).join('\n');
  assert.doesNotMatch(said, /YouTube|gear|[Qq]uality/);
  assert.doesNotMatch(THEATRE_JS, /toggleQuality|paintQuality|thQuality/);
});

test('there is no quality menu pretending to work: the code never asks YouTube to set one', () => {
  const code = THEATRE_JS.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(code, /setPlaybackQuality|suggestedQuality|vq=/);
});

test('a driven film is drawn at its full-screen size and shrunk to the stage', async () => {
  /* a laptop: 1440 by 900 at 2x; the film is 1066 by 600 in a 1200 by 600
     stage, and 1440 by 810 full screen, 1620 lines at 2x */
  const p = page(FOUNDER, 'https://pfa.test/founder.html');
  p.t.open(0);
  await wait(20);
  assert.equal(p.$('#theatre iframe').className, 'bare');
  assert.equal(k(p), 1.35);
  assert.ok(Math.abs(s(p) * k(p) - 1) < 1e-4, 'and shrunk back by the same');
  /* Fill: the film is already bigger in the stage, so less to add */
  p.$('#thFit').click();
  assert.ok(p.$('#theatre').classList.contains('is-fill'));
  assert.equal(k(p), 1.2);
  p.$('#thFit').click();
  assert.equal(k(p), 1.35);
});

test('never under 1080 lines, never over 4K, never shrunk below its place', async () => {
  const cases = [
    /* 1366 by 768 at 1x: full screen is 768 lines, raised to 1080 */
    [{ screen: [1366, 768], dpr: 1, stage: [1366, 500] }, 2.16],
    /* 2560 by 1440 at 2x: 2880 lines full screen, held to 4K */
    [{ screen: [2560, 1440], dpr: 2, stage: [1200, 600] }, 1.8],
    /* a phone, upright: the film is 219 lines in the stage, 390 turned full screen */
    [{ screen: [390, 844], dpr: 3, stage: [390, 300] }, 1.778],
    /* a stage as big as the screen at 4K: nothing to add */
    [{ screen: [3840, 2160], dpr: 1, stage: [3840, 2160] }, 1]
  ];
  for (const [opts, want] of cases) {
    const p = page(FOUNDER, 'https://pfa.test/founder.html', opts);
    p.t.open(0);
    await wait(20);
    assert.equal(k(p), want, JSON.stringify(opts));
  }
});

test('a browser saving data, a frame with YouTube\'s controls, and a file are left as they are', async () => {
  const saving = page(FOUNDER, 'https://pfa.test/founder.html', { saveData: true });
  saving.t.open(0);
  await wait(20);
  assert.equal(k(saving), 1, 'Save-Data: YouTube\'s own choice');

  /* the API has not arrived: the frame shows YouTube's controls, which a
     transform would shrink */
  const plain = page(FOUNDER, 'https://pfa.test/founder.html', { api: false });
  plain.t.open(0);
  await wait(20);
  assert.doesNotMatch(plain.$('#theatre iframe').src, /controls=0/);
  assert.equal(k(plain), 1);

  const wall = page(WALL, 'https://pfa.test/wall.html');
  await wait(30);
  const list = wall.t.list();
  wall.t.open(list.findIndex((it) => it.src && !it.yt), 'long');
  await wait(20);
  assert.equal(wall.$('#theatre iframe'), null, 'a file plays in the page\'s own video, at the one quality it has');
  wall.t.load(list.findIndex((it) => it.yt));
  await wait(20);
  assert.ok(k(wall) > 1, 'and the YouTube film beside it is drawn large');
});

test('the stylesheet draws it at --th-k and shrinks it by --th-s, and follows the stage', () => {
  const bare = THEATRE_CSS.match(/\n\.theatre\.is-long \.th-stage iframe\.bare\{([^}]*)\}/)[1];
  assert.match(bare, /width:calc\(min\(100vw,177\.78vh\) \* var\(--th-k,1\)\)/);
  assert.match(bare, /transform:translate\(-50%,-50%\) scale\(var\(--th-s,1\)\)/);
  assert.match(THEATRE_CSS, /\.theatre\.is-long\.is-fill \.th-stage iframe\.bare\{width:calc\(max\(100cqw,177\.78cqh\) \* var\(--th-k,1\)\)/);
  assert.match(THEATRE_CSS, /\.theatre\.is-short \.th-stage iframe\.bare\{[^}]*transform:scale\(var\(--th-s,1\)\);transform-origin:0 0\}/);
  assert.match(THEATRE_JS, /addEventListener\('resize', function\(\)\{ if \(wasOpen\)\{ sharpen\(\);/, 'redrawn when the window changes');
  assert.match(THEATRE_JS, /if \(!on\) orient\(false\);\n {6}sharpen\(\);/, 'and in and out of full screen');
});
