'use strict';

/* The theatre on wall.html, driven the way a visitor drives it: the page's
   own script, in a real DOM, with the media element stood in for by jsdom's
   HTMLMediaElement plus the few properties it does not implement. Every
   control on the screen is pressed here and has to do its job; a control
   that is drawn but wired to nothing fails. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'wall.html'), 'utf8');

/* The theatre keeps two timers running (its clock, its embed poll), which
   would keep the process alive after the last test. Every window is closed. */
const windows = [];
test.after(() => { windows.forEach((w) => { try { w.close(); } catch (e) {} }); });

/* One page per test: the theatre keeps state (position, autoplay, volume) in
   localStorage and in closures, and a test must not inherit another's. */
function page(hash) {
  const vc = new VirtualConsole();
  const errors = [];
  vc.on('jsdomError', (e) => errors.push(e.message));
  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously', virtualConsole: vc, pretendToBeVisual: true,
    url: 'https://pfa.test/wall.html' + (hash || '')
  });
  const w = dom.window;
  windows.push(w);
  /* jsdom has no media pipeline. Give the element a duration and a clock, and
     make play()/pause() flip paused the way a browser does, firing the events
     the page listens to. */
  const proto = w.HTMLMediaElement.prototype;
  Object.defineProperty(proto, 'duration', { configurable: true, get() { return this._d || 0; } });
  Object.defineProperty(proto, 'currentTime', { configurable: true, get() { return this._t || 0; }, set(v) { this._t = v; this.dispatchEvent(new w.Event('timeupdate')); } });
  Object.defineProperty(proto, 'paused', { configurable: true, get() { return this._paused !== false; } });
  Object.defineProperty(proto, 'ended', { configurable: true, get() { return !!this._ended; } });
  Object.defineProperty(proto, 'readyState', { configurable: true, get() { return this._d ? 1 : 0; } });
  Object.defineProperty(proto, 'buffered', { configurable: true, get() { const d = this._d || 0; return { length: d ? 1 : 0, start: () => 0, end: () => d * 0.6 }; } });
  proto.load = function () { this._t = 0; this._ended = false; this._paused = true; };
  proto.play = function () { this._paused = false; this._ended = false; this.dispatchEvent(new w.Event('play')); this.dispatchEvent(new w.Event('playing')); return Promise.resolve(); };
  proto.pause = function () { this._paused = true; this.dispatchEvent(new w.Event('pause')); };
  w.HTMLElement.prototype.scrollIntoView = function () {};
  Object.defineProperty(w.HTMLElement.prototype, 'offsetParent', { configurable: true, get() { return this.closest('[hidden]') ? null : this.parentNode; } });
  /* The stage clip is not on this page. Say what its metadata would say. */
  const t = w.PFA_THEATRE;
  assert.ok(t, 'the theatre exposes its controls to the page');
  const video = w.document.getElementById('thVideo');
  const meta = (d) => { video._d = d; video.dispatchEvent(new w.Event('loadedmetadata')); video.dispatchEvent(new w.Event('durationchange')); };
  return { w, d: w.document, video, meta, t, errors, $: (s) => w.document.querySelector(s), key: (k, o) => w.document.dispatchEvent(new w.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, o))) };
}

/* Opens on the first file on the long wall (the first long item is a YouTube
   embed, whose API is not reachable here), so the file paths run. */
function openOnFile(p) {
  const list = p.t.list();
  const i = list.findIndex((it) => it.src);
  p.t.open(i, 'long');
  p.meta(300);
  return i;
}

test('the page renders without errors, every wall has tiles, and every tile opens the theatre on that film', () => {
  const p = page();
  assert.deepEqual(p.errors, []);
  assert.ok(p.d.querySelectorAll('[data-wall="long"] .tile').length >= 2);
  assert.ok(p.d.querySelectorAll('[data-wall="short"] .tile').length >= 2);
  assert.equal(p.$('#theatre').hidden, true);
  const tile = p.d.querySelectorAll('[data-wall="short"] .tile')[1];
  tile.click();
  assert.equal(p.t.isOpen(), true);
  assert.equal(p.$('#theatre').classList.contains('is-short'), true, 'the short wall opens the short theatre');
  assert.equal(p.t.current(), 1, 'on the tile that was pressed');
  assert.equal(p.$('#thTitle').textContent.split(' | ')[0], tile.querySelector('.cap').firstChild.textContent);
  assert.equal(p.d.body.classList.contains('theatre-lock'), true);
  assert.equal(p.d.activeElement, p.$('#thClose'), 'focus moves into the dialog');
});

test('play, pause, the film surface and the space bar all drive the film, and the readouts follow', () => {
  const p = page();
  openOnFile(p);
  assert.equal(p.video.paused, false, 'a film starts when opened');
  assert.equal(p.$('#thPlay').classList.contains('is-playing'), true);
  p.$('#thPlay').click();
  assert.equal(p.video.paused, true);
  p.$('#thStage').dispatchEvent(new p.w.MouseEvent('click', { bubbles: true }));
  assert.equal(p.video.paused, false, 'a click on the film plays it');
  p.key(' ');
  assert.equal(p.video.paused, true);
  p.key('k');
  assert.equal(p.video.paused, false);
  p.video.currentTime = 90;
  assert.equal(p.$('#thT').textContent, '00:01:30');
  assert.equal(p.$('#thD').textContent, '00:05:00');
  assert.equal(p.$('#thSeek').value, '300', 'the seek bar sits at 30%');
  assert.equal(p.$('#thBuf').style.width, '60%', 'the buffered part is drawn');
  assert.equal(p.$('#thSeek').getAttribute('aria-valuetext'), '00:01:30 of 00:05:00');
});

test('every fact on the screen is drawn once: one play control, one volume, one clock, one progress drawing', () => {
  const p = page();
  openOnFile(p);
  const d = p.d;
  /* Gone: the top-right meter, the big centre play, the mid-stage Play/Pause
     and elapsed readout, the caption's second duration, the mute cluster,
     the "Long form" note doubling the mark, the time riding the ruler. */
  ['#thMeter', '#thBig', '#thState', '#thElapsed', '#thDur', '#thMute', '#thVol', '#thNote', '#thHeadT']
    .forEach((id) => assert.equal(d.querySelector(id), null, id + ' should not exist'));
  const volumeControls = [...d.querySelectorAll('#theatre button, #theatre input')]
    .filter((el) => /sound|mute|volume/i.test((el.getAttribute('aria-label') || '') + el.id));
  assert.deepEqual(volumeControls.map((el) => el.id), ['thSound'], 'the Sound toggle is the one volume control');
  const playButtons = [...d.querySelectorAll('#theatre button')].filter((b) => /^(play|pause)$/i.test(b.getAttribute('aria-label') || ''));
  assert.deepEqual(playButtons.map((b) => b.id), ['thPlay'], 'one play control');
  p.video.currentTime = 90;
  const times = p.$('#theatre').textContent.match(/00:01:30/g) || [];
  assert.equal(times.length, 1, 'the elapsed time is written in one place');
  assert.equal(p.$('.th-caption').textContent.includes('00:05:00'), false, 'the caption carries the title, not a second duration');
});

test('seeking: the bar, the skip buttons, the arrow keys, the number keys, Home and End', () => {
  const p = page();
  openOnFile(p);
  p.video.currentTime = 100;
  p.$('#thFwd').click(); assert.equal(p.video.currentTime, 110);
  p.$('#thBack').click(); assert.equal(p.video.currentTime, 100);
  p.key('ArrowRight'); assert.equal(p.video.currentTime, 110, 'right arrow seeks, it does not change film');
  p.key('ArrowLeft'); assert.equal(p.video.currentTime, 100);
  p.key('l'); assert.equal(p.video.currentTime, 110);
  p.key('j'); assert.equal(p.video.currentTime, 100);
  p.key('5'); assert.equal(p.video.currentTime, 150);
  p.key('End'); assert.equal(p.video.currentTime, 300);
  p.key('Home'); assert.equal(p.video.currentTime, 0);
  const bar = p.$('#thSeek');
  bar.value = '250'; bar.dispatchEvent(new p.w.Event('input', { bubbles: true }));
  assert.equal(p.$('#thFill').style.width, '25%', 'the fill previews the drag');
  bar.dispatchEvent(new p.w.Event('change', { bubbles: true }));
  assert.equal(p.video.currentTime, 75, 'letting go seeks there');
  assert.equal(p.$('#thFlash').hidden, false, 'a skip is acknowledged on the stage');
  p.$('#thBack').click(); assert.equal(p.video.currentTime, 65);
  p.$('#thBack').click(); p.$('#thBack').click(); p.$('#thBack').click(); p.$('#thBack').click(); p.$('#thBack').click(); p.$('#thBack').click();
  assert.equal(p.video.currentTime, 5);
  p.$('#thBack').click(); assert.equal(p.video.currentTime, 0, 'never before the start');
});

test('previous and next: buttons, shift-arrows, N and P, the strip, and wrapping at the ends', () => {
  const p = page();
  const i = openOnFile(p);
  const n = p.t.list().length;
  p.$('#thNext').click(); assert.equal(p.t.current(), (i + 1) % n);
  p.$('#thPrev').click(); assert.equal(p.t.current(), i);
  p.key('ArrowRight', { shiftKey: true }); assert.equal(p.t.current(), (i + 1) % n);
  p.key('ArrowLeft', { shiftKey: true }); assert.equal(p.t.current(), i);
  p.key('n'); assert.equal(p.t.current(), (i + 1) % n);
  p.key('p'); assert.equal(p.t.current(), i);
  p.$('#thStrip').children[n - 1].click(); assert.equal(p.t.current(), n - 1);
  p.$('#thNext').click(); assert.equal(p.t.current(), 0, 'after the last comes the first');
  assert.equal(p.$('#thStrip').querySelector('.is-now'), p.$('#thStrip').children[0], 'the strip marks the film on the stage');
  assert.equal(p.$('#thIdx').textContent, '01');
});

test('the Sound toggle, M and the arrow keys agree, and the choice is kept', () => {
  const p = page();
  openOnFile(p);
  assert.equal(p.video.muted, true, 'a film starts muted, as browsers require for autoplay');
  assert.equal(p.$('#thOff').classList.contains('on'), true, 'the toggle reads Off');
  p.$('#thSound').click();
  assert.equal(p.video.muted, false);
  assert.equal(p.$('#thOn').classList.contains('on'), true, 'and now On');
  assert.equal(p.$('#thSound').getAttribute('aria-pressed'), 'true');
  p.key('m'); assert.equal(p.video.muted, true);
  p.$('#thSound').click(); assert.equal(p.video.muted, false);
  p.key('ArrowDown'); assert.equal(Math.round(p.video.volume * 100), 90);
  p.key('ArrowDown'); p.key('ArrowDown'); assert.equal(Math.round(p.video.volume * 100), 70);
  p.key('ArrowUp'); assert.equal(Math.round(p.video.volume * 100), 80);
  assert.equal(p.w.localStorage.getItem('pfa:wall:volume'), '0.8');
  for (let i = 0; i < 9; i++) p.key('ArrowDown');
  assert.equal(p.video.muted, true, 'volume at nothing is mute, and the toggle says so');
  assert.equal(p.$('#thOff').classList.contains('on'), true);
});

test('speed: the menu and the < > keys change the rate the film actually plays at', () => {
  const p = page();
  openOnFile(p);
  assert.equal(p.$('#thRateMenu').hidden, true);
  p.$('#thRateBtn').click();
  assert.equal(p.$('#thRateMenu').hidden, false);
  assert.equal(p.$('#thRateBtn').getAttribute('aria-expanded'), 'true');
  p.$('#thRateMenu').querySelector('[data-rate="1.5"]').click();
  assert.equal(p.video.playbackRate, 1.5);
  assert.equal(p.$('#thRateNow').textContent, '1.5×');
  assert.equal(p.$('#thRateMenu').hidden, true, 'choosing closes the menu');
  assert.equal(p.$('#thRateMenu').querySelector('[aria-checked="true"]').getAttribute('data-rate'), '1.5');
  p.key('>'); assert.equal(p.video.playbackRate, 2);
  p.key('>'); assert.equal(p.video.playbackRate, 2, 'no faster than the menu offers');
  p.key('<'); p.key('<'); p.key('<'); assert.equal(p.video.playbackRate, 1);
  p.$('#thNext').click();
  if (!p.$('#thVideo').hidden) assert.equal(p.video.playbackRate, 1, 'the rate carries to the next film');
});

test('at the end: a countdown to the next film that can be taken, cancelled or replayed; off, an end card', () => {
  const p = page();
  const i = openOnFile(p);
  p.video._ended = true; p.video._paused = true;
  p.video.dispatchEvent(new p.w.Event('ended'));
  assert.equal(p.$('#thCard').hidden, false, 'the up-next card shows');
  assert.match(p.$('#thCardEyebrow').textContent, /Up next/);
  assert.match(p.$('#thCardText').textContent, /Playing in 5 seconds/);
  const acts = [...p.$('#thCardActs').querySelectorAll('button')].map((b) => b.textContent);
  assert.deepEqual(acts, ['Play now', 'Cancel', 'Replay']);
  assert.equal(p.d.activeElement.textContent, 'Play now', 'focus lands on the card');
  p.$('#thCardActs').querySelector('button:nth-child(2)').click();
  assert.equal(p.$('#thCard').hidden, true, 'cancel keeps the film where it ended');
  assert.equal(p.t.current(), i);

  p.video.dispatchEvent(new p.w.Event('ended'));
  p.$('#thCardActs').querySelector('button').click();
  assert.equal(p.t.current(), (i + 1) % p.t.list().length, 'Play now goes on');

  p.$('#thPrev').click();
  p.meta(300);
  p.$('#thAuto').click();
  assert.equal(p.t.autoplay(), false);
  assert.equal(p.$('#thAuto').getAttribute('aria-pressed'), 'false');
  assert.equal(p.w.localStorage.getItem('pfa:wall:autoplay'), 'off', 'the choice is kept');
  p.video.dispatchEvent(new p.w.Event('ended'));
  assert.match(p.$('#thCardEyebrow').textContent, /The end/);
  assert.deepEqual([...p.$('#thCardActs').querySelectorAll('button')].map((b) => b.textContent), ['Replay', 'Next film']);
  p.$('#thCardActs').querySelector('button').click();
  assert.equal(p.t.current(), i, 'replay stays on this film');
  assert.equal(p.video.paused, false);
  p.key('a'); assert.equal(p.t.autoplay(), true);
});

test('a film that will not load says so and offers a way on, instead of a black screen', () => {
  const p = page();
  openOnFile(p);
  p.video.dispatchEvent(new p.w.Event('error'));
  assert.equal(p.$('#thCard').hidden, false);
  assert.match(p.$('#thCardTitle').textContent, /could not be loaded/);
  assert.deepEqual([...p.$('#thCardActs').querySelectorAll('button')].map((b) => b.textContent), ['Try again', 'Next film']);
  assert.equal(p.$('#thSpin').hidden, true);
  p.$('#thCardActs').querySelector('button:nth-child(2)').click();
  assert.equal(p.$('#thCard').hidden, true);
});

test('buffering shows a spinner and playing clears it', () => {
  const p = page();
  openOnFile(p);
  p.video.dispatchEvent(new p.w.Event('waiting'));
  assert.equal(p.$('#thSpin').hidden, false);
  p.video.dispatchEvent(new p.w.Event('playing'));
  assert.equal(p.$('#thSpin').hidden, true);
});

test('where you got to is remembered: the tile shows it and the film resumes there', () => {
  const p = page();
  const i = openOnFile(p);
  const it = p.t.list()[i];
  p.video.currentTime = 120;
  p.$('#thPlay').click();                             /* a pause records the position */
  assert.deepEqual({ t: p.t.saved(it).t, d: p.t.saved(it).d }, { t: 120, d: 300 });
  p.t.close();
  const tile = p.d.querySelector('.tile[data-key="' + p.t.keyOf(it) + '"]');
  assert.equal(tile.querySelector('.prog').hidden, false, 'the tile carries a progress line');
  assert.equal(tile.querySelector('.prog i').style.width, '40%');

  p.t.open(i, 'long');
  p.meta(300);
  assert.equal(p.video.currentTime, 120, 'resumed where it was left');
  assert.match(p.$('#toast').textContent, /Resuming from 02:00/);

  p.video.currentTime = 295;
  p.$('#thPlay').click();
  assert.equal(p.t.saved(it), null, 'the last few seconds are not worth resuming');
  p.video.currentTime = 100; p.$('#thPlay').click(); p.$('#thPlay').click();
  p.video.dispatchEvent(new p.w.Event('ended'));
  assert.equal(p.t.saved(it), null, 'a finished film starts from the top next time');
});

test('a link names the film and the moment, and opens there', () => {
  const p = page();
  const i = openOnFile(p);
  p.video.currentTime = 95;
  assert.equal(p.t.shareLink(), 'https://pfa.test/wall.html#theatre-long?f=' + (i + 1) + '&t=95');
  assert.equal(p.w.location.hash, '#theatre-long?f=' + (i + 1), 'the address follows the film without a history entry per film');
  assert.equal(JSON.stringify(p.t.parseHash('#theatre-short?f=2&t=40')), JSON.stringify({ which: 'short', f: 1, t: 40 }));
  assert.equal(JSON.stringify(p.t.parseHash('#theatre-long')), JSON.stringify({ which: 'long', f: 0, t: 0 }));
  assert.equal(p.t.parseHash('#submit'), null);

  const q = page('#theatre-long?f=' + (i + 1) + '&t=40');
  assert.equal(q.t.isOpen(), true);
  assert.equal(q.t.current(), i);
  q.meta(300);
  assert.equal(q.video.currentTime, 40, 'the moment in the link is where it starts');
  const s = page('#theatre-short');
  assert.equal(s.t.isOpen(), true);
  assert.equal(s.$('#theatre').classList.contains('is-short'), true);
});

test('the copy-link button writes the link to the clipboard and says so', async () => {
  const p = page();
  const i = openOnFile(p);
  const written = [];
  Object.defineProperty(p.w.navigator, 'clipboard', { configurable: true, value: { writeText: (s) => { written.push(s); return Promise.resolve(); } } });
  p.$('#thShare').click();
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(written, ['https://pfa.test/wall.html#theatre-long?f=' + (i + 1)]);
  assert.equal(p.$('#toast').textContent, 'Link copied');
});

test('closing: the close button, Escape and the foot links stop the film, restore focus and clean the address', () => {
  const p = page();
  const tile = p.d.querySelector('[data-wall="long"] .tile');
  tile.focus(); tile.click();
  p.meta(300);
  p.$('#thClose').click();
  assert.equal(p.t.isOpen(), false);
  assert.equal(p.$('#theatre').hidden, true);
  assert.equal(p.video.paused, true);
  assert.equal(p.d.body.classList.contains('theatre-lock'), false);
  assert.equal(p.d.activeElement, tile, 'focus returns to where it came from');
  assert.equal(p.w.location.hash, '');
  tile.click(); p.key('Escape'); assert.equal(p.t.isOpen(), false);
  tile.click(); p.$('.th-foot [data-theatre-close]').click(); assert.equal(p.t.isOpen(), false);
});

test('the help sheet opens on ? and the button, and Escape closes it before it closes the theatre', () => {
  const p = page();
  openOnFile(p);
  p.key('?');
  assert.equal(p.$('#thHelp').hidden, false);
  assert.equal(p.d.activeElement, p.$('#thHelpClose'));
  p.key('Escape');
  assert.equal(p.$('#thHelp').hidden, true);
  assert.equal(p.t.isOpen(), true, 'the first Escape closed the sheet, not the theatre');
  p.$('#thHelpBtn').click(); assert.equal(p.$('#thHelp').hidden, false);
  p.$('#thHelpClose').click(); assert.equal(p.$('#thHelp').hidden, true);
  assert.ok(p.$('#thHelp dl').textContent.includes('Play or pause'));
});

test('Tab never leaves the theatre while it is open', () => {
  const p = page();
  openOnFile(p);
  const list = [...p.$('#theatre').querySelectorAll('button,a[href],input')].filter((el) => !el.hidden && !el.closest('[hidden]') && !el.disabled);
  list[list.length - 1].focus();
  p.key('Tab');
  assert.equal(p.d.activeElement, list[0], 'from the last control, Tab goes to the first');
  p.key('Tab', { shiftKey: true });
  assert.equal(p.d.activeElement, list[list.length - 1], 'and Shift+Tab goes back');
});

test('an embedded film without its player API keeps the controls honest', () => {
  const p = page();
  const list = p.t.list();
  const i = list.findIndex((it) => it.yt);
  assert.ok(i >= 0, 'the long wall opens with a YouTube film');
  p.t.open(i, 'long');
  assert.ok(p.$('#thStage iframe'), 'the embed is on the stage');
  assert.match(p.$('#thStage iframe').src, /enablejsapi=1/);
  assert.match(p.$('#thStage iframe').src, /start=3753/, 'the film opens at its own start');
  assert.match(p.$('#thStage iframe').src, /fs=0/, 'full screen is this page\'s button, not the embed\'s');
  assert.doesNotMatch(p.$('#thStage iframe').src, /controls=0/, 'an embed the API cannot drive keeps its own controls');
  assert.equal(p.$('#thShield').hidden, true, 'and is not shielded from them');
  assert.equal(p.$('#thVideo').hidden, true);
  assert.equal(p.$('#thSeek').disabled, true, 'nothing to seek until the player answers');
  assert.equal(p.$('.th-time').hidden, true, 'no time to read until the player answers');
  assert.equal(p.$('#thPip'), null, 'picture-in-picture is not merely hidden now but gone (see the removal test below)');
  p.key('ArrowRight');                                  /* must not throw with no clock */
  p.$('#thNext').click();
  assert.equal(p.$('#thStage iframe'), null, 'moving on removes the embed');
});

test('the ruler jumps between films and seeks within one', () => {
  const p = page();
  const i = openOnFile(p);
  const n = p.t.list().length;
  const svg = p.$('#thRuleSvg');
  Object.defineProperty(svg, 'clientWidth', { configurable: true, value: 800 });
  const rule = p.$('#thRule');
  rule.getBoundingClientRect = () => ({ left: 0, width: 800 });
  svg.getBoundingClientRect = () => ({ left: 0, width: 800 });
  const seg = 800 / n;
  rule.dispatchEvent(new p.w.MouseEvent('click', { bubbles: true, clientX: seg * i + seg / 2 }));
  assert.equal(p.t.current(), i);
  assert.equal(p.video.currentTime, 150, 'half way along this film\'s segment is half way through it');
  rule.dispatchEvent(new p.w.MouseEvent('click', { bubbles: true, clientX: seg * ((i + 1) % n) + 1 }));
  assert.equal(p.t.current(), (i + 1) % n);
});


test('the chrome follows the pointer: over the film it all steps away and the film has the screen; over the controls it returns', () => {
  const p = page();
  openOnFile(p);
  const th = p.$('#theatre');
  th.getBoundingClientRect = () => ({ top: 0, bottom: 900, left: 0, right: 1600 });
  Object.defineProperty(p.$('#thBottom'), 'offsetHeight', { configurable: true, value: 300 });
  Object.defineProperty(p.$('.th-top'), 'offsetHeight', { configurable: true, value: 72 });
  p.$('#thClose').blur();
  const move = (y) => th.dispatchEvent(new p.w.MouseEvent('pointermove', { bubbles: true, clientY: y, clientX: 800 }));

  assert.equal(p.$('#thBottom').classList.contains('away'), false, 'the chrome is there when the theatre opens');
  move(450);
  assert.equal(p.$('#thBottom').classList.contains('away'), true, 'over the film, the strip, ruler and controls step away');
  assert.equal(p.$('.th-top').classList.contains('away'), true, 'so does the top bar: the film has the whole screen');
  assert.equal(th.classList.contains('is-idle'), true);
  move(880);
  assert.equal(p.$('#thBottom').classList.contains('away'), false, 'brought down to the controls, they return');
  assert.equal(p.$('.th-top').classList.contains('away'), false);
  move(30);
  assert.equal(p.$('.th-top').classList.contains('away'), false, 'the top zone holds the clock and Close');

  move(450);
  assert.equal(p.$('#thBottom').classList.contains('away'), true);
  p.$('#thPlay').click();                       /* pause, from the keyboard's twin */
  assert.equal(p.$('#thBottom').classList.contains('away'), false, 'a paused film always shows its chrome');
  p.$('#thPlay').click();
  move(450);
  assert.equal(p.$('#thBottom').classList.contains('away'), true);
  p.video.dispatchEvent(new p.w.Event('ended'));
  assert.equal(p.$('#thBottom').classList.contains('away'), false, 'the up-next card brings it back');
});

test('the fullscreen button asks the theatre element for full screen, and falls through before giving up', () => {
  const p = page();
  openOnFile(p);
  const asked = [];
  p.$('#theatre').requestFullscreen = () => { asked.push('theatre'); return Promise.resolve(); };
  p.$('#thFull').click();
  assert.deepEqual(asked, ['theatre']);

  p.$('#theatre').requestFullscreen = () => Promise.reject(new Error('no'));
  p.d.documentElement.requestFullscreen = () => { asked.push('document'); return Promise.resolve(); };
  return new Promise((r) => setTimeout(r, 10)).then(() => {
    asked.length = 0;
    p.$('#thFull').click();
    return new Promise((r) => setTimeout(r, 10)).then(() => {
      assert.deepEqual(asked, ['document'], 'a refusal on the element falls through to the document');
    });
  });
});

test('a player API that arrives late reopens the embed bare: never two sets of controls', async () => {
  const p = page();
  const list = p.t.list();
  const i = list.findIndex((it) => it.yt);
  p.t.open(i, 'long');                                  /* API absent: YouTube's own controls */
  assert.doesNotMatch(p.$('#thStage iframe').src, /controls=0/, 'first open is undriven');
  /* The API script arrives a moment later, as it does on a first visit. */
  p.w.YT = {
    PlayerState: { PLAYING: 1, PAUSED: 2, ENDED: 0, BUFFERING: 3 },
    Player: function (fr, opts) {
      this.getCurrentTime = () => 137; this.getDuration = () => 4000;
      this.mute = () => {}; this.unMute = () => {}; this.setVolume = () => {}; this.setPlaybackRate = () => {};
      this.playVideo = () => {}; this.pauseVideo = () => {}; this.seekTo = () => {};
      setTimeout(() => opts.events.onReady(), 0);
    }
  };
  if (p.w.onYouTubeIframeAPIReady) p.w.onYouTubeIframeAPIReady();
  await new Promise((r) => setTimeout(r, 30));
  const frame = p.$('#thStage iframe');
  assert.match(frame.src, /controls=0/, 'the embed was reopened bare - one set of controls');
  assert.match(frame.src, /start=137/, 'at the moment it had reached');
  assert.equal(frame.classList.contains('bare'), true);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(p.$('#thShield').hidden, false, 'and shielded, so clicks pause it like a file');
  assert.equal(p.w.document.querySelectorAll('#thStage iframe').length, 1, 'exactly one embed on the stage');
});

test('over a playing film the drawn cursor rests after stillness, and movement wakes it', async () => {
  const p = page();
  const calls = [];
  p.w.PFA_CHROME = { restCursor: (on) => calls.push(on), recolourCursor: () => {}, measure: () => {} };
  openOnFile(p);
  p.video.play();
  const th = p.$('#theatre');
  th.getBoundingClientRect = () => ({ top: 0, bottom: 900, left: 0, right: 1600 });
  Object.defineProperty(p.$('#thBottom'), 'offsetHeight', { configurable: true, value: 200 });
  Object.defineProperty(p.$('.th-top'), 'offsetHeight', { configurable: true, value: 72 });
  p.$('#thClose').blur();
  th.dispatchEvent(new p.w.MouseEvent('pointermove', { bubbles: true, clientY: 450, clientX: 800 }));
  calls.length = 0;
  await new Promise((r) => setTimeout(r, 2600));
  assert.ok(calls.includes(true), 'a still hand rests the pointer, the way every theatre does');
  calls.length = 0;
  th.dispatchEvent(new p.w.MouseEvent('pointermove', { bubbles: true, clientY: 455, clientX: 810 }));
  assert.ok(calls.includes(false), 'the smallest movement wakes it at once');
  /* It never rests while the chrome is up: an invisible pointer over a
     visible control row is a trap. */
  calls.length = 0;
  th.dispatchEvent(new p.w.MouseEvent('pointermove', { bubbles: true, clientY: 30, clientX: 800 }));
  await new Promise((r) => setTimeout(r, 2600));
  assert.ok(!calls.includes(true), 'over the controls the pointer stays');
});

test('a driven YouTube film opens bare, is shielded, and the shield pauses and plays it', async () => {
  const p = page();
  const calls = [];
  p.w.YT = {
    PlayerState: { PLAYING: 1, PAUSED: 2, ENDED: 0, BUFFERING: 3 },
    Player: function (frame, opts) {
      const me = this;
      this._t = 0; this._playing = true;
      this.mute = () => calls.push('mute'); this.unMute = () => calls.push('unMute');
      this.setVolume = () => {}; this.setPlaybackRate = () => {};
      this.getDuration = () => 4000; this.getCurrentTime = () => me._t;
      this.playVideo = () => { calls.push('play'); me._playing = true; opts.events.onStateChange({ data: 1 }); };
      this.pauseVideo = () => { calls.push('pause'); me._playing = false; opts.events.onStateChange({ data: 2 }); };
      this.seekTo = (t) => { me._t = t; calls.push('seek:' + t); };
      this.getPlayerState = () => (me._playing ? 1 : 2);
      setTimeout(() => { opts.events.onReady(); opts.events.onStateChange({ data: 1 }); }, 0);
    }
  };
  const list = p.t.list();
  const i = list.findIndex((it) => it.yt);
  p.t.open(i, 'long');
  const frame = p.$('#thStage iframe');
  assert.match(frame.src, /controls=0/, 'the API is here, so the embed opens with no second set of controls');
  assert.match(frame.src, /disablekb=1/);
  assert.equal(frame.classList.contains('bare'), true, 'a bare embed is cover-fitted: the film fills the screen');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(p.$('#thShield').hidden, false, 'the shield covers the driven embed');
  assert.equal(p.$('#thSeek').disabled, false, 'the player answered, so the bar is live');
  assert.equal(p.$('#thD').textContent, '01:06:40', 'the duration is the player\u2019s');

  p.$('#thShield').click();
  assert.ok(calls.includes('pause'), 'a click on the film pauses it, as on a file');
  p.$('#thShield').click();
  assert.ok(calls.filter((c) => c === 'play').length >= 1, 'and a second click plays it again');
  p.$('#thFwd').click();
  assert.ok(calls.some((c) => String(c).startsWith('seek:')), 'the skip buttons reach the player');
  p.$('#thSound').click();
  assert.ok(calls.includes('unMute'), 'the one volume control reaches the player');
  p.$('#thNext').click();
  assert.equal(p.$('#thShield').hidden, true, 'the shield leaves with the embed');
});


test('hovering the timeline pushes everything below it off the screen: the film and the bar are all that remain', () => {
  const p = page();
  openOnFile(p);
  const wrap = p.$('#thSeekWrap');
  wrap.getBoundingClientRect = () => ({ left: 100, width: 1000 });
  const move = (x) => wrap.dispatchEvent(new p.w.MouseEvent('pointermove', { bubbles: true, clientX: x }));

  assert.equal(p.$('.th-lane'), null, 'the half-way lane is gone; the push is the whole way');
  assert.equal(p.$('#thBottom').classList.contains('is-scrub'), false);
  move(350);
  assert.equal(p.$('#thTip').hidden, false, 'the chip shows the moment under the pointer');
  assert.equal(p.$('#thTip').textContent, '00:01:15', 'a quarter of the way along a five-minute film');
  assert.equal(p.$('#thBottom').classList.contains('is-scrub'), true, 'everything below the bar is pushed down');
  assert.equal(p.$('#theatre').classList.contains('is-scrub'), true, 'and the top bar and caption step away: the film has the screen');
  wrap.dispatchEvent(new p.w.Event('pointerleave'));
  assert.equal(p.$('#thTip').hidden, true);
  assert.equal(p.$('#thBottom').classList.contains('is-scrub'), false, 'gone with the pointer');
  assert.equal(p.$('#theatre').classList.contains('is-scrub'), false);

  /* Moving from the bar straight onto the film clears the scrub state before
     the whole block hides, so nothing is seen animating back under it.
     (Blurred first: jsdom marks every focus as keyboard-visible, where a
     browser opening from a mouse click would not.) */
  p.$('#thClose').blur();
  move(500);
  const th = p.$('#theatre');
  th.getBoundingClientRect = () => ({ top: 0, bottom: 900, left: 0, right: 1600 });
  Object.defineProperty(p.$('#thBottom'), 'offsetHeight', { configurable: true, value: 300 });
  Object.defineProperty(p.$('.th-top'), 'offsetHeight', { configurable: true, value: 72 });
  th.dispatchEvent(new p.w.MouseEvent('pointermove', { bubbles: true, clientY: 450, clientX: 800 }));
  assert.equal(p.$('#thBottom').classList.contains('is-scrub'), false);
  assert.equal(p.$('#thBottom').classList.contains('away'), true, 'the chrome is away; only the film remains');

  /* A keyboard hand tabbing into the controls must never land on a control
     that has been pushed off the screen. */
  move(350);
  assert.equal(p.$('#thBottom').classList.contains('is-scrub'), true);
  p.$('#thPlay').focus();
  p.$('#thBottom').dispatchEvent(new p.w.FocusEvent('focusin', { bubbles: true }));
  assert.equal(p.$('#thBottom').classList.contains('is-scrub'), false, 'focus brings the controls back');
});

test('the frame is native by default, Fill is a remembered choice, shorts are always native', async () => {
  const p = page();
  /* Native by default: contain for files, min()-fitted 16:9 for bare embeds. */
  assert.match(HTML, /\.th-stage video\{object-fit:contain\}/, 'a file film is never clipped by default');
  assert.match(HTML, /iframe\.bare\{left:50%;top:50%;width:min\(100vw,177\.78vh\);height:min\(100vh,56\.25vw\)/, 'a bare embed fits inside the stage by default');
  assert.match(HTML, /\.theatre\.is-fill:not\(\.is-short\) \.th-stage video\{object-fit:cover\}/, 'Fill is opt-in');
  assert.match(HTML, /\.theatre\.is-short \.fit\{display:none\}/, 'a vertical film offers no Fill');
  openOnFile(p);
  const th = p.$('#theatre');
  assert.ok(!th.classList.contains('is-fill'), 'opens native');
  p.$('#thFit').click();
  assert.ok(th.classList.contains('is-fill'), 'the Frame control fills');
  assert.equal(p.w.localStorage.getItem('pfa:theatre:frame'), 'fill', 'and the choice is remembered');
  assert.equal(p.$('#thFit').getAttribute('aria-pressed'), 'true');
  assert.ok(p.$('#thFitFill').classList.contains('on') && !p.$('#thFitNative').classList.contains('on'));
  p.$('#thFit').click();
  assert.ok(!th.classList.contains('is-fill'), 'and back to native');
  assert.equal(p.w.localStorage.getItem('pfa:theatre:frame'), 'native');
});

test('picture in picture is gone, whole, and the record of why stays', () => {
  /* The button could only ever serve the placeholder files: no page may
     reach the video inside YouTube's or Vimeo's frame, and the films this
     wall exists for are embeds. So on the real films it sat dead (reported
     31 Aug 2026) or, gated, vanished - and a control that is sometimes dead
     and sometimes missing reads as broken both ways. Removed on the owner's
     call: if it does not work, it does not appear. Half-removals are the
     failure mode this pins against: a leftover listener on a missing id
     throws and takes every control wired after it down too. The embeds keep
     allow="picture-in-picture" so the browser's own media menu can still
     float a film - that door is the browser's, not this page's. */
  const html = fs.readFileSync(path.join(__dirname, '..', 'wall.html'), 'utf8');
  assert.ok(!/thPip|requestPictureInPicture|webkitSetPresentationMode|pictureInPictureEnabled/.test(html),
    'no trace: no button, no gate, no handler, no state listeners');
  assert.match(html, /allow = 'autoplay; fullscreen; picture-in-picture'/,
    "the browser's own door stays open on embeds");
});
