'use strict';

/* There is no membership. The Patron register, the Circle and everything that
   fed them are gone; the colony caregiver card, which is a different thing entirely,
   stays. This exists so none of it creeps back in a half-wired state — a
   payment type with no parser, or an admin tab with no route behind it. */

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const ROOT = path.join(__dirname, '..');
const WORDS = /\b(membership|patron|circlePosts|circleProfiles|getMember|parseMembership|bulkImportLegacyMembers)\b/i;

function jsFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (!/node_modules|\.git/.test(e.name)) jsFiles(full, out); }
    else if (e.name.endsWith('.js')) out.push(full);
  }
  return out;
}

test('no server code still refers to membership', () => {
  const hits = [];
  for (const file of jsFiles(path.join(ROOT, 'lib')).concat(jsFiles(path.join(ROOT, 'api')))) {
    const src = fs.readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    src.split('\n').forEach((line, i) => {
      if (WORDS.test(line)) hits.push(`${path.relative(ROOT, file)}:${i + 1}  ${line.trim().slice(0, 70)}`);
    });
  }
  assert.deepEqual(hits, [], `membership survives in:\n  ${hits.join('\n  ')}`);
});

test('the files are gone, not merely unreferenced', () => {
  const gone = [
    'lib/member-auth.js', 'lib/routes/member-status.js', 'lib/routes/admin/circle.js',
    'lib/routes/admin/import-members.js', 'assets/circle.js', 'assets/membership.js',
    'assets/member.js', 'assets/patron-card-pdf.js', 'circle-firestore.rules'
  ];
  const left = gone.filter((f) => fs.existsSync(path.join(ROOT, f)));
  assert.deepEqual(left, [], `still present: ${left.join(', ')}`);
});

test('no route is registered for something that no longer exists', () => {
  const src = fs.readFileSync(path.join(ROOT, 'api', 'index.js'), 'utf8');
  for (const key of ['admin/circle', 'admin/import-members', 'member-status', 'member/auth/start']) {
    assert.ok(!src.includes(`'${key}'`), `${key} is still registered`);
  }
  /* Every remaining loader must resolve, or the router 500s on that path. */
  for (const m of src.matchAll(/'([\w/-]+)':\s*\(\)\s*=>\s*require\('([^']+)'\)/g)) {
    const target = path.resolve(path.join(ROOT, 'api'), m[2]);
    assert.ok(fs.existsSync(target) || fs.existsSync(`${target}.js`), `${m[1]} points at a missing file`);
  }
});

test('membership is refused as a payment type rather than falling through', () => {
  const payment = require('../lib/payment.js');
  assert.throws(() => payment.parsePaymentRequest({ type: 'membership' }));
  assert.equal(payment.parseMembership, undefined);
  assert.equal(payment.USD_MEMBERSHIP_PRICE, undefined);
});

test('the admin panel has no section without a feature behind it', () => {
  const M = require('../lib/admin-modules.js');
  for (const dead of ['circle', 'members', 'import']) {
    assert.ok(!M.MODULE_KEYS.includes(dead), `Admin still lists ${dead}`);
  }
  /* What the site actually collects is still there. */
  for (const live of ['submissions', 'volunteers', 'donations', 'caregivers', 'store', 'payments']) {
    assert.ok(M.MODULE_KEYS.includes(live), `Admin lost ${live}`);
  }
});

test('the colony caregiver card survives, and is the only card there is', () => {
  const verify = fs.readFileSync(path.join(ROOT, 'lib', 'routes', 'verify-card.js'), 'utf8');
  assert.match(verify, /CAREGIVER_ID/);
  assert.ok(!/MEMBER_ID/.test(verify));
  assert.match(verify, /PFA-CCT-XXXXXXXX/, 'the message must not still offer PFA-MBR');
  const cards = fs.readFileSync(path.join(ROOT, 'lib', 'routes', 'admin', 'cards.js'), 'utf8');
  assert.match(cards, /new Set\(\['caregiver'\]\)/);
});
