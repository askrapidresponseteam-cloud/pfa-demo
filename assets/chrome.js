/* PFA site chrome: the one script behind the announcement bar and header.

   Responsibilities, in order:
     1. Measure. --ann and --nav are the real heights of the announcement bar
        and the fixed header. Pages position their first section from them, so
        they are measured, never assumed, and re-measured on resize and once
        fonts have loaded (the nav wraps on a narrow window; a swapped font
        changes the header height by a pixel or two).
     2. Close. The announcement's close button hides the bar and remembers the
        choice for the rest of the session, keyed on the bar's text - so the
        same message does not come back on the next page, while a different
        message (the shop, CineKind) still shows.
   The shop's Cart button lives in the header markup on shop pages, but its
   count is the shop's own state, so pfa-shop.html and product.html drive it;
   this file does not touch it.

   Pages that used to carry their own copy of this measured the same way; the
   copies had drifted (index.html read `.pfa-ann`, the shop read `#announce`,
   and no page remembered a close). This replaces all of them. */
(function () {
  'use strict';

  /* Right-click is switched off site-wide. This only removes the context
     menu; it does not stop anyone saving an image or reading the source. */
  document.addEventListener('contextmenu', function (event) { event.preventDefault(); }, true);

  var root = document.documentElement;
  var CLOSED_KEY = 'pfa:announce:closed';

  function bar() { return document.getElementById('announce'); }
  function header() { return document.getElementById('header') || document.querySelector('header.site'); }

  /* Closing the bar closes it on this page only. It used to be remembered
     for the session, keyed on the bar's text, which meant one close on the
     home page silently removed it from every page carrying the same line
     until the tab was shut. Any old memory is cleared so nobody is stuck. */
  try { sessionStorage.removeItem(CLOSED_KEY); } catch (_) {}

  /* A measurement of zero is not a measurement. This runs before layout has
     settled on some loads, and an inline --nav:0px outranks the page's :root
     fallback, which put the fixed header at top:0 underneath the fixed
     announcement bar and cut the top off the mark and the Donate button. A
     height is published only once it is real; until then the page's own
     :root values hold. A bar that is genuinely closed is the one legitimate
     zero, so it is written from the closed state rather than from a
     measurement. */
  function measure() {
    var ann = bar();
    var head = header();
    var open = ann && !ann.hidden && ann.style.display !== 'none';
    if (!ann || !open) root.style.setProperty('--ann', '0px');
    else if (ann.offsetHeight) root.style.setProperty('--ann', ann.offsetHeight + 'px');
    if (head && head.offsetHeight) root.style.setProperty('--nav', head.offsetHeight + 'px');
  }

  function closeBar() {
    var ann = bar();
    if (!ann) return;
    ann.hidden = true;
    ann.style.display = 'none';
    measure();
  }

  function initAnnouncement() {
    var ann = bar();
    if (!ann) return;
    var close = document.getElementById('annClose') || ann.querySelector('button');
    if (close) close.addEventListener('click', closeBar);
  }


  /* ---------- what is painted under the pointer ----------
     The chevron switches: bone on a dark surface, ink on a light one. This
     decides which, and it is the only thing on the site that decides it, so
     no page, section, overlay or component added later has an opinion to
     drift from.

     Three answers came before it and all three are recorded here so none is
     tried again. Fourteen per-page copies, each with a hand-written list of
     "dark" selectors: the lists drifted and any surface not on a page's list
     - the Wall's black video frames - got ink smeared across black. Then one
     sampler, but it read only on mouseover, so a surface that changed under a
     still hand (a button inverting on hover) left the chevron black on black.
     Then a difference blend, which recoloured itself every frame but
     recoloured the letters under it too, and read as though it were behind
     the text.

     So: read what is actually painted at the point, read it again on a
     heartbeat rather than only when something is hovered, and paint the
     answer instead of blending it. Every layer at the point is composited in
     paint order, from the top down until something opaque stops the walk:

       data-cursor="light" / "dark"  an element's explicit answer, and the way
                                     to teach this about a surface it cannot
                                     see (light = draw the light chevron, i.e.
                                     the surface is dark). Ends the walk.
       <img> <video> <canvas>        the pixels themselves, averaged over the
                                     chevron's own footprint, read through
                                     object-fit and object-position.
       background-image              a gradient's stops averaged; a picture's
                                     own average, read once and remembered.
       background-color              through the element's opacity.

     Anything it cannot read - another origin's film, another site in a frame
     - is treated as clear and the walk carries on beneath it, which lands on
     the surface the page put there (the theatre's black stage, a card's white
     face). And the chevron it colours is still ink over a wider casing, so a
     reading that is late, impossible or simply wrong costs some contrast and
     never the pointer itself. */
  var surface = (function () {
    var pad = null, ctx = null;
    var tainted = new WeakSet();      /* media that taints the scratch canvas */
    var pictures = Object.create(null);   /* background-image url -> average */

    function channel(v) { var n = parseFloat(v); if (isNaN(n)) return 0; return /%$/.test(v) ? n * 2.55 : n; }
    function opacityOf(v) { var n = parseFloat(v); if (isNaN(n)) return 1; return /%$/.test(v) ? n / 100 : n; }

    /* Computed colours come back as rgb()/rgba(); the rest is for values a
       page sets by hand and for the wide-gamut form newer engines emit. */
    function colour(s) {
      if (!s) return null;
      var m = /rgba?\(([^)]*)\)/i.exec(s), p, h;
      if (m) {
        p = m[1].split(/[\s,/]+/);
        p = p.filter(function (t) { return t !== ''; });
        if (p.length < 3) return null;
        return [channel(p[0]), channel(p[1]), channel(p[2]), p.length > 3 ? opacityOf(p[3]) : 1];
      }
      m = /^\s*#([0-9a-f]{3,8})\s*$/i.exec(s);
      if (m) {
        h = m[1];
        if (h.length === 3 || h.length === 4) h = h.replace(/./g, function (c) { return c + c; });
        if (h.length !== 6 && h.length !== 8) return null;
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16),
          h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
      }
      m = /color\(\s*[a-z0-9-]+([^)]*)\)/i.exec(s);
      if (m) {
        p = m[1].split(/[\s/]+/);
        p = p.filter(function (t) { return t !== ''; });
        if (p.length < 3) return null;
        return [parseFloat(p[0]) * 255, parseFloat(p[1]) * 255, parseFloat(p[2]) * 255,
          p.length > 3 ? opacityOf(p[3]) : 1];
      }
      return null;
    }

    function toLinear(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
    function luminance(c) { return 0.2126 * toLinear(c[0]) + 0.7152 * toLinear(c[1]) + 0.0722 * toLinear(c[2]); }

    /* Three by three, not one by one: a single pixel is a coin toss on a
       grainy photograph, and the browser does the averaging in drawImage. */
    function scratch() {
      if (pad) return ctx;
      pad = document.createElement('canvas');
      pad.width = 3; pad.height = 3;
      try { ctx = pad.getContext('2d', { willReadFrequently: true }); } catch (e) { ctx = null; }
      return ctx;
    }
    function average(data) {
      var i, a, sum = 0, r = 0, g = 0, b = 0;
      for (i = 0; i < data.length; i += 4) {
        a = data[i + 3] / 255;
        sum += a; r += data[i] * a; g += data[i + 1] * a; b += data[i + 2] * a;
      }
      /* Nothing but hole: whatever is under it is what shows. */
      if (!sum) return null;
      return [r / sum, g / sum, b / sum, sum / (data.length / 4)];
    }
    /* One component of object-position, against the slack in that axis. */
    function offset(token, slack) {
      if (!token || token === 'center') return slack / 2;
      if (token === 'left' || token === 'top') return 0;
      if (token === 'right' || token === 'bottom') return slack;
      if (/%$/.test(token)) return slack * parseFloat(token) / 100;
      var n = parseFloat(token);
      return isNaN(n) ? slack / 2 : n;
    }
    function pixels(el, x, y) {
      if (tainted.has(el)) return null;
      var c = scratch();
      if (!c) return null;
      var tag = el.tagName, nw, nh;
      if (tag === 'IMG') { if (!el.complete) return null; nw = el.naturalWidth; nh = el.naturalHeight; }
      else if (tag === 'VIDEO') { if (el.readyState < 2) return null; nw = el.videoWidth; nh = el.videoHeight; }
      else { nw = el.width; nh = el.height; }
      if (!nw || !nh) return null;
      var box = el.getBoundingClientRect();
      if (!box.width || !box.height) return null;
      var cs = getComputedStyle(el), fit = cs.objectFit || 'fill', k = 0;
      if (fit === 'contain') k = Math.min(box.width / nw, box.height / nh);
      else if (fit === 'cover') k = Math.max(box.width / nw, box.height / nh);
      else if (fit === 'none') k = 1;
      else if (fit === 'scale-down') k = Math.min(1, Math.min(box.width / nw, box.height / nh));
      var w = k ? nw * k : box.width, h = k ? nh * k : box.height;
      var pos = String(cs.objectPosition || '50% 50%').split(/\s+/);
      var left = box.left + offset(pos[0], box.width - w);
      var top = box.top + offset(pos.length > 1 ? pos[1] : '50%', box.height - h);
      /* Off the picture itself - the letterbox of object-fit:contain, the
         part of the box a cover crop never reaches - and what shows there is
         the element's own background, so this layer says nothing. */
      if (x < left || x >= left + w || y < top || y >= top + h) return null;
      var kx = nw / w, ky = nh / h;
      var spanX = Math.max(1, 24 * kx), spanY = Math.max(1, 24 * ky);
      var sx = Math.max(0, Math.min(nw - spanX, (x - left) * kx - spanX / 2));
      var sy = Math.max(0, Math.min(nh - spanY, (y - top) * ky - spanY / 2));
      var data;
      try {
        c.clearRect(0, 0, 3, 3);
        c.drawImage(el, sx, sy, Math.min(spanX, nw - sx), Math.min(spanY, nh - sy), 0, 0, 3, 3);
        data = c.getImageData(0, 0, 3, 3).data;
      } catch (e) {
        /* Another origin's picture or film taints the canvas for good, so it
           is asked once and never again; a frame that is merely not ready yet
           is asked again next time. */
        if (!e || e.name === 'SecurityError') tainted.add(el);
        return null;
      }
      return average(data);
    }
    /* A picture set in CSS is read whole and remembered. Where in it the
       pointer stands would mean unpicking background-size, -position and
       -repeat, and whether the surface is dark almost never turns on that.
       The file is already decoded for the page, so this costs no request. */
    function picture(url) {
      if (url in pictures) return pictures[url];
      pictures[url] = null;
      var img = new Image();
      img.onload = function () {
        var c = scratch();
        if (!c) return;
        try {
          c.clearRect(0, 0, 3, 3);
          c.drawImage(img, 0, 0, 3, 3);
          pictures[url] = average(c.getImageData(0, 0, 3, 3).data);
        } catch (e) {}
      };
      img.src = url;
      return null;
    }
    function backdrop(cs) {
      var img = cs.backgroundImage;
      if (!img || img === 'none') return null;
      if (/gradient\(/i.test(img)) {
        /* Every stop, averaged. A scrim fading from clear to black is half a
           black scrim, which is right to within the width of the casing. */
        var stops = img.match(/rgba?\([^)]*\)/gi), i, c, r = 0, g = 0, b = 0, a = 0, n = 0;
        if (!stops) return null;
        for (i = 0; i < stops.length; i++) {
          c = colour(stops[i]);
          if (!c) continue;
          r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3]; n++;
        }
        if (!n || !a) return null;
        return [r / a, g / a, b / a, a / n];
      }
      var m = /url\(\s*["']?([^"')]+)/i.exec(img);
      return m ? picture(m[1]) : null;
    }

    /* What one element paints at the point, topmost first. */
    function layersOf(el, x, y, out) {
      if (!el || el.nodeType !== 1 || !el.tagName) return false;
      var cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') return false;
      var op = parseFloat(cs.opacity);
      if (isNaN(op)) op = 1;
      if (op <= 0) return false;

      var hint = el.getAttribute ? el.getAttribute('data-cursor') : null;
      if (hint === 'light') { out.push([0, 0, 0, 1]); return true; }
      if (hint === 'dark') { out.push([255, 255, 255, 1]); return true; }

      var tag = el.tagName, c;
      if (tag === 'IMG' || tag === 'VIDEO' || tag === 'CANVAS') {
        c = pixels(el, x, y);
        if (c) out.push([c[0], c[1], c[2], c[3] * op]);
      }
      /* The shapes inside an <svg> are icons and letters, not surfaces: what
         the chevron stands on is whatever is behind them. The <svg> itself
         can carry a background and is read like any other element. */
      if (el.ownerSVGElement) return false;
      c = backdrop(cs);
      if (c) out.push([c[0], c[1], c[2], c[3] * op]);
      c = colour(cs.backgroundColor);
      if (c && c[3] > 0) out.push([c[0], c[1], c[2], c[3] * op]);
      return false;
    }

    /* Hit testing cannot see a layer that takes no pointer events, and that
       is exactly what darkens this site's hero photographs: a child at
       inset:0 with pointer-events:none. Missing them is how a white chevron
       would end up on a hero that reads black to everyone looking at it. So
       each hit's own covering children are collected too, in front of it. */
    function scrims(el, x, y, depth, out, mine) {
      var kids = el.children, i, k, box, cs;
      if (!kids || !kids.length || kids.length > 48) return;
      for (i = kids.length - 1; i >= 0; i--) {
        k = kids[i];
        if (k === mine || !k.getBoundingClientRect) continue;
        box = k.getBoundingClientRect();
        if (!box.width || !box.height) continue;
        if (x < box.left || x >= box.right || y < box.top || y >= box.bottom) continue;
        cs = getComputedStyle(k);
        /* Anything that does take pointer events was already offered by
           elementsFromPoint, in its right place in the stack. */
        if (cs.pointerEvents !== 'none' || cs.visibility === 'hidden') continue;
        if (depth > 0) scrims(k, x, y, depth - 1, out, mine);
        out.push(k);
      }
    }

    function at(x, y, mine) {
      if (!document.elementsFromPoint) return null;
      var hits = document.elementsFromPoint(x, y);
      if (!hits || !hits.length) return null;
      var stack = [], clear = 1, i, j, m, over, layers, a;
      for (i = 0; i < hits.length && clear > 0.004; i++) {
        over = [];
        scrims(hits[i], x, y, 1, over, mine);
        over.push(hits[i]);
        for (j = 0; j < over.length && clear > 0.004; j++) {
          layers = [];
          layersOf(over[j], x, y, layers);
          for (m = 0; m < layers.length && clear > 0.004; m++) {
            stack.push(layers[m]);
            clear *= 1 - Math.min(1, Math.max(0, layers[m][3]));
          }
        }
      }
      /* Nothing opaque the whole way down: what shows through is the canvas,
         and no page here paints it anything but white. */
      stack.push([255, 255, 255, 1]);
      var out = [stack[stack.length - 1][0], stack[stack.length - 1][1], stack[stack.length - 1][2]];
      for (i = stack.length - 2; i >= 0; i--) {
        a = Math.min(1, Math.max(0, stack[i][3]));
        out[0] = stack[i][0] * a + out[0] * (1 - a);
        out[1] = stack[i][1] * a + out[1] * (1 - a);
        out[2] = stack[i][2] * a + out[2] * (1 - a);
      }
      return out;
    }

    return {
      at: at,
      luminance: luminance,
      /* Which stroke reads better is not a matter of taste: white wins below
         about 0.18 and black above it, where the two contrast ratios cross.
         The margin either side is so that a grainy photograph, or a hand
         resting exactly on the join between two panels, does not flicker the
         pair back and forth. */
      isDark: function (l, was) { return l < (was ? 0.21 : 0.15); }
    };
  })();

  /* ---------- hand-drawn cursor ---------- */
  function initCursor() {
    if (!window.matchMedia) return;
    /* Only a device with a hovering pointer has a cursor to replace. Reduced
       motion no longer falls back to the system arrow: the chevron is drawn
       once and held still - no jitter, no press animation - so the page keeps
       one cursor everywhere without asking anyone to watch it move. */
    if (!matchMedia('(hover: hover)').matches) return;
    var still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (document.querySelector('.cursor-layer')) return;

    document.documentElement.classList.add('pfa-cursor');
    var layer = document.createElement('div');
    layer.className = 'cursor-layer';
    layer.setAttribute('aria-hidden', 'true');
    /* The chevron is one stroke over a wider casing of the opposite colour -
       the way every operating system has drawn its pointer for forty years,
       and for the same reason. The pair swaps with the surface: ink on a
       light one, bone on a dark one, so the chevron reads black on white and
       white on black exactly as asked. The casing is what makes that safe to
       automate. It is the state the reading did not choose, one thin ring of
       it, and it is why a reading that comes a frame late, or cannot be taken
       at all, costs a little contrast and never the pointer.
       Painted, never blended: a difference blend recoloured the letters
       underneath and read as though it were behind them. */
    layer.innerHTML = '<svg id="cursorSvg" width="40" height="40" viewBox="0 0 40 40">' +
      '<path id="cursorCase" d="" fill="none" stroke-width="6.4" stroke-linecap="round" stroke-linejoin="round"></path>' +
      '<path id="cursorPath" d="" fill="none" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
    document.body.appendChild(layer);
    var svg = layer.firstChild, casePath = svg.firstChild, path = svg.lastChild;

    var cx = -100, cy = -100, vis = false, down = false, raf = 0;
    function draw() {
      var j = 3.4, n = function () { return (Math.random() - 0.5) * 2 * j; };
      var pts = [[30 + n(), 4 + n()], [8 + n() * 0.6, 20 + n() * 0.5], [30 + n(), 36 + n()]];
      var th = 38 * Math.PI / 180, cos = Math.cos(th), sin = Math.sin(th), tip = pts[1];
      var d = 'M' + pts.map(function (p) {
        var dx = p[0] - tip[0], dy = p[1] - tip[1];
        return (dx * cos - dy * sin).toFixed(1) + ' ' + (dx * sin + dy * cos).toFixed(1);
      }).join('L');
      path.setAttribute('d', d);
      casePath.setAttribute('d', d);
    }

    /* Ink on a light surface, bone on a dark one. The light state is the
       stylesheet's own - no inline colour at all - so if this never runs, or
       runs and can read nothing, the chevron is exactly what assets/chrome.css
       draws rather than something half-applied. */
    var onDark = false, read = 0;
    function recolour() {
      read = Date.now();
      var rgb = surface.at(cx, cy, layer);
      if (!rgb) return;
      var dark = surface.isDark(surface.luminance(rgb), onDark);
      if (dark === onDark) return;
      onDark = dark;
      if (dark) {
        svg.style.setProperty('--cursor-ink', '#f2f0ec');
        svg.style.setProperty('--cursor-case', 'var(--deep,#0a0a0a)');
      } else {
        svg.style.removeProperty('--cursor-ink');
        svg.style.removeProperty('--cursor-case');
      }
    }
    /* Thirty-odd readings a second while the hand moves is far more than the
       eye needs and far less than the pointer's own frame rate: a gaming
       mouse reports moves faster than the screen refreshes, and a hit test
       per report would be paid on every one of them. */
    function reread() { if (vis && Date.now() - read >= 32) recolour(); }

    /* The top layer outranks every z-index there is: a modal <dialog> and
       its backdrop paint above this layer no matter the number on it, so the
       chevron was underneath the tracker's panel - invisible on the white, a
       ghost through the backdrop - while cursor:none still hid the real one.
       While any modal is open the chevron stands down and the stylesheet's
       :has rule hands the system pointer back. Checked on the same beats as
       the colour, so a dialog opened under a still hand is caught within a
       twelfth of a second too. */
    /* The chevron joins the top layer itself. A manual popover paints there
       - above modal dialogs - without taking focus, trapping anything or
       dimming the page, so the drawn cursor holds over the tracker's panel
       the same as everywhere else; standing it down for the system pointer
       was tried (v1.256) and rejected in about four hours flat. The top
       layer stacks by order of arrival, so when a dialog opens later it
       lands above the chevron: on the beat that notices, the layer steps
       out and back in, which moves it to the top again. Costs one
       hide/show per dialog opening, nothing per frame. Browsers without
       popovers keep v1.256's answer: the chevron stands down under a modal
       and the stylesheet's fallback rule hands the system pointer back. */
    var floats = typeof layer.showPopover === 'function';
    if (floats) {
      layer.setAttribute('popover', 'manual');
      try { layer.showPopover(); } catch (e) { floats = false; layer.removeAttribute('popover'); }
    }
    var modals = 0;
    function standDown() {
      var n = document.querySelectorAll('dialog[open]').length;
      if (n !== modals) {
        modals = n;
        if (floats) {
          if (n) { try { layer.hidePopover(); layer.showPopover(); } catch (e) {} }
        } else {
          svg.style.visibility = n ? 'hidden' : '';
        }
      }
      return !floats && n > 0;
    }
    function place() {
      raf = 0;
      svg.style.transform = 'translate(' + cx + 'px,' + cy + 'px) scale(' + (down && !still ? 0.82 : 1) + ')';
      if (!standDown()) reread();
    }
    function schedule() { if (!raf) raf = requestAnimationFrame(place); }

    draw();
    /* The jitter redraws only while the chevron is on screen and the tab is
       front: a background tab does no work at all. */
    if (!still) setInterval(function () { if (vis && !document.hidden) draw(); }, 130);
    /* The surface is read again on a heartbeat, not only when the pointer
       moves, because the surface moves too: a button inverting on hover, a
       drawer sliding open, a carousel advancing, a film playing, a section
       animating in on scroll. Reading only on hover is precisely how the
       first sampler came to sit black on black under a still hand. A
       reading is a hit test and a handful of style reads; at twelve a
       second, held to the front tab, it does not show up in a profile.
       This one runs whether or not motion is reduced: the chevron may be
       held still, but the page underneath it need not be. */
    setInterval(function () { if (vis && !document.hidden && !standDown()) recolour(); }, 80);
    /* A scroll changes everything under a hand that has not moved at all. */
    window.addEventListener('scroll', reread, { passive: true, capture: true });

    function hide() { vis = false; svg.style.opacity = '0'; }
    function show() { if (!vis) { vis = true; svg.style.opacity = '1'; } }

    /* Arriving on a page, the pointer sits still where the last click was,
       and no pointermove comes until the hand moves: without this, that is a
       moment with no cursor at all - the system one is off, the chevron has
       not been placed. The last known position is kept for the tab and the
       chevron is stood there at once. */
    try {
      var seed = JSON.parse(sessionStorage.getItem('pfa:cursor') || 'null');
      if (seed && seed.x >= 0 && seed.y >= 0 && seed.x <= innerWidth && seed.y <= innerHeight) {
        cx = seed.x; cy = seed.y; vis = true; svg.style.opacity = '1';
        schedule();
      }
    } catch (e) {}
    window.addEventListener('pagehide', function () {
      try { sessionStorage.setItem('pfa:cursor', JSON.stringify({ x: Math.round(cx), y: Math.round(cy) })); } catch (e) {}
    });
    window.addEventListener('pointermove', function (e) {
      /* A finger or pen on a touchscreen laptop is not a hovering pointer:
         no chevron under a fingertip, and no stale one left where it tapped. */
      if (e.pointerType && e.pointerType !== 'mouse') { hide(); return; }
      cx = e.clientX; cy = e.clientY;
      show();
      schedule();
    }, { passive: true });
    window.addEventListener('pointerdown', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse') { hide(); return; }
      down = true; schedule();
    });
    window.addEventListener('pointerup', function () { down = false; schedule(); });
    /* A drag the browser takes over (or an OS gesture) never sends pointerup;
       without this the chevron stays shrunken. */
    window.addEventListener('pointercancel', function () { down = false; schedule(); });
    /* An iframe's inside belongs to another document: no events arrive while
       the pointer is in there, and the frame draws its own system cursor. The
       chevron steps aside instead of freezing at the edge next to it, and the
       next pointermove back in this document stands it up again. */
    window.addEventListener('pointerout', function (e) {
      var to = e.relatedTarget;
      if (to && to.tagName === 'IFRAME') hide();
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', hide);
    /* Focus moving into an embed or away from the window: same story. */
    window.addEventListener('blur', hide);
    /* Full screen renders only the fullscreened element: a layer left in
       <body> disappears while cursor:none still holds, and the theatre's F
       key would cost the visitor the pointer. The layer follows the
       fullscreen element in, and comes home when it exits. A media element
       cannot host children that render, so native video full screen keeps
       its own UA cursor and the layer stays put. */
    function rehost() {
      var h = document.fullscreenElement || document.webkitFullscreenElement || document.body;
      if (!h || /^(VIDEO|AUDIO|IFRAME|OBJECT|EMBED)$/.test(h.tagName)) h = document.body;
      if (layer.parentNode !== h) {
        h.appendChild(layer);
        /* Moving a popover in the DOM closes it; step back into the top layer. */
        if (floats) { try { layer.hidePopover(); } catch (e) {} try { layer.showPopover(); } catch (e) {} }
        schedule();
      }
    }
    document.addEventListener('fullscreenchange', rehost);
    document.addEventListener('webkitfullscreenchange', rehost);

    /* A theatre can rest the chevron while a film has the screen and the
       hand is still - the way every player hides the pointer - and wake it
       on the next movement. Movement always wins: pointermove shows it. */
    function rest(on) {
      if (on) { svg.style.opacity = '0'; }
      else if (vis) { svg.style.opacity = '1'; }
    }

    return {
      /* A page that repaints under a still pointer need not call this - the
         heartbeat catches it within a twelfth of a second - but a page that
         knows the exact moment can have the answer in the same frame. */
      recolour: function () { if (vis) { recolour(); schedule(); } },
      rest: rest
    };
  }
  var cursorApi = initCursor() || {};
  var recolourCursor = cursorApi.recolour || function () {};

  initAnnouncement();
  measure();
  window.addEventListener('resize', measure);
  window.addEventListener('load', measure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure).catch(function () {});

  /* A page that adds or removes something from the header (a cart count going
     from 0 to 1 changes nothing in height, but a wrapped nav does) can ask for
     a re-measure without reaching into this file. */
  window.PFA_CHROME = { measure: measure, closeAnnouncement: closeBar, recolourCursor: recolourCursor, restCursor: cursorApi.rest || function () {} };
})();

/* ---------- visit tally ------------------------------------------------
   A real number from /api/visits. One visit per browser session, not per page
   view, so reading six pages counts once: that is what "visits" means and it is
   what keeps the write count inside Firestore's free allowance.

   Nothing is shown until the server answers. If it never does, the block stays
   hidden rather than displaying a zero or a number we made up. */
(function () {
  'use strict';
  /* This file is loaded in the header, long before the footer markup exists, so
     the counter has to wait for the document rather than look for itself now. */
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }
  ready(function () {
  var wrap = document.getElementById('pfaTally');
  var odo = document.getElementById('pfaTallyOdo');
  if (!wrap || !odo || !window.fetch) return;

  var KEY = 'pfa_visit_counted';
  var shown = null;

  function group(n) {
    /* Indian grouping: 12,34,567 */
    var s = String(n);
    if (s.length <= 3) return s;
    var last = s.slice(-3), rest = s.slice(0, -3);
    return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last;
  }

  function build(text) {
    odo.innerHTML = '';
    text.split('').forEach(function (ch) {
      if (ch === ',') {
        var sep = document.createElement('span');
        sep.className = 'pfa-tally__sep';
        sep.textContent = ',';
        odo.appendChild(sep);
        return;
      }
      var cell = document.createElement('span');
      cell.className = 'pfa-tally__d';
      var strip = document.createElement('span');
      strip.className = 'pfa-tally__strip';
      for (var d = 0; d <= 9; d += 1) {
        var one = document.createElement('span');
        one.textContent = String(d);
        strip.appendChild(one);
      }
      cell.appendChild(strip);
      odo.appendChild(cell);
    });
  }

  function roll(text, animate) {
    var cells = odo.querySelectorAll('.pfa-tally__d');
    var digits = text.replace(/,/g, '').split('');
    cells.forEach(function (cell, i) {
      var strip = cell.querySelector('.pfa-tally__strip');
      var d = Number(digits[i] || 0);
      /* each cell is 1.16em tall, so digit n sits at -n * 1.16em */
      var move = function () { strip.style.transform = 'translateY(' + (-d * 1.16) + 'em)'; };
      if (!animate) { strip.style.transition = 'none'; move(); strip.offsetHeight; strip.style.transition = ''; return; }
      /* stagger from the right so the number settles like a real odometer */
      setTimeout(move, (cells.length - i - 1) * 55);
    });
  }

  function show(total) {
    if (typeof total !== 'number' || !isFinite(total) || total < 0) return;
    var text = group(total);
    var first = shown === null;
    if (first || text.length !== odo.querySelectorAll('.pfa-tally__d, .pfa-tally__sep').length) build(text);
    wrap.hidden = false;
    if (first) {
      /* start every wheel at 0 and let it climb to the real figure once */
      roll(text.replace(/\d/g, '0'), false);
      setTimeout(function () { roll(text, true); }, 90);
    } else {
      roll(text, true);
      var cells = odo.querySelectorAll('.pfa-tally__d');
      var last = cells[cells.length - 1];
      if (last) { last.classList.add('is-hot'); setTimeout(function () { last.classList.remove('is-hot'); }, 1400); }
    }
    shown = total;
  }

  var counted;
  try { counted = window.sessionStorage.getItem(KEY) === '1'; } catch (e) { counted = false; }

  fetch('/api/visits', { method: counted ? 'GET' : 'POST', headers: { Accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (p) {
      if (!p || typeof p.total !== 'number') return;
      try { window.sessionStorage.setItem(KEY, '1'); } catch (e) {}
      show(p.total);
    })
    .catch(function () { /* stay hidden */ });
  });
})();
