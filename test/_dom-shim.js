'use strict';
/* A DOM small enough to read, faithful enough to catch the bugs that matter.

   The point is that querySelector returns null for an element the page does
   not actually have, exactly as a browser does, so a stale reference to a
   removed element throws here instead of in front of a visitor. Ids, classes
   and data-attributes are read from the real HTML file. */

const VOID_TAGS = new Set(['img', 'input', 'br', 'hr', 'meta', 'link', 'source', 'path', 'circle', 'ellipse', 'use', 'area', 'col', 'embed', 'track', 'wbr']);

/* Returns a flat list, but each entry carries its parent, so closest() can walk
   up the way a browser does instead of guessing. */
function parseMarkup(html) {
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  const nodes = [];
  const stack = [];
  const tagRe = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[^\s=>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s">]+))?)*)\s*(\/?)>/g;
  let m;
  while ((m = tagRe.exec(body))) {
    if (m[1]) { stack.pop(); continue; }               // closing tag
    const tag = m[2].toLowerCase();
    const attrs = {};
    /* The value is optional: `data-reveal`, `hidden` and `disabled` carry none,
       and requiring `=` meant they were never recorded, so every selector that
       looked for one silently matched nothing. */
    const attrRe = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s">]+)))?/g;
    let a;
    while ((a = attrRe.exec(m[3] || ''))) {
      if (!a[1]) continue;
      const value = a[2] !== undefined ? a[2] : (a[3] !== undefined ? a[3] : (a[4] !== undefined ? a[4] : ''));
      attrs[a[1].toLowerCase()] = value;
    }
    const node = { tag, attrs, classes: String(attrs.class || '').split(/\s+/).filter(Boolean),
                   parentIndex: stack.length ? stack[stack.length - 1] : -1 };
    nodes.push(node);
    if (!m[4] && !VOID_TAGS.has(tag)) stack.push(nodes.length - 1);
  }
  return nodes;
}

function matchesSelf(el, sel) {
  const s = String(sel).trim();
  if (s.startsWith('.')) return el.classList.contains(s.slice(1));
  if (s.startsWith('#')) return el._attrs.id === s.slice(1);
  if (/^[a-zA-Z][\w-]*$/.test(s)) return el.tagName === s.toUpperCase();
  const attr = s.match(/^\[([^\]=]+)/);
  if (attr) return attr[1].toLowerCase() in el._attrs;
  return false;
}

function makeElement(spec, doc) {
  const attrs = Object.assign({}, spec && spec.attrs);
  const classes = new Set((spec && spec.classes) || []);
  const listeners = {};
  const el = {
    tagName: ((spec && spec.tag) || 'div').toUpperCase(),
    children: [],
    _attrs: attrs,
    style: (() => {
      const store = {};
      return new Proxy(store, {
        get: (t, k) => {
          if (k === 'setProperty') return (n, v) => { t[n] = v; };
          if (k === 'getPropertyValue') return (n) => t[n] || '';
          if (k === 'removeProperty') return (n) => { delete t[n]; };
          return t[k] || '';
        },
        set: (t, k, v) => { t[k] = v; return true; }
      });
    })(),
    dataset: new Proxy({}, { get: (t, k) => attrs['data-' + String(k).replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())] }),
    classList: {
      add: (...c) => c.forEach((x) => classes.add(x)),
      remove: (...c) => c.forEach((x) => classes.delete(x)),
      toggle: (c, force) => {
        const on = force === undefined ? !classes.has(c) : !!force;
        if (on) classes.add(c); else classes.delete(c);
        return on;
      },
      contains: (c) => classes.has(c)
    },
    get className() { return [...classes].join(' '); },
    get hidden() { return attrs.hidden !== undefined && attrs.hidden !== false; },
    set hidden(v) { if (v) attrs.hidden = ''; else delete attrs.hidden; },
    get value() { return attrs.value || ''; },
    set value(v) { attrs.value = String(v); },
    /* Reflected properties. A real <img> exposes .src, an <a> exposes .href;
       code reasonably reads those rather than calling getAttribute. */
    get src() { return attrs.src || ''; },
    set src(v) { attrs.src = String(v); },
    get href() { return attrs.href || ''; },
    set href(v) { attrs.href = String(v); },
    get id() { return attrs.id || ''; },
    get alt() { return attrs.alt || ''; },
    get type() { return attrs.type || ''; },
    get checked() { return !!attrs.checked; },
    set checked(v) { attrs.checked = !!v; },
    get disabled() { return !!attrs.disabled; },
    set disabled(v) { attrs.disabled = !!v; },
    textContent: '',
    get innerHTML() { return el._html || ''; },
    set innerHTML(v) {
      el._html = String(v);
      if (!doc._all) return;
      /* Replace whatever this element injected last time, so a repaint does not
         leave the previous render findable. */
      (el._injected || []).forEach((old) => {
        const i = doc._all.indexOf(old);
        if (i > -1) doc._all.splice(i, 1);
        if (old._attrs.id) doc._byId.delete(old._attrs.id);
      });
      const specs = parseMarkup(el._html);
      const made = specs.map((spec) => makeElement(spec, doc));
      specs.forEach((spec, i) => {
        made[i].parentNode = spec.parentIndex >= 0 ? made[spec.parentIndex] : el;
        doc._all.push(made[i]);
        if (spec.attrs.id && !doc._byId.has(spec.attrs.id)) doc._byId.set(spec.attrs.id, made[i]);
      });
      el._injected = made;
    },
    offsetHeight: 100,
    scrollTop: 0,
    getAttribute: (k) => (k.toLowerCase() in attrs ? attrs[k.toLowerCase()] : null),
    setAttribute: (k, v) => { attrs[k.toLowerCase()] = String(v); },
    removeAttribute: (k) => { delete attrs[k.toLowerCase()]; },
    hasAttribute: (k) => k.toLowerCase() in attrs,
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    removeEventListener: () => {},
    /* A browser binds `this` to the element inside a handler. */
    dispatch: (t, ev) => (listeners[t] || []).forEach((fn) => fn.call(el, ev)),
    _listeners: listeners,
    appendChild: (c) => { el.children.push(c); return c; },
    remove: () => { el._removed = true; if (doc._all) { const i = doc._all.indexOf(el); if (i > -1) doc._all.splice(i, 1); } if (el._attrs.id && doc._byId) doc._byId.delete(el._attrs.id); },
    focus: () => {},
    select: () => {},
    blur: () => {},
    scrollIntoView: () => {},
    getBoundingClientRect: () => ({ top: 0, bottom: 0, height: 0, width: 0 }),
    /* A browser walks up to the wrapping element; this shim has no real tree,
       so it returns a usable stand-in rather than null, which is what code
       like el.closest('.field').classList.toggle(...) expects to find. */
    /* Self, then up the parent chain, then null — as a browser does. Returning
       a stand-in for a miss made every `if (e.target.closest(x))` branch true. */
    closest: (sel) => {
      let node = el;
      while (node) {
        if (matchesSelf(node, sel)) return node;
        node = node.parentNode;
      }
      return null;
    },
    contains: () => false,
    querySelector: (s) => doc.querySelector(s),
    querySelectorAll: (s) => doc.querySelectorAll(s)
  };
  el.parentNode = null;
  return el;
}

function createDocument(html) {
  const specs = parseMarkup(html);
  const doc = {};
  const byId = new Map();
  const all = [];

  specs.forEach((spec) => {
    const el = makeElement(spec, doc);
    all.push(el);
    if (spec.attrs.id) byId.set(spec.attrs.id, el);
  });
  specs.forEach((spec, i) => {
    all[i].parentNode = spec.parentIndex >= 0 ? all[spec.parentIndex] : null;
  });

  function matches(el, sel) {
    const s = sel.trim();
    if (s.startsWith('#')) return el._attrs.id === s.slice(1);
    if (s.startsWith('.')) return el.classList.contains(s.slice(1));
    const attr = s.match(/^\[([^\]=]+)(?:=["']?([^\]"']*)["']?)?\]$/);
    if (attr) {
      const has = attr[1].toLowerCase() in el._attrs;
      return attr[2] === undefined ? has : el._attrs[attr[1].toLowerCase()] === attr[2];
    }
    const tagAttr = s.match(/^([a-zA-Z][\w-]*)\[([^\]=]+)(?:=["']?([^\]"']*)["']?)?\]$/);
    if (tagAttr) {
      return el.tagName === tagAttr[1].toUpperCase() && tagAttr[2].toLowerCase() in el._attrs;
    }
    if (/^[a-zA-Z][\w-]*$/.test(s)) return el.tagName === s.toUpperCase();
    return false;
  }

  doc.querySelector = (sel) => {
    for (const part of String(sel).split(',')) {
      const last = part.trim().split(/\s+/).pop();
      const hit = all.find((el) => matches(el, last));
      if (hit) return hit;
    }
    return null;                       // as a browser does
  };
  doc.querySelectorAll = (sel) => {
    const out = [];
    for (const part of String(sel).split(',')) {
      const last = part.trim().split(/\s+/).pop();
      all.forEach((el) => { if (matches(el, last) && !out.includes(el)) out.push(el); });
    }
    out.forEach = Array.prototype.forEach.bind(out);
    return out;
  };
  doc.getElementById = (id) => byId.get(id) || null;
  doc.createElement = (tag) => makeElement({ tag, attrs: {}, classes: [] }, doc);
  const docListeners = {};
  doc.addEventListener = (t, fn) => { (docListeners[t] = docListeners[t] || []).push(fn); };
  doc.removeEventListener = () => {};
  doc.dispatch = (t, ev) => (docListeners[t] || []).forEach((fn) => fn.call(doc, ev));
  doc._listeners = docListeners;
  doc.body = makeElement({ tag: 'body', attrs: {}, classes: [] }, doc);
  doc.documentElement = makeElement({ tag: 'html', attrs: {}, classes: [] }, doc);
  doc.head = makeElement({ tag: 'head', attrs: {}, classes: [] }, doc);
  doc.activeElement = null;
  doc.title = '';
  doc._byId = byId;
  doc._all = all;
  return doc;
}

module.exports = { createDocument, parseMarkup };
