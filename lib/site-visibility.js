/* What the public site shows: which pages, and which parts of pages, are
   hidden from view.

   Owner, 8 Oct 2026: "Ensure the admin panel has full visibility controls
   for the public website. Admin should be able to show/hide any section or
   content module - including Units, Laws, Acts, Policies, About, Services,
   etc. - without code changes. Changes should reflect on the public site
   immediately, with each section having a simple Visible / Hidden toggle."

   The pieces, and where each lives:

     assets/site-modules.json   everything that can be hidden: every public
                                page, the menu group it sits in, and its
                                sections. Generated from the pages by
                                scripts/build-site-modules.js, never kept by
                                hand, so a new section is on the list the day
                                it is written (`--check` fails while stale).
     siteSettings/visibility    the state, in Firestore:
                                  { hidden: { pages: { id: true },
                                              modules: { 'page#module': true } },
                                    version, updatedAt, updatedBy, marks, last }
     /api/admin/site            the panel: reads the list and the state,
                                changes the state (lib/routes/admin/site.js)
     /api/site-visibility       the public site: reads the state, cached ten
                                seconds at the edge (lib/routes/site-visibility.js)
     assets/site-visibility.js  turns the state into one <style> on every
                                page before it paints

   Hidden means hidden from view, not removed: the content stays in the page
   source, as the panel tells whoever uses it. Nothing here deletes anything;
   showing a page again brings it back exactly as it was. */

'use strict';

const COLLECTION = 'siteSettings';
const DOC = 'visibility';

/* Pages that cannot be hidden, and why. The reasons are shown in the panel
   beside a toggle that is not there. `parts: true` locks every section of the
   page as well, because hiding any of them would break the same thing.
   assets/site-visibility.js keeps the same three names and ignores them too
   (test/site-visibility.test.js holds the two lists together). */
const LOCKED = {
  index: {
    parts: false,
    reason: 'The home page is where every visitor starts, and where a hidden page sends them, so it is always shown. Its sections can be hidden.'
  },
  track: {
    parts: true,
    reason: 'People follow the reference numbers in PFA’s emails here. Hiding it, or any part of it, would break every one of those links.'
  },
  search: {
    parts: true,
    reason: 'Site search must always answer. Pages and sections hidden here are already left out of its results.'
  }
};

const PAGE_ID = /^[a-z0-9][a-z0-9-]*$/;
const MODULE_ID = /^[a-z0-9][a-z0-9-]*#[A-Za-z][A-Za-z0-9_-]*$/;

/* ---- the registry -------------------------------------------------------

   Read once per instance. A deployment without the file (a Firebase bundle
   built before assets/site-modules.json was added to it) still serves the
   public route, which needs only the state; the panel says what is missing. */
let registryCache;
function registry() {
  if (registryCache !== undefined) return registryCache;
  try {
    registryCache = require('../assets/site-modules.json');
  } catch (error) {
    console.error('site visibility: assets/site-modules.json could not be read', error && error.message);
    registryCache = null;
  }
  return registryCache;
}
function _setRegistryForTests(value) { registryCache = value === undefined ? undefined : value; }

/* page id -> page, and 'page#module' -> { page, module }, from the registry. */
function catalogue(reg) {
  const pages = new Map();
  const modules = new Map();
  ((reg && reg.pages) || []).forEach((page) => {
    pages.set(page.id, page);
    (page.modules || []).forEach((m) => modules.set(`${page.id}#${m.id}`, { page, module: m }));
  });
  return { pages, modules };
}

/* Why this cannot be hidden, or '' when it can. */
function lockOf(kind, id) {
  const pageId = kind === 'page' ? id : String(id).split('#')[0];
  const lock = LOCKED[pageId];
  if (!lock) return '';
  if (kind === 'page' || lock.parts) return lock.reason;
  return '';
}

/* ---- the state ----------------------------------------------------------- */

function emptyState() {
  return { hidden: { pages: {}, modules: {} }, version: 0, updatedAt: null, updatedBy: null, marks: {}, last: [] };
}

/* Whatever is stored, as a well-formed state. Keys that are not ids, values
   that are not exactly true, and locked pages are dropped rather than trusted:
   a hand edit in the Firestore console cannot hide the home page. */
function normalise(data) {
  const out = emptyState();
  const d = data && typeof data === 'object' ? data : {};
  const hidden = d.hidden && typeof d.hidden === 'object' ? d.hidden : {};
  Object.keys(hidden.pages || {}).forEach((id) => {
    if (hidden.pages[id] === true && PAGE_ID.test(id) && !lockOf('page', id)) out.hidden.pages[id] = true;
  });
  Object.keys(hidden.modules || {}).forEach((id) => {
    if (hidden.modules[id] === true && MODULE_ID.test(id) && !lockOf('module', id)) out.hidden.modules[id] = true;
  });
  out.version = Number.isFinite(Number(d.version)) ? Math.max(0, Math.floor(Number(d.version))) : 0;
  out.updatedAt = typeof d.updatedAt === 'string' ? d.updatedAt : null;
  out.updatedBy = d.updatedBy && typeof d.updatedBy === 'object'
    ? { email: String(d.updatedBy.email || ''), name: String(d.updatedBy.name || '') } : null;
  if (d.marks && typeof d.marks === 'object') {
    Object.keys(d.marks).forEach((key) => {
      const m = d.marks[key];
      if (m && typeof m === 'object') out.marks[key] = { visible: m.visible === true, by: String(m.by || ''), at: String(m.at || '') };
    });
  }
  out.last = Array.isArray(d.last) ? d.last.slice(0, 20) : [];
  return out;
}

/* What the public site is told: ids only, sorted, nothing about who. */
function publicView(state) {
  const s = normalise(state);
  return {
    version: s.version,
    pages: Object.keys(s.hidden.pages).sort(),
    modules: Object.keys(s.hidden.modules).sort()
  };
}

function docRef(db) { return db.collection(COLLECTION).doc(DOC); }

async function readState(db) {
  const snap = await docRef(db).get();
  return normalise(snap.exists ? snap.data() : null);
}

/* ---- changing it ---------------------------------------------------------

   A request names one change { kind, id, visible } or several { changes }.
   Each is checked against the registry before anything is written, and the
   whole request is refused if any one is wrong: half a bulk change is worse
   than none, because nobody asked for that half.

   One exception to "not on the list": showing again something that is
   hidden and has since left the pages (a section taken out of a page while
   it was hidden). That only ever removes an entry, and the panel lists such
   entries so they can be cleared. `state` is what is stored now. */
function parseChanges(body, reg, state) {
  const b = body && typeof body === 'object' ? body : {};
  const raw = Array.isArray(b.changes) ? b.changes : [{ kind: b.kind, id: b.id, visible: b.visible }];
  if (!raw.length) return { error: { status: 400, code: 'NOTHING_TO_CHANGE', message: 'Say what to show or hide.' } };
  if (raw.length > 400) return { error: { status: 400, code: 'TOO_MANY', message: 'That is more changes than the site has sections.' } };
  const { pages, modules } = catalogue(reg);
  const seen = new Set();
  const changes = [];
  for (const c of raw) {
    const kind = c && c.kind;
    const id = c && typeof c.id === 'string' ? c.id.trim() : '';
    if (kind !== 'page' && kind !== 'module') return { error: { status: 400, code: 'BAD_KIND', message: 'Each change is to a page or to a section of one.' } };
    if (typeof c.visible !== 'boolean') return { error: { status: 400, code: 'BAD_VISIBLE', message: 'Say whether it should be visible or hidden.' } };
    const known = kind === 'page' ? pages.get(id) : modules.get(id);
    const stored = normalise(state).hidden[kind === 'page' ? 'pages' : 'modules'];
    const leftover = !known && c.visible === true && stored[id] === true;
    if (!id || id.length > 160 || (!known && !leftover)) {
      return { error: { status: 400, code: 'UNKNOWN', message: `There is no ${kind === 'page' ? 'page' : 'section'} called "${id.slice(0, 80)}" on the site.` } };
    }
    const lock = lockOf(kind, id);
    if (lock) return { error: { status: 409, code: 'LOCKED', message: lock } };
    if (seen.has(`${kind}:${id}`)) continue;
    seen.add(`${kind}:${id}`);
    changes.push({
      kind, id, visible: c.visible,
      label: leftover ? `${id} (no longer on the site)`
        : kind === 'page' ? `${known.title} (${known.file})` : `${known.page.title}: ${known.module.label}`
    });
  }
  return { changes };
}

/* One transaction: read the state, apply every change, write it whole.
   Two people toggling at once both land, in some order, because the second
   transaction re-reads what the first wrote. Returns what actually changed:
   asking for what is already so changes nothing and is not logged. */
async function applyChanges(db, who, changes, now) {
  const at = new Date(now || Date.now()).toISOString();
  const by = (who && (who.email || who.uid)) || 'unknown';
  return db.runTransaction(async (tx) => {
    const ref = docRef(db);
    const snap = await tx.get(ref);
    const before = normalise(snap.exists ? snap.data() : null);
    const after = normalise(before);
    const done = [];
    changes.forEach((c) => {
      const map = c.kind === 'page' ? after.hidden.pages : after.hidden.modules;
      const wasHidden = map[c.id] === true;
      if (wasHidden === !c.visible) return;
      if (c.visible) delete map[c.id]; else map[c.id] = true;
      after.marks[`${c.kind}:${c.id}`] = { visible: c.visible, by, at };
      done.push({ kind: c.kind, id: c.id, label: c.label, from: wasHidden ? 'hidden' : 'visible', to: c.visible ? 'visible' : 'hidden' });
    });
    if (!done.length) return { state: before, done };
    after.version = before.version + 1;
    after.updatedAt = at;
    after.updatedBy = { email: (who && who.email) || '', name: (who && who.name) || '' };
    after.last = done.slice(0, 20).map((d) => ({ kind: d.kind, id: d.id, label: d.label, from: d.from, to: d.to }));
    tx.set(ref, after);
    return { state: after, done };
  });
}

/* ---- the public answer ---------------------------------------------------

   Every page view asks, so each instance keeps the answer five seconds on
   top of the ten the edge keeps it. If Firestore cannot be read the answer is
   "nothing hidden" and says it is unavailable; it is not remembered here, and
   the route lets the edge keep it only a moment. assets/chrome.js keeps the
   browser's last good answer when told the setting is unavailable, so an
   outage shows everything to a new visitor and changes nothing for one who
   has been here before. */
const MEMORY_MS = 5000;
const READ_TIMEOUT_MS = 2500;
let memory = null;

function withTimeout(promise, ms) {
  let timer;
  const late = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error('timed out reading the visibility setting')), ms);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

async function publicState(deps) {
  const now = (deps && deps.now && deps.now()) || Date.now();
  if (memory && memory.until > now) return memory.body;
  try {
    const getDb = (deps && deps.getDb) || require('./firebase').getDb;
    const state = await withTimeout(Promise.resolve().then(() => readState(getDb())), (deps && deps.timeoutMs) || READ_TIMEOUT_MS);
    const body = publicView(state);
    memory = { until: now + MEMORY_MS, body };
    return body;
  } catch (error) {
    console.warn('site visibility could not be read; showing everything', (error && error.message) || error);
    return { version: 0, pages: [], modules: [], unavailable: true };
  }
}

/* A change made on this instance is served by it at once. */
function forget() { memory = null; }

module.exports = {
  COLLECTION, DOC, LOCKED, MEMORY_MS,
  registry, catalogue, lockOf, emptyState, normalise, publicView, readState,
  parseChanges, applyChanges, publicState, forget,
  _setRegistryForTests
};
