// Store switches. Loaded by store.html before its own script.
//
// liveOrders: when true, "Pay securely" calls /api/pfa-orders, which creates the
// Shopify cart and sends the shopper to Paws & Tails' secure payment page.
// When false the checkout stops at the review step with a "not connected"
// notice and never contacts the seller. Use false only to pause the store.
window.PFA_COMMERCE = { liveOrders: true };
