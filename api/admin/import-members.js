/* POST /api/admin/import-members

   Bring an existing membership register into Firestore, from the spreadsheet
   the office already keeps.

   Body: { rows: [ {...}, ... ], dryRun: true|false }

   Three rules this route is built around:

   1. NOTHING IS WRITTEN UNTIL SOMEONE HAS SEEN WHAT WOULD HAPPEN.
      dryRun runs the whole thing (validation, duplicate detection, matching
      against Firestore) and writes not one document. The panel always runs a
      dry pass first, because an import of a few thousand people is not
      something to discover the shape of afterwards.

   2. RE-RUNNING IT CREATES NOTHING TWICE.
      Rows match existing members by mobile number, so importing the same
      sheet again updates instead of duplicating. An office that corrects
      three rows and re-uploads the whole file gets three updates.

   3. THE SHEET'S DATES ARE THE TRUTH.
      The previous importer stamped every member "valid for a year from
      today", which would have handed a free year to people who lapsed in
      2019 and overwritten the renewal dates the office actually holds.
      If the sheet carries a date, the sheet wins.

   Legacy member numbers are kept. New records get the canonical
   PFA-MBR-XXXXXXXX id because the login and the card expect that shape, but
   whatever number the office used before is stored alongside and stays
   searchable, so a member quoting an old card is still found. */

'use strict';

const { requireAdmin } = require('../../lib/admin-auth');
const { getDb, normalizedMobile, serverTimestamp } = require('../../lib/firebase');
const { createMemberId } = require('../../lib/pfa-ccavenue-flow');
const RULES = require('../../assets/field-rules.js');

const MAX_ROWS = 500;

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  if (request.body && typeof request.body === 'object') return Promise.resolve(request.body);
  return new Promise((resolve, reject) => {
    let raw = '';
    request.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 2000000) reject(new Error('That batch is too large.'));
    });
    request.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch (_) { reject(new Error('Body must be valid JSON.')); }
    });
    request.on('error', reject);
  });
}

function clean(value, max) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max || 200);
}

/* Spreadsheets hand back dates as text, as Date objects, or as Excel serial
   numbers. All three must land on the same ISO string, and anything that is
   none of them must be reported rather than guessed at. */
function toIso(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString();

  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d{1,6}(\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    if (serial > 20000 && serial < 60000) {
      const ms = Math.round((serial - 25569) * 86400 * 1000);
      const d = new Date(ms);
      return isNaN(d.getTime()) ? null : d.toISOString();
    }
  }

  /* dd/mm/yyyy is how Indian offices write dates; the Date constructor reads
     it as American and silently swaps the day and the month. */
  const dmy = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmy) {
    const d = dmy[1];
    const m = dmy[2];
    const y = dmy[3].length === 2 ? '20' + dmy[3] : dmy[3];
    const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    return isNaN(dt.getTime()) ? null : dt.toISOString();
  }

  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function plusYear(iso) {
  const d = new Date(iso);
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString();
}

async function findByMobile(db, mobile) {
  const snap = await db.collection('members').where('mobile', '==', mobile).limit(1).get();
  return snap.empty ? null : { id: snap.docs[0].id, data: snap.docs[0].data() || {} };
}

module.exports = async function handler(request, response) {
  const who = await requireAdmin(request, response);
  if (!who) return;

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendJson(response, 405, { ok: false, message: 'Import members with POST.' });
  }

  let db;
  try { db = getDb(); }
  catch (error) { return sendJson(response, 500, { ok: false, message: 'Firestore is not configured.' }); }

  try {
    const body = await readBody(request);
    const rows = Array.isArray(body.rows) ? body.rows : null;
    const dryRun = body.dryRun !== false;

    if (!rows || !rows.length) {
      return sendJson(response, 400, { ok: false, message: 'Send { rows: [...] }.' });
    }
    if (rows.length > MAX_ROWS) {
      return sendJson(response, 400, {
        ok: false,
        message: 'Send at most ' + MAX_ROWS + ' rows per request. The panel splits a large sheet into batches automatically.'
      });
    }

    const seenMobiles = new Map();
    const results = [];
    const writes = [];
    const now = new Date().toISOString();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {};
      const line = Number(row.__line) || (i + 1);
      const name = RULES.normaliseField('name', clean(row.name, 100));
      const mobile = normalizedMobile(row.mobile);
      const email = clean(row.email, 254).toLowerCase();

      const nameError = RULES.checkField('name', name, { required: true });
      if (nameError) { results.push({ line: line, status: 'error', reason: nameError, name: name }); continue; }

      const mobileError = RULES.checkField('mobile', mobile, { required: true });
      if (mobileError) { results.push({ line: line, status: 'error', reason: mobileError, name: name }); continue; }

      if (email) {
        const emailError = RULES.checkField('email', email, { required: false });
        if (emailError) { results.push({ line: line, status: 'error', reason: emailError, name: name }); continue; }
      }

      if (seenMobiles.has(mobile)) {
        results.push({
          line: line, status: 'duplicate', name: name,
          reason: 'Same mobile as row ' + seenMobiles.get(mobile) + ' in this sheet.'
        });
        continue;
      }
      seenMobiles.set(mobile, line);

      const memberSince = toIso(row.memberSince) || now;
      const validUntil = toIso(row.validUntil) || plusYear(memberSince);
      const legacyId = clean(row.legacyId || row.memberId, 60).toUpperCase();

      const existing = await findByMobile(db, mobile);

      /* No email means no way to send a sign-in code. The record still
         imports, but the panel counts these separately: they are exactly
         the people who will not be able to log in. */
      const canSignIn = Boolean(email);

      if (existing) {
        const patch = {
          name: name,
          email: email || existing.data.email || '',
          memberSince: memberSince,
          validUntil: validUntil,
          updatedAt: serverTimestamp()
        };
        if (legacyId) patch.legacyId = legacyId;
        writes.push({ ref: db.collection('members').doc(existing.id), data: patch, merge: true });
        results.push({
          line: line, status: 'update', name: name, memberId: existing.id, canSignIn: canSignIn,
          reason: 'Already on the register; details refreshed from the sheet.'
        });
      } else {
        const memberId = createMemberId();
        const record = {
          memberId: memberId,
          status: 'active',
          name: name,
          mobile: mobile,
          email: email,
          currency: 'INR',
          physicalCard: false,
          source: 'legacy-import',
          importedBy: (who && (who.email || who.mode)) || 'admin',
          memberSince: memberSince,
          validUntil: validUntil,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };
        if (legacyId) record.legacyId = legacyId;
        writes.push({ ref: db.collection('members').doc(memberId), data: record, merge: false });
        results.push({ line: line, status: 'create', name: name, memberId: memberId, legacyId: legacyId, canSignIn: canSignIn });
      }
    }

    const count = function (s) { return results.filter(function (r) { return r.status === s; }).length; };
    const summary = {
      rows: rows.length,
      create: count('create'),
      update: count('update'),
      duplicate: count('duplicate'),
      error: count('error'),
      noEmail: results.filter(function (r) {
        return (r.status === 'create' || r.status === 'update') && !r.canSignIn;
      }).length
    };

    if (dryRun) {
      return sendJson(response, 200, { ok: true, dryRun: true, summary: summary, results: results });
    }

    let written = 0;
    for (let i = 0; i < writes.length; i += 400) {
      const batch = db.batch();
      writes.slice(i, i + 400).forEach(function (w) {
        batch.set(w.ref, w.data, { merge: w.merge });
      });
      await batch.commit();
      written += Math.min(400, writes.length - i);
    }

    try {
      await db.collection('memberImportLog').add({
        at: Date.now(),
        admin: (who && (who.email || who.mode)) || 'admin',
        summary: summary
      });
    } catch (error) { /* the import itself must not fail on a logging error */ }

    return sendJson(response, 200, { ok: true, dryRun: false, written: written, summary: summary, results: results });
  } catch (error) {
    return sendJson(response, 500, { ok: false, message: error.message || 'That import failed.' });
  }
};
