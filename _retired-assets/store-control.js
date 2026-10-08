/* The Store switch, for the admin panel.
   ------------------------------------------------------------------------
   One decision, three states, in the order an administrator thinks about
   them: how much to sell, then whether to sell at all.

   Design notes, because they are deliberate and easy to undo by accident:

   - The current state is a sentence, not a badge. "The Store is open. Food is
     limited to vegetarian." reads the same to someone who has never seen this
     panel before.
   - Each choice says what it would do and how many products it would list, so
     the consequence is visible before the press, not discovered after.
   - Closing asks once, because it stops every shopper mid-purchase. The other
     two do not, because they are reversible in one press and nothing breaks.
   - Nothing is saved until a choice is pressed. There is no separate Save, and
     therefore no half-changed state to misread.
   - After a change the panel says what happened and when, in words.

   Mount from admin.html with the panel's own auth helpers:

       PFAStoreControl.mount(document.querySelector('[data-store-control]'),
                             { call: call, post: post });
   ------------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var COPY = {
    veg: {
      title: 'Vegetarian food only',
      blurb: 'Food has to read as vegetarian and carry no animal protein. Everything that is not food is listed as normal.'
    },
    all: {
      title: 'Everything the vendor lists',
      blurb: 'Every product the seller publish, including food that is not vegetarian.'
    },
    off: {
      title: 'Close the Store',
      blurb: 'Nothing is listed and nothing can be bought. Anyone already at checkout is stopped.'
    }
  };

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function when(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  }

  /* The state as a sentence. */
  function summary(data) {
    if (!data.open) return 'The Store is closed. Nothing is listed and nothing can be bought.';
    if (data.state === 'veg') return 'The Store is open. Food is limited to vegetarian.';
    return 'The Store is open. Everything the vendor lists is on sale, including food that is not vegetarian.';
  }

  function countFor(key, counts) {
    if (!counts || !counts.available) return '';
    if (key === 'off') return 'No products';
    var n = counts[key];
    if (typeof n !== 'number') return '';
    return n + (n === 1 ? ' product' : ' products');
  }

  function mount(root, io) {
    if (!root) return;
    var call = io && io.call;
    var post = io && io.post;
    if (typeof call !== 'function' || typeof post !== 'function') {
      root.innerHTML = '<p class="sc-note">The Store switch needs the panel\u2019s sign-in helpers.</p>';
      return;
    }

    var data = null, busy = false, confirming = null;

    function render() {
      if (!data) {
        root.innerHTML = '<div class="sc"><p class="sc-note">Reading the Store settings\u2026</p></div>';
        return;
      }
      var stale = data.source && String(data.source).indexOf('fallback') > -1;
      root.innerHTML =
        '<div class="sc' + (data.open ? '' : ' sc--closed') + '">' +
          '<div class="sc-now">' +
            '<span class="sc-dot" aria-hidden="true"></span>' +
            '<div>' +
              '<p class="sc-state">' + esc(summary(data)) + '</p>' +
              (data.changedAt
                ? '<p class="sc-meta">Last changed ' + esc(when(data.changedAt)) + '</p>'
                : '<p class="sc-meta">Never changed from the default.</p>') +
            '</div>' +
          '</div>' +
          (stale ? '<p class="sc-warn">Showing the last known setting: the database could not be reached.</p>' : '') +
          '<ul class="sc-choices">' +
            ['veg', 'all', 'off'].map(function (key) {
              var current = data.state === key;
              var count = countFor(key, data.counts);
              return '<li class="sc-choice' + (current ? ' is-current' : '') + (key === 'off' ? ' sc-choice--stop' : '') + '">' +
                '<div class="sc-choice__text">' +
                  '<p class="sc-choice__title">' + esc(COPY[key].title) + '</p>' +
                  '<p class="sc-choice__blurb">' + esc(COPY[key].blurb) + '</p>' +
                  (count ? '<p class="sc-choice__count">' + esc(count) + '</p>' : '') +
                '</div>' +
                (current
                  ? '<span class="sc-current">Current</span>'
                  : (confirming === key
                      ? '<span class="sc-confirm">' +
                          '<button type="button" class="sc-btn sc-btn--stop" data-go="' + key + '">Yes, close it</button>' +
                          '<button type="button" class="sc-btn sc-btn--quiet" data-cancel>Cancel</button>' +
                        '</span>'
                      : '<button type="button" class="sc-btn" data-pick="' + key + '"' + (busy ? ' disabled' : '') + '>' +
                          (key === 'off' ? 'Close' : 'Switch') +
                        '</button>')) +
              '</li>';
            }).join('') +
          '</ul>' +
          '<p class="sc-note" data-sc-note aria-live="polite"></p>' +
        '</div>';
    }

    function note(message, kind) {
      var el = root.querySelector('[data-sc-note]');
      if (!el) return;
      el.textContent = message || '';
      el.className = 'sc-note' + (kind ? ' sc-note--' + kind : '');
    }

    function load() {
      return call('/api/admin/store')
        .then(function (result) { data = result; render(); })
        .catch(function (error) {
          root.innerHTML = '<div class="sc"><p class="sc-note sc-note--bad">' +
            esc(error.message || 'The Store settings could not be read.') + '</p></div>';
        });
    }

    function apply(state) {
      if (busy) return;
      busy = true;
      confirming = null;
      render();
      note('Saving\u2026');
      post('/api/admin/store', { state: state })
        .then(function (result) {
          data = Object.assign({}, data, result);
          busy = false;
          render();
          note(result.changed
            ? (state === 'off'
                ? 'The Store is closed. Shoppers see a closed notice and checkout is refused.'
                : 'Saved. Shoppers see this on their next page load.')
            : 'That was already the setting. Nothing changed.', 'good');
        })
        .catch(function (error) {
          busy = false;
          render();
          note(error.message || 'That could not be saved. The Store has not changed.', 'bad');
        });
    }

    root.addEventListener('click', function (event) {
      var pick = event.target.closest('[data-pick]');
      if (pick) {
        var key = pick.getAttribute('data-pick');
        /* Closing stops every shopper mid-purchase, so it is confirmed once.
           The other two are reversible in a press and are not. */
        if (key === 'off') { confirming = 'off'; render(); note(''); return; }
        apply(key);
        return;
      }
      var go = event.target.closest('[data-go]');
      if (go) { apply(go.getAttribute('data-go')); return; }
      if (event.target.closest('[data-cancel]')) { confirming = null; render(); }
    });

    render();
    return load();
  }

  global.PFAStoreControl = { mount: mount };
}(typeof window !== 'undefined' ? window : this));
