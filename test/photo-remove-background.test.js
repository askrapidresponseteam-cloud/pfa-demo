'use strict';

/* The route is a hole in an otherwise closed system: it is the one path by
   which a photograph of a member leaves their device. So the tests are mostly
   about it staying shut - off unless configured, capped, and never echoing the
   image back into a log. */

const test = require('node:test');
const assert = require('node:assert/strict');

const ENDPOINT = 'https://provider.example/v1/segment';

function reply() {
  const out = { status: 0, body: null, headers: {} };
  return {
    out,
    setHeader(k, v) { out.headers[k] = v; },
    status(code) { out.status = code; return this; },
    send(body) { out.body = JSON.parse(body); return this; }
  };
}

function load() {
  delete require.cache[require.resolve('../lib/routes/photo/remove-background.js')];
  return require('../lib/routes/photo/remove-background.js');
}

function withEnv(vars, run) {
  const saved = {};
  Object.keys(vars).forEach((k) => { saved[k] = process.env[k]; process.env[k] = vars[k]; });
  return Promise.resolve(run()).finally(() => {
    Object.keys(saved).forEach((k) => {
      if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    });
  });
}

const PIXEL = Buffer.from('/9j/4AAQSkZJRg==', 'base64').toString('base64');

test('it is off unless a provider is configured', async () => {
  await withEnv({ PHOTO_CUTOUT_ENDPOINT: '', PHOTO_CUTOUT_KEY: '' }, async () => {
    const handler = load();
    assert.equal(handler.configured(), false);
    const res = reply();
    await handler({ method: 'POST', body: { image: PIXEL }, headers: {} }, res);
    assert.equal(res.out.status, 503, 'an unconfigured deployment must not attempt a call');
  });
});

test('only POST is answered', async () => {
  await withEnv({ PHOTO_CUTOUT_ENDPOINT: ENDPOINT, PHOTO_CUTOUT_KEY: 'k' }, async () => {
    const res = reply();
    await load()({ method: 'GET', headers: {} }, res);
    assert.equal(res.out.status, 405);
  });
});

test('an empty or unreadable image is refused before any call is made', async () => {
  await withEnv({ PHOTO_CUTOUT_ENDPOINT: ENDPOINT, PHOTO_CUTOUT_KEY: 'k' }, async () => {
    const handler = load();
    let called = false;
    const realFetch = global.fetch;
    global.fetch = async () => { called = true; };
    try {
      const res = reply();
      await handler({ method: 'POST', body: { image: '' }, headers: {} }, res);
      assert.equal(res.out.status, 400);
      assert.equal(called, false, 'nothing should reach the provider');
    } finally { global.fetch = realFetch; }
  });
});

test('an oversized payload is capped rather than forwarded', async () => {
  await withEnv({ PHOTO_CUTOUT_ENDPOINT: ENDPOINT, PHOTO_CUTOUT_KEY: 'k' }, async () => {
    const handler = load();
    const huge = Buffer.alloc(handler.MAX_BYTES + 1024, 1).toString('base64');
    let called = false;
    const realFetch = global.fetch;
    global.fetch = async () => { called = true; };
    try {
      const res = reply();
      await handler({ method: 'POST', body: { image: huge }, headers: {} }, res);
      assert.equal(res.out.status, 413);
      assert.equal(called, false);
    } finally { global.fetch = realFetch; }
  });
});

test('a good response comes back as a data URL, and the key never reaches the client', async () => {
  await withEnv({ PHOTO_CUTOUT_ENDPOINT: ENDPOINT, PHOTO_CUTOUT_KEY: 'secret-key' }, async () => {
    const handler = load();
    const realFetch = global.fetch;
    let sentHeaders = null;
    global.fetch = async (url, init) => {
      sentHeaders = init.headers;
      assert.equal(url, ENDPOINT);
      return { ok: true, arrayBuffer: async () => Buffer.from([137, 80, 78, 71]).buffer };
    };
    try {
      const res = reply();
      await handler({ method: 'POST', body: { image: 'data:image/jpeg;base64,' + PIXEL }, headers: {} }, res);
      assert.equal(res.out.status, 200);
      assert.match(res.out.body.image, /^data:image\/png;base64,/);
      assert.equal(sentHeaders['x-api-key'], 'secret-key');
      assert.equal(JSON.stringify(res.out.body).includes('secret-key'), false);
    } finally { global.fetch = realFetch; }
  });
});

test('a provider failure is reported plainly and never leaks its body', async () => {
  await withEnv({ PHOTO_CUTOUT_ENDPOINT: ENDPOINT, PHOTO_CUTOUT_KEY: 'k' }, async () => {
    const handler = load();
    const realFetch = global.fetch;
    global.fetch = async () => ({ ok: false, status: 402, text: async () => 'quota exceeded for account 12345' });
    try {
      const res = reply();
      await handler({ method: 'POST', body: { image: PIXEL }, headers: {} }, res);
      assert.equal(res.out.status, 502);
      assert.equal(res.out.body.error.includes('12345'), false, 'provider detail must not reach the member');
      assert.match(res.out.body.error, /could not be removed/);
    } finally { global.fetch = realFetch; }
  });
});

/* ---- what a paid endpoint has to refuse -------------------------------- */

/* A JPEG, a PNG and a WebP by their first bytes, and one blob that is none of
   them. The route reads the bytes rather than the data URL's claim. */
const JPEG = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 0x10, 0x4A, 0x46]).toString('base64');
const NOT_AN_IMAGE = Buffer.from('MZ\u0090\u0000\u0003 this is not a photograph at all').toString('base64');

test('a payload that is not a photograph never reaches the provider', async () => {
  await withEnv({ PHOTO_CUTOUT_ENDPOINT: ENDPOINT, PHOTO_CUTOUT_KEY: 'k' }, async () => {
    const handler = load();
    handler._private.resetForTests();
    const calls = [];
    const nativeFetch = global.fetch;
    global.fetch = async (...args) => { calls.push(args); throw new Error('the provider must not be called'); };
    try {
      const res = reply();
      await handler({ method: 'POST', body: { image: 'data:image/png;base64,' + NOT_AN_IMAGE }, headers: {} }, res);
      assert.equal(res.out.status, 415, 'anything is a photograph if nobody looks at the bytes');
      assert.equal(calls.length, 0, 'a paid call was made for a payload that is not an image');
      assert.doesNotMatch(JSON.stringify(res.out.body), /MZ|not a photograph/, 'the payload came back in the answer');
    } finally { global.fetch = nativeFetch; }
  });
});

test('one connection cannot spend the photograph budget in a loop', async () => {
  await withEnv({ PHOTO_CUTOUT_ENDPOINT: ENDPOINT, PHOTO_CUTOUT_KEY: 'k' }, async () => {
    const handler = load();
    handler._private.resetForTests();
    const nativeFetch = global.fetch;
    let paid = 0;
    global.fetch = async () => {
      paid += 1;
      return { ok: true, status: 200, arrayBuffer: async () => Buffer.from([0x89, 0x50, 0x4E, 0x47]) };
    };
    try {
      const request = () => ({ method: 'POST', body: { image: 'data:image/jpeg;base64,' + JPEG }, headers: { 'x-forwarded-for': '203.0.113.20' } });
      let refused = 0;
      for (let i = 0; i < handler._private.LIMIT + 3; i += 1) {
        const res = reply();
        await handler(request(), res);
        if (res.out.status === 429) refused += 1;
      }
      assert.ok(refused >= 2, 'the endpoint took every request without ever braking');
      assert.equal(paid, handler._private.LIMIT, 'more calls were paid for than the limit allows');

      /* Another visitor is not punished for the first one's loop. */
      const other = reply();
      await handler({ method: 'POST', body: { image: 'data:image/jpeg;base64,' + JPEG }, headers: { 'x-forwarded-for': '203.0.113.21' } }, other);
      assert.notEqual(other.out.status, 429);
    } finally { global.fetch = nativeFetch; handler._private.resetForTests(); }
  });
});
