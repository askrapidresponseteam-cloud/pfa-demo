'use strict';

/* The JavaScript written inside the pages, linted.

   eslint.config.mjs lists `assets/**\/*.js`, `pfa-search.js`, `pfa-forms.js`
   and the server folders. It lists no HTML, because eslint does not read HTML
   without a plugin. So `npm run lint` printed nothing while roughly 400 KB of
   JavaScript - admin.html's panel, pfa-shop.html's whole store, wall.html's
   theatre, donate.html's two payment flows - was never linted at all. It was
   the least-checked code in the repository and the code a visitor runs most.

   eslint is already a devDependency and its Linter runs on a string, so the
   scripts are pulled out of each page and linted with the same rules the
   browser files use. What it found on the day it was written was small, which
   is a credit to the pages, and one of them was real: pfa-shop.html declared
   `var watching` twice in one scope, once as the infinite-scroll guard and
   once as the payment-poll timer handle.

   A <script src> is somebody else's file and is linted where it lives. A
   type="application/ld+json" block is data, and running it as JavaScript would
   throw on the first colon. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Linter } = require('eslint');
const js = require('@eslint/js');

const ROOT = path.join(__dirname, '..');

/* The browser's own names. Kept here rather than imported from
   eslint.config.mjs because that file is ESM and this suite is CommonJS; the
   list is the same one, plus the few globals only the pages reach for. */
const BROWSER = `addEventListener removeEventListener dispatchEvent window document navigator location
history screen localStorage sessionStorage fetch Headers Request Response FormData Blob File FileReader
Image FontFace ImageData OffscreenCanvas createImageBitmap HTMLElement HTMLCanvasElement HTMLImageElement
HTMLScriptElement HTMLInputElement HTMLTextAreaElement HTMLSelectElement HTMLAnchorElement HTMLVideoElement
Element Node NodeFilter DocumentFragment DOMParser Event CustomEvent KeyboardEvent MouseEvent PointerEvent
TouchEvent MutationObserver IntersectionObserver ResizeObserver requestAnimationFrame cancelAnimationFrame
requestIdleCallback getComputedStyle matchMedia scrollTo scrollBy innerWidth innerHeight devicePixelRatio
alert confirm prompt open print crypto performance AbortController TextEncoder TextDecoder atob btoa
structuredClone queueMicrotask XMLHttpRequest Worker WebSocket Notification customElements CSS Intl URL
URLSearchParams setTimeout clearTimeout setInterval clearInterval console Promise Map Set WeakMap WeakSet
Symbol JSON Math Date Uint8Array Uint8ClampedArray Float32Array ArrayBuffer globalThis Proxy Reflect BigInt
WeakRef ClipboardItem getSelection`.split(/\s+/).filter(Boolean);

/* Names the site puts on window itself, from a <script src> or another page
   script. A page is free to write to them. */
const SITE = `PFA PFA_RULES PFAFieldValidate PFAForms PFACardFields PFABag PFA_DATA PFA_CHROME PFA_PRODUCT
PFA_RELATED PFA_STORE PFA_CG_DOCS PFA_BRAND_LOGOS PFA_COMMERCE PFA_SEARCH Razorpay firebase YT
Vimeo`.split(/\s+/).filter(Boolean);

const globals = {};
BROWSER.forEach((name) => { globals[name] = 'readonly'; });
SITE.forEach((name) => { globals[name] = 'writable'; });

/* The same rules eslint.config.mjs applies to the browser files. */
const config = {
  languageOptions: { ecmaVersion: 2020, sourceType: 'script', globals },
  rules: {
    ...js.configs.recommended.rules,
    'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
    'no-empty': ['warn', { allowEmptyCatch: true }],
    'no-prototype-builtins': 'off',
    'no-control-regex': 'off',
    'no-cond-assign': ['error', 'except-parens'],
    'no-irregular-whitespace': ['error', { skipComments: true }]
  }
};

function scriptsOf(html) {
  return [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
    .filter((m) => !/\bsrc=/.test(m[1]))
    .filter((m) => {
      const type = (m[1].match(/type\s*=\s*["']([^"']+)["']/) || [])[1];
      return !type || /^(text\/javascript|application\/javascript|module)$/i.test(type);
    })
    .map((m) => ({ code: m[2], at: m.index + m[0].indexOf(m[2]) }));
}

/* The blocks of one page share a global scope, so they are linted as one
   program: a `var` in the first block is in scope in the second, exactly as
   the browser has it. The map carries every character back to where it really
   lives, so a complaint names a line of the page and not of the splice. */
function lintPage(html) {
  const blocks = scriptsOf(html);
  if (!blocks.length) return [];
  const SEPARATOR = '\n;\n';
  let code = '';
  const map = [];
  for (const block of blocks) {
    for (let i = 0; i < block.code.length; i += 1) map.push(block.at + i);
    code += block.code;
    for (let i = 0; i < SEPARATOR.length; i += 1) map.push(block.at + block.code.length);
    code += SEPARATOR;
  }

  const lineStarts = [0];
  for (let i = 0; i < code.length; i += 1) if (code[i] === '\n') lineStarts.push(i + 1);

  return new Linter().verify(code, config).map((message) => {
    if (!message.line) return { ...message, where: '', text: '' };
    const at = map[lineStarts[message.line - 1] + (message.column - 1)] || 0;
    const from = html.lastIndexOf('\n', at) + 1;
    const to = html.indexOf('\n', at);
    return {
      ...message,
      line: html.slice(0, at).split('\n').length,
      text: html.slice(from, to < 0 ? html.length : to).trim()
    };
  });
}

const PAGES = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));

test('the JavaScript inside the pages is as clean as the JavaScript beside them', () => {
  const complaints = [];
  for (const file of PAGES) {
    for (const m of lintPage(fs.readFileSync(path.join(ROOT, file), 'utf8'))) {
      complaints.push(`${file}:${m.line} [${m.ruleId || 'syntax'}] ${m.message}\n      ${m.text.slice(0, 110)}`);
    }
  }
  assert.deepEqual(complaints, [], `\n${complaints.join('\n')}\n`);
});

test('the check is looking at the pages that carry the most of it', () => {
  /* A regex that quietly stopped matching would make the test above pass by
     finding nothing, so the volume it is reading is pinned. */
  const measured = PAGES
    .map((f) => [f, scriptsOf(fs.readFileSync(path.join(ROOT, f), 'utf8')).reduce((n, b) => n + b.code.length, 0)])
    .filter(([, n]) => n > 0);
  const total = measured.reduce((n, [, size]) => n + size, 0);
  assert.ok(total > 300 * 1024, `only ${Math.round(total / 1024)} KB of inline script was found; the extractor has stopped matching`);
  for (const page of ['admin.html', 'pfa-shop.html', 'wall.html', 'donate.html']) {
    const hit = measured.find(([f]) => f === page);
    assert.ok(hit && hit[1] > 10 * 1024, `${page} carries a large script that this test is not reading`);
  }
});
