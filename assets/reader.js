/* The PFA reader: read.html?r=<slug>.

   Opens one document from window.PFA_LIBRARY in the best form there is:

     text    the reading edition (media/library/<slug>.json, written by
             scripts/build-library.js): the document's own words set in the
             reader's type, turned like pages or scrolled, at any size
     pages   the original PDF (media/library/<slug>.pdf) drawn page by page
             by pdf.js, for scans, tables and pictures, or by choice
     drive   neither is on this site yet: Google Drive's viewer, inside the
             same quiet frame, with Download going to Drive

   The place is kept as a block of the edition and a character within it,
   so it survives a new font, a new size, a turned phone or another visit.
   It is saved in this browser only (localStorage, pfa:library:v1), which is
   also what library.html reads for Continue reading. Settings are kept
   apart (pfa:library:settings) because they belong to the reader, not to
   the document.

   Paging is CSS columns: the section being read is laid out as a row of
   page-sized columns and moved sideways one page at a time. Only one
   section is laid out at once, so a two-hundred-page report turns as
   lightly as a pamphlet. */
(function () {
  'use strict';

  var LIB = window.PFA_LIBRARY || { shelves: [], items: [] };
  var PROGRESS_KEY = 'pfa:library:v1';
  var SETTINGS_KEY = 'pfa:library:settings';
  var SIZES = [14, 15, 16, 17, 18, 19, 20, 22, 24, 27, 30];
  var ZOOMS = [0.6, 0.7, 0.8, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2, 2.5];
  var LINES = { tight: 1.42, normal: 1.62, loose: 1.86 };
  var PARAS = { book: '0', normal: '.8em', open: '1.4em' };
  var MEASURE = { narrow: 37, medium: 32.5, wide: 28 }; // the line, in ems of the reading size
  var SIDE = { narrow: 16, medium: 24, wide: 34 };      // the side margin on a phone, px
  var DEFAULTS = { theme: 'light', font: 'serif', size: 5, zoom: 4, line: 'normal', para: 'normal', margin: 'medium', align: 'left', cols: 1, flow: 'paged' };
  var PAPER = { light: '#faf8f4', sepia: '#f4ecda', dark: '#161514' };
  var WPM = 230;
  var CHARS_PER_WORD = 5.7;

  var root = document.documentElement;
  var body = document.body;
  function $(id) { return document.getElementById(id); }
  var stage = $('rdStage');
  var frame = $('rdFrame');
  var text = $('rdText');
  var pagesEl = $('rdPages');

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  /* ---------------------------------------------------------------------
     storage: every read and write may fail (private windows, blocked
     storage), and the reader must work the same without it
     --------------------------------------------------------------------- */
  function readJSON(key, fallback) {
    try {
      var raw = window.localStorage && window.localStorage.getItem(key);
      var v = raw ? JSON.parse(raw) : null;
      return v && typeof v === 'object' ? v : fallback;
    } catch (e) { return fallback; }
  }
  function writeJSON(key, value) {
    try { if (window.localStorage) window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  var settings = (function () {
    var s = readJSON(SETTINGS_KEY, {});
    var out = {};
    for (var k in DEFAULTS) out[k] = s[k] !== undefined ? s[k] : DEFAULTS[k];
    if (!s.theme && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) out.theme = 'dark';
    if (s.size === undefined && window.innerWidth < 720) out.size = 4;
    out.size = clamp(Number(out.size) || 0, 0, SIZES.length - 1);
    out.zoom = clamp(Number(out.zoom) || 0, 0, ZOOMS.length - 1);
    out.cols = Number(out.cols) === 2 ? 2 : 1;
    out.hinted = !!s.hinted;
    return out;
  }());
  function saveSettings() { writeJSON(SETTINGS_KEY, settings); }

  function loadProgress() {
    var p = readJSON(PROGRESS_KEY, null);
    if (!p || typeof p.items !== 'object' || !p.items) p = { last: null, items: {} };
    return p;
  }

  /* ---------------------------------------------------------------------
     the document
     --------------------------------------------------------------------- */
  var slug = new URLSearchParams(location.search).get('r') || '';
  var item = null;
  for (var n = 0; n < LIB.items.length; n++) if (LIB.items[n].slug === slug) item = LIB.items[n];
  var shelf = null;
  if (item) for (var m = 0; m < LIB.shelves.length; m++) if (LIB.shelves[m].id === item.shelf) shelf = LIB.shelves[m];
  var downloadHref = item ? (item.file || 'https://drive.google.com/uc?export=download&id=' + encodeURIComponent(item.drive)) : 'library.html';

  var mode = 'loading';
  var ed = null;           // the edition
  var blocks = [];
  var charStart = [];      // characters before each block, for progress and search
  var totalChars = 1;
  var chunks = [];         // [{from, to}] the sections laid out one at a time
  var toc = [];            // [{t, l, b, p}]
  var lowered = null;      // lower-cased block texts, built on the first search
  var layout = { stride: 1, frameW: 640, colW: 640, gap: 48, two: false };
  var cur = { chunk: -1, page: 0, pages: 1 };
  var pos = { i: -1, c: 0 };
  var pdf = null;          // the original-pages engine, once loaded
  var pdfPage = 1;
  var pdfTotal = item && item.pages ? item.pages : 0;
  var returnPos = null;    // where the reader was before jumping to a search result
  var hits = [];
  var panel = null;        // { el, trigger }

  function blockText(b) {
    if (!b) return '';
    if (b[0] === 'table') return b[1].map(function (r) { return r.join(' '); }).join(' ');
    if (b[0] === 'fig') return '';
    return String(b[1] || '');
  }

  function readingTime(minutes) {
    if (!minutes) return '';
    if (minutes < 55) return Math.max(5, Math.round(minutes / 5) * 5) + ' min read';
    var half = Math.round(minutes / 30) / 2;
    var whole = Math.floor(half);
    return 'About ' + (half === whole ? String(whole) : (whole || '') + '\u00BD') + ' hour' + (half > 1 ? 's' : '');
  }

  /* ---------------------------------------------------------------------
     the chrome: shown on arrival, gone once reading starts, back on a tap
     in the middle, a move to the top or bottom edge, or Escape
     --------------------------------------------------------------------- */
  var hideTimer = 0;
  var overChrome = false;
  function chromeOn() { return body.classList.contains('rd-chrome'); }
  function showChrome(stay) {
    body.classList.add('rd-chrome');
    clearTimeout(hideTimer);
    if (!stay) hideTimer = setTimeout(hideChrome, 3600);
  }
  function hideChrome() {
    clearTimeout(hideTimer);
    if (panel || mode === 'drive' || mode === 'loading' || overChrome || scrubbing) return;
    var a = document.activeElement;
    if (a && ($('rdBar').contains(a) || $('rdDock').contains(a)) && a.matches(':focus-visible')) return;
    body.classList.remove('rd-chrome');
  }
  function toggleChrome() { if (chromeOn()) hideChrome(); else showChrome(); }

  ['rdBar', 'rdDock'].forEach(function (id) {
    var el = $(id);
    el.addEventListener('mouseenter', function () { overChrome = true; clearTimeout(hideTimer); });
    el.addEventListener('mouseleave', function () { overChrome = false; if (!panel) hideTimer = setTimeout(hideChrome, 1800); });
  });
  document.addEventListener('mousemove', function (event) {
    if (panel || mode === 'drive') return;
    var y = event.clientY;
    if (y < 64 || y > window.innerHeight - 70) { if (!chromeOn()) showChrome(); }
  }, { passive: true });

  var toastTimer = 0;
  function toast(msg, ms) {
    var t = $('rdToast');
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('is-on'); }, ms || 3200);
  }
  function note(msg) {
    var old = document.querySelector('.rd-note');
    if (old) old.parentNode.removeChild(old);
    var box = document.createElement('div');
    box.className = 'rd-note';
    box.setAttribute('role', 'status');
    var p = document.createElement('span');
    p.textContent = msg;
    var x = document.createElement('button');
    x.type = 'button';
    x.setAttribute('aria-label', 'Dismiss');
    x.textContent = '\u00D7';
    x.addEventListener('click', function () { box.parentNode.removeChild(box); });
    box.appendChild(p);
    box.appendChild(x);
    body.appendChild(box);
  }
  function loading(on) { $('rdProgress').hidden = !on; }

  /* ---------------------------------------------------------------------
     settings
     --------------------------------------------------------------------- */
  function pressed(key, value) {
    var btns = document.querySelectorAll('[data-k="' + key + '"]');
    for (var i = 0; i < btns.length; i++) btns[i].setAttribute('aria-pressed', String(btns[i].getAttribute('data-v') === String(value)));
  }
  function setFill(input) {
    var min = Number(input.min) || 0;
    var max = Number(input.max) || 100;
    input.style.setProperty('--fill', ((Number(input.value) - min) / (max - min || 1)) * 100 + '%');
  }

  function paintSettings() {
    root.setAttribute('data-theme', settings.theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', PAPER[settings.theme] || PAPER.light);
    text.setAttribute('data-font', settings.font);
    text.setAttribute('data-align', settings.align);
    text.setAttribute('data-para', settings.para);
    text.style.setProperty('--rd-size', SIZES[settings.size] + 'px');
    text.style.setProperty('--rd-lh', String(LINES[settings.line] || LINES.normal));
    text.style.setProperty('--rd-para', PARAS[settings.para] || PARAS.normal);
    ['theme', 'font', 'line', 'para', 'margin', 'align', 'cols', 'flow'].forEach(function (k) { pressed(k, settings[k]); });
    pressed('mode', mode === 'pages' ? 'pages' : 'text');
    var size = $('rdSize');
    var inPages = mode === 'pages';
    size.value = String(inPages ? settings.zoom : settings.size);
    $('rdSizeLabel').textContent = inPages ? 'Page size' : 'Size';
    $('rdSizeOut').textContent = inPages ? Math.round(ZOOMS[settings.zoom] * 100) + '%' : SIZES[settings.size] + ' px';
    setFill(size);
    var rows = document.querySelectorAll('#rdAa [data-for]');
    for (var i = 0; i < rows.length; i++) {
      var f = rows[i].getAttribute('data-for');
      rows[i].hidden = f === 'both' ? !(item && item.edition && item.file) : (f === 'text' ? mode !== 'text' : mode !== 'pages');
    }
  }

  function change(key, value) {
    if (key === 'mode') { switchMode(value); return; }
    if (key === 'cols') value = Number(value);
    if (settings[key] === value) return;
    var keep = currentPos();
    settings[key] = value;
    saveSettings();
    paintSettings();
    if (key === 'theme') return;
    if (mode === 'text') relayout(keep);
  }

  function nudgeSize(step) {
    if (mode === 'pages') {
      var z = clamp(settings.zoom + step, 0, ZOOMS.length - 1);
      if (z === settings.zoom) return;
      settings.zoom = z;
      saveSettings();
      paintSettings();
      if (pdf) pdf.setZoom(ZOOMS[z]);
      return;
    }
    var s = clamp(settings.size + step, 0, SIZES.length - 1);
    if (s === settings.size) return;
    var keep = currentPos();
    settings.size = s;
    saveSettings();
    paintSettings();
    relayout(keep);
  }

  /* ---------------------------------------------------------------------
     the edition: sections, contents, and the progress arithmetic
     --------------------------------------------------------------------- */
  function prepare(edition) {
    ed = edition;
    blocks = Array.isArray(edition.blocks) ? edition.blocks : [];
    charStart = new Array(blocks.length + 1);
    var acc = 0;
    for (var i = 0; i < blocks.length; i++) { charStart[i] = acc; acc += blockText(blocks[i]).length + 1; }
    charStart[blocks.length] = acc;
    totalChars = Math.max(1, acc);
    chunks = makeChunks();
    toc = (edition.toc && edition.toc.length ? edition.toc : headingsToc()).filter(function (t) { return typeof t.b === 'number'; });
    if (edition.lang) text.setAttribute('lang', edition.lang);
    if (edition.pages) pdfTotal = edition.pages;
  }

  function headingsToc() {
    var out = [];
    blocks.forEach(function (b, i) {
      if (b[0] === 'h1' || b[0] === 'h2') out.push({ t: b[1], l: b[0] === 'h1' ? 1 : 2, p: b[2], b: i });
    });
    return out;
  }

  /* A new section starts at the document's main headings once the current
     one has some length, and anyway once it is long; at most ~8,000 words
     are laid out at a time. */
  function makeChunks() {
    var count = { h1: 0, h2: 0 };
    blocks.forEach(function (b) { if (count[b[0]] !== undefined) count[b[0]]++; });
    var lead = count.h1 >= 2 ? 1 : (count.h2 >= 2 ? 2 : 0);
    var out = [];
    var start = 0;
    var chars = 0;
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      var rank = /^h[1-3]$/.test(b[0]) ? Number(b[0].charAt(1)) : 9;
      var heading = lead && rank <= lead;
      var newPage = i > 0 && b[2] !== blocks[i - 1][2];
      if (i > start && ((heading && chars > 1800) || (chars > 32000 && newPage && b[0] !== 'li') || chars > 46000)) {
        out.push({ from: start, to: i });
        start = i;
        chars = 0;
      }
      chars += blockText(b).length;
    }
    out.push({ from: start, to: blocks.length });
    return out;
  }

  function chunkOf(i) {
    if (i < 0) return 0;
    var lo = 0;
    var hi = chunks.length - 1;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      if (chunks[mid].from <= i) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  function blockAtChar(ch) {
    var lo = 0;
    var hi = blocks.length - 1;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      if (charStart[mid] <= ch) lo = mid; else hi = mid - 1;
    }
    return { i: lo, c: clamp(Math.round(ch - charStart[lo]), 0, Math.max(0, blockText(blocks[lo]).length - 1)) };
  }

  function charOf(p) {
    if (!blocks.length || p.i < 0) return 0;
    if (p.i >= blocks.length) return totalChars;
    return charStart[p.i] + (p.c || 0);
  }
  function origPage(p) {
    if (!blocks.length) return 1;
    if (p.i < 0) return 1;
    var b = blocks[Math.min(p.i, blocks.length - 1)];
    return b ? b[2] : 1;
  }
  function tocIndexAt(i) {
    var at = -1;
    for (var k = 0; k < toc.length; k++) { if (toc[k].b <= i) at = k; else break; }
    return at;
  }

  /* ---------------------------------------------------------------------
     rendering
     --------------------------------------------------------------------- */
  function coverHtml() {
    var facts = [];
    var pages = (ed && ed.pages) || item.pages;
    if (pages) facts.push(pages + ' pages');
    var mins = (ed && ed.minutes) || item.minutes;
    if (mins) facts.push(readingTime(mins));
    var hint = !settings.hinted && settings.flow === 'paged'
      ? '<p class="rd-cover__hint">' + (window.matchMedia && window.matchMedia('(hover: none)').matches ? 'Tap the right edge or swipe to turn the page.' : 'Turn the page with the arrow keys, a click at the edge, or a swipe.') + '</p>'
      : '';
    return '<header class="rd-cover" data-i="-1">' +
      '<p class="rd-cover__kind">' + esc(item.kind || (shelf && shelf.name) || 'PFA Library') + '</p>' +
      '<p class="rd-cover__title">' + esc(item.title) + '</p>' +
      (item.blurb ? '<p class="rd-cover__blurb">' + esc(item.blurb) + '</p>' : '') +
      (facts.length ? '<p class="rd-cover__facts">' + esc(facts.join(' \u00B7 ')) + '</p>' : '') +
      hint +
      '<p class="rd-cover__mark">People for Animals<i>Library</i></p>' +
      '</header>';
  }

  function finHtml() {
    return '<footer class="rd-fin" data-i="' + blocks.length + '"><b>The end</b>That is all of ' + esc(item.title) +
      '. <a href="library.html">Back to the library</a> \u00B7 <a href="' + esc(downloadHref) + '"' + (item.file ? ' download' : ' target="_blank" rel="noopener"') + '>Download the original</a></footer>';
  }

  function blockHtml(b, i) {
    var t = b[1];
    switch (b[0]) {
      case 'h1': return '<h2 class="rd-h rd-h1" data-i="' + i + '">' + esc(t) + '</h2>';
      case 'h2': return '<h3 class="rd-h rd-h2" data-i="' + i + '">' + esc(t) + '</h3>';
      case 'h3': return '<h4 class="rd-h rd-h3" data-i="' + i + '">' + esc(t) + '</h4>';
      case 'li': return '<p class="rd-li" data-i="' + i + '"><span class="rd-m">' + esc(b[3] || '\u2022') + '</span>' + esc(t) + '</p>';
      case 'table':
        return '<div class="rd-table" data-i="' + i + '"><table><tbody>' + t.map(function (row) {
          return '<tr>' + row.map(function (cell) { return '<td>' + esc(cell) + '</td>'; }).join('') + '</tr>';
        }).join('') + '</tbody></table></div>';
      case 'fig': return figHtml(b, i);
      default: return '<p class="rd-p" data-i="' + i + '">' + esc(t) + '</p>';
    }
  }

  /* Pages of the original shown as printed rather than set as text: pictures,
     scans, Hindi the PDF's font scrambled, and the printed contents, which
     opens the reader's own. ['fig', kind, first, last] */
  function figHtml(b, i) {
    var a = b[2];
    var z = b[3] || b[2];
    var one = a === z;
    var which = one ? 'Page ' + a : 'Pages ' + a + ' to ' + z;
    var what = {
      scan: one ? 'a scanned page' : 'scanned pages',
      hindi: 'in Hindi',
      mixed: 'pictures and scanned pages',
      contents: 'the printed contents'
    }[b[1]] || (one ? 'a picture, a chart or a photograph' : 'pictures, charts or photographs');
    var act;
    if (b[1] === 'contents') act = '<b data-act="toc">Open the contents</b>';
    else if (item.file) act = '<b>See ' + (one ? 'page ' + a : 'pages ' + a + ' to ' + z) + ' as printed</b>';
    else act = '<b>Download the original to see ' + (one ? 'it' : 'them') + '</b>';
    return '<figure class="rd-fig" data-i="' + i + '"><button type="button" data-page="' + a + '"' + (b[1] === 'contents' ? ' data-act="toc"' : '') + '>' +
      which + ' of the original ' + (one ? 'is ' : 'are ') + what + '.' + act + '</button></figure>';
  }

  function renderRange(from, to, withCover, withFin) {
    var html = [];
    if (withCover) html.push(coverHtml());
    for (var i = from; i < to; i++) html.push(blockHtml(blocks[i], i));
    if (withFin) html.push(finHtml());
    text.innerHTML = html.join('');
  }

  function isScroll() { return settings.flow === 'scroll'; }

  /* Page, column and gap, in pixels, so the columns land exactly one page
     apart. The line is measured in ems of the reading size: about 60 to 75
     characters, the comfortable range, whatever the font. */
  function computeLayout() {
    var vw = stage.clientWidth || window.innerWidth;
    var phone = vw < 720;
    var size = SIZES[settings.size];
    var measure = Math.round((MEASURE[settings.margin] || MEASURE.medium) * size);
    var side = phone ? SIDE[settings.margin] || 24 : Math.max(56, Math.round(vw * 0.06));
    var avail = Math.max(240, vw - side * 2);
    var two = settings.cols === 2 && vw >= 1024 && !isScroll();
    var colW, frameW, flowW, gap, stride;
    if (two) {
      gap = Math.max(56, Math.round(size * 3.4));
      colW = Math.min(measure, Math.floor((avail - gap) / 2));
      frameW = colW * 2 + gap;
      flowW = frameW;
      stride = frameW + gap;
    } else {
      colW = Math.min(measure, avail);
      frameW = colW;
      flowW = colW;
      gap = Math.max(side * 2, 48);
      stride = colW + gap;
    }
    layout = { stride: stride, frameW: frameW, colW: colW, gap: gap, two: two };
    root.style.setProperty('--rd-frame-w', frameW + 'px');
    text.style.setProperty('--rd-col-w', colW + 'px');
    text.style.setProperty('--rd-gap', gap + 'px');
    text.style.setProperty('--rd-flow-w', flowW + 'px');
    stage.classList.toggle('is-scroll', isScroll() || mode === 'pages');
    if (mode === 'text' && !isScroll()) stage.scrollTop = 0;
  }

  /* Measured under whatever transform is on the flow at that instant, page
     turn half done or not: the flow's own box moves with its columns, so
     the difference between the two is always the position in the row. */
  function flowLeft() { return text.getBoundingClientRect().left; }
  function pageOfX(x, base) { return Math.max(0, Math.floor((x - base + 2) / layout.stride)); }

  function lineRects(el) {
    var r = document.createRange();
    r.selectNodeContents(el);
    var list = Array.prototype.filter.call(r.getClientRects(), function (q) { return q.width > 0 || q.height > 0; });
    if (!list.length) list = Array.prototype.slice.call(el.getClientRects());
    return list;
  }

  function textNodes(el) {
    var out = [];
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var p = node.parentNode;
        while (p && p !== el) { if (p.classList && p.classList.contains('rd-m')) return NodeFilter.FILTER_REJECT; p = p.parentNode; }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var node;
    while ((node = walker.nextNode())) out.push(node);
    return out;
  }

  function rangeAt(el, c) {
    var nodes = textNodes(el);
    var acc = 0;
    for (var k = 0; k < nodes.length; k++) {
      var len = nodes[k].nodeValue.length;
      if (c < acc + len) {
        var r = document.createRange();
        r.setStart(nodes[k], c - acc);
        r.setEnd(nodes[k], Math.min(len, c - acc + 1));
        return r;
      }
      acc += len;
    }
    return null;
  }

  function rectAt(el, c) {
    var r = rangeAt(el, c);
    if (!r) return null;
    var rects = r.getClientRects();
    for (var k = 0; k < rects.length; k++) if (rects[k].width > 0 || rects[k].height > 0) return rects[k];
    return r.getBoundingClientRect();
  }

  function measurePages() {
    var els = text.querySelectorAll('[data-i]');
    if (!els.length) { cur.pages = 1; return; }
    var base = flowLeft();
    var rects = lineRects(els[els.length - 1]);
    var last = rects[rects.length - 1];
    cur.pages = last ? pageOfX(last.left, base) + 1 : 1;
  }

  function renderChunk(k) {
    var c = chunks[k];
    renderRange(c.from, c.to, k === 0, k === chunks.length - 1);
    cur.chunk = k;
    cur.page = 0;
    setX(0, false);
    measurePages();
  }

  function renderAll() {
    renderRange(0, blocks.length, true, true);
    cur.chunk = -1;
    cur.page = 0;
    setX(0, false);
  }

  function setX(page, animate) {
    text.classList.toggle('is-turning', !!animate);
    text.style.setProperty('--rd-x', (-page * layout.stride) + 'px');
  }

  function pageOf(p) {
    var el = text.querySelector('[data-i="' + p.i + '"]');
    if (!el) return 0;
    var base = flowLeft();
    var rect = p.c > 0 ? rectAt(el, p.c) : null;
    if (!rect) { var lines = lineRects(el); rect = lines[0]; }
    return rect ? clamp(pageOfX(rect.left, base), 0, cur.pages - 1) : 0;
  }

  /* The first thing on the page being shown: a block, and if the block
     began on an earlier page, the first character of it on this one. */
  function positionAtPage(page) {
    var els = text.querySelectorAll('[data-i]');
    var base = flowLeft();
    for (var k = 0; k < els.length; k++) {
      var el = els[k];
      var lines = lineRects(el);
      if (!lines.length) continue;
      if (pageOfX(lines[lines.length - 1].left, base) < page) continue;
      var i = Number(el.getAttribute('data-i'));
      if (pageOfX(lines[0].left, base) >= page || i < 0 || i >= blocks.length) return { i: i, c: 0 };
      var len = blockText(blocks[i]).length;
      var lo = 0;
      var hi = Math.max(0, len - 1);
      while (lo < hi) {
        var mid = (lo + hi) >> 1;
        var r = rectAt(el, mid);
        if (r && pageOfX(r.left, base) >= page) hi = mid; else lo = mid + 1;
      }
      return { i: i, c: lo };
    }
    return { i: blocks.length, c: 0 };
  }

  function positionInScroll() {
    var top = 84; // just under the bar
    var els = text.querySelectorAll('[data-i]');
    var lo = 0;
    var hi = els.length - 1;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      if (els[mid].getBoundingClientRect().top <= top) lo = mid; else hi = mid - 1;
    }
    var el = els[lo];
    if (!el) return { i: -1, c: 0 };
    var i = Number(el.getAttribute('data-i'));
    var rect = el.getBoundingClientRect();
    if (i < 0 || i >= blocks.length || rect.top >= top || rect.height <= 0) return { i: i, c: 0 };
    var len = blockText(blocks[i]).length;
    return { i: i, c: clamp(Math.round(len * (top - rect.top) / rect.height), 0, Math.max(0, len - 1)) };
  }

  function currentPos() {
    if (mode !== 'text' || !blocks.length) return pos;
    return isScroll() ? positionInScroll() : positionAtPage(cur.page);
  }

  function goTo(p, opts) {
    opts = opts || {};
    if (mode !== 'text') return;
    p = { i: clamp(p.i, -1, blocks.length), c: Math.max(0, p.c || 0) };
    if (isScroll()) {
      if (cur.chunk !== -1 || !text.firstChild) renderAll();
      var el = text.querySelector('[data-i="' + p.i + '"]');
      if (el) {
        var rect = p.c > 0 ? rectAt(el, p.c) : el.getBoundingClientRect();
        if (rect) stage.scrollTop += rect.top - 76 - (opts.center ? stage.clientHeight * 0.25 : 0);
      }
      pos = p;
    } else {
      var k = chunkOf(p.i);
      if (k !== cur.chunk) renderChunk(k);
      cur.page = 0;
      setX(0, false);
      var pg = pageOf(p);
      cur.page = pg;
      setX(pg, false);
      pos = p;
    }
    moved(true);
  }

  function relayout(keep) {
    if (mode !== 'text') return;
    keep = keep || pos;
    computeLayout();
    if (isScroll()) renderAll(); else renderChunk(chunkOf(keep.i));
    goTo(keep);
  }

  /* ---------------------------------------------------------------------
     turning
     --------------------------------------------------------------------- */
  var turning = 0;
  function next() {
    if (mode !== 'text' || isScroll()) return;
    hideChrome();
    if (cur.page < cur.pages - 1) {
      cur.page++;
      setX(cur.page, true);
    } else if (cur.chunk < chunks.length - 1) {
      fadeSwap(function () { renderChunk(cur.chunk + 1); });
    } else {
      toast('That is the end of the document.');
      return;
    }
    turned();
  }
  function prev() {
    if (mode !== 'text' || isScroll()) return;
    hideChrome();
    if (cur.page > 0) {
      cur.page--;
      setX(cur.page, true);
    } else if (cur.chunk > 0) {
      fadeSwap(function () { renderChunk(cur.chunk - 1); cur.page = cur.pages - 1; setX(cur.page, false); });
    } else {
      return;
    }
    turned();
  }
  function fadeSwap(fn) {
    text.style.transition = 'none';
    text.style.opacity = '0';
    fn();
    requestAnimationFrame(function () {
      text.style.transition = 'opacity .28s ease';
      text.style.opacity = '1';
      setTimeout(function () { text.style.transition = ''; }, 320);
    });
  }
  function turned() {
    turning = Date.now();
    if (!settings.hinted) { settings.hinted = true; saveSettings(); }
    pos = positionAtPage(cur.page);
    moved(false);
  }

  /* ---------------------------------------------------------------------
     where you are: the dock, the running head and foot, the save
     --------------------------------------------------------------------- */
  var saveTimer = 0;
  function moved(immediate) {
    paintWhere();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, immediate ? 50 : 500);
  }

  function atEnd() {
    if (mode === 'pages') return pdfTotal && pdfPage >= pdfTotal;
    if (isScroll()) return stage.scrollTop + stage.clientHeight >= stage.scrollHeight - 4;
    return cur.chunk === chunks.length - 1 && cur.page >= cur.pages - 1;
  }

  function fraction() {
    if (mode === 'pages') return pdfTotal > 1 ? (pdfPage - 1) / (pdfTotal - 1) : (pdfPage >= 1 ? 1 : 0);
    if (mode !== 'text') return 0;
    if (atEnd()) return 1;
    return clamp(charOf(pos) / totalChars, 0, 1);
  }

  function pageNow() { return mode === 'pages' ? pdfPage : origPage(pos); }

  function sectionLeft() {
    if (mode !== 'text' || !blocks.length) return '';
    var k = tocIndexAt(Math.max(pos.i, 0));
    var endBlock = k >= 0 && k + 1 < toc.length ? toc[k + 1].b : blocks.length;
    var chars = Math.max(0, charStart[Math.min(endBlock, blocks.length)] - charOf(pos));
    var mins = Math.round(chars / CHARS_PER_WORD / WPM);
    var where = toc.length && k >= 0 && k + 1 < toc.length ? 'section' : 'document';
    if (atEnd()) return '';
    return mins < 1 ? 'Less than a minute left in ' + where : mins + ' min left in ' + where;
  }

  function paintWhere() {
    var f = fraction();
    var pct = Math.round(f * 100);
    var page = pageNow();
    var total = mode === 'pages' ? pdfTotal : (ed && ed.pages) || item.pages || 0;
    var pageLabel = mode === 'text' && pos.i < 0 ? 'Title page' : (total ? 'Page ' + page + ' of ' + total : 'Page ' + page);
    $('rdWhere').textContent = pageLabel;
    $('rdPct').textContent = pct + '%';
    $('rdFootPct').textContent = pageLabel + ' \u00B7 ' + pct + '%';
    $('rdFootLeft').textContent = sectionLeft();
    if (!scrubbing) { $('rdScrub').value = String(Math.round(f * 1000)); setFill($('rdScrub')); }
    var k = mode === 'text' ? tocIndexAt(Math.max(pos.i, 0)) : -1;
    $('rdHeadText').textContent = k >= 0 ? toc[k].t : item.title;
    $('rdTocWhere').textContent = pageLabel + ' \u00B7 ' + (pct >= 100 ? 'Finished' : pct + '% read');
    $('rdTocBar').style.width = Math.max(pct, 1) + '%';
    if (panel && panel.el.id === 'rdToc') markToc();
  }

  function save() {
    if (!item || returnPos) return;
    var all = loadProgress();
    var entry = all.items[slug] || {};
    entry.at = Date.now();
    entry.mode = mode === 'loading' ? entry.mode : mode;
    if (mode === 'text') { entry.i = pos.i; entry.c = pos.c; }
    if (mode === 'pages') entry.pdfPage = pdfPage;
    if (mode === 'text' || mode === 'pages') {
      entry.pct = Math.round(fraction() * 1000) / 1000;
      entry.page = pageNow();
      entry.pages = mode === 'pages' ? pdfTotal : (ed && ed.pages) || item.pages || undefined;
      if (atEnd()) entry.done = true;
    }
    all.items[slug] = entry;
    all.last = slug;
    writeJSON(PROGRESS_KEY, all);
  }

  /* the scrubber: drag to anywhere, see where you will land first */
  var scrubbing = false;
  (function () {
    var scrub = $('rdScrub');
    var wrap = $('rdScrubWrap');
    var tip = $('rdScrubTip');
    function target() {
      var f = Number(scrub.value) / 1000;
      if (mode === 'pages') return { page: clamp(Math.round(f * (pdfTotal - 1)) + 1, 1, pdfTotal || 1) };
      return blockAtChar(f * totalChars);
    }
    function label(t) {
      if (mode === 'pages') return 'Page ' + t.page;
      var k = tocIndexAt(t.i);
      return 'Page ' + origPage(t) + (k >= 0 ? ' \u00B7 ' + toc[k].t : '');
    }
    scrub.addEventListener('input', function () {
      scrubbing = true;
      wrap.classList.add('is-dragging');
      setFill(scrub);
      if (mode !== 'text' && mode !== 'pages') return;
      tip.textContent = label(target());
      var w = scrub.getBoundingClientRect().width;
      tip.style.left = clamp(Number(scrub.value) / 1000 * w, 60, w - 60) + 'px';
      showChrome(true);
    });
    scrub.addEventListener('change', function () {
      scrubbing = false;
      wrap.classList.remove('is-dragging');
      if (mode === 'pages' && pdf) pdf.goToPage(target().page);
      else if (mode === 'text') goTo(Number(scrub.value) >= 1000 ? { i: blocks.length, c: 0 } : target());
      showChrome();
    });
  }());

  /* ---------------------------------------------------------------------
     input: taps, clicks, keys, the wheel and the swipe
     --------------------------------------------------------------------- */
  var swiped = 0;
  stage.addEventListener('click', function (event) {
    if (Date.now() - swiped < 400) return;
    var t = event.target;
    if (t.closest && t.closest('a, button, input, .rd-table, .textLayer span')) {
      var fig = t.closest('.rd-fig button');
      if (fig && fig.getAttribute('data-act') === 'toc') { buildToc(); openPanel($('rdToc'), $('rdTocBtn'), document.querySelector('#rdTocList .is-here button')); }
      else if (fig) openOriginalAt(Number(fig.getAttribute('data-page')) || 1);
      return;
    }
    var sel = window.getSelection ? window.getSelection() : null;
    if (sel && !sel.isCollapsed) return;
    if (panel) { closePanel(); return; }
    if (mode === 'text' && !isScroll()) {
      var x = event.clientX / window.innerWidth;
      if (x < 0.26) { prev(); return; }
      if (x > 0.74) { next(); return; }
    }
    toggleChrome();
  });
  $('rdPrev').addEventListener('click', function () { prev(); });
  $('rdNext').addEventListener('click', function () { next(); });

  document.addEventListener('keydown', function (event) {
    var k = event.key;
    var typing = event.target && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) && event.target.type !== 'range';
    if ((event.ctrlKey || event.metaKey) && (k === 'f' || k === 'F') && mode !== 'drive') {
      event.preventDefault();
      openFind();
      return;
    }
    if (k === 'Escape') {
      if (panel) { closePanel(); event.preventDefault(); return; }
      if (returnPos) { goBack(); return; }
      toggleChrome();
      return;
    }
    if (typing || event.altKey || event.ctrlKey || event.metaKey) return;
    if (panel && panel.el.id !== 'rdAa') return;
    if (event.target && event.target.type === 'range') return;
    if (k === '/' && mode !== 'drive') { event.preventDefault(); openFind(); return; }
    if (mode === 'pages' && pdf && (k === 'ArrowRight' || k === 'ArrowLeft')) { event.preventDefault(); pdf.goToPage(pdfPage + (k === 'ArrowRight' ? 1 : -1)); return; }
    if (mode !== 'text' || isScroll()) return;
    if (k === 'ArrowRight' || k === 'PageDown' || (k === ' ' && !event.shiftKey) || k === 'ArrowDown') { event.preventDefault(); next(); }
    else if (k === 'ArrowLeft' || k === 'PageUp' || (k === ' ' && event.shiftKey) || k === 'ArrowUp') { event.preventDefault(); prev(); }
    else if (k === 'Home' && event.target === body) { goTo({ i: -1, c: 0 }); }
  });

  var wheelAcc = 0;
  stage.addEventListener('wheel', function (event) {
    if (mode !== 'text' || isScroll()) return;
    event.preventDefault();
    var d = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    wheelAcc += d;
    if (Date.now() - turning < 480) return;
    if (wheelAcc > 50) { wheelAcc = 0; next(); }
    else if (wheelAcc < -50) { wheelAcc = 0; prev(); }
  }, { passive: false });

  (function () {
    var x0 = 0;
    var y0 = 0;
    var t0 = 0;
    var dragging = false;
    stage.addEventListener('touchstart', function (event) {
      if (mode !== 'text' || isScroll() || event.touches.length !== 1) return;
      x0 = event.touches[0].clientX;
      y0 = event.touches[0].clientY;
      t0 = Date.now();
      dragging = false;
    }, { passive: true });
    stage.addEventListener('touchmove', function (event) {
      if (mode !== 'text' || isScroll() || !t0) return;
      var dx = event.touches[0].clientX - x0;
      var dy = event.touches[0].clientY - y0;
      if (!dragging && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) dragging = true;
      if (!dragging) return;
      event.preventDefault();
      var edge = (cur.page === 0 && cur.chunk <= 0 && dx > 0) || (atEnd() && dx < 0);
      text.classList.remove('is-turning');
      text.style.setProperty('--rd-x', (-cur.page * layout.stride + dx * (edge ? 0.25 : 1)) + 'px');
    }, { passive: false });
    stage.addEventListener('touchend', function (event) {
      if (!t0) return;
      var dx = (event.changedTouches[0] ? event.changedTouches[0].clientX : x0) - x0;
      var fast = Date.now() - t0 < 280 && Math.abs(dx) > 30;
      t0 = 0;
      if (!dragging) return;
      dragging = false;
      swiped = Date.now();
      if (dx < -60 || (fast && dx < 0)) next();
      else if (dx > 60 || (fast && dx > 0)) prev();
      setX(cur.page, true);
    });
  }());

  var scrollTick = 0;
  stage.addEventListener('scroll', function () {
    if (scrollTick) return;
    scrollTick = requestAnimationFrame(function () {
      scrollTick = 0;
      if (mode === 'text' && isScroll()) {
        pos = positionInScroll();
        moved(false);
      }
    });
    if (chromeOn() && !panel) hideChrome();
  }, { passive: true });

  window.addEventListener('resize', (function () {
    var t = 0;
    var keep = null;
    return function () {
      if (mode !== 'text') return;
      if (!keep) keep = pos;
      clearTimeout(t);
      t = setTimeout(function () { relayout(keep); keep = null; paintSettings(); }, 160);
    };
  }()));

  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') save(); });
  window.addEventListener('pagehide', save);
  /* Right-click is off site-wide (assets/chrome.js); the reader keeps the
     rule, except in the search box, where pasting a phrase is the point. */
  document.addEventListener('contextmenu', function (event) {
    if (event.target && /^(INPUT|TEXTAREA)$/.test(event.target.tagName)) return;
    event.preventDefault();
  }, true);

  /* ---------------------------------------------------------------------
     panels
     --------------------------------------------------------------------- */
  function focusables(el) {
    return Array.prototype.filter.call(el.querySelectorAll('button, a[href], input, [tabindex="0"]'), function (x) {
      return !x.disabled && x.offsetParent !== null;
    });
  }
  function openPanel(el, trigger, focusEl) {
    if (panel && panel.el === el) { closePanel(); return; }
    closePanel(true);
    el.hidden = false;
    var scrim = $('rdScrim');
    var modal = el.id !== 'rdAa' || window.innerWidth < 720;
    if (modal) { scrim.hidden = false; requestAnimationFrame(function () { scrim.classList.add('is-on'); }); }
    requestAnimationFrame(function () { el.classList.add('is-on'); });
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
    panel = { el: el, trigger: trigger };
    showChrome(true);
    setTimeout(function () { (focusEl || focusables(el)[0] || el).focus({ preventScroll: true }); }, 60);
  }
  function closePanel(quick) {
    if (!panel) return;
    var el = panel.el;
    var trigger = panel.trigger;
    panel = null;
    el.classList.remove('is-on');
    var scrim = $('rdScrim');
    scrim.classList.remove('is-on');
    setTimeout(function () { if (!el.classList.contains('is-on')) el.hidden = true; if (!panel) scrim.hidden = true; }, quick ? 0 : 320);
    if (trigger) {
      trigger.setAttribute('aria-expanded', 'false');
      if (!quick) trigger.focus({ preventScroll: true });
    }
    if (!quick) hideTimer = setTimeout(hideChrome, 2400);
  }
  $('rdScrim').addEventListener('click', function () { closePanel(); });
  document.addEventListener('mousedown', function (event) {
    if (!panel || panel.el.id !== 'rdAa') return;
    if (panel.el.contains(event.target) || $('rdAaBtn').contains(event.target)) return;
    closePanel();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Tab' || !panel || panel.el.id === 'rdAa') return;
    var f = focusables(panel.el);
    if (!f.length) return;
    if (event.shiftKey && document.activeElement === f[0]) { event.preventDefault(); f[f.length - 1].focus(); }
    else if (!event.shiftKey && document.activeElement === f[f.length - 1]) { event.preventDefault(); f[0].focus(); }
  });

  $('rdAaBtn').addEventListener('click', function () { openPanel($('rdAa'), $('rdAaBtn')); });
  $('rdAaClose').addEventListener('click', function () { closePanel(); });
  $('rdTocBtn').addEventListener('click', function () { buildToc(); openPanel($('rdToc'), $('rdTocBtn'), document.querySelector('#rdTocList .is-here button')); });
  $('rdTocClose').addEventListener('click', function () { closePanel(); });
  $('rdFindBtn').addEventListener('click', function () { openFind(); });
  $('rdFindClose').addEventListener('click', function () { closePanel(); });

  document.getElementById('rdAa').addEventListener('click', function (event) {
    var b = event.target.closest('[data-k]');
    if (!b || b.disabled) return;
    change(b.getAttribute('data-k'), b.getAttribute('data-v'));
  });
  $('rdSize').addEventListener('input', function () {
    var v = Number($('rdSize').value);
    nudgeSize(v - (mode === 'pages' ? settings.zoom : settings.size));
  });
  $('rdSizeDown').addEventListener('click', function () { nudgeSize(-1); });
  $('rdSizeUp').addEventListener('click', function () { nudgeSize(1); });
  $('rdReset').addEventListener('click', function () {
    var keep = currentPos();
    var theme = settings.theme;
    for (var k in DEFAULTS) if (k !== 'theme' && k !== 'zoom') settings[k] = DEFAULTS[k];
    settings.theme = theme;
    settings.hinted = true;
    saveSettings();
    paintSettings();
    relayout(keep);
  });

  /* ---- contents ---- */
  function buildToc() {
    var list = $('rdTocList');
    list.innerHTML = '';
    var entries = mode === 'pages' && pdf ? pdfToc : toc;
    if (!entries.length) {
      var li = document.createElement('li');
      li.className = 'rd-toc__empty';
      li.textContent = mode === 'drive' ? 'Contents are not available in this view.' : 'This document has no headings to list. Use the slider at the foot of the page, or search, to move through it.';
      list.appendChild(li);
      return;
    }
    entries.forEach(function (t, k) {
      var li = document.createElement('li');
      if (t.l > 1) li.className = 'is-l2';
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('data-k', String(k));
      var a = document.createElement('span'); a.textContent = t.t;
      var p = document.createElement('span'); p.textContent = t.p ? String(t.p) : '';
      b.appendChild(a); b.appendChild(p);
      li.appendChild(b);
      list.appendChild(li);
    });
    markToc();
  }
  var pdfToc = [];
  function markToc() {
    var items = document.querySelectorAll('#rdTocList li');
    var here = -1;
    if (mode === 'text') here = tocIndexAt(Math.max(pos.i, 0));
    else if (mode === 'pages') for (var k = 0; k < pdfToc.length; k++) if (pdfToc[k].p <= pdfPage) here = k;
    for (var j = 0; j < items.length; j++) items[j].classList.toggle('is-here', j === here);
  }
  $('rdTocList').addEventListener('click', function (event) {
    var b = event.target.closest('button[data-k]');
    if (!b) return;
    var k = Number(b.getAttribute('data-k'));
    closePanel();
    if (mode === 'text' && toc[k]) goTo({ i: toc[k].b, c: 0 });
    else if (mode === 'pages' && pdf && pdfToc[k]) pdf.goToPage(pdfToc[k].p);
  });
  $('rdTocStart').addEventListener('click', function () {
    closePanel();
    if (mode === 'text') goTo({ i: -1, c: 0 });
    else if (mode === 'pages' && pdf) pdf.goToPage(1);
  });
  $('rdTocMode').addEventListener('click', function () { closePanel(); switchMode(mode === 'pages' ? 'text' : 'pages'); });

  /* ---------------------------------------------------------------------
     search: every occurrence, with the page of the original it is on;
     choosing one goes there and offers the way back
     --------------------------------------------------------------------- */
  function norm(s) {
    return String(s || '').toLowerCase().replace(/[\u2018\u2019\u02BC]/g, "'").replace(/[\u201C\u201D]/g, '"');
  }
  function openFind() {
    if (mode === 'drive' || mode === 'loading') return;
    openPanel($('rdFind'), $('rdFindBtn'), $('rdFindInput'));
    var input = $('rdFindInput');
    setTimeout(function () { input.select(); }, 80);
  }

  var findTimer = 0;
  var shown = 0;
  $('rdFindInput').addEventListener('input', function () {
    clearTimeout(findTimer);
    findTimer = setTimeout(runSearch, 180);
  });
  $('rdFindInput').addEventListener('keydown', function (event) {
    if (event.key === 'Enter') { event.preventDefault(); clearTimeout(findTimer); runSearch(); var first = document.querySelector('#rdFindList button'); if (first && hits.length) first.focus(); }
  });

  function runSearch() {
    var q = norm($('rdFindInput').value).replace(/\s+/g, ' ').trim();
    var list = $('rdFindList');
    var count = $('rdFindCount');
    list.innerHTML = '';
    hits = [];
    $('rdFindTips').hidden = q.length >= 2;
    if (q.length < 2) { count.textContent = ''; return; }
    if (mode === 'pages') {
      if (!pdf) return;
      count.textContent = 'Searching\u2026';
      pdf.search(q).then(function (res) {
        if (norm($('rdFindInput').value).replace(/\s+/g, ' ').trim() !== q) return;
        hits = res;
        paintHits(q);
      });
      return;
    }
    if (!lowered) lowered = blocks.map(function (b) { return norm(blockText(b)); });
    var perBlock = {};
    for (var i = 0; i < lowered.length && hits.length < 1000; i++) {
      var t = lowered[i];
      var at = t.indexOf(q);
      while (at > -1 && hits.length < 1000) {
        perBlock[i] = (perBlock[i] || 0) + 1;
        hits.push({ i: i, start: at, len: q.length, nth: perBlock[i] - 1, page: blocks[i][2] });
        at = t.indexOf(q, at + q.length);
      }
    }
    paintHits(q);
  }

  function snippet(source, start, len) {
    var a = Math.max(0, start - 70);
    var b = Math.min(source.length, start + len + 110);
    if (a > 0) { var sp = source.indexOf(' ', a); if (sp > -1 && sp < start) a = sp + 1; }
    if (b < source.length) { var sp2 = source.lastIndexOf(' ', b); if (sp2 > start + len) b = sp2; }
    return (a > 0 ? '\u2026' : '') + esc(source.slice(a, start)) + '<mark>' + esc(source.slice(start, start + len)) + '</mark>' + esc(source.slice(start + len, b)) + (b < source.length ? '\u2026' : '');
  }

  function paintHits(q) {
    var count = $('rdFindCount');
    shown = 0;
    $('rdFindList').innerHTML = '';
    if (!hits.length) { count.textContent = 'Not found in this document.'; return; }
    count.textContent = (hits.length >= 1000 ? 'More than 1,000' : hits.length) + (hits.length === 1 ? ' result' : ' results') + ' for \u201C' + q + '\u201D';
    moreHits();
  }

  function moreHits() {
    var list = $('rdFindList');
    var old = list.querySelector('.rd-find__more');
    if (old) old.parentNode.removeChild(old.parentNode === list ? old : old.parentNode);
    var end = Math.min(hits.length, shown + 60);
    var frag = document.createDocumentFragment();
    for (var n = shown; n < end; n++) {
      var h = hits[n];
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('data-n', String(n));
      var where = 'Page ' + h.page;
      if (mode === 'text') { var k = tocIndexAt(h.i); if (k >= 0) where += ' \u00B7 ' + toc[k].t; }
      var source = mode === 'text' ? blockText(blocks[h.i]) : h.text;
      b.innerHTML = '<span class="rd-find__where">' + esc(where) + '</span><span class="rd-find__snip">' + snippet(source, h.start, h.len) + '</span>';
      li.appendChild(b);
      frag.appendChild(li);
    }
    list.appendChild(frag);
    shown = end;
    if (shown < hits.length) {
      var li2 = document.createElement('li');
      var more = document.createElement('button');
      more.type = 'button';
      more.className = 'rd-pill rd-find__more';
      more.textContent = 'Show more results (' + (hits.length - shown) + ' left)';
      li2.appendChild(more);
      list.appendChild(li2);
    }
  }

  $('rdFindList').addEventListener('click', function (event) {
    if (event.target.closest('.rd-find__more')) { moreHits(); return; }
    var b = event.target.closest('button[data-n]');
    if (!b) return;
    jumpToHit(Number(b.getAttribute('data-n')));
  });

  function clearMarks() {
    var marks = document.querySelectorAll('mark.rd-hit');
    for (var i = 0; i < marks.length; i++) {
      var mk = marks[i];
      var parent = mk.parentNode;
      while (mk.firstChild) parent.insertBefore(mk.firstChild, mk);
      parent.removeChild(mk);
      parent.normalize();
    }
  }

  /* Wrap the nth occurrence of q in an element, across text nodes if need be. */
  function markIn(el, q, nth, on) {
    var nodes = textNodes(el);
    var full = '';
    var starts = [];
    nodes.forEach(function (nd) { starts.push(full.length); full += nd.nodeValue; });
    var low = norm(full);
    var at = -1;
    for (var k = 0; k <= nth; k++) { at = low.indexOf(q, at + 1); if (at < 0) return null; }
    var end = at + q.length;
    var first = null;
    for (var j = nodes.length - 1; j >= 0; j--) {
      var s = starts[j];
      var e = s + nodes[j].nodeValue.length;
      if (e <= at || s >= end) continue;
      var r = document.createRange();
      r.setStart(nodes[j], Math.max(0, at - s));
      r.setEnd(nodes[j], Math.min(nodes[j].nodeValue.length, end - s));
      var mk = document.createElement('mark');
      mk.className = 'rd-hit' + (on ? ' is-on' : '');
      r.surroundContents(mk);
      first = mk;
    }
    return first;
  }

  function jumpToHit(n) {
    var h = hits[n];
    if (!h) return;
    if (!returnPos) returnPos = mode === 'pages' ? { page: pdfPage } : { i: pos.i, c: pos.c };
    closePanel(true);
    if (mode === 'pages' && pdf) {
      pdf.jump(h);
    } else {
      clearMarks();
      goTo({ i: h.i, c: h.start }, { center: true });
      var q = norm($('rdFindInput').value).replace(/\s+/g, ' ').trim();
      var el = text.querySelector('[data-i="' + h.i + '"]');
      if (el) markIn(el, q, h.nth, true);
      /* the other occurrences in what is laid out, more lightly */
      var marked = 0;
      for (var k = 0; k < hits.length && marked < 150; k++) {
        if (k === n) continue;
        var oel = text.querySelector('[data-i="' + hits[k].i + '"]');
        if (oel && markIn(oel, q, hits[k].nth, false)) marked++;
      }
    }
    paintReturn();
    hideChrome();
  }

  function paintReturn() {
    var box = $('rdReturn');
    if (!returnPos) { box.hidden = true; return; }
    var page = returnPos.page || origPage(returnPos);
    $('rdReturnText').textContent = returnPos.i === -1 ? 'Back to the title page' : 'Back to page ' + page;
    box.hidden = false;
  }

  function goBack() {
    var back = returnPos;
    returnPos = null;
    paintReturn();
    clearMarks();
    if (pdf) pdf.clearHits();
    if (!back) return;
    if (mode === 'pages' && pdf) pdf.goToPage(back.page || 1);
    else goTo(back);
    save();
  }
  $('rdReturnGo').addEventListener('click', goBack);
  $('rdReturnStay').addEventListener('click', function () {
    returnPos = null;
    paintReturn();
    clearMarks();
    if (pdf) pdf.clearHits();
    save();
  });

  /* ---------------------------------------------------------------------
     the three forms of a document
     --------------------------------------------------------------------- */
  function setMode(m) {
    mode = m;
    body.setAttribute('data-mode', m);
    frame.hidden = m !== 'text' && m !== 'loading';
    pagesEl.hidden = m !== 'pages';
    $('rdTocBtn').disabled = m === 'drive';
    $('rdFindBtn').disabled = m === 'drive';
    $('rdAaBtn').disabled = m === 'drive';
    var tm = $('rdTocMode');
    tm.hidden = !(item.edition && item.file && (m === 'text' || m === 'pages'));
    tm.textContent = m === 'pages' ? 'Reading text' : 'Original pages';
    stage.classList.toggle('is-scroll', m === 'pages' || (m === 'text' && isScroll()));
    paintSettings();
  }

  function openText(start) {
    setMode('loading');
    computeLayout();
    blocks = [];
    text.innerHTML = coverHtml();
    loading(true);
    return fetch(item.edition, { credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (edition) {
        if (!edition || !edition.text || !Array.isArray(edition.blocks)) throw new Error('no text');
        prepare(edition);
        setMode('text');
        computeLayout();
        if (isScroll()) renderAll(); else renderChunk(0);
        goTo(start || { i: -1, c: 0 });
        loading(false);
        whenFontsSettle();
        showChrome();
      })
      .catch(function () {
        loading(false);
        if (item.file) { openPages(1); note('The reading text could not be loaded, so this is the original document, page by page.'); }
        else openDrive('The reading text could not be loaded, so this is the original document.');
      });
  }

  /* Literata arrives after the first layout; when it does, lay out again
     around the same place so nothing jumps. */
  function whenFontsSettle() {
    if (!document.fonts || !document.fonts.ready) return;
    var before = document.fonts.status;
    document.fonts.ready.then(function () { if (before !== 'loaded' && mode === 'text') relayout(currentPos()); });
  }

  function loadPdfEngine() {
    if (window.PFA_READER_PDF) return Promise.resolve(window.PFA_READER_PDF);
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'assets/reader-pdf.js';
      s.onload = function () { if (window.PFA_READER_PDF) resolve(window.PFA_READER_PDF); else reject(new Error('engine')); };
      s.onerror = function () { reject(new Error('engine')); };
      document.head.appendChild(s);
    });
  }

  function openPages(startPage) {
    setMode('pages');
    pagesEl.innerHTML = '';
    loading(true);
    returnPos = null;
    paintReturn();
    return loadPdfEngine().then(function (engine) {
      return engine.open({
        url: item.file,
        container: pagesEl,
        scroller: stage,
        startPage: startPage || 1,
        zoom: ZOOMS[settings.zoom],
        onPage: function (p, total) {
          pdfPage = p;
          pdfTotal = total;
          paintWhere();
          clearTimeout(saveTimer);
          saveTimer = setTimeout(save, 500);
        },
        onScroll: function () { if (chromeOn() && !panel) hideChrome(); }
      });
    }).then(function (api) {
      pdf = api;
      pdfTotal = api.total;
      loading(false);
      paintWhere();
      showChrome();
      api.outline().then(function (o) {
        pdfToc = (ed && ed.toc && ed.toc.length ? ed.toc.map(function (t) { return { t: t.t, l: t.l, p: t.p }; }) : o) || [];
      });
    }).catch(function () {
      loading(false);
      openDrive('The original pages could not be drawn here, so this is the document in Google Drive\u2019s viewer.');
    });
  }

  function openDrive(why) {
    if (pdf) { pdf.destroy(); pdf = null; }
    setMode('drive');
    var old = document.querySelector('.rd-drive');
    if (old) old.parentNode.removeChild(old);
    /* Written as markup so the security test reads it as what it is, a frame
       (drive.google.com is in the policy's frame-src). */
    var holder = document.createElement('div');
    holder.innerHTML = '<iframe class="rd-drive" src="https://drive.google.com/file/d/' + encodeURIComponent(item.drive) + '/preview" title="' +
      esc(item.title) + ', the original document" allow="fullscreen" referrerpolicy="strict-origin-when-cross-origin"></iframe>';
    var frameEl = holder.firstChild;
    loading(true);
    frameEl.addEventListener('load', function () { loading(false); });
    setTimeout(function () { loading(false); }, 8000);
    body.appendChild(frameEl);
    showChrome(true);
    note(why || 'This document is shown as it was published, in Google Drive\u2019s viewer. Download keeps a copy.');
    save();
  }

  function switchMode(target) {
    if (target === 'pages' && mode === 'text' && item.file) {
      var page = origPage(currentPos());
      clearMarks();
      openPages(page);
      rememberMode('pages');
    } else if (target === 'text' && mode === 'pages' && item.edition) {
      var start = { i: -1, c: 0 };
      if (pdfPage > 1) for (var i = 0; i < blocks.length; i++) if (blocks[i][2] >= pdfPage) { start = { i: i, c: 0 }; break; }
      if (pdf) { pdf.destroy(); pdf = null; }
      pagesEl.innerHTML = '';
      rememberMode('text');
      if (ed) { setMode('text'); computeLayout(); if (isScroll()) renderAll(); else renderChunk(0); goTo(start); showChrome(); }
      else openText(start);
    }
  }
  function rememberMode(m) {
    var all = loadProgress();
    var entry = all.items[slug] || {};
    entry.mode = m;
    all.items[slug] = entry;
    writeJSON(PROGRESS_KEY, all);
  }
  function openOriginalAt(page) {
    if (item.file) { openPages(page); rememberMode('pages'); toast('Original pages. Switch back with Aa, or in Contents.', 4200); }
    else window.open(downloadHref, '_blank', 'noopener');
  }

  /* ---------------------------------------------------------------------
     start
     --------------------------------------------------------------------- */
  function notFound() {
    setModeMissing();
    text.innerHTML = '<header class="rd-cover"><p class="rd-cover__kind">PFA Library</p><p class="rd-cover__title">This document is not on the shelves</p>' +
      '<p class="rd-cover__blurb">The link may be old or mistyped. Every document in the library is listed on its shelves.</p>' +
      '<p class="rd-cover__facts"><a href="library.html">Back to the library</a></p></header>';
  }
  function setModeMissing() {
    mode = 'missing';
    body.setAttribute('data-mode', 'missing');
    $('rdTocBtn').disabled = true;
    $('rdFindBtn').disabled = true;
    $('rdAaBtn').disabled = true;
    $('rdDl').hidden = true;
    loading(false);
    computeLayout();
    showChrome(true);
  }

  $('rdBack').addEventListener('click', function (event) {
    /* Back to the shelves the reader came from, at the same scroll, when it came from there. */
    var ref = document.referrer || '';
    if (ref && ref.indexOf(location.origin) === 0 && /\/library(\.html)?([?#]|$)/.test(ref.slice(location.origin.length)) && history.length > 1) {
      event.preventDefault();
      save();
      history.back();
    }
  });

  function start() {
    paintSettings();
    if (!item) { notFound(); return; }
    document.title = item.title + ' | PFA Library';
    $('rdTitle').textContent = item.title;
    $('rdHeadText').textContent = item.title;
    $('rdTocTitle').textContent = item.title;
    $('rdTocKind').textContent = (shelf ? shelf.name : 'PFA Library');
    [$('rdDl'), $('rdTocDl')].forEach(function (a) {
      a.href = downloadHref;
      if (item.file) a.setAttribute('download', item.name || item.slug + '.pdf');
      else { a.target = '_blank'; a.rel = 'noopener'; }
    });
    var saved = loadProgress().items[slug] || null;
    var prefer = saved && saved.mode;
    if (item.edition && prefer !== 'pages') openText(saved && typeof saved.i === 'number' ? { i: saved.i, c: saved.c || 0 } : null);
    else if (item.file) openPages(saved && saved.pdfPage ? saved.pdfPage : 1);
    else if (item.edition) openText(null);
    else openDrive();
  }

  start();
}());
