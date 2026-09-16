'use strict';

/* The channels that are genuinely PFA's, in one place.
 *
 * Why this file exists. A charity that takes donations online is worth
 * cloning: the look and feel of this site is public by construction, and a
 * copy of it behind a lookalike domain, with a different payment account
 * wired in, is the cheapest fraud there is. Nothing can stop the copying.
 * What can be made hard is passing the copy off as us, and that rests on one
 * thing: a donor being able to check, from something we published, whether
 * the page in front of them is ours.
 *
 * That check is only worth anything if the answer is the same everywhere it
 * appears. Written on the donate page it goes stale against security.txt;
 * written in both it goes stale against whatever the next person adds. So it
 * is written here, and test/impersonation.test.js fails if any published
 * copy of it disagrees.
 *
 * This is data, not behaviour. It is required by scripts/check-lookalikes.js
 * and by the tests. No route reads it, and no page can: the pages are static
 * and lib/ is server source that never reaches dist/.
 */

/* Where the real site lives. Everything else is measured against this. */
const SITE = 'peopleforanimalsindia.org';

/* Hostnames that are ours. A donor who sees anything else in the address bar
 * while giving is not giving to us, whatever the page says. */
const OFFICIAL_DOMAINS = [
  'peopleforanimalsindia.org',
  'www.peopleforanimalsindia.org'
];

/* Where the money is actually handled. The donor leaves our site for one of
 * these, and seeing it is the point: a clone can copy this page, but it
 * cannot make a CCAvenue or PayPal address bar say our account is theirs.
 * Keep in step with lib/routes/payment/create.js and the PayPal link on
 * donate.html. */
const PAYMENT_HOSTS = [
  'secure.ccavenue.com',
  'www.paypal.com'
];

/* The mailbox on the site, and the one a clone cannot receive at. */
const CONTACT_EMAIL = 'gandhim@exmpls.sansad.in';

/* What a donor should never be asked for. Every line here is a live pattern
 * in Indian donation fraud, and none of them is something this site does, so
 * a request for any of them identifies the asker as not us without the donor
 * having to check a domain at all. Plain sentences, no jargon: this is read
 * by someone who is about to part with money, not by a security team. */
const NEVER = [
  'A transfer to a personal bank account, UPI ID or phone number. Donations reach PFA through the payment page on this site and nowhere else.',
  'Your card PIN, CVV or a one-time password, by phone, email or message. No one at PFA will ever ask for these, and no genuine payment page asks for a PIN.',
  'Payment in gift cards, vouchers or cryptocurrency.',
  'A donation to unlock, release or treat a specific animal you have been sent a photograph of. That is the commonest version of this fraud.',
  'A renewal, refund or tax fee on a donation you already made.'
];

/* Where to report a site pretending to be this one. */
const REPORT_TO = `https://${SITE}/ask`;

module.exports = {
  SITE,
  OFFICIAL_DOMAINS,
  PAYMENT_HOSTS,
  CONTACT_EMAIL,
  NEVER,
  REPORT_TO
};
