/* GET /api/admin/staff -> { ok, staff: [{ uid, email, name }] }

   Who a case can be assigned to: every account with the admin claim, which
   is the same claim that lets someone into the panel. Nothing is stored;
   Firebase Auth is the list. */

'use strict';

const { requireAdmin } = require('../../admin-auth');

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

async function listAdmins() {
  require('../../firebase').getDb();
  const auth = require('firebase-admin/auth').getAuth();
  const staff = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    page.users.forEach((u) => {
      if (u.customClaims && u.customClaims.admin === true && !u.disabled) {
        staff.push({ uid: u.uid, email: u.email || '', name: u.displayName || '' });
      }
    });
    pageToken = page.pageToken;
  } while (pageToken);
  return staff.sort((a, b) => a.email.localeCompare(b.email));
}

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED' });
  }
  const who = await requireAdmin(request, response, 'submissions');
  if (!who) return;
  try {
    const staff = who.mode === 'firebase' ? await listAdmins() : [];
    if (!staff.some((s) => s.email === who.email) && who.email) staff.unshift({ uid: who.uid, email: who.email, name: who.name || '' });
    return sendJson(response, 200, { ok: true, staff });
  } catch (error) {
    console.error('admin staff failed', error && error.message);
    return sendJson(response, 200, { ok: true, staff: who.email ? [{ uid: who.uid, email: who.email, name: who.name || '' }] : [], partial: true });
  }
};
