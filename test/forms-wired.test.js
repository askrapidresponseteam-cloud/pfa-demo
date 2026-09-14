'use strict';

/* Three forms on this site validated their fields and then showed a
   thank-you without sending anything. Someone nominating a film-maker or
   submitting a rescue video was told it had been received when nothing had
   been recorded. These tests exist so that cannot come back. */

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');
const S = require('../lib/submissions.js');
const RULES = require('../assets/field-rules.js');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const FORMS = [
  { page: 'events.html', kind: 'PFA-EV', id: 'eventForm' },
  { page: 'wall.html', kind: 'PFA-S', id: 'wallForm' }
];

test('every form posts to the submissions API with a kind the server knows', () => {
  for (const form of FORMS) {
    const html = read(form.page);
    assert.match(html, new RegExp(`id="${form.id}"`), `${form.page} must still have its form`);
    assert.match(html, new RegExp(`'${form.kind}'`), `${form.page} must send ${form.kind}`);
    assert.ok(S.KIND_LABELS[form.kind], `${form.kind} must be a kind the server accepts`);
    assert.match(html, /pfa-forms\.js/, `${form.page} must load the shared helper`);
  }
});

test('the helper is loaded before the code that uses it', () => {
  /* A deferred script runs after the document is parsed — that is, after the
     inline script at the end of the body. It would leave the form dead. */
  for (const form of FORMS) {
    const html = read(form.page);
    const tag = html.match(/<script src="pfa-forms\.js"([^>]*)>/);
    assert.ok(tag, `${form.page} must load the helper`);
    assert.ok(!/\bdefer\b|\basync\b/.test(tag[1]),
      `${form.page} loads the helper deferred, so it would not exist when the page wires the form`);
    assert.ok(html.indexOf('pfa-forms.js') < html.lastIndexOf('<script>'),
      `${form.page} must load the helper before its inline script`);
  }
});

test('no form claims success without a reference from the server', () => {
  const helper = read('pfa-forms.js');
  assert.match(helper, /if \(!payload\.reference\)/, 'the helper must refuse a response with no reference');
  for (const form of FORMS) {
    const html = read(form.page);
    assert.match(html, /reference/i, `${form.page} must show the reference it was given`);
  }
  /* The specific claims that used to be made without sending anything. Checked
     against the code, not the comments: the comment explaining the fix quotes
     the old string, and matching that reported the fix as the bug. */
  const strip = (html) => html.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
  /* The nomination form has been withdrawn for now. The check that it never
     thanked anyone falsely still holds, and holds more simply: there is no
     nomination form on the page at all. */
  assert.ok(!/nomForm|Send nomination|PFA-CK/.test(read('cinekind.html')),
    'the nomination form is back on cinekind without its wiring being reviewed');
  assert.ok(!/You will hear back within 48 hours/.test(strip(read('wall.html'))),
    'the wall used to promise a reply to a submission it never sent');
});

test('a missing helper disables the form instead of leaving a dead button', () => {
  for (const page of ['events.html']) {
    assert.match(read(page), /!window\.PFAForms/,
      `${page} must notice if the helper did not load`);
  }
});

test('what each form sends passes the server\u2019s own field rules', () => {
  const payloads = {
    'PFA-EV': { title: 'An adoption drive', city: 'Udupi', address: 'Koteshwara ground',
      name: 'Asha Rao', mobile: '9876543210', email: 'asha@example.com', notes: 'About 40 dogs' },
    'PFA-S': { url: 'https://www.youtube.com/watch?v=abc', title: 'long', name: 'Asha Rao',
      mobile: '9876543210', notes: 'Consent given.' }
  };
  for (const [kind, data] of Object.entries(payloads)) {
    for (const [field, value] of Object.entries(data)) {
      const error = RULES.checkField(field, value, { required: false });
      assert.ok(!error, `${kind} sends ${field}, which the server rejects: ${error}`);
    }
  }
});

test('the event request kind is registered and mints a sane reference', () => {
  assert.equal(S.KIND_LABELS['PFA-EV'], 'Event request');
  assert.equal(S.formatReference('PFA-EV', 2026, 42), 'PFA-EV-2026-00042');
});
