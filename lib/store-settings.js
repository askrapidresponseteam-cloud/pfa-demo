'use strict';

/* The Store switch.
   ------------------------------------------------------------------------
   One setting, three states, so the Store can be regulated from the admin
   panel without a deploy or an environment variable change:

     veg    Open. Food must read as vegetarian; everything that is not food
            is unaffected. This is the default and the safe state.
     all    Open. Everything the seller lists, including food that is not
            vegetarian.
     off    Closed. Nothing is listed and nothing can be bought.

   `off` is a real stop, not a hidden grid. `/api/paws-catalog` returns no
   products and `/api/pfa-orders` refuses to create a checkout, so a shopper
   who already had the page open, or who kept a tab from before, still cannot
   buy. That is the whole point of the button.

   PAWS_INCLUDE_ALL_FOOD stays honoured as the initial value so that nothing
   changes for an existing deployment until somebody presses the switch.
   ------------------------------------------------------------------------ */

const { getDb, hashKey } = require('./firebase');

const DOC_PATH = ['settings', 'store'];
const CACHE_MS = 30 * 1000;   // a change should show within half a minute
const STATES = ['veg', 'all', 'off'];

const LABELS = {
  veg: 'Open \u00b7 vegetarian food only',
  all: 'Open \u00b7 everything the vendor lists',
  off: 'Closed'
};

function envDefault() {
  return String(process.env.PAWS_INCLUDE_ALL_FOOD || '').toLowerCase() === 'true' ? 'all' : 'veg';
}

let memory = null;            // { state, changedAt, changedBy }
let cache = { expiresAt: 0, value: null };

function firebaseConfigured() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return true;
  return Boolean(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);
}

function isState(value) {
  return typeof value === 'string' && STATES.includes(value);
}

function shape(record, source) {
  const state = isState(record && record.state) ? record.state : envDefault();
  return {
    state,
    label: LABELS[state],
    open: state !== 'off',
    vegetarianOnly: state === 'veg',
    changedAt: (record && record.changedAt) || null,
    changedBy: (record && record.changedBy) || null,
    source
  };
}

/* Reads are on the shopper's path, so a failure must not take the Store down
   in either direction. An unreachable database falls back to the last known
   value, then to the environment default, and says which in `source`. */
async function getStoreState() {
  const now = Date.now();
  if (cache.value && cache.expiresAt > now) return cache.value;

  let value;
  if (!firebaseConfigured()) {
    value = shape(memory, memory ? 'memory' : 'default');
  } else {
    try {
      const snapshot = await getDb().collection(DOC_PATH[0]).doc(DOC_PATH[1]).get();
      value = snapshot.exists ? shape(snapshot.data(), 'firestore') : shape(null, 'default');
      memory = { state: value.state, changedAt: value.changedAt, changedBy: value.changedBy };
    } catch (error) {
      console.error('store-settings read failed:', error && error.message);
      value = shape(memory, memory ? 'memory-fallback' : 'default-fallback');
    }
  }

  cache = { expiresAt: now + CACHE_MS, value };
  return value;
}

/* `by` is recorded so the register shows who closed the Store, but it is
   stored as a hash: the panel needs to prove a change was made and by which
   account, not keep a list of staff email addresses in a settings document. */
async function setStoreState(state, by) {
  if (!isState(state)) {
    const error = new Error('Choose vegetarian only, everything, or closed.');
    error.code = 'INVALID_STATE';
    throw error;
  }
  const record = {
    state,
    changedAt: new Date().toISOString(),
    changedBy: by ? hashKey(String(by)).slice(0, 16) : null
  };

  if (firebaseConfigured()) {
    try {
      await getDb().collection(DOC_PATH[0]).doc(DOC_PATH[1]).set(record, { merge: true });
    } catch (error) {
      console.error('store-settings write failed:', error && error.message);
      const failure = new Error('The setting could not be saved. Nothing has changed.');
      failure.code = 'WRITE_FAILED';
      throw failure;
    }
  }

  memory = record;
  cache = { expiresAt: 0, value: null };   // the next read is the new value
  return shape(record, firebaseConfigured() ? 'firestore' : 'memory');
}

function resetForTests() {
  memory = null;
  cache = { expiresAt: 0, value: null };
}

module.exports = { getStoreState, setStoreState, resetForTests, STATES, LABELS, envDefault, _isState: isState };
