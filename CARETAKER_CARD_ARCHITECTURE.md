# Colony Animal Colony Caregiver Card - journey and data architecture

Built for the admin panel to sit on top of in the next phase. Nothing here
assumes a panel exists; every rule is enforced server-side already.

## The journey

1. **Open** (`caregiver.html`) - the card, one line of copy, **Begin**. The
   application is not in the DOM flow until Begin is pressed.
2. **Apply** - five fields: photograph, name, mobile, email, address. The card
   redraws as they are typed. Nothing else is asked. The PIN is read out of the
   address rather than asked for a second time.
3. **Issued** - `POST /api/caregiver/apply` issues a free card immediately and
   returns its number. Download PNG, print-ready PDF, share link.
4. **Choose** - *Digital card only* (done) or *Get the printed card* (₹100).
   The choice comes **after** issuance; it is never a question standing between
   an applicant and their free card.
5. **Printed** - the address already given is shown, not re-asked. *Ship to a
   different address* reveals the alternate fields, which are stored in their
   own record; the address printed on the card never changes.
6. **Pay** - `POST /api/caregiver/order` → CCAvenue → `/api/payment/response`.

## Collections

| Collection | Holds | Written by |
|---|---|---|
| `caretakerApplicants/{id}` | person: name, mobile, email | issuance |
| `caretakerCards/{cardId}` | the credential, `tokenHash`, validity | issuance |
| `caretakerAddresses/{id}` | card address **and** delivery addresses, separately, never overwritten | issuance, order |
| `caretakerOrders/{orderId}` | ₹100 shipping order, CCAvenue reference, payment status, timestamps | order, callback |
| `caretakerShipments/{id}` | parcel, tracking ID, carrier, status + full history | callback, admin |
| `caretakerPublic/{cardId}` | denormalised read model - the only thing the card page reads | every write above |
| `caregiverMobileIndex/{mobile}` | uniqueness index, one active card per person | issuance |
| `caregiverEmails/{id}` | outbound queue: template, payload, attempts, lastError | every notifiable event |
| `caretakerAudit/{id}` | actor, action, entity, detail, timestamp | everything |

## Read cost

A card link is **shareable**, so one card can be opened by many people who are
not the holder. The public page therefore reads exactly one document - `caretakerPublic` - with no joins or queries. `/api/caregiver/card` sets
`s-maxage=300, stale-while-revalidate=86400` and an ETag, so:

- repeat views inside five minutes cost **zero** Firestore reads (edge cache),
- repeat views by the same browser return **304, no body** (ETag),
- 404s are cached briefly too, so a link typo doing the rounds is not a read per view.

The holder's own card renders from `localStorage` first and reconciles after,
so it appears instantly and works offline.

## Shipment state machine (`lib/caregiver.js`)

```
order_confirmed → preparing → dispatched → in_transit → out_for_delivery → delivered
                     ↓ ↓ ↓ ↓
                  exception / cancelled / returned (terminal)
```

Forward-only. `delivered`, `cancelled` and `returned` are terminal. `exception`
can recover to `dispatched` or later, never to before dispatch. Enforced in the
store transaction, so a courier webhook, a script and the panel all obey it.

## Emails

Queued inside the request that caused them, sent best-effort inline, retried by
`/api/caregiver/email-worker` (Vercel cron, every 10 min) with exponential
backoff to 6 attempts, then parked as `failed`. Permanent 4xx from the provider
is parked immediately. Dedupe keys mean a repeated callback cannot re-send.
Only `dispatched`, `out_for_delivery`, `delivered` and the exit states email the
applicant - every step is still recorded in history.

## Security

- **Card control token**: 24 random bytes, returned once at issuance, stored
  only as a SHA-256 hash, compared in constant time. Required to order a printed
  card. A leaked database cannot be used to ship cards against other people.
- **Price**: `SHIPPING_PRICE` is a server constant. The browser never carries an
  amount; `/api/caregiver/order` builds the CCAvenue request itself.
- **Address**: resolved server-side from stored records, never posted by the client.
- **Callback**: merchant ID, amount and currency are all re-verified before a
  shipment opens; `recordPaidShipping` is re-entrant, so duplicate callbacks
  cannot open a second parcel.
- **Public projection**: mobile, email, address and token hash are provably
  absent from `caretakerPublic` (asserted in tests).
- **Admin**: bearer token (`PFA_ADMIN_TOKEN`), constant-time compare.

## Endpoints

| Method | Path | Auth |
|---|---|---|
| POST | `/api/caregiver/apply` | none (public, free issuance) |
| GET | `/api/caregiver/card?id=` | none, cached |
| POST | `/api/caregiver/order` | card token |
| POST | `/api/caregiver/admin-shipment` | `PFA_ADMIN_TOKEN` |
| GET/POST | `/api/caregiver/email-worker` | `PFA_ADMIN_TOKEN` / `CRON_SECRET` |

## Environment

`PFA_MAIL_API_KEY`, `PFA_MAIL_FROM`, `PFA_MAIL_REPLY_TO`, `PFA_MAIL_ENDPOINT`,
`PFA_ADMIN_TOKEN` - see `.env.example`. Without a mail key the journey still
works end to end; emails queue and wait.

## Lost printed card

`lost-card.html` → `POST /api/caregiver/replace`.

- Stage `verify`: card number + the mobile it was issued against. Both must
  match. Failure returns one message for "no such card" and "wrong number", so
  the endpoint cannot enumerate valid card numbers.
- Stage `order`: creates a **replacement order** (`kind: 'replacement'`,
  `replacesShipmentId`) and takes ₹100. On payment it opens a second shipment
  with its own tracking ID.
- **Invariant, asserted in the end-to-end walk:** `cardId`, `issuedAt` and
  `validUntil` are never touched. No second digital card is ever created.

## Deduplication (no OTP)

| Layer | Key | Behaviour |
|---|---|---|
| Hard | `caregiverMobileIndex/{mobile}` | Blocks. Returns the held card, no token. |
| Soft | `caregiverIdentityIndex/{identityKey}` | Warns. Records `softDuplicateOf`. |

`identityKey` = SHA-256 of normalised name + PIN. Normalisation strips
honorifics, case, punctuation and word order, so `Dr. Asha Kumar`,
`asha kumar` and `Kumar Asha` collide. A soft match does **not** block: two
people in one household can legitimately both hold cards. `householdKey` (the
address fingerprint) is stored alongside for admin review.

## Photograph

`assets/photo-editor.js`, shared by both journeys. Drag to position, zoom
100 - 300%. Resolution verdict from print maths: 54 mm at 300 dpi = **638 px**
needed across the printed area (`good`), below that `soft`, below 351 px
`poor`. Zoom divides the effective resolution, so zooming in can move a good
photo to soft. The journey blocks once on `poor` before issuing.

## Known gaps for phase 2

- Rate limiting on `/api/caregiver/apply` is not implemented. Free issuance is
  behind mobile uniqueness only; a per-IP limit belongs in front of it.
- Mobile numbers are not verified (no OTP). Uniqueness is enforced, ownership
  is not.
- The photograph is deliberately device-only, so a holder who clears storage
  loses the image and re-downloads a card without one. Storing it needs a
  considered call on consent and cost.
