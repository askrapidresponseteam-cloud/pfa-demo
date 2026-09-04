'use strict';
/* On a cold function the catalogue answers from the deploy-time snapshot
   at once and refreshes from Shopify behind the answer, so a product page
   or the API never makes the first visitor wait for the whole walk. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SNAP = path.join(ROOT, 'lib', 'catalog-snapshot.json');

test('a cold start answers from the bundled snapshot instead of waiting for Shopify', async () => {
  const had = fs.existsSync(SNAP) ? fs.readFileSync(SNAP) : null;
  fs.writeFileSync(SNAP, JSON.stringify({ products: [{ id: 'x', handle: 'x', title: 'Snapshot product', variants: [], images: [] }], collections: [], stats: {} }));
  const key = require.resolve('../lib/routes/paws-catalog.js');
  delete require.cache[key];
  try {
    process.env.PFA_SHOPIFY_ADMIN_TOKEN = '';
    const cat = require('../lib/routes/paws-catalog.js');
    const t0 = Date.now();
    const data = await cat.getCatalog();
    assert.equal(data.products[0].title, 'Snapshot product');
    assert.ok(Date.now() - t0 < 500, 'answered without a network round trip');
  } finally {
    delete require.cache[key];
    if (had) fs.writeFileSync(SNAP, had); else fs.unlinkSync(SNAP);
  }
});

test('the function bundle carries the snapshot, and dist/ never carries server code', () => {
  const v = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  assert.match(v.functions['api/index.js'].includeFiles, /lib\/catalog-snapshot\.json/);
  const build = fs.readFileSync(path.join(ROOT, 'scripts', 'build-catalog.js'), 'utf8');
  assert.match(build, /lib', 'catalog-snapshot\.json'/);
  const minify = fs.readFileSync(path.join(ROOT, 'scripts', 'minify.js'), 'utf8');
  assert.match(minify, /SKIP_DIRS = new Set\(\[[^\]]*'api', 'lib'\]\)/);
  assert.match(fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8'), /lib\/catalog-snapshot\.json/);
});
