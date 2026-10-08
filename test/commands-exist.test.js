'use strict';

/* Every command this repository can run has to name a file that is there.

   The shop removal deleted scripts/build-catalog.js and left it named in
   vercel.json's buildCommand. Nothing here read that field, so 532 tests, the
   linter and the site audit were all silent, and the first thing that noticed
   was Vercel, on the deployment:

     Error: Cannot find module '/vercel/path0/scripts/build-catalog.js'
     Command "node scripts/build-catalog.js && node scripts/minify.js" exited with 1

   A build that cannot start is the most expensive way to find a missing file,
   because it is found in production and nowhere earlier. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/* Any local .js or .sh a command hands to node, bash or sh. Bare words are
   ignored: those are binaries on the path, not files in this tree. */
function scriptsIn(command) {
  return [...String(command).matchAll(/(?:^|\s)(?:node|bash|sh)\s+([./][^\s&|;]+|scripts\/[^\s&|;]+)/g)]
    .map((m) => m[1]);
}

function missing(command) {
  return scriptsIn(command).filter((f) => !fs.existsSync(path.join(ROOT, f.replace(/^\.\//, ''))));
}

test('every command in vercel.json names a file that exists', () => {
  const cfg = JSON.parse(read('vercel.json'));
  const bad = [];
  for (const key of ['buildCommand', 'installCommand', 'devCommand', 'outputDirectory']) {
    if (typeof cfg[key] !== 'string') continue;
    missing(cfg[key]).forEach((f) => bad.push(`${key}: ${f}`));
  }
  assert.deepStrictEqual(bad, [],
    'the deployment would fail before it started:\n  ' + bad.join('\n  '));
});

test('every npm script names a file that exists', () => {
  const pkg = JSON.parse(read('package.json'));
  const bad = [];
  for (const [name, command] of Object.entries(pkg.scripts || {})) {
    missing(command).forEach((f) => bad.push(`npm run ${name}: ${f}`));
  }
  assert.deepStrictEqual(bad, [],
    'these scripts cannot run:\n  ' + bad.join('\n  '));
});

test('the build command is the one Vercel is told to run', () => {
  /* Guarding the pair, not the string: if the build ever needs a second step
     again, this still passes, and the test above still checks the file is
     there. */
  const cfg = JSON.parse(read('vercel.json'));
  assert.ok(/scripts\/minify\.js/.test(cfg.buildCommand),
    'the page build must still run, or dist/ is never written');
});
