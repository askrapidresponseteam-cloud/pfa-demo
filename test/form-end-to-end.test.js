'use strict';

/* A real page, its real script, the shared rules, and the real server spec -
   joined up.

   Every other test in this suite checks one side. test/field-validate.test.js
   drives the browser rules against markup written for it;
   test/submission-fields.test.js drives the API with payloads written for it.
   Neither would notice the failure that actually matters: the page building a
   payload the API refuses, or refusing one the API would have taken. That gap
   is where a person loses what they typed.

   So this boots the page as a browser would - the shared rules first, then the
   page's own inline scripts - types into it, submits it, and hands what the
   page produced to the same lib/submission-fields.js the route uses. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const FIELDS = require('../lib/submission-fields.js');

const ROOT = path.join(__dirname, '..');
const RULES = fs.readFileSync(path.join(ROOT, 'assets', 'field-rules.js'), 'utf8');
const VALIDATE = fs.readFileSync(path.join(ROOT, 'assets', 'field-validate.js'), 'utf8');

/* The page, with everything it loads from elsewhere stood in for: this is
   about the page's own script and the shared rules, not about the network. */
function boot(file) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => errors.push(e.message));

  const dom = new JSDOM(html, { runScripts: 'outside-only', url: `https://pfa.test/${file}`, virtualConsole });
  const w = dom.window;
  const sent = [];

  w.PFAForms = {
    wire(form, config) {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const data = config.collect();
        if (data) sent.push({ kind: config.kind, data });
      });
    },
    submit(kind, data) { sent.push({ kind, data }); return Promise.resolve('PFA-X-2026-00001'); },
    shrink() { return Promise.resolve('data:image/jpeg;base64,x'); }
  };
  w.PFA_CHROME = { recolourCursor() {} };
  w.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = () => {};

  w.eval(RULES);
  w.eval(VALIDATE);
  for (const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/\bsrc=/.test(m[1])) continue;
    const type = (m[1].match(/type\s*=\s*["']([^"']+)["']/) || [])[1];
    if (type && !/^(text\/javascript|application\/javascript|module)$/i.test(type)) continue;
    try { w.eval(m[2]); } catch (error) { errors.push(`inline script: ${error.message}`); }
  }
  w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));

  const doc = w.document;
  return {
    w, doc, errors, sent,
    /* Typing, as a person does it: the keystroke filter then the tidy on leaving. */
    type(id, value) {
      const el = doc.getElementById(id);
      assert.ok(el, `${file} has no #${id}`);
      el.value = value;
      el.dispatchEvent(new w.Event('input', { bubbles: true }));
      el.dispatchEvent(new w.Event('blur', { bubbles: false }));
      return el.value;
    },
    set(id, value) { const el = doc.getElementById(id); assert.ok(el, `${file} has no #${id}`); el.value = value; return el; },
    check(id) { const el = doc.getElementById(id); assert.ok(el, `${file} has no #${id}`); el.checked = true; return el; },
    submit(selector) {
      doc.querySelector(selector).dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    }
  };
}

/* What the route would say about the payload the page just built. */
const serverSays = (kind, data) => FIELDS.validate(kind, data).errors;

test('events.html: what the page sends is what the API asks for', () => {
  const page = boot('events.html');
  assert.deepEqual(page.errors, [], 'the page threw while booting');

  /* The shared rules are doing their work on the way in. */
  assert.equal(page.type('evName', 'Meena 7 Iyer'), 'Meena Iyer', 'a digit reached a name box');
  assert.equal(page.type('evMobile', '+91 98765 43210'), '9876543210', 'the country code was kept');
  assert.equal(page.type('evCity', 'kundapur'), 'Kundapur', 'the town was not tidied');

  page.set('evKind', 'An adoption drive');
  page.set('evEmail', 'asha@example.com');
  page.set('evPlace', 'Near the bus stand');
  page.set('evNotes', 'About forty animals are fed here.');
  page.submit('form');

  assert.equal(page.sent.length, 1, 'the form did not send');
  const { kind, data } = page.sent[0];
  assert.equal(kind, 'PFA-EV');
  assert.deepEqual(serverSays(kind, data), [], `the API would refuse what the page sent: ${JSON.stringify(data)}`);
});

test('events.html: the page refuses what the API would refuse', () => {
  const page = boot('events.html');
  /* A mobile that is not an Indian mobile, and nothing else filled in. */
  page.set('evMobile', '1234567890');
  page.submit('form');
  assert.equal(page.sent.length, 0, 'the page sent a form the API would have thrown back');
});

test('report.html: a whole cruelty report survives the round trip', () => {
  const page = boot('report.html');
  assert.deepEqual(page.errors, [], 'the page threw while booting');

  assert.equal(page.type('name', 'karthik  dhanya'), 'Karthik Dhanya');
  assert.equal(page.type('mobile', '08105250299'), '8105250299', 'the trunk zero was kept');
  assert.equal(page.type('pincode', '57a6b2c2d2'), '576222', 'a letter reached the PIN box');

  page.set('what', 'A man is beating a dog outside the market with a stick.');
  page.set('animal', 'Dog');
  page.set('urgency', 'Happening now');
  page.set('where', 'Ashraya Ankadakatte, Kundapur');
  page.check('consent');
  page.submit('#reportForm');

  assert.equal(page.sent.length, 1, 'the report did not send');
  const { kind, data } = page.sent[0];
  assert.equal(kind, 'PFA-CR');
  assert.deepEqual(serverSays(kind, data), [], `the API would refuse this report: ${JSON.stringify(data)}`);
  assert.equal(data.animal, 'Dog', 'the choice must be one the spec lists');
  assert.equal(data.mobile, '8105250299');
});

test('report.html: an unfinished report never leaves the page', () => {
  const page = boot('report.html');
  page.set('what', 'Something is wrong.');
  page.check('consent');
  page.submit('#reportForm');
  assert.equal(page.sent.length, 0, 'a report with no animal, no place and no number was sent');
});

test('every choice a page offers is a choice the API accepts', () => {
  /* The other direction of the same contract: not that one payload passes,
     but that no option on the page is one the spec would refuse. */
  for (const [kind, spec] of Object.entries(FIELDS.KINDS)) {
    for (const [field, allowed] of Object.entries(spec.options || {})) {
      for (const value of allowed) {
        const message = require('../assets/field-rules.js')
          .checkField(field, value, { required: false, options: allowed });
        assert.equal(message, null, `${kind}.${field}: the page offers "${value}" and the rules refuse it`);
      }
    }
  }
});
