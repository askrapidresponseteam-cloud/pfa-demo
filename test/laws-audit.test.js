'use strict';

/* Structural guarantees for the laws page. These are the things a machine can
   actually check. Whether a section number is the right one is not among them,
   and no test here should be read as saying otherwise. */

const test = require('node:test');
const assert = require('node:assert');
const { audit } = require('../scripts/audit-laws.js');

const { all, issues, provisions } = audit();

test('every answer carries at least one citation', () => {
  const bare = all.filter((e) => !e.cites.length).map((e) => e.q);
  assert.deepEqual(bare, [], `uncited: ${bare.join(' | ')}`);
});

test('no answer seats the reader as the offender', () => {
  const bad = issues.filter(([, why]) => /offender/.test(why));
  assert.deepEqual(bad, []);
});

test('no answer quotes a token fine', () => {
  const bad = issues.filter(([, why]) => /token fine/.test(why));
  assert.deepEqual(bad, []);
});

test('the answers a complainant leans on say the offence is cognizable', () => {
  /* Verified against the bare Act: BNS 325 is cognizable, which is what
     obliges an officer to register rather than take a note. It is the single
     most useful sentence on the page at a police counter. */
  const reporting = all.filter((e) => /insist on an FIR|carries a real sentence for cruelty/i.test(e.q + e.a));
  assert.ok(reporting.length >= 2, 'the reporting answers must be found');
  for (const e of reporting) {
    assert.match(e.a, /cognizab/i, `"${e.q}" should say the offence is cognizable`);
  }
});

test('BNS 325 is described as covering any animal, owned or not', () => {
  /* A stray has no owner, and the section is in the mischief chapter — so the
     page has to say plainly that it still applies, or a reader will assume it
     does not. */
  const e = all.find((x) => /real sentence for cruelty\?$/.test(x.q));
  assert.ok(e, 'the cruelty-sentence answer must exist');
  assert.match(e.a, /any animal, owned or not/i);
  assert.match(e.a, /five years/i);
});

test('the Supreme Court judgment is dated, not vague', () => {
  const sc = all.filter((e) => e.cites.some((c) => /^SC /.test(c)));
  assert.ok(sc.length >= 5, 'the 2026 directions are relied on in several answers');
  for (const e of sc) {
    assert.ok(e.cites.some((c) => /SC 19 May 2026/.test(c)),
      `"${e.q}" cites a court order without its date`);
  }
});

test('the audit is a triage list, not a certificate', () => {
  /* If this ever reports zero it means the heuristics found nothing, not that
     the page is legally correct. The wording of the report has to keep saying
     so, because that is the claim most likely to be misread. */
  const source = require('fs').readFileSync(`${__dirname}/../scripts/audit-laws.js`, 'utf8');
  assert.match(source, /CANNOT tell you whether a section number is the right section/);
  assert.match(source, /needs an advocate/);
  assert.ok(provisions.size > 50, `only ${provisions.size} provisions catalogued for the reviewer`);
});
