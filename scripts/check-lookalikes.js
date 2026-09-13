#!/usr/bin/env node
'use strict';

/* Who else has registered a name that could be read as ours.
 *
 * The fraud this guards against is not someone copying the design. It is
 * someone copying the design onto peoplefotanimalsindia.org, wiring their own
 * payment account in, and mailing our donors from it. The copy takes an hour.
 * The part that takes money is the domain, and a domain is the one piece of
 * the attack that has to be registered somewhere public before it can be
 * used. So it can be watched, and watching it is the only warning anyone gets
 * before the first donation goes to the wrong account.
 *
 * What this does: generate the names a person could mistake for ours, ask DNS
 * whether each one exists, and report the ones that do. A hit is not proof of
 * anything. Someone may hold peopleforanimals.org perfectly innocently, and
 * defensive registrations by us will show up here too. What the report is for
 * is the second column: a name that resolves AND accepts mail is a name
 * someone can send donation appeals from wearing our wording, and that is the
 * one to look at the same day.
 *
 * No dependencies and no API keys: Node's own resolver against the public DNS
 * the registry already answers. It reads the real domain from
 * lib/official-channels.js so it can never end up watching for variants of a
 * domain we no longer use.
 *
 *   npm run check:lookalikes
 *   npm run check:lookalikes -- --all      every candidate, not just the hits
 *   npm run check:lookalikes -- --json     for a cron or a spreadsheet
 *
 * Exit status is 0 even when it finds something. This is a report for a human
 * to read, not a gate: a registrar sitting on a typo domain must not be able
 * to fail our deploys.
 */

const dns = require('node:dns').promises;
const fs = require('node:fs');
const path = require('node:path');
const { SITE, OFFICIAL_DOMAINS } = require('../lib/official-channels');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const SHOW_ALL = args.includes('--all');
const AS_JSON = args.includes('--json');

/* Split "peopleforanimalsindia.org" into the label we vary and the suffix we
   keep. Only the first label is varied: the interesting attacks read as our
   name, and a variant of ".org" reads as nothing. */
const dot = SITE.indexOf('.');
const LABEL = SITE.slice(0, dot);
const SUFFIX = SITE.slice(dot + 1);

/* Suffixes worth checking under our own spelling. A donor who half-remembers
   the name will type .com long before they type anything else, and .com,
   .in and .co.in are where an Indian charity is most likely to be squatted. */
const SUFFIXES = ['com', 'net', 'in', 'co.in', 'org.in', 'info', 'online', 'site', 'ngo', 'charity'];

/* Pairs that look alike in the faces a browser sets a URL in. rn/m is the
   classic: peoplefornnimals reads as ours at a glance. */
const HOMOGLYPHS = [
  ['rn', 'm'], ['m', 'rn'], ['l', 'i'], ['i', 'l'], ['l', '1'],
  ['i', '1'], ['o', '0'], ['a', 'e'], ['e', 'a'], ['s', 'z']
];

const KEYBOARD = {
  a: 'qsz', e: 'wrd', i: 'uok', o: 'ipl', l: 'kop', m: 'n', n: 'bm',
  p: 'ol', r: 'et', s: 'ad', t: 'ry', f: 'dg', d: 'sf', c: 'xv'
};

function candidates() {
  const out = new Set();
  const add = (label, suffix = SUFFIX) => {
    const name = `${label}.${suffix}`;
    if (name !== SITE) out.add(name);
  };

  /* 1. Our exact name under another suffix. */
  SUFFIXES.forEach((s) => add(LABEL, s));

  /* 2. One character dropped, doubled, or swapped with its neighbour. These
        are the typos a donor makes, not the ones an attacker chooses, and
        they are the ones worth owning rather than only watching. */
  for (let i = 0; i < LABEL.length; i += 1) {
    add(LABEL.slice(0, i) + LABEL.slice(i + 1));
    add(LABEL.slice(0, i) + LABEL[i] + LABEL.slice(i));
    if (i < LABEL.length - 1) {
      add(LABEL.slice(0, i) + LABEL[i + 1] + LABEL[i] + LABEL.slice(i + 2));
    }
  }

  /* 3. One character replaced by something that looks or types like it. */
  for (let i = 0; i < LABEL.length; i += 1) {
    for (const near of KEYBOARD[LABEL[i]] || '') {
      add(LABEL.slice(0, i) + near + LABEL.slice(i + 1));
    }
  }
  for (const [from, to] of HOMOGLYPHS) {
    let at = LABEL.indexOf(from);
    while (at !== -1) {
      add(LABEL.slice(0, at) + to + LABEL.slice(at + from.length));
      at = LABEL.indexOf(from, at + 1);
    }
  }

  /* 4. The name written the way a person would say it, which is how the
        convincing ones are built: hyphens, the words alone, the initials. */
  const spoken = [
    'people-for-animals-india', 'peoplefor-animals-india', 'people-for-animals',
    'peopleforanimals', 'peopleforanimalindia', 'peopleforanimalsind',
    'pfaindia', 'pfa-india', 'pfa-animals', 'peopleforanimalsindia-org',
    'donate-peopleforanimalsindia', 'peopleforanimalsindia-donate',
    'wwwpeopleforanimalsindia'
  ];
  spoken.forEach((l) => {
    add(l);
    ['com', 'in', 'org'].forEach((s) => add(l, s));
  });

  return [...out].sort();
}

/* Existence, and whether it can send mail. A name with MX records is a name
   that can put our wording in a donor's inbox, which is worse than a name
   that only serves a page. */
async function look(name) {
  const row = { name, resolves: false, mail: false, addresses: [] };
  try {
    row.addresses = await dns.resolve4(name);
    row.resolves = row.addresses.length > 0;
  } catch { /* NXDOMAIN and friends: unregistered, or registered and parked
               without an A record. Either way, not serving a page today. */ }
  try {
    const mx = await dns.resolveMx(name);
    row.mail = mx.length > 0;
    if (row.mail) row.resolves = true;
  } catch { /* no mail */ }
  return row;
}

/* In batches: a few hundred lookups fired at once gets a resolver to start
   dropping answers, which reads as "unregistered" and is the one wrong
   answer this tool must not give. */
async function inBatches(names, size, fn) {
  const out = [];
  for (let i = 0; i < names.length; i += size) {
    out.push(...await Promise.all(names.slice(i, i + size).map(fn)));
  }
  return out;
}

function expiryNote() {
  const file = path.join(ROOT, '.well-known', 'security.txt');
  if (!fs.existsSync(file)) return 'no .well-known/security.txt in the tree';
  const m = /^Expires:\s*(.+)$/m.exec(fs.readFileSync(file, 'utf8'));
  if (!m) return 'security.txt has no Expires field';
  const days = Math.round((Date.parse(m[1].trim()) - Date.now()) / 86400000);
  if (Number.isNaN(days)) return 'security.txt has an Expires field that is not a date';
  if (days < 0) return `security.txt expired ${-days} days ago. Move the Expires date.`;
  if (days < 45) return `security.txt expires in ${days} days. Move the Expires date.`;
  return null;
}

async function main() {
  const names = candidates();
  const rows = await inBatches(names, 20, look);
  const hits = rows.filter((r) => r.resolves);
  const ours = new Set(OFFICIAL_DOMAINS);
  const note = expiryNote();

  if (AS_JSON) {
    process.stdout.write(JSON.stringify({
      site: SITE, checked: rows.length, found: hits.length,
      securityTxt: note, results: SHOW_ALL ? rows : hits
    }, null, 2) + '\n');
    return;
  }

  console.log(`\n${SITE}: checked ${rows.length} lookalike names.\n`);
  const show = SHOW_ALL ? rows : hits;
  if (!show.length) {
    console.log('  None of them resolve. Nothing is standing up a page or a mailbox today.\n');
  } else {
    const width = Math.max(...show.map((r) => r.name.length));
    for (const r of show) {
      const mark = ours.has(r.name) ? 'ours' : (r.mail ? 'LOOK TODAY' : (r.resolves ? 'registered' : '-'));
      console.log(`  ${r.name.padEnd(width)}  ${mark.padEnd(11)}${r.mail ? 'accepts mail  ' : ''}${r.addresses.join(', ')}`);
    }
    console.log(`\n  ${hits.length} of ${rows.length} exist. A name marked LOOK TODAY can send donation`);
    console.log('  appeals that appear to come from us. Open it, and if it is wearing our');
    console.log('  name or our pages, follow the runbook in BRAND-PROTECTION.md.\n');
  }
  if (note) console.log(`  Note: ${note}\n`);
}

/* Required by the tests for the pure half, run for the rest. */
module.exports = { candidates, expiryNote, LABEL, SUFFIX };

if (require.main === module) {
  main().catch((error) => {
    console.error('check-lookalikes failed:', error.message);
    process.exitCode = 1;
  });
}
