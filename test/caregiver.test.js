'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const CAREGIVER = require('../lib/caregiver');
const mail = require('../lib/caregiver-mail');
const { parsePaymentRequest } = require('../lib/payment');

const application = {
  name: 'Asha Kumar',
  mobile: '9876543210',
  email: 'asha@example.com',
  address: 'C-25, Shanti Nagar, Block A, Colony Road, New Delhi 110031'
};

test('identifiers are distinguishable and unambiguous to read aloud', () => {
  assert.match(CAREGIVER.createCardId(), CAREGIVER.CARD_ID_PATTERN);
  assert.match(CAREGIVER.createOrderId(), CAREGIVER.ORDER_ID_PATTERN);
  assert.match(CAREGIVER.createShipmentId(), CAREGIVER.SHIPMENT_ID_PATTERN);
  assert.ok(!/[01IO]/.test(CAREGIVER.ALPHABET), 'ambiguous glyphs must not appear in card numbers');
});

test('the application asks for five things and validates every one', () => {
  const parsed = CAREGIVER.parseApplication(application);
  assert.equal(parsed.name, 'Asha Kumar');
  assert.equal(parsed.pin, '110031', 'the PIN is read out of the address, never asked for twice');

  assert.throws(() => CAREGIVER.parseApplication({ ...application, mobile: '1234567890' }), /mobile/i);
  assert.throws(() => CAREGIVER.parseApplication({ ...application, email: 'not-an-email' }), /email/i);
  assert.throws(() => CAREGIVER.parseApplication({ ...application, name: 'A' }), /name/i);
  assert.throws(() => CAREGIVER.parseApplication({ ...application, address: 'C-25, Shanti Nagar' }), /PIN/i);
});

test('mobile numbers normalise to one shape so duplicates cannot slip past', () => {
  ['9876543210', '+91 98765 43210', '09876543210', '91-9876543210'].forEach((input) => {
    assert.equal(CAREGIVER.normaliseMobile(input), '9876543210');
  });
});

test('delivery defaults to the card address and is only asked for when it differs', () => {
  assert.deepEqual(CAREGIVER.parseDeliveryChoice({}), { sameAsCardAddress: true });
  assert.deepEqual(CAREGIVER.parseDeliveryChoice({ deliverElsewhere: 'no' }), { sameAsCardAddress: true });

  const elsewhere = CAREGIVER.parseDeliveryChoice({
    deliverElsewhere: 'yes',
    recipient: 'Meena Rao',
    deliveryAddress: '4 Turner Road, Bandra West, Mumbai 400050'
  });
  assert.equal(elsewhere.sameAsCardAddress, false);
  assert.equal(elsewhere.pin, '400050');
  assert.throws(() => CAREGIVER.parseDeliveryChoice({ deliverElsewhere: 'yes', recipient: 'X' }), /delivery address/i);
});

test('card validity runs three years from issue', () => {
  const { issuedAt, validUntil } = CAREGIVER.computeValidity('2026-08-21T00:00:00.000Z');
  assert.equal(new Date(validUntil).getUTCFullYear() - new Date(issuedAt).getUTCFullYear(), 3);
  assert.equal(CAREGIVER.cardStanding({ status: 'active', validUntil }, '2027-01-01'), 'active');
  assert.equal(CAREGIVER.cardStanding({ status: 'active', validUntil }, '2030-01-01'), 'expired');
  assert.equal(CAREGIVER.cardStanding({ status: 'revoked', validUntil }, '2027-01-01'), 'revoked');
});

test('a shipment can only move forwards, and never out of a terminal state', () => {
  assert.ok(CAREGIVER.canTransition(null, 'order_confirmed'));
  assert.ok(CAREGIVER.canTransition('order_confirmed', 'preparing'));
  assert.ok(CAREGIVER.canTransition('preparing', 'out_for_delivery'), 'skipping ahead is allowed');

  assert.ok(!CAREGIVER.canTransition('dispatched', 'preparing'), 'no walking backwards');
  assert.ok(!CAREGIVER.canTransition('delivered', 'in_transit'), 'delivered is final');
  assert.ok(!CAREGIVER.canTransition('cancelled', 'dispatched'), 'cancelled is final');
  assert.ok(!CAREGIVER.canTransition('preparing', 'preparing'), 'no self-transitions');
  assert.ok(!CAREGIVER.canTransition('preparing', 'teleported'), 'unknown states are rejected');

  assert.ok(CAREGIVER.canTransition('in_transit', 'exception'), 'exits are always reachable');
  assert.ok(CAREGIVER.canTransition('exception', 'out_for_delivery'), 'an exception can be recovered');
  assert.ok(!CAREGIVER.canTransition('exception', 'preparing'), 'but not back to before dispatch');
});

test('only meaningful delivery steps are emailed', () => {
  assert.ok(CAREGIVER.shouldNotify('dispatched'));
  assert.ok(CAREGIVER.shouldNotify('delivered'));
  assert.ok(!CAREGIVER.shouldNotify('in_transit'), 'four courier scans must not send four emails');
  assert.ok(!CAREGIVER.shouldNotify('preparing'));
});

test('the public projection cannot leak the holder', () => {
  const projection = CAREGIVER.publicProjection({
    card: {
      cardId: 'PFA-CCT-ABCD2345',
      name: 'Asha Kumar',
      status: 'active',
      issuedAt: '2026-08-21T00:00:00.000Z',
      validUntil: '2029-08-21T00:00:00.000Z',
      mobile: '9876543210',
      email: 'asha@example.com',
      address: 'C-25, Shanti Nagar',
      tokenHash: 'deadbeef'
    },
    shipment: {
      trackingId: 'PFA-SHP-ABCD2345',
      status: 'dispatched',
      carrier: 'India Post',
      history: [{ status: 'order_confirmed', at: '2026-08-21T00:00:00.000Z' }]
    }
  });

  const serialised = JSON.stringify(projection);
  ['9876543210', 'asha@example.com', 'Shanti Nagar', 'deadbeef'].forEach((secret) => {
    assert.ok(!serialised.includes(secret), `${secret} must never reach a public card page`);
  });
  assert.equal(projection.delivery.statusLabel, 'Dispatched');
});

test('card tokens are stored hashed and compared in constant time', () => {
  const raw = CAREGIVER.createCardToken();
  const stored = CAREGIVER.hashToken(raw);
  assert.notEqual(stored, raw);
  assert.ok(CAREGIVER.safeEqual(stored, CAREGIVER.hashToken(raw)));
  assert.ok(!CAREGIVER.safeEqual(stored, CAREGIVER.hashToken(CAREGIVER.createCardToken())));
  assert.ok(!CAREGIVER.safeEqual(stored, 'short'), 'length mismatch must not throw');
});

test('caregiver shipping cannot be pushed through the generic payment endpoint', () => {
  assert.throws(() => parsePaymentRequest({ type: 'caregiver', amount: '1' }), /card page/i);
});

test('every email template renders with a subject, html and plain text', () => {
  const payloads = {
    card_issued: { name: 'Asha', cardId: 'PFA-CCT-ABCD2345', issuedAt: '2026-08-21', validUntil: '2029-08-21', cardUrl: 'https://pfa/c' },
    shipping_paid: { cardId: 'PFA-CCT-ABCD2345', trackingId: 'PFA-SHP-ABCD2345', amount: '100.00', paymentReference: 'TRK1', cardUrl: 'https://pfa/c' },
    shipment_update: { status: 'delivered', statusLabel: 'Delivered', trackingId: 'PFA-SHP-ABCD2345', cardId: 'PFA-CCT-ABCD2345', cardUrl: 'https://pfa/c' }
  };

  Object.keys(payloads).forEach((template) => {
    const rendered = mail.render(template, payloads[template]);
    assert.ok(rendered.subject.length > 5, `${template} needs a subject`);
    assert.ok(rendered.html.includes('<html'), `${template} needs html`);
    assert.ok(rendered.text.length > 20, `${template} needs a text part`);
  });

  assert.throws(() => mail.render('nope', {}), /Unknown email template/);
});

test('email templates escape what they interpolate', () => {
  const rendered = mail.render('card_issued', {
    name: '<script>alert(1)</script>',
    cardId: 'PFA-CCT-ABCD2345',
    issuedAt: '2026-08-21',
    validUntil: '2029-08-21',
    cardUrl: 'https://pfa/c'
  });
  assert.ok(!rendered.html.includes('<script>alert'), 'template output must not carry raw markup');
});

function loadRenderer() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'caregiver-card.js'), 'utf8');
  const context = {
    window: {}, document: { createElement: () => ({ getContext: () => ({}) }), fonts: null },
    Image: function () {}, Blob, TextEncoder, atob, URL, setTimeout
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window.PFACaregiverCard;
}

test('the print-ready PDF is a valid two-page document at true card size', async () => {
  const renderer = loadRenderer();
  const jpeg = fs.readFileSync(path.join(__dirname, 'fixtures', 'card-sample.jpg'));
  const page = { width: 1276, height: 2022, bytes: new Uint8Array(jpeg) };
  const pdf = Buffer.from(await renderer._buildPdf([page, page]).arrayBuffer());
  const text = pdf.toString('latin1');

  assert.ok(text.startsWith('%PDF-1.4'));
  assert.equal((text.match(/\/Type \/Page[^s]/g) || []).length, 2);
  assert.match(text, /\/MediaBox \[0 0 153\.071 242\.646\]/);

  const xrefStart = Number(text.slice(text.lastIndexOf('startxref')).split('\n')[1]);
  const entries = text.slice(xrefStart).split('\n').slice(2).filter((line) => /\d{10} \d{5} n/.test(line));
  assert.equal(entries.length, 8);
  entries.forEach((entry, index) => {
    assert.ok(text.startsWith(`${index + 1} 0 obj`, Number(entry.slice(0, 10))),
      `object ${index + 1} is not at its cross-reference offset`);
  });
});

test('identity fingerprints catch the same person applying twice', () => {
  const asha = CAREGIVER.identityKey('Asha Kumar', '110031');
  assert.equal(CAREGIVER.identityKey('Dr. Asha Kumar', '110031'), asha, 'honorifics are stripped');
  assert.equal(CAREGIVER.identityKey('  asha   KUMAR ', '110031'), asha, 'case and spacing are normalised');
  assert.equal(CAREGIVER.identityKey('Kumar Asha', '110031'), asha, 'name order does not matter');
  assert.notEqual(CAREGIVER.identityKey('Asha Kumar', '560001'), asha, 'a different PIN is a different person');
  assert.notEqual(CAREGIVER.identityKey('Meena Kumar', '110031'), asha, 'a different name is a different person');
});

test('a household key is stable for one address and unique across addresses', () => {
  const a = CAREGIVER.householdKey('C-25, Shanti Nagar, Block A', '110031');
  assert.equal(CAREGIVER.householdKey('c-25  shanti nagar block a', '110031'), a);
  assert.notEqual(CAREGIVER.householdKey('C-26, Shanti Nagar, Block A', '110031'), a);
});


test('photograph resolution thresholds follow print maths, not guesswork', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'photo-editor.js'), 'utf8');
  const context = { window: {}, document: { createElement: () => ({ getContext: () => ({}) }) },
    Image: function () {}, FileReader: function () {}, setTimeout };
  vm.createContext(context);
  vm.runInContext(source, context);
  const editor = context.window.PFAPhotoEditor;
  assert.equal(editor.IDEAL_PX, 638, '54 mm at 300 dpi');
  assert.ok(editor.POOR_PX < editor.IDEAL_PX && editor.POOR_PX > 300);
});

test('the chairperson signature only appears on a card that has actually been issued', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'caregiver-card.js'), 'utf8');
  const context = {
    window: {}, document: { createElement: () => ({ getContext: () => ({}) }), fonts: null },
    Image: function () {}, Blob, TextEncoder, atob, URL, setTimeout
  };
  /* In a browser `self` is `window`, which is where the completer's UMD
     wrapper attaches itself. The sandbox has no `self`, so it is pointed at
     the same object or the module would land on the sandbox global and the
     renderer would never see it. */
  context.self = context.window;
  vm.createContext(context);
  /* The field completer has to be in the context, because the renderer defers
     to it and falls back to raw data when it is absent - which is exactly the
     condition the last assertion below makes sure can never happen in a page. */
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'assets', 'card-fields.js'), 'utf8'), context);
  vm.runInContext(source, context);
  const Card = context.window.PFACaregiverCard;

  /* A signature on a preview would be an authorisation of nothing, so hydrate
     only fetches it once the register has given the card a number. The preview
     case resolves without touching the network at all. */
  const preview = await Card.hydrate({ cardId: 'PFA-CCT-\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' });
  assert.equal(preview.signatureImage, null, 'a live preview must not carry the signature');
  assert.equal(preview.photoImage, null);

  // And the gate itself is a real card-number match, not a truthiness check.
  assert.match(source, /ISSUED_CARD = \/\^PFA-CCT-\[A-Z0-9\]\{8\}\$\//);

  /* The gate must be read from the data as it arrived, before the field
     completer runs. Completion exists to make sure nothing prints blank, and a
     gate placed after it would be deciding whether to stamp the chairperson's
     signature on the strength of a value the completer supplied. */
  const gate = source.indexOf('var issued = isIssued(data);');
  const fill = source.indexOf('var filled = complete(data);');
  assert.ok(gate > -1, 'the signature gate reads isIssued from the incoming data');
  assert.ok(fill > -1, 'hydrate completes the fields');
  assert.ok(gate < fill, 'the gate must be evaluated before the fields are completed');
  assert.match(source, /issued \? loadImage\(SIGNATURE_SRC\)/);

  /* Behaviour, not just shape: a card with no number at all still gets no
     signature, however much the completer fills in around it. */
  const empty = await Card.hydrate({});
  assert.equal(empty.signatureImage, null, 'an empty card must not carry the signature');
  assert.ok(empty.issuedOn, 'but the rest of the card is still filled in');
});

test('the card prints the issue date and no expiry', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'caregiver-card.js'), 'utf8');
  /* The back is laid out from a list of sections now rather than a run of
     label() calls at fixed coordinates, so the label appears as data. Both
     forms are accepted: what is being asserted is that the issue date is on
     the card and no validity date is, not how the layout is expressed. */
  assert.ok(/label\('Issued on'|label: 'Issued on'/.test(source), 'the back carries the issue date');
  assert.ok(!/label\('Valid Until'|label: 'Valid Until'/.test(source), 'no validity is printed on the card');
  /* The card says what every page, email and the verify API say. "Caregiver"
     was the one place the site disagreed with itself. */
  assert.ok(source.includes("var ROLE = 'Colony caregiver'"), 'the role reads Colony caregiver, like the rest of the site');
});

test('the back is laid out from measured content, not fixed coordinates', () => {
  /* The fault this replaced: the divider under the address sat at a constant,
     so a two-line address printed with an inch of nothing under it. If these
     go away, that fault has come back. */
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'caregiver-card.js'), 'utf8');
  assert.ok(/section\.height = section\.qr \? 88 : LABEL_DROP \+ section\.lines\.length \* section\.step/.test(source),
    'each section reports the height its own content needs');
  assert.ok(source.includes('divider(y + gap / 2 - LABEL_PX)'),
    'dividers sit in the computed gap rather than at a remembered coordinate');
  assert.ok(source.includes('var authRule = REF_H - PAD - 61'),
    'the authorisation is pinned to the foot, so slack never collects under the signature');
  assert.ok(/while \(slack \/ flowing\.length < GAP_MIN && addressLines\.length > 2\)/.test(source),
    'a very long address gives up a line before the spacing collapses');
});
