'use strict';

/* Type that goes dark on a dark ground.

   Three times now, in three places, the same fault: an element that carries
   no background of its own, standing on something black, given color:#111 or
   color:var(--ink). It is invisible, and it is invisible precisely where
   somebody is looking, because in all three cases the dark ground is the
   state the person just put the thing into.

     v1.339  the chosen membership tier, its description ink on the ink card
     v1.340  the chosen donate amount, its caption rgba(17,17,17,.7) on #111
     v1.341  the hovered poster's name on cinekind, var(--ink) on the wall

   Each was found by eye, on a screen, by somebody annoyed. A sweep that
   flips colours does not know which rules sit on a parent's black, so this
   names the grounds that are dark and insists the type on them is light.

   This is not a general contrast checker. It is a list of the places the
   fault has actually happened, kept so it cannot happen there a fourth
   time, and extended by hand when a new dark ground is built. */

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const rules = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/* A colour is dark if it is #111 / #000 / var(--ink), or an rgb(a) whose
   channels are all low. Alpha does not save it: rgba(17,17,17,.7) on #111
   is still nothing. */
function isDark(value) {
  const v = value.trim().toLowerCase();
  if (/var\(--ink\)/.test(v)) return true;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})\b/.exec(v);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1];
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    return r < 120 && g < 120 && b < 120;
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(v);
  if (rgb) return Number(rgb[1]) < 120 && Number(rgb[2]) < 120 && Number(rgb[3]) < 120;
  return false;
}

/* Every colour declared by a rule whose selector starts with one of these
   roots. The roots are grounds that are black, or sit on something black. */
const GROUNDS = [
  { page: 'cinekind.html', root: '.hoarding__label',
    why: 'the corner label stands on the poster wall' },
  { page: 'cinekind.html', root: '.marquee__',
    why: 'the marquee copy stands on the photograph' },
  { page: 'wall.html', root: '.wall__empty',
    why: 'the waiting panel is the one dark thing on a white page' },
  { page: 'wall.html', root: '.waiting__',
    why: 'the waiting panel\u2019s own type stands on that dark ground' },
  { page: 'donate.html', root: '.amts button[aria-pressed="true"]',
    why: 'the chosen amount turns its card to ink' },
  { page: 'get-involved.html', root: '.tier:has(input:checked)',
    why: 'the chosen membership turns its card to ink' }
];

for (const { page, root, why } of GROUNDS) {
  test(`${root} on ${page}: ${why}, so its type is light`, () => {
    const css = rules(read(page));
    const found = [];
    const dark = [];
    for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const sel = m[1].trim();
      if (!sel.split(',').some((s) => s.trim().startsWith(root))) continue;
      /* The principle, in the words already written beside the v1.339 fix:
         the fault is a rule that carries no background of its own, so the
         black lives on the parent. A rule that sets its own background has
         made its own ground and may put whatever it likes on it, which is
         how the gold Enter button holds #0a0a0a legitimately. */
      const ownsGround = /(?:^|;)\s*background(?:-color)?\s*:/.test(m[2]);
      for (const c of m[2].matchAll(/(?:^|;)\s*color\s*:\s*([^;}]+)/g)) {
        found.push(`${sel} -> ${c[1].trim()}`);
        if (!ownsGround && isDark(c[1])) dark.push(`${sel} { color: ${c[1].trim()} }`);
      }
    }
    assert.ok(found.length, `no colour rules matched ${root} on ${page}; has it been renamed?`);
    assert.deepEqual(dark, [], `dark type on a dark ground:\n  ${dark.join('\n  ')}`);
  });
}

test('the check would catch the fault it was written for', () => {
  /* The cinekind name as it actually shipped. If isDark stops recognising
     var(--ink), every test above passes while saying nothing. */
  assert.equal(isDark('var(--ink)'), true);
  assert.equal(isDark('#111'), true);
  assert.equal(isDark('rgba(17,17,17,.7)'), true, 'alpha does not rescue ink on ink');
  assert.equal(isDark('#fff'), false);
  assert.equal(isDark('rgba(255,255,255,.72)'), false);
});
