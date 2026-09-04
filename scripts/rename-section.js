#!/usr/bin/env node
'use strict';

/* Rename a section across the site: the page file, every link to it, and every
   place its name is written.

     node scripts/rename-section.js "Old Name" old-slug "New Name" new-slug

   Deliberately skipped, and why:

   - `_inline-extracts/`  documented as read-only snapshots of the *other*
                          half's pages. Editing them would edit a copy of a
                          file that is not in this repository.
   - CHANGELOG.md, UI-CHANGELOG.md, QA_REPORT.md
                          historical records. A changelog that says a section
                          was always called X is a false record.
   - CHANGES.md           the notes for this work; new entries are appended
                          rather than old ones rewritten.
   - node_modules, .git

   The old slug is left as a search keyword on purpose, so someone who
   remembers the previous name still finds the page. */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', '_inline-extracts', 'test']);
/* Itself included: on the first run it rewrote its own usage example, which
   is a documentation comment, not a reference to the section. */
const SKIP_FILES = new Set(['CHANGELOG.md', 'UI-CHANGELOG.md', 'QA_REPORT.md', 'CHANGES.md',
                            'rename-section.js']);
const EXTENSIONS = new Set(['.html', '.js', '.json', '.md']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, out);
    } else if (EXTENSIONS.has(path.extname(entry.name)) && !SKIP_FILES.has(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function escapeRe(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function rename(oldLabel, oldSlug, newLabel, newSlug) {
  const oldFile = path.join(ROOT, `${oldSlug}.html`);
  const newFile = path.join(ROOT, `${newSlug}.html`);
  const changed = [];

  if (fs.existsSync(oldFile)) {
    if (fs.existsSync(newFile)) throw new Error(`${newSlug}.html already exists; refusing to overwrite it`);
    fs.renameSync(oldFile, newFile);
    changed.push(`${oldSlug}.html -> ${newSlug}.html`);
  }

  const labelRe = new RegExp(escapeRe(oldLabel), 'g');
  const slugRe = new RegExp(escapeRe(`${oldSlug}.html`), 'g');

  for (const file of walk(ROOT)) {
    const before = fs.readFileSync(file, 'utf8');
    const after = before.replace(slugRe, `${newSlug}.html`).replace(labelRe, newLabel);
    if (after !== before) {
      fs.writeFileSync(file, after);
      const hits = (before.match(labelRe) || []).length + (before.match(slugRe) || []).length;
      changed.push(`${path.relative(ROOT, file)} (${hits})`);
    }
  }
  return changed;
}

if (require.main === module) {
  const [oldLabel, oldSlug, newLabel, newSlug] = process.argv.slice(2);
  if (!oldLabel || !oldSlug || !newLabel || !newSlug) {
    console.error('Usage: node scripts/rename-section.js "<old label>" <old-slug> "<new label>" <new-slug>');
    process.exitCode = 1;
  } else {
    const changed = rename(oldLabel, oldSlug, newLabel, newSlug);
    console.log(`Renamed "${oldLabel}" to "${newLabel}" in ${changed.length} place(s):`);
    changed.forEach((c) => console.log('  ' + c));
    console.log('\nNow run: npm run build:product && npm run build:quiz');
    console.log('and add a redirect from the old URL in vercel.json if there is not one already.');
  }
}

module.exports = { rename, walk };
