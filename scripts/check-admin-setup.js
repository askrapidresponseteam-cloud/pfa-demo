#!/usr/bin/env node
/* Why can nobody sign in to /admin.html?
 *
 *   npm run check:admin
 *   npm run check:admin -- you@peopleforanimalsindia.org
 *
 * The panel refuses every failed sign-in with the same sentence, on purpose:
 * telling an unauthenticated caller whether the account is unknown, unclaimed
 * or unverifiable hands an attacker a map. That leaves whoever runs the
 * deployment with no way to tell those apart, so this asks the same questions
 * from a machine that already holds the service account, where there is
 * nothing to leak.
 *
 * Run it the way grant-admin.js is run:
 *
 *   npx vercel env pull .env.production.local --environment=production
 *   set -a; source .env.production.local; set +a
 *   npm run check:admin -- you@peopleforanimalsindia.org
 *   rm .env.production.local
 *
 * It prints no secret. Project ids and email addresses only, and the private
 * key is reported as present or absent, never shown.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const results = [];

function ok(label, detail) { results.push({ state: 'ok', label, detail }); }
function bad(label, detail, fix) { results.push({ state: 'bad', label, detail, fix }); }
function note(label, detail) { results.push({ state: 'note', label, detail }); }

/* The project the browser signs in to. Public: it sits in page source. */
function webProjectId() {
  try {
    const src = fs.readFileSync(path.join(ROOT, 'assets', 'firebase-config.js'), 'utf8');
    const found = /PFA_FIREBASE_PROJECT_ID\s*=\s*'([^']+)'/.exec(src);
    return found ? found[1] : '';
  } catch (_) {
    return '';
  }
}

function serverProjectId() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try { return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON).project_id || ''; } catch (_) { return ''; }
  }
  return String(process.env.FIREBASE_PROJECT_ID || '').trim();
}

function checkEnvironment() {
  /* Mirror the precedence in lib/firebase.js exactly: if
     FIREBASE_SERVICE_ACCOUNT_JSON is set and parses, it wins and the three
     separate variables are never read. Checking them anyway reported a
     failure on a setup that works, which is worse than not checking at all. */
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const stale = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']
    .filter((key) => /^\[SENSITIVE\]$/i.test(String(process.env[key] || '').trim()));

  if (raw) {
    if (/^\[SENSITIVE\]$/i.test(String(raw).trim())) {
      bad('Service account', 'FIREBASE_SERVICE_ACCOUNT_JSON holds the text [SENSITIVE], not a real value',
        'That is what `vercel env pull` writes for a value stored as a Vercel Secret. Take a key straight from '
        + 'Firebase: console > Project settings > Service accounts > Generate new private key.');
      return false;
    }
    try {
      const parsed = JSON.parse(raw);
      if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
        bad('Service account', 'the JSON is missing project_id, client_email or private_key',
          'Use the file Firebase generates, unedited.');
        return false;
      }
      ok('Service account', `${parsed.client_email}, from FIREBASE_SERVICE_ACCOUNT_JSON`);
    } catch (_) {
      bad('Service account', 'FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON',
        'Quote it when exporting: export FIREBASE_SERVICE_ACCOUNT_JSON="$(cat key.json)"');
      return false;
    }
    if (stale.length) {
      note('Ignored', `${stale.join(', ')} hold the text [SENSITIVE], left over from \`vercel env pull\``
        + ' - the JSON above takes precedence, so they change nothing here. Clear them to avoid confusion:'
        + ` unset ${stale.join(' ')}`);
    }
    return true;
  }

  const parts = {
    FIREBASE_PROJECT_ID: String(process.env.FIREBASE_PROJECT_ID || '').trim(),
    FIREBASE_CLIENT_EMAIL: String(process.env.FIREBASE_CLIENT_EMAIL || '').trim(),
    FIREBASE_PRIVATE_KEY: String(process.env.FIREBASE_PRIVATE_KEY || '')
  };

  /* `vercel env pull` cannot read a value stored as a Vercel Secret, and
     writes the word [SENSITIVE] in its place rather than failing. The file
     looks complete, every variable is set, and every one of them is a lie. */
  if (stale.length) {
    bad('Service account', `${stale.join(', ')} holds the text [SENSITIVE], not a real value`,
      'These are stored as Vercel Secrets, which `vercel env pull` cannot read. Take a service account key '
      + 'straight from Firebase instead: console > Project settings > Service accounts > Generate new private key, '
      + 'then: export FIREBASE_SERVICE_ACCOUNT_JSON="$(cat /path/to/that.json)"');
    return false;
  }

  const missing = Object.keys(parts).filter((key) => !parts[key]);
  if (missing.length) {
    bad('Service account', `not set: ${missing.join(', ')}`,
      'Without these the server cannot verify any sign-in, and every attempt looks like "not an administrator".');
    return false;
  }
  ok('Service account', `${parts.FIREBASE_CLIENT_EMAIL}, private key present`);

  /* A private key pasted without its newlines is the commonest way this breaks
     while looking correct in the dashboard. */
  const key = parts.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
  if (!/^-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(key.trim())) {
    bad('Private key', 'does not start with a PEM header',
      'Paste the whole key including the BEGIN and END lines. Vercel accepts \\n escapes.');
  } else if (!key.includes('\n')) {
    bad('Private key', 'is a single line with no newlines',
      'Keep the \\n escapes, or paste the key with real line breaks.');
  } else {
    ok('Private key', 'looks like a PEM key');
  }
  return true;
}

function checkProjects() {
  const web = webProjectId();
  const server = serverProjectId();
  if (!web) { note('Browser project', 'could not read assets/firebase-config.js'); return; }
  if (!server) { note('Server project', 'no project id in the environment'); return; }
  if (web === server) {
    ok('Projects match', web);
  } else {
    bad('Projects do not match', `browser signs in to "${web}", server holds "${server}"`,
      'Every token will be valid and none of them for this server. Granting the claim again will not help. '
      + 'Make FIREBASE_PROJECT_ID and assets/firebase-config.js name the same project.');
  }
}

async function checkFirebase(email) {
  let auth;
  try {
    require('../lib/firebase').getDb();
    auth = require('firebase-admin/auth').getAuth();
    ok('Firebase Admin SDK', 'initialised');
  } catch (error) {
    bad('Firebase Admin SDK', (error && error.message) || String(error),
      'Nothing below can be checked until this works.');
    return;
  }

  let admins = 0;
  let disabledAdmins = 0;
  try {
    let pageToken;
    do {
      const page = await auth.listUsers(1000, pageToken);
      page.users.forEach((user) => {
        if (user.customClaims && user.customClaims.admin === true) {
          admins += 1;
          if (user.disabled) disabledAdmins += 1;
        }
      });
      pageToken = page.pageToken;
    } while (pageToken);
  } catch (error) {
    bad('Reading accounts', (error && error.message) || String(error),
      'The service account may lack the Firebase Authentication Admin role.');
    return;
  }

  if (admins === 0) {
    bad('Administrators', 'no account carries the admin claim',
      'Nobody can sign in until one does: node scripts/grant-admin.js you@peopleforanimalsindia.org');
  } else {
    ok('Administrators', `${admins} ${admins === 1 ? 'account carries' : 'accounts carry'} the claim`
      + (disabledAdmins ? `, of which ${disabledAdmins} disabled` : ''));
  }

  if (email) {
    try {
      const user = await auth.getUserByEmail(email);
      const claims = user.customClaims || {};
      if (user.disabled) {
        bad(email, 'the account is disabled', 'Re-enable it in Firebase console > Authentication > Users.');
      } else if (claims.admin !== true) {
        bad(email, 'exists, but carries no admin claim',
          `node scripts/grant-admin.js ${email}`);
      } else {
        /* Read the role the same way the guard does where that is available,
           and fall back to the raw claim so this script can be dropped into an
           older tree on its own and still answer. */
        let access;
        try {
          access = require('../lib/admin-modules').accessOf(claims);
        } catch (_) {
          access = claims.role === 'staff'
            ? { role: 'staff', modules: Array.isArray(claims.modules) ? claims.modules : [] }
            : { role: 'super', modules: [], legacy: claims.role !== 'super' };
        }
        ok(email, `admin, role ${access.role}`
          + (access.role === 'super' ? ', everything including People' : `, sections: ${access.modules.join(', ') || 'none'}`)
          + (access.legacy ? ' (claim predates roles)' : ''));
        if (access.role === 'staff' && !access.modules.length) {
          bad(email, 'is staff with no sections',
            'They will sign in and see nothing. Give them sections on the People page.');
        }
      }
      const providers = (user.providerData || []).map((p) => p.providerId);
      if (providers.length && !providers.includes('password')) {
        note(email, `signs in with ${providers.join(', ')}, not a password`);
      }
    } catch (error) {
      if (/no user record/i.test((error && error.message) || '')) {
        bad(email, 'no Firebase Auth user with that email',
          'Create them first: Firebase console > Authentication > Users > Add user. The password is set there, not here.');
      } else {
        bad(email, (error && error.message) || String(error));
      }
    }
  }

  try {
    await require('../lib/firebase').getDb().collection('counters').doc('submissions').get();
    ok('Firestore', 'reachable');
  } catch (error) {
    bad('Firestore', (error && error.message) || String(error),
      'Sign-in may still work; the registers will not load.');
  }
}

async function main() {
  const email = process.argv.slice(2).find((value) => value.includes('@')) || '';

  checkEnvironment();
  checkProjects();
  await checkFirebase(email);

  const mark = { ok: '  ok  ', bad: ' FAIL ', note: ' note ' };
  console.log('\nAdmin sign-in check\n');
  results.forEach((r) => {
    console.log(`[${mark[r.state]}] ${r.label}: ${r.detail}`);
    if (r.fix) console.log(`           ${r.fix}`);
  });

  const failed = results.filter((r) => r.state === 'bad');
  if (!failed.length) {
    console.log('\nNothing here would stop a sign-in.');
    if (!email) console.log('Pass an email to check one account: npm run check:admin -- you@example.org');
    process.exit(0);
  }
  console.log(`\n${failed.length} thing${failed.length === 1 ? '' : 's'} would stop a sign-in. Fix the first and run this again.`);
  process.exit(1);
}

main().catch((error) => {
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});
