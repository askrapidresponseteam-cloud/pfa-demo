#!/usr/bin/env node
/* Creates the circles for The Circle, once.
 * ---------------------------------------------------------------------------
 * Circles are structure, not content. They are the rooms members write in, so
 * they have to exist before anybody can post, and no member can create one.
 * That is why this is an administrator's script rather than a button in the
 * page: the list of rooms is a decision PFA makes, not a thing that grows on
 * its own.
 *
 * Nothing else in the members area is seeded. There are no sample members, no
 * sample posts and no sample events anywhere in this project. The Circle
 * starts genuinely empty and fills up with real people.
 *
 * Run it once:
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *   node tools/seed-circles.js
 *
 * Or, if the service account JSON is already in the environment the way the
 * /api routes expect it:
 *
 *   node tools/seed-circles.js
 *
 * It is safe to run more than once. Existing circles are updated in place and
 * nothing is deleted, so editing a blurb below and re-running is the intended
 * way to change one.
 */

'use strict';

const admin = require('firebase-admin');

/* Six ways of working and four parts of the country. Add or edit freely; the
 * id is what appears in the URL, so keep it short and stable. */
const CIRCLES = [
  { id: 'street-feeding', kind: 'Topic', name: 'Street feeding',
    blurb: 'Fixed place, fixed time, clean ground. Routines that hold, and neighbours who stop objecting.' },

  { id: 'first-response', kind: 'Topic', name: 'First response',
    blurb: 'What to do in the first ten minutes, and the three things never to do. Read it before you need it.' },

  { id: 'law-and-complaints', kind: 'Topic', name: 'Law and complaints',
    blurb: 'Writing a complaint that gets received. Escalating a refusal. Volunteers who know the route.' },

  { id: 'fosters-and-adopters', kind: 'Topic', name: 'Fosters and adopters',
    blurb: 'Between the shelter and the sofa. Handovers, home checks, and the first difficult fortnight.' },

  { id: 'birds', kind: 'Topic', name: 'Birds and kite season',
    blurb: 'Manja injuries, nestlings, and what to do with a bird that cannot fly but is not hurt.' },

  { id: 'cats-and-tnr', kind: 'Topic', name: 'Cats and TNR',
    blurb: 'Trap, neuter, return. Colony records, and cats who have opinions about all of it.' },

  { id: 'north', kind: 'City', name: 'The North',
    blurb: 'Delhi, Punjab, Haryana, Rajasthan, UP, Uttarakhand, Himachal. Winter shelter, summer water, and the paperwork in between.' },

  { id: 'west', kind: 'City', name: 'The West',
    blurb: 'Maharashtra, Gujarat, Goa, Madhya Pradesh. Ward meetings, feeding points, and the people who show up.' },

  { id: 'south', kind: 'City', name: 'The South',
    blurb: 'Karnataka, Kerala, Tamil Nadu, Telangana, Andhra. Unit clinics, ABC work, and hands at the weekend.' },

  { id: 'east-and-north-east', kind: 'City', name: 'The East and North East',
    blurb: 'Bengal, Odisha, Jharkhand, Assam, Sikkim, Meghalaya, Manipur. Long distances, small teams, good people.' }
];

function credentials() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return admin.credential.applicationDefault();
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.PFA_FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    console.error(
      'No credentials found.\n' +
      'Set GOOGLE_APPLICATION_CREDENTIALS to a service account file, or put the\n' +
      'JSON in FIREBASE_SERVICE_ACCOUNT the way the /api routes already expect it.'
    );
    process.exit(1);
  }
  return admin.credential.cert(JSON.parse(raw));
}

async function main() {
  admin.initializeApp({ credential: credentials() });
  const db = admin.firestore();

  const batch = db.batch();
  CIRCLES.forEach(circle => {
    const { id, ...rest } = circle;
    batch.set(db.collection('circles').doc(id), rest, { merge: true });
  });
  await batch.commit();

  console.log(`Wrote ${CIRCLES.length} circles.`);
  CIRCLES.forEach(c => console.log(`  ${c.id.padEnd(22)} ${c.name}`));
  console.log('\nNothing else was seeded. Posts, members and events stay empty');
  console.log('until real people write them.');
  process.exit(0);
}

main().catch(err => {
  console.error('Failed:', err && err.message);
  process.exit(1);
});
