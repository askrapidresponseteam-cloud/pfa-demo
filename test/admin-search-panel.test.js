'use strict';

/* The panel's one search box (owner, 8 Oct 2026: "there needs to be a
   univeral/global search bar to search anything and everything"), as it
   runs: the real admin.html script in jsdom, signed in through a stubbed
   fetch. The box is on every section; "/" and Ctrl+K reach it; the server's
   answers are grouped; the panel's own sections and the public site's pages
   are matched at once; arrows and Enter choose; each kind of result opens
   where it lives; a staff account is never offered a section it cannot open. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');

/* ---- the panel, running ------------------------------------------------- */

const windows = [];
test.after(() => windows.forEach((w) => { try { w.close(); } catch (_) { /* gone */ } }));

const settle = async (rounds = 40) => {
  for (let i = 0; i < rounds; i += 1) await new Promise((r) => setImmediate(r));
};

/* `answers(url, method, body)` returns { status, body } or a body (200), or
   undefined for the default. Every /api call is kept in `calls`. */
async function panel(answers, who) {
  const calls = [];
  const problems = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => problems.push(String(e && e.message)));
  const admin = who || { uid: 'u1', email: 'karthik@pfa.test', name: 'Karthik', role: 'super', modules: [] };
  const defaults = (url) => {
    if (url.includes('type=session')) return { ok: true, admin };
    if (url.includes('/api/admin/metrics')) return { ok: true, cards: { submissionsWaiting: 0 }, byKind: {} };
    if (url.includes('/api/admin/mail-check')) return { ok: true, state: 'ok', configured: true, via: 'smtp', from: 'People for Animals <info@peopleforanimalsindia.org>', inboxes: ['gandhim@exmpls.sansad.in'], recent: [], missed: [], failing: [], sentCopies: { on: false } };
    if (url.includes('/api/inbound-mail')) return { ok: true, configured: false };
    if (url.includes('/api/admin/staff')) return { ok: true, staff: [] };
    if (url.includes('/api/admin/payments-pending')) return { ok: true, days: 14, olderThanMinutes: 30, statusCheck: { inr: true, usd: true }, pending: [], photoPending: [] };
    return { ok: true, rows: [] };
  };
  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously', url: 'https://pfa.test/admin.html', virtualConsole: vc,
    beforeParse(w) {
      w.confirm = () => true;
      w.fetch = (url, opts) => {
        const u = String(url);
        const method = (opts && opts.method) || 'GET';
        const reply = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
        if (/identitytoolkit|securetoken/.test(u)) {
          return reply(200, { idToken: 'id-token', refreshToken: 'refresh', expiresIn: '3600', id_token: 'id-token', refresh_token: 'refresh', expires_in: '3600' });
        }
        const body = opts && opts.body ? JSON.parse(opts.body) : null;
        calls.push({ url: u, method, body });
        let out = answers ? answers(u, method, body) : undefined;
        if (out === undefined) out = defaults(u);
        if (out && out.status && out.body) return reply(out.status, out.body);
        return reply(200, out);
      };
    }
  });
  const w = dom.window;
  windows.push(w);
  const $ = (s) => w.document.querySelector(s);
  $('#who').value = admin.email;
  $('#pass').value = 'secret';
  $('#signinGo').click();
  await settle();
  assert.equal($('#app').hidden, false, `the panel opened (${$('#signinSay').textContent})`);
  const open = async (reference) => {
    w.document.body.insertAdjacentHTML('beforeend', `<button type="button" data-open-case="${reference}">open</button>`);
    w.document.querySelector(`[data-open-case="${reference}"]:last-of-type`).click();
    await settle();
  };
  const tab = async (name) => { $(`.tab[data-tab="${name}"]`).click(); await settle(); };
  const text = (s) => ($(s) ? $(s).textContent.replace(/\s+/g, ' ').trim() : '');
  return { w, $, calls, problems, open, tab, text };
}


const SERVER = {
  ok: true, results: [
    { type: 'case', id: 'PFA-C-2026-00007', title: 'PFA-C-2026-00007', line: 'Cruelty report from Asha Rao', status: 'Waiting', at: Date.parse('2026-10-07T05:00:00Z') },
    { type: 'payment', id: 'PFA-DON-AB12CD34', title: 'PFA-DON-AB12CD34', line: 'Donation, \u20b92,500, Asha Rao', status: 'Paid', at: Date.parse('2026-10-05T05:00:00Z') },
    { type: 'card', id: 'PFA-CCT-4K2M8QRT', title: 'PFA-CCT-4K2M8QRT', line: 'Colony caregiver card, Asha Rao', status: 'Issued', at: 0 }
  ], more: false
};
const SITE = { ok: true, pages: [{ id: 'laws', file: 'laws.html', title: 'Animal laws', group: 'Learn', menu: 'Laws', modules: [{ id: 'part-a', key: 'laws#part-a', label: 'Dogs' }] }], groups: [], state: { hidden: { pages: {}, modules: { 'laws#part-a': true } } } };

function answers(url) {
  if (url.includes('/api/admin/search')) return SERVER;
  if (url.includes('/api/admin/site')) return SITE;
  if (url.includes('/api/admin/case?')) return { ok: true, case: { reference: 'PFA-C-2026-00007', kind: 'PFA-C', kindLabel: 'Cruelty report', status: 'new', statusLabel: 'Waiting', fields: {}, labels: {}, history: [], messages: [], moves: [], closes: [], mailProblems: [], contact: {} } };
  return undefined;
}

async function type(p, q) {
  p.$('#gq').value = q;
  p.$('#gq').dispatchEvent(new p.w.Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 260));
  await settle();
}
const key = (p, k, extra) => p.$('#gq').dispatchEvent(new p.w.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true }, extra || {})));

test('the box is on every section, and "/" or Ctrl+K reaches it', async () => {
  const p = await panel(answers);
  assert.ok(p.$('.bar #gq'), 'in the bar every section shares');
  p.w.document.body.dispatchEvent(new p.w.KeyboardEvent('keydown', { key: '/', bubbles: true }));
  assert.equal(p.w.document.activeElement, p.$('#gq'));
  p.$('#gq').blur();
  p.w.document.body.dispatchEvent(new p.w.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
  assert.equal(p.w.document.activeElement, p.$('#gq'));
});

test('typing asks the server once it pauses, and the answers come grouped', async () => {
  const p = await panel(answers);
  await type(p, 'asha');
  const asked = p.calls.filter((c) => c.url.includes('/api/admin/search'));
  assert.equal(asked.length, 1);
  assert.match(asked[0].url, /q=asha/);
  const heads = [...p.w.document.querySelectorAll('#gres h4')].map((h) => h.textContent);
  assert.deepEqual(heads.slice(0, 3), ['Cases', 'Payments', 'Colony cards']);
  assert.match(p.text('#gres'), /Cruelty report from Asha Rao/);
  assert.equal(p.$('#gq').getAttribute('aria-expanded'), 'true');
});

test('the panel\'s own sections and the site\'s pages are matched at once', async () => {
  const p = await panel(answers);
  await type(p, 'csv');
  assert.match(p.text('#gres'), /Download payments as CSV/);
  await type(p, 'dogs');
  assert.match(p.text('#gres'), /Website: pages and sections/);
  assert.match(p.text('#gres'), /Dogs.*Section of Laws.*Hidden/);
  await type(p, 'gandhim');
  assert.match(p.text('#gres'), /Copies to PFA.s inbox/, 'the mail section by what it is about');
});

test('Enter opens the first result; arrows choose another', async () => {
  const p = await panel(answers);
  await type(p, 'asha');
  key(p, 'Enter');
  await settle();
  assert.ok(p.calls.some((c) => c.url.includes('/api/admin/case?reference=PFA-C-2026-00007')), 'the case drawer opened');
  assert.equal(p.$('#gres').hidden, true);

  await type(p, 'asha');
  key(p, 'ArrowDown'); key(p, 'ArrowDown');
  assert.equal(p.$('#gr1').getAttribute('aria-selected'), 'true');
  key(p, 'Enter');
  await settle();
  assert.equal(p.$('#paneTitle').textContent, 'Payments & donations', 'a payment opens the payments');
  assert.equal(p.$('#payQ').value, 'PFA-DON-AB12CD34');
  assert.ok(p.calls.some((c) => /type=payments.*q=PFA-DON-AB12CD34/.test(c.url)), 'filtered to it');
});

test('a card opens the cards, a website section its toggle', async () => {
  const p = await panel(answers);
  await type(p, 'asha');
  p.$('#gr2').click();
  await settle();
  assert.equal(p.$('#cgQ').value, 'PFA-CCT-4K2M8QRT');
  await type(p, 'dogs');
  const row = [...p.w.document.querySelectorAll('#gres .gr')].find((b) => /Dogs/.test(b.textContent));
  row.click();
  await new Promise((r) => setTimeout(r, 300));
  await settle();
  assert.equal(p.$('#paneTitle').textContent, 'Website');
});

test('Escape closes, and a staff account is not offered what it cannot open', async () => {
  const staff = { uid: 'u2', email: 'desk@pfa.test', name: 'Desk', role: 'staff', modules: ['overview', 'submissions'] };
  const p = await panel(answers, staff);
  await type(p, 'csv');
  assert.doesNotMatch(p.text('#gres'), /Download payments as CSV/, 'no Payments for this account');
  await type(p, 'dogs');
  assert.ok(!p.calls.some((c) => c.url.includes('/api/admin/site')), 'the site\'s list is not even asked for');
  key(p, 'Escape');
  assert.equal(p.$('#gres').hidden, true);
  assert.deepEqual(p.problems, []);
});
