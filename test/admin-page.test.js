'use strict';

/* The admin sign-in page once waited for a readiness flag that the sign-in
   script no longer set, so after six seconds every visit was told the
   "Firebase sign-in library could not be loaded" and the button was disabled.
   These pin the page so the guard and the script cannot drift apart again. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');

test('every readiness flag the admin page waits for is one the sign-in script sets', () => {
  const setFlags = new Set([...html.matchAll(/window\.(\w+)\s*=\s*true/g)].map((m) => m[1]));
  const waitedFor = [...html.matchAll(/!window\.(\w+)/g)].map((m) => m[1]).filter((name) => /ready/i.test(name));
  assert.ok(waitedFor.length > 0, 'the page should still watch for the script starting');
  for (const flag of waitedFor) {
    assert.ok(setFlags.has(flag), `the page waits for window.${flag} but nothing sets it`);
  }
});

test('sign-in does not depend on a CDN-hosted library', () => {
  assert.ok(!/<script[^>]+gstatic\.com/.test(html), 'no script is loaded from gstatic');
  assert.ok(!/could not be loaded/.test(html), 'no library-load error is left to fire');
  assert.match(html, /identitytoolkit\.googleapis\.com/);
});

test('the logo is not captioned with the organisation name', () => {
  const signin = html.slice(html.indexOf('<section class="signin"'), html.indexOf('</section>'));
  assert.match(signin, /<img alt="People for Animals"/);
  assert.ok(!/class="eyebrow"/.test(signin), 'the eyebrow under the logo is gone');
});
