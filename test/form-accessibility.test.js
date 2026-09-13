'use strict';

/* What a person using a screen reader, or a keyboard and nothing else, meets
   on every page of this site.

   These are the failures that actually shut somebody out of a form, not a
   style opinion: a box that announces nothing when you land in it, a picture
   that is described to nobody, a page with two elements answering to the same
   id so the label points at the wrong one. The site was already close to clean
   when this was written - careers.html had two textareas carrying the whole
   weight of a job application and no accessible name between them - and the
   point of writing it down is that it stays that way. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PAGES = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));

const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
/* Markup a script builds is judged when it runs, not here; this reads what the
   browser is served. */
const markupOf = (html) => html.replace(/<script[\s\S]*?<\/script>/gi, '');

const attr = (tag, name) => {
  const hit = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag);
  return hit ? hit[1] : null;
};

/* Types that carry their own name, or hold no value a person types. */
const UNNAMED_OK = new Set(['hidden', 'submit', 'button', 'reset', 'image']);

test('every box a person types in announces what it is for', () => {
  const silent = [];
  for (const file of PAGES) {
    const html = markupOf(read(file));
    const labelFor = new Set([...html.matchAll(/<label[^>]*\bfor="([^"]+)"/gi)].map((m) => m[1]));
    const ids = new Set([...html.matchAll(/\sid="([^"{}]+)"/g)].map((m) => m[1]));

    for (const match of html.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)) {
      const tag = match[0];
      const kind = match[1].toLowerCase();
      const type = (attr(tag, 'type') || 'text').toLowerCase();
      if (kind === 'input' && UNNAMED_OK.has(type)) continue;

      const id = attr(tag, 'id');
      const labelledBy = attr(tag, 'aria-labelledby');
      let named = Boolean(attr(tag, 'aria-label') || attr(tag, 'title'))
        || (id && labelFor.has(id));
      /* aria-labelledby only names a control if what it points at is there. */
      if (!named && labelledBy) {
        named = labelledBy.split(/\s+/).every((ref) => ids.has(ref));
        assert.ok(named, `${file}: ${id || kind} points aria-labelledby at "${labelledBy}", which is not on the page`);
      }
      /* A <label> wrapped around the control names it without a for. */
      if (!named) {
        const before = html.slice(Math.max(0, match.index - 400), match.index);
        named = /<label\b[^>]*>(?:(?!<\/label>)[\s\S])*$/.test(before);
      }
      if (!named) silent.push(`${file}: <${kind}${id ? ` id="${id}"` : ''} type="${type}">`);
    }
  }
  assert.deepEqual(silent, [], 'these controls announce nothing when a screen reader lands in them');
});

test('every picture is either described or explicitly decorative', () => {
  const undescribed = [];
  for (const file of PAGES) {
    for (const match of markupOf(read(file)).matchAll(/<img\b[^>]*>/gi)) {
      if (attr(match[0], 'alt') === null) undescribed.push(`${file}: ${match[0].slice(0, 90)}`);
    }
  }
  assert.deepEqual(undescribed, [], 'an <img> with no alt at all is read out as its file name');
});

test('every page says what language it is in and how to fit a phone', () => {
  const wrong = [];
  for (const file of PAGES) {
    const html = read(file);
    if (!/<html[^>]+\blang="[a-z]{2}/i.test(html)) wrong.push(`${file}: no lang on <html>`);
    if (!/<meta[^>]+name="viewport"/i.test(html)) wrong.push(`${file}: no viewport meta`);
  }
  assert.deepEqual(wrong, []);
});

test('no page gives two elements the same id, so a label cannot point at the wrong one', () => {
  const clashes = [];
  for (const file of PAGES) {
    const seen = new Map();
    /* Ids inside a JavaScript template belong to one rendering at a time, and
       the page swaps between them; only what is served is counted. */
    for (const match of markupOf(read(file)).matchAll(/\sid="([^"{}]+)"/g)) {
      const id = match[1];
      if (id.includes("' +") || id.includes('${')) continue;
      seen.set(id, (seen.get(id) || 0) + 1);
    }
    for (const [id, n] of seen) if (n > 1) clashes.push(`${file}: id="${id}" appears ${n} times`);
  }
  assert.deepEqual(clashes, []);
});

test('nothing rearranges the keyboard order by hand', () => {
  const forced = [];
  for (const file of PAGES) {
    const n = (markupOf(read(file)).match(/tabindex="[1-9]/g) || []).length;
    if (n) forced.push(`${file}: ${n} positive tabindex`);
  }
  assert.deepEqual(forced, [], 'a positive tabindex moves a control out of the order everything else follows');
});

test('the application questions name the boxes that answer them', () => {
  /* The two long answers a Zonal Head applicant writes had no accessible name
     at all: the question sat in a <p class="ask"> that nothing pointed at, so
     landing in either box announced only "edit text". */
  const html = read('careers.html');
  for (const q of ['q1', 'q2']) {
    const box = new RegExp(`<textarea[^>]*\\bid="${q}"[^>]*>`).exec(html);
    assert.ok(box, `${q} is gone`);
    assert.equal(attr(box[0], 'aria-labelledby'), `${q}Ask`);
    assert.match(html, new RegExp(`<p class="ask" id="${q}Ask">`), `${q}Ask is not on the question`);
  }
});
