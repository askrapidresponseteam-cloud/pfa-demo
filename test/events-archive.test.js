'use strict';

/* The events archive (owner, 17 Sep 2026): every event PFA has held or
   announced, on a strip of dated cards with real photographs that grows as
   the list does. data/events.json is the only place an event is written;
   scripts/build-events.js puts it into events.html; the page's own script
   decides what depends on today. Held here: the data, the page, the growth,
   and the behaviour in a browser on a given day. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const B = require('../scripts/build-events.js');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const DATA = JSON.parse(read('data/events.json'));

/* A fixed pair of events, so the browser tests do not change meaning as the
   real list grows. */
const PAIR = { events: [
  Object.assign({}, DATA.events.find((e) => e.code === '002') || DATA.events[0], { code: '002', date: '2026-10-04', kind: 'awards' }),
  Object.assign({}, DATA.events.find((e) => e.code === '001') || DATA.events[0], { code: '001', date: '2025-12-20', kind: 'awards' })
] };

function bootAt(todayIso, data = PAIR) {
  const html = B.render(read('events.html'), data);
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://pfa.test/events.html' });
  const w = dom.window;
  const Real = w.Date;
  const fixed = new Real(`${todayIso}T10:30:00`).getTime();
  function Fake(...args) { return args.length ? new Real(...args) : new Real(fixed); }
  Fake.prototype = Real.prototype;
  Fake.now = () => fixed;
  Fake.UTC = Real.UTC;
  Fake.parse = Real.parse;
  w.Date = Fake;
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes('eventsArchive'));
  assert.ok(script, 'the archive script is on the page');
  w.eval(script);
  const d = w.document;
  return { w, d, $: (s) => d.querySelector(s), $$: (s) => [...d.querySelectorAll(s)] };
}

test('the data is valid, and events.html carries exactly what it says', () => {
  assert.deepEqual(B.validate(DATA), []);
  const page = read('events.html');
  assert.equal(B.render(page, DATA), page, 'events.html is out of date: run node scripts/build-events.js');
});

test('the build never looks at today, so its check gives the same answer every day', () => {
  assert.doesNotMatch(read('scripts/build-events.js'), /Date\.now\(|new Date\(\s*\)/);
});

test('cards run newest first, each with its number, date, place and real photographs', () => {
  const doc = new JSDOM(read('events.html')).window.document;
  const cards = [...doc.querySelectorAll('.ev-card')];
  assert.equal(cards.length, DATA.events.length);
  const dates = cards.map((c) => c.getAttribute('data-date'));
  assert.deepEqual(dates, [...dates].sort().reverse(), 'newest first');
  for (const card of cards) {
    const ev = DATA.events.find((e) => e.code === card.getAttribute('data-code'));
    assert.ok(ev, 'every card is an entry in the data');
    assert.equal(card.querySelector('time').getAttribute('datetime'), ev.date);
    assert.ok(card.querySelector('.ev-card__title').textContent.includes(ev.city));
    const shots = [...card.querySelectorAll('.ev-pola')];
    assert.equal(shots.length, ev.photos.length);
    for (const shot of shots) {
      const img = shot.querySelector('img');
      assert.ok(shot.hasAttribute('data-shot'), 'the card is the frame');
      assert.match(img.getAttribute('onerror'), /closest\('\[data-shot\]'\)/, 'a photograph that fails takes its card with it, not an empty box');
      assert.ok(img.getAttribute('alt').trim(), 'every photograph is described');
      assert.ok(shot.querySelector('figcaption').textContent.trim(), 'and captioned');
    }
  }
  const counts = Object.fromEntries([...doc.querySelectorAll('.ev-bar')].map((b) => [b.getAttribute('data-kind'), Number(b.querySelector('.ev-bar__n').textContent)]));
  assert.equal(counts.all, DATA.events.length);
  for (const kind of Object.keys(B.KINDS)) assert.equal(counts[kind], DATA.events.filter((e) => e.kind === kind).length, `the ${kind} bar counts its own`);
  const ld = JSON.parse(doc.querySelector('.ev script[type="application/ld+json"]').textContent);
  assert.equal(ld.itemListElement.length, DATA.events.length);
  for (const { item } of ld.itemListElement) {
    assert.equal(item['@type'], 'Event');
    assert.match(item.startDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(item.location.address.addressLocality);
    assert.ok(item.image.every((u) => /^https:\/\//.test(u)), 'search engines get absolute image addresses');
  }
});

test('every kind can set the request form, so an invitation always lands on a real option', () => {
  const doc = new JSDOM(read('events.html')).window.document;
  const options = [...doc.querySelectorAll('#evKind option')].map((o) => o.value);
  for (const [kind, k] of Object.entries(B.KINDS)) assert.ok(options.includes(k.choice), `${kind} would choose "${k.choice}", which the form does not offer`);
});

test('bad data is refused with the entry and the field, before it can reach the page', () => {
  const good = DATA.events[0];
  const cases = [
    [{ ...good, code: '2' }, /three digits/],
    [{ ...good, date: '2026-02-30' }, /real date/],
    [{ ...good, kind: 'party' }, /kind must be one of/],
    [{ ...good, title: ' ' }, /title is missing/],
    [{ ...good, photos: [] }, /one to three/],
    [{ ...good, photos: [{ src: 'media/events/nowhere.webp', alt: 'x', caption: 'x' }] }, /not on disk/],
    [{ ...good, photos: [{ src: 'https://example.com/a.jpg', alt: 'x', caption: 'x' }] }, /img-src/],
    [{ ...good, photos: [{ ...good.photos[0], caption: 'A caption far too long to write by hand' }] }, /24 characters/],
    [{ ...good, note: 'Mumbai \u2014 at last' }, /em dash/],
    [{ ...good, link: { href: 'nowhere.html', label: 'Go' } }, /not a page on this site/],
    [{ ...good, photos: [{ src: '../secrets.txt', alt: 'x', caption: 'x' }] }, /path on this site/]
  ];
  for (const [ev, why] of cases) {
    const problems = B.validate({ events: [ev] });
    assert.ok(problems.some((p) => why.test(p)), `expected ${why}, got ${JSON.stringify(problems)}`);
    assert.ok(problems.every((p) => /^event 1/.test(p)), 'each problem names the entry');
  }
  assert.ok(B.validate({ events: [good, { ...good }] }).some((p) => /used twice/.test(p)));
});

test('as the list grows, the strip, the tally and the bars keep up, and an empty list still invites', () => {
  const page = read('events.html');
  const base = DATA.events[DATA.events.length - 1];
  const kinds = Object.keys(B.KINDS);
  const events = Array.from({ length: 12 }, (_, i) => ({ ...base, code: String(i + 1).padStart(3, '0'), kind: kinds[i % kinds.length], date: `2027-${String(i + 1).padStart(2, '0')}-10`, title: `Event ${i + 1}`, link: undefined }));
  const doc = new JSDOM(B.render(page, { events })).window.document;
  assert.deepEqual([...doc.querySelectorAll('.ev-card')].map((c) => c.getAttribute('data-code')), ['012', '011', '010', '009', '008', '007', '006', '005', '004', '003', '002', '001']);
  assert.equal(doc.querySelector('.ev-count b').textContent, '12');
  assert.equal(doc.querySelector('.ev-bar[data-kind="adoption"] .ev-bar__n').textContent, '3');
  assert.equal(doc.getElementById('evNextTitle').textContent, 'Event 12', 'without JavaScript, the newest stands beside the form');
  const none = new JSDOM(B.render(page, { events: [] })).window.document;
  assert.equal(none.querySelectorAll('.ev-card').length, 0);
  assert.ok(none.querySelector('.ev-ask') && none.getElementById('evNextTitle'), 'an empty archive is an invitation, not a blank strip');
  assert.equal(none.getElementById('evNow'), null);
});

test('in a browser: the next event, its countdown, and which have been held, all from today', () => {
  const before = bootAt('2026-09-17');
  assert.equal(before.$('#event-002 .ev-state').textContent, 'Coming next');
  assert.equal(before.$('#event-001 .ev-state').textContent, 'Held');
  assert.equal(before.$('#evNow').hidden, false);
  assert.equal(before.$('#evNow .ev-now__count').textContent, 'In 17 days');
  assert.equal(before.$('.ev-next__label').textContent, 'Coming next');
  assert.equal(bootAt('2026-10-03').$('#evNow .ev-now__count').textContent, 'Tomorrow');
  assert.equal(bootAt('2026-10-04').$('#evNow .ev-now__count').textContent, 'Today');
  const after = bootAt('2026-10-05');
  assert.equal(after.$('#event-002 .ev-state').textContent, 'Held');
  assert.equal(after.$('#evNow').hidden, true, 'with nothing announced there is no coming-next bar');
  assert.equal(after.$('.ev-next__label').textContent, 'Most recent');
});

test('in a browser: the soonest event is next even when a later one is announced too', () => {
  const later = { ...PAIR.events[0], code: '003', date: '2027-01-15', title: 'A later event', feature: undefined };
  const p = bootAt('2026-09-17', { events: [later].concat(PAIR.events) });
  assert.equal(p.$('#event-002 .ev-state').textContent, 'Coming next');
  assert.equal(p.$('#event-003 .ev-state').textContent, 'Coming');
  assert.equal(p.$('#evNextTitle').textContent, PAIR.events[0].title, 'the block beside the form moves to the soonest');
  assert.equal(p.$('#evNow .ev-now__title').textContent, PAIR.events[0].title);
});

test('in a browser: a kind bar shows only that kind, and an empty kind asks for one and sets the form', () => {
  const p = bootAt('2026-09-17');
  const bar = (k) => p.$(`.ev-bar[data-kind="${k}"]`);
  bar('adoption').click();
  assert.equal(bar('adoption').getAttribute('aria-pressed'), 'true');
  assert.equal(bar('all').getAttribute('aria-pressed'), 'false');
  assert.ok(p.$$('.ev-card').every((c) => c.hidden));
  assert.equal(p.$('#evEmpty').hidden, false);
  assert.equal(p.$('#evEmpty .ev-empty__title').textContent, 'No adoption drive is on the record yet.');
  assert.equal(p.$('.ev [aria-live]').textContent, 'No adoption drive is on the record yet.');
  const ask = p.$('#evEmpty a[data-ask]');
  assert.equal(ask.textContent, 'Ask for an adoption drive');
  ask.click();
  assert.equal(p.$('#evKind').value, 'An adoption drive', 'the request form is set to what they asked for');
  bar('adoption').click();
  assert.equal(bar('all').getAttribute('aria-pressed'), 'true', 'pressing the same bar again shows every event');
  assert.ok(p.$$('.ev-card').every((c) => !c.hidden));
  assert.equal(p.$('#evEmpty').hidden, true);
  bar('awards').click();
  assert.equal(p.$$('.ev-card').filter((c) => !c.hidden).length, 2);
  assert.equal(p.$('.ev [aria-live]').textContent, '2 of 2 shown: Awards.');
});
