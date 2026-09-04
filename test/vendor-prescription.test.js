'use strict';

/* Handing a prescription to the seller must never cost the person anything.

   The rule this file exists to enforce: the PFA-RX record and its reference
   come first, and whatever happens with the seller afterwards, the person keeps
   their number and a named person at PFA keeps the file. A seller that is down,
   slow, misconfigured or missing must be invisible to the person uploading. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const V = require('../lib/vendor-prescription.js');

const ENV = ['VENDOR_RX_UPLOAD_URL', 'VENDOR_RX_UPLOAD_FIELD', 'VENDOR_RX_UPLOAD_TOKEN'];
function withEnv(vars, run) {
  const saved = {};
  for (const k of ENV) { saved[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, vars);
  try { return run(); } finally {
    for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}
const IMAGE = { reference: 'PFA-RX-2026-00042', contentType: 'image/jpeg', bytes: Buffer.from([0xff, 0xd8, 0xff, 0xdb, 1, 2, 3]), product: 'a medicine' };

test('with nothing configured it does nothing, which is today\u2019s behaviour', async () => {
  const out = await withEnv({}, () => V.forwardPrescription(IMAGE));
  assert.equal(V.configured(), false);
  assert.equal(out.attempted, false, 'it tried to reach a seller that was never configured');
});

test('a seller that is down cannot fail the upload', async () => {
  const out = await withEnv({ VENDOR_RX_UPLOAD_URL: 'https://vendor.invalid/api/upload' }, async () => {
    const real = global.fetch;
    global.fetch = () => Promise.reject(new Error('ECONNREFUSED'));
    try { return await V.forwardPrescription(IMAGE); } finally { global.fetch = real; }
  });
  assert.equal(out.attempted, true);
  assert.equal(out.ok, false, 'a refused connection was reported as success');
});

test('a seller that refuses the file is recorded, not hidden', async () => {
  const out = await withEnv({ VENDOR_RX_UPLOAD_URL: 'https://vendor.invalid/api/upload' }, async () => {
    const real = global.fetch;
    global.fetch = () => Promise.resolve({ status: 400 });
    try { return await V.forwardPrescription(IMAGE); } finally { global.fetch = real; }
  });
  assert.equal(out.ok, false);
  assert.equal(out.status, 400, 'the panel would not know why it did not land');
});

test('it sends the file, the reference and nothing about the person', async () => {
  let sent = null;
  await withEnv({ VENDOR_RX_UPLOAD_URL: 'https://vendor.invalid/api/upload', VENDOR_RX_UPLOAD_TOKEN: 'abc' }, async () => {
    const real = global.fetch;
    global.fetch = (url, options) => { sent = { url, options }; return Promise.resolve({ status: 200 }); };
    try { await V.forwardPrescription(IMAGE); } finally { global.fetch = real; }
  });
  assert.equal(sent.url, 'https://vendor.invalid/api/upload');
  assert.equal(sent.options.method, 'POST');
  assert.equal(sent.options.headers.Authorization, 'Bearer abc');
  const keys = [...sent.options.body.keys()].sort();
  assert.deepEqual(keys, ['file', 'product', 'reference'], `sent ${keys.join(', ')}`);
  assert.equal(sent.options.body.get('reference'), IMAGE.reference);
});

test('the field name is configurable, because the contract is the seller\u2019s', async () => {
  let sent = null;
  await withEnv({ VENDOR_RX_UPLOAD_URL: 'https://vendor.invalid/api/upload', VENDOR_RX_UPLOAD_FIELD: 'prescription' }, async () => {
    const real = global.fetch;
    global.fetch = (url, options) => { sent = options; return Promise.resolve({ status: 200 }); };
    try { await V.forwardPrescription(IMAGE); } finally { global.fetch = real; }
  });
  assert.ok([...sent.body.keys()].includes('prescription'), 'the field name was ignored');
});

test('only https, and never an address on this machine or network', () => {
  for (const url of ['http://vendor.example/api/upload', 'https://localhost/api/upload',
                     'https://127.0.0.1/api/upload', 'https://169.254.169.254/latest/meta-data',
                     'not a url at all']) {
    withEnv({ VENDOR_RX_UPLOAD_URL: url }, () => {
      assert.equal(V.endpoint(), null, `${url} was accepted as an upload target`);
    });
  }
  withEnv({ VENDOR_RX_UPLOAD_URL: 'https://pawsandtails24.com/api/upload' }, () => {
    assert.ok(V.endpoint(), 'a normal https endpoint was rejected');
  });
});

test('the browser still posts to PFA, never straight to the seller', () => {
  const page = fs.readFileSync(path.join(__dirname, '..', 'product.html'), 'utf8');
  assert.match(page, /PFAForms\.submit\('PFA-RX'/, 'the page no longer files a PFA-RX record');
  assert.doesNotMatch(page, /pawsandtails|VENDOR_RX_UPLOAD/i,
    'the page is posting to the seller from the browser: no reference, no record, and it dies on CORS');
});

test('the hand-off happens after the record exists, never before', () => {
  const route = fs.readFileSync(path.join(__dirname, '..', 'lib', 'routes', 'pfa-submissions.js'), 'utf8');
  const created = route.indexOf('await doc.create(record)');
  const handed = route.indexOf('VENDOR_RX.forwardPrescription');
  assert.ok(created > -1 && handed > -1, 'the hand-off is no longer wired');
  assert.ok(handed > created, 'the seller is offered the file before it is safely on record');
  assert.match(route, /vendorHandoff/, 'the outcome is not written to the record, so the panel cannot see it');
});
