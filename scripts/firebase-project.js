#!/usr/bin/env node
/* Which Firebase project does this tree talk to, and does the key agree?
 *
 *   node scripts/firebase-project.js                     the tree's own references
 *   node scripts/firebase-project.js ~/Desktop/key.json  ...and a service account key
 *   node scripts/firebase-project.js --find              print the path of the one key on
 *                                                        the Desktop or in Downloads that
 *                                                        belongs to this tree's project
 *
 * Exit 0 when every reference names the same project, 1 otherwise. No network,
 * no dependencies, no secret printed: project ids, service account emails and
 * file names only.
 *
 * Why this exists. On 7 Sep 2026 scripts/ship.sh chose the service account by
 * `ls -t ... | head -1`, the most recently modified *firebase-adminsdk*.json on
 * the Desktop, and that was the key for pfa-oldsite, a project this site left.
 * The sign-in check caught it ("browser signs in to pfa-new-website, server
 * holds pfa-oldsite") and nothing was pushed, but only after the working tree
 * had been replaced and the admin claim granted on the wrong project. A key is
 * now chosen by the project it belongs to, never by its timestamp, and the
 * comparison runs before anything on disk is touched.
 *
 * The project is identified in four places and they must agree:
 *   assets/firebase-config.js   PFA_FIREBASE_PROJECT_ID, the project the browser signs in to
 *   .firebaserc                 projects.default, where `firebase deploy` goes
 *   package.json                deploy:firebase passes --project
 *   the service account key     project_id, the project the server verifies tokens for
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/* Projects this site has left. A key for one of these is refused outright,
   whatever the browser config says, so a stale file on a Desktop can never be
   picked up again. Add to the list; never remove from it. */
const RETIRED = ['pfa-oldsite'];

function read(file) {
  try { return fs.readFileSync(path.join(ROOT, file), 'utf8'); } catch (_) { return ''; }
}

/* Every place the tree names a project, with the value it names. */
function treeReferences() {
  const refs = [];
  const web = read('assets/firebase-config.js');
  const id = /PFA_FIREBASE_PROJECT_ID\s*=\s*'([^']*)'/.exec(web);
  const domain = /PFA_FIREBASE_AUTH_DOMAIN\s*=\s*'([^']*)'/.exec(web);
  refs.push({ where: 'assets/firebase-config.js  PFA_FIREBASE_PROJECT_ID', project: id ? id[1] : '' });
  if (domain) {
    const fromDomain = /^([a-z0-9-]+)\.firebaseapp\.com$/.exec(domain[1]);
    refs.push({ where: 'assets/firebase-config.js  PFA_FIREBASE_AUTH_DOMAIN', project: fromDomain ? fromDomain[1] : domain[1] });
  }
  try {
    const rc = JSON.parse(read('.firebaserc'));
    refs.push({ where: '.firebaserc  projects.default', project: (rc.projects && rc.projects.default) || '' });
  } catch (_) {
    refs.push({ where: '.firebaserc  projects.default', project: '' });
  }
  try {
    const pkg = JSON.parse(read('package.json'));
    const script = (pkg.scripts && pkg.scripts['deploy:firebase']) || '';
    const flag = /--project\s+([^\s&|;]+)/.exec(script);
    refs.push({ where: 'package.json  deploy:firebase --project', project: flag ? flag[1] : '' });
  } catch (_) {
    refs.push({ where: 'package.json  deploy:firebase --project', project: '' });
  }
  return refs;
}

/* A service account key, reduced to what may be printed. */
function readKey(file) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return { file, error: 'not valid JSON' };
  }
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    return { file, error: 'missing project_id, client_email or private_key; use the file Firebase generates, unedited' };
  }
  return { file, project: String(parsed.project_id), email: String(parsed.client_email) };
}

function keysOnDisk() {
  const dirs = [path.join(os.homedir(), 'Desktop'), path.join(os.homedir(), 'Downloads')];
  const found = [];
  for (const dir of dirs) {
    let names = [];
    try { names = fs.readdirSync(dir); } catch (_) { continue; }
    for (const name of names) {
      if (!/firebase-adminsdk.*\.json$/i.test(name)) continue;
      const file = path.join(dir, name);
      const key = readKey(file);
      let mtime = 0;
      try { mtime = fs.statSync(file).mtimeMs; } catch (_) { /* unreadable: sorts last */ }
      found.push(Object.assign(key, { mtime }));
    }
  }
  return found;
}

/* The one project the tree names, or null with the disagreement spelt out. */
function treeProject(refs) {
  const named = refs.filter((r) => r.project);
  const distinct = [...new Set(named.map((r) => r.project))];
  return distinct.length === 1 ? distinct[0] : null;
}

function report(refs, key, envProject) {
  const rows = refs.map((r) => ({ where: r.where, project: r.project || '(missing)' }));
  if (envProject !== undefined) rows.push({ where: 'FIREBASE_SERVICE_ACCOUNT_JSON  project_id', project: envProject || '(unreadable)' });
  if (key) rows.push({ where: `${path.basename(key.file)}  project_id`, project: key.error ? `(${key.error})` : key.project });
  const width = Math.max(...rows.map((r) => r.where.length));
  const out = ['Firebase project references:'];
  for (const r of rows) out.push(`  ${r.where.padEnd(width)}  ${r.project}`);
  return out.join('\n');
}

function main(argv) {
  const args = argv.slice(2);
  const find = args.includes('--find');
  const keyPath = args.find((a) => !a.startsWith('--'));
  const refs = treeReferences();
  const project = treeProject(refs);
  const problems = [];

  if (!project) {
    problems.push('the tree names more than one project, or none: every reference above must say the same thing');
  } else if (RETIRED.includes(project)) {
    problems.push(`the tree is configured for "${project}", which this site has left; it must not be used anywhere`);
  }

  if (find) {
    /* Print one path on stdout for a shell to capture; everything else on stderr. */
    if (!project) {
      process.stderr.write(report(refs) + '\n' + problems.join('\n') + '\n');
      return 1;
    }
    const keys = keysOnDisk();
    const retired = keys.filter((k) => k.project && RETIRED.includes(k.project));
    const matching = keys.filter((k) => k.project === project).sort((a, b) => b.mtime - a.mtime);
    for (const k of retired) process.stderr.write(`  ignoring ${path.basename(k.file)}: it belongs to ${k.project}, a project this site has left\n`);
    for (const k of keys) {
      if (k.error) process.stderr.write(`  ignoring ${path.basename(k.file)}: ${k.error}\n`);
      else if (k.project !== project && !RETIRED.includes(k.project)) process.stderr.write(`  ignoring ${path.basename(k.file)}: it belongs to ${k.project}, not ${project}\n`);
    }
    if (!matching.length) {
      process.stderr.write(`No service account key for "${project}" on the Desktop or in Downloads.\n`
        + `The tree signs in to "${project}", so the key must come from that project:\n`
        + '  Firebase console > that project > Project settings > Service accounts > Generate new private key.\n'
        + 'Or point at the file directly: PFA_SERVICE_ACCOUNT=/path/to/key.json\n');
      return 1;
    }
    if (matching.length > 1) {
      process.stderr.write(`  ${matching.length} keys for ${project}; using the newest, ${path.basename(matching[0].file)}\n`);
    }
    process.stdout.write(matching[0].file + '\n');
    return 0;
  }

  const key = keyPath ? readKey(keyPath) : null;
  let envProject;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try { envProject = String(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON).project_id || ''); } catch (_) { envProject = ''; }
  }
  process.stdout.write(report(refs, key, envProject) + '\n');

  if (key && key.error) problems.push(`${path.basename(key.file)}: ${key.error}`);
  for (const [label, value] of [['the key', key && !key.error ? key.project : ''], ['FIREBASE_SERVICE_ACCOUNT_JSON', envProject]]) {
    if (!value) continue;
    if (RETIRED.includes(value)) {
      problems.push(`${label} belongs to "${value}", a project this site has left; it must not be used anywhere`);
    } else if (project && value !== project) {
      problems.push(`${label} belongs to "${value}" but the tree signs in to "${project}": tokens from the browser would never verify on this server`);
    }
  }
  if (envProject === '') problems.push('FIREBASE_SERVICE_ACCOUNT_JSON is set but is not a readable key');

  if (problems.length) {
    process.stdout.write('\nNot consistent:\n' + problems.map((p) => `  - ${p}`).join('\n') + '\n'
      + '\nFix: every reference must name the project whose key you hold. The browser values\n'
      + '(API key, auth domain, project id, app id) come from that project\'s console page,\n'
      + 'Project settings > General > Your apps; .firebaserc and package.json take the id.\n');
    return 1;
  }
  process.stdout.write(`\nConsistent: everything names ${project}${key ? `, and the key is ${key.email}` : ''}.\n`);
  return 0;
}

if (require.main === module) process.exit(main(process.argv));

module.exports = { RETIRED, treeReferences, treeProject, readKey, keysOnDisk, main };
