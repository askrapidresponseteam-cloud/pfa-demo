'use strict';

/* The help desk - report something, ask a question, follow one you raised -
   is the most urgent thing on this site. It sat halfway down network.html,
   which meant reaching it required already knowing it was there.

   It is now in the header of every page. These tests exist because that is a
   promise made 46 times: a link added by hand to 46 files is a link that will
   be missing from the 47th, and an anchor is silent when it breaks - the page
   still loads, it simply does not go where it said. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const HELP_HREF = 'network.html#helpdesk';

/* Attribute order is not consistent across these files - most write
   <nav aria-label="Main navigation" class="desktop-nav">, a few write the
   class first, and index.html mentions .desktop-nav in a <style> block before
   the markup appears. A regex anchored on '<nav class="..."' matches some
   pages, misses others, and on index.html matched the stylesheet and then ran
   on to the real nav, which passed by accident. So the block is found by its
   class and then read outwards to the tags around it. */
function navBlock(html, className) {
  const at = html.indexOf(`class="${className}"`);
  if (at < 0) return null;
  const open = html.lastIndexOf('<nav', at);
  const close = html.indexOf('</nav>', at);
  if (open < 0 || close < 0) return null;
  return html.slice(open, close + 6);
}

function pagesWithHeader() {
  return fs.readdirSync(ROOT)
    .filter((f) => f.endsWith('.html'))
    .filter((f) => fs.readFileSync(path.join(ROOT, f), 'utf8').includes('class="desktop-nav"'));
}

test('the help desk is reachable from the header of every page that has one', () => {
  const pages = pagesWithHeader();
  assert.ok(pages.length >= 40, `expected the site's pages, found ${pages.length}`);

  const missing = pages.filter((page) => {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const nav = navBlock(html, 'desktop-nav');
    return !nav || !nav.includes(HELP_HREF);
  });
  assert.deepEqual(missing, [], 'these pages have a header with no way to reach the help desk');
});

test('the help desk is reachable on a phone too', () => {
  /* The desktop nav is display:none below 1100px, so the header link alone
     would leave every phone without it. */
  const missing = pagesWithHeader().filter((page) => {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const menu = navBlock(html, 'mobile-nav');
    return !menu || !menu.includes(HELP_HREF);
  });
  assert.deepEqual(missing, [], 'these pages omit the help desk from the mobile menu');
});

test('the anchor it points at exists, and the form behind it is real', () => {
  const network = fs.readFileSync(path.join(ROOT, 'network.html'), 'utf8');
  assert.ok(network.includes('id="helpdesk"'),
    'every page links to #helpdesk and network.html no longer has it');

  /* An anchor that resolves to an empty section is the same failure one step
     later, so the three things it promises are checked as well. */
  for (const panel of ['complaintPanel', 'questionPanel', 'followPanel']) {
    assert.ok(network.includes(`id="${panel}"`), `the help desk is missing its ${panel}`);
  }
  assert.ok(/data-help-form="PFA-C"/.test(network), 'the report form is gone');
});

test('the desktop nav hands over to the menu button before it runs out of room', () => {
  /* Adding a seventh item to the bar left 20px of slack at the old 980px
     breakpoint, so the nav overflowed for 80px of widths before the menu
     button appeared. Measured: it fits to 1101px and no lower. */
  const css = fs.readFileSync(path.join(ROOT, 'assets', 'header-footer.css'), 'utf8');
  const handover = /@media\(max-width:(\d+)px\)\{\s*\.desktop-nav,\.header-icon\{display:none\}/.exec(css);
  assert.ok(handover, 'the nav no longer hands over to the menu button at any width');
  assert.ok(Number(handover[1]) >= 1100,
    `the nav hands over at ${handover[1]}px, but it needs 1101px to fit without overflowing`);
});
