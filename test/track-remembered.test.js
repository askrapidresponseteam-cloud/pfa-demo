'use strict';

/* Past orders and reports, without an account: after a successful lookup the
   browser remembers the number - only the number, never the contact - and
   offers it back as one tap that fills the field. The contact stays the key,
   typed each time, so a shared device shows what exists but opens nothing. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'track.html'), 'utf8');
const windows = [];
test.after(() => windows.forEach((w) => { try { w.close(); } catch (e) {} }));

function page(fetchImpl, preSeen) {
  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously', virtualConsole: new VirtualConsole(), url: 'https://pfa.test/track.html',
    beforeParse(w) { if (preSeen) w.localStorage.setItem('pfa:track:seen', JSON.stringify(preSeen)); }
  });
  const w = dom.window; windows.push(w);
  if (fetchImpl) w.fetch = fetchImpl;
  return { w, $: (s) => w.document.querySelector(s) };
}
const tick = (ms) => new Promise((r) => setTimeout(r, ms));

test('a successful lookup is remembered - the number only, never the contact', async () => {
  const p = page(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ kind: 'Cruelty report', status: 'RECEIVED' }) }));
  await tick(50);
  p.$('#tRef').value = 'PFA-CR-2026-00042';
  p.$('#tContact').value = 'me@example.in';
  p.$('#trackForm').dispatchEvent(new p.w.Event('submit'));
  await tick(80);
  const stored = JSON.parse(p.w.localStorage.getItem('pfa:track:seen'));
  assert.equal(stored.length, 1);
  assert.equal(stored[0].ref, 'PFA-CR-2026-00042');
  assert.ok(!JSON.stringify(stored).includes('me@example.in'), 'the contact is the key and is never written down');
  assert.equal(p.$('#tPast').hidden, false, 'the list appears');
});

test('a failed lookup remembers nothing: only records that were yours to see', async () => {
  const p = page(() => Promise.resolve({ ok: false, json: () => Promise.resolve({ message: 'no' }) }));
  await tick(50);
  p.$('#tRef').value = 'PFA-CR-2026-00001';
  p.$('#tContact').value = 'x@x';
  p.$('#trackForm').dispatchEvent(new p.w.Event('submit'));
  await tick(80);
  assert.equal(p.w.localStorage.getItem('pfa:track:seen'), null);
});

test('a remembered number is one tap: it fills the field, focus lands on the contact', async () => {
  const p = page(null, [{ ref: 'PFA-ST-1191', when: Date.now() }]);
  await tick(80);
  const b = p.$('#tPastList button');
  assert.ok(b, 'the remembered number renders');
  b.click();
  assert.equal(p.$('#tRef').value, 'PFA-ST-1191');
  assert.equal(p.w.document.activeElement, p.$('#tContact'), 'the hand goes straight to the second key');
});

test('Forget these clears the device and hides the list', async () => {
  const p = page(null, [{ ref: 'PFA-ST-1191', when: Date.now() }]);
  await tick(80);
  p.$('#tPastForget').click();
  assert.equal(p.w.localStorage.getItem('pfa:track:seen'), null);
  assert.equal(p.$('#tPast').hidden, true);
});

test('an empty device shows no list at all', async () => {
  const p = page();
  await tick(80);
  assert.equal(p.$('#tPast').hidden, true);
});
