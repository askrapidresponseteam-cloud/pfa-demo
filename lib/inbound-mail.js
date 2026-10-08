'use strict';

/* Replies, read from PFA's mailbox and filed on the submission they answer.

   The copy of every submission goes to PFA's inbox with Reply-To naming the
   sender and, after it, the site's own mailbox (lib/caregiver-mail.js,
   captureAddress). A Reply from the inbox therefore goes to the sender, as
   it always did, and a copy arrives here. This module reads that mailbox
   over IMAP (GoDaddy's Titan mail offers it on every mailbox; nothing to
   buy or switch on), or takes the same message from a webhook, and files
   each one on the record it belongs to.

   Which record. Every email the site sends carries a Message-ID that names
   the submission and its thread (lib/mail-thread.js). A reply keeps that id
   in In-Reply-To and References, so the reference is read from the header
   and the threadId checked against the record: no guessing from names,
   addresses or subject lines. Mail that arrives with no threading headers
   at all is matched only by a reference quoted in its subject AND a sender
   already on the conversation, and the record says it was matched that way.

   What is filed. One message document under submissions/{reference}/messages,
   keyed by the email's own Message-ID, so the same email read twice is one
   message; its attachments beside the submission's photographs; and the
   record moved along: replyCount, lastReplyAt, a line in history, and a new
   case taken up when PFA's inbox answers it.

   Which way. A message from PFA's inbox is Madam's reply: the person already
   has it, so it is filed and nothing else. A message from the person
   (answering their confirmation, or Reply-all to Madam) is filed and
   relayed to PFA's inbox under the same conversation, Reply-To the person,
   so the inbox sees both sides and can answer with one click again. */

const crypto = require('crypto');
const S = require('./submissions');
const MT = require('./mail-thread');
const ORDER = require('./message-order');
const FORWARD = require('./submission-forward');
const CONFIRM = require('./confirmations');
const IMAP = require('./imap-open');

const MAX_TEXT = 20000;
const MAX_ATTACHMENT_BYTES = 950 * 1024;   // one Firestore document each
const MAX_ATTACHMENTS = 6;
const STATE_DOC = 'inboundMail';
const EMAIL = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]{2,}$/;

/* ---- what a message looks like once read ----------------------------- */

function address(value) {
  if (!value) return { address: '', name: '' };
  if (typeof value === 'string') {
    const m = /^(.*?)<([^>]+)>\s*$/.exec(value.trim());
    const a = (m ? m[2] : value).trim().toLowerCase();
    return { address: EMAIL.test(a) ? a : '', name: m ? m[1].trim().replace(/^"|"$/g, '') : '' };
  }
  if (Array.isArray(value)) return address(value[0]);
  if (value.value && Array.isArray(value.value)) return address(value.value[0]);
  const a = String(value.address || '').trim().toLowerCase();
  return { address: EMAIL.test(a) ? a : '', name: String(value.name || '').trim() };
}

function addresses(value) {
  if (!value) return [];
  if (typeof value === 'string') return value.split(',').map((v) => address(v).address).filter(Boolean);
  if (Array.isArray(value)) return value.map((v) => address(v).address).filter(Boolean);
  if (value.value && Array.isArray(value.value)) return value.value.map((v) => address(v).address).filter(Boolean);
  return [address(value).address].filter(Boolean);
}

/* The reply itself, without the quoted copy of what it answers. Gmail,
   Outlook and Apple Mail each mark the quote their own way; the first
   marker found ends the new text. The full text is kept as well. */
const QUOTE_MARKERS = [
  /^On .{0,200}wrote:\s*$/m,
  /^-{2,}\s*Original Message\s*-{2,}\s*$/mi,
  /^From:\s.+$/m,
  /^_{10,}\s*$/m,
  /^>\s?/m
];

function newText(text) {
  const t = String(text || '').replace(/\r\n/g, '\n');
  let cut = t.length;
  for (const marker of QUOTE_MARKERS) {
    const m = marker.exec(t);
    if (m && m.index < cut && m.index > 0) cut = m.index;
  }
  return t.slice(0, cut).trim();
}

/* One shape, whichever way the message arrived: mailparser's parsed mail
   (from IMAP) or a webhook's JSON. */
function normalise(raw) {
  const m = raw || {};
  const headers = m.headers && typeof m.headers.get === 'function' ? m.headers : null;
  const header = (name) => (headers ? headers.get(name) : undefined);
  const messageId = String(m.messageId || header('message-id') || '').trim();
  const inReplyTo = MT.idsIn(m.inReplyTo || header('in-reply-to') || '');
  const references = MT.idsIn(m.references || header('references') || '');
  const from = address(m.from);
  const date = m.date ? new Date(m.date) : new Date();
  const text = String(m.text || (typeof m.html === 'string' ? m.html.replace(/<[^>]+>/g, ' ') : '') || '').replace(/\u0000/g, '').slice(0, MAX_TEXT);
  const attachments = (Array.isArray(m.attachments) ? m.attachments : []).map((a) => {
    const bytes = Buffer.isBuffer(a.content) ? a.content : (typeof a.content === 'string' ? Buffer.from(a.content, 'base64') : Buffer.alloc(0));
    return { filename: String(a.filename || 'attachment').slice(0, 120), contentType: String(a.contentType || 'application/octet-stream').slice(0, 80), bytes };
  }).filter((a) => a.bytes.length > 0);
  return {
    messageId,
    inReplyTo,
    references,
    from: from.address,
    fromName: from.name,
    to: addresses(m.to),
    cc: addresses(m.cc),
    subject: String(m.subject || '').slice(0, 500),
    date: isNaN(date.getTime()) ? new Date() : date,
    text,
    newText: newText(text),
    attachments
  };
}

/* ---- which record --------------------------------------------------- */

function sameAddress(a, b) {
  return Boolean(a) && Boolean(b) && String(a).toLowerCase() === String(b).toLowerCase();
}

/* The record a message belongs to, or null. */
async function matchThread(db, msg, inboxes) {
  const own = MT.ours({ inReplyTo: msg.inReplyTo, references: msg.references });
  if (own) {
    const snap = await db.collection('submissions').doc(own.reference).get();
    if (snap.exists) {
      const data = snap.data() || {};
      if (data.threadId === own.threadId) return { reference: own.reference, data, how: 'headers', answers: own.part };
      /* a right reference under a wrong thread id is not a match: an id
         someone made up, or a record re-filed under the same number */
      console.warn('inbound mail names a thread the record does not carry', { reference: own.reference });
    }
    return null;
  }
  /* No threading headers at all. A reference in the subject, from an
     address already on the conversation, is accepted and marked as such. */
  if (msg.inReplyTo.length || msg.references.length) return null;
  const reference = MT.referenceIn(msg.subject);
  if (!reference) return null;
  const snap = await db.collection('submissions').doc(reference).get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  const contact = S.contactOf(data.fields);
  const known = sameAddress(contact.email, msg.from) || (inboxes || []).some((i) => sameAddress(i, msg.from));
  return known ? { reference, data, how: 'subject', answers: '' } : null;
}

/* Who wrote: PFA's inbox (Madam), the person who sent the submission, or
   somebody else altogether. */
function partyOf(msg, data, inboxes) {
  if ((inboxes || []).some((i) => sameAddress(i, msg.from))) return 'staff';
  const contact = S.contactOf(data.fields);
  if (sameAddress(contact.email, msg.from)) return 'sender';
  return 'other';
}

function messageDocId(msg) {
  const key = msg.messageId || `${msg.from}|${msg.date.toISOString()}|${msg.subject}`;
  return `in-${crypto.createHash('sha256').update(key, 'utf8').digest('hex').slice(0, 24)}`;
}

/* ---- filing ---------------------------------------------------------- */

/* Files one message. Returns what happened:
     { filed: true, reference, party, relayed }
     { filed: false, reason: 'NO_THREAD' | 'DUPLICATE' } */
async function file(db, raw, options) {
  const o = options || {};
  const inboxes = o.inboxes || FORWARD.inboxes();
  const now = o.now ? o.now() : Date.now();
  const msg = raw && raw.newText !== undefined && raw.date instanceof Date ? raw : normalise(raw);
  if (!msg.from) return { filed: false, reason: 'NO_SENDER' };
  const found = await matchThread(db, msg, inboxes);
  if (!found) return { filed: false, reason: 'NO_THREAD', messageId: msg.messageId };

  const { reference, data } = found;
  const party = partyOf(msg, data, inboxes);
  const ref = db.collection('submissions').doc(reference);
  const id = messageDocId(msg);
  const at = msg.date.toISOString();
  const recordedAt = new Date(now).toISOString();

  /* attachments first, so the message that names them is written complete */
  const kept = [];
  for (const [i, a] of msg.attachments.slice(0, MAX_ATTACHMENTS).entries()) {
    if (a.bytes.length > MAX_ATTACHMENT_BYTES) { kept.push({ n: i + 1, filename: a.filename, contentType: a.contentType, size: a.bytes.length, stored: false }); continue; }
    const attachmentId = `${id}-${i + 1}`;
    try {
      await ref.collection('attachments').doc(attachmentId).create({
        contentType: a.contentType, size: a.bytes.length, bytes: a.bytes, label: a.filename, messageId: id, createdAt: recordedAt
      });
    } catch (error) {
      if (!(error && (error.code === 6 || /already exists/i.test(String(error.message))))) throw error;
    }
    kept.push({ n: i + 1, id: attachmentId, filename: a.filename, contentType: a.contentType, size: a.bytes.length, stored: true });
  }

  const message = {
    id,
    type: 'reply',
    direction: 'in',
    party,
    from: msg.from,
    fromName: msg.fromName,
    to: msg.to,
    cc: msg.cc,
    subject: msg.subject,
    text: msg.newText || msg.text,
    fullText: msg.text,
    at,
    recordedAt,
    messageId: msg.messageId,
    inReplyTo: msg.inReplyTo,
    references: msg.references,
    matchedBy: found.how,
    attachments: kept.length,
    files: kept,
    by: msg.fromName ? `${msg.fromName} <${msg.from}>` : msg.from
  };
  try {
    await ref.collection('messages').doc(id).create(Object.assign({ seq: ORDER.nextSeq() }, message));
  } catch (error) {
    if (error && (error.code === 6 || /already exists/i.test(String(error.message)))) return { filed: false, reason: 'DUPLICATE', reference, messageId: msg.messageId };
    throw error;
  }

  /* The record moves along. update(), never a merge, and never the fields. */
  const current = ['new', 'in-progress', 'handled', 'spam'].includes(data.status) || S.isStage(data.kind, data.status) ? data.status : 'new';
  const taken = party === 'staff' && (current === 'new' || !current);
  const fv = o.fieldValue || require('./firebase').fieldValue;
  const update = {
    replyCount: fv().increment(1),
    lastReplyAt: recordedAt,
    updatedAt: recordedAt,
    history: fv().arrayUnion({ status: taken ? 'in-progress' : current, event: 'reply', direction: 'in', party, at: recordedAt, by: msg.from })
  };
  if (taken) { update.status = 'in-progress'; update.handledBy = msg.from; update.handledAt = recordedAt; }
  await ref.update(update);

  /* The person wrote to PFA: the inbox gets it, in the same conversation,
     Reply-To the person, so a one-click Reply answers them. Madam's own
     replies are not sent back to her. */
  let relayed = [];
  if (party === 'sender' && o.mail && inboxes.length) {
    const contact = S.contactOf(data.fields);
    const site = String(o.siteUrl || process.env.PUBLIC_SITE_URL || '').replace(/\/+$/, '');
    const n = (Number(data.replyCount) || 0) + 1;
    const payload = {
      reference, threadId: data.threadId || '', kindLabel: data.kindLabel || S.KIND_LABELS[data.kind] || 'Submission',
      name: contact.name || msg.fromName, email: msg.from, text: msg.newText || msg.text, subject: msg.subject,
      receivedAt: at, n, inboundId: id, attachments: kept.length, siteUrl: site, adminUrl: site ? `${site}/admin.html` : '',
      references: msg.references
    };
    relayed = await Promise.all(inboxes.map((to) => CONFIRM.send({
      to, template: 'submission_followup', payload, dedupeKey: `submission_followup:${reference}:${id}:${to}`,
      mail: o.mail, queue: o.queue || null, timeoutMs: o.timeoutMs || 9000
    }).catch((error) => { console.warn('follow-up not relayed', { reference, message: error && error.message }); return { state: 'unsent', to }; })));
    const relayId = `${id}-relay`;
    try {
      await ref.collection('messages').doc(relayId).create({
        id: relayId, seq: ORDER.nextSeq(), type: 'email', direction: 'out', party: 'site', to: inboxes.join(', '), from: o.mail.sender ? o.mail.sender().address : '',
        subject: `Re: ${reference}: ${payload.kindLabel} from ${payload.name || msg.from}`,
        text: 'Their message relayed to PFA\'s inbox.', state: relayed.every((r) => r.state === 'sent') ? 'sent' : (relayed[0] && relayed[0].state) || 'unsent',
        messageId: (o.mail.threadHeaders ? o.mail.threadHeaders(payload, `relay.${n}`, 'forward').messageId : ''), at: recordedAt
      });
    } catch (_) { /* the relay went or is queued; the note is a courtesy */ }
  }

  return { filed: true, reference, party, how: found.how, attachments: kept.length, relayed: relayed.map((r) => r.state) };
}

/* ---- the mailbox ----------------------------------------------------- */

/* Which server and which login: lib/imap-open.js, shared with the Sent
   folder copies. GoDaddy's imap.secureserver.net first (8 Oct 2026). */
function imapConfigured() { return IMAP.configured(); }
function imapHosts() { return IMAP.hosts(); }

let makeClient = (options) => {
  const { ImapFlow } = require('imapflow');
  return new ImapFlow(options);
};
let parseSource = (source) => require('mailparser').simpleParser(source);

/* Reads what has arrived since the last run: new UIDs in INBOX, at most
   `limit` of them. The first run looks back `firstRunDays`. Returns the
   messages, parsed, and the highest UID seen, which the caller keeps. */
async function readMailbox({ lastUid, uidValidity, limit, firstRunDays }) {
  /* tries each server; throws with what each said */
  const { client, host } = await IMAP.open(makeClient).catch((error) => {
    error.message = `Mailbox could not be read. ${error.message}`.slice(0, 400);
    throw error;
  });
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const box = client.mailbox || {};
      const validity = box.uidValidity != null ? String(box.uidValidity) : '';
      /* a mailbox rebuilt by the provider renumbers everything; start over,
         and the per-message ids keep anything already filed from doubling */
      const since = uidValidity && validity && uidValidity !== validity ? 0 : Number(lastUid) || 0;
      let uids;
      if (since > 0) {
        uids = (await client.search({ uid: `${since + 1}:*` }, { uid: true }) || []).filter((u) => u > since);
      } else {
        const from = new Date(Date.now() - (Number(firstRunDays) || 14) * 86400000);
        uids = await client.search({ since: from }, { uid: true }) || [];
      }
      uids = uids.sort((a, b) => a - b).slice(0, limit || 40);
      const messages = [];
      let highest = since;
      for (const uid of uids) {
        const fetched = await client.fetchOne(String(uid), { source: true, uid: true }, { uid: true });
        if (!fetched || !fetched.source) continue;
        const parsed = await parseSource(fetched.source);
        messages.push(Object.assign(normalise(parsed), { uid }));
        if (uid > highest) highest = uid;
      }
      return { messages, lastUid: highest, uidValidity: validity, host };
    } finally {
      lock.release();
    }
  } catch (error) {
    /* Opened, then refused: that is this mailbox's answer, reported as it is. */
    const wrapped = new Error(`Mailbox could not be read: ${host} answered ${IMAP.said(error)}`.slice(0, 400));
    wrapped.code = (error && error.code) || 'IMAP_FAILED';
    wrapped.authentication = false;
    throw wrapped;
  } finally {
    try { await client.logout(); } catch (_) { /* already gone */ }
  }
}

/* One run: read the mailbox, file what belongs to a record, remember where
   the reading got to. Never throws for a message that cannot be filed; a
   mailbox that cannot be reached is reported, not hidden. */
async function check(db, options) {
  const o = options || {};
  const stateRef = db.collection('counters').doc(STATE_DOC);
  const snap = await stateRef.get();
  const state = snap.exists ? snap.data() || {} : {};
  const summary = { fetched: 0, filed: 0, duplicates: 0, unmatched: 0, relayed: 0, problems: [], lastUid: Number(state.lastUid) || 0 };
  const read = o.read || readMailbox;
  let box;
  try {
    box = await read({ lastUid: state.lastUid, uidValidity: state.uidValidity, limit: o.limit, firstRunDays: o.firstRunDays });
  } catch (error) {
    summary.error = String(error && error.message || error);
    summary.authentication = Boolean(error && error.authentication);
    await stateRef.set(Object.assign({}, state, { lastRunAt: new Date().toISOString(), lastError: summary.error }));
    return summary;
  }
  summary.fetched = box.messages.length;
  for (const msg of box.messages) {
    try {
      const out = await file(db, msg, o);
      if (out.filed) { summary.filed += 1; if ((out.relayed || []).length) summary.relayed += 1; }
      else if (out.reason === 'DUPLICATE') summary.duplicates += 1;
      else summary.unmatched += 1;
    } catch (error) {
      summary.problems.push({ messageId: msg.messageId, message: String(error && error.message).slice(0, 200) });
    }
  }
  summary.lastUid = box.lastUid;
  await stateRef.set(Object.assign({}, state, {
    lastUid: box.lastUid, uidValidity: box.uidValidity || '', host: box.host || '',
    lastRunAt: new Date().toISOString(), lastError: '', lastResult: { fetched: summary.fetched, filed: summary.filed, unmatched: summary.unmatched, duplicates: summary.duplicates }
  }));
  return summary;
}

async function status(db) {
  const snap = await db.collection('counters').doc(STATE_DOC).get();
  const s = snap.exists ? snap.data() || {} : {};
  return {
    configured: imapConfigured(),
    mailbox: String(process.env.PFA_IMAP_USER || process.env.PFA_SMTP_USER || '').trim().toLowerCase(),
    captureOff: /^off$/i.test(String(process.env.PFA_CAPTURE_REPLIES || '').trim()),
    lastRunAt: s.lastRunAt || null, lastError: s.lastError || '', lastResult: s.lastResult || null, lastUid: Number(s.lastUid) || 0
  };
}

module.exports = {
  normalise, newText, matchThread, partyOf, file, check, status, readMailbox, imapConfigured, imapHosts, messageDocId,
  _setClient: (fn) => { makeClient = fn || ((options) => { const { ImapFlow } = require('imapflow'); return new ImapFlow(options); }); },
  _setParser: (fn) => { parseSource = fn || ((source) => require('mailparser').simpleParser(source)); }
};
