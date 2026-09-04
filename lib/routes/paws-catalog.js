'use strict';

const SHOP_DOMAIN = process.env.PAWS_SHOPIFY_DOMAIN || 'sg37v1-ta.myshopify.com';
const STOREFRONT_DOMAIN = (process.env.PAWS_STOREFRONT_DOMAIN || 'https://pawsandtails24.com').replace(/\/$/, '');
const { getStoreState } = require('../store-settings');
const { assignBrands } = require('../store-brands');
const ADMIN_TOKEN = String(process.env.PFA_SHOPIFY_ADMIN_TOKEN || '').trim();
const ADMIN_API_VERSION = process.env.PFA_SHOPIFY_ADMIN_API_VERSION || '2026-07';
const PAGE_SIZE = 250;
const MAX_PAGES = 20;
const CACHE_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15000;

let cache = { expiresAt: 0, data: null, loading: null };

const CATEGORY_LABELS = {
  food: 'For your animal',
  toys: 'Toys',
  accessories: 'Everyday',
  medicine: 'The Pharmacy',
  nutraceutical: 'Nutraceuticals',
  grooming: 'Grooming'
};

/* The vendor's description with its shape kept - paragraphs, headings and
   bullet lists - as plain blocks the product page lays out, instead of one
   run of text. Boilerplate the page already shows (the title repeated, a
   "Prescription Required" line) is dropped from the front. Long paragraphs
   are split at sentence ends so the first one can stand as a summary. */
function descriptionBlocks(html, title) {
  const decode = (t) => t.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&rsquo;|&lsquo;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&[a-z]+;|&#\d+;/gi, ' ');
  let src = repairText(html).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  /* Mark the block boundaries before stripping the tags. */
  src = src.replace(/<\/?(h[1-6])[^>]*>/gi, (m) => (m[1] === '/' ? '\u0000/h\u0000' : '\u0000h\u0000'))
    .replace(/<li[^>]*>/gi, '\u0000li\u0000').replace(/<\/li>/gi, '\u0000/li\u0000')
    .replace(/<\/(p|div|ul|ol|tr|table|section)>/gi, '\u0000p\u0000').replace(/<br\s*\/?>/gi, '\u0000p\u0000')
    .replace(/<[^>]+>/g, ' ');
  src = decode(src).replace(/[ \t\r\n]+/g, ' ');
  const blocks = [];
  let list = null;
  const pushText = (raw, kind) => {
    const text = raw.replace(/\s+/g, ' ').replace(/\s([,.;:])/g, '$1').trim();
    if (!text) return;
    if (kind === 'li') { if (!list) { list = { type: 'list', items: [] }; blocks.push(list); } list.items.push(text); return; }
    list = null;
    blocks.push({ type: kind === 'h' ? 'heading' : 'p', text });
  };
  src.split('\u0000').reduce((state, piece) => {
    if (piece === 'h' || piece === 'li') return piece;
    if (piece === '/h' || piece === '/li' || piece === 'p') { return 'p'; }
    pushText(piece, state === 'h' ? 'h' : state === 'li' ? 'li' : 'p');
    return state === 'li' ? 'li' : 'p';
  }, 'p');
  /* Drop front matter the page shows elsewhere. */
  const t = String(title || '').trim().toLowerCase();
  const boiler = (b) => {
    if (b.type !== 'p' && b.type !== 'heading') return false;
    const x = b.text.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
    return !x || x === 'prescription required' || x === 'rx required' || (t && x === t.replace(/[^a-z0-9 ]/g, '').trim());
  };
  while (blocks.length && boiler(blocks[0])) blocks.shift();
  for (const b of blocks) {
    if (b.type !== 'p') continue;
    b.text = b.text.replace(/^prescription required[\s:.-]*/i, '');
    /* "Title Then the text..." repeats the title as a label: drop it. "Title
       is a ..." uses it as the subject: keep it. */
    if (t && b.text.toLowerCase().startsWith(t)) {
      const rest = b.text.slice(t.length).replace(/^[\s:.-]+/, '');
      if (/^[A-Z0-9]/.test(rest)) b.text = rest;
    }
  }
  /* Split any long paragraph at sentence ends into readable chunks. */
  const out = [];
  for (const b of blocks) {
    if (b.type !== 'p' || b.text.length <= 420) { out.push(b); continue; }
    const sentences = b.text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [b.text];
    let cur = '';
    sentences.forEach((sen) => {
      if ((cur + sen).length > 380 && cur) { out.push({ type: 'p', text: cur.trim() }); cur = ''; }
      cur += sen;
    });
    if (cur.trim()) out.push({ type: 'p', text: cur.trim() });
  }
  let total = 0;
  return out.filter((b) => b.text || (b.items && b.items.length)).filter((b) => {
    total += b.type === 'list' ? b.items.join(' ').length : b.text.length;
    return total <= 2400;
  });
}

/* The seller's titles sometimes arrive already mangled: text that was UTF-8
   was read as Latin-1 somewhere before it reached Shopify, so an en dash is
   "â€“" and a curly quote is "â€™". Shopify then serves that faithfully and
   the shop printed "Leash â€“ Durable" on a card. The signature is
   unmistakable (a lone "Ã", "Â" or "â€" followed by the right trailer), and
   the repair is exact: take the characters back to the bytes they were
   misread from and decode those bytes as UTF-8. Text without the signature
   is returned untouched, and a repair that does not decode cleanly is
   abandoned rather than guessed at. */
const MOJIBAKE = /[\u00c2\u00c3\u00e2][\u0080-\u00bf\u20ac\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u017d\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178]/;
/* Windows-1252 has printable characters at 0x80-0x9F where Latin-1 has
   controls; a Latin-1 misread through that table produces these instead of
   the raw controls, so they map back before the bytes are decoded. */
const CP1252 = { '\u20ac': 0x80, '\u201a': 0x82, '\u0192': 0x83, '\u201e': 0x84, '\u2026': 0x85, '\u2020': 0x86, '\u2021': 0x87, '\u02c6': 0x88, '\u2030': 0x89, '\u0160': 0x8a, '\u2039': 0x8b, '\u0152': 0x8c, '\u017d': 0x8e, '\u2018': 0x91, '\u2019': 0x92, '\u201c': 0x93, '\u201d': 0x94, '\u2022': 0x95, '\u2013': 0x96, '\u2014': 0x97, '\u02dc': 0x98, '\u2122': 0x99, '\u0161': 0x9a, '\u203a': 0x9b, '\u0153': 0x9c, '\u017e': 0x9e, '\u0178': 0x9f };
function repairText(value) {
  const text = String(value == null ? '' : value);
  if (!MOJIBAKE.test(text)) return text;
  const bytes = [];
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code < 0x100) bytes.push(code);
    else if (CP1252[ch] !== undefined) bytes.push(CP1252[ch]);
    else return text;   // a genuine non-Latin character: this was not a misread
  }
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes));
    return MOJIBAKE.test(decoded) ? repairText(decoded) : decoded;
  } catch (_) {
    return text;
  }
}

function stripHtml(value) {
  return repairText(String(value || ''))
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function money(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function classifyProduct(product) {
  const title = String(product.title || '');
  const productType = String(product.product_type || '');
  const tags = Array.isArray(product.tags) ? product.tags.join(' ') : String(product.tags || '');
  const description = stripHtml(product.body_html || '');
  const text = `${title} ${productType} ${tags} ${description}`.toLowerCase();

  const food = /\b(food|kibble|diet|treats?|biscuits?|cookies?|milk replacer|puppy milk|kitten milk|chews? for dogs|dental chew)\b/.test(text);
  const toys = /\b(toys?|play ball|fetch|tug|plush|squeaky|catnip|teaser|wand|scratch board|foraging)\b/.test(text);
  const grooming = /\b(shampoo|conditioner|grooming|brush|comb|slicker|pet wipes|perfume|deodorant|dry bath|coat spray|paw balm|nose balm)\b/.test(text);
  const accessories = /\b(harness|leash|collar|muzzle|bowl|feeder|bed|mat|litter tray|scooper|diaper|pet bag|carrier|toothbrush|feeding syringe|e-collar|elizabethan)\b/.test(text);
  const supplement = /\b(supplement|multivitamin|vitamin|calcium|probiotic|nutritional|joint support|liver support|renal support|skin coat|omega|electrolyte|health tonic|immunity booster)\b/.test(text);
  const medicine = /\b(tablets?|capsules?|injection|drops?|ointment|cream|gel|spray|antibiotic|antifungal|antiseptic|deworm|anti[- ]?tick|flea|vaccine|immunoglobulin|veterinary|wound|ophthalmic|otic|spot[- ]on|pain relief)\b/.test(text);

  /* A medicated shampoo is medicine that happens to lather. The word
     "shampoo" used to win outright, which filed antiparasitics marked FOR
     VETERINARY USE ONLY under Grooming, next to the coat conditioners. A
     clear medicinal signal now outranks the format of the bottle. */
  const strongMedicine = /\b(for veterinary use|veterinary use only|prescription|medicated|antiparasitic|anti[- ]?mite|acaricid\w*|ectoparasit\w*|ivermectin|amitraz|permethrin|fipronil|deltamethrin|ketoconazole|miconazole|chlorhexidine|povidone|praziquantel|albendazole|fenbendazole|piroctone|benzoyl peroxide|selenium sulphide|selenium sulfide)\b/.test(text);

  let category = 'accessories';
  if (strongMedicine) category = 'medicine';
  else if (food) category = 'food';
  else if (toys) category = 'toys';
  else if (grooming) category = 'grooming';
  else if (accessories) category = 'accessories';
  else if (supplement) category = 'nutraceutical';
  else if (medicine) category = 'medicine';

  const positiveVegetarian = /\b(100% vegetarian|vegetarian|pure veg|plant[- ]based|meat[- ]free)\b/.test(text);
  const animalProtein = /\b(chicken|turkey|duck|lamb|mutton|beef|pork|venison|salmon|tuna|fish|cod|shrimp|prawn|quail|egg|liver|meat|seafood|buffalo|goat)\b/.test(text);
  /* Judge the product, do not apply the policy. Anything that is not food
     passes either way; food has to read as vegetarian and carry no animal
     protein. Keeping this separate is what lets the switch take effect on the
     next request instead of after the ten-minute catalogue cache expires. */
  const vegetarianOk = !food || (positiveVegetarian && !animalProtein);

  let animal = 'All animals';
  const dog = /\b(dog|dogs|puppy|puppies|canine)\b/.test(text);
  const cat = /\b(cat|cats|kitten|kittens|feline)\b/.test(text);
  if (dog && cat) animal = 'Dog and Cat';
  else if (dog) animal = 'Dog';
  else if (cat) animal = 'Cat';

  const rx = /\b(prescription required|valid prescription|rx only|prescription medicine)\b/.test(text);
  return { category, animal, rx, vegetarianOk, positiveVegetarian, isFood: food };
}

function imageUrl(image) {
  if (!image || !image.src) return null;
  return {
    id: String(image.id || image.src),
    src: String(image.src),
    alt: image.alt || '',
    width: Number(image.width || 0),
    height: Number(image.height || 0)
  };
}

function normalizeProduct(product) {
  const classification = classifyProduct(product);

  const images = (product.images || []).map(imageUrl).filter(Boolean).slice(0, 8);
  const variants = (product.variants || []).map((variant) => {
    const featuredImage = imageUrl(variant.featured_image);
    return {
      id: String(variant.id),
      title: repairText(variant.title || 'Default'),
      sku: variant.sku || '',
      // Public JSON exposes `available`; Admin API exposes inventory_quantity
      // (and inventory_policy "continue" = sell when out of stock).
      available: typeof variant.inventory_quantity === 'number'
        ? (variant.inventory_quantity > 0 || variant.inventory_policy === 'continue')
        : variant.available !== false,
      stock: typeof variant.inventory_quantity === 'number' ? variant.inventory_quantity : null,
      price: money(variant.price),
      compareAtPrice: money(variant.compare_at_price),
      image: featuredImage,
      options: [variant.option1, variant.option2, variant.option3].filter(Boolean)
    };
  });
  const availablePrices = variants.filter((variant) => variant.available).map((variant) => variant.price);
  const allPrices = variants.map((variant) => variant.price);
  const prices = availablePrices.length ? availablePrices : allPrices;

  return {
    id: String(product.id),
    handle: String(product.handle || ''),
    title: repairText(product.title),
    description: stripHtml(product.body_html || '').slice(0, 900),
    descriptionBlocks: descriptionBlocks(product.body_html, product.title),
    vendor: String(product.vendor || ''),
    productType: String(product.product_type || ''),
    tags: Array.isArray(product.tags) ? product.tags.slice(0, 30) : [],
    category: classification.category,
    categoryLabel: CATEGORY_LABELS[classification.category],
    animal: classification.animal,
    prescriptionRequired: classification.rx,
    vegetarianFood: classification.category === 'food' && classification.positiveVegetarian,
    isFood: classification.isFood,
    vegetarianOk: classification.vegetarianOk,
    available: variants.some((variant) => variant.available),
    minPrice: prices.length ? Math.min(...prices) : 0,
    maxPrice: prices.length ? Math.max(...prices) : 0,
    images,
    variants,
    updatedAt: product.updated_at || null,
    publishedAt: product.published_at || null,
    sourceUrl: `${STOREFRONT_DOMAIN}/products/${encodeURIComponent(String(product.handle || ''))}`
  };
}

function normalizeCollection(collection) {
  return {
    id: String(collection.id),
    handle: String(collection.handle || ''),
    title: repairText(collection.title),
    description: stripHtml(collection.body_html || '').slice(0, 400),
    productCount: Number(collection.products_count || 0),
    image: imageUrl(collection.image),
    updatedAt: collection.updated_at || null
  };
}

async function fetchJson(url, attempt = 1) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'PFA-Catalog-Sync/1.0',
        ...(ADMIN_TOKEN && url.includes('/admin/api/') ? { 'X-Shopify-Access-Token': ADMIN_TOKEN } : {})
      },
      signal: controller.signal
    });
    if ((response.status === 429 || response.status >= 500) && attempt < 3) {
      const waitMs = Math.min(800 * (2 ** (attempt - 1)), 2500);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      return fetchJson(url, attempt + 1);
    }
    if (!response.ok) throw new Error(`Shopify returned HTTP ${response.status}`);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) throw new Error('Shopify did not return JSON');
    const payload = await response.json();
    Object.defineProperty(payload, '_link', { value: response.headers.get('link') || '', enumerable: false });
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function nextPageInfo(linkHeader) {
  const match = /<[^>]*[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/.exec(String(linkHeader || ''));
  return match ? match[1] : '';
}

// Admin REST API (needs PFA_SHOPIFY_ADMIN_TOKEN): includes inventory_quantity and
// unpublished/draft products, paginated by Link-header cursor.
async function fetchAllAdmin(resource) {
  const items = [];
  if (resource === 'collections') {
    for (const kind of ['custom_collections', 'smart_collections']) {
      let pageInfo = '';
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const url = `https://${SHOP_DOMAIN}/admin/api/${ADMIN_API_VERSION}/${kind}.json?limit=${PAGE_SIZE}` + (pageInfo ? `&page_info=${pageInfo}` : '');
        const payload = await fetchJson(url);
        items.push(...(Array.isArray(payload[kind]) ? payload[kind] : []));
        pageInfo = nextPageInfo(payload._link);
        if (!pageInfo) break;
      }
    }
    return items;
  }
  let pageInfo = '';
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    // Filters are only allowed on the first request; later pages carry the cursor alone.
    const url = `https://${SHOP_DOMAIN}/admin/api/${ADMIN_API_VERSION}/products.json?limit=${PAGE_SIZE}` +
      (pageInfo ? `&page_info=${pageInfo}` : '&status=active&published_status=published');
    const payload = await fetchJson(url);
    items.push(...(Array.isArray(payload.products) ? payload.products : []));
    pageInfo = nextPageInfo(payload._link);
    if (!pageInfo) break;
  }
  return items;
}

async function fetchAll(resource) {
  if (ADMIN_TOKEN) return fetchAllAdmin(resource);
  const plural = resource === 'products' ? 'products' : 'collections';
  const items = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = `https://${SHOP_DOMAIN}/${resource}.json?limit=${PAGE_SIZE}&page=${page}`;
    const payload = await fetchJson(url);
    const batch = Array.isArray(payload[plural]) ? payload[plural] : [];
    items.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return items;
}

async function loadCatalog() {
  const [rawProducts, rawCollections] = await Promise.all([
    fetchAll('products'),
    fetchAll('collections')
  ]);
  /* Everything the vendor lists, unfiltered. The policy is applied per
     request in applyPolicy() so the switch does not wait for this cache. */
  const normalized = rawProducts.map(normalizeProduct).filter(Boolean);
  /* Brands come from the seller's collections (see lib/store-brands.js). A
     failure there is contained: the walk never fails for want of a brand. */
  let branded = { products: normalized.map((p) => ({ ...p, brand: '' })), brands: [] };
  try {
    branded = await assignBrands(normalized, rawCollections.map(normalizeCollection), {
      fetchJson,
      env: { shopDomain: SHOP_DOMAIN, adminToken: ADMIN_TOKEN, adminApiVersion: ADMIN_API_VERSION, nextPageInfo, warn: (m) => console.warn('paws-catalog: ' + m) }
    });
  } catch (error) {
    console.warn('paws-catalog: brands unavailable (' + (error && error.message) + ')');
  }
  const products = branded.products;

  return {
    schemaVersion: 2,
    fetchedAt: new Date().toISOString(),
    source: {
      platform: 'Shopify',
      shopDomain: SHOP_DOMAIN,
      storefrontDomain: STOREFRONT_DOMAIN,
      checkoutBaseUrl: `https://${SHOP_DOMAIN}/cart`,
      currency: 'INR',
      catalogApi: ADMIN_TOKEN ? 'admin' : 'public'
    },
    stats: {
      sourceProducts: rawProducts.length,
      sourceCollections: rawCollections.length
    },
    collections: rawCollections.map(normalizeCollection),
    brands: branded.brands,
    products
  };
}

/* The grid's view of a policy-applied catalogue: exactly what flatten() in
   pfa-shop.html reads, and nothing else. Used by the API and by
   scripts/build-catalog.js, which writes the same shape to a static file
   at deploy time so the shop can paint before the API answers. */
function listView(data) {
  const products = data.products.map((p) => ({
    id: p.id, handle: p.handle, title: p.title, category: p.category, categoryLabel: p.categoryLabel,
    animal: p.animal, productType: p.productType, prescriptionRequired: p.prescriptionRequired,
    available: p.available, minPrice: p.minPrice, maxPrice: p.maxPrice,
    brand: p.brand || '',
    images: (p.images || []).slice(0, 1).map((i) => ({ src: i.src })),
    variants: (p.variants || []).map((v) => ({
      id: v.id, title: v.title, available: v.available, price: v.price,
      /* `was`: the seller's compare-at price, sent only when it makes a
         markdown the shop is prepared to say out loud (see wasPrice). JSON
         drops the undefined, so a variant not on offer costs no bytes. */
      was: wasPrice(v, p.variants || []),
      image: v.image ? { src: v.image.src } : null
    }))
  }));
  /* A brand with nothing listed under the current policy is not sent: the
     band would show a name that filters to an empty grid. */
  const listedBrands = products.reduce((acc, p) => { if (p.brand) acc[p.brand] = (acc[p.brand] || 0) + 1; return acc; }, {});
  return {
    ...data,
    view: 'list',
    brands: (data.brands || []).filter((b) => listedBrands[b.handle]).map((b) => ({ ...b, productCount: listedBrands[b.handle] })),
    products
  };
}

/* The one place the shop's idea of "marked down" is defined.

   A Shopify compare-at price is whatever the seller typed, and on this
   seller's store it is often not a markdown at all: the price of a pack of
   three sitting on the single tablet (3,600 against 900, "75% off"), another
   size's price copied across, or a stale figure a rupee above the price. A
   shop that repeats those as offers is lying, so a compare-at price only
   counts when all of the following hold:

     - it is a finite number above the price;
     - the saving is at least MIN_OFF percent (below that it is rounding);
     - the saving is at most MAX_OFF percent;
     - it is not a whole multiple of the price, two times or more, within
       PACK_TOLERANCE: that is a pack price, not an earlier price;
     - it is not within PACK_TOLERANCE of another size's price on the same
       product: that is that size's price, not an earlier price;
     - it is not the same figure as the compare-at on a differently priced
       size of the same product: one number pasted across every size is a
       product-level figure (the largest pack's MRP, usually), not what
       this size used to cost. NexGard's 2,600 on the single, the pair and
       the triple was exactly that, and read as 72%, 45% and 0% off.

   Everything the shop calls an offer passes this. The same rule is applied
   once more in pfa-shop.html's flatten() as a second line, and
   test/shop-brands-offers.test.js runs both over the same cases. */
const MIN_OFF = 5;
const MAX_OFF = 50;
const PACK_TOLERANCE = 0.03;
function wasPrice(variant, siblings) {
  const was = Number(variant && variant.compareAtPrice);
  const price = Number(variant && variant.price);
  /* Either shape: the full catalogue's variants, or a plain list of prices. */
  const rows = (siblings || []).map((o) => (typeof o === 'object' && o !== null
    ? { price: Number(o.price), was: Number(o.compareAtPrice !== undefined ? o.compareAtPrice : o.was) }
    : { price: Number(o), was: NaN }));
  if (!Number.isFinite(was) || !Number.isFinite(price) || price <= 0 || was <= price) return undefined;
  const pct = ((was - price) / was) * 100;
  if (pct < MIN_OFF || pct > MAX_OFF) return undefined;
  const ratio = was / price;
  const nearest = Math.round(ratio);
  if (nearest >= 2 && Math.abs(ratio - nearest) <= nearest * PACK_TOLERANCE) return undefined;
  const others = rows.filter((r) => Number.isFinite(r.price) && r.price > 0 && r.price !== price);
  if (others.some((r) => Math.abs(r.price - was) <= was * PACK_TOLERANCE)) return undefined;
  if (others.some((r) => Number.isFinite(r.was) && r.was === was)) return undefined;
  return was;
}

/* The Store switch, applied to a cached catalogue.
   Closed means closed: no products, no collections, no category counts. A
   caller cannot ask for the hidden ones, because they are not sent. */
function applyPolicy(catalog, store) {
  if (!store.open) {
    return {
      ...catalog,
      store: { state: store.state, open: false, label: store.label, changedAt: store.changedAt, freeDeliveryAbove: freeDeliveryAbove() },
      stats: { ...catalog.stats, listedProducts: 0, hiddenByPolicy: catalog.products.length },
      categories: Object.entries(CATEGORY_LABELS).map(([id, label]) => ({ id, label, count: 0 })),
      collections: [],
      brands: [],
      products: []
    };
  }

  /* Hide on an explicit negative verdict, not on a missing one. normalizeProduct
     always sets vegetarianOk (there is a test), so for real catalogue data this
     is identical; for anything that did not come through it, an absent field
     must not silently empty the shelf. */
  const listed = store.vegetarianOnly
    ? catalog.products.filter((product) => product.vegetarianOk !== false)
    : catalog.products;

  const counts = listed.reduce((accumulator, product) => {
    accumulator[product.category] = (accumulator[product.category] || 0) + 1;
    return accumulator;
  }, {});

  return {
    ...catalog,
    store: {
      state: store.state, open: true, label: store.label,
      vegetarianOnly: store.vegetarianOnly, changedAt: store.changedAt,
      freeDeliveryAbove: freeDeliveryAbove()
    },
    stats: {
      ...catalog.stats,
      listedProducts: listed.length,
      hiddenByPolicy: catalog.products.length - listed.length
    },
    categories: Object.entries(CATEGORY_LABELS).map(([id, label]) => ({ id, label, count: counts[id] || 0 })),
    products: listed.map((product) => {
      /* Internal verdicts, not the shopper's business. */
      const { vegetarianOk, isFood, ...rest } = product;
      return rest;
    })
  };
}

/* The full catalogue as it was at the last deploy, bundled with the
   function by scripts/build-catalog.js. A cold function answers from this
   at once and refreshes from Shopify behind the answer, instead of making
   the first visitor wait for the whole walk. Absent when the build could
   not reach Shopify, in which case the walk happens in the foreground. */
const SNAPSHOT_PATH = require('path').join(__dirname, '..', 'catalog-snapshot.json');
function readSnapshot() {
  try {
    const data = JSON.parse(require('fs').readFileSync(SNAPSHOT_PATH, 'utf8'));
    return data && Array.isArray(data.products) && data.products.length ? data : null;
  } catch (_) { return null; }
}

function refreshCatalog() {
  if (cache.loading) return cache.loading;
  cache.loading = loadCatalog()
    .then((data) => {
      cache = { data, expiresAt: Date.now() + CACHE_MS, loading: null };
      return data;
    })
    .catch((error) => {
      cache.loading = null;
      throw error;
    });
  return cache.loading;
}

async function getCatalog() {
  const now = Date.now();
  if (cache.data && cache.expiresAt > now) return cache.data;
  if (cache.data) {
    /* Stale but present: answer now, refresh in the background. */
    refreshCatalog().catch(() => {});
    return cache.data;
  }
  const snapshot = readSnapshot();
  if (snapshot) {
    cache = { data: snapshot, expiresAt: 0, loading: cache.loading };
    refreshCatalog().catch(() => {});
    return snapshot;
  }
  return refreshCatalog();
}

module.exports = async function handler(request, response) {
  if (request.method === 'OPTIONS') {
    response.statusCode = 204;
    response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    response.end();
    return;
  }
  if (request.method !== 'GET') {
    response.statusCode = 405;
    response.setHeader('Allow', 'GET, OPTIONS');
    response.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const store = await getStoreState();
    let data = applyPolicy(await getCatalog(), store);
    // ?view=list: what the store grid needs and nothing more (about a quarter of the bytes).
    const wantsList = /[?&]view=list\b/.test(String(request.url || ''));
    if (wantsList) data = listView(data);
    response.statusCode = 200;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    /* Served from the edge for a minute and refreshed in the background for
       ten more, so a shopper almost never waits on Shopify or a cold
       function. The Store switch still lands within a minute, which is what
       the panel's "last changed" line promises. Browsers do not keep it
       (max-age=0): a reload after the switch is an honest reload. */
    response.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=600');
    response.setHeader('Vary', 'Accept-Encoding');
    response.end(JSON.stringify(data));
  } catch (error) {
    /* If the vendor is unreachable the Store still reports its own state, so a
       closed Store never looks merely broken. */
    response.statusCode = 502;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.end(JSON.stringify({
      error: 'The live catalogue could not be refreshed.',
      detail: process.env.NODE_ENV === 'development' ? String(error.message || error) : undefined
    }));
  }
};

/* What the public shop actually puts on the shelf: one tile per product that
   has at least one purchasable variant, skipping unavailable products and
   variants, non-Shopify ids and zero prices.

   This counted variants until now, and said so, because the shop once listed
   one row per variant. v1.170 changed the grid to one tile per product - the
   same medicine in 250mg and 500mg is one thing to buy with a choice inside
   it - and this was not changed with it. The admin panel says "the count under
   each choice is what a shopper would see" while showing a number a third
   larger than the shop's own header, and test/store-count.test.js did not
   catch it because it only checked that the two applied the same exclusions,
   not that they counted the same unit.

   This mirrors flatten() in pfa-shop.html; if one changes, the other must, and
   the test now runs both against one catalogue and compares the answers. */
/* The order value above which the seller delivers free, so the shop can tell a
   shopper how much more to add. It is read from the environment rather than
   written into the page, for the same reason no rate is: PFA does not price
   delivery, and a threshold typed into a page is a promise about somebody
   else's money. Unset means the shop says nothing about free delivery at all,
   which is the correct behaviour when nobody has told us there is a tier.

   This is a claim, not a charge. What a shopper actually pays is still matched
   against the rates Shopify quotes that basket, in pfa-pay-start.js. */
function freeDeliveryAbove() {
  const raw = Number(process.env.PFA_FREE_DELIVERY_ABOVE);
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 0;
}

function shopperTiles(products) {
  let tiles = 0;
  (products || []).forEach((product) => {
    if (!product.available) return;
    const sellable = (product.variants || []).filter((variant) => (
      variant.available
      && /^\d{8,20}$/.test(String(variant.id))
      && Math.round(Number(variant.price) || 0) > 0
    ));
    if (sellable.length) tiles += 1;
  });
  return tiles;
}

module.exports.getCatalog = getCatalog;
module.exports.listView = listView;
module.exports.applyPolicy = applyPolicy;
module.exports.descriptionBlocks = descriptionBlocks;
module.exports.shopperTiles = shopperTiles;
module.exports.wasPrice = wasPrice;
module.exports.repairText = repairText;
module.exports.MARKDOWN_RULE = { MIN_OFF, MAX_OFF, PACK_TOLERANCE };
module.exports._private = {
  applyPolicy,
  classifyProduct,
  nextPageInfo,
  normalizeProduct,
  stripHtml
};
