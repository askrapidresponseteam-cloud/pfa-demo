'use strict';

/* The two sites stay in step, and nothing a visitor can click is dead. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { audit } = require('../scripts/audit-site');
const { publicPages } = require('../scripts/build-search-index');
const { KIND_LABELS } = require('../lib/submissions');

const ROOT = path.join(__dirname, '..');

test('no dead links, fragments, assets, forms, buttons or unmounted API calls on any page', () => {
  const { problems, pages, routes } = audit();
  /* This guard is here so a scan that silently found nothing cannot pass as a
     clean site. It read pages > 30, from when there were 46 pages; there are
     21, so the guard failed and the scan it protects never ran at all. The
     floor is now well under the real count on both sides, low enough to
     survive a page being retired and high enough to catch a broken walk. */
  assert.ok(pages > 15, `the audit scanned ${pages} pages, which is too few to be a real walk`);
  assert.ok(routes > 20, `the audit found ${routes} mounted routes, which is too few`);
  assert.deepEqual(problems, []);
});

test('every submission kind a public form sends is one the server accepts and the panel can name', () => {
  const sent = new Set();
  const sources = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')).map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8'))
    .concat(fs.readdirSync(path.join(ROOT, 'assets')).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(ROOT, 'assets', f), 'utf8')));
  sources.forEach((s) => {
    [...s.matchAll(/saveSubmission\(['"](PFA-[A-Z]+)['"]/g)].forEach((m) => sent.add(m[1]));
    [...s.matchAll(/data-(?:reference|help|cinekind)-form=\\?["'](PFA-[A-Z]+)/g)].forEach((m) => sent.add(m[1]));
    /* The two shapes the pages actually use. Without these the scan saw one
       kind out of nine and the assertion below was guarding nothing: a form
       that sent a kind the server refuses would have sailed through. */
    [...s.matchAll(/PFAForms\.submit\(\s*['"](PFA-[A-Z]+)['"]/g)].forEach((m) => sent.add(m[1]));
    [...s.matchAll(/\bkind:\s*['"](PFA-[A-Z]+)['"]/g)].forEach((m) => sent.add(m[1]));
  });
  /* PFA-CG is never sent by the browser: the colony caregiver record is written
     in lib/routes/payment/response.js once CCAvenue confirms the fee, so the
     application cannot exist without payment. It still has to reach the panel. */
  const paid = fs.readFileSync(path.join(ROOT, 'lib', 'routes', 'payment', 'response.js'), 'utf8');
  [...paid.matchAll(/\bkind:\s*['"](PFA-[A-Z]+)['"]/g)].forEach((m) => sent.add(m[1]));

  /* Every live intake route on the site. Raise this when a new form lands, so
     deleting a form's submit call is a test failure rather than a silent loss. */
  /* PFA-CK is absent on purpose: the CineKind nomination form is withdrawn for
     now. The kind stays in lib/submissions.js so nominations already filed keep
     their name in the panel. */
  const EXPECTED = ['PFA-CG', 'PFA-CR', 'PFA-EV', 'PFA-J', 'PFA-Q', 'PFA-RX', 'PFA-S', 'PFA-V'];
  const missing = EXPECTED.filter((k) => !sent.has(k));
  assert.deepEqual(missing, [], `these no longer reach the panel: ${missing.join(', ')}`);
  const unknown = [...sent].filter((k) => !KIND_LABELS[k]);
  assert.deepEqual(unknown, [], 'kinds the server would refuse with "Unknown submission type"');
  /* and only one vocabulary exists */
  ['lib/routes/admin/records.js', 'lib/routes/admin/metrics.js'].forEach((f) => {
    assert.ok(!/const KIND_LABELS = \{/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')), `${f} keeps its own copy of the kinds`);
  });
});

test('the search index and sitemap cover every public page', () => {
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'search-index.json'), 'utf8'));
  const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  const listed = new Set(index.pages.map((p) => (p.url === '/' ? 'index.html' : p.url.slice(1))));
  const missing = publicPages().filter((f) => !listed.has(f));
  assert.deepEqual(missing, [], 'run: node scripts/build-search-index.js');
  /* The sitemap carries clean URLs, because cleanUrls:true makes /laws.html a
     308 to /laws and a sitemap should list the destination, not the redirect.
     The page still has to be there; only the form it is written in changed. */
  publicPages().forEach((f) => assert.ok(sitemap.includes(f === 'index.html' ? '.org/</loc>' : '/' + f.replace(/\.html$/, '') + '</loc>'), `${f} in sitemap.xml`));
  assert.ok(!/\.html<\/loc>/.test(sitemap), 'no sitemap URL points at a redirect');
  assert.ok(!sitemap.includes('admin.html'));
  const robots = fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8');
  assert.match(robots, /Disallow: \/admin\.html/);
  assert.match(robots, /Sitemap: https:\/\/peopleforanimalsindia\.org\/sitemap\.xml/);
});

test('the index the browser downloads carries nothing behind a sign-in', () => {
  /* search-index.json is served at its own URL and anyone may read it. It is
     built by build-index.js, which filtered only search.html and
     submission-collage.html - so a rebuild put admin.html back in, headings and
     all. pfa-search.js drops those rows when it renders, but that only keeps
     them out of the results, not out of the file. The builder now shares
     scripts/build-search-index.js's EXCLUDE and PRIVATE. */
  const shared = require('../scripts/build-search-index.js');
  const rows = JSON.parse(fs.readFileSync(path.join(ROOT, 'search-index.json'), 'utf8'));
  assert.ok(Array.isArray(rows) && rows.length > 100, 'the shipped index is empty or the wrong shape');

  const leaked = rows.filter((r) => shared.isPrivatePath(r.u));
  assert.deepEqual(leaked.map((r) => r.u), [], 'these are behind a sign-in and are in a public file');

  const excluded = rows.filter((r) => shared.EXCLUDE.has(String(r.u).split('#')[0]));
  assert.deepEqual(excluded.map((r) => r.u), [], 'these pages are excluded from search and were indexed anyway');

  /* And the builder itself, so the file cannot simply be cleaned by hand while
     the next rebuild puts it back. */
  const builder = fs.readFileSync(path.join(ROOT, 'build-index.js'), 'utf8');
  assert.match(builder, /isPrivatePath/, 'build-index.js does not consult the private-path list');
  assert.match(builder, /SHARED\.EXCLUDE/, 'build-index.js does not consult the excluded-page list');
});

test('the word for the card is the same everywhere a person meets it', () => {
  /* This test was itself a casualty. The card was renamed by blind text
     replacement, which turned 'Colony caregiver' in the renderer into
     'Colony Colony caregiver' - which is what the printed card then said - and
     rewrote this guard into "the public pages must never say the word they are
     supposed to say", so it could not catch it. It reads for the doubling now.
     The word the card was renamed from is hunted across the whole tree by
     test/caregiver-application.test.js, which forbids writing it even here, so
     it is not repeated. The bare second word is left alone on purpose: a page
     may write about caregiver rights or the role of a caregiver, which is the
     ordinary word and not the name of the card. */
  const doubled = /Colony\s+Colony/;
  for (const file of ['assets/caregiver-card.js', 'assets/card-fields.js']) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.ok(!doubled.test(source), `${file} doubles the word for the card`);
  }
  const renderer = fs.readFileSync(path.join(ROOT, 'assets', 'caregiver-card.js'), 'utf8');
  assert.ok(renderer.includes("var ROLE = 'Colony caregiver'"), 'the role printed on the card');

  const publicText = publicPages().map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ')).join(' ');
  assert.ok(!doubled.test(publicText), 'a public page doubles the word for the card');
  const admin = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
  assert.ok(!doubled.test(admin), 'the panel doubles the word for the card');
});
