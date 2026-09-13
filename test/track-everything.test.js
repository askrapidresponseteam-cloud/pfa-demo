'use strict';

/* One place to follow anything sent to PFA.

   Before this there were three copies of a follow form (ask, careers, report),
   each finding submissions only. The acknowledgement email pointed at
   network.html, which has never shipped.

   The security part matters more than the tidiness: a reference has to match
   the email or mobile it was given with, so a number alone reads nobody's
   record. The page also followed shop orders until the shop was removed. */

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../lib/submissions.js');

const ROOT = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(ROOT, 'track.html'), 'utf8');
const intake = fs.readFileSync(path.join(ROOT, 'lib', 'routes', 'pfa-submissions.js'), 'utf8');

test('an application is looked up in the submissions register, with the contact', () => {
  assert.match(page, /\/api\/pfa-submissions\?reference=/, 'applications are not looked up');
  assert.match(page, /contact=/, 'the lookup does not send the contact');
});

test('the page exists and asks for both the number and the contact', () => {
  assert.match(page, /id="tRef"/, 'no field for the reference');
  assert.match(page, /id="tContact"/, 'no field for the email or mobile');
  assert.match(page, /required/, 'the fields are not required');
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
