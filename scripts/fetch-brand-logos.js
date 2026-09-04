#!/usr/bin/env node
'use strict';
/* Downloads brand logos listed in img/brands/sources.txt into img/brands/,
   one file per collection handle, then rebuilds assets/brand-logos.js.

   Run on a machine with internet:  npm run fetch:logos
   Add --force to re-download files that already exist.

   A file that is already there is kept (so a press-kit SVG you dropped in by
   hand is never overwritten by a fetched PNG). A URL that fails, redirects
   somewhere odd, or does not return an image is reported and skipped. The
   script never exits non-zero: a missing logo is a name on the band, not a
   broken build. */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'img', 'brands');
const SOURCES = path.join(DIR, 'sources.txt');
const FORCE = process.argv.includes('--force');
const EXT = { 'image/svg+xml': '.svg', 'image/png': '.png', 'image/webp': '.webp', 'image/jpeg': '.jpg' };
const TIMEOUT_MS = 15000;

function get(url, hops = 0) {
  return new Promise((resolve, reject) => {
    if (hops > 5) return reject(new Error('too many redirects'));
    const lib = url.startsWith('https:') ? https : http;
    const req = lib.get(url, { headers: { 'User-Agent': 'PFA-Logo-Fetch/1.0', Accept: 'image/*' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(get(new URL(res.headers.location, url).toString(), hops + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      const type = String(res.headers['content-type'] || '').split(';')[0].trim();
      const ext = EXT[type];
      if (!ext) { res.resume(); return reject(new Error('not an image (' + (type || 'no content-type') + ')')); }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ ext, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error('timed out')));
    req.on('error', reject);
  });
}

function existing(handle) {
  return fs.readdirSync(DIR).find((f) => /\.(svg|png|webp|jpg|jpeg)$/i.test(f) && path.basename(f, path.extname(f)).toLowerCase() === handle);
}

(async () => {
  let lines = [];
  try { lines = fs.readFileSync(SOURCES, 'utf8').split('\n'); } catch (_) { console.log('no img/brands/sources.txt; nothing to fetch'); }
  const wanted = lines.map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.split(/\s+/)).filter((p) => p.length === 2);
  let got = 0, kept = 0, failed = 0;
  for (const [rawHandle, url] of wanted) {
    const handle = rawHandle.toLowerCase();
    if (!/^[a-z0-9-]+$/.test(handle)) { console.log('  skip  ' + rawHandle + ' (not a collection handle)'); failed += 1; continue; }
    const have = existing(handle);
    if (have && !FORCE) { kept += 1; continue; }
    try {
      const { ext, body } = await get(url);
      if (body.length < 200) throw new Error('empty file');
      if (have) fs.unlinkSync(path.join(DIR, have));
      fs.writeFileSync(path.join(DIR, handle + ext), body);
      console.log('  saved ' + handle + ext + ' (' + Math.round(body.length / 1024) + ' KB)');
      got += 1;
    } catch (error) {
      console.log('  FAILED ' + handle + ': ' + (error && error.message) + '  <- ' + url);
      failed += 1;
    }
  }
  const map = require('./build-brand-logos.js')();
  console.log(`brand logos: ${got} fetched, ${kept} already here, ${failed} failed; ${Object.keys(map).length} on the band`);
  process.exit(0);
})();
