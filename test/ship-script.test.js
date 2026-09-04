'use strict';

/* scripts/ship.sh is the only way this site reaches production, so the things
   it gets wrong are invisible until something is already live.
 *
   The one it did get wrong: a hardcoded commit message. Every push from March
   to August said "v1.106: admin panel, firebase-admin subpath fix..." whatever
   was actually in it, which made the commit shown on a Vercel deployment
   useless for telling which build was running. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SHIP = path.join(ROOT, 'scripts', 'ship.sh');
const ship = fs.readFileSync(SHIP, 'utf8');

test('the ship script is valid bash', () => {
  execFileSync('bash', ['-n', SHIP]);
});

test('the commit message is read from the tree, never typed into the script', () => {
  assert.doesNotMatch(ship, /git commit -q -m "v[0-9]+\.[0-9]+/,
    'a version hardcoded here goes stale the moment the next build is cut');
  assert.match(ship, /git commit -q -m "\$MESSAGE"/);
  assert.match(ship, /pfa-build" content="v/, 'the version comes from the build stamp');
  assert.match(ship, /CHANGELOG\.md/, 'and the headline from the changelog');
});

test('the message it would produce names this build', () => {
  const version = /content="(v[0-9.]+)"/.exec(fs.readFileSync(path.join(ROOT, 'pfa-shop.html'), 'utf8'))[1];
  const built = execFileSync('bash', ['-c',
    'cd "$1" && ' +
    'VERSION="$(grep -o \'pfa-build" content="v[0-9.]*"\' pfa-shop.html | head -1 | sed \'s/.*content="//; s/"$//\')" && ' +
    'SUMMARY="$(awk \'/^- /{sub(/^- /,""); gsub(/\\*\\*/,""); sub(/\\. .*$/,""); sub(/\\.$/,""); print; exit}\' CHANGELOG.md)" && ' +
    'printf \'%s\' "$VERSION: $SUMMARY" | cut -c1-110',
    'sh', ROOT], { encoding: 'utf8' });
  assert.ok(built.startsWith(version + ': '), `expected the message to start with ${version}, got: ${built}`);
  assert.ok(built.length > version.length + 12, 'and to carry a real summary, not just a number');
  assert.ok(built.length <= 110, 'and to stay readable in a deployment list');
});

test('the build stamp and the changelog agree on the version', () => {
  const stamp = /content="(v[0-9.]+)"/.exec(fs.readFileSync(path.join(ROOT, 'pfa-shop.html'), 'utf8'))[1];
  const head = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8').split('\n')[0];
  assert.match(head, new RegExp('^## ' + stamp.replace('.', '\\.') + '\\b'),
    `the page says ${stamp} but the changelog opens with: ${head}`);
});

test('nothing is pushed before the tests have run and passed', () => {
  const testsAt = ship.indexOf('Running the tests');
  const pushAt = ship.indexOf('git push');
  assert.ok(testsAt > 0 && pushAt > testsAt, 'the test step must come before any push');
  assert.match(ship, /FAILED.*-gt 0/, 'the suite is green, so any failure stops the ship');
  assert.match(ship, /PASS.*-lt 500/, 'so does a collapse in the number passing');
});

test('the script never prints a secret', () => {
  assert.doesNotMatch(ship, /echo .*FIREBASE_SERVICE_ACCOUNT_JSON/);
  assert.doesNotMatch(ship, /echo .*PFA_RAZORPAY_KEY_SECRET|echo .*SHOPIFY_ADMIN_TOKEN/);
  assert.match(ship, /unset FIREBASE_SERVICE_ACCOUNT_JSON/, 'and clears the credential when it is done');
});
