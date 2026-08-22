/* GET /api/verify-card?id=PFA-MBR-XXXXXXXX  or  PFA-CCT-XXXXXXXX

   Answers one question for anyone holding a card - a police officer, a vet, a
   unit - is this card real, and is it still valid today.

   What it deliberately does not do is hand over the record. A card number is
   visible to anyone who is shown the card, so this route treats it as public
   and returns only what a person checking a card needs: the holder's name, what
   the card is, and whether it is in date. No address, no mobile, no email.

   Both card families are answered here so there is one number to check against,
   but they are read from their own collections and never merged. */

const { getDb, getMember } = require('./../lib/firebase');

const MEMBER_ID = /^PFA-MBR-[A-Z0-9]{8}$/;
const CARETAKER_ID = /^PFA-CCT-[A-Z0-9]{8}$/;

function sendJson(response, status, body) {
  response.setHeader('Cache-Control', 'no-store');
  response.status(status).json(body);
}

function stateFor(validUntil) {
  if (!validUntil) return { status: 'unknown', valid: false };
  const until = new Date(validUntil);
  if (isNaN(until.getTime())) return { status: 'unknown', valid: false };
  const valid = until.getTime() >= Date.now();
  return { status: valid ? 'valid' : 'expired', valid, validUntil: until.toISOString() };
}

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED' });
  }

  const id = String((request.query && request.query.id) || '').trim().toUpperCase();

  if (!MEMBER_ID.test(id) && !CARETAKER_ID.test(id)) {
    return sendJson(response, 400, {
      code: 'INVALID_ID',
      message: 'That is not a PFA card number. They look like PFA-MBR-XXXXXXXX or PFA-CCT-XXXXXXXX.'
    });
  }

  try {
    if (MEMBER_ID.test(id)) {
      const member = await getMember(id);
      if (!member || (member.status && member.status !== 'active')) {
        return sendJson(response, 404, { code: 'NOT_FOUND', found: false, message: 'No live card carries that number.' });
      }
      const state = stateFor(member.validUntil);
      return sendJson(response, 200, {
        found: true,
        kind: 'member',
        cardType: 'Patron member',
        cardId: id,
        name: member.name || '',
        memberSince: member.memberSince || '',
        ...state
      });
    }

    // Caretaker cards keep a public projection of their own, precisely so a
    // check like this never has to read the applicant record.
    const snapshot = await getDb().collection('caretakerPublic').doc(id).get();
    if (!snapshot.exists) {
      return sendJson(response, 404, { code: 'NOT_FOUND', found: false, message: 'No live card carries that number.' });
    }
    const card = snapshot.data() || {};
    const state = stateFor(card.validUntil);
    return sendJson(response, 200, {
      found: true,
      kind: 'caretaker',
      cardType: 'Colony Animal Caretaker',
      cardId: id,
      name: card.name || '',
      issuedOn: card.issuedAt || '',
      ...state
    });
  } catch (error) {
    console.error('verify-card failed', error && error.message);
    return sendJson(response, 500, { code: 'SERVER_ERROR', message: 'That could not be checked. Try again.' });
  }
};
