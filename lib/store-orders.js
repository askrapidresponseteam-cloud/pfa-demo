'use strict';

// Persistence for Paws & Tails (Shopify) store orders mirrored into Firestore
// by the webhook receiver, and read back by /api/pfa-order-status.
//
// Collections
//   storeOrders/{shopifyOrderId}       one document per Shopify order
//   storeCheckoutIntents/{hash(token)} already written by pfa-orders.js; we add
//                                      shopifyOrderId so a token lookup is one read
//   storeWebhookEvents/{webhookId}     idempotency: Shopify retries deliveries
//
// Status vocabulary is the one store.html already understands:
//   AWAITING_PAYMENT · CONFIRMED · FULFILLED · CANCELLED · REFUND_RECORDED · PAYMENT_FAILED

const crypto = require('crypto');

const PFA_ORDER_PREFIX = 'PFA-ST-';
const memory = { orders: new Map(), intents: new Map(), events: new Set() };

function cleanText(value, max = 200) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

function money(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function pfaOrderId(orderNumber, shopifyOrderId) {
  const number = cleanText(orderNumber, 20) || cleanText(shopifyOrderId, 30);
  return PFA_ORDER_PREFIX + number;
}

function firebaseConfigured() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return true;
  return Boolean(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);
}

function db() {
  return require('./firebase').getDb();
}

function intentDocId(token) {
  return require('./firebase').hashKey(`store:${token}`);
}

// ---- payload extraction -------------------------------------------------

function checkoutTokenFrom(order) {
  const attrs = Array.isArray(order.note_attributes) ? order.note_attributes : [];
  const attr = attrs.find((a) => a && /pfa checkout reference/i.test(String(a.name || a.key || '')));
  if (attr && attr.value) return cleanText(attr.value, 120);
  const note = cleanText(order.note, 400);
  const match = note.match(/PFA checkout reference:\s*([A-Za-z0-9_-]{6,120})/i);
  return match ? match[1] : '';
}

function statusFromFinancial(financialStatus) {
  const s = String(financialStatus || '').toLowerCase();
  if (s === 'paid' || s === 'partially_paid') return 'CONFIRMED';
  if (s === 'refunded' || s === 'partially_refunded') return 'REFUND_RECORDED';
  if (s === 'voided') return 'PAYMENT_FAILED';
  return 'AWAITING_PAYMENT'; // pending, authorized, unknown
}

function lineItems(order) {
  return (Array.isArray(order.line_items) ? order.line_items : []).slice(0, 100).map((line) => ({
    productId: cleanText(line.product_id, 30),
    variantId: cleanText(line.variant_id, 30),
    title: cleanText(line.title, 200),
    sku: cleanText(line.sku, 80),
    quantity: Number(line.quantity) || 0,
    price: money(line.price)
  }));
}

function tracking(fulfillment) {
  if (!fulfillment) return null;
  return {
    fulfillmentId: cleanText(fulfillment.id, 30),
    status: cleanText(fulfillment.status || fulfillment.shipment_status, 40).toLowerCase(),
    company: cleanText(fulfillment.tracking_company, 80),
    number: cleanText(fulfillment.tracking_number, 80),
    url: /^https:\/\//i.test(String(fulfillment.tracking_url || '')) ? cleanText(fulfillment.tracking_url, 400) : ''
  };
}

// ---- order record builders (pure; unit-tested) --------------------------

function recordFromCreated(order) {
  const shopifyOrderId = cleanText(order.id, 30);
  const customer = order.customer || {};
  const status = statusFromFinancial(order.financial_status);
  return {
    shopifyOrderId,
    orderNumber: cleanText(order.order_number || order.name, 20),
    pfaOrderId: pfaOrderId(order.order_number, shopifyOrderId),
    checkoutToken: checkoutTokenFrom(order),
    status,
    financialStatus: cleanText(order.financial_status, 40),
    fulfillmentStatus: cleanText(order.fulfillment_status, 40),
    total: money(order.total_price),
    currency: cleanText(order.currency, 5) || 'INR',
    customer: {
      name: cleanText(`${customer.first_name || ''} ${customer.last_name || ''}`, 120),
      email: cleanText(customer.email || order.email, 160).toLowerCase()
    },
    lineItems: lineItems(order),
    tracking: null,
    createdAt: cleanText(order.created_at, 40) || new Date().toISOString(),
    paidAt: status === 'CONFIRMED' ? (cleanText(order.processed_at, 40) || new Date().toISOString()) : null
  };
}

function applyEvent(existing, topic, payload) {
  const now = new Date().toISOString();
  const shopifyOrderId = cleanText((existing && existing.shopifyOrderId) || payload.order_id || payload.id, 30);
  const base = existing || { shopifyOrderId, status: 'AWAITING_PAYMENT', createdAt: now };
  const next = { ...base, updatedAt: now, lastEvent: topic };
  // Events can arrive out of order; make sure the record is always addressable.
  if (!next.pfaOrderId) next.pfaOrderId = pfaOrderId(next.orderNumber || payload.order_number, shopifyOrderId);

  switch (topic) {
    case 'orders/create':
    case 'orders/paid': {
      const created = recordFromCreated(payload);
      // Never let a stale create overwrite a later fulfilment/cancel/refund.
      const terminal = ['FULFILLED', 'CANCELLED', 'REFUND_RECORDED'];
      const status = existing && terminal.includes(existing.status) ? existing.status : created.status;
      return { ...next, ...created, status, tracking: existing && existing.tracking || null, checkoutToken: created.checkoutToken || (existing && existing.checkoutToken) || '' };
    }
    case 'orders/fulfilled': {
      const first = Array.isArray(payload.fulfillments) ? payload.fulfillments[0] : null;
      return {
        ...next,
        fulfillmentStatus: cleanText(payload.fulfillment_status, 40) || 'fulfilled',
        tracking: tracking(first) || next.tracking || null,
        status: next.status === 'CANCELLED' || next.status === 'REFUND_RECORDED' ? next.status : 'FULFILLED',
        shippedAt: next.shippedAt || now
      };
    }
    case 'fulfillments/update': {
      const t = tracking(payload);
      return {
        ...next,
        tracking: t,
        status: next.status === 'CANCELLED' || next.status === 'REFUND_RECORDED' ? next.status : 'FULFILLED',
        deliveredAt: t && t.status === 'delivered' ? (next.deliveredAt || now) : next.deliveredAt || null
      };
    }
    case 'orders/cancelled':
      return {
        ...next,
        status: 'CANCELLED',
        cancelledAt: cleanText(payload.cancelled_at, 40) || now,
        cancelReason: cleanText(payload.cancel_reason, 80)
      };
    case 'refunds/create': {
      const amount = (Array.isArray(payload.transactions) ? payload.transactions : [])
        .filter((t) => String(t.status || 'success').toLowerCase() === 'success')
        .reduce((sum, t) => sum + money(t.amount), 0);
      const refunds = Array.isArray(next.refunds) ? next.refunds.slice() : [];
      refunds.push({ refundId: cleanText(payload.id, 30), amount, at: cleanText(payload.created_at, 40) || now });
      return { ...next, status: 'REFUND_RECORDED', refunds, refundedTotal: refunds.reduce((s, r) => s + r.amount, 0) };
    }
    default:
      return next;
  }
}

// What the browser is allowed to see. No email, no address, no customer id.
function publicView(record) {
  if (!record) return null;
  return {
    pfaOrderId: record.pfaOrderId || pfaOrderId(record.orderNumber, record.shopifyOrderId),
    orderNumber: record.orderNumber || '',
    status: record.status,
    total: record.total,
    currency: record.currency || 'INR',
    items: (record.lineItems || []).map((l) => ({ title: l.title, quantity: l.quantity })),
    tracking: record.tracking ? { status: record.tracking.status, company: record.tracking.company, number: record.tracking.number, url: record.tracking.url } : null,
    createdAt: record.createdAt || null,
    shippedAt: record.shippedAt || null,
    deliveredAt: record.deliveredAt || null,
    cancelledAt: record.cancelledAt || null,
    refundedTotal: record.refundedTotal || 0,
    updatedAt: record.updatedAt || null
  };
}

// ---- storage -------------------------------------------------------------

async function markEventSeen(webhookId) {
  if (!webhookId) return false; // no id → cannot dedupe, process anyway
  if (!firebaseConfigured()) {
    if (memory.events.has(webhookId)) return true;
    memory.events.add(webhookId);
    return false;
  }
  const ref = db().collection('storeWebhookEvents').doc(cleanText(webhookId, 120));
  try {
    await ref.create({ receivedAt: new Date().toISOString() });
    return false;
  } catch (error) {
    if (error && (error.code === 6 || /already exists/i.test(String(error.message)))) return true;
    throw error;
  }
}

async function upsertFromWebhook(topic, payload, webhookId) {
  if (await markEventSeen(webhookId)) return { duplicate: true };
  const shopifyOrderId = cleanText(payload.order_id || payload.id, 30);
  if (!/^\d{6,20}$/.test(shopifyOrderId)) throw new Error('Webhook payload has no Shopify order id.');

  if (!firebaseConfigured()) {
    const record = applyEvent(memory.orders.get(shopifyOrderId) || null, topic, payload);
    memory.orders.set(shopifyOrderId, record);
    if (record.checkoutToken) memory.intents.set(record.checkoutToken, { shopifyOrderId, status: record.status });
    return { duplicate: false, record };
  }

  const database = db();
  const ref = database.collection('storeOrders').doc(shopifyOrderId);
  let record;
  await database.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    record = applyEvent(snap.exists ? snap.data() : null, topic, payload);
    tx.set(ref, record, { merge: true });
    if (record.checkoutToken) {
      tx.set(database.collection('storeCheckoutIntents').doc(intentDocId(record.checkoutToken)), {
        shopifyOrderId,
        pfaOrderId: record.pfaOrderId,
        status: record.status,
        updatedAt: record.updatedAt
      }, { merge: true });
    }
  });
  return { duplicate: false, record };
}

// Fallback when the orders/create webhook has not arrived (or its secret is
// not configured yet): ask Shopify's Admin API for recent orders carrying our
// checkout reference. Needs PFA_SHOPIFY_ADMIN_TOKEN (read_orders). Results
// are persisted through the same path as a webhook so later lookups are free.
const adminLookupCache = new Map(); // token -> { at, promise }
const ADMIN_LOOKUP_TTL_MS = 8000;

async function findInShopifyByToken(token, fetchImpl = global.fetch) {
  const adminToken = String(process.env.PFA_SHOPIFY_ADMIN_TOKEN || '').trim();
  const domain = String(process.env.PFA_SHOPIFY_STORE_DOMAIN || 'sg37v1-ta.myshopify.com').trim().toLowerCase();
  const version = String(process.env.PFA_SHOPIFY_ADMIN_API_VERSION || '2026-07');
  if (!adminToken || !token || typeof fetchImpl !== 'function') return null;
  const cached = adminLookupCache.get(token);
  if (cached && Date.now() - cached.at < ADMIN_LOOKUP_TTL_MS) return cached.promise;
  const promise = (async () => {
    const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const url = `https://${domain}/admin/api/${version}/orders.json?status=any&limit=50&created_at_min=${encodeURIComponent(since)}&fields=id,order_number,name,created_at,processed_at,financial_status,fulfillment_status,total_price,currency,customer,email,line_items,note,note_attributes`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let orders = [];
    try {
      const res = await fetchImpl(url, { headers: { 'X-Shopify-Access-Token': adminToken, Accept: 'application/json' }, signal: controller.signal });
      if (!res.ok) throw new Error(`Shopify Admin ${res.status}`);
      orders = ((await res.json()).orders) || [];
    } catch (error) {
      console.warn('Admin order lookup failed', { message: error && error.message });
      return null;
    } finally {
      clearTimeout(timer);
    }
    const match = orders.find((o) => checkoutTokenFrom(o) === token);
    if (!match) return null;
    const { record } = await upsertFromWebhook('orders/create', match, `admin-lookup-${match.id}`);
    return record;
  })();
  adminLookupCache.set(token, { at: Date.now(), promise });
  return promise;
}

async function findByCheckoutToken(token) {
  if (!token) return null;
  if (!firebaseConfigured()) {
    const intent = memory.intents.get(token);
    return intent ? memory.orders.get(intent.shopifyOrderId) || null : null;
  }
  const database = db();
  const intent = await database.collection('storeCheckoutIntents').doc(intentDocId(token)).get();
  const shopifyOrderId = intent.exists && intent.data().shopifyOrderId;
  if (!shopifyOrderId) return null;
  const order = await database.collection('storeOrders').doc(String(shopifyOrderId)).get();
  return order.exists ? order.data() : null;
}

async function findByPfaOrderId(id) {
  const clean = cleanText(id, 40).toUpperCase();
  if (!clean.startsWith(PFA_ORDER_PREFIX)) return null;
  if (!firebaseConfigured()) {
    for (const record of memory.orders.values()) if (record.pfaOrderId === clean) return record;
    return null;
  }
  const snap = await db().collection('storeOrders').where('pfaOrderId', '==', clean).limit(1).get();
  return snap.empty ? null : snap.docs[0].data();
}

function resetForTests() {
  memory.orders.clear();
  memory.intents.clear();
  memory.events.clear();
  adminLookupCache.clear();
}

module.exports = {
  PFA_ORDER_PREFIX,
  applyEvent,
  checkoutTokenFrom,
  findByCheckoutToken,
  findInShopifyByToken,
  findByPfaOrderId,
  publicView,
  recordFromCreated,
  resetForTests,
  statusFromFinancial,
  upsertFromWebhook,
  verifyHmac(rawBody, header, secret) {
    if (!secret || !header) return false;
    const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
    const a = Buffer.from(digest);
    const b = Buffer.from(String(header));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
};
