'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createMemberId, createPfaOrderId } = require('../lib/pfa-ccavenue-flow');
const { parsePaymentRequest, parseType } = require('../lib/payment');
const { amountMatches } = require('../lib/routes/payment/response')._private;

const customer = { name: 'Asha Kumar', mobile: '9876543210', email: 'asha@example.com' };


test('donation is parsed with server-validated amount and donor metadata', () => {
  const parsed = parsePaymentRequest({
    type: 'donate', amount: '365', ...customer, address: '16 MG Road, Udupi', cause: 'Hospitals', terms: 'yes'
  });
  assert.equal(parsed.type, 'donate');
  assert.equal(parsed.amount, '365.00');
  assert.equal(parsed.metadata.cause, 'Hospitals');
  assert.equal(parsed.merchantValues.merchant_param3, 'donate');
});

test('Give/Send amount is recomputed from the fixed catalog', () => {
  const parsed = parsePaymentRequest({
    type: 'send', ...customer, state: 'Karnataka', district: 'Udupi', locality: 'Koteshwara', terms: 'yes',
    items: [
      { key: 'Rice', quantity: 2 },
      { key: 'Poha', quantity: 1 }
    ]
  });
  assert.equal(parsed.amount, '1420.00');
  assert.equal(parsed.metadata.weight, 25);
  assert.equal(parsed.metadata.items[0].price, 550);
  assert.equal(parsed.merchantValues.merchant_param3, 'send');
});


test('Store is rejected by the CCAvenue payment endpoint', () => {
  assert.throws(() => parseType({ type: 'store' }), /Store purchases remain separate/);
});

test('callback amount comparison uses paise precision', () => {
  assert.equal(amountMatches({ amount: 365 }, '365.00'), true);
  assert.equal(amountMatches({ amount: 365 }, '364.99'), false);
});

test('USD donation is parsed with USD-scale amount bounds', () => {
  const parsed = parsePaymentRequest({
    type: 'donate', currency: 'usd', amount: '25', ...customer, address: '221 Baker St', cause: 'Hospitals', terms: 'yes'
  });
  assert.equal(parsed.currency, 'usd');
  assert.equal(parsed.amount, '25.00');
  assert.equal(parsed.merchantValues.currency, 'USD');
  assert.throws(
    () => parsePaymentRequest({ type: 'donate', currency: 'usd', amount: '10000000', ...customer, address: '221 Baker St', terms: 'yes' }),
    /between \$1 and \$100,000/
  );
});

test('USD Give/Send recomputes amount from the USD-priced catalog, not the INR one', () => {
  const parsed = parsePaymentRequest({
    type: 'send', currency: 'usd', ...customer, state: 'Karnataka', district: 'Udupi', terms: 'yes',
    items: [{ key: 'Rice', quantity: 2 }]
  });
  assert.equal(parsed.metadata.items[0].price, 7);
  assert.equal(parsed.amount, '14.00');
  assert.equal(parsed.merchantValues.currency, 'USD');
});


test('omitting currency still defaults every flow to INR, unchanged from before', () => {
  const donate = parsePaymentRequest({ type: 'donate', amount: '365', ...customer, address: '16 MG Road, Udupi', terms: 'yes' });
  assert.equal(donate.currency, 'inr');
  assert.equal(donate.merchantValues.currency, 'INR');
});
