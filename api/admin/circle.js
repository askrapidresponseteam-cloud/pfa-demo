/* GET  /api/admin/circle?action=posts&limit=&q=
   GET  /api/admin/circle?action=replies&post=
   GET  /api/admin/circle?action=profiles&q=
   POST /api/admin/circle  {action:'delete-post', id}
   POST /api/admin/circle  {action:'delete-reply', post, id}
   POST /api/admin/circle  {action:'remove-profile', id, purge}
   POST /api/admin/circle  {action:'extend-membership', id, months}

   Moderation for The Circle, behind the same admin session as every other
   panel route. Two principles:

   1. Deletion is real. A removed post takes its replies with it, because a
      thread of replies to nothing is worse than the post was. Removing a
      member from the Circle can optionally purge everything they wrote.
   2. Every destructive action lands in circleModerationLog with who did it,
      what, and when, because a moderation power nobody can audit is how
      moderation goes wrong.

   Search is an in-memory filter over the fetched page, same trade-off as
   records.js: Firestore cannot substring-search, and the Circle would need
   to be very large before that matters. */

'use strict';

const { requireAdmin } = require('../../lib/admin-auth');
const { getDb } = require('../../lib/firebase');
const memberAuth = require('../../lib/member-auth');

const MAX_LIMIT = 100;

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let raw = '';
    request.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 20000) reject(new Error('Request too large.'));
    });
    request.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch (error) { reject(new Error('Bad JSON.')); }
    });
    request.on('error', reject);
  });
}

function millis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const n = Number(value);
  if (n) return n;
  const d = new Date(value);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

async function log(db, who, action, target, detail) {
  try {
    await db.collection('circleModerationLog').add({
      at: Date.now(),
      admin: (who && (who.email || who.uid || who.mode)) || 'unknown',
      action,
      target: String(target || ''),
      detail: detail || null
    });
  } catch (error) { /* the action itself must not fail on a logging error */ }
}

/* ---- reads ---------------------------------------------------------------- */

async function listPosts(db, query) {
  const limit = Math.min(Number(query.limit) || 40, MAX_LIMIT);
  const q = String(query.q || '').trim().toLowerCase();

  const snap = await db.collection('circlePosts')
    .orderBy('at', 'desc').limit(limit).get();

  let rows = snap.docs.map((doc) => {
    const d = doc.data() || {};
    return {
      id: doc.id,
      authorId: d.authorId || '',
      authorName: d.authorName || '',
      circleId: d.circleId || '',
      kind: d.kind || 'note',
      text: String(d.text || '').slice(0, 500),
      at: millis(d.at),
      replyCount: Number(d.replyCount) || 0,
      closed: Boolean(d.closed),
      state: d.state || ''
    };
  });

  if (q) {
    rows = rows.filter((r) =>
      r.text.toLowerCase().includes(q) ||
      r.authorId.toLowerCase().includes(q) ||
      r.authorName.toLowerCase().includes(q) ||
      r.circleId.toLowerCase().includes(q));
  }

  /* Names for authors whose posts do not carry one. */
  const missing = [...new Set(rows.filter((r) => !r.authorName).map((r) => r.authorId))].filter(Boolean);
  const profiles = await Promise.all(missing.map((id) =>
    db.collection('circleProfiles').doc(id).get().catch(() => null)));
  const names = {};
  profiles.forEach((p, i) => { if (p && p.exists) names[missing[i]] = (p.data() || {}).name || ''; });
  rows.forEach((r) => { if (!r.authorName) r.authorName = names[r.authorId] || ''; });

  return { ok: true, posts: rows };
}

async function listReplies(db, query) {
  const postId = String(query.post || '').trim();
  if (!postId) return { ok: false, status: 400, message: 'Which post?' };
  const snap = await db.collection('circlePosts').doc(postId)
    .collection('replies').orderBy('at', 'asc').limit(200).get();
  return {
    ok: true,
    replies: snap.docs.map((doc) => {
      const d = doc.data() || {};
      return {
        id: doc.id,
        authorId: d.authorId || '',
        authorName: d.authorName || '',
        text: String(d.text || '').slice(0, 500),
        at: millis(d.at)
      };
    })
  };
}

async function listProfiles(db, query) {
  const q = String(query.q || '').trim().toLowerCase();
  const snap = await db.collection('circleProfiles').limit(300).get();

  const rows = await Promise.all(snap.docs.map(async (doc) => {
    const d = doc.data() || {};
    let validUntil = '', standing = 'unknown', graceDaysLeft = 0;
    try {
      const member = await db.collection('members').doc(doc.id).get();
      if (member.exists) {
        const m = member.data() || {};
        validUntil = m.validUntil || '';
        standing = memberAuth.standing(m);
        graceDaysLeft = standing === 'grace' ? memberAuth.graceDaysLeft(m) : 0;
      }
    } catch (error) { /* profile still listed; standing stays unknown */ }
    return {
      id: doc.id,
      name: d.name || '',
      handle: d.handle || '',
      state: d.state || '',
      city: d.city || '',
      validUntil, standing, graceDaysLeft
    };
  }));

  const out = q
    ? rows.filter((r) =>
        r.id.toLowerCase().includes(q) || r.name.toLowerCase().includes(q) ||
        r.handle.toLowerCase().includes(q) || r.state.toLowerCase().includes(q))
    : rows;

  return { ok: true, profiles: out };
}

/* ---- writes --------------------------------------------------------------- */

async function deleteReplies(db, postRef) {
  let removed = 0;
  for (;;) {
    const snap = await postRef.collection('replies').limit(400).get();
    if (snap.empty) return removed;
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    removed += snap.size;
    if (snap.size < 400) return removed;
  }
}

async function deletePost(db, who, body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, status: 400, message: 'Which post?' };
  const ref = db.collection('circlePosts').doc(id);
  const doc = await ref.get();
  if (!doc.exists) return { ok: false, status: 404, message: 'That post is already gone.' };
  const replies = await deleteReplies(db, ref);
  await ref.delete();
  await log(db, who, 'delete-post', id, {
    authorId: (doc.data() || {}).authorId || '',
    replies,
    excerpt: String((doc.data() || {}).text || '').slice(0, 140)
  });
  return { ok: true, deleted: id, replies };
}

async function deleteReply(db, who, body) {
  const postId = String(body.post || '').trim();
  const id = String(body.id || '').trim();
  if (!postId || !id) return { ok: false, status: 400, message: 'Which reply?' };
  const postRef = db.collection('circlePosts').doc(postId);
  const ref = postRef.collection('replies').doc(id);
  const doc = await ref.get();
  if (!doc.exists) return { ok: false, status: 404, message: 'That reply is already gone.' };
  await ref.delete();
  try {
    await db.runTransaction(async (tx) => {
      const post = await tx.get(postRef);
      if (!post.exists) return;
      const n = Number((post.data() || {}).replyCount) || 0;
      tx.update(postRef, { replyCount: Math.max(0, n - 1) });
    });
  } catch (error) { /* count drift is survivable; the reply is gone */ }
  await log(db, who, 'delete-reply', postId + '/' + id, {
    authorId: (doc.data() || {}).authorId || '',
    excerpt: String((doc.data() || {}).text || '').slice(0, 140)
  });
  return { ok: true, deleted: id };
}

async function removeProfile(db, who, body) {
  const id = String(body.id || '').trim();
  const purge = Boolean(body.purge);
  if (!id) return { ok: false, status: 400, message: 'Which member?' };

  let postsRemoved = 0, repliesRemoved = 0;

  if (purge) {
    /* Their posts, with each post's replies. */
    for (;;) {
      const snap = await db.collection('circlePosts')
        .where('authorId', '==', id).limit(50).get();
      if (snap.empty) break;
      for (const doc of snap.docs) {
        repliesRemoved += await deleteReplies(db, doc.ref);
        await doc.ref.delete();
        postsRemoved += 1;
      }
      if (snap.size < 50) break;
    }
    /* Their replies under other people's posts. */
    const theirs = await db.collectionGroup('replies')
      .where('authorId', '==', id).limit(500).get();
    for (const doc of theirs.docs) {
      const postRef = doc.ref.parent.parent;
      await doc.ref.delete();
      repliesRemoved += 1;
      if (postRef) {
        try {
          await db.runTransaction(async (tx) => {
            const post = await tx.get(postRef);
            if (!post.exists) return;
            const n = Number((post.data() || {}).replyCount) || 0;
            tx.update(postRef, { replyCount: Math.max(0, n - 1) });
          });
        } catch (error) { /* parent may be gone */ }
      }
    }
  }

  /* The profile and its joined list. */
  const profileRef = db.collection('circleProfiles').doc(id);
  const joined = await profileRef.collection('joined').limit(200).get().catch(() => null);
  if (joined && !joined.empty) {
    const batch = db.batch();
    joined.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
  await profileRef.delete();

  await log(db, who, 'remove-profile', id, { purge, postsRemoved, repliesRemoved });
  return { ok: true, removed: id, purge, postsRemoved, repliesRemoved };
}

async function extendMembership(db, who, body) {
  const id = String(body.id || '').trim();
  const months = Math.min(Math.max(Number(body.months) || 12, 1), 60);
  if (!id) return { ok: false, status: 400, message: 'Which member?' };

  const ref = db.collection('members').doc(id);
  const doc = await ref.get();
  if (!doc.exists) return { ok: false, status: 404, message: 'No membership record with that number.' };

  const current = memberAuth.validUntilMs(doc.data() || {});
  const base = new Date(Math.max(current, Date.now()));
  base.setMonth(base.getMonth() + months);
  const validUntil = base.toISOString();

  await ref.update({ validUntil, renewedByAdmin: Date.now() });
  await log(db, who, 'extend-membership', id, { months, validUntil });
  return { ok: true, id, validUntil, standing: 'active' };
}

/* ---- route ---------------------------------------------------------------- */

module.exports = async function handler(request, response) {
  const who = await requireAdmin(request, response);
  if (!who) return;

  let db;
  try { db = getDb(); }
  catch (error) { return sendJson(response, 500, { ok: false, message: 'Firestore is not configured.' }); }

  try {
    if (request.method === 'GET') {
      const query = request.query || {};
      const action = String(query.action || 'posts');
      const result =
        action === 'posts'    ? await listPosts(db, query) :
        action === 'replies'  ? await listReplies(db, query) :
        action === 'profiles' ? await listProfiles(db, query) :
        { ok: false, status: 400, message: 'Unknown action.' };
      return sendJson(response, result.ok ? 200 : (result.status || 400), result);
    }

    if (request.method === 'POST') {
      const body = await readBody(request);
      const action = String(body.action || '');
      const result =
        action === 'delete-post'       ? await deletePost(db, who, body) :
        action === 'delete-reply'      ? await deleteReply(db, who, body) :
        action === 'remove-profile'    ? await removeProfile(db, who, body) :
        action === 'extend-membership' ? await extendMembership(db, who, body) :
        { ok: false, status: 400, message: 'Unknown action.' };
      return sendJson(response, result.ok ? 200 : (result.status || 400), result);
    }

    return sendJson(response, 405, { ok: false, message: 'GET or POST.' });
  } catch (error) {
    return sendJson(response, 500, { ok: false, message: error.message || 'That request failed.' });
  }
};
