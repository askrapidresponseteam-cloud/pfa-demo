'use strict';

/* The transfer page hands the visitor to CCAvenue. It used to fire
   form.submit() on every load - so the Back button from CCAvenue, or their
   close button landing here, re-submitted instantly and every way out of the
   checkout looped straight back into it: the close button read as broken.
   The hand-off now runs once per order per session; any return shows the
   card at rest with Continue securely and a cancel link home. */

const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

process.env.CCAVENUE_MERCHANT_ID = process.env.CCAVENUE_MERCHANT_ID || '12345';
process.env.CCAVENUE_ACCESS_CODE = process.env.CCAVENUE_ACCESS_CODE || 'ACC123';
process.env.CCAVENUE_WORKING_KEY = process.env.CCAVENUE_WORKING_KEY || '0123456789ABCDEF0123456789ABCDEF';
process.env.CCAVENUE_PAYMENT_URL = process.env.CCAVENUE_PAYMENT_URL || 'https://test.ccavenue.com/transaction';

const { renderTransfer } = require('../lib/pfa-ccavenue-flow');

function render(returnUrl) {
  let html = '';
  const response = { statusCode: 0, setHeader() {}, end(s) { html = s; } };
  renderTransfer(
    response,
    { merchant_id: '12345', order_id: 'PFA-CGA-TESTTEST', amount: '50.00' },
    { title: 'Opening secure application payment', message: 'M', currency: 'inr', returnUrl }
  );
  return html;
}

function boot(html, preload) {
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://pfa.test/api/payment/create' });
  const w = dom.window;
  const counter = { n: 0 };
  w.HTMLFormElement.prototype.submit = function () { counter.n++; };
  if (preload) Object.keys(preload).forEach((k) => w.sessionStorage.setItem(k, preload[k]));
  return { w, counter };
}

test('a fresh visit hands off exactly once and marks the order', () => {
  const { w, counter } = boot(render('/get-involved.html'));
  w.dispatchEvent(new w.Event('pageshow'));
  assert.equal(counter.n, 1, 'one automatic hand-off');
  assert.equal(w.sessionStorage.getItem('pfa:transfer:PFA-CGA-TESTTEST'), '1');
});

test('coming back never re-submits: the close button must not read as broken', () => {
  const { w, counter } = boot(render('/get-involved.html'), { 'pfa:transfer:PFA-CGA-TESTTEST': '1' });
  w.dispatchEvent(new w.Event('pageshow'));
  assert.equal(counter.n, 0, 'a used page waits for the visitor');
  assert.ok(w.document.querySelector('form .btn'), 'Continue securely is still there to try again');
});

test('a bfcache restore also waits, and the cancel link goes home', () => {
  const { w, counter } = boot(render('/get-involved.html'));
  const ev = new w.Event('pageshow');
  Object.defineProperty(ev, 'persisted', { value: true });
  w.dispatchEvent(ev);
  assert.equal(counter.n, 0, 'restored from history: no hand-off');
  const leave = w.document.querySelector('a.leave');
  assert.equal(leave.getAttribute('href'), '/get-involved.html', 'the way out is the page the visitor came from');
  assert.match(leave.textContent, /no payment is taken/i);
});

test('every flow tells the transfer page where home is', () => {
  const fs = require('fs');
  const create = fs.readFileSync(require.resolve('../lib/routes/payment/create.js'), 'utf8');
  assert.match(create, /'caregiver-application': '\/get-involved\.html'/);
  assert.match(create, /donate: '\/donate\.html'/);
  const order = fs.readFileSync(require.resolve('../lib/routes/caregiver/order.js'), 'utf8');
  const replace = fs.readFileSync(require.resolve('../lib/routes/caregiver/replace.js'), 'utf8');
  assert.match(order, /returnUrl: '\/caregiver-card\.html'/);
  assert.match(replace, /returnUrl: '\/caregiver-card\.html'/);
});
