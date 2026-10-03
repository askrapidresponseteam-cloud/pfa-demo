'use strict';

/* Turns a PDF into a reading edition: the text of the document as headings,
   paragraphs, list items and tables, each tagged with the page of the
   original it came from. read.html sets that text in the reader's own type,
   at the reader's own size, so a handbook reads like a book rather than a
   scan of one.

   Two halves, kept apart so the second can be tested without a PDF:

     readPdf(buffer)      pdf.js in, one record per page out: the lines on
                          it (text, position, size, weight), whether it is a
                          picture with no text, the outline if the PDF has one
     buildEdition(raw)    those lines in, the edition out: running heads and
                          page numbers dropped, hyphenated line ends joined,
                          paragraphs that cross a page joined, headings ranked
                          by size, lists and tables recognised

   Nothing is rewritten. Every word in an edition is a word pdf.js read off
   the page; the only edits are joins (a line end, a hyphen, a page turn) and
   the removal of what repeats on every page (the running head, the folio).
   When the text is not trustworthy - a scan with no text layer, or Hindi set
   in a legacy font whose letters pdf.js can only read as Latin gibberish -
   the edition says so (text: false) and the reader shows the original pages
   instead. A wrong edition is worse than none. */

/* Bump when a change here would change an edition, so build-library.js
   --extract redoes editions made by the older reading. */
const VERSION = 6;

const OPS_IMAGES = ['paintImageXObject', 'paintInlineImageXObject', 'paintImageMaskXObject', 'paintImageXObjectRepeat', 'paintInlineImageXObjectGroup'];

let pdfjsPromise = null;
function loadPdfjs() {
  if (!pdfjsPromise) pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjsPromise;
}

/* ---- text hygiene ------------------------------------------------------ */

const LIGATURES = { '\uFB00': 'ff', '\uFB01': 'fi', '\uFB02': 'fl', '\uFB03': 'ffi', '\uFB04': 'ffl', '\uFB05': 'st', '\uFB06': 'st' };

function clean(text) {
  return String(text)
    .replace(/[\uFB00-\uFB06]/g, (c) => LIGATURES[c])
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F\u200B\u200E\u200F\uFEFF]/g, '')
    .replace(/[\uE000-\uF8FF]/g, '');
}

/* ---- half one: the PDF ------------------------------------------------- */

/* One item at a time, in the order the page draws them. That order follows
   the columns of a two-column page, which sorting by position would mix. */
function linesFromItems(items, fonts) {
  const lines = [];
  let line = null;
  let breakNext = true;
  for (const it of items) {
    const t = it.transform;
    const size = Math.hypot(t[2], t[3]) || Math.abs(t[3]) || 0;
    const x = t[4];
    const y = t[5];
    const str = clean(it.str || '');
    const rotated = size > 0 && (Math.abs(t[1]) > 0.05 * size || Math.abs(t[2]) > 0.05 * size);
    if (rotated || size < 1) { if (it.hasEOL) breakNext = true; continue; }
    /* pdf.js fills wide gaps with a whitespace item as wide as the gap; the
       gap itself is what tells a table cell from the next word */
    if (!str.trim()) { if (it.hasEOL) breakNext = true; continue; }
    const font = fonts(it.fontName);
    const ref = line ? Math.max(size, line.size) : size;
    const dy = line ? Math.abs(y - line.y) : 0;
    const startNew = !line || dy > 0.45 * ref || (breakNext && dy > 0.1 * ref) || x < line.x1 - 2.5 * ref;
    if (startNew) {
      line = { cells: [str], xs: [x], x0: x, x1: x + it.width, y, size, chars: { sizes: {}, bold: 0, total: 0 } };
      lines.push(line);
    } else {
      const gap = x - line.x1;
      const last = line.cells[line.cells.length - 1];
      if (gap > 2.5 * ref && str.trim()) { line.cells.push(str); line.xs.push(x); }
      else if (gap > 0.12 * ref && !/\s$/.test(last) && !/^\s/.test(str)) line.cells[line.cells.length - 1] = last + ' ' + str;
      else line.cells[line.cells.length - 1] = last + str;
      line.x1 = Math.max(line.x1, x + it.width);
    }
    const n = str.replace(/\s/g, '').length;
    const key = Math.round(size * 2) / 2;
    line.chars.sizes[key] = (line.chars.sizes[key] || 0) + n;
    line.chars.total += n;
    if (font && font.bold) line.chars.bold += n;
    breakNext = !!it.hasEOL;
  }
  return lines
    .map((l) => {
      const cells = l.cells.map((c) => c.replace(/\s+/g, ' ').trim()).filter(Boolean);
      let size = l.size;
      let best = -1;
      for (const [k, v] of Object.entries(l.chars.sizes)) if (v > best) { best = v; size = Number(k); }
      const xs = l.cells.map((c, k) => (c.replace(/\s+/g, ' ').trim() ? round(l.xs[k]) : null)).filter((v) => v !== null);
      return { text: cells.join(' '), cells, xs, x0: round(l.x0), x1: round(l.x1), y: round(l.y), size, bold: l.chars.total > 0 && l.chars.bold / l.chars.total > 0.6 };
    })
    .filter((l) => l.text);
}

function round(n) { return Math.round(n * 10) / 10; }

async function readPdf(buffer) {
  const pdfjs = await loadPdfjs();
  const data = buffer instanceof Uint8Array ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength) : new Uint8Array(buffer);
  const task = pdfjs.getDocument({ data: data.slice(), verbosity: 0, useSystemFonts: false, isEvalSupported: false });
  const doc = await task.promise;
  const imageOps = new Set(OPS_IMAGES.map((k) => pdfjs.OPS[k]).filter((v) => v !== undefined));
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const view = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    let images = 0;
    let invisible = false;
    try {
      const ops = await page.getOperatorList();
      ops.fnArray.forEach((fn, k) => {
        if (imageOps.has(fn)) images++;
        /* text drawn in render mode 3 is invisible: the layer OCR lays over a scan */
        else if (fn === pdfjs.OPS.setTextRenderingMode && ops.argsArray[k] && ops.argsArray[k][0] === 3) invisible = true;
      });
    } catch (e) { /* a page pdf.js cannot draw still has its text */ }
    const fonts = (name) => { try { return page.commonObjs.has(name) ? page.commonObjs.get(name) : null; } catch (e) { return null; } };
    const lines = linesFromItems(content.items, fonts);
    pages.push({ n, width: round(view.width), height: round(view.height), images, ocr: invisible && images > 0, lines });
    page.cleanup();
  }
  let outline = [];
  try {
    const raw = await doc.getOutline();
    outline = raw ? await flattenOutline(doc, raw, 1) : [];
  } catch (e) { outline = []; }
  let info = {};
  try { info = (await doc.getMetadata()).info || {}; } catch (e) { info = {}; }
  const result = { pages, outline, info: { title: clean(info.Title || '').trim(), author: clean(info.Author || '').trim() } };
  await task.destroy();
  return result;
}

/* Some tools fill the bookmarks with ids or the file names of the PDFs they
   merged ("ee2613e3defed6fd....pdf") rather than titles. */
function saneTitle(t) {
  return /\p{L}{2}/u.test(t) && !/\.(pdf|docx?|indd|ai|png|jpe?g|tiff?)$/i.test(t) && !/^[0-9a-f]{16,}$/i.test(t.replace(/\s/g, ''));
}

async function flattenOutline(doc, items, level) {
  const out = [];
  for (const item of items) {
    let page = null;
    try {
      let dest = item.dest;
      if (typeof dest === 'string') dest = await doc.getDestination(dest);
      if (Array.isArray(dest) && dest[0]) page = (await doc.getPageIndex(dest[0])) + 1;
    } catch (e) { page = null; }
    const title = clean(item.title || '').replace(/\s+/g, ' ').trim();
    if (title && page && saneTitle(title)) out.push({ title, level, page });
    if (item.items && item.items.length && level < 3) out.push(...await flattenOutline(doc, item.items, level + 1));
  }
  return out;
}

/* ---- half two: the edition --------------------------------------------- */

const STOPWORDS = new Set('the of and to in a is for be by or with as on any shall which that this are from at an it not such under may other has have was were its their all been will who per'.split(' '));
const BULLET = /^([\u2022\u25CF\u25AA\u25A0\u25E6\u25CB\u2023\u2043\u2219\u00B7\u27A2\u2713\u2714\u25BA\u25B8\u2192\uF0B7*-]|\u2013|\u2014)\s+/;
const ENUM = /^(\(?\d{1,3}[.)](?=\s)|\(\d{1,3}[A-Z]?\)|\(?[a-z][.)](?=\s)|\([ivxlc]{1,6}\)|[ivxlc]{1,5}\.(?=\s))\s*/i;
const TERMINAL = /[.!?:;\u0964\u0965)"\u201D'\u2019]$/;
const FOLIO = /^(page\s*)?(#|[ivxlcdm]+)(\s*(of|\/)\s*#)?$/i;

function median(arr) {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function mode(map) {
  let best = null; let n = -1;
  for (const [k, v] of map) if (v > n) { n = v; best = k; }
  return best;
}

function headKey(text) {
  return text.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
}

/* Running heads, running feet and folios. A candidate is a line at the edge
   of its page: among the top two or bottom three, or in the outer strip.
   It goes if it is a page number, or if the same words, numbers aside, are
   at the edge of three pages or more: a book's title on every page, or a
   chapter's name at the head of each of its pages. */
function stripFurniture(pages) {
  const withText = pages.filter((p) => p.lines.length);
  const edge = new Map();
  for (const p of withText) {
    const byY = p.lines.slice().sort((a, b) => b.y - a.y);
    const set = new Set([...byY.slice(0, 2), ...byY.slice(-3)]);
    for (const l of p.lines) if (l.y > p.height * 0.88 || l.y < p.height * 0.12) set.add(l);
    edge.set(p, set);
  }
  const counts = new Map();
  for (const p of withText) {
    const seen = new Set();
    for (const l of edge.get(p)) seen.add(headKey(l.text));
    for (const k of seen) counts.set(k, (counts.get(k) || 0) + 1);
  }
  /* A chapter title that is also the chapter's running head is still the
     chapter's title where it first appears, set large: that one stays. */
  const kept = new Set();
  const firstSeen = new Set();
  for (const p of withText) {
    const sizes = p.lines.map((l) => l.size).sort((a, b) => a - b);
    const typical = sizes[Math.floor(sizes.length / 2)] || 0;
    for (const l of p.lines) {
      if (!edge.get(p).has(l)) continue;
      const k = headKey(l.text);
      if (firstSeen.has(k)) continue;
      firstSeen.add(k);
      if (l.size >= typical * 1.25 && l.text.length >= 4) kept.add(l);
    }
  }
  let removed = 0;
  for (const p of withText) {
    const set = edge.get(p);
    p.lines = p.lines.filter((l) => {
      if (!set.has(l) || kept.has(l)) return true;
      const k = headKey(l.text);
      const folio = FOLIO.test(k.replace(/^[-\u2013\u2014\s]+|[-\u2013\u2014\s]+$/g, ''));
      if (folio || (withText.length >= 5 && k.length >= 4 && counts.get(k) >= 3)) { removed++; return false; }
      return true;
    });
  }
  return removed;
}

/* The document's own contents or index page: near the front, titled so, or
   mostly lines that end in a page number ("Introduction .... 5", "9 - 12").
   The reader has its own contents, so the printed one is pointed to, not set. */
const PAGE_REF = /(?:\.{2,}|\u2026|\s)\s*\d{1,3}(?:\s*[-\u2013]\s*\d{1,3})?$/;
const CONTENTS_TITLE = /^(table of contents|contents|content|index|\u0935\u093F\u0937\u092F[- ]?\u0938\u0942\u091A\u0940|\u0905\u0928\u0941\u0915\u094D\u0930\u092E\u0923\u093F\u0915\u093E)\b/i;
function contentsTitled(p) {
  return p.lines.some((l) => (CONTENTS_TITLE.test(l.text.trim()) && l.text.trim().length <= 24) || /\bpage\s*(no\.?|number\(?s?\)?)$/i.test(l.text.trim()));
}
function contentsPage(p, total, afterContents, afterTitle) {
  if (p.n > Math.max(14, Math.ceil(total * 0.2))) return false;
  /* a page that only says "Contents" before the page that lists them */
  if (p.lines.length && p.lines.length <= 6 && contentsTitled(p)) return true;
  if (p.lines.length < 4) return false;
  const refs = p.lines.filter((l) => PAGE_REF.test(l.text) || /^\d{1,3}(\s*[-\u2013]\s*\d{1,3})?$/.test(l.text.trim())).length;
  const others = p.lines.length - refs;
  /* titled here, or the page after a title page, and dense with page numbers */
  const titled = contentsTitled(p) || (afterTitle && refs >= others * 0.3);
  /* the second page of a contents: its entries, numbered or with page numbers */
  const entries = p.lines.filter((l) => /^(\d{1,2}\.)+\d{0,2}\s/.test(l.text) || PAGE_REF.test(l.text)).length;
  /* or untitled, with a page number for every line or two of titles (some
     set the numbers in a column of their own) */
  return (titled && refs >= 3) || (refs >= 5 && refs >= others * 0.5) || (afterContents && refs >= 3 && entries / p.lines.length >= 0.4);
}

/* Devanagari that a font has mapped to the wrong characters: a word that
   begins with a vowel sign, or has Latin letters, digits or another script's
   letters inside it. Word processors embed some Hindi fonts with a broken
   map from glyphs back to letters, so pdf.js reads "\u0936\u094D\u0935\u093E\u0928" (dog) as
   "\u1B6B \u0935\u093E\u0928", with a Balinese sign where the conjunct was. */
const DEVA = /[\u0900-\u097F]/;
function devanagariDamage(text) {
  let tokens = 0;
  let bad = 0;
  for (const t of String(text).split(/\s+/)) {
    if (!DEVA.test(t)) continue;
    tokens++;
    const core = t.replace(/^[("'\u2018\u201C[]+|[)"'\u2019\u201D\].,;:!?\u0964\u0965-]+$/g, '');
    if (/^[\u093E-\u094D\u0951-\u0957\u0962\u0963]/.test(core)
      || /[^\p{Script=Devanagari}0-9.\-/]/u.test(core.replace(/\u200C|\u200D/g, ''))
      || /[0-9][\u0900-\u097F]|[\u0900-\u097F][0-9]/.test(core)) bad++;
  }
  return { tokens, bad, ratio: tokens ? bad / tokens : 0 };
}

/* A page not to set as text: a scan's OCR layer (it reads a law's "Definitions"
   as "D\u00ABftmt on\u00AB"), or Hindi the font has scrambled. The reader shows it
   as printed instead. */
function unreadable(page) {
  if (page.ocr) return 'scan';
  const d = devanagariDamage(page.lines.map((l) => l.text).join(' '));
  return d.tokens >= 20 && d.ratio > 0.15 ? 'hindi' : null;
}

/* Whether the text is real text. Scans have none, or only an OCR layer;
   legacy Hindi fonts (Kruti Dev and friends) store Devanagari as Latin
   letters, which pdf.js reads faithfully as gibberish ("mRrj izns'k"), and
   some Unicode Hindi fonts come out scrambled (above). English has
   stopwords; good Hindi has whole Devanagari words. Text that is neither is
   not offered as an edition. */
function assess(allPages) {
  const textPages = allPages.filter((p) => p.lines.length);
  const ocrPages = textPages.filter((p) => p.ocr).length;
  const pages = allPages.filter((p) => !p.ocr);
  const all = pages.map((p) => p.lines.map((l) => l.text).join(' ')).join(' ');
  const chars = all.replace(/\s/g, '').length;
  const deva = (all.match(/[\u0900-\u097F]/g) || []).length;
  const latin = (all.match(/[A-Za-z]/g) || []).length;
  const tokens = all.toLowerCase().split(/[^a-z']+/).filter((w) => w.length > 0);
  const stop = tokens.filter((w) => STOPWORDS.has(w)).length;
  const stopRatio = tokens.length ? stop / tokens.length : 0;
  const contentPages = allPages.filter((p) => p.lines.length || p.images).length || 1;
  const perPage = chars / contentPages;
  const lang = deva > latin ? 'hi' : 'en';
  const damage = devanagariDamage(all);
  let reason = null;
  if (textPages.length && ocrPages / textPages.length >= 0.6) reason = 'recognised from a scan (OCR), which misreads words; the original pages are exact';
  else if (chars < 400 || perPage < 120) reason = 'little or no text layer (a scan, or mostly pictures)';
  else if (lang === 'en' && stopRatio < 0.08) reason = 'the text layer does not read as English (likely a legacy Hindi font)';
  else if (lang === 'hi' && (deva / chars < 0.5 || damage.ratio > 0.08)) reason = 'the Hindi text layer is damaged (its font maps letters to the wrong characters)';
  return { text: !reason, reason, lang, chars, perPage: Math.round(perPage), stopRatio: Math.round(stopRatio * 1000) / 1000, devanagariDamage: Math.round(damage.ratio * 1000) / 1000, ocrPages };
}

/* pdf.js reads some Devanagari fonts in visual order, which puts the short-i
   sign before its consonant. Only reorder when that is evidently happening:
   in logical order the sign never starts a word. */
function fixDevanagari(text) {
  const signs = (text.match(/\u093F/g) || []).length;
  if (!signs) return text;
  const initial = (text.match(/(^|[\s(])\u093F/g) || []).length;
  if (initial / signs < 0.1) return text;
  return text.replace(/\u093F((?:[\u0915-\u0939\u0958-\u095F]\u094D)*[\u0915-\u0939\u0958-\u095F]\u093C?)/g, '$1\u093F');
}

function joinLine(text, next) {
  if (!text) return next;
  if (/\u00AD$/.test(text)) return text.slice(0, -1) + next;
  if (/[A-Za-z]-$/.test(text) && /^[a-z]/.test(next)) return text.slice(0, -1) + next;
  return text + ' ' + next;
}

function words(text) {
  return (String(text).match(/[\p{L}\p{N}]+(?:['\u2019-][\p{L}\p{N}]+)*/gu) || []).length;
}

/* Reading order. A page is kept in the order it was drawn, which follows the
   columns of a two-column page; but some layout programs draw a one-column
   page's lower half first, so a page with no second column is read top to
   bottom instead. */
function readingOrder(p) {
  const wide = p.lines.filter((l) => l.text.length > 20);
  if (wide.length < 3) return;
  const right = wide.filter((l) => l.x0 > p.width * 0.45).length;
  if (right / wide.length > 0.1) return;
  p.lines.sort((a, b) => (Math.abs(b.y - a.y) > Math.min(a.size, b.size) * 0.3 ? b.y - a.y : a.x0 - b.x0));
}

function buildEdition(raw, opts = {}) {
  const pages = raw.pages.map((p) => ({ ...p, lines: p.lines.slice() }));
  pages.forEach(readingOrder);
  /* contents pages are found before the running heads go, which would take
     the page numbers at the foot of a contents page with them */
  const contentsSet = new Set();
  let afterContents = false;
  let afterTitle = false;
  for (const p of pages) {
    const c = p.lines.length > 0 && !p.ocr && contentsPage(p, pages.length, afterContents, afterTitle);
    if (c) contentsSet.add(p.n);
    afterContents = c;
    afterTitle = contentsTitled(p);
  }
  const furniture = stripFurniture(pages);
  const quality = assess(pages);
  const edition = {
    v: 1,
    pages: pages.length,
    lang: quality.lang,
    text: quality.text,
    words: 0,
    minutes: 0,
    quality: { reason: quality.reason, charsPerPage: quality.perPage, stopRatio: quality.stopRatio, devanagariDamage: quality.devanagariDamage, ocrPages: quality.ocrPages, furniture },
    toc: [],
    blocks: []
  };
  if (!quality.text) {
    edition.toc = (raw.outline || []).filter((o) => o.level <= 2).map((o) => ({ t: o.title, l: o.level, p: o.page }));
    return edition;
  }

  /* the body size: the size most characters are set in */
  const sizeChars = new Map();
  const leads = [];
  for (const p of pages) {
    p.lines.forEach((l, i) => {
      const k = Math.round(l.size * 2) / 2;
      sizeChars.set(k, (sizeChars.get(k) || 0) + l.text.length);
      const prev = p.lines[i - 1];
      if (prev && Math.abs(prev.size - l.size) < 0.6) {
        const dy = prev.y - l.y;
        if (dy > 0 && dy < l.size * 3) leads.push(Math.round(dy * 2) / 2);
      }
    });
  }
  const body = Number(mode(sizeChars)) || 10;
  const lead = median(leads) || body * 1.3;
  const bodyBoldShare = (() => {
    let b = 0; let t = 0;
    for (const p of pages) for (const l of p.lines) if (Math.abs(l.size - body) < 0.6) { t += l.text.length; if (l.bold) b += l.text.length; }
    return t ? b / t : 0;
  })();

  /* heading candidates and their tiers */
  const isCaps = (s) => { const letters = s.replace(/[^A-Za-z]/g, ''); return letters.length >= 4 && letters === letters.toUpperCase(); };
  const tiers = [];
  for (const p of pages) for (const l of p.lines) {
    if (l.size >= body * 1.15 && l.text.length < 160) tiers.push(Math.round(l.size * 2) / 2);
  }
  const tierSizes = [...new Set(tiers)].sort((a, b) => b - a);
  const clustered = [];
  for (const s of tierSizes) if (!clustered.length || clustered[clustered.length - 1] - s > 0.75) clustered.push(s);
  const sizeLevel = (size) => {
    if (size < body * 1.15) return 0;
    for (let i = 0; i < clustered.length; i++) if (size >= clustered[i] - 0.75) return Math.min(3, i + 1);
    return 3;
  };
  const softLevel = clustered.length ? Math.min(3, clustered.length + 1) : 2;

  const blocks = [];
  let para = null; // { type, text, page, marker, lastLine, size }
  const flush = () => {
    if (!para) return;
    const text = para.text.replace(/\s+/g, ' ').trim();
    if (text) blocks.push(para.type === 'li' ? ['li', text, para.page, para.marker] : [para.type, text, para.page]);
    para = null;
  };
  let tableRows = null;
  const flushTable = () => {
    if (!tableRows) return;
    if (tableRows.rows.length >= 2) blocks.push(['table', tableRows.rows, tableRows.page]);
    else blocks.push(['p', tableRows.rows[0].join(' '), tableRows.page]);
    tableRows = null;
  };

  /* a page shown as printed: a picture (''), a scan, scrambled Hindi, or the
     printed contents; a run of them becomes one placeholder, ['fig', kind,
     first, last], 'mixed' when the kinds differ (contents always alone) */
  const shownAsPrinted = (kind, n) => {
    flush(); flushTable();
    const last = blocks[blocks.length - 1];
    if (last && last[0] === 'fig' && (last[3] || last[2]) === n - 1 && (last[1] === 'contents') === (kind === 'contents')) {
      last[3] = n;
      if (last[1] !== kind) last[1] = 'mixed';
    } else blocks.push(['fig', kind, n]);
  };
  /* a table row has cells far apart whose edges line up with the next or
     last row's; wide justified spacing in a narrow column does not line up */
  const aligned = (a, b) => !!a && !!b && a.cells.length >= 2 && b.cells.length >= 2
    && (a.xs.slice(1).some((x) => b.xs.slice(1).some((y) => Math.abs(x - y) < 4)) || (a.cells.length >= 3 && a.cells.length === b.cells.length));
  const lineAt = (pi, i) => {
    let q = pi;
    let k = i;
    while (q >= 0 && q < pages.length) {
      const ls = pages[q].lines;
      if (k >= 0 && k < ls.length) return ls[k];
      if (k < 0) { q--; if (q >= 0) k = pages[q].lines.length + k; } else { k -= ls.length; q++; }
    }
    return null;
  };
  const NUMHEAD = /^((?:\d{1,2}\.){1,3}\d{0,2}|\d{1,2}|[IVX]{1,5}\.)\s+(?=[A-Z]|\p{Script=Devanagari})/u;
  pages.forEach((p, pi) => {
    const why = p.lines.length ? (unreadable(p) || (contentsSet.has(p.n) ? 'contents' : null)) : (p.images ? '' : null);
    if (why !== null) { shownAsPrinted(why, p.n); return; }
    if (!p.lines.length) return;
    const bodyLines = p.lines.filter((l) => Math.abs(l.size - body) < 1);
    const xs = new Map();
    for (const l of bodyLines) { const k = Math.round(l.x0 / 2) * 2; xs.set(k, (xs.get(k) || 0) + 1); }
    const left = Number(mode(xs)) || (p.lines[0] && p.lines[0].x0) || 0;
    const right = bodyLines.length ? bodyLines.map((l) => l.x1).sort((a, b) => a - b)[Math.floor(bodyLines.length * 0.85)] : p.width;
    const measure = Math.max(1, right - left);

    p.lines.forEach((l, i) => {
      const prev = i > 0 ? p.lines[i - 1] : null;
      const gapAbove = prev ? prev.y - l.y : Infinity;
      const next = p.lines[i + 1];
      const gapBelow = next ? l.y - next.y : Infinity;
      const isolated = gapAbove > lead * 1.35 || gapBelow > lead * 1.35 || !prev;
      let level = sizeLevel(l.size);
      /* a table row, even a bold header row, is not a heading */
      const isTable = l.cells.length >= 2 && l.cells.every((c) => c.length < 80)
        && (aligned(lineAt(pi, i - 1), l) || aligned(l, lineAt(pi, i + 1)) || (tableRows && aligned(tableRows.last, l)));
      if (isTable) level = 0;
      if (!level && !isTable && l.text.length < 100 && !TERMINAL.test(l.text.replace(/[.:]$/, '')) && isolated) {
        if (l.bold && bodyBoldShare < 0.3) level = softLevel;
        else if (isCaps(l.text) && l.text.length < 70) level = softLevel;
      }
      /* "2. Summary", "3.1 What are street dogs?": a numbered line standing on
         its own after a finished paragraph is a heading, its depth in its number */
      const num = !level && !isTable && l.text.length <= 90 && !/[.,;:]$/.test(l.text) && l.text.match(NUMHEAD);
      /* numbered lines one after another are a list, not a run of headings */
      const depthOf = (m) => m[1].split('.').filter(Boolean).length;
      const sibling = (o) => { const m = o && o.text.match(NUMHEAD); return !!m && depthOf(m) === depthOf(num) && Math.abs(o.x0 - l.x0) < 6; };
      if (num && !sibling(lineAt(pi, i - 1)) && !sibling(lineAt(pi, i + 1)) && (l.x1 < right - measure * 0.2 || l.bold)
        && (!para || TERMINAL.test(para.text) || gapAbove > lead * 1.25 || para.lastLine.page !== p.n)) {
        const depth = num[1].split('.').filter(Boolean).length;
        level = Math.min(3, depth > 1 ? softLevel + 1 : softLevel);
      }

      if (level) {
        flushTable();
        const last = blocks[blocks.length - 1];
        /* a heading set on two lines is one heading */
        if (!para && last && last[0] === 'h' + level && last[2] === p.n && prev && gapAbove < l.size * 1.8 && sizeLevel(prev.size) === level) {
          last[1] = joinLine(last[1], l.text);
        } else {
          flush();
          blocks.push(['h' + level, l.text, p.n]);
        }
        return;
      }
      if (isTable) {
        flush();
        if (!tableRows) tableRows = { rows: [], page: p.n };
        tableRows.rows.push(l.cells);
        tableRows.last = l;
        return;
      }
      flushTable();

      const text = l.text;
      const bullet = text.match(BULLET);
      const en = !bullet && text.match(ENUM);
      const indented = l.x0 > left + Math.max(6, l.size * 0.9) && l.x0 < left + measure * 0.4;
      const prevShort = para && para.lastLine && para.lastLine.page === p.n && para.lastLine.x1 < right - measure * 0.12;
      const crossPage = para && para.lastLine && para.lastLine.page !== p.n;
      let start = !para
        || !!bullet || !!en
        || (para.lastLine && para.lastLine.page === p.n && gapAbove > lead * 1.45)
        || Math.abs(l.size - para.size) > 1
        || (prevShort && TERMINAL.test(para.text))
        || (indented && para.type !== 'li' && !(para.lastLine.page === p.n && para.lastLine.indented));
      if (crossPage) {
        /* a paragraph carries over the page turn unless it had plainly ended */
        start = !!bullet || !!en || TERMINAL.test(para.text) || (indented && para.type !== 'li') || Math.abs(l.size - para.size) > 1;
      }
      if (start) {
        flush();
        if (bullet) para = { type: 'li', text: text.slice(bullet[0].length), page: p.n, marker: '\u2022', size: l.size, x0: l.x0 };
        else if (en) para = { type: 'li', text: text.slice(en[0].length), page: p.n, marker: en[1].trim(), size: l.size, x0: l.x0 };
        else para = { type: 'p', text, page: p.n, size: l.size, x0: l.x0 };
      } else {
        para.text = joinLine(para.text, text);
      }
      para.lastLine = { page: p.n, x1: l.x1, indented };
    });
    /* a table left open runs on over the page turn, header row and all */
  });
  flush();
  flushTable();

  /* drop empty list items left by a marker on a line of its own, fix
     visually ordered Devanagari, and set a heading that is only a number
     ("02", "2.2.1", drawn apart from its words) in front of the heading
     that follows it on the same page */
  const out = [];
  for (const b of blocks) {
    if (b[0] === 'li' && !b[1].trim()) continue;
    if (edition.lang === 'hi' && typeof b[1] === 'string') b[1] = fixDevanagari(b[1]);
    const prev = out[out.length - 1];
    if (prev && prev[0][0] === 'h' && b[0][0] === 'h' && prev[2] === b[2] && /^\d{1,2}(\.\d{1,2}){0,3}\.?$/.test(prev[1]) && /\p{L}/u.test(b[1])) {
      prev[1] = `${prev[1]} ${b[1]}`;
      if (Number(b[0][1]) < Number(prev[0][1])) prev[0] = b[0];
      continue;
    }
    out.push(b);
  }
  edition.blocks = out;

  /* contents: the PDF's own outline when it has a real one, else the headings */
  const outline = (raw.outline || []).filter((o) => o.level <= 2);
  if (outline.length >= 3) {
    edition.toc = outline.map((o) => {
      let b = out.findIndex((blk) => blk[2] >= o.page);
      if (b < 0) b = out.length - 1;
      const near = out.findIndex((blk, i) => i >= b && blk[2] === o.page && blk[0][0] === 'h' && headKey(blk[1]).startsWith(headKey(o.title).slice(0, 12)));
      return { t: o.title, l: o.level, p: o.page, b: near >= 0 ? near : b };
    });
  } else {
    /* The first level with three headings or more carries the contents; the
       bigger, rarer ones above it (a title, "References") sit beside it, and
       the level below it is indented under it while the list stays short. */
    const count = (lv) => out.filter((blk) => blk[0] === 'h' + lv).length;
    const primary = [1, 2, 3].find((lv) => count(lv) >= 3) || 3;
    const upTo = [1, 2, 3].filter((lv) => lv <= primary).reduce((n, lv) => n + count(lv), 0);
    const below = [2, 3].find((lv) => lv > primary && count(lv) >= 2) || 0;
    const second = below && upTo + count(below) <= 150 ? below : 0;
    const LABEL = /^((chapter|part|section|schedule|annexure|annex|appendix|unit|module|lesson)\s+([0-9]+|[ivxlcdm]+|[a-z])\.?|\d{1,2})$/i;
    let skip = -1;
    out.forEach((blk, i) => {
      if (i === skip || blk[0][0] !== 'h') return;
      const lv = Number(blk[0].slice(1));
      if ((lv > primary && lv !== second) || blk[1].length > 120) return;
      let title = blk[1];
      /* "CHAPTER IV" over "Offences" is one entry, CHAPTER IV: Offences; a
         chapter's big number over its title too, 01: Introduction */
      const nextBlk = out[i + 1];
      if (LABEL.test(title) && nextBlk && nextBlk[0][0] === 'h' && nextBlk[2] === blk[2] && nextBlk[1].length <= 100) {
        title = `${title}: ${nextBlk[1]}`;
        skip = i + 1;
      }
      const prevEntry = edition.toc[edition.toc.length - 1];
      if (prevEntry && prevEntry.t.toLowerCase() === title.toLowerCase()) return;
      /* a number with no words, or a caption, is not a section */
      if (!/\p{L}{2}/u.test(title) || /^(figure|fig\.|table|source|note|chart|graph|image|photo)\b/i.test(title)) return;
      edition.toc.push({ t: title, l: lv === second ? 2 : 1, p: blk[2], b: i });
    });
    /* a numbered document numbers its own levels: 3 over 3.1 over 3.1.2 */
    const NUMBERED = /^((?:\d{1,2}\.){1,3}\d{0,2}|\d{1,2})\s/;
    if (edition.toc.length >= 4 && edition.toc.filter((t) => NUMBERED.test(t.t)).length / edition.toc.length >= 0.6) {
      for (const t of edition.toc) {
        const m = t.t.match(NUMBERED);
        if (m) t.l = m[1].split('.').filter(Boolean).length > 1 ? 2 : 1;
      }
    }
    /* what sits above the first chapter on the cover is the cover */
    const firstTop = edition.toc.findIndex((t) => t.l === 1);
    if (firstTop > 0) edition.toc = edition.toc.filter((t, k) => k >= firstTop || t.p > 1);
    if (edition.toc.length > 160) edition.toc = edition.toc.filter((t) => t.l === 1);
  }

  edition.words = out.reduce((n, b) => n + (b[0] === 'fig' ? 0 : b[0] === 'table' ? b[1].reduce((m, r) => m + words(r.join(' ')), 0) : words(b[1])), 0);
  edition.minutes = Math.max(1, Math.round(edition.words / (opts.wpm || 230)));
  return edition;
}

async function extract(buffer, opts) {
  return buildEdition(await readPdf(buffer), opts);
}

module.exports = { VERSION, readPdf, readingOrder, buildEdition, extract, linesFromItems, assess, stripFurniture, contentsPage, fixDevanagari, devanagariDamage, unreadable, saneTitle, joinLine, words, clean };
