#!/usr/bin/env node
'use strict';

/* Assembles the two directories `firebase deploy` needs, from an allowlist.
 *
 *   public/       what the world may download
 *   functions/    the API, wrapped as one Cloud Function
 *
 * An allowlist, not an ignore list, and deliberately. Firebase Hosting can be
 * pointed at "." with an "ignore" array, and one missing entry there publishes
 * lib/ccavenue.js, api/index.js and firestore.rules as static files anyone can
 * fetch. Naming what ships means a new server file is private by default; the
 * failure mode of a forgotten entry is a missing asset, not a leaked key.
 *
 *   node scripts/build-firebase.js
 *   firebase deploy --project pfa-new-website
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const FN = path.join(ROOT, 'functions');

/* ---- what the world may download ------------------------------------- */
const PUBLIC_DIRS = ['assets', 'fonts', 'img', 'media'];
const PUBLIC_FILES = [
  'pfa-search.js', 'pfa-search.css', 'pfa-forms.js',
  'search-index.json', 'sitemap.xml', 'robots.txt'
];
/* Never published, whatever else happens. product.html is a template the
   function renders; admin.html is the panel and is served, but every route
   behind it checks the admin token server-side. */
const NEVER = new Set(['product.html']);

/* ---- what the function needs ----------------------------------------- */
const FN_DIRS = ['api', 'lib'];
const FN_FILES = ['product.html'];   // vercel.json's includeFiles, same list

function rmrf(dir) { fs.rmSync(dir, { recursive: true, force: true }); }

function copyDir(from, to) {
  let n = 0;
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    /* Documentation is not content. A README sitting beside media files should
       not become a URL. */
    if (entry.name === 'node_modules' || entry.name.startsWith('.') || entry.name.endsWith('.md')) continue;
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) n += copyDir(src, dst);
    else { fs.copyFileSync(src, dst); n += 1; }
  }
  return n;
}

function build() {
  rmrf(PUBLIC);
  rmrf(path.join(FN, 'api'));
  rmrf(path.join(FN, 'lib'));
  fs.mkdirSync(PUBLIC, { recursive: true });
  fs.mkdirSync(FN, { recursive: true });

  let pages = 0;
  for (const file of fs.readdirSync(ROOT)) {
    if (!file.endsWith('.html') || NEVER.has(file)) continue;
    fs.copyFileSync(path.join(ROOT, file), path.join(PUBLIC, file));
    pages += 1;
  }

  let assets = 0;
  for (const dir of PUBLIC_DIRS) {
    const from = path.join(ROOT, dir);
    if (fs.existsSync(from)) assets += copyDir(from, path.join(PUBLIC, dir));
  }
  for (const file of PUBLIC_FILES) {
    const from = path.join(ROOT, file);
    if (fs.existsSync(from)) { fs.copyFileSync(from, path.join(PUBLIC, file)); assets += 1; }
  }

  let server = 0;
  for (const dir of FN_DIRS) server += copyDir(path.join(ROOT, dir), path.join(FN, dir));
  for (const file of FN_FILES) {
    const from = path.join(ROOT, file);
    if (fs.existsSync(from)) { fs.copyFileSync(from, path.join(FN, file)); server += 1; }
  }

  /* The guard that matters: nothing server-side may have reached public/. */
  const leaked = [];
  const walk = (dir, rel = '') => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else if (/^(lib|api|test|scripts|functions|_inline-extracts|tools)\//.test(r)
               || /firestore\.(rules|indexes)/.test(r)
               || r === 'package.json' || r === 'package-lock.json' || r === 'vercel.json'
               || r === 'firebase.json' || r.endsWith('.md')) leaked.push(r);
    }
  };
  walk(PUBLIC);
  if (leaked.length) {
    console.error('\nREFUSING TO BUILD: server files reached public/\n  ' + leaked.join('\n  '));
    process.exit(1);
  }

  console.log(`public/     ${pages} pages, ${assets} assets`);
  console.log(`functions/  ${server} server files`);
  console.log('nothing server-side in public/  (checked, not assumed)');
}

if (require.main === module) build();
module.exports = { build, PUBLIC_DIRS, PUBLIC_FILES, NEVER };
