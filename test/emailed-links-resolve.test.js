'use strict';

/* Every page PFA names in an email, on a printed card, or on a payment result
 * page has to exist in the tree. The card-issued email carried "Open your
 * card" pointing at caregiver-card.html, the QR on the back of every printed
 * card pointed at the same page, and the page was not there. Nothing in the
 * suite read the server's links against the files on disk, so nothing said so.
 */

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
  });
}

test('every site page the server links to from an email, a card or a result page exists', () => {
  const sources = [...walk(path.join(ROOT, 'lib')), path.join(ROOT, 'assets', 'card-fields.js')];
  const missing = new Set();
  for (const file of sources) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/\/([a-z0-9-]+\.html)(?:[?#"'`\s]|$)/g)) {
      const page = m[1];
      if (!fs.existsSync(path.join(ROOT, page))) missing.add(`${page} (from ${path.relative(ROOT, file)})`);
    }
  }
  assert.deepEqual([...missing], [], 'linked pages that are not in the tree');
});

test('the card page reads the public card record and never asks for anything else', () => {
  const html = fs.readFileSync(path.join(ROOT, 'caregiver-card.html'), 'utf8');
  assert.match(html, /fetch\('\/api\/caregiver\/card\?id='/);
  assert.doesNotMatch(html, /\/api\/admin/);
  assert.match(html, /<meta name="robots" content="noindex/, 'a card link is personal');
  assert.match(html, /assets\/caregiver-card\.js/, 'drawn by the same renderer the office prints from');
  assert.doesNotMatch(html, /data-side="back"/, 'the back carries the address, which is not public');
});

test('the images every server-rendered payment page shows are in the tree', () => {
  const sources = [path.join(ROOT, 'lib', 'pfa-ccavenue-flow.js'), path.join(ROOT, 'lib', 'routes', 'payment', 'response.js')];
  const missing = [];
  for (const file of sources) {
    for (const m of fs.readFileSync(file, 'utf8').matchAll(/src="\/([^"]+\.(?:png|jpg|webp|svg))"/g)) {
      if (!fs.existsSync(path.join(ROOT, m[1]))) missing.push(m[1]);
    }
  }
  assert.deepEqual(missing, []);
});
