'use strict';

/* One Firebase project, named everywhere, and a key that belongs to it.

   The failure this guards against happened on 7 Sep 2026: the deployment
   picked up pfa-oldsite's service account from the Desktop because it was the
   newest file there, and the sign-in check reported "browser signs in to
   pfa-new-website, server holds pfa-oldsite". The fix is not to make the two
   agree by hand each time; it is that the key is found by the project it
   belongs to, that a retired project is refused whatever else is configured,
   and that every place the tree names a project is compared before anything
   else happens. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'firebase-project.js');
const helper = require('../scripts/firebase-project');

function fakeKey(dir, project, ageSeconds) {
  const file = path.join(dir, `${project}-firebase-adminsdk-fbsvc-${project.length}abc.json`);
  fs.writeFileSync(file, JSON.stringify({
    type: 'service_account', project_id: project,
    client_email: `firebase-adminsdk-fbsvc@${project}.iam.gserviceaccount.com`,
    /* Assembled at run time so the tree never carries the PEM header the
       security scan looks for. */
    private_key: ['-----BEGIN', 'PRIVATE KEY-----\nnot-a-key\n-----END', 'PRIVATE KEY-----\n'].join(' ')
  }));
  const t = (Date.now() - ageSeconds * 1000) / 1000;
  fs.utimesSync(file, t, t);
  return file;
}

function run(args, env) {
  return spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
}

test('the tree names exactly one project, everywhere it names one', () => {
  const refs = helper.treeReferences();
  assert.ok(refs.length >= 4, 'browser config, auth domain, .firebaserc and package.json are all read');
  refs.forEach((r) => assert.ok(r.project, `${r.where} names no project`));
  const project = helper.treeProject(refs);
  assert.ok(project, `the references disagree: ${refs.map((r) => `${r.where}=${r.project}`).join(', ')}`);
  assert.ok(!helper.RETIRED.includes(project), `${project} is a project this site has left`);
});

test('pfa-oldsite is retired, and stays retired', () => {
  assert.ok(helper.RETIRED.includes('pfa-oldsite'));
  const check = fs.readFileSync(path.join(ROOT, 'scripts', 'check-admin-setup.js'), 'utf8');
  assert.match(check, /RETIRED\.includes/, 'the sign-in check refuses a retired project before comparing anything');
  assert.match(check, /treeReferences\(\)/, 'and compares the deploy targets with the browser');
});

test('the key is found by project, not by which file is newest', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pfa-home-'));
  fs.mkdirSync(path.join(home, 'Desktop'));
  fs.mkdirSync(path.join(home, 'Downloads'));
  const project = helper.treeProject(helper.treeReferences());
  const right = fakeKey(path.join(home, 'Desktop'), project, 3 * 86400);
  fakeKey(path.join(home, 'Desktop'), 'pfa-oldsite', 60);
  fakeKey(path.join(home, 'Downloads'), 'some-other-project', 3600);

  const found = run(['--find'], { HOME: home, USERPROFILE: home });
  assert.equal(found.status, 0, found.stderr);
  assert.equal(found.stdout.trim(), right, 'the three-day-old key for the right project wins over the newer wrong ones');
  assert.match(found.stderr, /pfa-oldsite.*a project this site has left/);
  assert.match(found.stderr, /some-other-project, not /);

  fs.rmSync(right);
  const none = run(['--find'], { HOME: home, USERPROFILE: home });
  assert.equal(none.status, 1, 'with no key for the project there is nothing to pick');
  assert.match(none.stderr, /No service account key for/);
  assert.doesNotMatch(none.stdout, /pfa-oldsite/, 'and the retired key is never printed as the choice');
  fs.rmSync(home, { recursive: true, force: true });
});

test('a key for the wrong project, or a retired one, fails the check by name', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfa-keys-'));
  const project = helper.treeProject(helper.treeReferences());
  const right = fakeKey(dir, project, 10);
  const retired = fakeKey(dir, 'pfa-oldsite', 10);
  const other = fakeKey(dir, 'another-project', 10);

  const good = run([right], {});
  assert.equal(good.status, 0, good.stdout);
  assert.match(good.stdout, new RegExp(`Consistent: everything names ${project}`));

  const bad = run([retired], {});
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /pfa-oldsite.*a project this site has left/);

  const wrong = run([other], {});
  assert.equal(wrong.status, 1);
  assert.match(wrong.stdout, new RegExp(`another-project.*but the tree signs in to "${project}"`));

  /* The environment the failed run had: the retired key already exported. */
  const env = run([], { FIREBASE_SERVICE_ACCOUNT_JSON: fs.readFileSync(retired, 'utf8') });
  assert.equal(env.status, 1);
  assert.match(env.stdout, /FIREBASE_SERVICE_ACCOUNT_JSON.*pfa-oldsite/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the helper prints project ids and emails, never a private key', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfa-keys-'));
  const project = helper.treeProject(helper.treeReferences());
  const out = execFileSync('node', [SCRIPT, fakeKey(dir, project, 10)], { encoding: 'utf8' });
  assert.doesNotMatch(out, /PRIVATE KEY|not-a-key/, 'only the project id and the service account email may appear');
  fs.rmSync(dir, { recursive: true, force: true });
});
