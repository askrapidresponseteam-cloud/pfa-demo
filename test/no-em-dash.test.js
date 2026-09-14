'use strict';

/* No em dash anywhere a visitor can read it. Asked for on 31 Aug 2026; a
   hyphen is used instead. The one that prompted it was in the shop's own
   heading, written as `&mdash;`, which is why the entity forms are checked
   as well as the character: a page can carry an em dash without containing
   one, and a search for the character alone would have missed it.

   Comments are exempt. This is a rule about copy, not about how the people
   working on the file write notes to each other. */

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const ROOT = path.join(__dirname, '..');
const EM = '\u2014';
const ENTITIES = /&mdash;|&#8212;|&#x2014;/i;

const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));

/* What is left of a file once every kind of comment is gone. Block comments
   go first, then whole lines that are the continuation or the start of one.
   `//` is matched only at the start of a line so that a URL inside a string
   keeps its slashes and the text after them. */
function withoutComments(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n');
}

test('no page shows an em dash to a visitor', () => {
  const offenders = [];
  for (const page of pages) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    /* Entities are markup, so they are read from the whole file: one written
       inside a comment would still be a mistake waiting to be uncommented. */
    if (ENTITIES.test(html)) offenders.push(`${page}: an em dash entity`);
    const copy = withoutComments(html);
    if (copy.includes(EM)) {
      const line = copy.split('\n').find((l) => l.includes(EM));
      offenders.push(`${page}: ${line.trim().slice(0, 80)}`);
    }
  }
  assert.deepEqual(offenders, [], `use a hyphen:\n${offenders.join('\n')}`);
});

test('the scripts that write copy into a page do not write one either', () => {
  /* The shop, the cart and the forms all build markup in JavaScript, so a
     dash added there reaches a visitor without ever appearing in a page. */
  const files = ['pfa-search.js', 'pfa-forms.js', 'assets/bag.js', 'assets/field-validate.js',
    'assets/caregiver-card.js', 'assets/chrome.js'];
  const offenders = [];
  for (const file of files) {
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) continue;
    const code = withoutComments(fs.readFileSync(full, 'utf8'));
    if (code.includes(EM) || ENTITIES.test(code)) offenders.push(file);
  }
  assert.deepEqual(offenders, [], `use a hyphen in: ${offenders.join(', ')}`);
});
