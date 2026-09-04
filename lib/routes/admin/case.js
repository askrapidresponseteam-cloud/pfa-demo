/* GET  /api/admin/case?reference=PFA-C-2026-00042
   POST /api/admin/case  { reference, action: 'reply' | 'note' | 'assign' | 'status', ... }

   One submission, in full, and everything that can be done to it. The
   register lists; this is where a case is worked.

   - reply   { text }          emails the sender; recorded; a new case moves to in-progress
   - note    { text }          internal, never sent
   - assign  { to }            a staff email, or '' to clear
   - status  { status, note? } new | in-progress | handled | spam

   Every action lands in the case's conversation with who did it and when.
   Nothing here deletes; a case can be closed or reopened, never erased. */

'use strict';

const firebase = require('../../firebase');
const mail = require('../../caregiver-mail');
const adminAuth = require('../../admin-auth');
const S = require('../../submissions');
const audit = require('../../admin-audit');
const CAREGIVER = require('../../caregiver');
const caregiverStore = require('../../caregiver-store');

const STATUSES = new Set(['new', 'in-progress', 'handled', 'spam']);
const STATUS_LABELS = { new: 'Waiting', 'in-progress': 'In progress', handled: 'Handled', spam: 'Spam' };
const MAX_TEXT = 4000;
const MAX_MESSAGES = 200;

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  if (request.body && typeof request.body === 'object') return Promise.resolve(request.body);
  return new Promise((resolve) => {
    let raw = typeof request.body === 'string' ? request.body : '';
    if (raw) { try { return resolve(JSON.parse(raw)); } catch (_) { return resolve({}); } }
    request.on('data', (chunk) => { raw += chunk; if (raw.length > 64000) raw = raw.slice(0, 64000); });
    request.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (_) { resolve({}); } });
    request.on('error', () => resolve({}));
  });
}

function clean(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

function siteUrl(request) {
  const configured = clean(process.env.PUBLIC_SITE_URL, 300);
  try { const u = new URL(configured); if (/^https?:$/.test(u.protocol)) return u.origin; } catch (_) { /* fall through */ }
  const host = (request.headers || {})['x-forwarded-host'] || (request.headers || {}).host || 'pfa-full-website.vercel.app';
  return `https://${host}`;
}

function whoLabel(who) {
  return (who && (who.email || who.name || who.uid)) || 'staff';
}

function caseView(reference, data, messages) {
  const contact = S.contactOf(data.fields);
  return {
    reference,
    kind: data.kind || '',
    cardId: data.cardId || '',
    handledAt: data.handledAt || null,
    kindLabel: data.kindLabel || S.KIND_LABELS[data.kind] || 'Submission',
    status: STATUSES.has(data.status) ? data.status : 'new',
    statusLabel: STATUS_LABELS[STATUSES.has(data.status) ? data.status : 'new'],
    createdAt: data.createdAt || null,
    receivedAtMs: Number(data.receivedAtMs) || 0,
    page: data.page || '',
    fields: data.fields || {},
    attachments: Number(data.attachments) || 0,
    contact,
    assignedTo: data.assignedTo || null,
    handledBy: data.handledBy || '',
    replyCount: Number(data.replyCount) || 0,
    noteCount: Number(data.noteCount) || 0,
    lastReplyAt: data.lastReplyAt || null,
    history: Array.isArray(data.history) ? data.history : [{ status: 'new', at: data.createdAt || null }],
    messages
  };
}

function createHandler(deps) {
  const { getDb, fieldValue, deliver, isConfigured, now } = deps;
  const issueCard = deps.issueCard || caregiverStore.issueCard;
  const queueEmail = deps.queueEmail || caregiverStore.queueEmail;
  const recordEmailResult = deps.recordEmailResult || caregiverStore.recordEmailResult;
  const requireAdmin = deps.requireAdmin || adminAuth.requireAdmin;

  async function loadCase(db, reference) {
    const ref = db.collection('submissions').doc(reference);
    const snapshot = await ref.get();
    if (!snapshot.exists) return null;
    const msgSnap = await ref.collection('messages').orderBy('at').limit(MAX_MESSAGES).get();
    const messages = msgSnap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
    return { ref, data: snapshot.data(), messages };
  }

  async function addMessage(ref, message) {
    await ref.collection('messages').doc(message.id).create(message);
  }

  return async function handler(request, response) {
    const who = await requireAdmin(request, response, 'submissions');
    if (!who) return;
    const nowMs = now();
    const at = new Date(nowMs).toISOString();
    const by = whoLabel(who);

    try {
      const db = getDb();

      if (request.method === 'GET') {
        const reference = clean((request.query || {}).reference, 40).toUpperCase().replace(/\s+/g, '');
        if (!S.isReference(reference)) return sendJson(response, 400, { code: 'BAD_REFERENCE', message: 'That is not a reference.' });
        const found = await loadCase(db, reference);
        if (!found) return sendJson(response, 404, { code: 'NOT_FOUND', message: 'No submission carries that reference.' });
        return sendJson(response, 200, { ok: true, case: caseView(reference, found.data, found.messages), mailConfigured: isConfigured() });
      }

      if (request.method !== 'POST') {
        response.setHeader('Allow', 'GET, POST');
        return sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED' });
      }

      const body = await readBody(request);
      const reference = clean(body.reference, 40).toUpperCase().replace(/\s+/g, '');
      const action = clean(body.action, 20);
      if (!S.isReference(reference)) return sendJson(response, 400, { code: 'BAD_REFERENCE', message: 'That is not a reference.' });
      const found = await loadCase(db, reference);
      if (!found) return sendJson(response, 404, { code: 'NOT_FOUND', message: 'No submission carries that reference.' });
      const { ref, data } = found;
      const current = STATUSES.has(data.status) ? data.status : 'new';
      const id = `${nowMs}-${Math.random().toString(36).slice(2, 8)}`;

      if (action === 'note') {
        const text = clean(body.text, MAX_TEXT);
        if (!text) return sendJson(response, 400, { code: 'EMPTY', message: 'Write the note first.' });
        await addMessage(ref, { id, type: 'note', text, by, at });
        await ref.set({ noteCount: fieldValue().increment(1), updatedAt: at }, { merge: true });
        audit.record(who, { module: 'submissions', action: 'note', subject: reference, detail: `Internal note on ${reference}` }, request);
        return sendJson(response, 200, { ok: true, action, at, by });
      }

      if (action === 'assign') {
        const to = clean(body.to, 254).toLowerCase();
        if (to && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) return sendJson(response, 400, { code: 'BAD_ASSIGNEE', message: 'Assign to a staff email address.' });
        const assignedTo = to ? { email: to, at, by } : null;
        await ref.set({ assignedTo, history: fieldValue().arrayUnion({ status: current, event: 'assign', to, at, by }), updatedAt: at }, { merge: true });
        audit.record(who, { module: 'submissions', action: 'assign', subject: reference, detail: to ? `Assigned to ${to}` : 'Assignment cleared' }, request);
        return sendJson(response, 200, { ok: true, action, assignedTo });
      }

      if (action === 'status') {
        const status = clean(body.status, 20);
        if (!STATUSES.has(status)) return sendJson(response, 400, { code: 'BAD_STATUS', message: 'Status must be new, in-progress, handled or spam.' });
        const note = clean(body.note, MAX_TEXT);
        await ref.set({
          status, handledBy: by, handledAt: at, handledNote: note,
          history: fieldValue().arrayUnion({ status, at, by }), updatedAt: at
        }, { merge: true });
        if (note) await addMessage(ref, { id, type: 'note', text: note, by, at, status });
        audit.record(who, { module: 'submissions', action: 'status', subject: reference, detail: `${current} to ${status}` }, request);
        return sendJson(response, 200, { ok: true, action, status, statusLabel: STATUS_LABELS[status], at, by });
      }

      if (action === 'reply') {
        const text = clean(body.text, MAX_TEXT);
        if (!text) return sendJson(response, 400, { code: 'EMPTY', message: 'Write the reply first.' });
        const contact = S.contactOf(data.fields);
        if (!contact.email) return sendJson(response, 409, { code: 'NO_EMAIL', message: contact.mobile ? `No email was given. Call ${contact.mobile} and add a note of what was said.` : 'No email or mobile was given with this submission.' });
        if (!isConfigured()) return sendJson(response, 503, { code: 'MAIL_NOT_CONFIGURED', message: 'Email is not set up on the server (PFA_MAIL_API_KEY), so replies cannot be sent yet.' });

        /* A reply means somebody is on it. */
        const nextStatus = current === 'new' ? 'in-progress' : current;
        const payload = {
          name: contact.name, reference, kindLabel: data.kindLabel || S.KIND_LABELS[data.kind], text,
          signoff: `${who.name || (who.email ? who.email.split('@')[0].replace(/[._-]+/g, ' ') : 'People for Animals')}, People for Animals`,
          followUrl: `${siteUrl(request)}/track.html#ref=${encodeURIComponent(reference)}`,
          replyHint: process.env.PFA_MAIL_REPLY_TO ? 'You can reply to this email and it will reach PFA.' : 'Reply through the site using your reference number.'
        };
        let delivered = true, error = '';
        try {
          await deliver({ to: contact.email, template: 'submission_reply', payload });
        } catch (e) {
          delivered = false; error = clean(e && e.message, 200);
        }
        await addMessage(ref, { id, type: 'reply', to: contact.email, text, by, at, delivered, error });
        if (delivered) {
          /* Taken up first, then the reply, so the story reads in order. */
          if (nextStatus !== current) {
            await ref.set({ status: nextStatus, handledBy: by, handledAt: at, history: fieldValue().arrayUnion({ status: nextStatus, at, by }) }, { merge: true });
          }
          await ref.set({
            replyCount: fieldValue().increment(1), lastReplyAt: at, updatedAt: at,
            history: fieldValue().arrayUnion({ status: nextStatus, event: 'reply', at, by })
          }, { merge: true });
        } else {
          await ref.set({ updatedAt: at }, { merge: true });
        }
        audit.record(who, {
          module: 'submissions', action: 'reply', subject: reference,
          detail: delivered ? `Replied by email to ${contact.email}` : `Reply to ${contact.email} was not delivered`,
          outcome: delivered ? 'done' : 'refused'
        }, request);
        return sendJson(response, delivered ? 200 : 502, {
          ok: delivered, action, delivered, to: contact.email, at, by, status: delivered ? nextStatus : current,
          message: delivered ? '' : `The email was not delivered: ${error || 'the mail provider refused it'}. The reply is kept on the case; try again or call them.`
        });
      }

      /* Approve a paid colony caregiver application: the card is issued on
         the register from what the applicant sent, the application records
         the card number and closes, and the holder is emailed. The card then
         shows on Issue cards for printing. What the reviewer approved is the
         card they previewed: the same fields, drawn by the same renderer. */
      if (action === 'approve') {
        if (data.kind !== 'PFA-CG') return sendJson(response, 400, { code: 'NOT_AN_APPLICATION', message: 'Only a colony caregiver application can be approved into a card.' });
        if (data.cardId) return sendJson(response, 409, { code: 'ALREADY_ISSUED', message: `A card was already issued for this application: ${data.cardId}.` });
        if (current === 'spam') return sendJson(response, 409, { code: 'SPAM', message: 'This application is marked spam. Move it back first.' });
        const f = data.fields || {};
        const name = clean(f.name, 60);
        const mobile = CAREGIVER.normaliseMobile(clean(f.mobile, 20));
        const addressLine = [clean(f.address, 200), clean(f.city, 80)].filter(Boolean).join(', ');
        const pin = CAREGIVER.extractPin(addressLine) || CAREGIVER.extractPin(clean(f.pin, 10)) || '';
        if (!name || !mobile) return sendJson(response, 422, { code: 'INCOMPLETE', message: 'The application has no usable name or mobile. Ask the applicant for them first.' });
        const application = { name, mobile, email: clean(f.email, 254).toLowerCase(), address: addressLine, pin };
        const result = await issueCard({ application, idempotencyKey: `application:${reference}`, requestMeta: { ip: '' } });
        const card = result.card;
        if (result.reissued && !result.sameRequest) {
          return sendJson(response, 409, { code: 'MOBILE_HELD', cardId: card.cardId,
            message: `This mobile number already holds card ${card.cardId} (${card.name}). Reply to the applicant rather than issuing a second card.` });
        }
        /* Point the card back at the application so the panel can print it
           with the photograph the applicant sent. */
        await db.collection('caretakerCards').doc(card.cardId).set({ applicationRef: reference, approvedBy: by, approvedAt: at }, { merge: true });
        await addMessage(ref, { id, type: 'note', text: `Approved. Card ${card.cardId} issued.`, by, at, status: 'handled' });
        await ref.set({
          cardId: card.cardId, status: 'handled', handledBy: by, handledAt: at, updatedAt: at,
          history: fieldValue().arrayUnion({ status: 'handled', at, by })
        }, { merge: true });
        /* Queued first, so it survives a mail outage and the worker will send
           it; then sent now, because "the holder emailed" has to be true when
           the panel says it. It used to be queued only, which meant the card
           email waited for the daily worker - up to a day - while the note on
           the case said it had gone. */
        let emailed = false;
        if (application.email) {
          const cardUrl = `${siteUrl(request)}/caregiver-card.html?id=${encodeURIComponent(card.cardId)}`;
          const payload = { name: card.name, cardId: card.cardId, issuedAt: card.issuedAt, validUntil: card.validUntil, cardUrl };
          try {
            const queued = await queueEmail({ template: 'card_issued', to: application.email, dedupeKey: `card_issued:${card.cardId}`, payload });
            if (queued.created && isConfigured()) {
              try {
                const sent = await deliver({ to: application.email, template: 'card_issued', payload });
                await recordEmailResult({ emailId: queued.emailId, ok: true, providerId: sent && sent.providerId });
                emailed = true;
              } catch (mailError) {
                await recordEmailResult({ emailId: queued.emailId, ok: false, error: mailError && mailError.message });
                console.error('approve: card email not sent now; the worker will retry it', mailError && mailError.message);
              }
            } else if (!queued.created) {
              emailed = true;      /* sent on an earlier approve of the same card */
            }
          } catch (e) { console.error('approve: card email not queued', e && e.message); }
        }
        audit.record(who, { module: 'submissions', action: 'approve', subject: reference, detail: `Card ${card.cardId} issued from the application` }, request);
        return sendJson(response, 200, { ok: true, action, cardId: card.cardId, status: 'handled', emailed, softDuplicateOf: result.softDuplicateOf || null });
      }

      return sendJson(response, 400, { code: 'BAD_ACTION', message: 'action must be reply, note, assign, status or approve.' });
    } catch (error) {
      console.error('admin case failed', error && error.message);
      return sendJson(response, 500, { code: 'SERVER_ERROR', message: 'That could not be done right now.' });
    }
  };
}

module.exports = createHandler({
  getDb: firebase.getDb,
  fieldValue: firebase.fieldValue,
  deliver: mail.deliver,
  isConfigured: mail.isConfigured,
  now: () => Date.now()
});
module.exports._private = { createHandler, caseView, STATUS_LABELS };
