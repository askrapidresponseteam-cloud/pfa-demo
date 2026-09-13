'use strict';
/* The certificate is a document people frame and print, so it comes two
   ways: a PNG at twice the old raster (~340dpi on A4, past what print asks
   for) and a one-page PDF written by hand - PDF is a text format with a few
   binary guests - so the page's promise that nothing is sent anywhere
   holds: no library, no request. TIFF was considered and declined: browsers
   cannot encode it and no print shop asks for it. */
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const quiz = fs.readFileSync(path.join(__dirname, '..', 'quiz.html'), 'utf8');

test('the certificate draws at print resolution and ships as PDF and PNG, no library', () => {
  assert.match(quiz, /var CERT_SCALE = 2;/, 'twice the raster');
  assert.match(quiz, /ctx\.scale\(CERT_SCALE, CERT_SCALE\)/, 'same coordinate system, four times the pixels');
  assert.match(quiz, /'%PDF-1\.4\\n'/, 'a PDF written by hand');
  assert.match(quiz, /DCTDecode/, 'the drawing rides as a JPEG object');
  assert.match(quiz, /MediaBox\[0 0 ' \+ W \+ ' ' \+ H \+ '\]/, 'one page');
  assert.match(quiz, /var W = 842, H = 595;/, 'A4 landscape, in points');
  assert.match(quiz, /data-cert="pdf">Download PDF<\/button>/, 'PDF offered first');
  assert.match(quiz, /data-cert="png">Download PNG<\/button>/, 'PNG kept');
  assert.match(quiz, /pfa-quiz-certificate\.pdf/, 'named like its sibling');
  assert.ok(!/jspdf|pdf-lib|pdfkit/i.test(quiz), 'no library, no request - as the page promises');
});
