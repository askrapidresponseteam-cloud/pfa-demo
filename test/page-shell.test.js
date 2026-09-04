'use strict';

/* Every page must sit under the fixed header the same way founder and wall do.

   The header is `position:fixed`, so nothing below it is pushed down
   automatically: the first section has to reserve the header's height itself.
   Twelve pages do it through `.hero`, donate through `.give`. product, quiz
   and get-involved did not — they used `calc(var(--band) * .55)`, which is
   42px to 75px depending on the window while the header needs 69px, so the top
   of the page slid underneath it at anything under about 1470px wide.

   The Wall's theatre is deliberately outside this: it is a `position:fixed;
   inset:0` overlay that covers the header on purpose. */

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const ROOT = path.join(__dirname, '..');
/* index.html is a separate design with its own tokens; submission-collage is a
   standalone full-viewport piece with no site chrome at all. */
const SEPARATE = new Set(['index.html', 'submission-collage.html', 'admin.html']);
const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html') && !SEPARATE.has(f));

const rules = (html) => html.replace(/\/\*[\s\S]*?\*\//g, '');

function firstSection(html) {
  const m = html.match(/<main[^>]*>\s*<\w+[^>]*class="([^"]*)"/);
  return m ? m[1].split(/\s+/)[0] : null;
}
function ruleFor(html, cls) {
  const m = rules(html).match(new RegExp(`\\.${cls}\\{([^}]*)\\}`));
  return m ? m[1] : null;
}

test('sanity: the pages were found', () => {
  assert.ok(pages.length >= 12, `only ${pages.length} pages`);
});

test('the first section of every page reserves the fixed header', () => {
  const broken = [];
  for (const page of pages) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const cls = firstSection(html);
    if (!cls) continue;                       // founder has no <main>; checked below
    const rule = ruleFor(html, cls);
    if (!rule) { broken.push(`${page}: .${cls} has no rule`); continue; }
    if (!/var\(--ann\)/.test(rule) || !/var\(--nav\)/.test(rule)) {
      broken.push(`${page}: .${cls} does not reserve the header`);
    }
  }
  assert.deepEqual(broken, [],
    `the top of these pages slides under the header:\n  ${broken.join('\n  ')}`);
});

test('founder, which has no <main>, still reserves it', () => {
  const html = fs.readFileSync(path.join(ROOT, 'founder.html'), 'utf8');
  assert.match(rules(html), /\.fhero\{[^}]*var\(--ann\)[^}]*var\(--nav\)/,
    'the reference page must be the reference');
});

test('the reservation is a fixed height, not a share of the viewport', () => {
  /* calc(var(--band) * .55) is the specific mistake: --band is vw-based, so
     the space reserved for a fixed-height header changed with the window and
     was only large enough on a wide one. */
  const bad = [];
  for (const page of pages) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const cls = firstSection(html);
    if (!cls) continue;
    const rule = ruleFor(html, cls) || '';
    if (/padding[^;]*calc\(var\(--band\)\s*\*/.test(rule)) bad.push(`${page}: .${cls}`);
  }
  assert.deepEqual(bad, [], `these size the header allowance off the viewport: ${bad.join(', ')}`);
});

test('every page re-measures the header when the window changes', () => {
  /* --nav is a hard-coded 69px default and the nav wraps on a narrow window. */
  const chrome = fs.readFileSync(path.join(ROOT, 'assets', 'chrome.js'), 'utf8');
  assert.match(chrome, /setProperty\((['"])--nav\1/, 'chrome.js measures --nav');
  assert.match(chrome, /addEventListener\((['"])resize\1/, 'and re-measures on resize');
  const missing = pages.filter((page) => {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    return !/<script src="\/?assets\/chrome\.js"><\/script>/.test(html);
  });
  assert.deepEqual(missing, [], `these never re-measure: ${missing.join(', ')}`);
});

test('the theatre is exempt, and stays exempt', () => {
  const wall = fs.readFileSync(path.join(ROOT, 'wall.html'), 'utf8');
  const theatre = ruleFor(wall, 'theatre');
  assert.ok(theatre, 'the theatre rule must exist');
  assert.match(theatre, /position:fixed/);
  assert.match(theatre, /inset:0/, 'it covers the header on purpose');
  assert.ok(!/var\(--ann\)/.test(theatre), 'the theatre must not reserve room for site chrome');
});

test('the theatre clock and seek bar are live only when there is a duration to measure against', () => {
  /* The top bar used to carry a little progress meter, drawn whenever the
     theatre was open; before a film loaded, or when a file could not be
     reached, or on an embed whose player had not answered, it sat at zero
     width and read as a stray mark. The meter is gone - progress is drawn
     once, on the seek bar - and the same rule now governs what remains:
     tick() decides, in the one place that knows both the duration and
     whether an embed is mounted, and with no duration the time readout is
     away and the bar is still and disabled. This runs the real function over
     each of those states. */
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'wall.html'), 'utf8');
  assert.ok(!src.includes('thMeter'), 'the meter is gone, not merely hidden');
  /* clock() answers for whichever source is on the stage - the file, or an
     embedded film through its player API - and tick() draws from it. */
  const body = src.slice(src.indexOf('function ruleLabel(i){'), src.indexOf('/* YouTube\'s player API'));
  assert.ok(body.includes('function clock()') && body.includes('function tick()'), 'clock()/tick() not found in wall.html');

  const run = (video, iframe, yt) => {
    const el = {};
    const $ = (id) => (el[id.slice(1)] = el[id.slice(1)] || {
      style: {}, parentNode: {}, setAttribute() {}, classList: { toggle() {} }
    });
    new Function('$', 'tc', 'pad', 'video', 'iframe', 'yt', 'rule', 'LIST', 'cur', `${body}; tick();`)(
      $, (t) => 'T' + Math.round(t), (n) => String(n), video, iframe, yt || null, { clientWidth: 800 }, [{}, {}, {}], 0
    );
    return el;
  };

  const playing = run({ duration: 300, currentTime: 90 }, null);
  assert.equal(playing.thT.parentNode.hidden, false, 'a film with a duration shows its clock');
  assert.equal(playing.thT.textContent, 'T90', 'and the clock actually tracks it');
  assert.equal(playing.thFill.style.width, '30%', 'as does the one drawing of progress');
  assert.equal(playing.thSeek.disabled, false, 'and the bar can be taken');

  assert.equal(run({ duration: 0, currentTime: 0 }, null).thT.parentNode.hidden, true,
    'before the metadata arrives there is nothing to measure against');
  assert.equal(run({ duration: NaN, currentTime: 0 }, null).thSeek.disabled, true,
    'a film whose file cannot be reached never gets a duration, and cannot be seeked');
  assert.equal(run({ duration: 300, currentTime: 90 }, {}).thT.parentNode.hidden, true,
    'an embed whose player has not answered: its time cannot be read, and the file\'s stale figures must not stand in');
  const viaApi = run({ duration: 0, currentTime: 0 }, {}, { ready: true, player: { getDuration: () => 4000, getCurrentTime: () => 1000 } });
  assert.equal(viaApi.thT.parentNode.hidden, false, 'a YouTube film answers through its player, so it is measured');
  assert.equal(viaApi.thFill.style.width, '25%', 'against the player\'s own time, not the idle <video>');
});
