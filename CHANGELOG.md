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

