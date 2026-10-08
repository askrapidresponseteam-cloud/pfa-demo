#!/usr/bin/env node
'use strict';

/* Deletes the files of documents taken off the library's shelves on purpose
   (data/library-withdrawn.json) from resources/.

     node scripts/withdraw-library.js [root]     (DEPLOY.command runs it)

   resources/ lives on GitHub, not in the zip: a deploy copies it in from the
   live tree first, withdrawn PDFs included, and the library's own test then
   stops the deploy at "resources/... is on no shelf". Deleting them here
   lets the deploy carry the removal into the repository, as it does for
   every other file (owner, 8 Oct 2026: the Financial scoping reports shelf,
   three documents, removed entirely). Only paths under resources/ are ever
   touched. */

const fs = require('fs');
const path = require('path');

function withdraw(root) {
  const base = root || path.join(__dirname, '..');
  const list = JSON.parse(fs.readFileSync(path.join(base, 'data', 'library-withdrawn.json'), 'utf8'));
  const removed = [];
  for (const doc of list.withdrawn || []) {
    for (const rel of doc.files || []) {
      const clean = path.posix.normalize(String(rel));
      if (!/^resources\/[^/]/.test(clean) || clean.includes('..')) continue;
      const full = path.join(base, clean);
      if (fs.existsSync(full)) { fs.unlinkSync(full); removed.push(clean); }
    }
  }
  return removed;
}

if (require.main === module) {
  const removed = withdraw(process.argv[2]);
  for (const f of removed) console.log(`  withdrawn from the library: ${f}`);
}

module.exports = { withdraw };
