#!/usr/bin/env node
'use strict';

/* One header, one announcement bar, one stylesheet, one script - stamped
   into every page from a single source.

   Why this exists. The site is static HTML with no build step, so each page
   carried its own copy of the header markup, the header CSS and the script
   that measures it. Fourteen copies drifted into three families:

     - nine pages copied founder.html (collapse at 860px, links hidden at 720px)
     - four copied pfa-shop.html (collapse at 720px, logo pinned left, letter
       spacing on the links, a Cart style even on pages with no cart)
     - index.html was a bundler export with the header written inline

   ...and a 14 KB base64 logo in every one of them. The header looked
   different from page to page because it *was* different.

   Now:
     assets/chrome-header.html   the markup (template)
     assets/chrome.css           the styling
     assets/chrome.js            the behaviour
     img/logo.png                the logo, a real file

   This script writes the markup into each page between the announcement bar
   and </header>, and makes sure the <link> and <script> are in place. It is
   idempotent; `--check` exits 1 if any page is out of date, which is what
   test/chrome-in-sync.test.js runs.

   Per-page facts live in PAGES below: which nav item is the page's own,
   whether it shows a Cart, and what its announcement says. */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TEMPLATE = path.join(ROOT, 'assets', 'chrome-header.html');
const FOOTER = path.join(ROOT, 'assets', 'chrome-footer.html');

const DEFAULT_ANNOUNCE = 'Every drive, camp and open day is free to attend';

/* current: the nav href that is this page. cart: shows the shop's Cart.
   announce: bar text. Every page has the bar; three used to opt out and the
   header looked different on them for it. root: links are absolute because the
   page is served from a nested URL.

   to: send one nav item somewhere else from this page only. The home page's
   Shop opens shop.html, the one-screen door, rather than dropping a visitor
   straight into 1,400 products; from inside the shop the same word still goes
   to the grid, because a gate you have already walked through is an obstacle.
   The label and the order of the nav never change, only the destination, so
   test/header-consistency.test.js still sees one header everywhere. */
const PAGES = {
  'index.html':        { current: null,               announce: 'Every donation funds rescue, treatment, and lifelong care', to: { 'pfa-shop.html': 'shop.html' } },
  'shop.html':         { current: 'pfa-shop.html',    announce: 'Every order funds rescue, treatment, and lifelong care' },
  'founder.html':      { current: 'founder.html',     announce: DEFAULT_ANNOUNCE },
  'laws.html':         { current: 'laws.html',        announce: DEFAULT_ANNOUNCE },
  'units.html':        { current: 'units.html',       announce: DEFAULT_ANNOUNCE },
  'careers.html':      { current: null,               announce: DEFAULT_ANNOUNCE },
  'ask.html':          { current: null,               announce: DEFAULT_ANNOUNCE },
  'track.html':        { current: null,               announce: DEFAULT_ANNOUNCE },
  'caregiver-card.html': { current: null,               announce: DEFAULT_ANNOUNCE },
  'achievements.html': { current: null,               announce: DEFAULT_ANNOUNCE },
  'report.html':       { current: null,               announce: 'An animal being hurt? Call 112 first, then tell us here' },
  'newsroom.html':     { current: 'newsroom.html',    announce: DEFAULT_ANNOUNCE },
  'wall.html':         { current: 'wall.html',        announce: DEFAULT_ANNOUNCE },
  'get-involved.html': { current: 'get-involved.html', announce: DEFAULT_ANNOUNCE },
  'cinekind.html':     { current: 'cinekind.html',    announce: 'CineKind 2026 · Mumbai · 4 October · World Animal Day' },
  'pfa-shop.html':     { current: 'pfa-shop.html',    announce: 'Every order funds rescue, treatment, and lifelong care', cart: true },
  'product.html':      { current: 'pfa-shop.html',    announce: 'Every order funds rescue, treatment, and lifelong care', cart: true, root: true },
  'donate.html':       { current: 'donate.html',      announce: DEFAULT_ANNOUNCE },
  'events.html':       { current: null,               announce: DEFAULT_ANNOUNCE },
  'search.html':       { current: null,               announce: DEFAULT_ANNOUNCE },
  'quiz.html':         { current: null,               announce: DEFAULT_ANNOUNCE }
};

/* submission-collage.html is a full-viewport piece with no site chrome.
   admin.html is the staff panel: it carries no public nav, announcement bar
   or footer, and must not be given them. */
const SKIP = new Set(['submission-collage.html', 'admin.html']);

const CART = '\n      <button class="navcart" id="navCart" data-count="0" aria-label="Open cart">Cart <span class="dot" id="navDot">0</span></button>';

function announceMarkup(text) {
  if (!text) return '';
  return '<div class="announce" id="announce" data-cursor="light">\n' +
    '  <p>' + text + '</p>\n' +
    '  <button type="button" aria-label="Close" id="annClose">\u2715</button>\n' +
    '</div>\n';
}

function rootify(html) {
  return html
    .replace(/\b(href|src)="(?!\/|#|https?:|mailto:|tel:|data:)([^"]+)"/g, '$1="/$2"');
}

/* Render the template for one page. Pure: string in, string out. */
function renderChrome(page) {
  const spec = PAGES[page];
  if (!spec) throw new Error(`sync-chrome: ${page} is not in PAGES; add it`);
  let out = fs.readFileSync(TEMPLATE, 'utf8')
    .replace(/<!--[\s\S]*?-->\n?/, '')             // the explanatory comment at the top
    .replace('{{ANNOUNCE}}\n', announceMarkup(spec.announce))
    .replace('{{CART}}', spec.cart ? CART : '')
    .replace(/\{\{CURRENT:([^|}]+)\|([^|}]+)(?:\|([^}]+))?\}\}/g, (m, href, label, cls) => {
      const classes = [];
      if (cls) classes.push(cls);
      /* Where this page sends the item, which is the item itself unless `to`
         says otherwise. data-nav keeps naming the section either way, so a
         rule can still target one nav item without guessing at the href. */
      const dest = (spec.to && spec.to[href]) || href;
      if (href === spec.current) {
        classes.push('current');
        /* On the page itself the link scrolls to the top. On a page that
           only belongs to that section (a product page under the shop) it
           is highlighted but still goes there: "Shop" on a product page
           must take you to the shop, not to the top of the product. */
        const own = href === page;
        const target = own ? '#top' : (spec.root ? `/${dest}` : dest);
        return `<a href="${target}" data-nav="${href}" class="${classes.join(' ')}" aria-current="page">${label}</a>`;
      }
      return classes.length ? `<a href="${dest}" data-nav="${href}" class="${classes.join(' ')}">${label}</a>` : `<a href="${dest}" data-nav="${href}">${label}</a>`;
    });
  /* "hide-sm current" reads oddly; the page's own item is never hidden. */
  out = out.replace(' class="hide-sm current"', ' class="current"');
  return spec.root ? rootify(out) : out;
}

const LINK = (root) => `<link rel="stylesheet" href="${root ? '/' : ''}assets/chrome.css">`;
/* Not deferred: it sits right after </header>, so the header exists when it
   runs and window.PFA_CHROME exists for every page script that follows. */
const SCRIPT = (root) => `<script src="${root ? '/' : ''}assets/chrome.js"></script>`;

/* Apply the chrome to a page's HTML. Pure. Used by this script and by the
   product/quiz template builders, so a rebuild can never reintroduce a
   hand-copied header. */
function applyChrome(html, page) {
  const spec = PAGES[page];
  if (!spec) throw new Error(`sync-chrome: ${page} is not in PAGES; add it`);

  /* 1. The block: from the announcement bar (if any) to </header> and the
        chrome script right after it. Anything in between is chrome. */
  html = html.replace(/[ \t]*<script src="\/?assets\/chrome\.js"( defer)?><\/script>\n?/g, '');
  const headerOpen = html.indexOf('<header');
  const headerClose = html.indexOf('</header>', headerOpen);
  if (headerOpen < 0 || headerClose < 0) throw new Error(`sync-chrome: ${page} has no <header>`);
  let blockStart = headerOpen;
  const annOpen = html.lastIndexOf('<div class="announce"', headerOpen);
  if (annOpen > -1 && annOpen > html.lastIndexOf('<body', headerOpen)) blockStart = annOpen;
  /* index.html's old bar was `.pfa-ann`; treat it the same way. */
  const oldAnn = html.lastIndexOf('<div class="pfa-ann"', headerOpen);
  if (oldAnn > -1 && oldAnn > html.lastIndexOf('<body', headerOpen)) blockStart = Math.min(blockStart, oldAnn);
  /* Eat the whitespace between the bar and the header so the stamp is tidy. */
  const before = html.slice(0, blockStart).replace(/[ \t]*$/, '');
  const after = html.slice(headerClose + '</header>'.length).replace(/^\n?/, '\n');
  html = before + renderChrome(page).trimEnd() + '\n' + SCRIPT(spec.root) + after;

  /* 1b. The footer: byte-identical everywhere. wall.html's had a stray
         "Get Involved" link inside The Wall's <li>, from a find-and-replace
         that meant to hit the header. One source ends that class of bug. */
  const footOpen = html.indexOf('<footer class="pfa-footer"');
  const footClose = html.indexOf('</footer>', footOpen);
  if (footOpen < 0 || footClose < 0) throw new Error(`sync-chrome: ${page} has no <footer class="pfa-footer">`);
  let footer = fs.readFileSync(FOOTER, 'utf8').replace(/<!--[\s\S]*?-->\n?/, '').trimEnd();
  if (spec.root) footer = rootify(footer);
  html = html.slice(0, footOpen) + footer + html.slice(footClose + '</footer>'.length);

  /* 2. The stylesheet link: once, in <head>, before the page's own <style>. */
  const linkTag = LINK(spec.root);
  html = html.replace(/[ \t]*<link rel="stylesheet" href="\/?assets\/chrome\.css">\n?/g, '');
  const headEnd = html.indexOf('</head>');
  const firstStyle = html.indexOf('<style>', html.indexOf('</title>'));
  const at = firstStyle > -1 && firstStyle < headEnd ? firstStyle : headEnd;
  html = html.slice(0, at) + linkTag + '\n' + html.slice(at);

  return html;
}

function pages() {
  return fs.readdirSync(ROOT).filter((f) => f.endsWith('.html') && !SKIP.has(f)).sort();
}

function run({ check } = {}) {
  const stale = [];
  for (const page of pages()) {
    const file = path.join(ROOT, page);
    const current = fs.readFileSync(file, 'utf8');
    const next = applyChrome(current, page);
    if (next !== current) {
      stale.push(page);
      if (!check) fs.writeFileSync(file, next);
    }
  }
  return stale;
}

module.exports = { applyChrome, renderChrome, PAGES, run };

if (require.main === module) {
  const check = process.argv.includes('--check');
  const stale = run({ check });
  if (check) {
    if (stale.length) {
      console.error(`chrome out of date on: ${stale.join(', ')}\nrun: npm run sync:chrome`);
      process.exit(1);
    }
    console.log('chrome in sync on every page.');
  } else {
    console.log(stale.length ? `chrome stamped into: ${stale.join(', ')}` : 'chrome already in sync.');
  }
}
