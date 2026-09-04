'use strict';
/* The store was slow because every shopper waited on the catalogue
   function, which on a cold instance walks Shopify page by page. The answer
   is the edge: serve the last answer at once, refresh it behind the scenes.
   These pin that, and the static cache headers that were missing. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');

test('the catalogue and product pages are edge-cached and refreshed in the background', () => {
  const cat = fs.readFileSync(path.join(ROOT, 'lib', 'routes', 'paws-catalog.js'), 'utf8');
  assert.match(cat, /'Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=600'/);
  assert.doesNotMatch(cat.slice(cat.indexOf('response.statusCode = 200')), /Cache-Control', 'no-store'\);\s*response\.end\(JSON\.stringify\(data\)\)/, 'the good answer is not no-store');
  const prod = fs.readFileSync(path.join(ROOT, 'lib', 'routes', 'product-page.js'), 'utf8');
  assert.match(prod, /s-maxage=600, stale-while-revalidate=3600/);
});

test('the list view carries only what the grid reads', () => {
  const cat = fs.readFileSync(path.join(ROOT, 'lib', 'routes', 'paws-catalog.js'), 'utf8');
  const list = cat.slice(cat.indexOf("view: 'list'"), cat.indexOf('response.statusCode = 200'));
  ['sku', 'stock', 'compareAtPrice', 'options', 'description'].forEach((f) => assert.ok(!list.includes(f + ':'), `${f} is not sent to the grid`));
});

test('the shop starts fetching the catalogue from the head and warms the image CDN', () => {
  const shop = fs.readFileSync(path.join(ROOT, 'pfa-shop.html'), 'utf8');
  const head = shop.slice(0, shop.indexOf('</head>'));
  assert.match(head, /window\.__pfaCatalog=fetch\('\/api\/paws-catalog\?view=list'/);
  assert.match(head, /rel="preconnect" href="https:\/\/cdn\.shopify\.com"/);
  assert.match(shop, /var early = window\.__pfaCatalog/);
});

test('fonts, scripts, styles and images all carry cache headers', () => {
  const v = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  const src = v.headers.map((h) => h.source);
  assert.ok(src.includes('/fonts/(.*)'), 'the fonts actually live under /fonts');
  assert.ok(src.some((s) => /\\\.\(js\|css/.test(s)), 'root-level js/css (pfa-search.js, pfa-forms.js)');
  assert.ok(src.includes('/img/(.*)'));
  assert.ok(fs.existsSync(path.join(ROOT, 'fonts', 'marcellus-latin.woff2')));
});

test('the shop paints from a deploy-time snapshot and reconciles with the live API', () => {
  const shop = fs.readFileSync(path.join(ROOT, 'pfa-shop.html'), 'utf8');
  assert.match(shop, /window\.__pfaSnapshot=fetch\('\/assets\/catalog-snapshot\.json'/, 'requested from the head');
  assert.match(shop, /applyCatalog\(data, 'snapshot'\)/);
  assert.match(shop, /applyCatalog\(data, 'live'\)/);
  assert.match(shop, /if \(booted\)\{[\s\S]*paintAll\(\)/, 'live data repaints a grid already showing the snapshot');
  const cat = require('../lib/routes/paws-catalog.js');
  assert.equal(typeof cat.listView, 'function');
  assert.equal(typeof cat.applyPolicy, 'function');
  const v = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  assert.equal(v.buildCommand, 'node scripts/build-catalog.js && node scripts/minify.js');
  assert.match(fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8'), /catalog-snapshot\.json/);
});

test('the hops between grid, product and checkout are pre-warmed', () => {
  const shop = fs.readFileSync(path.join(ROOT, 'pfa-shop.html'), 'utf8');
  assert.match(shop, /rel = 'prefetch'/, 'product pages are prefetched on intent');
  assert.match(shop, /speculationrules/, 'and prerendered where supported');
  assert.match(shop, /href_matches: '\/products\/\*'/);
  assert.match(shop, /fetch\('\/api\/pfa-order-status\?warm=1'/, 'the checkout function is woken as the bag opens');
  assert.match(shop, /content-visibility:auto/);
  const status = fs.readFileSync(path.join(ROOT, 'lib', 'routes', 'pfa-order-status.js'), 'utf8');
  assert.match(status, /param\(request, 'warm', 4\)/, 'the warm path answers before any lookup');
  const product = fs.readFileSync(path.join(ROOT, 'product.html'), 'utf8');
  assert.match(product, /fetchpriority="high"/, 'the hero image is fetched first');
  const route = fs.readFileSync(path.join(ROOT, 'lib', 'routes', 'product-page.js'), 'utf8');
  assert.match(route, /rel="preload" as="image"/, 'and preloaded from the server-rendered head');
});

test('every page that uses the display face asks for it at parse time', () => {
  /* The headings are Marcellus, self-hosted, 14 KB. The face was declared in a
     <style> block and nothing else, so the browser did not request the file
     until it laid out a heading that needed it - well after the HTML was
     parsed. With font-display:swap that means the fallback is painted first
     and the real face swaps in over it a beat later, which is visible as the
     headings changing shape after the page has settled. A preload starts the
     request when the head is parsed instead. */
  const pages = fs.readdirSync(ROOT)
    .filter((f) => f.endsWith('.html'))
    .filter((f) => fs.readFileSync(path.join(ROOT, f), 'utf8').includes('marcellus-latin.woff2'));
  assert.ok(pages.length >= 20, `expected the site's pages, found ${pages.length}`);

  const faults = [];
  for (const page of pages) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const preload = /<link rel="preload" href="(\/?fonts\/marcellus-latin\.woff2)"([^>]*)>/.exec(html);
    if (!preload) { faults.push(`${page}: declares Marcellus but never preloads it`); continue; }
    const [, href, attrs] = preload;

    /* Without crossorigin the preload is fetched in a different mode from the
       font request, so the file is downloaded twice and the preload buys
       nothing. It is the easiest attribute to leave off and the whole point. */
    if (!/\bcrossorigin\b/.test(attrs)) faults.push(`${page}: preload has no crossorigin, so the font is fetched twice`);
    if (!/as="font"/.test(attrs)) faults.push(`${page}: preload has no as="font"`);
    if (!/type="font\/woff2"/.test(attrs)) faults.push(`${page}: preload has no type`);

    /* product.html is served from /products/<handle>, so its URLs are
       root-absolute. The preload has to match the @font-face beside it or one
       of the two resolves to a path that does not exist. */
    const declared = /src\s*:\s*url\("(\/?fonts\/marcellus-latin\.woff2)"\)/.exec(html);
    if (declared && declared[1] !== href) {
      faults.push(`${page}: preloads ${href} but the face is declared at ${declared[1]}`);
    }

    /* Only the latin file. latin-ext covers characters these pages do not use,
       and a preload nothing consumes is a warning in the console and wasted
       bytes on every visit. */
    if (html.includes('marcellus-latin-ext.woff2" as="font"')) {
      faults.push(`${page}: preloads latin-ext, which nothing on the page uses`);
    }
  }
  assert.deepEqual(faults, [], '\n  ' + faults.join('\n  '));
});
