/* ============================================================
   PFA Store - apparel catalogue
   Additive. Merges into window.PFA_PRODUCTS after pfa-store-data.js
   loads, so the base catalogue file is never edited.

   MODEL
   The supplier sheet lists one row per colourway per weight.
   Collapsed here to one product per design and weight, with the
   colourways carried as COLORS variants. Weight stays part of the
   product identity because the two bodies price differently
   (180 GSM at 549, 240 GSM at 599) and the schema has only two
   variant axes, sizes and colours.

   Each colourway carries its own shot list, so selecting a colour
   swaps the whole gallery rather than only tinting the stage.

   Product ids must match [a-z0-9]+ - the router regex is
   #/p/([a-z0-9]+) and rejects hyphens and underscores.
   Colour names must be one word - the swatch class is 'pal-' plus
   the lowercased name, and each needs a .pal-* rule in store.html.

   IMAGES: supplier CDN, pending rehost. See the note at the foot.
   ============================================================ */
(function () {
  "use strict";

  var CDN = "https://www.fingrella.com/cdn/shop/files/";
  function shots() {
    return Array.prototype.map.call(arguments, function (f) { return CDN + f; });
  }
  function art(u) {
    return '<div class="ph-img"><img referrerpolicy="no-referrer" src="' + u + '" alt="" loading="lazy" decoding="async"></div>';
  }

  var TEE = ["S", "M", "L", "XL", "XXL"];

  /* colourway -> shot list, per product */
  var IMGS = {

    fghw1: {
      Ink: shots(
        "98_20_c52a0b95-c58f-48e3-ae97-513d796045e5.jpg?v=1770218166&width=1946",
        "c_4.jpg?v=1780120996&width=1946",
        "c_1_5e3eabf7-3189-4281-bb2a-55e78043358b.png?v=1780120997&width=1946",
        "c_2_ab149ef1-9560-4f08-8579-05f6003db168.jpg?v=1780120995&width=1946",
        "c_3_e64b1566-7ac2-4a57-8ef0-4b17802643a9.jpg?v=1780120995&width=1946"),
      Porcelain: shots(
        "98_25_af6976f7-9cff-4338-bbd9-bf5fecb7bd9c.jpg?v=1770217852&width=1946",
        "xxds_2_bd82a7e3-1114-4a45-b46e-cee7f077a37a.jpg?v=1780123644&width=1946",
        "xxds_1.png?v=1780120676&width=1946",
        "xxds_1.jpg?v=1780120674&width=1946",
        "xxds_3.jpg?v=1780120675&width=1946"),
      White: shots(
        "98_13_fdd16421-83ae-44f8-b981-caf31583ce88.jpg?v=1770218058&width=1946",
        "xcs_2_7aaf3e0e-7d93-4f7d-a7c7-f787bdf3338e.jpg?v=1780123671&width=1946",
        "xxds_2.png?v=1780120835&width=1946",
        "xxds_4.jpg?v=1780120834&width=1946",
        "xxds_5.jpg?v=1780120834&width=1946"),
      Sand: shots(
        "98_7_5728050a-1bde-4941-bde2-4527f4eda2b5.jpg?v=1770218082&width=1946",
        "x_7_7ea94182-5eed-435d-823c-3a769b9e58f2.jpg?v=1780120868&width=1946",
        "x_4.png?v=1780120870&width=1946",
        "x_8_e7c47f01-364b-41c6-a94c-3063e24aee30.jpg?v=1780120867&width=1946",
        "x_2_bdc32bb6-96d0-44a7-8c92-3e589f4d5198.png?v=1780120869&width=1946"),
      Cocoa: shots(
        "98_5_5e20c5f0-f07c-430b-9366-a52ba54b67f4.jpg?v=1770218111&width=1946",
        "x_29.jpg?v=1780120904&width=1946",
        "x_11_dfb07f95-d280-48c8-8f7e-bb03649eea94.png?v=1780120905&width=1946",
        "x_27_5926dd22-f4ec-4c3e-bc39-e6db9c92d695.jpg?v=1780120903&width=1946",
        "x_28_9bec39a8-6ccd-41af-bcd4-7510511cc2cf.jpg?v=1780120903&width=1946"),
      Navy: shots(
        "98_15_97ff3b1b-a5f9-4e9c-a59f-adde261aa6df.jpg?v=1774956513&width=1946",
        "1_9_7707fabd-1b10-4a4e-a203-80db020231b6.png?v=1780049818&width=1946",
        "x_14.png?v=1780120294&width=1946",
        "x_32_d6574a38-587e-4688-9195-9d03ae541ebd.jpg?v=1780120292&width=1946",
        "x_31_365c3b8a-d903-4722-a295-1b255e81f168.jpg?v=1780120291&width=1946"),
      Heather: shots(
        "99.png?v=1776409384&width=1946",
        "x_2_c3429fc0-6940-427e-85f1-ee28727c74aa.jpg?v=1780120725&width=1946",
        "x_1_3546fea2-85f3-434a-b438-ba9f1ab1a5f4.png?v=1780120726&width=1946",
        "x_1_fdb50015-b926-49a7-be77-73c63d0e6b6a.jpg?v=1780120724&width=1946"),
      Olive: shots(
        "98_26_d34266d4-f61c-4ddd-9081-77fb5671518c.jpg?v=1770217762&width=1946",
        "xs_3.jpg?v=1780120433&width=1946",
        "xs_1.png?v=1780120434&width=1946",
        "xs_1.jpg?v=1780120431&width=1946",
        "xs_2.jpg?v=1780120432&width=1946"),
      Red: shots(
        "98_10_8e4278a1-b422-43ea-82a8-84cb5021c2d4.jpg?v=1770217815&width=1946",
        "x_24_5b4a29cf-4fb2-40e6-948a-f89b0cd259c9.jpg?v=1780120609&width=1946",
        "x_26.jpg?v=1780120609&width=1946",
        "x_10.png?v=1780120610&width=1946",
        "x_25.jpg?v=1780120609&width=1946"),
      Maroon: shots(
        "98_16_6a55c78d-1803-4bb1-98cf-6b98fd0e7094.jpg?v=1770217724&width=1946",
        "xsd_1.jpg?v=1780120380&width=1946",
        "xsd_1.png?v=1780120383&width=1946",
        "xsd_2.jpg?v=1780120381&width=1946")
    },

    fgmw1: {
      White: shots(
        "98_13.jpg?v=1770128087&width=1946",
        "98_12.jpg?v=1770128087&width=1946"),
      Sand: shots(
        "98_7.jpg?v=1770128119&width=1946",
        "os_4_6e4bd76c-d193-44d1-9822-0008368d49da.jpg?v=1770128119&width=1946",
        "os_5.jpg?v=1770128119&width=1946",
        "os_6_dd763f59-d3b6-41a4-9281-78ed2e07f438.jpg?v=1770128119&width=1946"),
      Cocoa: shots(
        "98_5.jpg?v=1770127590&width=1946",
        "98_4.jpg?v=1770127590&width=1946")
    },

    fgawhw1: {
      Ink: shots(
        "11_1_4d05f4dc-20a2-4b52-94df-580b498440b9.jpg?v=1770218132&width=1946",
        "1_4_fc5ef2ce-cf35-4739-9038-9d71f50e4d26.png?v=1780120955&width=1946",
        "1_3_481492a4-1de0-4cfb-8136-5dc34da57a8d.png?v=1780120954&width=1946",
        "1_1_609ca2bb-d95d-4588-a7c4-899678f1f9d4.png?v=1780120951&width=1946",
        "1_2_b904c493-17ff-44b9-83fb-e916ffcb15ef.png?v=1780120953&width=1946")
    },

    fgsunday1: {
      White: shots(
        "x_2_e0164df2-ab6c-4af1-844d-d295f9724184.jpg?v=1770182483&width=1946",
        "d_2.jpg?v=1770182483&width=1946",
        "1_12_4aad184e-ea42-4b20-bc3e-bc9223769751.jpg?v=1781323042&width=1946",
        "1_92.jpg?v=1779796525&width=1946"),
      Porcelain: shots(
        "x_1_1de44e83-a7b4-4713-a310-1c6b357e1695.jpg?v=1770182457&width=1946",
        "d_1.jpg?v=1770182457&width=1946",
        "1_13_84de11c0-4bc7-4c93-a4f3-13931f88100e.jpg?v=1781323043&width=1946",
        "1_33_42085235-463d-4c27-9bc9-8f10d5c5cb12.jpg?v=1780740266&width=1946")
    },

    fgiced1: {
      Porcelain: shots(
        "c_1_c9ee7888-ebed-4857-8b7a-ea8a537dd3f0.jpg?v=1778398935&width=1946",
        "x_4_f360d86c-1f09-4e14-a6ef-9bb0c48ba3cb.jpg?v=1778398935&width=1946",
        "1_3_393e97cd-ff9c-4e1f-8c84-62290c401b29.jpg?v=1781268816&width=1946",
        "xz_5.png?v=1779853590&width=1946")
    },

    fgkatana1: {
      Ink: shots(
        "x_1_d01deb89-1986-4a48-9420-e507b76522de.jpg?v=1770179041&width=1946",
        "xz_2_35d84d79-6080-4ebb-8699-1d9a0300514e.jpg?v=1779806357&width=1946")
    },

    fgsakura1: {
      Porcelain: shots(
        "98_25_2e0211a0-b75f-4cae-ba10-555b3ccbf030.jpg?v=1770182032&width=1946",
        "xz_4_88b7a350-b157-4596-84c8-a2f508ac7457.png?v=1779853659&width=1946")
    },

    fgtearex1: {
      Porcelain: shots(
        "x_3_625ea212-8394-48f3-b24c-03c37bb7cdf2.jpg?v=1770183333&width=1946",
        "1_87.jpg?v=1779795230&width=1946")
    },

    fgtokyo1: {
      Porcelain: shots(
        "x_1_15770c0a-2edb-4948-ae84-8a17373e0db5.jpg?v=1770183754&width=1946",
        "1_57.png?v=1779794826&width=1946")
    },

    fggoose1: {
      Cocoa: shots(
        "x_3_089413f0-34ba-4a14-8d83-3804414bd862.jpg?v=1770130074&width=1946",
        "cz_3_6537a611-d704-4d20-bd5d-3273ff71ccd3.jpg?v=1779807745&width=1946")
    },

    fgbrooklyn1: {
      Ink: shots(
        "cx_5_0260c373-53a4-4793-998f-901bf5997a21.jpg?v=1771484078&width=1946",
        "xc_3_2f774c90-6123-4240-ac28-18c187ad0e82.png?v=1781927243&width=1946")
    },

    fgla1: {
      Ink: shots(
        "1_8_99a266f8-6d7e-4037-8bc7-0d8dbd9372de.jpg?v=1770519795&width=1946",
        "zx_2.jpg?v=1779771894&width=1946",
        "zx_1.png?v=1779771908&width=1946")
    }
  };

  var A = {

    /* ---------- blanks ---------- */

    fghw1: {
      name: "Heavy Weight Oversized Tee",
      cat: "apparel", spec: "240 GSM, oversized fit",
      price: 599, mrp: 1699, mprice: 539, tag: "New",
      sizes: TEE, fit: "Oversized. Take your usual size", stock: 40,
      impact: ["Feeds a shelter dog for two days", 150],
      mat: "240 GSM combed cotton, bio-washed",
      care: "Machine wash cold, inside out. Do not tumble dry.",
      story: "The heavy one. Holds its shape through a monsoon and a hundred washes.",
      pairs: ["fgmw1", "fgawhw1", "cap1"]
    },

    fgmw1: {
      name: "Oversized Tee",
      cat: "apparel", spec: "180 GSM super combed cotton, oversized fit",
      price: 549, mrp: 2199, mprice: 499, tag: "",
      sizes: TEE, fit: "Oversized. Take your usual size", stock: 52,
      impact: ["Vaccinates one street dog", 120],
      mat: "180 GSM super combed cotton",
      care: "Machine wash cold, inside out.",
      story: "The everyday body. Light enough for a Karnataka summer, cut to sit easy.",
      pairs: ["fghw1", "cap1", "tote1"]
    },

    fgawhw1: {
      name: "Acid Washed Heavy Weight Tee",
      cat: "apparel", spec: "240 GSM, acid washed, oversized fit",
      price: 599, mrp: 1699, mprice: 539, tag: "",
      sizes: TEE, fit: "Oversized. Take your usual size", stock: 14,
      impact: ["Feeds a shelter dog for two days", 150],
      mat: "240 GSM combed cotton, garment acid washed",
      care: "Wash separately the first time. Cold water only.",
      story: "The heavy body, put through the wash. No two fade quite the same way.",
      pairs: ["fghw1", "fgla1", "hood1"]
    },

    /* ---------- prints, 180 GSM ---------- */

    fgsunday1: {
      name: "Slow Sunday Coffee Club Tee",
      cat: "apparel", spec: "Printed, 180 GSM, oversized fit",
      price: 549, mrp: 2199, mprice: 499, tag: "",
      sizes: TEE, fit: "Oversized. Take your usual size", stock: 31,
      impact: ["A hot meal for a shelter volunteer", 85],
      mat: "180 GSM combed cotton, water-based print",
      care: "Machine wash cold, inside out. Do not iron the print.",
      story: "For the morning that starts slowly, next to a dog who started earlier.",
      pairs: ["fgiced1", "cof1", "mug1"]
    },

    fgiced1: {
      name: "Iced Coffee Club Tee",
      cat: "apparel", spec: "Printed, 180 GSM, oversized fit",
      price: 549, mrp: 2199, mprice: 499, tag: "",
      sizes: TEE, fit: "Oversized. Take your usual size", stock: 27,
      impact: ["A hot meal for a shelter volunteer", 85],
      mat: "180 GSM combed cotton, water-based print",
      care: "Machine wash cold, inside out. Do not iron the print.",
      story: "The summer half of the same club. Same dog, earlier walk.",
      pairs: ["fgsunday1", "cof1", "bot1"]
    },

    fgkatana1: {
      name: "Katana Cat Tee",
      cat: "apparel", spec: "Printed, 180 GSM, oversized fit",
      price: 549, mrp: 2199, mprice: 499, tag: "",
      sizes: TEE, fit: "Oversized. Take your usual size", stock: 26,
      impact: ["Treats one cat at the clinic", 130],
      mat: "180 GSM combed cotton, water-based print",
      care: "Machine wash cold, inside out. Do not iron the print.",
      story: "A cat with a sword. We asked no further questions.",
      pairs: ["fgmw1", "treat1", "collar1"]
    },

    fgsakura1: {
      name: "Sakura Tee",
      cat: "apparel", spec: "Printed, 180 GSM, oversized fit",
      price: 549, mrp: 2199, mprice: 499, tag: "",
      sizes: TEE, fit: "Oversized. Take your usual size", stock: 22,
      impact: ["Buys a week of kitten formula", 90],
      mat: "180 GSM combed cotton, water-based print",
      care: "Machine wash cold, inside out. Do not iron the print.",
      story: "Blossom that lasts about a week, printed on something that will not.",
      pairs: ["fgtokyo1", "fgtearex1", "note1"]
    },

    fgtearex1: {
      name: "Tea Rex Tee",
      cat: "apparel", spec: "Printed, 180 GSM, oversized fit",
      price: 549, mrp: 2199, mprice: 499, tag: "",
      sizes: TEE, fit: "Oversized. Take your usual size", stock: 24,
      impact: ["Vaccinates one street dog", 120],
      mat: "180 GSM combed cotton, water-based print",
      care: "Machine wash cold, inside out. Do not iron the print.",
      story: "The pun is the whole point. Wear it to a shelter shift anyway.",
      pairs: ["fgmw1", "mug1", "fgsakura1"]
    },

    fgtokyo1: {
      name: "Tokyo Tee",
      cat: "apparel", spec: "Printed, 180 GSM, oversized fit",
      price: 549, mrp: 2199, mprice: 499, tag: "",
      sizes: TEE, fit: "Oversized. Take your usual size", stock: 19,
      impact: ["Buys a week of kitten formula", 90],
      mat: "180 GSM combed cotton, water-based print",
      care: "Machine wash cold, inside out. Do not iron the print.",
      story: "Mount Fuji, drawn small. The mountain does not need the help.",
      pairs: ["fgsakura1", "fgkatana1", "pack1"]
    },

    fggoose1: {
      name: "Goose Bumps Tee",
      cat: "apparel", spec: "Printed, 180 GSM, oversized fit",
      price: 549, mrp: 2199, mprice: 499, tag: "",
      sizes: TEE, fit: "Oversized. Take your usual size", stock: 21,
      impact: ["Treats one bird at the clinic", 110],
      mat: "180 GSM combed cotton, water-based print",
      care: "Machine wash cold, inside out. Do not iron the print.",
      story: "Geese are rescued more often than you would think. They remember faces.",
      pairs: ["fgmw1", "note1", "stk1"]
    },

    /* ---------- prints, 240 GSM ---------- */

    fgbrooklyn1: {
      name: "Brooklyn Heavy Weight Tee",
      cat: "apparel", spec: "Printed, 240 GSM, oversized fit",
      price: 599, mrp: 1699, mprice: 539, tag: "",
      sizes: TEE, fit: "Oversized. Take your usual size", stock: 17,
      impact: ["Feeds a shelter dog for two days", 150],
      mat: "240 GSM combed cotton, water-based print",
      care: "Machine wash cold, inside out. Do not iron the print.",
      story: "Heavy cotton, block letters. Nothing else asked of it.",
      pairs: ["fghw1", "fgla1", "cap2"]
    },

    fgla1: {
      name: "Los Angeles Acid Washed Tee",
      cat: "apparel", spec: "Printed, 240 GSM, acid washed, oversized fit",
      price: 599, mrp: 1699, mprice: 539, tag: "",
      sizes: TEE, fit: "Oversized. Take your usual size", stock: 12,
      impact: ["Feeds a shelter dog for two days", 150],
      mat: "240 GSM combed cotton, garment acid washed, water-based print",
      care: "Wash separately the first time. Cold water only.",
      story: "Washed hard, printed harder. Fades into something that looks lived in.",
      pairs: ["fgawhw1", "fgbrooklyn1", "jkt1"]
    }
  };

  /* Derive art and colourways from IMGS, so the shot list is the single source
     of truth and a product can never offer a colour it has no photo for. */
  var C = {};
  Object.keys(A).forEach(function (id) {
    var cols = Object.keys(IMGS[id] || {});
    if (!cols.length) return;
    C[id] = cols;
    A[id].imgs = IMGS[id];
    A[id].art = art(IMGS[id][cols[0]][0]);
  });

  window.PFA_PRODUCTS = window.PFA_PRODUCTS || {};
  Object.keys(A).forEach(function (id) { window.PFA_PRODUCTS[id] = A[id]; });
  window.PFA_APPAREL_COLORS = C;
})();

/* ------------------------------------------------------------
   OPEN: image hosting.
   Every src points at the supplier's Shopify CDN. The ?v= stamps
   rotate when the supplier re-uploads, and the CDN can refuse
   cross-origin referrers at any time. Both fail silently - the
   store just shows gaps. Pull these down and serve from PFA media
   before launch.
   ------------------------------------------------------------ */
