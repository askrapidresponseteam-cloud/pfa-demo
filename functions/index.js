'use strict';

/* The whole API as one Cloud Function.
 *
 * api/index.js is a plain Node handler — `async (request, response)` with no
 * Vercel SDK anywhere — so it drops straight into onRequest. Two things differ
 * from Vercel and are fixed here rather than in the router:
 *
 *   1. Vercel rewrote /api/<x> to /api/index?__route=<x>. Firebase Hosting
 *      cannot add a query parameter in a rewrite, but the router already falls
 *      back to reading the pathname, so /api/<x> resolves on its own.
 *
 *   2. /products/<handle> did need injected parameters. Hosting cannot supply
 *      them, so they are set here from the path.
 */

const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const router = require('./api/index.js');

const REGION = 'asia-south1';   // Mumbai, beside the Firestore database

exports.api = onRequest(
  { region: REGION, memory: '512MiB', timeoutSeconds: 60, invoker: 'public' },
  async (request, response) => {
    const url = new URL(request.url, 'https://pfa.local');
    const product = /^\/products\/([^/]+)\/?$/.exec(url.pathname);
    if (product) {
      request.query = Object.assign({}, request.query, {
        __route: 'product-page',
        handle: decodeURIComponent(product[1])
      });
    }
    return router(request, response);
  }
);

/* vercel.json ran this at 03:00 daily. Cloud Scheduler does it here, and the
   worker checks CRON_SECRET itself, so the schedule is the only change. */
exports.caregiverEmailWorker = onSchedule(
  { region: REGION, schedule: '0 3 * * *', timeZone: 'Asia/Kolkata' },
  async () => {
    const worker = require('./lib/routes/caregiver/email-worker.js');
    /* The comment above says the worker checks CRON_SECRET itself, and it
       does - but nothing was ever presenting one. With no Authorization
       header the worker answered 401 every night and no caregiver email was
       ever sent from this deployment. */
    const token = String(process.env.CRON_SECRET || process.env.PFA_ADMIN_TOKEN || '');
    const request = {
      method: 'POST', url: '/api/caregiver/email-worker', query: {}, body: {},
      headers: token ? { authorization: `Bearer ${token}` } : {}
    };
    const response = {
      statusCode: 200, _body: '',
      setHeader() {}, end(body) { this._body = body || ''; }
    };
    await worker(request, response);
    console.log('caregiver email worker', response.statusCode, String(response._body).slice(0, 200));
  }
);
