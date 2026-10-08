/* The PFA Library: what the shelves on library.html do in the browser.

   The shelves themselves are plain HTML, written by scripts/build-library.js,
   so they are there before this runs and without it. This adds what only the
   visitor's own browser knows: how far they have read each document (kept by
   read.html under pfa:library:v1), the Continue reading panel for the last
   one opened, and the shelf and title filters. */
(function () {
  'use strict';

  var LIB = window.PFA_LIBRARY || { shelves: [], items: [] };
  var KEY = 'pfa:library:v1';

  function $(id) { return document.getElementById(id); }

  function load() {
    try {
      var raw = window.localStorage && window.localStorage.getItem(KEY);
      var data = raw ? JSON.parse(raw) : null;
      if (data && typeof data === 'object' && data.items) return data;
    } catch (e) {}
    return { last: null, items: {} };
  }

  function bySlug(slug) {
    for (var i = 0; i < LIB.items.length; i++) if (LIB.items[i].slug === slug) return LIB.items[i];
    return null;
  }

  function pct(entry) {
    var p = Math.round(Math.max(0, Math.min(1, Number(entry.pct) || 0)) * 100);
    return p;
  }

  function progressLabel(entry) {
    if (!entry) return '';
    if (entry.pct === undefined || entry.pct === null) return 'Opened';
    if (entry.done || pct(entry) >= 99) return 'Finished';
    var p = pct(entry);
    return p < 1 ? 'Just started' : p + '% read';
  }

  function whereLabel(entry, item) {
    var bits = [];
    var pages = entry.pages || (item && item.pages);
    if (entry.page && pages) bits.push('Page ' + entry.page + ' of ' + pages);
    else if (entry.page) bits.push('Page ' + entry.page);
    var when = ago(entry.at);
    if (when) bits.push('Opened ' + when);
    return bits.join(' \u00B7 ');
  }

  function ago(at) {
    var t = Number(at);
    if (!t) return '';
    var day = 864e5;
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var diff = Math.floor((today.getTime() + day - t) / day);
    if (diff <= 0) return 'today';
    if (diff === 1) return 'yesterday';
    if (diff < 7) return diff + ' days ago';
    if (diff < 14) return 'last week';
    if (diff < 60) return Math.round(diff / 7) + ' weeks ago';
    return 'a while ago';
  }

  function readHref(slug) { return 'read.html?r=' + encodeURIComponent(slug); }

  /* ---- progress on every card ---- */
  function paintCards(state) {
    var cards = document.querySelectorAll('.book[data-slug]');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var entry = state.items[card.getAttribute('data-slug')];
      var bar = card.querySelector('.book__progress');
      var read = card.querySelector('.book__read');
      if (!entry || !bar || entry.pct === undefined || entry.pct === null) continue;
      var p = pct(entry);
      bar.hidden = false;
      bar.querySelector('.book__bar span').style.setProperty('--p', Math.max(p, 2) + '%');
      bar.querySelector('.book__pct').textContent = progressLabel(entry);
      if (read) read.textContent = entry.done || p >= 99 ? 'Read again' : 'Continue';
    }
  }

  /* ---- the Continue reading panel ---- */
  function paintContinue(state) {
    var wrap = $('libContinue');
    if (!wrap) return;
    var open = Object.keys(state.items).filter(function (slug) { return bySlug(slug); })
      .map(function (slug) { return { slug: slug, entry: state.items[slug] }; })
      .sort(function (a, b) { return (Number(b.entry.at) || 0) - (Number(a.entry.at) || 0); });
    if (!open.length) { wrap.hidden = true; return; }
    var lastSlug = state.last && state.items[state.last] && bySlug(state.last) ? state.last : open[0].slug;
    var first = null;
    for (var i = 0; i < open.length; i++) if (open[i].slug === lastSlug) first = open[i];
    var item = bySlug(first.slug);
    var href = readHref(item.slug);

    var cover = document.querySelector('.book[data-slug="' + item.slug + '"] .cover');
    var holder = $('libContinueCover');
    holder.innerHTML = '';
    if (cover) holder.appendChild(cover.cloneNode(true));
    holder.href = href;
    $('libContinueTitle').textContent = item.title;
    $('libContinueTitle').href = href;
    $('libContinueGo').href = href;
    $('libContinueGo').textContent = first.entry.done ? 'Read it again' : 'Resume reading';
    $('libContinueWhere').textContent = whereLabel(first.entry, item);
    $('libContinuePct').textContent = progressLabel(first.entry);
    var p = pct(first.entry);
    document.querySelector('.lib-continue__bar').hidden = first.entry.pct === undefined || first.entry.pct === null;

    var also = open.filter(function (o) { return o.slug !== item.slug; }).slice(0, 3);
    var list = $('libAlso');
    list.innerHTML = '';
    also.forEach(function (o) {
      var it = bySlug(o.slug);
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = readHref(o.slug);
      var t = document.createElement('span'); t.className = 'lib-also__t'; t.textContent = it.title;
      var q = document.createElement('span'); q.className = 'lib-also__p'; q.textContent = progressLabel(o.entry);
      var bar = document.createElement('span'); bar.className = 'lib-also__bar';
      var fill = document.createElement('span'); fill.style.width = Math.max(pct(o.entry), 2) + '%';
      bar.appendChild(fill);
      a.appendChild(t); a.appendChild(q); a.appendChild(bar);
      li.appendChild(a);
      list.appendChild(li);
    });
    $('libAlsoWrap').hidden = !also.length;
    wrap.hidden = false;
    var fillMain = $('libContinueBar');
    fillMain.style.width = '0%';
    requestAnimationFrame(function () { requestAnimationFrame(function () { fillMain.style.width = Math.max(p, 2) + '%'; }); });
  }

  function paint() {
    var state = load();
    paintCards(state);
    paintContinue(state);
  }

  /* ---- shelves and the find box ---- */
  var shelf = 'all';
  var query = '';

  function norm(s) { return String(s || '').toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim(); }

  function filter() {
    var words = norm(query).split(' ').filter(Boolean);
    var shown = 0;
    var sections = document.querySelectorAll('.lib-shelf');
    for (var s = 0; s < sections.length; s++) {
      var sec = sections[s];
      var inShelf = shelf === 'all' || sec.getAttribute('data-shelf') === shelf;
      var visible = 0;
      var cards = sec.querySelectorAll('.book');
      for (var c = 0; c < cards.length; c++) {
        var card = cards[c];
        var item = bySlug(card.getAttribute('data-slug')) || {};
        var hay = norm([item.title, item.kind, item.blurb].join(' '));
        var ok = inShelf && words.every(function (w) { return hay.indexOf(w) > -1; });
        card.hidden = !ok;
        if (ok) visible++;
      }
      sec.hidden = !visible;
      shown += visible;
    }
    $('libCount').textContent = shown + (shown === 1 ? ' document' : ' documents');
    $('libEmpty').hidden = shown > 0;
  }

  function setShelf(id) {
    shelf = id;
    var chips = document.querySelectorAll('.lib-filters .chip[data-shelf]');
    for (var i = 0; i < chips.length; i++) chips[i].setAttribute('aria-pressed', String(chips[i].getAttribute('data-shelf') === id));
    filter();
  }

  function wire() {
    var chips = document.querySelectorAll('.lib-filters .chip[data-shelf]');
    for (var i = 0; i < chips.length; i++) {
      chips[i].addEventListener('click', function (event) {
        setShelf(event.currentTarget.getAttribute('data-shelf'));
        var bar = document.querySelector('.lib-filters');
        if (bar && bar.getBoundingClientRect().top > 200) return;
        var shelves = $('libShelves');
        if (shelves) window.scrollTo({ top: shelves.getBoundingClientRect().top + window.pageYOffset - 160, behavior: 'smooth' });
      });
    }
    var find = $('libFind');
    if (find) {
      find.addEventListener('input', function () { query = find.value; filter(); });
      find.addEventListener('keydown', function (event) { if (event.key === 'Escape') { find.value = ''; query = ''; filter(); } });
    }
    var reset = $('libReset');
    if (reset) reset.addEventListener('click', function () { if (find) find.value = ''; query = ''; setShelf('all'); });

    /* a link straight to a shelf, library.html#shelf-research, opens on it */
    var m = /^#shelf-([a-z-]+)$/.exec(location.hash || '');
    if (m && document.querySelector('.lib-shelf[data-shelf="' + m[1] + '"]')) setShelf(m[1]);
    var total = $('libTotal');
    if (total && LIB.items.length) total.textContent = String(LIB.items.length);
  }

  wire();
  paint();
  /* Coming back from the reader with Back restores this page from the cache;
     the progress has moved since, so paint it again. */
  window.addEventListener('pageshow', function (event) { if (event.persisted) paint(); });
  window.addEventListener('storage', function (event) { if (event.key === KEY) paint(); });
}());
