'use strict';

/* Thirteen pages open on the same dark editorial hero, and a reader moving
   between them should not see the headline jump. The room reserved above it
   is therefore the same on all of them: the announcement bar, the nav, and a
   fixed offset on top.

   Nothing pinned that offset before. test/page-shell.test.js checks only that
   the rule mentions --ann and --nav, so when academy.html's stylesheet was
   rewritten in v1.275 it came back at 60px against everyone else's 72px, and
   the page started twelve pixels higher than Laws with nothing to catch it.

   Pages with their own first section - the shop, a product, the quiz, units -
   are not in this family and are not checked here. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

const DESKTOP = 72;
const MOBILE = 36;

function pages() {
  return fs.readdirSync(ROOT)
    .filter((f) => f.endsWith('.html'))
    .map((f) => ({ file: f, html: fs.readFileSync(path.join(ROOT, f), 'utf8') }))
    .filter(({ html }) => {
      const first = html.match(/<main[^>]*>\s*<\w+[^>]*class="([^"]*)"/);
      return first && first[1].split(/\s+/)[0] === 'hero';
    });
}

const reserve = (html, gutter) => {
  const re = new RegExp('\\.hero\\{[^}]*?padding:calc\\(var\\(--ann\\) \\+ var\\(--nav\\) \\+ (\\d+)px\\) ' + gutter, 's');
  const m = html.match(re);
  return m ? Number(m[1]) : null;
};

test('every page in the hero family reserves the same room above the headline', () => {
  const family = pages();
  assert.ok(family.length >= 10, `expected the hero family, found ${family.length} pages`);

  const wrong = [];
  family.forEach(({ file, html }) => {
    const d = reserve(html, 'var\\(--gutter');
    if (d !== DESKTOP) wrong.push(`${file}: desktop reserves ${d === null ? 'nothing readable' : d + 'px'}, not ${DESKTOP}px`);
  });
  assert.deepStrictEqual(wrong, [],
    'these pages would start at a different height from the rest:\n  ' + wrong.join('\n  '));
});

test('and the same room on a phone', () => {
  const wrong = [];
  pages().forEach(({ file, html }) => {
    const m = reserve(html, '16px');
    if (m !== MOBILE) wrong.push(`${file}: mobile reserves ${m === null ? 'nothing readable' : m + 'px'}, not ${MOBILE}px`);
  });
  assert.deepStrictEqual(wrong, [], wrong.join('\n  '));
});

/* The theme pass of Sep 2026 put the editorial layer - the label weight, the
   display leading, the numbered band head, the button control - in one file
   loaded after each page's own style. academy.html never linked it, so its
   eyebrow stayed at the 700 weight its own stylesheet sets while every other
   hero page was retuned to 400, and the word ACADEMY sat bold above the
   headline where LAWS and UNITS sit light.

   Only the hero family is checked. product.html and quiz.html are missing the
   link too, for a different reason worth fixing separately: they are generated
   by scripts/build-product-template.js and build-quiz-template.js, which copy
   the head of pfa-shop.html only as far as its first </style>, and the theme
   link sits after that. */
test('every page in the hero family loads the editorial theme', () => {
  const missing = pages()
    .filter(({ html }) => !/href="assets\/pfa-theme\.css"/.test(html))
    .map(({ file }) => file);
  assert.deepStrictEqual(missing, [],
    'these pages set their own label weight and display leading instead of the shared one:\n  ' + missing.join('\n  '));
});

test('the theme is loaded after the page style, or it would lose every tie', () => {
  pages().forEach(({ file, html }) => {
    const theme = html.indexOf('assets/pfa-theme.css');
    const style = html.lastIndexOf('</style>');
    assert.ok(theme > style, `${file}: the theme link must come after the page's own <style>`);
  });
});
