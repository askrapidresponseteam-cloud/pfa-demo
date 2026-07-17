#!/usr/bin/env python3
"""
Turn a supplier accessory export into pfa-pets-data.js.

Input TSV columns:  name(Colour) \t size|size|... \t price \t mrp \t image

Rules encoded here, so the full export can be run in one pass:
  - the trailing "(Colour)" is a variant, not a product. Rows sharing a
    base name collapse into one product with colourways.
  - the export returns size columns unordered (S, M, XL, XS). They are
    ranked canonically.
  - a single size cell is a dimension, not a choice: it becomes the fit
    and the product carries no size selector.
  - ids must match [a-z0-9]+, the router regex rejects anything else.
  - colour names are slugged for the swatch class; each needs a palette hex.
"""
import re, json, collections, sys

CDN = "https://cdn.shopify.com/s/files/1/0565/8021/0861/files/"
SIZE_ORDER = ["XXS", "XS", "S", "S/M", "M", "M/L", "L", "L/XL", "XL", "XXL"]

# supplier colour name -> (PFA swatch name, hex). Black folds into the
# existing Ink token rather than adding a near-duplicate.
PALETTE = {
    "Black": ("Ink", None), "Red": ("Red", None), "Lavender": ("Lavender", None),
    "Grey": ("Grey", "#9aa1a8"), "Neon": ("Neon", "#c6f000"), "Yellow": ("Yellow", "#f2c200"),
    "Blue": ("Blue", "#2f6fd0"), "Orange": ("Orange", "#e07b39"), "Pink": ("Pink", "#e8709b"),
    "Purple": ("Purple", "#6d4aa0"), "Turquoise": ("Turquoise", "#2bb3b3"),
    "Flamingo Pink": ("Flamingo", "#f2758f"), "Ruby Red": ("Ruby", "#9b1b30"),
    "Aqua Teal": ("Aqua", "#1fa9a0"), "Cosmic Purple": ("Cosmic", "#5b3a8e"),
    "Cherry Pink": ("Cherry", "#d94f70"), "Mint Green": ("Mint", "#8fd6b4"),
}

def size_rank(s):
    tok = s.split(":")[0].strip()
    return (SIZE_ORDER.index(tok), s) if tok in SIZE_ORDER else (99, s)

def slug(name, taken):
    base = re.sub(r"[^a-z0-9]", "", name.lower())[:28] or "item"
    out, n = base, 2
    while out in taken:
        out = f"{base}{n}"; n += 1
    taken.add(out)
    return out

rows = []
for ln in open("rows.tsv", encoding="utf-8"):
    ln = ln.rstrip("\n")
    if not ln.strip():
        continue
    name, sizes, price, mrp, img = ln.split("\t")
    m = re.match(r"^(.*?)\s*\(([^()]+)\)\s*$", name)
    base, colour = (m.group(1), m.group(2)) if m else (name, None)
    rows.append(dict(base=base, colour=colour, sizes=[s for s in sizes.split("|") if s],
                     price=int(price), mrp=int(mrp), img=img))

groups = collections.OrderedDict()
for r in rows:
    groups.setdefault(r["base"], []).append(r)

taken, products, colours, used = set(), collections.OrderedDict(), {}, set()
for base, rs in groups.items():
    pid = slug(base, taken)
    sizes = sorted(rs[0]["sizes"], key=size_rank)
    is_choice = len(sizes) > 1
    imgs = collections.OrderedDict()
    for r in rs:
        if not r["colour"]:
            continue
        if r["colour"] not in PALETTE:
            sys.exit(f"unmapped colour: {r['colour']!r} on {base!r}")
        sw = PALETTE[r["colour"]][0]
        used.add(r["colour"])
        imgs[sw] = [CDN + r["img"]]
    products[pid] = dict(
        name=base, cat="pets",
        spec=(sizes[0].split(":")[0] + " to " + sizes[-1].split(":")[0]) if is_choice else sizes[0],
        price=rs[0]["price"], mrp=rs[0]["mrp"],
        mprice=int(round(rs[0]["price"] * 0.92 / 10.0)) * 10,
        sizes=sizes if is_choice else None,
        fit=(", ".join(sizes) if is_choice else sizes[0]),
        imgs=imgs,
    )
    colours[pid] = list(imgs.keys())

# sanity: every row landed, every product has art and at least one colourway
assert sum(len(v) for v in groups.values()) == len(rows)
for pid, p in products.items():
    assert p["imgs"], pid
    assert re.fullmatch(r"[a-z0-9]+", pid), pid

print(f"{len(rows)} rows -> {len(products)} products")
for pid, p in products.items():
    print(f"  {pid:<30} {len(p['imgs'])} col  "
          f"{'sizes ' + str(len(p['sizes'])) if p['sizes'] else 'fit ' + repr(p['fit'])}")

need = [(PALETTE[c][0], PALETTE[c][1]) for c in used if PALETTE[c][1]]
print("\npalette entries needed:")
for n, h in sorted(set(need)):
    print(f"  .pal-{n.lower()} i{{background:{h}}}")

json.dump(dict(products=products, colours=colours,
               palette=sorted(set(need))), open("out.json", "w"), indent=1)
print("\nwrote out.json")
