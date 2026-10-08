'use strict';

/* Field notes: the newsroom takes work done for animals from whoever did it
   (PFA-W), the desk publishes each one from the admin panel, and the page
   shows what was published through /api/field-notes.

   What these pin. The read path serves a headline, an account, a place, a
   kind of work, a credit and a link - and never the mobile, email or IP the
   sender gave in confidence. It reads the key the intake actually writes.
   The admin's publish action takes a field note as it takes a film. And the
   page carries the form wired the only way this site allows: through the
   shared helper, success only on a reference from the server. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const route = require('../lib/routes/field-notes.js');
const wall = require('../lib/routes/wall.js');
const FIELDS = require('../lib/submission-fields.js');

const doc = (id, record) => ({ id, data: () => record });

test('a published field note leaves as what a reader needs, and nothing the sender gave in confidence', () => {
  const out = route.toFieldNote(doc('PFA-W-2026-00007', {
    kind: 'PFA-W',
    wall: { published: true },
    createdAt: '2026-09-16T05:00:00.000Z',
    fields: {
      type: 'A rescue', title: 'Eleven dogs back on their street', story: 'Carried out of the flooded lane on Sunday night and kept at the school until the water went down.',
      city: 'Udupi', organisation: 'Malpe Feeders Collective', name: 'Asha Rao',
      mobile: '9876543210', email: 'asha@example.com', url: 'https://www.instagram.com/p/abc'
    },
    ip: '10.0.0.1', contactKeys: ['m:9876543210']
  }));
  assert.ok(out, 'a complete note is served');
  assert.deepEqual(Object.keys(out).sort(), ['at', 'city', 'credit', 'photos', 'ref', 'story', 'title', 'type', 'url']);
  assert.equal(out.photos, 0, 'a note with no attachments reports none');
  assert.equal(out.credit, 'Malpe Feeders Collective', 'the group is credited when one was named');
  const flat = JSON.stringify(out);
  assert.ok(!/9876543210|asha@example\.com|10\.0\.0\.1|contactKeys/.test(flat), 'the projection leaked a contact detail');
});

test('the credit falls back to the person when no group was named, and a note with no account is not served', () => {
  const named = route.toFieldNote(doc('a', { fields: { title: 'T', story: 'S long enough', name: 'Asha Rao' } }));
  assert.equal(named.credit, 'Asha Rao');
  assert.equal(route.toFieldNote(doc('b', { fields: { title: 'Only a headline', name: 'X' } })), null);
  assert.equal(route.toFieldNote(doc('c', { fields: { story: 'Only an account', name: 'X' } })), null);
});

test('a link is passed through only if a browser can open it safely', () => {
  assert.equal(route.safeUrl('https://example.org/post/1'), 'https://example.org/post/1');
  assert.equal(route.safeUrl('javascript:alert(1)'), '');
  assert.equal(route.safeUrl('not a url'), '');
  const out = route.toFieldNote(doc('d', { fields: { title: 'T', story: 'An account of it', name: 'X', url: 'javascript:alert(1)' } }));
  assert.equal(out.url, undefined);
});

test('the read paths read the key the intake writes', () => {
  /* lib/routes/pfa-submissions.js stores the sender\u2019s fields under
     `fields`. The wall read `data` and so served nothing however many films
     were approved; both routes now read the stored key first. */
  assert.match(read('lib/routes/pfa-submissions.js'), /fields:\s*clean/);
  const film = wall.toFilm(doc('PFA-S-2026-00001', {
    kind: 'PFA-S', wall: { published: true },
    fields: { url: 'https://www.youtube.com/watch?v=abc123', title: 'A film', name: 'Asha Rao', wall: 'Long form, over three minutes' }
  }));
  assert.ok(film && film.yt === 'abc123', 'a film stored the way the intake stores it must reach the wall');
});

test('the desk publishes a field note with the same action that puts a film on the wall', () => {
  const src = read('lib/routes/admin/case.js');
  assert.match(src, /action === 'wall'/);
  assert.match(src, /data\.kind !== 'PFA-S' && data\.kind !== 'PFA-W'/, 'the publish action must accept a field note');
  const panel = read('admin.html');
  assert.match(panel, /Publish in the newsroom/, 'the panel needs a button that says what it does to a field note');
  assert.match(panel, /c\.kind !== 'PFA-S' && c\.kind !== 'PFA-W'/, 'and it has to appear for one');
});

test('the newsroom carries no form, and the paths behind it still stand', () => {
  /* The field-note form left the page on 16 Sep 2026 when the newsroom went
     back to its editorial cut. What must hold now: the page cannot thank
     anyone for a note it never sent, because it takes nothing at all; and
     the read path, the publish action and the photo route above keep
     serving the notes already filed. If the form returns, this test goes
     back to pinning the wiring: id="fieldForm", PFAForms.wire with
     kind PFA-W, the /api/field-notes strip and its waiting state, and the
     PFA-W spec in lib/submission-fields.js. */
  const html = read('newsroom.html');
  assert.doesNotMatch(html, /<form\b/i, 'a form is back on the newsroom without its wiring being reviewed');
  assert.doesNotMatch(html, /PFAForms\.(wire|submit)\(/, 'the page calls the helper with no form to wire');
  assert.equal(FIELDS.specFor('PFA-W'), null,
    'PFA-W has a spec again but no page sends it; restore the form or retire the spec');
});

test('a photograph is served only for a published note, and never for anything else', async () => {
  const fbPath = require.resolve('../lib/firebase.js');
  const routePath = require.resolve('../lib/routes/field-note-photo.js');
  const store = {
    'PFA-W-2026-00007': { kind: 'PFA-W', wall: { published: true }, attachments: 1 },
    'PFA-W-2026-00008': { kind: 'PFA-W', wall: { published: false }, attachments: 1 },
    'PFA-CR-2026-00009': { kind: 'PFA-CR', wall: { published: true }, attachments: 1 }
  };
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  const fake = { db: () => ({ collection: () => ({ doc: (ref) => ({
    get: async () => ({ exists: !!store[ref], data: () => store[ref] }),
    collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => ({ bytes: png, contentType: 'image/png' }) }) }) })
  }) }) }) };
  const saved = require.cache[fbPath];
  require.cache[fbPath] = { id: fbPath, filename: fbPath, loaded: true, exports: fake };
  delete require.cache[routePath];
  const photo = require(routePath);          /* loaded with the stand-in in place */
  const run = (ref) => new Promise((res) => { let status = 0; const headers = {};
    photo({ method: 'GET', query: { ref, n: '1' } }, { setHeader(k, v) { headers[k] = v; }, set statusCode(v) { status = v; }, get statusCode() { return status; }, end(b) { res({ status, headers, body: b }); } }); });
  try {
    const ok = await run('PFA-W-2026-00007');
    assert.equal(ok.status, 200); assert.equal(ok.headers['Content-Type'], 'image/png');
    assert.equal((await run('PFA-W-2026-00008')).status, 404, 'unpublished: as if it did not exist');
    assert.equal((await run('PFA-CR-2026-00009')).status, 400, 'a cruelty report\'s photographs are never reachable here');
    assert.equal((await run('PFA-W-2026-99999')).status, 404, 'a note that is not there');
  } finally {
    if (saved) require.cache[fbPath] = saved; else delete require.cache[fbPath];
    delete require.cache[routePath];
  }
});

test('the route is registered where /api/* is resolved', () => {
  const api = read('api/index.js');
  assert.match(api, /'field-notes': '\.\/field-notes\.js'/);
  assert.match(api, /'field-notes': \(\) => require\('\.\.\/lib\/routes\/field-notes\.js'\)/);
  assert.match(api, /'field-note-photo': '\.\/field-note-photo\.js'/);
  assert.match(api, /'field-note-photo': \(\) => require\('\.\.\/lib\/routes\/field-note-photo\.js'\)/);
});
