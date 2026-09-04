'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../lib/routes/location-lookup');
const { fromNominatim, fromBigDataCloud, merge } = handler._private;

function run(query) {
  const r = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = JSON.parse(b); } };
  return handler({ method: 'GET', query, headers: {} }, r).then(() => r);
}

test('coordinates outside India are refused before any geocoder is called', async () => {
  const r = await run({ lat: '51.5', lng: '-0.1' });
  assert.equal(r.statusCode, 400);
  assert.equal(r.body.code, 'OUT_OF_RANGE');
});

test('OpenStreetMap address maps to the checkout fields', () => {
  const out = fromNominatim({ address: { country_code: 'in', postcode: '576222', state: 'Karnataka', state_district: 'Udupi District', town: 'Kundapur', road: 'Ankadakatte Rd', house_number: '4/232' } });
  assert.deepEqual(out, { pincode: '576222', state: 'Karnataka', district: 'Udupi', city: 'Kundapur', street: '4/232 Ankadakatte Rd' });
});

test('BigDataCloud outside India is ignored; merge fills only gaps', () => {
  assert.equal(fromBigDataCloud({ countryCode: 'US', postcode: '10001' }), null);
  assert.deepEqual(merge({ pincode: '576222', state: '', district: '', city: 'Kundapur', street: '' }, { state: 'Karnataka', district: 'Udupi' }),
    { pincode: '576222', state: 'Karnataka', district: 'Udupi', city: 'Kundapur', street: '' });
});
