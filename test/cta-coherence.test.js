'use strict';

/* A call-to-action band whose heading and buttons disagree.

   get-involved.html closed with a band headed "The Wildlife Gauntlet", with
   the Gauntlet's own kicker and its own description underneath - and three
   buttons reading Become a Patron, Shop and Give. Nothing on it went to the
   Gauntlet. Someone had written a new heading over a generic support block and
   left the buttons behind.

   Nothing catches this: it renders, it validates, every link works, and every
   automated check passes. It is only wrong to a person reading it. So this
   test encodes the one thing a machine can check - if a band announces a
   destination by name, at least one of its buttons has to go there. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

/* The pages a band might name, and the words that name them. Taken from the
   titles the site itself uses in its search index and navigation. */
const DESTINATIONS = [
  { page: 'champion.html', names: ['wildlife gauntlet', 'gauntlet'] },
  { page: 'membership.html', names: ['become a patron', 'patron card'] },
  { page: 'store.html', names: ['the pfa store', 'the store'] },
  { page: 'give.html', names: ['donate to pfa'] },
  { page: 'caretaker.html', names: ['caretaker card', 'caregiver card'] },
  { page: 'adopt.html', names: ['adopt a dog'] },
  { page: 'cinekind.html', names: ['cinekind awards'] },
  { page: 'hub.html', names: ['the circle'] },
  { page: 'abc-rules.html', names: ['the abc rules'] },
  { page: 'network.html', names: ['find a unit', 'find a centre'] }
];

function textOf(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function bands(html) {
  const out = [];
  const rx = /<section class="blue-band">([\s\S]*?)<\/section>/g;
  let m;
  while ((m = rx.exec(html))) out.push(m[1]);
  return out;
}

test('a call-to-action band links to whatever its heading names', () => {
  const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
  const faults = [];
  let bandsChecked = 0;

  for (const page of pages) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    for (const band of bands(html)) {
      const buttons = [...band.matchAll(/<a class="btn[^"]*" href="([^"#?]+)[^"]*"/g)].map((m) => m[1]);
      if (!buttons.length) continue;
      bandsChecked += 1;

      const headingMatch = /<h2>([\s\S]*?)<\/h2>/.exec(band);
      if (!headingMatch) continue;
      const heading = textOf(headingMatch[1]);

      for (const dest of DESTINATIONS) {
        const named = dest.names.some((name) => heading.includes(name));
        if (!named) continue;
        if (!buttons.includes(dest.page)) {
          faults.push(`${page}: a band headed "${heading}" has no button to ${dest.page} `
            + `(its buttons go to ${buttons.join(', ')})`);
        }
      }
    }
  }

  assert.ok(bandsChecked >= 2, `expected to find some CTA bands, found ${bandsChecked}`);
  assert.deepEqual(faults, [], '\n  ' + faults.join('\n  '));
});

test('the Get Involved band still points at the Gauntlet', () => {
  /* The specific fault, pinned, so a future edit of this page has to notice. */
  const html = fs.readFileSync(path.join(ROOT, 'get-involved.html'), 'utf8');
  const band = bands(html).find((b) => textOf(b).includes('wildlife gauntlet'));
  assert.ok(band, 'the Gauntlet band is gone from Get Involved');
  assert.ok(band.includes('href="champion.html"'), 'the Gauntlet band must link to the Gauntlet');
  assert.ok(!/href="store\.html"/.test(band), 'a Gauntlet band should not be selling anything');
});

test('a button offering to train sends you somewhere that trains you for it', () => {
  /* The Gauntlet hero offered "Train first" next to "Enter the Gauntlet", and
     it went to the Learning Centre. The Gauntlet asks about wild cat taxonomy,
     national parks and high-altitude ranges; the Learning Centre teaches road
     trauma, recognising pain in cats, filing an FIR, feeding in shared spaces
     and transporting an injured animal. Nothing there prepares anyone for
     anything the quiz asks, so the button was a promise the site could not
     keep - and worse than a dead link, because it looked like it worked.

     There is no wildlife syllabus to point at, so the second action now goes
     to the rules on the page, which is a thing that genuinely exists. */
  const champion = fs.readFileSync(path.join(ROOT, 'champion.html'), 'utf8');
  const hero = /<div class="hero-actions">([\s\S]*?)<\/div>/.exec(champion);
  assert.ok(hero, 'the Gauntlet hero has no actions');

  assert.ok(!/learning-center\.html/.test(hero[1]),
    'the Gauntlet hero points at the Learning Centre, which carries no wildlife material');
  assert.ok(!/Train first/i.test(champion),
    'nothing on the site trains anyone for the Gauntlet, so nothing should offer to');

  /* Whatever the second action is, it has to lead somewhere real. */
  const targets = [...hero[1].matchAll(/href="#([a-zA-Z0-9_-]+)"/g)].map((m) => m[1]);
  assert.ok(targets.length, 'the hero should offer an on-page action');
  for (const id of targets) {
    assert.ok(new RegExp(`id="${id}"`).test(champion),
      `the hero links to #${id}, which does not exist on the page`);
  }
});
