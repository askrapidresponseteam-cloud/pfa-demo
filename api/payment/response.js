'use strict';

const crypto = require('crypto');
const {
  cleanText,
  decodeMerchantData,
  decrypt,
  escapeHtml,
  getBaseUrl,
  readRequestBody,
  setSecurityHeaders
} = require('../../lib/ccavenue');
const { applyPaymentResult, getTransaction } = require('../../lib/firebase');
const CARETAKER = require('../../lib/caretaker');
const caretakerStore = require('../../lib/caretaker-store');
const caretakerMail = require('../../lib/caretaker-mail');
const { getCredentials } = require('../../lib/pfa-ccavenue-flow');

function money(value, currency = 'INR') {
  const number = Number(value);
  if (!Number.isFinite(number)) return cleanText(value, 30);
  const locale = String(currency).toUpperCase() === 'USD' ? 'en-US' : 'en-IN';
  return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2 }).format(number);
}

function currencyFromRequest(request) {
  try {
    const parsed = new URL(request.url, 'https://pfa.local');
    return parsed.searchParams.get('cur') === 'usd' ? 'usd' : 'inr';
  } catch (_) {
    return 'inr';
  }
}

function row(label, value) {
  if (value === undefined || value === null || value === '') return '';
  return `<div class="row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function statusOf(value) {
  return cleanText(value || 'Invalid', 40).toLowerCase();
}

function callbackFrom(data) {
  return {
    rawStatus: cleanText(data.order_status || 'Invalid', 40),
    status: statusOf(data.order_status),
    trackingId: cleanText(data.tracking_id, 100),
    bankReference: cleanText(data.bank_ref_no, 100),
    paymentMode: cleanText(data.payment_mode, 80),
    failureMessage: cleanText(data.failure_message || data.status_message, 240)
  };
}

function amountMatches(transaction, returnedAmount) {
  const expected = Math.round(Number(transaction.amount) * 100);
  const returned = Math.round(Number(returnedAmount) * 100);
  return Number.isFinite(expected) && Number.isFinite(returned) && expected === returned;
}

function displayMetadata(transaction) {
  const metadata = transaction.metadata || {};
  if (transaction.type === 'send') {
    const destination = metadata.destination || {};
    const items = Array.isArray(metadata.items)
      ? metadata.items.map((item) => `${item.name} × ${item.quantity}`).join(', ')
      : '';
    return {
      first: row('Destination', [destination.locality, destination.district, destination.state].filter(Boolean).join(', ')),
      second: row('Items', items),
      third: row('Volunteer routing', 'Verified local volunteer assignment after payment')
    };
  }
  if (transaction.type === 'caretaker') return {
    first: row('Card', 'Colony Animal Caretaker Card'),
    second: row('Charge', 'Printing and delivery only. The card itself is free.'),
    third: row('Card number', metadata.cardId || '')
  };
  if (transaction.type === 'donate') return {
    first: row('Cause', metadata.cause || 'Where it is needed most'),
    second: '',
    third: ''
  };
  return {
    first: row('Card', metadata.physicalCard ? 'Physical Patron card' : 'Digital Patron card'),
    second: row('Fulfilment', metadata.physicalCard ? 'Delivery details retained in Firebase' : 'Digital card issued after verification'),
    third: ''
  };
}

function renderInvalid(response, baseUrl, message = 'We could not verify the payment response.') {
  response.statusCode = 400;
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment response unavailable | PFA</title><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#111}.wrap{min-height:100vh;display:grid;place-items:center;padding:24px}.card{width:min(560px,100%);border:1px solid #ddd;padding:32px}.logo{width:180px;max-width:55%;margin-bottom:30px}h1{font-size:32px;margin:0 0 12px}p{color:#555;line-height:1.55}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}.btn{display:inline-block;padding:14px 18px;border:1px solid #111;text-decoration:none;font-weight:700}.dark{background:#111;color:#fff}.light{background:#fff;color:#111}</style></head><body><main class="wrap"><section class="card"><img class="logo" src="/media/pfa-logo.png" alt="People for Animals"><h1>Payment response unavailable</h1><p>${escapeHtml(message)}</p><div class="actions"><a class="btn dark" href="${escapeHtml(baseUrl)}/give.html">Donate or Give/Send</a><a class="btn light" href="${escapeHtml(baseUrl)}/membership.html">Membership</a></div></section></main></body></html>`);
}

function renderResult(response, baseUrl, transaction, result, memberId, caretaker) {
  const success = result.status === 'success';
  const pending = result.status === 'pending' || result.status === 'initiated' || result.status === 'awaited';
  const typeLabels = { donate: 'Donation', send: 'Give/Send order', membership: 'Patron membership', caretaker: 'Caretaker Card shipping' };
  const typeLabel = typeLabels[transaction.type] || 'Payment';
  const title = success
    ? `${typeLabel} successful`
    : pending
      ? 'Payment is being confirmed'
      : result.status === 'aborted' || result.status === 'cancelled'
        ? 'Payment was cancelled'
        : 'Payment was not completed';
  const message = success
    ? transaction.type === 'membership'
      ? 'Welcome, Patron. Your payment was verified and your permanent Member ID is shown below.'
      : transaction.type === 'caretaker'
        ? 'Your Caretaker Card has been issued. The printed card is queued for delivery, and the digital card is ready to download now.'
      : transaction.type === 'send'
        ? 'Your food order payment was verified. The selected destination and items have been retained for volunteer routing.'
        : 'Thank you for supporting People for Animals. Keep the PFA transaction ID for your records.'
    : pending
      ? 'CCAvenue has not returned a final result yet. Keep the PFA transaction ID and check your payment account before trying again.'
      : 'No successful payment was recorded. Check the message below before trying again.';
  const accent = success ? 'success' : pending ? 'pending' : 'failure';
  const nonce = crypto.randomBytes(18).toString('base64');
  const metadata = displayMetadata(transaction);
  const memberScript = success && transaction.type === 'membership' && memberId
    ? `<script nonce="${nonce}">(function(){try{var verified=${safeJson({id:memberId,name:transaction.customer?.name||'',mobile:transaction.customer?.mobile||'',email:transaction.customer?.email||'',physical:Boolean(transaction.metadata?.physicalCard),total:transaction.amount,orderId:transaction.orderId})};var pending=null;try{pending=JSON.parse(sessionStorage.getItem('pfa_patron_pending')||'null')}catch(e){}if(pending&&String(pending.mobile||'')===String(verified.mobile||'')&&String(pending.name||'').trim().toLowerCase()===String(verified.name||'').trim().toLowerCase()&&pending.photo)verified.photo=pending.photo;else verified.photo='';var now=new Date();var valid=new Date(now.getTime());valid.setFullYear(valid.getFullYear()+1);var monthYear=function(d){return d.toLocaleDateString('en-IN',{month:'short',year:'numeric'}).toUpperCase()};verified.since=monthYear(now);verified.valid=monthYear(valid);localStorage.setItem('pfa_patron',JSON.stringify(verified));sessionStorage.removeItem('pfa_patron_pending')}catch(e){console.error('Could not save Patron card locally')}})();</script>`
    : '';
  /* The card already exists and is already on this device; the only thing the
     browser learns here is that a printed copy is now on its way. */
  const caretakerScript = success && transaction.type === 'caretaker' && caretaker.cardId
    ? `<script nonce="${nonce}">(function(){try{var held=JSON.parse(localStorage.getItem('pfa_caretaker')||'null');if(held&&held.cardId===${safeJson(caretaker.cardId)}){held.printed=true;held.trackingId=${safeJson(caretaker.trackingId || '')};localStorage.setItem('pfa_caretaker',JSON.stringify(held))}}catch(e){}})();</script>`
    : '';

  const action = success && transaction.type === 'caretaker' && caretaker.cardId
    ? `<a class="btn dark" href="${escapeHtml(baseUrl)}/caretaker-card.html?id=${encodeURIComponent(caretaker.cardId)}">Open Caretaker Card</a>`
    : success && transaction.type === 'membership' && memberId
    ? `<a class="btn dark" href="${escapeHtml(baseUrl)}/member.html?id=${encodeURIComponent(memberId)}">Open Patron card</a>`
    : `<a class="btn dark" href="${escapeHtml(baseUrl)}/${transaction.type === 'membership' ? 'membership.html' : transaction.type === 'caretaker' ? 'caretaker.html' : 'give.html'}">Return to PFA</a>`;

  response.statusCode = 200;
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.setHeader('Content-Security-Policy', `default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'`);
  response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} | PFA</title><style>*{box-sizing:border-box}body{margin:0;background:#fff;color:#111;font-family:Arial,sans-serif}.wrap{min-height:100vh;display:grid;place-items:center;padding:24px}.card{width:min(680px,100%);border:1px solid #d9d9d9;padding:36px}.logo{width:190px;max-width:58%;height:auto;margin-bottom:34px}.mark{width:52px;height:52px;display:grid;place-items:center;border:2px solid #111;border-radius:50%;font-size:25px;font-weight:800;margin-bottom:22px}.success .mark{border-color:#16794b;color:#16794b}.failure .mark{border-color:#b42318;color:#b42318}.pending .mark{border-color:#8a6200;color:#8a6200}h1{font-size:36px;line-height:1.06;margin:0 0 14px}p{font-size:17px;line-height:1.55;color:#555;margin:0}.details{margin:28px 0;border-top:1px solid #ddd}.row{display:flex;justify-content:space-between;gap:24px;padding:14px 0;border-bottom:1px solid #ddd}.row span{color:#666}.row strong{text-align:right;overflow-wrap:anywhere}.reason{margin-top:18px;padding:14px;border:1px solid #e3c1bd;background:#fff8f7;color:#7a271a;line-height:1.45}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:28px}.btn{display:inline-block;text-decoration:none;padding:14px 18px;font-weight:700;border:1px solid #111}.dark{background:#111;color:#fff}.light{background:#fff;color:#111}@media(max-width:560px){.card{padding:25px}.row{display:block}.row strong{display:block;text-align:left;margin-top:6px}h1{font-size:31px}}</style></head><body><main class="wrap"><section class="card ${accent}"><img class="logo" src="/media/pfa-logo.png" alt="People for Animals"><div class="mark" aria-hidden="true">${success ? '✓' : pending ? '…' : '!'}</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><div class="details">${row('PFA transaction ID', transaction.orderId)}${success && memberId ? row('Permanent Member ID', memberId) : ''}${success && caretaker.cardId ? row('Caretaker Card number', caretaker.cardId) : ''}${success && caretaker.trackingId ? row('Delivery tracking ID', caretaker.trackingId) : ''}${row('Amount', money(transaction.amount, transaction.currency || 'INR'))}${row('CCAvenue tracking ID', result.trackingId)}${row('Bank reference', result.bankReference)}${metadata.first}${metadata.second}${metadata.third}${row('Status', success ? 'Success' : result.rawStatus)}</div>${!success && result.failureMessage ? `<div class="reason"><strong>Payment message:</strong> ${escapeHtml(result.failureMessage)}</div>` : ''}<div class="actions">${action}<a class="btn light" href="${escapeHtml(baseUrl)}/index.html">PFA home</a></div></section></main>${memberScript}${caretakerScript}</body></html>`);
}

module.exports = async function handler(request, response) {
  setSecurityHeaders(response);
  let baseUrl = '/';
  try { baseUrl = getBaseUrl(request); } catch (_) { baseUrl = 'https://peopleforanimalsindia.org'; }
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return renderInvalid(response, baseUrl, 'CCAvenue can return payment results only through a POST callback.');
  }

  const currency = currencyFromRequest(request);
  try {
    const { merchantId, workingKey } = getCredentials(currency);
    const body = await readRequestBody(request);
    const encryptedResponse = cleanText(body.encResp || body.enc_resp, 200000);
    if (!encryptedResponse) throw new Error('CCAvenue response is missing.');
    const data = decodeMerchantData(decrypt(encryptedResponse, workingKey));
    const orderId = cleanText(data.order_id, 80);
    if (!/^PFA-(?:DON|SND|MEM|CAR)-[A-Z0-9]{8}$/.test(orderId)) throw new Error('The PFA transaction ID is invalid.');
    const transaction = await getTransaction(orderId);
    if (!transaction || !['donate', 'send', 'membership', 'caretaker'].includes(transaction.type)) throw new Error('The stored PFA transaction could not be found.');

    const callback = callbackFrom(data);
    const merchantMatches = Boolean(data.merchant_id) && cleanText(data.merchant_id, 40) === merchantId;
    const amountMatchesResult = amountMatches(transaction, data.amount);
    const currencyMatches = String(transaction.currency || 'inr').toLowerCase() === currency;
    const successResult = callback.status === 'success';
    const verified = merchantMatches && amountMatchesResult && currencyMatches && successResult;
    if (!merchantMatches || !amountMatchesResult || !currencyMatches) callback.status = 'verification_failed';

    const updated = await applyPaymentResult({ orderId, callback, verified });
    const effective = updated.status === 'success' ? 'success' : (updated.status || callback.status);
    console.info('PFA CCAvenue payment result', { orderId, type: transaction.type, status: effective, trackingId: callback.trackingId });
    /* A verified shipping payment opens the parcel record. This runs after the
       transaction is marked successful and is re-entrant, because CCAvenue can
       and does deliver the same callback more than once. */
    let caretaker = { cardId: '', trackingId: '' };
    if (transaction.type === 'caretaker' && effective === 'success') {
      try {
        const recorded = await caretakerStore.recordPaidShipping({
          orderId,
          payment: {
            orderId,
            trackingId: callback.trackingId,
            bankReference: callback.bankReference,
            paymentMode: callback.paymentMode,
            rawStatus: callback.rawStatus,
            amount: transaction.amount
          }
        });

        caretaker = {
          cardId: recorded.card.cardId,
          trackingId: recorded.shipment ? recorded.shipment.trackingId : ''
        };

        if (!recorded.alreadyRecorded && recorded.card.email) {
          const cardUrl = `${baseUrl}/caretaker-card.html?id=${encodeURIComponent(recorded.card.cardId)}`;
          const payload = {
            cardId: recorded.card.cardId,
            trackingId: caretaker.trackingId,
            amount: transaction.amount,
            paymentReference: callback.trackingId || orderId,
            cardUrl
          };
          const queued = await caretakerStore.queueEmail({
            template: 'shipping_paid',
            to: recorded.card.email,
            dedupeKey: `shipping_paid:${orderId}`,
            payload
          });
          if (queued.created && caretakerMail.isConfigured()) {
            try {
              const sent = await caretakerMail.deliver({ to: recorded.card.email, template: 'shipping_paid', payload });
              await caretakerStore.recordEmailResult({ emailId: queued.emailId, ok: true, providerId: sent.providerId });
            } catch (mailError) {
              await caretakerStore.recordEmailResult({ emailId: queued.emailId, ok: false, error: mailError && mailError.message });
            }
          }
        }
      } catch (shipError) {
        /* The money is taken and verified; a failure to open the parcel record
           must not present as a failed payment. It is logged loudly for the
           admin panel to pick up instead. */
        console.error('PFA caretaker shipment could not be opened for', orderId, CARETAKER.clean(shipError && shipError.message, 240));
      }
    }

    return renderResult(
      response,
      baseUrl,
      { ...transaction, ...updated },
      { ...callback, status: effective },
      updated.memberId || transaction.memberId || '',
      caretaker
    );
  } catch (error) {
    console.error('PFA CCAvenue response error:', cleanText(error && error.message, 240));
    return renderInvalid(response, baseUrl, 'We could not verify this payment. Check your bank or UPI account before trying again.');
  }
};

module.exports._private = { amountMatches, callbackFrom, statusOf };
