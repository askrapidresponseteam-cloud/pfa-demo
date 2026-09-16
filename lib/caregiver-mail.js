'use strict';

/* Transactional email for the Colony Caregiver Card.

   Sending is deliberately decoupled from the request that caused it: the row is
   written to caregiverEmails inside the originating transaction, and delivery
   is attempted afterwards on a best-effort basis and again by the worker. A
   slow or down mail provider therefore delays an email; it never fails an
   application or loses a payment callback. */

const crypto = require('crypto');
const CAREGIVER = require('./caregiver');
const CONFIRM = require('./confirmations');

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

/* ---- the letter ----------------------------------------------------------

   Every confirmation is this letter now, because the membership welcome
   letter was the one written to the brief: one flat electric blue, white type
   at poster size, one line to a thought, the number large between two rules,
   and a single white button. Tables and inline styles throughout, because
   that is what mail clients honour; no web font, because none arrives in a
   mail client either, so the face is the heaviest sans the reader has. Sharp
   corners, as everywhere on the site.

   The mark is img/logo-dark.png, the version drawn for dark grounds that the
   header already uses, fetched from the site the email was sent from; with
   images blocked its alt text shows in white. The softer whites are solid
   colours rather than opacity, which Outlook ignores. A small style block
   lets a phone set the headline smaller and stack the rows; a client that
   drops it still gets a letter that reads, because every number can wrap at
   its hyphens. */
const BLUE = '#2634f5';
const SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif";
const SOFT = '#dee1fe';
const FAINT = '#c9ccfc';
const ADDRESS = '4-T, DCM Building, 16 Barakhamba Road, New Delhi 110001';

/* "Asha Rao" is Asha; so are "K. Asha" and "Dr. Asha". An initial or a title
   is not a name to open a letter with. */
function firstName(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  return words.find((word) => !/\.$/.test(word) && word.length > 1) || words[0] || '';
}

/* The site the letter's links and mark point at: the one the request came
   from, never a guess. */
function siteOf(payload) {
  const raw = String((payload && (payload.siteUrl || payload.followUrl)) || '');
  try {
    const url = new URL(raw);
    return /^https?:$/.test(url.protocol) ? url.origin : '';
  } catch (_) {
    return '';
  }
}

function letter(o) {
  const site = String(o.siteUrl || '').replace(/\/+$/, '');
  const caps = `font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:2px;color:#ffffff;text-transform:uppercase`;
  const big = (line) => `<div style="font-family:${SANS};font-weight:900;font-size:56px;line-height:0.95;letter-spacing:-1px;color:#ffffff;text-transform:uppercase">${escapeHtml(line)}</div>`;
  const mark = site
    ? `<tr><td style="padding:0 0 34px"><img src="${escapeHtml(site)}/img/logo-dark.png" alt="People for Animals" width="260" style="display:block;width:260px;max-width:80%;height:auto;border:0;outline:none;text-decoration:none;color:#ffffff;font-family:${SANS};font-size:18px;font-weight:700;letter-spacing:2px;text-transform:uppercase"></td></tr>`
    : `<tr><td style="padding:0 0 44px;font-family:${SANS};font-size:12px;font-weight:700;letter-spacing:3px;color:#ffffff;text-transform:uppercase">People for Animals</td></tr>`;

  const rows = (o.rows || []).filter((row) => row && row.value).map((row, i) => {
    const top = i === 0 ? 16 : 0;
    const valign = row.big ? 'middle' : 'top';
    const type = row.big ? 'font-size:22px;font-weight:900;letter-spacing:1px' : 'font-size:15px;line-height:1.5';
    return `<tr><td class="pfa-l" width="1%" valign="${valign}" style="padding:${row.big ? top : top + 3}px 18px 16px 0;${caps};white-space:nowrap">${escapeHtml(row.label)}</td>`
      + `<td class="pfa-v" valign="${valign}" style="padding:${top}px 0 16px;font-family:${SANS};color:#ffffff;${type}">${escapeHtml(row.value)}</td></tr>`;
  }).join('');

  const sections = (o.sections || []).filter((s) => s && ((s.items || []).filter(Boolean).length || s.note)).map((s) => {
    const items = (s.items || []).filter(Boolean);
    const tag = s.ordered ? 'ol' : 'ul';
    return '<tr><td style="padding:26px 0 0">'
      + (s.title ? `<p style="margin:0;${caps}">${escapeHtml(s.title)}</p>` : '')
      + (items.length ? `<${tag} style="margin:10px 0 0;padding:0 0 0 ${s.ordered ? 22 : 18}px;font-family:${SANS};font-size:15px;line-height:1.7;color:#ffffff">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</${tag}>` : '')
      + (s.note ? `<p style="margin:${s.title || items.length ? 12 : 0}px 0 0;font-family:${SANS};font-size:13px;line-height:1.6;color:${SOFT}">${escapeHtml(s.note)}</p>` : '')
      + '</td></tr>';
  }).join('');

  const button = o.button && o.button.url
    ? `<tr><td style="padding:34px 0 0"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#ffffff" style="background:#ffffff"><a class="pfa-btn" href="${escapeHtml(o.button.url)}" style="display:inline-block;background:#ffffff;color:${BLUE};text-decoration:none;font-family:${SANS};font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:18px 28px">${escapeHtml(o.button.label)}&nbsp;&nbsp;&rarr;</a></td></tr></table></td></tr>`
    : '';
  const after = o.afterHtml
    ? `<tr><td style="padding:22px 0 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${SOFT}">${o.afterHtml}</td></tr>`
    : '';
  const urgent = o.urgent
    ? `<tr><td style="padding:14px 0 0;font-family:${SANS};font-size:16px;line-height:1.65;font-weight:700;color:#ffffff">${escapeHtml(o.urgent)}</td></tr>`
    : '';
  const fine = (o.fine || []).filter(Boolean).map(escapeHtml).join(' ');
  const preheader = o.preheader
    ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:${BLUE}">${escapeHtml(o.preheader)}${'&#847;&zwnj;&nbsp;'.repeat(40)}</div>`
    : '';

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(o.title)}</title>
<style>@media only screen and (max-width:520px){.pfa-hl div{font-size:44px !important}.pfa-rows td{display:block !important;width:auto !important;white-space:normal !important;padding-right:0 !important}.pfa-rows td.pfa-l{padding-bottom:4px !important}.pfa-rows td.pfa-v{padding-top:0 !important}.pfa-btn{letter-spacing:1px !important;padding:18px 22px !important}}</style></head>
<body style="margin:0;padding:0;background:${BLUE}">${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BLUE}"><tr><td align="center" style="padding:36px 18px 48px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
  ${mark}
  <tr><td class="pfa-hl" style="padding:0 0 30px">${(o.headline || []).map(big).join('')}</td></tr>
  <tr><td style="padding:0 0 8px;font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:30px;line-height:1.1;color:#ffffff">${escapeHtml(o.greeting)}</td></tr>
  <tr><td style="font-family:${SANS};font-size:16px;line-height:1.65;color:#ffffff">${escapeHtml(o.lead)}</td></tr>
  ${urgent}
  ${rows ? `<tr><td style="padding:34px 0 0"><table role="presentation" class="pfa-rows" cellpadding="0" cellspacing="0" style="border-top:2px solid #ffffff;border-bottom:2px solid #ffffff;width:100%">${rows}</table></td></tr>` : ''}
  ${sections}${button}${after}
  <tr><td style="padding:44px 0 0;font-family:${SANS};font-size:11px;line-height:1.7;color:${FAINT}">${fine}${fine ? '<br>' : ''}${ADDRESS}</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/* The line under a number: what following it asks for. */
const FOLLOW_NOTE = 'To follow it you will be asked for this number and the email or mobile you gave, so that only you can see it.';

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

  /* The welcome letter, which the other confirmations are now drawn from.
     A member has joined something, and the letter says so before it says
     anything a receipt would. The plain-text twin carries the same facts in
     the same order. */
  membership_welcome(payload) {
    const K = CONFIRM.forKind('PFA-MEM');
    const amount = '\u20b9' + Number(payload.amount || 0).toLocaleString('en-IN');
    const first = firstName(payload.name);
    const site = siteOf(payload);
    const tier = String(payload.tierLabel || 'membership').toLowerCase();
    const number = payload.memberId || payload.orderId;
    const kit = Array.isArray(payload.kit) ? payload.kit.filter(Boolean) : [];
    const track = site ? `${site}/track.html#ref=${encodeURIComponent(payload.memberId || '')}` : '';
    const arrives = kit.length ? 'Your membership card and kit reach you in 20 to 25 days.' : 'Your membership card reaches you in 20 to 25 days.';
    const html = letter({
      title: 'Welcome to People for Animals',
      preheader: `Your ${tier} of People for Animals is active from today. ${K.number} ${number}.`,
      siteUrl: site,
      headline: K.headline,
      greeting: first ? `${first},` : 'Welcome,',
      lead: `your ${tier} of People for Animals is active from today. ${K.lead}`,
      rows: [
        { label: K.number, value: number, big: true },
        { label: 'Paid', value: `${amount} on ${formatDate(payload.paidAt)} \u00b7 PFA transaction ${payload.orderId}${payload.bankReference ? ` \u00b7 bank reference ${payload.bankReference}` : ''}` }
      ],
      sections: [kit.length ? { title: 'On its way to you', items: kit, note: arrives } : { note: arrives }],
      button: site ? { label: 'Find your nearest unit', url: `${site}/units.html` } : null,
      afterHtml: site ? `Follow your card and kit at <a href="${escapeHtml(track)}" style="color:#ffffff">${escapeHtml(site.replace(/^https?:\/\//, ''))}/track.html</a> with your member number and this email address.` : '',
      fine: [
        'People for Animals is a registered trust; membership payments are eligible for exemption under Section 80G of the Income Tax Act, 1961, and this letter is your acknowledgement.',
        'Quote the member number in any message about your membership.',
        'PFA never sees your card, bank or UPI details; the payment was taken by CCAvenue.'
      ]
    });
    return {
      subject: `You're one of us now - PFA member ${number}`,
      html,
      text: textFrom([
        `${first ? first + ', y' : 'Y'}our ${tier} of People for Animals is active from today.`,
        `Member number: ${number}`,
        `Paid: ${amount} on ${formatDate(payload.paidAt)} - PFA transaction ${payload.orderId}`,
        ...(payload.bankReference ? [`Bank reference: ${payload.bankReference}`] : []),
        ...(kit.length ? ['On its way to you: ' + kit.join('; ')] : []),
        arrives,
        K.lead,
        ...(site ? [`Find your nearest unit: ${site}/units.html`, `Follow your card and kit: ${track}`] : []),
        'Membership payments are eligible for exemption under Section 80G; this letter is your acknowledgement.'
      ])
    };
  },

  /* The one email a donor gets. The form asked for an email "for the
     receipt", and this is the acknowledgement, with the PFA transaction id
     they need to quote; the formal 80G certificate is issued by PFA's office
     against that id. The Give/Send order arm of this receipt retired with the
     food flow in v1.300; a donation is the one payment it is for. */
  payment_received(payload) {
    const usd = String(payload.currency || 'INR').toUpperCase() === 'USD';
    const amount = usd
      ? '$' + Number(payload.amount || 0).toFixed(2)
      : '\u20b9' + Number(payload.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const first = firstName(payload.name);
    const html = letter({
      title: CONFIRM.DONATION.subject,
      preheader: `Your donation of ${amount} has reached People for Animals. ${CONFIRM.TRANSACTION} ${payload.orderId}.`,
      siteUrl: siteOf(payload),
      headline: CONFIRM.DONATION.headline,
      greeting: first ? `${first},` : 'Thank you,',
      lead: `your donation of ${amount} has reached People for Animals. ${CONFIRM.DONATION.lead} Quote the transaction ID below in any message about this gift${payload.pan ? ', including for your 80G certificate' : ''}.`,
      rows: [
        { label: CONFIRM.TRANSACTION, value: payload.orderId, big: true },
        { label: 'Amount', value: amount },
        { label: 'Paid on', value: formatDate(payload.paidAt) },
        { label: 'Where it goes', value: payload.cause },
        { label: 'Bank reference', value: payload.bankReference }
      ],
      fine: [
        usd ? '' : 'Donations to People for Animals are eligible for tax deduction under Section 80G.',
        'People for Animals does not receive or store card, bank or UPI details; the payment was taken by CCAvenue.'
      ]
    });
    return {
      subject: `Donation received by PFA - ${payload.orderId}`,
      html,
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

  /* Every form that sends to /api/pfa-submissions: a report, a question, an
     application, a request, a film, a field note. Worded for what was sent,
     with its number called what it is (lib/confirmations.js). */
  submission_received(payload) {
    const K = payload.kind
      ? CONFIRM.forKind(payload.kind)
      : Object.assign({}, CONFIRM.forKind(''), { thing: CONFIRM.inSentence(payload.kindLabel || 'submission') });
    const first = firstName(payload.name);
    const reference = String(payload.reference || '');
    const html = letter({
      title: K.subject,
      preheader: `${K.number} ${reference}. ${K.lead}`,
      siteUrl: siteOf(payload),
      headline: K.headline,
      greeting: first ? `${first},` : 'Hello,',
      lead: `your ${K.thing} has reached People for Animals. ${K.lead}`,
      urgent: K.urgent,
      rows: [
        { label: K.number, value: reference, big: true },
        { label: 'Received on', value: formatDate(payload.receivedAt) }
      ],
      sections: [{ title: 'Where it goes', items: K.path, ordered: true }],
      button: payload.followUrl ? { label: 'Follow it', url: payload.followUrl } : null,
      afterHtml: payload.followUrl ? escapeHtml(FOLLOW_NOTE) : '',
      fine: [
        `Quote the ${CONFIRM.inSentence(K.number)} in any message about this.`,
        'Did not send this? Reply to this email and PFA will look into it.'
      ]
    });
    return {
      subject: `${K.subject} - ${reference}`,
      html,
      text: textFrom([
        `${first ? first + ', y' : 'Y'}our ${K.thing} has reached People for Animals.`,
        K.lead,
        K.urgent || '',
        `${K.number}: ${reference}`,
        `Received on: ${formatDate(payload.receivedAt)}`,
        K.path.length ? `Where it goes: ${K.path.join(', then ')}.` : '',
        payload.followUrl ? `Follow it: ${payload.followUrl}` : '',
        'You will be asked for this number and the email or mobile you gave.'
      ])
    };
  },

  /* A paid colony caregiver application. It had no email at all: the fee
     cleared, a number was minted, and the applicant was left with whatever
     the result page said. The letter carries the number, what was paid, and
     what the fee is and is not, in the words of the form. */
  caregiver_application_received(payload) {
    const K = CONFIRM.forKind('PFA-CG');
    const first = firstName(payload.name);
    const site = siteOf(payload);
    const reference = String(payload.applicationRef || '');
    const number = reference || payload.orderId;
    const numberLabel = reference ? K.number : CONFIRM.TRANSACTION;
    const amount = '\u20b9' + Number(payload.amount || 0).toLocaleString('en-IN');
    const follow = site && reference ? `${site}/track.html#ref=${encodeURIComponent(reference)}` : '';
    const fee = 'The fee confirms the application and gives it this number. It is not payment for a card: if the application is not approved, the fee is not refunded, because it pays for the reading rather than the card.';
    const html = letter({
      title: K.subject,
      preheader: `${numberLabel} ${number}. ${K.lead}`,
      siteUrl: site,
      headline: K.headline,
      greeting: first ? `${first},` : 'Hello,',
      lead: `your application for a colony caregiver card has reached People for Animals. ${K.lead}`,
      rows: [
        { label: numberLabel, value: number, big: true },
        { label: 'Paid', value: `${amount} on ${formatDate(payload.paidAt)} \u00b7 PFA transaction ${payload.orderId}${payload.bankReference ? ` \u00b7 bank reference ${payload.bankReference}` : ''}` },
        { label: 'Where you feed', value: payload.colony }
      ],
      sections: [{ title: 'Where an application goes', items: K.path, ordered: true, note: fee }],
      button: follow ? { label: 'Follow it', url: follow } : null,
      afterHtml: follow ? escapeHtml(FOLLOW_NOTE) : '',
      fine: [
        'Quote the application number in any message about this application.',
        'PFA never sees your card, bank or UPI details; the payment was taken by CCAvenue.',
        'Did not apply? Reply to this email and PFA will look into it.'
      ]
    });
    return {
      subject: `${K.subject} - ${number}`,
      html,
      text: textFrom([
        `${first ? first + ', y' : 'Y'}our application for a colony caregiver card has reached People for Animals.`,
        K.lead,
        `${numberLabel}: ${number}`,
        `Paid: ${amount} on ${formatDate(payload.paidAt)} - PFA transaction ${payload.orderId}`,
        payload.bankReference ? `Bank reference: ${payload.bankReference}` : '',
        payload.colony ? `Where you feed: ${payload.colony}` : '',
        `Where an application goes: ${K.path.join(', then ')}.`,
        fee,
        follow ? `Follow it: ${follow}` : ''
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

const CONFIRMATION_TEMPLATES = new Set(['submission_received', 'payment_received', 'membership_welcome', 'caregiver_application_received']);

/* A confirmation the queue retries must not arrive twice when the first
   attempt only looked like a failure: it timed out here but reached the
   provider. The key is the same on every attempt at the same letter, so a
   provider that honours Idempotency-Key, as Resend does, sends it once.
   Emails that staff may deliberately send again carry no key. */
function idempotencyKey(template, to, payload) {
  if (!CONFIRMATION_TEMPLATES.has(template)) return '';
  const p = payload || {};
  const id = p.reference || p.applicationRef || p.memberId || p.orderId;
  if (!id) return '';
  return crypto.createHash('sha256').update(`${template}:${String(to || '').toLowerCase()}:${id}`, 'utf8').digest('hex').slice(0, 48);
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
  const key = idempotencyKey(template, to, payload);
  if (REPLY_TO) body.reply_to = REPLY_TO;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(PROVIDER_ENDPOINT, {
      method: 'POST',
      headers: Object.assign({
        Authorization: `Bearer ${process.env.PFA_MAIL_API_KEY}`,
        'Content-Type': 'application/json'
      }, key ? { 'Idempotency-Key': key } : {}),
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

module.exports = { TEMPLATES, deliver, firstName, formatDate, idempotencyKey, isConfigured, letter, render, shell, siteOf };
