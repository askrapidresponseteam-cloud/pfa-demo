'use strict';

/* Courier events for an order, from the partner tracking endpoint the seller
   gave PFA read-only access to. Two facts decide the whole design.

   The endpoint answers by the seller's own order number, so the lookup is by
   view.orderNumber - but the shopper never sees that number. What comes back
   is folded into the PFA order's public view and the PFA order id stays the
   only id on screen, as the shop promises.

   The key is a credential. It lives in PFA_TRACKING_API_KEY on the server and
   goes out in one header to one host; nothing here reaches a browser. Until
   PFA_TRACKING_API_BASE and the key are set, enrich() is the identity: the
   tracker shows the stages the store itself knows (placed, confirmed,
   processing, shipped) and the courier stages fill in the day the two
   variables are set, with no page change.

   A courier that is slow, down or wrong costs the shopper the courier line
   and nothing else: every failure path returns the view untouched. */

/* ---------- Shiprocket, by the front door ----------
   Shopify's shipment_status only advances for carriers Shopify itself
   tracks, and Blue Dart Surface is not one: a parcel Blue Dart delivered on
   31 Aug still read "Shipped" here on 2 Sep, because the mirror can never
   know more than Shopify does. The courier's own record is the truth, the
   mirror already holds the AWB, and Shiprocket's real API is the documented
   way in: login with an API user's email and password for a token (kept in
   memory about eight days), then track by AWB. Two more server secrets -
   PFA_SHIPROCKET_EMAIL and PFA_SHIPROCKET_PASSWORD, an API user the seller
   creates in Shiprocket's settings, never the browser's to see. Unset, this
   path simply is not taken; failing, it costs the courier line and nothing
   else, like everything in this file. */
const SR_BASE = () => cleanText(process.env.PFA_SHIPROCKET_BASE, 200).replace(/\/+$/, '') || 'https://apiv2.shiprocket.in';
let srToken = null;
let srTokenAt = 0;
const SR_TOKEN_TTL_MS = 8 * 24 * 60 * 60 * 1000;

async function shiprocketToken(fetchImpl, force) {
  const email = cleanText(process.env.PFA_SHIPROCKET_EMAIL, 200);
  const password = String(process.env.PFA_SHIPROCKET_PASSWORD || '');
  if (!email || !password) return null;
  if (!force && srToken && Date.now() - srTokenAt < SR_TOKEN_TTL_MS) return srToken;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : null;
  try {
    const res = await fetchImpl(`${SR_BASE()}/v1/external/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email, password }),
      signal: controller ? controller.signal : undefined
    });
    if (!res.ok) {
      /* A refused login is the operator's problem: wrong password, or the
         account is not an API user. Said once per token attempt, plainly. */
      console.error('Shiprocket login refused: check PFA_SHIPROCKET_EMAIL/PASSWORD (must be an API user)', { status: res.status });
      return null;
    }
    const body = await res.json();
    srToken = cleanText(body && body.token, 600) || null;
    srTokenAt = Date.now();
    return srToken;
  } catch (error) {
    console.error('Shiprocket login failed', { message: error && error.message });
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/* Shiprocket's shape, defensively: tracking_data.shipment_track[0] carries
   the leg (current_status, courier_name, awb_code, edd), and
   shipment_track_activities the checkpoints. Anything missing is absent. */
function foldShiprocket(raw) {
  const td = raw && raw.tracking_data;
  if (!td || typeof td !== 'object') return null;
  const leg = (Array.isArray(td.shipment_track) && td.shipment_track[0]) || {};
  const acts = Array.isArray(td.shipment_track_activities) ? td.shipment_track_activities.slice(0, 40) : [];
  const events = acts.map((a) => ({
    at: cleanText(a && a.date, 40),
    label: cleanText(a && (a.activity || a.status || a['sr-status-label']), 160),
    location: cleanText(a && a.location, 120)
  })).filter((e) => e.label);
  const newest = events.slice().sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0))[0];
  const courier = {
    status: cleanText(leg.current_status || td.current_status, 60),
    name: cleanText(leg.courier_name, 80),
    awb: cleanText(leg.awb_code, 60),
    location: newest ? newest.location : '',
    eta: cleanText(td.etd || leg.edd, 40),
    events
  };
  return courier.status || courier.awb || events.length ? courier : null;
}

async function fromShiprocket(view, fetchImpl) {
  const awb = cleanText(view && view.tracking && view.tracking.number, 40);
  if (!awb) return null;
  let token = await shiprocketToken(fetchImpl, false);
  if (!token) return null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : null;
    try {
      const res = await fetchImpl(`${SR_BASE()}/v1/external/courier/track/awb/${encodeURIComponent(awb)}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: controller ? controller.signal : undefined
      });
      if (res.status === 401 && attempt === 0) {
        /* The token aged out under us: one fresh login, one retry, no loop. */
        token = await shiprocketToken(fetchImpl, true);
        if (!token) return null;
        continue;
      }
      if (!res.ok) return null;
      return foldShiprocket(await res.json());
    } catch (error) {
      console.error('Shiprocket track failed', { message: error && error.message });
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  return null;
}

const TIMEOUT_MS = 4000;

function cleanText(value, max = 200) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

function config() {
  const base = cleanText(process.env.PFA_TRACKING_API_BASE, 300).replace(/\/+$/, '');
  const key = cleanText(process.env.PFA_TRACKING_API_KEY, 200);
  return base && key && /^https:\/\//i.test(base) ? { base, key } : null;
}

/* The partner's shape, as documented: status, courier, awb, current_location,
   estimated_delivery, timeline[]. Anything missing is simply absent; anything
   extra is dropped. */
function fold(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const events = Array.isArray(raw.timeline) ? raw.timeline.slice(0, 40).map((e) => ({
    at: cleanText(e && (e.at || e.time || e.date || e.timestamp), 40),
    label: cleanText(e && (e.label || e.status || e.activity || e.description), 160),
    location: cleanText(e && (e.location || e.current_location), 120)
  })).filter((e) => e.label) : [];
  const courier = {
    status: cleanText(raw.status, 60),
    name: cleanText(raw.courier, 80),
    awb: cleanText(raw.awb, 60),
    location: cleanText(raw.current_location, 120),
    eta: cleanText(raw.estimated_delivery, 40),
    events
  };
  return courier.status || courier.awb || events.length ? courier : null;
}

async function enrich(view, fetchImpl = global.fetch) {
  if (typeof fetchImpl !== 'function') return view;
  /* The courier's own record first; the optional partner endpoint after;
     the view untouched when neither is configured or neither answers. */
  try {
    const fromCourier = await fromShiprocket(view, fetchImpl);
    if (fromCourier) return { ...view, courier: fromCourier };
  } catch (error) {
    console.error('Shiprocket lookup failed', { message: error && error.message });
  }
  const cfg = config();
  const orderNumber = cleanText(view && view.orderNumber, 20).replace(/^#/, '');
  if (!cfg || !orderNumber) return view;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : null;
  try {
    const response = await fetchImpl(`${cfg.base}/api/partner/orders/${encodeURIComponent(orderNumber)}`, {
      headers: { Authorization: `Bearer ${cfg.key}`, Accept: 'application/json' },
      signal: controller ? controller.signal : undefined
    });
    if (!response.ok) {
      /* 404 is an order the courier has not met yet - normal in the first
         hours. 401/403 is the key: wrong, rotated or revoked, and the shopper
         cannot fix it, so it is logged as its own event for whoever can. */
      if (response.status === 401 || response.status === 403) {
        console.error('Courier lookup refused: PFA_TRACKING_API_KEY is wrong, rotated or revoked', { status: response.status });
      }
      return view;
    }
    const courier = fold(await response.json());
    return courier ? { ...view, courier } : view;
  } catch (error) {
    console.error('Courier lookup failed', { message: error && error.message });
    return view;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

module.exports = { enrich, _private: { fold, config, foldShiprocket } };
