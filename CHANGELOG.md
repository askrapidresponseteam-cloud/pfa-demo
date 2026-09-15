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

