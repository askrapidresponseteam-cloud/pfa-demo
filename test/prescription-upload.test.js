'use strict';

/* The prescription upload on a product page. There was already an endpoint
   that takes images and keeps them private — /api/pfa-submissions — so this
   uses it rather than adding a second way to receive a file. */

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');
const S = require('../lib/submissions.js');

const ROOT = path.join(__dirname, '..');
const product = fs.readFileSync(path.join(ROOT, 'product.html'), 'utf8');
const helper = fs.readFileSync(path.join(ROOT, 'pfa-forms.js'), 'utf8');

const JPEG = 'data:image/jpeg;base64,' + Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64').toString('base64');

test('a prescription is its own kind, not filed as a general form', () => {
  assert.equal(S.KIND_LABELS['PFA-RX'], 'Prescription');
  assert.equal(S.formatReference('PFA-RX', 2026, 1), 'PFA-RX-2026-00001');
});

test('the endpoint accepts the image the button sends', () => {
  const result = S.parsePhotos([JPEG]);
  assert.deepEqual(result.rejected, []);
  assert.equal(result.accepted.length, 1);
  assert.equal(result.accepted[0].contentType, 'image/jpeg');
});

test('a file that only claims to be an image is refused', () => {
  /* The server reads the bytes, not the label. */
  const lying = 'data:image/png;base64,' + Buffer.from('not an image').toString('base64');
  assert.match(S.parsePhotos([lying]).rejected[0], /not a JPEG, PNG or WebP/);
  assert.match(S.parsePhotos(['data:application/pdf;base64,JVBER']).rejected[0], /not an image/);
});

test('the browser shrinks before sending, rather than bouncing the person', () => {
  /* A phone photograph is several times the 950 KB the endpoint takes. */
  assert.match(helper, /function shrink\(file, maxEdge, quality\)/);
  assert.match(helper, /950 \* 1024/, 'it must know the server limit');
  assert.match(helper, /toDataURL\('image\/jpeg', 0\.6\)/, 'and try again before giving up');
});

test('a PDF is turned away with an instruction, not an error code', () => {
  assert.match(helper, /Photograph the prescription, or export the PDF as a picture/);
});

test('the page carries the control and loads the helper root-absolutely', () => {
  assert.match(product, /id="rxFile"/);
  assert.match(product, /id="rxSend"/);
  assert.match(product, /PFAForms\.submit\('PFA-RX'/);
  /* This page is served at /products/<handle>, one level down. */
  assert.match(product, /<script src="\/pfa-forms\.js">/,
    'a relative src would resolve under /products/ and 404');
});

test('the control only appears where a prescription is actually required', () => {
  assert.match(product, /product\.prescriptionRequired\s*\n?\s*\?\s*'<div class="pd__rx">/);
});

test('the page says where the file goes, and does not overpromise', () => {
  assert.match(product, /goes only to PFA/);
  assert.match(product, /is not shown anywhere on the site/);
  /* Example Seller are the merchant and may still ask at their own checkout;
     the page must not imply this replaces that. */
  assert.match(product, /or wait and give it to them at checkout/);
});

test('the attachment is private: only an admin route can read it back', () => {
  const route = fs.readFileSync(path.join(ROOT, 'lib', 'routes', 'admin', 'attachment.js'), 'utf8');
  assert.match(route, /requireAdmin/, 'attachments must be behind the admin guard');
  const submissions = fs.readFileSync(path.join(ROOT, 'lib', 'routes', 'pfa-submissions.js'), 'utf8');
  assert.match(submissions, /collection\('attachments'\)/, 'stored beside the record, not on a public host');
});
