/* Lifting a photograph off its background, for the card.

   ---- what this does and does not claim ---------------------------------

   There is no method, here or anywhere, that separates a person from an
   arbitrary background perfectly. Hair against a busy room defeats every
   matting model there is, commercial ones included, and a cut-out that has
   chewed through someone's hair looks far worse on an identity card than the
   original photograph would have. So this does not try.

   What it does is the case that is actually in front of us. A card photograph
   is a passport photograph: by convention, and by the instruction on the form,
   it is taken against a plain wall. A plain background is not a matting
   problem at all - it is a flood fill, and a flood fill is exact rather than
   approximate. Done carefully, with a soft edge, it beats a neural network on
   this input, costs nothing, sends nothing anywhere, and needs no model to
   download.

   The other half of the work is knowing when to stop. This measures the
   background before touching it and declines - leaving the photograph exactly
   as it was - when the background is not plain, when the fill escapes into the
   subject, or when the result is implausible. A refusal the person can act on
   ("photograph a plain wall") is worth more than a mangled cut-out they cannot
   fix.

   ---- why not do it on the server ---------------------------------------

   Two reasons, both decided elsewhere in this codebase already. The card
   photograph never leaves the browser, which is what keeps the member area
   costing about three rupees a month and what keeps photographs of people out
   of a database. And a hosted removal service is priced per image, which at
   the size of this register is not affordable. This runs on the device, on a
   canvas that is already there. */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PFAPhotoCutout = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* How far a pixel may sit from the sampled background and still count as
     background. Below IN it is certainly background; between IN and OUT it is
     the soft edge and gets partial alpha; beyond OUT it is the subject. */
  var TOLERANCE_IN = 22;
  var TOLERANCE_OUT = 40;

  /* A background is "plain" if the sampled ring barely varies. A wall, a sheet
     and a photographer's backdrop all sit far below this; a room, a street or
     a curtain sit far above it. */
  var PLAIN_SPREAD = 45;

  /* Sanity checks on the finished mask. */
  var MIN_REMOVED = 0.04;      /* found essentially nothing */
  var MAX_REMOVED = 0.86;      /* removed essentially everything */
  var MAX_TORSO_LOSS = 0.22;   /* the fill escaped into the subject */

  function distance(r1, g1, b1, r2, g2, b2) {
    /* Weighted towards green, which is where the eye carries most luminance,
       so a shirt that differs mainly in green is not mistaken for the wall. */
    var dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
    return Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db);
  }

  function median(values) {
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    return sorted[Math.floor(sorted.length / 2)] || 0;
  }

  /* Sample the top edge and the upper halves of the sides.

     Deliberately not the bottom: in a portrait framed for a card the shoulders
     run off the bottom of the frame, so the bottom edge is mostly person. A
     background estimate that included it would be an average of the wall and a
     shirt, and would match neither. */
  function sampleBackground(data, width, height) {
    var reds = [], greens = [], blues = [];
    var step = Math.max(1, Math.round(width / 120));
    var inset = Math.max(1, Math.round(Math.min(width, height) * 0.01));

    function take(x, y) {
      var i = (y * width + x) * 4;
      reds.push(data[i]); greens.push(data[i + 1]); blues.push(data[i + 2]);
    }
    for (var x = inset; x < width - inset; x += step) take(x, inset);
    var limit = Math.round(height * 0.55);
    for (var y = inset; y < limit; y += step) {
      take(inset, y);
      take(width - 1 - inset, y);
    }

    var r = median(reds), g = median(greens), b = median(blues);
    var total = 0;
    for (var k = 0; k < reds.length; k++) total += distance(reds[k], greens[k], blues[k], r, g, b);
    return { r: r, g: g, b: b, spread: reds.length ? total / reds.length : 999, samples: reds.length };
  }

  /* Is this a photograph we should touch at all? */
  function analyse(image) {
    var bg = sampleBackground(image.data, image.width, image.height);
    return {
      plain: bg.spread <= PLAIN_SPREAD,
      spread: bg.spread,
      background: [bg.r, bg.g, bg.b],
      reason: bg.spread <= PLAIN_SPREAD ? '' : 'BACKGROUND_NOT_PLAIN'
    };
  }

  /* Build the alpha mask.

     A flood fill from the border rather than a test of every pixel, so that a
     patch of wall-coloured cloth in the middle of a shirt is kept: it is not
     connected to the outside, so it is not background. This is the difference
     between cutting out a person and punching holes in them. */
  function buildMask(image, bg) {
    var width = image.width, height = image.height, data = image.data;
    var count = width * height;
    var alpha = new Uint8Array(count);
    for (var n = 0; n < count; n++) alpha[n] = 255;

    var queue = new Int32Array(count);
    var head = 0, tail = 0;
    var seen = new Uint8Array(count);

    function consider(index) {
      if (seen[index]) return;
      var i = index * 4;
      var d = distance(data[i], data[i + 1], data[i + 2], bg.r, bg.g, bg.b);
      if (d >= TOLERANCE_OUT) return;          /* subject: stop here */
      seen[index] = 1;
      /* Inside IN it is background outright; across the band it fades in, so
         the edge is soft instead of a staircase. */
      alpha[index] = d <= TOLERANCE_IN ? 0
        : Math.round(255 * (d - TOLERANCE_IN) / (TOLERANCE_OUT - TOLERANCE_IN));
      queue[tail++] = index;
    }

    for (var x = 0; x < width; x++) { consider(x); consider((height - 1) * width + x); }
    for (var y = 0; y < height; y++) { consider(y * width); consider(y * width + width - 1); }

    while (head < tail) {
      var index = queue[head++];
      var cx = index % width, cy = (index - cx) / width;
      if (cx > 0) consider(index - 1);
      if (cx < width - 1) consider(index + 1);
      if (cy > 0) consider(index - width);
      if (cy < height - 1) consider(index + width);
    }

    var removed = 0;
    for (var m = 0; m < count; m++) removed += (255 - alpha[m]) / 255;
    return { alpha: alpha, removed: removed / count };
  }

  /* Did the fill escape into the person?

     The band across the bottom middle of a card portrait is shoulders and
     chest. If much of it has been declared background, the fill has run
     through clothing that happened to match the wall - the white shirt against
     a white wall case - and the result would be a floating head. */
  function torsoLoss(alphaMask, width, height) {
    var x0 = Math.round(width * 0.30), x1 = Math.round(width * 0.70);
    var y0 = Math.round(height * 0.80), y1 = height;
    var total = 0, lost = 0;
    for (var y = y0; y < y1; y++) {
      for (var x = x0; x < x1; x++) {
        total++;
        if (alphaMask[y * width + x] < 128) lost++;
      }
    }
    return total ? lost / total : 0;
  }

  /* Take a photograph and return it with the background replaced by `ground`,
     or say why it was left alone. `image` is ImageData or anything with
     width, height and a data array; it is not modified. */
  function cut(image, options) {
    options = options || {};
    var ground = options.ground || [255, 255, 255];

    var check = analyse(image);
    if (!check.plain) return { ok: false, reason: 'BACKGROUND_NOT_PLAIN', spread: check.spread };

    var bg = { r: check.background[0], g: check.background[1], b: check.background[2] };
    var mask = buildMask(image, bg);

    if (mask.removed < MIN_REMOVED) return { ok: false, reason: 'NOTHING_TO_REMOVE', removed: mask.removed };

    /* Order matters here, because more than one check can fire at once and the
       person only sees one message. A shirt that matches the wall also trips
       "removed too much", but "your shirt is the colour of the wall" is
       something they can act on and "too much was removed" is not - so the
       torso check is asked first, unless there is essentially no subject at
       all, in which case that is the truer answer. */
    var loss = torsoLoss(mask.alpha, image.width, image.height);
    if (mask.removed > 0.97) return { ok: false, reason: 'REMOVED_TOO_MUCH', removed: mask.removed };
    if (loss > MAX_TORSO_LOSS) return { ok: false, reason: 'SUBJECT_MATCHES_BACKGROUND', torsoLoss: loss };
    if (mask.removed > MAX_REMOVED) return { ok: false, reason: 'REMOVED_TOO_MUCH', removed: mask.removed };

    var out = new Uint8ClampedArray(image.data.length);
    for (var n = 0; n < image.width * image.height; n++) {
      var i = n * 4;
      var a = mask.alpha[n] / 255;
      out[i] = Math.round(image.data[i] * a + ground[0] * (1 - a));
      out[i + 1] = Math.round(image.data[i + 1] * a + ground[1] * (1 - a));
      out[i + 2] = Math.round(image.data[i + 2] * a + ground[2] * (1 - a));
      out[i + 3] = 255;
    }

    return {
      ok: true,
      data: out,
      width: image.width,
      height: image.height,
      removed: mask.removed,
      torsoLoss: loss,
      background: [bg.r, bg.g, bg.b]
    };
  }

  var MESSAGES = {
    BACKGROUND_NOT_PLAIN: 'The background here is too busy to remove cleanly. A photograph against a plain wall works best.',
    NOTHING_TO_REMOVE: 'This photograph already has a plain background, so nothing was changed.',
    REMOVED_TOO_MUCH: 'The background could not be told apart from the subject, so the photograph was left as it is.',
    SUBJECT_MATCHES_BACKGROUND: 'The clothing here is too close in colour to the wall behind it. The photograph was left as it is.'
  };

  return {
    analyse: analyse,
    cut: cut,
    message: function (reason) { return MESSAGES[reason] || ''; },
    TOLERANCE_IN: TOLERANCE_IN,
    TOLERANCE_OUT: TOLERANCE_OUT,
    PLAIN_SPREAD: PLAIN_SPREAD
  };
}));
