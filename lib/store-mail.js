'use strict';

/* The one email the shopper gets about a store order.
 *
 * It comes from PFA, it carries the PFA order id, and it is the only message
 * about this order that reaches them: Shopify's own notifications are addressed
 * to a PFA relay mailbox instead (see relayEmailFor in store-payments.js), and
 * Shopify's receipt is switched off at creation.
 *
 * It is sent when Razorpay confirms the money, not when Shopify accepts the
 * order. Those are different moments and the shopper only cares about the first
 * one: they have paid, and the number in this email is the number they quote.
 * If the order has not reached the seller yet, that is PFA's problem to fix and
 * not a reason to leave a paying customer without a confirmation.
 *
 * Nothing here can fail an order. A send that does not go out is recorded on
 * the order and retried; the order stands regardless.
 */

const FROM = process.env.PFA_STORE_MAIL_FROM
  || process.env.PFA_MAIL_FROM
  || 'People for Animals <orders@peopleforanimalsindia.org>';
const REPLY_TO = process.env.PFA_STORE_MAIL_REPLY_TO || process.env.PFA_MAIL_REPLY_TO || '';
const ENDPOINT = process.env.PFA_MAIL_ENDPOINT || 'https://api.resend.com/emails';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function money(amount, currency) {
  const n = Number(amount) || 0;
  const symbol = (currency || 'INR') === 'INR' ? '\u20b9' : '';
  return symbol + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isConfigured() {
  return Boolean(process.env.PFA_MAIL_API_KEY);
}

/* Where the order can be followed. The tracking page now answers for a
   direct-pay order number, so the email can say so instead of only asking the
   person to keep the number. */
function followUrl(record) {
  const configured = String(process.env.PUBLIC_SITE_URL || '').trim();
  let origin = 'https://peopleforanimalsindia.org';
  try { const u = new URL(configured); if (/^https?:$/.test(u.protocol)) origin = u.origin; } catch (_) {}
  return `${origin}/track.html#ref=${encodeURIComponent(String(record.pfaOrderId || ''))}`;
}

function validEmail(value) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(value || '').trim());
}

function addressLines(address) {
  if (!address) return [];
  return [
    [address.firstName, address.lastName].filter(Boolean).join(' '),
    address.address1,
    address.address2,
    [address.city, address.provinceCode].filter(Boolean).join(', '),
    address.zip
  ].filter(Boolean);
}

/* One template. There is deliberately no dispatch email here: PFA does not know
   an order has shipped until the seller's notification reaches the relay
   mailbox, and relaying that on is a separate piece of work with its own
   trigger. Promising tracking in this email would be promising something the
   code does not yet do. */
function render(record) {
  const items = Array.isArray(record.items) ? record.items : [];
  const rows = items.map((i) => `<tr>
      <td style="padding:10px 0;border-bottom:1px solid #e6e8eb;color:#0e1116;font-size:14px">${escapeHtml(i.title)}${i.quantity > 1 ? ` &times; ${i.quantity}` : ''}</td>
      <td style="padding:10px 0;border-bottom:1px solid #e6e8eb;color:#0e1116;font-size:14px;text-align:right">${escapeHtml(money(i.unitPrice * i.quantity, record.currency))}</td>
    </tr>`).join('');

  const totals = `<tr>
      <td style="padding:10px 0;color:#5c6771;font-size:13px">Items</td>
      <td style="padding:10px 0;color:#0e1116;font-size:14px;text-align:right">${escapeHtml(money(record.itemsTotal, record.currency))}</td>
    </tr><tr>
      <td style="padding:10px 0;color:#5c6771;font-size:13px">Delivery${record.deliveryTitle ? ' &middot; ' + escapeHtml(record.deliveryTitle) : ''}</td>
      <td style="padding:10px 0;color:#0e1116;font-size:14px;text-align:right">${escapeHtml(money(record.shipping, record.currency))}</td>
    </tr><tr>
      <td style="padding:14px 0 0;color:#0e1116;font-size:15px;font-weight:700">Total paid</td>
      <td style="padding:14px 0 0;color:#0e1116;font-size:15px;font-weight:700;text-align:right">${escapeHtml(money(record.total, record.currency))}</td>
    </tr>`;

  const where = addressLines(record.address).map(escapeHtml).join('<br>');

  const html = `<!doctype html><html><body style="margin:0;background:#f4f6f8;padding:28px 14px;font-family:Helvetica,Arial,sans-serif">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:10px;padding:34px 30px">
  <div style="color:#0653ee;font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase">People for Animals</div>
  <h1 style="margin:16px 0 12px;font-size:25px;line-height:1.2;color:#0e1116">Your order is confirmed.</h1>
  <p style="margin:0;color:#5c6771;font-size:15px;line-height:1.6">Thank you. Your payment has gone through and your order is on its way to being packed.</p>
  <div style="margin:24px 0;padding:16px 18px;background:#f4f6f8;border-radius:8px">
    <div style="color:#5c6771;font-size:12px;letter-spacing:.08em;text-transform:uppercase">Order number</div>
    <div style="color:#0e1116;font-size:20px;font-weight:700;margin-top:4px">${escapeHtml(record.pfaOrderId)}</div>
  </div>
  <table style="width:100%;border-collapse:collapse">${rows}${totals}</table>
  ${where ? `<p style="margin:26px 0 0;color:#5c6771;font-size:13px;line-height:1.7"><strong style="color:#0e1116">Delivering to</strong><br>${where}</p>` : ''}
  <p style="margin:26px 0 0;color:#5c6771;font-size:13px;line-height:1.7">Follow it at <a href="${escapeHtml(followUrl(record))}" style="color:#0653ee">${escapeHtml(followUrl(record))}</a> with the email or mobile you gave.</p>
  <p style="margin:16px 0 0;color:#8a949e;font-size:12px;line-height:1.6">The Store is stocked and shipped by an independent seller. Quote ${escapeHtml(record.pfaOrderId)} in any message to us about this order.</p>
</div>
<p style="max-width:520px;margin:16px auto 0;color:#8a949e;font-size:11px;text-align:center">People for Animals &middot; peopleforanimalsindia.org</p>
</body></html>`;

  const text = [
    'Your order is confirmed.',
    '',
    'Order number: ' + record.pfaOrderId,
    '',
    ...items.map((i) => `${i.title}${i.quantity > 1 ? ' x' + i.quantity : ''}  ${money(i.unitPrice * i.quantity, record.currency)}`),
    `Items: ${money(record.itemsTotal, record.currency)}`,
    `Delivery${record.deliveryTitle ? ' (' + record.deliveryTitle + ')' : ''}: ${money(record.shipping, record.currency)}`,
    `Total paid: ${money(record.total, record.currency)}`,
    '',
    ...(addressLines(record.address).length ? ['Delivering to:', ...addressLines(record.address)] : []),
    '',
    'Follow it: ' + followUrl(record) + ' (with the email or mobile you gave)',
    '',
    'The Store is stocked and shipped by an independent seller.',
    'Quote ' + record.pfaOrderId + ' in any message to us about this order.'
  ].join('\n');

  return { subject: `Your PFA order ${record.pfaOrderId} is confirmed`, html, text };
}

async function send(record, fetchImpl = global.fetch) {
  if (!isConfigured()) return { sent: false, reason: 'MAIL_NOT_CONFIGURED' };
  if (!validEmail(record && record.email)) return { sent: false, reason: 'INVALID_RECIPIENT' };
  if (typeof fetchImpl !== 'function') return { sent: false, reason: 'NO_NETWORK', retryable: true };

  const { subject, html, text } = render(record);
  const body = { from: FROM, to: [record.email], subject, html, text };
  if (REPLY_TO) body.reply_to = REPLY_TO;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PFA_MAIL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const raw = await response.text().catch(() => '');
    if (!response.ok) {
      /* 4xx other than rate limiting will never succeed on a retry. */
      const permanent = response.status >= 400 && response.status < 500 && response.status !== 429;
      return { sent: false, reason: 'MAIL_REJECTED_' + response.status, retryable: !permanent };
    }
    let providerId = '';
    try { providerId = JSON.parse(raw).id || ''; } catch (_) {}
    return { sent: true, providerId };
  } catch (_) {
    return { sent: false, reason: 'MAIL_NETWORK_ERROR', retryable: true };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { render, send, isConfigured, _private: { money, addressLines, validEmail, escapeHtml } };
