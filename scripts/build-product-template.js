#!/usr/bin/env node
'use strict';

/* Rebuild product.html's shared shell from pfa-shop.html.
   ------------------------------------------------------------------------
   product.html is not a copy of the shop that someone keeps in step by hand.
   The font block, the stylesheet, the header and the footer are taken from
   pfa-shop.html every time this runs, so the two pages cannot drift: edit the
   shop, run this, and the product page follows.

   Everything specific to the product page lives between the markers below and
   is preserved untouched:

     <style> … shop stylesheet … PFA_PRODUCT_CSS_START … END </style>
     <script> … PFA_PRODUCT_JS_START … END </script>

   Run: npm run build:product     (test/product-template.test.js fails if the
   two are out of step, so a forgotten run is caught rather than shipped.)
   ------------------------------------------------------------------------ */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SHOP = path.join(ROOT, 'pfa-shop.html');
const PRODUCT = path.join(ROOT, 'product.html');

/* The shop lives at the site root, so its links are relative and correct
   there. This page is served at /products/<handle>, one level down, where the
   same href resolves to /products/pfa-shop.html and 404s. Every relative URL
   copied in from the shop is therefore rewritten to root-absolute: the whole
   header nav, the whole footer, and the self-hosted font files. */
/* The shop's own header points its "Shop" item at #top. Under /products/
   that same item must lead back to the shop: sync-chrome writes it so, and
   this is the one difference beside the URL rewrite the tests allow for. */
/* On the shop itself the Shop link scrolls to the top; on a product page it has
   to go back to the shop. Matched on a pattern rather than an exact string, so
   adding an attribute to the nav anchor cannot silently stop this working and
   leave the product page pointing at its own top. */
function sectionLink(html) {
  return html.replace(
    /<a href="#top"([^>]*)class="current" aria-current="page">Shop<\/a>/,
    '<a href="/pfa-shop.html"$1class="current" aria-current="page">Shop</a>'
  );
}

function rootify(html) {
  const skip = /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#|\?)/i;
  return html
    .replace(/\b(href|src|action)\s*=\s*"([^"]*)"/gi, (whole, attr, url) => (
      !url || skip.test(url) ? whole : `${attr}="/${url}"`
    ))
    .replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (whole, quote, url) => (
      !url || skip.test(url) ? whole : `url(${quote}/${url}${quote})`
    ));
}

function between(text, start, end, label) {
  const a = text.indexOf(start);
  const b = text.indexOf(end, a);
  if (a < 0 || b < 0) throw new Error(`could not find ${label} in the source`);
  return text.slice(a, b + end.length);
}

function shopParts() {
  const shop = fs.readFileSync(SHOP, 'utf8');
  const charset = shop.indexOf('<meta charset');
  const styleOpen = shop.indexOf('<style>', charset);
  const styleClose = shop.indexOf('</style>', styleOpen);
  return {
    fonts: rootify(shop.slice(0, charset)
      .replace('<!DOCTYPE html>', '').replace('<html lang="en">', '').replace('<head>', '').trim()),
    stylesheet: rootify(shop.slice(styleOpen + '<style>'.length, styleClose)),
    header: sectionLink(rootify(between(shop, '<header class="site"', '</header>', 'the site header'))),
    footer: rootify(between(shop, '<footer class="pfa-footer"', '</footer>', 'the site footer'))
    /* The cursor used to be carried as a part too. It now lives in
       assets/chrome.js with the header, so there is nothing to copy. */
  };
}

function replaceBlock(html, openTag, closeTag, replacement, label) {
  const a = html.indexOf(openTag);
  const b = html.indexOf(closeTag, a);
  if (a < 0 || b < 0) throw new Error(`could not find ${label} in product.html`);
  return html.slice(0, a) + replacement + html.slice(b + closeTag.length);
}

function build() {
  const parts = shopParts();
  let product = fs.readFileSync(PRODUCT, 'utf8');

  /* Keep the product-only CSS and JS exactly as they are. */
  const ownCss = between(product, '/* PFA_PRODUCT_CSS_START */', '/* PFA_PRODUCT_CSS_END */', 'the product CSS markers');
  const ownJs = between(product, '/* PFA_PRODUCT_JS_START */', '/* PFA_PRODUCT_JS_END */', 'the product JS markers');

  /* Stylesheet: the shop's, then the product page's own rules. */
  const styleOpen = product.indexOf('<style>', product.indexOf('<!--PFA_HEAD_END-->'));
  const styleClose = product.indexOf('</style>', styleOpen);
  product = product.slice(0, styleOpen) +
    '<style>' + parts.stylesheet + '\n' + ownCss + '\n' +
    product.slice(styleClose);

  product = replaceBlock(product, '<header class="site"', '</header>', parts.header, 'the header');
  product = replaceBlock(product, '<footer class="pfa-footer"', '</footer>', parts.footer, 'the footer');

  /* The self-hosted display face, so headings match with no network.
     The region starts at the explanatory comment, not at <style>, because
     parts.fonts carries that comment too: starting later would re-insert it on
     every run and the rebuild would never settle. */
  const fontsStart = product.indexOf('<!-- Marcellus self-hosted');
  const fontsEnd = product.indexOf('</style>', product.indexOf('<style>', fontsStart)) + '</style>'.length;
  if (fontsStart > -1) product = product.slice(0, fontsStart) + parts.fonts + product.slice(fontsEnd);

  void ownJs;   // untouched, kept only to assert the markers are still present

  /* Header, announcement bar and chrome link/script come from the shared
     chrome (scripts/sync-chrome.js), applied last so the copy taken from the
     shop above is never what ships. */
  return require('./sync-chrome.js').applyChrome(product, 'product.html');
}

if (require.main === module) {
  const next = build();
  const current = fs.readFileSync(PRODUCT, 'utf8');
  if (next === current) {
    console.log('product.html already matches pfa-shop.html.');
  } else {
    fs.writeFileSync(PRODUCT, next);
    console.log('product.html rebuilt from pfa-shop.html.');
  }
}

module.exports = { build, shopParts, rootify, sectionLink };
