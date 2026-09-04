'use strict';
/* Track order on the shop door: one button, one dialog, one request to PFA's
   own status endpoint - and a courier key that never leaves the server. */
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const ROOT = path.join(__dirname, '..');
const shop = fs.readFileSync(path.join(ROOT, 'shop.html'), 'utf8');
const route = fs.readFileSync(path.join(ROOT, 'lib', 'routes', 'pfa-order-status.js'), 'utf8');
const COURIER = require('../lib/courier-tracking');

test('the door has one Track order button and the whole experience stays on the page', () => {
  assert.equal((shop.match(/id="trackOpen"/g) || []).length, 1, 'exactly one button');
  assert.match(shop, /<dialog class="trk" id="trackDlg"/, 'a dialog, not a page');
  const dialog = shop.slice(shop.indexOf('<dialog class="trk"'), shop.indexOf('</dialog>'));
  assert.ok(!/href=/.test(dialog), 'nothing in the dialog leads anywhere else');
  assert.match(shop, /fetch\('\/api\/pfa-order-status\?id=' \+ encodeURIComponent\(id\) \+ '&contact=' \+ encodeURIComponent\(contact\)/,
    'the PFA order number and the contact, to PFA, and nothing else');
  for (const s of ['Order placed', 'Confirmed', 'Processing', 'Shipped', 'Out for delivery', 'Delivered']) {
    assert.ok(shop.includes(`'${s}'`), `station: ${s}`);
  }
});

test('the courier key is a server secret; the page never sees a bearer or a partner host', () => {
  assert.ok(!/Bearer|partner\/orders|PFA_TRACKING/.test(shop), 'no credential, header or partner path in the page');
  assert.match(route, /COURIER\.enrich\(PAYMENTS\.trackingView\(record\)\)/, 'direct-pay lookups ask the courier');
  assert.match(route, /\(id && !token\) \? await COURIER\.enrich\(ORDERS\.publicView\(record\)\)/, 'seller-checkout lookups too, but never the payment poll');
  const env = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
  assert.match(env, /PFA_TRACKING_API_BASE=\nPFA_TRACKING_API_KEY=/, 'both variables documented');
});

test('with no courier configured, or a courier that fails, the view comes back untouched', async () => {
  const saved = { b: process.env.PFA_TRACKING_API_BASE, k: process.env.PFA_TRACKING_API_KEY, f: global.fetch };
  const view = { pfaOrderId: 'PFA-ST-1006', orderNumber: '1006', status: 'CONFIRMED' };
  delete process.env.PFA_TRACKING_API_BASE; delete process.env.PFA_TRACKING_API_KEY;
  assert.strictEqual(await COURIER.enrich(view), view, 'unset: identity');
  process.env.PFA_TRACKING_API_BASE = 'https://tracking.example'; process.env.PFA_TRACKING_API_KEY = 'k';
  global.fetch = async () => { throw new Error('down'); };
  assert.strictEqual(await COURIER.enrich(view), view, 'courier down: identity, no throw');
  global.fetch = async () => ({ ok: true, json: async () => ({ status: 'Out for delivery', courier: 'Blue Dart', awb: '1', current_location: 'Kolkata Hub', estimated_delivery: '2026-09-05', timeline: [{ at: '2026-09-04T08:00:00Z', label: 'Out for delivery', location: 'Kolkata' }] }) });
  const rich = await COURIER.enrich(view);
  assert.equal(rich.courier.status, 'Out for delivery');
  assert.equal(rich.courier.events.length, 1);
  assert.equal(rich.pfaOrderId, 'PFA-ST-1006', 'the PFA id remains the id');
  if (saved.b === undefined) delete process.env.PFA_TRACKING_API_BASE; else process.env.PFA_TRACKING_API_BASE = saved.b;
  if (saved.k === undefined) delete process.env.PFA_TRACKING_API_KEY; else process.env.PFA_TRACKING_API_KEY = saved.k;
  global.fetch = saved.f;
});

test('every unhappy path has its own sentence, and none of them can scramble the page', () => {
  const dialogScript = shop.slice(shop.indexOf('/* ---------- track order ----------'));
  for (const s of [
    'Both the PFA order number and the email or mobile are needed.',
    'The PFA order number is needed.',
    'That looks like the seller\\u2019s order number.',
    'The email or mobile used for the order is needed',
    'Enter the email address or the 10-digit mobile number',
    'PFA took too long to answer.',
    'PFA could not be reached.',
    'PFA answered in a way this page could not read.',
    'Nothing was charged.',
    'Refund recorded'
  ]) assert.ok(dialogScript.includes(s), `missing: ${s}`);
  assert.match(dialogScript, /if \(\/\^\\d\+\$\/\.test\(id\)\)/, 'a digits-only number is the seller\u2019s, and is caught before asking');
  assert.match(dialogScript, /setTimeout\(function\(\)\{ ctrl\.abort\(\); \}, 12000\)/, 'a hanging request is cut off');
  assert.match(dialogScript, /r\.text\(\)\.then/, 'the body is read as text first, so an HTML error page cannot throw');
  assert.match(dialogScript, /function ts\(v\)\{ var n = v \? Date\.parse\(v\) : NaN; return isNaN\(n\) \? 0 : n; \}/, 'an unreadable time sorts as zero, never as NaN');
  assert.match(dialogScript, /if \(typeof dlg\.showModal !== 'function'\)\{ open\.hidden = true; return; \}/, 'no dialog support means no dead button');
  const courier = fs.readFileSync(path.join(ROOT, 'lib', 'courier-tracking.js'), 'utf8');
  assert.match(courier, /response\.status === 401 \|\| response\.status === 403/, 'a refused key is logged as the operator\u2019s problem it is');
});

test('courier stations light from the Shopify fulfilment the site already mirrors - no partner key needed', () => {
  /* The seller ships through Shiprocket, which writes carrier, AWB and
     shipment_status into the Shopify fulfilment; the orders/fulfilled and
     fulfillments/update webhooks already carry that into the public view as
     p.tracking. The first cut of the tracker only half-read it - Shopify
     spells out_for_delivery with underscores - so the fourth station never
     lit and the carrier line never showed from this source. */
  const script = shop.slice(shop.indexOf('/* ---------- track order ----------'));
  for (const k of ['in_transit', 'out_for_delivery', 'attempted_delivery', 'delivered', 'failure']) {
    assert.ok(script.includes(k + ':'), `shipment_status ${k} is understood`);
  }
  assert.match(script, /t === 'out_for_delivery' \|\| \/out for delivery\/\.test\(c\)\) return 4/, 'the fourth station lights from Shopify\u2019s spelling');
  assert.match(script, /\(tr\.company \|\| 'Courier'\) \+ \(tr\.number \? ' \\u00b7 AWB ' \+ tr\.number : ''\)/, 'carrier and AWB shown from the mirror');
  assert.ok(!/tr\.url|tracking\.url/.test(script), 'the courier\u2019s own tracking page is never linked: the timeline lives here');
});

test('a lookup asks Shopify for a fresh mirror when the order is not settled, and never fails because of it', async () => {
  /* PFA-ST-1196 was delivered and read "Processing": the mirror is written
     only by the seller's webhooks, and none had arrived. Now an id lookup on
     an unsettled order fetches that one order from Shopify, pushes it
     through the same handlers a webhook would, and links it in. */
  assert.match(route, /refreshFromShopify/, 'the route refreshes');
  assert.match(route, /PAYMENTS\.linkMirror\(mirror\)/, 'a direct-pay order gets the seller\u2019s side linked in');
  assert.match(route, /function settled\(view\)/, 'delivered, cancelled and refunded orders are left alone');
  const ORDERS = require('../lib/store-orders');
  const saved = process.env.PFA_SHOPIFY_ADMIN_TOKEN;
  delete process.env.PFA_SHOPIFY_ADMIN_TOKEN;
  assert.equal(await ORDERS.refreshFromShopify('123'), null, 'no admin token: nothing asked, nothing broken');
  process.env.PFA_SHOPIFY_ADMIN_TOKEN = 'tok';
  assert.equal(await ORDERS.refreshFromShopify('124', async () => { throw new Error('down'); }), null, 'Shopify down: null, not a throw');
  if (saved === undefined) delete process.env.PFA_SHOPIFY_ADMIN_TOKEN; else process.env.PFA_SHOPIFY_ADMIN_TOKEN = saved;
});

test('the two doors share a row, and the form actually hides once there is a result', () => {
  assert.match(shop, /<div class="gate__ctas">\s*<a class="btn btn--light gate__cta" href="pfa-shop\.html">Explore<\/a>\s*<button type="button" class="btn gate__cta gate__cta--track" id="trackOpen">/, 'one wrapper, both doors inside');
  assert.match(shop, /\.gate__ctas\{display:flex;flex-wrap:wrap;gap:12px/, 'a flex row that wraps');
  assert.match(shop, /\.trk__form\[hidden\]\{display:none\}/, 'display:grid on the form no longer beats the hidden attribute');
});

test('with Shiprocket credentials the courier answers by AWB: one login, a kept token, delivered means delivered', async () => {
  /* Blue Dart delivered a parcel on 31 Aug and the tracker still said
     Shipped on 2 Sep: Shopify's shipment_status only advances for carriers
     Shopify itself tracks, so the mirror's knowledge stops at the AWB. The
     courier's record is the truth and Shiprocket's API is the documented way
     to it. */
  const saved = { e: process.env.PFA_SHIPROCKET_EMAIL, p: process.env.PFA_SHIPROCKET_PASSWORD };
  process.env.PFA_SHIPROCKET_EMAIL = 'api@pfa.example'; process.env.PFA_SHIPROCKET_PASSWORD = 'pw';
  const calls = [];
  const fetchStub = async (url, opts) => {
    calls.push(String(url));
    if (/auth\/login$/.test(url)) return { ok: true, status: 200, json: async () => ({ token: 'tok-1' }) };
    assert.match(String(opts.headers.Authorization), /Bearer tok-1/, 'the token is carried');
    return { ok: true, status: 200, json: async () => ({ tracking_data: {
      etd: '2026-09-01 18:00:00',
      shipment_track: [{ current_status: 'Delivered', courier_name: 'Blue Dart Surface', awb_code: '77146772102' }],
      shipment_track_activities: [
        { date: '2026-08-31 18:23:00', activity: 'Shipment Delivered', location: 'Kundapura' },
        { date: '2026-08-28 09:00:00', activity: 'In Transit', location: 'Kalyani' }
      ]
    } }) };
  };
  const view = { pfaOrderId: 'PFA-ST-1196', orderNumber: '1196', status: 'FULFILLED', tracking: { number: '77146772102', company: 'Blue Dart Surface' } };
  const first = await COURIER.enrich(view, fetchStub);
  assert.equal(first.courier.status, 'Delivered', 'the courier outranks the frozen mirror');
  assert.equal(first.courier.location, 'Kundapura', 'last seen is the newest checkpoint');
  assert.equal(first.courier.events.length, 2, 'the checkpoints become the timeline');
  const second = await COURIER.enrich(view, fetchStub);
  assert.equal(second.courier.status, 'Delivered');
  assert.equal(calls.filter((u) => /auth\/login$/.test(u)).length, 1, 'one login for many lookups: the token is kept');
  const noAwb = await COURIER.enrich({ pfaOrderId: 'PFA-D-1', orderNumber: '9' }, fetchStub);
  assert.equal(noAwb.courier, undefined, 'no AWB yet: nothing asked, nothing invented');
  if (saved.e === undefined) delete process.env.PFA_SHIPROCKET_EMAIL; else process.env.PFA_SHIPROCKET_EMAIL = saved.e;
  if (saved.p === undefined) delete process.env.PFA_SHIPROCKET_PASSWORD; else process.env.PFA_SHIPROCKET_PASSWORD = saved.p;
});

test('order number + mobile proves a seller-checkout order, in every spelling of the number', () => {
  /* PFA-ST-1196 tracked fine by email and 404ed by mobile: the seller-order
     branch compared email alone, and one layer down the record never stored
     a phone - the capture read customer.email and stopped. Both fixed; both
     sides now go through the submissions normaliser, so the checkout's
     "+91 81052 50299" and a typed 8105250299 are one number. */
  const ORDERS = require('../lib/store-orders');
  const record = { customer: { email: 'Karthik.Dhanya11@GMAIL.com', phone: '+91 81052 50299' } };
  for (const given of ['8105250299', '08105250299', '+918105250299', '91 81052 50299', 'karthik.dhanya11@gmail.com ']) {
    assert.equal(ORDERS.contactMatches(record, given), true, `matches: ${given}`);
  }
  assert.equal(ORDERS.contactMatches(record, '8105250290'), false, 'a different number is a stranger');
  assert.equal(ORDERS.contactMatches({ customer: { email: 'a@b.co' } }, '8105250299'), false, 'no phone held, no phone match');
  assert.match(route, /ORDERS\.contactMatches\(record, contact\)/, 'the route asks the shared matcher, not email alone');
  assert.match(route, /givenIsPhone && record\.shopifyOrderId && !\(record\.customer && record\.customer\.phone\)/,
    'a phoneless record gets one fresh read before the gate judges a mobile lookup');
  const orders = fs.readFileSync(path.join(ROOT, 'lib', 'store-orders.js'), 'utf8');
  assert.match(orders, /phone: cleanText\(customer\.phone \|\| order\.phone/, 'new records capture the phone from wherever Shopify put it');
  assert.match(orders, /customer: withContact\(next\.customer, payload\)/, 'and the fulfilled merge lets an old record learn it');
});
