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

/* ---- the three public read paths, through the REAL lib/firebase.js -------

   8 Oct 2026 (review D6): field-note-photo.js, field-notes.js and wall.js
   called firebase.db(), which lib/firebase.js has never exported. Every
   photograph was a 404 and both lists were always empty. The test above this
   one used to swap in a stand-in firebase module that did have db(), so it
   passed. These drive the real module on the in-memory Firestore
   (_setDbForTests), so a wrong name fails here. */

const { memoryFirestore } = require('./_memory-firestore');
const firebase = require('../lib/firebase');
const FILES = require('../lib/file-store');
const photoRoute = require('../lib/routes/field-note-photo.js');

const PNG = Buffer.from('89504e470d0a1a0a0000000d494844520000000100000001', 'hex');

function drive(handler, query = {}) {
  return new Promise((resolve, reject) => {
    const out = { status: 0, headers: {}, body: undefined };
    const response = {
      get statusCode() { return out.status; }, set statusCode(v) { out.status = v; },
      setHeader(k, v) { out.headers[String(k).toLowerCase()] = v; },
      getHeader(k) { return out.headers[String(k).toLowerCase()]; },
      end(b) { out.body = b; try { out.json = JSON.parse(String(b)); } catch (_) { out.json = null; } resolve(out); }
    };
    Promise.resolve(handler({ method: 'GET', url: '/api', query, headers: {} }, response)).catch(reject);
  });
}

/* A shared cache may keep an answer no longer than this, so a note or film
   the desk takes down leaves the page within minutes, not a day. */
function shared(header) {
  const h = String(header || '');
  const num = (k) => { const m = new RegExp(`(?:^|,)\\s*${k}=(\\d+)`).exec(h); return m ? Number(m[1]) : null; };
  return { sMaxAge: num('s-maxage'), maxAge: num('max-age'), swr: num('stale-while-revalidate') || 0, noStore: /no-store/.test(h) };
}

async function newsroom(db) {
  const notes = db.collection('submissions');
  await notes.doc('PFA-W-2026-00007').set({ kind: 'PFA-W', wall: { published: true }, attachments: 2, createdAt: '2026-09-16T05:00:00.000Z',
    fields: { title: 'Eleven dogs back on their street', story: 'Carried out of the flooded lane on Sunday night.', city: 'Udupi', name: 'Asha Rao', mobile: '9876543210' } });
  await notes.doc('PFA-W-2026-00007').collection('attachments').doc('1').set({ bytes: PNG, contentType: 'image/png', size: PNG.length });
  await notes.doc('PFA-W-2026-00008').set({ kind: 'PFA-W', wall: { published: false }, attachments: 1,
    fields: { title: 'Not yet', story: 'Waiting for the desk.', name: 'X' } });
  await notes.doc('PFA-W-2026-00008').collection('attachments').doc('1').set({ bytes: PNG, contentType: 'image/png', size: PNG.length });
  await notes.doc('PFA-CR-2026-00009').set({ kind: 'PFA-CR', wall: { published: true }, attachments: 1 });
  await notes.doc('PFA-S-2026-00010').set({ kind: 'PFA-S', wall: { published: true }, fields: { url: 'https://www.youtube.com/watch?v=abc123', title: 'A film', name: 'Asha Rao' } });
  await notes.doc('PFA-S-2026-00011').set({ kind: 'PFA-S', wall: { published: false }, fields: { url: 'https://www.youtube.com/watch?v=zzz999', title: 'Taken down', name: 'B' } });
}

test('a photograph is served only for a published note, and never for anything else', async (t) => {
  const db = memoryFirestore();
  firebase._setDbForTests(db);
  t.after(() => firebase._setDbForTests(null));
  await newsroom(db);

  const ok = await drive(photoRoute, { ref: 'PFA-W-2026-00007', n: '1' });
  assert.equal(ok.status, 200, 'a published note’s photograph is served');
  assert.equal(ok.headers['content-type'], 'image/png');
  assert.ok(Buffer.from(ok.body).equals(PNG));
  assert.equal((await drive(photoRoute, { ref: 'PFA-W-2026-00008', n: '1' })).status, 404, 'unpublished: as if it did not exist');
  assert.equal((await drive(photoRoute, { ref: 'PFA-CR-2026-00009', n: '1' })).status, 400, 'a cruelty report’s photographs are never reachable here');
  assert.equal((await drive(photoRoute, { ref: 'PFA-W-2026-99999', n: '1' })).status, 404, 'a note that is not there');
  assert.equal((await drive(photoRoute, { ref: 'PFA-W-2026-00007', n: '2' })).status, 404, 'a photograph that is not there');
});

test('a published note’s photograph kept in the Storage bucket is served from there', async (t) => {
  const db = memoryFirestore();
  firebase._setDbForTests(db);
  const files = new Map([['submissions/PFA-W-2026-00007/1', PNG]]);
  let refuse = null;
  FILES._setBucket(() => ({ name: 'pfa-new-website.firebasestorage.app', bucket: { file: (p) => ({
    async save(b) { files.set(p, Buffer.from(b)); },
    async download() { if (refuse) { const e = refuse; refuse = null; throw e; } if (!files.has(p)) throw Object.assign(new Error('No such object'), { code: 404 }); return [files.get(p)]; }
  }) } }));
  const realError = console.error; console.error = () => {};
  t.after(() => { FILES._reset(); firebase._setDbForTests(null); console.error = realError; });
  await db.collection('submissions').doc('PFA-W-2026-00007').set({ kind: 'PFA-W', wall: { published: true }, attachments: 1 });
  await db.collection('submissions').doc('PFA-W-2026-00007').collection('attachments').doc('1')
    .set({ storage: 'gcs', bucket: 'pfa-new-website.firebasestorage.app', path: 'submissions/PFA-W-2026-00007/1', contentType: 'image/png', size: PNG.length });

  const ok = await drive(photoRoute, { ref: 'PFA-W-2026-00007', n: '1' });
  assert.equal(ok.status, 200);
  assert.ok(Buffer.from(ok.body).equals(PNG));

  /* Storage says "not now": a 503 nobody caches, never a 404 a CDN would keep */
  refuse = Object.assign(new Error('Backend Error'), { code: 503 });
  const busy = await drive(photoRoute, { ref: 'PFA-W-2026-00007', n: '1' });
  assert.equal(busy.status, 503);
  assert.ok(shared(busy.headers['cache-control']).noStore, `cached as ${busy.headers['cache-control']}`);
});

test('the newsroom list and the wall list what is published, through the real database module', async (t) => {
  const db = memoryFirestore();
  firebase._setDbForTests(db);
  t.after(() => firebase._setDbForTests(null));
  await newsroom(db);

  const notes = await drive(route);
  assert.equal(notes.status, 200);
  assert.equal(notes.json.degraded, undefined, 'the list was read, not given up on');
  assert.deepEqual(notes.json.notes.map((n) => n.ref), ['PFA-W-2026-00007'], 'the published note, and only it');
  assert.equal(notes.json.notes[0].photos, 2);
  assert.ok(!JSON.stringify(notes.json).includes('9876543210'), 'no contact detail leaves');

  const films = await drive(wall);
  assert.equal(films.status, 200);
  assert.equal(films.json.degraded, undefined);
  assert.deepEqual(films.json.films.map((f) => f.ref), ['PFA-S-2026-00010'], 'the published film, and only it');
});

test('a shared cache keeps a photograph or a list for a minute, not a day', async (t) => {
  const db = memoryFirestore();
  firebase._setDbForTests(db);
  t.after(() => firebase._setDbForTests(null));
  await newsroom(db);

  for (const [name, res] of [
    ['photo', await drive(photoRoute, { ref: 'PFA-W-2026-00007', n: '1' })],
    ['field notes', await drive(route)],
    ['wall', await drive(wall)]
  ]) {
    assert.equal(res.status, 200, name);
    const c = shared(res.headers['cache-control']);
    assert.ok(c.sMaxAge !== null && c.sMaxAge <= 60, `${name}: s-maxage ${c.sMaxAge}`);
    assert.ok(c.maxAge !== null && c.maxAge <= 60, `${name}: max-age ${c.maxAge}`);
    assert.ok(c.swr <= 300, `${name}: stale-while-revalidate ${c.swr} keeps a withdrawn item up too long`);
  }

  /* an unpublished photo's 404 is kept briefly at most, so publishing shows it soon */
  const gone = await drive(photoRoute, { ref: 'PFA-W-2026-00008', n: '1' });
  assert.equal(gone.status, 404);
  const g = shared(gone.headers['cache-control']);
  assert.ok(g.noStore || (g.sMaxAge !== null && g.sMaxAge <= 60 && g.swr === 0), `404 cached as ${gone.headers['cache-control']}`);
});

test('when the database fails, the empty answer is logged and never cached', async (t) => {
  const broken = { collection() { throw new Error('14 UNAVAILABLE: deadline exceeded'); } };
  firebase._setDbForTests(broken);
  const logged = [];
  const realError = console.error;
  console.error = (...a) => logged.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
  t.after(() => { firebase._setDbForTests(null); console.error = realError; });

  const notes = await drive(route);
  assert.equal(notes.status, 200, 'the page still gets its waiting state');
  assert.equal(notes.json.degraded, true);
  assert.ok(shared(notes.headers['cache-control']).noStore, `cached as ${notes.headers['cache-control']}`);
  const films = await drive(wall);
  assert.equal(films.json.degraded, true);
  assert.ok(shared(films.headers['cache-control']).noStore, `cached as ${films.headers['cache-control']}`);
  const photo = await drive(photoRoute, { ref: 'PFA-W-2026-00007', n: '1' });
  assert.equal(photo.status, 503, 'not a 404 a CDN would keep');
  assert.ok(shared(photo.headers['cache-control']).noStore);
  assert.ok(logged.filter((l) => /UNAVAILABLE/.test(l)).length >= 3, 'each failure is in the log, not swallowed');
});

test('the route is registered where /api/* is resolved', () => {
  const api = read('api/index.js');
  assert.match(api, /'field-notes': '\.\/field-notes\.js'/);
  assert.match(api, /'field-notes': \(\) => require\('\.\.\/lib\/routes\/field-notes\.js'\)/);
  assert.match(api, /'field-note-photo': '\.\/field-note-photo\.js'/);
  assert.match(api, /'field-note-photo': \(\) => require\('\.\.\/lib\/routes\/field-note-photo\.js'\)/);
});
