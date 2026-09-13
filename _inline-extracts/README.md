# Inline logic extracts

Some pages in this project keep their behaviour in an inline `<script>`
rather than in `assets/`. A file-level split cannot separate that logic
from its markup, so it is snapshotted here instead.

**These are read-only reference copies.** The live code is inside the
`.html` files in the UI/content zip. Edit it there. If you change a page,
these snapshots go stale - regenerate or ignore them.

| Page | Extract | Blocks | Size |
| --- | --- | ---: | ---: |
| `admin.html` | `admin.inline.js` | 8 | 115 KB |
| `give.html` | `give.inline.js` | 1 | 13 KB |
| `index.html` | `index.inline.js` | 2 | 6 KB |
| `learning-center.html` | `learning-center.inline.js` | 1 | 14 KB |
| `membership.html` | `membership.inline.js` | 2 | 19 KB |
| `patron-card-preview.html` | `patron-card-preview.inline.js` | 2 | 1 KB |
| `search.html` | `search.inline.js` | 1 | 24 KB |
| `store.html` | `store.inline.js` | 2 | 80 KB |

`store.inline.js` is the one that matters most for the shop: it holds the
bag, the catalogue render, the call to `/api/pfa-orders`, the seller
checkout hand-off and the `/api/pfa-order-status` polling loop.
