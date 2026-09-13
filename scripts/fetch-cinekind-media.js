#!/usr/bin/env node
'use strict';

/* Bring the CineKind ceremony photographs onto PFA's own server.
   ------------------------------------------------------------------------
   cinekind.html currently hot-links these from filmfederation.in. That is
   fragile in three separate ways:

     1. It spends the Federation's bandwidth every time a PFA page is opened.
     2. It breaks the moment they renumber or reorganise, with no warning —
        and because the <img> carries onerror, the picture simply vanishes
        rather than showing a broken image, so nobody notices.
     3. Many hosts refuse cross-origin image requests by checking the Referer
        header, which is the most likely reason these were blank.

   Run this once with a network connection. It downloads the files, and then
   `--rewrite` points the page at the local copies.

     node scripts/fetch-cinekind-media.js
     node scripts/fetch-cinekind-media.js --rewrite

   The numbers below are the CineKind set as published on
   https://filmfederation.in/events.php. 6 is deliberately absent: the source
   page's own thumbnail for it points at 5.jpg, so that file looks missing on
   their side too.

   These are the Federation's photographs. CineKind is co-presented by the
   Federation and PFA, so PFA is very likely entitled to use them — but that
   is a permission to confirm in writing, not to assume, and the credit line
   on the page should stay whatever happens.
   ------------------------------------------------------------------------ */

const fs = require('fs');
const path = require('path');
const https = require('https');

const HOST = 'https://filmfederation.in/images/events/cinekind';
const OUT = path.join(__dirname, '..', 'media', 'cinekind-2025', 'ffi');
const PAGE = path.join(__dirname, '..', 'cinekind.html');

/* Everything the source lists, so the whole set is available locally even if
   the page only shows some of it. */
const NUMBERS = [1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
                 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29];
const EXTRA = ['newspaper'];

function get(url, redirectsLeft = 3) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'PFA-site-build' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft) {
        res.resume();
        return resolve(get(new URL(res.headers.location, url).href, redirectsLeft - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function download() {
  fs.mkdirSync(OUT, { recursive: true });
  const names = NUMBERS.map(String).concat(EXTRA);
  const got = [];
  const failed = [];
  for (const name of names) {
    const file = path.join(OUT, `${name}.jpg`);
    try {
      const body = await get(`${HOST}/${name}.jpg`);
      if (body.length < 1024) throw new Error(`suspiciously small (${body.length} bytes)`);
      fs.writeFileSync(file, body);
      got.push(`${name}.jpg (${Math.round(body.length / 1024)} KB)`);
    } catch (error) {
      failed.push(`${name}.jpg — ${error.message}`);
    }
  }
  console.log(`Downloaded ${got.length} of ${names.length} into media/cinekind-2025/ffi/`);
  got.forEach((g) => console.log('  ok   ' + g));
  failed.forEach((f) => console.log('  FAIL ' + f));
  return { got, failed };
}

function rewrite() {
  const before = fs.readFileSync(PAGE, 'utf8');
  const after = before.replace(
    /https:\/\/(?:www\.)?filmfederation\.in\/images\/events\/cinekind\//g,
    'media/cinekind-2025/ffi/'
  );
  if (after === before) {
    console.log('cinekind.html already points at the local copies.');
    return;
  }
  fs.writeFileSync(PAGE, after);
  console.log('cinekind.html now points at media/cinekind-2025/ffi/.');
  console.log('The credit line under the gallery still names the Federation — leave it there.');
}

if (require.main === module) {
  (async () => {
    const { failed } = await download();
    if (process.argv.includes('--rewrite')) {
      if (failed.length) {
        console.log('\nNot rewriting: some files did not download, and a local path that');
        console.log('does not exist fails silently the same way the hot-link does.');
        process.exitCode = 1;
        return;
      }
      rewrite();
    } else {
      console.log('\nRe-run with --rewrite to point cinekind.html at the local copies.');
    }
  })().catch((error) => {
    console.error('Failed:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { NUMBERS, EXTRA, HOST };
