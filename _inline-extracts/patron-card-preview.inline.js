/* ===========================================================
   EXTRACT - patron-card-preview.html
   card preview harness

   2 inline <script> block(s), in document order.
   READ-ONLY REFERENCE COPY. The live code is inside
   patron-card-preview.html in the UI/content zip. Edit it THERE; this file
   is a snapshot for reading and review only.
   =========================================================== */

/* ---- block 1 of 2 ---- */
(() => {
  /* Same payload the live card carries: the verification route, which answers
     only whether a card is real and in date. */
  const canvas = document.getElementById('previewQr');
  if (canvas && window.PFAQR) {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 240, 240);
    window.PFAQR.paint(ctx, 'https://peopleforanimalsindia.org/api/verify-card?id=PFA-MBR-4K7M2QX9', 10, 10, 220);
  }
})();

/* ---- block 2 of 2 ---- */
(() => {
  const flip = document.querySelector('.pfa-card-button[data-card-flip]');
  if (!flip) return;
  flip.addEventListener('click', () => {
    const card = flip.querySelector('[data-patron-card]');
    const back = card.dataset.view === 'back';
    card.dataset.view = back ? 'front' : 'back';
    flip.setAttribute('aria-pressed', String(!back));
  });
})();

