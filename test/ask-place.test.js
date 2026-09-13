'use strict';
/* The ask form routes an answer to the unit nearest the person, so where they
   are is not decoration. It was one optional free-text box: a question could
   arrive from nowhere in particular, or from a city that is not in the state
   beside it, and neither can be pointed at a unit.

   Both halves are held here. The browser must not be able to compose a bad
   pair, and the API must refuse one anyway, because a form is a convenience
   and the endpoint is the rule. */
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'ask.html'), 'utf8');
const DISTRICTS_JS = fs.readFileSync(path.join(ROOT, 'assets', 'india-districts.js'), 'utf8');
const INDIA = require(path.join(ROOT, 'assets', 'india-districts.js'));
const { validate } = require(path.join(ROOT, 'lib', 'submission-fields.js'));

/* jsdom does not fetch <script src>, so the shared module is inlined where the
   page links it: same code, same order, same global. */
function page() {
  const tag = '<script src="assets/india-districts.js"></script>';
  assert.ok(html.includes(tag), 'ask.html must link the shared district module');
  const dom = new JSDOM(html.replace(tag, `<script>${DISTRICTS_JS}</script>`),
    { runScripts: 'dangerously', url: 'https://pfa.test/ask.html' });
  const $ = (q) => dom.window.document.querySelector(q);
  return { dom, $, w: dom.window };
}
const change = (w, el) => el.dispatchEvent(new w.Event('change', { bubbles: true }));

test('the place is asked for as two lists, not one free box', () => {
  assert.match(html, /<select id="state" name="state" required>/, 'state is chosen');
  assert.match(html, /<select id="city" name="city" required disabled/, 'so is the city, and it waits for the state');
  assert.ok(!/<input id="city"/.test(html), 'the free box is gone, and with it any pair at all');
});

test('the city list waits for a state, then holds only that state\'s', () => {
  const p = page();
  assert.equal(p.$('#city').disabled, true, 'there is no right city before there is a state');
  p.$('#state').value = 'Karnataka';
  change(p.w, p.$('#state'));
  assert.equal(p.$('#city').disabled, false);
  const shown = [...p.$('#city').options].map((o) => o.value).filter(Boolean);
  assert.deepEqual(shown, INDIA.districtsOf('Karnataka'));
});

test('changing the state drops a city that state does not have', () => {
  const p = page();
  p.$('#state').value = 'Karnataka';
  change(p.w, p.$('#state'));
  p.$('#city').value = 'Udupi';
  p.$('#state').value = 'Punjab';
  change(p.w, p.$('#state'));
  assert.equal(p.$('#city').value, '', 'Udupi is not in Punjab and must not survive the move');
});

/* The submit handler stands down early when PFAForms has not loaded, so
   without this stub the form never reaches its own checks and a test would
   pass by never having asked anything. It also records what was sent. */
function armed() {
  const p = page();
  p.sent = [];
  p.w.PFAForms = { submit: (kind, data) => { p.sent.push({ kind, data }); return new p.w.Promise(() => {}); } };
  p.fill = (place) => {
    p.$('#question').value = 'Can I feed the dogs in my society every evening?';
    p.$('#topic').value = 'Animal law';
    p.$('#name').value = 'Asha Rao';
    p.$('#email').value = 'asha@example.in';
    p.$('#consent').checked = true;
    if (place) {
      p.$('#state').value = place[0];
      change(p.w, p.$('#state'));
      p.$('#city').value = place[1];
    }
  };
  p.send = () => p.$('#askForm').dispatchEvent(new p.w.Event('submit', { bubbles: true, cancelable: true }));
  return p;
}

test('the form will not send without a place', () => {
  const p = armed();
  p.fill(null);
  p.send();
  assert.equal(p.sent.length, 0, 'a question with no place cannot be pointed at a unit');
  assert.ok(p.$('#state').closest('.field').classList.contains('is-bad'), 'and the state has to say so');
  assert.ok(p.$('#city').closest('.field').classList.contains('is-bad'));
});

test('the form will not send a city the state does not have', () => {
  /* Reachable by choosing a city and then changing the state with the
     keyboard, which fires no change event on the city. */
  const p = armed();
  p.fill(['Karnataka', 'Udupi']);
  p.$('#state').value = 'Punjab';          /* moved without rebuilding the list */
  p.send();
  assert.equal(p.sent.length, 0, 'Punjab with Udupi under it must not leave the page');
  assert.match(p.$('#city').closest('.field').querySelector('.err').textContent, /not in Punjab/);
});

test('a real pair sends, and the place travels with the question', () => {
  const p = armed();
  p.fill(['Karnataka', 'Udupi']);
  p.send();
  assert.equal(p.sent.length, 1, 'nothing else should have been in the way');
  assert.equal(p.sent[0].kind, 'PFA-Q');
  assert.equal(p.sent[0].data.state, 'Karnataka');
  assert.equal(p.sent[0].data.city, 'Udupi');
});

/* ---------------------------------------------------------------- server --- */

const askable = (extra) => Object.assign({
  question: 'Can I feed the dogs in my society every evening?',
  topic: 'Animal law', name: 'Asha Rao', email: 'asha@example.in'
}, extra);
const fieldsOf = (data) => validate('PFA-Q', data).errors.map((e) => e.field);

test('the API requires the place, whatever the form does', () => {
  /* A form is a convenience. Anyone can post to the endpoint directly, and
     before this it would take a question from nowhere. */
  const errs = fieldsOf(askable());
  assert.ok(errs.includes('state'), 'no state must be refused');
  assert.ok(errs.includes('city'), 'and no city with it');
});

test('the API refuses a city that is not in the state given', () => {
  const errs = fieldsOf(askable({ state: 'Punjab', city: 'Udupi' }));
  assert.deepEqual(errs, ['city'], 'the pair is wrong, and it is the city that is wrong in it');
  const message = validate('PFA-Q', askable({ state: 'Punjab', city: 'Udupi' }))
    .errors.find((e) => e.field === 'city').message;
  assert.match(message, /not in the state/);
});

test('a real pair passes', () => {
  assert.deepEqual(fieldsOf(askable({ state: 'Karnataka', city: 'Udupi' })), []);
});

test('a missing half is reported once, as missing, not as a broken pair', () => {
  /* Two errors on one field is a form that says the same thing twice in
     different words. Absence belongs to the required rules; the pair check
     only speaks when both halves arrived. */
  const errs = validate('PFA-Q', askable({ state: 'Karnataka' })).errors.filter((e) => e.field === 'city');
  assert.equal(errs.length, 1);
  assert.match(errs[0].message, /Choose your district or city/);
});

test('surrounding space does not turn a real pair into a rejection', () => {
  /* A value can reach the API from a form, a saved draft or a hand-written
     link, and " Udupi" failing against "Udupi" would be a bug wearing the
     costume of a rejection. */
  assert.deepEqual(fieldsOf(askable({ state: ' Karnataka ', city: ' Udupi ' })), []);
});

test('the browser and the API read the one table', () => {
  assert.match(html, /<script src="assets\/india-districts\.js"><\/script>/, 'the page links it');
  const server = fs.readFileSync(path.join(ROOT, 'lib', 'submission-fields.js'), 'utf8');
  assert.match(server, /require\('\.\.\/assets\/india-districts\.js'\)/, 'the API requires it');
  assert.ok(!/var DISTRICTS *= *\{/.test(html), 'and the page keeps no copy that could drift from it');
});
