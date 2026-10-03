'use strict';

/* Every submission, emailed to PFA's inbox, with Reply-To set to the person
   who sent it (owner, 3 Oct 2026).

   The inbox is gandhim@exmpls.sansad.in, a government mailbox: nothing on
   that side can be configured or connected, so this asks nothing of it. The
   site sends an ordinary email to it; the email's Reply-To is the address
   the submitter gave on the form; pressing Reply in any mail app therefore
   writes straight to the submitter, from that mailbox. The site is not in
   the conversation after the first email, and keeps no copy of the reply.

   One forward per submission, whatever made it: the public forms
   (lib/routes/pfa-submissions.js), and the two records a payment opens, a
   membership and a colony caregiver application
   (lib/routes/payment/response.js). Sent through the same outbound queue as
   the confirmations, so a mail provider that is slow or down delays the
   forward and never fails the form; a retried send carries the same
   idempotency key, so the inbox gets it once.

   PFA_SUBMISSIONS_INBOX overrides the inbox, and may name several addresses
   separated by commas. Set it to "off" to stop forwarding. */

const CONFIRM = require('./confirmations');

const DEFAULT_INBOX = 'gandhim@exmpls.sansad.in';
const EMAIL = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]{2,}$/;

function inboxes() {
  const raw = String(process.env.PFA_SUBMISSIONS_INBOX == null ? DEFAULT_INBOX : process.env.PFA_SUBMISSIONS_INBOX).trim();
  if (!raw || /^off$/i.test(raw)) return [];
  return [...new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter((s) => EMAIL.test(s)))];
}

/* "animalType" and "animal_type" both read "Animal type". */
function labelFor(key) {
  const words = String(key).replace(/[_-]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim().toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : String(key);
}

/* The fields as label/value rows, in the order the form sent them, without
   the ones the email already shows at the top, and without empty ones. */
function rowsOf(fields, skip) {
  const out = [];
  for (const [key, value] of Object.entries(fields || {})) {
    if (skip.has(key)) continue;
    const text = Array.isArray(value) ? value.filter(Boolean).join(', ') : (value && typeof value === 'object' ? JSON.stringify(value) : String(value == null ? '' : value));
    if (!text.trim()) continue;
    out.push({ label: labelFor(key), value: text.slice(0, 4000) });
  }
  return out;
}

function firstOf(fields, pattern) {
  for (const [key, value] of Object.entries(fields || {})) {
    if (pattern.test(key) && typeof value === 'string' && value.trim()) return { key, value: value.trim() };
  }
  return null;
}

/* What the email carries, from a stored submission record. */
function payloadFor(record, siteUrl) {
  const fields = record.fields || {};
  const email = firstOf(fields, /^(e-?mail|email ?address|contactEmail)$/i) || firstOf(fields, /mail/i);
  const name = firstOf(fields, /^(name|full ?name|your ?name|applicantName|contactName)$/i);
  const mobile = firstOf(fields, /^(mobile|phone|whatsapp|telephone|contact ?number)$/i);
  const skip = new Set([email && email.key, name && name.key, mobile && mobile.key].filter(Boolean));
  const site = String(siteUrl || '').replace(/\/+$/, '');
  const replyTo = email && EMAIL.test(email.value.toLowerCase()) ? email.value.toLowerCase() : '';
  return {
    reference: record.reference,
    kind: record.kind,
    kindLabel: record.kindLabel || record.kind,
    receivedAt: record.createdAt,
    name: name ? name.value : '',
    email: replyTo,
    mobile: mobile ? mobile.value : '',
    rows: rowsOf(fields, skip),
    attachments: Number(record.attachments) || (Array.isArray(record.attachments) ? record.attachments.length : 0),
    page: record.page || '',
    adminUrl: site ? `${site}/admin.html` : '',
    siteUrl: site,
    replyTo
  };
}

/* Sends the forward to every inbox. Never throws: the submission is already
   on record, and a forward that cannot go must not undo that. Resolves to
   the outcome per inbox. */
async function forward({ record, siteUrl, mail, queue, timeoutMs }) {
  const to = inboxes();
  if (!to.length || !record || !record.reference) return [];
  const payload = payloadFor(record, siteUrl);
  return Promise.all(to.map((address) => CONFIRM.send({
    to: address,
    template: 'submission_forward',
    payload,
    dedupeKey: `submission_forward:${record.reference}:${address}`,
    mail,
    queue,
    timeoutMs
  }).catch((error) => {
    console.warn('submission forward not sent', { reference: record.reference, message: error && error.message });
    return { state: 'unsent', to: address };
  })));
}

module.exports = { DEFAULT_INBOX, inboxes, labelFor, payloadFor, forward };
