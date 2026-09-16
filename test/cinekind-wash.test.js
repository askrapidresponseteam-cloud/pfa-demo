'use strict';

/* The poster wall arrives bright, wherever the mouse is resting.

   The wash - the dark pane over every poster - used to come down on
   pointerenter, and every way onto this wall moves the page under a mouse
   that is standing still: the leader burns off over it, Enter scrolls the
   wall up under the pointer that pressed it, a reload lands back on the
   track. The browser checks what is now under the pointer and tells the
   stage it has been entered. Measured in Chromium at 1190x746, all three: a
   trusted pointerover and pointerenter with movementX and movementY 0, at
   the position the mouse already had, and no pointermove at all. The wall
   opened washed back with nobody touching it (owner, 16 Sep 2026: it should
   not be dim at load).

   Driven here the way Chromium drove it: the page's own script in jsdom,
   sent the events that were measured. jsdom has no PointerEvent and no
   movementX, so each event is a MouseEvent carrying the fields a browser
   hands the listener. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'cinekind.html'), 'utf8');

/* Where the drawn cursor stood in the owner's screenshot of the dim wall. */
const REST = { x: 1150, y: 560 };
const nudged = (dx, dy) => ({ x: REST.x + dx, y: REST.y + dy });

/* The leader and the wall both keep frames and timers running. */
const windows = [];
test.after(() => { windows.forEach((w) => { try { w.close(); } catch (e) {} }); });

function page({ reduce = false } = {}) {
  const vc = new VirtualConsole();
  const errors = [];
  vc.on('jsdomError', (e) => errors.push(e.message));
  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    url: 'https://pfa.test/cinekind.html',
    beforeParse(w) {
      w.matchMedia = (q) => ({
        matches: reduce && /prefers-reduced-motion:\s*reduce/.test(q), media: q,
        addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}
      });
      /* jsdom lays nothing out and scrolls nothing; the focus handler asks it to */
      w.scrollTo = () => {};
      w.Element.prototype.scrollTo = function () {};
      w.Element.prototype.scrollIntoView = function () {};
    }
  });
  const w = dom.window;
  windows.push(w);
  const doc = w.document;
  const section = doc.querySelector('.hoarding');
  const stage = doc.querySelector('.hoarding__stage');
  const posters = [...doc.querySelectorAll('#wall .poster')];
  const nameOf = (p) => p.querySelector('.poster__name').textContent;
  const a = posters[0];
  const b = posters.find((p) => nameOf(p) !== nameOf(a));
  assert.ok(a && b, 'the wall has two different faces to point at');
  const img = (p) => p.querySelector('img');

  function send(target, type, at, o = {}) {
    const e = new w.MouseEvent(type, {
      bubbles: !/enter|leave/.test(type), cancelable: true,
      clientX: at.x, clientY: at.y, screenX: at.x, screenY: at.y,
      relatedTarget: o.related || null
    });
    Object.defineProperty(e, 'pointerType', { value: o.pointerType || 'mouse' });
    Object.defineProperty(e, 'movementX', { value: o.mx || 0 });
    Object.defineProperty(e, 'movementY', { value: o.my || 0 });
    target.dispatchEvent(e);
  }

  return {
    section, a, b, nameOf, errors,
    /* what the browser sends when the page moves under a still mouse */
    arrive(p, at = REST, pointerType) {
      send(img(p), 'pointerover', at, { pointerType });
      send(stage, 'pointerenter', at, { pointerType });
    },
    move(p, at, mx, my, pointerType) { send(img(p), 'pointermove', at, { mx, my, pointerType }); },
    /* one poster slides out from under the pointer and the next one in */
    slide(from, to, at) {
      send(img(from), 'pointerout', at, { related: img(to) });
      send(img(to), 'pointerover', at, { related: img(from) });
    },
    leave() { send(stage, 'pointerleave', { x: 600, y: 40 }); },
    washed: () => section.classList.contains('is-pointed'),
    named: () => (section.classList.contains('is-captioned') ? doc.querySelector('.hoarding__cap-name').textContent : null)
  };
}

test('a mouse the wall arrives under leaves it bright, and the corner to the title', () => {
  const pg = page();
  pg.arrive(pg.a);
  assert.equal(pg.washed(), false, 'pointerenter with no movement is the page moving, not a hand');
  assert.equal(pg.named(), null, 'and no face is lifted out and named for it');
  assert.deepEqual(pg.errors, []);
});

test('a move sent from the spot the mouse already stood on is not a hand either', () => {
  const pg = page();
  pg.arrive(pg.a);
  pg.move(pg.a, REST, 0, 0);
  assert.equal(pg.washed(), false, 'an engine refreshing hover, not a mouse moving');
  assert.equal(pg.named(), null);
});

test('the mouse moving brings the wash down and names the face under it', () => {
  const pg = page();
  pg.arrive(pg.a);
  pg.move(pg.a, nudged(5, -2), 5, -2);
  assert.equal(pg.washed(), true);
  assert.equal(pg.named(), pg.nameOf(pg.a), 'the poster was entered before the hand moved, and is named now');
  assert.deepEqual(pg.errors, []);
});

test('a changed position counts as a move where the engine leaves movementX at 0', () => {
  const pg = page();
  pg.arrive(pg.a);
  pg.move(pg.a, nudged(4, 0), 0, 0);
  assert.equal(pg.washed(), true);
});

test('with a hand on the wall the name follows the face under it, and leaving puts it all down', () => {
  const pg = page();
  pg.arrive(pg.a);
  pg.move(pg.a, nudged(5, 0), 5, 0);
  /* the scroll carries another poster to the hand at rest: no movement, as measured */
  pg.slide(pg.a, pg.b, nudged(5, 0));
  assert.equal(pg.named(), pg.nameOf(pg.b), 'the corner follows the poster under the hand');
  pg.leave();
  assert.equal(pg.washed(), false);
  assert.equal(pg.named(), null);
  pg.arrive(pg.b);
  assert.equal(pg.washed(), false, 'the next arrival is bright again until the mouse moves');
  assert.equal(pg.named(), null);
});

test('a resting mouse does not take the corner from the focus ring', () => {
  const pg = page();
  pg.a.querySelector('a').focus();
  assert.equal(pg.named(), pg.nameOf(pg.a), 'focus names its poster');
  pg.arrive(pg.b);
  assert.equal(pg.named(), pg.nameOf(pg.a), 'a poster sliding under a resting pointer is not a hand choosing it');
});

test('reduced motion: the wall arrives bright too, and a moving mouse still washes it', () => {
  const pg = page({ reduce: true });
  assert.equal(pg.section.classList.contains('is-live'), false, 'a still wall, as reduced motion asks');
  pg.arrive(pg.a);
  assert.equal(pg.washed(), false);
  pg.move(pg.a, nudged(5, 0), 5, 0);
  assert.equal(pg.washed(), true, 'the move listener is not behind the motion check; only the lean is');
});

test('a finger never brings the wash down this way', () => {
  const pg = page();
  pg.arrive(pg.a, REST, 'touch');
  pg.move(pg.a, nudged(20, 0), 20, 0, 'touch');
  assert.equal(pg.washed(), false);
});
