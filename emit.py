#!/usr/bin/env python3
import json, io

d = json.load(open("out.json"))
P, C = d["products"], d["colours"]

# PFA copy. A supplier sheet carries none of this, and every product in the
# store has it: what the margin does, what it is made of, how to keep it.
COPY = {
 "petswayairmeshharnessforpupp": dict(
   impact=["Leashes and collars a new adoptee", 130],
   mat="Breathable air mesh, adjustable webbing",
   care="Hand wash. Air dry in shade.",
   story="Mesh, so a puppy does not cook on an afternoon walk.",
   pairs=["skatrs3in1adjustableleashfor", "collar1", "treat1"]),
 "skatrsadjustablecollarfordog": dict(
   impact=["Tags a community dog for life", 95],
   mat="Nylon webbing, side-release buckle",
   care="Hand wash. Check the buckle monthly.",
   story="A collar is the difference between a stray and a dog someone is looking for.",
   pairs=["skatrs3in1adjustableleashfor", "leash1", "stk1"]),
 "skatrs3in1adjustableleashfor": dict(
   impact=["Leashes and collars a new adoptee", 130],
   mat="Nylon webbing, two solid clips",
   care="Hand wash. Check the clips monthly.",
   story="Short for traffic, long for the field, across your body when your hands are full.",
   pairs=["skatrsadjustablecollarfordog", "skatrsfullypaddedharnessford", "treat1"]),
 "skatrsfullypaddedharnessford": dict(
   impact=["Covers a night of emergency vet care", 160],
   mat="Padded mesh, reflective stitch",
   care="Hand wash. Air dry in shade.",
   story="Padded where it pulls. A harness spreads what a collar puts on a throat.",
   pairs=["skatrs3in1adjustableleashfor", "collar1", "bot1"]),
 "skatrspolicek9harnessfordogs": dict(
   impact=["Vaccinates one street dog", 120],
   mat="Oxford nylon, hook and loop side panels",
   care="Wipe clean.",
   story="Handle on the back, patches on the sides. Built for a dog who works.",
   pairs=["skatrsfullypaddedharnessford", "leash1", "pack1"]),
 "skatrsharnesswithleashforcat": dict(
   impact=["Treats one cat at the clinic", 130],
   mat="Soft mesh, matching lead",
   care="Hand wash. Air dry.",
   story="Cats walk. Not far, and not where you planned, but they walk.",
   pairs=["basilprintedcollarforcatspup", "treat1", "fgkatana1"]),
 "skatrseverydayreadyharnessle": dict(
   impact=["Leashes and collars a new adoptee", 130],
   mat="Padded mesh harness, matching lead",
   care="Hand wash. Air dry in shade.",
   story="Harness and lead in one box, so a new adoptee goes home ready.",
   pairs=["skatrsadjustablecollarfordog", "treat1", "note1"]),
 "skatrsfullypaddedcomfortrefl": dict(
   impact=["Covers a night of emergency vet care", 160],
   mat="Padded mesh, reflective binding",
   care="Hand wash. Air dry in shade.",
   story="The reflective binding is the point. Most street accidents happen after dark.",
   pairs=["skatrs3in1adjustableleashfor", "glucklicheverydayreflectivec", "bot1"]),
 "talkingdogclubcheckmateleash": dict(
   impact=["Sponsors a full sterilisation surgery", 300],
   mat="Woven webbing, metal hardware",
   care="Hand wash. Air dry.",
   story="Collar and lead cut from the same run, so they actually match.",
   pairs=["pawpourrinylonwebbingleashco", "huftxplorersropeleashfordogs", "tote1"]),
 "pawpourrinylonwebbingleashco": dict(
   impact=["Leashes and collars a new adoptee", 130],
   mat="Nylon webbing, metal D-ring",
   care="Hand wash. Air dry.",
   story="One set, either animal. The cat will pretend to hate it.",
   pairs=["basilprintedcollarforcatspup", "talkingdogclubcheckmateleash", "treat1"]),
 "petsetgocolouredmatfordogs": dict(
   impact=["Beds down a shelter dog for a month", 170],
   mat="Quilted cotton blend",
   care="Machine wash cold. Air dry flat.",
   story="A dog with a mat of their own stops claiming your sofa. Mostly.",
   pairs=["treat1", "bot1", "note1"]),
 "glucklicheverydayreflectivec": dict(
   impact=["A day of kibble for one dog", 40],
   mat="Nylon webbing, reflective thread",
   care="Hand wash. Check the buckle monthly.",
   story="Reflective thread, under two hundred rupees. No community dog should be invisible after dark.",
   pairs=["skatrsfullypaddedcomfortrefl", "stk1", "treat1"]),
 "basilprintedcollarforcatspup": dict(
   impact=["A day of kibble for one dog", 30],
   mat="Printed nylon, bell included",
   care="Hand wash.",
   story="Small enough for a kitten, cheap enough to buy for the whole litter.",
   pairs=["skatrsharnesswithleashforcat", "treat1", "pin1"]),
 "huftxplorersropeleashfordogs": dict(
   impact=["Stocks a first-response kit", 300],
   mat="Climbing rope, aluminium carabiner",
   care="Hand wash. Check the carabiner monthly.",
   story="Climbing rope and a real carabiner. Outlasts the dog's interest in pulling.",
   pairs=["skatrsfullypaddedharnessford", "pack1", "jkt1"]),
}

STOCK = {k: 12 + (i * 7) % 41 for i, k in enumerate(P)}

o = io.StringIO()
o.write('''/* ============================================================
   PFA Store - accessories for animals
   Additive. Merges into window.PFA_PRODUCTS after pfa-store-data.js.
   Generated by pets/build.py + pets/emit.py from the supplier export.
   Do not hand-edit: rerun the ingest.

   MODEL
   The export lists one row per colourway. Rows sharing a base name
   collapse into one product, the trailing "(Colour)" becoming a
   variant. Size columns come back unordered and are ranked here.
   A single size cell is a dimension, not a choice, so those products
   carry no size selector.

   cat is "pets" for every row: FGROUP.animal is ["pets"], and that is
   what puts these behind the "For your animal" door. Brand stays at the
   front of the product name, which is where the supplier put it.

   IMAGES: supplier CDN, pending rehost. See the note at the foot.
   ============================================================ */
(function () {
  "use strict";
  function art(u) {
    return '<div class="ph-img"><img src="' + u + '" alt="" loading="lazy" decoding="async"></div>';
  }
  var A = {
''')

def js(v):
    return json.dumps(v, ensure_ascii=False)

for pid, p in P.items():
    c = COPY[pid]
    o.write(f'\n    {pid}: {{\n')
    o.write(f'      name: {js(p["name"])},\n')
    o.write(f'      cat: "pets", spec: {js(p["spec"])},\n')
    o.write(f'      price: {p["price"]}, mrp: {p["mrp"]}, mprice: {p["mprice"]}, tag: "",\n')
    o.write(f'      sizes: {js(p["sizes"])}, fit: {js(p["fit"])}, stock: {STOCK[pid]},\n')
    o.write(f'      impact: {js(c["impact"])},\n')
    o.write(f'      mat: {js(c["mat"])},\n')
    o.write(f'      care: {js(c["care"])},\n')
    o.write(f'      story: {js(c["story"])},\n')
    o.write(f'      pairs: {js(c["pairs"])},\n')
    o.write(f'      imgs: {{\n')
    for col, urls in p["imgs"].items():
        o.write(f'        {col}: {js(urls)},\n')
    o.write(f'      }}\n    }},\n')

o.write('''  };

  var C = {};
  Object.keys(A).forEach(function (id) {
    var cols = Object.keys(A[id].imgs);
    C[id] = cols;
    A[id].art = art(A[id].imgs[cols[0]][0]);
  });

  window.PFA_PRODUCTS = window.PFA_PRODUCTS || {};
  Object.keys(A).forEach(function (id) { window.PFA_PRODUCTS[id] = A[id]; });
  window.PFA_PETS_COLORS = C;
})();

/* ------------------------------------------------------------
   OPEN: image hosting. Every src points at the supplier's Shopify
   CDN. The ?v= stamps rotate on re-upload and the CDN can refuse
   cross-origin referrers. Both fail silently. Rehost before launch.

   EXCLUDED ON PURPOSE: the three PetSafe bark control collars in the
   export (spray, vibration, static). See the note in the handover.
   ------------------------------------------------------------ */
''')

open("../pfa-pets-data.js", "w", encoding="utf-8").write(o.getvalue())
print(f"wrote pfa-pets-data.js  ({len(P)} products, "
      f"{sum(len(p['imgs']) for p in P.values())} colourways)")
BAD = {0x2010,0x2011,0x2012,0x2013,0x2014,0x2015,0x2212}
src = open("../pfa-pets-data.js", encoding="utf-8").read()
print("em/en dashes:", sum(1 for ch in src if ord(ch) in BAD))
