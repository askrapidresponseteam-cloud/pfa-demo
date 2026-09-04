## v1.266

- **The door's contrast repaired with the site's own proven numbers.**
  v1.265's scrim was guessed short: it emptied at 66% of the frame while a
  three-line 124px headline climbs past that, leaving A KINDER as white type
  on the caregiver's pale sari with almost nothing behind it - shipped
  unrendered, caught by the owner within the hour, and rightly. No fresh
  guessing in the repair: the gradient now carries the split panels' proven
  stops - weighted to the words, roughly 4.8:1 under the copy even over a
  pale field - one band higher because this title is taller than theirs, and
  the copy takes the same text-shadow they use against bright hotspots. The
  white seam at the header survives: the top fifth of the frame is
  untouched, and that is where the photograph is actually white.

Tests: 781 passing.

## v1.265

- **The door recomposed to the owner's reference.** The photograph's own
  white top now meets the white header with nothing between them - the old
  flat 40% dim greyed that seam - because the scrim is weighted to the
  bottom where the words are, the same reasoning the split panels have
  carried all along. The title keeps its three lines with a hairline drawn
  under them, the introduction sits lower-left, and Enter PFA stands
  lower-right as an outline that fills on hover. Same photograph, same
  heading, same door and the same search it opens; only the composition
  moved. The hero also loses its data-cursor hint: the frame is white at
  the top and black at the foot, and reading the pixels is what the
  adaptive cursor is for.

Tests: 781 passing.

## v1.264

- **A redelivery, and a ceiling on page weight.** The homepage that shipped
  at 53KB its whole life was found serving seventeen megabytes and a
  full-screen PFA splash written by nobody here - something outside this
  repository deployed over the site on 4 Sep. This version is the same code
  as v1.263 made into a fresh commit, so the ship's rsync overwrites the
  foreign index wholesale and the push rebuilds production from this tree.
  And it cannot happen quietly again: test/page-weight.test.js caps every
  page at 400KB (the heaviest honest page here is laws.html at 212KB) and
  forbids embedded base64 media past ten kilobytes, so a payload three
  hundred times a page's weight now fails the ship the way a failing test
  does. Where the splash came from is answered in Vercel's Deployments tab,
  on the commit line of the deployment that served it.

Tests: 781 passing.

## v1.263

- **The certificate is print grade, and comes as a PDF.** The drawing keeps
  its coordinate system and paints onto a canvas twice the size - about
  340dpi at A4, past the 300 print asks for - and beside the PNG there is
  now a one-page A4-landscape PDF written by hand in the page itself, the
  drawing embedded as a JPEG at .95, indistinguishable on a white document
  and a fraction of the weight. No library and no request, so the page's
  promise that nothing is sent anywhere still holds; TIFF was considered
  and declined, since browsers cannot encode it and no print shop asks for
  it. Two buttons now: Download PDF first, PNG beside it, each saying what
  it saved. The one thing pixels cannot sharpen is the logo: img/logo.png
  is 231x79 intrinsically and will be the softest thing on paper until a
  larger export of the artwork exists - noted in the code where the scale
  is set. Pinned in test/quiz-certificate.test.js.

Tests: 779 passing.

## v1.262

- **The quiz certificate says the organisation's name once.** The logo drawn
  at its head carries the wordmark in its own artwork, and a grey caps
  PEOPLE FOR ANIMALS repeated it a centimetre below - the same thing said
  twice on a document meant to be framed. The repeat is gone from the canvas
  drawing; the heading, the certified name, the score line, the citation
  note and the date all keep their places, and the layout above the title
  simply breathes. quiz.html rebuilt through its template script, as its
  contract requires.

Tests: 778 passing.

## v1.261

- **The paws walk clear of the current-page underline again.** The underline
  is old; the collision is new. The theme's 11px caps nav shrank the anchor
  box the Shop link's paw strip hangs from (bottom:-11px against the old
  mixed-case metrics), and the tracks rose into the marker - a paw cut by
  the line, caught by the owner's own crop on 2 Sep. The strip now hangs at
  -15px, restoring the air the animals had before the retune; the header
  row is 78px, so the hairline at its foot stays far below them, and
  nothing about the underline, the trot, or the reduced-motion stillness
  changed.

Tests: 778 passing.

## v1.260

- **The September theme pass, admitted on its merits and nothing else.** It
  arrived as site-fixed.zip: pages and assets only, no backend, no ship
  machinery, no tests - fed to the ship script it would have deleted the
  payment routes and the tracker with rsync --delete, and its page copies
  were cut from a base missing the v1.242 font fallbacks, with replaced
  artwork and twenty-one failing contracts. So it stood trial instead of
  shipping. Admitted: assets/pfa-theme.css whole (the editorial layer -
  labels, display leading, the band head, the CTA control, square corners,
  hairlines), linked after chrome.css on every chrome page and into the
  product and quiz rebuilds; the chrome.css retune, which proved to be this
  tree's own file plus two kilobytes (the 11px caps nav, the hairline, the
  three-track header grid that stops a wide nav running under the mark);
  and one surgical chrome.js fix worth having - measure() no longer
  publishes a zero height before layout settles, which had put the fixed
  header under the announcement bar on some loads. Refused: every page
  copy, the swapped logo and photographs, and field-check.js, which only
  their refused pages referenced. One reconciliation, decided by reading
  what the logo test protects rather than what it pins: the retune's grid
  header removed the wordmark's absolute centring, and the test pinned that
  centring - but only as a proxy for the real property, that the anchor
  never carries a transform to fight the image's animation. The grid
  satisfies that outright, so the pin moved to the property itself; the
  alighting animation, artwork and reduced-motion stillness were intact all
  along.

Tests: 778 passing.

## v1.259

- **Order number + mobile now proves an order.** It always should have: the
  tracker's own field says "email or mobile", and mobile worked only for
  direct-pay orders. For seller-checkout orders two layers were short. The
  route's gate compared the email alone - the phone was never consulted -
  and beneath it the record never stored one: the webhook capture read
  customer.email and stopped. New records now capture the phone from
  wherever Shopify put it (customer, order, shipping or billing address);
  the gate asks a shared contactMatches that takes either contact; and both
  sides run through the submissions normaliser, so the checkout's
  "+91 81052 50299" and a typed 8105250299, 08105250299 or +918105250299
  are one number. Records written before this - which hold no phone - heal
  themselves: a mobile lookup against a phoneless record takes one fresh,
  throttled read of the order from Shopify before the gate judges it, and
  the fulfilled merge now lets that read fill in contact details an old
  record lacks without ever overwriting what it holds. Email lookups,
  direct-pay orders, the anti-enumeration same-wording, and the not-found
  path are untouched. Pinned in test/track-order.test.js across five
  spellings of one number.

Tests: 778 passing.

## v1.258

- **Delivered means delivered.** The courier's own record now outranks the
  frozen mirror. Blue Dart delivered PFA-ST-1196 on 31 Aug and the tracker
  still said Shipped on 2 Sep - correctly, by its lights: Shopify's
  shipment_status only advances for carriers Shopify itself tracks, Blue
  Dart Surface is not one, so the seller's order froze at "shipped with an
  AWB" and v1.255's refresh could only refresh that. The mirror already
  holds the AWB, and Shiprocket's API is the documented way from an AWB to
  the courier's record: login as an API user for a token (kept in memory
  about eight days, one login for many lookups, one silent re-login on a
  401), then track by AWB. The answer's checkpoints become the tracker's
  timeline, the newest one is "last seen", the ETD is "expected", and
  Delivered lights the last station. Two new server secrets -
  PFA_SHIPROCKET_EMAIL and PFA_SHIPROCKET_PASSWORD, an API user the seller
  creates in Shiprocket's settings - and unset means the path is simply not
  taken: the tracker shows the store's and Shopify's stages as before. A
  refused login is logged as the operator's problem; every other failure
  costs the courier line and nothing else. The optional partner endpoint
  from v1.252 remains behind its own variables, after Shiprocket in
  precedence. Pinned in test/track-order.test.js against a stubbed API:
  token kept across lookups, delivered outranking the mirror, checkpoints
  folded, no-AWB asking nothing.

Tests: 777 passing.

## v1.257

- **The chevron rides the top layer, so nothing covers it - not even a modal.**
  v1.256 answered the top-layer problem by standing the chevron down and
  handing the system pointer back under dialogs; the owner rejected that in
  about four hours, and rightly: the drawn cursor is the site's, whole. The
  cursor layer is now a manual popover, which lives in the same top layer a
  modal <dialog> does - above the tracker's panel, its backdrop, everything -
  while taking no focus, trapping nothing and dimming nothing. The top layer
  stacks by arrival, so a dialog opened later lands above the chevron: the
  same 80ms beat that reads the surface notices and steps the layer out and
  back in, which puts it on top again - one hide/show per dialog opening,
  nothing per frame. The colour keeps reading through it, so the chevron is
  ink on the dialog's paper and bone on the backdrop, exactly as anywhere
  else. Fullscreen rehosting re-promotes too, since moving a popover closes
  it. The UA's popover dress (centred, bordered, canvas-coloured) is
  stripped in chrome.css so the layer stays the invisible full sheet.
  v1.256's stand-down survives only as the fallback for browsers without
  popovers, fenced behind @supports so the two answers can never both
  apply. Pinned in test/cursor-contrast.test.js.

Tests: 776 passing.

## v1.256

- **The cursor cannot be beaten by the top layer any more.** A modal <dialog>
  and its backdrop paint above every z-index there is - the cursor layer's
  2147483647 included - so inside the shop's new tracker the drawn chevron
  sat underneath the panel while cursor:none still hid the real one: no
  pointer at all, exactly where the visitor was typing, and a dim ghost of
  the chevron through the backdrop beside it. The contract was always
  visibility, never the costume. While any modal is open the chevron now
  stands down (checked on the same 80ms beat as the colour, so a dialog
  opened under a still hand is caught too) and a :has rule in chrome.css
  hands the system pointer back, with all its native shapes - arrow, text
  beam in the inputs, resize on edges. Close the dialog and the chevron
  returns on the next beat. A browser too old for :has is too old for
  showModal, so it never has a modal to fail under. Pinned in
  test/cursor-contrast.test.js. This covers every current and future modal,
  not the tracker alone.

Tests: 776 passing.

## v1.255

- **Tracking is current at the moment it is asked.** PFA-ST-1196 was delivered
  and read "Processing": a direct-pay order's fulfilment lives in its mirror,
  the mirror was written only by the seller's Shopify webhooks, and none had
  arrived - the daily admin poll mirrors creation alone. Now an id lookup on
  any order not yet delivered, cancelled or refunded fetches that one order
  from Shopify's Admin API (once per order per five minutes), pushes it through
  the same handlers a webhook would take (orders/fulfilled, fulfillments/update,
  orders/cancelled), and links the seller's side into the PFA record - so the
  rail lights and the carrier and AWB show whether or not the store ever
  sends a webhook. Every failure is swallowed and the lookup answers from what
  it holds. Uses the admin token already set; no new variable.
- The shop door's two buttons share one row and one baseline - an <a> and a
  <button> did not agree on line-height and the second wrapped, indented and
  borderless on the dark ground. Track order is now an outline door beside
  the filled one, and on a narrow screen they stack full width, still aligned.
  And the tracker's form hides once there is a result: its display:grid had
  been beating the hidden attribute, so the form sat above the answer.

Tests: 775 passing.

## v1.254

- **Courier stations light from what the site already knows.** The seller
  ships through Shiprocket, and Shiprocket writes the carrier, the AWB and
  Shopify's shipment_status into the order's fulfilment - which the
  orders/fulfilled and fulfillments/update webhooks already carry into the
  order's public view as tracking. The first cut of the tracker only half-read
  it: it looked for "out for delivery" with spaces where Shopify writes
  out_for_delivery, so the fourth station never lit, and it showed the carrier
  line only from the optional partner endpoint. Now every shipment_status is
  understood and said in plain words (in transit, out for delivery, delivery
  attempted, delivered, could not be completed), the carrier and AWB show
  from the mirror, and an attempted or failed delivery says what to do next.
  No new credential: the partner module from v1.252 stays as an optional
  extra behind its two variables, and nothing depends on it.

Tests: 773 passing.

## v1.253

- **Every way tracking can go wrong has its own sentence.** Before asking: a
  field left empty says which one; a seller's order number typed by mistake
  ("1006") is caught, because a PFA number starts with PFA-; a contact that is
  neither an email nor a ten-digit mobile is caught; case, spaces and a
  leading # in the number are treated as noise, never as a different order.
  While asking: no connection, a request that hangs past twelve seconds, and
  an answer that is not JSON (an edge gateway's HTML error page) are told
  apart, because each needs a different next step. On the answer: the
  server's codes map to plain sentences with the server's wording as the
  fallback, and cancelled, payment-failed and refunded orders each say what
  to do next. An update with an unreadable time sorts as zero instead of
  scrambling the list through a NaN comparator. A delivered order says no
  further updates are expected rather than promising some. A browser without
  dialog support hides the button instead of offering a dead one. The result
  heading takes focus so a screen reader hears the outcome. Server-side, a
  refused courier key (401/403) is logged as the operator's problem it is,
  distinct from the ordinary 404 of a parcel the courier has not met yet.
  All pinned in test/track-order.test.js.

Tests: 772 passing.

## v1.252

- **Track order, on the shop door, on the page.** One button beside Explore
  opens a dialog - no other site, no other page - that asks for the PFA order
  number and the email or mobile given with the order, and draws the answer
  from PFA's own status endpoint: six stations (order placed, confirmed,
  processing, shipped, out for delivery, delivered) with the current one lit,
  a courier line (carrier, AWB, last location, expected date) when there is
  one, and every update newest first - the store's and the courier's in one
  list. The PFA order number is the only id on screen; the seller's number is
  used server-side to ask the courier and is never shown. A cancelled, failed
  or refunded order says so plainly with the rail dimmed. The confirmation
  email can arrive with ?track=PFA-… and the dialog opens already typed.
- Courier events come from the seller's partner endpoint through a new
  server module, lib/courier-tracking.js, behind two environment variables:
  PFA_TRACKING_API_BASE and PFA_TRACKING_API_KEY. The key goes out in one
  header to one host and never reaches a browser. Until both are set the
  module is the identity and the tracker shows what the store itself knows;
  set them and the courier stations fill in with no page change. A courier
  that is slow, down or wrong costs the shopper the courier line and nothing
  else. Pinned in test/track-order.test.js, including the identity and the
  failure paths against a stubbed fetch.

Tests: 771 passing.

## v1.251

- **The GIVE ONCE row is gone.** Monthly gifts were already removed at boot -
  /api/payment/create has no recurring path, and the code rightly refused to
  offer a choice it would mis-charge - but the removal left its seg behind
  with one segment: "Give once", always pressed, answering nothing, a full
  row spent restating the default. The whole seg now waits out of sight
  instead, and the page opens straight onto the amounts. The two-button
  markup and all the monthly machinery (presets, mandate copy, the
  ?freq=monthly campaign path behind its flag) stay exactly where they were
  for the day the mandate path exists; the seg--single style, which nothing
  references any more, went with the row. Pinned in test/donate-usd.test.js.

Tests: 768 passing.

## v1.250

- **The donate page takes dollars.** A currency seg - the same component the
  feed flow already uses - now opens the give flow: rupees keep every pane,
  form and CCAvenue post exactly as they were, and dollars step in front with
  four presets ($10, $25, $50, $100), a typed amount, and one PayPal link as
  the whole gateway: paypal.me/Peopleforanimals with the amount in the path,
  opened beside the page. PayPal collects the donor's details and sends the
  receipt, so steps 02 and 03 are theirs; the fine print says so, and says
  that Section 80G belongs to rupee gifts. The brief's "10, 25, 500, 100"
  is read as a slipped zero for 50 - it sits between 25 and 100 - and is one
  number in one list if 500 was meant. Pinned in test/donate-usd.test.js:
  the handle, the path, the presets, and that the rupee flow is hidden as
  one thing, never edited.

Tests: 767 passing.

## v1.249

- **The newsroom presents its case instead of tabling it.** The hero and the
  theme stand untouched; below them, three changes in the page's own
  vocabulary. The four timeline rows carried stubs where the case's facts
  already sat one panel up - "PFA petitions four offices." - and now carry
  them in full: the declined return, the four offices, the placards by name,
  all 35 cleared under the Animal Birth Control Rules, 2023. The three
  photographs gain a figcaption assembled from their own alt text, so the
  placards read on the page and not only to a screen reader. And the page now
  ends instead of stopping: a closing band built from the .band and .actions
  components this stylesheet defined at birth and never used here, pointing
  at report.html and the Wall's share section - the two doors a newsroom
  reader is most likely to want. Every word is from this page or the pages
  the band points to; Case 001 itself remains word for word what the record
  page said. One ghost-button variant and one caption rule added to the
  page's own stylesheet.

Tests: 765 passing.

## v1.248

- **The counter's zero is a counter's zero.** The visit odometer wore the
  display face, and Marcellus carries only old-style figures - no lining or
  tabular alternates anywhere in the font (GSUB: frac and liga, nothing
  else), so the tabular-nums the rule asked for was a silent no-op. Its zero
  is an x-height ring 0.806em wide, odd and clipped in a 0.62em tile; its 3
  and 4 trail descenders below the baseline, which is why the three digits
  sat at three different heights. The wheels now wear the body face: an
  odometer is an instrument, Helvetica's digits are lining and near-tabular,
  and the 0.62em by 1.16em tile proportions fit them exactly - every digit
  the same height, none clipped, the zero a zero.
- Chasing that zero found the last FOUT straggler: chrome.css keeps its own
  --ff-display token and the v1.242 sweep covered pages only, so the
  footer's display headings could still swap onto raw Georgia. The token now
  routes through the matched fallback faces like every page stack; both
  repairs are pinned in test/fout.test.js.

Tests: 765 passing.

## v1.247

- **The leftovers are swept.** Fourteen pages still carried the dead
  .cursor-layer svg.on-dark rule from the per-page cursor era - inert since
  the class stopped being applied in v1.238, and left in place then because
  touching fourteen files to delete a rule that could not fire was judged
  more churn than it was worth. Judged the other way now, on the owner's
  ask: dead code that survives two eras stops reading as harmless and starts
  reading as load-bearing. Removed from all fourteen (product and quiz via
  their rebuilds, as their contract requires), the chrome.css comment that
  called them inert updated to say they are gone, and the lint run comes back
  clean with nothing else to sweep: no stray files, no backup droppings, no
  unused suppressions.

Tests: 764 passing.

## v1.246

- **A redelivery, so one ship forces one fresh deployment.** v1.245 was pushed
  and never appeared on Vercel; production sat on v1.244 while doctor.sh said
  plainly that the deployment was behind. Shipping an unchanged tree would hit
  the "nothing changed" path - no commit, no push, no build - so this version
  exists to be a real commit: the same code as v1.245, carrying everything
  since v1.238 (the reading cursor, the shop sidebar and the All reset, the
  settled filters, the closed flash of unstyled text, the theatre without its
  dead button, the Wall's anchor margin), pushed fresh so the GitHub hook
  fires again and Vercel builds it. The Vercel build command was run against
  this tree before packing: catalog snapshot soft-skipped as designed, minify
  wrote dist clean, exit 0.

Tests: 764 passing.

## v1.245

- **An anchor arrival on the Wall clears all three bars.** "Browse the wall"
  jumps to the long-form section, and the section arrived with its title
  halfway under the chrome: every page clears the announcement and the site
  header on an anchor jump, but the Wall alone stacks a third sticky bar on
  top - its own 50px subnav - and had no scroll margin at all. It now
  carries the same convention as cinekind, laws and get-involved, one bar
  deeper: section[id] keeps calc(var(--ann) + var(--nav) + 63px) clear, which
  covers the subnav, its rule, and breathing room. Long form, short form and
  the share section all land with their titles whole; the test pins the
  margin against the subnav's actual height so the two cannot drift apart.

Tests: 764 passing.

## v1.244

- **Picture in picture is removed from the Wall's theatre.** The owner's call,
  and the right one: the button could only ever serve the placeholder files,
  because no page may reach the video inside YouTube's or Vimeo's frame, and
  the films the wall actually exists for are embeds. So on the real films it
  was either dead (the live build, reported 31 Aug 2026) or gone (v1.243),
  and a control that is sometimes dead and sometimes missing reads as broken
  both ways. If it does not work, it does not appear. Removed whole - button,
  gate, handler, both browsers' state listeners - and the theatre's contract
  comment records why, so it does not creep back as a half-measure. The
  embeds keep allow="picture-in-picture" deliberately: the browser's own
  media menu can still float a film, and that door is the browser's, not
  this page's. The other twenty-five theatre behaviours hold, with the
  embed-honesty test updated to expect absence rather than hiding.

Tests: 762 passing.

## v1.243

- **Picture in picture is offered wherever it can exist, and gone where it cannot.**
  Reported dead on the Wall's YouTube film, and on the build then live it was:
  a visible button over a source no page is allowed to reach, since the video
  inside YouTube's frame belongs to YouTube. The tree already knew this - the
  theatre's contract says every control works for all three source kinds or
  hides itself, and the button was already gated off embeds - but two things
  are new. Safari is now asked in its own tongue (webkitSetPresentationMode,
  with its way out and its pressed state), so files get the floating window
  there too, not only in Chrome; and the contract is pinned by a test, so the
  button can never again be on screen and deaf: for embeds it is hidden, not
  disabled, because a control that cannot do the thing has no business on the
  screen. The browser's own media menu can still float an embedded film; that
  door is the browser's, not the page's.
- The other twenty-five theatre behaviours - play, seek, skip, speed, sound,
  autoplay, copy link, help, fullscreen, close, the strip, the ruler, the
  keyboard - were already held by test/wall-theatre.test.js across file,
  YouTube and Vimeo sources, and all still hold.

Tests: 763 passing.

## v1.242

- **The flash of unstyled text is closed, not narrowed.** Marcellus loads with
  font-display:swap, so a cold or hard-refreshed page paints its headings in
  the next face of the stack and swaps when the file arrives; the preload
  makes that window short, and had already done all a preload can. What made
  the window visible was where the fallback landed: plain Georgia, about 2%
  wider per line and on different vertical metrics, so the swap rewrapped
  every heading and the boxes moved with it. Two local faces now sit between
  them - Georgia and Times dressed in Marcellus's own measurements, read from
  the woff2 itself (ascent 1995, descent 573, gap 0, weighted advance 932.4,
  per 2048 em; Georgia 913, Times 832 per capsize): size-adjust 102.13% and
  the three metric overrides for Georgia, 112.07% and its own set for Times.
  The swap now exchanges glyphs in place and moves nothing, on every page and
  on the home page's five inline hero headings; Cormorant Garamond, which was
  named in every stack but never loaded, is out of the path. Android has none
  of these locals and keeps a plain serif swap, softly.
- test/fout.test.js holds the three parts together: every page that loads the
  font carries both matched faces and the preload; every stack that leads
  with Marcellus falls onto the matched face first; and the numbers belong to
  the font file actually on disk, pinned by its hash, so replacing the font
  without recomputing them fails the ship with instructions.
- product.html and quiz.html rebuilt from pfa-shop.html.

Tests: 762 passing.

## v1.241

- **A filter settles the view once, deliberately.** The browser guessed before.
  Choosing a shelf, a pet, a category, a sort or a search rewrites
  the grid wholesale, and the page changes height with the answer. Left to
  itself the browser then clamps the scroll to the shorter page, or re-anchors
  it to a card that no longer exists, and the visitor lands somewhere arbitrary
  - the site "jumping here and there". Now one movement, to the top of the
  results, and only when the visitor was scrolled past them; standing at the
  top - the common case, the controls are up there - nothing moves at all. The
  browser's own scroll anchoring is off inside the goods column, because its
  anchor dies in every wholesale repaint and card heights are all reserved, so
  it had nothing legitimate left to hold. All four filter paths settle;
  add-to-cart keeps its own rule, which is focus, not scroll.
- product.html and quiz.html rebuilt from pfa-shop.html, as their contract
  tests require.

Tests: 759 passing.

## v1.240

- **All and Everything now clear the shelf and the brand as well.** v1.239
  called the three-axes design a question about the shop rather than a bug in
  it, and the person clicking answered it: with Ticks and fleas open, All was
  pressed twice and reported broken twice, because 73 tick products is not
  "all" by any reading a visitor gives the word. The shelf and the brand have
  no home button of their own - a shelf clears only by pressing it a second
  time, a toggle nothing advertises - so the two buttons that promise
  everything are where that clearing now lives. Dogs, Cats and the named
  categories stay narrow: they name a subset and keep the shelf, as before.
  A typed search is never cleared for the visitor.

Tests: 758 passing.

## v1.239

- **The pet and category chips repaint the sidebar, not only the grid.** Reported
  as "clicking ALL is not working", and All was in fact already the pressed chip
  - the page loads on it, and the 73 items on screen were the Ticks and fleas
  shelf, not the pet. What was actually broken sat one line away: the shelf
  counts and the brand list are drawn from `filterPool()`, which is narrowed by
  exactly these two chips, and the handler called `paintGrid()` alone. So every
  number in the sidebar stayed on the pet before last: press Dogs while Ticks
  and fleas is open and it still read 73. With nothing in the sidebar moving,
  all three chips read as dead. `paintAll()` now, the same repaint the shelf
  chips already used; `paintShelves` memoises on a key holding the pet and the
  category, so it costs nothing when neither moved.
- A shelf still clears by pressing it a second time, which is the only way to
  clear it. All and Everything reset the pet and the category and deliberately
  leave the shelf alone - three axes, three controls. Whether All should mean
  all of everything is a question about the shop, not a bug in it.

Tests: 757 passing.

## v1.238

- **White on dark, black on light: the chevron reads the surface under it and re-reads it on a heartbeat.** Everywhere,
  with no page saying which is which. v1.235's sampler failed because it read
  once on mouseover: a button that inverted under a still hand left the chevron
  black on black. v1.236's
  difference blend failed because it recoloured the letters underneath as well
  as itself. Both are still pinned out. What is new is the reading. Every layer
  painted at the point is composited in order until something opaque stops the
  walk - `data-cursor` hints, the pixels of an `img`, `video` or `canvas` read
  through object-fit and object-position, gradient stops, background pictures,
  background colours through element opacity - and it is taken again every 80ms
  whether or not the pointer has moved, which is the whole difference from
  v1.235. A surface that changes under a still hand is now noticed within a
  twelfth of a second: a button inverting on hover, a drawer opening, a film
  playing, a section animating in on scroll.
- **The scrims are counted.** `elementsFromPoint` cannot see a layer that takes
  no pointer events, and this site darkens every hero photograph with exactly
  that - an absolutely positioned child at inset:0 with pointer-events:none.
  Missed, the chevron comes out black on a hero that reads black to everyone
  looking at it. Each hit's own covering children are collected alongside it.
- **The casing stays, and is what makes the switch safe to automate.** It is
  the state the reading did not choose, one thin ring of it. A reading that
  arrives a frame late, or cannot be taken at all - another origin's film, a
  YouTube embed, a canvas somebody else drew - costs a little contrast and
  never the pointer. Anything unreadable is treated as clear and the walk
  carries on beneath it, which lands on the surface the page actually put there:
  the theatre's black stage, a card's white face.
- Both strokes now come from `--cursor-ink` and `--cursor-case`, whose defaults
  in `assets/chrome.css` are the light-surface pair. A page that loads the
  stylesheet and never manages a reading keeps a legible chevron rather than
  half a switched one. Nothing else moved: no page markup was touched, so every
  page taking the shared chrome picks this up, and so does the next one
  `scripts/sync-chrome.js` stamps out.
- `test/cursor-contrast.test.js` is new and boots `assets/chrome.js` over a page
  made of rectangles rather than grepping it for the word "luminance": the
  switch itself, a surface changing under a still pointer, scrims, a photograph
  read from its own pixels, an unreadable film falling through to the stage,
  `data-cursor`, alpha compositing, and the margin at mid-grey that stops a
  grainy photograph flickering the pair. The contract test keeps the geometry
  and the absence of the blend, and now pins the heartbeat too.
- Two pages are deliberately outside this: `admin.html` never hides the native
  pointer, and `submission-collage.html` is the unlinked standalone wall with
  its own copy. Folding the wall in means either editing it or duplicating the
  reader, and duplication is the disease v1.233 cured.

Tests: 756 passing.

## v1.237

**The cursor is ink over a bone casing - the OS construction.** Two
universal answers were tried today and both are now pinned out by the
contract test. The luminance sampler guessed the surface and went stale
under hover inversions (black-on-black). The difference blend guaranteed
contrast but inverted per pixel: black glyphs punched through the chevron
as white and the cursor read as sitting underneath the text. The answer
that has worked for every operating system for forty years works here: a
3.4px ink stroke riding on a 6.4px bone casing, both following the same
jitter. On white the casing vanishes and the ink shows; on black the
casing carries it; over films, photographs and mid-greys the pair
guarantees an edge by geometry. It is painted, not blended - it sits above
text instead of x-raying it, needs no backdrop, trips on no stacking
context, and samples nothing, so nothing can go stale. mix-blend-mode is
gone from the stylesheet and the contract asserts its absence alongside
the sampler's.

Tests: 747 passing.

## v1.236

**The blend moves onto the layer, where the page is its backdrop.** v1.235
placed mix-blend-mode:difference on the svg inside .cursor-layer. The layer
is position:fixed with a z-index - a stacking context - so the svg's blend
could only see the layer's own transparent backdrop, blended against
nothing, and the chevron rendered raw white on every page: white-on-white,
shipped for one build. The blend now sits on .cursor-layer itself, whose
backdrop is the page (and, after the fullscreen rehost, the film): dark on
light, light on dark, derived by the compositor as intended. The cursor
contract test pins the blend on the layer AND pins it off the svg, so the
stacking-context trap cannot be re-entered. Root cause of the escape: this
environment has no rendering browser, and the structural checks that pass
in jsdom cannot see pixels - recorded here so the next person knows what
the tests can and cannot promise.

Tests: 747 passing.

## v1.235

**The cursor's colour is physics now, not a guess.** Every recurrence of
black-on-black had the same root: the chevron's colour was sampled - JS
read the background under the pointer and chose ink or bone - and every
sample had a stale window. A button that inverted on hover under a still
pointer (Add to cart) stayed black-on-black until the next target change;
transitions, scrolls and films each had their own version of the same gap.
The sampler is gone. The chevron is a single white stroke under
mix-blend-mode:difference: the compositor derives its colour from the
pixels beneath it, every frame - dark on light, light on dark, over
buttons mid-hover, films, photographs, gradients, with no JavaScript in
the loop and nothing to go stale. Removed with it: the luminance walk,
the on-dark class toggle, the scroll recolour pass and the drop shadows
(the blend is its own contrast). The page-local .on-dark rules and
data-cursor hints are inert and harmless where they sit.
PFA_CHROME.recolourCursor() survives for its callers as a one-frame
nudge. The cursor contract test now pins the blend and pins the
sampler's absence, so the guessing cannot creep back.

Tests: 747 passing.

## v1.234

**The choosing stands to the left.** On a wide screen the shop reads the
way a large catalogue is read: a quiet left rail of words under small-caps
tags - PET, CATEGORY, SHELVES - with the grid given the rest of the width.
The rail is the same nine chips and the same shelves, arranged rather than
added to: identical markup, identical delegated wiring, deep links and
closed-store hiding untouched. Shelf counts return in the rail only,
right-aligned in their own column, where numbers read as structure; the
narrow layout keeps them hidden, where they read as noise. The rail sits
sticky under the utility bar; searching hides the shelves and their tag
together. Below 1000px nothing changes: the stacked rows of v1.233 remain,
so a phone loses nothing. The top of the page is now: one bar, one box
(search), a rail of words, a grid. product.html and quiz.html regenerated.

Tests: 747 passing.

## v1.233

**The shop's top is recomposed, not repolished.** The sticky bar and the
taxonomy stop sharing a line. The bar now holds utilities only - search,
sort, the count - one slim row, one box, pinned on scroll. The nine aisle
chips (All/Dogs/Cats, Everything/Food/Health/Grooming/Home/Toys) move into
the page as their own line above the shelves, so the top reads in three
clear registers: utilities, then aisles (inked words, chosen one goes
black), then shelves (muted words). Choosing scrolls away with the page;
what stays pinned is only what is useful mid-scroll. No behaviour changed:
the chips keep their markup, delegated wiring, deep-link mapping (?cat=,
?brand=) and the closed-store hiding now covers the new line too.
product.html and quiz.html regenerated from the shop shell.

Tests: 747 passing.

## v1.232

**At rest, one box.** The shop's top zone is rethought around a single
rule: nothing looks like UI until it is doing something. The hairline
boxes on the at-rest defaults (All, Everything) are gone - 'nothing is
filtered' needs no badge; the defaults sit as inked words and the absence
of any black pill is the state, colour only, so the row never reflows
when a state flips. The shelf row recedes to an index line: muted words
that ink on hover, the border-on-hover box replaced by colour - boxes are
what the chosen shelf gets. At rest the only drawn rectangle under the
logo is now the search field; every filter, shelf and the sort are words
until chosen, and a choice lands solid black exactly as before.
product.html and quiz.html regenerated from the shop shell.

Tests: 747 passing.

## v1.231

**Past orders without an account.** track.html now remembers, on the
device, every number it has successfully looked up - orders, reports,
applications - and offers them back under the form as one-tap buttons:
tap a number and it fills the field, with the hand sent straight to the
contact box. Only numbers are kept, never the email or mobile: the contact
stays the key, typed each time, so a shared or borrowed device shows that
records exist but opens none of them. A failed lookup remembers nothing -
the list is only records that were really yours to see. Twelve at most,
newest first, each dated; 'Forget these' clears the device in one press.
No server changes, no account, nothing new to enumerate. Five tests pin
the whole behaviour (test/track-remembered.test.js).

Tests: 747 passing.

## v1.230

**The shop breathes under the logo.** Four quietings, no redesign. The
shelf counts are no longer printed - seven numbers in a row (73 128 26 51
93 64 470) read as noise; each count stays with its shelf, spoken by a
screen reader and shown on hover, and the bar's own 'N items' answers the
question the moment a shelf is pressed. The two at-rest defaults (All,
Everything) stop shouting: two solid black pills were the loudest things
under the logo while saying only 'nothing is filtered' - they now sit as
inked text with a hairline border, and any real selection still lands
solid black. The uppercase SORT label yields to the select, which already
announces itself ('Featured' says what it is; the label said it twice).
And a small breath opened between the filter bar and the shelves so the
two rows stop reading as one clot. product.html and quiz.html regenerated
from the shop shell.

Tests: 742 passing.

## v1.229

**The theatre plays the whole picture.** Long-form films were cover-cropped
to fill the screen: object-fit:cover on files, and bare embeds sized past
the stage on the short axis - on any screen that is not exactly 16:9, edges
of the film were cut. Native is now the default: files play with
object-fit:contain, bare embeds sit in the largest 16:9 box the stage
holds, letterboxed where the screen disagrees - nothing is ever clipped.
Fill - the old behaviour, no bars - is one press away: a Frame control
beside Sound, in Sound's own Off/On pattern, or the Z key, listed in the
keyboard help. The choice is remembered across visits (localStorage).
Short-form films are always native and offer no Fill: a vertical film
cover-cropped to a landscape screen would lose most of itself. New test:
'the frame is native by default, Fill is a remembered choice'.

Tests: 742 passing.

## v1.228

**The admin rail is seven sections, not eleven.** Nothing was removed - the
rail was folded. Donations lives inside Payments & donations; Issue cards
and Verify a card live inside Colony cards (register first, then Verify,
then Issue); the Audit log lives inside People & audit. A tab now opens a
stack of panes: each folded section keeps its own pane, its registry entry
and its module gate, so a staff account that carries Payments but not
Donations sees the payments register alone, exactly as before. Old section
names still land where they should - an internal show('donations') or a
saved habit opens Payments & donations. Folded sections stack under their
host with a hairline rule and a small uppercase heading, and announce
themselves as named regions to assistive tech. Refresh refills every pane
of the open section. The four group labels (Today, Inbox, Registers, Tools)
went with the folding: seven names need no headings. The rail contract test
now pins the seven sections, the three stacks and the fold-in map.

Tests: 741 passing.

## v1.227

**A precision alignment pass over every control on the site.** Every page's
stylesheet was extracted and diffed - same selector, same recipe - and every
row that seats an input beside a button was measured. Nothing was redesigned;
what disagreed was made to agree.

*Selects now match the inputs beside them on Get Involved.* The page carried
two .field recipes; the later (14px padding, 14px type) won for inputs and
textareas by cascade, but selects were styled only by the earlier block at
11px/13px - a shorter box next to every input. Both blocks now state the
same 14px/14px recipe, so nothing depends on cascade order.

*The caregiver-card lookup row is pinned.* The card-number input and the
Check button sat in one row with their heights left to font metrics - about
45px against 49px. Both are pinned to 50px, the button's text centred by
flex; the pair can no longer disagree by a pixel.

*The admin tools rows are pinned.* Filter inputs, selects and the ghost
buttons beside them mixed 13px and 11px type over equal padding - unequal
heights in one row. All three are pinned to 38px with centred text.

*.count agrees everywhere.* The filter-bar count had padding-left:12px on
thirteen pages and not on the shop family (pfa-shop, product, quiz,
get-involved) - the same component, one detail adrift. All pages now carry
it; product.html regenerated from the shop shell.

Also verified, no fix needed: .btn is one recipe on every page; chips,
search boxes and the shared header are single-sourced and uniform; no
hover, focus, active or disabled rule anywhere changes padding, border
width, font size or weight (the one that did - a bolding on selection -
lives only in a retired component's unlinked stylesheet); the shop's Add
button and its stepper are both 40px so the swap on add-to-cart cannot
shift the grid; theatre controls share their gap scale; the responsive
breakpoints collapse rows to single columns rather than squeezing pairs.

Tests: 741 passing.

## v1.226

**The payment hand-off can no longer trap a visitor.** The transfer page
that posts to CCAvenue fired form.submit() on every load. So the Back button
from CCAvenue's checkout - or their close button landing the visitor back
here - re-submitted instantly, and every way out of the checkout looped
straight back into it: the close button read as broken, on the caregiver
application and on every other payment. The hand-off now runs once per order
per session (sessionStorage, keyed by order id) and never on a bfcache
restore; any return shows the card at rest with the spinner stopped, a
Continue securely button to try again, and a new line - 'Cancel and go back,
no payment is taken' - that links to the page the visitor came from:
Get Involved for applications, Donate for donations and Give/Send, the
caregiver card page for card shipping and replacements. Each flow now passes
its own returnUrl. CCAvenue's own close button still cancels through their
flow when it works; the difference is that the visitor no longer depends on
it. Four new tests pin the once-only hand-off, the quiet return, the bfcache
restore and every flow's way home (test/payment-transfer-page.test.js).

Tests: 741 passing.

## v1.225

**Form fields sharing a row now share their height and their top edge.** On
Get Involved's caregiver steps, the parent grid stretches each field to its
row's height; the field's own grid then dealt that stretch into its rows and
inflated the input - City or town rendered as a giant empty box beside
Roughly how many, whose hint line made it the taller field. Two rules fix it
for every pair on the form: .field lays its rows from the top
(align-content:start), so a taller neighbour can never inflate an input; and
where the browser supports subgrid, paired fields share their label, input
and hint rows outright, so a label that wraps at mid widths, or a hint under
one box only, can never push the boxes out of line. Document fields (photo,
proof) keep their own flow: their previews grow as they load. Browsers
without subgrid get the first rule alone, which already removes the giant
box. Pinned by a new test ('fields sharing a row share their box height and
their top edge').

Tests: 737 passing.

## v1.224

**The Newsroom's first case has its photographs, and the lede loses
'this week'.** The lede now reads 'Cases, campaigns and what changed in
recent times, with a record of how each one moved' - the page is a record,
not a weekly. Case 001 carries its three photographs (img/case-001-banner,
-protest, -dog.webp, renamed from the source build's slugs to this page's
case id): the banner full-width between the panel and the rows, the protest
and the dog sharing a row beneath it at one aspect so their bottom edges
agree. The frame is founder.html's frame, rule for rule - cover-cropped,
stone while it loads - so the photographs sit in the same vocabulary as
every other photograph on the site. Alt text describes what is in each
photograph and nothing more.

Tests: 736 passing.

## v1.223

**The Newsroom carries its first case.** Case 001, Chandigarh - filed
8 August 2026, resolved - brought over from the case-record page of the
previous site build (v1.35): 35 community dogs picked up from the PEC campus
by the municipal corporation under VIP protocol before the Prime Minister's
visit, their return declined; PFA petitioned four offices; a protest at the
gates with six states present; the director cleared all 35 for return, won
under the Animal Birth Control Rules, 2023. Every word is from that source
page - nothing added, nothing invented; the images and the report link of
the old page were not carried over because they do not exist in this build.
The entry fills the leg-panel and date-rows layout the Newsroom's stylesheet
has defined since the page was built - no styles were added or changed - and
the placeholder line 'Content for this page is being prepared' has done its
job and gone.

Tests: 736 passing.

## v1.222

**The Best offers rail is parked.** One flag in pfa-shop.html
(`OFFERS_RAIL = false`) and the rail paints nothing: the section stays
hidden, the rail stays empty. Nothing was deleted - the markup, the styles,
the tile painter, the markdown math and their tests are all kept warm - so
when the offer presentation is properly planned, setting the flag to true
brings the rail back exactly as it was. The On offer shelf and the Biggest
saving sort remain live: they are grid filters, not the rail. A new test
pins the parked state ('the rail is parked behind one flag').

Tests: 736 passing.

## v1.221

**dist/ now ships compressed and mangled.** scripts/minify.js routes all
browser JavaScript - standalone files and inline <script> blocks alike -
through terser (compress, two passes, local-name mangling) instead of the
conservative whitespace pass. Function-local names become single letters;
everything on window (PFA_CHROME, PFA_THEATRE, the YouTube API callback) and
every cross-script global keeps its name, so the pages' inline scripts still
see each other. assets/chrome.js drops 60% (16.3 KB to 6.5 KB); wall.html
31%. The shipped code is now the dense form commercial sites serve - smaller
on the wire and much harder to lift and reuse - while the source under the
root stays exactly as readable as before; the conservative pass remains as
the fallback when terser is not installed, and every minified file is still
parse-checked and the built pages still boot-tested before dist/ is accepted.
terser is a devDependency only; nothing changes in what runs in production.

Tests: 735 passing; `npm run check:min` green.

## v1.220

**The Wall's theatre, run like a theatre.** Three fixes to the player, on
every mode it runs in - windowed, full screen, driven embed, plain embed.

*Never two sets of controls.* A YouTube film opened before the player API had
arrived kept YouTube's own control bar; when the API then attached to that
same frame, this page's seek bar, play button and volume came alive beside
YouTube's - two of everything, for the rest of the film. The moment the API
reports ready on a non-bare frame, the same film is reopened bare at the
second it had reached; from then on, and for every film after, one set of
controls is on the screen. (New test: 'a player API that arrives late reopens
the embed bare'.)

*The pointer exists in full screen.* The drawn cursor's layer lived in
<body>, but full screen renders only the fullscreened element - pressing F
in the theatre kept cursor:none and lost the chevron: no pointer at all.
The layer now follows the fullscreen element in and comes home on exit
(assets/chrome.js, so it holds on every page). Native video full screen is
left to the UA's own cursor.

*The pointer rests while the film has the screen.* With the chrome away and
the hand still for 2.4 seconds, the chevron fades - the way every player
hides the pointer - and the smallest movement wakes it. It never rests while
the controls are up: an invisible pointer over a visible control row is a
trap. (New test: 'over a playing film the drawn cursor rests'.)

No markup or styles were touched; the looks are exactly as they were.
Tests: 735 passing.

## v1.219

**Cursor, everywhere, without freezing.** The custom chevron is now guaranteed
never to leave a visitor cursorless or with a stuck pointer, on any page, at
any screen size.

*The native cursor is hidden only while the drawn one is live.* `chrome.css`
used to hide the system pointer unconditionally for every hovering device; a
script that failed, stalled, or was blocked left the page with no cursor at
all. The `cursor:none` rules are now gated entirely on `html.pfa-cursor`
(`html.wall-cursor` on the Wall collage), which the drawing code sets in the
same tick it creates the layer. Worst case is now the system arrow, never
nothing.

*The chevron steps aside at an iframe's edge.* Pointer events stop at a frame
boundary, so on founder.html's video embed the chevron froze in place beside
the frame's own cursor. On `pointerout` into an IFRAME (and on window `blur`)
the chevron fades; the next move in the page stands it back up.

*One style write per frame on the Wall.* submission-collage.html placed the
cursor synchronously on every pointermove while also driving the 3D tilt; a
high-rate mouse produced several times more writes than frames. Placement is
now coalesced through requestAnimationFrame, same as the shared chrome.

*Touchscreen laptops.* A finger or pen on a hover-capable device no longer
paints a chevron under the fingertip or leaves one stranded where it tapped.

*Scroll keeps the colour honest.* Scrolling slides a new surface under a
still pointer; the chevron now re-reads the background (once per frame at
most) instead of keeping yesterday's colour.

*Smaller things.* `pointercancel` releases the pressed shrink so an OS
gesture cannot leave the cursor stuck small; the jitter redraw pauses in
hidden tabs; the cursor layer moved from z-index 1000 to the maximum so no
future overlay can cover it.

Tests: full suite green (733 passing).

## v1.218 - 31 Aug 2026 · A door on the shop

- **The door is two columns: the words on the left, a cat standing on the bottom edge at the right.** `img/shop-cat.webp` is a cut-out whose subject runs off the bottom of its own frame, so the only honest place for it is the bottom edge of the screen - a negative margin cancels the door's foot padding to put it exactly there. Stopped short of the edge, a cut-out reads as a sticker hanging in mid-air. The shortcut rule now ends at the text column, so no hairline crosses the cat's chest.
- **The sentence moved under the headline and above the button**, in reading order at every width; it used to sit beside the button from 640px up. That costs a whole button's height, which a 390px-tall screen does not have, so on a short screen the headline and the paragraph both run wider and each comes out a line or two shorter. Stacked *and* short at once - a phone held sideways - is the one case with no room for the cat, and there it stands down; beside the words on a short laptop window it costs nothing and stays.
- Checked at 360×780 through 1920×1080: the cat is flush to the bottom edge at every one, nothing overlaps the words, nothing is clipped, nothing scrolls. The image was left at its original encoding - re-encoding saved 3KB of 185KB and put visible loss into the fur.

- **The catchphrase is on the door, and the shop behind it is all products.** “Buy what you already want”, the shop’s line, is now the door’s headline, with the seller framing under it. `pfa-shop.html` has no hero at all: the filter bar is the first thing under the header and the first row of the grid is on screen at rest.
- What the hero left behind is the space the fixed header needs and the page’s name inside it, carried by `.shoptop` and not shown - a screen reader and a search engine still get a heading, and a shopper gets products. The grid’s top padding came down from `calc(var(--band) * .6)` (up to 82px, sized to clear the dark block) to `clamp(20px,2.4vw,34px)`; with the bar directly above, the old figure read as a page that had not finished loading.
- `product.html` and `quiz.html` are generated from the shop, so both were rebuilt. Two tests were updated rather than worked around: the inset check now names the grid as the third band that reads the gutter token, and the spacing check now looks for `.shoptop` where it looked for the hero’s margin. A new test holds the arrangement in place - no hero section, one heading, the first band clearing the header.

- **The Shop link on the home page now opens a door rather than 1,400 products.** `shop.html` is one screen with no scroll: the section's name under the header, the proposition and an **Explore** button at the optical centre, and a rail of shortcuts along the foot that open the grid with a filter already chosen. Explore goes to `pfa-shop.html`, which is unchanged.
- **The door is the shop's own hero taken to full height** - the same `--deep` block lit by the same two radials, the same Marcellus caps, eyebrow, lede and light button - so pressing Explore reads as walking into the room the door is cut into rather than as arriving somewhere new.
- **Only the home page's Shop opens it.** From every other page, and from inside the shop and a product page, Shop still goes straight to the grid: a gate you have already walked through is an obstacle. This is a `to:` entry in the `PAGES` table in `scripts/sync-chrome.js`, which sends one nav item somewhere else from one page while the label and the order of the nav stay identical everywhere - so there is still one header, and the test that says so still passes.
- **Measured against the viewport's height, not only its width.** A headline set in `vw` alone pushed the button off a short laptop window, and on a page that must not scroll the only thing to do was then unreachable; the eyebrow was clipped on a phone held sideways. The headline is `min(6.2vw,8.4vh)`, the bands tighten under 620px tall and the shortcuts stand down. `svh`, not `vh`: with a phone's browser bars showing, `vh` put the button below the fold and the page scrolled after all. Checked at 360×780 through 1920×1080 - nothing clipped, nothing scrolls.
- The footer is stamped in from `assets/chrome-footer.html` as on every other page, so the contact details stay in step, and is not shown: a door that is one screen has nowhere to show it, and taking it out of the flow is kinder than leaving it clipped and still tabbable. It is on the page the button opens.
- The catalogue behind the door is warmed while the door is read (`prefetch` on the shop, `preconnect` to the image CDN), so the grid is already holding its answer by the time Explore is pressed.
- **No em dash anywhere a visitor can read one; a hyphen instead.** There was exactly one: the shop's own heading, written as `&mdash;`, so a search for the character would not have found it. `test/no-em-dash.test.js` now checks every page for the character and for all three entity forms, and checks the scripts that build markup in JavaScript as well, since a dash added there reaches a visitor without ever appearing in a page. Comments are exempt: this is a rule about copy, not about how notes are written.

## v1.217 — 31 Aug 2026 · Scrub-focus, and a cursor with no gaps

- **Hovering the timeline clears the screen for the film, and the drawn cursor has no gaps.** Two asks, done surgically.
- **The timeline.** With the pointer on the bar, the row of buttons, the strip, the ruler and the foot are all pushed down off the screen, the top bar and the caption step away, and the film has the whole screen with just the bar floating over it - the time chip sits under the bar on clear ground, covering nothing. Transforms only, so the bar itself never moves under the pointer and the state cannot flicker; leaving the bar brings everything back; moving from the bar onto the film clears the state silently under the hiding block. Keyboard focus into the controls brings them back at once, so Tab can never land on a control that is off the screen. The v1.216 half-way lane is superseded and removed.
- **On the way, the real reason hover-to-clear felt broken live:** opening the theatre stands focus on Close for the keyboard hand, and the chrome counted *any* focus in the bars as a reason to stay - so for a mouse hand it never stepped away at all. Focus pins the chrome only when it is a keyboard's (`:focus-visible`); a mouse hand's pointer now decides, and the keyboard hand is still covered by the moment-after-any-key rule and by focus itself.
- **The cursor.** Arriving on a page, the pointer sits still and no event comes until the hand moves; the chevron used to be absent for that moment with the system cursor already off. Its last position is kept for the tab and it is stood there at once on the next page. Reduced motion no longer falls back to the system arrow: the chevron is drawn once and held still - no jitter, no press animation. And the theatre now asks for a recolour when its dark stage opens or closes under a still pointer, so the chevron is never left ink-on-black.

## v1.216 — 31 Aug 2026 · The timeline makes room, and the film fills the screen

- **The timeline's time chip gets a lane of its own, and the film covers the screen.** Two touches, nothing else moved.
- Hovering the timeline used to float the time chip up over the caption. It now appears just below the bar, in a lane that opens under it; the row of buttons moves down into the lane and the strip gives back the same height, so the bar never shifts under the pointer and nothing falls off the bottom edge.
- A bare, API-driven YouTube embed is now cover-fitted like a file: sized past the stage on whichever axis falls short of 16:9, centred, the spill clipped. The film fills the screen in the theatre and in full screen instead of sitting letterboxed. An embed with its own controls is left exactly as it was.

## v1.215 — 31 Aug 2026 · Every fact on the theatre screen, drawn once

- **One play control, one volume, one clock, one drawing of progress.** A scan of the whole screen with the first film paused found the play state drawn twice (a big centre button and the row's button), progress drawn three times (a meter in the top bar, the seek bar, and a time riding the ruler's playhead), the running time written in four places (mid-stage, the caption, the controls row, the ruler), the wall's name twice, and the volume moved from where it looked right. Each fact now has one home:
  - *Volume* - the Sound Off/On toggle, back in the top left where it was, underlined word showing the state; M is its key and the up/down arrows trim the level. The mute button and slider are gone from the controls row.
  - *Play state* - the row's play/pause button. The big centre button is gone; the film surface itself, the space bar and K still toggle.
  - *Progress in the film* - the seek bar. The top bar's meter is gone; the ruler keeps its playhead line across the programme but no time rides it.
  - *The clock* - "current / total" in the controls row. The mid-stage Play/Pause + elapsed readout and the caption's second duration are gone; the caption is the film's number and title.
  - *The wall's name* - "· LONG / · SHORT" beside THE WALL. The "Long form" note in the stage corner is gone.
- Found by the new "drawn once" test, which counts play controls, volume controls, and how many places the elapsed time appears; and fixed on the way: a fresh visitor's volume was read as zero (Number(null) passing the 0-1 check), so the first unmute played silence.

## v1.214 — 31 Aug 2026 · One volume control, one cursor, and a theatre that clears the screen

- **One volume control, a screen that clears for the film, working full screen, one cursor.** Four things the first night in front of the rebuilt theatre showed up.
- **Volume.** The top bar's Sound toggle is gone, and a YouTube film whose API is here to drive it now opens bare (`controls=0`, `fs=0`): its own volume, captions and settings no longer sit in the corner beside this page's. What remains is the one mute button with its slider. A driven bare embed is covered by a shield, so a click on the film pauses and plays it exactly as on a file, and the pointer never enters the frame. An embed whose API script has not arrived keeps its own controls - a bare embed nobody can drive is a locked door - and the API is warmed the moment a hand moves toward a tile, so by the first open it is almost always there.
- **The clean screen.** Where the pointer is decides, with no timers: over the film - anywhere off the control surfaces - the top bar, strip, ruler and controls all step away at once and the film has the screen; brought down to the tiles and controls, or up to the clock and Close, they return. The chrome also stays while paused, while a card, menu or the help sheet is up, while a control holds focus, and for a moment after any key. On touch, one tap shows or puts away the chrome; a double tap in the middle pauses or plays; on the thirds it skips.
- **Full screen.** The theatre element is asked first, the whole document if that is refused, and on an iPhone a file's own full screen; prefixed WebKit calls are tried where the standard ones are missing, and both change events are listened to. The Permissions-Policy header now grants fullscreen by name to the page and to both embed origins.
- **The cursor.** While the hand-drawn chevron is live, the system cursor is off everywhere (`html.pfa-cursor * { cursor: none }`), set by the same code that draws the chevron: one cursor, never two, and a device without hover, a reader with reduced motion, or a failed script keeps the system cursor. Over a driven embed the shield keeps the pointer on the page, so the chevron holds there too.
- Tests grown to cover all of it: the single mute control, the pointer zones, the fullscreen fall-through, and a driven bare embed paused and played through its shield.

## v1.213 — 30 Aug 2026 · The Wall's theatre, rebuilt as a real player

- **Every control in the theatre now does what a player's control does; nothing on it is drawn for show.** The theatre had a sound toggle, a ruler and a strip, and left the rest to the keyboard: no play or pause button, no seek bar, no volume, no speed, no skip, no buffering or error state, no word at the end of a film, and a Vimeo film that could not be timed, seeked, followed or muted without being reloaded from the top. Rebuilt on one player behind the controls - a file the site plays, a YouTube embed through its API, a Vimeo embed through its API - so every control works for all three, or hides itself when a source cannot do the thing (picture-in-picture is a file's alone).
- **Controls.** Previous · play/pause · next · back and forward ten seconds · mute with a volume slider · elapsed and total time · a seek bar with the buffered part drawn, a knob, a hover time-tip and drag preview · autoplay on/off · playback speed 0.5–2× · copy a link to this moment · picture-in-picture · a keyboard sheet · full screen (with the iPhone's own full screen for a file, and double-click on the stage). The ruler, strip, clock and meter stay as they were.
- **States.** A big play button while paused; a spinner while a film loads or stalls; a card when a film cannot be loaded, with Try again and Next film; and at the end an "Up next" card that counts down five seconds and can be taken, cancelled or replaced with a replay - or, with autoplay off, an end card. The controls step away after three still seconds while the film plays and take the cursor with them; any movement, a pause, an open menu or focus on a control brings them back.
- **Remembers.** Where you got to in each film (the tile carries a progress line; the theatre resumes there and says so), the volume, and whether autoplay is on. A finished film, or one left in its last seconds, starts from the top.
- **Keyboard, the way players are driven:** Space/K play or pause; ←/→ and J/L skip ten seconds (they used to change film); Shift+←/→, P/N previous or next film; ↑/↓ volume; M mute; 0–9 jump to that tenth; < > slower or faster; F full screen; A autoplay; ? the sheet; Esc closes the sheet, the menu, full screen, or the theatre, in that order. Tab stays inside the theatre while it is open.
- **Touch.** One tap wakes the controls, a second pauses or plays, a double tap on the left or right third skips ten seconds.
- **Links.** `#theatre-long?f=3&t=95` opens film three of the long wall at 1:35, which is what Copy link writes. Changing film updates the address without leaving a history entry per film behind the Back button, which it used to.
- **Lock screen and hardware keys** (Media Session): the film's name where the phone shows what is playing, and play, pause, previous, next, seek and skip from there.
- Vimeo's player API is named in both content security policies.
- New: `test/wall-theatre.test.js` runs the page's own script in a DOM and presses every control; `test/wall-theatre-ruler.test.js` follows the player facade.

## v1.214 — 30 Aug 2026

- **The theatre's ruler is a timeline now, for a YouTube film as much as for a file.** The strip of ticks under the stage is the programme - one segment per film, in the order of the thumbnails, divided into eighths of that film's running time - but for a YouTube film nothing on it moved, because a plain embed reports nothing: no time, no duration, no end. YouTube films are now driven through YouTube's player API (`enablejsapi`, loaded on first need, and the film still plays as a plain embed if the script is blocked), so the white line moves, the elapsed time rides on it, each film's number gains its running time once the player has said what it is, pressing anywhere on the ruler goes to that moment, the play/pause and duration readouts work, the sound toggle no longer restarts the film, and the next film starts when one ends. The film added in v1.213 is named: "The brutal truth about dog cruelty in India", The House of Motions, with Maneka Gandhi. `www.youtube.com` and `s.ytimg.com` are added to `script-src` in both CSPs.

## v1.213 — 30 Aug 2026

- **A real YouTube film on The Wall, to see the theatre with one.** The long wall's first tile is now the shared YouTube film, with YouTube's own thumbnail; the theatre opens it at 1:02:33, the point the shared link carried. Films in the `WALL` list can now say `start` (seconds), and the theatre passes it to YouTube's and Vimeo's players. The entry is marked in the file as a preview to rename or remove; the title could not be read from YouTube, so it says "YouTube test film".

## v1.212 — 30 Aug 2026 · end-to-end QA of every action

- **End-to-end QA: order tracking, donation receipts, the caregiver card page and duplicate guards fixed.** Every flow was driven from the browser's request through the handler, the record, the external service and back to what the person sees, with new tests that do the same. 704 tests, 0 failing; lint clean. What was found and fixed follows.

**Store — the order number given to the shopper did not work anywhere.**
- A direct payment (Razorpay on the seller's account) ended with "your order
  number is PFA-ST-XXXXXXXX" on screen and in the email. Typing that number on
  the tracking page answered "No verified order matches", because the number
  came from `storePayments` and `/api/pfa-order-status` read only the Shopify
  mirror. The route now asks `storePayments` first, proves the email or mobile
  on the order, and answers with the same shape the page already draws.
- The admin Store register read only the mirror, so direct-pay orders - and
  above all `PLACEMENT_FAILED`, paid but never reached the seller - were
  invisible to the office. The register now merges both collections into one
  row per order (customer's real email, seller's number underneath, courier
  link), is searchable by the number the customer quotes, their email or the
  Razorpay payment id, and flags in red anything that needs a person. The
  overview counts direct-pay orders and shows "paid but not with the seller".
- The Shopify mirror ignored the `pfa_order_id` the Admin API writes on every
  order PFA places, so a direct-pay order acquired a second PFA number and the
  relay address. It now carries PFA's id, and the seller's fulfilment, tracking,
  cancellation and refund events are written beside PFA's own record. A bonus:
  an order created in Shopify whose confirmation timed out is marked placed by
  the seller's own webhook instead of waiting for the daily reconcile.
- The shop page minted a fresh idempotency key on every press, so the server's
  guard against a second Razorpay order for one basket never engaged. One key
  per basket now; the server fingerprints the payload so a changed basket gets a
  new order rather than the old one. `ALREADY_PAID` shows the confirmation
  instead of an error; a confirmation that failed polls by handle rather than
  inviting a second payment; the seller-checkout fallback handles `PREPARING`;
  `resumeOrder` runs whenever a token or handle is held (the `?paid` flag it
  waited for was never added by Shopify). The success screen and the email link
  to the tracking page.
- `storePayments` and `storePaymentHandles` named in `firestore.rules`.
- New: `test/store-order-followed.test.js`.

**Donations — the receipt the form promised was never sent.**
- The form asks for "a valid email for the receipt" and "the address your 80G
  receipt should carry"; on success nothing was emailed. A `payment_received`
  template now goes out once, on the callback that made the payment succeed
  (`applyPaymentResult` reports `firstSuccess`; `receiptSentAt` is recorded),
  time-boxed so a slow mail provider cannot hold up the page. The success page
  says where it went.
- Neither donate form sent an idempotency key, so a back-button return to the
  page and a second press made a second transaction. Both forms now send a key
  per page load and amount.
- Every server-rendered payment page showed `/media/pfa-logo.png`, which is not
  in the tree; `/img/logo.png` is.
- The shared email shell signed every message "Colony Animal Colony Caregiver
  Card", including cruelty-report acknowledgements.
- New: `test/donation-flow.test.js` drives create → CCAvenue → callback for
  success, failure, cancel, tampered amount, redelivery and the idempotency key.

**Colony Caregiver Card — the emailed link and the QR pointed at nothing.**
- `caregiver-card.html` is rebuilt. The card-issued email's "Open your card"
  button and the QR printed on the back of every card pointed at it, and it was
  not in the tree (it is named in the v1.6x changelog; it was lost in a folder
  swap). The page shows the holder's name, number, validity and where the
  printed card is, and draws a downloadable front face with the same renderer
  the office prints from - from the public record only, so no photograph,
  address or mobile can leak; the back is deliberately not drawn.
- On approval the card email was only queued for the daily 03:00 UTC worker -
  up to a day - while the case note said the holder had been emailed. It is
  sent at once now and recorded on the queue so the worker does not resend.
- Two error pages in the printed-card routes returned to pages that no longer
  exist.
- New: `test/emailed-links-resolve.test.js` checks every page the server links
  to from an email, a card or a result page against the files on disk.

**Forms.**
- A submission sent twice - a double press, or a retry after the answer was lost
  - made two records with two numbers. `pfa-forms.js` sends a key for what it
  is sending; the server keeps the reference issued under it and answers a
  replay with the same number (`submissionIdempotency`, server-only in rules).
- `field-rules.js` had no `url` rule: a `javascript:` link passed server
  validation. Only http(s) is a link now, on both sides; the admin case view
  opens http(s) values as links.
- The Wall sent which wall a video is for under the key `title`, which read in
  the panel as the film being titled "long".

**Housekeeping.**
- Thirteen scripts in `assets/` were loaded by no page and were being deployed.
  They are in `_retired-assets/` with a README saying what each was and where
  the live behaviour is.
- Build stamp v1.212 on every page.

**Not changed, for the maintainer to decide (content, not code):** the donate
"Where it should go" list offers Hospitals and Rescue, and The Wall's public
grid is the hard-coded placeholder films; both contradict the rules in
`.claude/skills/pfa-website/SKILL.md`.

## v1.211 — 30 Aug 2026

- **A member register was in the tree.** `MEMBER-REGISTER-REVIEW.csv` held real names and phone numbers at the repository root, travelling in every zip and every push. It is removed, and `.gitignore` now refuses any register or spreadsheet export. Keep the working copy on the maintainer's machine, not here.
- **`robots.txt` never shipped.** The build's `.txt` rule dropped it from `dist/`, so the `Disallow: /admin.html` line has not reached production since the minifier was introduced. It is kept explicitly now.
- **The build published repository internals.** `dist/` carried `.github/workflows/`, `.firebaserc`, `functions/` and the lint config; none of it holds a secret, but it maps the backend for anyone who looks. All of it is skipped now, along with `.yml`, `.mjs`, `.env*` and `.gitkeep` files.
- **Hardening headers on every page**, on Vercel and Firebase alike: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, a `Permissions-Policy` that grants camera and geolocation only to the site itself and payment to Razorpay, `Strict-Transport-Security` for a year, and `Cross-Origin-Opener-Policy: same-origin-allow-popups` (popups stay allowed for the payment sheet). `admin.html` gets `DENY`, `noindex` and `no-store` on top. No page is meant to be framed, so nothing changes for a visitor.
- Two admin routes (`attachment`, `staff`) set `private, max-age` and so overrode the `no-store` the admin guard had already applied. A report photo could sit in a browser cache for five minutes after sign-out. Both are `no-store` now.
- **`npm run lint`** exists. ESLint is a dev dependency with a config that knows the browser files share the `PFA` global and the server files are CommonJS. The tree is clean: three shadowed `var button` declarations in the overlay closer, dead locals in `lib/firebase.js`, `admin/people.js` and the photo editor, two unused functions (`fitWrapped`, `getAllInChunks`), and six needless regex escapes. Every inline `<script>` in every page parses.
- **`npm audit` is clean.** The only advisory was a transitive `uuid` under `firebase-admin`; an `overrides` entry pins `uuid@^11.1.1`, and `firebase-admin`, Firestore and Auth all load against it.
- **A Content-Security-Policy, report-only.** Every origin a page loads from is named: Razorpay for scripts, frames, connections and form posts; CCAvenue for the hand-off form; Shopify's CDN, Pexels and the film federation for images; YouTube, Vimeo, Facebook and Instagram for embeds; jsDelivr and Hugging Face for the background-removal model; Google's identity endpoints for the admin sign-in. `object-src` is none, `base-uri` is self. Inline scripts and styles are still allowed because twenty pages carry them and a static host cannot mint nonces; the policy still stops any script from an origin not on the list. It reports to the browser console only and blocks nothing; once a release has run with a quiet console, rename the header from `Content-Security-Policy-Report-Only` to `Content-Security-Policy` in both `vercel.json` and `firebase.json`. `test/security-headers.test.js` pins the directives.
- **The brand logo band is gone.** The strip of the seller's logos that drifted under the shop hero is removed: its markup, its styles (including the reduced-motion and phone rules), the painter, the logo trimming, the press-to-filter handler and the `brand-logos.js` include. Nothing else on the page moved: the hero now sits on the filter row with its own margin, the offer rail and the shelves are untouched, and a brand name still matches in search because it still rides on each product. The server keeps sending brand data and the logo scripts stay in `scripts/`; both are harmless and can be dropped later. `product.html` and `quiz.html` are rebuilt from the shop, as the suite requires.
- **Mangled titles from the seller are repaired.** A card read "Pet Retractable Leash â€“ Durable": the seller saved that title into Shopify already misread as Latin-1. `lib/routes/paws-catalog.js` now recognises that exact signature and decodes it back, once, on the server, for product titles, size names, collection titles and descriptions. Text that is already right, and text in any other script, is left alone; a repair that does not decode cleanly is abandoned rather than guessed at. `repairText` is exported and tested.
- **The offer rail no longer says "Marked down".** The eyebrow above the percentage is "Save", so a tile reads "Save 20% on the seller's own earlier price", and the count beneath "Best offers" reads "3 items on offer from the seller". Nothing about which products qualify has changed.
- Every page's `pfa-build` stamp is `v1.211`; eighteen pages still said `v1.99` and one `v1.204`.
- New `test/security-headers.test.js` guards all of the above: the headers, the admin cache rule, the skip list, the absence of exports in the tree, and a scan for credential shapes across the source.
- Suite is 647 tests, 647 pass. No em dashes added.

## v1.210 — 30 Aug 2026

- **Two free delivery methods is not a choice.** Over the seller's free-delivery threshold Shopify quotes Standard and Express both at nothing, and the drawer put a radio between them. It now notices when every quoted method costs the same, takes the fastest for the shopper (the one the seller calls Express, else the first they listed) and shows it as one line under "Delivery". Where the rates differ the radios return exactly as they were.
- **Logos are one set now, not thirty.** The seller's files are what they are: a small mark on a big white canvas, a JPEG with a white box behind it, a colour logo, all at different sizes. The band no longer asks them to agree. Every mark is set in ink on paper: grayscale takes the colour out, a multiply blend makes a white ground vanish into the band, and files served from `img/brands/` are trimmed to their mark through a canvas before they are drawn, so a logo that was a smudge in the middle of an 800px square now fills its box like the others. Colour returns under the pointer. On the pressed black block the same mark is inverted and screened, so it is white on black with no plate. The trim is cached per file for the session; a file that already fills its canvas, or that the canvas cannot read, is left untouched. The seller's own CDN images cannot be read for trimming (cross-origin) and are only recoloured.
- The manifest builder accepts the `.jpg` files the fetcher saves; it did not, so the seller's Drools JPEG was fetched and then ignored.
- Suite is 640 tests, 640 pass. No em dashes added.

## v1.209 — 30 Aug 2026

- **The logos were illegible.** The seller's files are small marks on large canvases, and the band drew them 28px tall, so most read as a smudge beside a number. The band is 84px tall now (64 on a phone) and a logo is fitted into a 52px by 200px box (40 by 150 on a phone). A pressed brand no longer has its logo recoloured to white, which turned a white-ground PNG into a blank square; it sits on a white plate on the black block instead.
- The README in `img/brands/` now says what a good file looks like: the mark filling the canvas, at least 400px wide.
- Suite is 637 tests, 637 pass. No em dashes added.

## v1.208 — 30 Aug 2026

- **`ship.sh` stopped on one test after `fetch:logos` had run.** The logo-manifest test wrote two temporary files and asserted the manifest was exactly those two, which was only true of an empty folder. With thirty fetched logos present it failed, and the script correctly refused to push. The test now asserts only its own entries and ignores whatever else is in the folder. No page or server code changed.
- Suite is 637 tests, 637 pass, with the folder empty and with logos in it. No em dashes added.

## v1.207 — 30 Aug 2026

- **NexGard was still on the rail at "45% off".** The seller had pasted one compare-at price, 2,600, on every size of the product: the single tablet (725), the pair (1,430) and the triple (2,175). v1.206 caught the single because 2,600 is over half off, and let the pair through at 45%. One figure across differently priced sizes is a product-level number, the largest pack's MRP, not what any one size used to cost. `wasPrice()` and the page's `offPercent()` now refuse a compare-at that also appears on a differently priced size of the same product; two sizes at the same price with the same compare-at still stand. The NexGard case is the test.
- **Logos, with the work done up to the point where a machine with internet is needed.** `img/brands/sources.txt` lists, for each of the seller's thirty brand collections, the logo image the seller shows on their own storefront for that brand. `npm run fetch:logos` downloads them into `img/brands/` on your Mac, keeps any file you placed by hand, refuses anything that is not an image, reports each failure and rebuilds `assets/brand-logos.js`. Commit the folder and ship. The images are the seller's own build assets: confirm with them that PFA may use them, and swap in the brand's press-kit file (transparent SVG or PNG) whenever you have one; the fetcher never overwrites a file that is already there.
- Brands the seller has no logo for (Intas, Wellcon, Venky's, Savavet, Vetrina, Toss and the rest of the detected set) stay as names until a file is dropped in.
- Suite is 637 tests, 637 pass, on Node 22.22. No em dashes added.

## v1.206 — 30 Aug 2026

- **The offers rail was repeating the seller's mistakes.** Live, it read "75% off" on a NexGard Spectra tablet: Shopify's compare-at price on the single tablet was the price of the three-pack (3,600 against 900), and the shop took the seller at their word. 756 of 854 products carried a compare-at price, most of them a rupee or two above the price, and a quarter of the grid wore a "−1%" tag. None of that is an offer.
- **A compare-at price now has to earn the word.** `wasPrice()` in `lib/routes/paws-catalog.js` is the one definition, mirrored in `flatten()` on the page, and a test runs both over the same cases. It counts only when the saving is between 5 and 50 percent, the old price is not a whole multiple of the new one (two times or more, within three percent: a pack price), and it is not within three percent of another size's price on the same product (that size's price, copied across). Everything else is sent as no markdown at all, so the tag, the struck price, the shelf and the rail never see it. Exactly half off is refused on purpose: on this shelf a doubled price is a pack of two far more often than a sale.
- **What this means for the live shop**: the rail will be much shorter, possibly empty on some days, and every card left on it is a price the seller lowered on that exact item. That is the deal. If the seller cleans up their compare-at prices the rail grows on its own; nothing here needs a redeploy for that.
- **Logos, from a folder PFA controls.** The seller has set a logo on one brand collection (VetPlus), which the band showed, and none on the rest. Drop a transparent `.svg`, `.png` or `.webp` into `img/brands/`, named by the collection handle (`farmina.png`, `royal-canin.svg`), and it shows on the next deploy: `scripts/build-brand-logos.js` lists the folder at build and writes `assets/brand-logos.js`, which the page reads first, then the seller's collection image, then the name. `npm run build:logos` does it locally. The README in the folder says what goes in it. Logo files are the brands' marks and are for PFA to obtain from the brands or the seller; none are shipped here.
- Suite is 636 tests, 636 pass, on Node 22.22. No em dashes added.

## v1.205 — 30 Aug 2026

- **Brands on the shop, from the seller's own collections.** A band under the hero shows the seller's brands as they keep them in Shopify: the logo where they have uploaded one to the brand collection, the name in the display face where they have not, and beside each how many listed products carry it. Press one and the grid filters to that brand, the name becomes the filled block every other pressed control on the page becomes, and the count reads "Farmina · 24 items". Press it again to clear. `?brand=<handle>` opens the shop on a brand, and an unknown handle is let go rather than emptying the grid.
- **Nothing is typed in by hand.** Shopify's `vendor` field reads "Paws & Tails" on every product, so it cannot name a brand. `lib/store-brands.js` reads the seller's collections instead: a collection is a brand when at least three listed products are titled with it ("Royal Canin ...") and it is not a line inside a brand that already qualifies ("Farmina Growth" under "Farmina"). A product belongs to a brand when Shopify lists it under that collection, fetched per brand, four at a time; a NexGard box that never says Boehringer Ingelheim on the front is still Boehringer's. Title matching is the fallback when that fetch fails, and a failure there never fails the catalogue. `PAWS_BRAND_COLLECTIONS` pins the set or turns it off; `PAWS_BRAND_ROSTER=off` skips the per-collection fetch. Both documented in `.env.example`.
- **The band moves only when it has to.** It drifts at forty pixels a second when the line is wider than the screen, holds under the pointer and under keyboard focus, stops and centres when the line fits, stops on a pressed brand and brings it into view, and does not move at all under `prefers-reduced-motion`. The seamless loop is a second copy hidden from assistive technology and from the tab order. A logo the CDN cannot serve is replaced by the name in place, so the band never shows a broken image. Safari does not centre the contents of a flex `<button>`, so each brand is a plain block centred by its line height.
- **Offers, only where the seller has marked something down.** A rail above the grid shows every product whose Shopify compare-at price is above its price, biggest saving first, twelve at most, with the product's own photograph and the same Add control as the grid. Each card leads with the saving set in the display face, and says in one line that it is below the seller's own earlier price. The first card takes the hero's black. On the grid the same product carries a `−15%` tag in the box Prescription uses (Prescription outranks it) and the old price struck beside the new; a product with sizes tags its best size and the picker strikes the price on the sizes that are marked down. An "On offer" shelf and a "Biggest saving" order join the existing controls.
- **When there are no markdowns there is no section, no shelf, no tag and no order change**, and the page is byte-for-byte what it was. The seller sets no compare-at prices today, so that is what ships: the rail appears the day they mark something down. The two things the shop will not call an offer: a compare-at equal to or below the price (Shopify leaves stale ones behind) and a saving over 85 percent, which is a data-entry slip (18000 for 1800), not a sale. Nothing else is invented, and the "per kilo" and "seller's pick" cards from the design mockup did not survive into the build; a test makes sure they cannot.
- **The list view grew two fields and no others**: `brand` on a product and `was` on a variant, sent only when it makes a markdown, so the catalogue costs the same bytes as before for a product that is not on offer. The deploy-time snapshot carries both because it is written by the same `listView()`. A snapshot from before this release still boots the page: no brands, no band. `schemaVersion` is 2.
- **Focus follows the finger on the rail as on the grid.** Add that becomes a stepper hands focus to its plus, on both. This was also the one case on the grid where focus was lost before.
- One finding left alone: `.hero` on line 142 of the shop stylesheet is a stray selector that makes the rule after it read `.hero .btn--ghost`, so the ghost buttons on the product and quiz pages have never had the ghost style. Fixing it would change three pages that were not in scope; it is noted here for the next pass.
- Twenty tests in `test/shop-brands-offers.test.js` run the real code on both sides: detection, the roster fetch with fallback and paging, the list view, `flatten()`'s markdown maths, the markup contract and the no-invention rule. Verified in Chromium against a stubbed catalogue: logos, name fallback, pressed state, rail stepper and focus, sort, search, picker prices, the closed store, the empty store, `?brand=`, reduced motion, and a phone width.
- Suite is 634 tests, 634 pass, on Node 22.22. No em dashes added.

## v1.204 — 30 Aug 2026

- **The quantity stepper sat flat beside the buttons.** It took its height from its own small label, so where a button is 16px of padding above and below its text, the stepper was a thin strip in a row of full-height controls.
- **The row decides the height now, not the stepper.** `.pd__buy` stretches its items, so the stepper is exactly as tall as a `.btn` beside it whatever padding `.btn` is later given. No height is written anywhere: a number here would drift from the padding over there, and this is the second bug in two releases caused by two places holding the same measurement.
- **It reads as the same object in a different state**, not another kind of control: same border, same weight, same tracking, same uppercase as the button it replaces.
- **The label is the count alone.** "1 in bag" needed a panel wide enough to read, which is what made it look like a different component. It is `− 1 +` now, in the footprint the Add to bag button already had, with tabular figures so the box does not shift between 9 and 10, and `aria-live` so a change is announced rather than only seen.
- **A test pins the parity**, checking the row stretches, that no height is hardcoded, and that the border, weight, tracking and case match `.btn` by reading both rules rather than by eye. Verified by putting centre alignment back and watching it caught.
- Suite is 614 tests, 614 pass, on Node 22.22 and Node 24.17. No em dashes added.

## v1.203 — 30 Aug 2026

- **Add to bag gave no sign it had worked.** The only change was the count in the far corner of the header, which nobody watching their own click will see. The button now becomes the answer: press it and it turns into the count, with a minus, a plus and a way through to the bag. This is the shop's own pattern, where a tile becomes a stepper the moment it is added, so the two pages behave alike.
- **The count is real and per variant**, because the bag is: three of the 200ml reads "3 in bag", and switching to the 100ml shows what is in the bag for that one. Out of stock shows neither a count nor a stepper whatever is in the bag.
- **Only the row repaints**, not the page, so pressing plus does not rebuild the gallery and throw away which photograph was being looked at. The handlers are delegated for the same reason everything else on that page is: `paint()` rewrites the row and a bound listener would not survive a variant change.
- **The confirmation that was supposed to exist could never appear.** `toast('Added ...')` was being called all along. The rule was written `.done .toast`, sitting in a run of `.done` rules and picking up their prefix, and `#toast` is a top-level element that is never inside an order-complete panel. So it had no position, no background and no `opacity:0`: the word "Added" was written into an unstyled div under the footer.
- **That was not only the product page.** The rule lives in `pfa-shop.html` and is copied into `product.html` and `quiz.html` by the template build, so no toast has ever been visible anywhere on the site. Fixed at source; the three pages picked it up from the one edit.
- **A test now checks all three**, that no page scopes the toast to a panel and that the element is not inside one after all. Verified by putting the prefix back and watching it caught. It also runs the real buy-row renderer over every state rather than reading the markup.
- Suite is 613 tests, 613 pass, on Node 22.22 and Node 24.17. No em dashes added.

## v1.202 — 29 Aug 2026

- **The logo alights.** As the page paints, the mark drops the last seven pixels into place and fades up over half a second, once. It is a bird; it lands rather than appearing.
- **The artwork is untouched.** `img/logo.png` is byte for byte the file it was, checked by checksum before and after. The animation moves the `<img>` around it, in `assets/chrome.css` and nowhere else, so all nineteen pages get it from the one stylesheet.
- **Nothing is left running.** No loop, no fidget. The paw tracks under Shop are this header's only continuous motion and a second one beside them would be noise rather than life.
- **It answers the pointer**, since the logo is the way home: a two pixel lift on hover and on keyboard focus, the arrival gesture reversed. Both stop under `prefers-reduced-motion`, in both directions.
- **The fill mode is the whole trick.** `backwards` holds the opening frame before the animation starts, so there is no flash of the settled mark, and it does not persist the closing frame afterwards. `both` or `forwards` would, and a persisted animated transform outranks a plain declaration, so the hover lift would have silently stopped working while everything still looked fine. A test fails on either of them, verified by trying `both`.
- The admin panel keeps its logo still. It does not load the site stylesheet, and a panel does not need a flourish.
- Suite is 611 tests, 611 pass, on Node 22.22 and Node 24.17. No em dashes added.

## v1.201 — 29 Aug 2026

- **"Read the sources" went nowhere, and the source existed.** It was `href="#"`. The paragraph beside it is about the 2014 Nagaraja judgment, and `laws.html` already carries a sourced entry for exactly that, B20, citing AWBI v. Nagaraja (2014) 7 SCC 547, Article 21, Article 51A(g) and PCA 1960 s.3. The link points at `laws.html#b20` now, which is the site's own working of the same authorities rather than a promise of one.
- **Fourteen more links went nowhere on the same page.** The twelve finding cards on the home page were `<a href="#">`: focusable, announced as links, cursor changing, and doing nothing when clicked. Nothing in the page handled them. They are `<div>` now, which is what a card that does not go anywhere should be. Styling is by class and the layout is inline, so nothing moved; verified by rendering the page and checking all twelve keep their image and their text.
- **The footer's Volunteer link was dead on every page.** It pointed at `#` from `assets/chrome-footer.html`, so nineteen pages carried it. It goes to `get-involved.html#volunteer`, which is the section that exists.
- **The link audit could not see any of this**, because it split each href on the fragment and compared only the part before it, and for `href="#"` that part is empty. It now reads the whole anchor. A bare `#` is a fault unless the page's own script assigns that element's href later, which is what `founder.html`'s theatre does, so that one is correctly left alone. Verified by pointing the sources link back at `#` and watching it get named.
- The drifted copy in `functions/product.html` got the footer fix too.
- Suite is 610 tests, 610 pass, on Node 22.22 and Node 24.17. No em dashes added.

## v1.200 — 29 Aug 2026

- **The seller's name is out of everything a browser receives.** Every page, every asset that ships, every server file that answers a request. Checked by grep across the tree rather than by memory.
- **Two of them were user-facing and wrong.** The product page carried a Brand row and a Sold by row, both filled from Shopify's vendor field. That field holds a manufacturer on some products and the shop's own name on others, so the page read "Brand: <the shop>" on a bottle made by somebody else. Both rows are gone: a field that is wrong as often as it is right is worse than an absent one, and the line above the fold already discloses an independent seller without naming one. The eyebrow above the title now names the section instead.
- **The same name was being published to Google.** `lib/routes/product-page.js` emitted JSON-LD with `brand: product.vendor || '<the shop>'`, so every product with an empty vendor field declared the shop as its brand in structured data. The brand is gone from the markup for the same reason it is gone from the page.
- **An order-status message and an admin panel blurb** named the seller to whoever read them. Both now say the seller.
- **The Razorpay sheet is the one place the name still appears to a shopper, and it must.** The Razorpay account is the seller's, not PFA's: no settlement, no chargeback liability, no GST on goods PFA does not sell. A sheet that said "People for Animals" over a form collecting into someone else's account would be a false statement at the one moment a shopper decides whether to trust it. What changed is where the name lives: the page reads `open.sellerName` from the server, the server reads `PFA_SELLER_NAME` from configuration, and nothing in the tree holds it. Unset, Razorpay shows the registered name on the account, which is correct by construction.
- **Test fixtures renamed too.** Seven test files used the real partner's name as fixture data; they use a neutral one now, which makes the same assertions and keeps a grep of the tree clean.
- **One existing test had to be re-expressed, not weakened.** It asserted the payment sheet names whose account it is, by matching the literal. It now checks the name comes from the server, that the sheet never claims to be PFA, and that the server sources it from configuration.
- **What still carries the name, on purpose:** this changelog and the other history files, because rewriting a record is worse than the record being awkward; the engineering docs, because the team needs to know who the partner is; and `_inline-extracts/`, which is a reference copy of a previous generation that no page loads.
- Suite is 610 tests, 610 pass, on Node 22.22 and Node 24.17. No em dashes added.

## v1.199 — 29 Aug 2026

- **The seller has configured the tiers.** Standard (Prepaid) at ₹59 and Express at ₹109 now both come back from Shopify, with tracking noted on each, and the drawer lists them cheapest first. Nothing in this release made that happen; it was configured at Paws & Tails, and the page picked it up with no code change, which is what v1.194 said would happen.
- **The cart bar says what it is not counting.** It read "2 items · ₹395" and stopped, which reads as the whole bill. It carries one more clause now, and only ever one.
- **That clause is the free-delivery nudge, when there is one to give.** Below the threshold it reads "₹604 more for free delivery"; at or above it, "free delivery"; and where no threshold has been set, "delivery calculated at checkout", which is true of every order and promises nothing. One line, no badge, no box, nothing that moves.
- **The same clause appears inside the drawer's Delivery row**, under the word rather than beside it, so it is read in passing by someone already looking at that line. It is the only addition to the drawer.
- **The threshold is configuration, not copy.** `PFA_FREE_DELIVERY_ABOVE` is read on the server and travels to the page with the store block the shop already loads. Nothing is written into the page; a test fails on any figure assigned there, and on any default standing in for one on the server. Unset means the shop says nothing about free delivery at all, which is the right behaviour when nobody has said there is a tier.
- **Shopify has the last word.** If a basket is over the threshold and the cheapest rate quoted is still not free, the page withdraws the claim for the rest of the session rather than repeating a promise it just watched fail. A threshold is a figure a person typed to mirror the seller's profile; when the two drift, the seller is right.
- **Two of the tests that failed were mine, and both were right in spirit.** v1.194's guard forbade the words "free delivery" anywhere in the shop, and a guard in `page-boot` forbade them alongside `FREE_SHIP` and `ROUNDUP`, from when the shop invented the offer. The shop says it again but no longer invents it, so both were narrowed to what they were actually protecting: no threshold figure in the page, and any claim traced back to the server. Neither was deleted.
- **To turn it on:** set `PFA_FREE_DELIVERY_ABOVE` in Vercel to whatever Paws & Tails have configured, and redeploy. Until then the bar reads "delivery calculated at checkout".
- Suite is 610 tests, 610 pass, on Node 22.22 and Node 24.17. No em dashes added.

## v1.198 — 29 Aug 2026

- **"India's 600 districts" was out of date by about two hundred.** It appeared twice, on Units and on Founder. Both now read "every district in India", with the count given as about 800.
- **The old figure was not invented here.** It is what People for Animals' own Set Up A PFA Unit page still says, and it was right when it was written: India had 593 districts at the 2001 census and 640 at the 2011 one. PFA's page has not been updated since. Worth telling them, since the same sentence is live on peopleforanimalsindia.org.
- **Why the new figure is hedged rather than exact.** Official sources disagree. Wikipedia counted 800 on 9 December 2025, a total that includes Mahe and Yanam, which are Census districts rather than administrative ones, and a temporary district created for the Kumbh Mela, while excluding the Itanagar Capital Complex. The government's own IGOD directory gave 784 in June 2026. The number also falls as well as rises: Rajasthan went from 50 districts to 41 in December 2024. A flat figure in a paragraph nobody rereads is how the last one got two hundred out.
- **A test keeps it hedged.** It fails if either page carries the old number, or states a district count as though it were fixed.
- Suite is 605 tests, 605 pass, on Node 22.22 and Node 24.17. No em dashes added.

## v1.197 — 29 Aug 2026

- **The same fault as v1.196, and it was not only the thumbnail.** The main product shot was cut off at the bottom too, and so was every catalogue tile holding a photograph that is not square. v1.196 fixed the one frame that had been reported and its test accepted the rest, which is the mistake.
- **Why only some pictures showed it.** These frames are `display:grid` with `place-items:center`, and the image asked for `height:100%`. A percentage height against a centred grid area does not reliably resolve; when it falls back to `auto` the picture keeps its own proportions and grows past the square frame. A square photograph fits either way, so most of a catalogue of square product shots looked correct, and a tall box of supplement was cut in half.
- **Eleven rules across five files.** `.pd__shot`, `.card__tile` and `.line__tile` in `pfa-shop.html`, `product.html`, `quiz.html`, `get-involved.html`, and the copy in `functions/product.html`, which had drifted out of reach of every check on this tree. Each image takes its height from `aspect-ratio` now, matching its frame, so `object-fit:contain` has a real box to letterbox inside.
- **Left alone, deliberately: `.shots` and `.gi__preview`.** They use `object-fit:cover` and their frames are plain blocks with pixel heights, so a percentage resolves against them normally. Cropping there is the intent, not a fault.
- **The test now walks every page that draws a frame**, not the one that was reported. An image may not size itself with a percentage height, must carry a ratio, and that ratio has to match its frame's. Verified by putting `height:100%` back on the shop's tiles and watching it name the page and the selector.
- Suite is 604 tests, 604 pass, on Node 22.22 and Node 24.17. No em dashes added.

## v1.196 — 29 Aug 2026

- **Fix: a thumbnail on the product page hung out of the bottom of its box.** The picture drew larger than the frame around it and nothing stopped it.
- **The frame is the one image box on the page that is a `<button>`.** A button wraps its contents in an anonymous box that a percentage height cannot always resolve through. `.pd__thumb img` read `height:100%`; when that fell back to `auto` the image drew at its natural 144px inside a 58px frame. `.pd__thumb` was also the only frame with no `overflow:hidden`, so there was nothing to clip what escaped.
- **Both halves fixed.** The image takes its height from `aspect-ratio:1` now, which needs nothing from the button, and the frame clips like `.pd__shot` beside it already did.
- **Why only this one broke.** `.pd__shot`, `.card__tile` and `.line__tile` all set `aspect-ratio` on the frame itself, so their heights are definite and a percentage resolves against them. `.pd__thumb` was the only frame with a pixel height and no ratio, and the only one that is a button.
- **The test checks all four frames, not the one that broke.** Each must either clip what it holds or give its image a definite height to size against, and an image with a percentage height must have a frame with a ratio behind it. Verified by putting `height:100%` back and watching it fail.
- Suite is 603 tests, 603 pass, on Node 22.22 and Node 24.17. No em dashes added.

## v1.195 — 29 Aug 2026

- **Removed the paragraph under the work cards on Units.** It explained which units the descriptions came from, which five of them have no row in the directory, and how many of the eighty carry no description at all. Gone with it: the element, the code that assembled the sentence, and `.u-work__note`, which nothing else used.
- Worth knowing what the paragraph was carrying. Five of the fourteen cards in that section are Chandigarh, Calcutta, Chennai, Pune and Delhi, which PFA names on its own pages but does not list in the directory above, so they now appear as work with no unit to ring. Dropping those five cards would make the section correspond exactly to the list; that is one word away and was not done unasked.
- Suite is 602 tests, 602 pass, on Node 22.22 and Node 24.17. No em dashes added.

## v1.194 — 29 Aug 2026

**No rate was changed, deliberately. The ₹99 is not PFA's number and this page cannot make it ₹59.**

- **Where the ₹99 came from.** `/api/pfa-shipping-rates` asks Shopify to rate that exact bag for that exact PIN and returns what it says. Shopify returned one option, Standard at ₹99, for an ₹8,390 cart to 576222. The drawer printed it because that is the only rate that came back.
- **What that tells you about the seller's shipping profile.** One rate came back, so there is no Express tier configured at Paws & Tails. ₹99 was charged on a cart of ₹8,390, so there is no free-above-₹999 tier either: if there were, Shopify would have quoted zero and the drawer would already have printed "Free", which it does today with no change.
- **Why writing ₹59, ₹99 and ₹999 into the page would break checkout rather than fix it.** `lib/routes/pfa-pay-start.js` matches the chosen delivery against the rates Shopify offers that basket and address, and refuses a code that matches nothing rather than guessing, because guessing means charging a figure nobody quoted. A tier invented in the page would be shown to a shopper and then refused at payment. Worse, a "Free" label the seller does not honour is a charity's site quoting a price the shopper is not going to be charged.
- **The page is already built for what you described.** Given two rates it shows two, cheapest first, both selectable. Given a rate of zero it prints Free rather than ₹0. Three new tests in `test/shipping-method.test.js` lift the drawer's own `shipHtml()` and prove it across all three cases, so the day the seller adds the tiers this page shows them with no code change.
- **A fourth test stops the shortcut being taken later.** It fails if a free-delivery threshold ever appears in the shop's script, and checks the server still refuses a rate Shopify did not quote.
- **Not built: the "add ₹X more for free delivery" nudge.** It needs a threshold to count against, and there is no free tier to count towards yet, so it would promise a discount that never arrives. Once the tier exists at Shopify it is a small change, and it can be made self-correcting: if a cart crosses the threshold and Shopify still charges, the page stops making the claim rather than repeating it.
- Suite is 602 tests, 602 pass, on Node 22.22 and Node 24.17. No em dashes added.

## v1.193 — 29 Aug 2026

- **The paws walk on their own now, and stopping is the interaction.** The trot ran only under the cursor, which meant anyone who never pointed at the Shop link never saw it at all: the one bit of life in the header was hidden behind the gesture least likely to happen. It runs by default. Rest the pointer on Shop and it halts, as though the animal noticed you.
- **On the shop itself they stop too**, which the product pages inherit, since they carry the same `current` marker. The animal was walking you there and you are standing in it.
- **Paused, not cancelled.** `animation-play-state:paused` rather than `animation:none`, so it halts mid-stride where it is instead of snapping back to the first frame.
- **Reduced motion had to move with it.** The old rule cancelled the animation on `:hover`, which was enough when hover was the only thing that started it. With the walk as the default, cancelling on hover alone would have left it running for exactly the people who asked it not to. It now clears the default, and sits after the rule it overrides, which is what makes it win at equal specificity.
- **The test reads the parsed stylesheet, not the text.** Three rules decide this and two of them have identical specificity, so grepping proves nothing about which one wins. It walks the CSSOM in cascade order and checks the default runs, that `current` and hover both pause, that the pause is a play-state rather than a restart, and that the reduced-motion rule comes after the default. Verified by reverting the change and watching it fail.
- One consequence worth naming: a background-position animation now runs continuously in a fixed header on every page. It repaints a 26x13 strip and browsers throttle it in background tabs, so the cost is small, but it is no longer zero when nobody is looking at it.
- Suite is 599 tests, 599 pass, on Node 22.22 and Node 24.17. No em dashes added.

## v1.192 — 29 Aug 2026

- **The paw tracks under Shop are #16b6ff.** They are an SVG data URI in a CSS background, so `currentColor` cannot reach into them and the fill is a literal that has to be changed by hand. It was `#111`.
- **They are drawn at full opacity now, which is the part that matters.** The rule sat at `opacity:.32`, which was right for a near-black fill: it read as light grey. Left alone, a `#16b6ff` fill at .32 composites against the white header to about `#b4e8ff`, so the colour would have been set correctly and still looked wrong. The tracks are now the colour they are set to.
- **The hover still has something to say.** Full opacity at rest was previously the hover state; the trot animation is untouched and remains the difference, and still stops for anyone who has asked for less movement.
- **`test/chrome-in-sync.test.js` pins it.** It decodes the data URI, checks the fill, counts the two pads and six toes, and fails if the opacity drops back. Nothing else on the site would have caught this drifting, because a colour inside an encoded background is invisible to every other check.
- Suite is 598 tests, 598 pass, on Node 22.22 and Node 24.17. No em dashes added.

## v1.191 — 29 Aug 2026

- **All eighty units now carry a phone number on the page.** Not a link to one: the number itself, as a `tel:` link that dials. Eighteen units publish a second number and both are dialable. Seventy-nine also carry an email. Nobody has to leave the page to reach a unit, and `test/units-page.test.js` fails on a single row without a number.
- **The source was the saved unit pages, parsed rather than typed.** Ninety-six pages, one per unit, read by a script that pulls the head, the email, the phone line and the shelter address out of each. Typing eighty phone numbers by hand is how a digit gets transposed and somebody rings a stranger at two in the morning.
- **Thirty-seven addresses, and forty-three units that do not publish one.** That is PFA's own data: fifty of the ninety-six pages have no Shelter Address section at all. Those rows carry the number and the email and no address, rather than an empty label or a guess. Checked by grep across the saved pages before believing it.
- **The head names were cross-checked against the saved pages**, and all eighty matched but two, both cosmetic: Hooghly's page says "Ayushi Dey (President)" and Kollam's says "Ms.Prof. C.K. Thankachy". The page keeps the shorter forms.
- **Search now reads the address and the number too**, so a pin code or a district finds the shelter that covers it: "127306" and "bhiwani" both find Charkhi Dadri.
- **Sixteen more units have pages and numbers and are not on this page.** Akola, Ambikapur, Amritsar, Port Blair, Bhandara, Dehradun II, Faridabad II, Meerut, Pune II, Ranchi, Rewari, Bhopal II, Thoubal, Vadodara II, Pathankot and Bhimnagar. They are in the saved source but absent from PFA's own `/units` index, and being left off an index is often deliberate: a unit that has gone quiet or whose number no longer answers. They are one word away from being added, with Jharkhand, Manipur and the Andamans coming with them, but adding them unasked would risk sending someone to a number PFA has stopped listing.
- Suite is 597 tests, 597 pass, on Node 22.22 and Node 24.17. No em dashes added.

## v1.190 — 29 Aug 2026

- **The headline is one colour.** "One of them is near you" was set in the accent blue while the two lines above it were white. It is one sentence across three lines, so it is one colour, and a test asserts no rule paints part of it.
- **The lede no longer describes dots.** It opened "Every dot is a unit ..." from when there was a plot behind it. There is no plot. It now reads: every unit here is run by people who live in the place it covers, with a name, a number and an address attached. A test fails on the words dot, map or plot anywhere in the hero.
- **Phone numbers and shelter addresses are on the page, no redirection.** The row shows the number as a `tel:` link that dials, with the shelter address under it.
- **This is partial, and the page says so by shape rather than by apology.** Three units are in: Ahmednagar, Jalandhar and Charkhi Dadri. The other 77 still link to their own page, and each one stops being a link the moment its numbers land in the table. A test asserts every row is one or the other, never neither.
- **Why it is partial.** `/units` carries no phone number for anybody: state, town and a name, and nothing else. The numbers are on each unit's own page, one page per unit, and each of those pages is about 4,000 tokens of navigation wrapped around six lines of contact detail. Eighty of them is roughly 320,000 tokens, which is several passes rather than one.
- **The faster route is an export.** PFA holds all eighty in a database; a CSV of unit, phone, address would take one query, be current rather than scraped, and would also cover the sixteen units that have pages but are missing from the index. Failing that, this can be ground through in batches of fifteen or so.
- Suite is 595 tests, 595 pass, on Node 22.22 and Node 24.17. No em dashes added.

## v1.189 — 29 Aug 2026

- **The plot of dots is gone.** Both of them: the one beside the hero and the one in the sidebar under "Where you are pointing", along with the projection, the west-to-east reveal and the row-to-point linking. It was meant to make the reach of the network legible and it did not; it read as scattered dots on black. The state headings carry the page now, and the list runs full width.
- **The numbering was counting something the reader cannot see.** It printed the row's index into the source array, which is the source page's own order, so a list grouped by region and state counted 6, 7, 8, then 41, then 42. It counts down the page now, 1 to 80, and a test asserts the column is exactly 1..n in reading order.
- **Every unit now has a way to reach it.** The page this was transcribed from carries no phone number for anyone: `/units` lists only the state, the town and the contact's name. The numbers are one level down, on each unit's own page, eighty separate pages. Each row links to its own, so the phone and the shelter address are one press away rather than absent. Ahmednagar, for instance, answers on 08390527060 from a page that also carries the shelter address and seven more members with mobiles.
- **The links are real ids, not guesses.** Every unit page lists all the others, so the ids came from PFA's own navigation rather than from counting. A test asserts all eighty are present, unique, and shaped like a unit URL.
- **Found while doing it: the index is missing sixteen units.** 96 unit pages exist; `/units` lists 80. Akola, Ambikapur, Amritsar, Port Blair, Bhandara, Dehradun II, Faridabad II, Meerut, Pune II, Ranchi, Rewari, Bhopal II, Thoubal, Vadodara II, Pathankot and Bhimnagar have pages but do not appear on the index. Three states are absent from this page as a result: Jharkhand, Manipur and the Andamans. They are not added here, because the index is what was transcribed and their contact names would have to come from somewhere.
- Suite is 592 tests, 592 pass, on Node 22.22 and Node 24.17. No em dashes added.

## v1.188 — 29 Aug 2026

- **The Units hero now starts where every other section hero starts.** Its top padding was tuned by eye at `clamp(48px,6vw,88px)` and its grid was centred, so the copy floated against the taller plot and the eyebrow sat lower than on Laws, Newsroom and Get Involved. That is visible the moment anyone moves between those pages.
- **The rule is copied from them rather than approximated**: the same `calc(var(--ann) + var(--nav) + 72px) var(--gutter) 64px`, the same `min-height`, the same eyebrow. `align-items:start` instead of `center`, which is what actually holds the eyebrow on its line once the column heights differ.
- **The national figures are out of the hero.** 165 units, 26 hospitals, 60 mobile units, 2.5 lakh members and the 600-district aim were sitting under a headline that says eighty, which reads as a contradiction rather than as context. The page now states what this list is and stops there.
- **`test/units-page.test.js` reads the three reference pages** and fails if the Units hero drifts from them, or if any of them moves without this one following. The check that replaced the figures test is the one that still matters: the size of this list must never be dressed up as a national total.
- Suite is 592 tests, 592 pass, on Node 22.22 and Node 24.17. No em dashes added.

## v1.187 — 29 Aug 2026

- **Units is a page now.** It said "Content for this page is being prepared" and carried a hero and nothing else. It carries the whole directory People for Animals publishes at peopleforanimalsindia.org/units: 80 units, 20 states, each with the town, the state it is filed under and the person named as its contact, transcribed as published.
- **The subject is the network, so the network is the hero.** Every unit is plotted where it actually stands, in the hero and again beside the list, and the two are one thing seen twice: touching a row lights its point in both plots and names it, pressing a point takes you to the row. That is the page's one bold move; everything around it is a list and a filter bar.
- **No outline of India is drawn, on purpose.** An approximate national border is a claim this page has no business making and would get wrong in the places where being wrong matters most. The points alone say the true thing, which is where the units are. A test asserts the plot contains circles and nothing else.
- **No photograph of a person, as asked.** The only image on the page is the wordmark in the header, and a test keeps it that way.
- **Nothing on the page is a number someone typed.** The counts in the hero caption, the region chips and the header all come from the length of the same array the list is drawn from, and the region table throws on a state it does not know rather than letting units fall silently out of every filter. The chips are checked to add up to the whole list.
- **PFA's own figures are kept apart from this list.** 165 units nationwide, 26 hospitals, 60 mobile units, 2.5 lakh members and the 600-district aim are what PFA publishes about itself; 80 is what the directory publishes with a contact attached. Presenting either as the other would be wrong, and a test holds them apart.
- **The work is PFA's words, not ours.** Nine units carry a line from PFA's own "Set Up A PFA Unit" page saying what they are known for, from Goa's bull-fighting case to Sirohi's camel camps and Ghaziabad checking cattle transport by rail. The 71 with no such line get none: inventing one would be worse than leaving it blank. Five more units are named there whose contacts the directory does not publish, and they are listed separately rather than folded in as rows nobody can ring.
- **Points arrive west to east on load**, which is the one thing about this data a static plot cannot carry. It stops entirely under `prefers-reduced-motion`, and the plots are `aria-hidden` because the list beside them is the same content as text.
- **One correction to the source.** Secunderabad is filed under "Hyderabad" there, which is a city rather than a state. It is grouped under Telangana.
- **`test/units-page.test.js`, 11 tests, run against a real DOM.** They exercise the filters, the search, the empty state and the plot geometry rather than reading the markup: Kerala below Punjab, Assam right of Rajasthan. `jsdom` is a declared devDependency rather than an optional one, so the tests cannot quietly skip.
- The dead `#toast` element went with the placeholder: nothing this page loads can raise one.
- Suite is 592 tests, 592 pass, on Node 22.22 and Node 24.17. No em dashes added.

## v1.186 — 29 Aug 2026

- **Fix: the headings changed shape half a second after the page settled.** That is the fallback being painted first and Marcellus swapping in over it. The face is self-hosted and only 14 KB, so the delay was never the download; it was when the download started.
- **Nothing asked for the file until a heading was laid out.** The face was declared in a `<style>` block and nowhere else, and a browser does not fetch a font on seeing `@font-face`: it waits until layout finds an element that needs it. That is well after the HTML has been parsed, so the first paint used the fallback and `font-display: swap` then replaced it, which is the flash.
- **Every page that declares the face now preloads it**, so the request goes out while the head is being parsed. 21 pages, including `admin.html` and `submission-collage.html`, which carry the face but no site chrome.
- **`crossorigin` is on every one of them.** A font is fetched in CORS mode even from your own origin, so a preload without it is fetched in a different mode from the font request, the file is downloaded twice, and the preload buys nothing. It is the easiest attribute to leave off and the entire point of the change.
- **Only the latin file.** `latin-ext` covers characters these pages do not use; preloading something nothing consumes is a console warning and wasted bytes on every visit.
- **The generated pages follow on their own.** `parts.fonts` in `scripts/build-product-template.js` runs from the explanatory comment to the end of the font `<style>`, so the preload sits inside the copied region and `rootify()` rewrites it: `product.html` gets `/fonts/...` because it is served from `/products/<handle>`, `quiz.html` keeps the relative form. Confirmed idempotent by rebuilding twice.
- **`test/speed.test.js` pins it**: every page declaring the face preloads it, with `as`, `type` and `crossorigin`, at a path matching the `@font-face` beside it, and never preloading `latin-ext`. Verified by removing `crossorigin` from one page and the preload from another, and watching both get caught.
- The fonts are already served `max-age=31536000, immutable`, so this only costs anything on a first visit.
- Suite is 581 tests, 581 pass, on Node 22.22 and Node 24.17. No em dashes added.

## v1.185 — 29 Aug 2026

- **Fix: the empty rectangle in the theatre's top bar, properly this time.** It is the playback meter, and it was drawn whenever the theatre was open. It fills from `video.duration`, so it sat at zero width and looked like a stray mark in three separate cases: before a film's metadata arrives, when a film's file cannot be reached at all, and on a cross-origin embed whose time cannot be read.
- **v1.184 only covered the third case, and no film on the wall is one.** That release hid the meter on the YouTube and Vimeo branch of `load()`. Every film currently on the wall is a native `<video>` pointing at Google's public sample bucket, so that branch never runs and the fix changed nothing anyone would see. Naming the one case and missing the general rule was the mistake.
- **`tick()` decides now**, in the one place that knows both the duration and whether an embed is mounted, rather than at each branch of `load()`. The meter appears when there is a duration to measure against and not otherwise. The per-branch lines are gone, so there is one rule instead of two that have to be kept in step.
- **`test/page-shell.test.js` runs the real `tick()`** over all four states - playing, not yet loaded, unreachable file, embed mounted - and checks both the visibility and that the meter genuinely tracks progress at 90s of 300s. Verified by making it always visible again and watching the test catch it.
- Worth knowing separately: all six films on the wall are placeholders on `commondatastorage.googleapis.com`, labelled "Placeholder film" and "Placeholder clip" in the page. If that bucket is slow or blocked the stage is black and there is no duration, which is the state in the screenshot. The link audit cannot see it, since it skips absolute URLs by design.
- Suite is 580 tests, 580 pass, on Node 22.22 and Node 24.17. No em dashes added.

## v1.184 — 29 Aug 2026

- **Fix: the admin Store switch and the shop header were counting different things.** The panel offered "1167 items listed" under a choice while the shop's own header said 843, on a screen that promises "the count under each choice is what a shopper would see". Both numbers were correct; neither was the same question.
- **The shop counts tiles, the server was counting variants.** v1.170 changed the grid to one tile per product, on the grounds that the same medicine in 250mg and 500mg is one thing to buy with a choice inside it rather than two listings. `shopperLines()` in `lib/routes/paws-catalog.js` was not changed with it and went on counting one line per purchasable variant, so every product with more than one size was counted more than once. The gap is the average number of sizes per product, which is why the panel read about a third high.
- **`shopperLines` is now `shopperTiles`** and counts one per product with at least one purchasable variant, which is what `flatten()` does. The exclusions are unchanged: unavailable products, unavailable variants, ids that are not Shopify ids, and zero prices are all still dropped by both.
- **The guard could not have caught this, and now can.** `test/store-count.test.js` checked that the two sides applied the same three exclusions, which they did throughout. It never checked that they counted the same unit. It now lifts the real `flatten()` out of `pfa-shop.html`, runs both it and `shopperTiles` over one catalogue built to have nine purchasable variants across four tiles, and fails unless the two answers match. Verified by making the counter count variants again and watching two tests catch it.
- Nothing about what is on sale changed: this is the number printed under the switch, not the shelf itself.
- Suite is 580 tests, 580 pass, on Node 22.22 and Node 24.17. No em dashes added.

## v1.183 — 29 Aug 2026

- **Fix: an empty rectangle sat in the theatre's top bar for the length of a film.** It is the playback meter, a 64px outline that fills as the film runs. On a YouTube or Vimeo film it never filled, because there is nothing there to fill it from.
- **The three readouts were not being treated as one thing.** The top bar reports state, duration and progress. An embed is a cross-origin iframe, so none of the three can be read from it: `tick()` takes its numbers off the `<video>` element, and on the embed path that element has had its `src` removed and is hidden. State and duration were correctly hidden for that case. The meter was only set to zero width and left on screen, which is why it read as a stray box rather than as a control.
- **Hidden and shown together now.** A real video shows all three; an embed shows none. Nothing else changed: the meter still fills normally on the films served from `media/`.
- **`test/page-shell.test.js` pins it**, checking both branches of the load and that nothing gives `.meter` its own `display`, which would defeat the `hidden` attribute the fix relies on. Verified by putting the fault back and watching the test catch it.
- Suite is 579 tests, 579 pass, on Node 22.22 and Node 24.17. No em dashes added.

## v1.182 — 29 Aug 2026

- **Fix: "India" sat alone on a line under the address.** The footer block capped its measure at `52ch`, which is about 374px at 13px, and the address is 62 characters, about 384px. Ten pixels short, so everything fitted except the last word.
- **The cap is gone rather than raised.** It was protecting against nothing: the three lines are short and centred, and there is no long-form text in the block for a measure to help. On a narrow phone the address still wraps, which is unavoidable and reads fine.
- This is a stylesheet-only change, so it lands behind the same hour that `/assets/*` is cached for. A hard reload shows it at once.
- Suite is 578 tests, 578 pass, on Node 22.22 and Node 24.17. No em dashes added.

## v1.181 — 29 Aug 2026

- **Fix: the footer ran the address, the numbers and the mailbox together into one paragraph.** It read `...New Delhi 110001, India+91 11 2081 8191 · +91 11 2081 8194gandhim@exmpls.sansad.in`, and one of the numbers broke across two lines in the middle. The email looked like it began with 8194.
- **The cause was a cache, not the stylesheet.** `vercel.json` serves `/assets/*` with `max-age=3600, stale-while-revalidate=86400` and HTML with `max-age=0`. So new markup goes live at once and the stylesheet it was written against can be up to an hour behind, or a day if it is being revalidated. v1.180's three lines were inline `<span>`s stacked by `.pfa-footer__where span{display:block}`, a rule the previously cached `chrome.css` did not have, so for that window the three lines were laid out end to end.
- **The layout no longer depends on a rule arriving.** The lines are `<div>`, block-level on their own, and stack under any stylesheet. The remaining rule sets the gap between them, so the worst a stale copy can now do is space them slightly differently.
- **The numbers hold themselves together with non-breaking spaces.** `white-space:nowrap` was in the same uncached rule, which is why `+91 11 2081 8194` split after `2081`. A number broken across two lines is not a number anyone can dial, so this is in the markup rather than the stylesheet.
- **`test/chrome-in-sync.test.js` checks the shape, not just the text.** It asserts the contact lines are block-level in the markup rather than styled into place, and compares the details with whitespace normalised so the non-breaking spaces do not have to be written into the expectations.
- Worth knowing: this can happen to any change that needs markup and CSS to land together, for up to an hour after a deploy. A version query on the stylesheet link, stamped by `sync-chrome` from the build number, would close it for good. Not done here, because it touches every page and this fix does not need it.
- Suite is 578 tests, 578 pass, on Node 22.22 and Node 24.17. No em dashes added.

## v1.180 — 29 Aug 2026

- **The footer carries the phone numbers and the email as well as the address.** +91 11 2081 8191 and +91 11 2081 8194, and gandhim@exmpls.sansad.in, taken from the same Find Us block on peopleforanimalsindia.org that the address came from in v1.178. The site had no way to reach PFA in it at all before that release.
- **The numbers dial and the address opens a mail client.** `tel:` and `mailto:` rather than plain text: a number nobody can tap is a number to be copied out by hand on the device most likely to be holding it. `scripts/build-product-template.js` rewrites relative URLs to root-absolute for `/products/<handle>`, and correctly leaves both schemes alone.
- **Still written once.** All four details live in `assets/chrome-footer.html` and nowhere else; `npm run sync:chrome` stamps them into the nineteen public pages. `test/chrome-in-sync.test.js` checks each detail is present on every page, that the two numbers and the email are real links rather than text, and that no page has grown its own copy to drift from.
- **Laid out as three lines under the wordmark**, not as a fourth footer column, for the reason given in v1.178: the three columns above are sized to their own content and centred, and a fourth pulls them off centre. The two numbers share a line because they are alternatives, not two separate things to read.
- Suite is 578 tests, 578 pass, on Node 22.22 and Node 24.17. `check:chrome`, `check:min`, the link audit, `build:product` and `build:quiz` all clean. No em dashes added.

## v1.179 — 29 Aug 2026

**The suite is green: 578 tests, 578 passing.** It was 583 tests with 16 permanent failures.

- **Fifteen of the sixteen were not failures.** They were tests describing a previous generation of the site, asking for `help.html`, `network.html`, `champion.html`, `store.html`, `assets/header-footer.css`, `assets/network.js`, `assets/data.js`, a `.desktop-nav`, a `.blue-band` call-to-action and the Wildlife Gauntlet. None of those is in this tree. A test that reads a file which no longer exists is not protecting anything, and sixteen of them standing permanently red was actively harmful: it set the ship guard's floor at sixteen, so fifteen real regressions could have landed without stopping a deploy.
- **Removed: `test/help-in-header.test.js`, `test/help-page.test.js`, `test/cta-coherence.test.js`, `test/network-claims.test.js`, `test/store-experience.test.js`**, and the one test inside `test/submissions.test.js` that read `assets/network.js`. A note stands where the last one was, naming the test that still covers the rule it protected. One of the deleted tests had been passing vacuously: `pagesWithHeader()` returned an empty list, and every check it ran was over that empty list.
- **A real bug, found by the same sweep.** The colony caregiver card printed the words **Colony Colony caregiver** on it. A blind text replacement of the old word had rewritten `'Colony caregiver'` into `'Colony Colony caregiver'` in `assets/caregiver-card.js` and `assets/card-fields.js`. The same replacement ran through the two tests that would have caught it, so they had been rewritten to assert the doubled string and were pinning the fault in place. Both files and both tests are fixed, and `test/site-integrity.test.js` reads for the doubling now.
- **That test was a casualty too.** Its guard had been turned from "no page still says the old word" into "no page may say the word it is supposed to say", which is why it failed against a site that was correct. The old word is still hunted across the whole tree by `test/caregiver-application.test.js`, which forbids writing it even in a comment, so this one checks the doubling instead.
- **`admin-cards` was asking for the one thing another test forbids.** It required `admin.html` to load `assets/patron-card-pdf.js` while `test/no-membership.test.js` exists to keep the Patron card from creeping back. The Patron renderer is out of the list; the colony caregiver card, a different thing, stays.
- **Two live faults fixed rather than tested around.** `vercel.json` rewrote `/help` to `/help.html`, a page that is not in the tree, so the URL 404d through a rewrite. And `npm run build:search` began with `node scripts/build-help.js`, which throws on the missing `assets/data.js`, so the search index could not be rebuilt at all. The rewrite is gone, `scripts/build-help.js` is gone, and `build:search` runs the indexer directly.

**The dead-link audit now runs, and passes.** Its own sanity guard read `pages > 30`; there are 21 pages, so the guard failed and the scan it protects never ran. Correcting it surfaced fourteen reports, of which three were faults in the site, two were faults in the audit and nine were the audit contradicting another test.

- **`index.html` had lost the `id="findings"` anchor.** The section is still there, headed "Things science did not expect", with its citations. `quiz.html` links to it twice, from the results screen and from the `<noscript>` block, and both landed at the top of the home page instead.
- **`wall.html` was fine and the audit could not tell.** `#theatre-long` was matched only by a `/^#theatre/` fallback, so nothing in the file named it, and the two links pointing at it read as dead. Both hashes are written out in full now; the fallback stays for a bare `#theatre`.
- **The audit was auditing an English sentence.** `founder.html` explains in a comment why a tile "cannot itself be one big `<button>`", and that phrase was being read as markup and reported as a button with no handler. Comments are blanked before the form and button scans: block comments inside `<script>` and `<style>`, HTML comments anywhere, since a commented-out control is not on the page either.
- **The audit did not strip the query from a root-absolute link.** The relative branch did; the absolute one did not, so `product.html`, which writes absolute links because it is served from `/products/<handle>`, had `/pfa-shop.html?cat=` looked up on disk under that literal name and reported as a missing page.
- **The nine cinekind files are documented, not broken.** Six honouree portraits and three ceremony videos are absent because PFA has no licence to republish the news photographs, which `media/cinekind-2025/README.md` sets out along with three ways to obtain usable ones. The page carries `onerror` handlers that drop the frame, `npm run check:media` lists what is wanted, and `test/media-present.test.js` already accepts an absent file provided the README accounts for it. The audit reported them anyway, which left two tests disagreeing about the same nine files. It now reads the same README. An undocumented missing file is still a fault, and there is a check that proves it.
- **The ship guard means something again.** `scripts/ship.sh` allowed up to 16 failures. It allows none, and `test/ship-script.test.js` follows. Nothing was papered over to get there: no test was deleted for failing, only for describing files that are not in this tree.
- Verified on Node 22.22 and Node 24.17. `npm run check:chrome`, `check:min`, `check:media`, `build:search`, `build:product` and `build:quiz` all clean. No em dashes added.

## v1.178 — 29 Aug 2026

- **The registered office is in the footer.** The site had no postal address anywhere in it, on any of the nineteen public pages. It now carries the one published on peopleforanimalsindia.org, 4-T, DCM Building, 16 Barakhamba Road, New Delhi 110001, set as a letterhead line under the wordmark.
- **Written once, in `assets/chrome-footer.html`.** `npm run sync:chrome` stamps it into every page, so a correction is one edit and a sync rather than nineteen. A test fails if any page is missing it, and a second test fails if a page ever grows its own hardcoded copy to drift from.
- **A line, not a fourth column.** The three footer columns are sized to their own content and centred, with the gap between them worked out deliberately; a fourth would have pulled them off centre. `<address>` is italic by default and the rest of the footer is not, so `.pfa-footer__where` overrides it, and there is a test for that too, because the failure is silent and only visible.
- Not added, deliberately: the phone numbers and the email in the same block on the official site. The address was what was asked for, and the published email reads like a placeholder rather than a mailbox anyone watches.
- 2 new tests in `test/chrome-in-sync.test.js`. Suite is 591 tests, 575 pass, the same 16 pre-existing failures. `assets/chrome-footer.html`, `assets/chrome.css` and the nineteen stamped pages changed. No em dashes added.

## v1.177 — 29 Aug 2026

- **The Store opens on food, then the nutraceuticals, then the pharmacy.** Products used to arrive in whatever order the seller's catalogue came back in, which is not an order anyone chose: the first screen of the shelf was a run of pharmacy items with a bag of food somewhere further down. The grid is now grouped by the seller's own category before anything else happens to it. Food first, then the nutraceuticals, then the pharmacy, then every category not named, in the order it arrived.
- **It is one stable sort where the catalogue is read, not a fourth entry in the dropdown.** `flatten()` returns the grouped array, so P is the grouped order, "Featured" still means "the order of P" and needed no new code, and every chip, shelf, search and sort composes over it exactly as before. Products inside a group keep the seller's order, so nothing moves about between repaints.
- **Each row now carries `c0`, the seller's own category, beside the chip it collapses into.** This page offers five chips and the seller keeps six categories: nutraceuticals and medicines are both Health here, so `c` could not tell them apart and could not have ordered them.
- A category the seller adds later sorts after the three that are named rather than into the middle of them, and that has a test of its own, because an unranked aisle scattering itself through the pharmacy is the way this would fail quietly.
- 6 new tests in `test/shop-catalog.test.js`, and two names in `test/shop-sort.test.js` corrected: "Featured" is the order of P, and P is no longer the seller's order. Suite is 589 tests, 573 pass, the same 16 pre-existing failures. Only `pfa-shop.html` changed; `product.html` and `quiz.html` take the shell rather than the script, so neither needed rebuilding. No em dashes added.

## v1.176 — 28 Aug 2026

- **Direct pay is on as soon as it is configured.** It used to need `PFA_STORE_DIRECT_PAY=1` on top of the credentials, which meant a correctly configured deployment still sent shoppers to the seller's checkout because one more variable had not been set, with nothing on the page saying so. That was the wrong default: the thing you have to remember is the thing you forget, and the failure was silent. Direct pay now runs whenever the Razorpay keys and the Shopify Admin token are present. `PFA_STORE_DIRECT_PAY=0` remains as a kill switch that forces the old path back without removing any keys.
- **Keys without an Admin token still fall back**, deliberately: a payment taken with nowhere to put the order is worse than an extra checkout screen.
- **`GET /api/pfa-pay-start` is a health check.** It answers which build is live, whether direct pay is on, and which variables are unset, by name. No value is ever returned, and a test asserts a key cannot leak through it.
- **`scripts/doctor.sh <site>`** asks a live site those questions and answers them in plain words: whether the deployed build matches this tree, whether the seller's checkout is still in the way, and exactly what to set. It also names the two things that make a Hobby deployment fail before it starts, because a push that Vercel refused leaves the old build serving and nothing on the page says so.

## v1.175 — 28 Aug 2026

- **The ship script stops lying about what it shipped.** Its commit message was hardcoded to `v1.106: admin panel, firebase-admin subpath fix, audit log, shared secrets retired`, so every push since March carried that line whatever was in it. The commit shown against a Vercel deployment was therefore useless for telling which build was live, which is exactly the question being asked when a deployment looks wrong. The version now comes from the build stamp in `pfa-shop.html` and the headline from the top of this file, so the message describes the tree it is pushing.
- **The ship script's own guards were stale too.** It allowed the push through on 400 passing tests when the suite is now 558, and its comment claimed 17 known failures when there are 16. It now refuses below 500 passing, refuses above 16 failing, and prints the offending tests either way.
- **`test/ship-script.test.js`** checks the script parses, that no version is typed into it, that the message it would produce names this build, that the build stamp and this file agree on the version, that nothing is pushed before the tests pass, and that no credential is ever printed.
- The closing advice at the end of a ship now names the commit to look for in Vercel, and the two things that refuse a Hobby deployment before it starts: a cron firing more than once a day, and a repository owned by a GitHub organisation.

## v1.174 — 28 Aug 2026

- **Deployment fix: the reconcile cron was set to a schedule Vercel's Hobby plan refuses.** `*/10 * * * *` fires 144 times a day; Hobby allows one. Vercel rejects this *at deploy time* rather than at runtime, and the failure is close to invisible from the outside: the push to GitHub succeeds, the commit gets a red cross with no detail, and no deployment appears in Vercel at all. That was mine, introduced in v1.173, and it would have stopped every deploy after it.
- `vercel.json` now schedules the reconciler daily, which Hobby accepts. The ten-minute cadence it actually wants moved to `.github/workflows/store-reconcile.yml`, a scheduled GitHub Action that makes one authenticated POST to the same endpoint. It needs two repository secrets, `PFA_SITE_URL` and `PFA_ADMIN_TOKEN`, and can also be run by hand after an incident. Losing the faster Vercel cadence costs nothing important: the reconciler is the third line of defence behind the browser confirmation and the Razorpay webhook, both of which are immediate.
- **`test/vercel-crons.test.js` so this cannot happen again.** It counts how often each expression in `vercel.json` fires, fails the build with a message naming the offending path and schedule, and checks the job count and that every scheduled path is actually mounted. Verified by putting the broken schedule back and watching the test catch it.

## v1.173 — 28 Aug 2026

**Off by default.** Everything below is behind `PFA_STORE_DIRECT_PAY=1`. With the switch down the shop behaves exactly as v1.172 did: the shopper is handed to the seller's Shopify checkout. Nothing here changes a deployed site until someone sets the variable.

- **The seller's checkout screen is gone from the path.** PFA's drawer already collects the address and the shipping method, so the screen that asked for them again was asking twice. The shopper now goes from the PFA bag straight to Razorpay's sheet and back to a PFA confirmation, never leaving the site.
- **PFA owns the order number.** A `PFA-ST-XXXXXXXX` id is minted before any money moves and is what the shopper sees, quotes and is emailed. It is deliberately not sequential: an id that can be guessed by adding one is an id a stranger can look up. Shopify's own order number is stored for reconciliation and never leaves the server; `publicView` omits it at every status, and a test stringifies the whole shopper-facing payload to prove it.
- **The number is withheld until the money is confirmed.** The browser is given a random 32-character handle, not the order id, and the server maps it back. An id in the page is an id in the DOM, in devtools and in a screenshot, and a shopper whose payment failed would be holding a number for an order that does not exist.
- **Charged once, placed once.** The PFA order id is the Razorpay receipt and the Shopify order tag, so before creating anything the seller's store is asked whether an order for it already exists. Each step is claimed with a lease, so the browser callback, the Razorpay webhook and a reconcile run cannot produce a second order or a second email between them. A test fires the browser and the webhook simultaneously and asserts exactly one of each.
- **Nothing the browser says about money is believed.** Item prices are asked of Shopify at the moment of payment, the delivery charge must match a rate Shopify offers that exact basket and address, and the total is computed from those. A price posted in the body is ignored; a delivery code that matches nothing is refused rather than guessed at. Razorpay is then asked what it actually captured, and for how much, before a single item is dispatched.
- **Two ways in, so an order is not lost with the browser.** The confirmation runs from the browser and again from Razorpay's webhook; either is sufficient alone. A `/api/pfa-store-reconcile` cron every ten minutes catches what both missed, re-verifying the payment before placing anything, and reports an order that has failed eight times rather than retrying it silently for ever.
- **Paid and placed are different states, on purpose.** Once Razorpay confirms the money the shopper is finished and the success screen says so, whether or not the seller's store was reachable a second later. Telling a paying customer it failed would invite a second attempt and charge them twice. An order that will not go through sits in `PLACEMENT_FAILED` for a person, never silently dropped.
- **One email, from PFA.** Sent on payment, carrying the PFA number and nothing of the seller's. Shopify's own receipt and fulfilment receipt are switched off at creation, and the order is addressed to `orders+PFA-ST-XXXXXXXX@…` rather than to the shopper: the shipping, cancellation and refund notices are store-wide templates the seller cannot disable for PFA's orders alone, so relaying them is the only way to keep their name out of the shopper's inbox that does not depend on the seller changing anything. It also hands PFA the tracking details it will need. The email no-ops cleanly and queues itself when `PFA_MAIL_API_KEY` is unset, so the payment flow can ship before the mailbox exists.
- **The fallback is kept and tested.** A switched-off gateway, a missing key or a blocked Razorpay script all hand the shopper to the seller's checkout as before. A missing credential must never leave the Store unbuyable.
- **Correction to an earlier note.** `notify: {sms, email}` is a Razorpay Payment Links parameter, not an Orders one; there is no per-order switch for Razorpay's own customer receipt. It is an account-level setting on the seller's dashboard and needs one question to them.
- New: `lib/razorpay.js`, `lib/shopify-admin.js`, `lib/store-payments.js`, `lib/store-complete.js`, `lib/store-mail.js`, `lib/routes/pfa-pay-start.js`, `lib/routes/pfa-pay-confirm.js`, `lib/routes/webhooks/razorpay.js`, `lib/routes/pfa-store-reconcile.js`. 46 new tests across `test/store-complete.test.js` and `test/store-pay-routes.test.js`, plus 84 browser checks across three harnesses. Suite is 569 tests, 553 pass, the same 16 pre-existing failures. `product.html` and `quiz.html` rebuilt from the shop shell. No em dashes added.

## v1.172 — 28 Aug 2026

- **The shipping method is chosen on PFA, not on the seller's page.** Standard and Express were the last thing still being asked for on Shopify's checkout. They are now a radio group in PFA's own drawer, between the address and the totals, and the choice is pre-selected on the cart before the shopper is handed over, so the seller's page opens with shipping already settled and Razorpay is what is left to do.
- **PFA does not price delivery, and this does not change that.** Every option and every figure shown comes from `/api/pfa-shipping-rates`, a new route that asks Shopify to rate this bag for this PIN code and returns what it says. Nothing about delivery is hardcoded in the page; `test/shipping-method.test.js` fails the build if a rate title or amount ever is. If Paws & Tails change their rates, PFA follows on its own.
- **New route `lib/routes/pfa-shipping-rates.js`.** POST only, mounted in both maps in `api/index.js`. It creates a throwaway Storefront cart to get a quote and writes nothing down: no order intent, no Firestore record, no payment. Answers are cached five minutes per bag, PIN and state, so typing a PIN digit by digit does not rate the cart six times.
- **`pfa-orders` pre-selects the choice.** `cartCreate` now also asks for `deliveryGroups`; the code the shopper picked is matched against the options that cart actually offers and applied with `cartSelectedDeliveryOptionsUpdate`. Delivery option handles are cart-specific opaque strings, so the choice travels as a stable code and the handle is resolved fresh against each cart rather than carried between them. The speed is written to the cart as a `Delivery speed` attribute for the seller and the orders/create webhook, and folded into the idempotency fingerprint, so reusing a key after changing the speed is caught the same way changing the address is.
- **Every failure falls back to what the page did yesterday.** No Storefront token, an address still being typed, a Shopify that will not answer, a code it does not offer, or a selection that errors: all of them end with an empty option list, "Calculated at checkout", and an unmodified checkout URL. Nothing about rates can stop an order being placed.
- **PFA is still not the merchant of record.** No gateway call, no Admin API token and no Admin API path was added; payment is still taken by Paws & Tails on their Shopify checkout, settling through their Razorpay. The `lib/payment.js` guard and its test are untouched, and the new tests assert all of it.
- **Bug fixed while building it.** Rates arriving while someone was still typing repainted the whole drawer and took the caret with it. The shipping block and the totals now live in their own containers (`#shipBox`, `#coTotals`) with a narrow `paintShip()` that never touches the address form.
- 18 new tests in `test/shipping-method.test.js`, plus a browser harness driving the drawer end to end. Suite is now 522 tests, 506 pass, the same 16 pre-existing failures. `product.html` and `quiz.html` rebuilt from the shop shell. No em dashes added.

## v1.171 — 28 Aug 2026

- **The shelf keeps loading.** The grid no longer stops after four pages to ask for a press. Pages arrive on their own for as long as the person scrolls, from the first twelve to the last of the 783, and the Show more button is kept only for browsers without an IntersectionObserver. The cap it replaces was not a design choice so much as a brake on a rendering problem, described below.
- **The grid adds to itself instead of being rebuilt.** `paintGrid` used to write the whole grid with one `innerHTML`, and it runs on every repaint, which includes every Add, every + and every −. Once a few hundred cards were up, one press meant re-parsing all of them and discarding every `<img>` on the page. A page arriving on scroll now appends only its twelve new cards; the cards already painted stay in the document untouched, so no photograph is ever recreated and the grid does not blink. A real rebuild is kept for a list that is genuinely different: a filter, a query, a new order, or new stock arriving from the live API, all of which restart at the first page as before.
- **A press changes one card, not all of them.** Each card carries a short signature covering what the bag holds for it, which size its stepper stands for and whether its picker is open. Only cards whose signature has moved are rewritten, and only their control, never their photograph.
- **The ranking is remembered.** `visible()` filters, ranks and sorts the whole catalogue, about 80ms with a query in the box, and it was being run again on every repaint. It is now kept until a filter, the query, the order or the catalogue itself moves. The sentinel loads at most one page per animation frame, so a short grid cannot paint several pages inside one frame.
- Measured against a 783-product catalogue in a real DOM: reaching the end of the shelf falls from 11.2 seconds and thirteen presses to 1.4 seconds and none; one Add with everything mounted falls from 279ms to 3ms, and from 256ms to 3ms with a search active; images recreated per press falls from 783 to none.
- One consequence worth naming: the footer now sits below the whole catalogue rather than below sixty cards. The header carries the same links, and a back-to-top control would be the answer if it is wanted.
- Only `pfa-shop.html` changed. Tests unchanged (488 pass, the same 16 pre-existing failures). No em dashes added.

## v1.170 — 28 Aug 2026

- **One control per card, one shape.** Every card carries a single outlined Add to cart. Once the item is in, the same outlined box becomes the − 1 + stepper: the control changes state, not shape, and never fills black, so a card with something in the cart looks like its neighbours. Buy now is gone from the grid and from the size picker; the picker is Add-only. Checkout is unchanged: Review & pay in the bar, then Continue to payment, with the saved address still making the second order one press.
- `product.html` and `quiz.html` rebuilt from the shop shell. Tests unchanged (488 pass, the same 16 pre-existing failures).

## v1.169 — 28 Aug 2026

- **Fewer at once, and the rest arrive on their own.** The grid is four across on a laptop and five on a wide screen (cards no narrower than 240px, wider gaps) instead of five and six, and it opens with twelve products rather than twenty-four. A one-pixel sentinel under the grid is watched with an IntersectionObserver: when it comes within four-tenths of a screen the next twelve are painted, up to four pages in a row; the fifth waits for a Show more press, so the footer can always be reached and a phone is never handed 839 cards it did not ask for. After the press, loading resumes on its own. Any filter, search, shelf or sort still restarts at the first page. Browsers without the observer keep the button for every page, as before.
- `product.html` and `quiz.html` rebuilt from the shop shell. Tests unchanged (488 pass, the same 16 pre-existing failures).

## v1.168 — 28 Aug 2026

- **Quieter shop.** Every page was screenshotted at 1280px and 390px and read for what was shouting. The shop was the one page that had got busy, most of it from the previous build: two boxed buttons on every card, twelve boxed filter controls in a row, a running clock in the bag bar and a delivery note repeated three times. Now: one drawn control per card (Add), with Buy now as a quiet underlined word beside it, so the two-press path is still there without doubling the boxes; filter chips, the sort and the situation shelves are words at rest and a filled block only when chosen; the hero is shorter and its eyebrow is just "PFA Shop", so the first row of goods is on screen at rest; the bag bar carries the count, the total and the button, nothing else, and the clock is gone with its code; two products across on a phone instead of one per screen.
- **Same treatment on the other filter rows.** The identical `.chip` rule sits in every page's shell; it is now the quiet form everywhere, which changes what you see on `laws.html` (the part filter). The record filter on `achievements.html` (`.rfil__b`) follows the same rule. Nothing else on the site read as cluttered against the same test, so nothing else was touched: the editorial pages are already one idea per band with air around it, and the density on `laws.html` and `achievements.html` is their content.
- `product.html` and `quiz.html` rebuilt from the shop shell. Tests unchanged (488 pass, the same 16 pre-existing failures). No em dashes added.

## v1.167 — 28 Aug 2026

- **Buy without leaving the grid.** A product with sizes or strengths used to send the shopper to its page to choose. Add or Buy now on that card now opens a size picker over the card itself (each size with its price and its own Add, or its own stepper once it is in the bag); one press picks and the card's stepper then names the size, its middle reopening the picker to change it or add another. Nothing is ever added blind, so the pharmacy rule holds. The picker overlays rather than grows the card, so the row never shifts, and stays inside the card because `content-visibility:auto` would clip anything that escaped. Escape, the close mark or a press anywhere else closes it.
- **Buy now on every card.** Adds the item if it is not in the bag and opens the drawer with focus on the one field still missing, or on Continue to payment when nothing is. Two presses from grid to the seller's checkout once details are remembered.
- **Remembered delivery details.** Name, phone, email and address are kept on the device (`localStorage`, opt-out checkbox on by default, never anything about payment) and only once they have passed the checks and the order is being placed. The next visit shows a Deliver to card with Change and Not you? Clear instead of the form; the form comes back on Change and the card returns when the drawer is closed.
- **Less to type.** PIN code moved to the top of the address beside city; six digits fill state and district from the India Post feed `pfa-location.js` already uses, and a city the person typed is never overwritten. The fields are a real form, so Enter in the last one places the order; `enterkeyhint` and proper autocomplete tokens throughout.
- **Bug fixed.** The shop indexed only the cheapest variant of each product, so a size chosen on the product page that was not the cheapest was silently deleted from the bag on returning to the grid. Every sellable variant is indexed with its own price, label and photograph.
- `product.html` and `quiz.html` rebuilt from the shop shell (`npm run build:product`, `npm run build:quiz`). Server routes untouched; `/api/pfa-orders` still re-validates everything. Test count unchanged (488 pass; the 16 failures predate this and need files not in this tree).

## v1.63 — 23 Aug 2026

- **Store page updated** from the maintainer's new build: category chip rail, sort control, active-filter chips, quantity steppers on cards, skeleton loading, free-shipping progress in the bag, recently-viewed rail, deal badges. The page was supplied inside a bundler wrapper and unpacked; font preloads restored; the stale `services.html` footer link removed; this week's header and footer kept.
- The "2 clicks from seen to bought" point and "One page. Two clicks. Done." line are removed. The subhead now reads "Everything the store sells, on one page."

## v1.62 — 23 Aug 2026

- Home gate: the "Animal in trouble?" link under Enter PFA is removed (PFA's request). The header Help control remains on every page; the once-per-session behaviour stays.

## v1.61 — 23 Aug 2026

- **Services removed.** PFA offers no services to request. `services.html` (veterinary appointment, vaccination, sterilisation, rescue transport, consultation) is deleted, with its footer link on every page, the "Request a service" button on the contact page, the search entry, and the `PFA-SV` submission kind on the server. `test/no-services.test.js` fails the build if a services page, a link to one, or an offer to "request a service" reappears.

## v1.60 — 23 Aug 2026

- **Overclaims removed, site-wide.** PFA has confirmed it does not run hospitals, ambulances, rescue teams, shelters or "units". The site said it did in roughly forty places, most of them older than this week: the home gate and hero ("Hospitals, rescue teams … across India"), the field-board stats ("40+ Units / 160+ Units / 5 Lakh+ Members"), the footer ("India's largest and oldest animal welfare organisation", "rescue and care across India"), `network.html` ("hospitals, shelters, ambulances and rescue teams"), the founder page ("grew into hospitals, shelters, ambulances and units", "one line, and somebody picks it up"), CSR ("PFA teams answer the call", "every rescue our teams run … thousands of them"), Get Involved ("the response team", "Rescue runs"), Give ("supports hospitals"), the search index and category labels, and `help.html` itself ("every number … answered by the person named beside it").
- **What the directory is now called.** The 96 entries in `data.js` are *PFA contacts* / *local contacts*: a named person and a number. Cards say **Address listed** or **Phone only**; the former "Hospital or centre" label is gone, since an address in the directory is whatever the contact gave (a home, an office, or a shelter or clinic they work with), not a PFA facility. `hospital.html` keeps its filename (linked everywhere) but reads "PFA contact" throughout.
- `help.html` now opens "Call a vet first. Then a PFA contact near you." and says plainly that PFA is not an emergency service and contacts are not always reachable. The report section says it is a record, not a way to summon help. Header pill stays "Help"; the menu item and gate link read "Help & contacts".
- Stats replaced with numbers the data supports: 96 local contacts, 23 states. The "5 lakh+ members" figure was removed because nothing on the site backs it; reinstate it only with a source.
- `test/network-claims.test.js` now fails if `network.html` says PFA has hospitals, ambulances, rescue teams, rescue centres or shelters.
- Left as written, for PFA to decide: the founder-page trustee bio ("founder of its Uttarakhand unit"); contact addresses in `data.js` that name a hospital or shelter; story text in `data.js`; CSR campaign pitches ("Living Together", "The Rescue Line") which describe what funding would pay for. The `services.html` request form still offers "rescue transport" and "veterinary appointment" as things to request; if PFA cannot fulfil those, that page needs a decision too.

## v1.59 — 23 Aug 2026

- **The emergency path.** A new page, `help.html` (also served at `/help`), is the front door for someone with an injured animal in front of them. Every one of the 96 units is written into the HTML at build time as a `tel:` link, grouped by state in native `<details>`, with a Directions link wherever there is a street address. The three things not to do and the one thing to do, from the emergency guide, sit above the list. A report form posts to `/api/pfa-submissions` as a plain form. **None of it needs JavaScript**, and the page does not load `data.js`, the search index or the location library.
- With script, `assets/help.js` lifts the four nearest units into a panel at the top (auto-runs if location was already allowed), filters the list as you type, and sends the report with photos shrunk on the phone and the reference shown in place.
- `/api/pfa-submissions` accepts `application/x-www-form-urlencoded` and answers a form post with a self-contained HTML page carrying the reference number. JSON behaviour is unchanged.
- **Help is in the header on every page, at every width.** A red `Help` control appears in the header exactly where the desktop nav hands over to the menu button (≤1100px), as a plain link; the desktop `help` chip takes the same red (the existing `--danger` token). The mobile menu opens with "Animal in trouble? Get help". The old nav anchor `network.html#helpdesk` is gone from the header; the desk itself (questions, follow-ups) stays on `network.html` and `help.html` hands on to it.
- **Home gate.** The entrance card now carries "Animal in trouble? Get help now" so the emergency exit does not require dismissing the welcome, and the gate is shown once per session (`sessionStorage`). Fixing this surfaced that a later `display:grid !important` on `.opening` had also been defeating the `.no-js` rule; both now win.
- Build: `npm run build:help` regenerates the unit list from `data.js`; `npm run build:search` runs it first. `test/help-page.test.js` fails the build if `help.html` and `data.js` disagree, and covers the no-JS form post. `test/help-in-header.test.js` now pins the new front door.
- Data note surfaced by the build: Faridabad and Faridabad II share a phone number (7689044463).

## v1.46 — 22 Aug 2026

- **Admin sign-in reworked to not need the Firebase JS SDK.** It now calls Google's Identity Toolkit REST API directly (`accounts:signInWithPassword` + token refresh), so the page no longer depends on an ES-module import from `www.gstatic.com` — the failure mode that left the button inert. Same accounts, same ID tokens; the server still verifies them with the admin SDK and requires the `admin` claim. Session lives in `sessionStorage` (survives reload, gone when the tab closes).
- Status messages are always visible (they were being hidden by the site-wide `.error{display:none}` form rule) and name the real reason: provider disabled, unknown user, wrong password, disabled account, rate limited, network blocked.
- Enter submits the form.

## v1.45 — 22 Aug 2026

- **Admin sign-in fixed.** Status messages were rendered invisible by the site-wide `.error{display:none}` form rule, so the page appeared dead on any failure. Messages now always show; real Firebase error reasons are displayed (not enabled / domain not authorised / no such user / wrong password); Enter submits; SDK load failures are reported on the page.
- `ARCHITECTURE.md`: system diagram, money flows, data model, trust boundaries and the control at each, availability/degradation, known gaps, secrets inventory.
- **Admin: Store orders register.** `/api/admin/records?type=store` reads the `storeOrders` mirror (newest first, cursor paging, search by `PFA-ST-<n>` or Shopify id). The Store tab in `admin.html` lists each order with customer, items, total, status, courier tracking and a link to the order in Shopify. Overview shows store-order counts.
- Handbook §2b: go-live dependency matrix — public site vs admin portal, Firestore rules, admin sign-in steps.

## v1.44 — 22 Aug 2026

- **Performance pass.** 18 more heavy images converted to WebP (−5 MB across the site; `campaign-*`, `maneka-gandhi`, `home-hero` …), all below-fold images lazy-loaded on every page, text fonts preloaded and `font-display:swap` everywhere, `preconnect` to the Shopify image CDN, long-lived cache headers in `vercel.json` (fonts and hashed images immutable; media 1 day; assets 1 hour with stale-while-revalidate; HTML edge-cached 5 min). Store grid fetches `/api/paws-catalog?view=list` — 159 KB gzipped instead of 463 KB; product pages keep the full data.

## v1.43 — 22 Aug 2026

- **PFA confirmation without the webhook secret.** While the store page polls after payment, `/api/pfa-order-status` now also queries Shopify's Admin API (`read_orders`, needs `PFA_SHOPIFY_ADMIN_TOKEN`) for a recent order carrying the `PFA checkout reference`, persists it through the same path as a webhook, and returns it. The shopper sees "Order placed — PFA-ST-<n>" on the PFA page within seconds of paying. Webhooks stay the primary path once registered.
- The seller's payment popup is closed automatically and the PFA tab brought forward when the order is confirmed, so the shopper lands on PFA's confirmation, not the seller's thank-you page.

## v1.42 — 22 Aug 2026

- **Page weight cut by ~95%.** `index.html` 4.1 MB → 57 KB (19 base64 JPEGs extracted to `media/home/*.webp`, lazy-loaded, 1.4 MB total, browser-cacheable). `store.html` 2.1 MB → 119 KB (the embedded 913-product snapshot replaced by a 24-product first-paint preview; the live catalogue loads as before). The 470 KB product search index is no longer loaded on every page — it is fetched the first time someone opens search.

## v1.41 — 22 Aug 2026

- **Checkout works without a Storefront token.** If `PFA_SHOPIFY_STOREFRONT_ACCESS_TOKEN` is absent, `/api/pfa-orders` hands the shopper to Shopify via a cart permalink (`/cart/<variant>:<qty>?attributes[PFA checkout reference]=…`). Address is typed on Shopify's page but order matching for webhooks still works. With the token present, the address-prefilled Storefront cart is used as before. Response reports `checkoutMode` and `addressPrefilled`.

## v1.40 — 22 Aug 2026

- Checkout shows the API's real error message (e.g. "Seller checkout setup is incomplete…") instead of a generic one.
- Location lookup trims "district" from district names.
- `VENDOR-EMAIL.md`: the exact request to Paws & Tails for the Storefront token, Headless publishing, webhook registration + secret, token rotation.
- Handbook: working folder is `~/PFA_Full_Website`; deploy by `git push` only; rollback recovery; patches instead of zips.

## v1.39 — 22 Aug 2026

- **Fix: "Fill PIN, city and state from my location" always failed** in checkout because it called `/api/location-lookup`, which did not exist. Added `lib/routes/location-lookup.js` (BigDataCloud → OpenStreetMap → India Post fallback, India only).
- **Store checkout enabled.** `store.html` gated live orders behind `window.PFA_COMMERCE.liveOrders`, which nothing ever set, so "Pay securely" always stopped with "not connected in this build". New `assets/commerce-config.js` turns it on; set `liveOrders:false` to pause the store.

## v1.38 — 22 Aug 2026

- **Real product pages: `/products/<handle>`.** Until now a product only existed as a quick-view modal with no URL, so site search, shared links, bookmarks and Google all dead-ended at a 404. Each product now has a server-rendered page (same single Vercel function: `lib/routes/product-page.js` + `product.html` template) with proper title/description, Open Graph image and price for WhatsApp previews, JSON-LD for Google, gallery, variant pills, stock, quantity, Add to bag / Buy now (shared bag with the store), prescription notice, a mono "product label" panel, description and related products. Search index (913 entries) now links there; store card titles and the quick-view modal link to it; `store.html?bag=1` / `?checkout=1` / `?category=` let the page hand back to the store.
- **Fix: 404 page rendered unstyled** under nested paths — asset and nav paths are now absolute.

## v1.37 — 22 Aug 2026

- **Single Vercel function.** All 23 API handlers moved to `lib/routes/`; `api/index.js` routes every `/api/*` request via a rewrite in `vercel.json`. Fits Vercel Hobby's 12-function limit. Public URLs unchanged.
- **Shopify order webhooks** (`/api/webhooks/*`): HMAC-verified receiver for orders/create, orders/paid, orders/fulfilled, fulfillments/update, orders/cancelled, refunds/create. Orders mirrored to Firestore `storeOrders`, matched to the shopper via the `PFA checkout reference` cart attribute.
- **Live order status.** `/api/pfa-order-status` now reads real data (`?token=` for the store page, `?id=PFA-ST-…` for tracking). `track-order.html` reads the API instead of localStorage.
- **Catalogue Admin API mode** (optional, `PFA_SHOPIFY_ADMIN_TOKEN`): cursor pagination, stock levels.
- Cron reduced to daily (Hobby limit). Email worker can be triggered manually.
- New: `HANDBOOK.md` (operations, lessons, runbooks), `.claude/skills/pfa-website/SKILL.md`, 13 webhook tests (116 total).

# PFA Website Changelog

Every release gets: a version, a date, what changed, and why.
Zip naming convention: `PFA_Full_Website_v<version>_<YYYY-MM-DD>.zip`

---

## v1.35 - 2026-08-22

- **Patron card type sized for a real card.** On the printed 85.6 mm card the name is now about 12 pt, the member number 8 pt, dates and address 6.5 pt, labels and footer 4 pt. Preview and PDF share the renderer, so both changed together.

## v1.34 - 2026-08-22

- **Patron card: one renderer for screen and print.** The sample PDF looked nothing like the preview because the preview was HTML/CSS and the PDF was a separate canvas drawing. `assets/patron-card-pdf.js` is now the only design: it paints the live preview on membership.html and member.html (a canvas in each face, repainted whenever the card's data changes) and the PDF and PNG are the same functions at 600 dpi, generated from the live card element itself. What is rendered is what prints, by construction. The existing markup and scripts are untouched; the canvas reads name, number, dates, photograph and address lines from the `data-patron-*` elements they already update. PDF pages are painted edge to edge for the print vendor.

## v1.33 - 2026-08-22

- **Colony caregiver card photograph no longer clipped.** The card drew the photo into a landscape band (4:3 wide), so every passport-shaped portrait was scaled to the band's width and lost the top of the head. The well is now portrait 3:4 (252 x 336 on the 340 x 540 artwork), centred: the shape a passport photo already is, so it fits without cutting. The editor takes its frame ratio from the card renderer (`PFACaregiverCard.PHOTO_ASPECT`) so the two cannot drift apart again, and when a photo is taller than the frame the crop starts near the top, where the head is.

## v1.32 - 2026-08-22

- **Photograph: one control, not two.** On the caregiver and Patron forms the empty photo frame is the upload button ("Tap to add a photograph"); the separate "Choose a photograph" box is gone. Once a photograph is in, a "Change photograph" button sits under the frame. Keyboard-operable.
- **Sample Patron card (testing only, remove before launch).** The membership form has a "Download a sample card PDF" button in a marked box: builds the Patron card PDF on the device with no member number, no payment, nothing saved. Remove by deleting `assets/patron-dummy.js` and the DUMMY-GEN block and script tag in `membership.html`.
- **Patron PDF works from disk.** The emblem is embedded in `patron-card-pdf.js` so a file:// page no longer taints the canvas; the number line is omitted when a card has no number. `membership.html` referenced a missing `media/pfa-card-mark.png`; it now uses the emblem.

## v1.31 - 2026-08-22

Each delivered zip from here on carries its own version number; this release consolidates everything delivered today after v1.30 (header, PDFs, address journey, visible submit errors, dummy card generation).

## v1.30 - 2026-08-22

Platform-wide data-entry and quality-control pass.

- **Cards as PDF.** Both the Colony Caregiver card and the Patron card now download as a print-ready PDF: two pages at true card size (54 × 85.6 mm portrait and 85.6 × 54 mm landscape), 600 dpi. The caregiver issued screen gains a Download PDF button beside the PNG; the member page's old text-file download is replaced by Download card PDF and Download PNG. New `assets/patron-card-pdf.js` draws the Patron card on canvas and shares the PDF writer in `caregiver-card.js`.
- **Home page quote.** "When the heart opens, / it opens for all." now sits on exactly two lines at every width, the second line in PFA blue. The size is driven by the column width (`cqw`) so neither line can wrap.
- **Address journey (every form: caregiver, Patron, replacement card, Give, store checkout).** The address fields are always visible, in postal order: house and street, then PIN, district and state on one row. The location button is now a helper beneath them ("Fill PIN, district and state from my location"), the separate "Enter address manually" button is gone, and typing a PIN still fills district and state. Detected values show a "Not right? Change it" link that unlocks the fields, so nobody is stuck with a wrong district. Every status message on the site now says what to do next in plain words ("Type the PIN code and we fill district and state"); the words "manually", "locked" and "mode" no longer appear anywhere a person reads.
- **Card submission failures were silent.** The global `.error{display:none}` rule (for field messages) also hid the status line under "Issue my card", so any failure looked like nothing happened. The status line is now always visible when it carries an error, scrolls into view, and says exactly what went wrong: a page opened as a file (`file://`) cannot reach the PFA server; a static host without the API says so; incomplete details name the problem and jump to the first bad field. Same for the replacement-card form.
- **DUMMY CARD GENERATION (testing only, remove before launch).** The caregiver form has a clearly marked "Generate a sample card on this device" button that issues the card with no server and no Firebase: no card number, no signature, placeholder QR, nothing stored, printing disabled. The PDF and PNG downloads work on it. To remove: delete `assets/caregiver-dummy.js` and the `<!-- DUMMY-GEN -->` block plus script tag in `caregiver.html`; nothing else references them. The card renderer now also omits the "ID ·" line when a card has no number.
- **Header.** Stories, The Wire and Adopt removed from the desktop nav and the mobile drawer on every page (they remain in the footer). Store, Get involved and Members are now sharp-edged outlined buttons in their own colours that fill on hover and show filled on the active page (`.nav-cta` in `assets/header-footer.css`).

- **One rule file, every field, both sides.** `assets/field-rules.js` now carries a keystroke `filter`, a stored-form `normalise` and a `check` for every kind of field, keyed by name or id. It covers every control on the site, including the ones scripts render later (Circle profile, checkout, Get to Learn, Wildlife Gauntlet). The API routes (`lib/caregiver.js`, `lib/payment.js`, `api/pfa-orders.js`, `api/caregiver/replace.js`, `api/admin/import-members.js`) run through the same file via `parseFields`, so a direct POST cannot store what the form would refuse.
- **No digits in names, no letters in numbers.** `site.js` filters every keystroke and paste site-wide: name, district, state and city fields drop digits and symbols; mobile, PIN, amount and code fields keep digits only; a pasted `+91` or leading zero is stripped from a mobile. `maxlength`, `inputmode` and `autocapitalize` are set from the rule. The caret stays where the person was typing.
- **Title Case on every card.** Names, addresses, districts and states are put into Title Case on blur, in the live card preview, in the stored record and wherever an older record is displayed (card canvas, public verification page, member page, admin tables). `RAO` is `Rao` in a name; `MG Road` and `HSR Layout` keep their initialisms in an address; `12b` becomes `12B`. Applies whether the address was typed or filled by the Location button. Patron card no longer forces uppercase.
- **Field mapping fixes.** The Patron number field on the Meeting form was validated as a person's name and rejected `PFA-MBR-` numbers. Three pages used `require` instead of `required`, so those fields were never mandatory.
- **Firestore.** `circleProfiles` writes now require a valid name (no digits or markup), a lowercase handle, and digit-free city and state, with length caps, in both rule files.
- **Copy.** Inline error messages, labels and placeholders made consistent and specific across all forms; "Patron ID" is "Patron number"; comma spacing fixed in the product index; membership address cap raised from 48 to 160 characters so real addresses no longer clip.
- **Behaviour.** An empty field is no longer flagged red when tabbed past; only a filled-but-invalid entry is, and submit still catches empties.
- 66/66 tests pass, including 11 new in `test/field-rules.test.js`. Verified in headless Chromium on caregiver, membership, meeting, give and checkout pages.
- Open decision: the membership page offers a ₹365 digital-only option while the server prices every INR membership at ₹514 with the printed card. Server rule kept; page needs aligning once PFA confirms.

---

## v1.16.1 - 2026-08-21

- **The portal is in the site's theme.** It already inherited the type and palette by linking `site.css` - body in Archia, headings in Clash Display, `--blue` - but carried none of the mark. It now opens with the PFA logo, an eyebrow and a headline exactly as a page of the site does, and the signed-in view has a branded header bar: logo, an **Admin** label, the signed-in address and Sign out. The bar is the same 78px as the public header and uses the same white, hairline border and blur.
- **It links `assets/header-footer.css` too**, so brand values stay in one place and a change to the palette or the type reaches the portal without a second edit.
- **No public navigation, deliberately.** A member's route through PFA is not an administrator's, so the portal takes the mark and the type but not the nav.
- **Fixed the same word-space fault the public pages had.** The tab read "VERIFY ACARD" - uppercase micro-type in Clash Display closes its word spaces, and the generated correction in `site.css` covers the public classes, not the portal's own. The portal's controls now carry it: tabs, table headers, pills, row buttons and metric labels.
- 55/55 tests pass. Files changed: `admin.html`.

---

## v1.16.0 - 2026-08-21

- **The admin portal is now a working desk, not just two registers.** Seven tabs: Overview, Submissions, Members, Caregivers, Payments, Store and Verify a card.
- **Every form submission arrives in one queue, by category.** All twelve categories the intake route already accepts - adoption, story, help desk, case follow, volunteer, service, wire report, corporate, CineKind, meet, podcast, general - are filterable by category and status, newest first. The overview lists how many are waiting in each and links straight into that queue.
- **Submissions can be worked, not just read.** Taking it / Done / Spam via `POST /api/admin/submission-status`. A register you can only read is a list; a register you can mark is a queue - without it two people work the same complaint and a third is missed. `handledBy` comes from the administrator's own token rather than the browser, so the trail cannot be forged.
- **Payments are visible.** `transactions` - membership and colony caregiver card payments through CCAvenue - with who paid, how much, and whether it completed.
- **Store orders are in Shopify, and the panel says so rather than pretending.** Checkout runs through the Shopify Storefront API, so orders live in the Shopify admin; `storeCheckoutIntents` in Firestore is only an idempotency lock, not an order record. The Store tab links out. Mirroring Shopify into Firestore with a webhook is possible but is real work, and is called out as a decision rather than done silently.
- **The overview is built from `count()` aggregations**, billed as a few reads rather than one per document, so the first screen an administrator opens does not become the most expensive thing on the site. The 30-day payment total does read documents, so it is capped at 500 and says so when it hits the cap.
- **`BACKEND-SETUP.md` gained the composite index** the submissions queue needs (`kind`, `status`, `receivedAtMs desc`) and how to create it from the error URL in the Vercel log.
- 55/55 tests pass. Files added: `api/admin/metrics.js`, `api/admin/submission-status.js`. Files changed: `admin.html`, `api/admin/records.js`, `BACKEND-SETUP.md`.

---

## v1.15.2 - 2026-08-21

- **`assets/firebase-config.js` filled in** with the real web app config for project `pfa-new-website` (project number 494074297632). The panel now starts instead of refusing: config confirmed loading in the browser, sign-in enabled, placeholder warning gone.
- These four values are public by design - the web API key identifies the project to the SDK and Google documents it as safe in page source. The service account key, which is the secret one, stays out of the repository and belongs only in Vercel's environment variables.

---

## v1.15.1 - 2026-08-21

- **The Firebase web config moved into `assets/firebase-config.js`.** Three values in one file, read by the admin panel and later by the member area, rather than edited inside `admin.html`. The file states plainly that the web API key is not a secret and that the service account key must never go there.
- **The panel now says what is missing instead of failing quietly.** With the config unfilled it names the file and the console path and disables the sign-in button. Those checks run in a plain script, not the module: an ES module whose CDN import fails - no network, a blocked CDN, a proxy - aborts silently and would otherwise leave an inert form with no explanation, so a separate timeout reports that too.
- **Setup guide updated for the state the console is actually in.** Added the missing step - registering a web app when Project settings shows only "Add app" - and the trap that the project **ID** is not the display name ("PFA New Website" is `pfa-new-website-…`). Added a note that Blaze is more than this needs, since Firestore and Auth sit in the free tier and nothing uses Cloud Functions, with a pointer to setting a budget alert.
- 55/55 tests pass. Files added: `assets/firebase-config.js`. Files changed: `admin.html`, `BACKEND-SETUP.md`.

---

## v1.15.0 - 2026-08-21

- **Admin panel at `/admin.html`.** Staff sign in with Firebase email and password; the panel then reads the two registers - `members` and `caretakerPublic`, kept separate exactly as they are in Firestore - and can check any card number. It is a tool, not a page of the site: no header, no footer, `noindex`, and absent from the search directory.
- **One admin login replaces two shared secrets.** There were two schemes - `x-admin-key` on member import and a `Bearer` token on caregiver shipments - and the import route's own comment called it "a minimal stopgap until a real admin panel/login exists". `lib/admin-auth.js` now accepts a Firebase ID token carrying an `admin: true` claim, which is the **same claim `firestore.rules` already checks**, so the panel and the database agree about who is an administrator instead of each deciding separately. Both old secrets still work and the result reports which one let a caller in, because removing them in the same change would take the site down if one were missed - they should be deleted once the panel is in use.
- **The first administrator is made from the command line**, not from a web route: `node scripts/grant-admin.js you@peopleforanimalsindia.org`. There is deliberately no endpoint that grants the claim, so there is never a moment when an unprotected route could mint an admin.
- **`GET /api/admin/records`** answers session, members and caregivers behind that guard. Search is a direct document lookup on card number, plus mobile for members - Firestore cannot do substring search without a search service, and that is not worth adding until the registers are large enough to need it. Browsing pages on document id, so there is no composite index to maintain.
- **`BACKEND-SETUP.md`** documents the wiring in order - service account, the environment variables including `PFA_AUTH_PEPPER` and `PUBLIC_SITE_URL`, deploying `firestore.rules` (which Vercel does **not** do), creating the first admin, and filling in the web config. Each step ends with something checkable, and it is explicit about what is not built and that none of the Firebase code has been run against a live project.
- 55/55 tests pass. Files added: `admin.html`, `lib/admin-auth.js`, `api/admin/records.js`, `scripts/grant-admin.js`, `BACKEND-SETUP.md`.

---

## v1.14.1 - 2026-08-21

- **The total was sitting on the form's border.** `.form-body` carries the 24px padding, and the v1.10.0 edit that removed the stray `</div>` tags closed it one block too early - so the total, the pay button and the fulfilment note fell outside the padded area and pressed flush against the shell. The block is back inside the body; measured at 25px clear on the left and right, matching every other row in the form.
- **Square corners are now stated rather than assumed.** The side toggle already computed to `border-radius: 0` and nothing in the stylesheets rounded it, so the corners are pinned to zero for the toggle, the chips and the buttons - a statement of intent so a broad radius introduced later cannot quietly round them.
- **Checked the same block on the other forms.** `caregiver.html`, `checkout.html`, `give.html` and `lost-card.html` were measured for the same fault; only membership had it, and give.html's action row already cleared at 25px.
- 55/55 tests pass. Files changed: `membership.html`, `assets/site.css`.

---

## v1.14.0 - 2026-08-21

- **The header and footer are one shared component now.** `assets/header-footer.css` holds the only definition of both, and every page links it **last** - after `site.css`, after `journey.css`, and after `index.html`'s own inline `<style>`. Loading last is what makes it authoritative, so a page cannot quietly disagree with it again.
- **This was the cause of the missing colours on the home page.** `index.html` is self-contained and does not link `site.css`, so it carried its own copy of thirty-six header and footer rules. The nav markup had been updated everywhere, but the colours only ever existed in `site.css`, which the home page never loaded. The two copies had also drifted apart in a way nobody would notice until it mattered: a `position:sticky` header on the home page against `position:fixed` on the other thirty-six.
- **Verified identical rather than assumed.** Header position, header height, the three nav colours, nav item count and footer padding were measured on `index.html`, `network.html`, `store.html` and `membership.html` and match across all four. The only variation is the darker shade on whichever destination is the current page, which is the active state doing its job.
- **The home page still behaves.** Moving it from sticky to fixed could have broken the entrance, so it was checked: the opening scene sits flush under the header at 78px with no overlap, and the header stays pinned at the top through scrolling.
- **Finished the Hospitals to Units rename in the copy.** The header was renamed in v1.10.0 but "Hospitals & Rescue" survived in the footer column heading and the home page door card on 37 pages. Two mentions are deliberately left: they are sentences describing the hospitals PFA actually runs, not navigation labels.
- 55/55 tests pass. Files added: `assets/header-footer.css`. Files changed: all 38 pages.

---

## v1.13.1 - 2026-08-21

- **Members is a nav heading, not a chip.** It was added as a bordered green button in the header actions, which made it read as a third call to action beside Donate. It now sits in the desktop nav with the other destinations, in the same size and weight, and in the mobile menu after Get Involved.
- **The three destination headings each carry their own colour** - store in PFA blue, get involved in rust, members in green - with the rest of the nav left in ink and grey. Colour is the only thing separating them, so the bar stays a row of headings rather than turning into a row of buttons. The active underline follows the link's own colour instead of reverting to ink.
- Nine items now sit in the bar; checked at 1500px and 1280px with no wrapping. Files changed: all 37 pages, `assets/site.css`.

---

## v1.13.0 - 2026-08-21

- **The address control is one component now, used everywhere.** Six pages captured an address and each did it differently: membership had no "use current location" at all, lost-card had no manual escape, give.html used a private `.feed-location-action`, and only store.html hid the manual fields until they were asked for. All six now use the same `.location-line` block - locate button, status line, manual escape - and the same behaviour behind it.
- **The crowding is fixed at the cause, not the instance.** The button sat flush against the chips above it because the control carried a bottom margin and no top margin. It now has a 20px top margin in `site.css` and in `journey.css`, which overrides it on the journey pages, so both routes agree. A spacing rule for stacked blocks inside forms was added so the next control dropped into a form cannot land flush against its neighbour either.
- **Manual fields stay out of the way until asked for.** The address grid is marked `data-pfa-address-fields` and hidden; using the location button fills and reveals it, and the manual escape opens it directly.
- **Two faults that hiding the fields would have introduced, found by testing and closed.** A hidden field that is still `required` makes a browser refuse to submit while pointing at something nobody can see. Required flags are now suspended while a block is hidden and restored when it opens. Membership sets those fields required *after* load, when the printed card is chosen, so a `submit` listener would not have caught it - and when validation fails the submit event never fires at all. The `invalid` event is used instead, which does fire: the block opens and the cursor lands in the offending field. Verified: submitting membership with the address hidden and required now reveals it rather than dead-ending.
- Files changed: `assets/pfa-location.js`, `assets/site.css`, `assets/journey.css`, `membership.html`, `caregiver.html`, `checkout.html`, `give.html`, `lost-card.html`.

---

## v1.12.0 - 2026-08-21

- **Member sign-in, built on what is already here.** No Cloud Functions and no new infrastructure: the Vercel routes already run `firebase-admin` with a service account, so `POST /api/member/auth/start` posts a one-time code and `POST /api/member/auth/verify` spends it and returns a Firebase **custom token**. That keeps the member-number lookup private - there is no public `memberId -> email` collection for anyone to enumerate - at no cost beyond the Firestore reads you already pay for.
- **The codes are PFA's, not Firebase's.** Firebase never sends an email here. Codes are generated server-side and delivered through the existing Resend pipeline as `People for Animals <cards@peopleforanimalsindia.org>`, using a new `member_login_code` template in the same house style as the card emails. Firebase only holds the authentication.
- **Passwords are held by Firebase Auth and by nothing else.** A password supplied at verification is passed straight to `admin.auth().updateUser` and is never written to Firestore, logged or returned. Only a `hasPassword` flag is stored. The one-time code is stored as a salted SHA-256 hash and compared in constant time, so a Firestore dump yields nothing reusable and the code cannot be guessed a character at a time.
- **The member number is a username, never a credential.** It is printed on a card that can be photographed, so every route that turns an ID into a session requires the emailed code or the password. `start` answers identically whether or not the member exists, so it cannot be used to discover which numbers are real. Codes expire in ten minutes, survive five wrong attempts, are single-use, and are rate-limited to one a minute.
- **Caregivers are excluded structurally, not by a check that can be forgotten.** A member's Firebase Auth uid *is* their `PFA-MBR` number, and no auth user is ever created for a `PFA-CCT` number - so no token exists that could satisfy a rule in the Membership Area. Their card stays readable at its own public URL, which is a different thing from an account.
- **`firestore.rules` added.** The browser starts with no read access to anything; the API routes use the admin SDK and bypass rules. A signed-in member may read their own `members` document and nothing else; the caregiver collections and everything financial are admin-only or closed outright, and a catch-all denies anything added later until someone decides otherwise.
- **`GET /api/verify-card?id=` added.** One number to check either card family against. It answers only what a person holding a card needs - the holder's name, the card type, and whether it is in date - and never the record behind it. Colony caregiver checks read the existing `caretakerPublic` projection rather than the applicant record.
- **Cards download as both sides**, and **Members is in the header** with Store in PFA blue, Members in a green chip and Donate keeping the gradient.
- **Fixed a stale test.** `store typography matches the PFA visual system` still asserted the Helvetica stack replaced back in v1.8.0. It now asserts the Clash Display + Archia system is wired, including that synthesis is off. 55/55 pass.
- Files added: `lib/member-auth.js`, `api/member/auth/start.js`, `api/member/auth/verify.js`, `api/verify-card.js`, `firestore.rules`.

---

## v1.11.0 - 2026-08-21

- **Cards download as both sides.** `downloadPng` saved only the side it was given. It now saves front and back when asked for "both", while an explicit `front` or `back` still returns one side, so the per-side buttons are unaffected. The button on the issued screen now reads *Download card (front & back)*.
- **Members is in the header, and Store and Members each carry their own colour.** Store is set in PFA blue, Members in a green outline chip, and Donate keeps the blue gradient - three neighbours that no longer read as one block. Applied to all 36 pages that carry a header. Members collapses below 1180px so the bar does not crowd.
- **Reverted the browser-side card issuance added in v1.10.0.** That change was made on the assumption this was a static build. It is not: `api/caregiver/apply.js` issues the card through `lib/caregiver-store.js` and persists it to Firestore, then queues the issuing email. Minting an ID in the browser would have produced card numbers that exist on no record in Firebase and cannot be verified by anyone. The application posts to the API again and surfaces a real error if it cannot reach it.

---

## v1.10.0 - 2026-08-21

- **The Colony caregiver card photograph was cropping the head off.** The editor framed at `85.6/54`, a tall portrait, while `assets/caregiver-card.js` draws the photograph into a landscape band (`photoW * 3/4`). A tall crop cover-drawn into a wide box loses the top and bottom, which is why the face was cut. The editor now frames at exactly `3/4`, the ratio the card prints, so what is framed is what appears - the same fix the Patron card needed.
- **Framing no longer starts centred.** Centring is wrong for a portrait: whenever the frame has to crop vertically, the part worth keeping is the face, which sits in the upper third. The crop now starts high and can still be dragged anywhere. This applies to both cards.
- **The digital card is issued on submission, and the printing fee is optional.** The application posts to `/api/caregiver/apply` as before, but if that endpoint is unreachable - which it is on a static build - the card is now issued locally rather than failing with "No connection", so nobody is left at a dead end. The issued screen no longer reads "One step left: pay for printing"; it states that the digital card is complete with nothing to pay, and offers the printed card at ₹100 as an optional extra.
- **Card numbers are generated.** A unique ID in the existing `PFA-CCT-XXXXXXXX` format is produced from `crypto.getRandomValues` plus a time component, using an alphabet with no O/0 or I/1 so it can be read aloud and written down without ambiguity.
- **The year on the card was already dynamic** (`new Date().getFullYear()`); the 2026 on the sample is simply the current year, and it will read 2027 next year with no change.
- **Hospitals is now Units, everywhere.** All 37 pages carry one canonical header: units, stories, the wire, learning, adopt, cinekind, store, **get involved**. Five slightly different versions of that nav existed across the site; they are now generated from a single list, with the active item derived from the page - including detail pages, so `hospital.html` highlights units and `caregiver.html` highlights get involved.
- **The Units page is a directory again, not a complaints desk.** It opened with "Tell us what happened." and put the unit list below a helpdesk. It now opens on the network itself - *Every unit. Every city. Every day.* - with search and the unit grid as the centrepiece. The reporting form is kept, because reporting an animal in trouble is a real need, but it sits below the directory and is framed as "Something not right?" rather than as the page's purpose.
- **The large empty panel on that page is gone.** It was `.location-status`, whose `flex:1` made it stretch to fill every spare pixel of the hero's flex column. It is a single line of reassurance and is now set as one - 14px tall instead of a 300px box.
- Files changed: all 37 pages (header), `network.html`, `caregiver.html`, `assets/caregiver-flow.js`, `assets/photo-editor.js`, `assets/site.css`.

---

## v1.9.0 - 2026-08-21

- **The entrance is now the founder, full frame.** The locker wall and its opening gate on `index.html` are replaced by the supplied portrait of Smt. Maneka Sanjay Gandhi, set to the full height of the viewport. Her words - *When the heart opens, it opens for all.* - the attribution, the standfirst and **Enter PFA** all remain, set beside her on desktop and beneath her on narrow screens.
- **She is never cropped.** The portrait uses `object-fit: contain`, never `cover`, so the whole figure always fits inside its box whatever the viewport. Verified by measurement rather than by eye: at 1440x900, 1920x1080 and 390x844 the drawn image fits inside its box on both axes, while still filling 91-93% of the viewport height on desktop.
- **The supplied file was mostly empty white.** The figure occupied only about 20% of the original 1537x1023 frame. Cropping to her bounding box (plus a small margin, so nothing of her is lost) gives a 369x993 portrait, which is what lets her fill the height instead of sitting as a small shape in the middle of a wide picture.
- **The photograph's ground is now transparent.** Its white measured 254,254,254 against the page's 255, which drew a faint rectangle around her. Near-white is now cleared to transparent with a short feathered ramp, so she sits on the page with no visible edge and will still sit cleanly if the background ever changes.
- **Caution on resolution.** In the supplied file she is only about 308x920 real pixels, so at full viewport height the browser is enlarging her and she will look soft, most visibly on large or high-density screens. Nothing in the code can add detail that is not in the file; a larger original would fix it and would drop straight in over `media/maneka-gandhi.*`.
- Files changed: `index.html`, plus `media/maneka-gandhi.png` and `media/maneka-gandhi.webp` (new, 45 KB WebP served first with a PNG fallback).

---

## v1.8.2 - 2026-08-21

- **The Champion pass shows the real logo again.** `champion.html` carried `.ticket-top img{filter:brightness(0) invert(1)}`, which flattens every pixel to solid white. That kept the wordmark readable on the dark pass but destroyed the emblem - the bird-in-hands artwork collapsed into a white blob. The filter is removed and `media/pfa-logo.png` is shown as drawn, on a white plate so the blue emblem and the black wordmark both read against the dark card. A sweep found this was the only destructive logo filter on the site; every other page already uses the logo as supplied.

---

## v1.8.1 - 2026-08-21

- **"iswaiting" was a typo in the copy, not a spacing fault.** `adopt.html` carried `Someone here iswaiting for you.` in both the hero `h1` and the section `h2` - the space is missing from the markup itself, so no amount of letter-spacing would have separated it. Both fixed. A scan of the visible text on all 38 pages found no other joined words.
- **The display weight is now Medium.** The site declared 650-900 throughout, which Clash Display rendered at its Bold. Every weight of 650 and above across the stylesheets, page `<style>` blocks and inline `style` attributes is now 500. Elements the browser defaults to bold on its own - headings with no declared weight, and `strong`, `b`, `th` - were still coming through at 700 and are pinned to Medium too.
- **Micro-labels keep Semibold, deliberately.** At 9-11px with wide tracking, Clash Display's Medium goes faint and the labels stop holding against the body copy. Uppercase micro-type is set at 600, selected by the tracking and size that mark it as micro-type rather than by hand. The type the page is actually read by stays at Medium.
- **The composite family split moved with the weights.** `"PFA Sans"` previously handed 100-500 to Archia; with the display type now at 500 that would have thrown every heading into the body face. The split is now 100-400 Archia, 401-900 Clash Display.
- **Word-spacing is handled once, not per selector.** The previous pass corrected only uppercase labels, so bold non-uppercase text - form labels, currency chips, the summary values - was still closing up. `word-spacing` inherits, so it is set once on `body` and switched off again for running copy, which is Archia and correctly spaced already. Label classes carry their own value and win on specificity.
- Verified across all 38 pages: correct faces everywhere, nothing rendering heavier than Semibold, no font 404s.

---

## v1.8.0 - 2026-08-21

- **The site is set in Clash Display and Archia.** Clash Display carries the display register - headings, large figures, buttons, uppercase labels, the card name - and Archia carries running body copy, leads, form fields and help text. Both are self-hosted from `assets/fonts` (about 63 KB of woff2, with a woff fallback); no external font requests. Both licences ship alongside them, and Archia's webfont licence is a commercial one that should stay with the project.
- **Archia has one weight, so it is never asked to be bold.** The site declares heavy weights constantly - 46 uses of `font-weight:900` in `site.css` alone - and a single-weight face under those declarations would be synthesised into a smeared fake bold. Rather than rewrite 78 weight declarations, `"PFA Sans"` is registered as a composite family: 100-500 draws Archia, 501-900 draws Clash Display, so every element lands on the right face from the weight it already carries. Clash is loaded as its variable font (200-700), so the 750-900 values clamp to a real Bold. `font-synthesis-weight:none` closes off synthesis entirely.
- **The display scale was re-tracked for the new face.** The headings were tracked as tight as -.064em in `site.css` and -.08em on the home page to make Arial read as a display face. Negative tracking shrinks the word space as well as the letter gaps, and Clash Display is already tight, so headlines closed up until words touched - "One rupee" read as one word. Every display headline is eased to roughly half its original tracking with a little word-space returned. Archia's running text is untouched; its spacing was already correct.
- **Uppercase labels corrected from the stylesheet itself.** At label sizes with wide letter-tracking, Clash's narrow word space made "ENTER CINEKIND" read as one word. The correction is applied to a selector list generated from every rule that sets `text-transform:uppercase`, so it lands on exactly the text that needs it and nowhere else.
- **The printed Colony caregiver card had never used its intended font.** `assets/caregiver-card.js` requested `media/Inter-Regular.woff2`, which has never been present in the project, so the card fell through to whatever `system-ui` was installed - the printed artefact varied by machine. It now uses the site's own faces through the same composite family. Its **monospace stack is deliberately unchanged**: neither Archia nor Clash Display is monospaced, and the card number and dates depend on fixed-width digits to stay in column.
- **One deliberate exception.** `assets/cinekind-page.css` keeps `--ck-mono:"Courier New"` for the CineKind credit lines. Courier on a film-awards page reads as a screenplay reference rather than an oversight, so it was left as designed. It is a single variable if PFA wants it on the site faces instead.
- Verified across all 38 pages: every page resolves to the new faces and there are no font 404s.
- Files changed: `assets/site.css`, `index.html`, `patron-card-preview.html`, `assets/caregiver-card.js`, and `assets/fonts/*` (new).

---

## v1.7.0 - 2026-08-21

- **The live card sits beside the form and stays put.** Two stray `</div>` tags inside the membership form were closing `.patron-layout` early, so the browser parsed the `<aside>` (card, front/back toggle, summary) as a sibling of the layout rather than a child - no column rule could reach it and it sank below the form. Both tags removed; the card column is now sticky beside the form while it is being filled, and drops below the form on narrow screens.
- **The photograph appears on the card, live.** Three separate faults. `journey-core.js` captured `window.PFA` at load, before `site.js` (which creates it) had run, so the photo editor crashed on mount and the file input was wired to nothing - it now resolves `PFA` at call time. An inline `background: #0b0c0e !important` on the photo well was expanding to `background-image: none !important` and blanking the photograph the instant a script set it - now `background-color`. And `membership.js` repainted the raw upload over the framed one on every keystroke - its photo handling is removed, the editor owns the photograph and paints it as an `<img>` inside the well.
- **The editor frames at the card's own 3:4.** It was cropping to landscape 1.586:1 while the card's photo well is portrait 3:4, so the well had to enlarge the framed image roughly 2.1x - only 47% of the framed width survived, which read as absurd zoom and made framing a fight. Editor stage, export (1200 x 1600) and well now all agree at 3:4: what is framed is exactly what appears, and what would print.
- **The physical card is a choice again.** v1.5.0 made the printed card mandatory for INR memberships; restored as an explicit opt-in on instruction. Digital-only at ₹365 is the default, with the address section hidden entirely; the toggle reveals it, makes its fields required, and moves the total to ₹514. USD stays digital-only at $10 with the toggle hidden. **Caution for the backend:** v1.5.0 also changed the server to derive the charge from currency and ignore `physicalCard` - "a client claiming `physicalCard: no` still pays ₹514". The server must honour the field again, or INR digital-only members will still be charged ₹514 at payment.
- **Search reads the same everywhere.** The overlay now fits one screen (input and result rows compacted, on the home page and in the shared shell), and opening search on any page shows one shared directory - Hospitals & Rescue, Stories, The Wire, Learning Center, Adopt, The PFA Store, Become a Patron, Get involved - instead of the home page showing one list and every other page showing suggestion chips.
- Files changed: `index.html`, `membership.html`, `assets/site.css`, `assets/membership.js`, `assets/journey-core.js`, `assets/pfa-global-search.js`.

---

## v1.6.4 - 2026-08-21

- **Splash quote's second line is blue.** `it opens for all.` is wrapped in `.opening-accent` with `color: var(--blue)`. The first line stays in the theme's ink so the accent carries the emphasis.
- **Header navigation trimmed to five, in the order given.** Hospitals, Learning, Get Involved, Store, CineKind. Every target file exists on disk. Stories, The Wire, Adopt and Become a Patron are removed from the desktop bar; the mobile menu was rebuilt in the same order and still carries Become a Patron because the header has no room for it. Every label reads exactly as requested.

---

## v1.6.3 - 2026-08-21

- **Footer background fixed to white, at its source.** The cause was not a bleed or an inherited colour: `assets/site.css` carried `footer{background:#073BA4;color:#fff}` as a site-wide rule, and `index.html` carried a second copy of the same rule inside its own inline `<style>` block. Both were patched, so the footer is white on every page rather than on the one page that happened to be inspected.
- **Every dependent footer colour flipped with it.** The whole footer palette was white-on-blue - brand paragraph, column headings, links, hover state and the bottom bar and its divider were all `rgba(255,255,255,...)`. Turning only the background white would have produced white text on white. Text is now `--ink`, secondary text `--muted`, hover `--blue`, and the dividers `--line`. A hairline top border replaces the colour block as the separation from the page.
- **Opening screen copy replaced** with the chairperson's line: *When the heart opens, it opens for all.* attributed to Smt. Maneka Sanjay Gandhi, set in sentence case. The attribution deliberately does not use the theme's `<small>` element, which is uppercased by the stylesheet. The headline size and its three responsive overrides were brought down to suit a sentence rather than a two-word slogan, and `Enter PFA` follows as before.

---

## v1.6.2 - 2026-08-21

- **The chairperson's signature is on the card.** Supplied artwork recoloured to pure white against the dark face, transparent ground preserved and the surrounding margin trimmed so it can be placed exactly. It sits on the rule above the authorised-by block, the way a signature sits on a line.
- **The signature is bound to issuance, not to the form.** `hydrate()` fetches it only when the card number matches `PFA-CCT-XXXXXXXX` - a real number from the register. The live preview never shows it, because a signature on a preview would be an authorisation of nothing. The gate is a card-number match rather than a truthiness check, and is covered by a test.
- **Validity removed from the card; issue date kept.** The back now reads `ISSUED ON` and the date, single column. Validity is still tracked, still returned by the card API, still shown on the permanent card page and still in the issuance email - it simply is not printed on the card.
- **Role reads Colony Caregiver**, replacing Colony Colony caregiver on the card front.
- 55 tests pass.

---

## v1.6.1 - 2026-08-21

- **Back rearranged: the dead band is gone.** The reference reserved roughly 90px for a signature image that PFA has not supplied, which read as a hole. The largest gap on the back is now 24px, down from 89px.
- **The recovered space carries something useful rather than air.** The new artwork had quietly dropped the issue date, and validity had never been on the card at all - so the back now sets **Issued** and **Valid until** as a two-column row in the same label-over-mono rhythm as the address and contact blocks. An expiring card is identification, and a date on it is worth more than an empty band. An expired card prints its validity in red.
- **Signature support kept, sized so it cannot collide.** If `media/pfa-signature.png` is added, it is drawn right-aligned immediately above the rule at a capped height, and leaves no hole when absent.

---

## v1.6.0 - 2026-08-21

- **Colony caregiver card artwork replaced with the approved reference.** Both faces transcribed from the supplied 340 x 540 design at 1 reference pixel = 54/340 mm, so the card stays ISO/IEC 7810 ID-1 portrait while matching the reference proportionally. Dark `#141416` body, 2.22 mm corners, given name in white over surname in grey, mono `Colony Colony caregiver` line, full-width 4:3 photograph with square corners, vertical year in the right margin, and the card number centred at the foot. Back: registered address, contact, a scannable code, and the authorised-by block with the chairperson line in `#16B6FF`. The lavender presentation background is not part of the card and was not carried over. **The Patron card is untouched.**
- **A real QR code, on a card that will be shown to police.** `assets/qr.js` is a deliberately narrow encoder - byte mode, error-correction level L, versions 1-5 only - because every one of those versions is a single error-correction block, which removes the block interleaving that is easiest to get quietly wrong. A code that scans to the wrong thing would be worse than no code.
- **The encoder proves itself, since there was no library here to check it against.** `test/qr.test.js` verifies the Galois field tables round-trip, that the Reed-Solomon syndromes are zero at the generator's actual roots, that the codeword count derived from counting free modules in the matrix agrees with the capacity table, that the format information survives its BCH encoding and reads back with the right mask and level, and that the URL comes back byte for byte after walking the finished, masked matrix in reverse.
- **Fonts.** The reference uses Inter and JetBrains Mono; neither can be bundled offline. The stacks fall back to `system-ui` and the platform monospace, and the renderer will pick up `media/Inter-Regular.woff2`, `media/Inter-SemiBold.woff2` and `media/JetBrainsMono-Regular.woff2` automatically if those files are added.
- 53 tests pass. Print output re-verified: two pages at exactly 54 x 85.6 mm.

---

## v1.5.0 - 2026-08-21

- **Both journeys now run on shared modules, not just a shared stylesheet.** `assets/journey-core.js` owns the Begin disclosure, step handling, validation, busy states, the "ship somewhere else" disclosure and the payment hand-off; `assets/photo-editor.js` owns the photograph. The Colony Caregiver Card, the Patron card and the new lost-card journey all call the same functions, so a difference in behaviour between them is now a bug rather than a design choice. The two card faces are untouched and remain completely distinct.
- **Photograph control with framing and an honest resolution warning.** Drag to position, slide to zoom, and a warning derived from print maths rather than a guess: a 54 mm card at 300 dpi needs 638 px across the printed area, so below that it warns of softness and below 351 px it warns of visible pixelation. Zoom is counted in, because zooming in spends pixels. The journey stops once before issuing a card that will print pixelated.
- **The printed card is mandatory in both journeys.** The Colony caregiver choice screen is gone: the free digital card is issued on application and the ₹100 printing charge follows immediately. Membership's optional toggle is gone too, and the server derives it from currency rather than trusting the browser - a client claiming `physicalCard: no` still pays ₹514. USD memberships stay digital, since PFA does not post internationally.
- **Address captured once, with location capture in both.** The Colony caregiver journey now has the same Use current location / Enter manually control the membership form has always had, filling PIN, district and state. The address prints on the back of the card and is the delivery address by default; *Ship to a different address* stays closed until needed and is stored separately.
- **Deduplication without OTP, in two layers.** The mobile index is the hard key and blocks outright. A new identity index is the soft key: name and PIN normalised so that "Dr. Asha Kumar", "asha kumar" and "Kumar Asha" collide. A soft match does not block - two people in one household can genuinely both feed animals - it warns, records `softDuplicateOf` on the new card and points at the lost-card journey.
- **Lost printed card journey** (`lost-card.html`, `/api/caregiver/replace`). Card number plus the mobile it was issued against; one message for both "no such card" and "wrong number", so the endpoint cannot be used to discover which card numbers exist. It orders a replacement PARCEL and nothing else: proven in the end-to-end walk that the card number, issue date and validity are all unchanged and no second digital card is created.
- **47 unit tests and an extended end-to-end walk** covering replacement-keeps-the-number, identity dedup, mandatory physical, and the photograph thresholds. Two older membership tests asserted the optional-card rule and were updated to the new one rather than deleted.

---

## v1.4.1 - 2026-08-21

- **The Colony Caregiver Card journey now uses the membership design system, not one of its own.** The bespoke stylesheet it had grown - its own buttons, type scale, spacing and colour tokens - has been deleted. Both journeys are now built from the same components: `hero`, `facts`, `form-shell`, `simple-form-group`, `form-grid`/`field`, `patron-summary`, `payment-note`, `card-toggle`, `pfa-card-hint`, `order-success`, `btn dark`/`btn light`. No new visual style was introduced and no existing element was redesigned.
- **One stylesheet, shared.** The form system that lived inside `membership.html` has moved to `assets/journey.css`, which both pages load. It is one file on purpose: two files that merely resemble each other drift apart on the next edit. Verified that every class used on the membership page still resolves to a rule, so nothing was lost in the move.
- **Page typography is the site's own again.** Absans is still loaded, but only so the canvas can draw the card artwork in it; no page chrome uses it.
- **The UX improvements survived the restyle.** The journey stays closed until Begin; four fields and an optional photograph; the card is issued free before any mention of payment; the printed card is a choice afterwards; the address already given is shown rather than asked for again, with *Ship to a different address* revealing the alternate fields.
- **Membership adopts the same rules.** Its address block was always on screen even for patrons taking the digital card, and `deliverySection` was declared in its script but never used. It is now hidden by default and revealed only when the printed card is switched on - the same rule the Colony Caregiver Card follows. For a digital patron this drops the form from roughly ten visible fields to four.

---

## v1.4.0 - 2026-08-21

**The Colony Caregiver Card journey, rebuilt end to end.** See `CAREGIVER_CARD_ARCHITECTURE.md`.

- **The application stays hidden until Begin.** `caregiver.html` is one page with five scenes and no reloads: open → apply → issued → printed → done.
- **Five fields, and not one more.** Photograph, name, mobile, email, address. The PIN is read out of the address instead of being asked for twice. Locality, city, animal counts and the free-text history are all gone: none of them printed on the card or delivered it.
- **The free card is issued first; the printed copy is offered second.** Previously the route was chosen before issuance, which put a payment question between an applicant and a card that costs nothing. `POST /api/caregiver/apply` now mints the number immediately and the choice comes after.
- **No shipping address is ever asked for by default.** The address already given is displayed; *Ship to a different address* reveals the alternate fields, which are stored in their own `caretakerAddresses` record so the address printed on the card is never overwritten.
- **Payments own nothing on the client.** `/api/caregiver/order` proves the caller holds the card, resolves the address server-side, fixes the price server-side and builds the CCAvenue request itself. The browser never carries an amount or an address.
- **Every physical card gets a shipment record** with its own tracking ID, carrier fields, full status history and a forward-only state machine (order confirmed → preparing → dispatched → in transit → out for delivery → delivered, plus exception, cancelled and returned). Enforced in the store transaction, so the admin panel, a courier webhook and a script cannot diverge.
- **Permanent shareable card link** showing the card, number, validity and live delivery tracking. The holder additionally sees their photograph and downloads, because the photograph is device-only and never uploaded.
- **Transactional email** with templates, a Firestore queue, inline best-effort send, exponential-backoff retries via a cron worker, permanent-failure parking and dedupe keys.
- **Read cost designed for a link that gets shared.** The card page reads exactly one denormalised document, cached at the edge for five minutes with a day of stale-while-revalidate and an ETag, so a card doing the rounds costs close to zero Firestore reads rather than one per view.
- **Duplicate prevention** on the mobile index inside the issuing transaction, idempotency keys on application and payment, and a re-entrant payment callback that cannot open a second parcel.
- **43 unit tests plus an end-to-end walk** of the whole journey against an in-memory Firestore double, covering duplicate prevention, token authorisation, address separation, callback replay, state-machine enforcement and the public projection provably not leaking mobile, email or address.

---

## v1.3.3 - 2026-08-21

- **Card back rebuilt around type rather than ornament.** The four hand-drawn icon glyphs are gone: vector or not, small custom glyphs at card scale read as crude, and the calendar and hash marks were carrying no information the labels did not already carry. Rows are now small letter-spaced caps over the value, separated by hairlines, on a 4.4 / 3.6 / 3.0 / 4.8 mm vertical rhythm.
- **The tinted issuer panel is gone.** Whitespace and a shape edge do that work; a translucent box on top of a translucent shape was mud.
- **Both faces now share one piece of geometry.** The chevron from the front label repeats at the foot of the back in a lighter blue, and its edge is the divider above the issuer block - no hairline is drawn over it. The rows are proven to clear the chevron apex by 3.4 mm in the worst case (a three-line address), so a long address can never run into it.
- **One margin everywhere: 6.5 mm.** The front title, the back rows and the last line of the issuer block all land on it, so the two faces read as a pair.
- **Front title margins fixed.** It sat 5 mm from the edge at 5.8 mm type, which crowded it; the type is now sized against the space between the margins rather than set at a fixed size.

---

## v1.3.1 - 2026-08-21

- **Colony caregiver card redesigned to match the supplied reference.** Front is now the holder's photograph edge to edge on a pure white card, with a two-tone blue diagonal panel at the foot carrying *Colony Animal Colony caregiver*. Back drops the redundant title, and holds Name, Address, ID number and Issued on as icon-led rows with dividers, closing with the issuer block: *Issued by Smt. Maneka Sanjay Gandhi, Chairperson, People for Animals*.
- **Absans (SIL OFL) shipped in `/media` and registered via `@font-face`.** Canvas now waits on `document.fonts.load('16px Absans')` before drawing so the preview, PNGs and PDF all use the same face rather than falling back to the system sans between renders.
- **Address moved into the always-visible details.** The card back needs it whether the applicant wants a printed copy or not, so `caregiverAddress` is required for the digital route too, validated server-side in `api/caregiver-issue.js`, and stored on the Firestore card record. The paid route still collects PIN, district and state for India Post; the delivery section no longer duplicates the address field.
- **Names and addresses shrink to fit rather than clip.** Long names, long addresses and long area lines are re-measured until they fit the allowed lines; an ID card that truncates its holder's name is not identification.

---

## v1.3.0 - 2026-08-21

- **The Colony Caregiver Card journey is now automated end to end.** Previously "Apply" on Get Involved opened a modal that filed an application and then went nowhere: nobody was ever issued a card. New page `caregiver.html` takes the application with a live card preview that updates as the applicant types, and `caregiver-card.html` shows the issued card with instant downloads. The old dead-end modal has been removed and both Get Involved entry points now link to the journey.
- **Free digital card, issued on submit.** `api/caregiver-issue.js` validates the application server-side (never trusting the browser), mints a `PFA-CCT-XXXXXXXX` card number and writes it to the Firestore `caretakerCards` collection. Issuance is keyed to the mobile number, so re-submitting returns the same card number with details refreshed rather than minting a second identity for the same person. If the register is unreachable the applicant still gets a card, flagged provisional, instead of a dead end.
- **Printed card for Rs 100 shipping.** New `caregiver` payment type in `lib/payment.js` with the price fixed server-side (the browser cannot name its own shipping charge), a `PFA-CAR-` order prefix, and card issuance in `applyPaymentResult` that only fires on a verified CCAvenue payment. The delivery address is mandatory on this route only. The digital card still downloads immediately after payment; the photograph is carried across the gateway hop in sessionStorage the same way the Patron flow already does.
- **The card artwork is generated, not mocked up.** `assets/caregiver-card.js` draws both faces on canvas from millimetre coordinates on the ISO/IEC 7810 ID-1 card turned portrait (54 x 85.6 mm). The same renderer draws the live preview and the downloadable artwork, so the preview cannot drift from what is issued. Downloads: print-ready two-page PDF at true physical size (assembled by hand, no library, validated against its own cross-reference table) plus 600 DPI front and back PNGs. **No lanyard slot is cut into the artwork**, as the instantly issued card is not punched.
- **Card face design.** Front follows the supplied reference: white face, rounded photograph window on the house blue wash, name in blue, COLONY ANIMAL CAREGIVER beneath it, the area looked after, and the PFA lockup at the foot. Back carries **Name, Area looked after, Card number, Issued on**, then the issuer block reading *Issued by / Chairperson / People for Animals*, the ABC Rules line and a verification line. Names and addresses shrink to fit rather than clip: an ID card that truncates its holder's name is not identification.
- **Card numbers are safe to show a stranger.** `api/caregiver-status.js` returns only name, area, standing and issue date. The number is printed on a card shown to police and neighbours, so mobile, email and the delivery address are deliberately not exposed by lookup.
- **7 new tests** (37 passing): fixed shipping price, rejection of the free card at the payment gateway, delivery-address requirements, server-side application validation, lookup privacy, and a PDF structure check that walks every cross-reference offset and asserts it lands on the object it claims.

---

## v1.2.0 - 2026-08-21

- **CineKind added to site navigation.** Desktop header ("cinekind", between adopt and store) and mobile menu ("CineKind") on all 34 header-bearing pages, with active state on its own page. Three different header markup variants existed across pages; all covered.
- **CineKind page styled.** Root cause of the "blank/white space": none of the page's 41 `ck-*` classes had CSS anywhere - the page rendered entirely on browser defaults. Authored the full page stylesheet in the house design system (ink cinematic hero with outlined CINEKIND wordmark, timecode bar, two-column about with meta grid, honouree card grid with numbered plates, dense roll-of-honour record rows, scroll-snap ceremony gallery, blue archive/nomination bands mirroring the footer, responsive + reduced-motion). No content changed, no redesign - the intended page finally has its skin.
- **The three CineKind films are now on the page.** `cinekind-elephant/langur/lion.mp4` were shipped in media but referenced nowhere; added a letterboxed "From the frame" film strip (posters from event photography, metadata preload).

---

- **Community forms now reach the admin backend.** New endpoint `api/pfa-submissions.js` writes every submission to the Firestore `submissions` collection (where the admin portal will live), with: kind allowlist matching the site's real reference prefixes (PFA-A adoption, PFA-V volunteer, PFA-CSR corporate, PFA-CAC CineKind, etc.), human-readable kind labels for the admin view, field sanitization and size limits, `status: "new"` for admin workflow, and idempotent writes keyed on the reference number (retries never duplicate). The shared `PFA.saveSubmission` helper in `assets/site.js` now also POSTs to this endpoint; because all community forms (adoption, stories, get-involved, CSR, dispatch, handover, pharmacy, network follow/help, CineKind, services, meet/podcast) route through this one helper, a single change wired every form. Local reference UX unchanged; if the network call fails the visitor still gets their reference.
- **Location button standardized everywhere** (`checkout.html`, `give.html`, `membership.html`, `store.html`): all four now identical `btn light` + "Use current location". Previously two styles and four different labels. Functionality verified as already complete in `assets/pfa-location.js`: browser geolocation, then BigDataCloud reverse geocoding with Nominatim fallback and India PIN-code lookup, auto-filling state/district/locality/PIN on click when permission is granted.
- **Verified zero dead-end links** (`href="#"` count: 0; missing internal targets: 0) and **zero broken images/logos** site-wide.

---

## v1.0.0 - 2026-08-21

First fully clean release: site audit 0 errors, 30/30 tests passing.

### 2026-08-21

- **Fixed `vercel.json`** (`{}` instead of empty functions config). Reason: Vercel's current schema rejects `"api/**/*.js": {}` with "Function must contain at least one property"; the block was unnecessary since Vercel auto-detects `/api` functions.
- **First successful production deployment** to `pfa-full-website.vercel.app` (Vercel project: `pfa-full-website`, all 8 payment/Firebase environment variables configured).
- **Membership card logo fixed** (`membership.html`). Reason: referenced `media/pfa-card-logo.png` was never provided in any export, so the card emblem never rendered. Now uses existing `media/pfa-emblem.png`. Swap in a dedicated card-cropped logo later if one is produced.
- **Copy style violations fixed**: em-dash characters removed from `membership.html` and `patron-card-preview.html` per the site's own no-dash copy rule (`tools/audit_site.py` enforces it).
- **Accessibility: 12 form fields given `aria-label`s** across `adopt.html`, `give.html`, `network.html`, `pharmacy.html`, `stories.html`, `track-order.html`. Reason: search/filter/amount fields had no programmatic labels, so screen readers could not announce their purpose. No visual change.
- **Verified site-wide**: every `<button>` on every page has real CSS (none render as unstyled browser defaults); every `<img>` has alt text.

### 2026-08-20

- **Full audit of the original export.** Found: ~47 of 48 media files missing (incl. PFA logos), Give/Send frontend completely unwired, store catalog fetching a non-deployed endpoint, order-status API a hardcoded stub, order tracking reading only localStorage, 3 stale failing tests, multiple orphaned files, docs describing a home page design that no longer exists.
- **Media restored** from second export (`media/` 1 file → 51 files). Missing-asset audit errors: 148 → 2.
- **USD payment support (backend)** in `lib/payment.js`, `lib/pfa-ccavenue-flow.js`, `lib/firebase.js`, `api/payment/create.js`, `api/payment/response.js`. Reason: PFA wants international donations across Donate, Give/Send and Membership. Currency-scoped CCAvenue credentials (`CCAVENUE_USD_*`, optional separate merchant ID with fallback), distinct callback URL per currency (`?cur=usd`) so the response handler always decrypts with the right key, currency stored on every Firestore transaction, currency verified on callback. USD membership is digital-only (server rejects physical card + USD).
- **USD payment support (frontend)**: currency chips (reusing the existing `.chip` component) on `give.html` (Donate and Give/Send) and `membership.html`; per-item USD prices on food items; currency-aware totals and pay-button labels.
- **Fixed the physical-card switch on `membership.html`**. Reason: the switch had no click handler anywhere in the codebase; selecting a physical card was impossible and pricing never moved to Rs. 514. Also removed a redundant leftover listener.
- **Give/Send frontend wired** (`give.html`, `assets/give.js`). Reason: the whole multi-step food-order flow (route tabs, step navigation, quantity steppers, form submission) was inert markup with zero JS, while the backend was fully built. Also fixed: terms checkbox had no `name` (silently excluded from submission), form had no `action`/`method`, hero shortcut links pointed at a hidden panel.
- **Store catalog endpoint deployed** (`api/paws-catalog.js` copied from the nested `pfa-paws-live-catalog/` helper folder to the real `/api` path, with its tests). Reason: `store.html` fetched `/api/paws-catalog`, which 404'd in production, permanently falling back to the embedded product snapshot instead of live Shopify inventory.
- **Test suite fixed** (`test/store-experience.test.js`). Reason: 3 tests asserted a "cinematic store campaign" feature (packshots, growth experience) that has no footprint in the codebase and whose CSS lived only under the already-removed cinema layer; also expected outdated headline copy and a typography approach never implemented. Tests now assert what the store actually does (live catalog API, order API, accessible filter controls, real font stack). Added USD test coverage in `test/payment.test.js` and catalog tests as `test/paws-catalog.test.js`.
- **Dead code removed** (confirmed unreferenced before deletion): `assets/home-experience.js`/`.css` (superseded home design, loaded by nothing), `assets/pfa-store-experience.css` (1,357 lines, linked by no page), `PFA_store_veg_catalogue.html` (orphan near-duplicate of store.html), `pfa-paws-live-catalog/` (purpose served once its API file was promoted), `file.svg`/`globe.svg`/`window.svg` (scaffold leftovers), root `logo.png` (superseded by `media/pfa-logo.png`). Kept: `patron-card-preview.html` (intentional design-reference document, not dead).
- **Design-system consolidations**: `give.html` form fields moved from parallel unstyled `.feed-field` to the shared `.field` component (restores red-border invalid states); two store modal close buttons (`pfa-checkout-close`, `live-modal-close`) had zero CSS anywhere and now carry the shared `.modal-close` class.
- **Setup docs rewritten** (`VERCEL_CCAVENUE_SETUP.md`, `START_HERE_CCAVENUE.txt`): added identifying the currently-live PHP handler before cutover, Firebase project creation, USD variables, expanded go-live test checklist.

### Known pending

- **USD prices are placeholders** ($10 membership; $7/$6/$4/$8/$18 food items; $5-$60 donate presets). Single constants in `lib/payment.js` + `data-price-usd` attributes in `give.html`.
- **CCAvenue USD credentials do not exist yet** (the `usd/` PHP kit folder has no credentials of its own); USD flows will correctly refuse until `CCAVENUE_USD_*` variables are set.
- **CCAvenue domain whitelisting**: `pfa-full-website.vercel.app` must be whitelisted by CCAvenue support (email service@ccavenue.com + salessupport@ccavenue.com with Merchant ID; up to 48h) and the Return/Cancel URL set to `/api/payment/response` before live payments can round-trip.
- **Vercel project not yet connected to the git repo** (dashboard still shows "Connect Git Repository"); until connected, deploys require `vercel --prod`.
- **Order tracking still localStorage-based** (`track-order.js`) and `api/pfa-order-status.js` is a stub; real tracking depends on an admin surface and/or Shopify webhooks (planned, not started).
- **Admin dashboard** (members/orders/payments): not started.
- `index.html` does not load `assets/site.css`; it carries its own inline duplicate (~84KB). Renders identically today, but the two can drift. Consolidation planned.
