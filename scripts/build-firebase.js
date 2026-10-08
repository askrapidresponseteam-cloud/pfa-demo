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
/* resources/ holds the library's documents, the PDFs PFA supplied. */
const PUBLIC_DIRS = ['assets', 'fonts', 'img', 'media', '.well-known', 'resources'];
const PUBLIC_FILES = [
  'pfa-search.js', 'pfa-search.css', 'pfa-forms.js',
  'search-index.json', 'search-index.js', 'sitemap.xml', 'robots.txt'
];
/* Never published, whatever else happens. product.html is a template the
   function renders; admin.html is the panel and is served, but every route
   behind it checks the admin token server-side. */
const NEVER = new Set(['product.html']);

/* ---- what the function needs ----------------------------------------- */
const FN_DIRS = ['api', 'lib'];
/* product.html is vercel.json's includeFiles. The two assets/ files are the
   validation rules and district list that lib/ shares with the browser and
   loads as ../assets/<file>. Vercel ships the whole tree so they were always
   there; this bundle ships only what is named, and until 7 Oct 2026 they were
   not named, so every route on the Firebase deployment died on load with
   "Cannot find module '../assets/field-rules.js'" and the panel reported that
   it could not reach /api/admin. checkRequires() below now stops the build if
   anything lib/ or api/ loads is missing from the bundle. */
const FN_FILES = ['product.html', 'assets/field-rules.js', 'assets/india-districts.js', 'assets/site-modules.json'];

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

/* Every relative require() in the bundled api/ and lib/ must resolve inside
   functions/, or that route crashes on Firebase while working on Vercel. */
function checkRequires() {
  const missing = [];
  const resolves = (p) => [p, p + '.js', p + '.json', path.join(p, 'index.js')].some((c) => fs.existsSync(c) && fs.statSync(c).isFile());
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(full); continue; }
      if (!e.name.endsWith('.js')) continue;
      const src = fs.readFileSync(full, 'utf8');
      const re = /require\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;
      let m;
      while ((m = re.exec(src))) {
        const target = path.resolve(path.dirname(full), m[1]);
        if (!resolves(target)) missing.push(`${path.relative(FN, full)} -> ${m[1]}`);
      }
    }
  };
  for (const dir of FN_DIRS) walk(path.join(FN, dir));
  return missing;
}

function build() {
  rmrf(PUBLIC);
  rmrf(path.join(FN, 'api'));
  rmrf(path.join(FN, 'lib'));
  rmrf(path.join(FN, 'assets'));
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
    if (!fs.existsSync(from)) continue;
    fs.mkdirSync(path.dirname(path.join(FN, file)), { recursive: true });
    fs.copyFileSync(from, path.join(FN, file)); server += 1;
  }

  const missing = checkRequires();
  if (missing.length) {
    console.error('\nREFUSING TO BUILD: the function loads files that are not in functions/\n  ' + missing.join('\n  ')
      + '\nAdd them to FN_FILES in scripts/build-firebase.js.');
    process.exit(1);
  }

  /* The guard that matters: nothing server-side may have reached public/. */
  const leaked = [];
  const walk = (dir, rel = '') => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else if (/^(lib|api|test|scripts|functions|_inline-extracts|tools)\//.test(r)
               || /(firestore|storage)\.(rules|indexes)/.test(r)
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
module.exports = { build, checkRequires, PUBLIC_DIRS, PUBLIC_FILES, NEVER };
