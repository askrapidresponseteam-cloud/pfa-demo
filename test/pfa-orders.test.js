'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const handler = require('../lib/routes/pfa-orders');
const nativeFetch = global.fetch;

const order = {
  lines: [{ variantId: '47369248768175', quantity: 1 }],
  customer: {
    name: 'Asha Kumar',
    email: 'asha@example.com',
    phone: '9876543210'
  },
  shippingAddress: {
    name: 'Asha Kumar',
    phone: '9876543210',
    address1: '16 MG Road',
    address2: 'Near City Hall',
    city: 'Udupi',
    province: 'Karnataka',
    zip: '576101'
  }
};

function requestFor(body, key = 'pfa-checkout-test') {
  const request = new EventEmitter();
  request.method = 'POST';
  request.headers = {
    'idempotency-key': key,
    'x-forwarded-for': '203.0.113.10'
  };
  process.nextTick(() => {
    request.emit('data', JSON.stringify(body));
    request.emit('end');
  });
  return request;
}

function responseRecorder() {
  let resolve;
  const completed = new Promise((done) => { resolve = done; });
  const headers = {};
  return {
    completed,
    response: {
      setHeader(name, value) { headers[name] = value; },
      end(raw) { resolve({ statusCode: this.statusCode, headers, body: JSON.parse(raw) }); }
    }
  };
}

function shopifySuccess(onRequest) {
  return async function mockFetch(url, options) {
    if (onRequest) onRequest(url, options);
    return {
      ok: true,
      async json() {
        return {
          data: {
            cartCreate: {
              cart: {
                id: 'gid://shopify/Cart/c1-pfa-test?key=secret',
                checkoutUrl: 'https://pawsandtails24.com/checkouts/cn/pfa-test/en-in'
              },
              userErrors: [],
              warnings: []
            }
          }
        };
      }
    };
  };
}

test.beforeEach(() => {
  handler._private.resetForTests();
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  delete process.env.FIREBASE_PROJECT_ID;
  delete process.env.FIREBASE_CLIENT_EMAIL;
  delete process.env.FIREBASE_PRIVATE_KEY;
  process.env.PFA_SHOPIFY_STORE_DOMAIN = 'sg37v1-ta.myshopify.com';
  process.env.PFA_SHOPIFY_STOREFRONT_API_VERSION = '2026-07';
  process.env.PFA_SHOPIFY_STOREFRONT_ACCESS_TOKEN = 'storefront-test-token';
  delete process.env.PFA_SHOPIFY_STOREFRONT_PRIVATE_ACCESS_TOKEN;
});

test.afterEach(() => {
  delete process.env.PFA_SHOPIFY_STOREFRONT_ACCESS_TOKEN;
  global.fetch = nativeFetch;
});

test('the 25 cap is per product, not per line, and one order cannot carry a thousand of them', () => {
  /* validateLine allowed 25 of a variant and nothing stopped the same
     variantId arriving on twenty lines, so the limit the bag advertises - and
     that this route's own comment says it shares - was a formality. */
  const { validatedCheckoutData, MAX_PER_VARIANT, MAX_LINES } = handler._private;
  const base = { ...order };
  const spread = (n, quantity) => Array.from({ length: n }, () => ({ variantId: '47369248768175', quantity }));

  assert.throws(
    () => validatedCheckoutData({ ...base, lines: spread(4, MAX_PER_VARIANT) }),
    /quantity is invalid/,
    'a hundred of one product went through on four lines'
  );

  /* Split across lines but within the cap, they are added into one line. */
  const merged = validatedCheckoutData({ ...base, lines: [
    { variantId: '47369248768175', quantity: 3 },
    { variantId: '47369248768175', quantity: 4 },
    { variantId: '47369248768176', quantity: 1 }
  ] });
  assert.equal(merged.lines.length, 2, 'the two lines for one variant were not added up');
  assert.equal(merged.lines.find((l) => l.variantId === '47369248768175').quantity, 7);

  assert.throws(
    () => validatedCheckoutData({ ...base, lines: Array.from({ length: MAX_LINES + 1 }, (unused, i) => ({ variantId: String(47369248768175 + i), quantity: 1 })) }),
    /too many products/,
    'body.lines had no length at all'
  );
});

test('builds a Storefront cart with buyer identity and a selected delivery address', () => {
  const input = handler._private.buildShopifyCartInput(order, 'pfa-checkout-test');

  assert.deepEqual(input.lines, [{
    merchandiseId: 'gid://shopify/ProductVariant/47369248768175',
    quantity: 1
  }]);
  assert.deepEqual(input.buyerIdentity, {
    countryCode: 'IN',
    email: 'asha@example.com',
    phone: '+919876543210'
  });
  assert.equal(input.delivery.addresses[0].selected, true);
  assert.equal(input.delivery.addresses[0].oneTimeUse, true);
  assert.deepEqual(input.delivery.addresses[0].address.deliveryAddress, {
    firstName: 'Asha',
    lastName: 'Kumar',
    address1: '16 MG Road',
    address2: 'Near City Hall',
    city: 'Udupi',
    provinceCode: 'KA',
    countryCode: 'IN',
    zip: '576101',
    phone: '+919876543210'
  });
});

test('returns Shopify checkoutUrl from the cart carrying the address', async () => {
  let storefrontRequest;
  global.fetch = shopifySuccess((url, options) => {
    storefrontRequest = { url, options, body: JSON.parse(options.body) };
  });
  const recorder = responseRecorder();
  await handler(requestFor(order), recorder.response);
  const result = await recorder.completed;

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.checkoutToken, 'pfa-checkout-test');
  assert.equal(result.body.status, 'AWAITING_PAYMENT');
  assert.equal(result.body.pfaOrderId, undefined);
  assert.equal(result.body.addressPrefilled, true);
  assert.equal(result.body.checkoutMode, 'STOREFRONT_CART');
  assert.equal(result.body.paymentUrl, 'https://sg37v1-ta.myshopify.com/checkouts/cn/pfa-test/en-in');
  assert.equal(storefrontRequest.url, 'https://sg37v1-ta.myshopify.com/api/2026-07/graphql.json');
  assert.equal(storefrontRequest.options.headers['X-Shopify-Storefront-Access-Token'], 'storefront-test-token');
  assert.equal(
    storefrontRequest.body.variables.input.delivery.addresses[0].address.deliveryAddress.address1,
    '16 MG Road'
  );
});

test('reuses one Shopify cart for the same Idempotency-Key', async () => {
  let calls = 0;
  global.fetch = shopifySuccess(() => { calls += 1; });

  const firstRecorder = responseRecorder();
  await handler(requestFor(order), firstRecorder.response);
  const first = await firstRecorder.completed;

  const secondRecorder = responseRecorder();
  await handler(requestFor(order), secondRecorder.response);
  const second = await secondRecorder.completed;

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(first.body.paymentUrl, second.body.paymentUrl);
  assert.equal(calls, 1);
});

test('rejects reuse of an Idempotency-Key after delivery details change', async () => {
  global.fetch = shopifySuccess();
  const firstRecorder = responseRecorder();
  await handler(requestFor(order), firstRecorder.response);
  await firstRecorder.completed;

  const changed = JSON.parse(JSON.stringify(order));
  changed.shippingAddress.address1 = '18 MG Road';
  const secondRecorder = responseRecorder();
  await handler(requestFor(changed), secondRecorder.response);
  const second = await secondRecorder.completed;

  assert.equal(second.statusCode, 409);
  assert.equal(second.body.code, 'IDEMPOTENCY_CONFLICT');
});

test('without a Storefront token the checkout falls back to a cart permalink that still carries the PFA reference', async () => {
  const saved = { pub: process.env.PFA_SHOPIFY_STOREFRONT_ACCESS_TOKEN, priv: process.env.PFA_SHOPIFY_STOREFRONT_PRIVATE_ACCESS_TOKEN };
  delete process.env.PFA_SHOPIFY_STOREFRONT_ACCESS_TOKEN;
  delete process.env.PFA_SHOPIFY_STOREFRONT_PRIVATE_ACCESS_TOKEN;
  handler._private.resetForTests();
  try {
    const response = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = JSON.parse(b); } };
    await handler(requestFor(order, 'permalink-1'), response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.checkoutMode, 'CART_PERMALINK');
    assert.equal(response.body.addressPrefilled, false);
    const url = new URL(response.body.paymentUrl);
    assert.equal(url.hostname, 'sg37v1-ta.myshopify.com');
    assert.equal(url.pathname, '/cart/47369248768175:1');
    assert.equal(url.searchParams.get('attributes[PFA checkout reference]'), 'permalink-1');
    assert.equal(url.searchParams.get('checkout[shipping_address][zip]'), '576101');
  } finally {
    if (saved.pub) process.env.PFA_SHOPIFY_STOREFRONT_ACCESS_TOKEN = saved.pub;
    if (saved.priv) process.env.PFA_SHOPIFY_STOREFRONT_PRIVATE_ACCESS_TOKEN = saved.priv;
  }
});
