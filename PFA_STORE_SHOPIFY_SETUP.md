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

## Order webhooks (Shopify → PFA)

Store orders are now mirrored into Firestore (`storeOrders`) by
`/api/webhooks/*`, which is what lets `store.html` show a confirmation and
`track-order.html` show live status.

### Vercel environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `PFA_SHOPIFY_WEBHOOK_SECRET` | **yes** | Webhook signing secret from Shopify Admin → Settings → Notifications → Webhooks. Without it every webhook is refused (503). |
| `PFA_SHOPIFY_STORE_DOMAIN` | yes | `sg37v1-ta.myshopify.com` — webhooks from any other shop are rejected. |
| `PFA_SHOPIFY_ADMIN_TOKEN` | optional | Admin API token (`shpat_…`). When set, the catalogue uses the Admin REST API and shows stock levels. Leave unset to keep using the public products feed. |
| `PFA_SHOPIFY_ADMIN_API_VERSION` | optional | Defaults to `2026-07`. |

### URLs to give Paws & Tails

Register each topic in Shopify Admin (or via the Admin API) pointing at:

| Topic | URL |
| --- | --- |
| `orders/create` | `https://<site>/api/webhooks/order-created` |
| `orders/paid` | `https://<site>/api/webhooks/order-paid` (recommended; makes COD / delayed payments confirm) |
| `orders/fulfilled` | `https://<site>/api/webhooks/order-fulfilled` |
| `fulfillments/update` | `https://<site>/api/webhooks/fulfillment-updated` |
| `orders/cancelled` | `https://<site>/api/webhooks/order-cancelled` |
| `refunds/create` | `https://<site>/api/webhooks/refund-created` |

Format: JSON. API version: 2026-07.

### How an order is matched to a shopper

`/api/pfa-orders` attaches `PFA checkout reference: <token>` to the Shopify cart
as a note attribute. When `orders/create` arrives, that token is read back and
the `storeCheckoutIntents` record is updated, so the polling `store.html` page
flips to "confirmed". Orders without the attribute are still stored and can be
tracked by `PFA-ST-<order number>`.

### Verify after deploy

```bash
# must be 503 WEBHOOK_NOT_CONFIGURED until the secret is set, then 401 INVALID_SIGNATURE
curl -s -X POST https://<site>/api/webhooks/order-created -d '{}' | jq
# status lookup
curl -s "https://<site>/api/pfa-order-status?id=PFA-ST-1191" | jq
```

Then ask Paws & Tails to "Send test notification" on the `orders/create`
webhook and check `vercel logs --prod`.
