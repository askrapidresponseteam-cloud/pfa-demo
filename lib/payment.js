'use strict';

const { cleanText } = require('./ccavenue');
const RULES = require('../assets/field-rules.js');

const DONATION_CAUSES = new Set([
  'Where it is needed most',
  'Hospitals',
  'Rescue',
  'Legal work',
  'Learning'
]);

// USD figures are placeholder starting points (rough INR conversion, rounded).
// PFA should confirm final USD pricing before this goes live.
const SEND_CATALOG = new Map([
  ['rice', { name: 'Rice', pack: '10 kg', weight: 10, price: { inr: 550, usd: 7 } }],
  ['wheat', { name: 'Wheat', pack: '10 kg', weight: 10, price: { inr: 480, usd: 6 } }],
  ['poha', { name: 'Poha', pack: '5 kg', weight: 5, price: { inr: 320, usd: 4 } }],
  ['soya chunks', { name: 'Soya chunks', pack: '5 kg', weight: 5, price: { inr: 650, usd: 8 } }],
  ['vegetarian dog food', { name: 'Vegetarian dog food', pack: '10 kg', weight: 10, price: { inr: 1450, usd: 18 } }]
]);


// The Colony Animal Colony Caregiver Card itself is never sold. This is the flat
// printing and delivery charge for people who also want the physical card;
// the digital card is issued free through /api/caregiver-issue.
const CAREGIVER_SHIPPING_PRICE = '100.00';
/* The colony caregiver card is not issued on payment. The fifty rupees
   confirms the application and buys it an application number; a named
   person at PFA reads it and decides. */
const CAREGIVER_APPLICATION_FEE = '50.00';

const AMOUNT_BOUNDS = {
  inr: { min: 1, max: 10000000, label: '₹1 and ₹1,00,00,000' },
  usd: { min: 1, max: 100000, label: '$1 and $100,000' }
};

function parseCurrency(body) {
  const value = String(body.currency || 'inr').trim().toLowerCase();
  if (!['inr', 'usd'].includes(value)) throw new Error('Choose INR or USD.');
  return value;
}

function parseAmount(value, label = 'Amount', currency = 'inr') {
  const raw = String(value == null ? '' : value).trim();
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(raw)) throw new Error(`Enter a valid ${label.toLowerCase()}.`);
  const amount = Number(raw);
  const bounds = AMOUNT_BOUNDS[currency] || AMOUNT_BOUNDS.inr;
  if (!Number.isFinite(amount) || amount < bounds.min || amount > bounds.max) {
    throw new Error(`${label} must be between ${bounds.label}.`);
  }
  return amount.toFixed(2);
}

function requiredCustomer(body) {
  /* This used to accept any ten digits, which let 0000000000 through on the
     donation path while the caregiver path was already strict.
     Both now go through the same rule file the browser uses, and the name is
     stored in Title Case. */
  const parsed = RULES.parseFields(body, [
    ['name', { required: true, emptyMessage: 'Enter your name.' }],
    ['mobile', { required: true, emptyMessage: 'Enter a 10-digit Indian mobile number.' }],
    ['email', { required: false }]
  ]);
  if (!parsed.ok) throw new Error(parsed.field === 'email' ? 'Enter a valid email address or leave it blank.' : parsed.message);
  return { name: parsed.values.name.slice(0, 100), mobile: parsed.values.mobile, email: parsed.values.email };
}

/* The PAN a donor gives so their gift can carry an 80G certificate.

   It was typed into donate.html, checked there, posted here, and dropped:
   parseDonation never read body.pan, so the customer record never carried
   one. lib/routes/payment/response.js puts cleanText(customer.pan, 12) on the
   receipt and caregiver-mail only writes "including for your 80G certificate"
   when a PAN is present, so both were reading a field nothing ever wrote.
   Optional, and checked by the same rule the browser now applies. */
function panField(body) {
  if (!cleanText(body.pan, 20)) return '';
  const error = RULES.checkField('pan', body.pan, { required: false });
  if (error) throw new Error(error);
  return RULES.normaliseField('pan', body.pan);
}

/* A field that must read as a place or address: checked by the shared rule
   and stored in Title Case. */
function placeField(body, field, opts) {
  const error = RULES.checkField(field, body[field], opts);
  if (error) throw new Error(opts.emptyMessage && !cleanText(body[field], 10) ? opts.emptyMessage : error);
  return RULES.normaliseField(field, body[field]);
}

function acceptedTerms(body) {
  return ['yes', 'accepted', 'true', '1', 'on'].includes(String(body.terms || '').toLowerCase())
    || ['yes', 'accepted', 'true', '1', 'on'].includes(String(body.termsAccepted || '').toLowerCase());
}

function parseType(body) {
  const value = String(body.type || body.paymentType || '').trim().toLowerCase();
  if (!['donate', 'send', 'caregiver', 'caregiver-application'].includes(value)) {
    throw new Error('This payment flow is not enabled. Store purchases remain separate from CCAvenue.');
  }
  return value;
}

function parseItems(value, currency = 'inr') {
  let list = value;
  if (typeof list === 'string') {
    try { list = JSON.parse(list); } catch (_) { throw new Error('The food selection could not be read.'); }
  }
  if (!Array.isArray(list) || list.length < 1 || list.length > 10) throw new Error('Choose at least one food item.');

  const items = [];
  const seen = new Set();
  for (const entry of list) {
    const key = cleanText(entry && (entry.key || entry.name), 80).toLowerCase();
    const catalogItem = SEND_CATALOG.get(key);
    const quantity = Number(entry && entry.quantity);
    if (!catalogItem || !Number.isInteger(quantity) || quantity < 1 || quantity > 10 || seen.has(key)) {
      throw new Error('One or more selected food items are invalid.');
    }
    seen.add(key);
    const price = catalogItem.price[currency];
    items.push({
      name: catalogItem.name, pack: catalogItem.pack, weight: catalogItem.weight,
      key, quantity, price, lineTotal: price * quantity
    });
  }
  return items;
}

function parseDonation(body) {
  const customer = requiredCustomer(body);
  const currency = parseCurrency(body);
  const address = placeField(body, 'address', { required: true, emptyMessage: 'Enter your address.' });
  const causeValue = cleanText(body.cause, 80);
  const cause = DONATION_CAUSES.has(causeValue) ? causeValue : 'Where it is needed most';
  const pan = panField(body);
  if (!acceptedTerms(body)) throw new Error('Accept the gift and receipt terms to continue.');
  const amount = parseAmount(body.amount, 'Donation amount', currency);
  return {
    /* The PAN travels on the customer record, which is what the receipt
       reads. It is never put in merchantValues: CCAvenue has no business
       with a donor's tax number. */
    type: 'donate', amount, currency, customer: { ...customer, address, pan },
    metadata: { cause, donationAmount: Number(amount) },
    merchantValues: {
      currency: currency.toUpperCase(), language: 'EN', billing_name: customer.name, billing_tel: customer.mobile,
      billing_email: customer.email, billing_address: address, merchant_param1: cause,
      merchant_param2: 'PFA Donation', merchant_param3: 'donate', merchant_param4: 'PFA Website'
    }
  };
}

function parseSend(body) {
  const customer = requiredCustomer(body);
  const currency = parseCurrency(body);
  const state = placeField(body, 'state', { required: true, emptyMessage: 'Choose the destination state.' });
  const district = placeField(body, 'district', { required: true, emptyMessage: 'Enter the destination district or city.' });
  const locality = placeField(body, 'locality', { required: false });
  const latitude = cleanText(body.latitude, 30);
  const longitude = cleanText(body.longitude, 30);
  if ((latitude && !/^-?\d{1,2}(\.\d{1,8})?$/.test(latitude)) || (longitude && !/^-?\d{1,3}(\.\d{1,8})?$/.test(longitude))) {
    throw new Error('The location could not be read. Use the location button again or leave it blank.');
  }
  if (!acceptedTerms(body)) throw new Error('Accept the food-order terms to continue.');
  const items = parseItems(body.items, currency);
  const total = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const weight = items.reduce((sum, item) => sum + (item.weight * item.quantity), 0);
  const destination = [locality, district, state].filter(Boolean).join(', ');
  return {
    type: 'send', amount: total.toFixed(2), currency,
    customer: { ...customer, address: destination },
    metadata: {
      destination: { state, district, locality, latitude, longitude },
      items, total, weight,
      recipientRouting: { state, district, locality, latitude, longitude, status: 'pending-volunteer-assignment' }
    },
    merchantValues: {
      currency: currency.toUpperCase(), language: 'EN', billing_name: customer.name, billing_tel: customer.mobile,
      billing_email: customer.email, billing_address: destination, billing_city: district,
      billing_state: state, merchant_param1: 'PFA Send Food', merchant_param2: 'PFA Send/Feed',
      merchant_param3: 'send', merchant_param4: `${district}, ${state}`
    }
  };
}

/* The application fee. What is validated here is what a reviewer will need to
   act on it: who they are, how to reach them, and which colony. Nothing about
   a card is decided by paying — the fifty rupees confirms the application and
   buys it a number, and a named person at PFA decides from there.

   Uses the same helpers as the donation path, so the two cannot disagree about
   what a valid mobile number or a valid address is. */
function parseCaregiverApplication(body) {
  const customer = requiredCustomer(body);
  const address = placeField(body, 'address', { required: true, emptyMessage: 'Tell us which colony or locality you feed in.' });
  const city = placeField(body, 'city', { required: true, emptyMessage: 'Tell us the city or town.' });
  /* "Roughly how many animals" is a count, and was stored as whatever text
     arrived. The shared rule reads the digits out of it and refuses an entry
     with no digits at all, so the reviewer gets a number or nothing. */
  const animalsError = RULES.checkField('animals', body.animals, { required: false });
  if (animalsError) throw new Error(animalsError);
  const animals = RULES.normaliseField('animals', body.animals);
  /* Tidied rather than judged: it is optional free text, and the textarea
     already caps it at 1200. */
  const notes = RULES.normaliseField('notes', body.notes).slice(0, 1200);
  /* The photograph and address proof were sent to /api/caregiver/documents
     first and are held under this token until the fee clears. No token, no
     application: a card cannot be printed without a face, and a reviewer
     cannot check a colony without an address. */
  const documents = cleanText(body.documents, 48);
  if (!/^[a-f0-9]{48}$/.test(documents)) {
    throw new Error('Attach your photograph and a proof of address before paying.');
  }

  return {
    type: 'caregiver-application',
    amount: CAREGIVER_APPLICATION_FEE,
    currency: 'inr',
    customer: { ...customer, address, city },
    metadata: { address, city, animals, notes, documents },
    merchantValues: {
      currency: 'INR', language: 'EN',
      billing_name: customer.name, billing_tel: customer.mobile, billing_email: customer.email,
      billing_address: address, billing_city: city,
      merchant_param1: 'Colony caregiver application',
      merchant_param2: city,
      merchant_param3: 'caregiver-application',
      merchant_param4: animals ? `animals=${animals}` : 'PFA Website'
    }
  };
}

function parsePaymentRequest(body) {
  const type = parseType(body);
  if (type === 'donate') return parseDonation(body);
  if (type === 'send') return parseSend(body);
  /* Colony caregiver shipping has its own endpoint, /api/caregiver/order, which owns
     the address and the price. Nothing reaches CCAvenue through this path. */
  if (type === 'caregiver-application') return parseCaregiverApplication(body);
  if (type === 'caregiver') {
    throw new Error('Order a printed Colony Caregiver Card from your card page.');
  }
  /* Every accepted type is handled above. Reaching here means parseType let
     something through, which would be a bug rather than a request to serve. */
  throw new Error('That is not something this site takes payment for.');
}

module.exports = {
  AMOUNT_BOUNDS,
  CAREGIVER_SHIPPING_PRICE,
  CAREGIVER_APPLICATION_FEE,
  parseCaregiverApplication,
  DONATION_CAUSES,
  SEND_CATALOG,
  parseAmount,
  parseCurrency,
  parseItems,
  parsePaymentRequest,
  parseType
};
