'use strict';

/* GET  /api/admin/mail-check   whether email can leave the site, where the
                                copies of submissions go, and what happened
                                to the last ones sent there
   POST /api/admin/mail-check   sends a test email to that inbox now, and
                                says in plain words what the provider answered

   Owner, 7 Oct 2026: "need the submissions to work perfectly. it should go
   to gandhim email id." Every form already files its record and sends PFA's
   inbox a copy, and a test proves it does. What no test can prove is the live
   mail account: whether its key is set, and whether the provider will send
   from the address the site sends as. A provider that refuses the sender
   refuses every email, and the forms still say "received", because the record
   is real. So this makes it visible, from the panel, without anyone opening
   the provider's dashboard or the server logs, and without showing any key.

   Reading needs the Submissions section; sending a test needs a super
   administrator, and is written to the audit log. */

const { requireAdmin } = require('../../../lib/admin-auth');
const { getDb } = require('../../../lib/firebase');
const mail = require('../../../lib/caregiver-mail');
const FORWARD = require('../../../lib/submission-forward');
const audit = require('../../../lib/admin-audit');
const store = require('../../../lib/caregiver-store');
const SENT = require('../../../lib/sent-copy');

const DEFAULT_FROM = 'People for Animals <cards@peopleforanimalsindia.org>';

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  if (request.body && typeof request.body === 'object') return Promise.resolve(request.body);
  return new Promise((resolve) => {
    let raw = '';
    request.on('data', (c) => { raw += c; if (raw.length > 4096) raw = raw.slice(0, 4096); });
    request.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch (_) { resolve({}); } });
    request.on('error', () => resolve({}));
  });
}

/* Where this copy of the site runs, so every instruction names the place
   the setting actually lives. Until 8 Oct 2026 they all said "In Vercel",
   which on the Firebase deployment sent the reader to the wrong dashboard. */
function host() {
  return process.env.K_SERVICE || process.env.FUNCTION_TARGET ? 'firebase' : 'vercel';
}

function whereSettingsLive() {
  return host() === 'firebase'
    ? 'On the Firebase deployment, set the password with: npx firebase-tools functions:secrets:set PFA_SMTP_PASS, and deploy again (npm run deploy:firebase); PFA_SMTP_USER is info@peopleforanimalsindia.org unless functions/.env names another'
    : 'In Vercel, Settings, Environment Variables, add PFA_SMTP_USER (info@peopleforanimalsindia.org) and PFA_SMTP_PASS (that mailbox\'s password), then redeploy';
}

/* the mailer's own answer: PFA's mailbox by SMTP, or Resend */
function sender() {
  return mail.sender ? mail.sender() : { via: 'resend', from: DEFAULT_FROM, address: 'cards@peopleforanimalsindia.org', domain: 'peopleforanimalsindia.org' };
}

/* What a refusal means, said so that the person reading it knows what to
   change and where. The provider's own words are kept underneath. */
function plainly(error) {
  const raw = String((error && error.message) || error || '');
  const { domain } = sender();
  if ((error && error.code === 'MAIL_NOT_CONFIGURED') || /not configured/i.test(raw)) {
    return `No email is set up on the live site, so none leaves it. ${whereSettingsLive()}.`;
  }
  const code = String((error && (error.code || error.responseCode)) || '');
  if (code === 'EAUTH' || /\b535\b|authentication|invalid login|auth.*fail/i.test(raw)) {
    const where = host() === 'firebase' ? 'on Firebase (npx firebase-tools functions:secrets:set PFA_SMTP_PASS)' : 'in Vercel';
    return `GoDaddy did not accept the mailbox and password. Check PFA_SMTP_USER and PFA_SMTP_PASS ${where}, and in the mailbox's settings (Titan, Settings) turn on third-party email access; with two-step sign-in on, use an app password. Then deploy again.`;
  }
  if (/ECONNECTION|ETIMEDOUT|ESOCKET|ENOTFOUND|EDNS|ECONNREFUSED|ECONNRESET/.test(code)) {
    return 'The site could not reach GoDaddy\'s mail server. It tried smtpout.secureserver.net and smtp.titan.email. Try again in a minute; if it keeps failing, set PFA_SMTP_HOST in Vercel to the server GoDaddy shows for this mailbox.';
  }
  if (/\b55[0-4]\b|sender.*(rejected|denied)|not allowed to send/i.test(raw)) {
    return 'GoDaddy refused to send as this address. The site sends as the mailbox itself (PFA_SMTP_USER); check it is the full address of a working GoDaddy mailbox.';
  }
  if (/domain.{0,40}not.{0,10}verified|verify.{0,20}domain|not a verified domain/i.test(raw)) {
    return `Resend will not send from ${domain || 'that domain'} until the domain is verified in the Resend account. Either add the DNS records Resend lists for ${domain || 'it'}, or set PFA_MAIL_FROM in Vercel to an address on a domain that is verified there, then redeploy.`;
  }
  if (/only send testing emails|testing emails to your own email/i.test(raw)) {
    return 'The Resend account is still in test mode: it sends only to the account owner\'s own address. Verify a sending domain in Resend so it can send to anyone else.';
  }
  if (/\b401\b|api key is invalid|invalid.api.key|missing api key|unauthori[sz]ed/i.test(raw)) {
    return 'Resend does not accept the mail key the site holds. Create a new API key in Resend, paste it into PFA_MAIL_API_KEY in Vercel, and redeploy.';
  }
  if (/\b429\b|rate.?limit/i.test(raw)) {
    return 'Resend is asking the site to slow down. Wait a minute and send the test again.';
  }
  if (/abort|timeout|ENOTFOUND|ECONNRE/i.test(raw)) {
    return 'The mail provider did not answer in time. Try again in a minute.';
  }
  return 'The mail provider refused the email.';
}

const isoOf = (v) => {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate().toISOString();
  if (typeof v.toMillis === 'function') return new Date(v.toMillis()).toISOString();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
};

/* The last copies sent to the inbox, newest first. One equality filter and
   no order on the query, so it needs no composite index; the sort is here. */
async function recentForwards(db) {
  const snap = await db.collection('caregiverEmails').where('template', '==', 'submission_forward').limit(300).get();
  return snap.docs
    .map((doc) => {
      const d = doc.data() || {};
      const status = String(d.status || '');
      return {
        reference: (d.payload && d.payload.reference) || '',
        to: d.to || '',
        status,
        attempts: Number(d.attempts) || 0,
        problem: status === 'sent' ? '' : (d.lastError ? plainly(d.lastError) : ''),
        detail: status === 'sent' ? '' : String(d.lastError || '').slice(0, 300),
        at: isoOf(d.updatedAt) || isoOf(d.createdAt)
      };
    })
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))
    .slice(0, 15);
}

/* Submissions that never had a copy queued for an inbox. A copy is queued
   only when email is set up at the moment the form is sent, so everything
   that arrived while it was not (on Firebase, until 8 Oct 2026, because a
   fresh deploy dropped PFA_SMTP_USER) has no copy anywhere and nothing would
   ever send one. Two unordered single-collection reads, so no index. */
async function missedSubmissions(db, inboxes) {
  if (!inboxes.length) return [];
  const queued = await db.collection('caregiverEmails').where('template', '==', 'submission_forward').limit(2000).get();
  const have = new Set(queued.docs.map((doc) => {
    const d = doc.data() || {};
    return `${(d.payload && d.payload.reference) || ''}|${String(d.to || '').toLowerCase()}`;
  }));
  const subs = await db.collection('submissions').limit(2000).get();
  return subs.docs
    .map((doc) => Object.assign({ reference: doc.id }, doc.data() || {}))
    .filter((d) => d.reference && inboxes.some((to) => !have.has(`${d.reference}|${to}`)))
    .map((d) => ({ reference: d.reference, kindLabel: d.kindLabel || d.kind || '', createdAt: isoOf(d.createdAt) }))
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
}

module.exports = async function handler(request, response) {
  if (request.method !== 'GET' && request.method !== 'POST') {
    response.setHeader('Allow', 'GET, POST');
    return sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED' });
  }
  const who = await requireAdmin(request, response, 'submissions');
  if (!who) return undefined;

  const { from, domain, via } = sender();
  const inboxes = FORWARD.inboxes();
  const configured = mail.isConfigured();

  if (request.method === 'GET') {
    let recent = [];
    let recentError = '';
    try { recent = await recentForwards(getDb()); } catch (error) {
      console.error('mail check: recent forwards not read', error && error.message);
      recentError = 'The list of recent copies could not be read.';
    }
    let missed = [];
    try { missed = await missedSubmissions(getDb(), inboxes); } catch (error) {
      console.error('mail check: missed submissions not read', error && error.message);
    }
    let sentCopies = { on: false, waiting: 0, lastError: '' };
    try { sentCopies = await SENT.status(getDb()); } catch (error) {
      console.error('mail check: sent copies not read', error && error.message);
    }
    return sendJson(response, 200, { ok: true, configured, via, from, fromDomain: domain, inboxes, recent, recentError, missed, sentCopies, host: host(), settingsHelp: whereSettingsLive() });
  }

  if (who.role !== 'super') return sendJson(response, 403, { code: 'SUPER_ONLY', message: 'Only a super administrator can send from here.' });
  const body = await readBody(request);
  if (body && body.action === 'resend') return resend(who, request, response);
  if (body && body.action === 'send-missed') return sendMissed(who, request, response, inboxes);
  if (!inboxes.length) return sendJson(response, 200, { ok: false, configured, from, inboxes, results: [], message: 'Forwarding is switched off (PFA_SUBMISSIONS_INBOX is "off").' });

  const at = new Date().toISOString();
  const results = [];
  for (const to of inboxes) {
    try {
      const sent = await mail.deliver({ to, template: 'inbox_test', payload: { at, from, by: who.email || '', siteUrl: process.env.PUBLIC_SITE_URL || '' } });
      results.push({ to, ok: true, providerId: (sent && sent.providerId) || '' });
    } catch (error) {
      results.push({ to, ok: false, problem: plainly(error), detail: String((error && error.message) || '').slice(0, 300) });
    }
  }
  const ok = results.every((r) => r.ok);
  /* wait for the copy in Sent too, so the answer can say it is there */
  const copies = ok && via === 'smtp' && SENT.enabled() ? await SENT.settle(12000) : null;
  const sentCopy = !copies ? 'off' : (copies.waiting ? 'waiting' : 'saved');
  try {
    await audit.record(who, {
      module: 'submissions', action: 'mail-test', subject: inboxes.join(', '),
      detail: ok ? 'Test email accepted by the mail provider' : `Test email refused: ${results.filter((r) => !r.ok).map((r) => r.detail).join(' | ').slice(0, 200)}`,
      outcome: ok ? 'ok' : 'failed'
    }, request);
  } catch (_) { /* the log is a record of the test, not a condition of it */ }
  return sendJson(response, 200, { ok, configured, from, inboxes, results, sentCopy });
};

/* Sends again, now, every copy to the inbox that has not gone: the ones the
   daily worker is still retrying and the ones it gave up on after six tries.
   For after the mail settings are put right, so a backlog arrives at once
   rather than over the next days, or never. Each result is recorded on the
   queued email exactly as the worker records it. */
async function resend(who, request, response) {
  const db = getDb();
  const snap = await db.collection('caregiverEmails').where('template', '==', 'submission_forward').limit(300).get();
  const waiting = snap.docs.filter((d) => ['retry', 'failed', 'queued'].includes(String((d.data() || {}).status))).slice(0, 40);
  let sent = 0;
  const problems = [];
  for (const doc of waiting) {
    const d = doc.data() || {};
    try {
      const out = await mail.deliver({ to: d.to, template: 'submission_forward', payload: d.payload || {} });
      await store.recordEmailResult({ emailId: doc.id, ok: true, providerId: out && out.providerId });
      sent += 1;
    } catch (error) {
      await store.recordEmailResult({ emailId: doc.id, ok: false, error: (error && error.message) || String(error) }).catch(() => {});
      problems.push({ reference: (d.payload && d.payload.reference) || '', problem: plainly(error), detail: String((error && error.message) || '').slice(0, 300) });
    }
  }
  try {
    await audit.record(who, {
      module: 'submissions', action: 'mail-resend', subject: `${waiting.length} copies`,
      detail: `Sent again to the inbox: ${sent} went, ${problems.length} did not`, outcome: problems.length ? 'failed' : 'ok'
    }, request);
  } catch (_) { /* as above */ }
  await SENT.settle(12000);
  return sendJson(response, 200, { ok: problems.length === 0, tried: waiting.length, sent, problems: problems.slice(0, 5) });
}

/* Makes and sends the copy for every submission that never had one, exactly
   as the form would have at the time: through FORWARD.forward, so it is
   queued (a refusal is then retried like any other), carries the photographs
   and the thread id, and is noted on the submission's conversation. The
   owner presses this; nothing old is sent on its own. */
async function sendMissed(who, request, response, inboxes) {
  if (!mail.isConfigured()) return sendJson(response, 200, { ok: false, tried: 0, sent: 0, problems: [{ problem: plainly({ code: 'MAIL_NOT_CONFIGURED' }) }] });
  const db = getDb();
  const missed = (await missedSubmissions(db, inboxes)).slice(0, 40);
  const siteUrl = String(process.env.PUBLIC_SITE_URL || '').trim();
  let sent = 0;
  const problems = [];
  for (const m of missed) {
    const snap = await db.collection('submissions').doc(m.reference).get();
    if (!snap.exists) continue;
    const record = Object.assign({ reference: m.reference }, snap.data() || {});
    const outcomes = await FORWARD.forward({ record, siteUrl, mail, queue: store, timeoutMs: 9000, db });
    const bad = outcomes.filter((o) => !o || o.state !== 'sent');
    if (!bad.length) { sent += 1; continue; }
    problems.push({
      reference: m.reference,
      problem: bad[0] && bad[0].state === 'queued'
        ? 'It did not go at once. It is in the list below with the reason, and is tried again.'
        : 'It could not be sent.'
    });
  }
  try {
    await audit.record(who, {
      module: 'submissions', action: 'mail-send-missed', subject: `${missed.length} submissions`,
      detail: `Copies made for submissions that never had one: ${sent} went, ${problems.length} did not`, outcome: problems.length ? 'failed' : 'ok'
    }, request);
  } catch (_) { /* the log is a record of the send, not a condition of it */ }
  await SENT.settle(12000);
  return sendJson(response, 200, { ok: problems.length === 0, tried: missed.length, sent, problems: problems.slice(0, 5) });
}

module.exports._private = { plainly, sender, host, missedSubmissions };
