'use strict';

/* Bulk issuance. The cards are drawn in the browser by the public site's
   renderers; what the server shapes, filters and accepts is pinned here. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { patronRow, caretakerRow, keep, matches, addressLines, cleanIds } = require('../lib/routes/admin/cards.js')._private;
const mail = require('../lib/caretaker-mail');

const NOW = Date.UTC(2026, 7, 23);

test('a member row carries what the Patron renderer needs, with the address from the payment', () => {
  const row = patronRow('PFA-MBR-4K7M2QX9', {
    name: 'asha kumar', email: 'Asha@Example.com', mobile: '9876543210', memberSince: '2026-08-01T00:00:00.000Z',
    validUntil: '2027-08-01T00:00:00.000Z', cardEmailedAt: '', source: 'ccavenue'
  }, { address: 'C-25 Shanti Nagar', district: 'Udupi', state: 'Karnataka', pin: '576101' }, NOW);
  assert.equal(row.name, 'Asha Kumar');
  assert.equal(row.email, 'asha@example.com');
  assert.deepEqual(row.addressLines, ['C-25 Shanti Nagar', 'Udupi 576101', 'Karnataka']);
  assert.equal(row.state, 'valid');
  /* An imported member has no payment and so no address; the renderer is
     told so rather than given a placeholder. */
  const imported = patronRow('PFA-MBR-8HJ2K1LM', { name: 'MEENA IYER', validUntil: '2026-01-01T00:00:00.000Z', source: 'legacy-import' }, null, NOW);
  assert.deepEqual(imported.addressLines, []);
  assert.equal(imported.state, 'expired');
  assert.deepEqual(addressLines('', '', 'Karnataka', ''), ['Karnataka']);
});

test('a caretaker row never includes a photograph and reflects printed and revoked states', () => {
  const row = caretakerRow('PFA-CCT-ABCD2345', {
    name: 'meena iyer', email: 'meena@example.com', mobile: '9876543210', address: 'C-25, Shanti Nagar', pin: '576101',
    issuedAt: '2026-08-21T00:00:00.000Z', validUntil: '2029-08-21T00:00:00.000Z', printed: true, status: 'active', tokenHash: 'secret', photo: 'should-not-exist'
  }, NOW);
  assert.equal(row.name, 'Meena Iyer');
  assert.equal(row.printed, true);
  assert.equal(row.state, 'valid');
  assert.equal(row.photo, undefined);
  assert.equal(row.tokenHash, undefined, 'the control token never leaves the server');
  assert.equal(caretakerRow('PFA-CCT-X', { status: 'revoked', validUntil: '2029-01-01T00:00:00.000Z' }, NOW).state, 'revoked');
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

test('only well-formed ids of the right kind are acted on, de-duplicated, at most 25 per call', () => {
  assert.deepEqual(cleanIds('patron', ['pfa-mbr-4k7m2qx9', 'PFA-MBR-4K7M2QX9', 'PFA-CCT-ABCD2345', 'DROP TABLE', '']), ['PFA-MBR-4K7M2QX9']);
  assert.deepEqual(cleanIds('caretaker', ['PFA-CCT-ABCD2345', 'PFA-MBR-4K7M2QX9']), ['PFA-CCT-ABCD2345']);
  assert.equal(cleanIds('patron', Array.from({ length: 60 }, (_, i) => `PFA-MBR-${String(i).padStart(8, '0')}`)).length, 25);
  assert.deepEqual(cleanIds('patron', 'not an array'), []);
});

test('the Patron card email names the member number and sends them to the Members area', () => {
  const rendered = mail.render('patron_card', { name: 'Asha Kumar', memberId: 'PFA-MBR-4K7M2QX9', memberSince: '2026-08-01', validUntil: '2027-08-01', memberUrl: 'https://peopleforanimalsindia.org/member.html?id=PFA-MBR-4K7M2QX9' });
  assert.match(rendered.subject, /PFA-MBR-4K7M2QX9/);
  assert.ok(rendered.html.includes('member.html?id=PFA-MBR-4K7M2QX9'));
  assert.ok(rendered.text.includes('Member number: PFA-MBR-4K7M2QX9'));
  assert.ok(!/<script/i.test(rendered.html));
});

test('the panel draws cards with the public site\u2019s own renderers and never uploads a photograph', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  ['assets/qr.js', 'assets/card-fields.js', 'assets/caretaker-card.js', 'assets/patron-card-pdf.js'].forEach((src) => {
    assert.ok(html.includes(`src="${src}"`), `${src} is the renderer the public pages use`);
  });
  const panel = html.slice(html.lastIndexOf('/* ---- issue cards'), html.lastIndexOf('</script>'));
  assert.ok(/PFAPatronCard\.hydrate|P\.hydrate\(/.test(panel) && /P\.offscreen\(/.test(panel), 'Patron faces come from PFAPatronCard');
  assert.ok(/C\.draw\(canvas, side, full/.test(panel), 'Caretaker faces come from PFACaretakerCard');
  assert.ok(/C\._buildPdf\(pages\)/.test(panel), 'the PDF is the same writer the public download uses');
  assert.ok(!/photos\.get\([^)]*\)[^;]*fetch\(|FormData/.test(panel), 'photographs are matched in the browser only');
  assert.ok(/action: 'printed'/.test(panel) && /action: 'email'/.test(panel));
  /* Wherever a caretaker card is drawn, the chairperson signature gate in the
     renderer must still be keyed on a genuine issued number. */
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'assets', 'caretaker-card.js'), 'utf8');
  assert.match(renderer, /ISSUED_CARD = \/\^PFA-CCT-\[A-Z0-9\]\{8\}\$\//);
});
