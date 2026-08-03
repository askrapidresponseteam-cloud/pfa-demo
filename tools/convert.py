"""Convert the whole PFA site from the light build to the ink build.

Run against a fresh copy of the repo. index.html is already the ink reference
and champion.html was authored dark, so both are left alone here; the header
widget keeps its dark bar and only its menu overlay is flipped.
"""
import glob
import os
import re
import sys

sys.path.insert(0, "/home/claude/tools")
from darken import transform_css, transform_html, transform_js  # noqa: E402

SKIP_HTML = {"index.html", "champion.html"}

# Surfaces that were already dark on the light site. They keep their authored
# colours and only their background token is re-pointed, so an accent band
# stays an accent band instead of turning into a white slab on ink.
DARK_BANDS = {
    "admin.html": ["side*", "gate*", "nav-i*", "nav-g*"],
    "assembly.html": ["ticker", "marquee", "mq-poster", "live-strip", "ls-video", "rails"],
    "csr.html": ["dark", "cx-c", "cx-hero", "cx-film", "player", "pv-error", "pv-ctl"],
    "founder.html": ["mast", "portrait"],
    "get-involved.html": ["gauntlet"],
    "give.html": ["cxd-mark"],
    "hall-of-fame.html": ["rule-card", "hof-hero", "plaque", "canon"],
    "heatmap.html": ["cx-close"],
    "learning-center.html": ["stat", "band", "law", "law-side", "law-arts", "close"],
    "network.html": ["net-close"],
    "pfa-x.html": ["px-partner"],
    "services.html": ["svc-close"],
    "store.html": ["sh", "impactstrip"],
    "stories.html": ["story-thumb", "tbg", "film", "film-bg", "pod-card", "pod-media",
                     "door", "lb-scrim", "sub-scrim"],
    "watch-listen-do-meet.html": ["mast", "bg", "meet", "film-hero", "lb-scrim"],
}

BAND_TOKEN = "  --band:#080B0F;              /* a band that was dark stays a well */\n"
JS_FLIP = ["pfa-search.js", "pfa-auth.js", "pfa-network-talk.js", "pfa-forms.js",
           "pfa-coex.js", "pfa-talk.js", "pfa-services.js", "pfa-network.js",
           "pfa-places.js", "pfa-profile.js", "pfa-player.js"]
CSS_FLIP = ["pfa-player.css"]

# the nav bar was always dark; only the menu overlay and its contents flip
NAV_KEEP = ("pfa-nav", "pfa-brand", "pfa-emblem", "pfa-links", "pfa-burger",
            "pfa-searchbar", "pfa-mag", "pfa-sicon")


def convert_header(src):
    def repl(m):
        rule = m.group(1)
        if "{" not in rule or any(k in rule for k in NAV_KEEP):
            return m.group(0)
        if rule.count("{") != rule.count("}") or ":" not in rule:
            return m.group(0)
        if not re.match(r"^\s*[.#@a-zA-Z\[:*]", rule):
            return m.group(0)
        # only colour values change, and those carry no quotes or backslashes,
        # so the javascript escaping in the string survives untouched
        return '"' + transform_css(rule) + '"'
    return re.sub(r'"((?:\\.|[^"\\])*)"', repl, src)


def add_band_token(html):
    """Declare --band once per page, next to the tokens it sits with."""
    if "--band:" in html:
        return html
    i = html.find(":root")
    if i == -1:
        return html
    j = html.find("{", i)
    return html[:j + 1] + BAND_TOKEN.strip() + html[j + 1:]


def main(root):
    os.chdir(root)
    report = []
    for f in sorted(glob.glob("*.html")):
        if f in SKIP_HTML:
            report.append((f, "skipped, already ink"))
            continue
        s = open(f, encoding="utf-8").read()
        out = transform_html(s, protect_extra=DARK_BANDS.get(f, ()))
        out = add_band_token(out)
        open(f, "w", encoding="utf-8").write(out)
        report.append((f, "converted" + (f"  (+{len(DARK_BANDS[f])} kept dark)" if f in DARK_BANDS else "")))
    for f in JS_FLIP:
        if os.path.exists(f):
            s = open(f, encoding="utf-8").read()
            open(f, "w", encoding="utf-8").write(transform_js(s))
    for f in CSS_FLIP:
        if os.path.exists(f):
            s = open(f, encoding="utf-8").read()
            open(f, "w", encoding="utf-8").write(transform_css(s))
    if os.path.exists("pfa-header.js"):
        s = open("pfa-header.js", encoding="utf-8").read()
        open("pfa-header.js", "w", encoding="utf-8").write(convert_header(s))
    for f, note in report:
        print(f"{f:28s} {note}")


if __name__ == "__main__":
    main(sys.argv[1])
