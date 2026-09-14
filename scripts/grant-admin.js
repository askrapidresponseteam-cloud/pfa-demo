#!/usr/bin/env node
/* Grant or revoke administrator access from the command line.
 *
 * This makes someone a SUPER admin: everything in the panel, including the
 * People page, from which they can give other people access to chosen
 * modules. Use it for the first administrator; use People for the rest.
 *
 *   node scripts/grant-admin.js you@peopleforanimalsindia.org
 *   node scripts/grant-admin.js you@peopleforanimalsindia.org --revoke
 *
 * Run from a machine that has the Firebase service account in its environment
 * (the same variables Vercel uses). There is deliberately no web route that
 * does this: the first administrator has to be created by someone holding the
 * service account, so there is never a moment when an unprotected endpoint
 * could mint one.
 *
 * The person must already exist as a Firebase Auth user. Create them in the
 * Firebase console under Authentication > Users, with an email and password,
 * then run this to add the claim.
 *
 * A claim is read from the token, so anyone already signed in must sign out
 * and back in - or wait for their token to refresh - before it takes effect.
 */

'use strict';

const { setAdminClaim } = require('../lib/admin-auth');

async function main() {
  const args = process.argv.slice(2).filter(Boolean);
  const revoke = args.includes('--revoke');
  const who = args.find((value) => !value.startsWith('--'));

  if (!who) {
    console.error('Usage: node scripts/grant-admin.js <email-or-uid> [--revoke]');
    process.exit(1);
  }

  try {
    const result = await setAdminClaim(who, !revoke);
    console.log(
      result.admin
        ? `Granted admin to ${result.email || result.uid}.`
        : `Revoked admin from ${result.email || result.uid}.`
    );
    console.log('They must sign out and back in for it to take effect.');
    process.exit(0);
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    if (/no user record/i.test(message)) {
      console.error(`No Firebase Auth user for "${who}".`);
      console.error('Create them first: Firebase console > Authentication > Users > Add user.');
    } else if (/Missing Firebase environment/i.test(message)) {
      console.error(message);
      console.error('Export the same FIREBASE_* variables Vercel holds, then run this again.');
    } else {
      console.error(message);
    }
    process.exit(1);
  }
}

main();
