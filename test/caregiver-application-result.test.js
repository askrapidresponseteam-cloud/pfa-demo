'use strict';

/* What a person is handed after paying the fifty rupees.

   Two rules, both easy to undo by accident:

   1. They leave with an application number. The reference was already being
      minted server-side and then dropped before it reached the page, so the
      applicant saw a CCAvenue transaction ID and nothing they could follow the
      application with.

   2. They are never handed a card. A colony caregiver card is issued from the
      admin panel after a named person reads the application. There is no
      end-user page that shows one, and this page must not link to one. */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanText, escapeHtml } = require('../lib/ccavenue');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'lib', 'routes', 'payment', 'response.js'), 'utf8');

/* Lift the pure render helpers out so the page can be rendered without
   Firestore or a live CCAvenue callback. */
function grab(signature) {
  const start = SRC.indexOf(signature);
  assert.notEqual(start, -1, `${signature} is gone from response.js`);
  let depth = 0;
  let i = SRC.indexOf('{', start);
  do {
    if (SRC[i] === '{') depth += 1;
    else if (SRC[i] === '}') depth -= 1;
    i += 1;
  } while (depth > 0);
  return SRC.slice(start, i);
}

const body = ['function row(', 'function money(', 'function safeJson(', 'function displayMetadata(', 'function renderResult(']
  .map(grab).join('\n');
const { renderResult } = new Function('crypto', 'cleanText', 'escapeHtml', `${body}; return { renderResult };`)(crypto, cleanText, escapeHtml);

function render({ type, applicationRef = '', cardId = '', status = 'success' }) {
  let html = '';
  renderResult(
    { setHeader() {}, end(out) { html = out; }, statusCode: 0 },
    'https://peopleforanimalsindia.org',
    { type, orderId: 'PFA-TXN-77', amount: 50, currency: 'INR', metadata: {} },
    { status, trackingId: 'CCA123', bankReference: 'BNK9' },
    '',
    { cardId, trackingId: '' },
    applicationRef
  );
  return html;
}

test('a paid application ends with its number on the page', () => {
  const html = render({ type: 'caregiver-application', applicationRef: 'PFA-CG-2026-00012' });
  assert.match(html, /PFA-CG-2026-00012/, 'the applicant was not shown the number they must quote');
  assert.match(html, /Application number/, 'the number is on the page but unlabelled');
});

test('the page says plainly that the card is not issued yet', () => {
  const html = render({ type: 'caregiver-application', applicationRef: 'PFA-CG-2026-00012' });
  assert.match(html, /not issued on the spot/i, 'nothing tells the applicant a person still has to decide');
});

test('no payment outcome ever offers the end user a card', () => {
  /* Including the retired shipping flow, where a card genuinely does exist:
     issuing and showing it belong to the admin panel. */
  const cases = [
    { type: 'caregiver-application', applicationRef: 'PFA-CG-2026-00012' },
    { type: 'caregiver', cardId: 'PFA-CCT-4K2M8QRT' },
    { type: 'donate' },
    { type: 'send' }
  ];
  for (const one of cases) {
    const html = render(one);
    assert.doesNotMatch(html, /caregiver-card\.html/,
      `${one.type} hands the end user a card link`);
    assert.doesNotMatch(html, /Open Colony Caregiver Card/,
      `${one.type} offers to open a card`);
  }
});

test('every button on the result page goes somewhere that exists', () => {
  /* give.html and caregiver.html have never shipped. Both were linked from
     here, so a completed payment ended on a 404. */
  const root = path.join(__dirname, '..');
  const pages = new Set(fs.readdirSync(root).filter((f) => f.endsWith('.html')));
  for (const type of ['caregiver-application', 'caregiver', 'donate', 'send']) {
    const html = render({ type, applicationRef: 'PFA-CG-2026-00012', cardId: 'PFA-CCT-4K2M8QRT' });
    for (const [, href] of html.matchAll(/href="https:\/\/peopleforanimalsindia\.org\/([^"#]+)(?:#[^"]*)?"/g)) {
      assert.ok(pages.has(href), `${type} links to ${href}, which does not exist`);
    }
  }
});

test('the reference reaches the page rather than being minted and dropped', () => {
  assert.match(SRC, /function renderResult\([^)]*applicationRef/,
    'renderResult no longer takes the application reference');
  assert.match(SRC, /caregiver-application/,
    'the application is no longer given its own wording');

  /* The original bug was not in renderResult. The reference was minted, stored
     on the transaction, and then simply not passed at the one call site, so the
     page rendered without it. Rendering the function directly, as the tests
     above do, would never catch that. Check the call itself. */
  const call = SRC.match(/return renderResult\(([\s\S]*?)\n {4}\);/);
  assert.ok(call, 'the renderResult call site has changed shape');
  assert.match(call[1], /\bapplicationRef\b/,
    'the application reference is minted but never handed to the page');

  const minted = SRC.match(/applicationRef = await recordCaregiverApplication/);
  assert.ok(minted, 'the application reference is no longer minted on payment');
});
