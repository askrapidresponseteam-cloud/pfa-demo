'use strict';

/* The quiz, driven end to end: every question answered, the result reached,
   and the certificate drawn. */

const fs = require('fs');
const vm = require('vm');
const test = require('node:test');
const assert = require('node:assert');
const { createDocument } = require('./_dom-shim.js');
const { build } = require('../scripts/build-quiz-template.js');

const ROOT = `${__dirname}/..`;
const html = fs.readFileSync(`${ROOT}/quiz.html`, 'utf8');

function scriptsOf(page) {
  return [...page.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
    .filter((m) => !/\bsrc=/.test(m[1]))
    .filter((m) => {
      const type = (m[1].match(/type\s*=\s*["']([^"']+)["']/) || [])[1];
      return !type || /^(text\/javascript|application\/javascript|module)$/i.test(type);
    })
    .map((m) => m[2]);
}

function boot() {
  const doc = createDocument(html);
  const errors = [];
  const drawn = { ops: [], text: [] };
  let blobs = 0;

  function ctx2d() {
    return new Proxy({}, {
      get(_, key) {
        if (key === 'measureText') return (t) => ({ width: String(t).length * 18 });
        if (key === 'fillText') return (t) => { drawn.text.push(String(t)); };
        if (key === 'drawImage') return () => { drawn.ops.push('drawImage'); };
        if (key === 'canvas') return null;
        return () => { drawn.ops.push(String(key)); };
      },
      set() { return true; }
    });
  }

  const win = {
    document: doc,
    location: { search: '', pathname: '/quiz.html', href: 'https://pfa.test/quiz.html' },
    history: { replaceState: () => {} },
    navigator: { sendBeacon: () => true },
    /* loadImage() assigns onload and then src, so the load has to be triggered
       by the src setter — firing it from the constructor is too early. */
    Image: function Image() {
      const self = this;
      self.width = 231; self.height = 79;
      Object.defineProperty(self, 'src', {
        get() { return self._src; },
        set(v) { self._src = v; Promise.resolve().then(() => { if (self.onload) self.onload(); }); }
      });
    },
    URL: Object.assign(function () {}, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }),
    matchMedia: () => ({ matches: false, addEventListener: () => {} }),
    getComputedStyle: () => ({ display: 'block', position: 'static' }),
    requestAnimationFrame: (fn) => { fn(0); return 1; },
    setTimeout: (fn) => { if (typeof fn === 'function') fn(); return 1; },
    clearTimeout: () => {}, setInterval: () => 1, clearInterval: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, scrollTo: () => {},
    console, JSON, Math, Date, Number, String, Boolean, Array, Object, RegExp, Error,
    parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent, Promise, Map, Set, Intl,
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  };
  win.window = win; win.self = win; win.globalThis = win;

  doc.createElement = (tag) => {
    const el = createDocument('<div></div>').querySelector('div') || {};
    if (String(tag).toLowerCase() === 'canvas') {
      return {
        width: 0, height: 0, getContext: () => ctx2d(),
        toBlob: (cb) => { blobs += 1; cb({ size: 1234 }); },
        style: {}, setAttribute() {}, remove() {}
      };
    }
    return Object.assign(el, { click() { drawn.ops.push('click'); }, remove() {}, style: {}, href: '', download: '' });
  };
  doc.fonts = { ready: Promise.resolve() };

  scriptsOf(html).forEach((code, i) => {
    try { vm.runInContext(code, vm.createContext(win), { filename: `quiz#${i}`, timeout: 5000 }); }
    catch (error) { errors.push(`script[${i}]: ${error.message}`); }
  });
  return { doc, errors, drawn, blobCount: () => blobs, win };
}

test('quiz.html boots and paints the first question', () => {
  const { doc, errors } = boot();
  assert.deepEqual(errors, [], errors.join('\n'));
  const host = doc.getElementById('qz');
  assert.ok(host && host.innerHTML.length > 400, 'the quiz must render');
  assert.match(host.innerHTML, /qz__options/);
  assert.match(host.innerHTML, /1 of 6/);
});

test('every question has four options, one right answer, a fact and a citation', () => {
  const js = scriptsOf(html).join('\n');
  const block = js.slice(js.indexOf('var QUESTIONS'), js.indexOf('var root'));
  const questions = block.split(/\{\s*\n\s*q:/).slice(1);
  assert.equal(questions.length, 6, 'six questions');
  questions.forEach((q, i) => {
    assert.match(q, /answer:/, `question ${i + 1} needs an answer`);
    assert.match(q, /fact:/, `question ${i + 1} needs the finding`);
    assert.match(q, /cite:/, `question ${i + 1} must name its study`);
    assert.match(q, /href: 'https:\/\//, `question ${i + 1} must link its study`);
    const options = (q.match(/options: \[([^\]]*)\]/) || [])[1] || '';
    assert.equal(options.split(',').length, 4, `question ${i + 1} needs four options`);
    const answer = (q.match(/answer: '([\w]+)'/) || [])[1];
    assert.ok(options.includes(`'${answer}'`), `question ${i + 1}: the answer must be among its options`);
  });
});

test('answering reveals the study, and a wrong pick is marked as wrong', () => {
  const { doc } = boot();
  const host = doc.getElementById('qz');
  /* Pick an option that is not the answer for question one. */
  const wrong = doc.querySelectorAll('[data-pick]').filter((b) => b.getAttribute('data-pick') !== 'sheep')[0];
  assert.ok(wrong, 'four options must be on the page');
  host.dispatch('click', { target: wrong });
  const revealed = doc.querySelector('[data-reveal]').innerHTML;
  assert.match(revealed, /qz__reveal/, 'the reveal must appear');
  assert.match(revealed, /Nature 414/, 'the citation must be shown');
  assert.match(revealed, /It was the sheep/);
  assert.equal(wrong.getAttribute('data-state'), 'wrong', 'the wrong pick must be marked');
  const right = doc.querySelectorAll('[data-pick]').filter((b) => b.getAttribute('data-pick') === 'sheep')[0];
  assert.equal(right.getAttribute('data-state'), 'right', 'and the answer shown');
});

test('a full run reaches the result and offers a certificate', () => {
  const { doc } = boot();
  const host = doc.getElementById('qz');
  for (let i = 0; i < 6; i += 1) {
    const options = doc.querySelectorAll('[data-pick]');
    assert.ok(options.length === 4, `question ${i + 1} should offer four options`);
    host.dispatch('click', { target: options[0] });
    host.dispatch('click', { target: doc.querySelector('[data-next]') });
  }
  assert.match(host.innerHTML, /qz__score/, 'a score must be shown');
  /* Two ways down since v1.263: print-grade PDF first, PNG beside it. */
  assert.match(host.innerHTML, /Download PDF/);
  assert.match(host.innerHTML, /Download PNG/);
  assert.match(host.innerHTML, /6 of 6/);
});

test('the certificate is drawn and saved, using the logo already on the page', async () => {
  const { doc, drawn, blobCount } = boot();
  const host = doc.getElementById('qz');
  for (let i = 0; i < 6; i += 1) {
    host.dispatch('click', { target: doc.querySelectorAll('[data-pick]')[0] });
    host.dispatch('click', { target: doc.querySelector('[data-next]') });
  }
  /* The PNG path exercises the whole pipeline the shim can honour; the PDF
     writer needs TextEncoder and is pinned structurally in
     test/quiz-certificate.test.js. */
  host.dispatch('click', { target: doc.querySelector('[data-cert="png"]') });
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  /* The organisation's name arrives in the logo artwork (the drawImage
     below), and only there: the typed grey repeat was removed in v1.262 at
     the owner's ask, so a reappearing fillText of the name is a regression,
     not a nicety. */
  assert.ok(!drawn.text.some((t) => /PEOPLE FOR ANIMALS/.test(t)), 'the name is not typed twice');
  assert.ok(drawn.text.some((t) => /underestimate/i.test(t)), 'and the quiz');
  assert.ok(drawn.ops.includes('drawImage'), 'the wordmark must be drawn onto it');
  assert.ok(blobCount() > 0, 'and the file must actually be produced');
});

test('the logo comes from the header, not a second copy', () => {
  const js = scriptsOf(html).join('\n');
  assert.match(js, /querySelector\('\.wordmark img'\)/,
    'a duplicated base64 logo would drift from the one in the header');
  assert.equal((html.match(/data:image\/png;base64,/g) || []).length, 0, 'no inlined copy of the wordmark');
  assert.match(html, /class="wordmark"[^>]*><img src="img\/logo\.png"/, 'the header shows the logo file');
});

test('quiz.html is in step with pfa-shop.html', () => {
  assert.equal(build(), html, 'run: npm run build:quiz');
});

test('the home page actually links to it', () => {
  const home = fs.readFileSync(`${ROOT}/index.html`, 'utf8');
  assert.match(home, /href="quiz\.html"/, 'the Take the quiz button was href="#"');
});

test('the quiz never crops a face', () => {
  assert.match(html, /\.qz__shot img\{[^}]*object-fit:contain/,
    'contain is the only way to guarantee a face is whole in a photo nobody has opened');
  const home = fs.readFileSync(`${ROOT}/index.html`, 'utf8');
  assert.match(home, /\[data-slot\^="quiz-tile-"\] \.pfa-slot-frame img\{[^}]*object-fit:contain/,
    'the home page tiles must not crop either');
});
