'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { computeMembershipValidity } = require('../lib/firebase');
const { publicRecord } = require('../api/member-status.js')._private;

const NOW = new Date('2026-08-20T00:00:00.000Z');

test('a new member gets one year from today', () => {
  const result = computeMembershipValidity(null, NOW);
  assert.equal(result.memberSince, NOW.toISOString());
  assert.equal(result.validUntil, '2027-08-20T00:00:00.000Z');
});

test('renewing before expiry stacks the new year onto the existing expiry, not today', () => {
  const previous = { memberSince: '2025-08-20T00:00:00.000Z', validUntil: '2027-08-20T00:00:00.000Z' };
  const result = computeMembershipValidity(previous, NOW);
  assert.equal(result.memberSince, previous.memberSince, 'member-since date must not reset on renewal');
  assert.equal(result.validUntil, '2028-08-20T00:00:00.000Z', 'should extend from the existing expiry, not from today');
});

test('renewing after lapsing starts a fresh year from today, not from the stale expiry', () => {
  const previous = { memberSince: '2024-01-01T00:00:00.000Z', validUntil: '2026-05-12T00:00:00.000Z' };
  const result = computeMembershipValidity(previous, NOW);
  assert.equal(result.memberSince, previous.memberSince, 'member-since date is still preserved across a lapse');
  assert.equal(result.validUntil, '2027-08-20T00:00:00.000Z', 'should start from today, not compound a past date');
});

test('member-status only ever exposes card-display fields, never contact details', () => {
  const record = publicRecord({
    memberId: 'PFA-MBR-ABCD1234',
    name: 'Asha Kumar',
    currency: 'INR',
    physicalCard: true,
    memberSince: '2025-08-20T00:00:00.000Z',
    validUntil: '2099-01-01T00:00:00.000Z',
    mobile: '9876543210',
    email: 'asha@example.com',
    amount: 514
  });
  assert.equal(record.mobile, undefined);
  assert.equal(record.email, undefined);
  assert.equal(record.amount, undefined);
  assert.equal(record.standing, 'active');
});

test('member-status marks a lapsed member as expired, not active', () => {
  const record = publicRecord({
    memberId: 'PFA-MBR-EFGH5678', name: 'Ravi Shah', currency: 'INR', physicalCard: false,
    memberSince: '2020-01-01T00:00:00.000Z', validUntil: '2021-01-01T00:00:00.000Z'
  });
  assert.equal(record.standing, 'expired');
});

test('legacy-import mobile normalization matches the format lib/payment.js already stores', () => {
  const { normalizedMobile } = require('../lib/firebase');
  // These must all converge to the same value so dedup lookups actually match
  // real member records, which store bare 10-digit numbers (no +91).
  assert.equal(normalizedMobile('9876543210'), '9876543210');
  assert.equal(normalizedMobile('+91 98765 43210'), '9876543210');
  assert.equal(normalizedMobile('91-9876543210'), '9876543210');
  assert.equal(normalizedMobile('919876543210'), '9876543210');
  assert.equal(normalizedMobile('12345'), '', 'too short must be rejected, not silently accepted');
  assert.equal(normalizedMobile(''), '');
  assert.equal(normalizedMobile(null), '');
});
