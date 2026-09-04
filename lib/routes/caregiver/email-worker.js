'use strict';

/* Drains the outbound email queue. Point a cron at it (Vercel cron, every few
   minutes). Everything queued is retried here with exponential backoff, so an
   email is never lost because the mail provider was down at the moment an
   application was submitted. */

const CAREGIVER = require('../../../lib/caregiver');
const store = require('../../../lib/caregiver-store');
const mail = require('../../../lib/caregiver-mail');
const documents = require('./documents');
const { getDb } = require('../../../lib/firebase');

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

function authorised(request) {
  const expected = String(process.env.PFA_ADMIN_TOKEN || process.env.CRON_SECRET || '');
  if (!expected) return false;
  const header = String(request.headers.authorization || '');
  const presented = header.startsWith('Bearer ') ? header.slice(7) : '';
  return CAREGIVER.safeEqual(expected, presented);
}

module.exports = async function handler(request, response) {
  if (!authorised(request)) {
    return sendJson(response, 401, { code: 'UNAUTHORISED', message: 'A valid token is required.' });
  }
  /* Unpaid caregiver pictures older than a day go first; this does not need
     mail to be configured, so it runs before that check. */
  const summary = { claimed: 0, sent: 0, retried: 0, failed: 0, sweptDocuments: 0 };
  try { summary.sweptDocuments = await documents.sweep(getDb()); } catch (_) { /* logged inside */ }

  if (!mail.isConfigured()) {
    return sendJson(response, 503, { code: 'MAIL_NOT_CONFIGURED', message: 'PFA_MAIL_API_KEY is not set.', sweptDocuments: summary.sweptDocuments });
  }

  try {
    const batch = await store.claimQueuedEmails(25);
    summary.claimed = batch.length;

    for (const item of batch) {
      try {
        const sent = await mail.deliver({ to: item.to, template: item.template, payload: item.payload });
        await store.recordEmailResult({ emailId: item.emailId, ok: true, providerId: sent.providerId });
        summary.sent += 1;
      } catch (error) {
        /* A permanent 4xx is parked immediately rather than retried six times
           against an address that will never accept it. */
        const attempts = error && error.permanent ? 6 : undefined;
        const result = await store.recordEmailResult({
          emailId: item.emailId,
          ok: false,
          error: `${error && error.message}${attempts ? ' (permanent)' : ''}`
        });
        if (result && result.status === 'failed') summary.failed += 1;
        else summary.retried += 1;
      }
    }

    return sendJson(response, 200, summary);
  } catch (error) {
    console.error('PFA email worker error:', CAREGIVER.clean(error && error.message, 240));
    return sendJson(response, 503, { code: 'WORKER_FAILED', message: 'The queue could not be drained.' });
  }
};
