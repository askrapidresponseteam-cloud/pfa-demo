'use strict';
/* Brands for the shop, worked out from the seller's own Shopify data.

   Shopify has a `vendor` field, and on this seller's store it reads "Paws &
   Tails" on every product, so it cannot tell a Farmina bag from a Zoetis
   tablet. What the seller actually maintains is a collection per brand
   (/collections/farmina, /collections/royal-canin, ...), each with a title
   and, where they have set one, a logo image. Those collections are the
   source of truth here: the band on the shop shows their images, and a
   product belongs to a brand when Shopify says it is in that collection.

   Nothing in this file is typed in by hand. If the seller renames a brand,
   drops one or adds one, the next catalogue refresh follows. A logo the
   seller has not uploaded is simply absent and the shop shows the name.

   Two dials, both environment variables, both optional:

     PAWS_BRAND_COLLECTIONS   "off" turns brands off entirely. A comma
                              separated list of collection handles pins the
                              set exactly, in that order, and skips the
                              detection below. Unset means detect.
     PAWS_BRAND_ROSTER    "off" skips the per-collection roster
                              fetch and uses title matching alone. For a
                              store that rate-limits, or a build that must
                              not make thirty more requests.

   Detection, when nothing is pinned: a collection is a brand when at least
   MIN_TITLE_MATCHES listed products have titles that begin with its title.
   "Royal Canin" qualifies because dozens of products are "Royal Canin ...";
   "Dog Shampoo" does not, because no product is called "Dog Shampoo ...".
   Where one candidate's title is a prefix of another's ("Farmina" and
   "Farmina Growth"), the shorter is the brand and the longer is a line
   within it, and is dropped. The store's own name is never a brand.

   Roster: title matching finds most of a brand, but not a NexGard box
   that never says "Boehringer Ingelheim" on the front. So for each brand the
   collection's own product list is fetched from Shopify and merged in. A
   fetch that fails leaves that brand on title matches alone; it never fails
   the catalogue.

   Markdowns: a Shopify variant carries `compare_at_price`, the price the
   seller says the item was. When it is higher than the price, the item is
   marked down and the shop may say so. This file only reads the two numbers;
   the shop decides what to show. Nothing is invented: no compare-at price,
   no offer. */

const MIN_TITLE_MATCHES = 3;
const MAX_BRANDS = 60;
const ROSTER_CONCURRENCY = 4;
const ROSTER_PAGE = 250;
const ROSTER_MAX_PAGES = 10;

/* Lower case, one space between words, no trademark marks, no punctuation
   beyond letters, digits and the ampersand, so "Me-O" and "ME O" and "Me‑O"
   (with a non-breaking hyphen) all read the same. */
function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\u2122\u00ae\u00a9]/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[^a-z0-9&]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/* Does `title` begin with `prefix` as whole words? "farmina n&d" begins with
   "farmina"; "farminas choice" does not. */
function beginsWith(title, prefix) {
  if (!prefix) return false;
  if (title === prefix) return true;
  return title.startsWith(prefix) && title.charAt(prefix.length) === ' ';
}

function pinnedHandles() {
  const raw = String(process.env.PAWS_BRAND_COLLECTIONS || '').trim();
  if (!raw) return null;
  if (/^off$/i.test(raw)) return [];
  return raw.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
}

/* Which of the seller's collections are brands. Returns them in display
   order: pinned order if pinned, otherwise most products first so the band
   opens on the names a shopper is most likely to know. Each carries the
   product ids matched by title, which is the fallback roster. */
function detectBrandCollections(products, collections, options = {}) {
  const pinned = options.pinned === undefined ? pinnedHandles() : options.pinned;
  const storeName = normalize(options.storeName || 'Paws & Tails');
  const list = Array.isArray(collections) ? collections : [];
  const items = (Array.isArray(products) ? products : []).map((p) => ({
    id: String(p.id),
    title: normalize(p.title)
  }));

  if (pinned && !pinned.length) return [];

  const candidates = list.map((c) => {
    const title = normalize(c.title);
    const handle = String(c.handle || '').toLowerCase();
    const ids = title && title !== storeName
      ? items.filter((p) => beginsWith(p.title, title)).map((p) => p.id)
      : [];
    return { handle, title: String(c.title || '').trim(), key: title, id: String(c.id || ''), image: c.image || null, titleIds: ids };
  }).filter((c) => c.handle && c.key);

  if (pinned) {
    /* Exactly what the maintainer asked for, in that order. A handle that
       does not exist is ignored rather than fatal, so a typo cannot empty
       the band; a warning is the maintainer's cue. */
    const byHandle = new Map(candidates.map((c) => [c.handle, c]));
    return pinned.map((h) => byHandle.get(h)).filter(Boolean).slice(0, MAX_BRANDS);
  }

  const qualifying = candidates.filter((c) => c.titleIds.length >= MIN_TITLE_MATCHES);
  /* A longer title that begins with a shorter qualifying title is a line
     inside that brand, not a brand of its own. */
  const keys = qualifying.map((c) => c.key);
  const brands = qualifying.filter((c) => !keys.some((k) => k !== c.key && beginsWith(c.key, k)));
  /* The same brand can exist twice as collections ("orange-pet-nutrition"
     and "orange-pet-nutrition-1"). Keep the one with the most matches, and
     with a logo where only one has it. */
  const byKey = new Map();
  brands.forEach((c) => {
    const have = byKey.get(c.key);
    if (!have) { byKey.set(c.key, c); return; }
    const better = (c.image && !have.image) || (!!c.image === !!have.image && c.titleIds.length > have.titleIds.length);
    if (better) byKey.set(c.key, c);
  });
  return [...byKey.values()]
    .sort((a, b) => b.titleIds.length - a.titleIds.length || a.title.localeCompare(b.title))
    .slice(0, MAX_BRANDS);
}

/* Fetch the product ids Shopify lists under one collection. `fetchJson` is
   injected: the catalogue route passes its own, with its retries, timeout
   and Admin token, and the tests pass a stub. Returns [] on any failure. */
async function fetchRoster(brand, fetchJson, env) {
  const ids = new Set();
  try {
    if (env.adminToken) {
      let pageInfo = '';
      for (let page = 1; page <= ROSTER_MAX_PAGES; page += 1) {
        const url = `https://${env.shopDomain}/admin/api/${env.adminApiVersion}/products.json?limit=${ROSTER_PAGE}&fields=id` +
          (pageInfo ? `&page_info=${pageInfo}` : `&collection_id=${encodeURIComponent(brand.id)}`);
        const payload = await fetchJson(url);
        (Array.isArray(payload.products) ? payload.products : []).forEach((p) => ids.add(String(p.id)));
        pageInfo = env.nextPageInfo ? env.nextPageInfo(payload._link) : '';
        if (!pageInfo) break;
      }
    } else {
      for (let page = 1; page <= ROSTER_MAX_PAGES; page += 1) {
        const url = `https://${env.shopDomain}/collections/${encodeURIComponent(brand.handle)}/products.json?limit=${ROSTER_PAGE}&page=${page}`;
        const payload = await fetchJson(url);
        const batch = Array.isArray(payload.products) ? payload.products : [];
        batch.forEach((p) => ids.add(String(p.id)));
        if (batch.length < ROSTER_PAGE) break;
      }
    }
  } catch (error) {
    if (env.warn) env.warn(`brand roster for ${brand.handle} unavailable (${error && error.message}); using title matches`);
    return [];
  }
  return [...ids];
}

/* A few at a time, never all thirty at once. */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next; next += 1;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/* Attach `brand` (a collection handle, or '') to every product, and return
   the brand list the shop reads. A product in two brand collections keeps
   the first in display order; a product in none keeps ''. */
async function assignBrands(products, collections, deps = {}) {
  const brands = detectBrandCollections(products, collections, deps.options || {});
  const rosterOff = deps.roster === false || /^off$/i.test(String(process.env.PAWS_BRAND_ROSTER || ''));
  const fetched = (!rosterOff && deps.fetchJson && deps.env)
    ? await mapLimit(brands, ROSTER_CONCURRENCY, (b) => fetchRoster(b, deps.fetchJson, deps.env))
    : brands.map(() => []);

  const brandOf = new Map();
  brands.forEach((b, i) => {
    const ids = new Set([...fetched[i], ...b.titleIds]);
    ids.forEach((id) => { if (!brandOf.has(id)) brandOf.set(id, b.handle); });
  });

  const counts = {};
  const out = products.map((p) => {
    const brand = brandOf.get(String(p.id)) || '';
    if (brand) counts[brand] = (counts[brand] || 0) + 1;
    return { ...p, brand };
  });

  return {
    products: out,
    brands: brands.map((b) => ({
      handle: b.handle,
      title: b.title,
      image: b.image ? { src: b.image.src, alt: b.image.alt || b.title } : null,
      productCount: counts[b.handle] || 0
    })).filter((b) => b.productCount > 0)
  };
}

module.exports = { detectBrandCollections, assignBrands, fetchRoster, normalize, beginsWith, MIN_TITLE_MATCHES };
