/* The PFA reader's pages: a document's own PDF, drawn with pdf.js
   (assets/vendor/pdfjs/, the legacy build, renamed .js so the deploy keeps
   it). Loaded by assets/reader.js.

   Two ways to read it:

     paged    one page, or two side by side like an open book, fitted to the
              screen and turned like pages; the next and previous are drawn
              ahead, so a turn is instant
     scroll   every page down one long column, drawn as it comes near the
              screen and let go again when far from it

   Each page is a canvas at the screen's resolution with a transparent text
   layer over it, so text can be selected and search hits marked where they
   are printed. The paper colour is a CSS filter on the canvas (reader.css,
   --rd-page-filter); the page itself is never altered. Range requests only:
   a 50 MB report opens on the page being read, not after the whole file. */
(function () {
  'use strict';

  var BASE = new URL('assets/vendor/pdfjs/', document.baseURI).href;
  var libPromise = null;

  function lib() {
    if (!libPromise) {
      libPromise = import(BASE + 'pdf.min.js').then(function (pdfjs) {
        pdfjs.GlobalWorkerOptions.workerSrc = BASE + 'pdf.worker.min.js';
        return pdfjs;
      });
    }
    return libPromise;
  }

  function norm(s) {
    return String(s || '').toLowerCase().replace(/[\u2018\u2019\u02BC]/g, "'").replace(/[\u201C\u201D]/g, '"');
  }

  function open(o) {
    return lib().then(function (pdfjs) {
      var task = pdfjs.getDocument({ url: o.url, wasmUrl: BASE + 'wasm/', isEvalSupported: false, enableXfa: false, disableAutoFetch: true, disableStream: true });
      return task.promise.then(function (doc) {
        return doc.getPage(1).then(function (first) { return viewer(pdfjs, task, doc, first, o); });
      });
    });
  }

  function viewer(pdfjs, task, doc, first, o) {
    var total = doc.numPages;
    var box = o.container;
    var layout = o.layout === 'scroll' ? 'scroll' : 'paged';
    var spread = o.spread === 2 ? 2 : 1;
    var zoom = o.zoom || 1;
    var current = 1;
    var destroyed = false;
    var one = first.getViewport({ scale: 1 });
    var sizes = {};            // page -> { w, h } at scale 1
    sizes[1] = { w: one.width, h: one.height };
    var texts = {};            // page -> { text, offsets, strs } for search
    var drawn = [];            // { n, holder, canvas, layer, divs }
    var hitQuery = '';
    var hitList = [];
    var hitOn = null;

    function phone() { return box.clientWidth < 720; }
    function sizeOf(n) {
      if (sizes[n]) return Promise.resolve(sizes[n]);
      return doc.getPage(n).then(function (p) { var v = p.getViewport({ scale: 1 }); sizes[n] = { w: v.width, h: v.height }; return sizes[n]; });
    }

    /* ---- drawing one page ------------------------------------------------ */
    function draw(holder, n, cssW) {
      var key = String(Math.round(cssW));
      if (holder.getAttribute('data-w') === key) return Promise.resolve();
      holder.setAttribute('data-w', key);
      return doc.getPage(n).then(function (page) {
        if (destroyed) return null;
        var v1 = page.getViewport({ scale: 1 });
        var scale = cssW / v1.width;
        var ratio = Math.min(window.devicePixelRatio || 1, 2);
        var vp = page.getViewport({ scale: scale * ratio });
        var canvas = document.createElement('canvas');
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        canvas.setAttribute('aria-hidden', 'true');
        return page.render({ canvasContext: canvas.getContext('2d', { alpha: false }), viewport: vp }).promise.then(function () {
          return page.getTextContent();
        }).then(function (content) {
          var layer = document.createElement('div');
          layer.className = 'textLayer';
          layer.style.setProperty('--total-scale-factor', String(scale));
          layer.style.setProperty('--scale-round-x', '1px');
          layer.style.setProperty('--scale-round-y', '1px');
          var tl = new pdfjs.TextLayer({ textContentSource: content, container: layer, viewport: page.getViewport({ scale: scale }) });
          return tl.render().then(function () {
            if (destroyed || holder.getAttribute('data-w') !== key) return;
            release(holder);
            holder.insertBefore(canvas, holder.firstChild);
            holder.appendChild(layer);
            texts[n] = texts[n] || pageText(content);
            var rec = { n: n, holder: holder, canvas: canvas, layer: layer, divs: tl.textDivs };
            drawn.push(rec);
            markRec(rec);
          });
        });
      }).catch(function () { holder.removeAttribute('data-w'); });
    }

    function release(holder) {
      for (var i = drawn.length - 1; i >= 0; i--) {
        var d = drawn[i];
        if (d.holder !== holder) continue;
        if (d.canvas.parentNode) d.canvas.parentNode.removeChild(d.canvas);
        if (d.layer.parentNode) d.layer.parentNode.removeChild(d.layer);
        d.canvas.width = 0;
        d.canvas.height = 0;
        drawn.splice(i, 1);
      }
    }

    function holderFor(n) {
      var h = document.createElement('div');
      h.className = 'rd-pg';
      h.setAttribute('data-p', String(n));
      var label = document.createElement('span');
      label.className = 'rd-pg__n';
      label.textContent = String(n);
      h.appendChild(label);
      return h;
    }

    function report() { if (o.onPage) o.onPage(current, total, lastShown()); }

    /* ---- paged: a page or a spread, fitted ---------------------------------- */
    var leaves = {};           // first page of a spread -> { el, ready }
    var leaf = null;

    function startOf(n) {
      n = Math.max(1, Math.min(total, n));
      if (spread === 1 || n === 1) return n;
      return n % 2 === 0 ? n : n - 1;
    }
    function pagesOf(start) {
      if (spread === 1 || start === 1) return [start];
      return start + 1 <= total ? [start, start + 1] : [start];
    }
    function nextStart(start) { return spread === 1 ? start + 1 : (start === 1 ? 2 : start + 2); }
    function prevStart(start) { return spread === 1 ? start - 1 : (start <= 3 ? 1 : start - 2); }
    function lastShown() {
      if (layout === 'scroll') return current;
      var ps = pagesOf(startOf(current));
      return ps[ps.length - 1];
    }

    function buildLeaf(start) {
      if (leaves[start]) return leaves[start].ready;
      var el = document.createElement('div');
      var ps = pagesOf(start);
      el.className = 'rd-leaf' + (ps.length > 1 ? ' rd-leaf--spread' : '');
      el.setAttribute('data-start', String(start));
      var entry = { el: el, ready: null };
      leaves[start] = entry;
      entry.ready = Promise.all(ps.map(sizeOf)).then(function (dims) {
        var pad = phone() ? 8 : 20;
        var availW = Math.max(120, box.clientWidth - pad * 2);
        var availH = Math.max(160, box.clientHeight - pad * 2);
        var sumW = dims.reduce(function (a, d) { return a + d.w; }, 0);
        var maxH = dims.reduce(function (a, d) { return Math.max(a, d.h); }, 0);
        var s = Math.min(availW / sumW, availH / maxH) * zoom;
        return Promise.all(ps.map(function (n, k) {
          var h = holderFor(n);
          h.style.width = Math.round(dims[k].w * s) + 'px';
          h.style.height = Math.round(dims[k].h * s) + 'px';
          el.appendChild(h);
          return draw(h, n, dims[k].w * s);
        }));
      }).then(function () { return el; });
      return entry.ready;
    }

    function evict(keep) {
      Object.keys(leaves).forEach(function (k) {
        if (keep.indexOf(Number(k)) > -1) return;
        var e = leaves[k];
        Array.prototype.forEach.call(e.el.querySelectorAll('.rd-pg'), release);
        if (e.el.parentNode) e.el.parentNode.removeChild(e.el);
        delete leaves[k];
      });
    }

    var showing = 0;
    function show(start, dir) {
      start = startOf(start);
      var ticket = ++showing;
      current = start;
      report();
      return buildLeaf(start).then(function (el) {
        if (destroyed || ticket !== showing) return;
        if (leaf && leaf !== el && leaf.parentNode) leaf.parentNode.removeChild(leaf);
        el.classList.remove('is-in-next', 'is-in-prev');
        if (dir) { void el.offsetWidth; el.classList.add(dir > 0 ? 'is-in-next' : 'is-in-prev'); }
        if (el.parentNode !== box) box.appendChild(el);
        leaf = el;
        box.scrollTop = 0;
        box.scrollLeft = Math.max(0, (box.scrollWidth - box.clientWidth) / 2);
        var ahead = [start];
        var nx = nextStart(start);
        var pv = prevStart(start);
        if (nx <= total) ahead.push(nx);
        if (pv >= 1 && pv !== start) ahead.push(pv);
        evict(ahead);
        ahead.slice(1).forEach(function (s) { buildLeaf(s); });
      });
    }

    /* ---- scroll: every page down a column ---------------------------------- */
    var holders = [];
    var io = null;

    function baseWidth() {
      var w = box.clientWidth - (phone() ? 16 : 64);
      return Math.max(240, Math.min(w, 880));
    }

    function buildColumn() {
      holders = [];
      var col = document.createElement('div');
      col.className = 'rd-column';
      col.style.setProperty('--pg-w', Math.round(baseWidth() * zoom) + 'px');
      for (var p = 1; p <= total; p++) {
        var h = holderFor(p);
        h.style.setProperty('--pg-ar', String(one.width / one.height));
        col.appendChild(h);
        holders.push(h);
      }
      box.appendChild(col);
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          var n = Number(e.target.getAttribute('data-p'));
          sizeOf(n).then(function (d) {
            e.target.style.setProperty('--pg-ar', String(d.w / d.h));
            draw(e.target, n, e.target.clientWidth);
          });
        });
        trimColumn();
      }, { root: box, rootMargin: '120% 0px' });
      holders.forEach(function (h) { io.observe(h); });
    }

    /* keep the dozen pages nearest the reader, let the rest go */
    function trimColumn() {
      if (drawn.length <= 12) return;
      drawn.slice().sort(function (a, b) { return Math.abs(b.n - current) - Math.abs(a.n - current); })
        .slice(0, drawn.length - 12)
        .forEach(function (d) { d.holder.removeAttribute('data-w'); release(d.holder); });
    }

    function pageAtView() {
      var line = box.scrollTop + box.clientHeight * 0.33;
      var lo = 0;
      var hi = holders.length - 1;
      while (lo < hi) {
        var mid = (lo + hi + 1) >> 1;
        if (holders[mid].offsetTop <= line) lo = mid; else hi = mid - 1;
      }
      return lo + 1;
    }

    function scrollTo(n) {
      var h = holders[n - 1];
      if (!h) return;
      box.scrollTop = Math.max(0, h.offsetTop - holders[0].offsetTop);
      current = n;
      report();
    }

    var tick = 0;
    function onScroll() {
      if (layout === 'scroll' && !tick) {
        tick = requestAnimationFrame(function () {
          tick = 0;
          var p = pageAtView();
          if (p !== current) { current = p; report(); }
        });
      }
      if (o.onScroll) o.onScroll();
    }
    box.addEventListener('scroll', onScroll, { passive: true });

    /* ---- switching, sizing, resizing --------------------------------------- */
    function clear() {
      if (io) { io.disconnect(); io = null; }
      drawn.slice().forEach(function (d) { release(d.holder); });
      leaves = {};
      leaf = null;
      holders = [];
      box.innerHTML = '';
    }

    function render(at) {
      clear();
      box.classList.toggle('is-scroll', layout === 'scroll');
      box.classList.toggle('is-paged', layout === 'paged');
      if (layout === 'scroll') {
        buildColumn();
        requestAnimationFrame(function () { scrollTo(at); });
        return Promise.resolve();
      }
      return show(at, 0);
    }

    var resizeTimer = 0;
    function onResize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { render(current); }, 180);
    }
    window.addEventListener('resize', onResize);

    /* ---- search: the text of every page, matched and marked ----------------- */
    function pageText(content) {
      var strs = [];
      var offsets = [];
      var text = '';
      content.items.forEach(function (it) {
        if (typeof it.str !== 'string') return;
        offsets.push(text.length);
        strs.push(it.str);
        text += it.str + (it.hasEOL ? ' ' : '');
      });
      return { text: text.replace(/\s+$/, ''), offsets: offsets, strs: strs };
    }

    function textOf(n) {
      if (texts[n]) return Promise.resolve(texts[n]);
      return doc.getPage(n).then(function (page) { return page.getTextContent(); }).then(function (c) {
        texts[n] = pageText(c);
        return texts[n];
      });
    }

    var searching = 0;
    function search(q) {
      q = norm(q);
      var out = [];
      var n = 1;
      var ticket = ++searching;
      function step() {
        if (destroyed || ticket !== searching || n > total || out.length >= 1000) return Promise.resolve(out);
        var batch = [];
        for (var k = 0; k < 8 && n <= total; k++, n++) batch.push(textOf(n).then((function (page) {
          return function (t) { return { page: page, t: t }; };
        }(n))));
        return Promise.all(batch).then(function (rows) {
          rows.forEach(function (row) {
            var low = norm(row.t.text);
            var at = low.indexOf(q);
            var nth = 0;
            while (at > -1 && out.length < 1000) {
              out.push({ page: row.page, start: at, len: q.length, nth: nth++, text: row.t.text });
              at = low.indexOf(q, at + q.length);
            }
          });
          return step();
        });
      }
      return step().then(function (res) {
        if (ticket === searching) { hitQuery = q; hitList = res; drawn.forEach(markRec); }
        return res;
      });
    }

    function unmark(rec) {
      var marks = rec.layer.querySelectorAll('mark.rd-hit');
      for (var i = 0; i < marks.length; i++) {
        var mk = marks[i];
        var parent = mk.parentNode;
        while (mk.firstChild) parent.insertBefore(mk.firstChild, mk);
        parent.removeChild(mk);
        parent.normalize();
      }
    }

    function markRec(rec) {
      unmark(rec);
      var t = texts[rec.n];
      if (!hitQuery || !t) return;
      hitList.filter(function (h) { return h.page === rec.n; }).forEach(function (h) {
        var a = h.start;
        var b = h.start + h.len;
        var on = hitOn && hitOn.page === rec.n && hitOn.start === h.start;
        for (var k = t.offsets.length - 1; k >= 0; k--) {
          var s = t.offsets[k];
          var e = s + t.strs[k].length;
          if (e <= a || s >= b) continue;
          var div = rec.divs[k];
          var node = div && div.firstChild;
          if (!node || node.nodeType !== 3) continue;
          var r = document.createRange();
          r.setStart(node, Math.max(0, a - s));
          r.setEnd(node, Math.min(node.nodeValue.length, b - s));
          var mk = document.createElement('mark');
          mk.className = 'rd-hit' + (on ? ' is-on' : '');
          try { r.surroundContents(mk); } catch (err) { /* a hit across odd markup stays unmarked */ }
        }
      });
    }

    function jump(h) {
      hitOn = h;
      goToPage(h.page);
      var tries = 0;
      (function settle() {
        var rec = null;
        drawn.forEach(function (d) { if (d.n === h.page && box.contains(d.holder)) rec = d; });
        if (!rec && tries++ < 50) { setTimeout(settle, 60); return; }
        if (!rec) return;
        markRec(rec);
        var mk = rec.layer.querySelector('mark.rd-hit.is-on');
        if (mk) {
          var r = mk.getBoundingClientRect();
          var b = box.getBoundingClientRect();
          if (r.top < b.top + 20 || r.bottom > b.bottom - 20) box.scrollTop += r.top - b.top - box.clientHeight * 0.4;
        }
      }());
    }

    function clearHits() {
      hitQuery = '';
      hitList = [];
      hitOn = null;
      drawn.forEach(unmark);
    }

    function outline() {
      return doc.getOutline().then(function (items) {
        var out = [];
        function walk(list, level) {
          var chain = Promise.resolve();
          (list || []).forEach(function (it) {
            chain = chain.then(function () {
              var dest = it.dest;
              return (typeof dest === 'string' ? doc.getDestination(dest) : Promise.resolve(dest)).then(function (d) {
                return Array.isArray(d) && d[0] ? doc.getPageIndex(d[0]) : null;
              }).then(function (idx) {
                var title = String(it.title || '').trim();
                if (idx !== null && title && /\p{L}{2}/u.test(title) && !/\.(pdf|docx?)$/i.test(title) && !/^page\s*\d+$/i.test(title)) out.push({ t: title, l: level, p: idx + 1 });
                if (it.items && it.items.length && level < 2) return walk(it.items, level + 1);
                return null;
              }).catch(function () {});
            });
          });
          return chain;
        }
        return walk(items, 1).then(function () { return out; });
      }).catch(function () { return []; });
    }

    /* ---- the controls ------------------------------------------------------ */
    function goToPage(n) {
      n = Math.max(1, Math.min(total, Math.round(n) || 1));
      if (layout === 'scroll') scrollTo(n);
      else show(n, n > current ? 1 : (n < current ? -1 : 0));
    }
    function next() {
      if (layout === 'scroll') { if (current >= total) return false; scrollTo(current + 1); return true; }
      var nx = nextStart(startOf(current));
      if (nx > total) return false;
      show(nx, 1);
      return true;
    }
    function prev() {
      if (layout === 'scroll') { if (current <= 1) return false; scrollTo(current - 1); return true; }
      var start = startOf(current);
      if (start <= 1) return false;
      show(prevStart(start), -1);
      return true;
    }
    /* zoom, layout and spread at once, so a change draws the pages once */
    function configure(c) {
      if (c.zoom) zoom = c.zoom;
      if (c.layout) layout = c.layout === 'scroll' ? 'scroll' : 'paged';
      if (c.spread) spread = c.spread === 2 ? 2 : 1;
      return render(current);
    }
    /* whether the view is bigger than the screen, so the wheel and a swipe move it */
    function overflowing() { return box.scrollHeight > box.clientHeight + 2 || box.scrollWidth > box.clientWidth + 2; }

    function destroy() {
      destroyed = true;
      clear();
      box.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      task.destroy();
    }

    render(Math.max(1, Math.min(total, o.startPage || 1)));
    return {
      total: total,
      page: function () { return current; },
      goToPage: goToPage, next: next, prev: prev,
      configure: configure, overflowing: overflowing,
      search: search, jump: jump, clearHits: clearHits, outline: outline, destroy: destroy
    };
  }

  window.PFA_READER_PDF = { open: open };
}());
