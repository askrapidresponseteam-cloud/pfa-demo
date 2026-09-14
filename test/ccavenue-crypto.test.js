'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  decodeMerchantData,
  decrypt,
  encodeMerchantData,
  encrypt
} = require('../lib/ccavenue');

test('CCAvenue AES encryption matches the standard PHP integration algorithm', () => {
  const workingKey = 'sampleWorkingKey123';
  const merchantData = 'merchant_id=10880&order_id=PFATEST123&currency=INR&amount=1.00';
  const encrypted = encrypt(merchantData, workingKey);
  assert.equal(
    encrypted,
    'b1328e9fe570774ae92ed05fc40f1c1db7e51c612db0e908af79ec08d18e1ef17d6c19e0780c84143440781ca18530605af4b7d4c412b86c6a2e7cfd6530fd33'
  );
  assert.equal(decrypt(encrypted, workingKey), merchantData);
});

test('merchant fields survive encoding and decoding', () => {
  const source = {
    merchant_id: '10880',
    amount: '365.00',
    billing_name: 'Asha & Kumar',
    merchant_param1: 'membership'
  };
  assert.deepEqual(decodeMerchantData(encodeMerchantData(source)), source);
});
