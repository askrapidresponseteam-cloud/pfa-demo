'use strict';

/* The CineKind photographs come from the Film Federation of India's event
   page. Every filename used here has to be one that page actually publishes:
   a guessed number fails silently, because the <img> carries onerror. */

const fs = require('fs');
const test = require('node:test');
const assert = require('node:assert');
const { NUMBERS, EXTRA } = require('../scripts/fetch-cinekind-media.js');

const html = fs.readFileSync(`${__dirname}/../cinekind.html`, 'utf8');
const published = new Set(NUMBERS.map(String).concat(EXTRA));

function used() {
  return [...html.matchAll(/cinekind\/([\w-]+)\.jpg/g)].map((m) => m[1]);
}

test('every CineKind image used is one the source actually publishes', () => {
  const unknown = [...new Set(used())].filter((n) => !published.has(n));
  assert.deepEqual(unknown, [], `not on filmfederation.in/events.php: ${unknown.join(', ')}`);
});

test('6.jpg is not used: the source page itself does not have it', () => {
  /* Their thumbnail for 6 points at 5.jpg, so the file looks absent on their
     side. Using it would give a picture that silently never appears. */
  assert.ok(!used().includes('6'));
  assert.ok(!NUMBERS.includes(6));
});

test('one host, spelled one way', () => {
  const hosts = new Set([...html.matchAll(/https:\/\/([\w.]*filmfederation\.in)/g)].map((m) => m[1]));
  assert.deepEqual([...hosts], ['filmfederation.in'],
    'www. and the bare host are different origins; the source page uses the bare one');
});

test('the photographs are requested without a referrer', () => {
  /* Referer-based hot-link protection is the likeliest reason these were
     blank. Sending none is the cheapest thing that defeats it. */
  const imgs = [...html.matchAll(/<img[^>]*filmfederation\.in[^>]*>/g)].map((m) => m[0]);
  assert.ok(imgs.length > 0, 'sanity: the images are still hot-linked');
  const missing = imgs.filter((tag) => !/referrerpolicy="no-referrer"/.test(tag));
  assert.deepEqual(missing, [], 'every hot-linked image needs referrerpolicy');
});

test('the Federation is credited, and the credit points at the source', () => {
  assert.match(html, /Film Federation of India/);
  assert.match(html, /https:\/\/filmfederation\.in\/events\.php/);
});

test('alt text does not name a person in a photograph nobody has checked', () => {
  /* The previous alt text asserted who was in specific frames. Those frames
     were never opened, and a wrong name on a photograph of a real, named
     person is worse than a plain description. */
  const alts = [...html.matchAll(/<img[^>]*filmfederation\.in[^>]*alt="([^"]*)"/g)].map((m) => m[1]);
  const named = alts.filter((a) => /Maneka|Gandhi|Paresh|Maity/i.test(a));
  assert.deepEqual(named, [], `unverified identification in alt text: ${named.join(' | ')}`);
});
