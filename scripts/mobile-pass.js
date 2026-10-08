#!/usr/bin/env node
'use strict';

/* The phone pass: one marked block at the end of each page's styles, so a
   page reads and works on a 320px screen without touching how it looks on a
   desktop.

     npm run build:mobile          write the block into every page
     npm run build:mobile -- --check   fail if a page's block is out of date

   Two things go in it (owner, 4 Oct 2026: "100% mobile-responsive").

   1. Type. The site sets its small capitals labels at 8 to 10.5px, which is
      fine on a desktop and too small to read on a phone. Every rule on the
      page that sets a font size under 11px is collected here and lifted to
      11px below 700px. Collected, not listed by hand, so a label added later
      is covered the next time this runs.

   2. Reach. Controls a thumb has to hit: search boxes, accordion headers,
      text buttons and the links that act as buttons are given at least a
      44px tall target on a phone (PAGE_RULES), in the page's own selectors.

   The block sits between two marker comments before the last </style> in
   the page's head, and is rewritten whole each run. shop.html is generated
   by its own builder, which carries the same rules. */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const START = '/* ---- phone pass (scripts/mobile-pass.js): generated, do not edit ---- */';
const END = '/* ---- end phone pass ---- */';
const SKIP = new Set(['admin.html', 'submission-collage.html', 'shop.html']);
const BREAK = 700;
/* Narrow screens, and any screen driven by a finger: a tablet held either
   way is read and tapped like a phone. */
const MEDIA = `(max-width:${BREAK}px),(pointer:coarse)`;
/* 10px, not 11: the site's small capitals labels are set at 10px by design
   and read at that size; only the 8 and 9px ones were too small. */
const FLOOR = 10;

/* The laws, academy and library search bars keep their one sticky row that
   swipes sideways (owner, 4 Oct 2026: a wrapped, taller bar looked worse).
   On a phone the search box keeps a usable width instead of shrinking to
   its icon. */
const FILTERS = ['@narrow .filters__row .search{min-width:58%;flex:0 0 58%}'];

/* Hand-written per page: targets and layout the type rule cannot cover. */
const COMMON = [
  /* a search field's box was 38px with a 16px input inside it, so most of
     the box did nothing when tapped */
  '.search{height:44px}',
  '.search input{height:100%}',
  /* text buttons ("Expand all", "Show me another") */
  '.linkbtn{padding-top:12px;padding-bottom:6px}',
  /* consent boxes beside a line of small print */
  '.check input{width:20px;height:20px;margin-top:1px;flex:none}'
];
const PAGE_RULES = {
  'careers.html': ['.jd summary{min-height:44px;padding:10px 0}'],
  /* the filter names were cut to "EVERY EVE..." two to a row: they wrap */
  'events.html': ['.ev-card__link,.ev-next__link{display:inline-block;padding:10px 0}', '.ev-bar{letter-spacing:.04em;gap:8px}', '.ev-bar__name{white-space:normal;overflow:visible;text-overflow:clip;line-height:1.25;padding:6px 0}'],
  'newsroom.html': ['.nr-desks a{display:inline-block;padding:12px 0}'],
  'wall.html': ['.theatre-link{display:inline-block;padding:12px 0}'],
  'someone.html': ['a[href="#story"],a[href="laws.html#b20"]{display:inline-block;padding-top:12px}'],
  'library.html': [...FILTERS, '.book__dl{min-height:36px;display:inline-flex;align-items:center}', '.shelf a,.book a{padding-top:4px;padding-bottom:4px}'],
  /* the aims swiped sideways under a vertical caption that made every card
     320px tall and mostly empty: on a phone they read as a list */
  'laws.html': FILTERS,
  'academy.html': [...FILTERS, '.aims{display:grid;grid-template-columns:1fr;overflow:visible;margin-right:0;padding-right:0}', '.aims li{flex:none}', '.aims::before{writing-mode:horizontal-tb;display:block;text-align:left;padding:10px 16px}'],
  'units.html': ['.gth__n{font-size:10px}', '.u-search{height:44px}', '.u-search input{height:100%}'],
  'achievements.html': ['.arcc__cap{font-size:max(10px,calc(var(--cw) * .034))}']
};

function headStyles(html) {
  const head = html.slice(0, html.indexOf('</head>') > 0 ? html.indexOf('</head>') : html.length);
  return [...head.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1].replace(new RegExp(escapeRe(START) + '[\\s\\S]*?' + escapeRe(END), 'g'), '')).join('\n');
}
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/* Every selector whose own declarations set a font size below the floor. */
function smallSelectors(css) {
  const out = new Set();
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of clean.matchAll(/([^{}@;]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim();
    const size = /(?:^|;|\s)font-size\s*:\s*([\d.]+)px/.exec(m[2]);
    /* under 6px is a size used to hide text, not to set it */
    if (!size || Number(size[1]) >= FLOOR || Number(size[1]) < 6) continue;
    if (!selector || /^(from|to|\d+%)$/i.test(selector) || /keyframes/i.test(selector)) continue;
    for (const one of selector.split(',')) {
      const s = one.trim();
      if (s && !/^(html|body|:root)$/.test(s)) out.add(s);
    }
  }
  return [...out];
}

function blockFor(page, html) {
  const css = headStyles(html);
  const small = smallSelectors(css);
  /* a common rule applies only where the page has that component */
  const common = COMMON.filter((rule) => css.includes(rule.slice(0, rule.search(/[{ ]/)) + '{'));
  const all = [...common, ...(PAGE_RULES[page] || [])];
  /* a rule written '@narrow ...' is for phone widths only, not for every
     touch screen: a tablet keeps the desktop arrangement */
  const rules = all.filter((r) => !r.startsWith('@narrow '));
  const narrow = all.filter((r) => r.startsWith('@narrow ')).map((r) => r.slice(8));
  const typeRule = small.length ? `\n  ${small.join(',\n  ')}{font-size:${FLOOR}px}` : '';
  const narrowBlock = narrow.length ? `\n@media (max-width:${BREAK}px){\n  ${narrow.join('\n  ')}\n}` : '';
  return `${START}\n@media ${MEDIA}{${typeRule}\n  ${rules.join('\n  ')}\n}${narrowBlock}\n${END}\n`;
}

function apply(page, html) {
  const block = blockFor(page, html);
  const existing = new RegExp(escapeRe(START) + '[\\s\\S]*?' + escapeRe(END) + '\\n?');
  if (existing.test(html)) return html.replace(existing, block);
  const headEnd = html.indexOf('</head>');
  const at = html.lastIndexOf('</style>', headEnd);
  if (at < 0) return html;
  return html.slice(0, at) + block + html.slice(at);
}

/* The site's own stylesheets other than the chrome (whose phone rules are
   written by hand in assets/chrome.css): the same type floor, appended at
   the end of the file so it wins over the rules it lifts. */
const SHEET_RULES = {
  'assets/library.css': ['.book__dl{min-height:40px}']
};
function sheets() {
  const dir = path.join(ROOT, 'assets');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.css') && f !== 'chrome.css').map((f) => `assets/${f}`).concat(['pfa-search.css'])
    .filter((f) => fs.existsSync(path.join(ROOT, f)));
}
function applySheet(file, css) {
  const existing = new RegExp('\\n?' + escapeRe(START) + '[\\s\\S]*?' + escapeRe(END) + '\\n?');
  const base = css.replace(existing, '\n');
  const small = smallSelectors(base);
  const rules = SHEET_RULES[file] || [];
  if (!small.length && !rules.length) return base === css ? css : base;
  const typeRule = small.length ? `\n  ${small.join(',\n  ')}{font-size:${FLOOR}px}` : '';
  const extra = rules.length ? `\n  ${rules.join('\n  ')}` : '';
  return `${base.replace(/\s*$/, '')}\n${START}\n@media ${MEDIA}{${typeRule}${extra}\n}\n${END}\n`;
}

function pages() {
  return fs.readdirSync(ROOT).filter((f) => f.endsWith('.html') && !SKIP.has(f));
}

if (require.main === module) {
  const check = process.argv.includes('--check');
  const stale = [];
  for (const page of pages()) {
    const file = path.join(ROOT, page);
    const html = fs.readFileSync(file, 'utf8');
    const next = apply(page, html);
    if (next === html) continue;
    if (check) stale.push(page); else fs.writeFileSync(file, next);
  }
  for (const sheet of sheets()) {
    const file = path.join(ROOT, sheet);
    const css = fs.readFileSync(file, 'utf8');
    const next = applySheet(sheet, css);
    if (next === css) continue;
    if (check) stale.push(sheet); else fs.writeFileSync(file, next);
  }
  if (check && stale.length) {
    console.error(`phone pass out of date in: ${stale.join(', ')}\nRun: npm run build:mobile`);
    process.exit(1);
  }
  if (!check) console.log('phone pass written');
}

module.exports = { smallSelectors, blockFor, apply, START, END, FLOOR, BREAK };
