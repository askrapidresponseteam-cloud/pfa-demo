# Retired assets

Scripts that no page in the tree loads. They were left in `assets/` after the
pages that used them were removed or rewritten with inline logic, and they were
still being deployed to the CDN. During the end-to-end QA of 30 Aug 2026 they
were moved here so that `assets/` contains only what a page actually requests,
and so a reader cannot mistake one of these for the live code path.

| File | What it was | Where the live behaviour is now |
| --- | --- | --- |
| `caregiver-flow.js`, `journey-core.js`, `caregiver-public.js`, `caregiver-dummy.js`, `lost-card.js` | the old `caregiver.html` journey (instant issuance) | `get-involved.html` (paid application) and `caregiver-card.html` (the issued card) |
| `commerce-config.js` | `window.PFA_COMMERCE.liveOrders` kill switch | the Store switch in the admin panel (`/api/admin/store`) and `PFA_STORE_DIRECT_PAY` |
| `give.js`, `order.js`, `store-control.js` | earlier donate / order / store-switch pages | `donate.html`, `pfa-shop.html`, `admin.html` |
| `get-to-learn.js`, `help.js`, `pfa-location.js`, `photo-cutout-ml.js` | learning centre, help page, location picker, in-browser background removal | pages removed; `/api/photo/remove-background` is the server-side path |

Nothing references these. They are kept for a maintainer who wants to recover
a piece of them; delete the folder when that is no longer true.
