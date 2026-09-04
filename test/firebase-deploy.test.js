'use strict';

/* The Firebase deployment, checked the way it will actually be built.

   The risk that matters is not a broken route. It is publishing server code:
   Hosting can be pointed at "." with an ignore list, and one missing entry
   there puts lib/ccavenue.js and the working keys it reads on the open web.
   scripts/build-firebase.js therefore copies an allowlist and refuses to
   finish if anything server-side lands in public/. These tests hold it to that. */

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8'));
const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));

test('hosting is never pointed at the repository root', () => {
  assert.equal(cfg.hosting.public, 'public',
    'public must be the assembled directory, never "." — that publishes lib/ and api/');
});

test('every API route resolves from the path alone', () => {
  /* Vercel rewrote /api/<x> to ?__route=<x>. Firebase Hosting cannot add a
     query parameter, so the router's pathname fallback carries all of it. */
  const { _private } = require('../api/index.js');
  const cases = {
    '/api/pfa-submissions': 'pfa-submissions',
    '/api/pfa-order-status?id=X&contact=a@b.c': 'pfa-order-status',
    '/api/admin/records?kind=PFA-CR': 'admin/records',
    '/api/payment/response': 'payment/response',
    '/api/webhooks/order-created': 'webhooks/order-created',
    '/api/caregiver/card?id=X': 'caregiver/card'
  };
  for (const [url, want] of Object.entries(cases)) {
    assert.equal(_private.routeKey({ url, query: {} }), want, `${url} did not resolve`);
  }
});

test('every route the router knows is reachable through the /api rewrite', () => {
  const { _private } = require('../api/index.js');
  const rewrite = cfg.hosting.rewrites.find((r) => r.source === '/api/**');
  assert.ok(rewrite && rewrite.function, 'no /api/** rewrite to the function');
  for (const key of Object.keys(_private.ROUTES)) {
    assert.equal(_private.routeKey({ url: `/api/${key}`, query: {} }), key, `${key} is unreachable`);
  }
});

test('the product page keeps the parameters Hosting cannot inject', () => {
  const wrapper = fs.readFileSync(path.join(ROOT, 'functions', 'index.js'), 'utf8');
  assert.match(wrapper, /\/products\//, 'the wrapper no longer recognises a product URL');
  assert.match(wrapper, /__route: 'product-page'/, 'the product route is not set');
  assert.match(wrapper, /handle: decodeURIComponent/, 'the handle is not passed');
  assert.ok(cfg.hosting.rewrites.some((r) => r.source === '/products/**' && r.function),
    'product URLs do not reach the function');
});

test('nothing from vercel.json was dropped in the port', () => {
  for (const r of vercel.redirects) {
    assert.ok(cfg.hosting.redirects.some((x) => x.source === r.source && x.destination === r.destination),
      `redirect ${r.source} was not ported`);
  }
  assert.equal(cfg.hosting.headers.length, vercel.headers.length,
    'a caching header rule was lost in the port');
});

test('the daily worker still runs, on the same schedule', () => {
  const wrapper = fs.readFileSync(path.join(ROOT, 'functions', 'index.js'), 'utf8');
  const cron = vercel.crons[0];
  assert.match(wrapper, /onSchedule/, 'the cron is gone');
  assert.ok(wrapper.includes(`'${cron.schedule}'`), `the schedule is no longer ${cron.schedule}`);
});

test('vercel.json is left intact so the site can still deploy there', () => {
  assert.ok(vercel.rewrites.length && vercel.headers.length,
    'the Vercel config was damaged; moving back would not work');
});

test('the build refuses to publish anything server-side', () => {
  const script = fs.readFileSync(path.join(ROOT, 'scripts', 'build-firebase.js'), 'utf8');
  assert.match(script, /REFUSING TO BUILD/, 'the leak guard is gone');
  assert.match(script, /process\.exit\(1\)/, 'the guard warns but does not stop the build');
  for (const dir of ['lib', 'api', 'test', 'scripts']) {
    assert.ok(script.includes(dir), `${dir} is no longer named in the leak guard`);
  }
});

test('if public/ has been built, it holds no server file', () => {
  const pub = path.join(ROOT, 'public');
  if (!fs.existsSync(pub)) return;                  // not built in this checkout
  const bad = [];
  const walk = (dir, rel = '') => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else if (/^(lib|api|test|scripts|functions)\//.test(r) || /\.(md)$/.test(r)
               || /firestore\./.test(r) || r === 'package.json') bad.push(r);
    }
  };
  walk(pub);
  assert.deepEqual(bad, [], 'server or private files are in public/');
});
