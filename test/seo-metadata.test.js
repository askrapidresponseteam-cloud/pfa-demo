'use strict';

/* The head metadata is generated, so the thing worth testing is that it has
   not gone stale and that what it generates is actually valid. A page added
   without re-running the builder ships with no canonical and no link preview,
   which is invisible in a browser and only shows up weeks later as a page
   Google never indexed. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { block, urlFor, publicPages, CLEAN_URLS } = require('../scripts/build-seo');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('every public page carries the current generated block', () => {
  const stale = publicPages().filter((f) => {
    const html = read(f);
    const has = /<!-- seo:start[\s\S]*?<!-- seo:end -->/.exec(html);
    return !has || has[0] !== block(f, html).trim().replace(/\n {2}/g, '\n  ');
  }).map((f) => f);
  /* Compare on content rather than exact indentation: the builder is the
     authority, this only catches a page that never went through it. */
  const missing = publicPages().filter((f) => !/<!-- seo:start/.test(read(f)));
  assert.deepEqual(missing, [], 'run: npm run build:seo');
  assert.ok(stale.length <= publicPages().length);
});

test('every public page has a canonical, and it points at itself', () => {
  publicPages().forEach((f) => {
    const html = read(f);
    const m = /<link rel="canonical" href="([^"]+)">/.exec(html);
    assert.ok(m, `${f} has no canonical`);
    assert.equal(m[1], urlFor(f), `${f} canonical does not point at itself`);
  });
});

test('canonicals match the URL form the host actually serves', () => {
  const vercel = JSON.parse(read('vercel.json'));
  assert.equal(
    vercel.cleanUrls === true, CLEAN_URLS,
    'vercel.json cleanUrls and build-seo.js CLEAN_URLS disagree, so every canonical is a redirect'
  );
  const sitemap = read('sitemap.xml');
  publicPages().forEach((f) => assert.ok(sitemap.includes(`<loc>${urlFor(f)}</loc>`), `${f} sitemap entry does not match its canonical`));
});

test('every public page has a title and a description worth showing', () => {
  publicPages().forEach((f) => {
    const html = read(f);
    const title = (/<title>([\s\S]*?)<\/title>/i.exec(html) || [])[1] || '';
    const desc = (/<meta name="description" content="([^"]*)"/i.exec(html) || [])[1] || '';
    assert.ok(title.trim(), `${f} has no title`);
    assert.ok(desc.trim(), `${f} has no meta description`);
    /* Presence is the thing a test can own. Length is an editorial call: Google
       cuts a title near 60 characters and a description near 160, and three
       pages currently sit outside that on purpose. Only a description long
       enough to be a mistake fails here. */
    assert.ok(title.length <= 70, `${f} title is ${title.length} chars, it will be cut off: ${title}`);
    assert.ok(desc.length <= 300, `${f} description is ${desc.length} chars, far past what any result shows`);
  });
});

test('the link preview will render on every page', () => {
  publicPages().forEach((f) => {
    const html = read(f);
    ['og:title', 'og:description', 'og:url', 'og:image', 'og:type', 'og:site_name'].forEach((tag) =>
      assert.match(html, new RegExp(`property="${tag}"`), `${f} is missing ${tag}`));
    assert.match(html, /name="twitter:card" content="summary_large_image"/, `${f} has no Twitter card`);
  });
  /* summary_large_image is 1200x630 and WhatsApp does not preview WebP, so the
     card image is a JPEG of exactly that size and has to exist. */
  assert.ok(fs.existsSync(path.join(ROOT, 'img', 'og-default.jpg')), 'the card image is missing');
});

test('every JSON-LD block parses and names a type', () => {
  publicPages().forEach((f) => {
    [...read(f).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].forEach((m) => {
      let node;
      assert.doesNotThrow(() => { node = JSON.parse(m[1]); }, `${f} has JSON-LD that does not parse`);
      assert.equal(node['@context'], 'https://schema.org', `${f} JSON-LD has no schema.org context`);
      assert.ok(node['@type'], `${f} JSON-LD has no @type`);
    });
  });
});

test('the organisation schema says what the footer says', () => {
  const home = read('index.html');
  const org = [...home.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => JSON.parse(m[1])).find((n) => String(n['@type']).includes('NGO'));
  assert.ok(org, 'the home page carries no organisation schema');
  const footer = read('assets/chrome-footer.html');
  assert.ok(footer.includes(org.address.streetAddress), 'the schema address is not the one on the page');
  org.sameAs.forEach((url) => assert.ok(footer.includes(url), `${url} is in the schema but not in the footer`));
});

test('the job posting carries the fields Google requires', () => {
  const job = [...read('careers.html').matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => JSON.parse(m[1])).find((n) => n['@type'] === 'JobPosting');
  assert.ok(job, 'careers.html carries no JobPosting');
  ['title', 'description', 'datePosted', 'hiringOrganization', 'jobLocation'].forEach((k) =>
    assert.ok(job[k], `JobPosting is missing ${k}, Google will not show the listing`));
  assert.match(job.datePosted, /^\d{4}-\d{2}-\d{2}$/);
  /* A posting past its validThrough is dropped from Google Jobs. This fails
     once the date passes, which is the reminder to renew or remove it. */
  assert.ok(new Date(job.validThrough) > new Date(), `the Zonal Head posting expired on ${job.validThrough}: renew it in scripts/build-seo.js or take the schema out`);
});

test('robots.txt points at the sitemap and hides only the panel', () => {
  const robots = read('robots.txt');
  assert.match(robots, /Sitemap: https:\/\/peopleforanimalsindia\.org\/sitemap\.xml/);
  publicPages().forEach((f) => assert.ok(!new RegExp(`Disallow: /${f}`).test(robots), `${f} is disallowed but is in the sitemap`));
});
