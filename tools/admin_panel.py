"""Add the visibility panel to the console."""
import os, re, sys

CSS = """
/* ---------------- site visibility ---------------- */
.vis-note{font-size:13px;line-height:1.65;color:var(--mut);max-width:70ch;margin:0}
.vis-card .card-h{display:flex;align-items:center;justify-content:space-between;gap:16px}
.vis-file{font-family:var(--font-d);font-size:11px;letter-spacing:.08em;color:var(--mut-2);margin-left:8px}
.vis-sw{display:inline-flex;align-items:center;gap:9px;cursor:pointer;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--mut)}
.vis-sw input{width:16px;height:16px;accent-color:var(--blue);cursor:pointer}
.vis-sw.off{color:var(--mut-2)}
.vis-always{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--mut-2)}
.vis-secs{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:2px 22px}
.vis-row{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--hair-soft);cursor:pointer;font-size:13px;color:var(--ink)}
.vis-row input{width:15px;height:15px;accent-color:var(--blue);cursor:pointer;flex:none}
.vis-row code{margin-left:auto;font-size:11px;color:var(--mut-2)}
.vis-row.off span{color:var(--mut-2);text-decoration:line-through}
.vis-actions{display:flex;gap:12px;flex-wrap:wrap;margin:22px 0 8px}
.vis-out{background:var(--porcelain);border:1px solid var(--hair);padding:16px;font-size:12px;line-height:1.6;white-space:pre-wrap;word-break:break-word;color:var(--mut);max-height:300px;overflow:auto}
"""

JS = r"""
/* ---------------- site visibility ---------------- */
NAV.push({ g:"Site", items:[ { r:"visibility", t:"Pages and sections", i:"set", cap:"settings.write" } ] });
TITLES.visibility = ["Site", "Pages and sections"];

VIEWS.visibility = function () {
  var map = (window.PFA_SITE_MAP && window.PFA_SITE_MAP.pages) || [];
  var cfg = window.PFAVisibility ? window.PFAVisibility.get() : { pages:{}, sections:{} };
  if (!map.length) {
    return Promise.resolve('<div class="empty">pfa-site-map.js is not loaded, so there is nothing to list.</div>');
  }
  var h = '<div class="card" style="margin-bottom:20px"><div class="card-h"><h3>What the site shows</h3></div>' +
          '<div class="card-b"><p class="vis-note">Turning a page off takes it off the site and stops it being linked from the nav, the menu or the foot. Turning a section off leaves the page in place and drops that block. Nothing is deleted here, so anything can be turned back on. Use <b>Copy as defaults</b> to make a change permanent in the build.</p></div></div>';
  map.forEach(function (p) {
    var pOn = cfg.pages[p.file] !== false;
    h += '<div class="card vis-card" style="margin-bottom:14px"><div class="card-h">' +
         '<h3>' + esc(p.label) + '<span class="vis-file">' + esc(p.file) + '</span></h3>' +
         (p.canHide
           ? '<label class="vis-sw' + (pOn ? '' : ' off') + '"><input type="checkbox" data-page="' + esc(p.file) + '"' + (pOn ? ' checked' : '') + '><span>' + (pOn ? 'On' : 'Off') + '</span></label>'
           : '<span class="vis-always">Always on</span>') +
         '</div>';
    if (p.sections && p.sections.length) {
      h += '<div class="card-b"><div class="vis-secs">';
      p.sections.forEach(function (s) {
        var m = cfg.sections[p.file] || {}, on = m[s.key] !== false;
        h += '<label class="vis-row' + (on ? '' : ' off') + '">' +
             '<input type="checkbox" data-page="' + esc(p.file) + '" data-key="' + esc(s.key) + '"' + (on ? ' checked' : '') + '>' +
             '<span>' + esc(s.label) + '</span><code>' + esc(s.key) + '</code></label>';
      });
      h += '</div></div>';
    }
    h += '</div>';
  });
  h += '<div class="vis-actions">' +
       '<button class="btn" id="visSave" type="button">Save</button>' +
       '<button class="btn ghost" id="visReset" type="button">Turn everything back on</button>' +
       '<button class="btn ghost" id="visExport" type="button">Copy as defaults</button></div>' +
       '<pre class="vis-out" id="visOut" hidden></pre>';
  return Promise.resolve(h);
};

WIRE.visibility = function () {
  function collect() {
    var cfg = { pages:{}, sections:{} };
    Array.prototype.forEach.call($("#view").querySelectorAll('input[type="checkbox"]'), function (cb) {
      var pg = cb.getAttribute("data-page"), key = cb.getAttribute("data-key");
      if (key) {
        if (!cb.checked) { cfg.sections[pg] = cfg.sections[pg] || {}; cfg.sections[pg][key] = false; }
      } else if (!cb.checked) { cfg.pages[pg] = false; }
    });
    return cfg;
  }
  $("#view").addEventListener("change", function (e) {
    var cb = e.target;
    if (!cb || cb.type !== "checkbox") return;
    var row = cb.parentElement;
    row.classList.toggle("off", !cb.checked);
    var s = row.querySelector("span");
    if (row.classList.contains("vis-sw") && s) s.textContent = cb.checked ? "On" : "Off";
  });
  $("#visSave").addEventListener("click", function () {
    var cfg = collect();
    if (window.PFAVisibility && window.PFAVisibility.save(cfg)) {
      var off = Object.keys(cfg.pages).length, secs = 0;
      for (var k in cfg.sections) secs += Object.keys(cfg.sections[k]).length;
      toast(off || secs ? ("Saved: " + off + " pages and " + secs + " sections off") : "Saved: everything on");
    } else { toast("Could not save"); }
  });
  $("#visReset").addEventListener("click", function () {
    if (window.PFAVisibility) window.PFAVisibility.clear();
    Array.prototype.forEach.call($("#view").querySelectorAll('input[type="checkbox"]'), function (cb) {
      cb.checked = true;
      cb.parentElement.classList.remove("off");
      var s = cb.parentElement.querySelector("span");
      if (cb.parentElement.classList.contains("vis-sw") && s) s.textContent = "On";
    });
    toast("Everything back on");
  });
  $("#visExport").addEventListener("click", function () {
    var snippet = "window.PFA_VISIBILITY_DEFAULTS = " + JSON.stringify(collect(), null, 2) + ";";
    var out = $("#visOut");
    out.textContent = "Paste this over the last line of pfa-site-map.js to ship the change:\n\n" + snippet;
    out.hidden = false;
    if (navigator.clipboard) navigator.clipboard.writeText(snippet).then(function () { toast("Copied"); }, function () {});
  });
};
renderNav();
"""


def main(root):
    path = os.path.join(root, "admin.html")
    s = open(path, encoding="utf-8").read()
    if "VIEWS.visibility" in s:
        print("admin: panel already present"); return
    if "pfa-visibility.js" not in s:
        i = s.find("</head>")
        s = s[:i] + '<script src="pfa-site-map.js"></script>\n<script src="pfa-visibility.js"></script>\n' + s[i:]
    i = s.rfind("</style>")
    s = s[:i] + CSS + s[i:]
    i = s.rfind("</script>")
    s = s[:i] + JS + s[i:]
    open(path, "w", encoding="utf-8").write(s)
    print("admin: visibility panel added")


if __name__ == "__main__":
    main(sys.argv[1])
