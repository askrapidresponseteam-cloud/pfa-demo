'use strict';

/* The Store switch, for the admin panel.

   GET  /api/admin/store   what the Store is doing now, and what each choice
                           would list, so the consequence is visible before
                           the change rather than after it.
   POST /api/admin/store   { state: 'veg' | 'all' | 'off' }

   Guarded by the existing `store` module permission - whoever can see Store
   orders can regulate the Store. That deliberately adds no new permission for
   an administrator to discover, assign and forget about. */

const { requireAdmin } = require('../../admin-auth');
const { getStoreState, setStoreState, STATES, LABELS } = require('../../store-settings');
const catalogRoute = require('../paws-catalog.js');
const audit = require('../../admin-audit');

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  if (request.body && typeof request.body === 'object') return Promise.resolve(request.body);
  return new Promise((resolve) => {
    let raw = '';
    request.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 4096) raw = raw.slice(0, 4096);
    });
    request.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch (_) { resolve({}); } });
    request.on('error', () => resolve({}));
  });
}

/* How many products each choice would list. Shown next to the choices so an
   administrator can see that "everything" means 512 rather than 340 before
   pressing it. A vendor outage must not block the switch, so a failure here
   returns no numbers rather than an error: the switch still works blind. */
async function counts() {
  try {
    const catalog = await catalogRoute.getCatalog();
    /* Counted the way the shop counts - one tile per product with something
       purchasable on it - so the number under each choice is the number the
       shop's own header will show once that choice is live. */
    const vegProducts = catalog.products.filter((product) => product.vegetarianOk !== false);
    const total = catalogRoute.shopperTiles(catalog.products);
    const veg = catalogRoute.shopperTiles(vegProducts);
    return {
      all: total, veg, off: 0, hiddenWhenVegetarian: total - veg, available: true,
      products: { all: catalog.products.length, veg: vegProducts.length }
    };
  } catch (error) {
    return { available: false, reason: 'The vendor catalogue could not be read just now.' };
  }
}

module.exports = async function handler(request, response) {
  const who = await requireAdmin(request, response, 'store');
  if (!who) return undefined;

  if (request.method === 'GET') {
    const [state, listing] = await Promise.all([getStoreState(), counts()]);
    return sendJson(response, 200, {
      state: state.state,
      open: state.open,
      label: state.label,
      changedAt: state.changedAt,
      changedBy: state.changedBy,
      source: state.source,
      choices: STATES.map((key) => ({ key, label: LABELS[key] })),
      counts: listing
    });
  }

  if (request.method === 'POST') {
    const body = await readBody(request);
    const wanted = body && body.state;
    try {
      const before = await getStoreState();
      const after = await setStoreState(wanted, who && (who.email || who.uid));
      audit.record(who, {
        module: 'store', action: 'store-state', subject: after.state,
        detail: before.state === after.state ? `Store left on ${after.state}` : `Store moved from ${before.state} to ${after.state}`
      }, request);
      return sendJson(response, 200, {
        state: after.state,
        open: after.open,
        label: after.label,
        changedAt: after.changedAt,
        changed: before.state !== after.state,
        previous: before.state,
        counts: await counts()
      });
    } catch (error) {
      const code = error && error.code === 'INVALID_STATE' ? 400 : 502;
      return sendJson(response, code, {
        code: (error && error.code) || 'STORE_SETTING_FAILED',
        message: (error && error.message) || 'The setting could not be saved.'
      });
    }
  }

  response.setHeader('Allow', 'GET, POST');
  return sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED' });
};
