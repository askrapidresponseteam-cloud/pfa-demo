'use strict';

/* Every submission is emailed to PFA's inbox with Reply-To set to the person
   who sent it, so a Reply from the inbox reaches them (owner, 3 Oct 2026).
   scripts/check-emails.js drives every form through this; these pin the
   pieces: which inbox, what the email says, and what the provider is told. */

const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../lib/submission-forward');

function withEnv(vars, fn) {
  const saved = {};
  for (const k of Object.keys(vars)) { saved[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; }
  try { return fn(); } finally { for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
}

const RECORD = {
  reference: 'PFA-J-2026-00007', kind: 'PFA-J', kindLabel: 'Job application', createdAt: '2026-10-03T17:00:00.000Z', page: 'careers.html',
  fields: { name: 'Meena Iyer', email: 'Meena.Iyer@Example.com', mobile: '9876543210', zone: 'South South', whyThisRole: 'I have run a feeding route for six years.', emptyOne: '' }
};

test('the inbox is gandhim@exmpls.sansad.in unless PFA_SUBMISSIONS_INBOX says otherwise', () => {
  withEnv({ PFA_SUBMISSIONS_INBOX: undefined }, () => assert.deepEqual(F.inboxes(), ['gandhim@exmpls.sansad.in']));
  withEnv({ PFA_SUBMISSIONS_INBOX: 'a@pfa.org, B@pfa.org,not-an-address' }, () => assert.deepEqual(F.inboxes(), ['a@pfa.org', 'b@pfa.org']));
  withEnv({ PFA_SUBMISSIONS_INBOX: 'off' }, () => assert.deepEqual(F.inboxes(), []));
});

test('the forward names the sender, answers to them, and carries every field they filled in', () => {
  const p = F.payloadFor(RECORD, 'https://peopleforanimalsindia.org/');
  assert.equal(p.replyTo, 'meena.iyer@example.com');
  assert.equal(p.name, 'Meena Iyer');
  assert.equal(p.mobile, '9876543210');
  assert.deepEqual(p.rows, [{ label: 'Zone', value: 'South South' }, { label: 'Why this role', value: 'I have run a feeding route for six years.' }]);
  const mail = require('../lib/caregiver-mail');
  const r = mail.render('submission_forward', p);
  assert.equal(r.subject, 'PFA-J-2026-00007: Job application from Meena Iyer');
  assert.equal(r.replyTo, 'meena.iyer@example.com');
  assert.match(r.text, /Reply to this email to answer Meena Iyer directly at meena\.iyer@example\.com/);
  assert.match(r.text, /Why this role: I have run a feeding route/);
});

test('the provider is told Reply-To is the sender for a forward, and the site default for everything else', async () => {
  const mail = require('../lib/caregiver-mail');
  const sent = [];
  const realFetch = global.fetch;
  global.fetch = async (url, init) => { sent.push(JSON.parse(init.body)); return { ok: true, status: 200, text: async () => '{"id":"x"}' }; };
  const savedKey = process.env.PFA_MAIL_API_KEY;
  process.env.PFA_MAIL_API_KEY = 'test';
  try {
    await mail.deliver({ to: 'gandhim@exmpls.sansad.in', template: 'submission_forward', payload: F.payloadFor(RECORD, 'https://peopleforanimalsindia.org') });
    await mail.deliver({ to: 'meena.iyer@example.com', template: 'submission_received', payload: { kind: 'PFA-J', name: 'Meena', reference: RECORD.reference, kindLabel: 'Job application', receivedAt: RECORD.createdAt } });
    const forged = F.payloadFor(RECORD, '');
    forged.replyTo = 'x@example.com\r\nBcc: everyone@example.com';
    await mail.deliver({ to: 'gandhim@exmpls.sansad.in', template: 'submission_forward', payload: forged });
  } finally {
    global.fetch = realFetch;
    if (savedKey === undefined) delete process.env.PFA_MAIL_API_KEY; else process.env.PFA_MAIL_API_KEY = savedKey;
  }
  assert.deepEqual(sent[0].to, ['gandhim@exmpls.sansad.in']);
  assert.equal(sent[0].reply_to, 'meena.iyer@example.com');
  assert.notEqual(sent[1].reply_to, 'meena.iyer@example.com', 'only the forward answers to the sender');
  /* a Reply-To carrying a line break is never passed on */
  assert.ok(!String(sent[2].reply_to || '').includes('\n'));
  assert.ok(!String(sent[2].reply_to || '').includes('everyone@example.com'));
});

test('a forward that cannot be sent never fails the submission', async () => {
  const out = await withEnv({ PFA_SUBMISSIONS_INBOX: undefined }, () => F.forward({
    record: RECORD, siteUrl: '',
    mail: { isConfigured: () => true, deliver: async () => { throw new Error('provider down'); } },
    queue: null, timeoutMs: 50
  }));
  assert.equal(out.length, 1);
  assert.equal(out[0].state, 'unsent');
});
