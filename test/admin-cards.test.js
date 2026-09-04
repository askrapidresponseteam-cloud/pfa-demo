'use strict';

/* Bulk issuance. The cards are drawn in the browser by the public site's
   renderers; what the server shapes, filters and accepts is pinned here. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { patronRow, caregiverRow, keep, matches, addressLines, cleanIds } = require('../lib/routes/admin/cards.js')._private;
const mail = require('../lib/caregiver-mail');

const NOW = Date.UTC(2026, 7, 23);


test('a caregiver row never includes a photograph and reflects printed and revoked states', () => {
  const row = caregiverRow('PFA-CCT-ABCD2345', {
    name: 'meena iyer', email: 'meena@example.com', mobile: '9876543210', address: 'C-25, Shanti Nagar', pin: '576101',
    issuedAt: '2026-08-21T00:00:00.000Z', validUntil: '2029-08-21T00:00:00.000Z', printed: true, status: 'active', tokenHash: 'secret', photo: 'should-not-exist'
  }, NOW);
  assert.equal(row.name, 'Meena Iyer');
  assert.equal(row.printed, true);
  assert.equal(row.state, 'valid');
  assert.equal(row.photo, undefined);
  assert.equal(row.tokenHash, undefined, 'the control token never leaves the server');
  assert.equal(caregiverRow('PFA-CCT-X', { status: 'revoked', validUntil: '2029-01-01T00:00:00.000Z' }, NOW).state, 'revoked');
});

test('filters answer the office\u2019s questions: who has not been emailed, who has not been printed', () => {
  const rows = [
    { id: 'a', state: 'valid', email: 'a@x.in', emailedAt: '', printedAt: '' },
    { id: 'b', state: 'valid', email: 'b@x.in', emailedAt: '2026-08-01', printedAt: '' },
    { id: 'c', state: 'valid', email: '', emailedAt: '', printedAt: '2026-08-01' },
    { id: 'd', state: 'expired', email: 'd@x.in', emailedAt: '', printedAt: '' },
    { id: 'e', state: 'valid', email: 'e@x.in', emailedAt: '', printed: true, printedAt: '' }
  ];
  const pick = (f) => rows.filter((r) => keep(r, f)).map((r) => r.id);
  assert.deepEqual(pick('unsent'), ['a', 'e'], 'no email address means nothing to send');
  assert.deepEqual(pick('unprinted'), ['a', 'b']);
  assert.deepEqual(pick('current'), ['a', 'b', 'c', 'e']);
  assert.deepEqual(pick('all'), ['a', 'b', 'c', 'd', 'e']);
  assert.ok(matches({ id: 'PFA-MBR-1', name: 'Asha Kumar', email: 'asha@x.in', mobile: '9876543210' }, 'kumar'));
  assert.ok(matches({ id: 'PFA-MBR-1', name: 'Asha Kumar', email: 'asha@x.in', mobile: '9876543210' }, '98765'));
  assert.ok(!matches({ id: 'PFA-MBR-1', name: 'Asha Kumar', email: 'asha@x.in', mobile: '9876543210' }, 'meena'));
});



test('the panel draws cards with the public site\u2019s own renderers and never uploads a photograph', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  /* The Patron renderer used to be in this list. There is no Patron card any
     more - test/no-membership.test.js exists to keep it from creeping back -
     so asking for it here was asking for the one thing another test forbids.
     The colony caregiver card is a different thing and stays. */
  ['assets/qr.js', 'assets/card-fields.js', 'assets/caregiver-card.js'].forEach((src) => {
    assert.ok(html.includes(`src="${src}"`), `${src} is the renderer the public pages use`);
  });
  const panel = html.slice(html.lastIndexOf('/* ---- issue cards'), html.lastIndexOf('</script>'));
  assert.ok(/C\.draw\(canvas, side, full/.test(panel), 'Colony caregiver faces come from PFACaregiverCard');
  assert.ok(/C\._buildPdf\(pages\)/.test(panel), 'the PDF is the same writer the public download uses');
  assert.ok(!/photos\.get\([^)]*\)[^;]*fetch\(|FormData/.test(panel), 'photographs are matched in the browser only');
  assert.ok(/action: 'printed'/.test(panel) && /action: 'email'/.test(panel));
  /* Wherever a colony caregiver card is drawn, the chairperson signature gate in the
     renderer must still be keyed on a genuine issued number. */
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'assets', 'caregiver-card.js'), 'utf8');
  assert.match(renderer, /ISSUED_CARD = \/\^PFA-CCT-\[A-Z0-9\]\{8\}\$\//);
});
