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

/* The mark is never recoloured. It carries its own blue and white on the card
   exactly as it does everywhere else on the site. */

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

/* The face was a neutral charcoal. A navy wash lays over it so the ground
   reads deep blue like the reference: sampled from the reference card its navy
   field is rgb(14,23,34) at hue 213, and this lands on rgb(16,24,34) at hue
   215. The guilloche still shows through, because this washes over the ground
   rather than replacing it.
   Replacing it would mean carrying its 24KB data URI a second time. */
.m-tint{position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:0;overflow:hidden;
  background:linear-gradient(150deg,rgba(14,36,68,.70) 0,rgba(5,14,28,.55) 52%,rgba(11,26,50,.66) 100%)}

/* the hairline rule set in from the edge, which is what makes the reference
   read as a plate rather than a printed rectangle */
.m-tint::before{content:"";position:absolute;inset:4.4%;
  border:1px solid rgba(192,158,102,.62);
  border-radius:calc(var(--card-radius) * .55)}

/* the mark again, large and faint on the right, tone on tone */
.m-tint::after{content:"";position:absolute;right:-2%;top:9%;width:50%;height:82%;
  background:url("media/pfa-emblem.png") center/contain no-repeat;opacity:.06}

/* content sits above the wash; the photo is positioned and follows it in the
   markup, so it paints above without needing a z-index of its own */
.mface.front>.m-top,.mface.front>.m-mid,.mface.front>.m-foot{position:relative;z-index:1}

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


# One span on the front face carries the wash, the rule and the crest. The back
# face has no .m-sweep, so this lands on the front only.
MARKUP = {
    "membership.html": [
        ('<span class="m-sweep"></span>',
         '<span class="m-sweep"></span><span class="m-tint" aria-hidden="true"></span>'),
    ],
}


def main(root):
    for page, edits in MARKUP.items():
        path = os.path.join(root, page)
        if not os.path.exists(path):
            continue
        h = open(path, encoding="utf-8").read()
        for old, new in edits:
            if new not in h and old in h:
                h = h.replace(old, new, 1)
        open(path, "w", encoding="utf-8").write(h)

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
