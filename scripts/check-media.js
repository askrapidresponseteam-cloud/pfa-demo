#!/usr/bin/env node
'use strict';

/* Which local files does the site ask for, and which of them are not here?

     npm run check:media

   Nine assets were referenced on cinekind.html alone and none of them existed:
   six honouree portraits and three videos. The pages hid the failures — the
   images carried `onerror`, the videos simply rendered an empty grey frame —
   so the only visible symptom was "a lot of placeholders", with nothing to say
   which files were wanted or where.

   This lists them, so the answer is a filename rather than a hunt. */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'test', 'scripts', '_inline-extracts']);

function pages() {
  return fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
}

/* Local, relative references only: an absolute URL is somebody else's problem
   and a data: URI is already inline. */
function referencedIn(html) {
  const found = new Set();
  const patterns = [
    /<(?:img|video|source|audio)[^>]+src="([^"]+)"/g,
    /<link[^>]+href="([^"]+\.(?:css|ico|png|svg|webp))"/g,
    /<script[^>]+src="([^"]+)"/g,
    /url\(\s*["']?([^"')]+\.(?:woff2?|png|jpe?g|webp|svg|gif))["']?\s*\)/g
  ];
  for (const pattern of patterns) {
    for (const m of html.matchAll(pattern)) {
      const url = m[1];
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\?)/i.test(url)) continue;   // external or inline
      /* Pages build markup by concatenation — src="' + esc(a.img) + '" — and
         those fragments are not paths. A real one has no quotes, spaces or
         operators in it. */
      if (/['"+()\s]/.test(url)) continue;
      found.add(url.replace(/^\//, '').split(/[?#]/)[0]);
    }
  }
  return found;
}

function check() {
  const missing = new Map();     // file -> [pages]
  for (const page of pages()) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    for (const asset of referencedIn(html)) {
      if (fs.existsSync(path.join(ROOT, asset))) continue;
      missing.set(asset, (missing.get(asset) || []).concat(page));
    }
  }
  return missing;
}

if (require.main === module) {
  const missing = check();
  if (!missing.size) {
    console.log('Every local file the pages ask for is present.');
  } else {
    console.log(`${missing.size} referenced file(s) are not in the tree:\n`);
    for (const [asset, on] of [...missing].sort()) {
      console.log(`  ${asset}`);
      console.log(`      wanted by: ${[...new Set(on)].join(', ')}`);
    }
    console.log('\nDrop the files in at those paths, or change the reference.');
  }
}

module.exports = { check, referencedIn, SKIP_DIRS };
