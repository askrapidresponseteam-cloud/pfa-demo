'use strict';

/* The Storage bucket refuses every browser (review D11, 8 Oct 2026).

   It holds the photographs and documents people send PFA, ID photos among
   them, under predictable paths (submissions/PFA-CG-2026-00001/1). Only the
   server touches it, with admin credentials that rules do not govern. Before
   storage.rules was in the repository, whether the bucket was private
   depended on which button was pressed when Storage was switched on. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

test('storage.rules denies every read and write, on every path', () => {
  const file = path.join(ROOT, 'storage.rules');
  assert.ok(fs.existsSync(file), 'storage.rules is missing');
  const rules = fs.readFileSync(file, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(rules, /rules_version\s*=\s*'2'/);
  assert.match(rules, /service firebase\.storage\s*\{\s*match \/b\/\{bucket\}\/o\s*\{\s*match \/\{allPaths=\*\*\}\s*\{\s*allow read, write: if false;\s*\}\s*\}\s*\}/,
    'one rule, over every object: no');
  const allows = rules.match(/allow [^;]*;/g) || [];
  assert.deepEqual(allows, ['allow read, write: if false;'], 'nothing else may be allowed');
});

test('firebase.json deploys storage.rules', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8'));
  const storage = [].concat(cfg.storage || []);
  assert.ok(storage.length, 'firebase.json has no "storage" key, so the rules are never deployed');
  for (const s of storage) assert.equal(s.rules, 'storage.rules');
});
