'use strict';

/* One conversation per submission, in email terms.

   Every submission carries a threadId, minted when the record is written.
   Every email the site sends about it gets a Message-ID the site chose, not
   one the mail library made up:

       <PFA-CR-2026-00042.9f3a1c7e2b4d.forward@peopleforanimalsindia.org>
        reference           threadId     part

   so that any reply which keeps the usual In-Reply-To or References headers
   (Gmail, Outlook, Apple Mail and every mail app of note keep them) names
   the submission AND the thread it belongs to. The inbound filer
   (lib/inbound-mail.js) reads those two out of the header and checks them
   against the record: the reference finds the document, the threadId proves
   the header was not guessed. Names, addresses and subject lines are never
   what a conversation is matched on; they are only a last resort for mail
   that arrives with no threading headers at all, and then only from an
   address already on the conversation.

   The parts:
     forward     the copy of the submission sent to PFA's inbox
     confirm     the confirmation or receipt sent to the person
     reply.N     the Nth reply a member of staff sent from the panel
     relay.N     the Nth message from the person relayed to PFA's inbox */

const crypto = require('crypto');

const THREAD_ID = /^[a-f0-9]{12}$/;
const OWN = /^<?(PFA-[A-Z0-9-]{4,40})\.([a-f0-9]{12})\.([a-z0-9][a-z0-9.-]{0,40})@([a-z0-9.-]+)>?$/i;
const ANY_ID = /<[^<>\s]+@[^<>\s]+>/g;
const DEFAULT_DOMAIN = 'peopleforanimalsindia.org';

function newThreadId() {
  return crypto.randomBytes(6).toString('hex');
}

function isThreadId(value) {
  return THREAD_ID.test(String(value || ''));
}

/* The domain the ids live under: the mailbox the site sends from, so a
   strict receiver sees ids on the same domain as the sender. */
function domainOf(sender) {
  const d = String((sender && sender.domain) || '').trim().toLowerCase();
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? d : DEFAULT_DOMAIN;
}

function messageId({ reference, threadId, part }, domain) {
  const ref = String(reference || '').trim().toUpperCase();
  const tid = String(threadId || '').trim().toLowerCase();
  const p = String(part || '').trim().toLowerCase();
  if (!ref || !THREAD_ID.test(tid) || !/^[a-z0-9][a-z0-9.-]{0,40}$/.test(p)) return '';
  return `<${ref}.${tid}.${p}@${domain || DEFAULT_DOMAIN}>`;
}

/* What one of our ids says, or null for anybody else's. */
function parse(id) {
  const m = OWN.exec(String(id || '').trim());
  if (!m) return null;
  return { reference: m[1].toUpperCase(), threadId: m[2].toLowerCase(), part: m[3].toLowerCase(), domain: m[4].toLowerCase(), id: `<${m[1]}.${m[2]}.${m[3]}@${m[4]}>` };
}

/* Every <id@host> in a header value, in order. References lists oldest
   first; In-Reply-To is usually one id. */
function idsIn(value) {
  const list = Array.isArray(value) ? value : [value];
  const out = [];
  for (const v of list) {
    const text = String(v == null ? '' : v);
    const found = text.match(ANY_ID);
    if (found) found.forEach((id) => { if (!out.includes(id)) out.push(id); });
  }
  return out;
}

/* The first id in the headers that is one of ours. In-Reply-To names the
   message actually answered, so it is read first; References, which a
   client carries forward through the whole exchange, second. */
function ours(headers) {
  const h = headers || {};
  const ids = idsIn(h.inReplyTo).concat(idsIn(h.references).reverse());
  for (const id of ids) {
    const parsed = parse(id);
    if (parsed) return parsed;
  }
  return null;
}

/* The References line for a message that continues a conversation: the
   chain so far, plus the message being answered, with no repeats. */
function references(chain, inReplyTo) {
  const out = [];
  idsIn(chain).concat(idsIn(inReplyTo)).forEach((id) => { if (!out.includes(id)) out.push(id); });
  return out.join(' ');
}

const REFERENCE_IN_TEXT = /\bPFA-[A-Z]{1,4}-(?:\d{4}-\d{4,8}|[A-Z0-9]{8})\b/;

/* A reference quoted in a subject line, for the one case the headers carry
   nothing. Never trusted on its own. */
function referenceIn(text) {
  const m = REFERENCE_IN_TEXT.exec(String(text || '').toUpperCase());
  return m ? m[0] : '';
}

module.exports = { newThreadId, isThreadId, domainOf, messageId, parse, idsIn, ours, references, referenceIn, DEFAULT_DOMAIN };
