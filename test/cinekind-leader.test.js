'use strict';

/* The CineKind film leader, from a click on the home page to the trophy.

   Asked for on 16 Sep 2026: a click on CineKind on the home page counts
   3, 2, 1 and then loads the CineKind page, which opens on its trophy. The
   leader already existed, but as cinekind.html's last script, so the header
   and the trophy painted first and the black frame landed on top of them.
   assets/cinekind-leader.js now counts on the home page and hands over; the
   CineKind page opens on the same last frame and burns off.

   These drive the real pages' scripts in jsdom, with the leader file put in
   place of its own <script src>, attributes and all. Timings are real: a
   beat is 700ms, so the full counts take a few seconds each. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const LEADER = read('assets/cinekind-leader.js');
const HOME = read('index.html');
const CINEKIND = read('cinekind.html');
const KEY = 'pfa:cinekind-leader';
const TAG = /<script src="assets\/cinekind-leader\.js"([^>]*)><\/script>/g;
const HOME_URL = 'https://pfa.test/index.html';
const PAGE_URL = 'https://pfa.test/cinekind.html';

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const windows = [];
test.after(() => { windows.forEach((w) => { try { w.close(); } catch (e) {} }); });

/* The page as a browser runs it, with the leader inline where its tag was. */
function inline(html) {
  return html.replace(TAG, (m, attrs) => `<script${attrs.replace(/\s+defer\b/, '')}>${LEADER}</script>`);
}

function open(html, url, { reduce = false, storage = true, note = null } = {}) {
  const vc = new VirtualConsole();
  const errors = [];
  const navigations = [];
  vc.on('jsdomError', (e) => {
    (/not implemented: navigation/i.test(e.message) ? navigations : errors).push(e.message);
  });
  const dom = new JSDOM(inline(html), {
    url, runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.matchMedia = (q) => ({
        matches: reduce && /prefers-reduced-motion:\s*reduce/.test(q), media: q,
        addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}
      });
      w.scrollTo = () => {};
      w.Element.prototype.scrollTo = function () {};
      w.Element.prototype.scrollIntoView = function () {};
      if (note !== null) w.sessionStorage.setItem(KEY, String(note));
      if (!storage) {
        /* Storage switched off, or a browser that throws on it in private mode */
        Object.defineProperty(w, 'sessionStorage', {
          configurable: true,
          get() { throw new w.DOMException('The operation is insecure.', 'SecurityError'); }
        });
      }
    }
  });
  windows.push(dom.window);
  return { w: dom.window, d: dom.window.document, errors, navigations };
}

function click(p, el, init = {}) {
  const event = new p.w.MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init });
  el.dispatchEvent(event);
  return event;
}

const footerLink = (p) => p.d.querySelector('.pfa-footer a[href="cinekind.html"]');

/* ------------------------------------------------------------ the markup */

test('the home page asks for the leader once, deferred, after the stamped chrome, in link mode', () => {
  const tags = [...HOME.matchAll(TAG)];
  assert.equal(tags.length, 1);
  assert.match(tags[0][1], /data-leader="link"/);
  assert.match(tags[0][1], /\bdefer\b/, 'the home page is never held up for it; a click before it runs just goes');
  assert.ok(tags[0].index > HOME.indexOf('</footer>'), 'outside the header and footer that sync-chrome stamps');
});

test('the photograph warmed during the count is the one the CineKind page burns off into', () => {
  const plate = /data-plate="([^"]+)"/.exec([...HOME.matchAll(TAG)][0][1]);
  const shown = /<img class="marquee__plate" src="([^"]+)"/.exec(CINEKIND);
  assert.ok(plate, 'the home page names a plate to warm');
  assert.ok(shown, 'cinekind.html still opens on a marquee plate');
  assert.equal(plate[1], shown[1], 'warming any other file spends the visitor\'s data on nothing');
  assert.ok(fs.existsSync(path.join(ROOT, plate[1])));
});

test('the CineKind page mounts its leader first in the body, not deferred, and keeps no second copy', () => {
  const tags = [...CINEKIND.matchAll(TAG)];
  assert.equal(tags.length, 1);
  assert.match(tags[0][1], /data-leader="page"/);
  assert.doesNotMatch(tags[0][1], /\b(defer|async)\b/, 'it has to be up before anything under it can paint');
  const open = CINEKIND.indexOf('<body>') + '<body>'.length;
  assert.equal(CINEKIND.slice(open, tags[0].index).trim(), '', 'nothing in the body comes before it');
  assert.doesNotMatch(CINEKIND, /ckSweep|ckNum/, 'the old inline leader is gone, or a visit would count twice');
});

/* ------------------------------------------------------- the home page */

test('a click on CineKind counts 3, 2, 1 on the home page, then hands over and goes', async () => {
  const p = open(HOME, HOME_URL);
  const a = footerLink(p);
  assert.ok(a, 'the footer carries the CineKind link');
  const event = click(p, a);
  assert.equal(event.defaultPrevented, true, 'the browser does not leave before the count');

  const leader = p.d.querySelector('.ck-leader');
  assert.ok(leader, 'the leader is up on the click itself');
  assert.equal(leader.getAttribute('aria-hidden'), 'true');
  assert.equal(p.d.documentElement.style.overflow, 'hidden', 'the page does not scroll under it');
  const hint = p.d.querySelector('link[rel="prefetch"]');
  assert.equal(hint && hint.href, PAGE_URL, 'the page it counts towards is fetched while it counts');

  const num = leader.querySelector('.ck-leader__num');
  const seen = [];
  const started = Date.now();
  while (!p.navigations.length && Date.now() - started < 4000) {
    if (seen[seen.length - 1] !== num.textContent) seen.push(num.textContent);
    await wait(15);
  }
  const took = Date.now() - started;
  assert.deepEqual(seen, ['3', '2', '1'], 'three beats, in order, each once');
  assert.equal(p.navigations.length, 1, 'then it leaves, once');
  assert.ok(took >= 2000 && took < 3200, `it leaves after three 700ms beats, not after ${took}ms`);
  const note = Number(p.w.sessionStorage.getItem(KEY));
  assert.ok(note > 0 && Date.now() - note < 2000, 'leaving the CineKind page a note that the count is done');
  assert.deepEqual(p.errors, []);
});

test('a click meant for a new tab or window, or any button but the first, is left to the browser', () => {
  const p = open(HOME, HOME_URL);
  for (const init of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
    const event = click(p, footerLink(p), init);
    assert.equal(event.defaultPrevented, false, JSON.stringify(init));
    assert.equal(p.d.querySelector('.ck-leader'), null, JSON.stringify(init));
  }
});

test('other links, other windows and other sites are not its business; the clean URL is the same page', () => {
  const p = open(HOME, HOME_URL);
  const add = (href, target) => {
    const a = p.d.createElement('a');
    a.href = href;
    if (target) a.target = target;
    a.textContent = 'link';
    p.d.body.appendChild(a);
    return a;
  };
  assert.equal(click(p, p.d.querySelector('.pfa-footer a[href="events.html"]')).defaultPrevented, false);
  assert.equal(click(p, add('cinekind.html', '_blank')).defaultPrevented, false, 'a new window gets the page, which counts for itself');
  assert.equal(click(p, add('https://elsewhere.test/cinekind.html')).defaultPrevented, false);
  assert.equal(p.d.querySelector('.ck-leader'), null);
  assert.equal(click(p, add('/cinekind')).defaultPrevented, true, 'Vercel serves the page at /cinekind too');
  assert.equal(p.d.querySelectorAll('.ck-leader').length, 1);
});

test('a second press during the count does not start a second count, or leave early', () => {
  const p = open(HOME, HOME_URL);
  click(p, footerLink(p));
  const again = click(p, footerLink(p));
  assert.equal(again.defaultPrevented, true);
  assert.equal(p.d.querySelectorAll('.ck-leader').length, 1);
});

test('reduced motion: the home page does not count, the link simply goes', () => {
  const p = open(HOME, HOME_URL, { reduce: true });
  assert.equal(click(p, footerLink(p)).defaultPrevented, false);
  assert.equal(p.d.querySelector('.ck-leader'), null);
});

test('a tab that cannot keep the note does not count here, so the CineKind page counts once for itself', () => {
  const p = open(HOME, HOME_URL, { storage: false });
  assert.equal(click(p, footerLink(p)).defaultPrevented, false);
  assert.equal(p.d.querySelector('.ck-leader'), null);
  assert.deepEqual(p.errors, []);
});

test('back from the history cache: the frame is gone, the page scrolls, and the link counts again', () => {
  const p = open(HOME, HOME_URL);
  click(p, footerLink(p));
  assert.ok(p.d.querySelector('.ck-leader'));
  const shown = new p.w.Event('pageshow');
  Object.defineProperty(shown, 'persisted', { value: true });
  p.w.dispatchEvent(shown);
  assert.equal(p.d.querySelector('.ck-leader'), null, 'no black frame left over a restored page');
  assert.equal(p.d.documentElement.style.overflow, '');
  assert.equal(click(p, footerLink(p)).defaultPrevented, true);
  assert.equal(p.d.querySelectorAll('.ck-leader').length, 1);
});

/* --------------------------------------------------- the CineKind page */

test('arriving from the count: no second count, the same last frame, burnt off into the trophy', async () => {
  const p = open(CINEKIND, PAGE_URL, { note: Date.now() });
  const leader = p.d.querySelector('.ck-leader');
  assert.ok(leader, 'the frame is up before the page under it');
  assert.equal(p.w.sessionStorage.getItem(KEY), null, 'the note is spent on arrival, so a reload counts');
  const num = leader.querySelector('.ck-leader__num');
  const sweep = leader.querySelector('.ck-leader__sweep');
  assert.equal(num.textContent, '1', 'it opens on the frame the home page left on screen');
  assert.match(sweep.style.background, /360deg/, 'sweep and all');
  const seen = new Set();
  const started = Date.now();
  while (leader.parentNode && Date.now() - started < 3500) {
    seen.add(num.textContent);
    await wait(15);
  }
  assert.equal(leader.parentNode, null, 'torn out when done');
  assert.deepEqual([...seen], ['1'], 'it never shows 3 or 2 again');
  assert.equal(p.d.documentElement.style.overflow, '');
  assert.equal(p.d.documentElement.style.backgroundColor, '');
  assert.deepEqual(p.errors, []);
});

test('a direct visit counts 3, 2, 1 on the CineKind page itself, and leaves the page as it found it', async () => {
  const p = open(CINEKIND, PAGE_URL);
  const leader = p.d.querySelector('.ck-leader');
  assert.ok(leader);
  const num = leader.querySelector('.ck-leader__num');
  const seen = [];
  const started = Date.now();
  while (leader.parentNode && Date.now() - started < 5500) {
    if (seen[seen.length - 1] !== num.textContent) seen.push(num.textContent);
    await wait(15);
  }
  assert.deepEqual(seen, ['3', '2', '1']);
  assert.equal(leader.parentNode, null, 'torn out when done');
  assert.equal(p.d.documentElement.style.overflow, '');
  assert.deepEqual(p.errors, []);
});

test('a stale note is an abandoned click, not a count just finished', () => {
  const p = open(CINEKIND, PAGE_URL, { note: Date.now() - 60000 });
  assert.equal(p.d.querySelector('.ck-leader .ck-leader__num').textContent, '3');
  assert.equal(p.w.sessionStorage.getItem(KEY), null);
});

test('reduced motion on the CineKind page: no leader, and no black ground', () => {
  const p = open(CINEKIND, PAGE_URL, { reduce: true });
  assert.equal(p.d.querySelector('.ck-leader'), null);
  assert.equal(p.d.documentElement.style.backgroundColor, '');
});

test('the root is black before the body holds anything, and gets its ground back even if the leader never comes', async () => {
  const probe = '<script>window.__ground = document.documentElement.style.backgroundColor;</script>';
  const p = open(CINEKIND.replace('<body>\n', `<body>\n${probe}\n`), PAGE_URL);
  assert.match(String(p.w.__ground), /^(#0a0a0a|rgb\(10, 10, 10\))$/, 'black from the head, ahead of everything in the body');
  assert.equal(p.d.documentElement.style.backgroundColor, '', 'handed back once the leader\'s frame was up');

  const q = open(CINEKIND.replace(TAG, ''), PAGE_URL);          // the file failed to arrive
  const started = Date.now();
  while (q.d.documentElement.style.backgroundColor && Date.now() - started < 2000) await wait(15);
  assert.equal(q.d.querySelector('.ck-leader'), null);
  assert.equal(q.d.documentElement.style.backgroundColor, '', 'the page is not left on a black ground');
});
