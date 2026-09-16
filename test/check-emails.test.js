'use strict';

/* Every public form and every paid application reaches the admin panel and
   sends the person an acknowledgement, and production says whether it can
   send email at all.

   Asked on 16 Sep 2026: does a membership application trigger its email, and
   does every submission send one? scripts/check-emails.js drives each form
   through the real intake route and each paid application through CCAvenue's
   create and callback, offline, with a mail provider that records instead of
   sending. This holds it green, so ship.sh stops a deploy in which any form
   stops filing or stops acknowledging. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { run, EMAIL } = require('../scripts/check-emails.js');

test('every public form and paid application reaches the admin panel and sends its acknowledgement', async () => {
  const rows = await run();
  assert.deepEqual(rows.map((r) => r.kind).sort(),
    ['PFA-CG', 'PFA-CK', 'PFA-CR', 'PFA-EV', 'PFA-J', 'PFA-MEM', 'PFA-Q', 'PFA-S', 'PFA-V'],
    'seven forms and two paid applications');
  for (const r of rows) {
    assert.ok(r.filed, `${r.doing} (${r.kind}) was not filed where the admin panel reads it`);
    assert.ok(r.sent.length > 0 && r.sent[0].to === EMAIL, `${r.doing} (${r.kind}) sent no acknowledgement`);
    assert.ok(r.ok, `${r.doing} (${r.kind}) failed: ${r.error || r.state || ''}`);
  }
  for (const r of rows.filter((x) => x.free)) {
    assert.ok(r.unconfiguredFiled, `${r.kind}: with email switched off the submission still has to file`);
    assert.equal(r.unconfiguredState, 'unsent', `${r.kind}: with email switched off the page has to be told it did not go`);
    if (r.optional) {
      assert.ok(r.noEmailFiled, `${r.kind}: a submission without an email still has to file`);
      assert.equal(r.noEmailState, 'none');
    }
  }
});

test('the health check says whether production can send email, never the key, and payments do not depend on it', () => {
  const health = require('../lib/routes/payment/health.js');
  const call = () => {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = JSON.parse(b); } };
    health({ method: 'GET' }, res);
    return res.body;
  };
  const before = process.env.PFA_MAIL_API_KEY;
  try {
    delete process.env.PFA_MAIL_API_KEY;
    const off = call();
    assert.equal(off.mail, false);
    process.env.PFA_MAIL_API_KEY = 'a-key-set-for-this-test';
    const on = call();
    assert.equal(on.mail, true);
    assert.equal(on.ok, off.ok, 'whether payments are healthy does not change with the mail key');
    assert.ok(!JSON.stringify(on).includes('a-key-set-for-this-test'), 'the key itself is never echoed');
  } finally {
    if (before === undefined) delete process.env.PFA_MAIL_API_KEY;
    else process.env.PFA_MAIL_API_KEY = before;
  }
});

test('a deploy runs the check before shipping and reports whether email is on after', () => {
  const deploy = fs.readFileSync(path.join(__dirname, '..', 'DEPLOY.command'), 'utf8');
  const check = deploy.indexOf('check-emails.js --brief');
  assert.ok(check > -1 && check < deploy.indexOf('bash scripts/ship.sh'), 'the check runs before ship.sh');
  assert.ok(deploy.indexOf('/api/payment/health') > deploy.indexOf('Reading the live build stamp back'), 'and the live check after the deploy');
  assert.match(deploy, /"mail":true/);
  assert.match(deploy, /"mail":false/);
});
