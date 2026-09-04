'use strict';

/* Handing a prescription on to the seller.

   The browser never talks to the seller directly. Three reasons, and each one
   would be a real bug on its own:

   - A cross-origin POST from this site to another domain only works if that
     domain returns the right CORS headers. If it does not, the upload fails
     silently in the browser and the person believes they have sent it.
   - Posting from the page would put the seller's domain in every visitor's
     network tab, which is the opposite of what the shop copy now says.
   - The person would get no reference number, so there would be nothing to
     quote and nothing to follow on the tracking page.

   So the file is stored against a PFA-RX record first, the person is given
   their number, and only then does the server offer a copy to the seller. If
   that fails the prescription is still safe and still visible to a named person
   at PFA, and the panel records that the hand-off did not land.

   Configure with:
     VENDOR_RX_UPLOAD_URL    the endpoint, e.g. https://example.com/api/upload
     VENDOR_RX_UPLOAD_FIELD  form field name for the file  (default "file")
     VENDOR_RX_UPLOAD_TOKEN  optional bearer token
   With no URL set this does nothing at all, which is the current behaviour. */

const TIMEOUT_MS = 8000;
const MAX_BYTES = 6 * 1024 * 1024;

function configured() {
  return Boolean(String(process.env.VENDOR_RX_UPLOAD_URL || '').trim());
}

function endpoint() {
  const url = String(process.env.VENDOR_RX_UPLOAD_URL || '').trim();
  /* Only ever https, and never a bare IP or localhost: a misconfigured value
     must not become a way to make this server fetch something internal. */
  let parsed;
  try { parsed = new URL(url); } catch (error) { return null; }
  if (parsed.protocol !== 'https:') return null;
  if (/^(localhost|\[?::1\]?|\d+\.\d+\.\d+\.\d+)$/i.test(parsed.hostname)) return null;
  return parsed.toString();
}

/* What the seller is told. Deliberately the minimum: the reference so they can
   match it to an order, the product, and the file. No name, no contact, no
   address. If they need more they can ask a person at PFA for it. */
function buildForm(FormDataCtor, BlobCtor, { reference, contentType, bytes, product }) {
  const form = new FormDataCtor();
  const field = String(process.env.VENDOR_RX_UPLOAD_FIELD || 'file').trim() || 'file';
  const ext = /png/i.test(contentType) ? 'png' : /webp/i.test(contentType) ? 'webp' : 'jpg';
  form.append(field, new BlobCtor([bytes], { type: contentType }), `${reference}.${ext}`);
  form.append('reference', reference);
  if (product) form.append('product', product);
  return form;
}

/* Never throws. The caller has already given the person their number, so an
   exception here would turn a working submission into a failed one. */
async function forwardPrescription({ reference, contentType, bytes, product }) {
  if (!configured()) return { attempted: false };
  const url = endpoint();
  if (!url) {
    console.warn('vendor prescription upload: VENDOR_RX_UPLOAD_URL is not a usable https URL');
    return { attempted: false, error: 'BAD_URL' };
  }
  if (!bytes || !bytes.length) return { attempted: false, error: 'NO_FILE' };
  if (bytes.length > MAX_BYTES) return { attempted: false, error: 'TOO_LARGE' };
  if (typeof fetch !== 'function' || typeof FormData !== 'function' || typeof Blob !== 'function') {
    return { attempted: false, error: 'NO_FETCH' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const headers = {};
    const token = String(process.env.VENDOR_RX_UPLOAD_TOKEN || '').trim();
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(url, {
      method: 'POST',
      body: buildForm(FormData, Blob, { reference, contentType, bytes, product }),
      headers,
      signal: controller.signal
    });
    const ok = response.status >= 200 && response.status < 300;
    if (!ok) console.warn('vendor prescription upload refused', { reference, status: response.status });
    return { attempted: true, ok, status: response.status, at: new Date().toISOString() };
  } catch (error) {
    console.warn('vendor prescription upload failed', { reference, message: error && error.message });
    return { attempted: true, ok: false, error: String((error && error.name) || 'ERROR'), at: new Date().toISOString() };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { forwardPrescription, configured, endpoint, MAX_BYTES, TIMEOUT_MS };
