"""Hand corrections that are design judgements, not colour conversions.

Kept separate from the pins so it is obvious which changes were measured and
which were decided. Appended last, so they win.
"""
import os, re, sys

MARK = "/* ---- tweaks: hand corrections after the conversion ---- */"

TWEAKS = {
    "membership.html": """
/* The card's corners were written as clamp(13px, 4%, 20px). A percentage in a
   border radius resolves against the width for the horizontal arc and the
   height for the vertical one, so on a 500 x 315 card the used value came out
   at 20px across and 13px down: four ellipses rather than four arcs, changing
   shape with every resize, and the two faces resolved them independently. One
   length gives four identical corners at any size, on both faces. */
:root{--card-radius:clamp(12px,1.3vw,18px)}
.mcard,.mface,.mface.front,.mface.back{border-radius:var(--card-radius)!important}
.mface::after,.m-sweep,.m-wm{border-radius:inherit}
/* both faces sit on the same pixel, so the edges cannot disagree */
.mface{inset:0;transform-origin:50% 50%}

/* The mark on the card is a full-colour raster: white line art on a blue
   block. On a black and gold foil face it read as a sticker rather than a
   stamp, and it was the only blue on the card. This renders it in the same
   champagne as the wordmark and the hologram. Measured hue 48, saturation .48,
   against the wordmark's 43 and .70. The mark is untouched everywhere else. */
.m-chip .emblem{filter:grayscale(1) sepia(1) saturate(4.5) hue-rotate(-32deg) brightness(.94)}

/* The photo window was a flat slab with square corners cut into a rounded,
   foil-edged card, so it read as a hole punched in the face. A hairline in the
   card's gold, a corner that follows the card's own, and a little depth make
   it a window. */
.m-photo{
  border:1px solid rgba(217,185,92,.30);
  border-radius:calc(var(--card-radius) * .42)!important;
  background-image:linear-gradient(160deg,rgba(255,255,255,.055),rgba(0,0,0,.20));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 1px 0 rgba(0,0,0,.35);
}
.m-photo-ph{color:#C6CDD6}

/* The middle band is 46% of the card's height and its content was pressed into
   the last twelfth of it, which left the face looking half empty. The number
   and the name now sit in that band, where the embossed line sits on a real
   card. */
.m-mid{align-items:center}
""",
    "give.html": """
/* The 02% plate. It was a solid ink square on a white page, so a figure at the
   top and space beneath read as deliberate. On ink it needs its own edge or it
   reads as a hole, and the figure wants to sit in the middle of the plate
   rather than at the top of it. Wrapping keeps 02 and % on one baseline while
   align-content centres that line. */
.cxd-mark{
  flex-wrap:wrap;
  align-content:center;
  background:var(--band);
  background-image:radial-gradient(130% 100% at 50% 0%,rgba(0,164,255,.14),transparent 64%);
  border:1px solid var(--hair);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.06);
}
""",
}


def main(root):
    for page, css in TWEAKS.items():
        path = os.path.join(root, page)
        if not os.path.exists(path):
            continue
        s = open(path, encoding="utf-8").read()
        s = re.sub(re.escape(MARK) + r".*?(?=</style>)", "", s, flags=re.S)
        i = s.rfind("</style>")
        if i == -1:
            continue
        s = s[:i] + MARK + "\n" + css.strip() + "\n" + s[i:]
        open(path, "w", encoding="utf-8").write(s)
        print("tweaks: applied to", page)


if __name__ == "__main__":
    main(sys.argv[1])
