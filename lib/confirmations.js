'use strict';

/* What a person is told once they have sent something to PFA: in the letter
   emailed to them, and on the page they are looking at when it goes.

   ---- why this file exists -------------------------------------------------

   The membership welcome letter was the one confirmation written to the
   brief: one flat electric blue, poster type, the number large. Everything
   else went out as the grey acknowledgement; a colony caregiver application,
   paid for, went out with no email at all; and no page told anyone that the
   email might be sitting in Spam. The pages could not have said so anyway:
   /api/pfa-submissions answered `acknowledged` and pfa-forms.js kept only the
   reference, so a page had no idea whether an email had gone.

   So every kind now gets the letter, worded for what was actually sent, with
   its number called what it is: an application number for an application, a
   member number for a membership, a reference for a report. Every page that
   shows a number says whether a confirmation went, to which address, and
   where to look when it is not in the inbox. The words for both live here,
   so the email and the screen cannot disagree.

   The lead lines are the pages' own success copy. Each `path` is the stage
   list the form itself shows under "Where an application goes", or the public
   statuses from lib/submissions.js; test/confirmations.test.js reads the
   pages and fails if the two drift apart. */

const S = require('./submissions');

const APPLICATION = 'Application number';
const REFERENCE = 'Reference';
const MEMBER = 'Member number';
const TRANSACTION = 'PFA transaction ID';

/* The public statuses, in the order a record moves through them. Read from
   the one vocabulary the track page and the panel already use. */
const GENERIC_PATH = ['new', 'in-progress', 'handled'].map((status) => S.PUBLIC_STATUS[status].label);

const KINDS = {
  'PFA-CR': {
    thing: 'cruelty report',
    subject: 'Your report is in',
    headline: ['Your', 'report', 'is in.'],
    number: REFERENCE,
    lead: 'A named person at PFA can now see the report and any photographs with it. You will hear back on the mobile or email you gave.',
    urgent: 'If the animal is in danger right now, call the police on 112.',
    path: GENERIC_PATH
  },
  'PFA-Q': {
    thing: 'question',
    subject: 'Your question is in',
    headline: ['Your', 'question', 'is in.'],
    number: REFERENCE,
    lead: 'A named person at PFA can now see your question. The answer comes to the mobile or email you gave.',
    path: GENERIC_PATH
  },
  'PFA-J': {
    thing: 'job application',
    subject: 'Your application is in',
    headline: ['Your', 'answers', 'are in.'],
    number: APPLICATION,
    lead: 'A named person at PFA can now read your answers. Shortlisted candidates are called within three weeks, and everyone hears back either way.',
    path: GENERIC_PATH
  },
  'PFA-V': {
    thing: 'volunteer application',
    subject: 'Your volunteer application is in',
    headline: ['You', 'offered', 'your', 'time.'],
    number: APPLICATION,
    lead: 'It is on PFA\'s record under Volunteers at the Submitted stage, and a named person moves it from there. Nothing is decided yet.',
    path: ['Submitted', 'Under review', 'Shortlisted', 'Approved or not taken forward']
  },
  'PFA-EV': {
    thing: 'event request',
    subject: 'Your event request is in',
    headline: ['Your', 'request', 'is in.'],
    number: REFERENCE,
    lead: 'A named person at PFA picks it up from here and will use the contact you gave. It is a request, not a booking: nothing is confirmed until someone at PFA replies.',
    path: GENERIC_PATH
  },
  'PFA-S': {
    thing: 'film for the Wall',
    subject: 'Your film is in',
    headline: ['Your', 'film', 'is in.'],
    number: REFERENCE,
    lead: 'An editor at PFA watches every submission before anything goes on the Wall, and will use the contact you gave.',
    path: GENERIC_PATH
  },
  'PFA-W': {
    thing: 'field note',
    subject: 'Your field note is in',
    headline: ['Your', 'field', 'note', 'is in.'],
    number: REFERENCE,
    lead: 'The desk reads every field note before it is published, and may use the contact you gave to check a detail.',
    path: GENERIC_PATH
  },
  'PFA-CG': {
    thing: 'colony caregiver card application',
    subject: 'Your caregiver card application is in',
    headline: ['Applied.', 'Now a', 'person', 'reads it.'],
    number: APPLICATION,
    lead: 'A named person at PFA reads every application and decides. The card is not issued on the spot.',
    path: ['Submitted', 'Under review', 'Verified', 'Card issued']
  },
  'PFA-MEM': {
    thing: 'membership',
    subject: 'You\'re one of us now',
    headline: ['You\'re', 'one of', 'us now.'],
    number: MEMBER,
    lead: 'Every member is an active working member: when an animal near you needs someone, PFA may call on you, and you may call on PFA.',
    path: ['Paid', 'Kit dispatched', 'Kit delivered']
  }
};

/* A donation is a payment, not a submission kind, but it is confirmed in the
   same letter, and the page speaks about its email the same way. */
const DONATION = {
  thing: 'donation',
  subject: 'Your gift is in',
  headline: ['Your', 'gift', 'is in.'],
  number: TRANSACTION,
  lead: 'This is your acknowledgement.',
  path: []
};

/* "CineKind entry" keeps its capital; "Corporate partnership" reads as a
   phrase inside a sentence. */
function inSentence(label) {
  const text = String(label || '').trim();
  const first = text.split(/\s+/)[0] || '';
  return /[A-Z]/.test(first.slice(1)) ? text : text.charAt(0).toLowerCase() + text.slice(1);
}

/* The wording for any kind the submissions API accepts. A kind with no entry
   above is still confirmed: it is called an application if its label says it
   is one, and a reference otherwise. */
function forKind(kind) {
  if (Object.prototype.hasOwnProperty.call(KINDS, kind)) return KINDS[kind];
  const label = S.KIND_LABELS[kind] || 'Submission';
  return {
    thing: inSentence(label),
    subject: 'Received by PFA',
    headline: ['We have', 'it.'],
    number: /application/i.test(label) ? APPLICATION : REFERENCE,
    lead: 'A named person at PFA picks it up from here.',
    path: GENERIC_PATH
  };
}

/* The same, for what CCAvenue took payment for. */
function forPayment(type) {
  if (type === 'membership') return KINDS['PFA-MEM'];
  if (type === 'caregiver-application') return KINDS['PFA-CG'];
  return DONATION;
}

/* ---- the note on the page ----------------------------------------------- */

function senderAddress() {
  const from = String(process.env.PFA_MAIL_FROM || 'People for Animals <cards@peopleforanimalsindia.org>');
  const bracketed = /<([^>]+)>/.exec(from);
  const address = (bracketed ? bracketed[1] : from).trim().toLowerCase();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(address) ? address : '';
}

/* Where to look, in the order worth trying. */
function lookSteps(reference) {
  const from = senderAddress();
  const search = [reference, from].filter(Boolean);
  return [
    'Give it a few minutes to arrive.',
    'Look in Spam or Junk. In Gmail, check the Promotions and Updates tabs too.',
    search.length ? `Search your mail for ${search.join(' or ')}.` : 'Search your mail for People for Animals.',
    'Found it in Spam or Junk? Mark it Not spam, so the next email from PFA reaches your inbox.'
  ];
}

/* What the page says about the email, from what actually happened to it.
   `state` is what send() returned. `item` names what went: "A receipt", "Your
   welcome letter"; left out, it is a confirmation carrying the number. */
function notice({ state, to, number, reference, item } = {}) {
  const label = inSentence(number || REFERENCE);
  const address = String(to || '').trim();
  const what = item || `A confirmation with your ${label}`;
  if (state === 'sent' && address) {
    return {
      state: 'sent', to: address, title: 'Check your email.',
      lines: [`${what} has been emailed to ${address}.`],
      ask: 'Not in your inbox?', steps: lookSteps(reference)
    };
  }
  if (state === 'queued' && address) {
    return {
      state: 'queued', to: address, title: 'Your email is on its way.',
      lines: [`Sending it to ${address} is taking longer than usual. If it has not arrived in a few minutes, PFA tries again on its own, which can take up to a day. Keep the ${label} meanwhile.`],
      ask: 'When you look for it:', steps: lookSteps(reference)
    };
  }
  if (state === 'unsent' && address) {
    return {
      state: 'unsent', to: address, title: 'Keep this number.',
      lines: [`No email could be sent to ${address} just now. Check that the address is right; either way this page is your record, so keep the ${label}.`],
      ask: '', steps: []
    };
  }
  return {
    state: 'none', to: '', title: '',
    lines: [`No email was given, so none was sent. Keep the ${label}: it is your record.`],
    ask: '', steps: []
  };
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* The note as markup, for the pages the server writes itself: the result of
   a payment, and the answer to a form posted without script. Class names are
   styled by each of those pages. */
function noticeHtml(n) {
  if (!n || (!n.title && !(n.lines || []).length)) return '';
  const to = escapeHtml(n.to);
  const lines = (n.lines || []).map((line) => {
    const safe = escapeHtml(line);
    return `<p>${to && safe.includes(to) ? safe.replace(to, `<strong>${to}</strong>`) : safe}</p>`;
  }).join('');
  const steps = (n.steps || []).length
    ? `${n.ask ? `<p class="mail__ask">${escapeHtml(n.ask)}</p>` : ''}<ol>${n.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>`
    : '';
  return `<div class="mail" data-mail="${escapeHtml(n.state)}">${n.title ? `<p class="mail__title">${escapeHtml(n.title)}</p>` : ''}${lines}${steps}</div>`;
}

/* ---- sending -------------------------------------------------------------- */

const TIMEOUT_MS = 2500;

function withTimeout(start, ms) {
  let timer;
  return Promise.race([
    Promise.resolve().then(start).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('confirmation timed out')), ms); })
  ]);
}

function settle(work, what) {
  return Promise.resolve().then(() => work).catch((error) => {
    console.warn(`confirmation ${what} not recorded`, error && error.message);
  });
}

/* Sends one confirmation, and never throws.

   The row goes on the outbound queue (caregiverEmails) first, and delivery
   is tried at once. If the provider is slow or down, the request that caused
   the email is not held up or failed: the row stays on the queue and the
   email worker sends it on its next run. What comes back says which happened,
   so the page can say so:

     sent     the provider took it
     queued   it will go on a later attempt
     unsent   no attempt could be made, or the address was refused
     none     no email address was given */
async function send({ to, template, payload, dedupeKey, mail, queue, timeoutMs = TIMEOUT_MS }) {
  const address = String(to || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(address)) return { state: 'none', to: '' };
  if (!mail || typeof mail.isConfigured !== 'function' || !mail.isConfigured()) {
    return { state: 'unsent', to: address, reason: 'MAIL_NOT_CONFIGURED' };
  }

  let queued = null;
  if (queue && typeof queue.queueEmail === 'function') {
    try {
      queued = await queue.queueEmail({ template, to: address, payload, dedupeKey });
    } catch (error) {
      console.warn('confirmation not queued', { template, message: error && error.message });
    }
  }
  /* Already on the queue under this key: an earlier request has it in hand. */
  if (queued && queued.created === false) return { state: 'sent', to: address, duplicate: true };

  try {
    const sent = await withTimeout(() => mail.deliver({ to: address, template, payload }), timeoutMs);
    if (queued) await settle(queue.recordEmailResult({ emailId: queued.emailId, ok: true, providerId: sent && sent.providerId }), 'result');
    return { state: 'sent', to: address, providerId: (sent && (sent.providerId || sent.id)) || null };
  } catch (error) {
    const permanent = Boolean(error && (error.permanent || error.code === 'INVALID_RECIPIENT'));
    if (queued) {
      await settle(queue.recordEmailResult({
        emailId: queued.emailId, ok: false,
        error: `${error && error.message}${permanent ? ' (permanent)' : ''}`
      }), 'result');
    }
    console.warn('confirmation not sent at once', { template, message: error && error.message });
    return { state: queued && !permanent ? 'queued' : 'unsent', to: address };
  }
}

module.exports = {
  APPLICATION,
  REFERENCE,
  MEMBER,
  TRANSACTION,
  GENERIC_PATH,
  KINDS,
  DONATION,
  forKind,
  forPayment,
  inSentence,
  lookSteps,
  notice,
  noticeHtml,
  send,
  senderAddress
};
