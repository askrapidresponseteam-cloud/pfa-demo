'use strict';

/* The chevron has to come out white on a dark surface and black on a light
   one, everywhere, without any page saying which is which. Grepping
   assets/chrome.js for the word "luminance" proves none of that, so this
   boots the real file against a page made of rectangles and asks it what
   colour the pointer is at a given spot.

   The DOM below is only as faithful as the reading needs: elementsFromPoint
   returns what covers the point and takes pointer events, getComputedStyle
   returns what the fixture says, and a canvas hands back the pixels the
   fixture put in a picture. That is the whole surface assets/chrome.js
   touches to make this decision. */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const test = require('node:test');
const assert = require('node:assert');

const ROOT = path.join(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'assets', 'chrome.js'), 'utf8');

const DEFAULT_STYLE = {
  visibility: 'visible', display: 'block', opacity: '1', pointerEvents: 'auto',
  backgroundColor: 'rgba(0, 0, 0, 0)', backgroundImage: 'none',
  objectFit: 'fill', objectPosition: '50% 50%'
};

/* A node is a rectangle with a computed style, and optionally pixels - an
   <img> or <video> the reading is allowed to sample. */
function el(tag, opts) {
  const o = opts || {};
  const node = {
    tagName: tag.toUpperCase(),
    _style: Object.assign({}, DEFAULT_STYLE, o.css || {}),
    _attrs: Object.assign({}, o.attrs || {}),
    _rect: o.rect || { left: 0, top: 0, width: 1000, height: 1000 },
    _pixels: o.pixels || null,          // [r, g, b, a] the canvas will return
    naturalWidth: o.natural ? o.natural[0] : 0,
    naturalHeight: o.natural ? o.natural[1] : 0,
    videoWidth: o.natural ? o.natural[0] : 0,
    videoHeight: o.natural ? o.natural[1] : 0,
    width: o.natural ? o.natural[0] : 0,
    height: o.natural ? o.natural[1] : 0,
    complete: true,
    readyState: 4,
    nodeType: 1,
    children: [],
    style: makeStyle(),
    ownerSVGElement: o.ownerSVGElement || null,
    getAttribute(name) { return name in this._attrs ? this._attrs[name] : null; },
    setAttribute(name, value) { this._attrs[name] = value; },
    addEventListener() {},
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
    getBoundingClientRect() {
      const r = this._rect;
      return { left: r.left, top: r.top, width: r.width, height: r.height,
        right: r.left + r.width, bottom: r.top + r.height };
    }
  };
  (o.kids || []).forEach((k) => { node.children.push(k); k.parentNode = node; });
  return node;
}

function makeStyle() {
  const props = Object.create(null);
  return {
    _props: props,
    setProperty(name, value) { props[name] = value; },
    removeProperty(name) { delete props[name]; },
    getPropertyValue(name) { return props[name] || ''; }
  };
}

/* Deepest first, and among equals the later sibling first: a browser hands
   back what is on top before what is under it, and the last of two
   overlapping siblings is the one on top. Getting this backwards is worth
   remembering - it made the compositing test below fail against perfectly
   good code. */
function hitsFor(root, x, y) {
  const found = [];
  let order = 0;
  (function walk(node, depth) {
    node.children.forEach((k) => walk(k, depth + 1));
    order += 1;
    if (String(node.className || '').includes('cursor-layer')) return;
    if (node._style.pointerEvents === 'none') return;
    if (node._style.visibility === 'hidden') return;
    const r = node.getBoundingClientRect();
    if (x < r.left || x >= r.right || y < r.top || y >= r.bottom) return;
    found.push({ node, depth, order });
  })(root, 0);
  return found.sort((a, b) => (b.depth - a.depth) || (b.order - a.order)).map((f) => f.node);
}

/* Boots assets/chrome.js over one fixture and returns a handle that can move
   the pointer about and report the colour of each stroke. */
function boot(build) {
  const html = el('html', { css: { backgroundColor: 'rgb(255, 255, 255)' } });
  const body = el('body');
  html.children.push(body); body.parentNode = html;
  build(body);

  const frames = [];
  const beats = [];
  const listeners = { window: {}, document: {}, html: {} };
  let layer = null;

  function record(bag) {
    return (type, fn) => { (bag[type] = bag[type] || []).push(fn); };
  }

  const svgPaths = [];
  function fakeSvg() {
    const paths = [el('path'), el('path')];
    svgPaths.push(...paths);
    const svg = el('svg');
    svg.firstChild = paths[0];
    svg.lastChild = paths[1];
    return svg;
  }

  const document = {
    documentElement: html,
    body,
    hidden: false,
    readyState: 'complete',
    addEventListener: record(listeners.document),
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    createElement(tag) {
      if (tag === 'canvas') {
        return {
          width: 0, height: 0,
          getContext: () => ({
            clearRect() {},
            /* Whatever the last drawImage was handed, three by three. */
            drawImage(source) { this._last = source && source._pixels; },
            getImageData() {
              const p = this._last || [0, 0, 0, 0];
              const data = [];
              for (let i = 0; i < 9; i += 1) data.push(p[0], p[1], p[2], Math.round(p[3] * 255));
              return { data };
            }
          })
        };
      }
      const node = el(tag);
      Object.defineProperty(node, 'innerHTML', {
        set(markup) {
          if (markup.indexOf('<svg') !== 0) return;
          const svg = fakeSvg();
          node.firstChild = svg;
          node.children.push(svg);
        }
      });
      return node;
    },
    elementsFromPoint: (x, y) => hitsFor(html, x, y)
  };
  html.addEventListener = record(listeners.html);
  const bodyAppend = body.appendChild.bind(body);
  body.appendChild = (child) => { layer = child; return bodyAppend(child); };
  html.classList = { add() {}, remove() {} };
  html.style = makeStyle();

  const sandbox = {
    window: null,
    document,
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    matchMedia: (q) => ({ matches: /hover: hover/.test(q) }),
    getComputedStyle: (node) => node._style,
    requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; },
    cancelAnimationFrame: () => {},
    setInterval: (fn) => { beats.push(fn); return beats.length; },
    clearInterval: () => {},
    setTimeout: () => 1,
    innerWidth: 1000, innerHeight: 1000,
    Image: function Image() { return { set src(v) { void v; } }; },
    console, JSON, Math, Date, Number, String, Boolean, Array, Object, RegExp, Error,
    WeakSet, Set, Map, parseInt, parseFloat, isNaN, isFinite, Promise
  };
  sandbox.window = sandbox;
  sandbox.window.addEventListener = record(listeners.window);
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox, { filename: 'assets/chrome.js' });

  function fire(type, event) {
    (listeners.window[type] || []).forEach((fn) => fn(event || {}));
  }
  function settle() {
    frames.splice(0).forEach((fn) => fn(0));
    /* The heartbeat, run by hand: it is what carries a surface that changed
       under a pointer that did not move. */
    beats.forEach((fn) => fn());
  }

  return {
    layer,
    svg: () => layer.firstChild,
    move(x, y) {
      fire('pointermove', { clientX: x, clientY: y, pointerType: 'mouse' });
      settle();
      return this;
    },
    settle() { settle(); return this; },
    /* The stroke the chevron is drawn in, and the ring behind it. */
    ink() { return layer.firstChild.style._props['--cursor-ink'] || 'default'; },
    casing() { return layer.firstChild.style._props['--cursor-case'] || 'default'; },
    /* "default" is the stylesheet's own pair: ink #111 over bone #f2f0ec. */
    reads() { return this.ink() === 'default' ? 'dark ink' : 'light ink'; }
  };
}

const WHITE = 'rgb(255, 255, 255)';
const BLACK = 'rgb(10, 10, 10)';
const box = (rect, css, kids) => el('div', { rect, css, kids });

test('a white surface takes the dark chevron, a black one the light chevron', () => {
  const page = boot((body) => {
    body.children.push(
      box({ left: 0, top: 0, width: 1000, height: 500 }, { backgroundColor: WHITE }),
      box({ left: 0, top: 500, width: 1000, height: 500 }, { backgroundColor: BLACK })
    );
    body.children.forEach((k) => { k.parentNode = body; });
  });

  assert.equal(page.move(200, 200).reads(), 'dark ink', 'white section');
  assert.equal(page.move(200, 700).reads(), 'light ink', 'black section');
  assert.equal(page.casing(), 'var(--deep,#0a0a0a)', 'the ring behind it is the opposite colour');
  assert.equal(page.move(200, 200).reads(), 'dark ink', 'and back again');
});

test('the pointer standing still over a surface that changes is recoloured anyway', () => {
  /* The bug that killed the first sampler: it read on mouseover only, so a
     button inverting on hover under a still hand left the chevron black on
     black. Nothing moves here between the two readings but the button. */
  const button = box({ left: 0, top: 0, width: 1000, height: 1000 }, { backgroundColor: WHITE });
  const page = boot((body) => { body.children.push(button); button.parentNode = body; });

  assert.equal(page.move(500, 500).reads(), 'dark ink');
  button._style.backgroundColor = BLACK;
  assert.equal(page.settle().reads(), 'light ink', 'the heartbeat carries it');
});

test('a scrim that takes no pointer events still darkens the surface', () => {
  /* elementsFromPoint cannot see these at all, and this site darkens every
     hero photograph with one. Missed, the chevron comes out black on a
     picture everybody else can see is black. */
  const scrim = box({ left: 0, top: 0, width: 1000, height: 1000 },
    { backgroundColor: 'rgba(0, 0, 0, 0.75)', pointerEvents: 'none' });
  const copy = box({ left: 0, top: 0, width: 1000, height: 1000 }, {});
  const page = boot((body) => {
    const hero = box({ left: 0, top: 0, width: 1000, height: 1000 },
      { backgroundColor: WHITE }, [scrim, copy]);
    body.children.push(hero); hero.parentNode = body;
  });

  assert.equal(page.move(500, 500).reads(), 'light ink', 'three quarters of black over white is dark');
  scrim._style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
  assert.equal(page.settle().reads(), 'dark ink', 'a scrim that barely tints it is not');
});

test('a photograph is read from its own pixels, not from what it sits on', () => {
  const picture = el('img', {
    rect: { left: 0, top: 0, width: 400, height: 400 },
    natural: [800, 800],
    css: { objectFit: 'cover' },
    pixels: [12, 12, 14, 1]                       // a dark photograph
  });
  const page = boot((body) => {
    const card = box({ left: 0, top: 0, width: 1000, height: 1000 },
      { backgroundColor: WHITE }, [picture]);
    body.children.push(card); card.parentNode = body;
  });

  assert.equal(page.move(200, 200).reads(), 'light ink', 'dark picture on a white card');
  assert.equal(page.move(600, 600).reads(), 'dark ink', 'and the white card beside it');
  picture._pixels = [246, 244, 240, 1];
  assert.equal(page.move(200, 200).settle().reads(), 'dark ink', 'a pale picture reads pale');
});

test('a picture that cannot be read lets the surface underneath answer', () => {
  /* Another origin's film taints the canvas. The walk carries on beneath it
     and lands on the stage the page painted, which is what a letterboxed
     film is sitting on anyway. */
  const film = el('video', {
    rect: { left: 0, top: 0, width: 1000, height: 1000 },
    natural: [1920, 1080],
    pixels: null
  });
  const page = boot((body) => {
    const stage = box({ left: 0, top: 0, width: 1000, height: 1000 },
      { backgroundColor: BLACK }, [film]);
    body.children.push(stage); stage.parentNode = body;
  });

  assert.equal(page.move(500, 500).reads(), 'light ink');
});

test('data-cursor on an element is taken as the answer', () => {
  /* The escape hatch for a surface the reading cannot see - a cross-origin
     embed, a canvas drawn by somebody else. light = draw the light chevron,
     which is what the twenty-odd hints already in the pages mean. */
  const page = boot((body) => {
    const bar = box({ left: 0, top: 0, width: 1000, height: 100 },
      { backgroundColor: WHITE }, []);
    bar._attrs['data-cursor'] = 'light';
    const head = box({ left: 0, top: 100, width: 1000, height: 100 },
      { backgroundColor: BLACK }, []);
    head._attrs['data-cursor'] = 'dark';
    body.children.push(bar, head);
    body.children.forEach((k) => { k.parentNode = body; });
  });

  assert.equal(page.move(500, 50).reads(), 'light ink', 'said dark, whatever it is painted');
  assert.equal(page.move(500, 150).reads(), 'dark ink', 'said light, whatever it is painted');
});

test('a translucent panel is composited over what shows through it', () => {
  const page = boot((body) => {
    const sheet = box({ left: 0, top: 0, width: 1000, height: 1000 },
      { backgroundColor: 'rgba(255, 255, 255, 0.5)' });
    const under = box({ left: 0, top: 0, width: 1000, height: 1000 }, { backgroundColor: BLACK });
    body.children.push(under, sheet);
    body.children.forEach((k) => { k.parentNode = body; });
  });

  /* Half a white sheet over black is a mid grey, and black wins on a mid
     grey - the two contrast ratios cross well below it. */
  assert.equal(page.move(500, 500).reads(), 'dark ink');
});

test('a surface on the border keeps whatever it already had', () => {
  /* rgb(118,118,118) sits almost exactly where white and black are equally
     legible. Without a margin either side of that point, a hand crossing a
     grainy photograph - or resting on the join between two panels - flickers
     the pair back and forth, which is worse than either answer. */
  const page = boot((body) => {
    body.children.push(
      box({ left: 0, top: 0, width: 1000, height: 300 }, { backgroundColor: WHITE }),
      box({ left: 0, top: 300, width: 1000, height: 400 }, { backgroundColor: 'rgb(118, 118, 118)' }),
      box({ left: 0, top: 700, width: 1000, height: 300 }, { backgroundColor: BLACK })
    );
    body.children.forEach((k) => { k.parentNode = body; });
  });

  assert.equal(page.move(500, 100).reads(), 'dark ink');
  assert.equal(page.move(500, 500).reads(), 'dark ink', 'arriving from white it stays dark');
  assert.equal(page.move(500, 900).reads(), 'light ink');
  assert.equal(page.move(500, 500).reads(), 'light ink', 'arriving from black it stays light');
});

test('nothing painted anywhere reads as the white canvas, not as an unknown', () => {
  const page = boot((body) => {
    const empty = box({ left: 0, top: 0, width: 1000, height: 1000 }, {});
    body.children.push(empty); empty.parentNode = body;
  });
  assert.equal(page.move(500, 500).reads(), 'dark ink');
});

test('the chevron rides the top layer, so a modal dialog cannot cover it', () => {
  /* A modal <dialog> paints above every z-index there is, and v1.256
     answered by standing the chevron down for the system pointer - rejected
     by the owner in about four hours: the drawn cursor is the site's, whole.
     So the layer is a manual popover, which lives in the same top layer a
     dialog does, above it once re-promoted on the beat that notices one
     opened. The old answer survives only as the fallback for browsers
     without popovers, fenced off with @supports so the two can never both
     apply. */
  const css = fs.readFileSync(path.join(ROOT, 'assets', 'chrome.css'), 'utf8');
  const js = fs.readFileSync(path.join(ROOT, 'assets', 'chrome.js'), 'utf8');
  assert.match(js, /layer\.setAttribute\('popover', 'manual'\)/, 'the layer is a manual popover: no focus taken, nothing trapped');
  assert.match(js, /layer\.hidePopover\(\); layer\.showPopover\(\);/, 'a newly opened dialog is answered by stepping back on top');
  assert.match(js, /if \(vis && !document\.hidden && !standDown\(\)\) recolour\(\)/, 'noticed on the same heartbeat as the colour');
  const fence = css.indexOf('@supports not selector(:popover-open)');
  const revert = css.indexOf('cursor:revert!important');
  assert.ok(fence >= 0 && revert > fence && revert < css.indexOf('}', css.indexOf('}', fence) + 1) + 40,
    'the system-pointer fallback exists only where popovers do not');
  assert.match(css, /\.cursor-layer\{margin:0;border:0;padding:0;width:auto;height:auto;background:transparent;overflow:visible\}/,
    "the UA's popover dress is stripped: the layer stays the invisible full sheet");
});
