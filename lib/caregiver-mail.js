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
  /* The welcome letter. Not the grey acknowledgement the other payments
     get: a member has joined something, and the letter says so in the
     register the brief asked for - one flat electric blue, white type at
     poster size, one line to a thought, and a single white button. Tables
     and inline styles throughout, because that is what mail clients honour;
     no web font, because none arrives in a mail client either, so the face
     is the heaviest sans the reader has. Sharp corners, as everywhere on
     the site. The plain-text twin carries the same facts in the same order. */
  membership_welcome(payload) {
    const blue = '#2634f5';
    const amount = '\u20b9' + Number(payload.amount || 0).toLocaleString('en-IN');
    const first = String(payload.name || '').trim().split(/\s+/)[0] || '';
    const site = String(payload.siteUrl || '').replace(/\/+$/, '');
    const link = (path) => (site ? `${site}/${path}` : '');
    const kit = Array.isArray(payload.kit) ? payload.kit.filter(Boolean) : [];
    const big = (line) => `<div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-weight:900;font-size:56px;line-height:0.95;letter-spacing:-1px;color:#ffffff;text-transform:uppercase">${escapeHtml(line)}</div>`;
    const kitHtml = kit.length
      ? `<p style="margin:26px 0 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;color:#ffffff;text-transform:uppercase">On its way to you</p>`
        + `<ul style="margin:10px 0 0;padding:0 0 0 18px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#ffffff">${kit.map((k) => `<li>${escapeHtml(k)}</li>`).join('')}</ul>`
        + `<p style="margin:12px 0 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#ffffff;opacity:.85">Your membership card and kit reach you in 20 to 25 days.</p>`
      : `<p style="margin:26px 0 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#ffffff;opacity:.85">Your membership card reaches you in 20 to 25 days.</p>`;
    const button = site
      ? `<a href="${escapeHtml(link('units.html'))}" style="display:inline-block;margin-top:34px;background:#ffffff;color:${blue};text-decoration:none;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:18px 28px">Find your nearest unit &nbsp;&rarr;</a>`
      : '';
    const follow = site
      ? `<p style="margin:22px 0 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#ffffff;opacity:.8">Follow your card and kit at <a href="${escapeHtml(link('track.html') + '#ref=' + encodeURIComponent(payload.memberId || ''))}" style="color:#ffffff">${escapeHtml(site.replace(/^https?:\/\//, ''))}/track.html</a> with your member number and this email address.</p>`
      : '';
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Welcome to People for Animals</title></head>
<body style="margin:0;padding:0;background:${blue}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${blue}"><tr><td align="center" style="padding:36px 18px 48px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
  <tr><td style="padding:0 0 44px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:3px;color:#ffffff;text-transform:uppercase">People for Animals</td></tr>
  <tr><td style="padding:0 0 30px">${big("You're")}${big('one of')}${big('us now.')}</td></tr>
  <tr><td style="padding:0 0 8px;font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:30px;line-height:1.1;color:#ffffff">${escapeHtml(first ? first + ',' : 'Welcome,')}</td></tr>
  <tr><td style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.65;color:#ffffff">your ${escapeHtml((payload.tierLabel || 'membership').toLowerCase())} of People for Animals is active from today. Every member is an active working member: when an animal near you needs someone, PFA may call on you, and you may call on PFA.</td></tr>
  <tr><td style="padding:34px 0 0">
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-top:2px solid #ffffff;border-bottom:2px solid #ffffff;width:100%">
      <tr>
        <td style="padding:16px 18px 16px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;color:#ffffff;text-transform:uppercase;white-space:nowrap">Member number</td>
        <td style="padding:16px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:22px;font-weight:900;color:#ffffff;letter-spacing:1px">${escapeHtml(payload.memberId || payload.orderId)}</td>
      </tr>
      <tr>
        <td style="padding:0 18px 16px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;color:#ffffff;text-transform:uppercase">Paid</td>
        <td style="padding:0 0 16px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#ffffff">${escapeHtml(amount)} on ${escapeHtml(formatDate(payload.paidAt))} &middot; PFA transaction ${escapeHtml(payload.orderId)}${payload.bankReference ? ' &middot; bank reference ' + escapeHtml(payload.bankReference) : ''}</td>
      </tr>
    </table>
  </td></tr>
  <tr><td>${kitHtml}${button}${follow}</td></tr>
  <tr><td style="padding:44px 0 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;line-height:1.7;color:#ffffff;opacity:.75">People for Animals is a registered trust; membership payments are eligible for exemption under Section 80G of the Income Tax Act, 1961, and this letter is your acknowledgement. Quote the member number in any message about your membership. PFA never sees your card, bank or UPI details; the payment was taken by CCAvenue.<br>4-T, DCM Building, 16 Barakhamba Road, New Delhi 110001</td></tr>
</table>
</td></tr></table>
</body></html>`;
    return {
      subject: `You're one of us now - PFA member ${payload.memberId || payload.orderId}`,
      html,
      text: textFrom([
        `${first ? first + ', y' : 'Y'}our ${(payload.tierLabel || 'membership').toLowerCase()} of People for Animals is active from today.`,
        `Member number: ${payload.memberId || payload.orderId}`,
        `Paid: ${amount} on ${formatDate(payload.paidAt)} - PFA transaction ${payload.orderId}`,
        ...(payload.bankReference ? [`Bank reference: ${payload.bankReference}`] : []),
        ...(kit.length ? ['On its way to you: ' + kit.join('; ')] : []),
        kit.length ? 'Your membership card and kit reach you in 20 to 25 days.' : 'Your membership card reaches you in 20 to 25 days.',
        'Every member is an active working member: when an animal near you needs someone, PFA may call on you, and you may call on PFA.',
        ...(site ? [`Find your nearest unit: ${link('units.html')}`, `Follow your card and kit: ${link('track.html')}#ref=${encodeURIComponent(payload.memberId || '')}`] : []),
        'Membership payments are eligible for exemption under Section 80G; this letter is your acknowledgement.'
      ])
    };
  },
  payment_received(payload) {
    /* The Give/Send order arm of this receipt retired with the food flow in
       v1.300; a donation is the one payment this acknowledgement is for. */
    const amount = String(payload.currency || 'INR').toUpperCase() === 'USD'
      ? '$' + Number(payload.amount || 0).toFixed(2)
      : '\u20b9' + Number(payload.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const rows = [
      { label: 'PFA transaction ID', value: payload.orderId },
      { label: 'Amount', value: amount },
      { label: 'Paid on', value: formatDate(payload.paidAt) }
    ];
    if (payload.cause) rows.push({ label: 'Where it goes', value: payload.cause });
    if (payload.bankReference) rows.push({ label: 'Bank reference', value: payload.bankReference });
    return {
      subject: `Donation received by PFA - ${payload.orderId}`,
      html: shell({
        heading: 'Thank you.',
        intro: `${payload.name ? payload.name + ', y' : 'Y'}our donation of ${amount} has reached People for Animals. `
          + 'This is your acknowledgement. Quote the transaction ID below in any message about this gift'
          + (payload.pan ? ', including for your 80G certificate' : '') + '.',
        rows,
        cta: null,
        footnote: 'People for Animals does not receive or store card, bank or UPI details; the payment was taken by CCAvenue.'
      }),
      text: textFrom([
        `Your donation of ${amount} has reached People for Animals.`,
        `PFA transaction ID: ${payload.orderId}`,
        `Paid on: ${formatDate(payload.paidAt)}`,
        ...(payload.cause ? [`Where it goes: ${payload.cause}`] : []),
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
