'use strict';

/* The CineKind 2026 reels.

   IMPLEMENTATION REQUIREMENT (owner, 7 Oct 2026, after two rounds of it being
   missed): a reel plays on the PFA site and never sends the visitor to
   Instagram. Same display, opening and playing as the founder page's reels.
   Instagram's embed plays these two only on Instagram ("Watch on Instagram",
   because of their sound), so they play from this site's own copy. These
   tests fail the build if a link out, an embed, or a tile without a local
   video comes back. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(ROOT, 'cinekind.html'), 'utf8');
const { reelsFromPage, stillFrom, videoFrom } = require(path.join(ROOT, 'scripts', 'fetch-reel-stills.js'));
const REELS = ['glimpse', 'the-room', 'interview', 'the-hall', 'nikhar-juneja', 'john-abraham'];
const fig = page.slice(page.indexOf('<div class="ckreels"'), page.indexOf('<ol class="roll">'));
const tilesHtml = fig;
const reelJs = page.slice(page.indexOf('(function reels(){'), page.indexOf('})();', page.indexOf('(function reels(){')));

test('six reels from the night sit under the film, before the honours, as founder-style tiles', () => {
  const sec = page.slice(page.indexOf('id="honours-2026"'));
  assert.ok(sec.indexOf('class="ckreels"') > sec.indexOf('id="night-2026"') && sec.indexOf('class="ckreels"') < sec.indexOf('<ol class="roll">'));
  for (const r of REELS) {
    assert.equal((fig.match(new RegExp(`data-reel="${r}"`, 'g')) || []).length, 1, r);
    assert.ok(fig.includes(`data-video="media/cinekind-2026/reels/${r}.mp4"`), `${r} plays from this site`);
    assert.ok(fig.includes(`data-still="media/cinekind-2026/reels/${r}.jpg"`), `${r} wears its still from this site`);
  }
  assert.deepEqual(reelsFromPage(page).map((x) => x.reel), REELS, 'the fetch script reads the same reels');
  assert.equal((fig.match(/class="ckreel__go"/g) || []).length, REELS.length, 'a Play button on each, as on the founder tiles');
  assert.match(page, /\.ckreels__grid\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
});

test('no reel can leave the site: no links, no Instagram embed', () => {
  assert.ok(tilesHtml.includes('data-reel="glimpse"'), 'the tiles were found');
  assert.doesNotMatch(tilesHtml, /<a\b/, 'no link anywhere on a tile');
  assert.doesNotMatch(tilesHtml, /instagram\.com/i, 'a tile never points at Instagram');
  assert.doesNotMatch(reelJs, /instagram\.com\/reel\/' \+ id \+ '\/embed/, 'the Instagram embed is not used for these reels');
  assert.doesNotMatch(reelJs, /createElement\('iframe'\)/);
  assert.doesNotMatch(reelJs, /window\.open|location\.href\s*=/);
});

test('they play in the reel box from the local file', () => {
  assert.match(reelJs, /createElement\('video'\)/);
  assert.match(reelJs, /v\.setAttribute\('playsinline', ''\);/);
  assert.match(reelJs, /v\.setAttribute\('src', film\);/);
  assert.match(reelJs, /LOCAL = \/\^media\\\/cinekind-2026\\\/reels\\\//, 'only this site\'s own files');
});

test('a reel tile never starts the PR screening as well', () => {
  /* The screening opens on a press of anything carrying data-film, through a
     listener on the whole document. A reel tile carried data-film too, so
     playing a reel also started the PR film behind it (owner, 7 Oct 2026). */
  assert.doesNotMatch(tilesHtml, /data-film/);
  const filmOwners = [...page.matchAll(/<[a-z][\w-]*\b[^<>]*\sdata-film(?=[\s>=])[^<>]*>/g)].map((m) => m[0]);
  assert.equal(filmOwners.length, 1, 'one element on the page opens the PR screening');
  assert.match(filmOwners[0], /id="film"/, 'and it is the PR button');
});

test('every tile on the page ships with its video and its still, so no tile can be a dead end', () => {
  for (const m of fig.matchAll(/data-(video|still)="([^"]+)"/g)) {
    assert.ok(fs.existsSync(path.join(ROOT, m[2])), `${m[2]} is named on the page but is not in the tree`);
  }
  assert.doesNotMatch(reelJs, /method: 'HEAD'/, 'whether a tile shows is not left to a network check');
});

test('the fetch script finds the still and the video in each shape Instagram answers with, only on its CDN', () => {
  const img = 'https://scontent-bom1-1.cdninstagram.com/v/t51.2885-15/abc.jpg?stp=dst-jpg&_nc_ht=x';
  const vid = 'https://instagram.fbom3-1.fna.fbcdn.net/o1/v/t16/f2/m86/x.mp4?efg=1&_nc_ht=y';
  assert.equal(stillFrom(`<meta property="og:image" content="${img.replace(/&/g, '&amp;')}" />`), img);
  assert.equal(stillFrom(`<img class="EmbeddedMediaImage" alt="" src="${img.replace(/&/g, '&amp;')}">`), img);
  assert.equal(stillFrom(`{"display_url":"${img.replace(/\//g, '\\/').replace(/&/g, '\\u0026')}"}`), img);
  assert.equal(videoFrom(`<meta property="og:video" content="${vid.replace(/&/g, '&amp;')}" />`), vid);
  assert.equal(videoFrom(`{"video_url":"${vid.replace(/\//g, '\\/').replace(/&/g, '\\u0026')}"}`), vid);
  assert.equal(videoFrom('<meta property="og:video" content="https://evil.example/x.mp4">'), null);
  assert.equal(stillFrom('<html>Log in</html>'), null);
});
