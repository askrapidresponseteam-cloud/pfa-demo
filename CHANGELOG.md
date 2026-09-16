## v1.357

- **The CineKind landing photograph is the new trophy, its name on the plinth.** img/cinekind-landing.webp (1557x1010, 122 KB, from the 2 MB PNG supplied on 16 Sep 2026) replaces img/cinekind-marquee.webp, which is deleted; cinekind.html shows it and the home page's leader warms it during the count. The new trophy stands from 12% to 64% of the picture where the old one stood from 17% to 54%, so at the old 46% frame the presenter credit ran across the plinth's gold on every common laptop window: 58px deep at 1366x657, 55 at 1536x730, 36 at 1512x760. No frame alone could fix it, because on those windows the whole trophy is taller than the space above the title group. The frame is 55% now, and on windows wider than 9:5, or up to 1280px wide and wider than 13:8, the big CINEKIND word stands down, since the plinth already says it, and the photograph drops to 28% so the reel sits below the announcement bar. The credit and the Enter door stay in the title group. Measured in Chromium at 34 window shapes, from phones to 2560x1440: the credit clears the gold and the reel clears the bar at every one. test/cinekind-credit.test.js holds the plate's size to the file and the rule to the top level of the sheet, where its first draft was not.

## v1.356

- **Clicking CineKind on the home page counts 3, 2, 1, then opens on the trophy.** The film leader already existed, but as cinekind.html's last script, so the header and the trophy painted first and the black frame landed on top of a page already on screen. It lives in assets/cinekind-leader.js now. On the home page the count starts on the click itself while cinekind.html and the marquee photograph are fetched; the CineKind page reads a one-time sessionStorage note, opens on the same last frame, and only burns off into the trophy, once the photograph is ready. A reload, a direct visit or a link from any other page still gets the whole count, and that count now mounts first in the body behind a black first frame set in the head, so no browser paints the page before it. Clicks meant for a new tab or window are left to the browser, reduced motion skips the leader everywhere, and a page restored from the back-forward cache comes back without the frame. test/cinekind-leader.test.js drives all of it through the real pages in jsdom.

- **cinekind.html from 16 Sep 2026 ships at 179 KB, not 4.6 MB, and passes the seven tests it failed.** Three honouree portraits arrived as base64 inside the page; they are media/cinekind-2025/nirmal.webp, nitin.webp and ashish.webp now, 239 KB together and sized for the tile. Its thirteen media/cinekind-2025/ffi/ photographs were not in the tree, so the page asks the Federation's own addresses again, which the CSP names; DEPLOY.command's fetch with --rewrite localises them wherever they download. One em dash became a hyphen. Nitin Vemupati's tile looked for its frame twice instead of its tile when the portrait failed, which would have left white type on an empty box; fixed, and test/media-present.test.js now holds every tile to it.

- **Seven honouree photographs point at local files again, not at other sites.** The page hot-linked Twitter, LinkedIn, Filmfare, Mongabay, an ANI photograph and two more. The Content-Security-Policy names none of those hosts, so enforcing it would blank them; the LinkedIn address is signed and expires on 8 Oct 2026; and media/cinekind-2025/README.md records that PFA holds no licence for press photographs. The tiles ask for harsha, dolly, rupali, kushagra, pooja, sandhya and mohit.webp and set themselves in type until those arrive. The README keeps every address the page used, so the choice of picture is not lost.

- **The 2025 gate is a trailer now, as supplied on 16 Sep 2026.** The year at poster scale beside the edition's facts, the Federation's ceremony frames running as a strip of film that opens the archive, and the ten honourees rolling under it as end credits. Archive lands on the gate itself, and the act's second 2025 heading is gone.

## v1.355

- **CineKind nominations are open again, and this time the reference is real.** The old form on cinekind.html said "Nomination received, thank you" while sending nothing, and was removed. The form is back for the 2027 edition, wired the way the removal note demanded: a Nominate control on the poster wall and a "2027. Nominations are open." band both open a nomination room (a sheet from the right, in the site's own field grammar), and the form goes through pfa-forms.js with kind PFA-CK, so the button disables in flight and success is only ever the reference the server issued. A per-kind spec in lib/submission-fields.js makes the server require the nominee, a category from the list the page offers, the reason and the sender's name, with a mobile or an email; the admin register already names PFA-CK, so a nomination lands in the panel the moment it is filed, and it tracks on track.html like everything else. The tripwire in test/forms-wired.test.js that guarded this day now runs the full wiring checks against the page, and two end-to-end tests boot the real page, type into it and hand what it sends to the real validator.

- **Archive lands at the head of 2025, not the foot.** The wall's Archive link pointed at #archive, which is the closing band of the 2025 act, so it dropped a visitor at the end of last year's story. It points at #cinekind-2025 now, the act's opening section; the gate still opens the act for any link into it, old #archive links still work as deep links, and the scroll lines the target up once more after settling in case late media moved it.

- **The newsroom keeps its editorial cut, and the field-note form retires with the page it lived on.** The owner's newsroom (16 Sep 2026) carries no form, so its PFA-W wiring is unwound the same way PFA-CK's once was: the per-kind spec, the wired-forms rows and the confirmations check step aside with notes saying how to restore them, the kind stays in lib/submissions.js so filed notes keep their name in the panel, and /api/field-notes, the publish action and the photo route still serve everything the desk published. A new test holds the page to its actual state: no form, so no false thank-you is even possible.

- **Act II rebuilt in the 2026 register.** The 2025 season used to step off the grand 2026 sections into fourteen-point type: a strip of frames, six photo-less cards, a plain list, a flat grid. It now opens grand (the edition's facts in display type), shows all ten honours as one wall in call order, the ceremony as an editorial mosaic with two double frames, and closes on "On the national record." A tile whose portrait is present is a poster in the 2026 roll's dress; a tile whose portrait is missing (six are on order, see media/cinekind-2025/README.md) or fails sets itself in type instead, so the wall is finished today, upgrades itself the day the files land, and can never show a grey box. Every old anchor (#winners, #honours, #ceremony, #archive) still resolves, and the Federation's photo credit stands.

## v1.354

- **Every submission is confirmed in the blue letter, and every page says where the email went.** The membership welcome letter was the one confirmation written to the brief. Every other form got the grey acknowledgement, a paid colony caregiver application got no email at all, and no page mentioned Spam, because no page knew whether an email had gone: /api/pfa-submissions answered `acknowledged` and pfa-forms.js kept only the reference.

  The letter. lib/caregiver-mail.js draws every confirmation from one builder
  taken from membership_welcome: the flat #2634f5, poster headline, the number
  large between two white rules, one white button. The mark is
  img/logo-dark.png, the on-dark version the header already uses, fetched from
  the site that sent the email (the letter the owner sent over pointed at
  /pfa-logo.png, which is not in the tree). The softer whites are solid
  colours now, because Outlook ignores opacity, and a phone gets a 44px
  headline and stacked rows.

  The words. lib/confirmations.js holds them per kind, lifted from each page's
  own success copy, with the number called what it is: Application number for
  careers, volunteering and the caregiver card; Member number for membership;
  Reference for a report, a question, an event request, a film or a field
  note; PFA transaction ID for a donation. Headlines: Your report is in. Your
  question is in. Your answers are in. You offered your time. Your request is
  in. Your film is in. Your field note is in. Applied. Now a person reads it.
  Your gift is in. You're one of us now. Each letter lists the stages the form
  itself shows, and a test reads get-involved.html so the two cannot drift.

  The caregiver card. A paid application is now sent
  caregiver_application_received: the application number, the fee paid, where
  they feed, the four stages, and what the fee is and is not, in the form's
  words.

  The sending. Every confirmation goes on the caregiverEmails queue first and
  is tried at once. A provider that is slow or down costs a delay, not the
  email: the daily worker sends what could not go. Confirmations carry an
  Idempotency-Key, so a retry after a send that only looked like a failure
  arrives once. Staff emails carry none, so a deliberate resend still goes.

  The pages. /api/pfa-submissions answers with `confirmation`: sent, on its
  way, not sent, or no address given, with the address and where to look.
  pfa-forms.js keeps it by reference, and PFAForms.emailNote(reference) draws
  it under the number on report, ask, careers, events, get-involved
  (volunteer), newsroom and the wall: Check your email, the address in bold so
  a typo is seen, then Spam or Junk, Gmail's Promotions and Updates tabs,
  search for the number, mark it Not spam. The payment result page, the
  membership welcome page and the page a form posted without script gets all
  say the same. submit() still resolves with the reference alone, so no
  caller changed shape.

  test/confirmations.test.js pins all of it (13 tests). The donation flow test
  now expects the address in bold, and the em dash test reads the letters.

## v1.353

- **The ring is made of dollars when dollars are on.** The picture on the
  donate page was a life ring made from a five hundred rupee note whichever
  currency was chosen, so a dollar gift was made beside a ring of rupees
  (owner, 16 Sep 2026). It follows the currency seg now:
  img/donate-lifebuoy-usd.webp, a life ring made from a hundred dollar note,
  swaps in with an alt text to match, and the rupee ring comes back with
  rupees.

  Same size, exactly. The owner's picture arrived at 1372x1147 and cropped
  close, so dropped into the rupee frame its ring would have drawn about 15%
  larger. It is fitted into the rupee file's own 1000x835 instead: scaled to
  86.3% and placed where the two ring outlines overlap best, leaving the rope
  on the floor out of it (IoU 0.934), then set down 8px so the tops and the
  floors meet. In the frame: ring top 145 against 144, floor 739 against 740,
  height 594 against 596. The two renders differ a little in perspective, so
  the hole sits 9px lower. The shadow ran off the foot of the original and is
  faded over its last 48 rows so it does not stop on a line. 163KB, against
  the rupee ring's 141.

  On the page, measured at 1710x904 and 390x844: the image box is identical
  in both currencies, 420x301 and 220x184, and the two pictures start on the
  same top line; only the loose rope lies a little lower. The dollar file is
  not fetched with the page. A pointer, a finger or the focus reaching for the
  USD button fetches it, and the picture changes once it has decoded: never
  to a blank, and not at all if it fails to arrive.

  test/donate-art.test.js now holds the two files to one frame size, keeps the
  dollar file out of the markup, and switches the currency both ways in jsdom.

## v1.352

- **The founder's line is "When the heart opens, it opens for all."** It
  replaces "Compassion without action is evil" in the founder section at the
  foot of the home page (owner, 16 Sep 2026). founder.html keeps the old line
  as its pull quote, because that page argues from it - a section further down
  is headed "Compassion, then action." - and changing the argument is the
  owner's call, not a copy swap.

  The new line is longer, and the old measure did not survive it. At 15ch it
  set as WHEN THE HEART / OPENS, IT OPENS FOR ALL, the comma mid-line. So the
  break is in the markup now, on the comma, with a space after the <br> so the
  quote still reads as one sentence to a screen reader and to the index.
  Broken there at the old size, the first line ran 59px further at 1710x1073,
  the owner's window as measured off the screenshot, where COMPASSION WITHOUT
  already ends against the dog's cheek. The type is 5.6% smaller,
  clamp(34px,5.3vw,90px) from clamp(36px,5.6vw,96px), and the first line
  stops short of where the old one did: 1228 against 1246px at 1710, 814
  against 820 at 1190. On a 390px phone each half balances, WHEN THE / HEART
  OPENS, / IT OPENS FOR ALL: three lines as before, and narrower, 304 against
  338px.

  The search index is rebuilt so search finds the new line. The rebuild also
  brings CineKind's entry up to date, last indexed before that page's later
  changes on 15 Sep, and moves every sitemap lastmod to 16 Sep, which is what
  the build does.

## v1.351

- **The wall arrives bright, wherever the mouse is resting.** The wash came
  down on pointerenter, and every way onto the wall moves the page under a
  mouse that is standing still: the leader burns off over it, Enter scrolls
  the wall up under the pointer that pressed it, a reload lands back on the
  track. Each time, the browser checks what is now under the pointer and
  tells the stage it has been entered. Measured in Chromium at 1190x746: a
  trusted pointerenter with movementX and movementY 0, at the position the
  mouse already had, and no pointermove at all. So the wall opened washed
  back with nobody touching it - all 49 posters on screen after the leader
  and after a reload, and 48 of 49 via Enter, with the face under the
  pointer lifted out and named in the corner.

  Arriving is only noted now. The wash, the lean and the poster in hand wait
  for a pointermove that moved: movementX or movementY where the engine fills
  them in, a changed position where it does not. Measured after, same
  window: 0 of 49 on all three paths; a 15px move brings the wash down and
  names the poster under the pointer; a wheel under a hand at rest keeps the
  name on whatever poster is under it; leaving onto the header lifts it all;
  drag, keyboard focus and touch as before. The move listener is no longer
  behind the reduced-motion check, so a still wall still washes for a moving
  mouse; only the lean is motion-only.

  test/cinekind-wash.test.js sends the page's own script the events Chromium
  sent. Against v1.350 it fails 5 of its 8.

## v1.350

- **The leader counts, and says nothing.** "CINEKIND · PICTURE START" is
  off the foot of the countdown. The rest of it is unchanged: crosshairs, two
  circles, the sweep, 3-2-1 at 700ms a beat, then the frame burns off into
  the marquee. A real leader carries that line for the projectionist; this
  one is two seconds of black in front of a page that says the name in 100px
  type immediately afterwards.

## v1.349

- **A bigger mark in the header.** 56px, up from 42, and 46 from 38 at narrow
  widths: 164x56 against 123x42 on a desktop. It grows into slack the nav
  already had rather than taking any new room, because the nav is a fixed
  80px and --nav is measured from the header's rendered height. Every sticky
  offset on the site is keyed to --nav - the header's own top, the wall's
  subnav dock and its anchor margin, the cinekind overlay's reserve - so a
  taller header would have moved all of them at once. It is still 81px with
  its border, and the mark now leaves 12px above and below.

  The on-dark variant needed no second number: it is a background on the
  anchor at background-size:contain with the image held at visibility:hidden,
  so it sizes from the same rule. Checked on both.

  A test holds the relationship, so the next bump fails rather than quietly
  driving the header height and every offset under it.

## v1.348

- **Both halves of the academy's view toggle are visible, and two more found
  with them.** The strip behind that toggle is #151515 and its buttons draw
  no ground of their own, so the unpressed icon sat at rgba(17,17,17,.6):
  the view you are not in was the one you could not see, which is the half
  of a toggle that has something to tell you.

  The check added in v1.342 was a hand-written list of places this had
  already happened, so it sat green while this one shipped. It finds the
  grounds itself now: any rule declaring a dark background is a ground, and
  anything under one that sets dark type without a real background of its own
  is the fault. Its first draft still missed the toggle, because it read
  background:none as "this rule owns its ground" when that is precisely the
  fault case. With that closed it swept the site and found two more:

  quiz.html's featured offer, background:var(--deep), had its description,
  eyebrow, price note, Add button text and border, stepper and struck-out old
  price all in ink. The card the page is pushing was a black rectangle with a
  name and a price on it and nothing else legible.

  get-involved.html's quantity stepper is background:var(--ink) with white
  type, and its minus and plus were color:var(--ink). The two controls the
  stepper exists to offer could not be seen at all.

## v1.347

- **The credit reads above the word, not across the trophy.** v1.341 put it
  in the sky over the reel, which held on the window it was measured on and
  nowhere else. The sky is not a place on that page, it is a function of the
  window: the reel starts at 16.9% of the picture's height and the picture is
  object-fit:cover, so 1440x900 leaves 28px under the header, 1190x616 leaves
  none with the reel's top already behind the navigation, and 1024x640 hides
  the whole top of the trophy. No vertical position above the trophy survives
  a short window.

  Above the word there is between 275 and 476px of clear frame at every shape
  measured, all of it plinth, rock and blurred ground, so the credit sits
  there and the frame reads as a title card: who presents it, what it is,
  the way in. Clearance from the gold, measured: 28px at 1190x616, 61 at
  1512x760, 62 at 1024x640, 87 at 1680x850, 133 at 1440x900, 169 at 420x860.
  The overlay still reserves the header on the layer that carries the copy,
  which is what page-shell asks of a full-bleed hero.

## v1.346

- **One line on long form too, not just on short form.** v1.345 had the
  subnav cover the header's rule when it docks, which fixed the pages where
  it had already docked and missed the one place it had not. The bar sits
  exactly 51px above #longform in the flow, so an anchor jump lands its top
  at (ann + nav + N) - 51. N was 63, putting it at 127 against a dock point
  of 114: thirteen pixels short, header rule above the links and its own
  below. Short form is far enough down the page that the bar has docked
  before you arrive, which is why one screen showed two lines and the other
  one.

  N is 44, so every jump docks it. The 63 came from 1 Sep 2026, to stop the
  LONG FORM title landing under the bar, and the two requirements are in
  direct conflict: clearing the bar with the scroll margin is what stops the
  bar reaching its dock. The title is held clear by the section's own --band
  instead, 76px at its smallest against the 6px of section top the docked bar
  covers. Measured at all three anchors: bar docked at 114, section top 159,
  title 281, one rule on the strip. The test now checks both halves, and
  fails on the old 63 naming the reason.

## v1.345

- **One line under the wall's bar, not two.** The header carries a bottom
  border and the sticky subnav carried its own, so docking the subnav put two
  rules 51px apart with the section links fenced between them. The subnav
  docks a pixel higher now and sits a layer above the header, covering that
  border with its own background, and the single remaining rule is the one at
  the foot of the whole bar where the chrome stops and the page starts.

  That only works if the two backgrounds match. A flat white subnav under the
  header's 96% white put a visible tonal step over the black panels, which is
  trading a line for a smudge, so the subnav takes the header's own
  background and blur. Measured over a black panel: the covered border reads
  252 against neighbours at 252 and 253, and the strip carries one rule.
  51 sits above the header at 50, below the announcement at 60, and well
  below the theatre at 90, which still covers everything.

## v1.344

- **Every journey starts its title on the same line.** The guided flow shows
  one step at a time in a section sized to the window, and the step was a
  grid set to align-content:center. A grid row is as tall as its tallest
  column, so centring it put the title wherever the column beside it happened
  to end: membership's five tier cards are 486px and the caregiver card's
  prose is 215px, which landed Join PFA. at y=200 and The card. at y=335. The
  same jump was happening between steps inside one journey, because About you
  and Pay are not the same height either. The step anchors to the top now.
  Measured after: eyebrow at 195, title at 217, left edge at 58, identical
  across volunteer, membership and caregiver, and the same on step two. The
  room a short step does not need falls below it, where nobody is reading.

## v1.343

- **The Wall gets its dark panel back.** The waiting panel, which is the
  largest thing on that page and stands on it twice, had been flipped to
  background:var(--stone) with color:var(--ink): a white panel on a white
  page. The button inside it is background:#fff;color:var(--deep), a white
  chip built to be struck against black, and --deep is used nowhere else on
  wall.html, so on white it had no edge and Submit your work read as bare
  floating text. The sheen behind the type was a dark wash on white, which
  is a smudge rather than a brushed light. The panel is var(--deep) again,
  its type is white, and the sheen runs light across it.

  Fourth instance of the sweep of 15 Sep 2026, and the first where the
  background was flipped rather than the type, so the v1.342 check did not
  see it. The panel is on that check's list now.

- **The hero stops buying white it has nothing to put in.** It was capped at
  56svh, which on a tall window left 388px of nothing under two buttons. The
  cap is lower. It was sized for a hero with more in it: .wall-hero .meta is
  still styled with nothing in the markup using it, and .hero::before is an
  empty picture layer at background:none. Both are noted where they sit.

## v1.342

- **The hovered poster says whose face it is.** Putting a hand on the wall
  swapped the corner title for the honouree's name, and the name was set to
  color:var(--ink) - #111, on a wall of dark posters - so the one thing the
  hover exists to tell you was the one thing you could not read. The award
  line under it stayed legible the whole time, because it inherits from the
  label's own white p rule and was never given a colour of its own. The name
  is #fff now, which is what the title it replaces has always been.

  Third time this has shipped: the membership tier in v1.339, the chosen
  donate amount in v1.340, this. So there is a check for it now. It names
  the grounds that are dark and fails on any rule standing on one that sets
  ink type without setting a background of its own, which is the shape all
  three had. It does not guess: a rule that makes its own ground, like the
  gold Enter button holding #0a0a0a, is left alone.

## v1.341

- **CineKind gets its whole frame back, and its opening line.** The marquee
  carried padding-top:calc(--ann + --nav) over a #0a0a0a background with a
  transparent header on top of it, so the top 115px of the page was the
  section's own black rather than the photograph: the black band, and the
  reason the picture began under the navigation instead of behind it. The
  padding is gone and the plate starts at the top of the viewport. The
  presenter credit is back over the picture and above the trophy, in the
  28px of sky between the header and the top of the reel, carrying its own
  shadow because the clouds behind it are white in places. The .marquee__
  eyebrow rule had been left in the stylesheet with nothing using it, which
  is what the element used to be. The bar keeps the where and the when so it
  is not saying the same sentence twice.

## v1.340

- **The donate panel has a picture, and dollars say what they buy.** The
  left of the page was a heading, a screen of nothing, and one sentence
  pinned to the floor; the ring made from a 500 note goes in the nothing,
  between the word and the line about the gift. Dollars were four bare
  figures beside a sentence that still described the last rupee amount, so
  $25 read as "rabies shots for five street dogs" whatever it came to. Each
  dollar preset now carries what it funds, the panel follows the dollars and
  hands the rupee line back on the way out, and a typed figure is costed the
  same way. Two faults found on the way: the caption on a selected amount was
  rgba(17,17,17,.7) on #111, so the one card a donor had decided on was the
  one card that would not say what it bought, and Other amount in dollars
  toggled a class the stylesheet does not answer to, so it opened nothing.

## v1.339

- **The chosen tier speaks its whole line.** Selecting a membership
  turned its card ink, and the card's description - "A PFA T-shirt and
  the book...", the reason to choose it - went dark on dark: the
  visibility sweep had flipped that rule to ink because it carries no
  background of its own, the black living on the parent. The selected
  description is white again, at its old weight, and the note beside
  the rule says why so the next sweep walks past it.

