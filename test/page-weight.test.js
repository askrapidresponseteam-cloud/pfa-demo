'use strict';
/* The homepage shipped at 53KB for its whole life and arrived one morning at
   seventeen megabytes, wearing a splash screen nobody here wrote (4 Sep
   2026) - something outside this repository deployed over the site. A page
   that gains three hundred times its weight is not a style choice; it is a
   foreign object, and the ship must refuse it the way it refuses a failing
   test. The ceiling is set at 400KB: the heaviest page ever written here is
   laws.html at 212KB, so there is honest headroom for growth and none at
   all for a payload. Media belongs in img/ and fonts/, where files are
   cached and pages stay text. */
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const ROOT = path.join(__dirname, '..');
const CEILING = 400 * 1024;

test('no page weighs more than the ceiling, so a foreign payload cannot ride a ship', () => {
  const heavy = [];
  for (const f of fs.readdirSync(ROOT).filter((n) => n.endsWith('.html'))) {
    const size = fs.statSync(path.join(ROOT, f)).size;
    if (size > CEILING) heavy.push(`${f}: ${Math.round(size / 1024)}KB`);
  }
  assert.deepEqual(heavy, [], `pages over ${CEILING / 1024}KB:\n${heavy.join('\n')}`);
});

test('no page embeds media as base64, which is how pages get fat quietly', () => {
  const offenders = [];
  for (const f of fs.readdirSync(ROOT).filter((n) => n.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const blobs = html.match(/;base64,[A-Za-z0-9+/=]{10000,}/g) || [];
    if (blobs.length) offenders.push(`${f}: ${blobs.length} embedded blob(s)`);
  }
  assert.deepEqual(offenders, [], offenders.join('\n'));
});
