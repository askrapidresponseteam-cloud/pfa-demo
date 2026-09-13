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
  assert.match(html, /var USD = \[10, 25, 50, 100\]/, 'the four presets (500 read as a slipped zero for 50 - one number here if meant)');
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
