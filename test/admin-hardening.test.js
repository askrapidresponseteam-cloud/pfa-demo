'use strict';

/* What the admin surface guarantees, checked rather than assumed. */

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');
const A = require('../lib/admin-auth.js');

const ROOT = path.join(__dirname, '..');
const adminRoutes = fs.readdirSync(path.join(ROOT, 'lib', 'routes', 'admin')).filter((f) => f.endsWith('.js'));

function call(request) {
  const headers = {};
  const res = { setHeader(k, v) { headers[k] = v; }, end() {}, statusCode: 0 };
  return A.requireAdmin(request, res, 'records').then(() => ({ headers, status: res.statusCode }));
}

test('every admin route goes through the guard', () => {
  const unguarded = adminRoutes.filter((f) =>
    !/requireAdmin/.test(fs.readFileSync(path.join(ROOT, 'lib', 'routes', 'admin', f), 'utf8')));
  assert.deepEqual(unguarded, [], `no auth check in: ${unguarded.join(', ')}`);
});

test('an unauthenticated caller is refused, not served', async () => {
  A._clearFailures();
  const { status } = await call({ headers: {} });
  assert.equal(status, 401);
});

test('every admin response carries the headers an admin panel needs', async () => {
  A._clearFailures();
  const { headers } = await call({ headers: {} });
  assert.equal(headers['X-Content-Type-Options'], 'nosniff', 'attachments are served from here');
  assert.equal(headers['X-Frame-Options'], 'DENY', 'an admin panel in an iframe is a clickjack');
  assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.equal(headers['Referrer-Policy'], 'no-referrer', 'an admin URL can carry a case reference');
  assert.match(headers['X-Robots-Tag'], /noindex/);
  assert.equal(headers['Cache-Control'], 'no-store');
});

test('guessing is slowed down, and only for the caller doing it', async () => {
  A._clearFailures();
  const attacker = { headers: { 'x-forwarded-for': '203.0.113.9' } };
  let last = 0;
  for (let i = 0; i < 25; i += 1) last = (await call(attacker)).status;
  assert.equal(last, 429, 'unlimited guesses at a shared secret is not acceptable');
  const bystander = await call({ headers: { 'x-forwarded-for': '198.51.100.4' } });
  assert.equal(bystander.status, 401, 'one attacker must not lock everyone out');
});

test('a rejected caller is told nothing useful about why', async () => {
  A._clearFailures();
  const headers = {};
  let body = '';
  const res = { setHeader(k, v) { headers[k] = v; }, end(b) { body = b; }, statusCode: 0 };
  await A.requireAdmin({ headers: { authorization: 'Bearer wrong' } }, res, 'records');
  assert.ok(!/token|key|secret|env/i.test(body), `the refusal leaks a hint: ${body}`);
});

test('a change records who made it, from the token and not the request', () => {
  const status = fs.readFileSync(path.join(ROOT, 'lib', 'routes', 'admin', 'submission-status.js'), 'utf8');
  assert.match(status, /handledBy: who\.email \|\| who\.uid/,
    'the actor must come from the verified identity');
  assert.ok(!/handledBy: (body|payload|request)\./.test(status),
    'a caller must not be able to say who they are');
});

test('no shared secret opens an admin route any more', () => {
  /* This replaces the test that asserted the gap was open. Both strings each
     granted every module to whoever held them, with no named identity, so
     nothing done with one could be attributed to a person. The guard must not
     read either of them again. */
  const src = fs.readFileSync(path.join(ROOT, 'lib', 'admin-auth.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  assert.ok(!/PFA_ADMIN_TOKEN/.test(src), 'the guard must not read the shared bearer token');
  assert.ok(!/PFA_ADMIN_API_KEY/.test(src), 'the guard must not read the shared api key');
  assert.ok(!/x-admin-key/.test(src), 'the shared key header must not be honoured');
  assert.ok(!/legacy-token|legacy-key/.test(src), 'no caller may be admitted without a name');
  assert.match(src, /verifyIdToken/, 'a Firebase identity is the only way in');
  assert.match(src, /timingSafeEqual/, 'still exported for the worker token compare');
});

test('the caregiver worker keeps its own trigger token, and it is not a panel key', () => {
  /* PFA_ADMIN_TOKEN still exists for two machine triggers. The point of the
     change is that holding it no longer opens /api/admin/*. */
  const worker = fs.readFileSync(path.join(ROOT, 'lib', 'routes', 'caregiver', 'email-worker.js'), 'utf8');
  assert.match(worker, /PFA_ADMIN_TOKEN/, 'the worker still authenticates itself');
  const guard = fs.readFileSync(path.join(ROOT, 'lib', 'admin-auth.js'), 'utf8');
  const identify = guard.slice(guard.indexOf('async function identify'), guard.indexOf('function adminHeaders'));
  assert.ok(!/process\.env/.test(identify), 'identity must come from the token, not the environment');
});
