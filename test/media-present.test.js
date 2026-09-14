'use strict';

/* cinekind.html referenced nine local files that were not in the tree — six
   portraits and three videos — and every one failed silently. The visible
   symptom was grey boxes with nothing to say which files were wanted. */

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');
const { check, referencedIn } = require('../scripts/check-media.js');

const ROOT = path.join(__dirname, '..');

test('the checker ignores markup built by string concatenation', () => {
  const found = referencedIn(`<img src="' + esc(a.img) + '"><img src="media/real.webp">`);
  assert.deepEqual([...found], ['media/real.webp'],
    'a concatenated fragment is not a path');
});

test('the checker finds a genuinely missing file', () => {
  const found = referencedIn('<video src="media/nope.mp4"></video>');
  assert.deepEqual([...found], ['media/nope.mp4']);
});

test('every missing asset is documented, so the answer is a filename', () => {
  const missing = [...check().keys()];
  if (!missing.length) return;                 // all supplied: nothing to document
  const readme = fs.readFileSync(path.join(ROOT, 'media', 'cinekind-2025', 'README.md'), 'utf8');
  const undocumented = missing.filter((file) => !readme.includes(path.basename(file)));
  assert.deepEqual(undocumented, [],
    `these are missing and not named in the README: ${undocumented.join(', ')}`);
});

test('a missing image or video removes its frame, not just itself', () => {
  /* An <img> that removes only itself leaves the .shot behind — an empty
     stone box at aspect-ratio 4/5, which is the grey placeholder. */
  const html = fs.readFileSync(path.join(ROOT, 'cinekind.html'), 'utf8');
  const frames = [...html.matchAll(/<div class="shot"[^>]*>\s*<(img|video)[^>]*src="(media\/[^"]+)"[^>]*>/g)];
  assert.ok(frames.length >= 9, `expected the local media frames, found ${frames.length}`);
  for (const frame of frames) {
    const tag = frame[0];
    assert.match(tag, /data-shot/, `${frame[2]} has no frame hook`);
    assert.match(tag, /onerror=/, `${frame[2]} fails silently`);
    assert.match(tag, /closest\('\[data-shot\]'\)/, `${frame[2]} would leave an empty box`);
  }
});

test('the two pages do not contradict each other about the next edition', () => {
  const events = fs.readFileSync(path.join(ROOT, 'events.html'), 'utf8');
  assert.ok(!/dates for the next one are not settled/.test(events),
    'cinekind.html announces a 2026 date; events.html must not deny it');
});
