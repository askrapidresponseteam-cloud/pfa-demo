/* ===========================================================
   EXTRACT - admin.html
   admin panel: Firebase auth + every admin screen

   8 inline <script> block(s), in document order.
   READ-ONLY REFERENCE COPY. The live code is inside
   admin.html in the UI/content zip. Edit it THERE; this file
   is a snapshot for reading and review only.
   =========================================================== */

/* ---- block 1 of 8 ---- */
/* Runs before the panel script so a missing config is explained rather than
   failing later. Sign-in no longer loads anything from a CDN, so there is no
   library to wait for; the guard below watches the panel script itself. */
(function () {
  'use strict';
  var msg = document.getElementById('signInMsg');
  var button = document.getElementById('adminSignIn');
  if (!window.PFA_FIREBASE_API_KEY || String(window.PFA_FIREBASE_PROJECT_ID).indexOf('REPLACE') === 0) {
    msg.textContent = 'assets/firebase-config.js has not been filled in yet. Firebase console \u2192 Project settings \u2192 Your apps \u2192 Web app.';
    msg.classList.add('is-error');
    button.disabled = true;
  }
}());

/* ---- block 2 of 8 ---- */
/* If the panel script fails for any reason, say so on the page instead of
   leaving a dead button. Cleared once the script below has wired up. */
(function () {
  var msg = document.getElementById('signInMsg');
  function show(text) { if (!msg || window.__pfaAdminReady) return; msg.textContent = text; msg.classList.add('is-error'); }
  window.addEventListener('error', function (e) {
    var el = e && e.target;
    var isScript = el && el.tagName === 'SCRIPT';
    if (el && el !== window && !isScript) return; // fonts/images failing are not fatal
    var src = (e && (e.filename || (isScript && el.src))) || '';
    show('The admin page could not start: ' + ((e && e.message) || 'a script failed to load') + (src ? ' (' + src + ')' : '') + '.');
  }, true);
  window.addEventListener('unhandledrejection', function (e) { show('The admin page could not start: ' + (e && e.reason && (e.reason.message || e.reason)) + '.'); });
  setTimeout(function () { if (!window.__pfaAdminReady) show('The sign-in script did not start. Reload the page; if it keeps happening, report it.'); }, 8000);
}());

/* ---- block 3 of 8 ---- */
/* The panel talks to /api/admin/* with a Firebase ID token. The token carries
   an `admin: true` claim, which is the same claim firestore.rules checks, so
   the panel and the database agree about who is an administrator.

   Sign-in talks to Google's Identity Toolkit REST API directly rather than
   loading the Firebase JS SDK from www.gstatic.com. Same accounts, same ID
   tokens (the server still verifies them with the admin SDK) - but nothing
   can leave the page inert because a CDN module failed to load, and it does
   not depend on the OAuth "authorised domains" list. The session (id token +
   refresh token) is kept in sessionStorage, so closing the tab signs out. */
const API_KEY = window.PFA_FIREBASE_API_KEY;
const IDENTITY = 'https://identitytoolkit.googleapis.com/v1/accounts:';
const SECURETOKEN = 'https://securetoken.googleapis.com/v1/token?key=' + encodeURIComponent(API_KEY);
const SESSION_KEY = 'pfa_admin_session_v1';

const auth = {
  currentUser: null,
  _listener: null,
  _read() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch (error) { return null; }
  },
  _write(session) {
    try {
      if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch (error) {}
  },
  _user(session) {
    if (!session) return null;
    return {
      email: session.email,
      uid: session.uid,
      getIdToken: async () => auth._freshToken(session)
    };
  },
  async _freshToken(session) {
    if (Date.now() < session.expiresAt - 60000) return session.idToken;
    const response = await fetch(SECURETOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(session.refreshToken)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.id_token) throw new Error('Your session expired. Sign in again.');
    session.idToken = data.id_token;
    session.refreshToken = data.refresh_token || session.refreshToken;
    session.expiresAt = Date.now() + (Number(data.expires_in) || 3600) * 1000;
    auth._write(session);
    auth.currentUser = auth._user(session);
    return session.idToken;
  },
  _emit() { if (auth._listener) auth._listener(auth.currentUser); }
};

function onAuthStateChanged(_auth, listener) {
  auth._listener = listener;
  const session = auth._read();
  auth.currentUser = auth._user(session);
  setTimeout(() => listener(auth.currentUser), 0);
}

async function signInWithEmailAndPassword(_auth, email, password) {
  if (!API_KEY) { const e = new Error('config'); e.code = 'auth/invalid-api-key'; throw e; }
  let response;
  try {
    response = await fetch(IDENTITY + 'signInWithPassword?key=' + encodeURIComponent(API_KEY), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    });
  } catch (networkError) {
    const e = new Error('network'); e.code = 'auth/network-request-failed'; throw e;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = String((data.error && data.error.message) || 'UNKNOWN');
    const e = new Error(reason);
    e.code = {
      EMAIL_NOT_FOUND: 'auth/user-not-found',
      INVALID_PASSWORD: 'auth/wrong-password',
      INVALID_LOGIN_CREDENTIALS: 'auth/invalid-credential',
      INVALID_EMAIL: 'auth/invalid-email',
      USER_DISABLED: 'auth/user-disabled',
      TOO_MANY_ATTEMPTS_TRY_LATER: 'auth/too-many-requests',
      OPERATION_NOT_ALLOWED: 'auth/operation-not-allowed',
      PASSWORD_LOGIN_DISABLED: 'auth/operation-not-allowed'
    }[reason.split(' :')[0].trim()] || ('auth/' + reason.toLowerCase());
    throw e;
  }
  const session = {
    email: data.email,
    uid: data.localId,
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    expiresAt: Date.now() + (Number(data.expiresIn) || 3600) * 1000
  };
  auth._write(session);
  auth.currentUser = auth._user(session);
  auth._emit();
  return { user: auth.currentUser };
}

async function signOut() {
  auth._write(null);
  auth.currentUser = null;
  auth._emit();
}

const $ = (id) => document.getElementById(id);
const state = { tab: 'overview', register: 'submissions', cursor: null, rows: [], subStatus: 'new', payStatus: '', metrics: null, me: null };

const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* What this person may open. The server is the judge; this only keeps the
   page from offering what it would refuse. */
function can(module) {
  const me = state.me;
  if (!me) return false;
  if (me.role === 'super') return true;
  if (module === 'people') return false;
  return Array.isArray(me.modules) && me.modules.includes(module);
}
function applyAccess() {
  document.body.classList.toggle('is-super', state.me && state.me.role === 'super');
  document.querySelectorAll('.rail-link').forEach((b) => { if (b.dataset.tab !== 'people') b.hidden = !can(b.dataset.tab); });
  document.querySelectorAll('.rail-group').forEach((g) => {
    if (g.hasAttribute('data-super')) return;
    let el = g.nextElementSibling, any = false;
    while (el && el.classList.contains('rail-link')) { if (!el.hidden) any = true; el = el.nextElementSibling; }
    g.hidden = !any;
  });
  const who = $('adminWho');
  if (state.me) who.innerHTML = `${esc(state.me.email || state.me.uid)}<br><span style="font-family:var(--font-body);color:var(--muted)">${state.me.role === 'super' ? 'Super admin' : `Staff \u00b7 ${(state.me.modules || []).length} modules`}</span>`;
}
function firstAllowed() {
  const order = ['overview', 'submissions', 'circle', 'members', 'caretakers', 'payments', 'store', 'cards', 'import', 'verify', 'people'];
  return order.find((t) => can(t)) || null;
}

async function call(path) {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in.');
  const token = await user.getIdToken();
  const response = await fetch(path, { headers: { Authorization: 'Bearer ' + token } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'That request failed.');
  return data;
}

async function post(path, body) {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in.');
  const token = await user.getIdToken();
  const response = await fetch(path, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'That request failed.');
  return data;
}

/* ---- sign in ---------------------------------------------------------- */
$('adminSignIn').addEventListener('click', async () => {
  $('signInMsg').textContent = 'Checking\u2026';
  $('signInMsg').classList.remove('is-error');
  const email = $('adminEmail').value.trim();
  const password = $('adminPassword').value;
  const R = window.PFA_RULES;
  const emailError = R ? R.checkField('email', email, { required: true, emptyMessage: 'Enter your staff email.' }) : null;
  if (emailError || !password) {
    $('signInMsg').textContent = emailError || 'Enter your password.';
    $('signInMsg').classList.add('is-error');
    ($(emailError ? 'adminEmail' : 'adminPassword')).focus();
    return;
  }
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    const code = String(error && error.code || '');
    const why = {
      'auth/operation-not-allowed': 'Email/password sign-in is not enabled yet. Firebase console \u2192 Authentication \u2192 Sign-in method \u2192 Email/Password \u2192 Enable.',
      'auth/unauthorized-domain': 'This domain is not authorised in Firebase. Authentication \u2192 Settings \u2192 Authorized domains \u2192 add ' + location.hostname + '.',
      'auth/user-not-found': 'No staff account exists for that email. Create it in Firebase \u2192 Authentication \u2192 Users.',
      'auth/invalid-credential': 'That email and password did not match (or the account does not exist yet in Firebase \u2192 Authentication \u2192 Users).',
      'auth/wrong-password': 'That password did not match.',
      'auth/invalid-email': 'That does not look like an email address.',
      'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
      'auth/network-request-failed': 'Could not reach Google sign-in. Check the connection, VPN or any blocker, then try again.',
      'auth/invalid-api-key': 'assets/firebase-config.js has no API key.',
      'auth/user-disabled': 'That account is disabled in Firebase.'
    }[code] || ('Sign-in failed' + (code ? ' (' + code + ')' : '') + '.');
    $('signInMsg').textContent = why;
    $('signInMsg').classList.add('is-error');
  }
});
['adminEmail', 'adminPassword'].forEach((id) => $(id).addEventListener('keydown', (event) => {
  if (event.key === 'Enter') { event.preventDefault(); $('adminSignIn').click(); }
}));

window.__pfaAdminReady = true;
$('adminSignOut').addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    $('shell').hidden = true;
    $('signIn').hidden = false;
    return;
  }
  try {
    const session = await call('/api/admin/records?type=session');
    state.me = session.admin;
    applyAccess();
    $('signIn').hidden = true;
    $('shell').hidden = false;
    const start = firstAllowed();
    if (start) show(start);
    else $('pageHint').textContent = 'Your account can open the panel but has no modules yet. Ask a super admin to add some under People.';
  } catch (error) {
    // Signed in, but not an administrator.
    $('signInMsg').textContent =
      'That account is not an administrator. Ask someone with access to run scripts/grant-admin.js for you.';
    $('signInMsg').classList.add('is-error');
    await signOut(auth);
  }
});

/* ---- navigation ------------------------------------------------------- */
const PAGES = {
  overview:    ['Overview', 'What is waiting, what arrived, and what it was worth.'],
  submissions: ['Submissions', 'Everything sent through the site\u2019s forms. Take it, finish it, or mark it spam.'],
  circle:      ['The Circle', 'Posts and members of the Patron community.'],
  members:     ['Members', 'The Patron register. Search by member number or mobile.'],
  caretakers:  ['Caretaker cards', 'Community caretaker cards that have been issued.'],
  payments:    ['Payments', 'Card payments through CCAvenue: memberships, donations and caretaker postage.'],
  store:       ['Store orders', 'Paws & Tails orders, mirrored from Shopify.'],
  cards:       ['Issue cards', 'Patron and Caretaker cards in bulk: a print-ready PDF, an email to each holder, or both.'],
  people:      ['People', 'Who can open this panel, and what each of them can open.'],
  import:      ['Import the membership register', 'Bring the office spreadsheet into the live register, safely.'],
  verify:      ['Verify a card', 'Check any member or caretaker card number.']
};
const REGISTERS = ['submissions', 'members', 'caretakers', 'payments', 'store'];

function show(tab) {
  if (!can(tab)) {
    const fallback = firstAllowed();
    if (fallback && fallback !== tab) return show(fallback);
  }
  state.tab = tab;
  document.querySelectorAll('.rail-link').forEach((b) => {
    if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  const isRegister = REGISTERS.includes(tab);
  document.querySelectorAll('[data-panel]').forEach((p) => {
    p.hidden = p.dataset.panel !== (isRegister ? 'records' : tab);
  });
  $('pageTitle').textContent = PAGES[tab][0];
  $('pageHint').textContent = PAGES[tab][1];
  $('pageStamp').textContent = '';
  $('pageRefresh').hidden = tab === 'import' || tab === 'verify';
  $('stage').scrollTop = 0;
  window.scrollTo({ top: 0 });

  if (tab === 'overview') return loadMetrics();
  if (tab === 'circle') return loadCircle();
  if (tab === 'cards') return loadCards();
  if (tab === 'people') return loadPeople();
  if (isRegister) {
    state.register = tab;
    $('subFilters').hidden = tab !== 'submissions';
    $('payFilters').hidden = tab !== 'payments';
    $('storeNotice').hidden = tab !== 'store';
    $('searchRow').hidden = false;
    if (tab === 'payments') syncPayControls();
    $('adminQuery').placeholder = {
      submissions: 'Reference, e.g. PFA-C-2026-0001',
      store: 'PFA order number, e.g. PFA-ST-1191',
      members: 'Member number, or a mobile number',
      caretakers: 'Card number, e.g. PFA-CCT-ABCD2345',
      payments: 'Order number, name, email, mobile, tracking id or bank reference'
    }[tab];
    $('adminQuery').value = '';
    load(true);
  }
}

document.querySelectorAll('.rail-link').forEach((button) => {
  button.addEventListener('click', () => show(button.dataset.tab));
});
$('pageRefresh').addEventListener('click', () => {
  if (state.tab === 'overview') return loadMetrics();
  if (state.tab === 'circle') return loadCircle();
  if (state.tab === 'cards') return loadCards();
  if (state.tab === 'people') return loadPeople();
  if (REGISTERS.includes(state.tab)) load(true);
});

/* ---- block 4 of 8 ---- */
/* ---- overview --------------------------------------------------------- */
/* The charts are drawn here, as SVG, with nothing loaded from a CDN. A
   blocked script is what took sign-in down once; the dashboard is not going
   to be left blank by the same thing. Each is a few dozen lines because each
   draws exactly one thing. */

const KINDS = {};
const tip = $('tip');
const fmt = {
  int: (n) => Number(n || 0).toLocaleString('en-IN'),
  inr: (n) => '\u20B9' + Math.round(Number(n) || 0).toLocaleString('en-IN'),
  inrShort(n) {
    n = Number(n) || 0;
    if (n >= 1e7) return '\u20B9' + (n / 1e7).toFixed(2).replace(/\.?0+$/, '') + ' cr';
    if (n >= 1e5) return '\u20B9' + (n / 1e5).toFixed(2).replace(/\.?0+$/, '') + ' L';
    if (n >= 1000) return '\u20B9' + (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return '\u20B9' + Math.round(n);
  },
  day: (key) => new Date(key + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
  month: (key) => new Date(key + '-01T00:00:00Z').toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' }),
  monthLong: (key) => new Date(key + '-01T00:00:00Z').toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
  time: (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
};


function tipShow(event, html) { tip.innerHTML = html; tip.classList.add('show'); tipMove(event); }
function tipMove(event) { tip.style.left = event.clientX + 'px'; tip.style.top = (event.clientY - 10) + 'px'; }
function tipHide() { tip.classList.remove('show'); }
function bindTips(host) {
  host.querySelectorAll('[data-tip]').forEach((el) => {
    el.addEventListener('pointerenter', (e) => tipShow(e, el.dataset.tip));
    el.addEventListener('pointermove', tipMove);
    el.addEventListener('pointerleave', tipHide);
  });
}
/* The SVG is drawn in pixels at the size its box actually is, so text stays
   the size it was set at and nothing is stretched. */
function chartSize(host) {
  const W = Math.max(280, Math.round(host.clientWidth) || 640);
  const H = Math.max(170, Math.min(420, Math.round(host.clientHeight) || 190));
  return { W, H };
}
function emptyChart(title, text) {
  return `<div class="chart-empty"><div><b>${esc(title)}</b>${esc(text)}</div></div>`;
}

/* A line over a soft fill. Straight segments, because a curve would invent
   values between the days. */
function areaChart(host, buckets, key, opts) {
  const vals = buckets.map((b) => Number(b[key]) || 0);
  if (!vals.some((v) => v > 0)) { host.innerHTML = emptyChart(opts.emptyTitle, opts.emptyText); return; }
  const { W, H } = chartSize(host);
  const L = 6, R = 6, T = 16, B = 26;
  const n = vals.length, max = Math.max(...vals);
  const x = (i) => L + i * (W - L - R) / Math.max(1, n - 1);
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const pts = vals.map((v, i) => [x(i), y(v)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = line + ` L${x(n - 1).toFixed(1)} ${y(0).toFixed(1)} L${x(0).toFixed(1)} ${y(0).toFixed(1)} Z`;
  const ticks = [...new Set([0, Math.round((n - 1) / 3), Math.round(2 * (n - 1) / 3), n - 1])];
  const step = (W - L - R) / Math.max(1, n - 1);
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label)}">
    <defs><linearGradient id="g-blue" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#0653EE" stop-opacity=".22"/><stop offset="1" stop-color="#0653EE" stop-opacity="0"/></linearGradient></defs>
    <line class="grid" x1="${L}" x2="${W - R}" y1="${y(max).toFixed(1)}" y2="${y(max).toFixed(1)}"/>
    <text class="ax" x="${L}" y="${(y(max) - 5).toFixed(1)}">${opts.format(max)}</text>
    <path class="fill" d="${area}"/>
    <path class="line" d="${line}"/>
    <line class="base" x1="${L}" x2="${W - R}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}"/>
    ${ticks.map((i, k) => `<text class="ax${k === ticks.length - 1 ? ' r' : ''}" x="${x(i).toFixed(1)}" y="${H - 8}"${k > 0 && k < ticks.length - 1 ? ' text-anchor="middle"' : ''}>${esc(fmt.day(buckets[i].day))}</text>`).join('')}
    <line class="cross" id="${host.id}-cross" y1="${T}" y2="${y(0).toFixed(1)}" x1="0" x2="0"/>
    <circle class="dot" id="${host.id}-dot" r="4" cx="0" cy="0" opacity="0"/>
    ${vals.map((v, i) => `<rect class="hit" x="${(x(i) - step / 2).toFixed(1)}" y="${T}" width="${step.toFixed(1)}" height="${(H - T - B).toFixed(1)}" data-i="${i}" data-tip="<b>${esc(fmt.day(buckets[i].day))}</b>${esc(opts.format(v))} ${esc(opts.unit(v))}"/>`).join('')}
  </svg>`;
  const cross = host.querySelector('.cross'), dot = host.querySelector('.dot');
  host.querySelectorAll('.hit').forEach((r) => {
    r.addEventListener('pointerenter', () => {
      const i = Number(r.dataset.i);
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.style.opacity = 1;
      dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(vals[i])); dot.setAttribute('opacity', 1);
    });
    r.addEventListener('pointerleave', () => { cross.style.opacity = 0; dot.setAttribute('opacity', 0); });
  });
  bindTips(host);
}

/* Columns, one per period. The most recent one is blue. */
function columnChart(host, items, opts) {
  const vals = items.map((it) => Number(it.value) || 0);
  if (!vals.some((v) => v > 0)) { host.innerHTML = emptyChart(opts.emptyTitle, opts.emptyText); return; }
  const { W, H } = chartSize(host);
  const L = 6, R = 6, T = 16, B = 26;
  const n = vals.length, max = Math.max(...vals);
  const slot = (W - L - R) / n, gap = Math.min(8, slot * .28), bw = slot - gap;
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const every = n > 16 ? Math.ceil(n / 8) : 1;
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label)}">
    <line class="grid" x1="${L}" x2="${W - R}" y1="${y(max).toFixed(1)}" y2="${y(max).toFixed(1)}"/>
    <text class="ax" x="${L}" y="${(y(max) - 5).toFixed(1)}">${opts.format(max)}</text>
    ${vals.map((v, i) => {
      const x0 = L + i * slot + gap / 2;
      const h = Math.max(v > 0 ? 2 : 1.5, y(0) - y(v));
      return `<rect class="col${i === n - 1 ? ' hi' : ''}${v ? '' : ' zero'}" x="${x0.toFixed(1)}" y="${(y(0) - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" data-tip="<b>${esc(items[i].tip || items[i].label)}</b>${esc(opts.format(v))} ${esc(opts.unit(v))}"/>`;
    }).join('')}
    <line class="base" x1="${L}" x2="${W - R}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}"/>
    ${items.map((it, i) => ((i % every === 0 && n - 1 - i >= every / 2) || i === n - 1) ? `<text class="ax" text-anchor="${i === n - 1 ? 'end' : (i === 0 ? 'start' : 'middle')}" x="${(i === n - 1 ? W - R : (i === 0 ? L : L + i * slot + slot / 2)).toFixed(1)}" y="${H - 8}">${esc(it.label)}</text>` : '').join('')}
  </svg>`;
  bindTips(host);
}

/* A ring, parts clockwise from the top, with the total in the middle. */
function donutChart(host, parts, centre, caption) {
  const total = parts.reduce((s, p) => s + (Number(p.value) || 0), 0);
  const size = 150, r = 60, c = 2 * Math.PI * r, stroke = 16;
  let offset = 0;
  const arcs = total ? parts.filter((p) => p.value > 0).map((p) => {
    const len = c * p.value / total;
    const el = `<circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="${p.color}" stroke-width="${stroke}" stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})" data-tip="<b>${esc(p.label)}</b>${esc(p.tip)}"/>`;
    offset += len;
    return el;
  }).join('') : `<circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="#EEF1F3" stroke-width="${stroke}"/>`;
  host.innerHTML = `<div class="donut-wrap">
    <div class="donut"><svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${esc(caption)}">${arcs}</svg>
      <div class="c"><b>${esc(centre)}</b><span>${esc(caption)}</span></div></div>
    <div class="legend">${parts.map((p) => `<div><i style="background:${p.color}"></i><span>${esc(p.label)}${p.count !== undefined ? `<small>${fmt.int(p.count)} ${p.count === 1 ? 'payment' : 'payments'}</small>` : ''}</span><em>${esc(p.shown)}</em></div>`).join('')}</div>
  </div>`;
  bindTips(host);
}

function stat(tab, value, label, sub, opts = {}) {
  return `<button class="stat" type="button" data-go="${tab}">
    <strong>${value}${opts.small ? `<small>${esc(opts.small)}</small>` : ''}</strong>
    <div><span class="l">${esc(label)}</span><div class="sub">${sub}</div></div></button>`;
}

async function loadMetrics() {
  $('metricsMsg').textContent = '';
  $('metricsMsg').classList.remove('is-error');
  $('pageStamp').textContent = 'Loading\u2026';
  try {
    const data = await call('/api/admin/metrics');
    state.metrics = data;
    renderMetrics(data);
  } catch (error) {
    $('pageStamp').textContent = '';
    $('metricsMsg').textContent = error.message;
    $('metricsMsg').classList.add('is-error');
  }
}

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (state.tab === 'overview' && state.metrics) renderMetrics(state.metrics); }, 160);
});

function renderMetrics(data) {
  document.querySelectorAll('[data-panel="overview"] [data-module]').forEach((el) => { el.hidden = !can(el.dataset.module); });
  {
    const c = data.cards || {};
    const subs = data.submissions || { byStatus: {}, arrivals: [] };
    const pay = data.payments || { byDay: [], byType: {}, outcomes30d: {} };
    const money = data.revenue30d || { inr: 0, usd: 0, count: 0 };
    const mem = data.members || { total: c.members || 0, expired: 0, current: c.members || 0, expiring: {}, joinedByMonth: [] };
    const care = data.caretakers || { total: c.caretakers || 0, printed: 0, unprinted: 0, expired: 0 };
    const store = data.store || { byStatus: {}, revenue30d: 0 };
    const waiting = Number(c.submissionsWaiting) || 0;

    /* the stage ---------------------------------------------------------- */
    const kinds = Object.keys(data.byKind || {})
      .map((k) => Object.assign({ kind: k }, data.byKind[k]))
      .sort((a, b) => b.waiting - a.waiting);
    kinds.forEach((row) => { KINDS[row.kind] = row.label; });
    fillKindFilter();
    countUp($('ovWaiting'), waiting);
    const hot = kinds.filter((k) => k.waiting > 0);
    $('ovWaitingNote').textContent = waiting === 0
      ? 'Nothing is waiting. Every submission has been taken up.'
      : `${waiting === 1 ? 'submission needs' : 'submissions need'} a first reply, across ${hot.length} ${hot.length === 1 ? 'category' : 'categories'}. ${fmt.int(c.submissionsLast7)} arrived this week.`;
    $('ovQueues').innerHTML = hot.length
      ? hot.slice(0, 4).map((k) => `<button type="button" data-open-kind="${esc(k.kind)}"><span>${esc(k.label)}</span><em>${fmt.int(k.waiting)} \u2192</em></button>`).join('')
      : '<div class="quiet">The inbox is clear.</div>';
    $('navWaiting').textContent = waiting ? fmt.int(waiting) : '';
    $('navToShip').textContent = c.storeOrdersAwaitingShipment ? fmt.int(c.storeOrdersAwaitingShipment) : '';

    /* arrivals ----------------------------------------------------------- */
    areaChart($('chartArrivals'), subs.arrivals || [], 'count', {
      label: 'Submissions per day over the last 30 days',
      format: fmt.int, unit: (v) => v === 1 ? 'submission' : 'submissions',
      emptyTitle: 'No arrivals in 30 days', emptyText: 'The day something is sent through a form, it appears here.'
    });
    $('ovWeek').textContent = fmt.int(c.submissionsLast7);
    $('ovProgress').textContent = fmt.int(subs.byStatus['in-progress']);
    $('ovHandled').textContent = fmt.int(subs.byStatus.handled);
    $('segNew').textContent = fmt.int(subs.byStatus.new);
    $('segProgress').textContent = fmt.int(subs.byStatus['in-progress']);
    $('segHandled').textContent = fmt.int(subs.byStatus.handled);
    $('segSpam').textContent = fmt.int(subs.byStatus.spam);

    /* the four registers -------------------------------------------------- */
    const due30 = Number(mem.expiring && mem.expiring.in30) || 0;
    $('ovStats').innerHTML = [
      can('members') && stat('members', fmt.int(mem.total), 'Members',
        mem.total ? `<b class="good">${fmt.int(mem.current)}</b> current${mem.expired ? ` \u00b7 <b class="bad">${fmt.int(mem.expired)}</b> lapsed` : ''}${due30 ? ` \u00b7 <b class="warn">${fmt.int(due30)}</b> due in 30 days` : ''}` : 'Nobody on the register yet.'),
      can('caretakers') && stat('caretakers', fmt.int(care.total), 'Caretaker cards',
        care.total ? `<b class="good">${fmt.int(care.printed)}</b> printed${care.unprinted ? ` \u00b7 <b class="warn">${fmt.int(care.unprinted)}</b> to print` : ''}${care.expired ? ` \u00b7 <b class="bad">${fmt.int(care.expired)}</b> expired` : ''}` : 'No cards issued yet.'),
      can('payments') && stat('payments', fmt.inrShort(money.inr), 'Card payments, 30 days',
        money.count ? `<b>${fmt.int(money.count)}</b> paid \u00b7 <b>${fmt.inr(money.inr)}</b>${money.usd ? ` \u00b7 plus <b>$${fmt.int(money.usd)}</b> in USD` : ''}` : 'No payments in the last 30 days.'),
      can('store') && stat('store', fmt.int(c.storeOrders), 'Store orders',
        c.storeOrders ? `${c.storeOrdersAwaitingShipment ? `<b class="warn">${fmt.int(c.storeOrdersAwaitingShipment)}</b> paid, to ship \u00b7 ` : ''}<b>${fmt.inrShort(store.revenue30d)}</b> in 30 days` : 'No orders yet.')
    ].filter(Boolean).join('');
    $('ovStats').hidden = !$('ovStats').innerHTML;
    const cols = $('ovStats').children.length; if (cols) $('ovStats').style.gridTemplateColumns = `repeat(${Math.min(4, cols)},1fr)`;

    /* waiting by category -------------------------------------------------- */
    const maxKind = Math.max(1, ...kinds.map((k) => k.waiting));
    const clear = kinds.filter((k) => !k.waiting);
    $('chartKinds').innerHTML = (hot.length ? hot.map((k) => `
      <button class="kind-row${k.waiting >= 5 ? ' hot' : ''}" type="button" data-open-kind="${esc(k.kind)}">
        <span class="kind-label">${esc(k.label)}</span>
        <span class="kind-bar"><i style="--w:${(100 * k.waiting / maxKind).toFixed(1)}%"></i></span>
        <span class="kind-val">${fmt.int(k.waiting)}</span>
      </button>`).join('') : '<div class="chart" style="min-height:150px;flex:0 0 auto">' + emptyChart('Every queue is clear', 'New submissions will appear here by category.') + '</div>')
      + (clear.length && hot.length ? `<p class="kinds-clear"><b>Nothing waiting</b> in ${esc(clear.map((k) => k.label.toLowerCase()).join(', '))}.</p>` : '');

    /* money by purpose ------------------------------------------------------ */
    const purpose = { membership: 'Memberships', donate: 'Donations', caretaker: 'Caretaker postage', send: 'Food sent to shelters' };
    const colours = ['#0653EE', '#16B6FF', '#0E1116', '#9AA7B2'];
    const types = Object.keys(pay.byType || {}).map((t, i) => ({
      label: purpose[t] || t, value: Number(pay.byType[t].inr) || 0, count: pay.byType[t].count || 0,
      color: colours[i % colours.length], shown: fmt.inrShort(pay.byType[t].inr), tip: fmt.inr(pay.byType[t].inr)
    })).sort((a, b) => b.value - a.value);
    if (money.inr > 0) donutChart($('chartMoney'), types, fmt.inrShort(money.inr), '30 days');
    else $('chartMoney').innerHTML = '<div class="chart" style="min-height:150px">' + emptyChart('Nothing paid yet', 'Memberships, donations and caretaker postage will be split here.') + '</div>';

    /* new members by month ------------------------------------------------- */
    columnChart($('chartJoined'), (mem.joinedByMonth || []).map((m) => ({ label: fmt.month(m.month), tip: fmt.monthLong(m.month), value: m.count })), {
      label: 'New members by month over the last 12 months',
      format: fmt.int, unit: (v) => v === 1 ? 'member' : 'members',
      emptyTitle: 'No new members in 12 months', emptyText: 'Paid memberships and imported rows both count.'
    });
    const ex = mem.expiring || {};
    $('ovRenewals').innerHTML = [[30, ex.in30], [60, ex.in60], [90, ex.in90]].map(([d, n]) =>
      `<div><b${Number(n) ? ' style="color:var(--amber)"' : ''}>${fmt.int(n)}</b><span>due in ${d} days</span></div>`).join('');

    /* payments per day + outcomes ------------------------------------------ */
    columnChart($('chartPayDay'), (pay.byDay || []).map((b) => ({ label: fmt.day(b.day), tip: fmt.day(b.day), value: b.amount })), {
      label: 'Rupees received per day over the last 30 days',
      format: fmt.inrShort, unit: () => '',
      emptyTitle: 'No card payments in 30 days', emptyText: 'Each day\u2019s successful CCAvenue payments add up here.'
    });
    const o = pay.outcomes30d || {};
    const attempts = ['success', 'failed', 'abandoned', 'pending'].reduce((s, k) => s + (Number(o[k]) || 0), 0);
    const oc = { success: ['Paid', 'var(--green)'], failed: ['Failed', 'var(--danger)'], abandoned: ['Abandoned', 'var(--amber)'], pending: ['Started', 'var(--grey)'] };
    $('ovOutcomes').innerHTML = attempts ? `
      <div class="outcomes">${Object.keys(oc).map((k) => `<i style="width:${(100 * (Number(o[k]) || 0) / attempts).toFixed(1)}%;background:${oc[k][1]}" data-tip="<b>${oc[k][0]}</b>${fmt.int(o[k])} of ${fmt.int(attempts)} attempts"></i>`).join('')}</div>
      <div class="outcomes-key">${Object.keys(oc).map((k) => `<span style="--c:${oc[k][1]}">${oc[k][0]}<b>${fmt.int(o[k])}</b></span>`).join('')}
        <span style="--c:transparent;margin-left:auto">Completed<b>${Math.round(100 * (Number(o.success) || 0) / attempts)}%</b></span></div>` : '';
    bindTips($('ovOutcomes'));

    /* store pipeline ----------------------------------------------------------- */
    const s = store.byStatus || {};
    $('chartStore').innerHTML = `
      <div class="pipe">
        <div data-tip="<b>Awaiting payment</b>Checkout started, not yet paid"><b>${fmt.int(s.AWAITING_PAYMENT)}</b><span>Awaiting payment</span></div>
        <div data-tip="<b>Paid</b>Confirmed by the seller, not yet shipped"><b class="${Number(s.CONFIRMED) ? 'warn' : ''}">${fmt.int(s.CONFIRMED)}</b><span>Paid, to ship</span></div>
        <div data-tip="<b>Shipped</b>Courier has it, or delivered"><b>${fmt.int(s.FULFILLED)}</b><span>Shipped</span></div>
      </div>
      <div class="pipe-side">
        <span>Cancelled<b>${fmt.int(s.CANCELLED)}</b></span>
        <span>Refunded<b>${fmt.int(s.REFUND_RECORDED)}</b></span>
        <span>Payment failed<b>${fmt.int(s.PAYMENT_FAILED)}</b></span>
        <span style="margin-left:auto">30 days<b>${fmt.inr(store.revenue30d)}</b></span>
      </div>`;
    bindTips($('chartStore'));

    /* footnotes ----------------------------------------------------------- */
    const notes = [];
    if (money.capped) notes.push('Payment totals cover the most recent 1,000 transactions.');
    if (subs.arrivalsCapped) notes.push('The arrivals chart covers the most recent 1,000 submissions.');
    $('metricsMsg').textContent = notes.join(' ');
    $('pageStamp').textContent = 'Updated ' + fmt.time(data.generatedAt || Date.now());
    setTimeout(() => document.querySelector('[data-panel="overview"]').classList.remove('fresh'), 1200);
  }
}

/* The big number counts up on first load; a reload just sets it. */
function countUp(el, target) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || el.dataset.done || target === 0) { el.textContent = fmt.int(target); el.dataset.done = '1'; return; }
  const start = performance.now(), dur = 700;
  (function frame(now) {
    const t = Math.min(1, (now - start) / dur), eased = 1 - Math.pow(1 - t, 3);
    el.textContent = fmt.int(Math.round(target * eased));
    if (t < 1) requestAnimationFrame(frame); else el.dataset.done = '1';
  }(start));
}

function fillKindFilter() {
  const select = $('filterKind');
  if (select.options.length > 1) return;
  Object.keys(KINDS).forEach((kind) => {
    const option = document.createElement('option');
    option.value = kind; option.textContent = KINDS[kind];
    select.appendChild(option);
  });
}

/* From the overview straight into a register or a category's queue. */
document.addEventListener('click', (event) => {
  const go = event.target.closest('[data-go]');
  if (go) return show(go.dataset.go);
  const target = event.target.closest('[data-open-kind]');
  if (!target) return;
  state.subStatus = 'new';
  show('submissions');
  $('filterKind').value = target.dataset.openKind;
  setSeg('statusSeg', 'new');
  load(true);
});

/* ---- block 5 of 8 ---- */
/* ---- registers -------------------------------------------------------- */
/* Older records are shown in Title Case even where they were stored as typed. */
function personName(value) {
  return window.PFA_RULES ? window.PFA_RULES.nameCase(value || '') : String(value == null ? '' : value);
}
function escapeHtml(value) { return esc(value); }

function date(value) {
  if (!value) return '\u2014';
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? '\u2014'
    : parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function ago(value) {
  if (!value) return '\u2014';
  const ms = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(ms)) return '\u2014';
  const m = Math.round(ms / 60000), h = Math.round(ms / 3600000), d = Math.round(ms / 86400000);
  if (m < 1) return 'just now';
  if (m < 60) return m + ' min ago';
  if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
  if (d < 14) return d + (d === 1 ? ' day ago' : ' days ago');
  return date(value);
}
function when(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function pill(kind, label) { return `<span class="pill ${kind}">${esc(label)}</span>`; }
const PILLS = {
  submission: { new: ['warn', 'Waiting'], 'in-progress': ['info', 'In progress'], handled: ['good', 'Handled'], spam: ['', 'Spam'] },
  payment: {
    success: ['good', 'Paid'], failed: ['bad', 'Failed'], verification_failed: ['bad', 'Unverified'],
    aborted: ['warn', 'Abandoned'], cancelled: ['warn', 'Cancelled'], initiated: ['info', 'Started'], pending: ['info', 'Pending'], awaited: ['info', 'Pending']
  },
  store: {
    AWAITING_PAYMENT: ['info', 'Awaiting payment'], CONFIRMED: ['warn', 'Paid, to ship'], FULFILLED: ['good', 'Shipped'],
    REFUND_RECORDED: ['bad', 'Refunded'], CANCELLED: ['bad', 'Cancelled'], PAYMENT_FAILED: ['bad', 'Payment failed']
  },
  card: { valid: ['good', 'Valid'], expired: ['bad', 'Expired'], unknown: ['', 'Unknown'] }
};
function statusPill(group, value) {
  const m = PILLS[group][value] || ['', value || '\u2014'];
  return pill(m[0], m[1]);
}

function summarise(fields) {
  const keys = Object.keys(fields || {}).slice(0, 3);
  if (!keys.length) return '';
  return '<div class="fields">' + keys.map((k) =>
    `<b>${esc(k)}:</b> ${esc(String(fields[k]).slice(0, 90))}`).join(' &middot; ') + '</div>';
}

const EMPTY = {
  submissions: ['Nothing in this queue', 'Change the status or category filter, or search by reference.'],
  members: ['No members to show', 'Search by member number or mobile, or import the office register.'],
  caretakers: ['No caretaker cards yet', 'Cards appear here as they are issued.'],
  payments: ['No payments to show', 'Card payments arrive here the moment CCAvenue confirms them.'],
  store: ['No store orders yet', 'Orders are mirrored from Shopify when the seller confirms payment.']
};

function table(rows) {
  const t = state.register;
  if (!rows.length) return `<div class="table-wrap"><div class="empty"><b>${esc(EMPTY[t][0])}</b>${esc(EMPTY[t][1])}</div></div>`;
  const wrap = (inner) => `<div class="table-wrap"><table>${inner}</table></div>`;

  if (t === 'submissions') {
    const firstText = (row) => {
      const f = row.fields || {};
      const key = ['summary', 'question', 'message', 'details', 'title', 'story', 'request', 'about'].find((k) => f[k]) || Object.keys(f).find((k) => !/email|mobile|phone|contact|name|pin|city|state/i.test(k) && String(f[k]).length > 12);
      return key ? String(f[key]) : '';
    };
    return wrap(`<thead><tr><th>Reference</th><th>Category</th><th>Received</th><th>Assigned</th><th>Status</th><th></th></tr></thead><tbody>` + rows.map((row) => `
      <tr class="row-link${caseState.open === row.reference ? ' is-open' : ''}" data-open-case="${esc(row.reference)}" tabindex="0" role="button" aria-label="Open ${esc(row.reference)}">
        <td class="mono">${esc(row.reference)}<span class="sum">${esc(firstText(row))}</span>
          ${row.attachments || row.replyCount || row.noteCount ? `<div class="tags" style="margin-top:6px">${row.attachments ? `<span class="tag">${row.attachments} ${row.attachments === 1 ? 'photo' : 'photos'}</span>` : ''}${row.replyCount ? `<span class="tag info">${row.replyCount} ${row.replyCount === 1 ? 'reply' : 'replies'}</span>` : ''}${row.noteCount ? `<span class="tag warn">${row.noteCount} ${row.noteCount === 1 ? 'note' : 'notes'}</span>` : ''}</div>` : ''}</td>
        <td>${esc(row.kindLabel)}<span class="sub">${esc(row.page)}</span></td>
        <td class="mono" title="${esc(date(row.createdAt))}">${esc(ago(row.createdAt))}</td>
        <td><span class="who">${esc((row.assignedTo || '').split('@')[0])}</span></td>
        <td>${statusPill('submission', row.status)}</td>
        <td>&rarr;</td>
      </tr>`).join('') + '</tbody>');
  }

  if (t === 'store') {
    return wrap(`<thead><tr><th>PFA order</th><th>Customer</th><th>Items</th><th class="amt">Total</th><th>Status</th><th>Shipping</th><th>Placed</th></tr></thead><tbody>` + rows.map((row) => `
      <tr>
        <td class="mono">${esc(row.pfaOrderId)}<span class="sub">Shopify #${esc(row.orderNumber)} \u00b7 <a href="https://sg37v1-ta.myshopify.com/admin/orders/${esc(row.shopifyOrderId)}" target="_blank" rel="noopener">open</a></span></td>
        <td>${esc(personName(row.name))}<span class="sub">${esc(row.email)}</span></td>
        <td>${esc(row.items)}</td>
        <td class="amt">${fmt.inr(row.total)}${row.refundedTotal ? `<span class="sub">refunded ${fmt.inr(row.refundedTotal)}</span>` : ''}</td>
        <td>${statusPill('store', row.status)}</td>
        <td>${row.tracking ? (row.trackingUrl ? `<a class="mono" href="${esc(row.trackingUrl)}" target="_blank" rel="noopener">${esc(row.tracking)}</a>` : `<span class="mono">${esc(row.tracking)}</span>`) : '<span class="sub">not yet shipped</span>'}</td>
        <td class="mono">${date(row.createdAt)}</td>
      </tr>`).join('') + '</tbody>');
  }

  if (t === 'payments') {
    return wrap(`<thead><tr><th>Order</th><th>For</th><th>Who</th><th class="amt">Amount</th><th>Status</th><th>When</th><th></th></tr></thead><tbody>` + rows.map((row) => `
      <tr class="row-link" data-open-payment="${esc(row.orderId)}" tabindex="0" role="button" aria-label="Open ${esc(row.orderId)}">
        <td class="mono">${esc(row.orderId)}${row.paymentMode ? `<span class="sub">${esc(row.paymentMode)}${row.trackingId ? ' \u00b7 ' + esc(row.trackingId) : ''}</span>` : ''}</td>
        <td>${esc({ membership: 'Membership', donate: 'Donation', caretaker: 'Caretaker postage', send: 'Food for a shelter' }[row.type] || row.type)}${row.memberId ? `<span class="sub mono">${esc(row.memberId)}</span>` : row.cardId ? `<span class="sub mono">${esc(row.cardId)}</span>` : ''}</td>
        <td>${esc(personName(row.name))}<span class="sub">${esc(row.email || row.mobile)}${row.email && row.mobile ? ' \u00b7 ' + esc(row.mobile) : ''}</span></td>
        <td class="amt">${row.currency === 'USD' ? '$' + fmt.int(row.amount) : fmt.inr(row.amount)}</td>
        <td>${statusPill('payment', row.status)}${row.failureMessage && row.status !== 'success' ? `<span class="sub">${esc(row.failureMessage.slice(0, 60))}</span>` : ''}</td>
        <td class="mono" title="${esc(when(row.createdAt))}">${esc(ago(row.createdAt))}</td>
        <td>&rarr;</td>
      </tr>`).join('') + '</tbody>');
  }

  const members = t === 'members';
  const head = members
    ? ['Member number', 'Name', 'Contact', 'Since', 'Valid until', 'State']
    : ['Card number', 'Name', 'Issued', 'Valid until', 'Printed', 'State'];
  const body = rows.map((row) => members ? `
    <tr>
      <td class="mono">${esc(row.cardId)}</td>
      <td>${esc(personName(row.name))}${row.source ? `<span class="sub">${esc(row.source)}</span>` : ''}</td>
      <td>${esc(row.email)}<span class="sub mono">${esc(row.mobile)}</span></td>
      <td class="mono">${date(row.memberSince)}</td>
      <td class="mono">${date(row.validUntil)}</td>
      <td>${statusPill('card', row.state)}</td>
    </tr>` : `
    <tr>
      <td class="mono">${esc(row.cardId)}</td>
      <td>${esc(personName(row.name))}</td>
      <td class="mono">${date(row.issuedAt)}</td>
      <td class="mono">${date(row.validUntil)}</td>
      <td>${row.printed ? pill('good', 'Printed') : pill('warn', 'To print')}</td>
      <td>${statusPill('card', row.state)}</td>
    </tr>`).join('');
  return wrap(`<thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody>`);
}

document.addEventListener('click', (event) => {
  const row = event.target.closest('[data-open-case]');
  if (row && !event.target.closest('a,button')) openCase(row.dataset.openCase);
  const prow = event.target.closest('[data-open-payment]');
  if (prow && !event.target.closest('a,button')) openPayment(prow.dataset.openPayment);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && event.target.matches && event.target.matches('[data-open-payment]')) openPayment(event.target.dataset.openPayment);
});

/* Everything on a payment, for accounts: who paid, for what, how, what the
   gateway said, and what it unlocked. Read-only; money moves only at CCAvenue. */
function openPayment(orderId) {
  const r = state.rows.find((x) => x.orderId === orderId);
  if (!r) return;
  caseState.open = null;
  $('caseDrawer').classList.add('plain');
  $('caseOverlay').hidden = false; $('caseDrawer').hidden = false;
  requestAnimationFrame(() => { $('caseOverlay').classList.add('show'); $('caseDrawer').classList.add('show'); });
  $('caseKind').textContent = { membership: 'Membership', donate: 'Donation', caretaker: 'Caretaker postage', send: 'Food for a shelter' }[r.type] || 'Payment';
  $('caseRef').textContent = r.orderId;
  $('caseWhen').innerHTML = `Started <b>${esc(when(r.createdAt))}</b>${r.updatedAt && r.updatedAt !== r.createdAt ? ` \u00b7 last update ${esc(when(r.updatedAt))}` : ''}`;
  $('caseStatus').innerHTML = statusPill('payment', r.status);
  $('caseActions').innerHTML = '';
  const fact = (k, v) => v ? `<dt>${esc(k)}</dt><dd>${v}</dd>` : '';
  const money = r.currency === 'USD' ? '$' + fmt.int(r.amount) : fmt.inr(r.amount);
  $('caseBody').innerHTML = `
    <h4>Amount</h4>
    <dl class="facts">${fact('Amount', `<b style="font-family:var(--font-display);font-size:22px;letter-spacing:-.03em">${money}</b>`)}${fact('Currency', esc(r.currency))}${fact('Payment mode', esc(r.paymentMode))}</dl>
    <h4>Who paid</h4>
    <dl class="facts">${fact('Name', esc(personName(r.name)))}${fact('Email', r.email ? `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>` : '')}${fact('Mobile', r.mobile ? `<a href="tel:+91${esc(r.mobile)}">${esc(r.mobile)}</a>` : '')}${fact('Address', esc(r.address))}</dl>
    <h4>Gateway</h4>
    <dl class="facts">${fact('CCAvenue tracking id', r.trackingId && `<span class="mono">${esc(r.trackingId)}</span>`)}${fact('Bank reference', r.bankReference && `<span class="mono">${esc(r.bankReference)}</span>`)}${fact('Gateway status', esc(r.responseStatus))}${fact('Failure message', r.failureMessage && `<span style="color:var(--danger)">${esc(r.failureMessage)}</span>`)}</dl>
    ${r.memberId || r.cardId || r.note ? `<h4>What it was for</h4><dl class="facts">${fact('Member number', r.memberId ? `<button class="rowbtn" type="button" data-go-search="members:${esc(r.memberId)}">${esc(r.memberId)}</button>` : '')}${fact('Card number', r.cardId ? `<button class="rowbtn" type="button" data-go-search="caretakers:${esc(r.cardId)}">${esc(r.cardId)}</button>` : '')}${fact('Note', esc(r.note))}</dl>` : ''}`;
  $('caseBody').scrollTop = 0;
  $('caseClose').focus();
}
$('caseBody').addEventListener('click', (event) => {
  const b = event.target.closest('[data-go-search]'); if (!b) return;
  const [tab, q] = b.dataset.goSearch.split(':');
  closeCase(); show(tab); $('adminQuery').value = q; load(true);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && event.target.matches && event.target.matches('[data-open-case]')) openCase(event.target.dataset.openCase);
  if (event.key === 'Escape' && !$('caseDrawer').hidden) closeCase();
});

/* Photos sent with a report are fetched with the administrator's token and
   shown in the row; a click opens the full picture in a new tab. */
document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-show-photos]');
  if (!button) return;
  const box = button.closest('.photos');
  const reference = button.dataset.showPhotos;
  const count = Number(box.dataset.count) || 0;
  button.disabled = true; button.textContent = 'Loading\u2026';
  try {
    const shots = [];
    for (let n = 1; n <= count; n += 1) {
      const out = await call('/api/admin/attachment?reference=' + encodeURIComponent(reference) + '&n=' + n);
      shots.push('data:' + out.contentType + ';base64,' + out.data);
    }
    box.innerHTML = '<div class="photo-strip">' + shots.map((src, i) => `<a class="photo-thumb" href="${src}" target="_blank" rel="noopener" title="Open photo ${i + 1}"><img alt="Photo ${i + 1} sent with ${esc(reference)}" src="${src}"></a>`).join('') + '</div>';
  } catch (error) {
    button.disabled = false; button.textContent = 'Photos did not load. Try again';
  }
});

/* Marking a submission is the one write the registers make. */
document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-set-status]');
  if (!button) return;
  button.disabled = true;
  try {
    await post('/api/admin/submission-status', { reference: button.dataset.ref, status: button.dataset.setStatus });
    load(true);
    if (state.metrics) loadMetricsQuietly();
  } catch (error) {
    $('recordsMsg').textContent = error.message;
    $('recordsMsg').classList.add('is-error');
    button.disabled = false;
  }
});

/* Keep the rail badge and segment counts honest after a status change,
   without redrawing the overview the administrator is not looking at. */
async function loadMetricsQuietly() {
  try {
    const data = await call('/api/admin/metrics');
    state.metrics = data;
    const waiting = Number(data.cards && data.cards.submissionsWaiting) || 0;
    $('navWaiting').textContent = waiting ? fmt.int(waiting) : '';
    const by = (data.submissions && data.submissions.byStatus) || {};
    $('segNew').textContent = fmt.int(by.new);
    $('segProgress').textContent = fmt.int(by['in-progress']);
    $('segHandled').textContent = fmt.int(by.handled);
    $('segSpam').textContent = fmt.int(by.spam);
  } catch (error) { /* the next visit to the overview will catch up */ }
}

function setSeg(id, value) {
  document.querySelectorAll('#' + id + ' button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.status === value)));
}
$('statusSeg').addEventListener('click', (event) => {
  const b = event.target.closest('button'); if (!b) return;
  state.subStatus = b.dataset.status; setSeg('statusSeg', state.subStatus); load(true);
});
/* ---- payments filters ---------------------------------------------------- */
/* Several filters at once, each visible as a chip that can be removed on its
   own, and a summary of the whole filtered set - not just the page - so the
   totals an accountant reads are the real totals. */
const pay = { purpose: new Set(), status: new Set(), period: '30', from: '', to: '', min: '', max: '', sort: 'newest', offset: 0 };
const PAY_LABEL = { membership: 'Memberships', donate: 'Donations', caretaker: 'Caretaker postage', send: 'Food to shelters', paid: 'Paid', failed: 'Failed', unverified: 'Unverified', abandoned: 'Abandoned', started: 'Started' };

function isoDay(d) { return d.toISOString().slice(0, 10); }
function payRange() {
  const now = new Date();
  if (pay.period === 'custom') return { from: pay.from, to: pay.to };
  if (pay.period === 'all') return { from: '', to: '' };
  if (pay.period === 'month') return { from: isoDay(new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))), to: '' };
  if (pay.period === 'fy') { const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1; return { from: `${y}-04-01`, to: '' }; }
  const days = Number(pay.period) || 30;
  return { from: isoDay(new Date(now.getTime() - days * 86400000)), to: '' };
}
function payParams(params) {
  if (pay.purpose.size) params.set('purpose', [...pay.purpose].join(','));
  if (pay.status.size) params.set('status', [...pay.status].join(','));
  const r = payRange();
  if (r.from) params.set('from', r.from);
  if (r.to) params.set('to', r.to);
  if (pay.min !== '') params.set('min', pay.min);
  if (pay.max !== '') params.set('max', pay.max);
  if (pay.sort !== 'newest') { params.set('sort', pay.sort); params.set('offset', String(pay.offset)); }
}
function drawPayChips() {
  const chips = [];
  pay.purpose.forEach((v) => chips.push(['purpose', v, PAY_LABEL[v]]));
  pay.status.forEach((v) => chips.push(['status', v, PAY_LABEL[v]]));
  if (pay.period !== '30') chips.push(['period', '', { 7: 'Last 7 days', month: 'This month', fy: 'This financial year', all: 'All time', custom: `${pay.from || '\u2026'} to ${pay.to || '\u2026'}` }[pay.period] || pay.period]);
  if (pay.min !== '') chips.push(['min', '', `At least \u20B9${fmt.int(pay.min)}`]);
  if (pay.max !== '') chips.push(['max', '', `At most \u20B9${fmt.int(pay.max)}`]);
  if (pay.sort !== 'newest') chips.push(['sort', '', $('paySort').selectedOptions[0].textContent]);
  const q = $('adminQuery').value.trim(); if (q) chips.push(['q', '', `\u201c${q}\u201d`]);
  const host = $('payChips');
  host.hidden = !chips.length;
  host.innerHTML = chips.map(([k, v, label]) => `<span class="chip-f">${esc(label)}<button type="button" aria-label="Remove filter ${esc(label)}" data-unfilter="${k}" data-unvalue="${esc(v)}">&times;</button></span>`).join('')
    + (chips.length > 1 ? '<span class="chip-f clear" data-unfilter="all">Clear all</span>' : '');
}
function syncPayControls() {
  document.querySelectorAll('#payPurpose button').forEach((b) => b.setAttribute('aria-pressed', String(pay.purpose.has(b.dataset.value))));
  document.querySelectorAll('#payStatus button').forEach((b) => b.setAttribute('aria-pressed', String(pay.status.has(b.dataset.value))));
  document.querySelectorAll('#payPeriod button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === pay.period)));
  $('payDates').hidden = pay.period !== 'custom';
  $('payFrom').value = pay.from; $('payTo').value = pay.to; $('payMin').value = pay.min; $('payMax').value = pay.max; $('paySort').value = pay.sort;
  drawPayChips();
}
function payReload() { pay.offset = 0; syncPayControls(); load(true); }
$('payPurpose').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; pay.purpose.has(b.dataset.value) ? pay.purpose.delete(b.dataset.value) : pay.purpose.add(b.dataset.value); payReload(); });
$('payStatus').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; pay.status.has(b.dataset.value) ? pay.status.delete(b.dataset.value) : pay.status.add(b.dataset.value); payReload(); });
$('payPeriod').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; pay.period = b.dataset.value; if (pay.period === 'custom') { syncPayControls(); $('payFrom').focus(); return; } payReload(); });
['payFrom', 'payTo'].forEach((id) => $(id).addEventListener('change', () => { pay.from = $('payFrom').value; pay.to = $('payTo').value; if (pay.from || pay.to) payReload(); }));
let amountTimer = 0;
['payMin', 'payMax'].forEach((id) => $(id).addEventListener('input', () => { clearTimeout(amountTimer); amountTimer = setTimeout(() => { pay.min = $('payMin').value; pay.max = $('payMax').value; payReload(); }, 450); }));
$('paySort').addEventListener('change', () => { pay.sort = $('paySort').value; payReload(); });
$('payChips').addEventListener('click', (e) => {
  const b = e.target.closest('[data-unfilter]'); if (!b) return;
  const k = b.dataset.unfilter, v = b.dataset.unvalue;
  if (k === 'all') { pay.purpose.clear(); pay.status.clear(); pay.period = '30'; pay.from = pay.to = pay.min = pay.max = ''; pay.sort = 'newest'; $('adminQuery').value = ''; }
  else if (k === 'purpose') pay.purpose.delete(v);
  else if (k === 'status') pay.status.delete(v);
  else if (k === 'period') { pay.period = '30'; pay.from = pay.to = ''; }
  else if (k === 'min') pay.min = '';
  else if (k === 'max') pay.max = '';
  else if (k === 'sort') pay.sort = 'newest';
  else if (k === 'q') $('adminQuery').value = '';
  payReload();
});
$('payExport').addEventListener('click', async () => {
  const params = new URLSearchParams({ type: 'payments', format: 'csv' });
  const q = $('adminQuery').value.trim(); if (q) params.set('q', q);
  payParams(params);
  $('payExport').disabled = true;
  try {
    const token = await auth.currentUser.getIdToken();
    const response = await fetch('/api/admin/records?' + params.toString(), { headers: { Authorization: 'Bearer ' + token } });
    if (!response.ok) throw new Error('The export could not be prepared.');
    const blob = await response.blob();
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = (response.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/)?.[1] || 'pfa-payments.csv';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch (error) {
    $('recordsMsg').textContent = error.message; $('recordsMsg').classList.add('is-error');
  } finally { $('payExport').disabled = false; }
});
function drawPaySummary(sum, capped) {
  const host = $('paySummary');
  if (!sum) { host.hidden = true; return; }
  host.hidden = false;
  host.innerHTML = `<span><b>${fmt.int(sum.count)}</b>${sum.count === 1 ? 'payment' : 'payments'}</span>`
    + `<span><b class="good">${fmt.inr(sum.paidInr)}</b>paid in ${fmt.int(sum.paidCount)}${sum.paidUsd ? ` (+ $${fmt.int(sum.paidUsd)})` : ''}</span>`
    + (sum.failed ? `<span><b class="bad">${fmt.int(sum.failed)}</b>failed</span>` : '')
    + (sum.unverified ? `<span><b class="bad">${fmt.int(sum.unverified)}</b>unverified</span>` : '')
    + (sum.abandoned ? `<span><b class="warn">${fmt.int(sum.abandoned)}</b>abandoned</span>` : '')
    + (sum.started ? `<span><b>${fmt.int(sum.started)}</b>started</span>` : '')
    + (capped ? '<span style="margin-left:auto">Totals cover the most recent 2,000 in this period.</span>' : '');
}

async function load(reset) {
  if (reset) { state.cursor = null; state.rows = []; $('tableHost').innerHTML = '<div class="table-wrap"><div class="empty">Loading&hellip;</div></div>'; }
  $('recordsMsg').textContent = '';
  $('recordsMsg').classList.remove('is-error');
  $('pageStamp').textContent = '';
  const term = $('adminQuery').value.trim();
  const params = new URLSearchParams({ type: state.register, limit: '25' });
  if (term) params.set('q', term);
  if (state.register === 'submissions') {
    if ($('filterKind').value) params.set('kind', $('filterKind').value);
    if (state.subStatus) params.set('status', state.subStatus);
  }
  if (state.register === 'payments') payParams(params);
  if (state.cursor && (!term || state.register === 'payments') && !(state.register === 'payments' && pay.sort !== 'newest')) params.set('cursor', state.cursor);

  try {
    const data = await call('/api/admin/records?' + params.toString());
    state.rows = reset ? data.rows : state.rows.concat(data.rows);
    state.cursor = data.cursor || null;
    if (state.register === 'payments') { if (data.offset !== undefined) pay.offset = data.offset; if (reset) drawPaySummary(data.summary, data.capped); }
    $('tableHost').innerHTML = table(state.rows);
    $('adminMore').hidden = Boolean(data.done) || (!state.cursor && !(state.register === 'payments' && pay.sort !== 'newest'));
    $('pageStamp').textContent = state.rows.length ? `${fmt.int(state.rows.length)} shown${data.done || term ? '' : ' \u00b7 more below'}` : '';
    if (data.message) $('recordsMsg').textContent = data.message;
  } catch (error) {
    $('tableHost').innerHTML = '';
    $('recordsMsg').textContent = error.message;
    $('recordsMsg').classList.add('is-error');
  }
}

$('adminSearch').addEventListener('click', () => load(true));
$('adminQuery').addEventListener('keydown', (event) => { if (event.key === 'Enter') load(true); });
$('adminClear').addEventListener('click', () => { $('adminQuery').value = ''; load(true); });
$('adminMore').addEventListener('click', () => load(false));
$('filterKind').addEventListener('change', () => load(true));

/* ---- verification ----------------------------------------------------- */
$('verifyGo').addEventListener('click', async () => {
  const id = $('verifyId').value.trim().toUpperCase();
  if (!id) { $('verifyId').focus(); return; }
  $('verifyOut').innerHTML = '<div class="empty">Checking&hellip;</div>';
  try {
    const response = await fetch('/api/verify-card?id=' + encodeURIComponent(id));
    const data = await response.json();
    if (!data.found) {
      $('verifyOut').innerHTML = `<div class="verify-card"><div class="empty"><b>No live card</b>${esc(data.message || 'No live card carries that number.')}</div></div>`;
      return;
    }
    $('verifyOut').innerHTML = `<div class="verify-card">
      <div class="vc-top"><b>${esc(data.cardId)}</b>${statusPill('card', data.status)}</div>
      <dl>
        <dt>Type</dt><dd>${esc(data.cardType)}</dd>
        <dt>Holder</dt><dd>${esc(personName(data.name))}</dd>
        <dt>Valid until</dt><dd class="mono">${date(data.validUntil)}</dd>
      </dl></div>`;
  } catch (error) {
    $('verifyOut').innerHTML = '<div class="verify-card"><div class="empty"><b>Could not check</b>The verification service did not answer. Try again.</div></div>';
  }
});
$('verifyId').addEventListener('keydown', (event) => { if (event.key === 'Enter') $('verifyGo').click(); });

/* ---- the circle ------------------------------------------------------- */
const whenMs = (ms) => ms ? new Date(ms).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '';

function loadCircle() {
  return $('circleScope').value === 'profiles' ? loadCircleProfiles() : loadCirclePosts();
}

async function loadCirclePosts() {
  $('circleMsg').textContent = '';
  $('circleList').innerHTML = '<div class="empty">Loading&hellip;</div>';
  try {
    const q = $('circleQuery').value.trim();
    const data = await call('/api/admin/circle?action=posts&limit=60' + (q ? '&q=' + encodeURIComponent(q) : ''));
    const posts = data.posts || [];
    $('pageStamp').textContent = posts.length ? `${fmt.int(posts.length)} posts` : '';
    if (!posts.length) {
      $('circleList').innerHTML = `<div class="empty"><b>${q ? 'Nothing matches' : 'No posts yet'}</b>${q ? 'Try a name, a member number or a word from the post.' : 'Posts appear here as members write them.'}</div>`;
      return;
    }
    $('circleList').innerHTML = posts.map((p) => `
      <div class="circle-row" data-post="${esc(p.id)}">
        <div class="circle-row-head">
          <span class="mono">${whenMs(p.at)}</span>
          <span><strong>${esc(p.authorName || 'Unnamed')}</strong> &middot; <span class="mono">${esc(p.authorId)}</span></span>
          <span>${esc(p.circleId)} &middot; ${esc(p.kind)}${p.closed ? ' &middot; closed' : ''}</span>
        </div>
        <p class="circle-row-text">${esc(p.text)}</p>
        <div class="circle-row-actions">
          <button class="btn light" data-replies="${esc(p.id)}" type="button">Replies (${p.replyCount})</button>
          <button class="btn light circle-danger" data-del-post="${esc(p.id)}" type="button">Delete post</button>
        </div>
        <div class="circle-replies" hidden></div>
      </div>`).join('');
  } catch (error) {
    $('circleList').innerHTML = '';
    $('circleMsg').textContent = error.message;
  }
}

async function loadCircleProfiles() {
  $('circleMsg').textContent = '';
  $('circleList').innerHTML = '<div class="empty">Loading&hellip;</div>';
  try {
    const q = $('circleQuery').value.trim();
    const data = await call('/api/admin/circle?action=profiles' + (q ? '&q=' + encodeURIComponent(q) : ''));
    const profiles = data.profiles || [];
    $('pageStamp').textContent = profiles.length ? `${fmt.int(profiles.length)} members` : '';
    if (!profiles.length) {
      $('circleList').innerHTML = `<div class="empty"><b>${q ? 'Nothing matches' : 'Nobody has joined yet'}</b>${q ? 'Try a name or a member number.' : 'Members appear here once they set up a Circle profile.'}</div>`;
      return;
    }
    const chip = (p) =>
      p.standing === 'active' ? pill('good', 'Active') :
      p.standing === 'grace'  ? pill('warn', 'Grace \u00b7 ' + p.graceDaysLeft + 'd left') :
      p.standing === 'ended'  ? pill('bad', 'Ended') : pill('', 'No record');
    $('circleList').innerHTML = profiles.map((p) => `
      <div class="circle-row">
        <div class="circle-row-head">
          <span><strong>${esc(personName(p.name) || 'Unnamed')}</strong> &middot; ${esc(p.handle || '')}</span>
          <span class="mono">${esc(p.id)}</span>
          <span>${esc([p.city, p.state].filter(Boolean).join(', '))}</span>
          ${chip(p)}
        </div>
        <div class="circle-row-actions">
          <button class="btn light" data-extend="${esc(p.id)}" type="button">Extend 1 year</button>
          <button class="btn light circle-danger" data-remove="${esc(p.id)}" type="button">Remove from Circle</button>
        </div>
      </div>`).join('');
  } catch (error) {
    $('circleList').innerHTML = '';
    $('circleMsg').textContent = error.message;
  }
}

$('circleList').addEventListener('click', async (event) => {
  const b = event.target.closest('button');
  if (!b) return;
  $('circleMsg').textContent = '';
  try {
    if (b.dataset.replies) {
      const row = b.closest('.circle-row');
      const box = row.querySelector('.circle-replies');
      if (!box.hidden) { box.hidden = true; return; }
      box.hidden = false;
      box.innerHTML = '<div class="empty">Loading&hellip;</div>';
      const data = await call('/api/admin/circle?action=replies&post=' + encodeURIComponent(b.dataset.replies));
      const replies = data.replies || [];
      box.innerHTML = replies.length ? replies.map((r) => `
        <div class="circle-reply">
          <span class="mono">${whenMs(r.at)}</span> &middot; <strong>${esc(r.authorName || r.authorId)}</strong>
          <p>${esc(r.text)}</p>
          <button class="btn light circle-danger" data-del-reply="${esc(r.id)}" data-of="${esc(b.dataset.replies)}" type="button">Delete reply</button>
        </div>`).join('') : '<div class="empty">No replies.</div>';
      return;
    }
    if (b.dataset.delPost) {
      if (!confirm('Delete this post and all its replies? This cannot be undone.')) return;
      const out = await post('/api/admin/circle', { action: 'delete-post', id: b.dataset.delPost });
      $('circleMsg').textContent = 'Post removed' + (out.replies ? ' with ' + out.replies + ' replies.' : '.');
      return loadCirclePosts();
    }
    if (b.dataset.delReply) {
      if (!confirm('Delete this reply? This cannot be undone.')) return;
      await post('/api/admin/circle', { action: 'delete-reply', post: b.dataset.of, id: b.dataset.delReply });
      $('circleMsg').textContent = 'Reply removed.';
      return loadCirclePosts();
    }
    if (b.dataset.extend) {
      if (!confirm('Extend this membership by one year from today or its current expiry, whichever is later?')) return;
      const out = await post('/api/admin/circle', { action: 'extend-membership', id: b.dataset.extend, months: 12 });
      $('circleMsg').textContent = 'Membership now valid until ' + new Date(out.validUntil).toLocaleDateString('en-IN', { dateStyle: 'long' }) + '.';
      return loadCircleProfiles();
    }
    if (b.dataset.remove) {
      const purge = confirm('Also delete everything this member has posted?\n\nOK removes their posts and replies too. Cancel removes only their profile and keeps what they wrote.');
      if (!confirm('Remove ' + b.dataset.remove + ' from the Circle' + (purge ? ' and delete all their content' : '') + '? This cannot be undone.')) return;
      const out = await post('/api/admin/circle', { action: 'remove-profile', id: b.dataset.remove, purge });
      $('circleMsg').textContent = 'Removed.' + (purge ? ' Deleted ' + out.postsRemoved + ' posts and ' + out.repliesRemoved + ' replies.' : '');
      return loadCircleProfiles();
    }
  } catch (error) {
    $('circleMsg').textContent = error.message;
  }
});
$('circleRefresh').addEventListener('click', loadCircle);
$('circleQuery').addEventListener('keydown', (event) => { if (event.key === 'Enter') loadCircle(); });
$('circleScope').addEventListener('change', loadCircle);

/* ---- import the membership register ----------------------------------- */
/* The sheet is read in the browser, so member names and numbers are never
   handed to a third party just to be parsed. Only the mapped columns are
   sent, and only to PFA's own API. */

let importRows = [];
let importHeaders = [];

/* One cell holding "Anirban Roy", a mobile and an email, in any order and
   with any separator. Pull each out by what it looks like, not where it sits. */
function splitContactCell(value) {
  let text = String(value == null ? '' : value).replace(/\r/g, ' ');
  let email = '';
  const em = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  if (em) { email = em[0].toLowerCase(); text = text.replace(em[0], ' '); }
  let mobile = '';
  const runs = text.match(/\d[\d\s-]{8,}\d/g) || [];
  for (const run of runs) {
    let d = run.replace(/\D/g, '');
    if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
    else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
    else if (d.length > 10) d = d.slice(-10);
    if (/^[6-9]\d{9}$/.test(d)) { mobile = d; text = text.replace(run, ' '); break; }
  }
  const name = text.replace(/\d+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^[,.\-|/]+|[,.\-|/]+$/g, '');
  return { name, mobile, email };
}

const FIELDS = [
  ['name',        'Full name',        true,  ['name (split)', 'name', 'full name', 'member name', 'membername']],
  ['mobile',      'Mobile number',    true,  ['mobile (split)', 'mobile', 'phone', 'contact', 'mobile no', 'phone no', 'mobile number']],
  ['email',       'Email',            false, ['email (split)', 'email', 'e-mail', 'email id', 'mail']],
  ['memberSince', 'Member since',     false, ['member since', 'joined', 'join date', 'date of joining', 'since']],
  ['validUntil',  'Valid until',      false, ['valid until', 'valid till', 'expiry', 'expires', 'renewal', 'renewal date']],
  ['legacyId',    'Existing number',  false, ['membership number', 'member no', 'member number', 'membership no', 'card no', 'id']]
];

function guessColumn(field, headers) {
  const hints = FIELDS.find((f) => f[0] === field)[3];
  const lower = headers.map((h) => String(h).toLowerCase().trim());
  for (const hint of hints) {
    const i = lower.indexOf(hint);
    if (i > -1) return headers[i];
  }
  for (const hint of hints) {
    const i = lower.findIndex((h) => h.includes(hint));
    if (i > -1) return headers[i];
  }
  return '';
}

function drawMapping() {
  $('importMapFields').innerHTML = FIELDS.map(([key, label, required]) => `
    <label class="import-map-row">
      <span>${label}${required ? ' *' : ''}</span>
      <select data-map="${key}">
        <option value="">Not in this sheet</option>
        ${importHeaders.map((h) => `<option value="${esc(h)}">${esc(h)}</option>`).join('')}
      </select>
    </label>`).join('');
  FIELDS.forEach(([key]) => {
    const sel = document.querySelector(`[data-map="${key}"]`);
    sel.value = guessColumn(key, importHeaders) || '';
  });
  $('importMap').hidden = false;
}

function mappedRows() {
  const map = {};
  document.querySelectorAll('[data-map]').forEach((s) => { map[s.dataset.map] = s.value; });
  return importRows.map((row, i) => {
    const out = { __line: i + 2 };
    Object.keys(map).forEach((k) => { if (map[k]) out[k] = row[map[k]]; });
    return out;
  });
}

$('importFile').addEventListener('change', async () => {
  const file = $('importFile').files[0];
  $('importMsg').textContent = '';
  $('importMsg').classList.remove('is-error');
  $('importSummary').innerHTML = '';
  $('importRows').innerHTML = '';
  $('importGo').disabled = true;
  if (!file) return;
  try {
    $('importMsg').textContent = 'Reading the sheet\u2026';
    /* The spreadsheet parser is the one thing fetched from outside, and only
       when a file is chosen. If it cannot be reached, the message says so. */
    let XLSX;
    try {
      XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs');
    } catch (loadError) {
      throw new Error('The spreadsheet reader could not be downloaded (cdn.sheetjs.com). Check the connection or any blocker, then choose the file again.');
    }
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { cellDates: true });

    /* PFA's own register is not a tidy table. It is 22 sheets, one per
       state plus a payments sheet, the heading is not always on the first
       row, and the name, mobile and email of a member sit together in a
       single cell separated by line breaks or just spaces. Reading only
       sheet one and trusting row one would silently import a fraction of
       the register, so every sheet is read and the crammed cell is taken
       apart by pattern rather than by position. */
    importRows = [];
    const sheetsRead = [];
    wb.SheetNames.forEach((sheetName) => {
      const grid = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '', raw: false, blankrows: false });
      if (!grid.length) return;
      let head = 0;
      for (let i = 0; i < Math.min(6, grid.length); i++) {
        if (grid[i].some((c) => /name|member/i.test(String(c)))) { head = i; break; }
      }
      const headers = grid[head].map((h, i) => String(h).trim() || ('Column ' + (i + 1)));
      const body = grid.slice(head + 1);
      body.forEach((r) => {
        if (!r.some((c) => String(c).trim())) return;
        const row = { __sheet: sheetName };
        headers.forEach((h, i) => { row[h] = r[i] == null ? '' : r[i]; });
        importRows.push(row);
      });
      if (body.length) sheetsRead.push(sheetName);
    });

    if (!importRows.length) { $('importMsg').textContent = 'No rows found in that file.'; return; }

    const keys = new Set();
    importRows.forEach((r) => Object.keys(r).forEach((k) => { if (k !== '__sheet') keys.add(k); }));
    importHeaders = [...keys];

    /* If any column holds a name, a mobile and an email together, split it
       into three real columns so the mapping below has something to map. */
    const combined = importHeaders.find((h) =>
      importRows.filter((r) => /@/.test(String(r[h])) && /\d{10}/.test(String(r[h]).replace(/\D/g, ''))).length > importRows.length * 0.2);
    if (combined) {
      importRows.forEach((r) => {
        const parts = splitContactCell(r[combined]);
        r['Name (split)'] = parts.name;
        r['Mobile (split)'] = parts.mobile;
        r['Email (split)'] = parts.email;
      });
      importHeaders.push('Name (split)', 'Mobile (split)', 'Email (split)');
    }

    drawMapping();
    $('importCheck').disabled = false;
    $('importMsg').textContent = importRows.length + ' rows read from ' + sheetsRead.length +
      ' sheet' + (sheetsRead.length === 1 ? '' : 's') +
      (combined ? ', and the combined name/mobile/email column was split for you' : '') +
      '. Nothing has been saved.';
  } catch (error) {
    $('importMsg').textContent = 'Could not read that file: ' + error.message;
    $('importMsg').classList.add('is-error');
  }
});

function summaryCard(s, dry) {
  return `<div class="import-summary">
    <div><strong>${s.create}</strong><span>new members</span></div>
    <div><strong>${s.update}</strong><span>already on the register</span></div>
    <div><strong>${s.duplicate}</strong><span>repeated in the sheet</span></div>
    <div class="${s.error ? 'bad' : ''}"><strong>${s.error}</strong><span>rows with a problem</span></div>
    <div class="${s.noEmail ? 'warn' : ''}"><strong>${s.noEmail}</strong><span>no email, cannot sign in</span></div>
  </div>${dry ? '<p class="note">Nothing has been saved yet.</p>' : ''}`;
}

function rowTable(results) {
  const notable = results.filter((r) => r.status === 'error' || r.status === 'duplicate' || !r.canSignIn);
  if (!notable.length) return '<p class="note">Every row is clean.</p>';
  return '<div class="import-rows">' + notable.slice(0, 200).map((r) => `
    <div class="import-row ${r.status === 'error' ? 'bad' : r.status === 'duplicate' ? 'warn' : ''}">
      <span>Row ${r.line}</span>
      <span>${esc(r.name || '')}</span>
      <span>${esc(r.reason || (r.canSignIn === false ? 'No email, so this member cannot be sent a sign-in code.' : ''))}</span>
    </div>`).join('') + '</div>';
}

async function runImport(dryRun) {
  const rows = mappedRows();
  const missing = FIELDS.filter(([k, , req]) => req && !document.querySelector(`[data-map="${k}"]`).value);
  if (missing.length) {
    $('importMsg').textContent = 'Choose which column holds the ' + missing.map((m) => m[1].toLowerCase()).join(' and the ') + '.';
    return null;
  }
  $('importMsg').textContent = dryRun ? 'Checking\u2026' : 'Importing\u2026';
  const merged = { rows: 0, create: 0, update: 0, duplicate: 0, error: 0, noEmail: 0 };
  let all = [];
  for (let i = 0; i < rows.length; i += 400) {
    const res = await post('/api/admin/import-members', { rows: rows.slice(i, i + 400), dryRun });
    Object.keys(merged).forEach((k) => { merged[k] += res.summary[k] || 0; });
    all = all.concat(res.results || []);
    $('importMsg').textContent = (dryRun ? 'Checking' : 'Importing') + ' ' + Math.min(i + 400, rows.length) + ' of ' + rows.length + '\u2026';
  }
  $('importSummary').innerHTML = summaryCard(merged, dryRun);
  $('importRows').innerHTML = rowTable(all);
  $('importMsg').textContent = dryRun
    ? 'Checked. Read the numbers above, then press Import for real.'
    : 'Imported. ' + merged.create + ' added, ' + merged.update + ' updated.';
  return merged;
}

$('importCheck').addEventListener('click', async () => {
  try {
    const s = await runImport(true);
    if (s) $('importGo').disabled = (s.create + s.update) === 0;
  } catch (error) { $('importMsg').textContent = error.message; $('importMsg').classList.add('is-error'); }
});

$('importGo').addEventListener('click', async () => {
  if (!confirm('Import this sheet into the live membership register?')) return;
  try {
    $('importGo').disabled = true;
    await runImport(false);
  } catch (error) { $('importMsg').textContent = error.message; $('importMsg').classList.add('is-error'); }
});

/* ---- block 6 of 8 ---- */
/* ---- issue cards ------------------------------------------------------- */
/* The cards are drawn here, in this browser, by the same two files the
   public site draws them with - assets/patron-card-pdf.js for the Patron
   card and assets/caretaker-card.js for the Caretaker card. There is no
   second design. The server supplies the register rows, sends the emails and
   records what was printed.

   Photographs never leave the office: files chosen with "Add photos" are
   matched to card numbers by their file name and drawn into the PDF on this
   machine. Nothing is uploaded. */

const cards = { type: 'patron', filter: 'unsent', rows: [], selected: new Set(), photos: new Map(), busy: false, mailConfigured: true };
const PDF_BATCH = 50;

function cardsFilterLabels(type) {
  const f = $('cardFilter');
  f.querySelector('[data-filter="unsent"]').textContent = type === 'patron' ? 'Not yet emailed' : 'Not emailed from here';
}

async function loadCards() {
  if (cards.busy) return;
  $('cardsMsg').textContent = '';
  $('cardsMsg').classList.remove('is-error');
  $('pageStamp').textContent = 'Loading\u2026';
  $('cardsHost').innerHTML = '<div class="table-wrap"><div class="empty">Loading the register&hellip;</div></div>';
  try {
    const q = $('cardQuery').value.trim();
    const data = await call('/api/admin/cards?type=' + cards.type + '&filter=' + cards.filter + (q ? '&q=' + encodeURIComponent(q) : ''));
    cards.rows = data.rows || [];
    cards.mailConfigured = data.mailConfigured !== false;
    /* The filter already says who; everyone it returns starts selected, so
       the common case is one click. Untick the exceptions. */
    cards.selected = new Set(cards.rows.map((r) => r.id));
    drawCards();
    const notes = [];
    if (data.capped) notes.push(`Showing the first ${fmt.int(data.registerTotal)} on the register; search to reach the rest.`);
    if (!cards.mailConfigured) notes.push('Email is not set up on the server yet (PFA_MAIL_API_KEY), so cards can be downloaded but not emailed from here.');
    $('cardsMsg').textContent = notes.join(' ');
    $('pageStamp').textContent = `${fmt.int(cards.rows.length)} of ${fmt.int(data.registerTotal)} on the register`;
  } catch (error) {
    $('cardsHost').innerHTML = '';
    $('cardsMsg').textContent = error.message;
    $('cardsMsg').classList.add('is-error');
    $('pageStamp').textContent = '';
  }
}

function cardTags(r) {
  const t = [];
  if (r.state === 'expired') t.push('<span class="tag bad">Expired</span>');
  if (r.state === 'revoked') t.push('<span class="tag bad">Revoked</span>');
  if (r.emailedAt) t.push(`<span class="tag good">Emailed <small>${esc(date(r.emailedAt))}</small></span>`);
  else if (!r.email) t.push('<span class="tag warn">No email</span>');
  if (r.printedAt || r.printed) t.push(`<span class="tag info">Printed${r.printedAt ? ` <small>${esc(date(r.printedAt))}</small>` : ''}</span>`);
  if (cards.photos.has(r.id)) t.push('<span class="tag good">Photo</span>');
  if (cards.type === 'patron' && !(r.addressLines || []).length) t.push('<span class="tag">No address</span>');
  return `<div class="tags">${t.join('')}</div>`;
}

function drawCards() {
  const rows = cards.rows;
  if (!rows.length) {
    const why = { unsent: 'Everyone in this list has been emailed their card.', unprinted: 'Every card in this list has been printed.', current: 'Nobody current on this register yet.', all: 'Nobody on this register yet.' }[cards.filter];
    $('cardsHost').innerHTML = `<div class="table-wrap"><div class="empty"><b>Nothing to issue</b>${esc(why)}</div></div>`;
    updateSelection();
    return;
  }
  const all = rows.every((r) => cards.selected.has(r.id));
  $('cardsHost').innerHTML = `<div class="table-wrap"><table class="cards-table"><thead><tr>
      <th><input type="checkbox" id="selAll" aria-label="Select everyone shown"${all ? ' checked' : ''}></th>
      <th>Name</th><th>Number</th><th>${cards.type === 'patron' ? 'Member since' : 'Issued'}</th><th>Valid until</th><th>Card</th>
    </tr></thead><tbody>` + rows.map((r) => `
      <tr class="${cards.selected.has(r.id) ? '' : 'off'}">
        <td><input type="checkbox" data-sel="${esc(r.id)}" aria-label="Select ${esc(r.name)}"${cards.selected.has(r.id) ? ' checked' : ''}></td>
        <td>${esc(r.name || '\u2014')}<span class="sub">${esc(r.email || r.mobile || 'no contact')}${r.email && r.mobile ? ' \u00b7 ' + esc(r.mobile) : ''}</span></td>
        <td class="mono">${esc(r.id)}</td>
        <td class="mono">${date(cards.type === 'patron' ? r.since : r.issuedAt)}</td>
        <td class="mono">${date(r.valid)}</td>
        <td>${cardTags(r)}</td>
      </tr>`).join('') + '</tbody></table></div>';
  updateSelection();
}

function updateSelection() {
  const n = cards.rows.filter((r) => cards.selected.has(r.id)).length;
  const withEmail = cards.rows.filter((r) => cards.selected.has(r.id) && r.email).length;
  $('selCount').textContent = fmt.int(n);
  $('selNote').textContent = n === 1 ? 'card selected' : 'cards selected' + (n && withEmail < n ? ` \u00b7 ${fmt.int(n - withEmail)} without an email address` : '');
  const off = cards.busy || n === 0;
  $('actPdf').disabled = off;
  $('actEmail').disabled = off || withEmail === 0 || !cards.mailConfigured;
  $('actBoth').disabled = off || withEmail === 0 || !cards.mailConfigured;
}

$('cardsHost').addEventListener('change', (event) => {
  const t = event.target;
  if (t.id === 'selAll') {
    if (t.checked) cards.rows.forEach((r) => cards.selected.add(r.id)); else cards.selected.clear();
    drawCards();
  } else if (t.dataset.sel) {
    if (t.checked) cards.selected.add(t.dataset.sel); else cards.selected.delete(t.dataset.sel);
    t.closest('tr').classList.toggle('off', !t.checked);
    updateSelection();
  }
});
$('cardType').addEventListener('click', (event) => {
  const b = event.target.closest('button'); if (!b || cards.busy) return;
  cards.type = b.dataset.type; cards.filter = 'unsent';
  document.querySelectorAll('#cardType button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  document.querySelectorAll('#cardFilter button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.filter === 'unsent')));
  cardsFilterLabels(cards.type);
  loadCards();
});
$('cardFilter').addEventListener('click', (event) => {
  const b = event.target.closest('button'); if (!b || cards.busy) return;
  cards.filter = b.dataset.filter;
  document.querySelectorAll('#cardFilter button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  loadCards();
});
$('cardQuery').addEventListener('keydown', (event) => { if (event.key === 'Enter') loadCards(); });

/* ---- photographs, matched by file name ----------------------------------- */
function idStem(value) { return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

$('photoFiles').addEventListener('change', async () => {
  const files = [...$('photoFiles').files];
  if (!files.length) return;
  const C = window.PFACaretakerCard;
  if (!C) { $('cardsMsg').textContent = 'The card renderer has not loaded yet. Try again in a moment.'; return; }
  $('photoCount').textContent = '\u2026';
  const ids = cards.rows.map((r) => r.id).concat([...cards.photos.keys()]);
  let matched = 0; const unmatched = [];
  for (const file of files) {
    const stem = idStem(file.name.replace(/\.[a-z0-9]+$/i, ''));
    const id = ids.find((i) => stem.includes(idStem(i)));
    if (!id) { unmatched.push(file.name); continue; }
    try {
      cards.photos.set(id, await C.normalisePhoto(file, 1400));
      matched += 1;
    } catch (error) { unmatched.push(file.name); }
  }
  $('photoCount').textContent = cards.photos.size ? `${fmt.int(cards.photos.size)} \u2713` : '';
  $('cardsMsg').textContent = `${fmt.int(matched)} ${matched === 1 ? 'photograph' : 'photographs'} matched by card number.`
    + (unmatched.length ? ` Not matched (name the file after the card number): ${unmatched.slice(0, 5).join(', ')}${unmatched.length > 5 ? ` and ${unmatched.length - 5} more` : ''}.` : '')
    + ' Photographs stay on this computer.';
  $('photoFiles').value = '';
  drawCards();
});

/* ---- drawing ------------------------------------------------------------- */
function readyRenderers() {
  const ok = window.PFACaretakerCard && window.PFAPatronCard && window.PFACardFields && window.PFAQR;
  if (!ok) throw new Error('The card renderers have not finished loading. Wait a moment and try again.');
}

/* Two pages, front and back, at the chosen density, through the public
   site's own renderer for that card. */
async function renderPages(r, dpi) {
  const C = window.PFACaretakerCard;
  const photo = cards.photos.get(r.id) || '';
  if (cards.type === 'patron') {
    const P = window.PFAPatronCard;
    const full = await P.hydrate({
      id: r.id, name: r.name, since: r.since, valid: r.valid, photo,
      addressLines: r.addressLines || [], standing: r.state === 'expired' ? 'Expired' : 'Patron'
    });
    /* A placeholder address is for previews. A card being issued with no
       address on record carries a blank block, not "Address line". */
    if (full.ghost && full.ghost.address) full.addressLines = [{ text: '', ghost: false }];
    return ['front', 'back'].map((side) => {
      const canvas = P.offscreen(side, full, dpi);
      return { width: canvas.width, height: canvas.height, bytes: C.jpegBytes(canvas, 0.92), wMm: P.CARD.w, hMm: P.CARD.h, canvas };
    });
  }
  const assets = await C.loadAssets();
  const issued = r.issuedAt ? new Date(r.issuedAt) : new Date();
  const full = await C.hydrate({
    cardId: r.id, name: r.name, address: r.address, mobile: r.mobile, email: r.email, photo,
    issuedOn: C.issuedOnLabel(issued), year: issued.getFullYear(),
    qr: location.origin + '/caretaker-card.html?id=' + encodeURIComponent(r.id)
  });
  return ['front', 'back'].map((side) => {
    const canvas = document.createElement('canvas');
    C.draw(canvas, side, full, assets, C.CARD.w * dpi / 25.4, 1);
    return { width: canvas.width, height: canvas.height, bytes: C.jpegBytes(canvas, 0.92), canvas };
  });
}

function runBox(title, total) {
  const host = $('cardRun');
  host.hidden = false;
  host.innerHTML = `<div class="run"><div class="run-head"><h3>${esc(title)}</h3><span id="runStamp">0 / ${fmt.int(total)}</span></div>
    <div class="bar"><i id="runBar"></i></div><p id="runText">Starting\u2026</p><div class="preview-strip" id="runStrip" hidden></div><div id="runOut"></div></div>`;
  return {
    step(done, text) {
      $('runStamp').textContent = `${fmt.int(done)} / ${fmt.int(total)}`;
      $('runBar').style.width = (100 * done / Math.max(1, total)).toFixed(1) + '%';
      if (text) $('runText').textContent = text;
    },
    preview(canvas) {
      const strip = $('runStrip'); strip.hidden = false;
      if (strip.children.length >= 8) strip.removeChild(strip.firstChild);
      strip.appendChild(canvas);
    },
    done(text, html) {
      host.querySelector('.run').classList.add('done');
      $('runText').textContent = text;
      if (html) $('runOut').innerHTML = html;
    }
  };
}

function selectedRows() { return cards.rows.filter((r) => cards.selected.has(r.id)); }

async function makePdfs(rows, dpi, box) {
  const C = window.PFACaretakerCard;
  const stem = cards.type === 'patron' ? 'pfa-patron-cards' : 'pfa-caretaker-cards';
  const files = [];
  let pages = [], from = 1, done = 0;
  for (const r of rows) {
    const two = await renderPages(r, dpi);
    pages.push(...two.map((p) => ({ width: p.width, height: p.height, bytes: p.bytes, wMm: p.wMm, hMm: p.hMm })));
    const small = document.createElement('canvas');
    small.width = Math.round(two[0].width / 4); small.height = Math.round(two[0].height / 4);
    small.getContext('2d').drawImage(two[0].canvas, 0, 0, small.width, small.height);
    box.preview(small);
    done += 1;
    box.step(done, `Drawing ${esc(r.name || r.id)}\u2026`);
    if (pages.length / 2 >= PDF_BATCH || done === rows.length) {
      const name = rows.length > PDF_BATCH ? `${stem}-${String(from).padStart(3, '0')}-${String(done).padStart(3, '0')}.pdf` : `${stem}.pdf`;
      C.saveBlob(C._buildPdf(pages), name);
      files.push(name);
      pages = []; from = done + 1;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return files;
}

async function recordPrinted(ids) {
  const done = [];
  for (let i = 0; i < ids.length; i += 25) {
    const out = await post('/api/admin/cards', { action: 'printed', type: cards.type, ids: ids.slice(i, i + 25) });
    done.push(...(out.results || []));
  }
  return done;
}

async function emailCards(rows, box, offset, total) {
  const results = [];
  for (let i = 0; i < rows.length; i += 20) {
    const chunk = rows.slice(i, i + 20);
    const out = await post('/api/admin/cards', { action: 'email', type: cards.type, ids: chunk.map((r) => r.id) });
    results.push(...(out.results || []));
    box.step(offset + Math.min(i + 20, rows.length), `Emailing\u2026 ${fmt.int(results.filter((x) => x.ok).length)} sent`);
  }
  return results;
}

async function runCards(mode) {
  if (cards.busy) return;
  const rows = selectedRows();
  if (!rows.length) return;
  const withEmail = rows.filter((r) => r.email);
  const wantsEmail = mode === 'email' || mode === 'both';
  const wantsPdf = mode === 'pdf' || mode === 'both';
  if (wantsEmail && !confirm(`Email ${fmt.int(withEmail.length)} ${cards.type === 'patron' ? 'Patron' : 'Caretaker'} ${withEmail.length === 1 ? 'card' : 'cards'} now?${withEmail.length < rows.length ? `\n\n${fmt.int(rows.length - withEmail.length)} selected have no email address and will be skipped.` : ''}`)) return;
  try { readyRenderers(); } catch (error) { $('cardsMsg').textContent = error.message; $('cardsMsg').classList.add('is-error'); return; }

  cards.busy = true; updateSelection();
  const dpi = Number($('pdfDpi').value) || 300;
  const total = (wantsPdf ? rows.length : 0) + (wantsEmail ? withEmail.length : 0);
  const box = runBox(mode === 'pdf' ? 'Making the PDF' : mode === 'email' ? 'Emailing cards' : 'Making the PDF and emailing', total);
  const summary = [];
  try {
    let files = [];
    if (wantsPdf) {
      files = await makePdfs(rows, dpi, box);
      const printed = await recordPrinted(rows.map((r) => r.id));
      summary.push(`<li>${fmt.int(rows.length)} ${rows.length === 1 ? 'card' : 'cards'} drawn at ${dpi} dpi, front and back, into ${files.length === 1 ? `<b>${esc(files[0])}</b>` : `${files.length} files (${esc(files[0])} \u2026 ${esc(files[files.length - 1])})`}. Marked printed: ${fmt.int(printed.filter((x) => x.ok).length)}.</li>`);
      const noPhoto = rows.filter((r) => !cards.photos.has(r.id)).length;
      if (noPhoto && cards.type === 'caretaker') summary.push(`<li>${fmt.int(noPhoto)} ${noPhoto === 1 ? 'card has' : 'cards have'} no photograph; the photo well is left blank. Use <b>Add photos</b> before printing if the office has them.</li>`);
    }
    if (wantsEmail) {
      const results = await emailCards(withEmail, box, wantsPdf ? rows.length : 0, total);
      const sent = results.filter((x) => x.ok).length;
      const failed = results.filter((x) => !x.ok);
      summary.push(`<li>${fmt.int(sent)} ${sent === 1 ? 'email' : 'emails'} sent${rows.length > withEmail.length ? `; ${fmt.int(rows.length - withEmail.length)} skipped for having no address` : ''}.</li>`);
      if (failed.length) summary.push(`<li>Not sent: ${failed.slice(0, 8).map((f) => `<span class="mono">${esc(f.id)}</span> (${esc(f.reason || 'failed')})`).join(', ')}${failed.length > 8 ? ` and ${failed.length - 8} more` : ''}.</li>`);
    }
    box.done('Done.', `<ul>${summary.join('')}</ul><div class="run-acts"><button class="btn light" type="button" data-run-close>Close</button></div>`);
  } catch (error) {
    box.done('Stopped: ' + error.message, `<ul>${summary.join('')}</ul><div class="run-acts"><button class="btn light" type="button" data-run-close>Close</button></div>`);
  } finally {
    cards.busy = false;
    loadCards();
  }
}

$('actPdf').addEventListener('click', () => runCards('pdf'));
$('actEmail').addEventListener('click', () => runCards('email'));
$('actBoth').addEventListener('click', () => runCards('both'));
$('cardRun').addEventListener('click', (event) => {
  if (event.target.closest('[data-run-close]')) { $('cardRun').hidden = true; $('cardRun').innerHTML = ''; }
});

/* ---- block 7 of 8 ---- */
/* ---- the case ----------------------------------------------------------- */
/* The register says what arrived; this is where a case is worked. Everything
   about one submission in a drawer beside the list: what was sent, the photos,
   the conversation so far, and the three things staff do - reply to the
   sender, keep a note for each other, hand it to someone. Every action lands
   in the conversation with who did it and when. Nothing here deletes. */

const caseState = { open: null, data: null, mode: 'reply', staff: null, busy: false, lastRow: null };
const INSERTS = {
  reply: [
    ['Thanks, unit informed', 'Thank you for reporting this. The nearest PFA unit has been informed and will reach the location.'],
    ['Need the exact place', 'Could you tell us the exact location, with a landmark, so the rescue team can find it quickly?'],
    ['Need a photo', 'If it is safe to do so, a photograph of the animal or the place would help the team.'],
    ['Resolved', 'The team has attended to this and the animal is safe. Thank you for speaking up.']
  ],
  note: [
    ['Called, no answer', 'Called the number given; no answer. Will try again.'],
    ['Spoke to them', 'Spoke to the sender by phone. '],
    ['Passed to unit', 'Passed to the local unit; waiting to hear back.']
  ]
};

async function staffList() {
  if (caseState.staff) return caseState.staff;
  try { caseState.staff = (await call('/api/admin/staff')).staff || []; } catch (error) { caseState.staff = []; }
  return caseState.staff;
}

async function openCase(reference) {
  caseState.open = reference;
  caseState.lastRow = document.querySelector(`[data-open-case="${CSS.escape(reference)}"]`);
  document.querySelectorAll('[data-open-case]').forEach((r) => r.classList.toggle('is-open', r.dataset.openCase === reference));
  $('caseOverlay').hidden = false; $('caseDrawer').hidden = false;
  requestAnimationFrame(() => { $('caseOverlay').classList.add('show'); $('caseDrawer').classList.add('show'); });
  $('caseRef').textContent = reference;
  $('caseKind').textContent = 'Loading';
  $('caseWhen').textContent = '';
  $('caseStatus').innerHTML = '';
  $('caseActions').innerHTML = '';
  $('caseBody').innerHTML = '<div class="empty">Loading&hellip;</div>';
  $('composeText').value = '';
  $('caseBody').dataset.keep = '1';
  await reloadCase();
  $('caseClose').focus();
}

function closeCase() {
  caseState.open = null; caseState.data = null;
  $('caseDrawer').classList.remove('plain');
  $('caseOverlay').classList.remove('show'); $('caseDrawer').classList.remove('show');
  setTimeout(() => { $('caseOverlay').hidden = true; $('caseDrawer').hidden = true; }, 260);
  document.querySelectorAll('[data-open-case].is-open').forEach((r) => r.classList.remove('is-open'));
  if (caseState.lastRow) caseState.lastRow.focus();
}
$('caseClose').addEventListener('click', closeCase);
$('caseOverlay').addEventListener('click', closeCase);
$('caseCopy').addEventListener('click', () => { if (caseState.open) navigator.clipboard.writeText(caseState.open).catch(() => {}); });

async function reloadCase() {
  const reference = caseState.open;
  if (!reference) return;
  try {
    const [out, staff] = await Promise.all([call('/api/admin/case?reference=' + encodeURIComponent(reference)), staffList()]);
    if (caseState.open !== reference) return;
    caseState.data = out.case;
    caseState.mailConfigured = out.mailConfigured !== false;
    drawCase(out.case, staff);
  } catch (error) {
    $('caseBody').innerHTML = `<div class="empty"><b>Could not open this case</b>${esc(error.message)}</div>`;
  }
}

function drawCase(c, staff) {
  $('caseKind').textContent = c.kindLabel;
  $('caseWhen').innerHTML = `Received <b>${esc(when(c.createdAt))}</b> \u00b7 ${esc(ago(c.createdAt))}${c.page ? ` \u00b7 from <span class="mono">${esc(c.page)}</span>` : ''}`;
  $('caseStatus').innerHTML = statusPill('submission', c.status);

  /* actions: the next sensible moves for this status, nothing that would be a no-op */
  const acts = [];
  if (c.status === 'new') acts.push(['in-progress', 'Take it', 'primary']);
  if (c.status === 'in-progress') acts.push(['handled', 'Mark done', 'primary']);
  if (c.status === 'new') acts.push(['handled', 'Mark done', '']);
  if (c.status !== 'spam') acts.push(['spam', 'Spam', 'danger']);
  if (c.status === 'handled' || c.status === 'spam') acts.push(['new', 'Reopen', '']);
  const options = ['<option value="">Unassigned</option>'].concat((staff || []).map((s) => `<option value="${esc(s.email)}"${c.assignedTo && c.assignedTo.email === s.email ? ' selected' : ''}>${esc(s.name || s.email)}</option>`));
  if (c.assignedTo && c.assignedTo.email && !(staff || []).some((s) => s.email === c.assignedTo.email)) options.push(`<option value="${esc(c.assignedTo.email)}" selected>${esc(c.assignedTo.email)}</option>`);
  $('caseActions').innerHTML = acts.map(([status, label, cls]) => `<button class="rowbtn ${cls}" type="button" data-case-status="${status}">${label}</button>`).join('')
    + `<label class="assign">Assigned to <select id="caseAssign" aria-label="Assign to">${options.join('')}</select></label>`;

  /* what they sent */
  const fields = c.fields || {};
  const pretty = (k) => k.replace(/[_-]+/g, ' ').replace(/^./, (ch) => ch.toUpperCase());
  const value = (k, v) => {
    const text = String(v == null ? '' : v);
    if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text)) return `<a href="mailto:${esc(text)}">${esc(text)}</a>`;
    if (/^[6-9]\d{9}$/.test(text.replace(/\D/g, '').slice(-10)) && /mobile|phone|contact|whatsapp/i.test(k)) return `<a href="tel:+91${esc(text.replace(/\D/g, '').slice(-10))}">${esc(text)}</a>`;
    if (/^https?:\/\//.test(text)) return `<a href="${esc(text)}" target="_blank" rel="noopener">${esc(text)}</a>`;
    return esc(text);
  };
  const facts = Object.keys(fields).filter((k) => String(fields[k]).trim()).map((k) => `<dt>${esc(pretty(k))}</dt><dd>${value(k, fields[k])}</dd>`).join('');
  const contact = c.contact || {};
  const reach = [contact.email ? `<a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a>` : '', contact.mobile ? `<a href="tel:+91${esc(contact.mobile)}">${esc(contact.mobile)}</a>` : ''].filter(Boolean).join(' \u00b7 ');

  /* conversation: history events and messages, oldest first */
  /* The thread opens with what they wrote, in their words. */
  const said = ['summary', 'question', 'message', 'details', 'story', 'request', 'title'].filter((k) => fields[k] && String(fields[k]).trim()).map((k) => String(fields[k]).trim());
  const items = [];
  let first = true;
  (c.history || []).forEach((h) => {
    if (h.event === 'reply') return; // the reply message itself carries the detail
    if (h.event === 'assign') items.push({ at: h.at, kind: 'status', title: h.to ? `Assigned to ${h.to.split('@')[0]}` : 'Unassigned', by: h.by });
    else {
      const opening = first && h.status === 'new';
      items.push({ at: h.at, kind: opening ? 'received' : 'status', title: { new: opening ? `Received from ${contact.name || contact.email || contact.mobile || 'the site'}` : 'Reopened', 'in-progress': 'Taken up', handled: 'Marked done', spam: 'Marked spam' }[h.status] || h.status, by: opening ? '' : h.by, text: opening ? said.join('\n\n') : '' });
      first = false;
    }
  });
  (c.messages || []).forEach((m) => {
    if (m.type === 'reply') items.push({ at: m.at, kind: m.delivered === false ? 'failed' : 'reply', title: m.delivered === false ? `Reply not delivered to ${m.to}` : `Replied to ${m.to}`, by: m.by, text: m.text, error: m.error });
    else items.push({ at: m.at, kind: 'note', title: 'Internal note', by: m.by, text: m.text });
  });
  items.sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
  const convo = items.map((it) => `<li class="${it.kind}"><span class="dot"></span>
      <div class="line"><b>${esc(it.title)}</b><time title="${esc(when(it.at))}">${esc(ago(it.at))}</time>${it.by ? `<span class="by">${esc(String(it.by).split('@')[0])}</span>` : ''}</div>
      ${it.text ? `<div class="bubble">${esc(it.text)}${it.error ? `<br><span class="sub" style="color:var(--danger)">${esc(it.error)}</span>` : ''}</div>` : ''}</li>`).join('');

  const keepScroll = $('caseBody').dataset.keep === '1';
  $('caseBody').innerHTML = `
    <h4>Conversation${reach ? ` <span style="font-weight:400;letter-spacing:0;text-transform:none;color:var(--muted)">\u00b7 reach them at ${reach}</span>` : ''}</h4>
    <ol class="convo">${convo}</ol>
    ${c.attachments ? `<h4>Photos</h4><div class="gallery" id="caseGallery">${Array.from({ length: c.attachments }, () => '<span class="photo-thumb"></span>').join('')}</div>` : ''}
    <h4>Everything they filled in</h4>
    <dl class="facts">${facts || '<dt>Fields</dt><dd>Nothing was filled in.</dd>'}</dl>`;
  if (c.attachments) loadCasePhotos(c.reference, c.attachments);
  if (keepScroll) {
    const last = $('caseBody').querySelector('.convo li:last-child');
    if (last) last.scrollIntoView({ block: 'nearest' });
    $('caseBody').dataset.keep = '';
  } else {
    $('caseBody').scrollTop = 0;
  }

  /* compose: replying needs an address and a mail server; a note needs neither */
  setComposeMode(caseState.mode);
}

async function loadCasePhotos(reference, count) {
  const gallery = $('caseGallery');
  for (let n = 1; n <= count; n += 1) {
    try {
      const out = await call('/api/admin/attachment?reference=' + encodeURIComponent(reference) + '&n=' + n);
      const src = 'data:' + out.contentType + ';base64,' + out.data;
      const slot = gallery && gallery.children[n - 1];
      if (slot) slot.outerHTML = `<a class="photo-thumb" href="${src}" target="_blank" rel="noopener" title="Open photo ${n}"><img alt="Photo ${n}" src="${src}"></a>`;
    } catch (error) { /* the slot stays blank */ }
  }
}

function setComposeMode(mode) {
  caseState.mode = mode;
  const c = caseState.data || {};
  const contact = c.contact || {};
  document.querySelectorAll('#composeMode button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  $('composeChips').innerHTML = INSERTS[mode].map(([label, text]) => `<button type="button" data-insert="${esc(text)}">${esc(label)}</button>`).join('');
  const hint = $('composeHint'); hint.classList.remove('bad');
  if (mode === 'reply') {
    $('composeText').placeholder = 'Write to the person who sent this\u2026';
    $('composeSend').textContent = 'Send reply';
    if (!contact.email) {
      hint.textContent = contact.mobile ? `No email was given. Call ${contact.mobile}, then keep a note of what was said.` : 'No email or mobile was given, so there is nobody to reply to.';
      hint.classList.add('bad'); $('composeSend').disabled = true;
    } else if (caseState.mailConfigured === false) {
      hint.textContent = 'Email is not set up on the server (PFA_MAIL_API_KEY), so replies cannot be sent yet.'; hint.classList.add('bad'); $('composeSend').disabled = true;
    } else {
      hint.textContent = `Goes to ${contact.email} from PFA, with the reference in the subject.`; $('composeSend').disabled = false;
    }
  } else {
    $('composeText').placeholder = 'For PFA staff only. The sender never sees this.';
    $('composeSend').textContent = 'Add note';
    hint.textContent = 'Internal. Not sent to anyone.'; $('composeSend').disabled = false;
  }
}
$('composeMode').addEventListener('click', (event) => { const b = event.target.closest('button'); if (b) setComposeMode(b.dataset.mode); });
$('composeChips').addEventListener('click', (event) => {
  const b = event.target.closest('[data-insert]'); if (!b) return;
  const t = $('composeText'); t.value = (t.value ? t.value.replace(/\s*$/, '\n\n') : '') + b.dataset.insert; t.focus();
});
$('composeText').addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') $('composeSend').click(); });

async function caseAction(body) {
  if (caseState.busy || !caseState.open) return null;
  caseState.busy = true;
  $('composeSend').disabled = true;
  try {
    const out = await post('/api/admin/case', Object.assign({ reference: caseState.open }, body));
    return out;
  } catch (error) {
    $('composeHint').textContent = error.message; $('composeHint').classList.add('bad');
    return null;
  } finally {
    caseState.busy = false; $('composeSend').disabled = false;
  }
}

$('composeSend').addEventListener('click', async () => {
  const text = $('composeText').value.trim();
  if (!text) { $('composeText').focus(); return; }
  const mode = caseState.mode;
  $('composeHint').textContent = mode === 'reply' ? 'Sending\u2026' : 'Saving\u2026';
  const out = await caseAction(mode === 'reply' ? { action: 'reply', text } : { action: 'note', text });
  if (!out) return;
  $('composeText').value = '';
  $('caseBody').dataset.keep = '1';
  await reloadCase();
  $('composeHint').textContent = mode === 'reply' ? `Sent to ${out.to} at ${new Date(out.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}.` : 'Note added.';
  load(true); if (state.metrics) loadMetricsQuietly();
});

$('caseActions').addEventListener('click', async (event) => {
  const b = event.target.closest('[data-case-status]'); if (!b) return;
  const status = b.dataset.caseStatus;
  let note = '';
  if (status === 'spam' && !confirm('Mark this as spam? It stays on record and can be reopened.')) return;
  const out = await caseAction({ action: 'status', status, note });
  if (!out) return;
  $('caseBody').dataset.keep = '1';
  await reloadCase();
  load(true); if (state.metrics) loadMetricsQuietly();
});
$('caseActions').addEventListener('change', async (event) => {
  if (event.target.id !== 'caseAssign') return;
  const out = await caseAction({ action: 'assign', to: event.target.value });
  if (out) { $('caseBody').dataset.keep = '1'; await reloadCase(); load(true); }
});

/* ---- block 8 of 8 ---- */
/* ---- people ------------------------------------------------------------- */
/* Super admins only. The list is Firebase Auth itself - every account with
   the admin claim - so there is no second register to drift. */

const people = { list: [], modules: [], presets: [], role: 'staff', editing: '', mailConfigured: true };

async function loadPeople() {
  $('peopleMsg').textContent = ''; $('peopleMsg').classList.remove('is-error');
  $('pageStamp').textContent = 'Loading\u2026';
  try {
    const out = await call('/api/admin/people');
    people.list = out.people || []; people.modules = out.modules || []; people.presets = out.presets || []; people.mailConfigured = out.mailConfigured !== false;
    drawPeople();
    $('pageStamp').textContent = `${fmt.int(people.list.length)} with access`;
  } catch (error) {
    $('peopleHost').innerHTML = `<div class="forbidden"><b>Not available</b>${esc(error.message)}</div>`;
    $('pageStamp').textContent = '';
  }
}

function modulesChips(p) {
  if (p.role === 'super') return '<div class="mods"><span class="all">Everything + People</span></div>';
  const labels = people.modules.filter((m) => p.modules.includes(m.key)).map((m) => m.label);
  return `<div class="mods">${labels.length ? labels.map((l) => `<span>${esc(l)}</span>`).join('') : '<span>No modules</span>'}</div>`;
}

function drawPeople() {
  if (!people.list.length) { $('peopleHost').innerHTML = '<div class="table-wrap"><div class="empty"><b>Nobody yet</b>Give someone access above.</div></div>'; return; }
  $('peopleHost').innerHTML = `<div class="table-wrap"><table><thead><tr><th>Person</th><th>Role</th><th>Can open</th><th>Last signed in</th><th></th></tr></thead><tbody>` +
    people.list.map((p) => `
      <tr>
        <td>${esc(p.name || '\u2014')}<span class="sub">${esc(p.email)}</span></td>
        <td><span class="role-pill ${p.role === 'super' ? 'super' : ''}">${p.role === 'super' ? 'Super admin' : 'Staff'}</span>${p.you ? ' <span class="role-pill you">You</span>' : ''}${p.legacy ? ' <span class="role-pill" title="Granted before roles existed; counts as super admin">Legacy</span>' : ''}${p.disabled ? ' <span class="role-pill">Disabled</span>' : ''}</td>
        <td>${modulesChips(p)}</td>
        <td class="mono">${p.lastSignInAt ? esc(ago(p.lastSignInAt)) : 'never'}</td>
        <td>
          <button class="rowbtn" type="button" data-people-edit="${esc(p.email)}">Change</button>
          <button class="rowbtn" type="button" data-people-reset="${esc(p.email)}">Password link</button>
          ${p.you ? '' : `<button class="rowbtn danger" type="button" data-people-remove="${esc(p.email)}">Remove</button>`}
        </td>
      </tr>`).join('') + '</tbody></table></div>';
}

function openPeopleForm(p) {
  people.editing = p ? p.email : '';
  people.role = p ? p.role : 'staff';
  $('peopleFormTitle').textContent = p ? `Change access for ${p.email}` : 'Give someone access';
  $('pfEmail').value = p ? p.email : ''; $('pfEmail').disabled = Boolean(p);
  $('pfName').value = p ? (p.name || '') : '';
  $('pfHint').textContent = ''; $('pfHint').classList.remove('bad'); $('pfLink').hidden = true;
  $('pfPresets').innerHTML = people.presets.map((pr) => `<button type="button" data-preset="${esc(pr.key)}">${esc(pr.label)}</button>`).join('');
  const chosen = new Set(p ? p.modules : ['overview']);
  $('pfChecks').innerHTML = people.modules.map((m) => `<label><input type="checkbox" value="${esc(m.key)}"${chosen.has(m.key) ? ' checked' : ''}><span><b>${esc(m.label)}</b><small>${esc(m.blurb)}</small></span></label>`).join('');
  setRole(people.role);
  $('peopleForm').hidden = false;
  ($('pfEmail').disabled ? $('pfName') : $('pfEmail')).focus();
  $('peopleForm').scrollIntoView({ block: 'nearest' });
}
function setRole(role) {
  people.role = role;
  document.querySelectorAll('#pfRole button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.role === role)));
  $('pfModules').hidden = role === 'super';
}
$('peopleAdd').addEventListener('click', () => openPeopleForm(null));
$('peopleCancel').addEventListener('click', () => { $('peopleForm').hidden = true; });
$('pfRole').addEventListener('click', (event) => { const b = event.target.closest('button'); if (b) setRole(b.dataset.role); });
$('pfPresets').addEventListener('click', (event) => {
  const b = event.target.closest('[data-preset]'); if (!b) return;
  const preset = people.presets.find((p) => p.key === b.dataset.preset); if (!preset) return;
  $('pfChecks').querySelectorAll('input').forEach((i) => { i.checked = preset.modules.includes(i.value); });
});

$('pfSave').addEventListener('click', async () => {
  const email = $('pfEmail').value.trim().toLowerCase();
  const name = $('pfName').value.trim();
  const modules = [...$('pfChecks').querySelectorAll('input:checked')].map((i) => i.value);
  if (!email) { $('pfEmail').focus(); return; }
  if (people.role === 'staff' && !modules.length) { $('pfHint').textContent = 'Tick at least one module.'; $('pfHint').classList.add('bad'); return; }
  $('pfSave').disabled = true; $('pfHint').textContent = 'Saving\u2026'; $('pfHint').classList.remove('bad');
  try {
    const out = await post('/api/admin/people', { action: 'set', email, name, role: people.role, modules });
    $('pfHint').textContent = out.note || 'Saved.';
    if (out.invite && !out.invite.sent && out.invite.link) {
      $('pfLink').hidden = false;
      $('pfLink').innerHTML = `Send this link to ${esc(email)} so they can set a password (it works once):<br><code>${esc(out.invite.link)}</code> <button class="rowbtn" type="button" data-copy-text="${esc(out.invite.link)}">Copy</button>${out.invite.error ? `<br><span style="color:var(--danger)">${esc(out.invite.error)}</span>` : ''}`;
    } else if (!out.created) {
      setTimeout(() => { $('peopleForm').hidden = true; }, 900);
    }
    await loadPeople();
    if (state.me && email === String(state.me.email || '').toLowerCase()) { state.me.role = out.role; state.me.modules = out.modules; applyAccess(); }
  } catch (error) {
    $('pfHint').textContent = error.message; $('pfHint').classList.add('bad');
  } finally { $('pfSave').disabled = false; }
});

$('peopleHost').addEventListener('click', async (event) => {
  const b = event.target.closest('button'); if (!b) return;
  $('peopleMsg').textContent = ''; $('peopleMsg').classList.remove('is-error');
  try {
    if (b.dataset.peopleEdit) return openPeopleForm(people.list.find((p) => p.email === b.dataset.peopleEdit));
    if (b.dataset.peopleReset) {
      b.disabled = true;
      const out = await post('/api/admin/people', { action: 'reset', email: b.dataset.peopleReset });
      $('peopleMsg').innerHTML = esc(out.note || 'Sent.') + (out.invite && out.invite.link ? `<br><code class="mono">${esc(out.invite.link)}</code>` : '');
      b.disabled = false;
      return;
    }
    if (b.dataset.peopleRemove) {
      if (!confirm(`Remove the panel from ${b.dataset.peopleRemove}? Their account stays; they just stop being an administrator.`)) return;
      const out = await post('/api/admin/people', { action: 'remove', email: b.dataset.peopleRemove });
      await loadPeople();
      $('peopleMsg').textContent = out.note || 'Removed.';
    }
  } catch (error) {
    $('peopleMsg').textContent = error.message; $('peopleMsg').classList.add('is-error');
  }
});
document.addEventListener('click', (event) => {
  const b = event.target.closest('[data-copy-text]'); if (!b) return;
  navigator.clipboard.writeText(b.dataset.copyText).then(() => { b.textContent = 'Copied'; }).catch(() => {});
});

