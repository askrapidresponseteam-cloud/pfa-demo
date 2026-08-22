# The Circle - PFA members area

The post-login social area for Patrons. Nine screens, three asset files, one
seeding script, and no invented content anywhere.

---

## CineKind: the launch layer

Sixty-five photographs from the real events around the first season, shipped
as 5.6MB of webp at two sizes instead of 24MB of jpg. Three new chapters on
the page, one lightbox for everything, and an animation vocabulary borrowed
from cinema itself.

**The reel.** Two rows of film - sprocket holes drawn in CSS, frame numbers
in the margin - running opposite directions between the hero and the trophy.
It pauses when the pointer is on it, every frame opens the lightbox, and
under reduced motion it stops and becomes an ordinary strip you can scroll.

**The press wall.** The newspaper announcement, shown whole and pinned at a
tilt over the launch photographs: "CineKind Awards 2025: Where Cinema Meets
Compassion." **The season strip** follows it: MECON, the Purbo Bharat
summit, the FFI Achiever's evening.

**Unmasking.** The page's big frames open like a shutter as they arrive,
with a slow dolly inside the two largest while they hold the screen. Applied
by script, so a page without script hides nothing; belt-and-braces with both
IntersectionObserver and a passive scroll sweep, because a photograph that
never appears is a worse failure than an animation a frame late.

Captions are event-level only - what the banners in the photographs say -
and no individual is named, because the archive did not name them. The whole
rk set carries one caption, the FFI Achiever's evening, after a screenshot
caught the invented costume-showcase split mislabelling a felicitation.

The trophy photograph stays on the Film Federation's own server as authored;
when that server refuses the request, as it does from file://, the frame
states what belongs there in type instead of standing broken.

---

## The store, and what it is now allowed to say

The store's new layer - deals with reasons, the animal ledger, the feeding
arithmetic, the street bowl - shipped in an earlier revision with its numbers
made up. Expiry dates, stock counts, countdowns, a 22 percent margin figure,
per-vaccination costs, and over-ordering attributed to named real PFA units:
all fiction, and the deal buy button promised one price while the cart
charged another. That is the exact dark pattern the band's own copy says it
rejects, and fabricated scarcity and price claims are a consumer protection
problem in India, not a style choice.

All of it is now driven by one admin-owned file: `assets/store-facts.js`.
The rule it enforces: **the store may only say things somebody at PFA has
actually said first.**

| Fact absent | What renders instead |
|---|---|
| No deals entered | The band explains how a deal earns its place. No products, no urgency. |
| No `ends` on a deal | No countdown. A countdown without a deadline is a pressure tactic. |
| No `stock` and `left` | No stock bar. |
| No `unit` | No unit named. |
| No confirmed `margin` or `careCosts` | The ledger says margin funds PFA's hospitals, rescue and casework - true with no numbers - and never estimates. |
| Bowl not enabled with a real SKU | The street bowl panel does not exist. |

Two hard protections beyond that:

1. **A stated deal price must equal the live catalogue price**, because the
   cart charges the catalogue. An entry whose price disagrees is refused
   outright rather than shown. Tested: a lying price renders nothing.
2. **The buy toast says "Added to your bag" and nothing about money**, so
   the page can never tell the customer two different numbers.

### The photographs

Catalogue photographs are hotlinked from the live shop's CDN, which refuses
requests from `file://` - the way the site is being reviewed - and can refuse
any request on a bad day. A failed photograph used to leave a grey hole with
alt text colliding into the category badge. It now becomes a designed plate:
the product's initial as the picture, the name set beneath it, the badge
where it was. Handled by a capture-phase error listener plus a sweep for
images that fail late, in `store-render.js`, styled in `store-plus.css`.

### Finding the new aisles

Deals and the animal ledger lived six thousand pixels down the page, which is
the same as not existing. A slim two-tile band now sits directly under the
store toolbar pointing at both. The hero above it is byte-identical to the
original upload - verified, not assumed.

---

## The door, and who gets through it

Two decisions, both settled deliberately.

### Non-members see nothing

There is no preview, no sample feed and no guest mode. A stranger gets one
screen explaining what The Circle is and how to join. This is enforced in
`firestore.rules`, not merely hidden in the interface: every Circle collection
is `allow read: if canRead()`, and `canRead()` requires a `role: 'member'`
token claim. A browser console cannot read a single post without one.

It costs some conversion. It is the right trade for this content: members name
streets, describe injuries and talk through disputes with neighbours that are
still going on, and people write all of that differently when strangers can
read it.

### A lapsed Patron reads for thirty days, then the door shuts

A membership has three states, not two.

| State | When | Reads | Writes |
|---|---|---|---|
| `active` | card is current | yes | yes |
| `grace` | expired, under 30 days | yes | no |
| `ended` | expired, over 30 days | no | no |

Somebody who forgot to renew on Tuesday has not stopped caring about animals
on Wednesday. For thirty days they keep reading everything, with a banner on
every screen that names the date the card ran out, counts the days remaining,
and offers renewal. Past that, `createSessionToken` issues no token at all and
they get a written screen rather than a validation error.

**Deleting your own words survives into the grace window.** That is a privacy
right rather than participation, and a member who could not delete during
grace would have their writing stranded permanently once the window shut.
`ownsDoc()` therefore checks `canRead()`, not `canWrite()`.

**Why the token carries a date, not a yes-or-no.** Custom claims are minted
once at sign-in and then ride along in the ID token for the life of the
session. A baked-in `canWrite: true` would keep working for a member who
signed in the day before their card lapsed and left the tab open. The claim
carries `validUntil` as a millisecond number instead, and the rules compare it
against `request.time` on every single operation:

```
function canWrite() {
  return isMember() && (
    validUntil() == 0 ||
    request.time.toMillis() < validUntil()
  );
}
```

The writes stop by themselves, to the minute, with no session to invalidate.

Client-side, every write path calls `C.canWrite()` first and rejects with
`MEMBERSHIP_LAPSED` rather than letting a member type 401 characters and then
discover they do not count. The controls that would fail are not rendered:
reactions become plain counts, Join and RSVP disappear, Mark answered is
hidden, and the composer is replaced by one quiet line.

---

## The four changes in the previous revision

### 1. No em dashes, anywhere

Every em dash and en dash has been removed from every file in the project:
HTML, CSS, JavaScript, API routes, `lib/`, and the setup documents. There were
92 of them. They are now spaced hyphens or ordinary punctuation, matching the
style the site already used in its own copy.

An automated check confirms zero remain. Worth knowing: this also caught a
character inside a regular expression in `search.html`, which is described
under "bugs found" below.

### 2. The whole country, filterable by state

The feed is national by default and says so: the scope bar reads
**Showing: All of India**, with a state dropdown beside it. Narrowing is
something the reader chooses and can always see, never something applied
quietly on their behalf.

The state filter appears on the feed, inside a circle, on events and on the
member directory. The state list is derived from `PFA_DATA.units`, which is
the same unit data the rest of the site runs on, so the filter can never drift
from where PFA actually operates.

Each member sets their state once during setup. Every post they write records
it, which is what makes the filter work without asking anybody anything.

### 3. Real data only

All seed content is gone. There are no sample members, no sample posts, no
sample events and no sample replies anywhere in the codebase. Every screen
reads from Firestore and every screen has a written empty state for when there
is nothing there yet:

> **The Circle is empty.** Nobody has written anything yet. Somebody has to go
> first, and it may as well be you.

The one exception is deliberate and is not content: the ten **circles**
themselves. Circles are structure, like categories, and no member can create
one. They are written to Firestore once by an administrator running
`tools/seed-circles.js`, and until that is run the Circles screen honestly
reports that none exist.

### 4. You can delete your own posts and replies, and only your own

A Delete control appears on your own posts and replies and on nobody else's.
It asks once before acting, because it cannot be undone.

The button being hidden is a courtesy. The rule that actually enforces it is
in `firestore.rules`, where it cannot be worked around from a browser console:

```
allow delete: if isAdmin() || ownsDoc();

function ownsDoc() {
  return isMember() && request.auth.uid == resource.data.authorId;
}
```

One deliberate extra: the author of a post may also delete a reply underneath
it. A person who asked a question can prune their own thread, which matters
more here than strict symmetry.

---

## How identity works

No new authentication was written. The Circle uses the two API routes that
already existed:

1. Member enters their Patron number
2. `POST /api/member/auth/start` emails a six digit code
3. `POST /api/member/auth/verify` returns a Firebase custom token
4. The browser calls `signInWithCustomToken`

`lib/member-auth.js` mints that token as
`createCustomToken(memberId, { role: 'member', memberId })`, so
`request.auth.uid` **is** the member number and `request.auth.token.role` is
`member`. That is exactly what `firestore.rules` already assumed, which is why
a member's own identity needs no lookup and cannot be faked.

On first entry a member is asked once for a name, a handle, a state, and
optionally a town, what they do, and a line about themselves. They are never
asked again.

---

## Data model

```
circleProfiles/{memberId}       name, handle, state, city, role, bio
circleProfiles/{memberId}/joined/{circleId}
circles/{circleId}              name, kind, blurb          (admin only)
circlePosts/{postId}            authorId, authorName, authorHandle, state,
                                kind, circleId, text, tags[], place, closed,
                                replyCount, helpful[], same[], joining[], createdAt
circlePosts/{postId}/replies/{replyId}
                                authorId, authorName, authorHandle, text,
                                helpful[], createdAt
circleEvents/{eventId}          title, circleId, hostId, hostName, state,
                                startsAt, where, need, note, going[]
```

Author name and handle are copied onto each post on purpose. A feed of forty
posts would otherwise cost forty extra profile reads to render. The trade is
that a member renaming themselves does not rewrite their old posts, which is
the right way round for a record of who said what.

Reactions are arrays on the document rather than a subcollection, for the same
reason: one read per post instead of one per reaction.

---

## What the rules enforce

`firestore.rules` gained a block for The Circle. These are the parts that
matter:

| Rule | What it stops |
|---|---|
| `allow delete: if ownsDoc()` | Deleting anybody else's post or reply |
| `selfOnlyDelta(field)` | Adding or removing anyone but yourself from a reaction list. Without it, one request could empty every reaction on the site or stuff a post with fake helpers |
| `text.size() <= 401` | A client with the console open posting 10,000 characters |
| `onlyChanged(['closed'])` + `ownsDoc()` | Anyone but the asker closing a question |
| `replyCount` may step by exactly 1 | Writing a fake reply count onto somebody's post |
| Text is never in an allowed update | Editing a post after people have replied to it |

`firestore.indexes.json` declares the six composite indexes the queries need.
Deploy both:

```
firebase deploy --only firestore:rules,firestore:indexes
```

Firebase validates the rules syntax on deploy. Testing them properly needs the
emulator, which had no network here, so run this before going live:

```
firebase emulators:exec --only firestore "npm test"
```

The cases worth writing first are the three in the table above: delete
somebody else's post, add a stranger's id to a reaction array, and post 402
characters. All three should be denied.

---

## Setting it up

1. **Fill in the Firebase config.** `assets/firebase-config.js` already has
   the project values. If they are placeholders the members area says so
   plainly rather than failing silently.
2. **Deploy rules and indexes.** Command above.
3. **Create the circles, once:**
   ```
   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
   node tools/seed-circles.js
   ```
   Safe to run more than once. Edit a blurb in the file and re-run to change
   it. Nothing else is seeded.
4. **Sign in** at `hub.html` with a real Patron number.

Events are created by an administrator in Firestore. Members RSVP but do not
create them, which is why there is no "new event" button.

---

## The house rules

Ten of them, on `you.html#rules`. Mostly about what is missing:

1. Nobody has a score. No follower counts, no view counts, no leaderboards.
2. You cannot quote to mock. Replies happen underneath, where they can be answered.
3. Reactions only go one way. Helpful, Same here, I'm in. Nothing points against a person.
4. 401 characters.
5. No photographs, video or audio.
6. **You own what you wrote.** Delete your own at any time; nobody can delete yours.
7. Questions close when the asker marks them answered.
8. A pause before heat.
9. Three tags, not a crowd.
10. **The whole country, unless you say otherwise.**

---

## Built for 8 to 80

- Text size setting (small, medium, large) scaling the reading column only, so
  posts grow without the navigation moving
- Every control 40px or taller, most 44px and up
- Tagging works without knowing what `@` means: a full size "Tag a member"
  button opens the same picker
- Plain labels. "Something to share", not "Compose". "I am coming", not "RSVP"
- Bottom tab bar on phones, left rail on desktop, both with words

---

## Two pre-existing bugs fixed

**1. Mobile header, every page.** `assets/header-footer.css` loads last and
its `.desktop-nav{display:flex}` overrode the `max-width:980px` breakpoint in
`site.css`. Every page on every phone showed the full desktop nav *and* the
hamburger. The breakpoint is now restated in `header-footer.css` where it can
win. Verified across all 48 pages.

**2. `search.html` crashed on load.** Line 89 built the regex
`/\s*[|--]\s*PFA.*$/i`. The character class `[|--]` is a reversed range and
throws `Range out of order`, which killed the entire inline script and with it
the whole search page. Now written as an explicit set of the pipe and the
dashes. Confirmed against `"Adopt a dog | PFA India"` and `"Stories - PFA"`.

---

## Testing

45 automated checks in headless Chrome against an in-memory Firebase stub that
implements the slice of the SDK the code actually calls, so the real UI runs
untouched. All 45 pass with zero page errors. Covered:

- Sign in, including a wrong code being rejected
- First visit profile setup, and the state list coming from the unit data
- Empty states on every screen with an empty database
- Circles absent until seeded, then present
- Posting, the 401 holding against a 900 character paste, replies, reactions
- **Delete present on your own post and absent on another member's**
- **State filter: Kerala shows only Kerala, Maharashtra only Maharashtra, All of India shows both**
- The pause firing on heated text
- All nine screens rendering
- Zero horizontal overflow at 390, 768 and 1440
- Zero em or en dashes rendered on screen

Separately, all 48 pages of the site load with no JavaScript errors.

Not covered, and worth doing before launch: the security rules themselves,
which need the Firestore emulator.

---

## Site sweep and admin moderation (v1.23)

### The sweep
Automated audit of all 50 pages at 390/768/1440px: zero JS errors, zero
broken images, zero duplicate ids, zero horizontal overflow anywhere.
Fixed from its findings:

- Every bare `<label>Text</label><input>` pair on the site is now associated
  (a small pass in site.js pairs them at load). Screen readers announce the
  field; tapping the label focuses it. This cleared give, services, network
  and pharmacy.
- Interactive controls raised to a 40-44px floor with no visual change:
  the skip link, store/checkout toolbar search and category selects
  (their own `min-height: 23px` raised at source), index door links and
  replay button, Learning Center copy/build/timer/reset buttons, store
  live-product title buttons, CineKind archive links (padding plus negative
  margin, so layout is unmoved).
- Spelling: all 1,056 rare words reviewed by hand; consistent British
  spellings throughout; no misspellings found. "Learning Center" (the page
  brand) is the site's own naming and was left alone.
- Remaining audit notes are intentional: inline prose links at text size,
  native radio/checkbox controls (labels now associated), the store hero
  cat's designed bleed, and CineKind's scroll strips.

### Forms and Firebase
Every enquiry form already persists server-side: `PFA.saveSubmission` posts
to `/api/pfa-submissions`, which validates and writes Firestore, and the
admin panel's Submissions tab reads it back. Verified for: adoption,
stories, CSR, Wire reports, volunteer training, services, podcast and
meeting requests, and both network help-desk forms. The pharmacy helper
deliberately stores nothing - it narrows products on the page, and says so.
Payments and checkout keep their own existing API routes.

### Circle moderation (new)
`/api/admin/circle` behind the same admin session as every panel route:

| Call | Does |
| --- | --- |
| `GET ?action=posts&q=` | Latest posts, author names joined from profiles |
| `GET ?action=replies&post=` | A post's replies |
| `GET ?action=profiles&q=` | Circle members with live membership standing |
| `POST delete-post` | Removes the post and all its replies |
| `POST delete-reply` | Removes one reply, reply count kept honest |
| `POST remove-profile` | Removes a member from the Circle; `purge:true` also deletes everything they wrote |
| `POST extend-membership` | Renews `validUntil` by N months from today or current expiry, whichever is later |

Every destructive action is written to `circleModerationLog` with the
admin's identity, the target, and an excerpt of what was removed - a
moderation power nobody can audit is how moderation goes wrong.

The admin panel has a **Circle** tab: search posts or members, expand
replies inline, delete with confirmation, see each member's standing
(Active / Grace with days left / Ended) and extend or remove them.
Removal asks separately whether to purge their content.

Contract-tested (24 assertions) against an in-memory Firestore with the
real member-auth arithmetic: cascade deletes, count floors, purge
accounting, audit entries, and the unauthorised path leaving data untouched.

### Granting admin
Set the custom claim `admin: true` on a staff Firebase account (the
Admin SDK one-liner in lib/admin-auth.js comments), then sign in on
admin.html with that email and password.

### Punchline headlines (v1.24)
House rule made consistent: when a display headline carries more than one
sentence, each sentence starts its own row. It was already the pattern on
the homepage and CineKind (via `<br>` or a block span); it is now true
everywhere.

Applied to every headline at 42px and up: champion, cinekind, dispatch,
founder, get-involved, give, learning-center, network, search, store, and
the Deals band built in store-render.js. The store hero needed only
`display:block` on its existing blue span, matching index.html's
hero-title span. Headings built in JavaScript escape their text and so
cannot carry markup; those go through the new `PFA.punchline()` helper,
which escapes and then breaks on sentence boundaries.

Small card and form headings (21-31px) are left as running text on
purpose - a break there reads as a mistake rather than a beat.

Fixed along the way, all missing-space defects rather than layout:
- "Get to Learn.Earn your standing." had no space and no break.
- "You were there.Let the rest of us see." in three places, two of them
  button labels, where a space is correct and a break would be wrong.
- 31 staff names in data.js written "Mr.Anand Pandya". Initials such as
  "C.K." are untouched; only the honorific gets its space back.

Verified by punch-test.js, which measures the rendered position of each
sentence's first character at desktop and phone widths rather than
trusting the markup.

### Build stamp (v1.25)
Every page now carries `<meta name="pfa-build">` and prints its build to the
browser console on load. To check which version is actually open, press
F12 and read the first console line, or run:

    document.querySelector('meta[name="pfa-build"]').content

This exists because a stale browser tab looks exactly like a bad build.
If a fix seems missing, check the stamp first: `file://` pages are served
from the browser's own copy, so re-open the page from the freshly
extracted folder (or hard-reload with Ctrl+Shift+R / Cmd+Shift+R).

---

## Field validation (v1.26)

### One rule set, both sides
`assets/field-rules.js` is the single definition of what a valid entry is.
The browser loads it as a script; the API routes `require()` the same file.
Two copies would drift, and the day they drift is the day the form accepts
what the database rejects.

| Rule | What it accepts |
| --- | --- |
| `mobile` | Ten digits starting 6, 7, 8 or 9. Accepts `+91`, `0091` and leading-`0` forms and stores the bare ten digits |
| `personName` | Letters from any script (Devanagari, Tamil, Bangla included), spaces, hyphens, apostrophes, full stops. No digits |
| `email` | Stricter than `type=email`, which accepts `a@b`. Requires a dotted domain, rejects doubled dots |
| `pin` | Six digits, never starting 0 |
| `amount` | Whole rupees, 1 to 1 crore |
| `address` | 8 to 200 characters |
| `shortText` / `longText` | 3-200 and 10-2000 characters |
| `reference` | Letters, digits and hyphens |

Rules check *form*, not plausibility. A structurally valid number is
accepted even if it looks unusual: turning away someone reporting an
injured animal costs far more than a junk row an admin can delete.

### In the browser
`PFA.validate()` now checks every field, not only the required ones, so an
optional email that is filled in wrongly is still caught. Each field gets
its own message in its existing `.error` span, `aria-invalid` is set, the
first bad field takes focus, and a `role="alert"` summary line says how
many need attention. Errors clear as the person types the fix rather than
on the next submit. Where a page already had good wording ("Enter your
city."), that wording is kept for empty fields and the rule's message is
used for malformed ones.

`PFA.formData()` normalises on the way out, so a number typed
`+91 98765-43210` and one typed `09876543210` are stored identically.

### On the server
`api/pfa-submissions.js` validates every field it receives and returns
`422` with the offending field names. `lib/payment.js` previously accepted
any ten digits on the donation and membership path while the caretaker
path was already strict; both now use the shared rules. `api/pfa-orders.js`
was already correct. The admin sign-in checks the email before spending a
round trip on it.

Sanitising no longer truncates. A 3000-character report is refused with a
message rather than silently stored as its first 2000 characters.

### Tests
- `validate-test.js` (28) drives the real forms in a browser: bad input,
  good input, focus, live clearing, and coverage that every text field on
  every page maps to a named rule.
- `validate-api-test.js` (16) POSTs straight at the API with no browser,
  and asserts client and server reach the same verdict on the same input.

---

## Store: promises removed (v1.27)

### What went, and why
The store carried two entry cards, "Deals and Steals / Cheap for a reason"
and "Shopping for someone / Tell the store your animal". Neither could
deliver:

- `store-facts.js` was the admin-owned file both fed on, and it shipped
  empty. No deals, no margin, no care costs. The deals band could only
  ever render its honest empty state, "Nothing qualifies today": a shelf
  with a sign on it and nothing behind.
- The feeding calculator worked out grams per day from generic textbook
  RER/MER factors and an assumed 3500 kcal/kg, not from any product's own
  label. Telling someone how much to feed their animal from an assumption
  is the kind of number that should not be on a charity's website.

Removed: the two aisle cards, the deals band, the care teaser, a further
section headed "The store can know your animal" that was still advertising
the calculator after its body had gone, `deals.html`, `care.html`, and the
scripts that served only them (`store-facts.js`, `store-plus.js`,
`store-render.js`, `store-home.js`, `care-page.js`, `deals-page.js`,
`store-plus.css`). Every link to the two pages is gone from all 48 pages,
including the "Deals and Steals" entry in the site footer.

What remains is the shop itself: 853 real products at real prices, search,
category filters, the pharmacy and the bag, all driven by `store.js` and
untouched by this change.

The retired test suites are in `build/retired/` with a note, so the work is
recoverable if PFA ever has real deal and nutrition data to put behind it.

### A mistake worth recording
The first attempt at removing the links used a regex sweep across all
pages. It removed far more than it was aimed at: three `stories.html`
links per page and a footer link whose text mutated, damaging 46 of 48
pages. It was caught by diffing the result against the previous build
rather than trusting the edit.

The fix was to restore every page from the verified v1.26 tree and redo
the work with a scanner that walks each `<a>` to its own `</a>`, asserting
per page that the anchor count falls by exactly the number of deals/care
links that page held. `store-integrity.js` now fails if any page loses its
Stories or Services links, so the regression cannot return unnoticed.

Lesson for future sweeps: never let `.*?` with DOTALL loose on markup, and
always assert the expected delta per file rather than eyeballing the result.

---

## The membership register (v1.28)

### One register, both cohorts
There is a single Firestore collection, `members`. Existing members arrive
by import; new members arrive through the payment flow on membership.html.
After that moment nothing distinguishes them: same record shape, same
sign-in, same card, same lapse and grace handling, same admin screens.
That is what makes it a portal rather than two systems.

### Importing the office spreadsheet
Admin console, **Import** tab:

1. Upload the .xlsx/.xls/.csv. It is parsed in the browser, so the
   register is never handed to a third party just to be read.
2. Columns are auto-matched by heading, with a dropdown per field to
   correct any that were guessed wrong. Only name and mobile are required.
3. **Check the sheet** runs the entire import against Firestore and writes
   nothing, returning: how many are new, how many already exist, how many
   are repeated within the sheet, how many rows have a problem, and how
   many have no email.
4. **Import for real** commits, in batches of 400, and logs the run to
   `memberImportLog`.

Re-running the same sheet updates rather than duplicates: rows are matched
to existing members by mobile number. Correct three rows in the office file,
re-upload the whole thing, and three records change.

### Decisions taken, and why
- **The sheet's dates win.** The previous importer stamped everyone with
  "valid for a year from today". That would have handed a free year to
  people who lapsed years ago and overwritten the office's real renewal
  dates. If a row has a date, it is used; only when it has none does the
  record fall back to a year from the join date.
- **dd/mm/yyyy is read as Indian.** The Date constructor reads it as
  American and silently swaps day and month. Excel serial numbers are
  handled too.
- **Old member numbers are kept.** New records get the canonical
  PFA-MBR-XXXXXXXX id, because the login and the card expect that shape,
  but the office's existing number is stored as `legacyId` so a member
  quoting an old card can still be found.
- **Rows without an email still import, and are counted separately.**
  Sign-in posts a one-time code to the member's registered email, so a
  member with no email on file cannot log in. They are on the register and
  countable, but the office needs to collect an address before they can use
  the portal. The import summary shows this number in amber for that reason.

### A latent bug found while building this
`lib/firebase.normalizedMobile` returned an empty string for a number
written `09876543210` or `0091-9876543210`, while the shared field rules
handled both. Any member typing their number with a leading zero at
checkout was therefore not found and treated as a new person. It now
delegates to `assets/field-rules.js`, the same definition the browser
uses. Output is unchanged for every form the old version already accepted,
so no stored data is affected.

### Still to decide with PFA
- Whether members without an email should be able to sign in by mobile
  instead. The code path would be a one-time code by SMS, which needs an
  SMS provider and a budget decision.
- Whether legacy numbers should be accepted at the sign-in box as an
  alias for the new member number.

---

## Validation: the miss, and the fix (v1.29)

A name field on the Caretaker Card application accepted "karthik dhanya11".
The shared rules were correct and tested; they were not the rules that field
was using. `assets/journey-core.js`, which drives the caretaker, membership
and lost-card journeys, carried its own second copy of the rules, and its
name rule asked only for two characters. Those are the forms that take money
and print cards.

`journey-core.js` now calls `assets/field-rules.js` like everything else, and
shows the rule's own message instead of only a red border.

The same edit that added `maxlength` to inputs had also corrupted one tag on
caretaker.html into `type="email maxlength="254"`, which meant the browser
never saw a type of email at all. Fixed, and asserted.

`validate-sweep.js` is the test that would have caught both. It walks every
editable field on every page, types values that must be refused (names with
digits, 1234567890, 0000000000, a@b, a PIN starting zero), and fails if the
page accepts any of them - through whichever validator that page happens to
use. 99 hostile values, all refused.

## The membership register, from PFA's own workbook (v1.29)

`PFA_Memberships_2026.xlsx` is not a tidy table:

- 22 sheets: `Sheet1` of 2026 payments plus one per state.
- The heading is on row 2 of Sheet1 and row 1 of the state sheets.
- Name, mobile and email of a member sit together in ONE cell, separated by
  line breaks in some rows and only spaces in others.
- Membership numbers appear as `927.0`, `UP 1451`, `JK 645`, `MP 6097`.
- Sheet1 largely repeats people already on the state sheets.

The importer now reads every sheet, finds the heading row itself, and splits
the combined cell by pattern rather than by position: the email is whatever
looks like an address, the mobile is the ten-digit run starting 6 to 9, and
the name is what remains. Measured against the real file:

| | rows |
| --- | --- |
| contact cells found | 721 |
| name and valid mobile, ready to import | 697 |
| with an email | 657 |
| needing office attention | 65 |

`MEMBER-REGISTER-REVIEW.csv` in the site root lists those 65 with the sheet,
row, membership number and what is missing. 198 members have no email at all;
they will import and appear on the register, but cannot receive a sign-in code
until an address is collected.

Because rows are matched on mobile number, Sheet1's repeats of state-sheet
members become updates rather than duplicates. The dry run reports exactly
that before anything is written.
