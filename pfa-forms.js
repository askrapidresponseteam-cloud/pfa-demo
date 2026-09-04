/* People for Animals — form submission.
   ------------------------------------------------------------------------
   One helper, used by every form on the site that sends something to PFA, so
   they cannot disagree about what "sent" means.

   The rule it exists to enforce: **the server issues the reference, and the
   page shows success only if one comes back.** Three forms on this site used
   to validate the fields and then show a thank-you without sending anything
   at all — a person nominating a film-maker or reporting a rescue was told it
   had been received when nothing had been recorded. That is the failure this
   file is here to make impossible.

   POST /api/pfa-submissions  { kind, data, page }  ->  { ok, reference }

   Include with: <script src="pfa-forms.js" defer></script>
   ------------------------------------------------------------------------ */
(function (root) {
  'use strict';

  var ENDPOINT = '/api/pfa-submissions';
  var TIMEOUT_MS = 15000;

  /* One key per thing being sent, for the length of this page load. The
     server records the reference it issued under the key, so a double press,
     or a retry after the first attempt timed out on the way back, gets the
     same reference rather than a second record with a second number. What
     changes the key is a change in what is being sent: edit a field and it is
     a new submission again. */
  var NONCE = (function () {
    var v = '';
    try { v = (crypto && crypto.randomUUID) ? crypto.randomUUID() : ''; } catch (_) {}
    return v || (String(Date.now()) + Math.random().toString(36).slice(2));
  })();
  function hash(text) {
    var h = 2166136261;
    for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h.toString(36);
  }
  function requestKey(kind, data, photos) {
    var body = JSON.stringify([kind, data || {}, (photos || []).map(function (p) { return String(p || '').length; })]);
    return NONCE + '-' + hash(body);
  }

  function textOf(error) {
    var message = error && error.message ? String(error.message) : '';
    if (/abort/i.test(message)) return 'That took too long. Check your connection and try again.';
    if (/fetch|network|failed/i.test(message)) return 'That could not be sent. Check your connection and try again.';
    return message || 'That could not be sent. Please try again.';
  }

  function requestBody(kind, data, opts) {
    opts = opts || {};
    return JSON.stringify({
      kind: kind,
      data: data || {},
      /* The server checks these by their bytes, not their label, and keeps
         them as private documents beside the record. */
      photos: Array.isArray(opts.photos) ? opts.photos : undefined,
      page: opts.page || (location.pathname.replace(/^\//, '') || 'index.html'),
      clientRequestId: requestKey(kind, data, opts.photos)
    });
  }

  /* Resolves with a reference, or rejects. It never resolves without one:
     a caller cannot accidentally report success for a request that failed. */
  function submit(kind, data, options) {
    var opts = options || {};
    if (typeof fetch !== 'function') {
      return Promise.reject(new Error('This browser cannot send the form. Please email PFA instead.'));
    }

    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, TIMEOUT_MS) : null;

    return fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: requestBody(kind, data, opts),
      signal: controller ? controller.signal : undefined
    })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (payload) {
          return { ok: response.ok, status: response.status, payload: payload };
        });
      })
      .then(function (result) {
        if (timer) clearTimeout(timer);
        var payload = result.payload || {};
        if (!result.ok) {
          /* The server names the field it refused, so say which one. */
          var first = Array.isArray(payload.errors) && payload.errors[0];
          throw new Error(first && first.message ? first.message
            : payload.error || 'That could not be sent. Please check the form and try again.');
        }
        if (!payload.reference) {
          throw new Error('That was sent, but no reference came back. Please try again before assuming it arrived.');
        }
        return payload.reference;
      })
      .catch(function (error) {
        if (timer) clearTimeout(timer);
        throw new Error(textOf(error));
      });
  }

  /* Wires a form once: disables the button while in flight, shows the
     reference on success, and shows the reason on failure rather than a
     thank-you. `collect` returns the data object, or null if the caller has
     already reported its own validation problem. */
  function wire(form, config) {
    if (!form || form.dataset.pfaWired === 'yes') return;
    form.dataset.pfaWired = 'yes';

    var button = config.button || form.querySelector('[type="submit"], button:not([type="button"])');
    var status = config.status || form.querySelector('[data-form-status]');
    var busy = false;

    function say(message, kind) {
      if (!status) return;
      status.textContent = message || '';
      status.setAttribute('data-state', kind || '');
      status.hidden = !message;
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (busy) return;

      var data;
      try { data = config.collect(); } catch (error) { say(textOf(error), 'bad'); return; }
      if (!data) return;                       // the caller has flagged its own fields

      busy = true;
      var label = button ? button.textContent : '';
      if (button) { button.disabled = true; button.textContent = config.sending || 'Sending\u2026'; }
      say('', '');

      submit(config.kind, data, { page: config.page })
        .then(function (reference) {
          busy = false;
          if (button) { button.disabled = false; button.textContent = label; }
          if (typeof config.onSent === 'function') config.onSent(reference);
          else say('Sent. Your reference is ' + reference + '.', 'good');
        })
        .catch(function (error) {
          busy = false;
          if (button) { button.disabled = false; button.textContent = label; }
          if (typeof config.onFailed === 'function') config.onFailed(error);
          else say(error.message, 'bad');
        });
    });
  }

  /* The endpoint takes JPEG, PNG or WebP up to 950 KB each. A photograph off a
     phone is usually several times that, so shrink before sending rather than
     bouncing the person off a size limit they cannot see. */
  function shrink(file, maxEdge, quality) {
    return new Promise(function (resolve, reject) {
      if (!/^image\//.test(file.type)) {
        reject(new Error('That is not an image. Photograph the prescription, or export the PDF as a picture.'));
        return;
      }
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('That file could not be read.')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('That image could not be opened.')); };
        img.onload = function () {
          var edge = maxEdge || 1600;
          var scale = Math.min(1, edge / Math.max(img.width, img.height));
          var canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          var out = canvas.toDataURL('image/jpeg', quality || 0.82);
          /* Still over the server's limit: drop the quality once more rather
             than fail. Base64 is about 4/3 of the bytes it encodes. */
          if (out.length * 0.75 > 950 * 1024) out = canvas.toDataURL('image/jpeg', 0.6);
          resolve(out);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  root.PFAForms = { submit: submit, wire: wire, shrink: shrink, ENDPOINT: ENDPOINT, _requestBody: requestBody };
}(typeof window !== 'undefined' ? window : this));
