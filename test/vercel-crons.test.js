'use strict';

/* Vercel's Hobby plan refuses any cron that would fire more than once a day,
   and it refuses it at deploy time: the push succeeds, GitHub shows a red cross
   and no deployment appears in Vercel at all. That is a miserable thing to
   debug from the outside, so it is caught here instead, where the message says
   what is wrong.
 *
   If this project ever moves to Pro, relax MAX_RUNS_PER_DAY rather than
   deleting the test: the count limit and the deploy-time failure remain real. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const crons = vercel.crons || [];

/* Hobby: at most 2 jobs, each at most once a day. */
const MAX_JOBS = 2;
const MAX_RUNS_PER_DAY = 1;

/* How many times a 5-field expression fires in a day. Only the minute and hour
   fields can multiply runs within one day; the rest can only make it rarer. */
function runsPerDay(expression) {
  const parts = String(expression).trim().split(/\s+/);
  assert.equal(parts.length, 5, `not a 5-field cron expression: ${expression}`);
  const count = (field, span) => {
    if (field === '*') return span;
    if (field.startsWith('*/')) return Math.ceil(span / Number(field.slice(2)));
    return field.split(',').reduce((n, part) => {
      if (part.includes('-')) {
        const [a, b] = part.split('-').map(Number);
        return n + (b - a + 1);
      }
      return n + 1;
    }, 0);
  };
  return count(parts[0], 60) * count(parts[1], 24);
}

test('the cron counter agrees with the expressions Vercel rejects', () => {
  assert.equal(runsPerDay('0 3 * * *'), 1);
  assert.equal(runsPerDay('*/10 * * * *'), 144, 'every ten minutes');
  assert.equal(runsPerDay('0 * * * *'), 24, 'hourly');
  assert.equal(runsPerDay('*/30 * * * *'), 48);
  assert.equal(runsPerDay('0 8,20 * * *'), 2, 'twice a day is still too often for Hobby');
  assert.equal(runsPerDay('0 4 * * 1'), 1, 'weekly is once on the days it runs');
});

test('no cron fires more often than the plan allows, or the deployment silently fails', () => {
  crons.forEach((job) => {
    const runs = runsPerDay(job.schedule);
    assert.ok(runs <= MAX_RUNS_PER_DAY,
      `${job.path} runs ${runs} times a day ("${job.schedule}"). Vercel Hobby refuses anything above ` +
      `${MAX_RUNS_PER_DAY} at deploy time: the push succeeds and no deployment appears. ` +
      'Use a daily schedule and put any faster cadence on an external scheduler ' +
      '(.github/workflows/store-reconcile.yml does this).');
  });
});

test('there are no more cron jobs than the plan allows', () => {
  assert.ok(crons.length <= MAX_JOBS,
    `${crons.length} cron jobs; Vercel Hobby allows ${MAX_JOBS}.`);
});

test('every cron points at a route that is actually mounted', () => {
  const api = fs.readFileSync(path.join(ROOT, 'api', 'index.js'), 'utf8');
  const mounted = new Set([...api.matchAll(/^\s*'([a-z0-9/_-]+)':\s*'\.\//gm)].map((m) => m[1]));
  crons.forEach((job) => {
    const route = /^\/api\/(.+)$/.exec(job.path);
    assert.ok(route, `${job.path} is not an /api route`);
    assert.ok(mounted.has(route[1]), `${job.path} is scheduled but not mounted in api/index.js`);
  });
});

test('the reconciler answers a Vercel cron, which arrives as a GET with the cron secret', () => {
  const src = fs.readFileSync(path.join(ROOT, 'lib', 'routes', 'pfa-store-reconcile.js'), 'utf8');
  assert.doesNotMatch(src, /request\.method !== 'POST'/,
    'a GET must not be refused: Vercel cron only ever sends GET');
  assert.match(src, /CRON_SECRET/, 'Vercel cron authenticates with CRON_SECRET');
});
