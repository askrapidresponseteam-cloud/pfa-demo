# PFA Store checkout setup

The store now creates a Shopify Storefront cart through `/api/pfa-orders`.
The cart contains the shopper's email, phone and selected one-time delivery
address before Shopify generates the checkout URL. Do not restore the old
`/cart/{variant}:quantity?checkout[...]` permalink flow; Shopify currently
discards those address query parameters.

## One-time Paws & Tails setup

1. In Shopify Admin, install or open the **Headless** sales channel.
2. Create a Storefront API access token for the PFA storefront.
3. Publish every product shown in the PFA catalogue to the Headless channel.
4. In Vercel, add these Production and Preview environment variables:

   - `PFA_SHOPIFY_STORE_DOMAIN=sg37v1-ta.myshopify.com`
   - `PFA_SHOPIFY_STOREFRONT_API_VERSION=2026-07`
   - `PFA_SHOPIFY_STOREFRONT_ACCESS_TOKEN=<token from Shopify>`

5. Redeploy the Vercel project. Test from the deployed URL, not by double
   clicking `store.html`; a `file://` page cannot call the protected Vercel API.

Firebase credentials already used by the PFA payment services are also used to
persist the store checkout idempotency key. If Firebase is temporarily
unavailable, the checkout still works with instance-level duplicate protection.

## PFA checkout appearance

The PFA catalogue, bag, delivery and review screens are controlled by
`store.html`. The final payment screen is hosted by Shopify and cannot be styled
from PFA HTML. Paws & Tails must apply the PFA logo, black and white palette,
blue accent, square controls and matching typography in Shopify Admin under
**Settings > Checkout > Customize**. This Shopify setting affects the seller's
checkout configuration and therefore requires seller approval.
