'use strict';

/* Every name the server code takes from lib/firebase.js is one it exports.

   8 Oct 2026 (review D6): three public routes called firebase.db(), which
   lib/firebase.js has never exported. Each caught the TypeError and answered
   a 404 or an empty list, so nothing crashed and nothing was logged, and the
   only test stood in a fake firebase module that did have db(). The routes'
   own tests now use the real module; this one reads every file under lib/
   and api/ so the same mistake cannot sit unseen in a route nobody tests. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const exported = new Set(Object.keys(require('../lib/firebase')));

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

/* require('./firebase'), require('../../lib/firebase.js'), ... but never firebase-admin */
const REQ = String.raw`require\(\s*['"](?:\.{1,2}\/)+(?:lib\/)?firebase(?:\.js)?['"]\s*\)`;

function namesUsed(source) {
  const src = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const used = [];
  /* const { getDb, fieldValue: fv } = require('../firebase') */
  for (const m of src.matchAll(new RegExp(String.raw`\{([^{}]*)\}\s*=\s*${REQ}`, 'g'))) {
    for (const part of m[1].split(',')) { const name = part.split(':')[0].trim(); if (name) used.push(name); }
  }
  /* require('./firebase').getDb */
  for (const m of src.matchAll(new RegExp(String.raw`${REQ}\s*\.\s*([A-Za-z_$][\w$]*)`, 'g'))) used.push(m[1]);
  /* const firebase = require('../firebase'); ... firebase.getDb() */
  for (const m of src.matchAll(new RegExp(String.raw`(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*${REQ}`, 'g'))) {
    /* not "lib/firebase.js" in a string or a path */
    for (const u of src.matchAll(new RegExp(String.raw`(?<![\w$./'"-])${m[1]}\s*\.\s*([A-Za-z_$][\w$]*)`, 'g'))) used.push(u[1]);
  }
  return used;
}

test('the scan finds what it is looking for', () => {
  assert.deepEqual(namesUsed("const firebase = require('../firebase');\nconst db = firebase.db();").sort(), ['db']);
  assert.deepEqual(namesUsed("const { getDb, fieldValue: fv } = require('../../../lib/firebase');").sort(), ['fieldValue', 'getDb']);
  assert.deepEqual(namesUsed("require('./firebase').getDb();"), ['getDb']);
  assert.deepEqual(namesUsed("const { getApps } = require('firebase-admin/app');"), []);
  assert.deepEqual(namesUsed("const firebase = require('./firebase');\nconst note = 'see lib/firebase.js';\nfirebase.getDb();"), ['getDb']);
});

test('no file under lib/ or api/ uses a name lib/firebase.js does not export', () => {
  const wrong = [];
  let files = 0;
  for (const file of walk(path.join(ROOT, 'lib')).concat(walk(path.join(ROOT, 'api'))).filter((f) => f.endsWith('.js'))) {
    const used = namesUsed(fs.readFileSync(file, 'utf8'));
    if (used.length) files += 1;
    for (const name of used) if (!exported.has(name)) wrong.push(`${path.relative(ROOT, file)}: firebase.${name}`);
  }
  assert.ok(files >= 20, `the scan found only ${files} files using lib/firebase.js; the pattern has gone stale`);
  assert.deepEqual(wrong, [], `not exported by lib/firebase.js (it exports ${[...exported].join(', ')})`);
});
