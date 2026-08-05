"""Add the show/hide layer to the site.

Pages and content sections can be turned off from the console instead of being
deleted. Journey states are deliberately not in the registry: the store's
product and tracking views, the adopt and volunteer flows and the give
checkout are steps in a journey, not content, and hiding one breaks the path
through it.

Three layers, in the order they win:
  1. defaults committed in pfa-site-map.js  - a permanent removal
  2. whatever the console has saved locally - a working change
  3. the page itself                        - visible unless told otherwise
"""
import os
import re
import sys

# file: (label, [(section key, label)])
REGISTRY = [
    ("index.html", "Home", [
        ("manifesto", "The people"),
        ("door", "Adopt or give"),
    ], False),
    ("adopt.html", "Adopt", [], True),
    ("assembly.html", "The Assembly", [
        ("featured", "Featured assembly"),
        ("livenow", "Live now"),
        ("upcoming", "Upcoming"),
        ("campaigns", "Campaigns"),
        ("meet", "The people you meet"),
        ("voices", "Voices"),
        ("rails", "The ten rules"),
        ("propose", "Propose an assembly"),
    ], True),
    ("champion.html", "Champion", [], True),
    ("cinekind.html", "CineKind Awards", [], True),
    ("csr.html", "Corporate partnership", [
        ("partner-standing", "A partner with standing"),
        ("campaigns", "Three campaigns"),
        ("gifting", "Rethink the gifting budget"),
        ("certify", "Certify your campuses"),
        ("proof", "The statute"),
        ("contact", "Contact"),
    ], True),
    ("founder.html", "The Founder", [
        ("plate-sec", "One person, then a country"),
        ("team", "Many hands"),
        ("built", "What she built"),
        ("desk", "In her own words"),
        ("hands", "One hand became many"),
    ], True),
    ("get-involved.html", "Get involved", [], True),
    ("give.html", "Give", [
        ("corporate", "Corporate giving"),
    ], True),
    ("hall-of-fame.html", "Hall of Fame", [
        ("laureate", "This year's laureate"),
        ("class", "The full class"),
        ("canon", "How a name enters"),
        ("disciplines", "Disciplines"),
        ("nominate", "Nominate a healer"),
    ], True),
    ("heatmap.html", "Heat map", [
        ("method", "Method"),
        ("act", "The map changes"),
    ], True),
    ("learning-center.html", "Learning Center", [
        ("library", "The library"),
        ("how", "Why it is worth your time"),
        ("law", "The law"),
        ("publish", "Publish with us"),
        ("close", "Closing"),
    ], True),
    ("membership.html", "The Patron Card", [], True),
    ("network.html", "Reach PFA", [
        ("what-happens", "What happens next"),
        ("units", "Your unit, not a form"),
    ], True),
    ("pfa-x.html", "PFA X", [
        ("why", "Know a place is kind"),
        ("directory", "Certified places"),
        ("standard", "A real standard"),
        ("partner", "Put your place on the map"),
    ], True),
    ("services.html", "Trusted Services", [
        ("standard", "The standard"),
        ("directory", "The directory"),
        ("mechanism", "How it corrects itself"),
        ("close", "Closing"),
    ], True),
    ("store.html", "The Store", [
        ("shop", "Shop by category"),
        ("pharmacy", "The pharmacy"),
        ("impactstrip", "Impact receipt strip"),
    ], True),
    ("stories.html", "Stories", [
        ("feature", "Featured story"),
        ("podcast", "The podcast"),
        ("submit", "Submit a story"),
    ], True),
    ("watch-listen-do-meet.html", "Watch Listen Do Meet", [
        ("watch", "Watch"),
        ("listen", "Listen"),
        ("do", "Do"),
        ("meet", "Meet"),
    ], True),
]

# where a section key does not match the markup, say which tag carries it:
# (page, key) -> (attribute value to find, which occurrence)
MARKERS = {
    ("index.html", "manifesto"): ("manifesto", 1),
    ("csr.html", "partner-standing"): ("cx-sec", 1),
    ("csr.html", "gifting"): ("cx-sec", 2),
    ("csr.html", "certify"): ("cx-sec", 3),
    ("heatmap.html", "act"): ("sec", 1),
    ("network.html", "units"): ("sec", 1),
    ("pfa-x.html", "why"): ("sec", 1),
    ("pfa-x.html", "standard"): ("sec", 2),
    ("services.html", "close"): ("sec", 1),
    ("stories.html", "submit"): ("submit", 1),
    ("learning-center.html", "close"): ("close", 1),
}

SCRIPTS = ('<script src="pfa-site-map.js"></script>\n'
           '<script src="pfa-visibility.js"></script>\n')


def mark_sections(root):
    """Put data-sec on the sections the registry names."""
    for page, _label, sections, _toggle in REGISTRY:
        path = os.path.join(root, page)
        if not os.path.exists(path) or not sections:
            continue
        s = open(path, encoding="utf-8").read()
        for key, _lab in sections:
            if 'data-sec="%s"' % key in s:
                continue
            find, nth = MARKERS.get((page, key), (key, 1))
            seen, done = 0, False
            out, pos = [], 0
            for m in re.finditer(r"<section\b([^>]*)>", s):
                attrs = m.group(1)
                idm = re.search(r'id="([^"]+)"', attrs)
                clm = re.search(r'class="([^"]+)"', attrs)
                ident = idm.group(1) if idm else ""
                classes = clm.group(1).split() if clm else []
                if find != ident and find not in classes:
                    continue
                seen += 1
                if seen != nth:
                    continue
                out.append(s[pos:m.start()])
                out.append('<section data-sec="%s"%s>' % (key, attrs))
                pos = m.end()
                done = True
                break
            if done:
                out.append(s[pos:])
                s = "".join(out)
            else:
                print("  no section found for %s / %s" % (page, key))
        open(path, "w", encoding="utf-8").write(s)


def write_map(root):
    pages = []
    for page, label, sections, toggle in REGISTRY:
        secs = ",\n        ".join(
            '{ key: "%s", label: "%s" }' % (k, l) for k, l in sections)
        pages.append(
            '    { file: "%s", label: "%s", canHide: %s, sections: [\n        %s\n    ] }'
            % (page, label, "true" if toggle else "false", secs))
    js = ('/* What the console can show and hide.\n'
          '   Generated from the site: edit the defaults below to make a change\n'
          '   permanent, or use the console to try one out. */\n'
          "window.PFA_SITE_MAP = {\n  pages: [\n%s\n  ]\n};\n\n"
          "/* A page or section listed here as false ships hidden. */\n"
          "window.PFA_VISIBILITY_DEFAULTS = { pages: {}, sections: {} };\n"
          % ",\n".join(pages))
    open(os.path.join(root, "pfa-site-map.js"), "w", encoding="utf-8").write(js)


def add_scripts(root):
    for page, _l, _s, _t in REGISTRY:
        path = os.path.join(root, page)
        if not os.path.exists(path):
            continue
        s = open(path, encoding="utf-8").read()
        if "pfa-visibility.js" in s:
            continue
        i = s.find('<script src="pfa-header.js">')
        if i == -1:
            i = s.find("</head>")
        s = s[:i] + SCRIPTS + s[i:]
        open(path, "w", encoding="utf-8").write(s)


if __name__ == "__main__":
    r = sys.argv[1]
    mark_sections(r)
    write_map(r)
    add_scripts(r)
    print("visibility: registry written, sections marked, scripts linked")
