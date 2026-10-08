#!/usr/bin/env node
'use strict';

/* Bring the CineKind reels' stills and videos onto PFA's own server.

   The reels must play on the PFA site, never by sending the visitor to
   Instagram (owner, 7 Oct 2026, an implementation requirement). Instagram's
   own embed plays a reel inside another site only when the reel's sound
   allows it; the founder page's reels do, the CineKind ones answer "Watch on
   Instagram" and leave. So the CineKind reels are played from a copy on this
   site, media/cinekind-2026/reels/<id>.mp4, and this script fetches it with
   the still. A tile whose video is not here is not shown.
   ------------------------------------------------------------------------
   The founder page's reels wear stills the owner cut from the reels by hand
   (img/watch-01..04.jpg). The CineKind reels get theirs the way the founder
   page's YouTube films do: fetched once, saved beside the site, and served
   from here. Never hot-linked from Instagram, for the founder script's
   reasons: Instagram's image links are signed and expire, a request to it on
   page load breaks this page's promise that nothing third-party loads before
   play is pressed, and a still that stops resolving simply vanishes.

     npm run media:reels            fetch any still not already here
     npm run media:reels -- --force fetch them all again

   The ids come from the page (data-reel on cinekind.html), so the page and
   this script cannot disagree about which reels exist. Add a reel to the
   page and run this again. Each still is saved as
   media/cinekind-2026/reels/<id>.jpg, the path the tile already asks for.

   Instagram is asked two ways, because it answers different callers
   differently: the reel's own page as a link-preview crawler (its og:image),
   then the public embed page (the embed's poster image). The first that
   gives an image wins. If neither does, the tile keeps its dark face and play
   ring, and a still cut by hand can be dropped in at the same path.

   Run it with a network connection. Node 18 or later (for fetch). */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, 'cinekind.html');
const FORCE = process.argv.includes('--force');

/* Each reel tile on the page: its name (data-reel), its Instagram id when
   known (data-ig), and the two files it plays and shows (data-video,
   data-still). Only a tile with an Instagram id can be fetched; the others
   were supplied as files. */
function reelsFromPage(html) {
  const out = [];
  for (const m of html.matchAll(/<div class="ckreel"([^>]*)>/g)) {
    const at = (k) => { const r = new RegExp(`data-${k}="([^"]*)"`).exec(m[1]); return r ? r[1] : ''; };
    if (!at('reel') || out.some((r) => r.reel === at('reel'))) continue;
    out.push({ reel: at('reel'), ig: at('ig'), video: at('video'), still: at('still') });
  }
  return out;
}

/* An image address as it sits in HTML or in JSON inside HTML. */
function unescape(url) {
  return url
    .replace(/\\u0026/g, '&').replace(/\\\//g, '/')
    .replace(/&amp;/g, '&').replace(/&#x2F;/gi, '/').replace(/&#38;/g, '&');
}

/* The poster image in a page Instagram returned, or null. Order matters:
   og:image is the reel's cover; the embed's own poster next; the JSON
   fields last. Only Instagram's and Facebook's CDNs are accepted. */
function stillFrom(html) {
  const tries = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<img[^>]+class=["'][^"']*EmbeddedMediaImage[^"']*["'][^>]+src=["']([^"']+)["']/i,
    /<img[^>]+src=["']([^"']+)["'][^>]+class=["'][^"']*EmbeddedMediaImage/i,
    /"display_url"\s*:\s*"([^"]+)"/,
    /"thumbnail_src"\s*:\s*"([^"]+)"/
  ];
  for (const re of tries) {
    const m = re.exec(html);
    if (!m) continue;
    const url = unescape(m[1]);
    if (/^https:\/\/[^/]*(cdninstagram\.com|fbcdn\.net)\//.test(url)) return url;
  }
  return null;
}

/* The reel's video, as Instagram hands it to a link-preview crawler or in
   the embed page's data. Only Instagram's and Facebook's CDNs. */
function videoFrom(html) {
  const tries = [
    /<meta[^>]+property=["']og:video:secure_url["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+property=["']og:video["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:video(?::secure_url)?["']/i,
    /"video_url"\s*:\s*"([^"]+)"/,
    /<video[^>]+src=["']([^"']+)["']/i
  ];
  for (const re of tries) {
    const m = re.exec(html);
    if (!m) continue;
    const url = unescape(m[1]);
    if (/^https:\/\/[^/]*(cdninstagram\.com|fbcdn\.net)\//.test(url)) return url;
  }
  return null;
}

const ASK = [
  (id) => ({ url: `https://www.instagram.com/reel/${id}/`, ua: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)' }),
  (id) => ({ url: `https://www.instagram.com/p/${id}/embed/captioned/`, ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15' })
];

const KINDS = {
  still: { find: stillFrom, type: /^image\//, min: 5000 },
  video: { find: videoFrom, type: /^video\/|^application\/octet-stream/, min: 50000 }
};

async function grab(id, kind) {
  const K = KINDS[kind];
  for (const ask of ASK) {
    const { url, ua } = ask(id);
    try {
      const page = await fetch(url, { headers: { 'user-agent': ua, 'accept-language': 'en' }, redirect: 'follow' });
      if (!page.ok) continue;
      const src = K.find(await page.text());
      if (!src) continue;
      const res = await fetch(src, { headers: { 'user-agent': ua } });
      if (!res.ok || !K.type.test(res.headers.get('content-type') || '')) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < K.min) continue;
      return buf;
    } catch (e) { /* the next way of asking */ }
  }
  return null;
}

async function main() {
  const reels = reelsFromPage(fs.readFileSync(PAGE, 'utf8'));
  console.log(`\n${reels.length} reels on cinekind.html.\n`);
  let missing = 0;
  for (const r of reels) {
    for (const [kind, rel] of [['still', r.still], ['video', r.video]]) {
      if (!rel) continue;
      const dest = path.join(ROOT, rel);
      if (fs.existsSync(dest) && !FORCE) { console.log(`  ${r.reel}  ${kind} already here`); continue; }
      if (!/^[\w-]{6,20}$/.test(r.ig)) { missing += 1; console.log(`  ${r.reel}  NO ${kind.toUpperCase()} (no Instagram id to ask with)`); continue; }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const buf = await grab(r.ig, kind);
      if (buf) { fs.writeFileSync(dest, buf); console.log(`  ${r.reel}  ${kind} ${Math.round(buf.length / 1024)}KB`); }
      else { missing += 1; console.log(`  ${r.reel}  NO ${kind.toUpperCase()} (Instagram did not give one)`); }
    }
  }
  console.log('');
  if (missing) console.log('  A reel tile needs both its files in the tree; save them by hand at the\n  data-video and data-still paths on its tile.\n');
}

module.exports = { reelsFromPage, stillFrom, videoFrom, unescape };

if (require.main === module) main().catch((e) => { console.error(e.message); process.exitCode = 1; });
