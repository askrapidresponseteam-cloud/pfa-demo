'use strict';

/* The header, announcement bar and cursor are one thing, stamped into every
   page from assets/chrome-header.html by scripts/sync-chrome.js. This fails
   the moment a page's copy drifts from the source. Fix: npm run sync:chrome. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { run, PAGES } = require('../scripts/sync-chrome.js');

const ROOT = path.join(__dirname, '..');

test('every page carries the chrome exactly as the source renders it', () => {
  const stale = run({ check: true });
  assert.deepEqual(stale, [], `out of date: ${stale.join(', ')} - run npm run sync:chrome`);
});

test('every page in the tree is known to the chrome table', () => {
  const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html') && f !== 'submission-collage.html' && f !== 'admin.html');
  const unknown = pages.filter((p) => !PAGES[p]);
  assert.deepEqual(unknown, [], `add these to PAGES in scripts/sync-chrome.js: ${unknown.join(', ')}`);
});

test('no page carries its own copy of what the chrome provides', () => {
  const pages = Object.keys(PAGES).filter((p) => fs.existsSync(path.join(ROOT, p)));
  const problems = [];
  for (const page of pages) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    if (/data:image\/png;base64,/.test(html)) problems.push(`${page}: inlined logo`);
    if (/\.pfa-footer\{/.test(html)) problems.push(`${page}: footer CSS`);
    if (/header\.site\{position:fixed/.test(html)) problems.push(`${page}: header CSS`);
    if (/cursor:none!important/.test(html)) problems.push(`${page}: cursor hiding`);
    if (/fonts\.googleapis\.com/.test(html)) problems.push(`${page}: Google Fonts (Marcellus is self-hosted)`);
    if ((html.match(/setProperty\(['"]--nav['"]/g) || []).length) problems.push(`${page}: its own header measure`);
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('on a product page the highlighted Shop link goes to the shop, not to the top of the product', () => {
  const fs = require('node:fs'); const path = require('node:path');
  const product = fs.readFileSync(path.join(__dirname, '..', 'product.html'), 'utf8');
  const header = product.slice(product.indexOf('<header class="site"'), product.indexOf('</header>'));
  /* data-nav may sit between the href and the class: what matters is that the
     highlighted Shop link points at the shop rather than at #top */
  require('node:assert/strict').match(header, /<a href="\/pfa-shop\.html"[^>]*class="current" aria-current="page">Shop<\/a>/);
  const shop = fs.readFileSync(path.join(__dirname, '..', 'pfa-shop.html'), 'utf8');
  const shopHeader = shop.slice(shop.indexOf('<header class="site"'), shop.indexOf('</header>'));
  require('node:assert/strict').match(shopHeader, /<a href="#top"[^>]*class="current" aria-current="page">Shop<\/a>/, 'on the shop itself it still scrolls to the top');
});

test('the registered office and how to reach it are in the footer of every page, from the one source', () => {
  /* Contact details that live on one page go stale on the other eighteen. All
     of it is in assets/chrome-footer.html and nowhere else, so a correction is
     one edit and a sync rather than a search across the tree. */
  const DETAILS = [
    '4-T, DCM Building, 16 Barakhamba Road, New Delhi 110001, India',
    '+91 11 2081 8191',
    '+91 11 2081 8194',
    'gandhim@exmpls.sansad.in'
  ];
  /* The numbers are written with non-breaking spaces so they cannot be split
     across two lines, so compare with whitespace normalised rather than
     writing &nbsp; into the expectations and making them unreadable. */
  const flat = (s) => s.replace(/&nbsp;|\u00a0/g, ' ');
  const footer = flat(fs.readFileSync(path.join(ROOT, 'assets', 'chrome-footer.html'), 'utf8'));
  DETAILS.forEach((d) => assert.ok(footer.includes(d), `the footer source is missing: ${d}`));

  /* A number that is only text cannot be dialled from a phone, and an address
     that is only text cannot be written to without copying it out by hand. */
  assert.match(footer, /href="tel:\+911120818191"/);
  assert.match(footer, /href="tel:\+911120818194"/);
  assert.match(footer, /href="mailto:gandhim@exmpls\.sansad\.in"/);

  /* Block-level, so the three lines stack under any stylesheet. assets/ is
     cached for an hour and the HTML is not, so for up to an hour after a
     deploy this markup is read by the previous chrome.css. Written as inline
     spans, the address, the numbers and the mailbox ran into one paragraph. */
  assert.ok(/<address class="pfa-footer__where">\s*<div>/.test(footer),
    'the contact lines must be block-level in the markup, not styled into place');

  const pages = Object.keys(PAGES).filter((p) => fs.existsSync(path.join(ROOT, p)));
  DETAILS.forEach((d) => {
    const without = pages.filter((p) => !flat(fs.readFileSync(path.join(ROOT, p), 'utf8')).includes(d));
    assert.deepEqual(without, [], `"${d}" missing from: ${without.join(', ')} - run npm run sync:chrome`);
  });

  /* <address> is italic by default and the rest of the footer is not, so the
     override has to exist or the block arrives looking like a quotation. */
  const css = fs.readFileSync(path.join(ROOT, 'assets', 'chrome.css'), 'utf8');
  assert.match(css, /\.pfa-footer__where\{[^}]*font-style:normal/);
});

test('the contact details are written once, not copied into a page that will drift', () => {
  /* Anything that hardcodes them outside the footer source is a second copy to
     keep in step. The stamped pages are the footer, so they are exempt. */
  const stray = fs.readdirSync(ROOT)
    .filter((f) => f.endsWith('.html') && !PAGES[f])
    .filter((f) => /Barakhamba|2081[\s\u00a0]|gandhim@/i.test(fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/&nbsp;/g, ' ')));
  assert.deepEqual(stray, [], `these carry their own copy of the contact details: ${stray.join(', ')}`);
});

test('the paw tracks under Shop are the brand blue, at full strength', () => {
  /* The tracks are an SVG data URI in a CSS background. currentColor cannot
     reach into one, so the fill is a literal and has to be changed by hand;
     nothing else on the site would catch it drifting.

     They also have to be drawn at full opacity. This sat at .32 while the fill
     was near-black, which read as light grey. At .32 a #16b6ff fill composites
     against the white header to roughly #b4e8ff, so the colour would be set
     correctly and still look wrong. */
  const css = fs.readFileSync(path.join(ROOT, 'assets', 'chrome.css'), 'utf8');
  const start = css.indexOf('header.site nav a[data-nav="pfa-shop.html"]::after{');
  assert.ok(start > -1, 'the paw rule is gone');
  const rule = css.slice(start, css.indexOf('pointer-events:none}', start));

  const encoded = /url\("data:image\/svg\+xml,([^"]+)"\)/.exec(rule);
  assert.ok(encoded, 'the tracks are no longer an inline SVG');
  const svg = decodeURIComponent(encoded[1]);
  assert.match(svg, /fill="#16b6ff"/, 'the tracks must be the brand blue');
  assert.equal((svg.match(/<(ellipse|circle)/g) || []).length, 8, 'two pads and six toes');
  assert.match(rule, /opacity:1/, 'a faded fill is not the colour it is set to');
});

test('the paws walk on their own, and stop for a reason', () => {
  /* The trot used to run only on hover, so anyone who never pointed at the
     link never saw it. It runs by default now and pausing is the interaction.
     Three rules decide this and two of them have identical specificity, so
     this reads the parsed stylesheet in cascade order rather than grepping. */
  const { JSDOM } = require('jsdom');
  const css = fs.readFileSync(path.join(ROOT, 'assets', 'chrome.css'), 'utf8');
  const sheet = new JSDOM(`<style>${css}</style>`).window.document.styleSheets[0];

  const found = [];
  const walk = (rules, cond) => {
    for (const r of rules) {
      if (r.cssRules) { walk(r.cssRules, r.conditionText || (r.media && r.media.mediaText) || ''); continue; }
      if (!/pfa-shop\.html/.test(r.selectorText || '')) continue;
      const anim = r.style.getPropertyValue('animation');
      const play = r.style.getPropertyValue('animation-play-state');
      if (anim || play) found.push({ sel: r.selectorText, cond, anim, play });
    }
  };
  walk(sheet.cssRules, '');

  const base = found.find((f) => !f.cond && f.sel === 'header.site nav a[data-nav="pfa-shop.html"]::after');
  assert.ok(base, 'the default rule sets no animation, so the paws never move');
  assert.match(base.anim, /pfa-trot .* infinite/, 'the walk must be the default state');
  assert.ok(!/paused/.test(base.anim + base.play), 'the default must not be paused');

  const current = found.find((f) => /\.current::after/.test(f.sel));
  assert.equal(current.play, 'paused', 'on the shop itself the animal has arrived, so it stops');

  const hover = found.find((f) => /hover/.test(f.cond || '') && /:hover::after/.test(f.sel));
  assert.equal(hover.play, 'paused', 'pointing at it must stop it');
  assert.ok(!hover.anim, 'pausing, not restarting: it should halt mid-stride, not snap to frame one');

  /* Reduced motion has to clear the default now. Cancelling it on :hover alone
     would leave it running for exactly the people who asked it not to, and it
     must come after the default to win at equal specificity. */
  const still = found.find((f) => /reduced-motion/.test(f.cond || ''));
  assert.ok(still, 'nothing stops the walk for someone who asked for less movement');
  assert.equal(still.anim, 'none');
  assert.ok(!/:hover/.test(still.sel), 'it has to clear the default, not the hover');
  /* Located by the paw's own rule: the file has other reduced-motion blocks
     earlier, and searching for the media query alone finds the wrong one. */
  const stops = css.indexOf('pfa-shop.html"]::after{ animation:none }');
  assert.ok(stops > -1, 'the reduced-motion rule for the paws is gone');
  assert.ok(stops > css.indexOf('animation:pfa-trot'),
    'the reduced-motion rule must come after the rule it overrides');
});

test('the logo is animated by the stylesheet, not by changing the artwork', () => {
  /* The mark alights as the page paints: it drops the last few pixels into
     place, once, and leaves nothing running. The file is untouched; this moves
     the <img> around it. */
  const css = fs.readFileSync(path.join(ROOT, 'assets', 'chrome.css'), 'utf8');
  const footer = fs.readFileSync(path.join(ROOT, 'assets', 'chrome-header.html'), 'utf8');

  /* The artwork is used exactly as it was: same file, same intrinsic size. If
     the animation ever needed the image altered to work, it would be the wrong
     animation. */
  assert.match(footer, /<img src="img\/logo\.png" alt="People for Animals" width="231" height="79">/);

  const rule = /\.wordmark img\{[^}]*\}/.exec(css);
  assert.ok(rule, 'the logo rule is gone');
  assert.match(rule[0], /animation:pfa-alight/);
  assert.doesNotMatch(rule[0], /infinite/, 'the mark arrives once; it does not fidget');

  /* The fill mode is the whole trick and the easiest thing to get wrong.
     `backwards` holds the opening frame before the animation starts, so there
     is no flash of the settled mark. `both` or `forwards` would also persist
     the closing frame, and a persisted animated transform outranks a plain
     declaration, so the hover lift below would silently stop working. */
  assert.match(rule[0], /pfa-alight[^;}]*\bbackwards\b/, 'fill mode must be backwards');
  assert.doesNotMatch(rule[0], /pfa-alight[^;}]*\b(both|forwards)\b/,
    'a persisted end state would outrank the hover transform');

  const frames = /@keyframes pfa-alight\{([\s\S]*?)\n\}/.exec(css);
  assert.ok(frames, 'the keyframes are gone');
  assert.match(frames[1], /from\{opacity:0;transform:translateY\(-\d+px\)\}/, 'it comes down into place');
  assert.match(frames[1], /to\{opacity:1;transform:translateY\(0\)\}/);

  /* It is a link home, so it answers a pointer, and both of those stop for
     anyone who asked for less movement. */
  assert.match(css, /\.wordmark:hover img,\s*\n\s*\.wordmark:focus-visible img\{transform:translateY\(-2px\)\}/);
  const still = css.slice(css.indexOf('@media (prefers-reduced-motion:reduce){', css.indexOf('pfa-alight')));
  assert.match(still, /\.wordmark img\{animation:none;transition:none\}/);
  assert.match(still, /\.wordmark:hover img[\s\S]{0,60}transform:none/);

  /* And the anchor carries no transform of its own, so it can never fight
     the image's animation. Until Sep 2026 that was guaranteed by pinning the
     absolute centring (translate(-50%,-50%)); the theme pass replaced that
     placement with a three-track grid - the fix that stops a wide nav
     running under the mark - which guarantees the same property more
     simply: no transform at all. */
  const anchor = /\.wordmark\{[^}]*\}/.exec(css);
  assert.ok(anchor, 'the wordmark rule is gone');
  assert.doesNotMatch(anchor[0], /transform:/, 'the anchor must never carry a transform of its own');
});
