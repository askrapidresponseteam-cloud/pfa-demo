"""Retune pfa-glass.css for the ink build.

The glass layer is hand-tuned rather than inverted: it already carries two
recipes, one for light surfaces and one for dark, and on ink the panels want
the quiet recipe while the ambient wash wants a little more of the blue.
"""
import sys

SUBS = [
    ("--g-rim: inset 0 1px 0 rgba(255, 255, 255, .82);",
     "--g-rim: inset 0 1px 0 rgba(255, 255, 255, .10);"),
    ("--g-edge: inset 0 0 0 1px rgba(255, 255, 255, .34);",
     "--g-edge: inset 0 0 0 1px rgba(255, 255, 255, .06);"),
    ("--g-sheen: linear-gradient(158deg, rgba(255, 255, 255, .9) 0%, rgba(255, 255, 255, .34) 46%, rgba(255, 255, 255, 0) 78%);",
     "--g-sheen: linear-gradient(158deg, rgba(255, 255, 255, .07) 0%, rgba(255, 255, 255, .02) 44%, rgba(255, 255, 255, 0) 76%);"),
    ("--g-hair: rgba(14, 17, 22, .11);", "--g-hair: rgba(255, 255, 255, .12);"),
    ("--g-drop: 0 40px 90px -50px rgba(14, 17, 22, .55), 0 2px 8px rgba(14, 17, 22, .06);",
     "--g-drop: 0 40px 90px -50px rgba(0, 0, 0, .75), 0 2px 8px rgba(0, 0, 0, .3);"),
    ("radial-gradient(1100px 620px at 12% -6%, rgba(0, 164, 255, .05), transparent 62%)",
     "radial-gradient(1100px 620px at 12% -6%, rgba(0, 164, 255, .07), transparent 62%)"),
    ("radial-gradient(900px 520px at 92% 8%, rgba(0, 109, 179, .04), transparent 58%)",
     "radial-gradient(900px 520px at 92% 8%, rgba(0, 109, 179, .09), transparent 58%)"),
    ("radial-gradient(760px 420px at 88% 0%, rgba(0, 164, 255, .055), transparent 62%),\n    linear-gradient(180deg, rgba(255, 255, 255, .62) 0%, rgba(255, 255, 255, 0) 46%);",
     "radial-gradient(760px 420px at 88% 0%, rgba(0, 164, 255, .06), transparent 62%),\n    linear-gradient(180deg, rgba(255, 255, 255, .035) 0%, rgba(255, 255, 255, 0) 46%);"),
    ("background-color: rgba(255, 255, 255, .74);", "background-color: rgba(21, 25, 31, .94);"),
    # The menu sheet was translucent over a blur, so how it read depended on the
    # page behind it: over the film hero it picked up the photo and came out
    # mottled and brighter than elsewhere. Measured across seven pages the sheet
    # varied by 8.8 in luminance. An opaque sheet with the same sheen and rim
    # renders identically everywhere, and the blur behind it is then redundant.
    ("""nav.pfa-menu {
  background-color: rgba(255, 255, 255, .88);
  -webkit-backdrop-filter: blur(34px) saturate(1.5);
  backdrop-filter: blur(34px) saturate(1.5);""",
     """nav.pfa-menu {
  background-color: #0E1116;
  background-image: linear-gradient(180deg, rgba(255, 255, 255, .045), rgba(255, 255, 255, 0) 240px);"""),
    ("""  background-color: rgba(255, 255, 255, .9);
  background-image: linear-gradient(180deg, rgba(255, 255, 255, .5), rgba(255, 255, 255, 0) 220px);""",
     """  background-color: rgba(14, 17, 22, .9);
  background-image: linear-gradient(180deg, rgba(255, 255, 255, .05), rgba(255, 255, 255, 0) 220px);"""),
    (".np-panel { border-color: rgba(255, 255, 255, .5); }",
     ".np-panel { border-color: rgba(255, 255, 255, .12); }"),
    ("background-color: rgba(255, 255, 255, .09);", "background-color: rgba(255, 255, 255, .07);"),
    (".apanel { background-color: rgba(255, 255, 255, .98); }",
     ".apanel { background-color: rgba(14, 17, 22, .98); }"),
    (".cx-tile { background-color: rgba(255, 255, 255, .94); }",
     ".cx-tile { background-color: rgba(20, 24, 30, .96); }"),
]


def main(path):
    s = open(path, encoding="utf-8").read()
    missed = []
    for a, b in SUBS:
        if a in s:
            s = s.replace(a, b)
        else:
            missed.append(a[:56])
    open(path, "w", encoding="utf-8").write(s)
    print(f"glass: applied {len(SUBS) - len(missed)}/{len(SUBS)}")
    for m in missed:
        print("  missed:", m)


if __name__ == "__main__":
    main(sys.argv[1])
