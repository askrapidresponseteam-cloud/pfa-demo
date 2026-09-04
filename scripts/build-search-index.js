#!/usr/bin/env node
/* Builds assets/search-index.json and sitemap.xml from the public pages.

   search.html reads the index if it exists and otherwise crawls the site in
   the visitor's browser, page by page, before it can answer. Shipping the
   index makes the first search instant; the sitemap is what search engines
   ask for. Both are derived, so run this after adding or renaming a page:

     node scripts/build-search-index.js

   A test checks that every public page is in both. */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://peopleforanimalsindia.org';
/* Pages that are part of a flow, not destinations, or are not for the public. */
/* submission-collage.html is finished but deliberately unlinked: it belongs to a
   newsroom story that does not exist yet. Indexing it would surface it in site
   search before that story is written. Delete it from this list on the day the
   story goes up. */
const EXCLUDE = new Set(['admin.html', '404.html', 'search.html', 'product.html', 'patron-card-preview.html', 'caregiver-card.html', 'animal.html', 'track-order.html', 'winner.html', 'submission-collage.html']);

/* Not the same idea as EXCLUDE. search.html and product.html are public, they
   just are not destinations worth indexing. These must never reach a visitor
   by any route: not the sitemap, not site search, not the popular-searches
   list. The panel is behind a Firebase admin claim, but a signed-out stranger
   should not be handed its address by the search box either.

   The crawled search-index.json in the repo root predates this rule and had
   four admin.html rows in it, which is how the panel was turning up in search.
   pfa-search.js and lib/routes/search-popular.js keep a copy of this pattern
   because one is browser code and the other is a lambda; test/admin-not-
   discoverable.test.js asserts all three still agree. */
const PRIVATE = /^\/?(admin\b|api\/)/i;
function isPrivatePath(url) {
  return PRIVATE.test(String(url == null ? '' : url).trim());
}

function text(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(header|footer|nav)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&mdash;/g, '-').replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
function meta(html, name) {
  const m = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*)["']`, 'i').exec(html)
    || new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${name}["']`, 'i').exec(html);
  return m ? m[1] : '';
}
function headings(html) {
  return [...html.replace(/<(header|footer|nav)\b[\s\S]*?<\/\1>/gi, ' ').matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
    .map((m) => text(m[1])).filter(Boolean).slice(0, 20);
}

function publicPages() {
  return fs.readdirSync(ROOT).filter((f) => f.endsWith('.html') && !EXCLUDE.has(f)).sort();
}

function build() {
  const pages = publicPages().map((file) => {
    const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const title = (/<title>([\s\S]*?)<\/title>/i.exec(html) || [])[1] || file;
    return {
      url: file === 'index.html' ? '/' : '/' + file,
      title: text(title),
      description: meta(html, 'description'),
      headings: headings(html),
      body: text(html).slice(0, 6000)
    };
  });
  fs.writeFileSync(path.join(ROOT, 'assets', 'search-index.json'), JSON.stringify({ generatedAt: new Date().toISOString(), pages }, null, 0));
  const today = new Date().toISOString().slice(0, 10);
  /* vercel.json sets cleanUrls:true, so /laws.html is a 308 to /laws. A sitemap
     full of redirecting URLs makes every entry a hop, so the extension comes
     off here to match the canonical scripts/build-seo.js writes. p.url keeps
     its extension: search.html and the popular-searches API key off it. */
  const loc = (p) => (p.url === '/' ? '/' : p.url.replace(/\.html$/, ''));
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    pages.map((p) => `  <url><loc>${SITE}${loc(p)}</loc><lastmod>${today}</lastmod></url>`).join('\n') + '\n</urlset>\n';
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap);
  return pages;
}

module.exports = { build, publicPages, EXCLUDE, PRIVATE, isPrivatePath };

if (require.main === module) {
  const pages = build();
  console.log(`Indexed ${pages.length} pages into assets/search-index.json and sitemap.xml.`);
}
