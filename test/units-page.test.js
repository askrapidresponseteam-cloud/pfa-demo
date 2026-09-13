'use strict';

/* units.html was a placeholder reading "Content for this page is being
   prepared". It is now the unit directory People for Animals publishes at
   peopleforanimalsindia.org/units, drawn as a plot of where the units stand
   beside a list you can search.

   Everything on the page is derived from one array, so the checks below are
   mostly about that: no number is typed into the copy, no state falls out of
   the region filters, and no unit is quietly dropped. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'units.html'), 'utf8');

/* The page's own script, run against a real DOM, so these check what a
   visitor gets rather than what the source looks like. jsdom is a declared
   devDependency: if it were merely optional and these tests skipped when it
   was absent, nine of the eleven would quietly pass without running, which is
   the failure mode this suite spent v1.179 removing. */
const { JSDOM, VirtualConsole } = require('jsdom');

const dom = (() => {
  const vc = new VirtualConsole();
  const errors = [];
  vc.on('jsdomError', (e) => errors.push(e.message));
  const out = new JSDOM(HTML, { runScripts: 'dangerously', virtualConsole: vc });
  assert.deepEqual(errors, [], 'the page threw while rendering');
  return out;
})();
const d = dom.window.document;

test('every unit in the data reaches the page', () => {
  assert.equal(d.querySelectorAll('.u-unit').length, 80, 'the directory lists 80 units');
  assert.equal(d.querySelectorAll('.u-state').length, 20, 'across 20 states');
});

test('the counts in the copy are the length of the list, not typed in', () => {
  const rows = d.querySelectorAll('.u-unit').length;
  assert.match(d.querySelector('#ucount').textContent, new RegExp(`^${rows} units$`));
  /* The chips must account for every unit exactly once: a state missing from
     the region table would leave units unreachable behind every filter. */
  const chips = [...d.querySelectorAll('.u-chip')].filter((c) => c.dataset.r !== 'all');
  const summed = chips.reduce((n, c) => n + Number(c.querySelector('i').textContent), 0);
  assert.equal(summed, rows, 'the region counts must add up to the whole list');
});

test('the units are numbered in the order they are read', () => {
  /* The number used to be the index into the source array, which is that
     page's own order. Grouped by region and state, the column read 6, 7, 8
     ... 41 ... 42 and looked random, because it was counting something the
     reader could not see. It counts down the page now. */
  const shown = [...d.querySelectorAll('.u-unit__idx')].map((n) => Number(n.textContent));
  assert.deepEqual(shown, shown.map((_, i) => i + 1));
  assert.equal(shown[shown.length - 1], d.querySelectorAll('.u-unit').length);
});

test('every unit has a phone number on the page, not a link to one', () => {
  /* The /units index carries no number for anybody: state, town and a name.
     These came off each unit's own page, all eighty of them. The whole job of
     this page is that someone with an injured animal can ring somebody, so a
     row without a number is a failed row. */
  const rows = [...d.querySelectorAll('.u-unit')];
  const without = rows.filter((r) => !r.querySelector('.u-unit__tel'))
    .map((r) => r.querySelector('.u-unit__city').textContent);
  assert.deepEqual(without, [], 'these units have no number on the page');
  assert.equal(d.querySelectorAll('.u-unit__call').length, 0,
    'nobody should have to leave the page to find a number');
});

test('every number dials', () => {
  /* Several are printed with spaces, dashes or a leading zero, and one unit in
     five publishes two. All of them are links, and every href has to be
     something a phone can actually dial. */
  const links = [...d.querySelectorAll('.u-unit__tel a')];
  assert.ok(links.length >= 80, `expected at least one number per unit, found ${links.length}`);
  links.forEach((a) => {
    assert.match(a.getAttribute('href'), /^tel:[0-9+]{6,}$/,
      `${a.textContent} does not make a dialable href`);
  });
  const dadri = [...d.querySelectorAll('.u-unit')]
    .find((u) => u.querySelector('.u-unit__city').textContent === 'Charkhi Dadri');
  assert.equal(dadri.querySelectorAll('.u-unit__tel a').length, 2, 'both published numbers are links');
});

test('an address is shown where PFA publishes one, and never invented', () => {
  /* Thirty-seven of the eighty carry a shelter address on their own page. The
     other forty-three do not, and the row goes without rather than guessing. */
  const rows = [...d.querySelectorAll('.u-unit')];
  const withAddr = rows.filter((r) => r.querySelector('.u-unit__addr'));
  assert.equal(withAddr.length, 37);
  withAddr.forEach((r) => {
    assert.ok(r.querySelector('.u-unit__addr').textContent.trim().length > 8,
      'an address stub is worse than none');
  });
  const bangalore = rows.find((u) => u.querySelector('.u-unit__city').textContent === 'Bangalore');
  assert.match(bangalore.querySelector('.u-unit__addr').textContent, /Wildlife Rescue/);
});

test('the contact details match the unit they are filed under', () => {
  /* The table is keyed by PFA's unit id, so an off-by-one would put a shelter
     in the wrong town and nothing would look wrong. Spot-checked against the
     saved pages on units in four different states. */
  const tel = (city) => [...d.querySelectorAll('.u-unit')]
    .find((u) => u.querySelector('.u-unit__city').textContent === city)
    .querySelector('.u-unit__tel').textContent;
  assert.match(tel('Jalandhar'), /9814258726/);
  assert.match(tel('Charkhi Dadri'), /9350122231/);
  assert.match(tel('Ahmednagar'), /08390527060/);
  assert.match(tel('Bangalore'), /080-28611986/);
  assert.match(tel('Dehradun'), /011-47083776/);
});

test('the headline is one colour', () => {
  /* The third line was set in the accent blue. It is one sentence across
     three lines, so it is one colour. */
  assert.ok(!/u-hero h1 em\{/.test(HTML), 'no accent rule on part of the headline');
  assert.ok(!/<em>/.test(d.querySelector('.u-hero h1').innerHTML));
});

test('nothing in the copy refers to a map', () => {
  /* The lede described dots. There are no dots. */
  const hero = d.querySelector('.u-hero').textContent;
  assert.ok(!/\bdot\b|\bdots\b|\bmap\b|\bplot(ted)?\b/i.test(hero), `the hero still describes a map: ${hero}`);
});

test('the size of this list is never presented as a national figure', () => {
  /* PFA publishes 165 units nationwide; this directory publishes 80 with a
     contact attached. What must not creep back is 80 dressed up as the whole
     network. */
  assert.ok(!/\b80\s+units\s+nationwide\b/i.test(HTML));
  assert.ok(!/\b(165|2\.5L|600 districts)\b/.test(d.querySelector('.u-hero').textContent),
    'the hero states what this list is, not what PFA claims nationally');
});

test('the hero starts where every other section hero starts', () => {
  const rule = /\.u-hero\{[^}]*\}/.exec(HTML)[0];
  assert.match(rule, /padding:calc\(var\(--ann\) \+ var\(--nav\) \+ 72px\) var\(--gutter\) 64px/);
  assert.match(rule, /min-height:clamp\(380px,56svh,600px\)/);
  for (const page of ['laws.html', 'newsroom.html', 'get-involved.html']) {
    const other = fs.readFileSync(path.join(ROOT, page), 'utf8');
    assert.match(other, /padding:calc\(var\(--ann\) \+ var\(--nav\) \+ 72px\) var\(--gutter\) 64px/,
      `${page} was the reference for this and has moved`);
  }
});

test('a region filter narrows the list and the count together', () => {
  const { window } = dom;
  const visible = () => [...d.querySelectorAll('.u-unit')].filter((u) => !u.classList.contains('is-out')).length;
  const chip = (r) => [...d.querySelectorAll('.u-chip')].find((c) => c.dataset.r === r);
  const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  click(chip('South'));
  const south = visible();
  assert.equal(south, Number(chip('South').querySelector('i').textContent),
    'the chip promises a number and the list must show it');
  assert.match(d.querySelector('#ucount').textContent, new RegExp(`^${south} of 80 units$`));
  click(chip('all'));
  assert.equal(visible(), 80, 'and All puts everything back');
});

test('search reads the town, the state, the contact and the work', () => {
  const { window } = dom;
  const type = (v) => {
    d.querySelector('#uq').value = v;
    d.querySelector('#uq').dispatchEvent(new window.Event('input', { bubbles: true }));
    return [...d.querySelectorAll('.u-unit:not(.is-out)')].map((u) => u.querySelector('.u-unit__city').textContent);
  };
  assert.deepEqual(type('camel').sort(), ['Mumbai', 'Sirohi'], 'a word from the work finds the units doing it');
  assert.equal(type('rajasthan').length, 11);
  assert.ok(type('gauri').includes('Dehradun'), 'a contact name finds the unit');
  assert.deepEqual(type('zzzz'), []);
  assert.ok(!d.querySelector('#uempty').classList.contains('is-out'), 'and says so rather than showing nothing');
  type('');
});

test('no photograph of a person is used to carry the section', () => {
  /* The brief was explicit: the network is the subject, not its people. The
     only image on the page is the wordmark in the header. */
  const imgs = [...d.querySelectorAll('img')].map((i) => i.getAttribute('src'));
  assert.deepEqual(imgs, ['img/logo.png']);
});

test('the plot of dots is gone, and nothing draws a map', () => {
  /* The hero and the sidebar each carried a scatter of every unit. It read as
     dots rather than as a country and was removed. */
  assert.equal(d.querySelectorAll('.pt').length, 0);
  assert.ok(!/u-atlas|heroAtlas|sideAtlas/.test(HTML), 'the plot machinery must go with it');
  assert.equal(d.querySelectorAll('main svg').length, 1, 'only the search icon remains');
});

test('the source of the data is named in the page', () => {
  assert.match(HTML, /peopleforanimalsindia\.org\/units/,
    'a transcribed directory must say where it was transcribed from');
});

test('the district count is hedged, because it moves', () => {
  /* This read "every one of India's 600 districts", which is what PFA's own
     Set Up A PFA Unit page still says. It was true when it was written: India
     had 593 districts at the 2001 census and 640 at the 2011 one. It is about
     800 now, and the exact figure is disputed even between official sources,
     so the page says about 800 and says it moves.

     A flat number here rots quietly: nobody rereads a paragraph they wrote
     once, and the count changes in both directions. Rajasthan went from 50
     districts to 41 in December 2024. */
  const pages = ['units.html', 'founder.html'];
  for (const page of pages) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const prose = html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<script[\s\S]*?<\/script>/g, ' ');
    assert.doesNotMatch(prose, /\b600 districts\b/, `${page} still carries the old figure`);
    assert.doesNotMatch(prose, /every one of India(&rsquo;|')s \d+ districts/,
      `${page} states a district count as though it were fixed`);
    if (/\bdistricts?\b/i.test(prose) && /\b\d{3}\b/.test(prose)) {
      const near = /(about|around|roughly|nearly|some)\s+[\d,]+\s*(districts)?/i.test(prose)
        || !/\b\d{3}\s*districts\b/i.test(prose);
      assert.ok(near, `${page} gives a district count without hedging it`);
    }
  }
});
