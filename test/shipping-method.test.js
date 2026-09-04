'use strict';

/* The shipping method moved from the seller's checkout into PFA's own drawer.
   Two things have to hold, or it is not worth doing: the prices shown are
   Shopify's and not PFA's, and a failure to get them can never stop an order. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const orders = require('../lib/routes/pfa-orders');
const rates = require('../lib/routes/pfa-shipping-rates');

const ROOT = path.join(__dirname, '..');
const nativeFetch = global.fetch;

const order = {
  lines: [{ variantId: '47369248768175', quantity: 1 }],
  customer: { name: 'Asha Kumar', email: 'asha@example.com', phone: '9876543210' },
  shippingAddress: {
    name: 'Asha Kumar', phone: '9876543210',
    address1: '16 MG Road', city: 'Udupi', province: 'Karnataka', zip: '576101'
  }
};

const DELIVERY_GROUPS = {
  nodes: [{
    id: 'gid://shopify/CartDeliveryGroup/dg1',
    deliveryOptions: [
      { handle: 'h-express', code: 'Express', title: 'Express', description: '2 to 3 business days', estimatedCost: { amount: '109.0', currencyCode: 'INR' } },
      { handle: 'h-standard', code: 'Standard', title: 'Standard (Prepaid)', description: '3 to 5 business days', estimatedCost: { amount: '59.0', currencyCode: 'INR' } }
    ]
  }]
};

function requestFor(body, key = 'pfa-ship-test') {
  const request = new EventEmitter();
  request.method = 'POST';
  request.headers = { 'idempotency-key': key, 'x-forwarded-for': '203.0.113.10' };
  process.nextTick(() => { request.emit('data', JSON.stringify(body)); request.emit('end'); });
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

/* A Storefront stub that answers cartCreate with rates and records every call,
   so the second mutation (the pre-selection) can be inspected. */
function storefront(opts = {}) {
  const calls = [];
  return {
    calls,
    fetch: async function (url, options) {
      const sent = JSON.parse(options.body);
      calls.push(sent);
      if (/PfaSelectDelivery/.test(sent.query)) {
        if (opts.selectFails) return { ok: true, async json() { return { errors: [{ message: 'nope' }] }; } };
        return {
          ok: true,
          async json() {
            return { data: { cartSelectedDeliveryOptionsUpdate: {
              cart: { id: 'gid://shopify/Cart/c1', checkoutUrl: 'https://pawsandtails24.com/checkouts/cn/picked/en-in' },
              userErrors: []
            } } };
          }
        };
      }
      return {
        ok: true,
        async json() {
          return { data: { cartCreate: {
            cart: {
              id: 'gid://shopify/Cart/c1',
              checkoutUrl: 'https://pawsandtails24.com/checkouts/cn/plain/en-in',
              deliveryGroups: opts.noRates ? { nodes: [] } : DELIVERY_GROUPS
            },
            userErrors: [], warnings: []
          } } };
        }
      };
    }
  };
}

test.beforeEach(() => {
  orders._private.resetForTests();
  rates._private.resetForTests();
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  delete process.env.FIREBASE_PROJECT_ID;
  process.env.PFA_SHOPIFY_STORE_DOMAIN = 'sg37v1-ta.myshopify.com';
  process.env.PFA_SHOPIFY_STOREFRONT_API_VERSION = '2026-07';
  process.env.PFA_SHOPIFY_STOREFRONT_ACCESS_TOKEN = 'storefront-test-token';
});

test.afterEach(() => {
  delete process.env.PFA_SHOPIFY_STOREFRONT_ACCESS_TOKEN;
  global.fetch = nativeFetch;
});

/* ---------------- the quote ---------------- */

test('the rates route returns Shopify\u2019s own options, prices included', async () => {
  global.fetch = storefront().fetch;
  const recorder = responseRecorder();
  await rates(requestFor(order), recorder.response);
  const result = await recorder.completed;

  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body.options.map((o) => [o.title, o.amount]), [
    ['Express', 109],
    ['Standard (Prepaid)', 59]
  ]);
  assert.equal(result.body.options[0].currency, 'INR');
});

test('no price in the answer was invented here: every figure came from the reply', async () => {
  const front = storefront();
  global.fetch = front.fetch;
  const recorder = responseRecorder();
  await rates(requestFor(order), recorder.response);
  const result = await recorder.completed;
  const fromShopify = DELIVERY_GROUPS.nodes[0].deliveryOptions.map((o) => Number(o.estimatedCost.amount));
  result.body.options.forEach((o) => assert.ok(fromShopify.includes(o.amount), `${o.amount} is not a Shopify rate`));
});

test('an incomplete address is answered with no options rather than an error', async () => {
  global.fetch = storefront().fetch;
  const recorder = responseRecorder();
  await rates(requestFor({ lines: order.lines, customer: {}, shippingAddress: {} }), recorder.response);
  const result = await recorder.completed;
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body.options, []);
  assert.equal(result.body.reason, 'INCOMPLETE_ADDRESS');
});

test('a Shopify that will not answer is not an error either', async () => {
  global.fetch = async () => { throw new Error('network down'); };
  const recorder = responseRecorder();
  await rates(requestFor(order), recorder.response);
  const result = await recorder.completed;
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body.options, []);
  assert.equal(result.body.reason, 'RATES_UNAVAILABLE');
});

test('the same bag to the same PIN is not rated twice within the cache window', async () => {
  const front = storefront();
  global.fetch = front.fetch;
  for (let i = 0; i < 3; i++) {
    const recorder = responseRecorder();
    await rates(requestFor(order), recorder.response);
    await recorder.completed;
  }
  assert.equal(front.calls.length, 1, 'one rating, three answers');
});

test('the quote writes nothing down: no order intent is created by asking', async () => {
  global.fetch = storefront().fetch;
  const recorder = responseRecorder();
  await rates(requestFor(order), recorder.response);
  const result = await recorder.completed;
  assert.equal(result.body.checkoutToken, undefined);
  assert.equal(result.body.paymentUrl, undefined);
});

/* ---------------- the pre-selection ---------------- */

test('the chosen method is matched against the cart and pre-selected on it', async () => {
  const front = storefront();
  const checkout = await orders._private.createShopifyCheckout(
    Object.assign({ deliveryCode: 'Standard' }, order), 'tok', null, front.fetch
  );
  const select = front.calls.find((c) => /PfaSelectDelivery/.test(c.query));
  assert.ok(select, 'a selection mutation must be sent');
  assert.equal(select.variables.selected[0].deliveryOptionHandle, 'h-standard');
  assert.equal(select.variables.selected[0].deliveryGroupId, 'gid://shopify/CartDeliveryGroup/dg1');
  assert.equal(checkout.delivery.title, 'Standard (Prepaid)');
  assert.equal(checkout.delivery.amount, 59);
  assert.match(checkout.paymentUrl, /\/checkouts\/cn\/picked\//);
});

test('the method also matches on the title the shopper actually saw', async () => {
  const front = storefront();
  await orders._private.createShopifyCheckout(
    Object.assign({ deliveryCode: 'Standard (Prepaid)' }, order), 'tok', null, front.fetch
  );
  const select = front.calls.find((c) => /PfaSelectDelivery/.test(c.query));
  assert.equal(select.variables.selected[0].deliveryOptionHandle, 'h-standard');
});

test('no method chosen means no selection call and the checkout is untouched', async () => {
  const front = storefront();
  const checkout = await orders._private.createShopifyCheckout(order, 'tok', null, front.fetch);
  assert.equal(front.calls.filter((c) => /PfaSelectDelivery/.test(c.query)).length, 0);
  assert.match(checkout.paymentUrl, /\/checkouts\/cn\/plain\//);
  assert.equal(checkout.delivery, null);
});

test('a code Shopify does not offer is ignored, not guessed at', async () => {
  const front = storefront();
  const checkout = await orders._private.createShopifyCheckout(
    Object.assign({ deliveryCode: 'Overnight Drone' }, order), 'tok', null, front.fetch
  );
  assert.equal(front.calls.filter((c) => /PfaSelectDelivery/.test(c.query)).length, 0);
  assert.match(checkout.paymentUrl, /\/checkouts\/cn\/plain\//);
});

test('a selection that fails still hands over a working checkout', async () => {
  const front = storefront({ selectFails: true });
  const checkout = await orders._private.createShopifyCheckout(
    Object.assign({ deliveryCode: 'Express' }, order), 'tok', null, front.fetch
  );
  assert.match(checkout.paymentUrl, /\/checkouts\/cn\/plain\//, 'falls back to the unselected URL');
  assert.equal(checkout.delivery, null);
});

test('a cart Shopify has not rated yet still checks out', async () => {
  const front = storefront({ noRates: true });
  const checkout = await orders._private.createShopifyCheckout(
    Object.assign({ deliveryCode: 'Express' }, order), 'tok', null, front.fetch
  );
  assert.match(checkout.paymentUrl, /\/checkouts\/cn\/plain\//);
});

test('the speed is recorded on the cart so the seller and the webhook can see it', () => {
  const input = orders._private.buildShopifyCartInput(Object.assign({ deliveryCode: 'Express' }, order), 'tok');
  const attr = input.attributes.find((a) => a.key === 'Delivery speed');
  assert.equal(attr.value, 'Express');
  const plain = orders._private.buildShopifyCartInput(order, 'tok');
  assert.equal(plain.attributes.find((a) => a.key === 'Delivery speed'), undefined,
    'nothing is recorded when nothing was chosen');
  assert.ok(plain.attributes.find((a) => a.key === 'PFA checkout reference'),
    'the reference the webhook matches on must survive');
});

test('changing the speed changes the fingerprint, so a reused key is caught', () => {
  const a = orders._private.requestFingerprint(Object.assign({ deliveryCode: 'Standard' }, order));
  const b = orders._private.requestFingerprint(Object.assign({ deliveryCode: 'Express' }, order));
  assert.notEqual(a, b);
});

/* ---------------- the drawer ---------------- */

test('the drawer asks PFA for rates and never prices delivery itself', () => {
  const shop = fs.readFileSync(path.join(ROOT, 'pfa-shop.html'), 'utf8');
  assert.match(shop, /fetch\('\/api\/pfa-shipping-rates'/, 'the drawer must ask the server');
  assert.match(shop, /deliveryCode: ship\.code/, 'and pass the choice on to the order');
  /* The two figures from the seller's page must not be hardcoded anywhere. */
  assert.doesNotMatch(shop, /Standard \(Prepaid\)/, 'a rate title must not be baked into the page');
  assert.doesNotMatch(shop, /\b109\.00\b/, 'a rate must not be baked into the page');
});

test('the shipping block is a labelled radio group, not a row of loose buttons', () => {
  const shop = fs.readFileSync(path.join(ROOT, 'pfa-shop.html'), 'utf8');
  assert.match(shop, /role="radiogroup" aria-label="Shipping method"/);
  assert.match(shop, /type="radio" name="pfaShip"/);
  assert.match(shop, /\.ship__opt\{/, 'and it has to be styled');
});

test('the route is mounted, or the drawer is calling nothing', () => {
  const api = fs.readFileSync(path.join(ROOT, 'api', 'index.js'), 'utf8');
  assert.match(api, /'pfa-shipping-rates': '\.\/pfa-shipping-rates\.js'/);
  assert.match(api, /'pfa-shipping-rates': \(\) => require\('\.\.\/lib\/routes\/pfa-shipping-rates\.js'\)/);
});

test('PFA holds no payment secret in anything the browser can read', () => {
  const shop = fs.readFileSync(path.join(ROOT, 'pfa-shop.html'), 'utf8');
  const route = fs.readFileSync(path.join(ROOT, 'lib', 'routes', 'pfa-shipping-rates.js'), 'utf8');
  const orderRoute = fs.readFileSync(path.join(ROOT, 'lib', 'routes', 'pfa-orders.js'), 'utf8');

  /* The page now opens Razorpay's sheet, so checkout.razorpay.com belongs here.
     What must never be here is anything that could be used without the shopper:
     a key secret, an admin token, or a call to an admin API. The publishable
     key id is fetched from the server at runtime and is public by design. */
  assert.doesNotMatch(shop, /PFA_RAZORPAY_KEY_SECRET|key_secret|rzp_live_[A-Za-z0-9]|rzp_test_[A-Za-z0-9]/,
    'no Razorpay secret or hardcoded key in the page');
  assert.doesNotMatch(shop, /shpat_/, 'no Shopify admin token in the page');
  assert.doesNotMatch(shop, /\/admin\/api\//, 'the page never calls an admin API');
  assert.match(shop, /key: open\.keyId/, 'the key id comes from the server, not the source');

  [route, orderRoute].forEach((src) => {
    assert.doesNotMatch(src, /shpat_/, 'no admin token is written down');
  });

  /* Money still settles to the seller: the Razorpay account is theirs, and the
     sheet must not claim to be PFA. The seller's name is no longer written in
     this page at all. It arrives from the server with the payment, so the page
     cannot drift from the account, and the name lives in configuration rather
     than in the tree. Unset, Razorpay falls back to the registered name on the
     account itself, which is right by construction. */
  assert.match(shop, /name: open\.sellerName/, 'the payment sheet name must come from the server');
  const sheet = shop.slice(shop.indexOf('key: open.keyId'), shop.indexOf('handler: function', shop.indexOf('key: open.keyId')));
  assert.doesNotMatch(sheet, /People for Animals|name: 'PFA/,
    'the sheet must not claim the money is PFA\u2019s');
  const payStart = fs.readFileSync(path.join(ROOT, 'lib', 'routes', 'pfa-pay-start.js'), 'utf8');
  assert.match(payStart, /process\.env\.PFA_SELLER_NAME/, 'and the server reads it from configuration');

  /* And the guard that keeps store money out of PFA's own gateway is intact. */
  const payment = fs.readFileSync(path.join(ROOT, 'lib', 'payment.js'), 'utf8');
  assert.match(payment, /Store purchases remain separate from CCAvenue/);
});

test('the seller checkout survives as a fallback, so the Store is never unbuyable', () => {
  const shop = fs.readFileSync(path.join(ROOT, 'pfa-shop.html'), 'utf8');
  assert.match(shop, /function legacyCheckout\(\)/);
  assert.match(shop, /DIRECT_PAY_DISABLED[\s\S]{0,120}legacyCheckout\(\)/,
    'a switched-off gateway hands over to the seller checkout rather than failing');
  assert.match(shop, /if \(!ready\) return legacyCheckout\(\)/,
    'a blocked Razorpay script does the same');
});

/* ---------------- what the drawer does with the tiers ---------------- */

/* Lifts the drawer's own shipHtml() out of the page and runs it, so these
   check what a shopper is shown rather than what the markup looks like. */
function shipHtmlWith(options, code) {
  const html = fs.readFileSync(path.join(ROOT, 'pfa-shop.html'), 'utf8');
  const src = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1]).reduce((a, b) => (a.length > b.length ? a : b));
  const start = src.indexOf('function shipHtml(){');
  assert.ok(start > -1, 'shipHtml is gone from the drawer');
  let depth = 0, end = -1;
  for (let i = src.indexOf('{', start); i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') { depth -= 1; if (!depth) { end = i + 1; break; } }
  }
  return new Function('ship', 'esc', 'money', 'buyer', `${src.slice(start, end)}; return shipHtml();`)(
    { options, code, loading: false },
    (s) => String(s),
    (n) => '\u20b9' + Number(n).toLocaleString('en-IN'),
    { pin: '576222' }
  );
}

test('every rate the seller offers is shown, not just the first', () => {
  /* The shop showed a single Standard at 99 and it read as PFA's own flat
     charge. It was the only rate Shopify returned for that bag and PIN. Give
     the drawer two and it shows two, cheapest first, which is the order the
     rates arrive in. */
  const out = shipHtmlWith([
    { code: 'Standard', title: 'Standard', description: '3 to 5 business days', amount: 59 },
    { code: 'Express', title: 'Express', amount: 109 }
  ], 'Standard');
  assert.equal((out.match(/type="radio"/g) || []).length, 2, 'both tiers must be selectable');
  assert.match(out, /Standard/);
  assert.match(out, /Express/);
  assert.match(out, /\u20b959/);
  assert.match(out, /\u20b9109/);
});

test('a rate of zero reads as Free, not as \u20b90', () => {
  /* This is what a free-delivery threshold looks like when it reaches the
     page: Shopify returns the rate at zero and the drawer names it. Nothing
     here has to change for a threshold to work, which is why a threshold must
     never be written into this page instead. */
  const out = shipHtmlWith([
    { code: 'Free', title: 'Standard', description: 'Orders over \u20b9999', amount: 0 },
    { code: 'Express', title: 'Express', amount: 109 }
  ], 'Free');
  assert.match(out, /Free/);
  assert.doesNotMatch(out, /\u20b90\b/, 'a free delivery must not print as a price of zero');
});

test('two methods at one price are one line, the fastest, with no radio', () => {
  /* Over the free-delivery threshold Shopify quotes Standard and Express
     both at zero. There is nothing to decide, so nothing is asked. */
  const out = shipHtmlWith([
    { code: 'Standard', title: 'Standard (Prepaid)', description: 'Tracking number provided', amount: 0 },
    { code: 'Express', title: 'Express', description: 'Tracking number provided', amount: 0 }
  ], 'Standard');
  assert.equal((out.match(/type="radio"/g) || []).length, 0, 'no choice to make');
  assert.match(out, /Express/, 'the fastest is the one named');
  assert.doesNotMatch(out, /Standard/);
  assert.match(out, /Free/);
  /* Two paid methods at the same price collapse the same way; a difference of a rupee does not. */
  assert.equal((shipHtmlWith([{ code: 'a', title: 'A', amount: 50 }, { code: 'b', title: 'B', amount: 50 }], 'a').match(/type="radio"/g) || []).length, 0);
  assert.equal((shipHtmlWith([{ code: 'a', title: 'A', amount: 50 }, { code: 'b', title: 'B', amount: 51 }], 'a').match(/type="radio"/g) || []).length, 2);
});

test('no delivery figure or threshold is written into the shop', () => {
  /* The charge a shopper pays is matched against the rates Shopify offers that
     exact basket and address; lib/routes/pfa-pay-start.js refuses a delivery
     code that matches nothing rather than guessing. A tier written into this
     page would therefore either be ignored or refused at payment, after the
     shopper had been shown it. */
  const shop = fs.readFileSync(path.join(ROOT, 'pfa-shop.html'), 'utf8');
  const script = [...shop.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g, ' ');
  /* The page may read a threshold; it may not contain one. The figure comes
     from the server with the store block, and the only literal allowed here is
     the zero that means nobody has set one. */
  assert.doesNotMatch(script, /freeAbove\s*=\s*[1-9]/, 'no threshold figure may be written into the page');
  assert.doesNotMatch(script, /\bfreeDeliveryAbove\s*[:=]\s*[1-9]/, 'nor assigned one here');
  const pay = fs.readFileSync(path.join(ROOT, 'lib', 'routes', 'pfa-pay-start.js'), 'utf8');
  assert.match(pay, /DELIVERY_NOT_OFFERED/, 'the server must still refuse a rate Shopify did not quote');
});

/* ---------------- what the shop says about free delivery ---------------- */

function deliveryNoteFn() {
  const html = fs.readFileSync(path.join(ROOT, 'pfa-shop.html'), 'utf8');
  const src = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1]).reduce((a, b) => (a.length > b.length ? a : b));
  const grab = (name) => {
    const start = src.indexOf(`function ${name}(`);
    assert.ok(start > -1, `${name} is gone from the shop`);
    let depth = 0;
    for (let i = src.indexOf('{', start); i < src.length; i += 1) {
      if (src[i] === '{') depth += 1;
      else if (src[i] === '}') { depth -= 1; if (!depth) return src.slice(start, i + 1); }
    }
    throw new Error(`unbalanced ${name}`);
  };
  const body = `${grab('deliveryGap')}\n${grab('deliveryNote')}`;
  return (sub, freeAbove, wrong) => new Function('freeAbove', 'freeAboveWrong', 'money',
    `${body}; return deliveryNote(${sub});`)(freeAbove, wrong, (n) => '\u20b9' + Number(n).toLocaleString('en-IN'));
}

test('with no threshold set, the shop promises nothing about free delivery', () => {
  /* Nobody has told the page there is a free tier, so it says only that
     delivery is settled later, which is true of every order. Inventing a
     threshold would be the same fault as inventing a rate. */
  const note = deliveryNoteFn();
  assert.equal(note(395, 0, false), 'delivery calculated at checkout');
  assert.equal(note(99999, 0, false), 'delivery calculated at checkout');
});

test('with a threshold set, it says exactly how much more to add', () => {
  const note = deliveryNoteFn();
  assert.equal(note(395, 999, false), '\u20b9604 more for free delivery');
  assert.equal(note(998, 999, false), '\u20b91 more for free delivery');
  assert.equal(note(999, 999, false), 'free delivery', 'at the threshold it is reached, not one short');
  assert.equal(note(8390, 999, false), 'free delivery');
});

test('if Shopify contradicts the threshold, the shop stops claiming it', () => {
  /* The threshold is a figure someone typed into an environment variable to
     mirror the seller's shipping profile. If the two drift, the seller is
     right: a basket over the threshold that still gets charged proves the
     claim wrong, and the page falls back to saying nothing. */
  const note = deliveryNoteFn();
  assert.equal(note(8390, 999, true), 'delivery calculated at checkout');

  const shop = fs.readFileSync(path.join(ROOT, 'pfa-shop.html'), 'utf8');
  assert.match(shop, /freeAboveWrong = true/, 'nothing ever sets the contradiction flag');
  assert.match(shop, /subtotal\(\) >= freeAbove && ship\.options\[0\]\.amount > 0/,
    'the flag must be set from the rates Shopify actually returned');
});

test('the threshold is configuration, never a figure in the page', () => {
  /* Same rule as the rates themselves. A number written here would be a
     promise about the seller\u2019s money made by a page that cannot keep it. */
  const shop = fs.readFileSync(path.join(ROOT, 'pfa-shop.html'), 'utf8');
  const script = [...shop.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(script, /freeAbove = \(storeState && Number\(storeState\.freeDeliveryAbove\)\) \|\| 0/,
    'the threshold has to arrive from the server');
  /* `var freeAbove = 0` is the off switch, not a figure: zero is allowed and
     anything else is not. */
  assert.doesNotMatch(script, /freeAbove\s*=\s*[1-9]/, 'no threshold may be written into the page');
  assert.match(script, /var freeAbove = 0;/, 'and it starts off until the server says otherwise');

  const route = fs.readFileSync(path.join(ROOT, 'lib', 'routes', 'paws-catalog.js'), 'utf8');
  assert.match(route, /process\.env\.PFA_FREE_DELIVERY_ABOVE/, 'and from configuration on the server');
  assert.doesNotMatch(route, /PFA_FREE_DELIVERY_ABOVE.*\|\|\s*\d{2,}/, 'with no default figure standing in');
});

test('the cart bar says something about delivery on every order', () => {
  const shop = fs.readFileSync(path.join(ROOT, 'pfa-shop.html'), 'utf8');
  assert.match(shop, /barLine'\)\.textContent[\s\S]{0,160}deliveryNote\(sub\)/,
    'the summary line must carry the delivery clause');
});
