"""Put the right-click guard on every public page, from one file.

Sixteen pages carried their own copy of a guard inline and four carried none,
so the site behaved differently depending on where you were. This replaces all
of them with a single script.

Two deliberate exemptions:

  admin.html   The console is the back office, not public content. Staff paste
               into it, copy record ids out of it and open dev tools against
               it. Blocking that costs the people running the site and protects
               nothing, since the console is behind a sign-in.

  form fields  Right-click inside an input, textarea or contenteditable still
               opens the menu, so paste keeps working in the card journey, the
               seat booking and every enquiry form. The old guard already made
               this exemption for text selection; this extends the same intent.

Worth saying plainly: this is a deterrent, not protection. Anyone can read the
page source, and the images and films are still fetchable from the network tab.
It raises the effort, nothing more.
"""
import glob
import os
import re
import sys

GUARD = r"""/* PFA content guard - loaded on every public page.
   A deterrent, not protection: it raises the effort, it does not prevent
   anything. Fields are exempt so paste keeps working in the forms. */
(function () {
  "use strict";
  var stop = function (e) { e.preventDefault(); return false; };

  var inField = function (t) {
    if (!t || t.nodeType !== 1) return false;
    var tag = t.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" ||
           t.isContentEditable === true;
  };

  document.addEventListener("contextmenu", function (e) {
    if (inField(e.target)) return true;      /* keep paste usable in forms */
    return stop(e);
  });

  document.addEventListener("dragstart", function (e) {
    if (inField(e.target)) return true;
    return stop(e);
  });

  document.addEventListener("keydown", function (e) {
    var k = e.key, c = e.ctrlKey || e.metaKey, s = e.shiftKey;
    if (k === "F12" ||
        (c && s && (k === "I" || k === "J" || k === "C")) ||
        (c && (k === "u" || k === "U" || k === "s" || k === "S"))) stop(e);
  });

  /* iOS fires no contextmenu event: long press raises the callout instead, so
     that is turned off at the paint layer for pictures and film. Text is left
     selectable everywhere, on purpose, so a phone number or an address can
     still be copied. */
  var css = "img,video,.emblem{-webkit-touch-callout:none;-webkit-user-drag:none;user-drag:none}";
  var st = document.createElement("style");
  st.setAttribute("data-pfa-guard", "");
  st.appendChild(document.createTextNode(css));
  (document.head || document.documentElement).appendChild(st);
})();
"""

SKIP = {"admin.html"}
TAG = '<script src="pfa-noctx.js"></script>\n'

# the inline guard the pages shipped with, matched on its own shape
OLD = re.compile(
    r'<script>\s*!?function\s*\(\s*\)\s*\{[^<]*?addEventListener\("contextmenu"'
    r'[^<]*?\}\s*\(\s*\)\s*;?\s*</script>\s*', re.S)


def main(root):
    open(os.path.join(root, "pfa-noctx.js"), "w", encoding="utf-8").write(GUARD)

    stripped = added = 0
    for path in sorted(glob.glob(os.path.join(root, "*.html"))):
        name = os.path.basename(path)
        if name in SKIP:
            continue
        s = open(path, encoding="utf-8").read()

        s, n = OLD.subn("", s)
        stripped += n

        if 'src="pfa-noctx.js"' not in s:
            i = s.find("</head>")
            if i == -1:
                i = s.find("<body")
                i = s.find(">", i) + 1 if i != -1 else 0
                s = s[:i] + "\n" + TAG + s[i:]
            else:
                s = s[:i] + TAG + s[i:]
            added += 1

        open(path, "w", encoding="utf-8").write(s)

    print("  guard: %d inline copies removed, linked on %d pages, %s exempt"
          % (stripped, added, ", ".join(sorted(SKIP))))


if __name__ == "__main__":
    main(sys.argv[1])
