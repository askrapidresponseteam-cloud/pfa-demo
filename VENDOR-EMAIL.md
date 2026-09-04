# Email to Paws & Tails — items needed to go live

**Subject:** PFA Store integration — 4 items needed to go live

Hi team,

Thank you for the Product Fetch and Webhook specifications. We have built against both and the PFA store is ready end to end. To switch it on we need four things that are not in the documents:

**1. Storefront API access token**
The checkout creates a cart via Shopify's Storefront API, which needs its own token (the Admin API token in the PDF cannot be used for checkout). In Shopify Admin: Sales channels → Headless (install if not present) → Storefront API → create a token with scopes `unauthenticated_write_checkouts`, `unauthenticated_read_product_listings`, `unauthenticated_read_checkouts`. Please send the token.

**2. Publish the catalogue to the Headless channel**
All products shown on the PFA store must be published to the Headless sales channel, otherwise the cart is rejected.

**3. Webhook registration + signing secret**
Please register the following webhooks (format JSON, API version 2026-07):

| Topic | URL |
| --- | --- |
| orders/create | https://pfa-full-website.vercel.app/api/webhooks/order-created |
| orders/paid | https://pfa-full-website.vercel.app/api/webhooks/order-paid |
| orders/fulfilled | https://pfa-full-website.vercel.app/api/webhooks/order-fulfilled |
| fulfillments/update | https://pfa-full-website.vercel.app/api/webhooks/fulfillment-updated |
| orders/cancelled | https://pfa-full-website.vercel.app/api/webhooks/order-cancelled |
| refunds/create | https://pfa-full-website.vercel.app/api/webhooks/refund-created |

and send us the webhook signing secret shown at the bottom of Settings → Notifications → Webhooks. Our endpoint verifies every request against it and rejects unsigned ones. (`orders/paid` is in addition to your spec; it lets COD and delayed payments confirm correctly.)

**4. Rotate the Admin API token**
The `shpat_` token in the PDF has `read_orders` scope and has now travelled by email. Once we confirm the integration works, please rotate it and share the new value through a secure channel rather than a document.

Once we have items 1 and 3 we can complete a test order and confirm the webhooks fire.

Thanks,
Karthik
People for Animals
