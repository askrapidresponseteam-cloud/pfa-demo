'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../lib/routes/paws-catalog');
const handler = require('../lib/routes/product-page');

const product = {
  id: '8493756809391', handle: 'himalaya-liv-52-forte', title: 'Himalaya Liv 52 Forte Tablets',
  description: 'Liver support <b>for</b> dogs & cats.', category: 'nutraceutical', categoryLabel: 'Nutraceuticals',
  animal: 'Dog and Cat', vendor: 'Example Seller', prescriptionRequired: false, available: true, minPrice: 1650, maxPrice: 1650,
  images: [{ id: '1', src: 'https://cdn.shopify.com/s/files/x.webp', alt: '' }],
  variants: [{ id: '46608189325487', title: '30 Tablets', sku: 'HIM-LIV52', available: true, price: 1650, compareAtPrice: 1700, image: null }]
};
const other = { ...product, id: '2', handle: 'other-liver-tonic', title: 'Other Liver Tonic </script><script>alert(1)</script>' };

function run(url) {
  const response = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
  const request = { method: 'GET', url, headers: { host: 'pfa.test' }, query: Object.fromEntries(new URL(url, 'https://x').searchParams) };
  return handler(request, response).then(() => response);
}

test.beforeEach(() => { catalog.getCatalog = async () => ({ products: [product, other] }); });

test('a known handle renders a full page with real meta, JSON-LD and the product embedded', async () => {
  const r = await run('/api/index?__route=product-page&handle=himalaya-liv-52-forte');
  assert.equal(r.statusCode, 200);
  assert.match(r.body, /<title>Himalaya Liv 52 Forte Tablets \| PFA Store<\/title>/);
  assert.match(r.body, /property="og:image" content="https:\/\/cdn\.shopify\.com/);
  assert.match(r.body, /rel="canonical" href="https:\/\/pfa\.test\/products\/himalaya-liv-52-forte"/);
  assert.match(r.body, /"@type":"Product"/);
  assert.match(r.body, /window\.PFA_PRODUCT=\{"id":"8493756809391"/);
  assert.match(r.body, /window\.PFA_RELATED=\[\{"id":"2"/);
  assert.match(r.headers['Cache-Control'], /s-maxage=600/);
});

test('PUBLIC_SITE_URL is used only when it is a real origin', async () => {
  /* `vercel env pull` writes "[SENSITIVE]" for protected variables; that must
     never reach a canonical tag. A genuine origin, with or without a trailing
     slash, must win over the request host. */
  try {
    process.env.PUBLIC_SITE_URL = '[SENSITIVE]';
    let r = await run('/api/index?__route=product-page&handle=himalaya-liv-52-forte');
    assert.match(r.body, /rel="canonical" href="https:\/\/pfa\.test\/products\/himalaya-liv-52-forte"/);
    assert.ok(!r.body.includes('[SENSITIVE]'), 'a placeholder must not be rendered');

    process.env.PUBLIC_SITE_URL = 'https://peopleforanimalsindia.org/';
    r = await run('/api/index?__route=product-page&handle=himalaya-liv-52-forte');
    assert.match(r.body, /rel="canonical" href="https:\/\/peopleforanimalsindia\.org\/products\/himalaya-liv-52-forte"/);
  } finally {
    delete process.env.PUBLIC_SITE_URL;
  }
});

test('embedded JSON cannot break out of the script tag', async () => {
  const r = await run('/api/index?__route=product-page&handle=other-liver-tonic');
  assert.equal(r.statusCode, 200);
  assert.ok(!r.body.includes('</script><script>alert(1)'), 'closing tag escaped');
  assert.match(r.body, /\\u003c\/script/);
});

test('an unknown handle is a 404 page, still styled, not indexed', async () => {
  const r = await run('/api/index?__route=product-page&handle=does-not-exist');
  assert.equal(r.statusCode, 404);
  assert.match(r.body, /noindex/);
  assert.match(r.body, /window\.PFA_PRODUCT=null/);
  /* The guarantee is that a miss is a real page rather than a bare error.
     It used to be checked by looking for /assets/site.css, which belongs to
     the other half of the project; the pages in this tree carry their styles
     inline, so the same guarantee is checked against this tree's shell. */
  assert.match(r.body, /<style>/, 'the 404 must still be styled');
  assert.match(r.body, /<header class="site"/, 'and still carry the site header');
  assert.match(r.body, /pfa-footer/, 'and the footer');
});

test('the handle is read from the /products/ path and .html is tolerated', () => {
  const { handleFrom } = handler._private;
  assert.equal(handleFrom({ url: '/products/Some-Handle.html', query: {} }), 'some-handle');
  assert.equal(handleFrom({ url: '/api/index?handle=abc', query: { handle: 'abc' } }), 'abc');
});

test('when the catalogue is down the page still ships and lets the browser retry', async () => {
  catalog.getCatalog = async () => { throw new Error('shopify down'); };
  const r = await run('/api/index?__route=product-page&handle=himalaya-liv-52-forte');
  assert.equal(r.statusCode, 200);
  assert.match(r.body, /window\.PFA_PRODUCT=null/);
  assert.match(r.headers['Cache-Control'], /no-store/);
});

/* ---------------- the picture frames ---------------- */

test('no picture can hang out of its frame, on any page that has one', () => {
  /* A thumbnail spilled out of its box, and then the main product shot turned
     out to be cut off at the bottom by the same fault.

     Every one of these frames is display:grid with place-items:center, and the
     image inside asked for height:100%. A percentage height against a centred
     grid area does not reliably resolve; when it falls back to auto the picture
     keeps its own proportions, grows past the square frame, and is either
     clipped by the overflow or hangs out where there is none. A square
     photograph fits either way, which is why most of the catalogue looked fine
     and a tall box of supplement did not.

     So the rule is: the image takes its height from a ratio, and that ratio
     matches its frame. Checked on every page that draws one rather than on the
     selector that happened to be reported. */
  const fs = require('node:fs');
  const path = require('node:path');
  const { JSDOM } = require('jsdom');
  const ROOT = path.join(__dirname, '..');

  const frames = ['.pd__shot', '.pd__thumb', '.card__tile', '.line__tile'];
  const pages = fs.readdirSync(ROOT)
    .filter((f) => f.endsWith('.html'))
    .filter((f) => frames.some((s) => fs.readFileSync(path.join(ROOT, f), 'utf8').includes(s + ' img')));
  assert.ok(pages.length >= 4, `expected several pages with picture frames, found ${pages.length}`);

  const faults = [];
  for (const page of pages) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const css = (html.match(/<style>[\s\S]*?<\/style>/g) || [])
      .map((b) => b.replace(/<\/?style>/g, '')).join('\n');
    const sheet = new JSDOM(`<style>${css}</style>`).window.document.styleSheets[0];
    const rule = (sel) => [...sheet.cssRules].find((r) => r.selectorText === sel);

    for (const sel of frames) {
      const box = rule(sel);
      const img = rule(`${sel} img`);
      if (!box || !img) continue;
      const where = `${page} ${sel}`;

      if (/%/.test(img.style.getPropertyValue('height') || '')) {
        faults.push(`${where}: image height is a percentage of a centred grid area`);
        continue;
      }
      const imgRatio = img.style.getPropertyValue('aspect-ratio');
      if (!imgRatio) { faults.push(`${where}: image has neither a definite height nor a ratio`); continue; }

      /* The image's ratio has to be the frame's, or it letterboxes inside a
         box that is not the shape of the hole it sits in. .pd__thumb is a
         square by width and height rather than by aspect-ratio. */
      const boxRatio = box.style.getPropertyValue('aspect-ratio')
        || (box.style.getPropertyValue('width') === box.style.getPropertyValue('height') ? '1' : '');
      if (boxRatio !== imgRatio) faults.push(`${where}: image ratio ${imgRatio} does not match frame ${boxRatio || 'unknown'}`);
    }
  }
  assert.deepEqual(faults, [], '\n  ' + faults.join('\n  '));
});

test('the frames that can be overflowed also clip', () => {
  /* Belt as well as braces: even with the sizing right, a frame holding a
     picture should not let one escape. .line__tile is the one that does not
     clip, and it is left alone here rather than quietly changed. */
  const fs = require('node:fs');
  const path = require('node:path');
  const shop = fs.readFileSync(path.join(__dirname, '..', 'pfa-shop.html'), 'utf8');
  for (const sel of ['.card__tile{', '.pd__shot{']) {
    const at = shop.indexOf(sel);
    if (at < 0) continue;
    assert.match(shop.slice(at, shop.indexOf('}', at)), /overflow:hidden/, `${sel} must clip`);
  }
});

/* ---------------- what happens after Add to bag ---------------- */

function buyRow() {
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'product.html'), 'utf8');
  const src = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1]).reduce((a, b) => (a.length > b.length ? a : b));
  const grab = (name) => {
    const start = src.indexOf(`function ${name}(`);
    assert.ok(start > -1, `${name} is gone from the product page`);
    let depth = 0;
    for (let i = src.indexOf('{', start); i < src.length; i += 1) {
      if (src[i] === '{') depth += 1;
      else if (src[i] === '}') { depth -= 1; if (!depth) return src.slice(start, i + 1); }
    }
    throw new Error(`unbalanced ${name}`);
  };
  const body = `${grab('inBag')}\n${grab('buyHtml')}`;
  return (qty, available) => new Function('readBag', 'chosen',
    `${body}; return buyHtml(${available});`)(() => (qty ? { v1: qty } : {}), { id: 'v1', available });
}

test('adding to the bag changes the control you just pressed', () => {
  /* Pressing Add to bag did nothing a shopper could see. The only sign was the
     count in the far corner of the header, and the toast that was supposed to
     confirm it could not render at all. The button now becomes the count, with
     a way to change it, which is the shop's own pattern for its tiles. */
  const row = buyRow();
  assert.match(row(0, true), /Add to bag/);
  assert.doesNotMatch(row(0, true), /in bag/);

  const one = row(1, true);
  assert.match(one, /pd__qty__n[^>]*>1</, 'the answer to "did that work" is where the press was');
  assert.doesNotMatch(one, /Add to bag/, 'the button is replaced, not sat beside');
  assert.match(one, /data-q="-"/);
  assert.match(one, /data-q="\+"/);
  assert.match(one, /Go to bag/);
  /* The count alone. "1 in bag" needed a strip wide enough to read as its own
     panel, which is what made it sit flat beside two full buttons. */
  assert.doesNotMatch(one, /in bag<|IN BAG</i, 'the label is the number');

  assert.match(row(3, true), /pd__qty__n[^>]*>3</, 'the count is real, not a tick');
  assert.match(row(12, true), /pd__qty__n[^>]*>12</, 'and it does not overflow at two digits');

  /* Out of stock has no count and no stepper, whatever is in the bag. */
  assert.match(row(0, false), /Unavailable/);
  assert.doesNotMatch(row(0, false), /data-q=/);
});

test('the toast can actually be seen', () => {
  /* It was written as `.done .toast`, sitting in a run of .done rules and
     picking up their prefix. #toast is a top-level element and never inside an
     order-complete panel, so it got no position, no background and no
     opacity:0: "Added" went into an unstyled div under the footer. Nothing on
     the shop or the product page had ever shown a toast. */
  const fs = require('node:fs');
  const path = require('node:path');
  for (const page of ['pfa-shop.html', 'product.html', 'quiz.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
    const css = (html.match(/<style>[\s\S]*?<\/style>/g) || []).join('\n');
    assert.doesNotMatch(css, /\.done \.toast\{/, `${page}: the toast is scoped to a panel it is never in`);
    assert.match(css, /\n\.toast\{[^}]*position:fixed/, `${page}: the toast has no rule of its own`);

    if (/id="toast"/.test(html)) {
      /* And it must not be inside a .done, or unscoping it would be pointless. */
      const before = html.slice(0, html.indexOf('id="toast"'));
      const opens = (before.match(/<div class="done"/g) || []).length;
      assert.equal(opens, 0, `${page}: the toast element sits inside a .done after all`);
    }
  }
});

test('the stepper is the same box as the buttons beside it', () => {
  /* It took its height from its own small label and rendered as a thin strip
     next to two full-height buttons. The row stretches its items now, so the
     stepper is exactly as tall as a .btn whatever padding .btn is later given,
     with no number here to keep in step with one over there. */
  const fs = require('node:fs');
  const path = require('node:path');
  const { JSDOM } = require('jsdom');
  const html = fs.readFileSync(path.join(__dirname, '..', 'product.html'), 'utf8');
  const css = (html.match(/<style>[\s\S]*?<\/style>/g) || []).join('\n').replace(/<\/?style>/g, '');
  const sheet = new JSDOM(`<style>${css}</style>`).window.document.styleSheets[0];
  const rule = (sel) => [...sheet.cssRules].find((r) => r.selectorText === sel);

  assert.equal(rule('.pd__buy').style.getPropertyValue('align-items'), 'stretch',
    'centre alignment is what let the stepper be shorter than the buttons');
  /* No hardcoded height anywhere: a number here would drift from .btn's padding. */
  assert.equal(rule('.pd__qty').style.getPropertyValue('height'), '');

  /* And it reads as the same object in a different state, not another kind of
     control: same border and same type as .btn. */
  const btn = rule('.btn').style;
  const qty = rule('.pd__qty').style;
  assert.equal(qty.getPropertyValue('border'), btn.getPropertyValue('border'));
  assert.equal(qty.getPropertyValue('font-weight'), btn.getPropertyValue('font-weight'));
  assert.equal(qty.getPropertyValue('letter-spacing'), btn.getPropertyValue('letter-spacing'));
  assert.equal(qty.getPropertyValue('text-transform'), btn.getPropertyValue('text-transform'));
});
