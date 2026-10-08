'use strict';

/* The list of everything the panel can show or hide, assets/site-modules.json.

   It is generated from the pages by scripts/build-site-modules.js, never kept
   by hand, so it cannot drift from the site: these fail the moment a page
   gains or loses a section and the list was not rebuilt (npm run
   build:site-modules, which npm run build:search also runs). */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const B = require('../scripts/build-site-modules.js');
const { PAGES } = require('../scripts/sync-chrome.js');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'build-site-modules.js');
const REGISTRY = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'site-modules.json'), 'utf8'));
const page = (id) => REGISTRY.pages.find((p) => p.id === id);
const ids = (id) => page(id).modules.map((m) => m.id);

test('--check passes on the shipped list, and fails on a stale one', () => {
  const ok = spawnSync(process.execPath, [SCRIPT, '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(ok.status, 0, `assets/site-modules.json is stale - run npm run build:site-modules\n${ok.stderr}`);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfa-site-modules-'));
  const stale = path.join(dir, 'site-modules.json');
  const old = JSON.parse(JSON.stringify(REGISTRY));
  old.pages.find((p) => p.id === 'laws').modules.pop();
  fs.writeFileSync(stale, JSON.stringify(old, null, 1) + '\n');
  const bad = spawnSync(process.execPath, [SCRIPT, '--check'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, PFA_SITE_MODULES_OUT: stale } });
  assert.equal(bad.status, 1, 'a list that has fallen behind the pages fails');
  assert.match(bad.stderr, /npm run build:site-modules/);
  assert.equal(fs.readFileSync(stale, 'utf8'), JSON.stringify(old, null, 1) + '\n', '--check writes nothing');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('it is part of the build that rebuilds the search index, and has its own commands', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.match(pkg.scripts['build:search'], /build-search-index\.js && node scripts\/build-site-modules\.js/);
  assert.equal(pkg.scripts['build:site-modules'], 'node scripts/build-site-modules.js');
  assert.equal(pkg.scripts['check:site-modules'], 'node scripts/build-site-modules.js --check');
});

test('every page with the site header is on the list, in the group its menu puts it', () => {
  assert.deepEqual(REGISTRY.pages.map((p) => p.file).sort(), Object.keys(PAGES).filter((f) => fs.existsSync(path.join(ROOT, f))).sort());
  assert.ok(!REGISTRY.pages.some((p) => /admin|read\.html|collage/.test(p.file)), 'not the panel, the reader or the unlinked collage');
  assert.deepEqual(REGISTRY.groups, ['Our Work', 'Learn', 'Get Involved', 'About', 'Donate and Shop', 'Not in the menus']);
  const groupOf = Object.fromEntries(REGISTRY.pages.map((p) => [p.id, p.group]));
  assert.equal(groupOf.units, 'Our Work');
  assert.equal(groupOf.achievements, 'Our Work');
  assert.equal(groupOf.laws, 'Learn');
  assert.equal(groupOf['get-involved'], 'Get Involved');
  assert.equal(groupOf['caregiver-card'], 'Get Involved', 'a page in a section but not its menu sits in that section');
  assert.equal(groupOf.founder, 'About');
  assert.equal(groupOf.careers, 'About');
  assert.equal(groupOf.ask, 'About');
  assert.equal(groupOf.donate, 'Donate and Shop');
  assert.equal(groupOf.index, 'Not in the menus');
  assert.equal(page('units').menu, 'Units: find help near you');
  assert.equal(page('index').title, 'Home');
  assert.equal(page('laws').title, 'Laws');
});

test('Laws, its parts and its notes; Units; Policies; About: all reachable as sections', () => {
  for (const id of ['top', 'part-a', 'part-b', 'part-c', 'part-d', 'what-changed', 'filing-a-complaint']) assert.ok(ids('laws').includes(id), `laws#${id}`);
  assert.deepEqual(page('laws').modules.filter((m) => /^part-/.test(m.id)).map((m) => m.label), ['Dogs', 'Cows & cattle', 'Animal husbandry', 'Horses & working equines']);
  for (const id of ['top', 'gallery', 'the-work', 'setup']) assert.ok(ids('units').includes(id), `units#${id}`);
  assert.ok(ids('achievements').includes('records'), 'the record of policies and achievements');
  for (const id of ['top', 'watch', 'numbers', 'her-words', 'aims', 'gallery', 'rapid-response', 'carry-on']) assert.ok(ids('founder').includes(id), `founder#${id}`);
  assert.deepEqual(page('get-involved').modules.map((m) => [m.id, m.label]),
    [['volunteer', 'Volunteer'], ['membership', 'Become a member'], ['caregiver', 'Colony caregiver']], 'named as the menu names them');
  assert.deepEqual(ids('index'), ['welcome', 'founder']);
});

test('every section on the list is really on its page, once, and every top-level section of a page is on the list', () => {
  for (const p of REGISTRY.pages) {
    const html = fs.readFileSync(path.join(ROOT, p.file), 'utf8');
    const seen = new Set();
    for (const m of p.modules) {
      assert.ok(!seen.has(m.id), `${p.file}: ${m.id} twice`);
      seen.add(m.id);
      assert.ok(new RegExp(`\\sid="${m.id}"|\\sdata-module="${m.id}"`).test(html), `${p.file} has no ${m.id}`);
      assert.ok(m.label && m.label.length <= 90, `${p.file}#${m.id} has a label`);
    }
  }
  /* The build says which top-level blocks it cannot address. Only the two
     locked pages may have one (their sections cannot be hidden anyway). */
  const notes = [];
  B.build({ warn: (w) => notes.push(w) });
  assert.deepEqual(notes.filter((n) => !/^(track|search)\.html:/.test(n)), [], notes.join('\n'));
});

test('the anchors say which section a search result lands in', () => {
  assert.equal(REGISTRY.anchors.laws.a1, 'part-a');
  assert.equal(REGISTRY.anchors.laws.b48, 'part-b');
  assert.equal(REGISTRY.anchors.laws.d50, 'part-d');
  assert.equal(REGISTRY.anchors.achievements['rec-001'], 'records');
  for (const [pid, map] of Object.entries(REGISTRY.anchors)) {
    const mods = new Set(ids(pid));
    for (const [inner, owner] of Object.entries(map)) {
      assert.ok(mods.has(owner), `${pid}: ${inner} belongs to ${owner}, which is not a section`);
      assert.ok(!mods.has(inner), `${pid}: ${inner} is a section itself`);
    }
  }
  /* Every anchored search result inside a section can be placed. */
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'search-index.json'), 'utf8'));
  const lost = index.rows.filter((r) => /^laws\.html#[a-d]\d+$/.test(r.u)).filter((r) => !REGISTRY.anchors.laws[r.u.split('#')[1]]);
  assert.deepEqual(lost.map((r) => r.u), []);
});

test('the rules for finding sections, on a page made up for the purpose', () => {
  const html = `<!doctype html><html><head><title>Made up | People for Animals</title><style>section{}</style></head><body>
<script id="pfa-vis">var s = '<section id="fake">';</script>
<div class="announce" id="announce"><p>bar</p></div>
<header class="site" id="header"><section id="in-header"><h2>no</h2></section></header>
<main>
  <section id="top"><span class="eyebrow">Kicker</span><h1>The <em>opening</em>&nbsp;words</h1></section>
  <section class="wrap">
    <section id="inner-a" data-journey="Journey A"><h2>Step one.</h2><div id="a-1"></div><input id="field"></section>
    <section id="inner-b"><h2>B &amp; C</h2><section id="nested"><h3>Not separate</h3></section><p id="b-2">x</p></section>
  </section>
  <section id="list"><article id="item-1"><h3>The first item</h3></article></section>
  <section aria-label="A gallery" id="pics"><figure id="pic-1"></figure></section>
  <div class="card" data-module="inner-a"><h3>A card that goes with A</h3></div>
  <div class="extra" data-module="extra"><h2>An extra module</h2></div>
  <!-- <section id="commented"><h2>gone</h2></section> -->
  <section class="nameless"><h2>Has no id</h2></section>
</main>
<footer class="pfa-footer"><section id="in-footer"></section></footer>
</body></html>`;
  const warnings = [];
  const out = B.modulesOf('made-up.html', html, { 'inner-b': 'From the menu' }, (w) => warnings.push(w));
  assert.deepEqual(out.modules, [
    { id: 'top', label: 'The opening words' },
    { id: 'inner-a', label: 'Journey A' },
    { id: 'inner-b', label: 'From the menu' },
    { id: 'list', label: 'List' },
    { id: 'pics', label: 'A gallery' },
    { id: 'extra', label: 'An extra module' }
  ]);
  assert.deepEqual(out.anchors, { 'a-1': 'inner-a', nested: 'inner-b', 'b-2': 'inner-b', 'item-1': 'list', 'pic-1': 'pics' }, 'fields are not anchors; a nested section belongs to its parent');
  assert.deepEqual(warnings, ['made-up.html: a top-level <section> has no id, so it cannot be hidden (Has no id)']);
});
