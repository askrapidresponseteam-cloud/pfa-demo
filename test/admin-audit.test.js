'use strict';

/* The audit log. Individual routes already recorded fragments - `handledBy` on
   a status change, the conversation on a case - but there was no single place
   that answered "what did this person do last Tuesday". These pin the four
   things that make the log worth having: it is append-only, the actor comes
   from the verified token, it never breaks the action it describes, and every
   route that changes something writes to it. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const audit = require('../lib/admin-audit.js');

const WHO = { uid: 'u-1', email: 'asha@pfa.test', name: 'Asha Kumar', role: 'super', mode: 'firebase' };

function fakeDb() {
  const written = [];
  const created = new Set();
  return {
    written,
    collection(name) {
      return {
        doc(id) {
          return {
            create(entry) {
              if (created.has(id)) return Promise.reject(new Error('ALREADY_EXISTS'));
              created.add(id);
              written.push({ collection: name, id, entry });
              return Promise.resolve();
            }
          };
        }
      };
    }
  };
}

test('an entry names the actor from the token, never from the request', async () => {
  const db = fakeDb();
  await audit.record(WHO, { module: 'submissions', action: 'status', subject: 'PFA-C-2026-00042', detail: 'new to handled' },
    { headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }, body: { actor: 'someone-else@evil.test' } },
    { getDb: () => db, now: () => 1750000000000 });

  assert.equal(db.written.length, 1);
  const entry = db.written[0].entry;
  assert.equal(entry.actor.email, 'asha@pfa.test');
  assert.equal(entry.actor.uid, 'u-1');
  assert.equal(entry.subject, 'PFA-C-2026-00042');
  assert.equal(entry.outcome, 'done');
  assert.equal(entry.ip, '203.0.113.9', 'the first hop is the caller');
  assert.ok(!JSON.stringify(entry).includes('evil.test'), 'nothing from the body reaches the log');
});

test('ids sort newest-last by name, so the log reads in order without an index', () => {
  const early = audit.entryId(1750000000000);
  const later = audit.entryId(1750000000001);
  assert.ok(early < later);
  assert.notEqual(audit.entryId(1750000000000), audit.entryId(1750000000000), 'two in the same millisecond do not collide');
});

test('a write is create(), so an entry can never be silently rewritten', () => {
  const src = fs.readFileSync(path.join(ROOT, 'lib', 'admin-audit.js'), 'utf8');
  assert.match(src, /\.create\(entry\)/);
  assert.ok(!/\.set\(|\.update\(/.test(src), 'set() or update() would let an entry be overwritten');
  assert.ok(!/\.delete\(/.test(src), 'nothing in the log may be removed');
});

test('a log that cannot be written does not break the action it describes', async () => {
  const broken = { collection() { throw new Error('firestore is down'); } };
  const entry = await audit.record(WHO, { module: 'store', action: 'store-state', subject: 'veg' }, { headers: {} },
    { getDb: () => broken, now: () => 1750000000000 });
  assert.equal(entry.action, 'store-state', 'it resolves rather than throwing');

  const rejecting = { collection: () => ({ doc: () => ({ create: () => Promise.reject(new Error('permission denied')) }) }) };
  await audit.record(WHO, { module: 'store', action: 'store-state', subject: 'off' }, { headers: {} },
    { getDb: () => rejecting, now: () => 1750000000001 });
});

test('every admin route that changes something writes to the log', () => {
  const missing = [];
  /* The routes that only read are exempt; these five each make a change. */
  for (const file of ['case.js', 'people.js', 'store.js', 'cards.js', 'submission-status.js']) {
    const src = fs.readFileSync(path.join(ROOT, 'lib', 'routes', 'admin', file), 'utf8');
    if (!/audit\.record\(/.test(src)) missing.push(file);
  }
  assert.deepEqual(missing, [], `these change records without recording who did it: ${missing.join(', ')}`);
});

test('the log is readable only by a super admin', () => {
  const src = fs.readFileSync(path.join(ROOT, 'lib', 'routes', 'admin', 'records.js'), 'utf8');
  assert.match(src, /audit: 'people'/, 'the audit register is guarded by People, which is super-only');
  const modules = require('../lib/admin-modules.js');
  assert.ok(modules.SUPER_ONLY.includes('people'));
  assert.equal(modules.canAccess({ role: 'staff', modules: ['submissions'] }, 'people'), false);
});

test('reading pages newest first and reports its own cursor', async () => {
  const docs = [];
  for (let i = 0; i < 4; i += 1) {
    docs.push({ id: `entry-${i}`, data: () => ({ action: 'status', actor: { email: 'asha@pfa.test' } }) });
  }
  const db = {
    collection: () => ({
      orderBy(field, direction) { assert.equal(direction, 'desc'); return this; },
      limit() { return this; },
      startAfter() { return this; },
      async get() { return { docs }; }
    })
  };
  const page = await audit.read(db, { limit: 3 });
  assert.equal(page.rows.length, 3);
  assert.equal(page.cursor, 'entry-2', 'the cursor is the last row returned');
  assert.equal(page.done, false);
});

test('auth comes from the firebase-admin subpath, never the root namespace', () => {
  /* `require('firebase-admin').auth()` relies on the legacy namespace
     surviving the package's exports map. Under Node 22 and later it does not
     resolve to a callable and throws "admin.auth is not a function". Inside
     identify() that throw is caught and reported as a bad credential, so every
     sign-in fails and the panel says the account is not an administrator -
     which no amount of granting claims will fix. lib/firebase.js has always
     used the subpaths; the auth callers must too. */
  const offenders = [];
  const roots = [path.join(ROOT, 'lib'), path.join(ROOT, 'scripts'), path.join(ROOT, 'api')];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.name.endsWith('.js')) continue;
      const src = fs.readFileSync(full, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
      src.split('\n').forEach((line, i) => {
        if (/require\(['"]firebase-admin['"]\)/.test(line)) {
          offenders.push(`${path.relative(ROOT, full)}:${i + 1}`);
        }
      });
    }
  };
  roots.forEach(walk);
  assert.deepEqual(offenders, [], `use require('firebase-admin/auth').getAuth() instead:\n  ${offenders.join('\n  ')}`);
});
