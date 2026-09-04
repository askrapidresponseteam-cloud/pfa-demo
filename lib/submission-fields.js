/* What each public form is allowed to send, and what it must send.

   ---- why this file exists -------------------------------------------------

   /api/pfa-submissions checked every field it was given against the shared
   rules in assets/field-rules.js, which is the right check for a field it
   recognises. It did not check that the field was there at all. Nothing was
   ever required, so an empty POST

       { "kind": "PFA-CR", "data": {} }

   allocated a reference and filed a cruelty report with no account of what
   happened, nobody's name and no way to call anyone back. Nor was a choice
   ever judged against the list it was chosen from: "animal": "Dragon" was
   filed exactly as "Dog" was, because the browser's <select> is a courtesy
   and not a boundary.

   So the spec below is the other half of validation: the browser decides what
   is convenient to type, this decides what may be recorded.

   ---- the standard it is written to ---------------------------------------

   Rejecting a real report costs more than storing a junk one. Someone
   standing over an injured animal is not going to fill the form in twice.
   So this file is deliberately narrow:

     - `required` names only fields the page itself already marks required,
       with the page's own wording, so nobody can be refused here for
       something the form never asked them for.
     - `options` lists only choices whose values are fixed in the markup.
       careers.html's Zone list is built at runtime from PFA_ROLE, so zone is
       validated as text and not against a list that could drift out of date.
     - unknown extra keys are not rejected. They are capped and checked for
       length as before. A form that grows a field keeps working; the field
       simply gets no rule until someone adds one.

   test/submission-fields.test.js reads the pages and asserts every list here
   still matches the markup, so the two cannot drift apart silently. */

'use strict';

const RULES = require('../assets/field-rules.js');

/* Keyed by submission kind. `page` is where the form lives, and is what the
   test reads to check this file against the markup. */
const KINDS = {
  'PFA-CR': {
    page: 'report.html',
    required: {
      what: 'Say what is happening.',
      animal: 'Which animal?',
      urgency: 'Is it still going on?',
      location: 'Where is it?',
      name: 'Your name, so someone can call you back.',
      mobile: 'A mobile number to reach you on.'
    },
    options: {
      animal: ['Dog', 'Cat', 'Cow or buffalo', 'Horse or donkey', 'Bird', 'Monkey', 'Goat or sheep', 'Other'],
      urgency: ['Happening now', 'Ongoing', 'Past']
    }
  },

  'PFA-Q': {
    page: 'ask.html',
    required: {
      question: 'What would you like to ask?',
      topic: 'Pick the closest topic.',
      name: 'Your name, so the answer is addressed to someone.'
    },
    /* The page sends mobile and email; `contact` is the generic key other
       kinds use for the same thing, and is honoured so a caller that posts
       one is not told to supply a contact it already gave. */
    oneOf: [{ fields: ['mobile', 'email', 'contact'], message: 'A mobile or an email, so the answer can reach you.' }],
    options: {
      topic: ['An animal I found or feed', 'Adoption', 'Animal law', 'A PFA unit or hospital',
        'Colony caregiver card', 'Volunteering', 'A donation or receipt', 'The shop or an order',
        'Working with PFA', 'Something else']
    }
  },

  'PFA-J': {
    page: 'careers.html',
    required: {
      name: 'Add your name.',
      city: 'Where are you based?',
      mobile: 'Enter a 10-digit Indian mobile number.',
      email: 'Add an email for the reply.',
      background: 'A line or two about your background.',
      zone: 'Choose the Zone you would work in.',
      pfaMember: 'Yes or not yet.',
      travel: 'Pick one.'
    },
    /* The two written answers travel under the question's own wording, which
       belongs to the role and can change with it. They are checked as text
       and not required here, so editing a question cannot start refusing
       applications. */
    options: {
      pfaMember: ['Yes', 'No'],
      travel: ['Yes', 'No', 'With notice']
    }
  },

  'PFA-S': {
    page: 'wall.html',
    required: {
      url: 'Paste the full link to a public post.',
      wall: 'Choose a wall.',
      name: 'Add the name to credit.'
    },
    oneOf: [{ fields: ['email', 'mobile', 'contact'], message: 'Add a contact.' }],
    options: {
      wall: ['Long form, over three minutes', 'Short form, under a minute']
    },
    /* What The Wall is: a public post on one of six platforms. The list lived
       only in wall.html, so a direct post could put any link at all on a page
       PFA republishes under a name the sender chose. */
    hosts: {
      url: ['instagram.com', 'facebook.com', 'fb.watch', 'youtube.com', 'youtu.be', 'vimeo.com']
    }
  },

  'PFA-V': {
    page: 'get-involved.html',
    required: {
      name: 'Add your name.',
      mobile: 'Enter a 10-digit Indian mobile number.',
      email: 'Add a valid email for the reply.',
      city: 'Tell us where you are.',
      title: 'Choose at least one area, so PFA knows what to consider you for.'
    }
  },

  'PFA-EV': {
    page: 'events.html',
    required: {
      title: 'Choose what you are asking for.',
      city: 'Tell us where.',
      name: 'Add your name.',
      mobile: 'Enter a 10-digit Indian mobile number.'
    },
    options: {
      title: ['An adoption drive', 'A sterilisation or vaccination camp', 'A CineKind screening',
        'A talk or a school session', 'Something else']
    }
  },

  'PFA-RX': {
    page: 'product.html',
    /* Both are built by the page from the product being bought, never typed,
       so there is no wording to borrow. */
    required: {
      title: 'The product this prescription is for is missing.',
      notes: 'The order this prescription belongs to is missing.'
    }
  }
};

function specFor(kind) {
  return Object.prototype.hasOwnProperty.call(KINDS, kind) ? KINDS[kind] : null;
}

function blank(value) {
  return !String(value == null ? '' : value).trim();
}

/* A host is on the list if it IS one of them or sits under one. Deliberately
   not a substring test: wall.html's regex is unanchored, so
   "youtube.com.example.net" satisfies the page and would have satisfied this
   too if it were written the same way. */
function hostAllowed(value, allowed) {
  let host = '';
  try { host = new URL(String(value)).hostname.toLowerCase().replace(/^www\./, ''); } catch (_) { return false; }
  return allowed.some((name) => host === name || host.endsWith(`.${name}`));
}

/* Every field of one submission, judged together.

   Returns { errors, clean }. `errors` is a list of { field, message } in the
   order the form shows them, so the first one is the field to move to.
   `clean` is what should be stored: every value normalised by its rule. */
function validate(kind, fields) {
  const spec = specFor(kind) || {};
  const required = spec.required || {};
  const options = spec.options || {};
  const errors = [];
  const clean = {};
  const given = fields || {};

  /* A submission with nothing in it is not a submission. This catches the
     empty POST before anything else, so the answer names the cause rather
     than listing every field the form has. */
  const anything = Object.keys(given).some((key) => !blank(given[key]));
  if (!anything) {
    return { errors: [{ field: '', message: 'Nothing was filled in.' }], clean: {} };
  }

  /* Required first and in the spec's own order: the page asks for these in a
     sequence, and the answer should follow it. */
  Object.keys(required).forEach((field) => {
    if (blank(given[field])) errors.push({ field, message: required[field] });
  });

  (spec.oneOf || []).forEach((rule) => {
    if (!rule.fields.some((field) => !blank(given[field]))) {
      errors.push({ field: rule.fields[0], message: rule.message });
    }
  });

  /* Then the shape of what was actually sent, required or not. A field left
     blank and not required is simply passed through: `check` judges entries,
     `required` judges absence, and the two must not be confused. */
  Object.keys(given).forEach((field) => {
    const raw = given[field];
    if (blank(raw)) { clean[field] = raw; return; }
    const message = RULES.checkField(field, raw, {
      required: false,
      options: options[field],
      optionMessage: required[field] || 'Choose one of the options offered.'
    });
    if (!message && spec.hosts && spec.hosts[field] && !hostAllowed(raw, spec.hosts[field])) {
      errors.push({
        field,
        message: `Link to the post itself on ${spec.hosts[field].slice(0, -1).join(', ')} or ${spec.hosts[field].slice(-1)}.`
      });
      clean[field] = RULES.normaliseField(field, raw);
      return;
    }
    if (message && !errors.some((e) => e.field === field)) errors.push({ field, message });
    clean[field] = options[field] ? RULES.squash(raw) : RULES.normaliseField(field, raw);
  });

  return { errors, clean };
}

module.exports = { KINDS, specFor, validate };
