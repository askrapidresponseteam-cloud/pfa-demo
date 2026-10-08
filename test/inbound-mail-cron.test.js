'use strict';

/* Vercel's cron calls /api/inbound-mail with GET (user agent vercel-cron/1.0,
   bearer CRON_SECRET). Until 8 Oct 2026 a GET only reported status, so the
   daily Vercel run read nothing. These pin the three ways in: the cron's GET
   reads, the panel's GET only asks, and a POST from either reads. */

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHandler, fromVercelCron } = require('../lib/routes/inbound-mail.js')._private;

function harness() {
  const calls = { check: 0, status: 0, admin: 0 };
  const handler = createHandler({
    getDb: () => ({}),
    requireAdmin: async () => { calls.admin += 1; return { uid: 'admin-1', email: 'admin@pfa.test' }; },
    inbound: {
      imapConfigured: () => true,
      status: async () => { calls.status += 1; return { configured: true, lastRunAt: null }; },
      check: async () => { calls.check += 1; return { fetched: 2, filed: 1, duplicates: 0, unmatched: 1, relayed: 0, problems: [], lastUid: 9 }; },
      file: async () => ({ filed: false, reason: 'NO_THREAD' })
    }
  });
  const run = (method, headers) => new Promise((resolve) => {
    const out = { statusCode: 200 };
    handler({ method, url: '/api/inbound-mail', query: {}, body: method === 'POST' ? {} : undefined, headers: headers || {}, on() {} }, {
      set statusCode(v) { out.statusCode = v; }, get statusCode() { return out.statusCode; },
      setHeader() {}, end(raw) { out.json = JSON.parse(raw); resolve(out); }
    });
  });
  return { calls, run };
}

let saved;
test.beforeEach(() => { saved = process.env.CRON_SECRET; process.env.CRON_SECRET = 'cron-secret-for-test'; });
test.afterEach(() => { if (saved === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = saved; });

test("Vercel's daily cron (a GET) reads the mailbox, not just its status", async () => {
  const { calls, run } = harness();
  const res = await run('GET', { authorization: 'Bearer cron-secret-for-test', 'user-agent': 'vercel-cron/1.0', 'x-vercel-cron-schedule': '30 3 * * *' });
  assert.equal(res.statusCode, 200, JSON.stringify(res.json));
  assert.equal(calls.check, 1, 'the mailbox was read');
  assert.equal(calls.status, 0);
  assert.equal(res.json.filed, 1);
  assert.equal(calls.admin, 0, 'the schedule needs no administrator');
});

test("the panel's GET still only asks where the reading has got to", async () => {
  const { calls, run } = harness();
  const res = await run('GET', { authorization: 'Bearer firebase-id-token', 'user-agent': 'Mozilla/5.0' });
  assert.equal(res.statusCode, 200);
  assert.equal(calls.status, 1);
  assert.equal(calls.check, 0, 'opening the panel does not read the mailbox');
  assert.equal(calls.admin, 1, 'and it is an administrator asking');
});

test('a GET that only claims to be the cron, without the secret, is an ordinary panel request', async () => {
  const { calls, run } = harness();
  await run('GET', { 'user-agent': 'vercel-cron/1.0' });
  assert.equal(calls.check, 0);
  assert.equal(calls.admin, 1, 'it had to sign in like anyone else');
});

test('a POST reads, from the schedule or from the panel', async () => {
  const a = harness();
  await a.run('POST', { authorization: 'Bearer cron-secret-for-test' });
  assert.equal(a.calls.check, 1);
  const b = harness();
  await b.run('POST', { authorization: 'Bearer firebase-id-token' });
  assert.equal(b.calls.check, 1);
  assert.equal(b.calls.admin, 1);
});

test('the cron is recognised by its user agent or its schedule header', () => {
  assert.equal(fromVercelCron({ headers: { 'user-agent': 'vercel-cron/1.0' } }), true);
  assert.equal(fromVercelCron({ headers: { 'x-vercel-cron-schedule': '30 3 * * *' } }), true);
  assert.equal(fromVercelCron({ headers: { 'user-agent': 'curl/8.0' } }), false);
});

test('vercel.json still schedules it, once a day as the Hobby plan allows', () => {
  const crons = require('../vercel.json').crons || [];
  const job = crons.find((c) => c.path === '/api/inbound-mail');
  assert.ok(job, 'the inbound-mail cron is configured');
  const [minute, hour] = job.schedule.split(' ');
  assert.ok(/^\d+$/.test(minute) && /^\d+$/.test(hour), `once a day (a Hobby project refuses anything more often): ${job.schedule}`);
});
