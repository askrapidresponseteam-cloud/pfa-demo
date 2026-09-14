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
const EXCLUDE = new Set(['admin.html', '404.html', 'search.html', 'patron-card-preview.html', 'caregiver-card.html', 'animal.html', 'winner.html', 'submission-collage.html']);

/* Not the same idea as EXCLUDE. search.html is public, it just is not a
   destination worth indexing. These must never reach a visitor
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
    .map((m) => text(m[1])).filter(Boolean).slice(0, 130);
  /* 130, not 20: achievements.html alone carries a hundred and three h3
     entry titles, and a record a visitor cannot search is not on offer. */
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
      body: text(html).slice(0, 12000)
    };
  });
  /* ---- the rows layer: what the search engine actually eats ----------
     pages above is the coarse, per-page view the tests and sitemap use.
     rows is the fine view, in pfa-search.js's own row shape, so the engine
     can answer with the exact thing rather than the page it lives on:
     one row per public page, one per anchored h2/h3 with the text under
     it, and one per unit, built from the data inside units.html because
     the units never exist as HTML at all. */
  const GROUP = {
    'laws.html': 'Laws', 'academy.html': 'Explore', 'achievements.html': 'About',
    'someone.html': 'Explore', 'cinekind.html': 'Explore', 'events.html': 'Places',
    'newsroom.html': 'Explore', 'wall.html': 'Explore', 'get-involved.html': 'Do something',
    'donate.html': 'Do something', 'report.html': 'Do something', 'track.html': 'Do something',
    'ask.html': 'Do something', 'founder.html': 'About', 'careers.html': 'About',
    'quiz.html': 'Explore', 'units.html': 'Places', 'index.html': 'Explore'
  };
  const rows = [];
  for (const file of publicPages()) {
    const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<(header|footer|nav)\b[\s\S]*?<\/\1>/gi, ' ');
    const title = text((/<title>([\s\S]*?)<\/title>/i.exec(html) || [])[1] || file)
      .replace(/\s*\|\s*People for Animals\s*$/i, '');
    const group = GROUP[file] || 'Explore';
    rows.push({
      t: title, s: 'Pages', y: 'page', u: file === 'index.html' ? 'index.html' : file,
      d: meta(html, 'description').slice(0, 220),
      k: headings(html).join(' ').slice(0, 1200)
    });
    /* Anchored sections: walk the page once, remembering the last id seen,
       and give every h2/h3 that can be reached by an anchor its own row. */
    let lastId = '';
    /* h2 and h3 carry the sections; laws.html carries two hundred questions
       as <summary> spans instead, each under its own anchor, and a question
       nobody can search is a question nobody asked. Both count as marks. */
    const walker = /id="([^"]+)"|<h([23])[^>]*>([\s\S]*?)<\/h\2>|<span class="qa__q">([^<]+)<\/span>/g;
    const marks = [];
    let m;
    while ((m = walker.exec(stripped)) !== null) {
      if (m[1]) { lastId = m[1]; continue; }
      marks.push({ id: lastId, head: text(m[3] || m[4] || ''), at: walker.lastIndex });
    }
    const taken = new Set();
    marks.forEach((mark, i) => {
      if (!mark.id || !mark.head || mark.head.length < 3) return;
      /* One row per anchor: the mark nearest its id is what the anchor
         actually lands on; later marks under the same id would ship the
         same link twice under different names. */
      if (taken.has(mark.id)) return;
      taken.add(mark.id);
      const until = i + 1 < marks.length ? marks[i + 1].at : stripped.length;
      const snippet = text(stripped.slice(mark.at, until)).slice(0, 220);
      rows.push({
        t: mark.head.slice(0, 120), s: group, y: file === 'laws.html' ? 'law' : 'article',
        u: file + '#' + mark.id, p: title + ' \u203a ' + mark.head.slice(0, 60),
        d: snippet, k: ''
      });
    });
  }
  /* Units: the list is data inside units.html, so search reads the data.
     The old names people actually type ride along as keywords. */
  const ALIAS = {
    Calicut: 'kozhikode', Thiruvananthapuram: 'trivandrum', Kochi: 'cochin',
    Mumbai: 'bombay', Chennai: 'madras', Bengaluru: 'bangalore', Bangalore: 'bengaluru',
    Varanasi: 'benares kashi', Vadodara: 'baroda', Gurugram: 'gurgaon',
    Puducherry: 'pondicherry', Prayagraj: 'allahabad', Pune: 'poona', Kolkata: 'calcutta'
  };
  const unitsHtml = fs.readFileSync(path.join(ROOT, 'units.html'), 'utf8');
  const contacts = {};
  for (const cm of unitsHtml.matchAll(/(\d+):\s*\{ t:\[([^\]]*)\](?:, e:'([^']*)')?(?:, a:'([^']*)')?/g)) {
    contacts[cm[1]] = {
      t: [...cm[2].matchAll(/'([^']+)'/g)].map((x) => x[1]),
      e: cm[3] || '', a: cm[4] || ''
    };
  }
  let unitCount = 0;
  for (const um of unitsHtml.matchAll(/\{c:'([^']+)',s:'([^']+)',p:'([^']*)'[^}]*?d:(\d+)[^}]*\}/g)) {
    const [, city, state, head, ref] = um;
    const c = contacts[ref] || { t: [], e: '', a: '' };
    const bits = [state];
    if (head) bits.push('Head: ' + head);
    if (c.t.length) bits.push(c.t.slice(0, 3).join(', '));
    if (c.e) bits.push(c.e);
    rows.push({
      t: 'PFA ' + city + ' unit', s: 'Places', y: 'place',
      u: 'units.html?q=' + encodeURIComponent(city),
      p: 'Units \u203a ' + city,
      d: bits.join(' \u00b7 ').slice(0, 230),
      k: (city + ' ' + state + ' ' + (ALIAS[city] || '') + ' unit hospital shelter rescue centre contact phone email helpline near me ' + c.a).toLowerCase().slice(0, 300)
    });
    unitCount += 1;
  }
  console.log(`rows layer: ${rows.length} rows (${unitCount} units).`);
  /* One index, one path. The client fetches 'search-index.json' relative to
     the page, and every page lives at the root, so the index lives at the
     root. A copy in assets/ once drifted apart from this file and the search
     box quietly served a stale crawl for days; the agreement test now pins
     the two paths together. The .js twin is the file:// fallback: fetch is
     dead on the file scheme, a script tag is not, so a double-clicked page
     still searches everything. */
  const payload = JSON.stringify({ generatedAt: new Date().toISOString(), pages, rows }, null, 0);
  fs.writeFileSync(path.join(ROOT, 'search-index.json'), payload);
  fs.writeFileSync(path.join(ROOT, 'search-index.js'), 'window.__PFA_SEARCH_INDEX = ' + payload + ';\n');
  const stale = path.join(ROOT, 'assets', 'search-index.json');
  if (fs.existsSync(stale)) fs.unlinkSync(stale);
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
  console.log(`Indexed ${pages.length} pages into search-index.json (+ .js twin) and sitemap.xml.`);
}
