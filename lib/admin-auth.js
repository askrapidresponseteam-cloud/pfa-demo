/* Admin authentication.

   There were two schemes in the codebase - an `x-admin-key` shared secret on
   the member import, and a `Bearer` shared token on caretaker shipments - and
   the import route's own comment called it "a minimal stopgap until a real
   admin panel/login exists". This is that login.

   The preferred credential is a Firebase ID token carrying an `admin: true`
   custom claim. That gives named people rather than one shared password, and
   it is the same claim `firestore.rules` already checks, so the panel and the
   database agree about who is an administrator instead of each deciding
   separately.

   The two shared secrets still work. Removing them in the same change that
   introduces the new path would take the running site down if a key were
   missed, so they stay, and `mode` in the result says which one let a caller
   in. Retire them once the panel is in use. */

const crypto = require('crypto');

function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length || left.length === 0) return false;
  return crypto.timingSafeEqual(left, right);
}

function bearerFrom(request) {
  const header = String((request.headers && request.headers.authorization) || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

/* Resolves to a descriptor of who is calling, or null. Never throws for a bad
   credential - a caller learns only that they are not authorised. */
async function identify(request) {
  const presented = bearerFrom(request);

  if (presented) {
    try {
      const admin = require('firebase-admin');
      require('./firebase').getDb();               // ensures initializeApp has run
      const decoded = await admin.auth().verifyIdToken(presented, true);
      if (decoded && decoded.admin === true) {
        return {
          mode: 'firebase',
          uid: decoded.uid,
          email: decoded.email || '',
          name: decoded.name || ''
        };
      }
      // A valid token without the claim is a signed-in member, not an admin.
      if (decoded) return null;
    } catch (error) {
      // Fall through: it may be one of the legacy shared tokens instead.
    }

    const legacyToken = String(process.env.PFA_ADMIN_TOKEN || '');
    if (legacyToken && timingSafeEqual(presented, legacyToken)) {
      return { mode: 'legacy-token', uid: 'shared-token', email: '', name: 'Shared admin token' };
    }
  }

  const configuredKey = String(process.env.PFA_ADMIN_API_KEY || '').trim();
  const suppliedKey = String((request.headers && request.headers['x-admin-key']) || '').trim();
  if (configuredKey && suppliedKey && timingSafeEqual(suppliedKey, configuredKey)) {
    return { mode: 'legacy-key', uid: 'shared-key', email: '', name: 'Shared admin key' };
  }

  return null;
}

/* Guard for a route handler. Returns the admin descriptor, or writes the
   refusal and returns null - so a caller writes:

     const who = await requireAdmin(request, response);
     if (!who) return; */
async function requireAdmin(request, response) {
  const who = await identify(request);
  if (who) return who;

  response.statusCode = 401;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify({
    code: 'UNAUTHORISED',
    message: 'Sign in as an administrator to use this.'
  }));
  return null;
}

/* Grants or removes the admin claim. Deliberately not exposed as a route:
   the first administrator is created from the command line with the service
   account, so there is no moment where an unprotected endpoint could mint one. */
async function setAdminClaim(uidOrEmail, isAdmin) {
  const admin = require('firebase-admin');
  require('./firebase').getDb();
  const auth = admin.auth();
  const user = String(uidOrEmail).includes('@')
    ? await auth.getUserByEmail(String(uidOrEmail))
    : await auth.getUser(String(uidOrEmail));

  const claims = Object.assign({}, user.customClaims || {});
  if (isAdmin) claims.admin = true; else delete claims.admin;
  await auth.setCustomUserClaims(user.uid, claims);
  return { uid: user.uid, email: user.email || '', admin: Boolean(isAdmin) };
}

module.exports = { identify, requireAdmin, setAdminClaim, timingSafeEqual };
