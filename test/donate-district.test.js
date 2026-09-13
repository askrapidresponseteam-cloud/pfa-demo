'use strict';
/* The food order asks where the feed should go, and PFA matches it to a
   volunteer serving that place. The district was free text, so Punjab with
   Udupi typed underneath it was accepted, saved, and paid for: an order to a
   pair that does not exist cannot be matched to anyone, and the feed is
   bought and goes nowhere. These hold the two fields to a real place.

   The list is a snapshot of an administrative geography that changes, so the
   checks here are about the pairing being enforced and the data agreeing with
   itself, not about any one district being current. */
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'donate.html'), 'utf8');

/* The table as the site ships it. One file, read by this page, by the ask
   page and by the API, rather than a second copy here that could agree with
   nothing. */
const INDIA = require(path.join(ROOT, 'assets', 'india-districts.js'));
const DISTRICTS_JS = fs.readFileSync(path.join(ROOT, 'assets', 'india-districts.js'), 'utf8');
function districts() {
  const out = {};
  for (const s of INDIA.STATES) out[s] = INDIA.districtsOf(s);
  return out;
}

function states() {
  const m = /var STATES = (\[[\s\S]*?\]);/.exec(html);
  return new Function(`return ${m[1]}`)();
}

test('the geography is one file, not a copy per page', () => {
  /* Two copies of a geography drift, and the day they drift is the day a
     donor picks a district the server then refuses. */
  assert.match(html, /<script src="assets\/india-districts\.js"><\/script>/, 'donate.html links it');
  assert.ok(!/var DISTRICTS=\{/.test(html), 'and holds no copy of its own');
  const server = fs.readFileSync(path.join(ROOT, 'lib', 'submission-fields.js'), 'utf8');
  assert.match(server, /require\('\.\.\/assets\/india-districts\.js'\)/, 'and the API reads the same file');
});

test('the district is chosen from a list, never typed', () => {
  assert.match(html, /<select id="fDist" disabled>/,
    'a text input here is what let a district be paired with any state at all');
  assert.ok(!/<input id="fDist"/.test(html), 'and the input it replaced is gone');
});

test('every state the donor can choose has districts to choose from', () => {
  const D = districts();
  const missing = states().filter((s) => !D[s] || !D[s].length);
  assert.deepEqual(missing, [], `these states offer an empty list: ${missing.join(', ')}`);
});

test('the table names no state the donor cannot choose', () => {
  /* A district list under a state absent from the dropdown is unreachable,
     and usually means a name that drifted: "Delhi (NCT)" against "Delhi". */
  const S = new Set(states());
  const stray = Object.keys(districts()).filter((s) => !S.has(s));
  assert.deepEqual(stray, [], `unreachable: ${stray.join(', ')}`);
});

test('the table carries the reorganisations the source data predates', () => {
  const D = districts();
  /* Ladakh separated from Jammu and Kashmir in 2019. Both halves have to be
     right: a Ladakh that exists, and a J&K that no longer claims its two. */
  assert.deepEqual(D['Ladakh'].slice().sort(), ['Kargil', 'Leh']);
  assert.ok(!D['Jammu and Kashmir'].includes('Leh'), 'Leh is in Ladakh now');
  assert.ok(!D['Jammu and Kashmir'].includes('Kargil'), 'Kargil is in Ladakh now');
  /* The two union territories merged in 2020. */
  assert.deepEqual(D['Dadra and Nagar Haveli and Daman and Diu'].slice().sort(),
    ['Dadra and Nagar Haveli', 'Daman', 'Diu']);
  /* Absent from the source entirely. */
  assert.ok(D['Andaman and Nicobar Islands'].includes('South Andaman'));
});

test('no district is listed with leading, trailing or doubled spaces', () => {
  /* The submitted value is compared against this list character for
     character, so a stray space is a district that can be chosen and then
     fails the check on the way to payment. */
  const D = districts();
  const bad = [];
  for (const [s, list] of Object.entries(D)) {
    for (const d of list) if (d !== d.trim() || /\s{2,}/.test(d)) bad.push(`${s}: "${d}"`);
  }
  assert.deepEqual(bad, [], bad.join('; '));
});

/* ------------------------------------------------------------- behaviour --- */

/* jsdom does not fetch <script src>, so the shared module is inlined where
   the page links it. Same code, same order, same global. */
function withDistricts(markup) {
  const tag = '<script src="assets/india-districts.js"></script>';
  assert.ok(markup.includes(tag), 'the page must link the shared district module');
  return markup.replace(tag, `<script>${DISTRICTS_JS}</script>`);
}

function page() {
  const dom = new JSDOM(withDistricts(html), { runScripts: 'dangerously', url: 'https://pfa.test/donate.html' });
  const $ = (q) => dom.window.document.querySelector(q);
  return { dom, $, w: dom.window };
}

function change(w, el) { el.dispatchEvent(new w.Event('change', { bubbles: true })); }
function input(w, el) { el.dispatchEvent(new w.Event('input', { bubbles: true })); }

test('the district stays shut until a state is chosen', () => {
  const p = page();
  assert.equal(p.$('#fDist').disabled, true, 'there is no correct district before there is a state');
  p.$('#fState').value = 'Karnataka';
  change(p.w, p.$('#fState'));
  assert.equal(p.$('#fDist').disabled, false);
});

test('choosing a state offers that state\'s districts and no others', () => {
  const p = page();
  p.$('#fState').value = 'Karnataka';
  change(p.w, p.$('#fState'));
  const shown = [...p.$('#fDist').options].map((o) => o.value).filter(Boolean);
  const D = districts();
  assert.deepEqual(shown, D['Karnataka'], 'the list must be exactly this state\'s');
  assert.ok(!shown.some((d) => D['Punjab'].includes(d)), 'and hold nothing from another state');
});

test('changing the state drops a district that state does not have', () => {
  /* The reported shape: Udupi picked under Karnataka, then the state moved to
     Punjab, and the pair went to the volunteer matcher as it stood. */
  const p = page();
  p.$('#fState').value = 'Karnataka';
  change(p.w, p.$('#fState'));
  p.$('#fDist').value = 'Udupi';
  change(p.w, p.$('#fDist'));
  assert.equal(p.$('#fDist').value, 'Udupi');

  p.$('#fState').value = 'Punjab';
  change(p.w, p.$('#fState'));
  assert.equal(p.$('#fDist').value, '', 'Udupi is not in Punjab, so it cannot survive the move');
  assert.ok(![...p.$('#fDist').options].some((o) => o.value === 'Udupi'));
});

test('a district both states have survives the move', () => {
  /* Clearing indiscriminately would be its own bug: a donor correcting the
     state should not lose a district that is still right. */
  const D = districts();
  /* Aurangabad is a district of both Bihar and Maharashtra, which is what
     makes this case exist at all. Asserted rather than skipped: if the pair
     ever stops being shared the test must say so, not quietly prove nothing. */
  assert.ok(D['Bihar'].includes('Aurangabad') && D['Maharashtra'].includes('Aurangabad'),
    'this test needs a district both states have');
  const p = page();
  p.$('#fState').value = 'Bihar';
  change(p.w, p.$('#fState'));
  p.$('#fDist').value = 'Aurangabad';
  change(p.w, p.$('#fDist'));
  p.$('#fState').value = 'Maharashtra';
  change(p.w, p.$('#fState'));
  assert.equal(p.$('#fDist').value, 'Aurangabad', 'still a real pair, so it stands');
});

test('a PIN that moves the state rebuilds the district list under it', () => {
  const p = page();
  p.$('#fState').value = 'Karnataka';
  change(p.w, p.$('#fState'));
  p.$('#fDist').value = 'Udupi';
  change(p.w, p.$('#fDist'));

  p.$('#fPin').value = '110001';           /* Delhi */
  input(p.w, p.$('#fPin'));
  assert.equal(p.$('#fState').value, 'Delhi', 'the PIN still suggests the state');
  assert.equal(p.$('#fDist').value, '', 'and the district it contradicts must not be left standing');
  const shown = [...p.$('#fDist').options].map((o) => o.value).filter(Boolean);
  assert.deepEqual(shown, districts()['Delhi']);
});

test('a campaign link cannot smuggle in a district the state does not have', () => {
  /* donate.html?flow=food&state=Punjab&district=Udupi is written by hand and
     was taken at its word. */
  const dom = new JSDOM(withDistricts(html), { runScripts: 'dangerously',
    url: 'https://pfa.test/donate.html?flow=food&state=Punjab&district=Udupi' });
  const d = dom.window.document;
  assert.equal(d.querySelector('#fState').value, 'Punjab', 'the state in the link is honoured');
  assert.equal(d.querySelector('#fDist').value, '', 'the district in it is not, because Punjab has no Udupi');
});

test('a link carrying a district the state does have is honoured', () => {
  const dom = new JSDOM(withDistricts(html), { runScripts: 'dangerously',
    url: 'https://pfa.test/donate.html?flow=food&state=Karnataka&district=Udupi' });
  assert.equal(dom.window.document.querySelector('#fDist').value, 'Udupi');
});

test('the step will not advance on a state with no district', () => {
  const p = page();
  p.$('#fState').value = 'Karnataka';
  change(p.w, p.$('#fState'));
  p.$('#fNext1').click();
  assert.ok(p.$('#fDist').closest('.field').classList.contains('is-bad'),
    'the district has to be marked, not skipped over');
});
