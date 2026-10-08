/* Admin authentication.

   There were two schemes in the codebase - an `x-admin-key` shared secret on
   the member import, and a `Bearer` shared token on caregiver shipments - and
   the import route's own comment called it "a minimal stopgap until a real
   admin panel/login exists". This is that login.

   The only credential is a Firebase ID token carrying an `admin: true` custom
   claim. That gives named people rather than one shared password, and it is
   the same claim `firestore.rules` already checks, so the panel and the
   database agree about who is an administrator instead of each deciding
   separately.

   The two shared secrets are retired. `PFA_ADMIN_TOKEN` and
   `PFA_ADMIN_API_KEY` each opened every admin route with no named identity
   and no per-module limit, so nothing done with one could be attributed to a
   person. Nothing here reads either of them now.

   `PFA_ADMIN_TOKEN` still exists elsewhere for the caregiver email worker and
   the shipment webhook, which are machine triggers with their own narrow
   handlers. Holding it no longer opens the panel or any /api/admin route. */

const thisModule = module;   // captured before `module` is shadowed as a parameter below
const crypto = require('crypto');
const { accessOf, canAccess, labelOf, normaliseModules } = require('./admin-modules');

/* A claim travels inside the ID token, which is minted for an hour. So that a
   change made on the People page takes effect in the next minute rather than
   the next hour, the user record is read directly and remembered briefly. */
const CLAIMS_TTL_MS = 60 * 1000;
const claimsCache = new Map();

async function freshClaims(auth, uid, fallback) {
  const hit = claimsCache.get(uid);
  if (hit && hit.until > Date.now()) return hit.claims;
  try {
    const user = await auth.getUser(uid);
    const claims = user.customClaims || {};
    claimsCache.set(uid, { claims, until: Date.now() + CLAIMS_TTL_MS });
    if (claimsCache.size > 500) claimsCache.clear();
    return claims;
  } catch (error) {
    return fallback || {};
  }
}

/* Kept and still exported: the caregiver worker routes compare their own
   trigger token, and a constant-time compare is the only kind worth having. */
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
   credential - a caller learns only that they are not authorised.

   The refusal a caller sees is deliberately identical whether the token was
   junk, the account has no claim, or the server cannot verify anything at all;
   telling an unauthenticated caller which would hand an attacker a map. The
   difference matters enormously to whoever runs the deployment, though, so it
   goes to the function log instead, where only they can read it. When nobody
   can sign in, that log line is the answer, and `npm run check:admin` asks the
   same questions from a machine holding the service account. */
async function identify(request) {
  const presented = bearerFrom(request);
  if (!presented) return null;

  let auth;
  try {
    require('./firebase').getDb();               // ensures initializeApp has run
    /* The subpath, not the root export. `require('firebase-admin').auth()`
       depends on the legacy namespace surviving the package's exports map, and
       under Node 22 and later it does not resolve to a callable - it throws
       "admin.auth is not a function". Thrown here it is indistinguishable from
       a bad token, so every sign-in fails and the panel says the account is not
       an administrator. lib/firebase.js has always used the subpaths. */
    auth = require('firebase-admin/auth').getAuth();
  } catch (error) {
    /* Not a bad credential: the server cannot check any credential. Every
       sign-in fails this way until it is fixed, and it looks from the outside
       exactly like nobody being an administrator. */
    console.error('admin sign-in cannot be verified at all:', (error && error.message) || error);
    return null;
  }

  let decoded;
  try {
    decoded = await auth.verifyIdToken(presented, true);
  } catch (error) {
    const message = String((error && error.message) || '');
    if (/incorrect "aud"|incorrect "iss"|audience|does not correspond/i.test(message)) {
      /* The browser signed in to one Firebase project and the server holds the
         service account of another, so every token is valid and none of them
         is for us. Silent and total, and it survives any number of grants. */
      console.error('admin sign-in rejected: the token is for a different Firebase project than the service account.', message);
    }
    return null;
  }
  if (!decoded) return null;

  const claims = await freshClaims(auth, decoded.uid, decoded);
  if (claims.admin === true) {
    const access = accessOf(claims);
    return {
      mode: 'firebase',
      uid: decoded.uid,
      email: decoded.email || '',
      name: decoded.name || '',
      role: access.role,
      modules: access.modules,
      legacy: Boolean(access.legacy)
    };
  }
  // A valid token without the claim is a signed-in member, not an admin.
  console.error('admin sign-in rejected: no admin claim on', decoded.uid, decoded.email || '');
  return null;
}

/* Guard for a route handler. Returns the admin descriptor, or writes the
   refusal and returns null - so a caller writes:

     const who = await requireAdmin(request, response);
     if (!who) return; */
/* Headers every admin response carries, set here because every admin route
   goes through this guard and none of them was setting them itself.

   - nosniff: an attachment is served from an admin route, and a browser that
     guesses its type can be made to run it.
   - DENY: an admin panel in an iframe is a clickjack. There is no legitimate
     reason to frame this.
   - no-referrer: an admin URL can carry a case reference; it should not leak
     to whatever is linked from a record.
   - noindex: nothing under /api/admin belongs in a search result. */
function adminHeaders(response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Robots-Tag', 'noindex, nofollow');
  response.setHeader('Cache-Control', 'no-store');
}

/* A brake on guessing. Keyed on the caller and counted only on failure, so a
   working panel never trips it and one attacker cannot lock the office out.
   It mattered most while a single guessable string granted everything; with
   those gone it still slows an attempt to work through stolen ID tokens. */
const FAIL_WINDOW_MS = 10 * 60 * 1000;
const FAIL_LIMIT = 20;
const failures = new Map();

function callerKey(request) {
  const headers = (request && request.headers) || {};
  const forwarded = String(headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || (request && request.socket && request.socket.remoteAddress) || 'unknown';
}

function tooManyFailures(request) {
  const key = callerKey(request);
  const hit = failures.get(key);
  if (!hit || hit.resetAt <= Date.now()) return false;
  return hit.count >= FAIL_LIMIT;
}

function noteFailure(request) {
  const key = callerKey(request);
  const now = Date.now();
  const hit = failures.get(key);
  if (!hit || hit.resetAt <= now) failures.set(key, { count: 1, resetAt: now + FAIL_WINDOW_MS });
  else hit.count += 1;
  if (failures.size > 5000) failures.clear();
}

async function requireAdmin(request, response, module) {
  adminHeaders(response);

  if (tooManyFailures(request)) {
    response.statusCode = 429;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Retry-After', '600');
    response.end(JSON.stringify({ code: 'TOO_MANY_ATTEMPTS', message: 'Too many failed attempts. Try again later.' }));
    return null;
  }

  /* Through the exports object so the identity step can be replaced in a test
     without a shared secret existing for that purpose. `thisModule` is
     captured at the top of the file because this function's third parameter
     is itself called `module` and shadows the CommonJS one. */
  const who = await thisModule.exports.identify(request);
  if (who && canAccess(who, module)) return who;
  if (!who) noteFailure(request);

  response.statusCode = who ? 403 : 401;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(who
    ? { code: 'FORBIDDEN', module, message: `Your account does not include ${labelOf(module)}. A super admin can add it under People.` }
    : { code: 'UNAUTHORISED', message: 'Sign in as an administrator to use this.' }));
  return null;
}

/* Grants or removes the admin claim. Deliberately not exposed as a route:
   the first administrator is created from the command line with the service
   account, so there is no moment where an unprotected endpoint could mint one. */
async function setAdminClaim(uidOrEmail, isAdmin) {
  require('./firebase').getDb();
  const auth = require('firebase-admin/auth').getAuth();
  const user = String(uidOrEmail).includes('@')
    ? await auth.getUserByEmail(String(uidOrEmail))
    : await auth.getUser(String(uidOrEmail));

  const claims = Object.assign({}, user.customClaims || {});
  if (isAdmin) { claims.admin = true; claims.role = 'super'; delete claims.modules; }
  else { delete claims.admin; delete claims.role; delete claims.modules; }
  await auth.setCustomUserClaims(user.uid, claims);
  claimsCache.delete(user.uid);
  return { uid: user.uid, email: user.email || '', admin: Boolean(isAdmin) };
}

/* What the People page does: give an existing user a role and modules, or
   take the panel away from them. */
async function setAccess(auth, uid, { role, modules }) {
  const user = await auth.getUser(uid);
  const claims = Object.assign({}, user.customClaims || {});
  if (!role) { delete claims.admin; delete claims.role; delete claims.modules; }
  else if (role === 'super') { claims.admin = true; claims.role = 'super'; delete claims.modules; }
  else { claims.admin = true; claims.role = 'staff'; claims.modules = normaliseModules(modules); }
  await auth.setCustomUserClaims(user.uid, claims);
  claimsCache.delete(user.uid);
  return accessOf(claims);
}

module.exports = { identify, requireAdmin, adminHeaders, tooManyFailures, setAdminClaim, setAccess, timingSafeEqual, canAccess, _clearFailures: () => failures.clear(), _clearClaimsCache: () => claimsCache.clear() };
