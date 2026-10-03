'use strict';

/* POST /api/shop/response: CCAvenue's answer for a shop order.

   The answer is decrypted with PFA's working key, so only CCAvenue can have
   written it. It is then checked against the order saved at checkout in the
   pfa-oldsite backend: the same merchant, the same amount to the paisa. A
   payment that passes is recorded on the order as 'paid', counted once in
   aggregates/store, and confirmed to the shopper by email and on this page.
   A payment that fails or is cancelled is recorded as such, and the stock
   held for it is put back.

   CCAvenue can deliver the same answer more than once, and a shopper can
   refresh. The order is changed only from 'initiated', and only if nobody
   changed it since it was read, so a second delivery finds the order already
   settled and shows it without counting, emailing or releasing anything
   again. The fields written are the ones the old site's callback wrote
   (PFAcurrent api/_record-order.js), so the pfa-oldsite panel reads them. */

const crypto = require('crypto');
const { cleanText, decodeMerchantData, decrypt, escapeHtml, getBaseUrl, readRequestBody, setSecurityHeaders } = require('../../ccavenue');
const { getCredentials } = require('../../pfa-ccavenue-flow');
const backend = require('../../shop-backend');
const CONFIRM = require('../../confirmations');
const mail = require('../../caregiver-mail');
const queue = require('../../caregiver-store');

const PHONE = '+91 99533 13319';
const ORDER_ID = /^PFA-SHP-[A-Z0-9]{8}$/;

const rupees = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

function callbackFrom(data) {
  const raw = cleanText(data.order_status || 'Invalid', 40);
  return {
    rawStatus: raw,
    status: raw.toLowerCase(),
    amount: cleanText(data.amount, 20),
    trackingId: cleanText(data.tracking_id, 100),
    bankRef: cleanText(data.bank_ref_no, 100),
    paymentMode: cleanText(data.payment_mode, 80),
    failureMessage: cleanText(data.failure_message || data.status_message, 240)
  };
}

function paise(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

/* What the order's status becomes. 'paid' only when every check passes. */
function outcome(order, data, merchantId, cb) {
  const merchantOk = Boolean(data.merchant_id) && cleanText(data.merchant_id, 40) === merchantId;
  const amountOk = paise(order.total) === paise(cb.amount) && Number.isFinite(paise(cb.amount));
  if (cb.status === 'success' && merchantOk && amountOk) return 'paid';
  if (cb.status === 'success') return 'verification_failed';
  if (cb.status === 'aborted' || cb.status === 'cancelled') return 'cancelled';
  if (['awaited', 'pending', 'initiated'].includes(cb.status)) return 'pending';
  return 'failed';
}

async function readOrder(id) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await backend.read('orders', id); } catch (error) { lastError = error; }
  }
  throw lastError;
}

/* Moves the order out of 'initiated', once. Returns the order as it now
   stands and whether this call was the one that settled it. */
async function settle(id, merchantId, data, cb) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const doc = await readOrder(id);
    if (!doc) return { order: null, settledNow: false };
    const order = doc.data;
    if (order.status !== 'initiated' && order.status !== 'pending') return { order, settledNow: false };
    const status = outcome(order, data, merchantId, cb);
    const now = new Date().toISOString();
    const update = {
      status,
      callbackAt: now,
      paidAt: status === 'paid' ? now : null,
      amountCharged: Number(cb.amount) || 0,
      trackingId: cb.trackingId,
      bankRef: cb.bankRef,
      paymentMode: cb.paymentMode,
      failureMessage: status === 'verification_failed' ? 'Paid at CCAvenue but the amount or merchant did not match the order. Check before dispatching.' : cb.failureMessage,
      fulfilment: status === 'paid' ? 'pending' : 'not-required'
    };
    const writes = [{ set: ['orders', id], data: update, ifUpdateTime: doc.updateTime }];
    if (status === 'paid') {
      writes.push({ increment: ['aggregates', 'store'], by: { orders: 1, revenue: Number(order.total) || 0 } });
    }
    /* A settled failure gives its pieces back. A pending answer keeps them
       held: the payment may still go through. */
    if (status === 'failed' || status === 'cancelled') {
      for (const r of Array.isArray(order.stockReserved) ? order.stockReserved : []) {
        if (r && r.key && Number(r.qty) > 0) writes.push({ increment: ['stock', r.key], by: { remaining: Number(r.qty) } });
      }
    }
    const result = await backend.commit(writes);
    if (result.ok) return { order: { ...order, ...update }, settledNow: true };
    if (!result.conflict) throw new Error(result.error || 'The order could not be updated.');
  }
  const doc = await readOrder(id);
  return { order: doc ? doc.data : null, settledNow: false };
}

/* The shopper's confirmation, and PFA's own note when an inbox is named. */
async function confirm(order, siteUrl) {
  const payload = {
    name: order.customer && order.customer.name,
    email: order.customer && order.customer.email,
    orderId: order.orderId,
    items: order.items,
    subtotal: order.subtotal,
    shipping: order.shipping,
    total: order.total,
    paidAt: order.paidAt,
    bankReference: order.bankRef,
    trackingId: order.trackingId,
    delivery: order.delivery,
    siteUrl
  };
  const sent = await CONFIRM.send({
    to: payload.email, template: 'shop_order_confirmed', payload,
    dedupeKey: `shop_order_confirmed:${order.orderId}`, mail, queue, timeoutMs: 2500
  });
  const staff = cleanText(process.env.PFA_SHOP_ORDERS_EMAIL, 160);
  if (staff) {
    await CONFIRM.send({ to: staff, template: 'shop_order_staff', payload, dedupeKey: `shop_order_staff:${order.orderId}`, mail, queue, timeoutMs: 2500 })
      .catch(() => null);
  }
  try {
    await backend.commit([{ set: ['orders', order.orderId], data: { confirmationEmail: sent.state, confirmationEmailTo: sent.to || '', confirmationAt: new Date().toISOString() } }]);
  } catch (_) { /* the page still says what happened */ }
  return sent;
}

/* ---- the pages ------------------------------------------------------------ */

const STYLE = '*{box-sizing:border-box}body{margin:0;background:#fff;color:#111;font-family:Arial,sans-serif}.wrap{min-height:100vh;display:grid;place-items:center;padding:24px}.card{width:min(720px,100%);border:1px solid #d9d9d9;padding:40px}.logo{width:190px;max-width:58%;height:auto;margin-bottom:34px}.eyebrow{margin:0;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#6b6b6b}h1{font-size:40px;line-height:1.04;margin:12px 0 16px}p{font-size:16px;line-height:1.6;color:#444;margin:0}.number{margin:30px 0 0;padding:22px 0;border-top:2px solid #111;border-bottom:2px solid #111;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:8px 24px}.number span{font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#6b6b6b}.number strong{font-size:26px;letter-spacing:.04em;overflow-wrap:anywhere}.lines{margin:26px 0 0;border-top:1px solid #ddd}.row{display:flex;justify-content:space-between;gap:24px;padding:12px 0;border-bottom:1px solid #ddd;font-size:14px}.row span{color:#555}.row strong{text-align:right;overflow-wrap:anywhere}.row.total{font-size:17px}.row.total span{color:#111;font-weight:700}.to{margin:24px 0 0;font-size:15px;line-height:1.6;color:#333}.stages{list-style:none;margin:26px 0 0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.stages li{border:1px solid #d9d9d9;padding:14px;font-size:13px;font-weight:700;line-height:1.3}.stages li span{display:block;font-size:11px;color:#6b6b6b;margin-bottom:6px}.stages li.done{background:#111;color:#fff;border-color:#111}.stages li.done span{color:#bbb}.mail{margin:24px 0 0;padding:16px 18px;border:1px solid #111}.mail p{margin:0 0 6px;font-size:15px;line-height:1.55;color:#333}.mail strong{color:#111;overflow-wrap:anywhere}.mail .mail__title{font-size:20px;font-weight:800;color:#111;margin-bottom:8px}.mail .mail__ask{margin:12px 0 0;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#6b6b6b}.mail ol{list-style:decimal;margin:6px 0 0;padding-left:20px;font-size:14px;line-height:1.6;color:#444}.reason{margin-top:18px;padding:14px;border:1px solid #e3c1bd;background:#fff8f7;color:#7a271a;line-height:1.45}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:28px}.btn{display:inline-block;text-decoration:none;padding:14px 18px;font-weight:700;border:1px solid #111;font-size:14px}.dark{background:#111;color:#fff}.light{background:#fff;color:#111}.fine{margin:26px 0 0;font-size:12px;line-height:1.6;color:#6b6b6b}@media(max-width:560px){.card{padding:26px}h1{font-size:32px}.stages{grid-template-columns:1fr}}';

function row(label, value, cls) {
  if (value === undefined || value === null || value === '') return '';
  return `<div class="row${cls ? ' ' + cls : ''}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function page(response, status, title, body, script) {
  const nonce = crypto.randomBytes(18).toString('base64');
  response.statusCode = status;
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.setHeader('Content-Security-Policy', `default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'`);
  response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)} | PFA</title><style>${STYLE}</style></head><body><main class="wrap"><section class="card"><img class="logo" src="/img/logo.png" alt="People for Animals">${body}</section></main>${script ? `<script nonce="${nonce}">${script}</script>` : ''}</body></html>`);
}

function orderLines(order) {
  const items = (Array.isArray(order.items) ? order.items : []).map((i) => row(`${i.qty} x ${i.name}, size ${i.size}`, rupees(i.lineTotal))).join('');
  return `<div class="lines">${items}${row('Delivery', rupees(order.shipping))}${row('Total paid', rupees(order.total), 'total')}</div>`;
}

function deliveryText(d) {
  d = d || {};
  return [d.name, d.address, [...new Set([d.city, d.district].filter(Boolean))].join(', '), `${d.state || ''} ${d.zip || ''}`.trim(), d.tel ? `Mobile ${d.tel}` : ''].filter(Boolean).map(escapeHtml).join('<br>');
}

/* The bag on this device is emptied once the order is paid for. */
const CLEAR_BAG = "try{localStorage.removeItem('pfa-shop-bag')}catch(e){}";

function renderPaid(response, base, order, mailNote) {
  const first = cleanText(order.customer && order.customer.name, 120).split(/\s+/)[0] || '';
  const stages = ['Paid', 'Packed and dispatched', 'Delivered'].map((label, i) => `<li class="${i === 0 ? 'done' : ''}"><span>${i + 1}</span>${escapeHtml(label)}</li>`).join('');
  return page(response, 200, 'Order placed', `<p class="eyebrow">Order placed</p><h1>${escapeHtml(first ? `Thank you, ${first}.` : 'Thank you.')}</h1><p>Your order is paid and placed with People for Animals. PFA packs it and sends it to the address below, and will be in touch on your email or mobile if anything needs checking. Every purchase supports PFA&rsquo;s work for animals.</p><div class="number"><span>Order number</span><strong>${escapeHtml(order.orderId)}</strong></div>${orderLines(order)}<p class="eyebrow" style="margin-top:24px">Delivering to</p><p class="to">${deliveryText(order.delivery)}</p><ol class="stages">${stages}</ol>${mailNote || ''}<div class="lines">${row('CCAvenue tracking ID', order.trackingId)}${row('Bank reference', order.bankRef)}${row('Paid by', order.paymentMode)}</div><div class="actions"><a class="btn dark" href="${escapeHtml(base)}/shop.html">Back to the shop</a><a class="btn light" href="${escapeHtml(base)}/index.html">PFA home</a></div><p class="fine">This is a purchase, so no 80G receipt is issued for it. Quote the order number in any message about this order, or call PFA on ${escapeHtml(PHONE)}. PFA never sees your card, bank or UPI details; the payment was taken by CCAvenue.</p>`, CLEAR_BAG);
}

function renderNotPaid(response, base, order, cb) {
  const status = order ? order.status : '';
  const pending = status === 'pending';
  const review = status === 'verification_failed';
  const title = pending ? 'Your payment is being confirmed' : review ? 'Your payment needs a check' : status === 'cancelled' ? 'Payment cancelled' : 'Payment not completed';
  const lead = pending
    ? `CCAvenue has not given a final answer yet. Do not pay again: PFA will confirm the order to you once the payment settles. Keep the order number below.`
    : review
      ? `CCAvenue reports a payment, but it did not match the order, so it has not been placed automatically. PFA will check it and contact you. Do not pay again; call ${PHONE} with the order number below if you need to.`
      : 'No money was taken for this order, and your bag is still on this device. You can try again whenever you are ready.';
  const reason = !pending && !review && cb && cb.failureMessage ? `<div class="reason"><strong>Payment message:</strong> ${escapeHtml(cb.failureMessage)}</div>` : '';
  return page(response, 200, title, `<p class="eyebrow">PFA shop</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(lead)}</p>${order ? `<div class="number"><span>Order number</span><strong>${escapeHtml(order.orderId)}</strong></div>` : ''}${reason}<div class="lines">${row('CCAvenue tracking ID', cb && cb.trackingId)}${row('Status', cb && cb.rawStatus)}</div><div class="actions"><a class="btn dark" href="${escapeHtml(base)}/shop.html#bag">${pending || review ? 'Back to the shop' : 'Back to your bag'}</a><a class="btn light" href="tel:+919953313319">Call ${escapeHtml(PHONE)}</a></div>`);
}

function renderUnverifiable(response, base, message) {
  return page(response, 400, 'We could not confirm this payment', `<p class="eyebrow">PFA shop</p><h1>We could not confirm this payment</h1><p>${escapeHtml(message)}</p><div class="actions"><a class="btn dark" href="tel:+919953313319">Call ${escapeHtml(PHONE)}</a><a class="btn light" href="${escapeHtml(base)}/shop.html">Back to the shop</a></div>`);
}

module.exports = async function handler(request, response) {
  setSecurityHeaders(response);
  let base = 'https://peopleforanimalsindia.org';
  try { base = getBaseUrl(request); } catch (_) { /* keep the default */ }
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return renderUnverifiable(response, base, 'CCAvenue returns shop payments to this address by POST only.');
  }

  let data;
  let merchantId;
  try {
    const creds = getCredentials('inr');
    merchantId = creds.merchantId;
    const body = await readRequestBody(request);
    const enc = cleanText(body.encResp || body.enc_resp, 200000);
    if (!enc) throw new Error('missing encResp');
    data = decodeMerchantData(decrypt(enc, creds.workingKey));
  } catch (error) {
    console.error('PFA shop response unreadable', cleanText(error && error.message, 200));
    return renderUnverifiable(response, base, `This payment answer could not be read. If money left your account, call PFA on ${PHONE}; nothing is lost.`);
  }

  const id = cleanText(data.order_id, 80);
  const cb = callbackFrom(data);
  if (!ORDER_ID.test(id)) {
    console.error('PFA shop response for an unknown order id', { id, status: cb.rawStatus, trackingId: cb.trackingId });
    return renderUnverifiable(response, base, `This payment answer names no shop order. If money left your account, call PFA on ${PHONE} with the CCAvenue tracking ID ${cb.trackingId || 'from your bank statement'}.`);
  }

  let settled;
  try {
    settled = await settle(id, merchantId, data, cb);
  } catch (error) {
    /* The backend could not be reached. The answer is genuine, so it is
       logged in full for reconciliation, and the shopper is told the truth. */
    console.error('PFA shop order NOT recorded', { orderId: id, status: cb.rawStatus, amount: cb.amount, trackingId: cb.trackingId, bankRef: cb.bankRef, message: cleanText(error && error.message, 200) });
    return renderUnverifiable(response, base, `${cb.status === 'success' ? 'Your payment reached CCAvenue, but' : 'This answer reached PFA, but'} the order record could not be updated just now. Do not pay again. Keep your order number, ${id}, and call PFA on ${PHONE}; the payment is on record with CCAvenue.`);
  }

  if (!settled.order) {
    console.error('PFA shop response for an order the backend does not hold', { orderId: id, status: cb.rawStatus, amount: cb.amount, trackingId: cb.trackingId });
    return renderUnverifiable(response, base, `The order ${id} is not on record. If money left your account, call PFA on ${PHONE} with this number; the payment is on record with CCAvenue.`);
  }

  const order = { ...settled.order, orderId: id };
  if (settled.settledNow) await backend.ledger.settled(order);
  console.info('PFA shop payment result', { orderId: id, status: order.status, trackingId: cb.trackingId, settledNow: settled.settledNow });
  if (order.status !== 'paid') return renderNotPaid(response, base, order, cb);

  let sent = { state: order.confirmationEmail || 'none', to: order.confirmationEmailTo || '' };
  if (settled.settledNow) {
    try { sent = await confirm(order, base); } catch (error) {
      console.error('PFA shop confirmation not sent', { orderId: id, message: cleanText(error && error.message, 200) });
      sent = { state: 'unsent', to: cleanText(order.customer && order.customer.email, 160) };
    }
  }
  const note = CONFIRM.noticeHtml(CONFIRM.notice({ state: sent.state, to: sent.to, number: 'Order number', reference: id, item: 'Your order confirmation' }));
  return renderPaid(response, base, order, note);
};

module.exports._private = { callbackFrom, outcome, settle, paise };
