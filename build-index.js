#!/usr/bin/env node
/* build-index.js — crawl the site and write search-index.json, which
   pfa-search.js merges into its curated index at runtime.

   Run from the site folder:   node build-index.js
   Re-run whenever a page, law answer, product or event changes.

   Extractors, in order:
   - laws.html      every Q&A (question, part, first sentence, cited sections)
   - pfa-shop.html  every product and kit from the page's own data, with price
   - events.html    every dated row, with city and venue
   - cinekind.html  honourees
   - every page     title, meta description, and each id'd section with a heading
   Curated rows in pfa-search.js win on duplicate URLs. Zero dependencies. */
'use strict';
var fs = require('fs'), path = require('path');
/* The pages a stranger may be shown, and the paths that are never a result.
   Taken from scripts/build-search-index.js rather than written again here:
   that file already carries the list, and the comment above it records why -
   this index had walked into admin.html and put four rows in search, one of
   them quoting the signed-in panel's own headings back at a stranger.
   pfa-search.js filters those rows out at runtime, but the file this writes is
   served at /search-index.json and anyone may read it, so the panel's headings
   must not be in it in the first place. */
var SHARED = require('./scripts/build-search-index.js');
var dir = path.resolve(process.argv[2] || '.');
var rows = [];

function read(f) { try { return fs.readFileSync(path.join(dir, f), 'utf8'); } catch (e) { return ''; } }
function clean(html) { return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' '); }
function text(html) {
  return String(html).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/\s+/g, ' ').trim();
}
function attr(tag, name) { var m = tag.match(new RegExp('\\s' + name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i')); return m ? (m[2] || m[3] || m[4] || '') : ''; }
function firstSentence(t, max) {
  var out = '', re = /[\s\S]*?[.!?](?=\s|$)/g, m;
  while ((m = re.exec(t)) && out.length < 80) out += m[0];
  out = (out || t).trim();
  return out.length > max ? out.slice(0, max).replace(/\s\S*$/, '') + '…' : out;
}
function keywords(t, n) {
  var counts = {};
  t.toLowerCase().replace(/[^a-z0-9-]+/g, ' ').split(/\s+/).forEach(function (w) { if (w.length > 3) counts[w] = (counts[w] || 0) + 1; });
  return Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, n).join(' ');
}
var seen = {};
function add(r) {
  if (!r.u || !r.t || seen[r.u]) return;
  if (SHARED.isPrivatePath(r.u)) return;
  seen[r.u] = 1;
  rows.push(r);
}

/* ---- laws.html: one row per question ------------------------------------- */
(function () {
  var html = clean(read('laws.html')); if (!html) return;
  var parts = {}, pm, pre = /<section[^>]*id=["'](part-[a-z])["'][^>]*>[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>/gi;
  while ((pm = pre.exec(html))) parts[pm[1]] = text(pm[2]);
  var re = /<details[^>]*class=["']qa["'][^>]*id=["']([a-z]\d+)["'][^>]*data-part=["']([A-Z])["'][^>]*(?:data-cites=["']([^"']*)["'])?[^>]*>([\s\S]*?)<\/details>/gi, m;
  while ((m = re.exec(html))) {
    var id = m[1], part = parts['part-' + m[2].toLowerCase()] || 'Laws', cites = m[3] || '', body = m[4];
    var q = text((body.match(/class=["']qa__q["'][^>]*>([\s\S]*?)<\/span>/i) || [, ''])[1]);
    var a = text((body.match(/<div[^>]*class=["']qa__a["'][^>]*>([\s\S]*?)<div[^>]*class=["']cites/i) || body.match(/<div[^>]*class=["']qa__a["'][^>]*>([\s\S]*?)$/i) || [, ''])[1]);
    if (!q) continue;
    add({ t: q, s: 'Laws', y: 'law', u: 'laws.html#' + id,
      d: firstSentence(a, 170) + (cites ? ' Basis: ' + cites.replace(/\s*\|\s*/g, ', ') + '.' : ''),
      k: part.toLowerCase() + ' ' + id.toUpperCase() + ' ' + cites.toLowerCase() + ' ' + keywords(q + ' ' + a, 20) });
  }
})();

/* ---- pfa-shop.html ------------------------------------------------------
   Products are no longer indexed here. The shop's catalogue is fetched at
   runtime from /api/paws-catalog (Paws & Tails' live Shopify stock), so there
   are no product literals in the page to scrape, and a build-time snapshot
   would go stale the moment the seller changes stock or price. Indexing a
   price PFA does not set, for an item that may be sold out, is worse than not
   indexing it at all: the shop page has its own search over live stock.
   The curated 'Shop' and 'New adopter kits' rows in pfa-search.js cover the
   section itself.                                                          */

var SECTION = { laws: 'Laws', units: 'Places', events: 'Places', donate: 'Do something', 'pfa-shop': 'Shop', founder: 'About', index: 'Explore' };
fs.readdirSync(dir).filter(function (f) {
  return /\.html$/i.test(f) && !SHARED.EXCLUDE.has(f) && !SHARED.isPrivatePath(f);
}).sort().forEach(function (file) {
  var html = clean(read(file)), base = file.replace(/\.html$/i, ''), section = SECTION[base] || 'Explore';
  var title = text((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, base])[1]).replace(/\s*[|·]\s*People for Animals$/i, '');
  var desc = attr((html.match(/<meta[^>]+name=["']description["'][^>]*>/i) || [''])[0], 'content');
  var body = text((html.match(/<body\b[^>]*>[\s\S]*<\/body>/i) || [html])[0]);
  if (!desc) desc = text((html.match(/class=["']lede["'][^>]*>([\s\S]*?)<\/p>/i) || [, ''])[1]) || body.slice(0, 160).replace(/\s\S*$/, '') + '…';
  add({ t: title, s: section, y: 'page', u: file, d: desc, k: keywords(body, 40) });

  var idRe = /<(section|article|div)\b[^>]*\sid=["']([^"']+)["'][^>]*>/gi, hits = [], m;
  while ((m = idRe.exec(html))) hits.push({ id: m[2], tag: m[0], at: m.index + m[0].length });
  hits.forEach(function (h, i) {
    if (/^(pfa|top|main|root|app|hero|announce|header|cursor|toast|part-|th|drawer|scrim|cart|bar|flow|more|empty|grid|legs|p\d|f\d)/i.test(h.id)) return;
    var chunk = html.slice(h.at, hits[i + 1] ? hits[i + 1].at - hits[i + 1].tag.length : html.length);
    var heading = text((chunk.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i) || [, ''])[1]);
    var t = heading || attr(h.tag, 'data-screen-label') || attr(h.tag, 'aria-label');
    if (!t || t.length < 3 || t.length > 90) return;
    var para = text((chunk.match(/<p[^>]*>([\s\S]*?)<\/p>/i) || [, ''])[1]), all = text(chunk);
    if (all.length < 40) return;
    add({ t: t, s: section, y: 'page', u: file + '#' + h.id, d: firstSentence(para || all, 160), k: keywords(all, 25) });
  });
});

fs.writeFileSync(path.join(dir, 'search-index.json'), JSON.stringify(rows));
var by = {}; rows.forEach(function (r) { by[r.s] = (by[r.s] || 0) + 1; });
console.log('search-index.json: ' + rows.length + ' entries  ' + JSON.stringify(by));
