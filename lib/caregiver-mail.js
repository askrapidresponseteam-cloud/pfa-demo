'use strict';

/* Transactional email for the Colony Caregiver Card.

   Sending is deliberately decoupled from the request that caused it: the row is
   written to caregiverEmails inside the originating transaction, and delivery
   is attempted afterwards on a best-effort basis and again by the worker. A
   slow or down mail provider therefore delays an email; it never fails an
   application or loses a payment callback. */

const CAREGIVER = require('./caregiver');

const FROM = process.env.PFA_MAIL_FROM || 'People for Animals <cards@peopleforanimalsindia.org>';
const REPLY_TO = process.env.PFA_MAIL_REPLY_TO || '';
const PROVIDER_ENDPOINT = process.env.PFA_MAIL_ENDPOINT || 'https://api.resend.com/emails';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
}

/* One shell for every email. Plain, high-contrast and table-free where it can
   be: these have to survive Gmail, Outlook and a five-year-old Android client. */
function shell({ heading, intro, rows, cta, footnote }) {
  const rowHtml = (rows || [])
    .filter((row) => row && row.value)
    .map((row) => `<tr>
      <td style="padding:10px 0;border-bottom:1px solid #e6e8eb;color:#5c6771;font-size:13px">${escapeHtml(row.label)}</td>
      <td style="padding:10px 0;border-bottom:1px solid #e6e8eb;color:#0e1116;font-size:14px;font-weight:600;text-align:right">${escapeHtml(row.value)}</td>
    </tr>`).join('');

  const ctaHtml = cta
    ? `<a href="${escapeHtml(cta.url)}" style="display:inline-block;margin-top:26px;background:#0653ee;color:#ffffff;text-decoration:none;padding:14px 22px;font-size:15px;font-weight:600;border-radius:6px">${escapeHtml(cta.label)}</a>`
    : '';

  return `<!doctype html><html><body style="margin:0;background:#f4f6f8;padding:28px 14px;font-family:Helvetica,Arial,sans-serif">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:10px;padding:34px 30px">
  <div style="color:#0653ee;font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase">People for Animals</div>
  <h1 style="margin:16px 0 12px;font-size:25px;line-height:1.2;color:#0e1116">${escapeHtml(heading)}</h1>
  <p style="margin:0;color:#5c6771;font-size:15px;line-height:1.6">${escapeHtml(intro)}</p>
  ${rowHtml ? `<table style="width:100%;margin-top:26px;border-collapse:collapse">${rowHtml}</table>` : ''}
  ${ctaHtml}
  ${footnote ? `<p style="margin:26px 0 0;color:#8a949e;font-size:12px;line-height:1.6">${escapeHtml(footnote)}</p>` : ''}
</div>
<p style="max-width:520px;margin:16px auto 0;color:#8a949e;font-size:11px;text-align:center">People for Animals &middot; peopleforanimalsindia.org</p>
</body></html>`;
}

function textFrom(parts) {
  return parts.filter(Boolean).join('\n');
}

const TEMPLATES = {
  card_issued(payload) {
    return {
      subject: `Your Colony Caregiver Card is ready - ${payload.cardId}`,
      html: shell({
        heading: 'Your card is issued.',
        intro: `${payload.name}, your Colony Animal Colony Caregiver Card has been issued in your name. Keep the card number safe - it is how the card is verified.`,
        rows: [
          { label: 'Card number', value: payload.cardId },
          { label: 'Issued on', value: formatDate(payload.issuedAt) },
          { label: 'Valid until', value: formatDate(payload.validUntil) }
        ],
        cta: { label: 'Open your card', url: payload.cardUrl },
        footnote: 'This link is permanent. Save it, or download the card as a PNG from that page.'
      }),
      text: textFrom([
        `${payload.name}, your Colony Animal Colony Caregiver Card has been issued.`,
        `Card number: ${payload.cardId}`,
        `Issued on: ${formatDate(payload.issuedAt)}`,
        `Valid until: ${formatDate(payload.validUntil)}`,
        `Open your card: ${payload.cardUrl}`
      ])
    };
  },

  /* A reply written by a member of staff. Their text is the body; it is
     escaped and its line breaks kept, so nothing they type can become
     markup and nothing they meant as a paragraph is lost. */
  submission_reply(payload) {
    const paragraphs = String(payload.text || '').split(/\n{2,}/).map((para) => escapeHtml(para).replace(/\n/g, '<br>'));
    const body = paragraphs.map((para) => `<p style="margin:0 0 14px;color:#0e1116;font-size:15px;line-height:1.65">${para}</p>`).join('');
    const what = String(payload.kindLabel || 'submission').toLowerCase();
    return {
      subject: `Re: ${payload.reference} - a reply from People for Animals`,
      html: `<!doctype html><html><body style="margin:0;background:#f4f6f8;padding:28px 14px;font-family:Helvetica,Arial,sans-serif">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:10px;padding:34px 30px">
  <div style="color:#0653ee;font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase">People for Animals</div>
  <p style="margin:16px 0 20px;color:#5c6771;font-size:13px;line-height:1.6">About your ${escapeHtml(what)} <strong style="color:#0e1116">${escapeHtml(payload.reference)}</strong>${payload.name ? ', ' + escapeHtml(payload.name) : ''}:</p>
  ${body}
  <p style="margin:22px 0 0;color:#0e1116;font-size:14px;line-height:1.6">${escapeHtml(payload.signoff || 'People for Animals')}</p>
  <a href="${escapeHtml(payload.followUrl)}" style="display:inline-block;margin-top:26px;background:#0653ee;color:#ffffff;text-decoration:none;padding:14px 22px;font-size:15px;font-weight:600;border-radius:6px">See where it stands</a>
  <p style="margin:26px 0 0;color:#8a949e;font-size:12px;line-height:1.6">${escapeHtml(payload.replyHint || 'You can reply to this email and it will reach PFA.')} Please keep the reference number in the subject.</p>
</div>
<p style="max-width:520px;margin:16px auto 0;color:#8a949e;font-size:11px;text-align:center">People for Animals &middot; peopleforanimalsindia.org</p>
</body></html>`,
      text: textFrom([
        `About your ${what} ${payload.reference}${payload.name ? ', ' + payload.name : ''}:`,
        '',
        String(payload.text || ''),
        '',
        payload.signoff || 'People for Animals',
        `See where it stands: ${payload.followUrl}`
      ])
    };
  },

  staff_invite(payload) {
    const what = Array.isArray(payload.modules) && payload.modules.length ? payload.modules.join(', ') : 'the panel';
    const again = payload.reason === 'reset';
    return {
      subject: again ? 'Set a new password for the PFA admin panel' : 'You have been given access to the PFA admin panel',
      html: shell({
        heading: again ? 'Set a new password.' : 'You are in.',
        intro: `${payload.name ? payload.name + ', y' : 'Y'}ou ${again ? 'asked for a new password for' : 'have been given access to'} the People for Animals admin panel`
          + (again ? '.' : ` as ${payload.role === 'super' ? 'a super admin' : 'staff'}, with: ${what}.`)
          + ' Use the button to set your password; it works once and only for a little while.',
        rows: [{ label: 'Sign in at', value: payload.adminUrl }],
        cta: { label: 'Set my password', url: payload.link },
        footnote: 'If you did not expect this, ignore it and nothing happens. Nobody at PFA will ever ask you for your password.'
      }),
      text: textFrom([
        `${payload.name ? payload.name + ', y' : 'Y'}ou ${again ? 'asked for a new password for' : 'have been given access to'} the People for Animals admin panel${again ? '' : ' with: ' + what}.`,
        `Set your password: ${payload.link}`,
        `Then sign in at ${payload.adminUrl}`
      ])
    };
  },

  /* The one email a donor gets. The form asked for an email "for the
     receipt" and an address "your 80G receipt should carry", and until this
     existed nothing was ever sent: the thank-you page was the only record the
     person left with. This is the acknowledgement, with the PFA transaction id
     they need to quote; the formal 80G certificate is issued by PFA's office
     against that id. */
  payment_received(payload) {
    const isSend = payload.type === 'send';
    const what = isSend ? 'Give/Send order' : 'donation';
    const amount = String(payload.currency || 'INR').toUpperCase() === 'USD'
      ? '$' + Number(payload.amount || 0).toFixed(2)
      : '\u20b9' + Number(payload.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const rows = [
      { label: 'PFA transaction ID', value: payload.orderId },
      { label: 'Amount', value: amount },
      { label: 'Paid on', value: formatDate(payload.paidAt) }
    ];
    if (isSend && payload.items) rows.push({ label: 'Items', value: payload.items });
    if (isSend && payload.destination) rows.push({ label: 'Destination', value: payload.destination });
    if (!isSend && payload.cause) rows.push({ label: 'Where it goes', value: payload.cause });
    if (payload.bankReference) rows.push({ label: 'Bank reference', value: payload.bankReference });
    return {
      subject: `${isSend ? 'Order' : 'Donation'} received by PFA - ${payload.orderId}`,
      html: shell({
        heading: isSend ? 'Your order is paid.' : 'Thank you.',
        intro: `${payload.name ? payload.name + ', y' : 'Y'}our ${what} of ${amount} has reached People for Animals. `
          + (isSend
            ? 'The items and destination have been kept for volunteer routing.'
            : 'This is your acknowledgement. Quote the transaction ID below in any message about this gift'
              + (payload.pan ? ', including for your 80G certificate' : '') + '.'),
        rows,
        cta: null,
        footnote: 'People for Animals does not receive or store card, bank or UPI details; the payment was taken by CCAvenue.'
      }),
      text: textFrom([
        `Your ${what} of ${amount} has reached People for Animals.`,
        `PFA transaction ID: ${payload.orderId}`,
        `Paid on: ${formatDate(payload.paidAt)}`,
        ...(isSend && payload.items ? [`Items: ${payload.items}`] : []),
        ...(isSend && payload.destination ? [`Destination: ${payload.destination}`] : []),
        ...(!isSend && payload.cause ? [`Where it goes: ${payload.cause}`] : []),
        ...(payload.bankReference ? [`Bank reference: ${payload.bankReference}`] : []),
        'Quote the transaction ID in any message about this payment.'
      ])
    };
  },

  submission_received(payload) {
    const what = String(payload.kindLabel || 'submission').toLowerCase();
    return {
      subject: `Received by PFA - ${payload.reference}`,
      html: shell({
        heading: 'We have it.',
        intro: `${payload.name ? payload.name + ', y' : 'Y'}our ${what} has reached People for Animals and has been given a number. `
          + 'Keep it: it is how you follow what happens next, and how to refer to this if you write or call.',
        rows: [
          { label: 'Reference', value: payload.reference },
          { label: 'Received on', value: formatDate(payload.receivedAt) }
        ],
        cta: { label: 'Follow it', url: payload.followUrl },
        footnote: 'To follow it you will be asked for this number and the email or mobile you gave us, so that only you can see it.'
      }),
      text: textFrom([
        `Your ${what} has reached People for Animals.`,
        `Reference: ${payload.reference}`,
        `Received on: ${formatDate(payload.receivedAt)}`,
        `Follow it: ${payload.followUrl}`,
        'You will be asked for this number and the email or mobile you gave us.'
      ])
    };
  },

  shipping_paid(payload) {
    return {
      subject: `Printed card confirmed - ${payload.trackingId}`,
      html: shell({
        heading: 'Your printed card is on its way.',
        intro: 'We have received your shipping payment and your card has gone into production. You can follow it from your card page.',
        rows: [
          { label: 'Card number', value: payload.cardId },
          { label: 'Tracking ID', value: payload.trackingId },
          { label: 'Amount paid', value: `₹${payload.amount}` },
          { label: 'Payment reference', value: payload.paymentReference }
        ],
        cta: { label: 'Track your card', url: payload.cardUrl },
        footnote: 'Printing and dispatch usually take a few working days.'
      }),
      text: textFrom([
        'Your shipping payment has been received and your printed card is in production.',
        `Card number: ${payload.cardId}`,
        `Tracking ID: ${payload.trackingId}`,
        `Amount paid: INR ${payload.amount}`,
        `Payment reference: ${payload.paymentReference}`,
        `Track your card: ${payload.cardUrl}`
      ])
    };
  },

  shipment_update(payload) {
    const dispatched = payload.status === 'dispatched';
    const delivered = payload.status === 'delivered';
    const heading = delivered ? 'Your card has been delivered.'
      : dispatched ? 'Your card has been dispatched.'
      : `Delivery update: ${payload.statusLabel}`;
    const intro = delivered
      ? 'Your printed Colony Animal Colony Caregiver Card has been delivered. Carry it when you feed.'
      : dispatched
        ? 'Your printed card has left us and is with the courier.'
        : `The status of your printed card has changed to ${payload.statusLabel}.`;

    return {
      subject: `${payload.statusLabel} - ${payload.trackingId}`,
      html: shell({
        heading,
        intro,
        rows: [
          { label: 'Status', value: payload.statusLabel },
          { label: 'Tracking ID', value: payload.trackingId },
          { label: 'Courier', value: payload.carrier },
          { label: 'Courier tracking', value: payload.carrierTrackingNumber },
          { label: 'Card number', value: payload.cardId }
        ],
        cta: { label: 'View delivery status', url: payload.cardUrl },
        footnote: payload.note || ''
      }),
      text: textFrom([
        `${heading} (${payload.statusLabel})`,
        `Tracking ID: ${payload.trackingId}`,
        payload.carrier ? `Courier: ${payload.carrier}` : '',
        payload.carrierTrackingNumber ? `Courier tracking: ${payload.carrierTrackingNumber}` : '',
        `View status: ${payload.cardUrl}`
      ])
    };
  }
};

function render(template, payload) {
  const build = TEMPLATES[template];
  if (!build) throw new Error(`Unknown email template: ${template}`);
  const rendered = build(payload || {});
  if (!rendered.subject || !rendered.html) throw new Error(`Template ${template} produced nothing to send.`);
  return rendered;
}

function isConfigured() {
  return Boolean(process.env.PFA_MAIL_API_KEY);
}

/* Delivery. Any provider with a JSON API works; the shape below is Resend's,
   which several others accept unchanged. */
async function deliver({ to, template, payload }) {
  if (!isConfigured()) {
    const error = new Error('PFA_MAIL_API_KEY is not configured.');
    error.code = 'MAIL_NOT_CONFIGURED';
    throw error;
  }
  if (!CAREGIVER.validEmail(to)) {
    const error = new Error('The recipient address is not valid.');
    error.code = 'INVALID_RECIPIENT';
    throw error;
  }

  const { subject, html, text } = render(template, payload);
  const body = { from: FROM, to: [to], subject, html, text };
  if (REPLY_TO) body.reply_to = REPLY_TO;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(PROVIDER_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PFA_MAIL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const raw = await response.text();
    if (!response.ok) {
      const error = new Error(`Mail provider returned ${response.status}: ${raw.slice(0, 200)}`);
      // 4xx other than rate limiting will never succeed on retry.
      error.permanent = response.status >= 400 && response.status < 500 && response.status !== 429;
      throw error;
    }

    let providerId = null;
    try { providerId = JSON.parse(raw).id || null; } catch (_) { providerId = null; }
    return { providerId };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { TEMPLATES, deliver, formatDate, isConfigured, render, shell };
