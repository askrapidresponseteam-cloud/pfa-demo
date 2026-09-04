/* People for Animals — the shopping bag.
   ------------------------------------------------------------------------
   One store, shared by pfa-shop.html and product.html. Before this existed
   each page kept its own copy of the same twelve lines against
   sessionStorage, and the bag lost its contents in four different ways:

     1. sessionStorage is per tab and is cleared when the tab closes. Opening
        a product in a new tab showed an empty bag; so did coming back after
        lunch. This was the one shoppers noticed.
     2. The shop pruned the bag against the catalogue on every load, and
        loadCatalog() resolves even when the fetch failed, with BY_ID empty.
        One network blip deleted every line and wrote the empty bag back.
     3. applyCatalog() empties BY_ID when the seller has the store closed, so
        closing the store for an hour wiped every bag on every device, while
        the page said "nothing you had in your bag has been charged".
     4. The prune also ran against whichever of the snapshot or the live
        catalogue arrived first, so a stale snapshot dropped lines the seller
        still stocks.

   What this provides:
     - localStorage, falling back to sessionStorage, falling back to memory,
       so a private-mode or storage-refused browser still has a working bag
       for the length of the visit instead of silently dropping every write.
     - A versioned envelope with a timestamp, so the shape can change without
       corrupting a bag that is already out there, and an abandoned bag stops
       being resurrected after MAX_AGE_DAYS.
     - mutate(), which re-reads immediately before writing. Two tabs adding
       different things no longer overwrite each other.
     - A storage listener, so a second tab repaints instead of drifting.
     - Validation on the way in and the way out. Nothing here can throw, and
       nothing malformed reaches the order payload.

   The bag maps a Shopify variant id to a quantity, which is the shape
   /api/pfa-orders expects. That has not changed.                          */

(function (global) {
  'use strict';

  var KEY = 'pfa:store:bag';
  var VERSION = 2;
  var MAX_QTY = 25;          /* /api/pfa-orders caps a line at 25 */
  var MAX_LINES = 100;       /* a real bag is nowhere near this */
  var MAX_AGE_DAYS = 30;
  var MAX_AGE = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

  /* ---------------------------------------------------------- storage tier */
  /* Written as a probe rather than a feature test: Safari in private mode
     exposes localStorage and throws only when you write to it, and a browser
     with storage disabled throws on access itself. */
  function usable(get) {
    try {
      var s = get();
      if (!s) return null;
      var probe = '__pfa_probe__';
      s.setItem(probe, '1');
      s.removeItem(probe);
      return s;
    } catch (_) { return null; }
  }

  function memoryStore() {
    var d = Object.create(null);
    return {
      getItem: function (k) { return k in d ? d[k] : null; },
      setItem: function (k, v) { d[k] = String(v); },
      removeItem: function (k) { delete d[k]; }
    };
  }

  var store = null, tier = '';
  function backing() {
    if (store) return store;
    store = usable(function () { return global.localStorage; });
    if (store) { tier = 'local'; return store; }
    store = usable(function () { return global.sessionStorage; });
    if (store) { tier = 'session'; return store; }
    store = memoryStore(); tier = 'memory';
    return store;
  }

  /* ------------------------------------------------------------ validation */
  function cleanId(id) {
    var s = String(id == null ? '' : id).trim();
    /* Shopify variant ids are digits or a gid:// URI. Anything else never came
       from the catalogue and would be rejected at checkout anyway. */
    if (!s || s.length > 120) return '';
    if (!/^[A-Za-z0-9:/_-]+$/.test(s)) return '';
    return s;
  }

  function cleanQty(n) {
    var q = Math.floor(Number(n));
    if (!isFinite(q) || q <= 0) return 0;
    return q > MAX_QTY ? MAX_QTY : q;
  }

  function sanitise(raw) {
    var out = {}, lines = 0;
    /* typeof [] is 'object', and an array walked through the loop below as
       index-to-value, turning [1,2,3] into a bag of three lines. */
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (var k in raw) {
      if (!Object.prototype.hasOwnProperty.call(raw, k)) continue;
      var id = cleanId(k), qty = cleanQty(raw[k]);
      if (!id || !qty) continue;
      out[id] = qty;
      if (++lines >= MAX_LINES) break;
    }
    return out;
  }

  /* ------------------------------------------------------------- envelope */
  function decode(text) {
    if (!text) return { items: {}, at: 0 };
    var data;
    try { data = JSON.parse(text); } catch (_) { return { items: {}, at: 0 }; }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { items: {}, at: 0 };
    /* v1 was the bare map. Read it so a bag in flight survives the upgrade. */
    if (!data.v) return { items: sanitise(data), at: Date.now() };
    if (data.v > VERSION) return { items: {}, at: 0 };
    var at = Number(data.at) || 0;
    if (at && Date.now() - at > MAX_AGE) return { items: {}, at: 0 };
    return { items: sanitise(data.items), at: at };
  }

  function encode(items) {
    return JSON.stringify({ v: VERSION, at: Date.now(), items: items });
  }

  /* ----------------------------------------------------------------- core */
  var degraded = false;

  function read() {
    try { return decode(backing().getItem(KEY)).items; }
    catch (_) { return {}; }
  }

  function persist(items) {
    try {
      backing().setItem(KEY, encode(items));
      return true;
    } catch (err) {
      /* Out of quota, or storage revoked mid-session. Drop to memory so the
         bag still works for this visit rather than appearing to accept an
         item and losing it on the next read. */
      degraded = true;
      store = memoryStore(); tier = 'memory';
      try { store.setItem(KEY, encode(items)); } catch (_) {}
      return false;
    }
  }

  var listeners = [];
  function announce(items, external) {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](items, !!external); } catch (_) {}
    }
    try {
      global.dispatchEvent(new CustomEvent('pfa:bag', { detail: { items: items, external: !!external } }));
    } catch (_) { /* older browsers, and the listeners above already ran */ }
  }

  /* The only way to change the bag. Re-reads first, so a second tab's work is
     never overwritten by whatever this tab happened to be holding. */
  function mutate(fn) {
    var items = read();
    var next;
    try { next = fn(items); } catch (_) { return read(); }
    var clean = sanitise(next === undefined ? items : next);
    persist(clean);
    announce(clean, false);
    return clean;
  }

  function write(items) { return mutate(function () { return items; }); }

  function add(id, n) {
    var key = cleanId(id);
    if (!key) return read();
    return mutate(function (items) {
      var next = cleanQty((items[key] || 0) + (Number(n) || 1));
      if (next) items[key] = next; else delete items[key];
      return items;
    });
  }

  function setQty(id, n) {
    var key = cleanId(id);
    if (!key) return read();
    return mutate(function (items) {
      var next = cleanQty(n);
      if (next) items[key] = next; else delete items[key];
      return items;
    });
  }

  function remove(id) { return setQty(id, 0); }
  function clear() { return mutate(function () { return {}; }); }

  function count() {
    var items = read(), n = 0;
    for (var k in items) n += items[k];
    return n;
  }

  /* Keep only the ids a trustworthy catalogue knows about. The caller decides
     what trustworthy means; this refuses to run on an empty one, because an
     empty catalogue is what a failed fetch and a closed store both look like,
     and both used to empty the bag. */
  function keepOnly(ids) {
    var keep = {};
    (ids || []).forEach(function (id) { var c = cleanId(id); if (c) keep[c] = 1; });
    if (!Object.keys(keep).length) return read();
    return mutate(function (items) {
      for (var k in items) if (!keep[k]) delete items[k];
      return items;
    });
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.push(fn);
    return function () {
      var i = listeners.indexOf(fn);
      if (i > -1) listeners.splice(i, 1);
    };
  }

  /* Another tab changed the bag. Only localStorage raises this, which is the
     other half of why the bag moved off sessionStorage. */
  try {
    global.addEventListener('storage', function (e) {
      if (!e || e.key !== KEY) return;
      announce(read(), true);
    });
  } catch (_) {}

  global.PFABag = {
    KEY: KEY,
    MAX_QTY: MAX_QTY,
    read: read,
    write: write,
    mutate: mutate,
    add: add,
    setQty: setQty,
    remove: remove,
    clear: clear,
    count: count,
    keepOnly: keepOnly,
    subscribe: subscribe,
    /* For diagnostics and the tests: which tier is actually holding the bag,
       and whether a write has already been refused. */
    tier: function () { backing(); return tier; },
    durable: function () { backing(); return tier === 'local'; },
    degraded: function () { return degraded; }
  };
})(typeof window !== 'undefined' ? window : this);
