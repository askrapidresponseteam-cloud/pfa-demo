'use strict';

/* The critical rule: nothing is ever deleted from Admin.

   This is not aspirational. lib/routes/admin/circle.js used to call
   ref.delete() in four places — posts, their replies, individual replies and
   whole member profiles were destroyed, leaving only a 140-character excerpt
   in the log. These tests exist so that cannot return. */

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');
const S = require('../lib/submissions.js');
const M = require('../lib/admin-modules.js');

const ROOT = path.join(__dirname, '..');
function serverFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) serverFiles(full, out);
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

test('no server code deletes a stored record', () => {
  const offenders = [];
  for (const file of serverFiles(path.join(ROOT, 'lib'))) {
    /* Strip comments before looking, rather than skipping lines that *start*
       like one — the comment explaining this rule spans several lines, and its
       continuation lines were being read as code. */
    const src = fs.readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    src.split('\n').forEach((line, i) => {
      if (/claimsCache\.delete|searchParams\.delete|memory\w*\.delete/.test(line)) return;  // in-process caches
      if (/\.delete\(\)|batch\.delete\(|tx\.delete\(|\.doc\([^)]*\)\.delete/.test(line)) {
        offenders.push(`${path.relative(ROOT, file)}:${i + 1}  ${line.trim().slice(0, 80)}`);
      }
    });
  }
  assert.deepEqual(offenders, [], `these destroy records:\n  ${offenders.join('\n  ')}`);
});

