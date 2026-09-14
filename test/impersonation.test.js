'use strict';

/* A donor's only defence against a cloned site is something we published that
 * they can check the page in front of them against. That defence is worth
 * exactly as much as it is consistent: a domain list on the donate page that
 * disagrees with the one in security.txt tells a suspicious donor nothing
 * except that we are not paying attention, and a footer line pointing at a
 * section that no longer exists is worse than no line at all.
 *
 * So the statement is written once, in lib/official-channels.js, and this
 * file fails if any published copy of it has drifted.
 */

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const CHANNELS = require('../lib/official-channels');
const { candidates, expiryNote } = require('../scripts/check-lookalikes.js');

const DONATE = read('donate.html');
const SECURITY = read('.well-known/security.txt');
const pages = fs.readdirSync(ROOT)
  .filter((f) => f.endsWith('.html') && f !== 'submission-collage.html' && f !== 'admin.html');

test('the source of truth names a real site and real payment hosts', () => {
  assert.ok(CHANNELS.OFFICIAL_DOMAINS.includes(CHANNELS.SITE), 'the site itself must be in its own domain list');
  assert.ok(CHANNELS.OFFICIAL_DOMAINS.includes(`www.${CHANNELS.SITE}`), 'the www host is where half the traffic lands');
  assert.ok(CHANNELS.PAYMENT_HOSTS.length >= 2, 'both rails must be listed, or a donor cannot check the one they are on');
  assert.ok(CHANNELS.NEVER.length >= 4, 'the never-list is the part that works without a donor reading a URL');
});

test('the payment hosts are the ones the site actually hands a donor to', () => {
  /* A list that has drifted from the code sends a donor to check the address
     bar against a name that will not be there, which teaches them to ignore
     it. CCAvenue is server-side, PayPal is a link on the page. */
  const flow = read('lib/pfa-ccavenue-flow.js') + read('lib/ccavenue.js');
  assert.ok(/ccavenue\.com/.test(flow), 'the CCAvenue host must still be what the payment code uses');
  assert.ok(CHANNELS.PAYMENT_HOSTS.some((h) => /ccavenue/.test(h)), 'and must be listed for donors');

  const paypal = /paypal\.com/.test(DONATE);
  assert.equal(paypal, CHANNELS.PAYMENT_HOSTS.some((h) => /paypal/.test(h)),
    'the dollar rail is either on the page and in the list, or in neither');
});

test('the donate page publishes every domain, payment host and warning', () => {
  const section = DONATE.slice(DONATE.indexOf('id="verify"'));
  assert.ok(section.length > 500, 'donate.html must carry the verification section');

  const missing = [
    ...CHANNELS.OFFICIAL_DOMAINS,
    ...CHANNELS.PAYMENT_HOSTS
  ].filter((d) => !section.includes(d));
  assert.deepEqual(missing, [], `the donor cannot check these anywhere: ${missing.join(', ')}`);

  /* The wording is the warning. Paraphrasing it on the page and leaving the
     module behind is how the two stop agreeing, so they are compared whole. */
  const unpublished = CHANNELS.NEVER.filter((line) => !section.includes(line));
  assert.deepEqual(unpublished, [], `these warnings exist only in lib/: ${unpublished.join(' | ')}`);
});

test('the statement is reachable from the page where money changes hands', () => {
  /* This was a check that all nineteen footers pointed here. The line was
     removed: a sentence about donation fraud on the careers page and the
     laws page is nagging, and the value of the statement is almost entirely
     in being on the page where the card fields are. So what is required now
     is narrower and still the thing that matters, that a donor mid-payment
     can reach it without leaving the flow. */
  assert.ok(/id="verify"/.test(DONATE), 'donate.html has lost its #verify anchor');
  const beforeVerify = DONATE.slice(0, DONATE.indexOf('id="verify"'));
  assert.ok(/name="pfa-amount"|id="amount"|class="give"/.test(beforeVerify),
    'the statement must sit with the giving flow, not somewhere else on the page');
});

test('security.txt is a valid RFC 9116 file and agrees with the page', () => {
  for (const field of ['Contact:', 'Expires:', 'Canonical:', 'Policy:']) {
    assert.ok(SECURITY.includes(field), `security.txt is missing ${field}`);
  }
  assert.match(SECURITY, new RegExp(`Contact: mailto:${CHANNELS.CONTACT_EMAIL.replace('.', '\\.')}`),
    'the contact address must be the one the site publishes');
  assert.ok(SECURITY.includes(`https://${CHANNELS.SITE}/.well-known/security.txt`),
    'Canonical must be this file at the real domain');

  const expires = /^Expires:\s*(.+)$/m.exec(SECURITY);
  assert.ok(expires && !Number.isNaN(Date.parse(expires[1].trim())),
    'Expires must be a date a parser can read, or the file is ignored');

  const missing = CHANNELS.PAYMENT_HOSTS.filter((h) => !SECURITY.includes(h));
  assert.deepEqual(missing, [], `a registrar acting on a report cannot see: ${missing.join(', ')}`);
});

test('security.txt is published rather than filtered out of the build', () => {
  /* It was: scripts/minify.js drops every .txt except the ones it keeps, so
     the reporting address would have 404d on the live site while passing
     every other check here. */
  const src = read('scripts/minify.js');
  const keep = new Function(`return ${src.match(/KEEP_FILES = (\/.*\/);/)[1]}`)();
  const skip = new Function(`return ${src.match(/SKIP_FILES = (\/.*\/);/)[1]}`)();
  assert.ok(skip.test('security.txt'), 'sanity: the .txt rule would drop it');
  assert.ok(keep.test('security.txt'), 'so it has to be kept explicitly');
  assert.ok(read('scripts/build-firebase.js').includes("'.well-known'"),
    'the firebase host must publish it too, or the two deployments disagree');
});

test('the monitor watches the domain we actually use', () => {
  const names = candidates();
  assert.ok(names.length > 100, `only ${names.length} candidates; the generator is not doing its job`);
  assert.ok(!names.includes(CHANNELS.SITE), 'our own name must not be reported as a lookalike');

  /* The three shapes that matter: our exact spelling somewhere else, a
     one-character slip, and the name as a person would say it. */
  assert.ok(names.includes('peopleforanimalsindia.com'), 'the .com of our own name is the first one anyone takes');
  assert.ok(names.includes('peopleforanimalsindia.in'), 'and the .in, for an Indian charity');
  assert.ok(names.some((n) => n.startsWith('people-for-animals')), 'the hyphenated reading is missing');
  assert.ok(names.some((n) => n.startsWith('pfaindia') || n.startsWith('pfa-india')), 'the initials are missing');

  /* rn reads as m at a glance in a browser's URL font, which is the whole
     trick. The generator must be producing that class of name. */
  assert.ok(names.some((n) => /peoplefor[ae]nimals/.test(n)), 'no single-letter substitutions were generated');
});

test('the monitor reports on the expiry of security.txt rather than a test failing on a date', () => {
  /* Deliberately not an assertion on the date itself. A test that starts
     failing on a calendar day, in a repo where a red suite blocks the ship,
     would take the site down over a text file. The monitor says it out loud
     instead, and npm run check:lookalikes is in the runbook. */
  const note = expiryNote();
  assert.ok(note === null || typeof note === 'string', 'the expiry check must return a note or nothing');
  assert.ok(fs.existsSync(path.join(ROOT, '.well-known', 'security.txt')), 'and it must have a file to read');
});
