'use strict';

/* Preloaded before every test file (see "test" in package.json).
 *
 * The suite must not see the developer's shell or a pulled .env.local. With a
 * real PFA_SHOPIFY_ADMIN_TOKEN exported, the order-status tests would call the
 * live Shopify Admin API; with PUBLIC_SITE_URL set to a Vercel placeholder, the
 * product page would render it into the canonical tag. Each test sets exactly
 * the variables it needs, so everything else is dropped here. Anything matched
 * below that a test genuinely wants is set again inside that test. */

const AMBIENT = /^(PFA_|FIREBASE_|CCAVENUE_|PAWS_|PHOTO_CUTOUT_|PUBLIC_SITE_URL$|SITE_URL$|CRON_SECRET$|VERCEL)/;

for (const key of Object.keys(process.env)) {
  if (AMBIENT.test(key)) delete process.env[key];
}
