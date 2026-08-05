"""Put the CineKind preview on the PFA design system.

CineKind was built on its own palette: near-black ground, warm gold, ivory type
and Cormorant Garamond for display. This re-points it to the tokens the PFA
site now runs on, keeps the structure and the copy, and picks up the three
details that make a PFA page recognisable: the square blue eyebrow marker, the
light-slab button, and hard corners everywhere.
"""
import re
import sys

# --- tokens -----------------------------------------------------------------
TOKENS = {
    "--bg:#050505": "--bg:#0E1116",
    "--panel:#0C0B0A": "--panel:#12161C",
    "--ink:#F7F3EA": "--ink:#F4F6F7",
    "--muted:#A29B90": "--muted:#8B959E",
    "--dim:#77726A": "--dim:#6E7883",
    "--line:rgba(247,243,234,0.14)": "--line:rgba(255,255,255,0.14)",
    "--line-soft:rgba(247,243,234,0.07)": "--line-soft:rgba(255,255,255,0.07)",
    "--gold:#C9A24C": "--gold:#00A4FF",
    "--gold-lit:#EBD7A4": "--gold-lit:#5BC4FF",
    "--gold-deep:#8A6A3C": "--gold-deep:#0B6FB0",
    "--serif:'Cormorant Garamond',Georgia,serif": "--serif:'Marcellus',Georgia,serif",
}

# --- literals that sit outside the token block ------------------------------
LITERALS = [
    (r"#C9A24C", "#00A4FF"), (r"#c9a24c", "#00A4FF"),
    (r"#EBD7A4", "#5BC4FF"), (r"#ebd7a4", "#5BC4FF"),
    (r"#8A6A3C", "#0B6FB0"), (r"#8a6a3c", "#0B6FB0"),
    (r"#F7F3EA", "#F4F6F7"), (r"#f7f3ea", "#F4F6F7"),
    (r"#0A0806", "#0E1116"), (r"#0a0806", "#0E1116"),
    (r"#050505", "#0E1116"),
    (r"#0C0B0A", "#12161C"), (r"#0c0b0a", "#12161C"),
    (r"rgba\(201,\s*162,\s*76,", "rgba(0,164,255,"),
    (r"rgba\(235,\s*215,\s*164,", "rgba(91,196,255,"),
    (r"rgba\(247,\s*243,\s*234,", "rgba(255,255,255,"),
    # scrims and the sticky nav were mixed from the old near-black ground
    (r"rgba\(5,\s*5,\s*5,", "rgba(14,17,22,"),
    (r"rgba\(12,\s*11,\s*10,", "rgba(18,22,28,"),
]

# The PFA mark, embedded so the preview stays a single file like every other
# image in it. Trimmed to three times its header size rather than shipping the
# full asset.
EMBLEM = "data:image/png;base64,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"

# --- the PFA layer, appended so it wins on equal specificity -----------------
PFA_LAYER = """

/* ===========================================================================
   PFA design system
   Ground #0E1116, lifted slab #12161C, type #F4F6F7, accent #00A4FF, hairlines
   at white 14 and 7 per cent. Archivo for display and body, Marcellus for the
   letterspaced small type. Hard corners throughout.
   =========================================================================== */

/* Nothing on a PFA page is rounded. The pill, its dot and the timeline markers
   set their radius with !important at class specificity, so each needs naming
   rather than relying on the universal rule. */
*{border-radius:0 !important}
.pill,.pill s,.perf i{border-radius:0 !important}

/* Section heads take the PFA display voice: Archivo, heavy, wide, tight and
   uppercase. The hero is left in sentence case because it carries a full
   sentence rather than a two-word line, and uppercase at that size becomes a
   wall of type. */
h1{font-family:var(--sans);font-weight:900;font-stretch:118%;letter-spacing:-.018em}
h2{font-family:var(--sans);font-weight:800;font-stretch:112%;letter-spacing:-.015em;
   text-transform:uppercase}

/* The kicker becomes the PFA eyebrow: no pill, no tint, a square in the accent
   colour and Marcellus set wide. */
.pill{background:0 0 !important;box-shadow:none !important;padding:0 !important;
      gap:14px !important;font-family:var(--caps);font-size:12px;letter-spacing:.32em;
      text-transform:uppercase;color:var(--gold)}
.pill s{width:8px !important;height:8px !important;border-radius:0 !important;background:var(--gold) !important;
        box-shadow:none !important;flex:none}

/* The primary action is an inverted slab: light face, ink type, accent on
   hover. The ghost is a hairline that takes the accent on hover. */
.cta{background:var(--ink);color:var(--bg);border:1px solid var(--ink);
     font-family:var(--sans);font-weight:700;font-size:13px;letter-spacing:.14em;
     text-transform:uppercase;padding:16px 30px;
     transition:background .25s ease,color .25s ease,border-color .25s ease}
.cta:hover{background:var(--gold);border-color:var(--gold);color:var(--bg)}
.cta::after{display:none}
.ghost{color:var(--ink);border-color:rgba(255,255,255,.42);font-family:var(--sans);
       font-weight:700;font-size:13px;letter-spacing:.14em;padding:16px 30px}
.ghost:hover{color:var(--gold);border-color:var(--gold);background:0 0}

/* The accent word in the hero takes the brand blue, the way the home page sets
   its one word. The lifted blue stays on smaller type, where it needs the lift
   to hold against ink. */
h1 em{color:var(--gold)}

/* The co-brand lockup. Two marks of equal standing either side of a cross, the
   way a crossover title card sets them: CineKind's wordmark, a hairline cross
   in the muted tone, then the PFA mark with its name. The mark keeps its own
   blue and white, so it is never recoloured to sit on the header. */
.brand{gap:clamp(12px,1.4vw,18px)}
.brand .x{font-family:var(--sans);font-weight:400;font-size:13px;line-height:1;
          color:var(--dim);transform:translateY(-1px)}
.brand .co{display:flex;align-items:center;gap:9px}
.brand .co img{width:auto;height:26px;display:block;flex:none}
/* PFA's name is twice the length of CineKind's, so it is set smaller and
   tighter. Otherwise the guest brand outweighs the host in the lockup. */
.brand .co i{font-style:normal;font-family:var(--caps);font-size:10.5px;letter-spacing:.18em;
             text-transform:uppercase;color:var(--muted);white-space:nowrap}
.brand:hover .co i{color:var(--ink)}
@media (max-width:640px){
  .brand .co i{display:none}
  .brand .co img{height:22px}
  .brand b{font-size:13px;letter-spacing:.3em}
}

/* selection and focus follow the site */
::selection{background:var(--gold);color:var(--bg)}
:focus-visible{outline:2px solid var(--gold);outline-offset:3px}
"""


def main(path):
    s = open(path, encoding="utf-8").read()
    before = s

    for a, b in TOKENS.items():
        if a not in s:
            print("  token not found:", a)
        s = s.replace(a, b)

    for pat, rep in LITERALS:
        s = re.sub(pat, rep, s)

    # Ask for the fonts the way the PFA site does. Cormorant is no longer
    # referenced, and Archivo has to come with the width axis and the full
    # weight range or the display spec cannot render.
    s = re.sub(r"https://fonts\.googleapis\.com/css2\?family=[^\"]+",
               "https://fonts.googleapis.com/css2?family=Archivo:ital,wdth,wght"
               "@0,62..125,100..900&family=Marcellus&display=swap", s)

    # the header becomes a co-brand lockup
    old_brand = ('<a class="brand" href="/" aria-label="CineKind home">'
                 '<b>CineKind</b></a>')
    new_brand = ('<a class="brand" href="/" aria-label="CineKind with People for Animals">'
                 '<b>CineKind</b>'
                 '<span class="x" aria-hidden="true">&#215;</span>'
                 '<span class="co"><img src="' + EMBLEM + '" alt="" width="92" height="84">'
                 '<i>People for Animals</i></span></a>')
    if old_brand in s:
        s = s.replace(old_brand, new_brand, 1)
    else:
        print("  header lockup: brand markup not found, left alone")

    i = s.rfind("</style>")
    s = s[:i] + PFA_LAYER + s[i:]

    open(path, "w", encoding="utf-8").write(s)
    print(f"  rewritten: {len(before)} -> {len(s)} bytes")


if __name__ == "__main__":
    main(sys.argv[1])
