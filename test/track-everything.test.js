'use strict';

/* One place to follow anything sent to PFA.

   Before this there were three copies of a follow form (ask, careers, report),
   each finding submissions only, and no page at all for a shop order —
   assets/track-order.js has always called /api/pfa-order-status on behalf of a
   track-order.html that has never shipped. The acknowledgement email pointed at
   network.html, which has never shipped either.

   The security part matters more than the tidiness. A PFA order ID is the
   Shopify order number behind a prefix, so it runs in sequence: PFA-ST-1190,
   1191, 1192. Anyone could count upward and read strangers' orders — items,
   totals, courier and tracking number — because the lookup asked for nothing
   else. It now has to match the email or mobile on the order, exactly as a
   submission always has. */

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../lib/submissions.js');

const ROOT = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(ROOT, 'track.html'), 'utf8');
const orderRoute = fs.readFileSync(path.join(ROOT, 'lib', 'routes', 'pfa-order-status.js'), 'utf8');
const intake = fs.readFileSync(path.join(ROOT, 'lib', 'routes', 'pfa-submissions.js'), 'utf8');

test('the page exists and asks for both the number and the contact', () => {
  assert.match(page, /id="tRef"/, 'no field for the reference');
  assert.match(page, /id="tContact"/, 'no field for the email or mobile');
  assert.match(page, /required/, 'the fields are not required');
});

test('it sends an application to the submissions register and an order to the order register', () => {
  assert.match(page, /\/api\/pfa-submissions\?reference=/, 'submissions are not looked up');
  assert.match(page, /\/api\/pfa-order-status\?id=/, 'orders are not looked up');
  /* The shape of the number decides, so a person never has to know there are
     two registers behind one form. */
  assert.match(page, /\/\^PFA-ST-\/i/, 'nothing tells an order number from an application number');
});

test('both lookups carry the contact', () => {
  /* The URL is concatenated, so the contact is appended outside the string
     literal. Read the whole expression rather than the literal. */
  const block = page.match(/var url = isOrder\(ref\)([\s\S]*?);\n/);
  assert.ok(block, 'the lookup no longer chooses between the two registers');
  const [orderBranch, submissionBranch] = block[1].split(':');
  assert.match(orderBranch, /pfa-order-status/);
  assert.match(orderBranch, /contact=/, 'the order lookup does not send the contact');
  assert.match(submissionBranch, /pfa-submissions/);
  assert.match(submissionBranch, /contact=/, 'the submission lookup does not send the contact');
});

test('an order cannot be read with the number alone', () => {
  assert.match(orderRoute, /CONTACT_REQUIRED/, 'an ID lookup no longer demands a contact');
  assert.match(orderRoute, /normaliseContact\(contact\)/, 'the given contact is not normalised');
  /* The comparison moved into store-orders.contactMatches on 2 Sep 2026 so
     it could take the mobile as well as the email; the gate still refuses on
     its word and nothing answers before it. */
  assert.match(orderRoute, /if \(!ORDERS\.contactMatches\(record, contact\)\)/, 'the contact is never compared with the order');
});

test('a wrong contact is refused, and in the same words as a wrong number', () => {
  /* Two different messages would turn this endpoint into a way of confirming
     that an order number is real. */
  const notFound = [...orderRoute.matchAll(/ORDER_NOT_FOUND', message: '([^']+)'/g)].map((m) => m[1]);
  assert.ok(notFound.length >= 2, 'expected a shared not-found message for both cases');
  assert.equal(new Set(notFound).size, 1, `the two refusals read differently: ${notFound.join(' | ')}`);
});

test('the contact check accepts the same person and refuses anyone else', () => {
  const same = (a, b) => Boolean(S.normaliseContact(a)) && S.normaliseContact(a) === S.normaliseContact(b);
  assert.ok(same('  ASHA@Example.COM ', 'asha@example.com'), 'case and spacing should not matter');
  assert.ok(same('+91 98765 43210', '9876543210'), 'a country code should not matter');
  assert.ok(!same('someone.else@example.com', 'asha@example.com'), 'a stranger got in');
  assert.ok(!same('', 'asha@example.com'), 'an empty contact got in');
  assert.ok(!same('9876543211', '9876543210'), 'a neighbouring number got in');
});

test('the acknowledgement email sends people somewhere that exists', () => {
  const pages = new Set(fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')));
  const follow = intake.match(/followUrl: `\$\{siteUrl\(request\)\}\/([a-z0-9-]+\.html)/);
  assert.ok(follow, 'the acknowledgement no longer carries a follow link');
  assert.ok(pages.has(follow[1]), `the follow link points at ${follow[1]}, which does not exist`);
  assert.equal(follow[1], 'track.html');
});

test('no follow link anywhere points at a page that does not exist', () => {
  /* This is the failure that produced the whole mess. Four separate places
     built a follow URL for network.html, a page that has never shipped: the
     acknowledgement email, the acknowledgement page, admin's reply email, and a
     shared helper in site.js. Two tests were even pinning the broken value, so
     the suite was guarding the bug rather than the behaviour. Check every
     builder at once, wherever it lives. */
  const pages = new Set(fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')));
  const roots = ['assets', 'lib', '.'];
  const files = [];
  const walk = (dir, depth = 0) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (/^(node_modules|\.git|test|_inline-extracts)$/.test(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (depth < 4) walk(full, depth + 1); }
      else if (entry.name.endsWith('.js')) files.push(full);
    }
  };
  for (const r of roots) walk(path.join(ROOT, r));

  const broken = [];
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/followUrl[^\n]*?['"`/]([a-z0-9-]+\.html)/g)) {
      if (!pages.has(m[1])) broken.push(`${path.relative(ROOT, file)} -> ${m[1]}`);
    }
    for (const m of src.matchAll(/PFA\.followUrl\s*=\s*function[^\n]*?['"]([a-z0-9-]+\.html)/g)) {
      if (!pages.has(m[1])) broken.push(`${path.relative(ROOT, file)} -> ${m[1]}`);
    }
  }
  assert.deepEqual(broken, [], 'follow links to pages that do not exist');
});

test('the page is registered everywhere a page has to be', () => {
  assert.match(fs.readFileSync(path.join(ROOT, 'scripts', 'sync-chrome.js'), 'utf8'), /'track\.html'/,
    'the chrome sync does not know about it, so its header and footer will drift');
  /* The sitemap lists clean URLs, because cleanUrls:true makes /track.html a
     308 to /track. Match the destination, not the redirect. */
  assert.match(fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8'), /<loc>[^<]*\/track<\/loc>/, 'not in the sitemap');
  assert.match(fs.readFileSync(path.join(ROOT, 'pfa-search.js'), 'utf8'), /u: 'track\.html'/, 'not findable in site search');
});
