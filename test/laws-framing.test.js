'use strict';

/* Three editorial rules for the laws page, each with a reason.

   1. A question must not seat the reader in the offender's chair. "Can I be
      jailed for poisoning stray dogs?" asks a fair legal question of the wrong
      person; "Can one be jailed…" asks it of nobody in particular. Questions
      where the reader really is the owner, complainant or rescuer stay in the
      first person — those are theirs.

   2. No question may headline a token fine. A line reading "the penalty is ten
      to fifty rupees" tells an abuser what cruelty costs, and it travels on its
      own in a search result. The legal point — charge under the BNS, not the
      PCA — is kept and now leads.

   3. No round total. "200 questions" reads as a target that was filled. The
      live count still shows the real number as the reader filters. */

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const ROOT = path.join(__dirname, '..');
const laws = fs.readFileSync(path.join(ROOT, 'laws.html'), 'utf8');

const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const questions = [...laws.matchAll(/<span class="qa__q">(.*?)<\/span>/gs)].map((m) => strip(m[1]));
const blocks = [...laws.matchAll(/<span class="qa__q">(.*?)<\/span>.*?<div class="qa__a">(.*?)<\/details>/gs)]
  .map((m) => ({ q: strip(m[1]), a: strip(m[2]) }));

test('sanity: the questions and answers were parsed', () => {
  assert.ok(questions.length > 150, `only ${questions.length} questions parsed`);
  assert.equal(blocks.length, questions.length);
});

test('no question puts the reader in the offender\u2019s chair', () => {
  /* First person paired with an act against an animal. */
  const HARM = /\b(I|my)\b[^?]*\b(poison|abandon|chain(ed)?|shoot|beat|kill|maim|starve|cull|sell a puppy)\b/i;
  const offending = questions.filter((q) => HARM.test(q));
  assert.deepEqual(offending, [], `reframe these impersonally: ${offending.join(' | ')}`);
});

test('the reader keeps the first person where the question is theirs', () => {
  /* The rule is about who is cast as doing harm, not a ban on "I". Stripping
     every first person would take the reader out of their own complaint. */
  const mine = questions.filter((q) => /\bI\b/.test(q));
  assert.ok(mine.length > 15, `only ${mine.length} first-person questions left; the rule has been over-applied`);
  for (const expected of ['Can I report cruelty, and to whom?', 'Can I rescue an abandoned or collapsed horse?']) {
    assert.ok(questions.includes(expected), `${expected} should stay in the first person`);
  }
});

test('no answer quotes a token fine', () => {
  const cheap = [];
  for (const { q, a } of blocks) {
    for (const m of a.matchAll(/\b(\d{1,4})\s*(?:to\s*\d{1,4}\s*)?rupees\b/g)) {
      if (Number(m[1]) <= 5000) cheap.push(`${q} -> "${m[0]}"`);
    }
  }
  assert.deepEqual(cheap, [], `these tell a reader what cruelty costs: ${cheap.join(' | ')}`);
});

test('no question headlines a penalty that turns out to be token', () => {
  const asks = questions.filter((q) => /^What is the (penalty|fine|punishment)/i.test(q));
  for (const q of asks) {
    const block = blocks.find((b) => b.q === q);
    assert.match(block.a, /years/,
      `"${q}" headlines a penalty; its answer must carry a real sentence, not a fine`);
  }
});

test('the page does not claim a round total', () => {
  assert.ok(!/200 (questions|answers)/i.test(laws), 'the lede and meta must not assert a total');
  assert.match(laws, /<span class="count" id="count"><\/span>/,
    'the count is filled by the script with the live number');
  assert.ok(!/<span data-partcount>\d/.test(laws), 'nor should the part headings');
  const search = fs.readFileSync(path.join(ROOT, 'pfa-search.js'), 'utf8');
  assert.ok(!/200 questions/.test(search), 'nor the search entry');
});

test('the search index carries the reframed wording, not the old', () => {
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'search-index.json'), 'utf8'));
  const rows = Array.isArray(index) ? index : (index.rows || index.items);
  const stale = rows.filter((r) => /Can I be jailed|Can I abandon my dog|penalty for cruelty under the PCA/i.test(r.t || ''));
  assert.deepEqual(stale.map((r) => r.t), [], 'run: node build-index.js');
  assert.ok(rows.some((r) => /Can one be jailed/.test(r.t || '')), 'the new wording must be searchable');
});
