(function () {
  'use strict';

  // Product page: /products/<handle>   (server-rendered with window.PFA_PRODUCT)
  //               /product.html?p=<handle>   (static fallback; fetches the catalogue)
  // Shares the bag with store.html (same localStorage key and item shape).

  var P = window.PFA;
  var host = P.q('#productDetail');
  if (!host) return;

  var CART_KEY = 'pfa_shopify_cart_v1';
  var CATALOG_URL = '/api/paws-catalog';
  var CATALOG_CACHE_KEY = 'pfa_shopify_catalog_v1';

  var product = window.PFA_PRODUCT || null;
  var related = Array.isArray(window.PFA_RELATED) ? window.PFA_RELATED : [];
  var variant = null;
  var qty = 1;
  var imageIndex = 0;

  function readStore(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? fallback : v; } catch (e) { return fallback; }
  }
  function writeStore(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} }
  function money(v) { var n = Number(v); return '₹' + (Number.isFinite(n) ? n.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '0'); }
  function esc(s) { return P.escape(String(s == null ? '' : s)); }
  function withWidth(url, w) {
    if (!url) return '';
    try { var u = new URL(url); if (/cdn\.shopify\.com$/.test(u.hostname)) u.searchParams.set('width', String(w)); return u.toString(); } catch (e) { return url; }
  }
  function handleFromUrl() {
    var m = location.pathname.match(/\/products\/([^/?#]+)/);
    var h = m ? decodeURIComponent(m[1]) : (P.param('p') || P.param('product') || '');
    return String(h).replace(/\.html?$/i, '').trim().toLowerCase();
  }
  function images(p) {
    var list = (p.images || []).filter(function (i) { return i && i.src; });
    if (!list.length && variant && variant.image && variant.image.src) list = [variant.image];
    return list;
  }
  function variantImageIndex(v) {
    if (!v || !v.image) return -1;
    return images(product).findIndex(function (i) { return i.src === v.image.src || (i.id && i.id === v.image.id); });
  }
  function cartCount() {
    var c = readStore(CART_KEY, {});
    return Object.keys(c).reduce(function (n, k) { return n + (Number(c[k].qty) || 0); }, 0);
  }
  function syncBadges() { P.qa('[data-cart-count]').forEach(function (e) { e.textContent = cartCount(); }); }

  function addToBag(goToCheckout) {
    if (!variant || !variant.available) { P.toast('This variant is currently unavailable'); return; }
    var cart = goToCheckout ? {} : readStore(CART_KEY, {});
    var existing = cart[variant.id];
    cart[variant.id] = {
      productId: product.id,
      variantId: variant.id,
      productTitle: product.title,
      variantTitle: variant.title === 'Default Title' ? 'Standard' : variant.title,
      price: variant.price,
      image: (variant.image && variant.image.src) || (images(product)[0] && images(product)[0].src) || '',
      qty: (existing && existing.qty || 0) + qty
    };
    writeStore(CART_KEY, cart);
    try { localStorage.removeItem('pfa_checkout_intent_v1'); } catch (e) {}
    syncBadges();
    if (goToCheckout) { location.href = '/store.html?checkout=1'; return; }
    var toast = P.q('#toast');
    if (toast) {
      toast.innerHTML = 'Added to bag <a class="pd-toast-link" href="/store.html?bag=1">View bag</a>';
      toast.classList.add('show');
      clearTimeout(toast._t); toast._t = setTimeout(function () { toast.classList.remove('show'); }, 3500);
    }
  }

  function stockState(v) {
    if (!v || !v.available) return ['out', 'Out of stock'];
    if (typeof v.stock === 'number' && v.stock > 0 && v.stock <= 5) return ['low', 'Only ' + v.stock + ' left'];
    return ['in', 'In stock'];
  }

  function variantControl() {
    var vs = product.variants || [];
    if (vs.length <= 1) return '';
    var label = (vs[0].options && vs[0].options.length === 1) ? 'Size / pack' : 'Variant';
    if (vs.length <= 6) {
      return '<div class="pd-field"><span class="pd-lbl">' + label + '</span><div class="pd-pills" role="radiogroup">' + vs.map(function (v) {
        return '<button type="button" role="radio" data-variant="' + esc(v.id) + '" aria-pressed="' + (v.id === variant.id) + '" aria-checked="' + (v.id === variant.id) + '"' + (v.available ? '' : ' data-out="1"') + '>' + esc(v.title === 'Default Title' ? 'Standard' : v.title) + '</button>';
      }).join('') + '</div></div>';
    }
    return '<div class="pd-field"><label for="pdVariant">' + label + '</label><select id="pdVariant">' + vs.map(function (v) {
      return '<option value="' + esc(v.id) + '"' + (v.id === variant.id ? ' selected' : '') + (v.available ? '' : ' disabled') + '>' + esc(v.title === 'Default Title' ? 'Standard' : v.title) + (v.available ? '' : ' · out of stock') + ' · ' + money(v.price) + '</option>';
    }).join('') + '</select></div>';
  }

  function labelPanel() {
    var packs = (product.variants || []).map(function (v) { return v.title; }).filter(function (t) { return t && t !== 'Default Title'; });
    var rows = [
      ['For', product.animal || 'All animals'],
      ['Type', product.productType || product.categoryLabel || 'Not stated'],
      ['Pack', packs.length ? (packs.length > 3 ? packs.length + ' options' : packs.join(' · ')) : 'Single pack'],
      ['Prescription', product.prescriptionRequired ? 'Required, upload at checkout' : 'Not required'],
      ['SKU', (variant && variant.sku) || 'Not stated'],
      ['Seller', 'Independent seller (fulfilled by seller)']
    ];
    return '<section class="pd-label" aria-label="Product label"><header><span>Product label</span><span>' + esc(product.categoryLabel || 'PFA Store') + '</span></header><dl>' +
      rows.map(function (r) { return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>'; }).join('') + '</dl></section>';
  }

  function relatedSection() {
    if (!related.length) return '';
    return '<section class="pd-related"><div class="section-head"><div><p class="kicker">More in ' + esc(product.categoryLabel || 'this category') + '</p><h2>You might also need</h2></div></div><div class="product-grid">' +
      related.slice(0, 8).map(function (r) {
        var im = r.images && r.images[0];
        return '<article class="product-card"><a class="pd-card-link" href="/products/' + encodeURIComponent(r.handle) + '"><div class="product-art">' + (im ? '<img loading="lazy" src="' + esc(withWidth(im.src, 480)) + '" alt=""/>' : '') + '</div><div class="product-body"><div class="card-label">' + esc(r.animal || '') + '</div><h3>' + esc(r.title) + '</h3><div class="pd-card-price">' + money(r.minPrice) + (r.maxPrice > r.minPrice ? ' – ' + money(r.maxPrice) : '') + '</div></div></a></article>';
      }).join('') + '</div></section>';
  }

  function render() {
    var imgs = images(product);
    var img = imgs[imageIndex] || imgs[0];
    var compare = Number(variant && variant.compareAtPrice) || 0, price = Number(variant && variant.price) || 0;
    var save = compare > price ? Math.round((1 - price / compare) * 100) : 0;
    var st = stockState(variant);
    var desc = String(product.description || '').trim();
    var canBuy = Boolean(variant && variant.available);
    document.title = product.title + ' | PFA Store';

    host.innerHTML =
      '<div class="pd-wrap"><nav class="pd-crumbs" aria-label="Breadcrumb"><a href="/store.html">Store</a><span>›</span><a href="/store.html?category=' + esc(product.category || '') + '">' + esc(product.categoryLabel || 'Products') + '</a><span>›</span><span aria-current="page">' + esc(product.title) + '</span></nav>' +
      '<div class="pd-grid"><div class="pd-gallery"><div class="pd-stage">' + (product.prescriptionRequired ? '<span class="card-badge amber">Prescription</span>' : '') +
      (img ? '<img id="pdMainImage" src="' + esc(withWidth(img.src, 1200)) + '" alt="' + esc(img.alt || product.title) + '"/>' : '<div class="pd-skel"></div>') + '</div>' +
      (imgs.length > 1 ? '<div class="pd-thumbs">' + imgs.map(function (i, n) { return '<button type="button" data-image="' + n + '" aria-current="' + (n === imageIndex) + '" aria-label="Image ' + (n + 1) + '"><img src="' + esc(withWidth(i.src, 200)) + '" alt=""/></button>'; }).join('') + '</div>' : '') + '</div>' +
      '<div class="pd-info"><p class="eyebrow">' + esc(product.categoryLabel || 'PFA Store') + ' · ' + esc(product.animal || 'All animals') + '</p><h1>' + esc(product.title) + '</h1>' +
      '<div class="pd-price"><strong id="pdPrice">' + money(price) + '</strong>' + (compare > price ? '<del>' + money(compare) + '</del><span class="pd-save">Save ' + save + '%</span>' : '') + '</div><p class="pd-taxnote">Inclusive of all taxes. Delivery calculated at checkout.</p>' +
      variantControl() +
      '<p class="pd-stock" id="pdStock" data-state="' + st[0] + '"><i></i>' + esc(st[1]) + '</p>' +
      '<div class="pd-field"><span class="pd-lbl">Quantity</span><div class="pd-qty"><button type="button" id="pdDec" aria-label="Decrease">−</button><output id="pdQty">' + qty + '</output><button type="button" id="pdInc" aria-label="Increase">+</button></div></div>' +
      '<div class="pd-actions"><button class="btn dark" id="pdAdd" type="button"' + (canBuy ? '' : ' disabled') + '>Add to bag</button><button class="btn blue" id="pdBuy" type="button"' + (canBuy ? '' : ' disabled') + '>Buy now</button></div>' +
      (product.prescriptionRequired ? '<div class="pd-rx"><strong>Prescription required</strong>You will be asked to upload a valid veterinary prescription at checkout. The seller dispenses only against it.</div>' : '') +
      '<div class="pd-trust"><ul><li>Secure payment on the seller\'s checkout</li><li>Shipped by the seller</li><li>PFA order number for tracking</li></ul></div>' +
      labelPanel() +
      (desc ? '<section class="pd-desc" id="pdDesc" data-clamped="' + (desc.length > 600 ? 1 : 0) + '"><h2>About this product</h2><p>' + esc(desc) + '</p>' + (desc.length > 600 ? '<button class="pd-more" type="button" id="pdMore">Read more</button>' : '') + '</section>' : '') +
      '<p style="margin-top:22px"><button class="pd-share" type="button" id="pdShare">Share this product</button></p>' +
      '</div></div></div>' +
      '<div class="pd-bar"><strong id="pdBarPrice">' + money(price) + '</strong><button class="btn dark" type="button" id="pdBarAdd"' + (canBuy ? '' : ' disabled') + '>Add to bag</button></div>' +
      relatedSection();

    bind();
  }

  function setVariant(id) {
    var v = (product.variants || []).find(function (x) { return String(x.id) === String(id); });
    if (!v) return;
    variant = v;
    var idx = variantImageIndex(v);
    if (idx > -1) imageIndex = idx;
    render();
  }

  function bind() {
    P.qa('[data-variant]', host).forEach(function (b) { b.onclick = function () { setVariant(b.dataset.variant); }; });
    var sel = P.q('#pdVariant', host); if (sel) sel.onchange = function () { setVariant(sel.value); };
    P.qa('[data-image]', host).forEach(function (b) { b.onclick = function () { imageIndex = Number(b.dataset.image); render(); }; });
    P.q('#pdInc', host).onclick = function () { qty = Math.min(25, qty + 1); P.q('#pdQty', host).textContent = qty; };
    P.q('#pdDec', host).onclick = function () { qty = Math.max(1, qty - 1); P.q('#pdQty', host).textContent = qty; };
    P.q('#pdAdd', host).onclick = function () { addToBag(false); };
    P.q('#pdBarAdd', host).onclick = function () { addToBag(false); };
    P.q('#pdBuy', host).onclick = function () { addToBag(true); };
    var more = P.q('#pdMore', host);
    if (more) more.onclick = function () { var d = P.q('#pdDesc', host); var c = d.dataset.clamped === '1'; d.dataset.clamped = c ? '0' : '1'; more.textContent = c ? 'Show less' : 'Read more'; };
    P.q('#pdShare', host).onclick = function () {
      var url = location.origin + '/products/' + encodeURIComponent(product.handle);
      var data = { title: product.title, text: product.title + ' on the PFA Store', url: url };
      if (navigator.share) navigator.share(data).catch(function () {});
      else if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { P.toast('Link copied'); });
    };
  }

  function notFound(handle) {
    document.title = 'Product not found | PFA Store';
    host.innerHTML = '<div class="pd-empty"><p class="kicker">PFA Store</p><h1>We could not find that product.</h1><p class="lead">It may have been removed from the seller\'s catalogue, or the link may be incomplete.</p><div class="hero-actions" style="justify-content:center;margin-top:22px"><a class="btn dark" href="/store.html">Browse the store</a><a class="btn light" href="/search.html?q=' + esc(handle.replace(/-/g, ' ')) + '">Search instead</a></div></div>';
  }

  function sameCategory(list) {
    return list.filter(function (p) { return p.category === product.category && p.id !== product.id && p.available; }).slice(0, 8);
  }

  function loadRelated() {
    fetch(CATALOG_URL, { headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); }).then(function (data) {
      related = sameCategory(Array.isArray(data.products) ? data.products : []);
      if (!related.length) return;
      var old = P.q('.pd-related', host), html = relatedSection();
      if (old) old.outerHTML = html; else host.insertAdjacentHTML('beforeend', html);
    }).catch(function () {});
  }

  function start() {
    syncBadges();
    if (product) {
      variant = (product.variants || []).find(function (v) { return v.available; }) || (product.variants || [])[0] || null;
      var idx = variantImageIndex(variant); if (idx > -1) imageIndex = idx;
      render();
      if (!related.length) loadRelated();
      return;
    }
    var handle = handleFromUrl();
    if (!handle) return notFound('');
    var cached = readStore(CATALOG_CACHE_KEY, null);
    var list = cached && cached.data && Array.isArray(cached.data.products) ? cached.data.products : [];
    var hit = list.find(function (p) { return p.handle === handle || String(p.id) === handle; });
    if (hit) { product = hit; related = sameCategory(list); return start(); }
    fetch(CATALOG_URL, { headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); }).then(function (data) {
      var all = Array.isArray(data.products) ? data.products : [];
      product = all.find(function (p) { return p.handle === handle || String(p.id) === handle; }) || null;
      if (!product) return notFound(handle);
      related = sameCategory(all);
      start();
    }).catch(function () { notFound(handle); });
  }

  start();
}());
