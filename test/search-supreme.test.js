'use strict';

/* Site search, as people actually use it (owner, 8 Oct 2026: "ensure the
   PFA search is truly supreme").

   Every line below is a query a visitor types, in their own words, and the
   page that should come first or near the top. They were written by
   running each one against the shipped index and fixing what came back
   wrong: "make a gift" opened a thank-you pane, "kutta" was corrected to
   "dutta" and landed on a unit whose head is called Dutta, "units in delhi"
   offered a 1998 policy, "animal hospital" promised hospitals PFA does not
   run, "cat" listed cattle, and "news" matched every unit on a New C G Road.
   If a change to the engine or the index breaks one of these, it broke
   something a person will type tomorrow. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createDocument } = require('./_dom-shim.js');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function engine() {
  const indexJson = read('search-index.json');
  const doc = createDocument('<html><body></body></html>');
  const win = {
    document: doc,
    location: { search: '', hash: '', pathname: '/index.html', href: 'https://x/', protocol: 'https:' },
    navigator: {}, history: { replaceState() {}, pushState() {} },
    sessionStorage: { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } },
    localStorage: null,
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener() {}, removeEventListener() {},
    setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: () => 1,
    console, JSON, Math, Date, Number, String, Boolean, Array, Object, RegExp, Error,
    parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent,
    Promise, Map, Set, URL, URLSearchParams,
    fetch: (u) => Promise.resolve({ ok: String(u) === 'search-index.json', json: () => Promise.resolve(JSON.parse(indexJson)) })
  };
  win.window = win; win.self = win; win.globalThis = win; doc.defaultView = win;
  vm.runInContext(read('pfa-search.js'), vm.createContext(win), { filename: 'pfa-search.js' });
  return new Promise((resolve) => setImmediate(() => setImmediate(() => resolve(win.PFASearch))));
}

let S;
test.before(async () => { S = await engine(); });
const top = (q, n = 1) => S.search(q, { limit: n }).rows.slice(0, n);
const titles = (q, n = 3) => top(q, n).map((r) => r.t);

test('the first result is the answer to what people type', () => {
  const expect = [
    ['make a gift', 'Give as a gift'],
    ['gift certificate', 'Give as a gift'],
    ["gift in someone's name", 'Give as a gift'],
    ['tribute donation', 'Give as a gift'],
    ['in memory of my dog', 'Give as a gift'],
    ['birthday gift', 'Give as a gift'],
    ['80g receipt', 'Your 80G tax receipt'],
    ['tax exemption', 'Your 80G tax receipt'],
    ['donate', 'Donate'],
    ['donnate', 'Donate'],
    ['daan', 'Donate'],
    ['someone is beating a dog', 'Report cruelty'],
    ['shikayat', 'Report cruelty'],
    ['vet near me', 'Find a unit near you'],
    ['animal hospital', 'Find a unit near you'],
    ['janwar ki madad', 'Find a unit near you'],
    ['phone number', 'Contact People for Animals'],
    ['contact', 'Contact People for Animals'],
    ['news', 'Newsroom'],
    ['press release', 'Newsroom'],
    ['membership', 'Become a member'],
    ['memebership', 'Become a member'],
    ['voluntere', 'Volunteer'],
    ['internship', 'Careers: five openings'],   /* a real opening since 9 Oct 2026 */
    ['adopt a dog', 'Events near you'],
    ['what to do if I find a puppy', 'Found a puppy or kitten on its own'],
    ['saanp ne kaata', 'Snakebite: first aid and antivenom'],
    ['pagal kutta', 'Dog bite: rabies prophylaxis for the person bitten'],
    ['dog bite', 'Dog bite: rabies prophylaxis for the person bitten'],
    ['kanoon', 'Animal laws in India'],
    ['track my report', 'Track a submission or an order'],
    ['maneka gandhi', 'Founder: Maneka Sanjay Gandhi'],
    ['dog barking complaint', 'Can a housing society fine me for my dog barking?'],
    ['cow on road', 'Is it legal to abandon unproductive cattle on the road?'],
    ['horse wedding', 'Can horses be used for weddings and processions?'],
    ['jaipur', 'PFA Jaipur unit'],
    ['bombay', 'PFA Mumbai unit'],
    ['gurugram', 'PFA Gurgaon / Sadhana unit'],
    ['bhubaneswar', 'PFA Bhubaneshwar unit'],
    ['mysuru', 'PFA Mysore unit'],
    ['indira amma', 'PFA Guwahati unit']
  ];
  const missed = expect.filter(([q, want]) => titles(q, 1)[0] !== want)
    .map(([q, want]) => `${q} -> ${titles(q, 3).join(' | ') || '(nothing)'} (wanted ${want})`);
  assert.deepEqual(missed, [], 'queries whose first result was wrong:\n  ' + missed.join('\n  '));
});

test('an animal in trouble: someone to call and first aid, together at the top', () => {
  for (const q of ['injured dog on road', 'ghayal kutta', 'ambulance', 'injured dog']) {
    const t = titles(q, 2);
    assert.ok(t.includes('Find a unit near you'), `${q}: ${t.join(' | ')}`);
    assert.ok(t.includes('First aid for an injured animal'), `${q}: ${t.join(' | ')}`);
  }
});

test('Hindi and Hinglish words mean what they mean, and are never "corrected"', () => {
  for (const [q, like] of [['kutta', /dog/i], ['billi', /cat/i], ['gaay', /cow|cattle/i], ['gau raksha', /cow|cattle/i], ['ghoda', /horse/i]]) {
    const res = S.search(q, { limit: 3 });
    assert.equal(res.corrected, null, `${q} was "corrected" to ${res.corrected}`);
    assert.match(res.rows[0].t, like, `${q} -> ${res.rows[0].t}`);
    assert.ok(!/^PFA .* unit$/.test(res.rows[0].t), `${q} landed on a unit: ${res.rows[0].t}`);
  }
});

test('real words are not "corrected" into other words', () => {
  for (const q of ['parrot sale', 'tribute', 'press release', 'fur', 'kutta']) {
    const fixed = S.search(q, { limit: 3 }).corrected;
    assert.ok(!fixed || !/narrow|tribe|lease|four|dutta/.test(fixed), `${q} -> did you mean ${fixed}`);
  }
  assert.equal(S.search('donnate').corrected, 'donate', 'a real typo still is');
  assert.equal(S.search('crulety').corrected, 'cruelty');
});

test('a big town with no unit of its own is answered with the nearest units, and how far', () => {
  const cases = [['units in delhi', 'Delhi', /Ghaziabad|Faridabad|Gurgaon/], ['vet in delhi', 'Delhi', /Ghaziabad|Faridabad|Gurgaon/],
    ['noida', 'Noida', /Ghaziabad/], ['chennai', 'Chennai', /Tambaram/], ['kolkata', 'Kolkata', /Hooghly/], ['calcutta', 'Calcutta', /Hooghly/],
    ['hyderabad', 'Hyderabad', /Secunderabad/], ['pune', 'Pune', /Panchgani|Ahmednagar|Mumbai/], ['dog hospital chennai', 'Chennai', /Tambaram/]];
  for (const [q, town, unit] of cases) {
    const first = top(q, 1)[0];
    assert.ok(first && /^PFA .* unit$/.test(first.t), `${q} -> ${first && first.t}`);
    assert.match(first.t, unit, q);
    assert.match(first.d, new RegExp(`^(About \\d+ km|Under 10 km) from ${town}\\. `), `${q}: ${first.d}`);
    assert.match(first.u, /^units\.html\?q=/, 'and it opens the unit');
  }
  /* a town that has a unit is answered by that unit, with no distance */
  const mumbai = top('mumbai', 1)[0];
  assert.equal(mumbai.t, 'PFA Mumbai unit');
  assert.ok(!/km from/.test(mumbai.d));
  /* and a question that only mentions a town is not hijacked */
  assert.ok(!/^PFA .* unit$/.test(top('delhi community dog guidelines', 1)[0].t));
});

test('a whole word is not the start of a different one: cat is not cattle, news is not new', () => {
  assert.ok(titles('cat', 6).every((t) => !/^cattle/i.test(t)), titles('cat', 6).join(' | '));
  assert.ok(titles('news', 4).every((t) => !/unit$/.test(t)), titles('news', 4).join(' | '));
  /* while a word still being typed does find its longer form */
  assert.equal(titles('colony careg', 1)[0], 'Apply for a colony caregiver card');
});

test('a strong answer is not followed by stray word matches', () => {
  assert.equal(titles('gift certificate', 4)[0], 'Give as a gift');
  assert.ok(!titles('press release', 5).includes('Her, in motion.'), titles('press release', 5).join(' | '));
  assert.ok(!titles('join pfa', 5).some((t) => /donkey/i.test(t)), titles('join pfa', 5).join(' | '));
});

test('nothing in search promises a hospital, an ambulance or a rescue team', () => {
  const src = read('pfa-search.js');
  const curated = src.slice(src.indexOf('var CURATED = ['), src.indexOf('var SECTIONS'));
  const shown = [...curated.matchAll(/\b[td]: '((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]);
  const bad = shown.filter((x) => /hospitals?\b|ambulance|rescue team|mobile clinic/i.test(x));
  assert.deepEqual(bad, [], 'curated titles and descriptions must not describe services PFA does not run');
  assert.ok(!/placeholder="[^"]*hospital/i.test(src + read('search.html')), 'nor the search box placeholder');
});

test('every best bet for a crawled row names a row the index ships', () => {
  const src = read('pfa-search.js');
  const block = src.slice(src.indexOf('var BEST_BETS = {'), src.indexOf('};', src.indexOf('var BEST_BETS = {')));
  const keys = [...block.matchAll(/'([a-z-]+\.html#[^']+)':/g)].map((m) => m[1]);
  assert.ok(keys.length >= 10, 'the best bets still parse');
  const urls = new Set(JSON.parse(read('search-index.json')).rows.map((r) => r.u));
  const missing = keys.filter((k) => !urls.has(k));
  assert.deepEqual(missing, [], 'best bets for rows the index does not have: ' + missing.join(', '));
});

test('no town in the distance list has a unit of its own', () => {
  const src = read('pfa-search.js');
  const block = src.slice(src.indexOf('var PLACES = {'), src.indexOf('};', src.indexOf('var PLACES = {')));
  const towns = [...block.matchAll(/'([a-z ]+)':\s*\[/g)].map((m) => m[1]);
  assert.ok(towns.length > 50);
  const unitWords = new Set();
  for (const r of JSON.parse(read('search-index.json')).rows.filter((x) => x.g)) {
    unitWords.add(r.t.replace(/^PFA | unit$/g, '').toLowerCase());
  }
  const shadowed = towns.filter((t) => unitWords.has(t));
  assert.deepEqual(shadowed, [], 'these towns have a unit; take them out of PLACES: ' + shadowed.join(', '));
});

test('the index reads as text: no entities, no code, no dashes, no hidden or post-payment panes', () => {
  const rows = JSON.parse(read('search-index.json')).rows;
  const raw = rows.filter((r) => /&#?[a-z0-9]+;/i.test(r.t + r.d)).map((r) => r.u);
  assert.deepEqual(raw, [], 'rows with undecoded entities');
  const code = rows.filter((r) => /' \+ |\+ '|esc\(/.test(r.t + r.d + (r.k || ''))).map((r) => r.u);
  assert.deepEqual(code, [], 'rows carrying script source');
  const dashes = rows.filter((r) => /[\u2013\u2014]/.test(r.t + r.d + (r.k || '') + (r.a || ''))).map((r) => r.u);
  assert.deepEqual(dashes, [], 'rows with en or em dashes');
  const flow = [];
  for (const r of rows) {
    const [address, anchor] = r.u.split('#');
    if (!anchor) continue;
    const tag = new RegExp(`<[a-z0-9]+[^>]*\\sid="${anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`, 'i').exec(read(address.split('?')[0]));
    if (tag && (/\shidden(\s|>|=)/.test(tag[0]) || /class="[^"]*\b(err|error|empty|done)\b/.test(tag[0]) || /^<(input|select|textarea|button|label)\b/i.test(tag[0]))) flow.push(r.u);
  }
  assert.deepEqual(flow, [], 'rows that open on an error line, a control, or a pane that only shows after paying');
  assert.ok(!rows.some((r) => /Your gift is in/.test(r.t)), 'the thank-you pane is not a search result');
});

test('Enter opens the top result only when it is a real match, not a guess', () => {
  const src = read('pfa-search.js');
  assert.match(src, /res\.via === 'closest'\) \{[\s\S]{0,200}mode = 'closest';/, 'a closest-guess list is not marked as results');
  assert.match(src, /list\.dataset\.mode === 'results' \? list\.children\[0\]/, 'Enter auto-opens only in results mode');
  assert.equal(S.search('xqzvwt plork').via, 'closest');
});
