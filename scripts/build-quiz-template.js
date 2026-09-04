#!/usr/bin/env node
'use strict';

/* Rebuild quiz.html's shared shell from pfa-shop.html.

   Same arrangement as the product template, and for the same reason: a page
   that carries a hand-copied header and stylesheet is stale the first time
   anyone edits the original. Everything quiz-specific is preserved between
   markers:

     /* PFA_QUIZ_CSS_START *​/ … /* PFA_QUIZ_CSS_END *​/
     /* PFA_QUIZ_JS_START  *​/ … /* PFA_QUIZ_JS_END  *​/

   Unlike product.html, quiz.html is served from the site root, so its links
   are relative like every other page here and rootify() is deliberately NOT
   applied.

   Run: npm run build:quiz   (test/quiz-page.test.js fails if it is stale.) */

const fs = require('fs');
const path = require('path');
const { shopParts } = require('./build-product-template.js');
const { applyChrome } = require('./sync-chrome.js');

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, 'quiz.html');

function between(text, start, end, label) {
  const a = text.indexOf(start);
  const b = text.indexOf(end, a);
  if (a < 0 || b < 0) throw new Error(`could not find ${label} in quiz.html`);
  return text.slice(a, b + end.length);
}

function replaceBlock(html, openTag, closeTag, replacement, label) {
  const a = html.indexOf(openTag);
  const b = html.indexOf(closeTag, a);
  if (a < 0 || b < 0) throw new Error(`could not find ${label} in quiz.html`);
  return html.slice(0, a) + replacement + html.slice(b + closeTag.length);
}

function quizHeader(header) {
  return header
    .replace(/\s*<button class="navcart"[\s\S]*?<\/button>/, '')
    .replace(/<a href="#top" class="current" aria-current="page">([^<]*)<\/a>/,
             '<a href="pfa-shop.html">$1</a>');
}

function build() {
  /* shopParts() rootifies for the product page's nested URL. quiz.html sits at
     the root, so the un-rewritten shop markup is what it needs; take it back. */
  const parts = shopParts();
  const unroot = (html) => html
    .replace(/\b(href|src|action)="\/([^/"][^"]*)"/g, '$1="$2"')
    .replace(/url\((["']?)\/([^/"')][^"')]*)\1\)/g, 'url($1$2$1)');

  let page = fs.readFileSync(PAGE, 'utf8');
  const ownCss = between(page, '/* PFA_QUIZ_CSS_START */', '/* PFA_QUIZ_CSS_END */', 'the quiz CSS markers');
  between(page, '/* PFA_QUIZ_JS_START */', '/* PFA_QUIZ_JS_END */', 'the quiz JS markers');

  const styleOpen = page.indexOf('<style>', page.indexOf('</title>'));
  const styleClose = page.indexOf('</style>', styleOpen);
  page = page.slice(0, styleOpen) +
    '<style>' + unroot(parts.stylesheet) + '\n' + ownCss + '\n' +
    page.slice(styleClose);

  /* The shop's header carries the shop's own furniture: a Cart, and Shop
     marked as the current page. Neither belongs here, and a rebuild used to
     put both back. */
  page = replaceBlock(page, '<header class="site"', '</header>', quizHeader(unroot(parts.header)), 'the header');
  page = replaceBlock(page, '<footer class="pfa-footer"', '</footer>', unroot(parts.footer), 'the footer');

  const fontsStart = page.indexOf('<!-- Marcellus self-hosted');
  const fontsEnd = page.indexOf('</style>', page.indexOf('<style>', fontsStart)) + '</style>'.length;
  if (fontsStart > -1) page = page.slice(0, fontsStart) + unroot(parts.fonts) + page.slice(fontsEnd);

  /* The header, announcement bar, stylesheet link and chrome script come from
     the shared chrome, last, so nothing copied from the shop above can put a
     hand-copied header back. quizHeader() above is kept as a belt-and-braces
     filter on what the shop provides. */
  return applyChrome(page, 'quiz.html');
}

if (require.main === module) {
  const next = build();
  if (next === fs.readFileSync(PAGE, 'utf8')) console.log('quiz.html already matches pfa-shop.html.');
  else { fs.writeFileSync(PAGE, next); console.log('quiz.html rebuilt from pfa-shop.html.'); }
}

module.exports = { build };
