/* The PFA reader's original pages: a document's own PDF, drawn page by page
   with pdf.js (assets/vendor/pdfjs/, the legacy build, renamed .js so the
   deploy keeps it). Loaded by assets/reader.js only when a document is
   opened as its original pages, so the reading text never pays for it.

   Pages are placeholders until they come near the screen, then drawn at the
   screen's resolution with a transparent text layer over them, so the text
   can be selected and search hits can be marked where they are printed.
   Pages far from the reader are let go again, so a long report does not
   hold two hundred canvases. The paper colour is a CSS filter on the
   canvas (assets/reader.css, --rd-page-filter); the page itself is never
   altered. */
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
      /* Range requests only: a 50 MB report opens on the pages being read
         rather than after the whole file has crossed a phone connection. */
      var task = pdfjs.getDocument({ url: o.url, wasmUrl: BASE + 'wasm/', isEvalSupported: false, enableXfa: false, disableAutoFetch: true, disableStream: true });
      return task.promise.then(function (doc) {
        return doc.getPage(1).then(function (first) {
          return viewer(pdfjs, task, doc, first, o);
        });
      });
    });
  }

  function viewer(pdfjs, task, doc, first, o) {
    var total = doc.numPages;
    var box = o.container;
    var scroller = o.scroller;
    var zoom = o.zoom || 1;
    var vp1 = first.getViewport({ scale: 1 });
    var holders = [];
    var drawn = {};        // page -> { canvas, layer, divs, offsets, width }
    var busy = {};
    var texts = {};        // page -> { text, offsets, strs }
    var current = 1;
    var hitQuery = '';
    var hitList = [];
    var hitOn = null;
    var destroyed = false;

    box.innerHTML = '';
    box.hidden = false;
    for (var p = 1; p <= total; p++) {
      var h = document.createElement('div');
      h.className = 'rd-pg';
      h.setAttribute('data-p', String(p));
      h.style.setProperty('--pg-ar', String(vp1.width / vp1.height));
      var label = document.createElement('span');
      label.className = 'rd-pg__n';
      label.textContent = String(p);
      h.appendChild(label);
      box.appendChild(h);
      holders.push(h);
    }

    function baseWidth() {
      var w = scroller.clientWidth - (scroller.clientWidth < 720 ? 16 : 64);
      return Math.max(240, Math.min(w, 880));
    }
    function sizeAll() { box.style.setProperty('--pg-w', Math.round(baseWidth() * zoom) + 'px'); }
    sizeAll();

    function draw(n) {
      if (destroyed || busy[n]) return;
      var holder = holders[n - 1];
      var cssW = holder.clientWidth;
      if (drawn[n] && drawn[n].width === cssW) return;
      busy[n] = true;
      doc.getPage(n).then(function (page) {
        if (destroyed) return null;
        var v1 = page.getViewport({ scale: 1 });
        holder.style.setProperty('--pg-ar', String(v1.width / v1.height));
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
            if (destroyed) return;
            if (drawn[n]) release(n);
            holder.insertBefore(canvas, holder.firstChild);
            holder.appendChild(layer);
            var t = texts[n] || pageText(content);
            texts[n] = t;
            drawn[n] = { canvas: canvas, layer: layer, divs: tl.textDivs, width: cssW };
            markPage(n);
            trim();
          });
        });
      }).catch(function () {}).then(function () { busy[n] = false; });
    }

    function release(n) {
      var d = drawn[n];
      if (!d) return;
      if (d.canvas.parentNode) d.canvas.parentNode.removeChild(d.canvas);
      if (d.layer.parentNode) d.layer.parentNode.removeChild(d.layer);
      d.canvas.width = 0;
      d.canvas.height = 0;
      delete drawn[n];
    }

    /* keep the dozen pages nearest the reader, let the rest go */
    function trim() {
      var keys = Object.keys(drawn).map(Number);
      if (keys.length <= 12) return;
      keys.sort(function (a, b) { return Math.abs(b - current) - Math.abs(a - current); });
      for (var i = 0; i < keys.length - 12; i++) release(keys[i]);
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) draw(Number(e.target.getAttribute('data-p'))); });
    }, { root: scroller, rootMargin: '120% 0px' });
    holders.forEach(function (h) { io.observe(h); });

    function pageAtView() {
      var line = scroller.scrollTop + scroller.clientHeight * 0.33;
      var lo = 0;
      var hi = holders.length - 1;
      while (lo < hi) {
        var mid = (lo + hi + 1) >> 1;
        if (holders[mid].offsetTop <= line) lo = mid; else hi = mid - 1;
      }
      return lo + 1;
    }

    var tick = 0;
    function onScroll() {
      if (tick) return;
      tick = requestAnimationFrame(function () {
        tick = 0;
        var p = pageAtView();
        if (p !== current) { current = p; if (o.onPage) o.onPage(current, total); }
      });
      if (o.onScroll) o.onScroll();
    }
    scroller.addEventListener('scroll', onScroll, { passive: true });

    var resizeTimer = 0;
    function onResize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { var p = current; sizeAll(); goToPage(p); redrawVisible(); }, 180);
    }
    window.addEventListener('resize', onResize);

    function goToPage(n, offset) {
      n = Math.max(1, Math.min(total, Math.round(n) || 1));
      var h = holders[n - 1];
      scroller.scrollTop = h.offsetTop - (scroller.clientWidth < 720 ? 62 : 76) + (offset || 0);
      current = n;
      if (o.onPage) o.onPage(current, total);
      draw(n);
    }

    function redrawVisible() {
      var keys = Object.keys(drawn).map(Number);
      keys.forEach(function (k) { if (Math.abs(k - current) <= 2) draw(k); else release(k); });
      draw(current);
    }

    function setZoom(z) {
      var p = current;
      var h = holders[p - 1];
      var within = h ? (scroller.scrollTop - h.offsetTop) / (h.clientHeight || 1) : 0;
      zoom = z;
      sizeAll();
      var nh = holders[p - 1];
      scroller.scrollTop = nh.offsetTop + within * nh.clientHeight;
      redrawVisible();
    }

    /* ---- text, for search ---- */
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

    function search(q) {
      q = norm(q);
      var out = [];
      var n = 1;
      function step() {
        if (destroyed || n > total || out.length >= 1000) return Promise.resolve(out);
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
      hitQuery = q;
      return step().then(function (res) { hitList = res; Object.keys(drawn).forEach(function (k) { markPage(Number(k)); }); return res; });
    }

    function unmark(n) {
      var d = drawn[n];
      if (!d) return;
      var marks = d.layer.querySelectorAll('mark.rd-hit');
      for (var i = 0; i < marks.length; i++) {
        var mk = marks[i];
        var parent = mk.parentNode;
        while (mk.firstChild) parent.insertBefore(mk.firstChild, mk);
        parent.removeChild(mk);
        parent.normalize();
      }
    }

    function markPage(n) {
      var d = drawn[n];
      var t = texts[n];
      if (!d || !t) return;
      unmark(n);
      if (!hitQuery) return;
      var mine = hitList.filter(function (h) { return h.page === n; });
      mine.forEach(function (h) {
        var a = h.start;
        var b = h.start + h.len;
        var on = hitOn && hitOn.page === n && hitOn.start === h.start;
        for (var k = t.offsets.length - 1; k >= 0; k--) {
          var s = t.offsets[k];
          var e = s + t.strs[k].length;
          if (e <= a || s >= b) continue;
          var div = d.divs[k];
          var node = div && div.firstChild;
          if (!node || node.nodeType !== 3) continue;
          var r = document.createRange();
          r.setStart(node, Math.max(0, a - s));
          r.setEnd(node, Math.min(node.nodeValue.length, b - s));
          var mk = document.createElement('mark');
          mk.className = 'rd-hit' + (on ? ' is-on' : '');
          try { r.surroundContents(mk); } catch (err) {}
        }
      });
    }

    function jump(h) {
      hitOn = h;
      goToPage(h.page);
      var tries = 0;
      (function settle() {
        var d = drawn[h.page];
        if (!d && tries++ < 40) { setTimeout(settle, 60); return; }
        markPage(h.page);
        var mk = d && d.layer.querySelector('mark.rd-hit.is-on');
        if (mk) {
          var r = mk.getBoundingClientRect();
          scroller.scrollTop += r.top - scroller.clientHeight * 0.4;
        }
      }());
    }

    function clearHits() {
      hitQuery = '';
      hitList = [];
      hitOn = null;
      Object.keys(drawn).forEach(function (k) { unmark(Number(k)); });
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
                if (idx !== null && it.title) out.push({ t: String(it.title).trim(), l: level, p: idx + 1 });
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

    function destroy() {
      destroyed = true;
      io.disconnect();
      scroller.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      Object.keys(drawn).forEach(function (k) { release(Number(k)); });
      box.innerHTML = '';
      task.destroy();
    }

    goToPage(o.startPage || 1);
    return { total: total, goToPage: goToPage, setZoom: setZoom, search: search, jump: jump, clearHits: clearHits, outline: outline, destroy: destroy };
  }

  window.PFA_READER_PDF = { open: open };
}());
