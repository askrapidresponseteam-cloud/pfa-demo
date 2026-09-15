'use strict';
/* Dollar gifts on the donate page: a currency seg in the give flow's first
   step, four presets and a typed amount, and one PayPal link as the whole
   gateway - paypal.me/Peopleforanimals with the amount in the path. The
   rupee flow must stand exactly as it was: same panes, same form, same
   CCAvenue post; dollars only step in front of it, never into it. */
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const html = fs.readFileSync(path.join(__dirname, '..', 'donate.html'), 'utf8');

test('dollars are offered beside rupees and route to PayPal, amount in the path', () => {
  assert.match(html, /id="giveCur"[^>]*>.*data-gcur="INR" aria-pressed="true"/, 'rupees are the default');
  /* The list became a table when each figure gained the sentence of what it
     buys, so the figures are read out of it rather than matched as a line. */
  assert.match(html, /var USD = \[[\s\S]*?\[\s*10,[\s\S]*?\[\s*25,[\s\S]*?\[\s*50,[\s\S]*?\[\s*100,[\s\S]*?\];/,
    'the four presets (500 read as a slipped zero for 50 - one number here if meant)');
  assert.match(html, /https:\/\/www\.paypal\.com\/paypalme\/Peopleforanimals/, 'the PayPal handle, exactly');
  assert.match(html, /go\.href = BASE \+ '\/' \+ n \+ 'USD'/, 'the amount rides in the paypal.me path');
  assert.match(html, /id="usdGo"[^>]*target="_blank" rel="noopener"/, 'PayPal opens beside the page, not over it');
});

test('the rupee flow is untouched by the dollar panel', () => {
  assert.match(html, /action="\/api\/payment\/create"/, 'the CCAvenue post stands');
  assert.match(html, /id="next1"/, 'step one still continues to details');
  assert.match(html, /#p1\.usd > :not\(#giveCur\):not\(#usdPane\)\{display:none\}/,
    'dollars hide the rupee flow as one thing rather than editing it');
});

test('no one-option controls: the frequency seg hides whole until monthly is real', () => {
  /* The payment API has no recurring path, so monthly is removed at boot -
     which left "Give once" as a segmented control with one segment, always
     pressed, a full row restating the default (reported 2 Sep 2026). The
     row hides entirely instead; the two-button markup stays for the day the
     mandate path exists. */
  assert.match(html, /data-freq="once"[\s\S]{0,120}data-freq="monthly"/, 'both buttons still in the markup for that day');
  assert.match(html, /monthlyBtn\.remove\(\);/, 'monthly still leaves the DOM, as page-boot requires');
  assert.match(html, /seg\.hidden = true;/, 'and the one-segment row waits out of sight with it');
  assert.ok(!/seg--single/.test(html), 'and the one-segment styling is gone with it');
});

test('every dollar preset says what it buys, as every rupee preset does', () => {
  /* Dollars were four bare figures. The rupee cards each carry a line under
     the number saying what it funds, and that line is most of the reason a
     donor picks one card over another. */
  const list = /var USD = \[([\s\S]*?)\];/.exec(html);
  assert.ok(list, 'the dollar presets are still a table in the page');
  const rows = [...list[1].matchAll(/\[\s*(\d+),\s*'([^']+)'\s*\]/g)];
  assert.deepEqual(rows.map((r) => Number(r[1])), [10, 25, 50, 100], 'the four presets, unchanged');
  for (const [, figure, says] of rows) {
    assert.ok(says.length > 12, `$${figure} has no sentence`);
  }
  assert.match(html, /data-usd="[^"]*'[\s\S]{0,120}<small>/,
    'the sentence is painted under the figure, in the same <small> the rupee cards use');
});

test('a dollar amount is costed under the market, never over it', () => {
  /* The sentences are priced off the rupee figures at the top of the page.
     A rate set above the market would have every one of them claiming more
     than the gift buys, which is the one direction this page may not err in.
     The rate has not been under 85 in a year. */
  const rate = /var RATE = (\d+);/.exec(html);
  assert.ok(rate, 'the conversion is a named constant, not scattered arithmetic');
  assert.ok(Number(rate[1]) <= 85, `costing a dollar at ${rate[1]} rupees flatters the gift`);
});

test('the panel on the left follows the dollars, then gives the rupee line back', () => {
  /* $25 was captioned "rabies shots for five street dogs": whatever the last
     rupee amount had been, left standing while a different currency was on
     screen. The dollar panel writes that sentence now, and puts back what it
     found when the donor switches away. */
  assert.match(html, /impact\.textContent = line\(n\)/, 'dollars write the panel');
  assert.match(html, /held = impact\.textContent/, 'the rupee sentence is kept');
  assert.match(html, /impact\.textContent = held/, 'and handed back');
});

test('other amount opens the field, using the class the stylesheet answers to', () => {
  /* It read classList.toggle('open', ...) while the CSS is written against
     .other.is-open, so the typed field stayed shut, the presets let go of the
     amount, and the button fell back to a PayPal link with no figure on it. */
  assert.match(html, /\.other\.is-open \.other__in\{display:flex\}/, 'the stylesheet is unchanged');
  const usd = html.slice(html.indexOf('var USD = ['));
  assert.match(usd, /wrap\.classList\.toggle\('is-open', custom\)/);
  assert.ok(!/classList\.toggle\('open'/.test(html), 'nothing still toggles a class no rule matches');
});

test('the chosen card can be read: its caption is not ink on ink', () => {
  /* Selecting an amount turns the card black. The caption stayed at
     rgba(17,17,17,.7), so the one card a donor had actually decided on was
     the one card that would not say what it bought. Same fault as the
     membership tiers in v1.339, in a second place. */
  const rule = /\.amts button\[aria-pressed="true"\] small\{color:([^}]+)\}/.exec(html);
  assert.ok(rule, 'the selected caption still has a rule of its own');
  assert.match(rule[1], /^rgba\(255,255,255/, `selected caption is ${rule[1]} on #111`);
});
