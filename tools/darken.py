"""Walk a stylesheet rule by rule and flip it to the ink build.

Rules whose selector names a surface that was already dark on the light site
(the Patron Card face, the hero film bed, video chrome) are passed through
untouched, so the conversion never inverts something that was correct already.
"""
import re
import sys

sys.path.insert(0, "/home/claude/tools")
from palette import flip_declarations, flip_value  # noqa: E402

# selectors that were already dark by design and must stay dark
PROTECT = [
    "mcard", "mface", "mscene", "m-sweep", "m-top", "m-chip", "m-word", "m-mid",
    "m-no", "m-name", "m-foot", "m-since", "m-standing", "m-meta", "m-lab",
    "m-wm", "m-backbody", "m-addr", "m-holo*", "m-backfoot", "s-name", "holo",
    "hero-vid", "hero-video", "hero-scrim",
]
CONTAINER_AT = ("@media", "@supports", "@layer", "@container", "@scope")


def _has_class(selector, token):
    """Match a class token, not a substring: .sh must not match .shop."""
    if token.endswith("*"):
        return re.search(r"\.%s[\w-]*" % re.escape(token[:-1]), selector) is not None
    return re.search(r"\.%s(?![\w-])" % re.escape(token), selector) is not None


def transform_css(css, protect_extra=()):
    prot = list(PROTECT) + list(protect_extra)

    def is_prot(sel):
        return any(_has_class(sel, p) for p in prot)

    out = []
    i, n = 0, len(css)
    buf = []

    def flush():
        if buf:
            out.append("".join(buf))
            buf.clear()

    while i < n:
        ch = css[i]
        if ch == "/" and css.startswith("/*", i):          # comment
            j = css.find("*/", i + 2)
            j = n if j == -1 else j + 2
            buf.append(css[i:j]); i = j; continue
        if ch in "\"'":                                     # string
            q = ch; j = i + 1
            while j < n and css[j] != q:
                j += 2 if css[j] == "\\" else 1
            j = min(j + 1, n)
            buf.append(css[i:j]); i = j; continue
        if ch == "{":
            prelude = "".join(buf).strip()
            flush()
            body, j = _read_block(css, i + 1)
            head = prelude.split("(")[0].strip().lower()
            if head.startswith(CONTAINER_AT):
                inner = transform_css(body, protect_extra=prot)
            elif prelude.lstrip().startswith("@keyframes") or prelude.lstrip().startswith("@-webkit-keyframes"):
                inner = transform_css(body, protect_extra=prot)
            elif prelude.lstrip().startswith("@font-face") or prelude.lstrip().startswith("@import"):
                inner = body
            else:
                inner = flip_declarations(body, protected=is_prot(prelude))
            out.append("{" + inner + "}")
            i = j
            continue
        buf.append(ch)
        i += 1
    flush()
    return "".join(out)


def _read_block(css, start):
    """Return (body, index_after_closing_brace) for a block opened before start."""
    depth, i, n = 1, start, len(css)
    while i < n:
        ch = css[i]
        if ch == "/" and css.startswith("/*", i):
            j = css.find("*/", i + 2)
            i = n if j == -1 else j + 2
            continue
        if ch in "\"'":
            q = ch; i += 1
            while i < n and css[i] != q:
                i += 2 if css[i] == "\\" else 1
            i += 1
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return css[start:i], i + 1
        i += 1
    return css[start:], n


STYLE_RE = re.compile(r"(<style[^>]*>)(.*?)(</style>)", re.S | re.I)
INLINE_RE = re.compile(r'(\sstyle=")([^"]*)(")', re.I)
SVGFILL_RE = re.compile(r'(\s(?:fill|stroke|stop-color|flood-color)=")(#[0-9a-fA-F]{3,8})(")')
SCRIPT_RE = re.compile(r"(<script(?![^>]*\ssrc=)[^>]*>)(.*?)(</script>)", re.S | re.I)


def _inline(value):
    """An inline style is a one-off override; a dark panel written inline still
    means a dark panel, so its background token is re-pointed rather than flipped."""
    out = flip_declarations(value)
    out = re.sub(r"(background(?:-color)?\s*:\s*)var\(--(?:ink|card)\)", r"\1var(--band)", out)
    return out


def transform_html(html, protect_extra=()):
    html = STYLE_RE.sub(
        lambda m: m.group(1) + transform_css(m.group(2), protect_extra) + m.group(3), html)
    html = INLINE_RE.sub(lambda m: m.group(1) + _inline(m.group(2)) + m.group(3), html)

    # Stylesheets injected by page scripts. The floating back button is left
    # alone: the glass layer pins it light with !important, so its type has to
    # stay dark to match.
    def _script(m):
        body = m.group(2)
        if "pfaBack" in body:
            return m.group(0)
        return m.group(1) + transform_js(body) + m.group(3)
    html = SCRIPT_RE.sub(_script, html)
    html = SVGFILL_RE.sub(lambda m: m.group(1) + flip_value(m.group(2)) + m.group(3), html)
    # theme-colour / colour-scheme meta
    html = html.replace('<meta name="theme-color" content="#FFFFFF">',
                        '<meta name="theme-color" content="#0E1116">')
    return html


CSSLIKE_RE = re.compile(r"([{;])(\s*)([-a-zA-Z]+)(\s*:\s*)([^;{}\"'`]{1,220}?)(?=\s*[;}])")
SHADOWY = ("box-shadow", "text-shadow", "-webkit-box-shadow", "filter", "-webkit-filter")


def transform_js(src):
    """Flip colours inside CSS that javascript injects, leaving other data alone.

    Only declarations written in CSS syntax are touched: a value in quotes is a
    javascript string, not a stylesheet, so object literals pass through.
    """
    def repl(m):
        lead, ws, prop, sep, val = m.groups()
        if prop.lower() in SHADOWY or prop.lower().endswith("-shadow"):
            return m.group(0)
        return lead + ws + prop + sep + flip_value(val)
    return CSSLIKE_RE.sub(repl, src)
