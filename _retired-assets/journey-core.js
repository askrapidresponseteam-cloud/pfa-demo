/* Shared behaviour for the PFA application journeys.

   Both the Colony Caregiver Card and the Patron card use this: the same Begin
   disclosure, the same step handling, the same field validation and busy
   states, the same photograph control, the same "ship somewhere else"
   disclosure. Anything that behaves differently between the two journeys is a
   bug, not a design choice. */
(function () {
  'use strict';

  /* site.js loads AFTER this file, so a top-level `var P = window.PFA` would
     capture undefined for the lifetime of the module and every P.q() call
     would throw. Resolve window.PFA dynamically instead. */
  var P = new Proxy({}, {
    get: function (_t, prop) {
      var real = window.PFA;
      if (!real) return undefined;
      return real[prop];
    }
  });

  /* A journey stays closed until Begin. */
  function disclose(options) {
    var button = P.q(options.button);
    var journey = P.q(options.journey);
    if (!button || !journey) return;

    button.addEventListener('click', function () {
      journey.hidden = false;
      journey.dataset.journeyOpen = 'true';
      button.setAttribute('aria-expanded', 'true');
      var title = P.q(options.title);
      if (title) window.setTimeout(function () { title.focus(); }, 240);
      if (options.onOpen) options.onOpen();
    });
  }

  /* Steps live on one page; only the active one is in the flow. */
  function steps(scope) {
    var host = P.q(scope) || document;
    return {
      go: function (name, after) {
        P.qa('[data-scene]', host).forEach(function (scene) {
          scene.classList.toggle('is-active', scene.dataset.scene === name);
        });
        host.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (after) after();
      }
    };
  }

  function fieldOf(id) {
    var input = P.q('#' + id);
    return input ? input.closest('.field') : null;
  }

  function mark(id, bad, message) {
    var input = P.q('#' + id);
    if (input && P.markField) {
      P.markField(input, bad ? (message || 'Check this entry.') : null);
      return !bad;
    }
    var field = fieldOf(id);
    if (field) field.classList.toggle('invalid', Boolean(bad));
    return !bad;
  }

  /* The value as it will be stored and printed: names and places in Title
     Case, mobiles as bare digits. The rule is found from the field's id, so
     the card preview shows exactly what the card will say. */
  function value(id) {
    var input = P.q('#' + id);
    if (!input) return '';
    var R = window.PFA_RULES;
    if (R && R.ruleName(id, input.type)) return R.normaliseField(id, input.value, input.type);
    return String(input.value || '').trim();
  }

  /* One validator for both journeys, so an error looks and behaves the same
     wherever it appears. */
  /* These journeys used to carry their own weaker copy of the rules, which
     is how the name field on the card application came to accept
     "karthik dhanya11": the local rule asked only for two characters. Rules
     now come from assets/field-rules.js, the same definition the rest of the
     site and the API use, so a name is judged identically whether it is
     typed here, on a help form, or posted straight at the API.

     The pair labels callers pass ('text' for a district, and so on) map onto
     the shared field names. */
  var RULE_FIELD = {
    name: 'name', mobile: 'mobile', email: 'email', pin: 'pin',
    text: 'city', address: 'address', cardId: 'cardId'
  };

  function ruleMessage(kind, raw) {
    var R = window.PFA_RULES;
    if (!R) {
      return String(raw || '').trim().length >= 2 ? null : 'This is needed.';
    }
    return R.checkField(RULE_FIELD[kind] || 'city', raw, { required: true });
  }

  function rawValue(id) {
    var input = P.q('#' + id);
    return input ? String(input.value || '') : '';
  }

  function check(pairs) {
    var firstBad = null;
    pairs.forEach(function (pair) {
      var message = ruleMessage(pair[1], rawValue(pair[0]));
      mark(pair[0], Boolean(message), message);
      if (message && !firstBad) firstBad = pair[0];
    });
    if (firstBad) {
      var input = P.q('#' + firstBad);
      if (input) {
        if (input.scrollIntoView) input.scrollIntoView({ block: 'center', behavior: 'smooth' });
        input.focus({ preventScroll: true });
      }
      return false;
    }
    return true;
  }

  function status(target, message, isError) {
    var node = P.q(target);
    if (!node) return;
    node.textContent = message || '';
    node.classList.toggle('error', Boolean(isError));
    /* An error nobody sees is not an error message. */
    if (isError && message && node.scrollIntoView) node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  /* The forms that issue cards and take payment talk to /api/... on the PFA
     server. A copy of the site opened as a file, or served from a plain
     static host, has no server behind it, so the call cannot succeed. Say so
     in words, rather than "no connection" when the Wi-Fi is fine. */
  function serverAvailable() {
    return /^https?:$/.test(location.protocol);
  }

  function explainFailure(target, fallback) {
    if (!serverAvailable()) {
      return status(target, 'This page is open as a file, so it cannot reach the PFA server that issues cards. Open it at the website address (https://...) and try again.', true);
    }
    return status(target, fallback || 'The PFA server could not be reached. Check your connection and try again.', true);
  }

  function busy(button, on, label) {
    if (!button) return;
    if (on) {
      button.dataset.idle = button.dataset.idle || button.textContent;
      button.textContent = label || 'Working...';
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
    } else {
      if (button.dataset.idle) button.textContent = button.dataset.idle;
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  }

  /* "Ship to a different address" - closed by default in both journeys,
     because the address has already been given once. */
  function shipElsewhere(options) {
    var toggle = P.q(options.toggle);
    var fields = P.q(options.fields);
    if (!toggle || !fields) return { open: function () { return false; } };

    toggle.addEventListener('click', function () {
      var showing = fields.hidden === false;
      fields.hidden = showing;
      toggle.textContent = showing
        ? 'Ship to a different address \u2192'
        : 'Use my card address instead \u2192';
      if (!showing) {
        var first = fields.querySelector('input, textarea');
        if (first) first.focus();
      }
    });

    return { open: function () { return fields.hidden === false; } };
  }

  /* A hidden form POST, used wherever a response has to become the document
     rather than be read as JSON - which is how the CCAvenue hand-off works. */
  function post(action, fields) {
    var form = document.createElement('form');
    form.method = 'POST';
    form.action = action;
    form.style.display = 'none';
    Object.keys(fields).forEach(function (key) {
      if (fields[key] === undefined || fields[key] === null) return;
      var input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = fields[key];
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
  }

  function clientRef(prefix) {
    var bytes = new Uint8Array(12);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
    return (prefix || 'PFA') + Array.prototype.map.call(bytes, function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('').toUpperCase();
  }

  /* The photograph control, wired identically wherever it appears. */
  function photo(options) {
    var input = P.q(options.input);
    var label = P.q(options.label);
    var editor = window.PFAPhotoEditor.create({
      mount: P.q(options.mount),
      aspect: options.aspect,
      outputWidth: options.outputWidth,
      /* The colour the subject is laid onto once the background is lifted.
         The Patron card's photograph well is a pale blue, the Colony caregiver card's
         is near-white, so the caller says which. */
      ground: options.ground,
      remote: options.remote,
      ml: options.ml,
      input: input,
      /* The editor calls this whenever the picture it would hand over has
         changed. Background removal finishes after load() has already
         resolved - it decodes the lifted image separately - and the toggle can
         change it again later, so the caller has to be told again both times
         or the card keeps showing the photograph as it first arrived. */
      onChange: function () {
        if (options.onChange) options.onChange();
        if (options.onLoaded) options.onLoaded();
      }
    });

    if (input && editor) {
      input.addEventListener('change', function () {
        var file = this.files && this.files[0];
        if (!file) return;
        if (!/^image\//.test(file.type)) { P.toast('Choose a JPG, PNG or WebP image'); this.value = ''; return; }
        if (file.size > 12582912) { P.toast('Choose an image smaller than 12 MB'); this.value = ''; return; }
        if (label) label.textContent = 'Preparing photograph...';
        editor.load(file).then(function () {
          if (label) label.textContent = file.name;
          if (options.onLoaded) options.onLoaded();
        }).catch(function () {
          if (label) label.textContent = 'Choose a photograph';
          P.toast('That image could not be read');
        });
      });
    }

    return editor;
  }

  window.PFAJourney = {
    busy: busy,
    check: check,
    clientRef: clientRef,
    disclose: disclose,
    mark: mark,
    photo: photo,
    post: post,
    shipElsewhere: shipElsewhere,
    status: status,
    explainFailure: explainFailure,
    serverAvailable: serverAvailable,
    steps: steps,
    value: value
  };
})();
