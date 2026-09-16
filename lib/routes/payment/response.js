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
} = require('../../../lib/ccavenue');
const { applyPaymentResult, getTransaction, getDb } = require('../../../lib/firebase');
const CAREGIVER = require('../../../lib/caregiver');
const S = require('../../../lib/submissions');
const documents = require('../caregiver/documents');
const caregiverStore = require('../../../lib/caregiver-store');
const caregiverMail = require('../../../lib/caregiver-mail');
const CONFIRM = require('../../../lib/confirmations');
const { getCredentials } = require('../../../lib/pfa-ccavenue-flow');

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
  if (transaction.type === 'membership') return {
    first: row('Membership', metadata.tierLabel || 'PFA membership'),
    second: row('What it includes', Array.isArray(metadata.kit) && metadata.kit.length ? metadata.kit.join(', ') : 'Membership, and the standing of an active working member of PFA.'),
    third: row('What happens next', 'Your card and kit reach you in 20 to 25 days. A welcome letter has been emailed to you.')
  };
  if (transaction.type === 'caregiver-application') return {
    first: row('Application', 'Colony caregiver card'),
    second: row('Fee', 'Confirms the application and gives it a number. It is not payment for a card.'),
    third: row('What happens next', 'A named person at PFA reads it and decides.')
  };
  if (transaction.type === 'caregiver') return {
    first: row('Card', 'Colony Animal Colony Caregiver Card'),
    second: row('Charge', 'Printing and delivery only. The card itself is free.'),
    third: row('Card number', metadata.cardId || '')
  };
  if (transaction.type === 'donate') return {
    first: row('Cause', metadata.cause || 'Where it is needed most'),
    second: '',
    third: ''
  };
  return {
    first: '',
    second: '',
    third: ''
  };
}

function renderInvalid(response, baseUrl, message = 'We could not verify the payment response.') {
  response.statusCode = 400;
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment response unavailable | PFA</title><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#111}.wrap{min-height:100vh;display:grid;place-items:center;padding:24px}.card{width:min(560px,100%);border:1px solid #ddd;padding:32px}.logo{width:180px;max-width:55%;margin-bottom:30px}h1{font-size:32px;margin:0 0 12px}p{color:#555;line-height:1.55}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}.btn{display:inline-block;padding:14px 18px;border:1px solid #111;text-decoration:none;font-weight:700}.dark{background:#111;color:#fff}.light{background:#fff;color:#111}</style></head><body><main class="wrap"><section class="card"><img class="logo" src="/img/logo.png" alt="People for Animals"><h1>Payment response unavailable</h1><p>${escapeHtml(message)}</p><div class="actions"><a class="btn dark" href="${escapeHtml(baseUrl)}/donate.html">Donate</a><a class="btn light" href="${escapeHtml(baseUrl)}/index.html">PFA home</a></div></section></main></body></html>`);
}

/* Creates the submission record for a paid application, once. */
/* A member, on the first successful callback: one record under PFA-MEM,
   with the number minted once and kept on the transaction so a redelivered
   callback finds it rather than minting another. The number is what the
   welcome letter carries and what the admin register and the track page
   find the member by. */
async function recordMembership(orderId, transaction, callback) {
  const db = getDb();
  if (transaction.membershipReference) return transaction.membershipReference;
  const nowMs = Date.now();
  const reference = await S.allocateReference(db, 'PFA-MEM', nowMs);
  const createdAt = new Date(nowMs).toISOString();
  const meta = transaction.metadata || {};
  const customer = transaction.customer || {};
  await db.collection('submissions').doc(reference).create({
    reference,
    kind: 'PFA-MEM',
    kindLabel: S.KIND_LABELS['PFA-MEM'],
    fields: {
      name: customer.name || '',
      mobile: customer.mobile || '',
      email: customer.email || '',
      tier: meta.tierLabel || '',
      kit: Array.isArray(meta.kit) ? meta.kit.join(', ') : '',
      address: meta.address || '', city: meta.city || '', district: meta.district || '', state: meta.state || '',
      amount: transaction.amount, orderId, bankReference: callback.bankReference || '',
      title: `${meta.tierLabel || 'PFA membership'} - ${customer.name || ''}`.trim()
    },
    /* what the track page checks a number against: without these keys a
       member typing their number and email would be told they did not match */
    contactKeys: S.contactKeysFor({ mobile: customer.mobile, email: customer.email }),
    page: 'get-involved.html',
    status: 'new',
    history: [{ status: 'new', at: createdAt, note: 'Paid; membership active.' }],
    createdAt, updatedAt: createdAt
  });
  await db.collection('transactions').doc(orderId).update({ membershipReference: reference });
  return reference;
}

async function recordCaregiverApplication(orderId, transaction, callback) {
  const db = getDb();
  const existing = transaction.applicationReference;
  if (existing) return existing;

  const nowMs = Date.now();
  const reference = await S.allocateReference(db, 'PFA-CG', nowMs);
  const createdAt = new Date(nowMs).toISOString();
  const meta = transaction.metadata || {};
  const customer = transaction.customer || {};

  /* The photograph and address proof, sent before the fee, go beside the
     record first (1 the face for the card, 2 the proof), so the record can
     be written once, complete, and never merged over. */
  const attached = await documents.attachTo(db, meta.documents, db.collection('submissions').doc(reference), createdAt);

  await db.collection('submissions').doc(reference).create({
    reference,
    kind: 'PFA-CG',
    attachments: attached,
    kindLabel: S.KIND_LABELS['PFA-CG'],
    fields: {
      name: customer.name || '',
      mobile: customer.mobile || '',
      email: customer.email || '',
      address: meta.address || '',
      city: meta.city || '',
      title: 'Colony caregiver card application',
      notes: [meta.animals ? `About ${meta.animals} animals.` : '', meta.notes || ''].filter(Boolean).join(' ')
    },
    contactKeys: S.contactKeysFor({ mobile: customer.mobile, email: customer.email }),
    page: 'get-involved.html',
    status: 'new',
    history: [{ status: 'new', at: createdAt }],
    /* The fee is part of the record, so the panel can see it was paid without
       going to the payments register. */
    payment: {
      orderId,
      amount: transaction.amount,
      currency: transaction.currency,
      trackingId: callback.trackingId || '',
      bankReference: callback.bankReference || '',
      paidAt: createdAt
    },
    createdAt,
    receivedAtMs: nowMs
  });

  /* update(), not set-with-merge: the transaction was read a moment ago so it
     exists, and this file must contain no merge at all — test/submissions.test.js
     forbids one in any file that touches a submission, and that guard is worth
     more than the convenience. */
  await db.collection('transactions').doc(orderId).update({ applicationReference: reference });
  return reference;
}

const RECEIPT_TIMEOUT_MS = 2500;

/* The letter each paid flow is confirmed in, and what the page calls it. A
   paid colony caregiver application sent nothing at all until v1.354: the fee
   cleared, a number was minted, and the only record the applicant left with
   was the page. */
const RECEIPT_TEMPLATES = {
  donate: 'payment_received',
  membership: 'membership_welcome',
  'caregiver-application': 'caregiver_application_received'
};
const RECEIPT_ITEMS = {
  donate: 'A receipt',
  membership: 'Your welcome letter',
  'caregiver-application': ''
};

/* Sends the confirmation for a paid flow, once, and says what happened to it:
   { state: sent | queued | unsent | none, to }. The row goes on the outbound
   queue first, so a provider that is down at the moment of the callback costs
   a delay, not the email. */
async function sendReceipt(orderId, transaction, callback, firstSuccess, siteUrl) {
  const customer = transaction.customer || {};
  const to = cleanText(customer.email, 160).toLowerCase();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) return { sent: false, reason: 'NO_EMAIL', state: 'none', to: '' };
  if (!caregiverMail.isConfigured()) return { sent: false, reason: 'MAIL_NOT_CONFIGURED', state: 'unsent', to };
  /* A redelivered callback is not a second payment; the record says whether
     the receipt already went. firstSuccess covers the race where two
     callbacks land before either has written receiptSentAt. */
  if (transaction.receiptSentAt) return { sent: false, reason: 'ALREADY_SENT', state: 'sent', to };
  if (!firstSuccess) {
    const fresh = await getTransaction(orderId);
    if (fresh && fresh.receiptSentAt) return { sent: false, reason: 'ALREADY_SENT', state: 'sent', to };
  }
  const metadata = transaction.metadata || {};
  const destination = metadata.destination || {};
  const payload = {
    type: transaction.type,
    name: cleanText(customer.name, 120),
    orderId,
    amount: transaction.amount,
    currency: transaction.currency || 'inr',
    paidAt: new Date().toISOString(),
    bankReference: callback.bankReference || '',
    cause: transaction.type === 'donate' ? cleanText(metadata.cause, 120) : '',
    pan: cleanText(customer.pan, 12),
    items: Array.isArray(metadata.items) ? metadata.items.map((i) => `${i.name} × ${i.quantity}`).join(', ') : '',
    destination: [destination.locality, destination.district, destination.state].filter(Boolean).join(', '),
    /* for a member: the tier, the kit, the number, and where the letter's links go */
    tierLabel: cleanText(metadata.tierLabel, 60),
    kit: Array.isArray(metadata.kit) ? metadata.kit.map((k) => cleanText(k, 80)).filter(Boolean) : [],
    memberId: cleanText(transaction.membershipReference, 40),
    /* for a caregiver applicant: the application number and the colony */
    applicationRef: cleanText(transaction.applicationReference, 40),
    colony: transaction.type === 'caregiver-application' ? [cleanText(metadata.address, 160), cleanText(metadata.city, 80)].filter(Boolean).join(', ') : '',
    siteUrl: cleanText(siteUrl, 200).replace(/\/+$/, '')
  };
  const template = RECEIPT_TEMPLATES[transaction.type] || 'payment_received';
  const outcome = await CONFIRM.send({
    to, template, payload,
    dedupeKey: `${template}:${orderId}`,
    mail: caregiverMail,
    queue: caregiverStore,
    timeoutMs: RECEIPT_TIMEOUT_MS
  });
  if (outcome.state === 'sent') {
    await getDb().collection('transactions').doc(orderId).update({
      receiptSentAt: new Date().toISOString(),
      receiptProviderId: cleanText(outcome.providerId, 120) || null
    });
  }
  return { sent: outcome.state === 'sent', state: outcome.state, to };
}

/* A member's return from CCAvenue. The generic page below is a receipt; a
   member has joined something, so this is a welcome first and a receipt
   second: the name, the number large, what the membership sends, the three
   stages the card and kit go through, whether the letter went, and the
   receipt rows last. Same shell as the receipt - paper, the mark, no
   script - so the two feel like one site. Only reached on success; every
   other outcome keeps the receipt's wording, which already says what to do. */
function renderMembershipWelcome(response, baseUrl, transaction, result, memberRef, mailNote) {
  const customer = transaction.customer || {};
  const metadata = transaction.metadata || {};
  const first = cleanText(customer.name, 120).split(/\s+/)[0] || '';
  const tier = cleanText(metadata.tierLabel, 60) || 'PFA membership';
  const kit = Array.isArray(metadata.kit) ? metadata.kit.filter(Boolean) : [];
  const number = memberRef || transaction.orderId;
  const track = `${baseUrl}/track.html#ref=${encodeURIComponent(number)}`;
  const stages = ['Paid', 'Kit dispatched', 'Kit delivered'].map((label, i) =>
    `<li class="${i === 0 ? 'done' : ''}"><span>${i + 1}</span>${escapeHtml(label)}</li>`).join('');
  const rows = [row('Membership', tier), row('Amount', money(transaction.amount, transaction.currency || 'INR')),
    row('PFA transaction ID', transaction.orderId), row('CCAvenue tracking ID', result.trackingId), row('Bank reference', result.bankReference)].join('');
  response.statusCode = 200;
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
  response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Welcome to People for Animals | PFA</title><style>*{box-sizing:border-box}body{margin:0;background:#fff;color:#111;font-family:Arial,sans-serif}.wrap{min-height:100vh;display:grid;place-items:center;padding:24px}.card{width:min(720px,100%);border:1px solid #d9d9d9;padding:40px}.logo{width:190px;max-width:58%;height:auto;margin-bottom:34px}.eyebrow{margin:0;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#6b6b6b}h1{font-size:40px;line-height:1.04;margin:12px 0 16px}p{font-size:16px;line-height:1.6;color:#444;margin:0}.number{margin:30px 0 0;padding:22px 0;border-top:2px solid #111;border-bottom:2px solid #111;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:8px 24px}.number span{font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#6b6b6b}.number strong{font-size:26px;letter-spacing:.04em;overflow-wrap:anywhere}.kit{margin:22px 0 0;padding:0 0 0 18px;font-size:15px;line-height:1.7;color:#333}.stages{list-style:none;margin:26px 0 0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.stages li{border:1px solid #d9d9d9;padding:14px;font-size:13px;font-weight:700;line-height:1.3}.stages li span{display:block;font-size:11px;color:#6b6b6b;margin-bottom:6px}.stages li.done{background:#111;color:#fff;border-color:#111}.stages li.done span{color:#bbb}.mail{margin:24px 0 0;padding:16px 18px;border:1px solid #111}.mail p{margin:0 0 6px;font-size:15px;line-height:1.55;color:#333}.mail strong{color:#111;overflow-wrap:anywhere}.mail .mail__title{font-size:20px;font-weight:800;color:#111;margin-bottom:8px}.mail .mail__ask{margin:12px 0 0;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#6b6b6b}.mail ol{list-style:decimal;margin:6px 0 0;padding-left:20px;font-size:14px;line-height:1.6;color:#444}.mail li{margin:3px 0}.details{margin:30px 0 0;border-top:1px solid #ddd}.row{display:flex;justify-content:space-between;gap:24px;padding:12px 0;border-bottom:1px solid #ddd;font-size:14px}.row span{color:#666}.row strong{text-align:right;overflow-wrap:anywhere}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:28px}.btn{display:inline-block;text-decoration:none;padding:14px 18px;font-weight:700;border:1px solid #111;font-size:14px}.dark{background:#111;color:#fff}.light{background:#fff;color:#111}.fine{margin:26px 0 0;font-size:12px;line-height:1.6;color:#6b6b6b}@media(max-width:560px){.card{padding:26px}h1{font-size:32px}.stages{grid-template-columns:1fr}.row{display:block}.row strong{display:block;text-align:left;margin-top:6px}}</style></head><body><main class="wrap"><section class="card"><img class="logo" src="/img/logo.png" alt="People for Animals"><p class="eyebrow">Payment successful</p><h1>${escapeHtml(first ? `Welcome, ${first}.` : 'Welcome.')}</h1><p>Your ${escapeHtml(tier.toLowerCase())} of People for Animals is active from today. Every member is an active working member: someone PFA can call on when an animal nearby needs help, and someone who can call on PFA.</p><div class="number"><span>Member number</span><strong>${escapeHtml(number)}</strong></div>${kit.length ? `<p class="eyebrow" style="margin-top:24px">On its way to you</p><ul class="kit">${kit.map((k) => `<li>${escapeHtml(k)}</li>`).join('')}</ul><p style="margin-top:10px;font-size:14px">Your membership card and kit reach you in 20 to 25 days.</p>` : `<p style="margin-top:22px;font-size:14px">Your membership card reaches you in 20 to 25 days.</p>`}<ol class="stages">${stages}</ol>${mailNote || ''}<div class="details">${rows}</div><div class="actions"><a class="btn dark" href="${escapeHtml(track)}">Follow your card and kit</a><a class="btn light" href="${escapeHtml(baseUrl)}/units.html">Find your nearest unit</a><a class="btn light" href="${escapeHtml(baseUrl)}/index.html">PFA home</a></div><p class="fine">People for Animals is a registered trust; membership payments are eligible for exemption under Section 80G of the Income Tax Act, 1961. Quote the member number in any message about your membership. PFA does not receive or store card, bank or UPI details; the payment was taken by CCAvenue.</p></section></main></body></html>`);
}

function renderResult(response, baseUrl, transaction, result, memberId, caregiver, applicationRef, receiptTo, mailNote) {
  const success = result.status === 'success';
  const pending = result.status === 'pending' || result.status === 'initiated' || result.status === 'awaited';
  const typeLabels = { donate: 'Donation', send: 'Give/Send order',
    caregiver: 'Colony Caregiver Card shipping',
    'caregiver-application': 'Colony caregiver application',
    membership: 'PFA membership' };
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
      ? 'Welcome to People for Animals. Keep the member number below: it is yours from today, and your card and kit follow in 20 to 25 days.'
    : transaction.type === 'caregiver-application'
      ? 'Your application is in. Keep the application number below: a named person at PFA reads every application and decides, and you can follow it with that number. The card is not issued on the spot.'
    : transaction.type === 'caregiver'
        ? 'Your Colony Caregiver Card has been issued. The printed card is queued for delivery, and the digital card is ready to download now.'
      : 'Thank you for supporting People for Animals. Keep the PFA transaction ID for your records.'
    : pending
      ? 'CCAvenue has not returned a final result yet. Keep the PFA transaction ID and check your payment account before trying again.'
      : 'No successful payment was recorded. Check the message below before trying again.';
  const accent = success ? 'success' : pending ? 'pending' : 'failure';
  const nonce = crypto.randomBytes(18).toString('base64');
  const metadata = displayMetadata(transaction);
  /* The card already exists and is already on this device; the only thing the
     browser learns here is that a printed copy is now on its way. */
  const caregiverScript = success && transaction.type === 'caregiver' && caregiver.cardId
    ? `<script nonce="${nonce}">(function(){try{var held=JSON.parse(localStorage.getItem('pfa_caregiver')||'null');if(held&&held.cardId===${safeJson(caregiver.cardId)}){held.printed=true;held.trackingId=${safeJson(caregiver.trackingId || '')};localStorage.setItem('pfa_caregiver',JSON.stringify(held))}}catch(e){}})();</script>`
    : '';

  /* No card link. A caregiver card is issued from the admin panel, and there is
     no end-user page that shows one. The applicant leaves with a number. */
  const isCaregiver = transaction.type === 'caregiver' || transaction.type === 'caregiver-application';
  const action = `<a class="btn dark" href="${escapeHtml(baseUrl)}/${isCaregiver ? 'get-involved.html#caregiver' : transaction.type === 'membership' ? 'get-involved.html#membership' : 'donate.html'}">Return to PFA</a>`;

  response.statusCode = 200;
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.setHeader('Content-Security-Policy', `default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'`);
  response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} | PFA</title><style>*{box-sizing:border-box}body{margin:0;background:#fff;color:#111;font-family:Arial,sans-serif}.wrap{min-height:100vh;display:grid;place-items:center;padding:24px}.card{width:min(680px,100%);border:1px solid #d9d9d9;padding:36px}.logo{width:190px;max-width:58%;height:auto;margin-bottom:34px}.mark{width:52px;height:52px;display:grid;place-items:center;border:2px solid #111;border-radius:50%;font-size:25px;font-weight:800;margin-bottom:22px}.success .mark{border-color:#16794b;color:#16794b}.failure .mark{border-color:#b42318;color:#b42318}.pending .mark{border-color:#8a6200;color:#8a6200}h1{font-size:36px;line-height:1.06;margin:0 0 14px}p{font-size:17px;line-height:1.55;color:#555;margin:0}.details{margin:28px 0;border-top:1px solid #ddd}.row{display:flex;justify-content:space-between;gap:24px;padding:14px 0;border-bottom:1px solid #ddd}.row span{color:#666}.row strong{text-align:right;overflow-wrap:anywhere}.reason{margin-top:18px;padding:14px;border:1px solid #e3c1bd;background:#fff8f7;color:#7a271a;line-height:1.45}.mail{margin:0 0 6px;padding:16px 18px;border:1px solid #111}.mail p{margin:0 0 6px;font-size:15px;line-height:1.55;color:#333}.mail strong{color:#111;overflow-wrap:anywhere}.mail .mail__title{font-size:20px;font-weight:800;color:#111;margin-bottom:8px}.mail .mail__ask{margin:12px 0 0;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#6b6b6b}.mail ol{list-style:decimal;margin:6px 0 0;padding-left:20px;font-size:14px;line-height:1.6;color:#444}.mail li{margin:3px 0}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:28px}.btn{display:inline-block;text-decoration:none;padding:14px 18px;font-weight:700;border:1px solid #111}.dark{background:#111;color:#fff}.light{background:#fff;color:#111}@media(max-width:560px){.card{padding:25px}.row{display:block}.row strong{display:block;text-align:left;margin-top:6px}h1{font-size:31px}}</style></head><body><main class="wrap"><section class="card ${accent}"><img class="logo" src="/img/logo.png" alt="People for Animals"><div class="mark" aria-hidden="true">${success ? '✓' : pending ? '…' : '!'}</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><div class="details">${success && applicationRef ? row(transaction.type === 'membership' ? 'Member number' : 'Application number', applicationRef) : ''}${row('PFA transaction ID', transaction.orderId)}${success && memberId ? row('Permanent Member ID', memberId) : ''}${success && caregiver.cardId ? row('Colony Caregiver Card number', caregiver.cardId) : ''}${success && caregiver.trackingId ? row('Delivery tracking ID', caregiver.trackingId) : ''}${row('Amount', money(transaction.amount, transaction.currency || 'INR'))}${row('CCAvenue tracking ID', result.trackingId)}${row('Bank reference', result.bankReference)}${metadata.first}${metadata.second}${metadata.third}${row('Status', success ? 'Success' : result.rawStatus)}</div>${success && mailNote ? mailNote : ''}${!success && result.failureMessage ? `<div class="reason"><strong>Payment message:</strong> ${escapeHtml(result.failureMessage)}</div>` : ''}<div class="actions">${action}<a class="btn light" href="${escapeHtml(baseUrl)}/index.html">PFA home</a></div></section></main>${caregiverScript}</body></html>`);
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
    /* every prefix lib/pfa-ccavenue-flow.js can mint, including a member's: a
       prefix missing here is a payment that succeeds at CCAvenue and is thrown
       out on the way back, with no record and no letter */
    if (!/^PFA-(?:DON|SND|CAR|CGA|MEM)-[A-Z0-9]{8}$/.test(orderId)) throw new Error('The PFA transaction ID is invalid.');
    const transaction = await getTransaction(orderId);
    /* 'send' takes no new orders since v1.300, but a food order paid before
       the removal still deserves its settlement: the callback for a stored
       send transaction is honoured with the generic receipt. Only the rails
       are gone, not the ledger. */
    if (!transaction || !['donate', 'send', 'caregiver', 'caregiver-application', 'membership'].includes(transaction.type)) throw new Error('The stored PFA transaction could not be found.');

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
    /* A paid application becomes a record with a number the applicant can
       track. No card is issued here: a named person at PFA reads it and moves
       it through the stages. Re-entrant, because CCAvenue can deliver the same
       callback more than once — the reference is stored on the transaction and
       reused rather than a second one being minted. */
    let applicationRef = '';
    if (transaction.type === 'membership' && effective === 'success') {
      try {
        applicationRef = await recordMembership(orderId, transaction, callback);
      } catch (error) {
        console.error('PFA membership record failed', { orderId, message: error && error.message });
      }
    }
    if (transaction.type === 'caregiver-application' && effective === 'success') {
      try {
        applicationRef = await recordCaregiverApplication(orderId, transaction, callback);
      } catch (error) {
        console.error('PFA caregiver application record failed', { orderId, message: error && error.message });
      }
    }

    /* The confirmation: a donor's receipt, a member's welcome letter, a
       caregiver applicant's application number. Sent once, on the callback
       that made the payment succeed, and recorded on the transaction so a
       redelivered callback or a refreshed page never sends a second. A slow or
       unset mail provider is not allowed to hold up the page the person is
       waiting on, and that page says what happened to the email. */
    let receipt = { state: 'none', to: '' };
    const confirmed = Boolean(RECEIPT_TEMPLATES[transaction.type]) && effective === 'success';
    if (confirmed) {
      try {
        receipt = await sendReceipt(orderId, {
          ...transaction, ...updated,
          membershipReference: transaction.type === 'membership' ? (applicationRef || transaction.membershipReference) : transaction.membershipReference,
          applicationReference: transaction.type === 'caregiver-application' ? (applicationRef || transaction.applicationReference) : transaction.applicationReference
        }, callback, updated.firstSuccess === true, baseUrl);
      } catch (mailError) {
        console.error('PFA payment receipt not sent', { orderId, message: cleanText(mailError && mailError.message, 200) });
        receipt = { state: 'unsent', to: cleanText((transaction.customer || {}).email, 160).toLowerCase() };
      }
    }
    const receiptTo = receipt.state === 'sent' ? receipt.to : '';
    const mailNote = confirmed
      ? CONFIRM.noticeHtml(CONFIRM.notice({
        state: receipt.state,
        to: receipt.to,
        number: transaction.type === 'caregiver-application' && !applicationRef ? CONFIRM.TRANSACTION : CONFIRM.forPayment(transaction.type).number,
        reference: applicationRef || orderId,
        item: RECEIPT_ITEMS[transaction.type]
      }))
      : '';

    let caregiver = { cardId: '', trackingId: '' };
    if (transaction.type === 'caregiver' && effective === 'success') {
      try {
        const recorded = await caregiverStore.recordPaidShipping({
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

        caregiver = {
          cardId: recorded.card.cardId,
          trackingId: recorded.shipment ? recorded.shipment.trackingId : ''
        };

        if (!recorded.alreadyRecorded && recorded.card.email) {
          const cardUrl = `${baseUrl}/caregiver-card.html?id=${encodeURIComponent(recorded.card.cardId)}`;
          const payload = {
            cardId: recorded.card.cardId,
            trackingId: caregiver.trackingId,
            amount: transaction.amount,
            paymentReference: callback.trackingId || orderId,
            cardUrl
          };
          const queued = await caregiverStore.queueEmail({
            template: 'shipping_paid',
            to: recorded.card.email,
            dedupeKey: `shipping_paid:${orderId}`,
            payload
          });
          if (queued.created && caregiverMail.isConfigured()) {
            try {
              const sent = await caregiverMail.deliver({ to: recorded.card.email, template: 'shipping_paid', payload });
              await caregiverStore.recordEmailResult({ emailId: queued.emailId, ok: true, providerId: sent.providerId });
            } catch (mailError) {
              await caregiverStore.recordEmailResult({ emailId: queued.emailId, ok: false, error: mailError && mailError.message });
            }
          }
        }
      } catch (shipError) {
        /* The money is taken and verified; a failure to open the parcel record
           must not present as a failed payment. It is logged loudly for the
           admin panel to pick up instead. */
        console.error('PFA caregiver shipment could not be opened for', orderId, CAREGIVER.clean(shipError && shipError.message, 240));
      }
    }

    if (transaction.type === 'membership' && effective === 'success') {
      return renderMembershipWelcome(response, baseUrl, { ...transaction, ...updated }, { ...callback, status: effective }, applicationRef, mailNote);
    }
    return renderResult(
      response,
      baseUrl,
      { ...transaction, ...updated },
      { ...callback, status: effective },
      updated.memberId || transaction.memberId || '',
      caregiver,
      applicationRef,
      receiptTo,
      mailNote
    );
  } catch (error) {
    console.error('PFA CCAvenue response error:', cleanText(error && error.message, 240));
    return renderInvalid(response, baseUrl, 'We could not verify this payment. Check your bank or UPI account before trying again.');
  }
};

module.exports._private = { amountMatches, callbackFrom, statusOf, sendReceipt };
