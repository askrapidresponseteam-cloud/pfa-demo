# The admin surface: where it is, and what it is not yet

## Where it is

**API:** `/api/admin/*` on the same Vercel deployment as the public site —
`attachment`, `cards`, `case`, `metrics`, `people`, `records`, `staff`, `store`,
`submission-status`.

**Panel:** `admin.html`, at the root of this repository and served at
`/admin.html`. It signs in against Google's Identity Toolkit REST endpoint
directly, so no third-party script loads before someone is admitted, and every
call it makes carries the resulting ID token as a bearer header.

There is no separate admin domain. The panel and the public site are one
origin, one deployment, one set of environment variables.

## Is it enterprise grade?

**Closer than it was.** The gap this document called serious is closed. Two
things remain, and neither is a hole so much as a hardening step.

### What is sound

- **Named administrators, not a shared login.** The only credential is a
  Firebase ID token carrying an `admin: true` custom claim, so every action
  attaches to a person.
- **Per-module permissions.** An account can be given Submissions without being
  given Payments. Every admin route goes through the same guard, and a test
  asserts it.
- **The panel and the database agree.** `firestore.rules` checks the same
  claim, so revoking someone in one place does not leave them admin in the
  other.
- **The actor comes from the token, not the request.** A caller cannot say who
  they are.
- **Claim changes take effect in about a minute**, because the user record is
  re-read rather than trusting the token's cached claims.
- **Removing someone ends their sessions now.** `people.js` calls
  `revokeRefreshTokens`, and the guard verifies tokens with the revocation
  check on, so an already-issued token stops working immediately rather than
  lasting out its hour.
- **Nothing can be deleted.** Records are withdrawn, revoked or archived.
  Enforced by a test that scans every server file.
- **Attachments are private** and readable only through an admin route.
- **Every admin response** carries `nosniff`, `X-Frame-Options: DENY`,
  `frame-ancestors 'none'`, `no-referrer`, `noindex` and `no-store`.
- **Guessing is slowed.** Twenty failed attempts from one caller in ten
  minutes returns `429` thereafter, counted per caller and only on failure.
- **`robots.txt`** disallows `/admin.html` and `/api/`.

### Closed: the two shared secrets

`PFA_ADMIN_TOKEN` and `PFA_ADMIN_API_KEY` each used to open **every** admin
route with no named identity and no per-module limit. `lib/admin-auth.js` no
longer reads either of them; `identify()` returns a caller only for a verified
Firebase identity, and a test asserts the strings do not reappear in the guard.

`PFA_ADMIN_TOKEN` still exists, but only as the trigger secret for two machine
endpoints — `caregiver/email-worker` and `caregiver/admin-shipment` — which
have their own narrow handlers. **Holding it no longer opens the panel or any
`/api/admin/*` route.** Keep it set if you use the email worker; it is no
longer a master key.

### Closed: an audit log across all admin routes

`lib/admin-audit.js` writes an append-only entry for every change: replies,
notes, assignments, status moves, card batches, Store state changes and access
changes. Entries are written with `create()`, never `set()` or `update()`, so
one cannot be quietly rewritten, and nothing in the file deletes. The actor
comes from the verified token. A failed log write is swallowed and logged to
the function console rather than failing the action it describes.

Read it at **Audit log** in the panel, or
`GET /api/admin/records?type=audit`. Both are super-admin only, because the
log names people and what they did.

### Still missing, in the order I would do them

1. **Multi-factor for admin accounts.** Firebase supports it; nothing
   currently insists on it. An administrator with a reused password is now the
   most likely way in, and this is the top of the list.
2. **Restrict where the panel can be reached from** — an IP allowlist or a
   Vercel deployment protection rule. One origin serving both the public site
   and the panel means anything that reaches the site reaches the panel's
   login.
3. **Alerting.** Nothing tells anyone that the `429` above has started firing,
   or that someone was given super access at 3am. The log now records it; no
   one is told.
4. **Retention and export for the log.** It grows without bound and there is
   no scheduled export. Decide how long an entry should live before this
   matters.

## Environment variables the admin path uses

    FIREBASE_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY    — the only way in
    PFA_ADMIN_TOKEN        caregiver email worker trigger only
    PFA_ADMIN_API_KEY      no longer read anywhere; unset it

`PFA_ADMIN_API_KEY` has no remaining consumer and should be removed from the
Vercel environment. `PFA_ADMIN_TOKEN` is now scoped to the two caregiver
machine endpoints; setting it grants no access to the panel or to any
`/api/admin/*` route.
