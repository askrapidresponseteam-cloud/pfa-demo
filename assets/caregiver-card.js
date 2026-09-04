/* People for Animals - Colony Animal Colony Caregiver Card renderer.
   One renderer draws the live preview and the downloadable artwork so what a
   person sees on the form is exactly what is issued. Laid out in millimetres
   on an ISO/IEC 7810 ID-1 card turned portrait (54 x 85.6 mm) and scaled to
   whatever pixel density is asked for. No lanyard slot is cut. */
(function () {
  'use strict';

  /* Geometry and palette transcribed from the approved 340 x 540 reference:
     1 reference pixel = 54/340 mm. The card stays ISO/IEC 7810 ID-1 portrait. */
  var CARD = { w: 54, h: 85.6, r: 2.22 };
  var PX = 54 / 340;                    // reference pixel -> millimetre
  /* The photograph well on the 340 x 540 artwork: portrait 3:4. */
  var PHOTO = { w: 252, h: 336, y: 159.2 };
  var PHOTO_ASPECT = PHOTO.h / PHOTO.w;   // height / width, for the editor

  var SANS = '"PFA Card Sans", Archia, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Helvetica, Arial, sans-serif';
  var MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

  /* Matte white, the same treatment as the Patron card.

     This card is carried and shown to people, so everything that is read is
     true black rather than a grey. Alpha over white looks right on a screen
     and prints washed out: a label at .52 alpha comes off a press as light
     grey and a caregiver holding it up to a police officer at night gets
     nothing. The values here are solid, and the two lighter greys are dark
     enough to survive a print run rather than being black with the contrast
     taken out.

     The names say what each one is for rather than what colour it happens to
     be, because the last time this palette was inverted a constant called
     WHITE ended up holding black. */
  var FACE = '#FFFFFF';        // card body
  var EDGE = '#D2D5D8';        // hairline, so a white card has a boundary
  var INK = '#000000';         // given name, address, contact, authorised name
  var SECOND = '#3D3D3D';      // surname, the line beside the code
  var BODY = '#000000';        // mono body text: address, mobile, issued on
  var LABEL = '#3D3D3D';       // mono labels above each field
  var RULE = '#CFD3D6';        // dividers
  var PHOTO_BG = '#F4F6F8';
  var GHOST = '#B4B8BC';       // the person silhouette, placeholder only
  var ACCENT = '#0072C6';      // chairperson line

  var PRINT_DPI = 600;
  var ROLE = 'Colony caregiver';

  /* The chairperson's signature is an authorisation, not decoration. It is
     drawn only on a card that actually exists: a real card number, issued by
     the register. The live preview never carries it. */
  var ISSUED_CARD = /^PFA-CCT-[A-Z0-9]{8}$/;
  var SIGNATURE_SRC = 'media/pfa-signature.png';

  function isIssued(data) {
    return ISSUED_CARD.test(String(data && data.cardId || '').toUpperCase());
  }

  var assetCache = {};
  var fontReady = null;

  function loadImage(src) {
    if (assetCache[src]) return assetCache[src];
    assetCache[src] = new Promise(function (resolve) {
      var image = new Image();
      image.onload = function () { resolve(image); };
      image.onerror = function () { resolve(null); };
      image.src = src;
    });
    return assetCache[src];
  }

  /* The card now uses the site's own faces rather than Inter, which was never
     bundled and always fell through to whatever system-ui happened to be on
     the machine - so the printed card varied by device. "PFA Card Sans" is the
     same composite family the site uses: regular weights draw Archia, bold
     weights draw Clash Display, so a 600 request gets a real bold instead of a
     synthesised one.

     The mono stack is deliberately left on the platform monospace. Neither
     Archia nor Clash Display is monospaced, and the card number and dates rely
     on fixed-width digits to stay in column. */
  var OPTIONAL_FACES = [
    ['PFA Card Sans', 'assets/fonts/Archia-Regular.woff2', '400'],
    ['PFA Card Sans', 'assets/fonts/ClashDisplay-Variable.woff2', '401 900'],
    ['Archia', 'assets/fonts/Archia-Regular.woff2', '400'],
    ['Clash Display', 'assets/fonts/ClashDisplay-Variable.woff2', '200 700']
  ];

  function loadFont() {
    if (fontReady) return fontReady;
    if (typeof FontFace === 'undefined' || !document.fonts) {
      fontReady = Promise.resolve(null);
      return fontReady;
    }
    fontReady = Promise.all(OPTIONAL_FACES.map(function (entry) {
      var face = new FontFace(entry[0], 'url(' + entry[1] + ') format("woff2")', { weight: entry[2] });
      return face.load().then(function (loaded) {
        document.fonts.add(loaded);
        return true;
      }).catch(function () { return false; });   // absent is fine, the stack covers it
    })).then(function (results) { return results.some(Boolean); });
    return fontReady;
  }

  function loadAssets() {
    return Promise.all([loadFont()]).then(function () { return {}; });
  }

  function roundRect(ctx, x, y, w, h, r) {
    var radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, radius); return; }
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  /* Sizes are given in reference pixels and converted here, so the code reads
     the same as the reference it was transcribed from. */
  function setFont(ctx, px, scale, stack, weight) {
    ctx.font = (weight ? weight + ' ' : '') + (px * PX * scale).toFixed(2) + 'px ' + (stack || SANS);
  }

  function fitFont(ctx, text, px, maxMm, scale, stack, weight, minRatio) {
    var size = px;
    var floor = px * (minRatio || 0.6);
    setFont(ctx, size, scale, stack, weight);
    while (ctx.measureText(text).width > maxMm * scale && size > floor) {
      size -= px * 0.04;
      setFont(ctx, size, scale, stack, weight);
    }
    return size;
  }

  function wrap(ctx, text, maxPx) {
    var words = String(text || '').split(/\s+/).filter(Boolean);
    var lines = [];
    var line = '';
    words.forEach(function (word) {
      var next = line ? line + ' ' + word : word;
      if (ctx.measureText(next).width <= maxPx || !line) { line = next; return; }
      lines.push(line);
      line = word;
    });
    if (line) lines.push(line);
    return lines;
  }

  function coverDraw(ctx, image, x, y, w, h) {
    var ratio = Math.max(w / image.width, h / image.height);
    var drawWidth = image.width * ratio;
    var drawHeight = image.height * ratio;
    ctx.drawImage(image, x + (w - drawWidth) / 2, y + (h - drawHeight) / 2, drawWidth, drawHeight);
  }

  /* Re-ink a transparent-ground image. The image is drawn into an offscreen
     canvas, then 'source-in' fills every pixel it covered with one colour,
     leaving the alpha - and so the stroke shapes and their soft edges -
     untouched. Cached per image and colour: this runs on every repaint. */
  var stampCache = {};
  function inkStamp(image, colour) {
    var key = (image.src || 'img') + '|' + colour;
    if (stampCache[key]) return stampCache[key];
    var off = document.createElement('canvas');
    off.width = image.width;
    off.height = image.height;
    var octx = off.getContext('2d');
    octx.drawImage(image, 0, 0);
    octx.globalCompositeOperation = 'source-in';
    octx.fillStyle = colour;
    octx.fillRect(0, 0, off.width, off.height);
    stampCache[key] = off;
    return off;
  }

  /* A white card on a white page needs an edge or it is not a card. */
  function edge(ctx, W, H, scale) {
    ctx.strokeStyle = EDGE;
    ctx.lineWidth = Math.max(1, u(1, scale));
    roundRect(ctx, ctx.lineWidth / 2, ctx.lineWidth / 2,
      W - ctx.lineWidth, H - ctx.lineWidth, CARD.r * scale);
    ctx.stroke();
  }

  function personPlaceholder(ctx, x, y, w, h) {    var cx = x + w / 2;
    var cy = y + h / 2;
    var s = Math.min(w, h);
    ctx.fillStyle = GHOST;
    ctx.beginPath();
    ctx.arc(cx, cy - s * 0.14, s * 0.17, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.32, cy + s * 0.42);
    ctx.quadraticCurveTo(cx, cy - s * 0.02, cx + s * 0.32, cy + s * 0.42);
    ctx.closePath();
    ctx.fill();
  }

  /* Letter-spaced small caps, drawn per character: ctx.letterSpacing is still
     uneven across browsers and this artwork has to be identical everywhere. */
  function measureTracked(ctx, text, trackPx) {
    var chars = String(text).split('');
    var width = 0;
    for (var i = 0; i < chars.length; i += 1) width += ctx.measureText(chars[i]).width + trackPx;
    return chars.length ? width - trackPx : 0;
  }

  function tracked(ctx, text, x, y, trackPx) {
    var chars = String(text).split('');
    var cursor = x;
    for (var i = 0; i < chars.length; i += 1) {
      ctx.fillText(chars[i], cursor, y);
      cursor += ctx.measureText(chars[i]).width + trackPx;
    }
  }

  /* All coordinates below are reference pixels on the 340 x 540 artwork. */
  function u(px, scale) { return px * PX * scale; }

  function drawFront(ctx, scale, data) {
    var W = CARD.w * scale;
    var H = CARD.h * scale;

    ctx.save();
    roundRect(ctx, 0, 0, W, H, CARD.r * scale);
    ctx.clip();

    ctx.fillStyle = FACE;
    ctx.fillRect(0, 0, W, H);

    var padSide = u(22, scale);
    var contentWidth = W - padSide * 2;

    /* Year, set vertically in the right margin, reading bottom to top. */
    ctx.save();
    ctx.translate(W - u(6, scale), u(260, scale));
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = BODY;
    ctx.textAlign = 'left';
    setFont(ctx, 11, scale, MONO);
    tracked(ctx, String(data.year || new Date().getFullYear()), 0, 0, u(11, scale) * 0.14);
    ctx.restore();

    /* Name: given name in white, the rest in grey beneath it. */
    ctx.textAlign = 'left';
    /* Whatever case the record holds, the card prints Title Case. */
    var name = String(data.name || 'Your Name').trim().replace(/\s+/g, ' ');
    if (window.PFA_RULES) name = window.PFA_RULES.nameCase(name);
    var split = name.indexOf(' ');
    var first = split === -1 ? name : name.slice(0, split);
    var rest = split === -1 ? '' : name.slice(split + 1);
    var nameWidth = (contentWidth - u(22, scale)) / scale;

    ctx.fillStyle = INK;
    fitFont(ctx, first, 28, nameWidth, scale, SANS, '600');
    ctx.fillText(first, padSide, u(76.5, scale));

    if (rest) {
      ctx.fillStyle = SECOND;
      fitFont(ctx, rest, 28, nameWidth, scale, SANS, '500');
      ctx.fillText(rest, padSide, u(107.9, scale));
    }

    ctx.fillStyle = BODY;
    setFont(ctx, 12, scale, MONO);
    ctx.fillText(ROLE, padSide, u(134.4, scale));

    /* Photograph: portrait, 3:4, the shape a passport photograph already is,
       so nothing has to be cut to fit. A landscape band here cropped the top
       of every head. Centred, square corners. */
    var photoH = u(PHOTO.h, scale);
    var photoW = u(PHOTO.w, scale);
    var photoX = (W - photoW) / 2;
    var photoY = u(PHOTO.y, scale);

    ctx.fillStyle = PHOTO_BG;
    ctx.fillRect(photoX, photoY, photoW, photoH);

    if (data.photoImage) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(photoX, photoY, photoW, photoH);
      ctx.clip();
      coverDraw(ctx, data.photoImage, photoX, photoY, photoW, photoH);
      ctx.restore();
    } else {
      personPlaceholder(ctx, photoX, photoY, photoW, photoH);
    }

    /* Card number, centred at the foot. A card with no number (a sample
       made without the server) prints nothing here rather than "ID ·". */
    if (data.cardId) {
      ctx.fillStyle = LABEL;
      setFont(ctx, 10, scale, MONO);
      ctx.textAlign = 'center';
      var idText = 'ID \u00B7 ' + String(data.cardId).replace(/^PFA-CCT-/, '');
      tracked(ctx, idText, W / 2 - measureTracked(ctx, idText, u(10, scale) * 0.08) / 2,
        u(518, scale), u(10, scale) * 0.08);
    }

    edge(ctx, W, H, scale);
    ctx.restore();
  }

  /* ---- the back, laid out rather than positioned -------------------------

     Every y on this face used to be a number measured off the artwork: the
     address block began at 72 and the divider under it at 162.6, which reserved
     four lines of room whether or not four lines were used. Most registered
     addresses are two lines, so most cards were printed with an inch of white
     nothing under the address and everything below it pushed down to meet a
     divider nailed to the floor.

     So the sections are measured and then placed. Each reports how tall it
     actually is, the authorisation is pinned to the foot of the card where a
     signature belongs, and what is left over is shared equally between the
     sections above it. A two-line address and a four-line address both make a
     balanced card; one simply breathes more.

     A note on units, because this file has two and mixing them is how the
     signature ended up six pixels tall. CARD is in millimetres. Everything
     passed to u() is in reference pixels of the 340 x 540 artwork, which u()
     converts to millimetres and then to device pixels. All the arithmetic here
     is in reference pixels, and nothing is converted until it is drawn. */

  var REF_W = Math.round(CARD.w / PX);        /* 340 */
  var REF_H = Math.round(CARD.h / PX);        /* 540 */
  var PAD = 22;
  var INNER = REF_W - PAD * 2;
  var GAP_MIN = 16;
  var GAP_MAX = 34;

  function drawBack(ctx, scale, data) {
    var W = CARD.w * scale;
    var H = CARD.h * scale;

    ctx.save();
    roundRect(ctx, 0, 0, W, H, CARD.r * scale);
    ctx.clip();

    ctx.fillStyle = FACE;
    ctx.fillRect(0, 0, W, H);

    var padSide = u(PAD, scale);
    var inner = u(INNER, scale);
    ctx.textAlign = 'left';

    var LABEL_PX = 10, LABEL_DROP = 22, BODY_STEP = 20.4, ADDRESS_STEP = 22.4;

    function label(text, y) {
      ctx.fillStyle = LABEL;
      setFont(ctx, LABEL_PX, scale, MONO);
      tracked(ctx, text.toUpperCase(), padSide, u(y, scale), u(LABEL_PX, scale) * 0.12);
    }

    function divider(y) {
      ctx.fillStyle = RULE;
      ctx.fillRect(padSide, u(y, scale), inner, Math.max(1, u(1, scale)));
    }

    /* ---- measure -------------------------------------------------------- */

    setFont(ctx, 14, scale, SANS);
    var addressText = String(data.address || '');
    if (window.PFA_RULES) addressText = window.PFA_RULES.titleCase(addressText);
    var addressLines = addressText
      .split('\n')
      .reduce(function (all, line) { return all.concat(wrap(ctx, line, inner)); }, [])
      .slice(0, 4);

    var contactLines = [data.mobile, data.email].filter(Boolean);

    /* The signature, in reference pixels like everything else. */
    var signature = null;
    if (data.signatureImage) {
      var ratio = Math.min(INNER * 0.62 / data.signatureImage.width, 34 / data.signatureImage.height);
      signature = { w: data.signatureImage.width * ratio, h: data.signatureImage.height * ratio };
    }

    var flowing = [
      { label: 'Registered Address', lines: addressLines, step: ADDRESS_STEP, size: 14, face: SANS, colour: INK },
      { label: 'Contact', lines: contactLines, step: BODY_STEP, size: 12, face: MONO, colour: BODY },
      { label: 'Issued on', lines: [String(data.issuedOn || '-')], step: BODY_STEP, size: 12, face: MONO, colour: BODY },
      { qr: true }
    ];
    flowing.forEach(function (section) {
      section.height = section.qr ? 88 : LABEL_DROP + section.lines.length * section.step;
    });

    /* The authorisation sits at the foot. Its rule is where the signature
       rests, so the block is measured upward from the role line. */
    var authRule = REF_H - PAD - 61;
    var content = flowing.reduce(function (t, s) { return t + s.height; }, 0);
    var signatureRoom = signature ? signature.h + 10 : 0;
    var slack = (authRule - signatureRoom) - 40 - content;

    /* If a very long address would squeeze the gaps below the point where the
       dividers stop reading as separations, the address gives up a line rather
       than the card giving up its spacing. The four-line cap makes this
       unreachable with the current type, but the type is the sort of thing
       that gets changed by someone who will not re-derive this. */
    while (slack / flowing.length < GAP_MIN && addressLines.length > 2) {
      addressLines = addressLines.slice(0, addressLines.length - 1);
      flowing[0].lines = addressLines;
      flowing[0].height = LABEL_DROP + addressLines.length * ADDRESS_STEP;
      content = flowing.reduce(function (t, x) { return t + x.height; }, 0);
      slack = (authRule - signatureRoom) - 40 - content;
    }

    var gap = Math.max(GAP_MIN, Math.min(GAP_MAX, slack / flowing.length));

    /* ---- place ---------------------------------------------------------- */

    var y = 40;
    flowing.forEach(function (section) {
      if (section.qr) {
        var qrTop = y - LABEL_PX;
        var size = u(88, scale);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(padSide, u(qrTop, scale), size, size);
        if (data.qr && window.PFAQR) {
          window.PFAQR.paint(ctx, data.qr, padSide + u(5, scale), u(qrTop + 5, scale), size - u(10, scale));
        }
        ctx.fillStyle = SECOND;
        setFont(ctx, 12, scale, MONO);
        var textX = padSide + size + u(16, scale);
        var caption = data.qrCaption === 'Specimen' ? ['Specimen code', 'not a live card'] : ['Scan to view', 'the card digitally'];
        ctx.fillText(caption[0], textX, u(qrTop + 38, scale));
        ctx.fillText(caption[1], textX, u(qrTop + 56, scale));
      } else {
        label(section.label, y);
        ctx.fillStyle = section.colour;
        setFont(ctx, section.size, scale, section.face);
        section.lines.forEach(function (line, n) {
          ctx.fillText(line, padSide, u(y + LABEL_DROP + n * section.step, scale));
        });
      }
      y += section.height;
      /* The divider lives in the gap, not at a remembered coordinate. */
      divider(y + gap / 2 - LABEL_PX);
      y += gap;
    });

    /* ---- the authorisation, at the foot --------------------------------- */

    if (signature) {
      ctx.drawImage(inkStamp(data.signatureImage, INK),
        padSide, u(authRule - 4 - signature.h, scale),
        u(signature.w, scale), u(signature.h, scale));
    }
    divider(authRule);
    label('Authorised by', authRule + 20);

    ctx.fillStyle = INK;
    fitFont(ctx, 'Smt. Maneka Sanjay Gandhi', 15, INNER, scale, SANS, '600');
    ctx.fillText('Smt. Maneka Sanjay Gandhi', padSide, u(authRule + 44, scale));

    ctx.fillStyle = ACCENT;
    fitFont(ctx, 'Chairperson, People For Animals', 12, INNER, scale, SANS);
    ctx.fillText('Chairperson, People For Animals', padSide, u(authRule + 61, scale));

    edge(ctx, W, H, scale);
    ctx.restore();
  }

  function draw(canvas, side, data, assets, cssWidth, density) {
    var scale = (cssWidth * density) / CARD.w;
    canvas.width = Math.round(CARD.w * scale);
    canvas.height = Math.round(CARD.h * scale);
    if (cssWidth) {
      canvas.style.width = cssWidth + 'px';
      canvas.style.height = (cssWidth * (CARD.h / CARD.w)) + 'px';
    }
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.textBaseline = 'alphabetic';
    if (side === 'back') drawBack(ctx, scale, data);
    else drawFront(ctx, scale, data);
    return canvas;
  }

  function offscreen(side, data, dpi) {
    var scale = (dpi || PRINT_DPI) / 25.4;
    var canvas = document.createElement('canvas');
    canvas.width = Math.round(CARD.w * scale);
    canvas.height = Math.round(CARD.h * scale);
    var ctx = canvas.getContext('2d');
    ctx.textBaseline = 'alphabetic';
    if (side === 'back') drawBack(ctx, scale, data);
    else drawFront(ctx, scale, data);
    return canvas;
  }

  function toBlob(canvas, type, quality) {
    return new Promise(function (resolve, reject) {
      if (canvas.toBlob) {
        canvas.toBlob(function (blob) {
          if (blob) resolve(blob);
          else reject(new Error('The card image could not be created.'));
        }, type, quality);
        return;
      }
      try {
        var url = canvas.toDataURL(type, quality);
        var binary = atob(url.split(',')[1]);
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        resolve(new Blob([bytes], { type: type }));
      } catch (error) {
        reject(error);
      }
    });
  }

  /* JPEG has no alpha. The card is drawn inside a rounded clip, so the four
     corners of the canvas are transparent - and a transparent pixel encodes as
     black. On the old near-black card that was invisible; on a white one it
     puts a black wedge in every corner of the emailed and printed artwork. So
     the canvas is flattened onto white first. The PNG path is left alone:
     there, transparent corners are correct. */
  function jpegBytes(canvas, quality) {
    var flat = document.createElement('canvas');
    flat.width = canvas.width;
    flat.height = canvas.height;
    var fctx = flat.getContext('2d');
    fctx.fillStyle = '#FFFFFF';
    fctx.fillRect(0, 0, flat.width, flat.height);
    fctx.drawImage(canvas, 0, 0);
    var url = flat.toDataURL('image/jpeg', quality || 0.94);
    var binary = atob(url.split(',')[1]);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function buildPdf(pages) {
    var encoder = new TextEncoder();
    var parts = [];
    var length = 0;
    var offsets = [0];

    function push(chunk) {
      var bytes = typeof chunk === 'string' ? encoder.encode(chunk) : chunk;
      parts.push(bytes);
      length += bytes.length;
    }

    function startObject(number) {
      offsets[number] = length;
      push(number + ' 0 obj\n');
    }

    /* Pages default to the colony caregiver card size; a page may carry its own
       size in millimetres (the landscape Patron card uses this). */
    var first = pages[0] || {};
    var widthPt = ((first.wMm || CARD.w) * 72) / 25.4;
    var heightPt = ((first.hMm || CARD.h) * 72) / 25.4;
    var kids = pages.map(function (_, index) { return (3 + index * 3) + ' 0 R'; }).join(' ');

    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    startObject(1); push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    startObject(2); push('<< /Type /Pages /Kids [' + kids + '] /Count ' + pages.length + ' >>\nendobj\n');

    pages.forEach(function (page, index) {
      var pageNumber = 3 + index * 3;
      var imageNumber = pageNumber + 1;
      var contentNumber = pageNumber + 2;
      var content = 'q ' + widthPt.toFixed(3) + ' 0 0 ' + heightPt.toFixed(3) + ' 0 0 cm /Im0 Do Q\n';

      startObject(pageNumber);
      push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + widthPt.toFixed(3) + ' ' + heightPt.toFixed(3)
        + '] /Resources << /XObject << /Im0 ' + imageNumber + ' 0 R >> >> /Contents ' + contentNumber + ' 0 R >>\nendobj\n');

      startObject(imageNumber);
      push('<< /Type /XObject /Subtype /Image /Width ' + page.width + ' /Height ' + page.height
        + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + page.bytes.length + ' >>\nstream\n');
      push(page.bytes);
      push('\nendstream\nendobj\n');

      startObject(contentNumber);
      push('<< /Length ' + content.length + ' >>\nstream\n' + content + 'endstream\nendobj\n');
    });

    var objectCount = 2 + pages.length * 3;
    var xrefOffset = length;
    var xref = 'xref\n0 ' + (objectCount + 1) + '\n0000000000 65535 f \n';
    for (var number = 1; number <= objectCount; number += 1) {
      xref += String(offsets[number]).padStart(10, '0') + ' 00000 n \n';
    }
    push(xref);
    push('trailer\n<< /Size ' + (objectCount + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF\n');

    return new Blob(parts, { type: 'application/pdf' });
  }

  function saveBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function normalisePhoto(file, maxEdge) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('That image could not be read.')); };
      reader.onload = function () {
        var image = new Image();
        image.onerror = function () { reject(new Error('That image could not be read.')); };
        image.onload = function () {
          var limit = maxEdge || 1400;
          var ratio = Math.min(1, limit / Math.max(image.width, image.height));
          var canvas = document.createElement('canvas');
          canvas.width = Math.round(image.width * ratio);
          canvas.height = Math.round(image.height * ratio);
          var ctx = canvas.getContext('2d');
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.9));
        };
        image.src = String(reader.result || '');
      };
      reader.readAsDataURL(file);
    });
  }

  /* Every value goes through PFACardFields first: dates derived, placeholders
     substituted, nothing left empty. See assets/card-fields.js for what that
     does and does not promise. The signature still depends on isIssued() being
     true of the ORIGINAL data, so a completed placeholder card number can never
     put the chairperson's signature on an unissued card. */
  function complete(data) {
    if (!window.PFACardFields) return data;
    var filled = window.PFACardFields.caregiver(data);
    var out = {};
    Object.keys(data || {}).forEach(function (key) { out[key] = data[key]; });
    ['cardId', 'name', 'year', 'address', 'mobile', 'email', 'issuedOn', 'qr', 'qrCaption'].forEach(function (key) {
      out[key] = filled[key];
    });
    out.ghost = filled.ghost;
    out.missing = filled.missing;
    return out;
  }

  function hydrate(data) {
    var issued = isIssued(data);
    var filled = complete(data);
    var copy = {};
    Object.keys(filled).forEach(function (key) { copy[key] = filled[key]; });

    return Promise.all([
      filled.photo ? loadImage(filled.photo) : Promise.resolve(null),
      issued ? loadImage(SIGNATURE_SRC) : Promise.resolve(null)
    ]).then(function (out) {
      copy.photoImage = out[0];
      copy.signatureImage = out[1];
      return copy;
    });
  }

  function fileStem(data) {
    var id = String(data.cardId || 'caregiver-card').replace(/[^A-Za-z0-9-]/g, '');
    return id || 'caregiver-card';
  }

  function downloadPng(data, side) {
    /* A card has two sides and both carry information the holder needs, so
       "download" gives them both. Passing an explicit 'front' or 'back' still
       returns just that side, which the per-side buttons rely on. */
    var sides = (side === 'front' || side === 'back') ? [side] : ['front', 'back'];
    return Promise.all([loadAssets(), hydrate(data)]).then(function (out) {
      return sides.reduce(function (chain, one) {
        return chain.then(function (blobs) {
          var canvas = offscreen(one, out[1], PRINT_DPI);
          return toBlob(canvas, 'image/png').then(function (blob) {
            saveBlob(blob, fileStem(data) + '-' + one + '.png');
            blobs.push(blob);
            return blobs;
          });
        });
      }, Promise.resolve([]));
    });
  }

  function downloadPdf(data) {
    return Promise.all([loadAssets(), hydrate(data)]).then(function (out) {
      var pages = ['front', 'back'].map(function (side) {
        var canvas = offscreen(side, out[1], PRINT_DPI);
        return { width: canvas.width, height: canvas.height, bytes: jpegBytes(canvas, 0.95) };
      });
      saveBlob(buildPdf(pages), fileStem(data) + '-print.pdf');
    });
  }

  function issuedOnLabel(date) {
    return (date || new Date()).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  window.PFACaregiverCard = {
    CARD: CARD,
    PHOTO_ASPECT: PHOTO_ASPECT,
    _buildPdf: buildPdf,
    PRINT_DPI: PRINT_DPI,
    draw: draw,
    downloadPng: downloadPng,
    downloadPdf: downloadPdf,
    jpegBytes: jpegBytes,
    hydrate: hydrate,
    issuedOnLabel: issuedOnLabel,
    loadAssets: loadAssets,
    loadFont: loadFont,
    loadImage: loadImage,
    normalisePhoto: normalisePhoto,
    offscreen: offscreen,
    saveBlob: saveBlob
  };
})();
