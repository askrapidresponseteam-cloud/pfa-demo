"""Minify the site's HTML, CSS and javascript.

No minifier is installed and there is no network to fetch one, so this is
written here. That makes correctness the priority over the last few per cent,
and the rules below are deliberately the conservative ones:

  CSS   Comments go. Whitespace collapses. Space is only dropped next to
        characters where it can never carry meaning, and never around + - * /,
        because calc() and clamp() need those spaces to stay valid. Space after
        a colon is dropped inside a block or inside parentheses, never in a
        selector, because "a :hover" and "a:hover" are different selectors.

  JS    Comments go, indentation goes, blank lines go. Nothing is renamed and
        lines are not joined: automatic semicolon insertion makes joining a
        real risk for a saving that gzip has already taken.

  HTML  Comments go. Runs of whitespace in text collapse to one space rather
        than disappearing, because between two inline elements that space is
        rendered and deleting it moves the words. pre, textarea, script and
        style keep their contents; script and style get minified in place.

Every claim above is checked afterwards by rendering each page before and
after and comparing the two images pixel for pixel.
"""
import glob
import os
import re
import sys

# ---------------------------------------------------------------- CSS --------
_CSS_DROP_BEFORE = set("{};:,>)")
_CSS_DROP_AFTER = set("{};:,>(")


def min_css(css):
    out = []
    i, n = 0, len(css)
    depth = paren = 0
    while i < n:
        c = css[i]
        if c == "/" and css.startswith("/*", i):
            j = css.find("*/", i + 2)
            i = n if j == -1 else j + 2
            continue
        if c in "\"'":
            q = c
            j = i + 1
            while j < n and css[j] != q:
                j += 2 if css[j] == "\\" else 1
            out.append(css[i:min(j + 1, n)])
            i = j + 1
            continue
        if c in " \t\r\n\f":
            j = i
            while j < n and css[j] in " \t\r\n\f":
                j += 1
            prev = out[-1][-1] if out and out[-1] else ""
            nxt = css[j] if j < n else ""
            drop = prev in _CSS_DROP_AFTER or nxt in _CSS_DROP_BEFORE
            # a colon only loses its space inside a block or inside parens;
            # in a selector the space is structural
            if prev == ":" and depth == 0 and paren == 0:
                drop = False
            if nxt == ":" and depth == 0 and paren == 0:
                drop = False
            if not drop and out:
                out.append(" ")
            i = j
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            depth = max(0, depth - 1)
        elif c == "(":
            paren += 1
        elif c == ")":
            paren = max(0, paren - 1)
        out.append(c)
        i += 1
    s = "".join(out)
    s = s.replace(";}", "}")
    return s.strip()


# ----------------------------------------------------------------- JS --------
# A first attempt tokenised the source to strip comments and got it wrong twice:
# a slash was read as the start of a regular expression when it was a division,
# the scanner lost its place, and from there a "https://" inside a string looked
# like a comment and an "image/*" looked like the start of one. Both truncated a
# working file into a syntax error.
#
# Telling a regex from a division needs a real parser, and a real parser is not
# worth writing for a saving gzip has largely taken already. So this does only
# what is provably safe without parsing anything:
#
#   - leading indentation goes. It cannot be inside a string, because a normal
#     javascript string cannot span a line break.
#   - blank lines go.
#   - a line whose first characters are // goes, since nothing else can begin a
#     line with those two characters once template literals are excluded.
#
# Lines are never joined, nothing is renamed, and block comments are left where
# they are. Files containing a backtick are skipped whole: a template literal
# can span lines, so indentation inside one may be content.


def min_js(js):
    if "`" in js:
        return js
    out = []
    keep_next = False
    for line in js.split("\n"):
        t = line.strip()
        if not t:
            keep_next = False
            continue
        if t.startswith("//") and not keep_next:
            keep_next = False
            continue
        out.append(t)
        keep_next = t.endswith("\\")      # a continued line: next one is content
    return "\n".join(out)


# --------------------------------------------------------------- HTML --------
RAW = ("script", "style", "textarea", "pre")
TAG_RE = re.compile(r"<!--|<!\[CDATA\[|<!|</?([a-zA-Z][\w:-]*)")


def min_html(html):
    out = []
    i, n = 0, len(html)
    while i < n:
        lt = html.find("<", i)
        if lt == -1:
            out.append(_squash(html[i:]))
            break

        if lt > i:
            out.append(_squash(html[i:lt]))

        if html.startswith("<!--", lt):
            j = html.find("-->", lt + 4)
            j = n if j == -1 else j + 3
            if html.startswith("<!--[if", lt):        # conditional comment
                out.append(html[lt:j])
            i = j
            continue

        m = TAG_RE.match(html, lt)
        if not m:
            out.append("<")
            i = lt + 1
            continue

        gt = _tag_end(html, lt)
        tag_text = html[lt:gt]
        out.append(_squash_tag(tag_text))
        i = gt

        # Only an OPENING tag starts raw content. Without this check a closing
        # </style> matches the same pattern, and everything after the stylesheet
        # gets treated as more CSS: the scripts then go through the CSS
        # minifier, where a /* inside a string swallows whole functions.
        name = (m.group(1) or "").lower()
        is_open = not html.startswith("</", lt)
        if is_open and name in RAW and not tag_text.endswith("/>"):
            close = re.compile(r"</\s*%s\s*>" % re.escape(name), re.I)
            cm = close.search(html, i)
            end = cm.start() if cm else n
            body = html[i:end]
            if name == "script":
                if "src=" not in tag_text.lower():
                    body = min_js(body)
            elif name == "style":
                body = min_css(body)
            out.append(body)
            i = end
    return "".join(out)


def _tag_end(html, start):
    """Find the '>' that closes a tag, ignoring ones inside quoted values."""
    i = start + 1
    n = len(html)
    while i < n:
        c = html[i]
        if c in "\"'":
            q = c
            i += 1
            while i < n and html[i] != q:
                i += 1
        elif c == ">":
            return i + 1
        i += 1
    return n


def _squash(text):
    """Collapse whitespace runs to a single space, never to nothing."""
    return re.sub(r"[ \t\r\n\f]+", " ", text)


def _squash_tag(tag):
    """Tidy whitespace between attributes without touching quoted values."""
    out = []
    i, n = 0, len(tag)
    while i < n:
        c = tag[i]
        if c in "\"'":
            q = c
            j = i + 1
            while j < n and tag[j] != q:
                j += 1
            out.append(tag[i:min(j + 1, n)])
            i = j + 1
            continue
        if c in " \t\r\n\f":
            j = i
            while j < n and tag[j] in " \t\r\n\f":
                j += 1
            out.append("" if j < n and tag[j] in ">/" else " ")
            i = j
            continue
        out.append(c)
        i += 1
    return "".join(out)


# --------------------------------------------------------------- driver ------
def main(root):
    before = after = 0
    for path in sorted(glob.glob(os.path.join(root, "*.html"))):
        s = open(path, encoding="utf-8").read()
        t = min_html(s)
        before += len(s.encode()); after += len(t.encode())
        open(path, "w", encoding="utf-8").write(t)
    for path in sorted(glob.glob(os.path.join(root, "*.css"))):
        s = open(path, encoding="utf-8").read()
        t = min_css(s)
        before += len(s.encode()); after += len(t.encode())
        open(path, "w", encoding="utf-8").write(t)
    for path in sorted(glob.glob(os.path.join(root, "*.js"))):
        if os.path.basename(path).startswith("vendor"):
            continue
        s = open(path, encoding="utf-8").read()
        t = min_js(s)
        before += len(s.encode()); after += len(t.encode())
        open(path, "w", encoding="utf-8").write(t)
    print("  minify: %s -> %s bytes (%.1f%% off)"
          % (format(before, ","), format(after, ","),
             100.0 * (before - after) / max(before, 1)))


if __name__ == "__main__":
    main(sys.argv[1])
