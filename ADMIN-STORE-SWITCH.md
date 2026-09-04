# Adding the Store switch to admin.html

`admin.html` lives in the `PFA_UI_Content` zip, not in either of the two zips
this change ships, so it could not be edited directly. The switch is packaged
as a self-mounting module instead. Wiring it in is two lines plus a container.

It reuses the panel's own `call()` and `post()` helpers, so there is no second
Firebase initialisation and no second idea of who is signed in.

## 1. In `<head>`, next to the panel's other stylesheets

```html
<link rel="stylesheet" href="assets/store-control.css">
```

## 2. Inside the Store panel, above the orders table

The panel already has a `store` tab (`admin-modules.js` → "Store orders").
Put the container at the top of that panel, so the switch is the first thing
on the page that governs the Store, and the register of orders follows it:

```html
<section data-panel="store">
  <div data-store-control></div>
  <!-- the existing Store orders table stays exactly as it is -->
</section>
```

If the Store orders live inside the shared `records` panel rather than their
own, put the container at the top of that panel instead and it will only show
when the Store tab is selected.

## 3. Before `</body>`, after the panel's own script

```html
<script src="assets/store-control.js"></script>
<script>
  PFAStoreControl.mount(
    document.querySelector('[data-store-control]'),
    { call: call, post: post }
  );
</script>
```

`call` and `post` are the helpers already defined in the panel's inline script
(they are at the top of `_inline-extracts/admin.inline.js`). If that script is
a module and they are not in scope, export them first:

```js
window.call = call;
window.post = post;
```

## Permissions

The switch is guarded by the existing `store` module permission — whoever can
already see Store orders can regulate the Store. No new permission key was
added, so there is nothing new for a super admin to discover and assign under
People. Anyone without it gets the panel's standard 403 message.

## What to check once it is wired

1. Sign in as an administrator with the `store` module and open the Store tab.
   The switch should say what the Store is doing in a sentence.
2. Press **Switch** on "Everything the vendor lists". Reload `pfa-shop.html`;
   non-vegetarian food should now appear.
3. Press **Close**. It asks once. Confirm.
4. On `pfa-shop.html`: the products, the filters and the bag bar should all be
   gone, replaced by the closed notice.
5. The part that matters — with the Store closed, post straight to the
   checkout route and confirm it is refused rather than merely hidden:

   ```
   curl -s -X POST https://<host>/api/pfa-orders \
     -H 'Content-Type: application/json' \
     -d '{"lines":[{"variantId":"40123456789012","quantity":1}]}'
   ```

   Expected: `503` and `{"code":"STORE_CLOSED", ...}`.
6. Press **Switch** on "Vegetarian food only" to reopen.
