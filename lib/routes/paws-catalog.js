'use strict';

const SHOP_DOMAIN = process.env.PAWS_SHOPIFY_DOMAIN || 'sg37v1-ta.myshopify.com';
const STOREFRONT_DOMAIN = (process.env.PAWS_STOREFRONT_DOMAIN || 'https://pawsandtails24.com').replace(/\/$/, '');
const INCLUDE_ALL_FOOD = String(process.env.PAWS_INCLUDE_ALL_FOOD || '').toLowerCase() === 'true';
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

function stripHtml(value) {
  return String(value || '')
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

  let category = 'accessories';
  if (food) category = 'food';
  else if (toys) category = 'toys';
  else if (grooming) category = 'grooming';
  else if (accessories) category = 'accessories';
  else if (supplement) category = 'nutraceutical';
  else if (medicine) category = 'medicine';

  const positiveVegetarian = /\b(100% vegetarian|vegetarian|pure veg|plant[- ]based|meat[- ]free)\b/.test(text);
  const animalProtein = /\b(chicken|turkey|duck|lamb|mutton|beef|pork|venison|salmon|tuna|fish|cod|shrimp|prawn|quail|egg|liver|meat|seafood|buffalo|goat)\b/.test(text);
  const allowedFood = !food || INCLUDE_ALL_FOOD || (positiveVegetarian && !animalProtein);

  let animal = 'All animals';
  const dog = /\b(dog|dogs|puppy|puppies|canine)\b/.test(text);
  const cat = /\b(cat|cats|kitten|kittens|feline)\b/.test(text);
  if (dog && cat) animal = 'Dog and Cat';
  else if (dog) animal = 'Dog';
  else if (cat) animal = 'Cat';

  const rx = /\b(prescription required|valid prescription|rx only|prescription medicine)\b/.test(text);
  return { category, animal, rx, allowedFood, positiveVegetarian };
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
  if (!classification.allowedFood) return null;

  const images = (product.images || []).map(imageUrl).filter(Boolean).slice(0, 8);
  const variants = (product.variants || []).map((variant) => {
    const featuredImage = imageUrl(variant.featured_image);
    return {
      id: String(variant.id),
      title: variant.title || 'Default',
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
    title: String(product.title || ''),
    description: stripHtml(product.body_html || '').slice(0, 900),
    vendor: String(product.vendor || ''),
    productType: String(product.product_type || ''),
    tags: Array.isArray(product.tags) ? product.tags.slice(0, 30) : [],
    category: classification.category,
    categoryLabel: CATEGORY_LABELS[classification.category],
    animal: classification.animal,
    prescriptionRequired: classification.rx,
    vegetarianFood: classification.category === 'food' && classification.positiveVegetarian,
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
    title: String(collection.title || ''),
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
  const products = rawProducts.map(normalizeProduct).filter(Boolean);
  const counts = products.reduce((accumulator, product) => {
    accumulator[product.category] = (accumulator[product.category] || 0) + 1;
    return accumulator;
  }, {});
  const categories = Object.entries(CATEGORY_LABELS).map(([id, label]) => ({
    id,
    label,
    count: counts[id] || 0
  }));
  const excludedFoodCount = rawProducts.length - products.length;

  return {
    schemaVersion: 1,
    fetchedAt: new Date().toISOString(),
    source: {
      platform: 'Shopify',
      shopDomain: SHOP_DOMAIN,
      storefrontDomain: STOREFRONT_DOMAIN,
      checkoutBaseUrl: `https://${SHOP_DOMAIN}/cart`,
      currency: 'INR',
      catalogApi: ADMIN_TOKEN ? 'admin' : 'public',
      foodPolicy: INCLUDE_ALL_FOOD ? 'all-food-test-mode' : 'strict-vegetarian-only'
    },
    stats: {
      sourceProducts: rawProducts.length,
      publishedProducts: products.length,
      excludedFoodProducts: excludedFoodCount,
      sourceCollections: rawCollections.length
    },
    categories,
    collections: rawCollections.map(normalizeCollection),
    products
  };
}

async function getCatalog() {
  const now = Date.now();
  if (cache.data && cache.expiresAt > now) return cache.data;
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
    const data = await getCatalog();
    response.statusCode = 200;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
    response.end(JSON.stringify(data));
  } catch (error) {
    response.statusCode = 502;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.end(JSON.stringify({
      error: 'The live catalogue could not be refreshed.',
      detail: process.env.NODE_ENV === 'development' ? String(error.message || error) : undefined
    }));
  }
};

module.exports.getCatalog = getCatalog;

module.exports._private = {
  classifyProduct,
  nextPageInfo,
  normalizeProduct,
  stripHtml
};
