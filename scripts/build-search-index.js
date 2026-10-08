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
/* read.html is the library's reader: one page for every document, chosen by ?r=, so it is reached from library.html, which is indexed, never on its own. */
const EXCLUDE = new Set(['admin.html', '404.html', 'search.html', 'patron-card-preview.html', 'caregiver-card.html', 'animal.html', 'winner.html', 'submission-collage.html', 'read.html']);

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

/* Entities, decoded, so a title reads "Get Involved" and a fee reads
   "\u20b9500" in the search box rather than "&#183;" and "&#8377;". Dashes
   of every width become a plain hyphen: the site uses none (owner's rule),
   and the index must not bring them back. */
const NAMED = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", rsquo: '\u2019', lsquo: '\u2018',
  rdquo: '\u201d', ldquo: '\u201c', middot: '\u00b7', hellip: '\u2026', rarr: '\u2192', larr: '\u2190',
  times: '\u00d7', rupee: '\u20b9', copy: '\u00a9', mdash: '-', ndash: '-', minus: '-' };
function decode(s) {
  return String(s)
    .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => (Object.prototype.hasOwnProperty.call(NAMED, n.toLowerCase()) ? NAMED[n.toLowerCase()] : ' '))
    .replace(/[\u2010-\u2015\u2212]/g, '-');
}
function text(html) {
  return decode(html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<template[\s\S]*?<\/template>/gi, ' ')
    .replace(/<(header|footer|nav)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ').trim();
}
function meta(html, name) {
  const m = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*)["']`, 'i').exec(html)
    || new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${name}["']`, 'i').exec(html);
  return m ? decode(m[1]) : '';
}
/* Script and style first: units.html builds its cards in script strings
   that contain <h2>, and the crawl was indexing the code itself
   ("' + esc(st) + '") as the units page's keywords. */
function headings(html) {
  return [...html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(header|footer|nav)\b[\s\S]*?<\/\1>/gi, ' ').matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
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
    'donate.html': 'Do something', 'shop.html': 'Do something', 'report.html': 'Do something', 'track.html': 'Do something',
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
    /* The page's own name, without the site name after a bar or a dot.
       The home page is "Home": its title is written for search engines. */
    const title = file === 'index.html' ? 'Home' : text((/<title>([\s\S]*?)<\/title>/i.exec(html) || [])[1] || file)
      .replace(/\s*[|\u00b7]\s*People for Animals\s*$/i, '');
    const group = GROUP[file] || 'Explore';
    rows.push({
      t: title, s: 'Pages', y: 'page', u: file === 'index.html' ? 'index.html' : file,
      d: meta(html, 'description').slice(0, 220),
      k: headings(html).join(' ').slice(0, 1200)
    });
    /* Anchored sections: walk the page once, remembering the last id seen,
       and give every h2/h3 that can be reached by an anchor its own row. */
    let lastId = '';
    let lastUsed = false;
    /* h2 and h3 carry the sections; laws.html carries two hundred questions
       as <summary> spans instead, each under its own anchor, and a question
       nobody can search is a question nobody asked. Both count as marks.

       What counts as an anchor (8 Oct 2026). It used to be the last id seen,
       of anything, and that sent "Who you are." to careers.html#zoneErr, a
       hidden error line, and "Pay and join." to an input box. An anchor is
       now an id on a block a reader can land on: a section, an article, a
       div, a heading, a list item, a details block or a figure; never a
       control, never an error or empty-state line, never something hidden,
       and never the thank-you pane that only exists after paying.

       Form steps are not destinations. A heading inside a <form> ("Send
       it.", "Where the card goes.") is a step of filling it in, and the
       form itself is reached from its own row and the curated actions. */
    const BLOCK = /^(section|article|div|main|aside|details|summary|figure|li|h[1-6]|header|fieldset|dl|dt|table|ol|ul)$/i;
    /* Ranges no row may come from: every form, and every block that is
       hidden or only shown after a step (an error, an empty state, the
       "done" pane), found by balancing its own tag. */
    const off = [...stripped.matchAll(/<form\b[\s\S]*?<\/form>/gi)].map((f) => [f.index, f.index + f[0].length]);
    for (const b of stripped.matchAll(/<([a-z][a-z0-9]*)\b([^>]*)>/gi)) {
      const cls = (/\bclass="([^"]*)"/.exec(b[2]) || [])[1] || '';
      if (!/(^|\s)hidden(\s|=|$)/.test(b[2]) && !/(^|\s)(err|error|empty|done)(\s|$)/.test(cls)) continue;
      const tag = b[1].toLowerCase();
      const re = new RegExp('<(/?)' + tag + '\\b[^>]*>', 'gi');
      re.lastIndex = b.index + b[0].length;
      let depth = 1, end = stripped.length, t;
      while (depth && (t = re.exec(stripped)) !== null) { depth += t[1] ? -1 : 1; if (!depth) end = re.lastIndex; }
      off.push([b.index, end]);
    }
    const inForm = (at) => off.some(([a, b]) => at >= a && at < b);
    const walker = /<([a-z][a-z0-9]*)\b([^>]*?)\sid="([^"]+)"([^>]*)>|<h([23])[^>]*>([\s\S]*?)<\/h\5>|<span class="qa__q">([^<]+)<\/span>/gi;
    const marks = [];
    let m;
    while ((m = walker.exec(stripped)) !== null) {
      if (m[3]) {
        const attrs = (m[2] || '') + ' ' + (m[4] || '');
        const cls = (/\bclass="([^"]*)"/.exec(attrs) || [])[1] || '';
        const hidden = /(^|\s)hidden(\s|=|$)/.test(attrs);
        const flowOnly = /(^|\s)(err|error|empty|done)(\s|$)/.test(cls);
        const heading = /^h[23]$/i.test(m[1]);
        if (heading) {
          /* A heading with its own id: the block around it is the better
             landing (a product card, a shelf) when that block has not been
             claimed by an earlier heading; otherwise the heading itself. */
          const close = stripped.indexOf('</' + m[1], walker.lastIndex);
          if (close > -1 && !inForm(m.index)) {
            const id = lastId && !lastUsed ? lastId : m[3];
            marks.push({ id, head: text(stripped.slice(walker.lastIndex, close)), at: close });
            if (id === lastId) lastUsed = true;
            walker.lastIndex = close;
          }
          continue;
        }
        if (BLOCK.test(m[1]) && !hidden && !flowOnly && !inForm(m.index)) { lastId = m[3]; lastUsed = false; }
        continue;
      }
      if (inForm(m.index)) continue;
      marks.push({ id: lastId, head: text(m[6] || m[7] || ''), at: walker.lastIndex });
      lastUsed = true;
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
  /* Keyed by the city exactly as units.html spells it. Gurugram and
     Bhubaneswar were keyed by spellings the data does not use, so they never
     applied. Big cities with no unit of their own (Delhi, Chennai, Kolkata,
     Hyderabad, Pune) are answered in pfa-search.js by distance instead. */
  const ALIAS = {
    Calicut: 'kozhikode', Thiruvananthapuram: 'trivandrum', Mumbai: 'bombay',
    Bangalore: 'bengaluru', 'Gurgaon / Sadhana': 'gurugram gurgaon', Bhubaneshwar: 'bhubaneswar',
    Mysore: 'mysuru', Hubli: 'hubballi dharwad', Trichy: 'tiruchirappalli tiruchi', Kollam: 'quilon',
    Thrissur: 'trichur', 'Rohilkhand / Bareilly': 'bareilly', 'Nagpur (Vidarbha)': 'nagpur vidarbha',
    'Durg Bhilai': 'durg bhilai', Vasco: 'vasco da gama', Sriganganagar: 'ganganagar',
    'Pali Marwar': 'pali', Kumbakonam: 'kumbakonam', Secunderabad: 'secunderabad'
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
    const [whole, city, state, head, ref] = um;
    /* where it is, so a search for a city with no unit of its own can be
       answered with the nearest ones */
    const la = Number((/la:(-?[\d.]+)/.exec(whole) || [])[1]);
    const lo = Number((/lo:(-?[\d.]+)/.exec(whole) || [])[1]);
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
      k: (city + ' ' + state + ' ' + (ALIAS[city] || '') + ' ' + head + ' unit hospital shelter rescue centre contact phone email helpline').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 300),
      /* the street address on its own: pfa-search.js weighs it lightly, so
         a locality finds its unit without "road" finding all eighty */
      ...(c.a ? { a: c.a.replace(/\s+/g, ' ').slice(0, 300) } : {}),
      ...(Number.isFinite(la) && Number.isFinite(lo) && la && lo ? { g: [la, lo] } : {})
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
