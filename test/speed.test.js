'use strict';
/* The store was slow because every shopper waited on the catalogue
   function, which on a cold instance walks Shopify page by page. The answer
   is the edge: serve the last answer at once, refresh it behind the scenes.
   These pin that, and the static cache headers that were missing. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');

test('fonts, scripts, styles and images all carry cache headers', () => {
  const v = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  const src = v.headers.map((h) => h.source);
  assert.ok(src.includes('/fonts/(.*)'), 'the fonts actually live under /fonts');
  assert.ok(src.some((s) => /\\\.\(js\|css/.test(s)), 'root-level js/css (pfa-search.js, pfa-forms.js)');
  assert.ok(src.includes('/img/(.*)'));
  assert.ok(fs.existsSync(path.join(ROOT, 'fonts', 'marcellus-latin.woff2')));
});

test('every page that uses the display face asks for it at parse time', () => {
  /* The headings are Marcellus, self-hosted, 14 KB. The face was declared in a
     <style> block and nothing else, so the browser did not request the file
     until it laid out a heading that needed it - well after the HTML was
     parsed. With font-display:swap that means the fallback is painted first
     and the real face swaps in over it a beat later, which is visible as the
     headings changing shape after the page has settled. A preload starts the
     request when the head is parsed instead. */
  const pages = fs.readdirSync(ROOT)
    .filter((f) => f.endsWith('.html'))
    .filter((f) => fs.readFileSync(path.join(ROOT, f), 'utf8').includes('marcellus-latin.woff2'));
  assert.ok(pages.length >= 20, `expected the site's pages, found ${pages.length}`);

  const faults = [];
  for (const page of pages) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const preload = /<link rel="preload" href="(\/?fonts\/marcellus-latin\.woff2)"([^>]*)>/.exec(html);
    if (!preload) { faults.push(`${page}: declares Marcellus but never preloads it`); continue; }
    const [, href, attrs] = preload;

    /* Without crossorigin the preload is fetched in a different mode from the
       font request, so the file is downloaded twice and the preload buys
       nothing. It is the easiest attribute to leave off and the whole point. */
    if (!/\bcrossorigin\b/.test(attrs)) faults.push(`${page}: preload has no crossorigin, so the font is fetched twice`);
    if (!/as="font"/.test(attrs)) faults.push(`${page}: preload has no as="font"`);
    if (!/type="font\/woff2"/.test(attrs)) faults.push(`${page}: preload has no type`);

    /* product.html is served from /products/<handle>, so its URLs are
       root-absolute. The preload has to match the @font-face beside it or one
       of the two resolves to a path that does not exist. */
    const declared = /src\s*:\s*url\("(\/?fonts\/marcellus-latin\.woff2)"\)/.exec(html);
    if (declared && declared[1] !== href) {
      faults.push(`${page}: preloads ${href} but the face is declared at ${declared[1]}`);
    }

    /* Only the latin file. latin-ext covers characters these pages do not use,
       and a preload nothing consumes is a warning in the console and wasted
       bytes on every visit. */
    if (html.includes('marcellus-latin-ext.woff2" as="font"')) {
      faults.push(`${page}: preloads latin-ext, which nothing on the page uses`);
    }
  }
  assert.deepEqual(faults, [], '\n  ' + faults.join('\n  '));
});
