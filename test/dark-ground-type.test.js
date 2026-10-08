'use strict';

/* Type and edges that go dark on a dark ground.

   Six times now, in six places, the same shape: an element that draws no
   background of its own, standing on something black, given color:#111 or
   color:var(--ink). It is invisible, and it is invisible exactly where
   somebody is looking, because in most of them the dark ground is the state
   the person just put the thing into.

     v1.339  the chosen membership tier, its description ink on the ink card
     v1.340  the chosen donate amount, its caption rgba(17,17,17,.7) on #111
     v1.342  the hovered poster's name on cinekind, var(--ink) on the wall
     v1.343  the wall's waiting panel, flipped white-on-white the other way
     v1.347  the academy view toggle, the unpressed icon ink on #151515
     v1.347  the featured offer on quiz.html: its description, eyebrow, price
             note, Add button text and border, stepper and struck-out price,
             all ink on var(--deep)

   The first version of this check was a hand-written list of places it had
   already happened, which is why it sat green while the academy toggle and
   the whole featured offer card were invisible. It finds the grounds itself
   now: any rule that declares a dark background is a ground, and anything
   whose selector sits under one and sets dark type without declaring a
   background of its own is the fault. That is the actual shape, and it
   catches places nobody has thought to list.

   A rule that declares its own background has made its own ground and may
   put whatever it likes on it, which is how the gold Enter button holds
   #0a0a0a and the Add button's white hover state holds var(--ink). */

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..');
const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')).sort();

function isDark(value) {
  const v = value.trim().toLowerCase();
  if (/var\(--(ink|deep)\)/.test(v)) return true;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})\b/.exec(v);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1];
    return [0, 2, 4].every((i) => parseInt(h.slice(i, i + 2), 16) < 120);
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(v);
  if (rgb) return [1, 2, 3].every((i) => Number(rgb[i]) < 120);
  return false;
}

const rulesOf = (css) =>
  [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .map((m) => ({ sel: m[1].trim(), body: m[2] }));

const declares = (body, prop) =>
  new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;}]+)`).exec(body);

/* background:none and background:transparent declare a background and make
   no ground: they are the fault case, not the exemption from it. Reading
   them as "this rule owns its ground" is what let the academy toggle sit
   green while its unpressed icon was invisible. */
function ownsGround(body) {
  const bg = declares(body, 'background') || declares(body, 'background-color');
  return Boolean(bg) && !/^(none|transparent)\b/i.test(bg[1].trim());
}

for (const page of pages) {
  test(`${page}: nothing dark stands on a dark ground`, () => {
    const rules = rulesOf(fs.readFileSync(path.join(ROOT, page), 'utf8'));

    /* A ground is any plain selector that paints itself dark. Selectors
       carrying a pseudo or an attribute are skipped as grounds because
       their descendants are not reliably on them. */
    const grounds = new Set();
    for (const { sel, body } of rules) {
      const head = sel.split(',')[0].trim();
      const bg = declares(body, 'background') || declares(body, 'background-color');
      if (bg && isDark(bg[1]) && !/[:[]/.test(head)) grounds.add(head);
    }

    const blind = [];
    for (const { sel, body } of rules) {
      const head = sel.split(',')[0].trim();
      const ground = [...grounds].find((g) => head !== g && head.startsWith(g + ' '));
      if (!ground) continue;
      if (ownsGround(body)) continue;
      const colour = declares(body, 'color');
      if (colour && isDark(colour[1])) {
        blind.push(`${head} { color:${colour[1].trim()} } stands on ${ground}`);
      }
    }
    assert.deepEqual(blind, [], `invisible on its own ground:\n  ${blind.join('\n  ')}`);
  });
}

test('the check would still recognise the colours it was written for', () => {
  assert.equal(isDark('var(--ink)'), true);
  assert.equal(isDark('var(--deep)'), true);
  assert.equal(isDark('#111'), true);
  assert.equal(isDark('rgba(17,17,17,.7)'), true, 'alpha does not rescue ink on ink');
  assert.equal(isDark('#fff'), false);
  assert.equal(isDark('rgba(255,255,255,.62)'), false);
});

test('a transparent background is not a ground of one\u2019s own', () => {
  assert.equal(ownsGround('background:#fff;color:var(--ink)'), true, 'a white chip makes its own ground');
  assert.equal(ownsGround('background:none;color:var(--ink)'), false, 'this is the academy toggle');
  assert.equal(ownsGround('background:transparent;color:#111'), false);
  assert.equal(ownsGround('color:#111'), false);
});
