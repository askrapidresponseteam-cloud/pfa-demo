/* POST /api/photo/remove-background

   The fallback for photographs the on-device cut-out declines: a busy
   background, or clothing the same colour as the wall. Those are the cases
   that need a segmentation model, and this hands them to whichever hosted one
   is configured.

   ---- why this route exists at all --------------------------------------

   The provider's key cannot go in the browser, so the image has to pass
   through us. That is a real cost, and it is worth being clear-eyed about what
   is given up: normally a card photograph never leaves the member's device,
   which is what keeps photographs of people out of any database and the member
   area costing a few rupees a month. Every call to this route is an exception
   to that, so the route is built to make the exception as small as possible:

     - it is off unless both environment variables are set, so nothing can
       leak by accident on a deployment that never configured it
     - it stores nothing, and never writes the image or any part of it to a
       log, including on failure
     - it is called only after the member has been told the photograph will be
       sent and has chosen to send it. The consent lives in the interface, not
       here, but this route is useless without it
     - it caps the payload, so it cannot be used as a way to push arbitrary
       volumes of data through the site's function budget

   ---- picking a provider -------------------------------------------------

   Deliberately provider-agnostic. PHOTO_CUTOUT_ENDPOINT and PHOTO_CUTOUT_KEY
   are all it knows; the field name the provider expects is configurable
   because they disagree about it. PhotoRoom is the obvious choice on quality
   and charges a monthly floor plus a fee per image; several others charge a
   twentieth of that per image with no floor. Which is right depends on volume
   and on how much the floor matters against the budget - see the note in the
   handover, not here, because prices change and this comment would go stale. */

const { setSecurityHeaders } = require('../../../lib/ccavenue');

const MAX_BYTES = 6 * 1024 * 1024;        /* a card photograph, generously */
const TIMEOUT_MS = 20000;

function sendJson(response, status, body) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.status(status).send(JSON.stringify(body));
}

function configured() {
  return Boolean(process.env.PHOTO_CUTOUT_ENDPOINT && process.env.PHOTO_CUTOUT_KEY);
}

module.exports = async function handler(request, response) {
  setSecurityHeaders(response);

  if (request.method !== 'POST') return sendJson(response, 405, { error: 'Use POST.' });

  /* Not an error the member should ever see - the interface only offers the
     option when /api/photo/remove-background reports itself available. */
  if (!configured()) return sendJson(response, 503, { error: 'Background removal is not configured.' });

  let image = '';
  try {
    const body = typeof request.body === 'string' ? JSON.parse(request.body) : (request.body || {});
    image = String(body.image || '');
  } catch (error) {
    return sendJson(response, 400, { error: 'Send JSON with an image field.' });
  }

  const comma = image.indexOf(',');
  const base64 = image.startsWith('data:') && comma > -1 ? image.slice(comma + 1) : image;
  if (!base64) return sendJson(response, 400, { error: 'No image was sent.' });

  let bytes;
  try { bytes = Buffer.from(base64, 'base64'); } catch (error) {
    return sendJson(response, 400, { error: 'That image could not be read.' });
  }
  if (!bytes.length) return sendJson(response, 400, { error: 'That image could not be read.' });
  if (bytes.length > MAX_BYTES) return sendJson(response, 413, { error: 'That image is too large.' });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const field = process.env.PHOTO_CUTOUT_FIELD || 'image_file';
    const form = new FormData();
    form.append(field, new Blob([bytes]), 'photo.jpg');
    if (process.env.PHOTO_CUTOUT_FORMAT) form.append('format', process.env.PHOTO_CUTOUT_FORMAT);

    const upstream = await fetch(process.env.PHOTO_CUTOUT_ENDPOINT, {
      method: 'POST',
      headers: { 'x-api-key': process.env.PHOTO_CUTOUT_KEY },
      body: form,
      signal: controller.signal
    });

    if (!upstream.ok) {
      /* The status is useful; the body may quote the request back, so it is
         not logged. */
      console.error('[photo-cutout] provider responded', upstream.status);
      return sendJson(response, 502, { error: 'The background could not be removed just now.' });
    }

    const out = Buffer.from(await upstream.arrayBuffer());
    if (!out.length) return sendJson(response, 502, { error: 'The background could not be removed just now.' });

    return sendJson(response, 200, { image: 'data:image/png;base64,' + out.toString('base64') });
  } catch (error) {
    console.error('[photo-cutout] request failed:', error.name === 'AbortError' ? 'timeout' : error.name);
    return sendJson(response, 502, { error: 'The background could not be removed just now.' });
  } finally {
    clearTimeout(timer);
  }
};

module.exports.configured = configured;
module.exports.MAX_BYTES = MAX_BYTES;
