"""PFA light -> ink palette engine.

The site is one design system used across 19 pages, so the conversion is done
by inverting perceived lightness while holding hue and saturation. Greys flip
cleanly, the brand blue and the card's gold/holo palette are held back, and a
handful of anchor values are pinned by hand so every page lands on the same
ink, panel and hairline values as index.html.
"""
import colorsys
import re

# --- anchors: pinned by hand so the whole site shares one set of surfaces ---
PINNED = {
    "#ffffff": "#0E1116",   # page base
    "#fff":    "#0E1116",
    "#fefefe": "#0E1116",
    "#fdfdfd": "#0E1116",
    "#fcfcfc": "#0E1116",
    "#fafbfb": "#12161C",
    "#fafafa": "#12161C",
    "#f9fafb": "#12161C",
    "#f7f9fa": "#12161C",
    "#f4f6f7": "#12161C",   # porcelain band -> lifted slab
    "#f1f4f6": "#12161C",
    "#eceef0": "#12161C",
    "#ecEEF0": "#12161C",
    "#e9edf0": "#171C23",
    "#e8ecef": "#171C23",
    "#e3e7ea": "#171C23",
    "#e6eaed": "#171C23",
    "#d9dee3": "rgba(255,255,255,0.14)",
    "#0e1116": "#F4F6F7",   # ink -> primary text / inverted slab
    "#0c0f14": "#EDF1F3",
    "#0b0e12": "#EDF1F3",
    "#0b0e13": "#EDF1F3",
    "#07090c": "#EDF1F3",
    "#04121c": "#E8F4FE",
    "#1a1f26": "#DCE3E8",
    "#171c23": "#DCE3E8",
    "#1f2630": "#D3DBE1",
    "#55606a": "#8B959E",
    "#5a646e": "#8B959E",
    "#5f6873": "#9AA3AC",
    "#7a848d": "#6E7883",
    "#69727b": "#6E7883",
    "#006db3": "#5BC4FF",
    "#0b6fb0": "#5BC4FF",
    "#0090e0": "#35B6FF",
    "#b3261e": "#FF6B6B",
    "#c0341d": "#FF6B6B",
    "#c0392b": "#FF6B6B",
    "#1b7f4b": "#3CD98A",
    "#1b7a43": "#3CD98A",
    "#1b8a4b": "#3CD98A",
    "#b8860b": "#E7A93A",
    "#b26a00": "#E7A93A",
}

# --- held back: brand mark, card foil, hologram, true black scrims ---
HOLD = {
    "#00a4ff", "#0af", "#000", "#000000",
    "#8fd0ff", "#35b6ff", "#5bc4ff",
    "#d9b95c", "#c9a94e", "#f6c64b", "#fff4d8", "#efdfb4", "#e7ce8f", "#e8c766",
    "#bce2ff", "#e3d5ff", "#ffe0cb", "#d5efdb",
    "#3cd98a", "#e7a93a", "#e5484d", "#39d98a", "#e8a33d", "#ff6b6b",
    "#eaeef1", "#8f98a1", "#12161d", "#0f1319", "#141922", "#10151d", "#0c1016", "#0e131a",
}

HEX_RE = re.compile(r"#[0-9a-fA-F]{3,8}\b")
RGBA_RE = re.compile(r"rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)")

FOREGROUND = ("color", "fill", "stroke", "caret-color", "outline-color",
              "text-decoration-color", "-webkit-text-stroke", "-webkit-text-fill-color",
              "column-rule-color", "outline")

# properties whose colours are left alone: depth reads the same on ink
SHADOW_PROPS = ("box-shadow", "text-shadow", "-webkit-box-shadow", "filter", "-webkit-filter")


def _expand(h):
    h = h.lower()
    if len(h) == 4:
        return "#" + "".join(c * 2 for c in h[1:])
    if len(h) == 9:          # #rrggbbaa
        return h[:7], h[7:]
    return h


def flip_hex(h):
    """Invert lightness, hold hue and saturation."""
    raw = h.lower()
    alpha = ""
    if len(raw) == 9:
        raw, alpha = raw[:7], raw[7:]
    full = _expand(raw)
    if isinstance(full, tuple):
        full, alpha = full
    if full in HOLD or raw in HOLD:
        return h
    if full in PINNED:
        return PINNED[full] + alpha
    r, g, b = (int(full[i:i + 2], 16) / 255 for i in (1, 3, 5))
    hu, li, sa = colorsys.rgb_to_hls(r, g, b)
    if 0.42 < li < 0.58 and sa < 0.12:
        return h                      # mid greys read the same either way
    nl = 1.0 - li
    if sa < 0.10:                     # neutral: keep it neutral, ease the extremes
        nl = min(max(nl, 0.055), 0.94)
    else:                             # coloured: lift a little so it holds on ink
        nl = min(max(nl, 0.34), 0.86)
    r2, g2, b2 = colorsys.hls_to_rgb(hu, nl, sa)
    return "#%02X%02X%02X" % (round(r2 * 255), round(g2 * 255), round(b2 * 255)) + alpha


def flip_rgba(m, prop=""):
    """Flip a translucent colour, reading the property to know what it is for.

    White at any alpha is nearly always type, a rim or a hairline sitting on a
    dark surface, so it stays; as a fill above a whisper it is a light panel and
    has to go dark. Dark fills are scrims and wells and stay dark, while dark
    type and hairlines flip.
    """
    r, g, b, a = int(m.group(1)), int(m.group(2)), int(m.group(3)), m.group(4)
    alpha = float(a) if a is not None else 1.0
    if (r, g, b) == (0, 164, 255):
        return m.group(0)
    dark = (r + g + b) / 3 < 40
    light = (r + g + b) / 3 > 215
    is_fill = prop.startswith("background")
    if light and not is_fill:
        return m.group(0)                 # white type, rims, hairlines: already right
    if light and is_fill and alpha <= 0.2:
        return m.group(0)                 # a whisper of white is a sheen, not a panel
    if dark and is_fill:
        return m.group(0)                 # scrims, wells and overlays stay dark
    if light:
        r, g, b = 14, 17, 22
    elif dark:
        r, g, b = 255, 255, 255
    else:
        flipped = flip_hex("#%02x%02x%02x" % (r, g, b))
        flipped = _expand(flipped)
        if isinstance(flipped, tuple):
            flipped = flipped[0]
        r, g, b = (int(flipped[i:i + 2], 16) for i in (1, 3, 5))
    return ("rgba(%d,%d,%d,%s)" % (r, g, b, a)) if a is not None else ("rgb(%d,%d,%d)" % (r, g, b))


LIGHTISH_RE = re.compile(r"#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)")


def _is_lightish(token):
    """True when a colour is already bright enough to be type on ink."""
    m = RGBA_RE.match(token)
    if m:
        r, g, b = int(m.group(1)), int(m.group(2)), int(m.group(3))
    else:
        h = _expand(token.lower())
        if isinstance(h, tuple):
            h = h[0]
        if len(h) != 7:
            return False
        try:
            r, g, b = (int(h[i:i + 2], 16) for i in (1, 3, 5))
        except ValueError:
            return False
    # A colour this bright was never readable type on a white page, so where an
    # author used one it was meant for a dark surface and is already correct.
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.60


def flip_foreground(value, prop=""):
    """Flip type and edge colours, but leave ones that are already light.

    A rule that sets no background of its own is type sitting on whatever is
    behind it. On the light site that was nearly always dark type on white, so
    it flips; where the author wrote a bright colour it was type on one of the
    dark bands, and it is already correct.
    """
    parts = LIGHTISH_RE.split(value)
    found = LIGHTISH_RE.findall(value)
    out = [parts[0]]
    for tok, tail in zip(found, parts[1:]):
        if tok.lower() in ("#000", "#000000"):
            out.append("#F4F6F7")          # black type on white becomes type on ink
        else:
            out.append(tok if _is_lightish(tok) else flip_value(tok, prop))
        out.append(tail)
    return "".join(out)


def flip_value(value, prop=""):
    value = HEX_RE.sub(lambda m: flip_hex(m.group(0)), value)
    value = RGBA_RE.sub(lambda m: flip_rgba(m, prop), value)
    # colours encoded inside svg data URIs (%23rrggbb)
    value = re.sub(r"%23([0-9a-fA-F]{3,6})\b",
                   lambda m: "%23" + flip_hex("#" + m.group(1)).lstrip("#"), value)
    return value


BLUE_FILL_RE = re.compile(
    r"background(?:-color)?\s*:[^;]*(?:var\(--blue[,)]|#00[aA]4[fF]{2}|rgba?\(\s*0\s*,\s*164\s*,\s*255)")


# a surface that was dark on the light site keeps its authored colours; only
# the tokens are re-pointed, because their meaning moved when the site flipped
PROT_SWAP = {
    "--ink": "--band", "--card": "--band", "--ink-soft": "--band",
    "--white": "--ink", "--porcelain": "--ink",
}


def swap_protected(block):
    """Re-point tokens inside a surface that stays dark, leaving literals alone."""
    def one(m):
        tok, rest = m.group(1), m.group(2)
        return "var(--%s%s)" % (PROT_SWAP.get("--" + tok, "--" + tok).lstrip("-"), rest)
    return re.sub(r"var\(--([\w-]+)((?:\s*,[^()]*)?)\)", one, block)


def flip_declarations(block, protected=False):
    """Rewrite one declaration block. Shadows and protected rules pass through.

    Where the fill is brand blue the text colour is left alone: dark type on
    #00A4FF is the readable pairing, and inverting it would cost contrast.
    """
    if protected:
        return swap_protected(block)
    hold_text = bool(BLUE_FILL_RE.search(block))
    paints = re.search(r"(?:^|;)\s*background(?:-color|-image)?\s*:", block) is not None

    # If the surface this rule paints comes through the flip unchanged, it was
    # already a dark surface, so its type has to come through unchanged too.
    # Otherwise a chip with a whisper of white behind it keeps its background
    # and loses its type.
    kept_surface = False
    if paints:
        for d in block.split(";"):
            if not d.split(":", 1)[0].strip().lower().startswith("background"):
                continue
            # a var() background re-points on its own, so it is not "kept"
            if not (HEX_RE.search(d) or RGBA_RE.search(d)):
                continue
            if flip_value(d, "background") == d and "0 0" not in d and "none" not in d:
                kept_surface = True
    out = []
    for part in re.split(r"(;)", block):
        if part == ";":
            out.append(part)
            continue
        prop = part.split(":", 1)[0].strip().lower()
        if prop in SHADOW_PROPS or prop.endswith("-shadow"):
            out.append(part)
        elif hold_text and prop in ("color", "-webkit-text-stroke", "-webkit-text-fill-color"):
            # Type on a blue fill stays dark. The token that used to mean dark
            # now means light, so the reference is re-pointed rather than kept.
            out.append(re.sub(r"var\(--(ink|ink-soft)\)", "var(--white)",
                       re.sub(r"var\(--(white|porcelain)\)", "var(--ink)", part)))
        elif kept_surface and (prop in FOREGROUND or prop.startswith("border")):
            out.append(part)
        elif not paints and (prop in FOREGROUND or prop.startswith("border")):
            out.append(flip_foreground(part, prop))
        else:
            out.append(flip_value(part, prop))
    return "".join(out)
