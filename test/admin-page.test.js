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
  assert.match(html, /identitytoolkit\.googleapis\.com/, 'the password sign-in talks to Google directly');
  /* "Continue with Google" is the one thing that fetches Firebase's own
     library, and only when that button is pressed (v1.399): the URL appears
     in the loader and nowhere in the page's markup. */
  const loads = html.match(/https:\/\/www\.gstatic\.com\/firebasejs\/[^'"]+/g) || [];
  assert.ok(loads.length > 0, 'the Google button loads Firebase sign-in on demand');
  assert.match(html, /on\('#googleGo', 'click'/, 'and only from the button');
});

test('the logo is not captioned with the organisation name', () => {
  const signin = html.slice(html.indexOf('<section class="signin"'), html.indexOf('</section>'));
  assert.match(signin, /<img alt="People for Animals"/);
  assert.ok(!/class="eyebrow"/.test(signin), 'the eyebrow under the logo is gone');
});

test('the hidden attribute is not overridden by a display rule', () => {
  /* .signin and .app both set display:grid, which beats the browser's own
     [hidden]{display:none}. Sign-in then "did nothing": the form stayed put
     and the panel rendered underneath it. */
  assert.match(html, /\[hidden\]\s*\{\s*display\s*:\s*none\s*!important\s*\}/,
    'admin.html needs a global [hidden]{display:none!important} rule');
});
