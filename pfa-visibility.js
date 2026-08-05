/* PFA visibility layer
==========================================================================
Turns pages and sections off without deleting them. It runs before the page
paints, so a hidden section is never briefly visible, and it keeps links to
a hidden page from being offered anywhere in the nav, the menu or the foot.
Order of authority: what the console has saved, then the defaults shipped in
pfa-site-map.js, then visible.
========================================================================== */
(function () {
"use strict";
var KEY = "pfa_site_visibility";
var page = (location.pathname.split("/").pop() || "index.html").toLowerCase();
if (!page || page.indexOf(".") === -1) page = "index.html";
function stored() {
try {
var raw = localStorage.getItem(KEY);
if (raw) return JSON.parse(raw);
} catch (e) {}
return null;
}
var cfg = stored() || window.PFA_VISIBILITY_DEFAULTS || {};
cfg.pages = cfg.pages || {};
cfg.sections = cfg.sections || {};
function pageOff(p) { return cfg.pages[p] === false; }
function sectionOff(p, k) { var m = cfg.sections[p]; return !!m && m[k] === false; }
/* 1. this page is off: leave before anything renders */
if (page !== "index.html" && pageOff(page)) {
location.replace("index.html");
return;
}
/* 2. hide sections ahead of first paint */
var mine = cfg.sections[page] || {}, sel = [];
for (var k in mine) {
if (mine[k] === false) sel.push('[data-sec="' + k + '"]');
}
if (sel.length) {
var st = document.createElement("style");
st.setAttribute("data-pfa-visibility", "");
st.textContent = sel.join(",") + "{display:none!important}";
(document.head || document.documentElement).appendChild(st);
}
/* 3. stop offering links to pages that are off. The header and menu are
injected after this file runs, so watch for them rather than racing. */
var gone = [];
for (var p in cfg.pages) { if (cfg.pages[p] === false) gone.push(p); }
function prune(root) {
if (!gone.length) return;
var as = (root || document).querySelectorAll("a[href]");
for (var i = 0; i < as.length; i++) {
var href = (as[i].getAttribute("href") || "").split("?")[0].split("#")[0];
href = href.split("/").pop().toLowerCase();
if (href && gone.indexOf(href) > -1) {
var li = as[i].closest ? as[i].closest("li") : null;
(li || as[i]).style.display = "none";
}
}
}
function ready(fn) {
if (document.readyState !== "loading") fn();
else document.addEventListener("DOMContentLoaded", fn);
}
ready(function () {
prune(document);
if (!gone.length || !window.MutationObserver) return;
var mo = new MutationObserver(function () { prune(document); });
mo.observe(document.documentElement, { childList: true, subtree: true });
setTimeout(function () { mo.disconnect(); prune(document); }, 5000);
});
/* the console reads and writes through this */
window.PFAVisibility = {
key: KEY,
get: function () {
var c = stored() || window.PFA_VISIBILITY_DEFAULTS || {};
return { pages: c.pages || {}, sections: c.sections || {} };
},
save: function (next) {
try {
localStorage.setItem(KEY, JSON.stringify(next));
return true;
} catch (e) { return false; }
},
clear: function () {
try { localStorage.removeItem(KEY); return true; } catch (e) { return false; }
},
isPageHidden: pageOff,
isSectionHidden: sectionOff
};
})();