/* ============================================================================
   DUMMY CARD GENERATION - TESTING ONLY. DELETE BEFORE GOING LIVE.

   To remove: delete this file, and delete the block between
   <!-- DUMMY-GEN START --> and <!-- DUMMY-GEN END --> in caregiver.html.
   Nothing else references it.

   What it does: issues a card entirely in the browser, with no server and no
   Firebase. The card has no card number, no signature, and a placeholder QR
   that points at the PFA home page. Nothing is stored anywhere. It exists so
   the design, the photograph framing and the PDF can be checked end to end
   before the server is connected.
   ========================================================================= */
(function () {
  'use strict';
  var P = window.PFA, J = window.PFAJourney, Card = window.PFACaregiverCard;
  var button = document.querySelector('[data-dummy-gen]');
  if (!P || !J || !Card || !button) return;

  button.addEventListener('click', function () {
    var ok = J.check([
      ['ctName', 'name'], ['ctMobile', 'mobile'], ['ctEmail', 'email'],
      ['ctAddress', 'address'], ['ctPin', 'pin'], ['ctDistrict', 'text'], ['ctState', 'text']
    ]);
    if (!ok) { J.status('#ctStatus', 'Some details above need attention. The first one is highlighted.', true); return; }

    var now = new Date();
    var valid = new Date(now); valid.setFullYear(valid.getFullYear() + 3);
    var address = [J.value('ctAddress'), J.value('ctDistrict'), J.value('ctState'), J.value('ctPin')].filter(Boolean).join(', ');

    /* Same shape the server returns, minus everything that only the server
       can give: no cardId, no token, no card URL. */
    window.PFACaregiverFlow.onIssued({
      cardId: '',
      cardToken: '',
      issuedAt: now.toISOString(),
      validUntil: valid.toISOString(),
      name: J.value('ctName'),
      address: address,
      cardUrl: 'https://peopleforanimalsindia.org/',   /* placeholder QR target */
      sample: true
    });

    var number = document.getElementById('ctCardNumber');
    if (number) number.textContent = 'SAMPLE CARD \u00B7 NO NUMBER';
    var note = document.getElementById('ctIssuedNote');
    if (note) {
      note.classList.add('error');
      note.textContent = 'This is a sample made on this device only. It has no card number, no signature and a placeholder QR, and it has not been recorded anywhere.';
    }
    /* The printed-card payment needs a real card. */
    var pay = document.getElementById('ctPay');
    if (pay) { pay.disabled = true; pay.textContent = 'Printing is not available for a sample card'; }
    var share = document.getElementById('ctCopyShare');
    if (share) share.hidden = true;
  });
}());
