#!/usr/bin/env node
/* Writes the newsroom's front page into newsroom.html from data/newsroom.json,
   between the two markers in the page.

     node scripts/build-newsroom.js
     node scripts/build-newsroom.js --check     (fails if newsroom.html is out of date)

   Every story is something that happened, dated, with the page that carries
   it: a case, an order PFA helped a government issue, a judgment, a CineKind
   edition. The front page holds up to four, the ones marked front 1 to 4, or
   with none marked the four newest. The desks below hold the rest, newest
   first. Case 001's full record and the closing band are written by hand
   below the markers, and this never touches them. A story with no photograph
   is set in type, never given a stand-in picture. The output never depends on
   today's date, so --check gives the same answer every day.

   Every link is checked against the page and the anchor it lands on, so a
   record renamed elsewhere on the site fails the build instead of leaving a
   dead link. HANDBOOK.md section 11. */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, 'newsroom.html');
const DATA = path.join(ROOT, 'data', 'newsroom.json');
const START = '<!-- newsroom:start. Written by scripts/build-newsroom.js from data/newsroom.json: edit the data, then run the script. -->';
const END = '<!-- newsroom:end -->';

const DESKS = {
  case: { tag: 'Case', group: 'cases' },
  law: { tag: 'Law', group: 'policy' },
  policy: { tag: 'Policy', group: 'policy' },
  cinekind: { tag: 'CineKind', group: 'cinekind' }
};
const GROUPS = [
  { id: 'policy', title: 'Policy and law' },
  { id: 'cinekind', title: 'CineKind' },
  { id: 'cases', title: 'Cases' }
];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const text = (v) => typeof v === 'string' && v.trim().length > 0;
const two = (n) => String(n).padStart(2, '0');
const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function parseDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? d : null;
}
const dmy = (d) => `${two(d.getUTCDate())} ${two(d.getUTCMonth() + 1)} ${d.getUTCFullYear()}`;
const long = (d) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

function imageHosts(root) {
  const m = /img-src ([^;"]+)/.exec(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  return m ? m[1].split(/\s+/).filter((t) => /^https:\/\//.test(t)).map((t) => new URL(t).host) : [];
}

function walkStrings(value, visit, key = '') {
  if (typeof value === 'string') visit(value, key);
  else if (Array.isArray(value)) value.forEach((v, i) => walkStrings(v, visit, `${key}[${i}]`));
  else if (value && typeof value === 'object') Object.keys(value).forEach((k) => walkStrings(value[k], visit, key ? `${key}.${k}` : k));
}

function validate(data, root = ROOT) {
  if (!data || !Array.isArray(data.stories)) return ['data/newsroom.json: there must be a "stories" list'];
  const problems = [];
  const hosts = imageHosts(root);
  const own = fs.readFileSync(path.join(root, 'newsroom.html'), 'utf8');
  const slugs = new Set();
  const fronts = new Set();
  data.stories.forEach((st, i) => {
    const where = `story ${i + 1}${st && text(st.title) ? ` (${st.title})` : ''}`;
    const say = (what) => problems.push(`${where}: ${what}`);
    if (!st || typeof st !== 'object') { say('is not an entry'); return; }
    if (!/^[a-z0-9][a-z0-9-]{2,59}$/.test(String(st.slug || ''))) say('slug must be 3 to 60 lowercase letters, digits and hyphens');
    else if (slugs.has(st.slug)) say(`slug ${st.slug} is used twice`);
    else slugs.add(st.slug);
    if (!Object.prototype.hasOwnProperty.call(DESKS, st.desk)) say(`desk must be one of ${Object.keys(DESKS).join(', ')}`);
    if (!text(st.title) || st.title.length > 90) say('title must be given, at most 90 characters');
    if (!text(st.dek) || st.dek.length > 260) say('dek must be given, at most 260 characters');
    if (!parseDate(st.date)) say('date must be a real date, written YYYY-MM-DD');
    if (!text(st.place)) say('place is missing');
    ['from', 'status'].forEach((k) => { if (st[k] != null && !text(st[k])) say(`${k}, when given, must say something`); });
    if (st.tag != null && (!text(st.tag) || st.tag.length > 24)) say('tag, when given, must be at most 24 characters');
    if (st.front != null) {
      if (![1, 2, 3, 4].includes(st.front)) say('front must be 1, 2, 3 or 4');
      else if (fronts.has(st.front)) say(`front ${st.front} is used twice`);
      else fronts.add(st.front);
    }
    if (st.image != null) {
      const p = st.image;
      if (!p || !text(p.src) || !text(p.alt)) say('image needs a src and an alt');
      else if (/^https:\/\//.test(p.src)) { if (!hosts.includes(new URL(p.src).host)) say(`image: ${new URL(p.src).host} is not in the img-src of the Content-Security-Policy in vercel.json`); }
      else if (/^[a-z0-9][\w./-]*$/i.test(p.src) && !p.src.includes('..')) { if (!fs.existsSync(path.join(root, p.src))) say(`image: ${p.src} is not on disk`); }
      else say('image: src must be a path on this site or an https address');
    }
    if (!st.link || !text(st.link.href) || !text(st.link.label)) say('link needs an href and a label');
    else {
      const m = /^([a-z0-9][\w-]*\.html)?(?:#([\w-]+))?$/i.exec(st.link.href);
      if (!m || (!m[1] && !m[2])) say(`link ${st.link.href} must be a page on this site, an anchor on it, or both`);
      else if (m[1] && !fs.existsSync(path.join(root, m[1]))) say(`link ${st.link.href}: ${m[1]} is not a page on this site`);
      else if (m[2] && !(m[1] ? fs.readFileSync(path.join(root, m[1]), 'utf8') : own).includes(`id="${m[2]}"`)) say(`link ${st.link.href}: there is no #${m[2]} to land on`);
    }
    walkStrings(st, (s, key) => { if (s.includes('\u2014')) say(`${key} contains an em dash, and the site shows none`); });
  });
  return problems;
}

const newestFirst = (stories) => stories.slice().sort((a, b) => (a.date === b.date ? (a.slug < b.slug ? -1 : 1) : (a.date < b.date ? 1 : -1)));

const ONERROR = 'onerror="var t=this.closest(\'[data-tile]\');if(t)t.setAttribute(\'data-noimg\',\'\');var f=this.closest(\'[data-shot]\');if(f)f.remove()"';

function tile(st, size) {
  const d = parseDate(st.date);
  const H = size === 'lead' ? 'h2' : 'h3';
  const tag = `<span class="nr-tag" data-desk="${esc(st.desk)}">${esc(st.tag || DESKS[st.desk].tag)}</span>`;
  const meta = `<p class="nr-tile__meta"><span>${esc(st.image ? st.place : (st.from || st.place))}</span><time datetime="${esc(st.date)}">${esc(long(d))}</time>${st.status ? `<span>${esc(st.status)}</span>` : ''}</p>`;
  const title = `<${H} class="nr-tile__title"><a class="nr-tile__link" href="${esc(st.link.href)}">${esc(st.title)}</a></${H}>`;
  if (st.image) {
    const loading = size === 'lead' ? 'fetchpriority="high"' : 'loading="lazy"';
    return `<article class="nr-tile nr-tile--${size} nr-tile--photo" data-tile><figure class="nr-tile__img" data-shot><img src="${esc(st.image.src)}" alt="${esc(st.image.alt)}" ${loading} decoding="async" ${ONERROR}></figure><div class="nr-tile__body">${tag}${title}${meta}</div></article>`;
  }
  return `<article class="nr-tile nr-tile--${size} nr-tile--text" data-tile><p class="nr-tile__date" aria-hidden="true">${dmy(d)}</p><div class="nr-tile__body">${tag}${title}${meta}</div></article>`;
}

function card(st) {
  const d = parseDate(st.date);
  const top = st.image
    ? `<figure class="nr-card__img" data-shot><img src="${esc(st.image.src)}" alt="${esc(st.image.alt)}" loading="lazy" decoding="async" ${ONERROR}></figure>`
    : `<p class="nr-card__date" aria-hidden="true">${dmy(d)}</p>`;
  return [
    `<li class="nr-card${st.image ? ' nr-card--photo' : ''}" data-tile>`,
    top,
    `<p class="nr-card__from"><span class="nr-tag" data-desk="${esc(st.desk)}">${esc(st.tag || DESKS[st.desk].tag)}</span><span>${esc(st.from || st.place)}</span></p>`,
    `<h3 class="nr-card__title"><a href="${esc(st.link.href)}">${esc(st.title)}</a></h3>`,
    `<p class="nr-card__dek">${esc(st.dek)}</p>`,
    `<p class="nr-card__meta"><time datetime="${esc(st.date)}">${esc(long(d))}</time><span class="nr-card__more">${esc(st.link.label)}</span></p>`,
    '</li>'
  ].join('\n');
}

function render(page, data) {
  const stories = newestFirst(data.stories);
  let front = stories.filter((s) => s.front != null).sort((a, b) => a.front - b.front);
  if (!front.length) front = stories.slice(0, 4);
  const onFront = new Set(front.map((s) => s.slug));
  const rest = stories.filter((s) => !onFront.has(s.slug));
  const desks = GROUPS.map((g) => ({ ...g, items: rest.filter((s) => DESKS[s.desk].group === g.id) })).filter((g) => g.items.length);
  const hasCase = page.includes('id="case-001"');
  const links = [front.length ? '<a href="#front">Front page</a>' : '']
    .concat(desks.map((g) => `<a href="#desk-${g.id}">${esc(g.title)}</a>`))
    .concat(hasCase ? ['<a href="#case-file">Case file</a>'] : [])
    .filter(Boolean).join('');
  const side = front.slice(1).map((s, i) => tile(s, front.length === 4 && i === 2 ? 'wide' : 'small')).join('\n');
  const block = [
    '<section class="nr" id="top" aria-labelledby="nrTitle">',
    '<div class="nr-mast">',
    '<h1 class="nr-title" id="nrTitle">Newsroom</h1>',
    `<div class="nr-strap"><nav class="nr-desks" aria-label="Newsroom sections">${links}</nav><p class="nr-count">${stories.length} ${stories.length === 1 ? 'story' : 'stories'} on the record</p></div>`,
    '</div>',
    front.length ? `<div class="nr-front" id="front" data-count="${front.length}">\n${tile(front[0], 'lead')}${front.length > 1 ? `\n<div class="nr-front__side">\n${side}\n</div>` : ''}\n</div>` : '',
    desks.map((g) => [
      `<section class="nr-desk" id="desk-${g.id}" aria-labelledby="desk-${g.id}-title">`,
      `<div class="nr-desk__head"><h2 class="nr-desk__title" id="desk-${g.id}-title">${esc(g.title)}</h2><p class="nr-desk__count">${g.items.length} ${g.items.length === 1 ? 'story' : 'stories'}</p></div>`,
      `<ol class="nr-cards">\n${g.items.map(card).join('\n')}\n</ol>`,
      '</section>'
    ].join('\n')).join('\n'),
    hasCase ? '<div class="nr-desk nr-desk--file" id="case-file"><div class="nr-desk__head"><h2 class="nr-desk__title">Case file</h2><p class="nr-desk__count">Case 001, in full</p></div></div>' : '',
    '</section>'
  ].filter(Boolean).join('\n');
  const a = page.indexOf(START);
  const b = page.indexOf(END);
  if (a === -1 || b === -1 || b < a) throw new Error('newsroom.html has lost its newsroom markers; put them back where the front page goes');
  return `${page.slice(0, a + START.length)}\n${block}\n${page.slice(b)}`;
}

function main() {
  const check = process.argv.includes('--check');
  let data;
  try { data = JSON.parse(fs.readFileSync(DATA, 'utf8')); } catch (error) {
    console.error(`data/newsroom.json could not be read as JSON: ${error.message}`);
    process.exit(1);
  }
  const problems = validate(data);
  if (problems.length) {
    console.error(`data/newsroom.json has ${problems.length} problem${problems.length === 1 ? '' : 's'}:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  const page = fs.readFileSync(PAGE, 'utf8');
  const out = render(page, data);
  if (check) {
    if (out !== page) { console.error('newsroom.html is out of date with data/newsroom.json. Run: node scripts/build-newsroom.js'); process.exit(1); }
    console.log(`newsroom.html carries all ${data.stories.length} stories.`);
    return;
  }
  if (out !== page) fs.writeFileSync(PAGE, out);
  console.log(`newsroom.html: ${data.stories.length} stories written, front page and desks.`);
}

if (require.main === module) main();

module.exports = { DESKS, GROUPS, validate, render, parseDate, newestFirst };
