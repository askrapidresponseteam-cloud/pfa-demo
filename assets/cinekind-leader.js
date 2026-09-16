/* The CineKind film leader, from the home page's link to the trophy.
   ------------------------------------------------------------------------
   The leader is the owner's (15 Sep 2026): the page opens the way a print
   does, with the Academy countdown - crosshairs, two circles, the sweep,
   3-2-1 at 700ms a beat - then the frame burns off into the marquee. A real
   leader is for the projectionist, and this one is two seconds of black in
   front of a page that says the name in 100px type straight after. Black is
   the film leader's own colour and the loader is transient; it does not
   join the page's surfaces. Injected, so a browser without scripts never
   meets it; skipped whole for reduced motion; torn out of the DOM when done.

   What changed on 16 Sep 2026 (v1.356), and why it lives in a file now:

   1. It ran last. It was the final script on cinekind.html, so the browser
      painted the header and the trophy first and the black frame landed on
      a page already on screen: page, then black, then page again. The page
      now mounts it as the first thing in the body, and a line in the head
      paints the root black until it does.

   2. It started late. A click on CineKind on the home page did nothing
      visible until cinekind.html had arrived. The count now starts on the
      click itself, on the home page, and the CineKind page is fetched while
      it runs, so the trophy is ready by the time the count is done.

   3. One count, never two. The home page counts 3, 2, 1, notes the time in
      sessionStorage and goes. The CineKind page reads that note once, opens
      on the same last frame the home page left on screen, and only burns
      off. A reload, a direct visit, a link from any other page, or a note
      older than FRESH gets the whole count. Where the tab cannot keep the
      note at all, the home page does not count and lets the link go, so
      the CineKind page counts once for itself.

   One file draws the leader for both pages, so the frame the home page
   leaves on and the frame the CineKind page opens on are the same frame.

     <script src="assets/cinekind-leader.js" data-leader="page">
       cinekind.html, first in the body, not deferred: it has to be up
       before anything under it can paint.
     <script src="assets/cinekind-leader.js" data-leader="link" data-plate="..." defer>
       index.html. data-plate is the photograph the leader burns off into,
       warmed while the count runs; test/cinekind-leader.test.js holds it
       to the plate cinekind.html actually shows.

   A click that means a new tab or window (Ctrl, Cmd, Shift, Alt, or any
   button but the first) is the browser's, and so is every link that is not
   the CineKind page on this site. test/cinekind-leader.test.js drives all
   of it. */

(function () {
  'use strict';

  var script = document.currentScript;
  var mode = script ? script.getAttribute('data-leader') : '';

  var KEY = 'pfa:cinekind-leader';
  var BEAT = 700;
  var COUNT = 3;
  /* How long a hand-over note stays good. The count is 2.1s and the page it
     hands to usually paints within a second of it; fifteen covers a slow
     connection without letting an abandoned click skip a later count. */
  var FRESH = 15000;
  /* The longest the last frame holds for the photograph. Burning off into a
     plate that has not arrived shows the marquee's black ground and then the
     trophy popping in, which is exactly the untidiness this file removes. */
  var PLATE_WAIT = 1200;
  var FADE = 450;
  /* cinekind.html defines --display; the home page does not, so the stack is
     spelled out behind it, matched fallbacks first as fout.test.js asks. */
  var FACE = "var(--display,Marcellus,'Marcellus Fallback','Marcellus Fallback Times',Georgia,'Times New Roman',serif)";

  function stillPlease() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* The drawn cursor reads the ground under it; a black frame arriving under
     a resting hand should not leave an ink chevron on black. */
  function recolour() {
    var chrome = window.PFA_CHROME;
    if (chrome && typeof chrome.recolourCursor === 'function') chrome.recolourCursor();
  }

  function build() {
    var ring = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);border-radius:50%;';
    var wrap = document.createElement('div');
    wrap.className = 'ck-leader';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.setAttribute('data-cursor', 'light');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:300;background:#0a0a0a;color:#fff;' +
      'display:flex;align-items:center;justify-content:center;will-change:opacity;transition:opacity ' + FADE + 'ms ease';
    wrap.innerHTML =
      '<div style="position:absolute;left:50%;top:0;bottom:0;width:1px;background:rgba(255,255,255,.22)"></div>' +
      '<div style="position:absolute;top:50%;left:0;right:0;height:1px;background:rgba(255,255,255,.22)"></div>' +
      '<div class="ck-leader__sweep" style="' + ring + 'width:min(52vmin,560px);height:min(52vmin,560px)"></div>' +
      '<div style="' + ring + 'width:min(52vmin,560px);height:min(52vmin,560px);border:1px solid rgba(255,255,255,.3)"></div>' +
      '<div style="' + ring + 'width:min(38vmin,410px);height:min(38vmin,410px);border:1px solid rgba(255,255,255,.25)"></div>' +
      '<div class="ck-leader__num" style="position:relative;font-family:' + FACE + ';font-size:min(30vmin,300px);line-height:1">3</div>';
    return wrap;
  }

  function sweep(dial, degrees) {
    dial.style.background = 'conic-gradient(rgba(90,120,95,.28) ' + degrees + 'deg, transparent ' + degrees + 'deg)';
  }

  /* The frame every count ends on and a handed-over page opens on: the 1,
     with the sweep all the way round. */
  function lastFrame(wrap) {
    wrap.querySelector('.ck-leader__num').textContent = '1';
    sweep(wrap.querySelector('.ck-leader__sweep'), 360);
  }

  function count(wrap, done) {
    var num = wrap.querySelector('.ck-leader__num');
    var dial = wrap.querySelector('.ck-leader__sweep');
    var t0 = null;
    var over = false;
    function end() {
      if (over) return;
      over = true;
      lastFrame(wrap);
      done();
    }
    function tick(t) {
      if (over) return;
      if (t0 === null) t0 = t;
      var elapsed = t - t0;
      var n = COUNT - Math.floor(elapsed / BEAT);
      if (n < 1) { end(); return; }
      num.textContent = String(n);
      sweep(dial, ((elapsed % BEAT) / BEAT) * 360);
      window.requestAnimationFrame(tick);
    }
    window.requestAnimationFrame(tick);
    /* A tab sent to the background stops sending frames; the clock does not
       stop, so the count still ends. The margin keeps a slow first frame from
       clipping the last beat. */
    window.setTimeout(end, COUNT * BEAT + 1000);
  }

  function unpaint() {
    document.documentElement.style.removeProperty('background-color');
  }

  /* Calls go once the page under the leader is ready to be seen: the
     document parsed, then the marquee's photograph loaded and decoded (or
     failed, or PLATE_WAIT passed), then a fresh frame to start the fade on.

     The parse comes first on purpose. Fading as soon as the photograph was
     ready was tried, and in Chromium at 1280x800 the page was still running
     its own scripts then: the 450ms fade was swallowed into a single-frame
     cut, onto a header that had not finished laying out (recorded frame by
     frame, 16 Sep 2026). The leader counts from the top of the body, so on
     a direct visit the parse is long done by the end of the count; a
     handed-over page holds the last frame a few hundred milliseconds. */
  function plateReady(go) {
    var fired = false;
    function once() {
      if (fired) return;
      fired = true;
      window.requestAnimationFrame(function () { go(); });
    }
    function decoded(plate) {
      if (typeof plate.decode === 'function' && plate.naturalWidth) plate.decode().then(once, once);
      else once();
    }
    function look() {
      var plate = document.querySelector('.marquee__plate');
      if (!plate) { once(); return; }
      window.setTimeout(once, PLATE_WAIT);
      if (plate.complete) { decoded(plate); return; }
      plate.addEventListener('load', function () { decoded(plate); });
      plate.addEventListener('error', once);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', look);
    else look();
  }

  function burnOff(wrap, overflow) {
    /* fading, it is a picture, not a wall: a click during the fade reaches the page */
    wrap.style.pointerEvents = 'none';
    wrap.style.opacity = '0';
    window.setTimeout(function () {
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      document.documentElement.style.overflow = overflow;
      recolour();
    }, FADE + 30);
  }

  /* cinekind.html */
  function page() {
    if (stillPlease() || !document.body) { unpaint(); return; }
    var handed = false;
    try {
      var at = Number(window.sessionStorage.getItem(KEY));
      window.sessionStorage.removeItem(KEY);
      var age = Date.now() - at;
      handed = at > 0 && age >= 0 && age < FRESH;
    } catch (e) {}
    var root = document.documentElement;
    var overflow = root.style.overflow;
    var wrap = build();
    document.body.appendChild(wrap);
    root.style.overflow = 'hidden';
    unpaint();
    if (handed) {
      lastFrame(wrap);
      plateReady(function () { burnOff(wrap, overflow); });
    } else {
      count(wrap, function () {
        plateReady(function () { burnOff(wrap, overflow); });
      });
    }
  }

  /* index.html */
  function link() {
    var plate = script.getAttribute('data-plate');
    var busy = false;
    var wrap = null;
    var overflow = '';
    var giveBack = 0;

    function destination(a) {
      if (a.target && a.target !== '_self') return null;
      if (a.hasAttribute('download')) return null;
      var url;
      try { url = new URL(a.href, window.location.href); } catch (e) { return null; }
      if (url.origin !== window.location.origin) return null;
      /* cinekind.html in the tree, /cinekind once Vercel's cleanUrls has it */
      return /\/cinekind(\.html)?$/.test(url.pathname) ? url : null;
    }

    function remembers() {
      try {
        window.sessionStorage.setItem(KEY, '0');
        window.sessionStorage.removeItem(KEY);
        return true;
      } catch (e) {
        return false;
      }
    }

    function warm(href) {
      var hint = document.createElement('link');
      hint.rel = 'prefetch';
      hint.href = href;
      document.head.appendChild(hint);
      if (plate) new Image().src = plate;
    }

    /* Back to this page with the leader still on it: from the back-forward
       cache, or because the page that was asked for never came. */
    function restore() {
      window.clearTimeout(giveBack);
      if (wrap) {
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
        document.documentElement.style.overflow = overflow;
        wrap = null;
      }
      busy = false;
      recolour();
    }

    document.addEventListener('click', function (event) {
      if (event.defaultPrevented || event.button !== 0 ||
          event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      var a = event.target && event.target.closest ? event.target.closest('a[href]') : null;
      var url = a ? destination(a) : null;
      if (!url) return;
      if (busy) { event.preventDefault(); return; }
      if (stillPlease() || !remembers()) return;
      event.preventDefault();
      busy = true;
      warm(url.href);
      wrap = build();
      overflow = document.documentElement.style.overflow;
      document.body.appendChild(wrap);
      document.documentElement.style.overflow = 'hidden';
      recolour();
      count(wrap, function () {
        try { window.sessionStorage.setItem(KEY, String(Date.now())); } catch (e) {}
        window.location.assign(url.href);
        /* A stopped or failed load leaves this page in place under a frozen
           frame; after ten seconds it gets its page back. */
        giveBack = window.setTimeout(restore, 10000);
      });
    });

    window.addEventListener('pageshow', function (event) {
      if (!event.persisted) return;
      try { window.sessionStorage.removeItem(KEY); } catch (e) {}
      restore();
    });
  }

  if (mode === 'page') page();
  else if (mode === 'link') link();
})();
