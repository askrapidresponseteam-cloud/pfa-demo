'use strict';

/* Firestore records for the Caretaker Card.

   Collections
     caretakerApplicants/{applicantId}  the person: name, mobile, email
     caretakerCards/{cardId}            the credential, one per applicant
     caretakerAddresses/{addressId}     card address and delivery addresses,
                                        stored separately and never overwritten
     caretakerOrders/{orderId}          a paid shipping order
     caretakerShipments/{shipmentId}    the parcel and its status history
     caretakerPublic/{cardId}           denormalised read model (see below)
     caretakerMobileIndex/{mobile}      one active card per person
     caretakerEmails/{emailId}          outbound queue with attempts and errors
     caretakerAudit/{eventId}           who changed what, when

   Read-cost note: the public card page is the only page that will ever see
   real volume, and it is a share link, so it gets hit by people who are not
   the holder. It therefore reads exactly ONE document - caretakerPublic - which
   is written whenever anything it displays changes. No joins, no queries, no
   fan-out reads. At the CDN it is cached for five minutes with a long
   stale-while-revalidate, so the steady-state cost of a viral card is close to
   zero Firestore reads rather than one read per view. */

const { getDb, serverTimestamp } = require('./firebase');
const CARETAKER = require('./caretaker');

const applicantRef = (db, id) => db.collection('caretakerApplicants').doc(id);
const cardRef = (db, id) => db.collection('caretakerCards').doc(id);
const addressRef = (db, id) => db.collection('caretakerAddresses').doc(id);
const orderRef = (db, id) => db.collection('caretakerOrders').doc(id);
const shipmentRef = (db, id) => db.collection('caretakerShipments').doc(id);
const publicRef = (db, id) => db.collection('caretakerPublic').doc(id);
const mobileRef = (db, mobile) => db.collection('caretakerMobileIndex').doc(CARETAKER.normaliseMobile(mobile));
const identityRef = (db, key) => db.collection('caretakerIdentityIndex').doc(key);
const emailRef = (db, id) => db.collection('caretakerEmails').doc(id);
const auditRef = (db, id) => db.collection('caretakerAudit').doc(id);

async function audit(entry) {
  const db = getDb();
  const id = CARETAKER.createEventId();
  await auditRef(db, id).set({
    eventId: id,
    actor: CARETAKER.clean(entry.actor, 80) || 'system',
    action: CARETAKER.clean(entry.action, 60),
    entity: CARETAKER.clean(entry.entity, 80),
    detail: entry.detail || {},
    at: new Date().toISOString(),
    createdAt: serverTimestamp()
  });
  return id;
}

/* The read model. Written on issuance and on every shipment change; nothing
   else ever needs to be read to render the public page. */
function buildPublic(card, shipment) {
  return {
    ...CARETAKER.publicProjection({ card, shipment }),
    revision: (card.revision || 0) + 1,
    updatedAt: new Date().toISOString()
  };
}

async function writePublic(db, transactionOrDb, card, shipment) {
  const doc = buildPublic(card, shipment);
  const ref = publicRef(db, card.cardId);
  if (transactionOrDb && typeof transactionOrDb.set === 'function' && transactionOrDb.get) {
    transactionOrDb.set(ref, doc, { merge: true });
  } else {
    await ref.set(doc, { merge: true });
  }
  return doc;
}

async function getPublicCard(cardId) {
  const db = getDb();
  const snapshot = await publicRef(db, cardId).get();
  return snapshot.exists ? snapshot.data() : null;
}

async function getCard(cardId) {
  const db = getDb();
  const snapshot = await cardRef(db, cardId).get();
  return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
}

async function getShipment(shipmentId) {
  const db = getDb();
  const snapshot = await shipmentRef(db, shipmentId).get();
  return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
}

/* Issue a free digital card.

   Duplicate prevention has two layers. The mobile index is the hard one: it is
   created inside the transaction, so two submissions racing from a double-tap
   or a flaky connection cannot both mint a card. The idempotency key is the
   soft one: an identical retry returns the identical card instead of an error,
   which is what a browser that never saw the first response actually needs. */
async function issueCard({ application, idempotencyKey, requestMeta }) {
  const db = getDb();
  const now = new Date().toISOString();
  const mobile = CARETAKER.normaliseMobile(application.mobile);
  const rawToken = CARETAKER.createCardToken();

  const identityKey = CARETAKER.identityKey(application.name, application.pin);

  const result = await db.runTransaction(async (transaction) => {
    const indexRef = mobileRef(db, mobile);
    const idRef = identityRef(db, identityKey);
    const indexSnapshot = await transaction.get(indexRef);
    const identitySnapshot = await transaction.get(idRef);

    if (indexSnapshot.exists) {
      const heldCardId = CARETAKER.clean(indexSnapshot.data().cardId, 60);
      const heldSnapshot = await transaction.get(cardRef(db, heldCardId));
      if (heldSnapshot.exists) {
        const held = { id: heldSnapshot.id, ...heldSnapshot.data() };
        const sameRequest = idempotencyKey
          && CARETAKER.clean(held.idempotencyKey, 200) === CARETAKER.clean(idempotencyKey, 200);
        return { card: held, reissued: true, sameRequest, token: null, duplicate: 'mobile' };
      }
    }

    /* A soft match: same name, same PIN, different mobile. Two people in one
       household can legitimately both hold a card, so this does not block. It
       is recorded on the new card and returned so the journey can say so. */
    let softDuplicateOf = null;
    if (identitySnapshot.exists) {
      softDuplicateOf = CARETAKER.clean(identitySnapshot.data().cardId, 60) || null;
    }

    const applicantId = CARETAKER.createApplicantId();
    const cardId = CARETAKER.createCardId();
    const addressId = CARETAKER.createAddressId();
    const { issuedAt, validUntil } = CARETAKER.computeValidity(now);

    transaction.set(applicantRef(db, applicantId), {
      applicantId,
      name: application.name,
      mobile,
      email: application.email,
      cardId,
      source: 'pfa-website',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    transaction.set(addressRef(db, addressId), {
      addressId,
      cardId,
      type: 'card',
      address: application.address,
      pin: application.pin,
      fingerprint: CARETAKER.addressFingerprint(application.address, application.pin),
      createdAt: serverTimestamp()
    });

    const card = {
      cardId,
      applicantId,
      name: application.name,
      mobile,
      email: application.email,
      addressId,
      address: application.address,
      pin: application.pin,
      status: 'active',
      printed: false,
      issuedAt,
      validUntil,
      channel: 'digital-free',
      tokenHash: CARETAKER.hashToken(rawToken),
      idempotencyKey: CARETAKER.clean(idempotencyKey, 200) || null,
      identityKey,
      householdKey: CARETAKER.householdKey(application.address, application.pin),
      softDuplicateOf,
      revision: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    transaction.set(cardRef(db, cardId), card);
    transaction.set(indexRef, {
      mobile,
      cardId,
      applicantId,
      createdAt: serverTimestamp()
    });

    /* First writer wins the identity slot; later matches read it and warn. */
    if (!identitySnapshot.exists) {
      transaction.set(idRef, { identityKey, cardId, createdAt: serverTimestamp() });
    }

    transaction.set(publicRef(db, cardId), buildPublic(card, null));

    return {
      card,
      reissued: false,
      sameRequest: false,
      token: rawToken,
      duplicate: softDuplicateOf ? 'identity' : null,
      softDuplicateOf
    };
  });

  await audit({
    actor: 'applicant',
    action: result.reissued ? 'card.reissue_attempt' : 'card.issued',
    entity: `card:${result.card.cardId}`,
    detail: {
      mobileMasked: `••••••${mobile.slice(-4)}`,
      ip: requestMeta && requestMeta.ip,
      duplicate: result.duplicate || null,
      softDuplicateOf: result.softDuplicateOf || null
    }
  });

  return result;
}

/* Verify a caller holds the card. Used before anything that spends money or
   changes an address. */
async function authoriseCard(cardId, rawToken) {
  const card = await getCard(cardId);
  if (!card) return null;
  if (!rawToken) return null;
  return CARETAKER.safeEqual(card.tokenHash, CARETAKER.hashToken(rawToken)) ? card : null;
}

/* Record a shipping order before the applicant is sent to CCAvenue. The
   delivery address is resolved and stored here, server-side, so the payment
   form never carries an address the browser could tamper with. */
async function createShippingOrder({ card, delivery, orderId, amount }) {
  const db = getDb();
  const now = new Date().toISOString();
  let deliveryAddressId = card.addressId;

  if (!delivery.sameAsCardAddress) {
    deliveryAddressId = CARETAKER.createAddressId();
    await addressRef(db, deliveryAddressId).set({
      addressId: deliveryAddressId,
      cardId: card.cardId,
      type: 'delivery',
      recipient: delivery.recipient || card.name,
      address: delivery.address,
      pin: delivery.pin,
      fingerprint: CARETAKER.addressFingerprint(delivery.address, delivery.pin),
      createdAt: serverTimestamp()
    });
  }

  const order = {
    orderId,
    cardId: card.cardId,
    applicantId: card.applicantId,
    type: 'physical-card',
    amount: Number(amount),
    currency: 'INR',
    status: 'pending_payment',
    deliveryAddressId,
    sameAsCardAddress: Boolean(delivery.sameAsCardAddress),
    recipient: delivery.sameAsCardAddress ? card.name : (delivery.recipient || card.name),
    deliveryPin: delivery.sameAsCardAddress ? card.pin : delivery.pin,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdAtIso: now
  };

  await orderRef(db, orderId).set(order);
  await audit({
    actor: 'applicant',
    action: 'order.created',
    entity: `order:${orderId}`,
    detail: { cardId: card.cardId, sameAsCardAddress: order.sameAsCardAddress }
  });

  return order;
}

/* Called from the verified CCAvenue callback. Marks the order paid, opens the
   shipment with its own tracking id, and refreshes the public read model - all
   in one transaction so a card can never show "paid" without a shipment or a
   shipment without a payment. Re-entrant: CCAvenue can and does call back more
   than once, and the second call must not create a second parcel. */
async function recordPaidShipping({ orderId, payment }) {
  const db = getDb();
  const now = new Date().toISOString();

  return db.runTransaction(async (transaction) => {
    const oRef = orderRef(db, orderId);
    const orderSnapshot = await transaction.get(oRef);
    if (!orderSnapshot.exists) throw new Error('The shipping order could not be found.');
    const order = { id: orderSnapshot.id, ...orderSnapshot.data() };

    const cRef = cardRef(db, order.cardId);
    const cardSnapshot = await transaction.get(cRef);
    if (!cardSnapshot.exists) throw new Error('The card for this order could not be found.');
    const card = { id: cardSnapshot.id, ...cardSnapshot.data() };

    /* Re-entrancy is per ORDER, not per card: a replacement order is a second
       parcel on the same card and must be allowed to open. */
    if (order.status === 'paid' && order.shipmentId) {
      const existing = await transaction.get(shipmentRef(db, order.shipmentId));
      return {
        order,
        card,
        shipment: existing.exists ? { id: existing.id, ...existing.data() } : null,
        alreadyRecorded: true
      };
    }

    const shipmentId = CARETAKER.createShipmentId();
    const shipment = {
      shipmentId,
      trackingId: shipmentId,
      orderId,
      cardId: card.cardId,
      status: 'order_confirmed',
      carrier: null,
      carrierTrackingNumber: null,
      deliveryAddressId: order.deliveryAddressId,
      recipient: order.recipient,
      dispatchedAt: null,
      deliveredAt: null,
      kind: order.kind === 'replacement' ? 'replacement' : 'original',
      history: [{
        status: 'order_confirmed',
        at: now,
        note: order.kind === 'replacement' ? 'Replacement card paid for' : 'Shipping payment received',
        actor: 'system'
      }],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedAtIso: now
    };

    transaction.set(shipmentRef(db, shipmentId), shipment);

    transaction.update(oRef, {
      status: 'paid',
      shipmentId,
      paidAt: now,
      payment: {
        gateway: 'ccavenue',
        transactionId: payment.orderId || orderId,
        trackingId: payment.trackingId || null,
        bankReference: payment.bankReference || null,
        paymentMode: payment.paymentMode || null,
        responseStatus: payment.rawStatus || null,
        amount: Number(payment.amount || order.amount),
        currency: 'INR',
        verifiedAt: now
      },
      updatedAt: serverTimestamp()
    });

    const updatedCard = { ...card, printed: true, revision: (card.revision || 0) + 1 };
    transaction.update(cRef, { printed: true, shipmentId, revision: updatedCard.revision, updatedAt: serverTimestamp() });
    transaction.set(publicRef(db, card.cardId), buildPublic(card, shipment), { merge: true });

    return { order: { ...order, status: 'paid', shipmentId }, card: updatedCard, shipment, alreadyRecorded: false };
  });
}

/* Replacing a lost printed card.

   The rule that matters: a replacement is a new PARCEL, never a new card. The
   card number, its issue date and its validity are untouched, so a card that
   has been shown to a police officer or written into a colony register does not
   change under them. Only a fresh shipment and a fresh payment are created. */
async function createReplacementOrder({ card, delivery, orderId, amount, reason }) {
  const db = getDb();
  const order = await createShippingOrder({ card, delivery, orderId, amount });
  await orderRef(db, orderId).set({
    kind: 'replacement',
    replacesShipmentId: card.shipmentId || null,
    reason: CARETAKER.clean(reason, 120) || 'lost',
    updatedAt: serverTimestamp()
  }, { merge: true });

  await audit({
    actor: 'applicant',
    action: 'card.replacement_ordered',
    entity: `card:${card.cardId}`,
    detail: { orderId, replaces: card.shipmentId || null, reason: CARETAKER.clean(reason, 120) }
  });

  return { ...order, kind: 'replacement' };
}

/* Verifying a lost-card claim without an OTP: the card number is public (it is
   printed on the card, which is exactly what has been lost), so it is never
   enough on its own. The mobile number on the record must match too. */
async function verifyCardClaim({ cardId, mobile }) {
  const card = await getCard(cardId);
  if (!card) return { ok: false, reason: 'not_found' };
  if (card.status === 'revoked') return { ok: false, reason: 'revoked' };
  if (CARETAKER.normaliseMobile(mobile) !== card.mobile) return { ok: false, reason: 'mismatch' };
  return { ok: true, card };
}

/* Admin-controlled status update. The state machine is enforced here rather
   than in the panel, so the same rules hold for a courier webhook or a script. */
async function updateShipmentStatus({ shipmentId, status, carrier, carrierTrackingNumber, note, actor }) {
  const db = getDb();
  const now = new Date().toISOString();

  return db.runTransaction(async (transaction) => {
    const sRef = shipmentRef(db, shipmentId);
    const snapshot = await transaction.get(sRef);
    if (!snapshot.exists) throw new Error('That shipment could not be found.');
    const shipment = { id: snapshot.id, ...snapshot.data() };

    if (!CARETAKER.canTransition(shipment.status, status)) {
      const error = new Error(`A shipment cannot move from ${CARETAKER.shipmentLabel(shipment.status)} to ${CARETAKER.shipmentLabel(status)}.`);
      error.code = 'INVALID_TRANSITION';
      throw error;
    }

    const cardSnapshot = await transaction.get(cardRef(db, shipment.cardId));
    const card = cardSnapshot.exists ? { id: cardSnapshot.id, ...cardSnapshot.data() } : null;

    const history = Array.isArray(shipment.history) ? shipment.history.slice(-60) : [];
    history.push({
      status,
      at: now,
      note: CARETAKER.clean(note, 160) || null,
      actor: CARETAKER.clean(actor, 80) || 'admin'
    });

    const patch = {
      status,
      history,
      updatedAt: serverTimestamp(),
      updatedAtIso: now
    };
    if (carrier !== undefined) patch.carrier = CARETAKER.clean(carrier, 60) || null;
    if (carrierTrackingNumber !== undefined) patch.carrierTrackingNumber = CARETAKER.clean(carrierTrackingNumber, 60) || null;
    if (status === 'dispatched' && !shipment.dispatchedAt) patch.dispatchedAt = now;
    if (status === 'delivered') patch.deliveredAt = now;

    transaction.update(sRef, patch);

    const nextShipment = { ...shipment, ...patch, updatedAt: now };
    if (card) transaction.set(publicRef(db, card.cardId), buildPublic(card, nextShipment), { merge: true });

    return { shipment: nextShipment, card };
  });
}

/* Outbound email queue. Writing the row is part of the same request that caused
   it, but sending is a separate step: a slow or down mail provider must never
   fail an application or a payment callback. */
async function queueEmail({ template, to, payload, dedupeKey }) {
  const db = getDb();
  const id = dedupeKey
    ? `${template}_${CARETAKER.hashToken(dedupeKey).slice(0, 32)}`
    : CARETAKER.createEventId();

  const ref = emailRef(db, id);
  const created = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (snapshot.exists) return false;
    transaction.set(ref, {
      emailId: id,
      template,
      to: CARETAKER.clean(to, 254).toLowerCase(),
      payload: payload || {},
      status: 'queued',
      attempts: 0,
      lastError: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      nextAttemptAt: new Date().toISOString()
    });
    return true;
  });

  return { emailId: id, created };
}

async function claimQueuedEmails(limit) {
  const db = getDb();
  const snapshot = await db.collection('caretakerEmails')
    .where('status', 'in', ['queued', 'retry'])
    .where('nextAttemptAt', '<=', new Date().toISOString())
    .orderBy('nextAttemptAt')
    .limit(limit || 20)
    .get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

/* Exponential backoff, capped, then parked as failed for the admin panel to
   surface. A permanently bad address must not be retried forever. */
async function recordEmailResult({ emailId, ok, error, providerId }) {
  const db = getDb();
  const ref = emailRef(db, emailId);
  const snapshot = await ref.get();
  if (!snapshot.exists) return null;
  const current = snapshot.data();
  const attempts = (current.attempts || 0) + 1;

  if (ok) {
    await ref.update({
      status: 'sent',
      attempts,
      providerId: providerId || null,
      sentAt: new Date().toISOString(),
      lastError: null,
      updatedAt: serverTimestamp()
    });
    return { status: 'sent', attempts };
  }

  const giveUp = attempts >= 6;
  const backoffMinutes = Math.min(2 ** attempts, 240);
  await ref.update({
    status: giveUp ? 'failed' : 'retry',
    attempts,
    lastError: CARETAKER.clean(error, 300),
    nextAttemptAt: new Date(Date.now() + backoffMinutes * 60000).toISOString(),
    updatedAt: serverTimestamp()
  });
  return { status: giveUp ? 'failed' : 'retry', attempts };
}

async function getAddress(addressId) {
  const db = getDb();
  const snapshot = await addressRef(db, addressId).get();
  return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
}

async function getOrder(orderId) {
  const db = getDb();
  const snapshot = await orderRef(db, orderId).get();
  return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
}

module.exports = {
  audit,
  createReplacementOrder,
  verifyCardClaim,
  authoriseCard,
  buildPublic,
  claimQueuedEmails,
  createShippingOrder,
  getAddress,
  getCard,
  getOrder,
  getPublicCard,
  getShipment,
  issueCard,
  queueEmail,
  recordEmailResult,
  recordPaidShipping,
  updateShipmentStatus,
  writePublic
};
