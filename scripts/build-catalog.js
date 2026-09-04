#!/usr/bin/env node
'use strict';
/* Writes the shop's catalogue, in the grid's list shape, to
   assets/catalog-snapshot.json at deploy time.

   Why: the shop used to show nothing until /api/paws-catalog answered, and
   on a cold function that answer walks Shopify page by page. A static file
   comes from the CDN in tens of milliseconds, so the grid paints at once;
   the page then fetches the live API in the background and swaps in current
   prices and stock without the shopper noticing.

   Never fails the build. If Shopify or Firestore cannot be reached here, no
   file is written and the shop simply waits for the API as before. */

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'assets', 'catalog-snapshot.json');
/* The full catalogue, for the serverless function (product pages and the
   API on a cold start). Not under assets/, so it is never served as-is. */
const FULL = path.join(__dirname, '..', 'lib', 'catalog-snapshot.json');

(async () => {
  /* Local brand logos first: a folder listing, cannot fail, and the shop
     needs the file whether or not Shopify answers below. */
  try { require('./build-brand-logos.js')(); } catch (e) { console.warn('brand logos skipped: ' + (e && e.message)); }
  try {
    const catalog = require('../lib/routes/paws-catalog.js');
    let store;
    try { store = await require('../lib/store-settings.js').getStoreState(); }
    catch (e) { console.warn('catalog snapshot: store state unavailable (' + (e && e.message) + '); assuming open, vegetarian only'); store = { state: 'veg', open: true, vegetarianOnly: true, label: 'Open · vegetarian food only', changedAt: '' }; }
    const full = await catalog.getCatalog();
    if (!full || !Array.isArray(full.products) || !full.products.length) throw new Error('empty catalogue');
    const data = catalog.listView(catalog.applyPolicy(full, store));
    data.snapshotAt = new Date().toISOString();
    fs.writeFileSync(OUT, JSON.stringify(data));
    fs.writeFileSync(FULL, JSON.stringify({ ...full, snapshotAt: data.snapshotAt }));
    console.log(`catalog snapshot: ${data.products.length} products -> assets/catalog-snapshot.json (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB), full -> lib/catalog-snapshot.json (${(fs.statSync(FULL).size / 1024).toFixed(0)} KB)`);
  } catch (error) {
    console.warn('catalog snapshot skipped: ' + (error && error.message) + '. The shop will load from the API.');
    try { fs.unlinkSync(OUT); } catch (_) {}
    try { fs.unlinkSync(FULL); } catch (_) {}
  }
  process.exit(0);
})();
