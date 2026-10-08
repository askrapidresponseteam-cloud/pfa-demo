'use strict';

/* "In her words" on the founder page, as the owner prefers it. On 8 Oct 2026
   it was rebuilt into three numbered parts with a sticky index, lists and
   fact panels (v1.410). On 9 Oct the owner, with the original on screen:
   "this look was better. what you changed looks sick". It is back exactly as
   it was in v1.409: the label and the title on the left, the three
   paragraphs on the right, in the page's own type. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(ROOT, 'founder.html'), 'utf8');
const doc = new JSDOM(page).window.document;

test('the section is the label, the title and three paragraphs, nothing more', () => {
  const sec = doc.getElementById('her-words');
  assert.ok(sec);
  assert.equal(sec.querySelector('.eyebrow').textContent.trim(), 'In her words');
  assert.equal(sec.querySelector('h2').textContent.replace(/\s+/g, ' ').trim(), 'A circle of love around all life.');
  const paras = [...sec.querySelectorAll('p:not(.eyebrow)')].map((p) => p.textContent.trim());
  assert.equal(paras.length, 3);
  assert.match(paras[0], /^Her argument starts with self-interest, not sentiment\./);
  assert.match(paras[1], /^People for Animals turned animal welfare in India from a quiet cause/);
  assert.match(paras[2], /^PFA is now counted among the strongest animal groups anywhere in the world\./);
  assert.equal(sec.querySelectorAll('ol, ul, h3, article, header').length, 0, 'no index, lists, parts or panels');
});

test('none of the rebuilt version is left behind', () => {
  assert.doesNotMatch(page, /msg__(index|part|claim|lede|invite|cols|list|chain|facts|fact|head|body|kicker|reach|text)\b/);
  assert.doesNotMatch(page, /her-argument|her-movement|her-standing/);
  assert.match(page, /\.msg p\{margin:0 0 22px;max-width:64ch;font-size:15px;line-height:1\.72;color:rgba\(17,17,17,\.8\)\}/);
});
