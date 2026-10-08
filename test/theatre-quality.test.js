'use strict';

/* Picture quality in the films' player (owner, 8 Oct 2026, of the founder
   page: "can the video player also have option to select quality").

   YouTube decides the quality of an embedded film and its player API cannot
   be told otherwise since 2019 (setPlaybackQuality is a no-op), so a menu of
   qualities on this page would change nothing. Quality reopens the film at
   the same second with YouTube's own controls, whose gear lists every
   quality the film has; it stays so for the films after it; pressing it
   again brings this page's controls back at the same second. A film that is
   one file on this site has one quality, and no button. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const FOUNDER = fs.readFileSync(path.join(ROOT, 'founder.html'), 'utf8');
const WALL = fs.readFileSync(path.join(ROOT, 'wall.html'), 'utf8');
const THEATRE_JS = fs.readFileSync(path.join(ROOT, 'assets', 'theatre.js'), 'utf8');
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

function page(html, url, at) {
  const dom = new JSDOM(html.replace(TAG, `<script>${THEATRE_JS}</script>`), {
    runScripts: 'dangerously', pretendToBeVisual: true, url,
    beforeParse(w) {
      w.scrollTo = () => {};
      w.Element.prototype.scrollIntoView = function () {};
      w.fetch = feed;
      /* YouTube's player API, already here, so a film opens bare and driven */
      w.YT = {
        PlayerState: { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 },
        Player: function (frame, opts) {
          const me = this;
          me.playVideo = () => {}; me.pauseVideo = () => {}; me.mute = () => {}; me.unMute = () => {};
          me.setVolume = () => {}; me.isMuted = () => true; me.getDuration = () => 600; me.getCurrentTime = () => at;
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

test('a YouTube film has Quality; it opens YouTube\'s own settings at the same second, and back again', async () => {
  const p = page(FOUNDER, 'https://pfa.test/founder.html', 42.7);
  p.t.open(0);
  await wait(20);
  const q = p.$('#thQuality');
  assert.ok(q, 'the control is in the player');
  assert.equal(q.hidden, false, 'shown for a YouTube film');
  assert.equal(q.getAttribute('aria-pressed'), 'false');
  assert.match(p.$('#theatre iframe').src, /controls=0/, 'the film starts with this page\'s controls');

  q.click();
  await wait(20);
  const own = p.$('#theatre iframe').src;
  assert.doesNotMatch(own, /controls=0/, 'YouTube\'s own controls, with the gear that lists the qualities');
  assert.match(own, /start=42/, 'at the same second');
  assert.equal(q.getAttribute('aria-pressed'), 'true');
  assert.match(p.$('#thToast').textContent, /gear/, 'and says where the qualities are');
  assert.equal(p.$('#thShield').hidden, true, 'nothing lies over YouTube\'s controls');

  p.t.load(1);
  await wait(20);
  assert.doesNotMatch(p.$('#theatre iframe').src, /controls=0/, 'the next film keeps YouTube\'s settings');

  p.$('#thQuality').click();
  await wait(20);
  assert.match(p.$('#theatre iframe').src, /controls=0/, 'pressed again, this page\'s controls are back');
  assert.match(p.$('#theatre iframe').src, /start=42/);
  assert.equal(p.$('#thQuality').getAttribute('aria-pressed'), 'false');
});

test('Q does the same from the keyboard, and the help lists it', async () => {
  const p = page(FOUNDER, 'https://pfa.test/founder.html', 10);
  p.t.open(0);
  await wait(20);
  p.$('#theatre').dispatchEvent(new p.w.KeyboardEvent('keydown', { key: 'q', bubbles: true }));
  await wait(20);
  assert.doesNotMatch(p.$('#theatre iframe').src, /controls=0/);
  assert.match(p.$('#thHelp').textContent, /Quality/);
});

test('a film that is one file on this site has one quality, and no Quality button', async () => {
  const p = page(WALL, 'https://pfa.test/wall.html', 0);
  await wait(30);
  const t = p.w.PFA_THEATRE;
  const list = t.list();
  const file = list.findIndex((it) => it.src && !it.yt);
  assert.ok(file >= 0, 'the wall has a file to play');
  t.open(file, 'long');
  await wait(20);
  assert.equal(p.$('#thQuality').hidden, true, 'one file, one quality');
  t.load(list.findIndex((it) => it.yt));
  await wait(20);
  assert.equal(p.$('#thQuality').hidden, false, 'and the YouTube film beside it has the control');
});

test('there is no quality menu pretending to work: the code never asks YouTube to set one', () => {
  const code = THEATRE_JS.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(code, /setPlaybackQuality|vq=/);
});
