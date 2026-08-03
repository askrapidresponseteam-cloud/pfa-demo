/* PFA site header - one widget, every page.

   Drop this where the header belongs:

       <script src="pfa-header.js"></script>

   It prints the bar, the menu and their behaviour at that exact spot, so no
   page carries a copy. Change a link here and it changes everywhere.

   The rail carries two links by design: Store and Partner. The search field
   and the menu button sit beside them. Everything else lives in the menu.

   Load order note: this is a plain script, not deferred, so the header is in
   the DOM before pfa-search.js boots and mounts the search field into it.
*/
(function () {
  "use strict";

  if (window.__pfaHeader) return;
  window.__pfaHeader = 1;

  /* ------------------------------------------------------------------
     1. The rail. Two links, then search and the menu button.
     ------------------------------------------------------------------ */
  var RAIL = [
    ["Store", "store.html"],
    ["Partner", "csr.html"]
  ];

  /* ------------------------------------------------------------------
     2. The menu. Four columns, in reading order. Unchanged.
     ------------------------------------------------------------------ */
  var MENU = [
    [{ k: "Act", links: [
      ["Reach PFA", "network.html"],
      ["Adopt", "adopt.html"],
      ["Give", "give.html"],
      ["Trusted Services", "services.html"],
      ["Heat Map", "heatmap.html"]
    ]}],
    [{ k: "Belong", links: [
      ["Become a Patron", "membership.html"],
      ["Get Involved", "get-involved.html"],
      ["The Assembly", "assembly.html"],
      ["The Wildlife Gauntlet", "champion.html"]
    ]}],
    [{ k: "Learn", links: [
      ["The Learning Center", "learning-center.html"],
      ["Stories", "stories.html"],
      ["Watch. Listen. Do. Meet.", "watch-listen-do-meet.html"],
      ["The Founder", "founder.html"],
      ["Hall of Fame", "hall-of-fame.html"]
    ]}],
    [
      { k: "Partner", links: [
        ["Corporate Partnership", "csr.html"],
        ["PFA X Certification", "pfa-x.html"]
      ]},
      { k: "Shop", links: [
        ["The Store", "store.html"],
        ["The Pharmacy", "store.html#/c/pharmacy"]
      ]}
    ]
  ];

  var PATRON = "membership.html";
  var STRAP = "India's largest animal welfare organisation - since 1992";

  /* ------------------------------------------------------------------
     3. Styles. The bar sits on dark glass, so everything in it is set in
        white alphas. Search and the menu button are the same 44px square
        with the same hairline, so the right edge reads as one group.
     ------------------------------------------------------------------ */
  var CSS = [
    /* --- the bar --- */
    ".pfa-nav,.pfa-nav *{box-sizing:border-box;border-radius:0!important;margin:0}",
    ".pfa-nav{position:fixed;top:0;left:0;right:0;z-index:1000;height:76px;background:rgba(14,17,22,.6);-webkit-backdrop-filter:blur(14px) saturate(1.4);backdrop-filter:blur(14px) saturate(1.4);border-bottom:1px solid rgba(255,255,255,.1);transition:background .4s cubic-bezier(.2,.6,.2,1),border-color .4s cubic-bezier(.2,.6,.2,1),box-shadow .4s cubic-bezier(.2,.6,.2,1)}",
    ".pfa-nav.scrolled{background:rgba(14,17,22,.72);border-bottom-color:rgba(255,255,255,.14);box-shadow:0 8px 24px -16px rgba(14,17,22,.18)}",
    ".pfa-nav-in{max-width:1220px;height:76px;margin:0 auto;padding:0 clamp(20px,4vw,48px);display:flex;align-items:center;gap:clamp(14px,1.7vw,24px)}",

    /* --- brand holds the left, the rest rides the right edge --- */
    ".pfa-brand{order:0;display:flex;align-items:center;gap:13px;flex:none;margin-right:auto;text-decoration:none;color:#fff}",
    ".pfa-emblem{display:inline-block;width:32px;height:29px;flex:none;background-image:url(\"media/pfa-emblem.png\");background-image:image-set(url(\"media/pfa-emblem.webp\") type(\"image/webp\"),url(\"media/pfa-emblem.png\") type(\"image/png\"));background-size:contain;background-repeat:no-repeat;background-position:center;transition:transform .4s cubic-bezier(.2,.6,.2,1)}",
    ".pfa-brand:hover .pfa-emblem{transform:translateY(-1px)}",
    ".pfa-brand-name{font-family:var(--font-s,'Marcellus',Georgia,serif);font-weight:700;font-size:13px;letter-spacing:.22em;text-transform:uppercase;white-space:nowrap;color:#fff;line-height:1;-webkit-text-stroke:.4px #fff}",

    /* --- the two links --- */
    ".pfa-links{order:2;display:flex;align-items:center;gap:clamp(20px,2.1vw,32px);flex:none}",
    ".pfa-links a{position:relative;font-family:var(--font-d,'Archivo',system-ui,sans-serif);font-size:12px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.72);text-decoration:none;white-space:nowrap;line-height:1;padding:6px 0;transition:color .25s cubic-bezier(.2,.6,.2,1)}",
    ".pfa-links a::after{content:\"\";position:absolute;left:0;right:0;bottom:0;height:1px;background:currentColor;transform:scaleX(0);transform-origin:left;transition:transform .3s cubic-bezier(.2,.6,.2,1)}",
    ".pfa-links a:hover{color:#fff}",
    ".pfa-links a:hover::after{transform:scaleX(1)}",
    ".pfa-links a[aria-current=page]{color:#00A4FF}",
    ".pfa-links a[aria-current=page]::after{transform:scaleX(1)}",

    /* --- menu button, unchanged --- */
    ".pfa-burger{order:4;display:block;flex:none;margin-left:clamp(4px,.6vw,8px);background:0 0;border:1px solid rgba(255,255,255,.24);width:44px;height:44px;cursor:pointer;position:relative;padding:0;transition:border-color .3s cubic-bezier(.2,.6,.2,1)}",
    ".pfa-burger:hover{border-color:#fff}",
    ".pfa-burger span{position:absolute;left:11px;right:11px;height:2px;background:#fff;transition:transform .3s cubic-bezier(.2,.6,.2,1),opacity .3s cubic-bezier(.2,.6,.2,1)}",
    ".pfa-burger span:first-child{top:15px}",
    ".pfa-burger span:nth-child(2){top:21px}",
    ".pfa-burger span:nth-child(3){top:27px}",
    ".pfa-burger.open span:first-child{transform:translateY(6px) rotate(45deg)}",
    ".pfa-burger.open span:nth-child(2){opacity:0}",
    ".pfa-burger.open span:nth-child(3){transform:translateY(-6px) rotate(-45deg)}",

    /* --- search, mounted by pfa-search.js, dressed for the dark bar here.
           Three class levels so these win over that file's own defaults. --- */
    ".pfa-nav .pfa-nav-in .pfa-searchbar{order:1;display:flex;align-items:center;gap:10px;flex:0 1 auto;width:clamp(190px,22vw,320px);min-width:0;height:44px;padding:0 14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.18);cursor:text;transition:border-color .25s cubic-bezier(.2,.6,.2,1),background .25s cubic-bezier(.2,.6,.2,1)}",
    ".pfa-nav .pfa-nav-in .pfa-searchbar:hover{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.44)}",
    ".pfa-nav .pfa-nav-in .pfa-searchbar input{flex:1 1 auto;width:auto;min-width:0;height:100%;padding:0;border:0;outline:0;background:0 0;box-shadow:none;font-family:var(--font-d,'Archivo',system-ui,sans-serif);font-size:12.5px;letter-spacing:.02em;color:#fff;cursor:text}",
    ".pfa-nav .pfa-nav-in .pfa-searchbar input::placeholder{color:rgba(255,255,255,.6);opacity:1}",
    ".pfa-nav .pfa-nav-in .pfa-searchbar .pfa-mag{flex:none;color:rgba(255,255,255,.6)}",
    ".pfa-nav .pfa-nav-in .pfa-searchbar:hover .pfa-mag{color:#fff}",
    ".pfa-nav .pfa-nav-in .pfa-searchbar kbd{display:none}",
    ".pfa-nav .pfa-nav-in .pfa-sicon{order:3;flex:none;width:44px;height:44px;align-items:center;justify-content:center;margin:0;background:0 0;border:1px solid rgba(255,255,255,.24);color:#fff;cursor:pointer;transition:border-color .3s cubic-bezier(.2,.6,.2,1)}",
    ".pfa-nav .pfa-nav-in .pfa-sicon:hover{border-color:#fff}",

    /* --- what gives way, and in what order --- */
    "@media (min-width:901px){.pfa-nav .pfa-nav-in .pfa-searchbar{display:flex}.pfa-nav .pfa-nav-in .pfa-sicon{display:none}}",
    "@media (max-width:900px){.pfa-nav .pfa-nav-in .pfa-searchbar{display:none}.pfa-nav .pfa-nav-in .pfa-sicon{display:inline-flex}}",
    "@media (max-width:639px){.pfa-nav .pfa-links{display:none}}",
    "@media (max-width:400px){.pfa-brand{gap:10px}.pfa-brand-name{font-size:11.5px;letter-spacing:.18em}}",

    ".pfa-nav a:focus-visible,.pfa-nav button:focus-visible{outline:2px solid #00A4FF;outline-offset:3px}",
    "@media (prefers-reduced-motion:reduce){.pfa-nav,.pfa-nav *{transition:none!important}}",

    /* --- the menu, unchanged --- */
    ".pfa-menu,.pfa-menu *{box-sizing:border-box;border-radius:0!important;margin:0}",
    ".pfa-menu{position:fixed;inset:76px 0 0 0;background:#0E1116;z-index:999;overflow-y:auto;overscroll-behavior:contain;opacity:0;visibility:hidden;pointer-events:none;transition:opacity .35s cubic-bezier(.2,.6,.2,1),visibility 0s linear .35s}",
    ".pfa-menu.open{opacity:1;visibility:visible;pointer-events:auto;transition-delay:0s}",
    ".pm-in{max-width:1220px;margin:0 auto;padding:clamp(34px,5.5vh,60px) clamp(20px,4vw,48px) clamp(48px,7vh,72px)}",
    ".pm-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:clamp(30px,4vw,52px) clamp(24px,3vw,44px)}",
    ".pm-col{min-width:0}",
    ".pm-g+.pm-g{margin-top:clamp(28px,4vh,40px)}",
    ".pm-k{font-family:var(--font-s,'Marcellus',Georgia,serif);font-size:11px;font-weight:400;letter-spacing:.24em;text-transform:uppercase;color:var(--mut-2,#6E7883);margin:0 0 10px;line-height:1.2}",
    ".pm-g a{display:block;font-family:var(--font-d,'Archivo',system-ui,sans-serif);font-weight:700;font-size:15px;letter-spacing:.02em;color:var(--ink,#F4F6F7);text-decoration:none;line-height:1.35;padding:11px 0;border-bottom:1px solid var(--hair-soft,rgba(255,255,255,.08));transition:color .25s cubic-bezier(.2,.6,.2,1)}",
    ".pm-g a:hover{color:var(--blue-ink,#5BC4FF)}",
    ".pm-g a[aria-current=page]{color:var(--blue-ink,#5BC4FF)}",
    ".pm-foot{margin-top:clamp(36px,6vh,56px);display:flex;align-items:center;justify-content:space-between;gap:20px 28px;flex-wrap:wrap}",
    ".pfa-menu a.pfa-btn{position:relative;overflow:hidden;display:inline-flex;align-items:center;justify-content:center;font-family:var(--font-d,'Archivo',system-ui,sans-serif);font-weight:700;font-size:13px;letter-spacing:.14em;text-transform:uppercase;padding:16px 30px;background:var(--ink,#F4F6F7);color:#0E1116;border:1px solid var(--ink,#F4F6F7);line-height:1;text-decoration:none;cursor:pointer;transition:color .3s cubic-bezier(.2,.6,.2,1),border-color .3s cubic-bezier(.2,.6,.2,1)}",
    ".pfa-menu a.pfa-btn::before{content:\"\";position:absolute;inset:0;background:var(--blue,#00A4FF);transform:scaleX(0);transform-origin:left;transition:transform .35s cubic-bezier(.2,.6,.2,1)}}",
    ".pfa-menu a.pfa-btn:hover::before{transform:scaleX(1)}",
    ".pfa-menu a.pfa-btn:hover{color:var(--ink,#F4F6F7);border-color:var(--blue,#00A4FF)}",
    ".pfa-menu a.pfa-btn span{position:relative;z-index:1}",
    ".pm-meta{font-family:var(--font-s,'Marcellus',Georgia,serif);font-size:12px;letter-spacing:.08em;color:var(--mut,#8B959E)}",
    ".pfa-menu .pm-col,.pfa-menu .pm-foot{opacity:0;transform:translateY(12px);transition:opacity .4s cubic-bezier(.2,.6,.2,1),transform .4s cubic-bezier(.2,.6,.2,1)}",
    ".pfa-menu.open .pm-col,.pfa-menu.open .pm-foot{opacity:1;transform:translateY(0)}",
    ".pfa-menu.open .pm-col:nth-child(1){transition-delay:.05s}",
    ".pfa-menu.open .pm-col:nth-child(2){transition-delay:.11s}",
    ".pfa-menu.open .pm-col:nth-child(3){transition-delay:.17s}",
    ".pfa-menu.open .pm-col:nth-child(4){transition-delay:.23s}",
    ".pfa-menu.open .pm-foot{transition-delay:.3s}",
    ".pfa-menu a:focus-visible{outline:2px solid var(--blue-ink,#5BC4FF);outline-offset:3px}",
    "@media (max-width:1023px){.pm-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.pm-g a{font-size:16px;padding:13px 0}}",
    "@media (max-width:639px){.pm-grid{grid-template-columns:minmax(0,1fr)}.pm-g a{font-size:17px}.pm-foot{margin-top:32px}.pfa-menu a.pfa-btn{width:100%}}",
    "@media (prefers-reduced-motion:reduce){.pfa-menu,.pfa-menu .pm-col,.pfa-menu .pm-foot{transition:none!important}.pfa-menu .pm-col,.pfa-menu .pm-foot{opacity:1;transform:none}}"
  ].join("");

  /* ------------------------------------------------------------------
     4. Markup
     ------------------------------------------------------------------ */
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function link(pair) {
    return '<a href="' + esc(pair[1]) + '">' + esc(pair[0]) + "</a>";
  }

  var HEADER =
    '<header class="pfa-nav" id="nav">' +
      '<div class="pfa-nav-in">' +
        '<a class="pfa-brand" href="index.html" aria-label="People for Animals - home">' +
          '<span class="pfa-emblem" role="img" aria-label="People for Animals emblem"></span> ' +
          '<span class="pfa-brand-name">People for Animals</span>' +
        "</a>" +
        '<nav class="pfa-links" aria-label="Primary">' + RAIL.map(link).join(" ") + "</nav>" +
        '<button class="pfa-burger" id="burger" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="mobileMenu">' +
          "<span></span><span></span><span></span>" +
        "</button>" +
      "</div>" +
    "</header>";

  var MENU_HTML =
    '<nav class="pfa-menu" id="mobileMenu" aria-label="Site menu">' +
      '<div class="pm-in"><div class="pm-grid">' +
        MENU.map(function (col) {
          return '<div class="pm-col">' + col.map(function (g) {
            return '<div class="pm-g"><p class="pm-k">' + esc(g.k) + "</p>" + g.links.map(link).join("") + "</div>";
          }).join("") + "</div>";
        }).join("") +
      "</div>" +
      '<div class="pm-foot">' +
        '<a href="' + PATRON + '" class="pfa-btn"><span>Become a Patron</span></a>' +
        '<p class="pm-meta">' + esc(STRAP) + "</p>" +
      "</div></div>" +
    "</nav>";

  /* ------------------------------------------------------------------
     5. Print it where this script sits, so the bar is there on first paint
     ------------------------------------------------------------------ */
  var style = document.createElement("style");
  style.id = "pfa-header-css";
  style.textContent = CSS;
  (document.head || document.documentElement).appendChild(style);

  var slot = document.currentScript;
  if (slot && slot.parentNode) slot.insertAdjacentHTML("afterend", HEADER + MENU_HTML);
  else (document.body || document.documentElement).insertAdjacentHTML("afterbegin", HEADER + MENU_HTML);

  var nav = document.getElementById("nav"),
      burger = document.getElementById("burger"),
      menu = document.getElementById("mobileMenu");

  /* ------------------------------------------------------------------
     6. Behaviour
     ------------------------------------------------------------------ */

  /* mark the page you are on */
  var here = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  Array.prototype.forEach.call(document.querySelectorAll(".pfa-links a, .pfa-menu a"), function (a) {
    var target = (a.getAttribute("href") || "").split("#")[0].toLowerCase();
    if (target && target === here && !a.classList.contains("pfa-btn")) a.setAttribute("aria-current", "page");
  });

  /* the bar firms up once you leave the top */
  if (nav) {
    var ticking = false;
    var onScroll = function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        nav.classList.toggle("scrolled", (window.scrollY || window.pageYOffset) > 12);
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* the menu, and holding the page still while it is open */
  if (burger && menu) {
    var y = 0;

    function lock() {
      y = window.scrollY || window.pageYOffset;
      var b = document.body.style;
      b.position = "fixed";
      b.top = -y + "px";
      b.left = "0";
      b.right = "0";
      b.width = "100%";
      b.overflow = "hidden";
    }

    function unlock() {
      var b = document.body.style;
      b.position = b.top = b.left = b.right = b.width = b.overflow = "";
      void document.body.offsetHeight;
      var r = document.documentElement, prev = r.style.scrollBehavior;
      r.style.scrollBehavior = "auto";
      window.scrollTo(0, y);
      r.style.scrollBehavior = prev;
    }

    function setOpen(open) {
      menu.classList.toggle("open", open);
      burger.classList.toggle("open", open);
      burger.setAttribute("aria-expanded", open ? "true" : "false");
      burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      if (open) lock(); else unlock();
    }

    burger.addEventListener("click", function () {
      setOpen(!menu.classList.contains("open"));
    });

    Array.prototype.forEach.call(menu.querySelectorAll("a"), function (a) {
      a.addEventListener("click", function () {
        if (menu.classList.contains("open")) setOpen(false);
      });
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && menu.classList.contains("open")) {
        setOpen(false);
        burger.focus();
      }
    });
  }
})();
