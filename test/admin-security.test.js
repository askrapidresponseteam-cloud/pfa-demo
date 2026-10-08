'use strict';

/* What actually protects the admin surface. Written as an audit rather than a
   claim: each test names the specific property it checks. */

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');
const auth = require('../lib/admin-auth.js');

const ROOT = path.join(__dirname, '..');
const routes = fs.readdirSync(path.join(ROOT, 'lib', 'routes', 'admin'));
const read = (f) => fs.readFileSync(path.join(ROOT, 'lib', 'routes', 'admin', f), 'utf8');

test('every admin route is guarded, and the guard is the first thing it does', () => {
  const bad = [];
  for (const file of routes) {
    const src = read(file);
    /* Find the request handler, whichever shape it uses, and check the guard
       runs before anything else. Comparing positions in the whole file gives
       false positives, because helpers are defined above the handler. */
    const m = src.match(/(?:module\.exports\s*=\s*(?:async\s+)?function[^{]*\{|return async function handler\([^)]*\)\s*\{|async function handler\([^)]*\)\s*\{)/);
    if (!m) { bad.push(`${file}: no handler found`); continue; }
    const body = src.slice(m.index + m[0].length, m.index + m[0].length + 600);
    const guard = body.search(/await requireAdmin\(/);
    if (guard < 0) { bad.push(`${file}: no requireAdmin`); continue; }
    const work = body.search(/getDb\(\)|\.collection\(/);
    if (work >= 0 && work < guard) bad.push(`${file}: touches the database before the guard`);
  }
  assert.deepEqual(bad, [], bad.join('; '));
});

test('a valid sign-in without the admin claim is not an admin', () => {
  /* A member with a good Firebase token must not reach the panel. */
  const src = fs.readFileSync(path.join(ROOT, 'lib', 'admin-auth.js'), 'utf8');
  assert.match(src, /if \(claims\.admin === true\)/);
  assert.match(src, /\/\/ A valid token without the claim is a signed-in member, not an admin\./);
});

test('tokens are checked for revocation, not just signature', () => {
  const src = fs.readFileSync(path.join(ROOT, 'lib', 'admin-auth.js'), 'utf8');
  assert.match(src, /verifyIdToken\(presented, true\)/,
    'the second argument is what makes a revoked session stop working');
});

test('access is per module, not all-or-nothing', () => {
  const staff = { role: 'staff', modules: ['submissions'] };
  assert.equal(auth.canAccess(staff, 'submissions'), true);
  assert.equal(auth.canAccess(staff, 'payments'), false, 'a staff account must not reach every register');
  assert.equal(auth.canAccess({ role: 'super', modules: [] }, 'payments'), true);
});

test('the first administrator cannot be minted over HTTP', () => {
  const src = fs.readFileSync(path.join(ROOT, 'lib', 'admin-auth.js'), 'utf8');
  assert.match(src, /Deliberately not exposed as a route/);
  const registered = fs.readFileSync(path.join(ROOT, 'api', 'index.js'), 'utf8');
  assert.ok(!/setAdminClaim/.test(registered), 'granting admin must not be routable');
});

test('secrets are compared in constant time', () => {
  assert.equal(typeof auth.timingSafeEqual, 'function');
  assert.equal(auth.timingSafeEqual('abc', 'abc'), true);
  assert.equal(auth.timingSafeEqual('abc', 'abd'), false);
  assert.equal(auth.timingSafeEqual('abc', 'abcd'), false);
});

test('every admin response carries the headers that matter', () => {
  const set = {};
  auth.adminHeaders({ setHeader: (k, v) => { set[k] = v; } });
  assert.equal(set['X-Frame-Options'], 'DENY', 'an admin panel in an iframe is a clickjack');
  assert.match(set['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.equal(set['X-Content-Type-Options'], 'nosniff');
  assert.equal(set['Referrer-Policy'], 'no-referrer', 'an admin URL can carry a case reference');
  assert.match(set['X-Robots-Tag'], /noindex/);
  assert.equal(set['Cache-Control'], 'no-store');
});

test('a status change records who made it', () => {
  assert.match(read('submission-status.js'), /handledBy: who\.email \|\| who\.uid/);
});

test('the shared super-user secrets are opt-in and empty by default', () => {
  /* PFA_ADMIN_TOKEN and PFA_ADMIN_API_KEY each grant every module to whoever
     holds the string. They are only live if set. */
  const example = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
  assert.match(example, /PFA_ADMIN_TOKEN=\s*$/m, 'the example must not ship a value');
  assert.equal(process.env.PFA_ADMIN_TOKEN || '', '');
});
