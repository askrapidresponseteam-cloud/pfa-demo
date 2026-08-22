/* ==========================================================================
   CineKind - the launch layer
   --------------------------------------------------------------------------
   Builds the reel, the press wall and the season strip from the photograph
   manifest below, wires one lightbox for all of them, and applies the
   unmask-on-entry treatment to the page's big frames.

   Everything here is enhancement. Remove this file and the page still reads;
   the pictures placed in the HTML still show. Reduced motion is respected
   twice over: site.css kills the keyframes globally, and this script checks
   for itself before starting anything that moves.
   ========================================================================== */

(function(){
'use strict';

var P = window.PFA;
if(!P) return;

var STILL = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var DIR = 'media/cinekind-launch/';

/* --------------------------------------------------------------------------
   The manifest. File stems in media/cinekind-launch, captioned at the level
   of the event, which is what the banners in the photographs themselves say.
   No individual is named, because the archive did not name them.
   -------------------------------------------------------------------------- */

var LAUNCH   = 'CineKind 2025, the first season';
var CARPET   = 'CineKind 2025, the first season';
var MECON    = 'MECON 2025, Film Federation of India';
var PURBO    = 'Purbo Bharat Film Summit, CII';
var ACHIEVER = "FFI Achiever's Award evening";
var RAMP     = ACHIEVER; /* one evening: the Raj Kapoor tribute at the FFI Achiever's Award. The photographs do not split it, so neither do the captions. */

var PHOTOS = [
  {f:'cinekind-1',  c:LAUNCH},  {f:'cinekind-19', c:LAUNCH},
  {f:'cinekind-8',  c:LAUNCH},  {f:'cinekind-22', c:LAUNCH},
  {f:'cinekind-11', c:CARPET},  {f:'cinekind-2',  c:CARPET},
  {f:'cinekind-13', c:CARPET},  {f:'cinekind-4',  c:CARPET},
  {f:'cinekind-15', c:CARPET},  {f:'cinekind-16', c:CARPET},
  {f:'cinekind-17', c:CARPET},  {f:'cinekind-18', c:CARPET},
  {f:'cinekind-20', c:LAUNCH},  {f:'cinekind-21', c:LAUNCH},
  {f:'cinekind-23', c:LAUNCH},  {f:'cinekind-24', c:LAUNCH},
  {f:'cinekind-25', c:LAUNCH},  {f:'cinekind-26', c:LAUNCH},
  {f:'cinekind-27', c:LAUNCH},  {f:'cinekind-28', c:LAUNCH},
  {f:'cinekind-29', c:LAUNCH},  {f:'cinekind-3',  c:CARPET},
  {f:'cinekind-5',  c:LAUNCH},  {f:'cinekind-7',  c:LAUNCH},
  {f:'cinekind-9',  c:LAUNCH},  {f:'cinekind-10', c:LAUNCH},
  {f:'cinekind-12', c:CARPET},  {f:'cinekind-14', c:CARPET},
  {f:'mecon-1',  c:MECON}, {f:'mecon-2',  c:MECON}, {f:'mecon-3',  c:MECON},
  {f:'mecon-4',  c:MECON}, {f:'mecon-5',  c:MECON}, {f:'mecon-6',  c:MECON},
  {f:'mecon-7',  c:MECON}, {f:'mecon-8',  c:MECON}, {f:'mecon-9',  c:MECON},
  {f:'mecon-10', c:MECON}, {f:'mecon-11', c:MECON}, {f:'mecon-12', c:MECON},
  {f:'mecon-13', c:MECON},
  {f:'purbo-bharat-01', c:PURBO}, {f:'purbo-bharat-02', c:PURBO},
  {f:'purbo-bharat-03', c:PURBO}, {f:'purbo-bharat-04', c:PURBO},
  {f:'rk-1',  c:ACHIEVER}, {f:'rk-2',  c:ACHIEVER}, {f:'rk-3',  c:ACHIEVER},
  {f:'rk-4',  c:ACHIEVER}, {f:'rk-5',  c:ACHIEVER}, {f:'rk-6',  c:ACHIEVER},
  {f:'rk-7',  c:ACHIEVER}, {f:'rk-8',  c:ACHIEVER}, {f:'rk-9',  c:ACHIEVER},
  {f:'rk-10', c:ACHIEVER}, {f:'rk-11', c:RAMP},     {f:'rk-12', c:RAMP},
  {f:'rk-13', c:RAMP},     {f:'rk-14', c:RAMP},     {f:'rk-15', c:RAMP},
  {f:'rk-16', c:RAMP},     {f:'rk-17', c:RAMP},     {f:'rk-18', c:ACHIEVER},
  {f:'rk-19', c:ACHIEVER},
  {f:'cinekind-newspaper', c:'The announcement in print'}
];

function byStem(stem){
  var hit = null;
  PHOTOS.forEach(function(p){ if(p.f === stem) hit = p; });
  return hit;
}
function small(p){ return DIR + p.f + '-s.webp'; }
function large(p){ return DIR + p.f + '.webp'; }

/* --------------------------------------------------------------------------
   The reel. Two rows running opposite ways, built from a curated order so
   wide stages, scrums and ramp walks alternate. Each row's track is drawn
   twice, which is what lets a translateX(-50%) loop read as endless.
   -------------------------------------------------------------------------- */

var ROW_A = ['cinekind-1','purbo-bharat-02','cinekind-11','mecon-4','cinekind-22',
             'rk-14','cinekind-19','mecon-9','cinekind-2','purbo-bharat-03',
             'cinekind-25','rk-6'];
var ROW_B = ['mecon-1','cinekind-8','rk-12','cinekind-16','purbo-bharat-01',
             'cinekind-27','mecon-7','cinekind-13','rk-16','cinekind-23',
             'mecon-11','cinekind-4'];

function frame(stem, eager){
  var p = byStem(stem);
  if(!p) return '';
  return '<figure class="ck-frame" role="listitem">' +
    '<button class="ck-frame-open" type="button" data-open="' + p.f + '" aria-label="View larger: ' + P.escape(p.c) + '">' +
      '<span class="ck-frame-media"><img src="' + small(p) + '" alt="' + P.escape(p.c) + '"' +
      (eager ? '' : ' loading="lazy"') + ' decoding="async"></span>' +
    '</button>' +
    '<figcaption><span>' + P.escape(p.c) + '</span><span>' + P.escape(p.f.replace(/[^0-9]/g, '') || '01') + '</span></figcaption>' +
  '</figure>';
}

function buildReel(){
  var host = P.q('[data-ck-reel]');
  if(!host) return;
  function row(list, reverse, speed){
    var once = list.map(function(s, i){ return frame(s, i < 3); }).join('');
    return '<div class="ck-row' + (reverse ? ' reverse' : '') + '">' +
      '<div class="ck-track" style="--ck-speed:' + speed + 's" role="list">' + once + once + '</div>' +
    '</div>';
  }
  host.innerHTML = row(ROW_A, false, 74) + row(ROW_B, true, 88);
}

/* --------------------------------------------------------------------------
   The press wall and the season strip, placed into holes the HTML leaves.
   -------------------------------------------------------------------------- */

function wallFigure(stem, cls){
  var p = byStem(stem);
  if(!p) return '';
  return '<figure' + (cls ? ' class="' + cls + '"' : '') + '>' +
    '<button type="button" data-open="' + p.f + '" aria-label="View larger: ' + P.escape(p.c) + '">' +
      '<img src="' + small(p) + '" alt="' + P.escape(p.c) + '" loading="lazy" decoding="async">' +
    '</button>' +
    '<figcaption>' + P.escape(p.c) + '</figcaption>' +
  '</figure>';
}

function buildPress(){
  var host = P.q('[data-ck-press]');
  if(!host) return;
  host.innerHTML =
    wallFigure('cinekind-newspaper', 'ck-clipping') +
    wallFigure('cinekind-9',  'wide') +
    wallFigure('cinekind-24', '') +
    wallFigure('cinekind-21', '') +
    wallFigure('cinekind-7',  'wide');
}

function buildSeason(){
  var host = P.q('[data-ck-season]');
  if(!host) return;
  host.innerHTML =
    wallFigure('mecon-5',  'tall') +
    wallFigure('purbo-bharat-04', 'wide') +
    wallFigure('rk-13', '') +
    wallFigure('mecon-12', '') +
    wallFigure('rk-11', '') +
    wallFigure('rk-19', 'wide');
}

/* --------------------------------------------------------------------------
   One lightbox for every photograph on the page.
   -------------------------------------------------------------------------- */

var order = PHOTOS.map(function(p){ return p.f; });
var lightbox, stageImg, cap, count, at = 0, lastFocus = null;

function ensureLightbox(){
  if(lightbox) return;
  lightbox = document.createElement('div');
  lightbox.className = 'ck-lightbox';
  lightbox.setAttribute('role', 'dialog');
  lightbox.setAttribute('aria-modal', 'true');
  lightbox.setAttribute('aria-label', 'Photograph viewer');
  lightbox.innerHTML =
    '<div class="ck-lightbox-top">' +
      '<span data-lb-count></span>' +
      '<button class="ck-lightbox-close" type="button" data-lb-close>Close</button>' +
    '</div>' +
    '<div class="ck-lightbox-stage"><img alt="" data-lb-img></div>' +
    '<div class="ck-lightbox-foot">' +
      '<span class="ck-lightbox-cap" data-lb-cap></span>' +
      '<div class="ck-lightbox-nav">' +
        '<button type="button" data-lb-prev aria-label="Previous photograph">\u2190</button>' +
        '<button type="button" data-lb-next aria-label="Next photograph">\u2192</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(lightbox);
  stageImg = P.q('[data-lb-img]', lightbox);
  cap = P.q('[data-lb-cap]', lightbox);
  count = P.q('[data-lb-count]', lightbox);

  P.q('[data-lb-close]', lightbox).onclick = closeBox;
  P.q('[data-lb-prev]', lightbox).onclick = function(){ step(-1); };
  P.q('[data-lb-next]', lightbox).onclick = function(){ step(1); };
  lightbox.addEventListener('click', function(e){ if(e.target === lightbox) closeBox(); });
  document.addEventListener('keydown', function(e){
    if(!lightbox.classList.contains('open')) return;
    if(e.key === 'Escape') closeBox();
    if(e.key === 'ArrowLeft') step(-1);
    if(e.key === 'ArrowRight') step(1);
  });
}

function show(dir){
  var p = byStem(order[at]);
  if(!p) return;
  stageImg.classList.remove('slide');
  stageImg.style.setProperty('--dir', (dir < 0 ? '-24px' : '24px'));
  stageImg.src = large(p);
  stageImg.alt = p.c;
  if(!STILL){ void stageImg.offsetWidth; stageImg.classList.add('slide'); }
  cap.textContent = p.c;
  count.textContent = (at + 1) + ' / ' + order.length;
}

function openBox(stem){
  ensureLightbox();
  at = Math.max(0, order.indexOf(stem));
  lastFocus = document.activeElement;
  lightbox.classList.add('open');
  document.body.classList.add('locked');
  show(1);
  P.q('[data-lb-close]', lightbox).focus();
}

function closeBox(){
  lightbox.classList.remove('open');
  document.body.classList.remove('locked');
  if(lastFocus && lastFocus.focus) lastFocus.focus();
}

function step(dir){
  at = (at + dir + order.length) % order.length;
  show(dir);
}

document.addEventListener('click', function(e){
  var b = e.target.closest && e.target.closest('[data-open]');
  if(b) openBox(b.dataset.open);
});

/* --------------------------------------------------------------------------
   Unmasking. The page's big frames start closed and open as they arrive.
   Applied by script so a page without script never hides a picture, and a
   frame already in the viewport at load is opened immediately rather than
   made to wait for a scroll it will never get.
   -------------------------------------------------------------------------- */

function unmask(){
  if(STILL) return;
  var picks = P.qa(
    '.ck-about-image, .ck-winner-media, .ck-gallery figure, ' +
    '[data-ck-press] figure, [data-ck-season] figure, .ck-strip-frame, .ck-kindset-image'
  );
  var waiting = [];

  function open(el, delay){
    if(el.dataset.ckIn) return;
    el.dataset.ckIn = '1';
    setTimeout(function(){ el.classList.add('in'); }, delay || 0);
  }

  picks.forEach(function(el, i){
    el.classList.add('ck-unmask');
    if(el.classList.contains('ck-about-image') || el.classList.contains('ck-kindset-image')){
      el.classList.add('ck-dolly');
    }
    var r = el.getBoundingClientRect();
    if(r.top < innerHeight && r.bottom > 0){
      open(el, 120 + (i % 4) * 110);
    } else {
      waiting.push(el);
    }
  });

  /* Belt and braces. IntersectionObserver where it works; a passive scroll
     sweep regardless, because a picture that never appears is a worse
     failure than an animation that fires a frame late. The sweep retires
     itself once everything has opened. */
  if('IntersectionObserver' in window){
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if(en.isIntersecting){ open(en.target); io.unobserve(en.target); }
      });
    }, {threshold: .15});
    waiting.forEach(function(el){ io.observe(el); });
  }

  var ticking = false;
  function sweep(){
    ticking = false;
    var vh = innerHeight;
    waiting = waiting.filter(function(el){
      if(el.dataset.ckIn) return false;
      var r = el.getBoundingClientRect();
      if(r.top < vh * .94 && r.bottom > 0){ open(el); return false; }
      return true;
    });
    if(!waiting.length){
      removeEventListener('scroll', onScroll);
      removeEventListener('resize', onScroll);
    }
  }
  function onScroll(){
    if(!ticking){ ticking = true; requestAnimationFrame(sweep); }
  }
  addEventListener('scroll', onScroll, {passive: true});
  addEventListener('resize', onScroll, {passive: true});
  sweep();
}

/* --------------------------------------------------------------------------
   Hero dressing: the projector sweep and the grain, added by script so the
   markup carries no decoration.
   -------------------------------------------------------------------------- */

function dressHero(){
  P.qa('.ck-hero').forEach(function(hero){
    if(!P.q('.ck-grain', hero)){
      var g = document.createElement('span');
      g.className = 'ck-grain';
      g.setAttribute('aria-hidden', 'true');
      hero.appendChild(g);
    }
    if(!P.q('.ck-light', hero)){
      var l = document.createElement('span');
      l.className = 'ck-light';
      l.setAttribute('aria-hidden', 'true');
      hero.appendChild(l);
    }
  });
}

buildReel();
buildPress();
buildSeason();
dressHero();
unmask();

})();
