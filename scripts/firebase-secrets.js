#!/usr/bin/env node
'use strict';

/* Names, in functions/.env, exactly the secrets that exist in Secret Manager.
 *
 *   node scripts/firebase-secrets.js            (run by npm run deploy:firebase)
 *
 * Firebase mounts a secret only into a function that names it, and naming one
 * that was never created fails the whole functions deploy. On 7 Oct 2026
 * functions/index.js began naming PFA_SMTP_PASS and CRON_SECRET always, so on a
 * project without either, no new API could ever be deployed and the admin
 * panel stayed on whatever broken build was live.
 *
 * This asks the project which of the known secrets exist and writes that list
 * as PFA_FUNCTION_SECRETS, keeping every other line of functions/.env. A
 * secret that does not exist yet is skipped with a note: the feature that
 * reads it stays off, and the rest of the API still deploys. Set it with
 * `firebase functions:secrets:set NAME` and deploy again to turn it on.
 *
 * If the project cannot be asked (not logged in, no network), functions/.env
 * is left exactly as it was and the deploy goes ahead with it.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const PROJECT = 'pfa-new-website';
const ENV = path.join(__dirname, '..', 'functions', '.env');
const KNOWN = [
  'PFA_SMTP_PASS', 'PFA_IMAP_PASS', 'CRON_SECRET',
  'CCAVENUE_WORKING_KEY', 'CCAVENUE_ACCESS_CODE', 'CCAVENUE_MERCHANT_ID',
  'PFA_ADMIN_TOKEN', 'PFA_AUTH_PEPPER', 'PFA_MAIL_API_KEY',
  'PFA_SHOPIFY_ADMIN_TOKEN', 'PFA_SHOPIFY_WEBHOOK_SECRET'
];

function cli(args) {
  const direct = spawnSync('firebase', args, { encoding: 'utf8' });
  if (!direct.error) return direct;
  return spawnSync('npx', ['--yes', 'firebase-tools'].concat(args), { encoding: 'utf8' });
}

function exists(name) {
  const r = cli(['functions:secrets:get', name, '--project', PROJECT]);
  if (r.error) return null;
  if (r.status === 0) return true;
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  if (/not found|does not exist|404|NOT_FOUND/i.test(out)) return false;
  return null;   // anything else (login, network): unknown
}

const found = [];
const absent = [];
for (const name of KNOWN) {
  const state = exists(name);
  if (state === null) {
    console.log('Could not ask Firebase which secrets exist (run `firebase login`?). functions/.env left as it was.');
    const had = fs.existsSync(ENV) && /^\s*PFA_FUNCTION_SECRETS\s*=\s*\S/m.test(fs.readFileSync(ENV, 'utf8'));
    if (!had) console.log('WARNING: functions/.env names no secrets, so this deploy mounts none: no email (PFA_SMTP_PASS) until you run `firebase login` and deploy again.');
    process.exit(0);
  }
  (state ? found : absent).push(name);
}

const lines = fs.existsSync(ENV) ? fs.readFileSync(ENV, 'utf8').split(/\r?\n/) : [];
const kept = lines.filter((l) => !/^\s*PFA_FUNCTION_SECRETS\s*=/.test(l));
while (kept.length && kept[kept.length - 1] === '') kept.pop();
kept.push(`PFA_FUNCTION_SECRETS=${found.join(',')}`);
fs.mkdirSync(path.dirname(ENV), { recursive: true });
fs.writeFileSync(ENV, kept.join('\n') + '\n');

console.log(`Secrets named for the functions: ${found.length ? found.join(', ') : 'none'}`);
if (absent.length) console.log(`Not created yet, so skipped: ${absent.join(', ')}`);
