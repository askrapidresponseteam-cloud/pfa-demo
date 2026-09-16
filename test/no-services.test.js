'use strict';

/* PFA does not offer services - no appointments, vaccination, sterilisation,
   rescue transport or consultations to request. A form that takes such a
   request makes a promise nobody can keep, and the person who filled it in
   is left waiting. The page was removed on 23 Aug 2026 at PFA's instruction;
   this keeps it, and every way of offering one, from coming back. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html') && f !== 'admin.html');
const scripts = fs.readdirSync(path.join(ROOT, 'assets')).filter((f) => f.endsWith('.js'));

test('there is no services page and nothing links to one', () => {
  assert.ok(!fs.existsSync(path.join(ROOT, 'services.html')), 'services.html is back');
  const linking = pages.filter((p) => /services\.html/.test(fs.readFileSync(path.join(ROOT, p), 'utf8')));
  assert.deepEqual(linking, [], 'these pages link to a services page');
  const inJs = scripts.filter((s) => /services\.html/.test(fs.readFileSync(path.join(ROOT, 'assets', s), 'utf8')));
  assert.deepEqual(inJs, [], 'these scripts link to a services page');
});

test('nothing on the public site offers to request a service', () => {
  const offers = /request a (pfa )?service|service request|veterinary appointment|book an appointment|rescue transport/i;
  const found = [];
  for (const p of pages) {
    const text = fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ');
    if (offers.test(text)) found.push(p);
  }
  for (const s of scripts) {
    if (offers.test(fs.readFileSync(path.join(ROOT, 'assets', s), 'utf8'))) found.push(`assets/${s}`);
  }
  assert.deepEqual(found, [], 'these files offer a service PFA does not provide');
});

test('the server no longer accepts a service request', () => {
  const S = require('../lib/submissions');
  assert.equal(S.KIND_LABELS['PFA-SV'], undefined, 'the PFA-SV submission kind should be gone');
});
