'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');

const route = require('../lib/routes/search-popular.js');
const { normalisePath, sameOrigin, memoryCounts } = route._private;

function mockResponse() {
  const res = {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(chunk) { this.body = chunk == null ? '' : String(chunk); this.ended = true; }
  };
  return res;
}

function mockRequest(method, { body, headers } = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.headers = headers || {};
  if (body !== undefined) req.body = body;
  return req;
}

test('only same-site .html paths are accepted', () => {
  assert.equal(normalisePath('laws.html'), 'laws.html');
  assert.equal(normalisePath('laws.html#a33'), 'laws.html#a33');
  assert.equal(normalisePath('  INDEX.HTML#adopt '), 'index.html#adopt');

  // Anything that could point off-site, escape the folder or carry a payload.
  for (const bad of [
    'https://evil.example/laws.html',
    '//evil.example/laws.html',
    '../../etc/passwd',
    'laws.html?q=<script>',
    'javascript:alert(1)',
    'laws.php',
    'laws.html#<img src=x>',
    '',
    null,
    {},
    ['laws.html']
  ]) {
    assert.equal(normalisePath(bad), '', `expected rejection for ${String(bad)}`);
  }
});

test('a path longer than the cap is rejected rather than truncated into something valid', () => {
  assert.equal(normalisePath(`${'a'.repeat(200)}.html`), '');
});

test('cross-origin posts are refused, same-origin and header-less ones are not', () => {
  assert.equal(sameOrigin({ headers: {} }), true);
  assert.equal(sameOrigin({ headers: { origin: 'https://pfa.example', host: 'pfa.example' } }), true);
  assert.equal(sameOrigin({ headers: { referer: 'https://pfa.example/laws.html', host: 'pfa.example' } }), true);
  assert.equal(sameOrigin({ headers: { origin: 'https://evil.example', host: 'pfa.example' } }), false);
  assert.equal(sameOrigin({ headers: { origin: 'not a url', host: 'pfa.example' } }), false);
});

test('POST counts a click and GET ranks by count, highest first', async () => {
  memoryCounts.clear();
  for (const [path, times] of [['laws.html#a33', 3], ['units.html', 1], ['donate.html', 2]]) {
    for (let i = 0; i < times; i += 1) {
      const res = mockResponse();
      await route(mockRequest('POST', { body: { u: path } }), res);
      assert.equal(res.statusCode, 202);
    }
  }

  const res = mockResponse();
  await route(mockRequest('GET'), res);
  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body);
  assert.deepEqual(payload.items.map((row) => row.u), ['laws.html#a33', 'donate.html', 'units.html']);
  assert.deepEqual(payload.items.map((row) => row.c), [3, 2, 1]);
  assert.equal(payload.total, 6);
});

test('an invalid path is rejected and never counted', async () => {
  memoryCounts.clear();
  const res = mockResponse();
  await route(mockRequest('POST', { body: { u: 'https://evil.example/x.html' } }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(memoryCounts.size, 0);
});

test('no query text is ever stored, only the destination path', async () => {
  memoryCounts.clear();
  const res = mockResponse();
  await route(mockRequest('POST', {
    body: { u: 'laws.html#a33', q: 'my dog was beaten, call me on 9876543210', email: 'a@b.co' }
  }), res);
  assert.equal(res.statusCode, 202);
  assert.deepEqual(Array.from(memoryCounts.keys()), ['laws.html#a33']);
});

test('other methods are refused', async () => {
  const res = mockResponse();
  await route(mockRequest('DELETE'), res);
  assert.equal(res.statusCode, 405);
});
