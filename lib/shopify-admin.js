'use strict';

/* Two jobs, both of which have to be right or someone is charged the wrong
 * amount or shipped nothing.
 *
 * 1. priceBasket() asks Shopify what these variants cost and whether they can
 *    be sold, right now. The browser's idea of the price is never used for
 *    anything: it is a display, and a page can be edited. Everything the
 *    shopper is charged is computed here from the seller's own numbers.
 *
 * 2. createOrder() writes the paid order into Shopify after Razorpay has
 *    confirmed the money. It is idempotent on the PFA order id, because the
 *    browser callback and the Razorpay webhook both race to call it and only
 *    one Shopify order may ever exist for one payment.
 */

const DEFAULT_DOMAIN = 'sg37v1-ta.myshopify.com';
const DEFAULT_VERSION = '2026-07';

function cleanText(value, max = 300) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

function adminError(message, code, statusCode = 502) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function money(value) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function config() {
  const domain = cleanText(process.env.PFA_SHOPIFY_STORE_DOMAIN || DEFAULT_DOMAIN, 160).toLowerCase();
  const apiVersion = cleanText(process.env.PFA_SHOPIFY_ADMIN_API_VERSION || process.env.PFA_SHOPIFY_STOREFRONT_API_VERSION || DEFAULT_VERSION, 20);
  const adminToken = cleanText(process.env.PFA_SHOPIFY_ADMIN_TOKEN, 300);
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain)) {
    throw adminError('The seller store domain is not configured correctly.', 'SHOPIFY_CONFIG_ERROR', 503);
  }
  if (!/^20\d{2}-(01|04|07|10)$/.test(apiVersion)) {
    throw adminError('The Shopify API version is not configured correctly.', 'SHOPIFY_CONFIG_ERROR', 503);
  }
  return { domain, apiVersion, adminToken, configured: Boolean(adminToken) };
}

async function adminGraphql(query, variables, fetchImpl = global.fetch) {
  const cfg = config();
  if (!cfg.configured) throw adminError('The seller order API is not configured.', 'SHOPIFY_NOT_CONFIGURED', 503);
  if (typeof fetchImpl !== 'function') throw adminError('Order networking is unavailable.', 'SHOPIFY_NETWORK_ERROR', 503);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  let response;
  try {
    response = await fetchImpl(`https://${cfg.domain}/admin/api/${cfg.apiVersion}/graphql.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': cfg.adminToken,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal
    });
  } catch (error) {
    throw adminError('The seller store could not be reached.', 'SHOPIFY_NETWORK_ERROR', 503);
  } finally {
    clearTimeout(timeout);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || (Array.isArray(payload.errors) && payload.errors.length)) {
    const detail = payload.errors && payload.errors[0] && payload.errors[0].message;
    throw adminError(cleanText(detail, 180) || 'The seller store rejected the request.', 'SHOPIFY_REQUEST_FAILED', 502);
  }
  return payload;
}

/* ---- 1. what this basket really costs ---------------------------------- */

/* Storefront, not Admin: prices and availability as a shopper would see them,
   and it needs no admin credential. The delivery rate comes from the same cart
   machinery the drawer already uses, so the figure the shopper agreed to and
   the figure charged are produced by the same code path. */
async function priceBasket({ lines, deliveryAmount }, storefrontQuery, fetchImpl = global.fetch) {
  const ids = lines.map((l) => `gid://shopify/ProductVariant/${l.variantId}`);
  const query = `query PfaPrice($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        id
        title
        availableForSale
        quantityAvailable
        price { amount currencyCode }
        product { title }
      }
    }
  }`;
  const payload = await storefrontQuery(query, { ids }, fetchImpl);
  const nodes = (payload && payload.data && Array.isArray(payload.data.nodes)) ? payload.data.nodes : [];
  const byId = new Map();
  nodes.forEach((n) => {
    if (n && n.id) byId.set(String(n.id).split('/').pop(), n);
  });

  const priced = [];
  const unavailable = [];
  let itemsTotal = 0;
  let currency = 'INR';
  for (const line of lines) {
    const node = byId.get(String(line.variantId));
    if (!node || !node.availableForSale) {
      unavailable.push({ variantId: line.variantId, title: node ? cleanText((node.product && node.product.title) || node.title, 160) : '' });
      continue;
    }
    const unit = money(node.price && node.price.amount);
    if (!(unit > 0)) {
      unavailable.push({ variantId: line.variantId, title: cleanText((node.product && node.product.title) || '', 160) });
      continue;
    }
    currency = cleanText(node.price && node.price.currencyCode, 8) || currency;
    itemsTotal += unit * line.quantity;
    priced.push({
      variantId: line.variantId,
      quantity: line.quantity,
      unitPrice: unit,
      title: cleanText((node.product && node.product.title) || node.title, 200),
      variantTitle: cleanText(node.title, 120)
    });
  }

  const shipping = money(deliveryAmount);
  return {
    lines: priced,
    unavailable,
    itemsTotal: money(itemsTotal),
    shipping,
    total: money(itemsTotal + shipping),
    currency
  };
}

/* ---- 2. writing the paid order into Shopify ----------------------------- */

/* Idempotency is not optional here. The browser callback and the Razorpay
   webhook both try to complete the same payment, and a retried webhook tries
   again after that. Before creating anything, ask Shopify whether an order
   already carries this PFA order id; the tag is written at creation, so the
   question is always answerable even if PFA's own record was lost. */
async function findOrderByPfaId(pfaOrderId, fetchImpl = global.fetch) {
  const query = `query PfaFindOrder($q: String!) {
    orders(first: 1, query: $q) { nodes { id name legacyResourceId } }
  }`;
  const payload = await adminGraphql(query, { q: `tag:'${cleanText(pfaOrderId, 40)}'` }, fetchImpl);
  const node = payload.data && payload.data.orders && payload.data.orders.nodes && payload.data.orders.nodes[0];
  if (!node) return null;
  return {
    shopifyOrderId: cleanText(node.legacyResourceId || String(node.id).split('/').pop(), 40),
    shopifyOrderName: cleanText(node.name, 40)
  };
}

function orderInput({ pfaOrderId, priced, buyer, address, delivery, payment }) {
  return {
    /* Prices are sent explicitly so the order records exactly what was charged,
       and can never drift from the amount Razorpay actually took. */
    lineItems: priced.lines.map((l) => ({
      variantId: `gid://shopify/ProductVariant/${l.variantId}`,
      quantity: l.quantity,
      priceSet: { shopMoney: { amount: l.unitPrice.toFixed(2), currencyCode: priced.currency } }
    })),
    /* Not the shopper's address. Every notification this store sends about this
       order goes to a PFA mailbox instead, tagged with the PFA order id.
       Turning off the order receipt is one setting; the shipping confirmation,
       the shipping update, the cancellation and the refund notices are
       store-wide templates the seller cannot disable for PFA's orders alone
       without disabling them for their own customers too. Relaying the address
       is the only way to keep the seller's name out of the shopper's inbox that
       does not depend on the seller changing anything, and it hands PFA the
       tracking details it needs to send its own update. The shopper's real
       address stays in PFA's record, which is where PFA's one email goes. */
    email: buyer.relayEmail,
    phone: buyer.phone,
    currency: priced.currency,
    shippingAddress: address,
    billingAddress: address,
    shippingLines: [{
      title: cleanText(delivery.title, 120) || 'Delivery',
      code: cleanText(delivery.code, 80) || 'Standard',
      priceSet: { shopMoney: { amount: priced.shipping.toFixed(2), currencyCode: priced.currency } }
    }],
    transactions: [{
      kind: 'SALE',
      status: 'SUCCESS',
      gateway: 'razorpay',
      authorizationCode: cleanText(payment.razorpayPaymentId, 60),
      amountSet: { shopMoney: { amount: priced.total.toFixed(2), currencyCode: priced.currency } }
    }],
    financialStatus: 'PAID',
    note: `Order via PFA site · ${pfaOrderId}`,
    /* The PFA order id is the tag, because a tag is queryable and that is what
       makes findOrderByPfaId able to answer before creating a second order. */
    tags: ['pfa-order', cleanText(pfaOrderId, 40)],
    customAttributes: [
      { key: 'pfa_order_id', value: cleanText(pfaOrderId, 40) },
      { key: 'razorpay_payment_id', value: cleanText(payment.razorpayPaymentId, 60) },
      { key: 'delivery_speed', value: cleanText(delivery.title, 120) },
      /* So a person reading the order in Shopify knows why the email address
         looks like that, and where the real customer record lives. */
      { key: 'customer_contact', value: 'Held by PFA · notifications relayed' }
    ]
  };
}

async function createOrder(args, fetchImpl = global.fetch) {
  const existing = await findOrderByPfaId(args.pfaOrderId, fetchImpl).catch(() => null);
  if (existing) return Object.assign({ alreadyExisted: true }, existing);

  const mutation = `mutation PfaOrderCreate($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
    orderCreate(order: $order, options: $options) {
      order { id name legacyResourceId }
      userErrors { field message }
    }
  }`;
  const payload = await adminGraphql(mutation, {
    order: orderInput(args),
    options: {
      /* PFA sends the one email the shopper gets. Shopify's own receipt would
         carry the seller's order number and a link to the seller's order status
         page, which is the number the shopper must never be given. */
      sendReceipt: false,
      sendFulfillmentReceipt: false,
      inventoryBehaviour: 'DECREMENT_OBEYING_POLICY'
    }
  }, fetchImpl);

  const result = payload.data && payload.data.orderCreate;
  const errors = (result && Array.isArray(result.userErrors) ? result.userErrors : [])
    .map((e) => cleanText(e && e.message, 160)).filter(Boolean);
  if (!result || !result.order) {
    throw adminError(errors[0] || 'The seller store did not accept the order.', 'SHOPIFY_ORDER_REJECTED', 502);
  }
  return {
    alreadyExisted: false,
    shopifyOrderId: cleanText(result.order.legacyResourceId || String(result.order.id).split('/').pop(), 40),
    shopifyOrderName: cleanText(result.order.name, 40)
  };
}

module.exports = {
  config,
  adminGraphql,
  priceBasket,
  findOrderByPfaId,
  createOrder,
  _private: { orderInput, money, cleanText, adminError }
};
