'use strict';

/* The microsites (owner, 9 Oct 2026: "Revamp PFA Campus into a cool, modern
   experience, not an outdated form. Create separate microsites for SGACC,
   CSR, Leave a Legacy, Privacy Policy, and Plan a Campaign, all aligned with
   the new website theme ... Properly update the existing Jobs section").

   What holds them together: one kit (assets/micro.css, assets/micro.js), the
   site's hero and theme, a form on each that is a submission like any other
   (the last look, then the server's reference, then the admin panel and a
   copy to gandhim: test/every-kind-reaches-gandhim.test.js), and
   photographs that fall back to a plate rather than a broken image. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const SITES = {
  'campus.html': { form: 'campusForm', kind: 'PFA-CAM' },
  'sgacc.html': { form: 'sgForm', kind: 'PFA-SG' },
  'csr.html': { form: 'csrForm', kind: 'PFA-CSR' },
  'legacy.html': { form: 'legacyForm', kind: 'PFA-LEG' },
  'campaign.html': { form: 'campForm', kind: 'PFA-CMP' },
  'privacy.html': { form: 'privacyForm', kind: 'PFA-PRV' }
};

test('each microsite is a page of the site: hero first, the kit, then the theme', () => {
  for (const [file, site] of Object.entries(SITES)) {
    const html = read(file);
    const doc = new JSDOM(html).window.document;
    const first = doc.querySelector('main').firstElementChild;
    assert.ok(first.classList.contains('hero') && first.classList.contains('m-hero'), `${file}: the hero opens the page`);
    assert.equal(doc.querySelectorAll('h1').length, 1, `${file}: one headline`);
    const kit = html.indexOf('href="assets/micro.css"');
    const theme = html.lastIndexOf('href="assets/pfa-theme.css"');
    assert.ok(kit > -1 && kit < theme, `${file}: the kit loads before the theme`);
    const preview = html.indexOf('src="assets/form-preview.js"');
    const forms = html.indexOf('src="pfa-forms.js"');
    const micro = html.indexOf('src="assets/micro.js"');
    assert.ok(preview > -1 && preview < forms && forms < micro, `${file}: preview, then pfa-forms, then the kit's script`);
    assert.ok(doc.getElementById(site.form), `${file}: #${site.form}`);
    assert.match(html, new RegExp(`kind: '${site.kind}',\\s*page: '${file}'`), `${file} sends ${site.kind} under its own name`);
    assert.ok(doc.querySelector('.m-done [data-track]') && doc.querySelector('.m-done [data-copy]'), `${file}: the reference can be copied and followed`);
  }
});

test('the kit sends only after the last look, and shows the server\'s reference, never one of its own', () => {
  const js = read('assets/micro.js');
  const send = js.slice(js.indexOf('function send(opts)'), js.indexOf('function filter('));
  const look = send.indexOf('root.PFAForms.preview(');
  const submit = send.indexOf('root.PFAForms.submit(');
  assert.ok(look > -1 && submit > look, 'the preview comes first');
  assert.match(send, /function go\(confirmed\) \{\s*if \(!confirmed\) \{ busy = false; return; \}/, 'going back sends nothing');
  assert.match(send, /\.then\(function \(reference\) \{[\s\S]*opts\.doneRef\.textContent = reference;/, 'the number shown is the one the server issued');
});

test('in a browser: back from the last look sends nothing; confirmed, the reference appears', async () => {
  const dom = new JSDOM(`<!doctype html><body>
    <form id="f"><div class="m-step is-current"><div class="field"><label for="n">Name</label><input id="n" required><p class="err" hidden></p></div>
    <p class="status" data-form-status hidden></p><button type="submit" data-send>Send</button></div></form>
    <div class="m-done" id="done" hidden><p class="ref" id="ref"></p><div class="acts"><a data-track href="track.html">Follow</a></div></div></body>`, { runScripts: 'outside-only' });
  const w = dom.window;
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.eval(read('assets/micro.js'));
  const sent = [];
  let answer = false;
  w.PFAForms = {
    preview: () => Promise.resolve(answer),
    submit: (kind, data, o) => { sent.push([kind, data, o]); return Promise.resolve('PFA-PRV-2026-00007'); }
  };
  const form = w.document.getElementById('f');
  w.PFAMicro.send({
    form, kind: 'PFA-PRV', page: 'privacy.html', button: form.querySelector('[data-send]'), status: form.querySelector('[data-form-status]'),
    done: w.document.getElementById('done'), doneRef: w.document.getElementById('ref'),
    ready: () => !w.PFAMicro.checkStep(form), data: () => ({ name: w.document.getElementById('n').value })
  });
  const submit = () => form.dispatchEvent(new w.Event('submit', { cancelable: true }));
  const settle = () => new Promise((r) => setTimeout(r, 10));

  submit(); await settle();
  assert.equal(sent.length, 0, 'an empty required field stops it before the last look');
  assert.equal(form.querySelector('.err').hidden, false, 'and says so');

  w.document.getElementById('n').value = 'Asha Rao';
  submit(); await settle();
  assert.equal(sent.length, 0, 'going back from the last look sends nothing');
  assert.equal(w.document.getElementById('done').hidden, true);

  answer = true;
  submit(); await settle();
  assert.deepEqual(sent.map((s) => s[0]), ['PFA-PRV']);
  assert.equal(sent[0][2].page, 'privacy.html');
  assert.equal(w.document.getElementById('ref').textContent, 'PFA-PRV-2026-00007');
  assert.equal(w.document.getElementById('done').hidden, false);
  assert.equal(form.hidden, true);
  assert.equal(w.document.querySelector('[data-track]').getAttribute('href'), 'track.html#ref=PFA-PRV-2026-00007');
});

test('every photograph a microsite shows is either shipped or fetched at deploy, and falls back to a plate', () => {
  const manifest = JSON.parse(read('data/site-photos.json'));
  const listed = new Set(manifest.photos.map((p) => p.file));
  for (const file of Object.keys(SITES).concat(['careers.html'])) {
    const doc = new JSDOM(read(file)).window.document;
    for (const img of doc.querySelectorAll('main img')) {
      const src = img.getAttribute('src');
      if (src.startsWith('data:')) continue;   /* the viewer's empty frame */
      if (!src.startsWith('media/site/')) { assert.ok(fs.existsSync(path.join(ROOT, src)), `${file}: ${src} is missing`); continue; }
      assert.ok(listed.has(src), `${file}: ${src} is neither shipped nor in data/site-photos.json`);
      /* a frame turns into a plate; a gallery tile leaves the gallery */
      assert.match(img.getAttribute('onerror') || '', /closest\('(\[data-ph\]|li)'\)\.classList\.add\('is-gone'\)/, `${file}: ${src} has no fallback`);
    }
  }
  const css = read('assets/micro.css');
  assert.match(css, /\.m-ph\.is-gone img\{display:none\}/);
  assert.doesNotMatch(css, /m-card--ink/, 'no black card (owner: no black grounds)');
});

test('the privacy policy says what the law gives a person, and how to use it', () => {
  const html = read('privacy.html');
  const text = new JSDOM(html).window.document.querySelector('main').textContent.replace(/\s+/g, ' ');
  assert.match(text, /Digital Personal Data Protection Act, 2023/);
  assert.match(text, /Data Protection Board of India/);
  assert.match(text, /Last updated \d{1,2} [A-Z][a-z]+ 20\d\d/);
  for (const right of ['For a summary', 'To correct it', 'To erase it', 'To stop', 'To hear a grievance', 'To nominate']) assert.ok(text.includes(right), right);
  for (const who of ['CCAvenue', 'PayPal', 'Google Cloud']) assert.ok(text.includes(who), `names ${who}`);
  assert.match(text, /sets no cookies of its own/);
  assert.match(html, /href="mailto:gandhim@exmpls\.sansad\.in"/);
});

test('careers: every opening has a description, a card and a choice in the form, and the server knows each', () => {
  const html = read('careers.html');
  const doc = new JSDOM(html).window.document;
  const F = require('../lib/submission-fields.js');
  const ids = F.KINDS['PFA-J'].options.roleId;
  assert.equal(ids.length, 5);
  for (const id of ids) {
    assert.ok(doc.querySelector(`article.opening#${id}[data-role="${id}"] .facts`), `${id}: description`);
    assert.ok(doc.querySelector(`.jobs [data-show-role="${id}"]`) && doc.querySelector(`.jobs [data-apply="${id}"]`), `${id}: card`);
    assert.ok(doc.querySelector(`#jobForm input[name="roleId"][value="${id}"]`), `${id}: in the form`);
    assert.match(html, new RegExp(`\\{ id: '${id}', title: '`), `${id}: in PFA_ROLES`);
  }
  /* each role's own part of the form, disabled when it is not the role, so
     it is neither required nor sent */
  for (const [id, sel] of [['zonal-head', '#zones'], ['veterinary-team', 'input[name="level"]'], ['internship', '#dates']]) {
    assert.ok(doc.querySelector(`[data-for="${id}"] ${sel}`), `${id}: ${sel}`);
  }
  assert.match(html, /i\.disabled = !on;/);
  /* the deep links the old site and the footer use land on a role */
  assert.ok(doc.getElementById('veterinary-team') && doc.getElementById('internship'));
});

test('the microsites are in the header, the footer, the sitemap and search', () => {
  const header = read('assets/chrome-header.html');
  const footer = read('assets/chrome-footer.html');
  const sitemap = read('sitemap.xml');
  const index = JSON.parse(read('search-index.json'));
  const urls = new Set(index.pages.map((p) => String(p.url).replace(/^\//, '')));
  for (const file of Object.keys(SITES)) {
    if (file !== 'privacy.html') assert.ok(header.includes(file), `${file} in the header`);
    assert.ok(footer.includes(`href="${file}"`), `${file} in the footer`);
    assert.ok(sitemap.includes(file.replace(/\.html$/, '')), `${file} in the sitemap`);
    assert.ok([...urls].some((u) => u.split('#')[0] === file), `${file} in the search index`);
  }
});

test('no long dashes on any microsite (owner: plain hyphens only)', () => {
  for (const file of Object.keys(SITES).concat(['careers.html', 'assets/chrome-footer.html', 'assets/micro.css', 'assets/micro.js'])) {
    const bad = read(file).match(/[\u2013\u2014]/g);
    assert.equal(bad, null, `${file} carries ${bad && bad.length} long dash(es)`);
  }
});
