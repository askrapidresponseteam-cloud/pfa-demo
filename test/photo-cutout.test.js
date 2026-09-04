'use strict';

/* The interesting tests here are the refusals.

   Anyone can make a cut-out work on a clean studio shot. What decides whether
   this is safe to put in front of a member uploading a photograph of themself
   is whether it knows to leave the photograph alone when it cannot do the job:
   a busy background, or a shirt the same colour as the wall behind it. A
   mangled cut-out on an identity card is worse than no cut-out. */

const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../assets/photo-cutout.js');

/* A synthetic portrait: plain background, a head and a torso reaching the
   bottom edge, as a card photograph is framed. */
function portrait(options) {
  const opts = Object.assign({
    width: 200, height: 260,
    bg: [246, 246, 246], noise: 0,
    skin: [190, 140, 110], shirt: [40, 70, 130],
    busy: false
  }, options);
  const { width, height } = opts;
  const data = new Uint8ClampedArray(width * height * 4);
  const put = (x, y, c) => {
    const i = (y * width + x) * 4;
    data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
  };
  let seed = 7;
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let c;
      if (opts.busy) {
        /* stripes and blocks: a room, not a wall */
        c = ((x >> 4) + (y >> 4)) % 2 ? [200, 120, 60] : [40, 90, 140];
      } else {
        const n = opts.noise ? (rand() - 0.5) * opts.noise : 0;
        c = [opts.bg[0] + n, opts.bg[1] + n, opts.bg[2] + n];
      }
      put(x, y, c);
    }
  }
  /* head: a filled circle in the upper half */
  const cx = width / 2, cy = height * 0.34, r = width * 0.22;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) put(x, y, opts.skin);
    }
  }
  /* torso: a trapezium from below the head to the bottom edge */
  for (let y = Math.round(height * 0.55); y < height; y++) {
    const t = (y - height * 0.55) / (height * 0.45);
    const half = width * (0.16 + 0.22 * t);
    for (let x = Math.round(cx - half); x < Math.round(cx + half); x++) {
      if (x >= 0 && x < width) put(x, y, opts.shirt);
    }
  }
  return { data, width, height };
}

test('a plain wall is recognised, a busy room is not', () => {
  assert.equal(C.analyse(portrait()).plain, true);
  assert.equal(C.analyse(portrait({ noise: 6 })).plain, true, 'a little grain is still a plain wall');

  const busy = C.analyse(portrait({ busy: true }));
  assert.equal(busy.plain, false);
  assert.equal(busy.reason, 'BACKGROUND_NOT_PLAIN');
});

test('a portrait on a plain wall is lifted off it', () => {
  const out = C.cut(portrait(), { ground: [255, 255, 255] });
  assert.equal(out.ok, true, out.reason);
  assert.ok(out.removed > 0.3 && out.removed < 0.8, `removed ${out.removed}`);

  /* the corners became the new ground */
  const at = (x, y) => [out.data[(y * out.width + x) * 4], out.data[(y * out.width + x) * 4 + 1], out.data[(y * out.width + x) * 4 + 2]];
  assert.deepEqual(at(2, 2), [255, 255, 255]);

  /* the face is untouched */
  const face = at(Math.round(out.width / 2), Math.round(out.height * 0.34));
  assert.ok(Math.abs(face[0] - 190) < 6 && Math.abs(face[2] - 110) < 6, `face was altered: ${face}`);

  /* the shoulders are still there */
  const chest = at(Math.round(out.width / 2), out.height - 3);
  assert.ok(Math.abs(chest[2] - 130) < 10, `torso was eaten: ${chest}`);
});

test('a busy background is refused, not attempted', () => {
  const out = C.cut(portrait({ busy: true }));
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'BACKGROUND_NOT_PLAIN');
  assert.match(C.message(out.reason), /plain wall/);
});

test('a white shirt against a white wall is refused rather than beheaded', () => {
  /* The classic failure: the fill runs from the wall straight through the
     clothing and leaves a floating head. It has to be caught. */
  const out = C.cut(portrait({ bg: [248, 248, 248], shirt: [245, 246, 247] }));
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'SUBJECT_MATCHES_BACKGROUND');
  assert.match(C.message(out.reason), /clothing/);
});

test('background enclosed by the subject is kept, not punched out', () => {
  /* A patch of wall-coloured cloth inside the shirt is not connected to the
     outside, so a flood fill leaves it alone. A per-pixel colour test would
     put a hole in the person. */
  const p = portrait();
  const put = (x, y, c) => {
    const i = (y * p.width + x) * 4;
    p.data[i] = c[0]; p.data[i + 1] = c[1]; p.data[i + 2] = c[2];
  };
  const cx = Math.round(p.width / 2), cy = p.height - 12;
  for (let y = cy - 4; y <= cy + 4; y++) for (let x = cx - 4; x <= cx + 4; x++) put(x, y, [246, 246, 246]);

  const out = C.cut(p, { ground: [10, 10, 10] });
  assert.equal(out.ok, true, out.reason);
  const i = (cy * out.width + cx) * 4;
  assert.ok(out.data[i] > 200, 'an enclosed patch was wrongly treated as background');
});

test('the new ground is the colour asked for', () => {
  const out = C.cut(portrait(), { ground: [237, 246, 251] });
  assert.equal(out.ok, true);
  const i = (3 * out.width + 3) * 4;
  assert.deepEqual([out.data[i], out.data[i + 1], out.data[i + 2]], [237, 246, 251]);
});

test('an image that is all background is refused', () => {
  const width = 60, height = 60;
  const data = new Uint8ClampedArray(width * height * 4).fill(250);
  const out = C.cut({ data, width, height });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'REMOVED_TOO_MUCH');
});

test('the original image is never modified', () => {
  const p = portrait();
  const before = Uint8ClampedArray.from(p.data);
  C.cut(p, { ground: [0, 0, 0] });
  assert.deepEqual(Array.from(p.data.slice(0, 400)), Array.from(before.slice(0, 400)));
});
