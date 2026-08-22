/* ============================================================================
   DUMMY PATRON CARD - TESTING ONLY. DELETE BEFORE GOING LIVE.

   To remove: delete this file, and the DUMMY-GEN block and script tag in
   membership.html. Nothing else references it.

   Builds the Patron card PDF from the form on this device: no member number,
   no payment, nothing stored.
   ========================================================================= */
(function () {
  'use strict';
  var P = window.PFA, R = window.PFA_RULES;
  var button = document.querySelector('[data-dummy-gen]');
  if (!P || !button) return;

  function value(id) {
    var f = document.getElementById(id);
    if (!f) return '';
    return R && R.ruleName(id, f.type) ? R.normaliseField(id, f.value, f.type) : String(f.value || '').trim();
  }
  function status(msg, bad) {
    var n = document.getElementById('patronDummyStatus');
    if (!n) return;
    n.textContent = msg || ''; n.classList.toggle('error', !!bad);
  }

  button.addEventListener('click', function () {
    var nameField = document.getElementById('patronName');
    var msg = R ? R.checkField('name', nameField && nameField.value, { required: true, emptyMessage: 'Enter the name for the card.' }) : null;
    if (msg) { if (P.markField && nameField) P.markField(nameField, msg); status(msg, true); nameField && nameField.focus(); return; }

    var Patron = window.PFAPatronCard;
    if (!Patron) { status('The card file is still loading. Try again in a moment.', true); return; }

    /* The file is made from the live card on screen, so it is the preview. */
    var card = document.querySelector('#join [data-patron-card]') || document.querySelector('[data-patron-card]');
    var idle = button.textContent; button.disabled = true; button.textContent = 'Preparing PDF...'; status('');
    Patron.downloadPdf(card)
      .then(function () { status('Sample PDF downloaded. It has no member number and has not been recorded anywhere.'); })
      .catch(function () { status('The PDF could not be created.', true); })
      .then(function () { button.disabled = false; button.textContent = idle; });
  });
}());
