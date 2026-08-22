'use strict';

/* What the network page says about itself has to be true of data.js.

   The page said "40+ units across India" and "Every unit. Every city. Every
   day." while the file held 96 entries covering 23 of India's 28 states - so
   the number was wrong in one direction and the coverage claim wrong in the
   other. Worse, half those entries have no address at all, and the card
   printed "Address available on the unit page" for them, which was not true:
   there is no address on the unit page either.

   Copy drifts from data because nothing connects them. This connects them. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function units() {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets', 'data.js'), 'utf8'), context);
  return (context.window.PFA_DATA || {}).units || [];
}

const NETWORK = fs.readFileSync(path.join(ROOT, 'network.html'), 'utf8');
const text = NETWORK.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('the directory is not claimed to cover every city or all of India', () => {
  const all = units();
  const states = new Set(all.map((u) => u.s).filter(Boolean));

  assert.ok(states.size < 28,
    'if PFA really is in every state this test should be deleted, not the claim reinstated');

  /* Checked as claims, not as words. "not in every city" is the page being
     honest and must not trip this; "Every city." as a headline is the claim. */
  const heading = /<h1>([\s\S]*?)<\/h1>/.exec(NETWORK);
  assert.ok(heading, 'network.html has no h1');
  const h1 = heading[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').toLowerCase();
  for (const claim of ['every city', 'every unit', 'every state']) {
    assert.ok(!h1.includes(claim),
      `the headline claims "${claim}", which ${states.size} states does not support`);
  }
  assert.ok(!/units across India/i.test(text),
    'blanket "units across India" overstates a directory that is half phone numbers');
});

test('the coverage stated in the copy is the coverage in the data', () => {
  /* The page states the reach and nothing else. It does not narrate its own
     data quality - how many entries have premises is something the cards show
     one by one, not something the introduction confesses to. */
  const all = units();
  const states = new Set(all.map((u) => u.s).filter(Boolean)).size;

  assert.ok(text.includes(`${states} states`),
    `the page should say ${states} states`);

  /* The old number, in both the digits and the words it was written in. */
  assert.ok(!/40\+ units/.test(text), 'the stale "40+ units" claim is back');
  assert.ok(!/Forty-plus/i.test(text), 'the stale "Forty-plus" claim is back');
});

test('the page does not apologise for itself', () => {
  /* Copy written to reassure the developer rather than inform the reader. */
  for (const hedge of ['not in every city', 'not all of them are buildings',
                       'No premises listed', 'worthless', 'unverified']) {
    assert.ok(!text.toLowerCase().includes(hedge.toLowerCase()),
      `network.html hedges with "${hedge}" - state the reach, let the cards show the detail`);
  }
});

test('an entry with no address is never told there is one', () => {
  const raw = fs.readFileSync(path.join(ROOT, 'assets', 'network.js'), 'utf8');
  /* Comments explain the old string, so they are stripped before looking for
     it - otherwise the note describing the fix fails the test for the fix. */
  const renderer = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!renderer.includes('Address available on the unit page'),
    'the card promises an address that does not exist anywhere');
  assert.ok(/Local contact/.test(raw) && /Hospital or centre/.test(raw),
    'each card should say which of the two kinds it is');
  assert.ok(raw.includes('Rescue contact for this district'),
    'a contact-only entry needs something in place of the address');
});

test('every entry can at least be contacted somehow', () => {
  /* The directory is only worth publishing if each row leads somewhere. An
     entry with no phone, no email and no address is a name on a list. */
  /* data.js is evaluated in a vm context, so the arrays it builds belong to
     that realm and .map() keeps them there. deepStrictEqual compares
     prototypes, and a cross-realm [] is not strictly equal to a host []. So the
     result is rebuilt with the host's Array before it is compared. */
  const useless = units().filter((u) => !u.p && !u.e && !u.a);
  assert.deepEqual(Array.from(useless, (u) => `${u.c}, ${u.s}`), [],
    'these entries offer no way to reach anyone and should be removed or completed');
});
