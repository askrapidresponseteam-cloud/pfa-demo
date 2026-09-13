'use strict';

/* The flash of unstyled text, pinned shut. Marcellus loads with
   font-display:swap, so on a cold or hard-refreshed load the heading paints
   in the next face of the stack and swaps when the file arrives. The preload
   makes that window short; it cannot close it. What made the window VISIBLE
   was the stack: the next face was plain Georgia, about 2% wider per line and
   on different vertical metrics, so the swap rewrapped every heading and the
   page jumped. The cure is two local faces dressed in Marcellus's own
   measurements - size-adjust and the three metric overrides - so the swap
   exchanges glyphs in place and moves nothing.

   These tests hold the three parts together: every page that declares the
   web font also declares the matched fallbacks, every stack falls onto them
   first, and the numbers belong to the font file actually on disk. */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..');
const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));

/* The overrides were computed FROM this file (ascent 1995, descent 573,
   gap 0, weighted advance 932.4, per 2048 em - and Georgia 913, Times 832
   per capsize). If the font file changes, the numbers on every page are for
   a font that is no longer there: recompute them from the new file and
   update the hash here, in that order. */
const FONT_MD5 = 'dc6fd559e41d5021de35e485f93be20c';
const OVERRIDES = {
  "'Marcellus Fallback'": ['size-adjust: 102.13%', 'ascent-override: 95.38%', 'descent-override: 27.39%', 'line-gap-override: 0%'],
  "'Marcellus Fallback Times'": ['size-adjust: 112.07%', 'ascent-override: 86.92%', 'descent-override: 24.96%', 'line-gap-override: 0%']
};

test('the metrics were computed from the font that is actually on disk', () => {
  const md5 = crypto.createHash('md5')
    .update(fs.readFileSync(path.join(ROOT, 'fonts', 'marcellus-latin.woff2')))
    .digest('hex');
  assert.equal(md5, FONT_MD5,
    'fonts/marcellus-latin.woff2 changed: recompute size-adjust and the overrides from the new file, then update FONT_MD5');
});

test('every page that loads Marcellus also carries both matched fallback faces, exactly', () => {
  const broken = [];
  for (const page of pages) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    if (!/src: url\("\/?fonts\/marcellus-latin\.woff2"\)/.test(html)) continue; // admin has no web font, so no swap and no flash
    for (const [face, lines] of Object.entries(OVERRIDES)) {
      const at = html.indexOf('font-family: ' + face);
      if (at < 0) { broken.push(`${page}: no ${face} face`); continue; }
      const block = html.slice(at, html.indexOf('}', at));
      for (const line of lines) if (!block.includes(line)) broken.push(`${page}: ${face} lost "${line}"`);
    }
    /* The window the fallback covers still has to be short: the preload is
       the other half of the cure and pages have quietly lost it before. */
    if (!/rel="preload" href="\/?fonts\/marcellus-latin\.woff2" as="font"/.test(html)) {
      broken.push(`${page}: the font is no longer preloaded`);
    }
  }
  assert.deepEqual(broken, [], broken.join('\n'));
});

test('every stack that leads with Marcellus falls onto the matched face, never onto raw Georgia', () => {
  const broken = [];
  for (const page of pages) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    if (!/src: url\("\/?fonts\/marcellus-latin\.woff2"\)/.test(html)) continue;
    /* Any list that starts at the web font - the --display token every page
       defines, or a literal font-family on the home page's heroes: the very
       next name must be the matched fallback, or the swap lands on unmatched
       metrics and the flash is back on that one element. The @font-face
       declarations themselves carry no comma and are not stacks. */
    const stacks = (html.match(/--display:\s*Marcellus\s*,[^;"}]*/g) || [])
      .concat(html.match(/font-family:\s*'?Marcellus'?\s*,[^;"}]*/g) || []);
    for (const s of stacks) {
      if (!/^(--display|font-family):\s*'?Marcellus'?\s*,\s*'Marcellus Fallback'/.test(s)) {
        broken.push(`${page}: ${s.slice(0, 80)}`);
      }
    }
    if (!stacks.length && page !== 'submission-collage.html') broken.push(`${page}: loads the font but nothing uses it`);
    /* submission-collage.html is the exception, not a pass: it took the
       shared head wholesale and preloads a font its Helvetica composition
       never asks for. A wasted 15KB on an unlinked page, and this file's
       business is the flash, not the diet - noted here so the next reader
       does not re-discover it. */
  }
  assert.deepEqual(broken, [], broken.join('\n'));
});

test('the shared chrome falls onto the matched face too, and the counter never asks Marcellus for digits', () => {
  /* Two stragglers from the v1.242 sweep, both found chasing an odd zero.
     chrome.css keeps its own display token and the sweep covered pages
     only, so the footer's headings could still swap onto raw Georgia. And
     the visit odometer wore the display face at all: Marcellus has no
     lining or tabular figures (GSUB: frac, liga - nothing else), so its
     zero is an x-height ring wider than the tile and its 3s and 4s trail
     descenders - an odometer needs the instrument face, not the display
     one. */
  const css = fs.readFileSync(path.join(ROOT, 'assets', 'chrome.css'), 'utf8');
  assert.match(css, /--ff-display:Marcellus,'Marcellus Fallback','Marcellus Fallback Times',/,
    'the chrome display token routes through the matched fallbacks');
  assert.match(css, /\.pfa-tally__odo\{[^}]*font-family:var\(--ff-body\)/,
    'the wheels wear the body face, whose digits are lining and near-tabular');
});
