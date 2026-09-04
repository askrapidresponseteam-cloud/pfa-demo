'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');

const settings = require('../lib/store-settings.js');
const ordersRoute = require('../lib/routes/pfa-orders.js');

function mockResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(chunk) { this.body = chunk == null ? '' : String(chunk); this.ended = true; }
  };
}

function mockRequest(method, body) {
  const req = new EventEmitter();
  req.method = method;
  req.headers = { 'content-type': 'application/json' };
  if (body !== undefined) req.body = body;
  return req;
}

test.beforeEach(() => {
  settings.resetForTests();
  delete process.env.PAWS_INCLUDE_ALL_FOOD;
});

test('the Store starts open and vegetarian-only, which is the safe default', async () => {
  const state = await settings.getStoreState();
  assert.equal(state.state, 'veg');
  assert.equal(state.open, true);
  assert.equal(state.vegetarianOnly, true);
});

test('an existing PAWS_INCLUDE_ALL_FOOD deployment is not changed underneath itself', async () => {
  process.env.PAWS_INCLUDE_ALL_FOOD = 'true';
  settings.resetForTests();
  const state = await settings.getStoreState();
  assert.equal(state.state, 'all');
  assert.equal(state.open, true);
});

test('each of the three states round-trips', async () => {
  for (const wanted of ['all', 'off', 'veg']) {
    await settings.setStoreState(wanted, 'someone@example.org');
    const state = await settings.getStoreState();
    assert.equal(state.state, wanted);
    assert.equal(state.open, wanted !== 'off');
  }
});

test('an unknown state is refused rather than quietly treated as closed', async () => {
  await assert.rejects(() => settings.setStoreState('maybe'), /vegetarian only, everything, or closed/);
  await assert.rejects(() => settings.setStoreState(''), /vegetarian only/);
  await assert.rejects(() => settings.setStoreState(null), /vegetarian only/);
  const state = await settings.getStoreState();
  assert.equal(state.state, 'veg', 'a refused change must leave the Store as it was');
});

test('who changed it is recorded, but not as a readable email address', async () => {
  const after = await settings.setStoreState('off', 'staff.member@peopleforanimals.example');
  assert.ok(after.changedAt, 'the time of the change is kept');
  const state = await settings.getStoreState();
  assert.ok(state.changedBy, 'an account is recorded');
  assert.ok(!String(state.changedBy).includes('@'), 'the address itself must not be stored');
  assert.ok(!String(state.changedBy).includes('staff.member'));
});

/* The point of the stop button. Hiding the grid is not stopping the Store:
   a shopper with the page already open, a stale tab, or anything posting
   straight to the route must be refused too. */
test('a closed Store refuses checkout, not merely hides the products', async () => {
  await settings.setStoreState('off', 'someone@example.org');
  const res = mockResponse();
  await ordersRoute(mockRequest('POST', {
    lines: [{ variantId: '40123456789012', quantity: 1 }],
    customer: { name: 'Asha Rao', email: 'asha@example.com', phone: '9876543210' },
    shippingAddress: { name: 'Asha Rao', address1: '12 Car Street', city: 'Udupi', province: 'Karnataka', zip: '576101' }
  }), res);

  assert.equal(res.statusCode, 503);
  const payload = JSON.parse(res.body);
  assert.equal(payload.code, 'STORE_CLOSED');
  assert.match(payload.message, /Nothing has been charged/);
});

test('reopening the Store lets checkout be attempted again', async () => {
  await settings.setStoreState('off', 'someone@example.org');
  await settings.setStoreState('veg', 'someone@example.org');
  const res = mockResponse();
  await ordersRoute(mockRequest('POST', { lines: [] }), res);
  /* An empty bag is refused on its own merits, but not as STORE_CLOSED. */
  assert.notEqual(res.statusCode, 503);
  assert.notEqual(JSON.parse(res.body).code, 'STORE_CLOSED');
});

test('the switch takes effect at once rather than after the catalogue cache', async () => {
  await settings.setStoreState('all', 'someone@example.org');
  assert.equal((await settings.getStoreState()).state, 'all');
  await settings.setStoreState('off', 'someone@example.org');
  assert.equal((await settings.getStoreState()).open, false, 'no stale read after a change');
});
