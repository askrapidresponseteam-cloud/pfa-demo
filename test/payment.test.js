'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createMemberId, createPfaOrderId } = require('../lib/pfa-ccavenue-flow');
const { parsePaymentRequest, parseType } = require('../lib/payment');
const { amountMatches } = require('../lib/routes/payment/response')._private;

const customer = { name: 'Asha Kumar', mobile: '9876543210', email: 'asha@example.com' };

test('PFA payment IDs identify their payment type', () => {
  assert.match(createPfaOrderId('donate'), /^PFA-DON-[A-Z0-9]{8}$/);
  assert.match(createPfaOrderId('send'), /^PFA-SND-[A-Z0-9]{8}$/);
  assert.match(createPfaOrderId('membership'), /^PFA-MEM-[A-Z0-9]{8}$/);
  assert.match(createMemberId(), /^PFA-MBR-[A-Z0-9]{8}$/);
});

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

test('membership price ignores the browser and always includes the printed card', () => {
  const delivery = { address: '12 MG Road', pin: '576222', district: 'Udupi', state: 'Karnataka' };

  // The printed Patron card is part of the membership now, not an add-on.
  const asked = parsePaymentRequest({ type: 'membership', amount: '1', ...customer, physicalCard: 'yes', ...delivery });
  const declined = parsePaymentRequest({ type: 'membership', amount: '1', ...customer, physicalCard: 'no', ...delivery });

  assert.equal(asked.amount, '514.00');
  assert.equal(declined.amount, '514.00', 'a browser cannot decline the printed card to pay less');
  assert.equal(declined.metadata.physicalCard, true);

  // Something is always posted, so an address is always required.
  assert.throws(() => parsePaymentRequest({ type: 'membership', amount: '1', ...customer }), /delivery address/i);
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

test('USD membership stays digital-only, since PFA does not post internationally', () => {
  const parsed = parsePaymentRequest({ type: 'membership', currency: 'usd', amount: '1', ...customer, physicalCard: 'no' });
  assert.equal(parsed.amount, '10.00');
  assert.equal(parsed.metadata.physicalCard, false);

  // Even asking for one does not make it shippable or change the price.
  const asked = parsePaymentRequest({ type: 'membership', currency: 'usd', amount: '1', ...customer, physicalCard: 'yes' });
  assert.equal(asked.amount, '10.00');
  assert.equal(asked.metadata.physicalCard, false);
});

test('omitting currency still defaults every flow to INR, unchanged from before', () => {
  const donate = parsePaymentRequest({ type: 'donate', amount: '365', ...customer, address: '16 MG Road, Udupi', terms: 'yes' });
  assert.equal(donate.currency, 'inr');
  assert.equal(donate.merchantValues.currency, 'INR');
});
