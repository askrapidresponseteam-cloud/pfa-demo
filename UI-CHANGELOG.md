# People for Animals v1.32

## Changelog

**v1.32** Three changes, all to how the laws page argues.

*No em dashes.* Removed site wide, 65 in `laws.html`, 6 in `founder.html`, 42 in
this file, and replaced with punctuation that reads correctly rather than deleted.
Verified at zero across every page and in the rendered text at 1440px and 390px.

*Every answer now cites its provision.* All 200 answers were rewritten and each
carries a Basis row naming the section it rests on: 97 distinct instruments,
including PCA 1960 sections 3, 11(1)(a) to (o), 12, 15, 22, 28, 29, 35 and 38,
BNS 2023 sections 325 and 291, BNSS 2023 sections 173, 175(3) and 223, the ABC
Rules 2023, the Transport of Animals Rules 1978, the Draught and Pack Animals
Rules 1965, the Case Property Animals Rules 2017, the Wildlife (Protection) Act
1972, the KPSPC Act 2020, and Articles 21, 48, 51A(g), 226 and 32. Case law
includes AWBI v. A. Nagaraja (2014) 7 SCC 547, the 2023 Constitution Bench, N.R.
Nair (2001), Chablani (Del HC 2021) and PFA v. Md Mohazzim (Del HC 2015). The
citation chips are clickable and act as a filter, so clicking BNS 2023 s.325
pulls the 18 questions that rest on it, which is the view you want when drafting.

*The answers argue for the animal.* The old text stopped at the PCA Act's token
fine, which reads as a reason not to bother. Every such answer now names the
provision that actually carries a sentence and tells the reader to charge both.
The worked example is A2: the PCA fine is stated, then BNS Section 325 with up to
five years, then the instruction never to file under the PCA alone. Seizure
answers point at the Case Property Animals Rules 2017 so the animal does not go
back to the accused during trial, refusal to register an FIR points at BNSS
Section 173(4) and 175(3), and the closing band is now a filing guide rather than
a reading list.

Caveat retained and strengthened on the page: this is not legal advice, and the
section numbers and citations need checking against the bare Act before anyone
relies on them in a complaint or in court.

**v1.31** `laws.html` is a real page now rather than a placeholder hero. It
carries all 200 questions from the Karnataka/India Q&A set, in four parts: dogs,
cows and cattle, animal husbandry, and horses and working equines.

Every question is in the HTML, not fetched or rendered by script, so the page
works and is indexable with JavaScript off; the script only hides, shows and
opens. The sticky filter bar searches question *and* answer text, and when a hit
matches only in the answer the item opens itself and is marked "match in answer"
so the reason is visible, capped at 25 so a broad word like "act" does not
unfurl all 200. Part chips narrow to one section, the counts in the bar and on
each part heading follow the filter, Escape clears the search, and there is an
expand/collapse all. A shared link of the form `laws.html#b17` opens that
question and scrolls to it.

The page leads with a standing note that this is information and not legal
advice, since the source document says as much and the subject warrants it. A
band summarises the five 2025–26 developments that make older advice wrong, and
the closing section points at indiacode.nic.in and awbi.gov.in for the bare Acts
and Rules rather than pretending the summaries are authoritative. `.btn--outline`
was carried over from v1.30 so the secondary button stays legible on the light
band.

Note: the home page in this build is the v1.27 hero (full-bleed photograph with
the type over it), as supplied, the v1.29 band hero was not reapplied.

**v1.30** "Find your nearest unit" on `founder.html` was using `.btn--light`,
which is the dark-surface variant: its hover state is white text on a transparent
background, so on the pale stone band the label washed out to **1.11:1** the
moment the pointer touched it. Added `.btn--outline`, the inverse of `.btn` for
light surfaces, ink text and ink border at rest, ink fill and white text on
hover, and applied it there. Measured from the rendered page: 17.0:1 at rest,
18.9:1 on hover. The inline `border-color` override that was patching over the
wrong variant is gone.

Known, not fixed, pre-existing: on `cinekind.html`, `wall.html` and
`pfa-shop.html` there are nine buttons where the drawn cursor itself disappears
on hover. The cursor decides its colour with `closest()` against a list of dark
surfaces, so a white `.btn--light` or `.btn--ghost` sitting inside a dark panel
inherits the panel's classification and draws a white cursor on a white button;
`.btn--sm` on the shop hits the mirror case. The durable fix is for the cursor to
read the luminance of the element actually under it rather than match a selector
list, which changes cursor behaviour on every page and was left alone here.

**v1.29** Reworked the home hero again. v1.28 had kept the type off the
photograph by splitting the section into two columns, which shrank the picture to
about half the width and filled the rest with a black panel. It is now a single
column: the photograph keeps the **full width of the page** and the words sit in
a band directly beneath it, on the same white as the sections below. Nothing is
printed over the picture, so the scrim that used to darken it stays gone, and
there is no black filler anywhere. Both the picture and the words are visible
without scrolling.

The headline is two lines rather than three so the band stays shallow and the
photograph keeps the larger share of the height, and it now sits on the same
gutter as every section below it: the band's inner block has automatic side
margins, which cancel the stretch it would otherwise get as a flex item and had
left it shrink-wrapped and centred. Stacked below 860px the order is headline,
standfirst, button. The hero's `data-cursor="light"` was dropped, since a white
cursor over a pale photograph and a white band would have been invisible.
Checked at twelve widths from 1600px to 320px: no headline, standfirst or button
ever intersects the picture, and the picture is full-bleed at every one.

**v1.28** The home page hero no longer prints white type over the photograph.
It was a full-bleed picture with the headline laid across it, which put the words
over the subject's face and made legibility depend on a scrim darkening the
image. It is two columns now: the words on a solid dark panel, the photograph
whole and undimmed beside it. The scrim is gone, the headline scales to its
column, and below 860px the section stacks with the picture first. Checked at
twelve widths from 1600px to 320px: the headline, standfirst and button never
intersect the picture's rectangle at any of them.

Also fixed, and pre-existing: on the home page below 860px the left-hand nav
links stayed visible and collided with the wordmark. The rule meant to hide them
was `header nav>div:first-of-type{display:none}`, which loses to the inline
`display:flex` on that div; it now carries `!important`.

Note for future edits: this page is a self-extracting bundle and its real markup
lives as a JSON string inside `<script type="__bundler/template">`. Edit it by
decoding that string, changing the HTML, then re-encoding with `json.dumps` and
replacing every `</` with `<\u002F` so a literal `</script>` in the payload
cannot close the tag early.

**v1.27** Fixes to the Watch theatre on `founder.html`.

*Picture.* The clips were being blown up because the player box was sized from a
guess at their shape and Facebook's plugin then scaled to fill it. The box is now
sized in pixels to the largest rectangle of the clip's own shape that fits the
stage, and the real width is passed to the Facebook plugin so it renders at size
instead of scaling. Nothing on this page scales a clip. Both Facebook clips now
default to 9:16, since these are social posts and vertical is the safer
assumption; a **shape control** in the player foot cycles 9:16 / 16:9 / 1:1 / 4:5,
so a wrong guess is one press to fix rather than a code edit. Two sizing bugs went
with it: the stage's padding was being counted as usable space, so the picture
could overflow a narrow screen, and the box was measured while the theatre was
still `display:none`, which left it a fraction of its proper size. Verified across
four shapes at eight viewport sizes.

*Cursor.* It was invisible in the theatre: `.cursor-layer` sat at `z-index:100`
under the theatre's `120`, so the drawn pointer rendered behind the overlay. The
layer now sits at `200`, and `.th` is registered as a dark surface so the cursor
switches to its light stroke over the player. Over the picture itself the drawn
cursor stands down and the real pointer takes over, because a cross-origin frame
swallows every pointer event once the mouse is inside it: not pointermove, and
not enter/leave on the box either (both measured, neither fires). The film's
rectangle is tested on the last move that does arrive, and opening the theatre
hands the cursor over immediately, since the picture lands under a pointer that
is not moving and no event would otherwise come. The one case still not covered is
a pointer teleporting into the middle of a playing video with no intervening
movement, which a real mouse does not do.

**v1.26** The footer's lone "Instagram" link was pointing at `#`, so it went
nowhere. It is now a real link, joined by the other three handles PFA publishes:
Instagram (`pfa.official`), Facebook (`people4animals`), X (`pfaindia`) and
YouTube (`@peopleforanimals9047`), taken from the footer of
peopleforanimalsindia.org with their tracking parameters stripped. The X link
uses `x.com` rather than the `twitter.com` address the official site still
lists, since handles carry across and it avoids a redirect. All four open in a
new tab with `rel="noopener noreferrer"`, and they sit in a
`.pfa-footer__social` nav so they stay on one row from 1440px down to 320px.
Applied to every page that has a footer; `submission-collage.html` has none.

**v1.25** A **Watch** band on `founder.html` carrying the two Facebook clips
and the Instagram reel. The tiles are facades: no iframe, no Meta script and no
third-party cookie exists until someone presses play. Clicking a tile opens a
theatre over the page in the same language as the wall's player, index and
platform top left, Close top right, arrows and an "open on the original site"
link along the foot, ← → to move between clips and Esc to close. The theatre
reshapes to each clip, so the vertical reel plays at 9:16 and the Facebook clips
at 16:9 rather than being letterboxed into one fixed box. Closing empties the
iframe, which stops playback and drops the embed.

The clips live in the `VIDEOS` array at the top of the page script. `title` is
the tile headline, `ratio` is the shape of the clip (`16/9`, `9/16`, `1`), both
Facebook clips are set to 16/9 as a guess, since neither could be inspected
behind their login wall, so flip either to `9/16` if it is actually a phone
video. `poster` is optional: point it at a still (e.g. `img/watch-01.jpg`) and
the tile uses it as a darkened grayscale background; left empty the tile is type
only. Titles are placeholders, replace them with what each clip actually shows.

**v1.24** The founder portrait is now a real photograph, self-hosted in `img/`.
Because it is a 3:2 landscape and the old hero cropped to a tall column (which
would have cut the dog and the desk out of frame), the hero was rebuilt: the dark
band now carries the name, role and quote across two columns, and the photograph
runs full-bleed beneath it at its own proportions with a caption under it. It
holds 3:2 until that would make it taller than the screen, then crops from the
top and bottom only, so nothing is ever lost left or right; below 860px it goes
to 4:3. Served as a grayscale JPEG at 1536w and 960w through `srcset`
(2.6 MB PNG in, 242 KB out), with `width`/`height` set so the page does not shift
as it loads. The `onerror` fallback still applies: without the `img/` folder the
frame degrades to its labelled placeholder rather than a broken image. The five
gallery pictures further down the page are still hot-linked from
peopleforanimalsindia.org and still need self-hosting.

**v1.23** `founder.html` is now a real page rather than a placeholder. Split
hero (dark panel, portrait alongside), a hairline band of figures, the
chairperson's message, a six-part strategy grid, a photo mosaic and a closing
call to action, all on the existing tokens, square corners and Marcellus display
type, with no new fonts or colours.

Content is drawn from peopleforanimalsindia.org (home and About) and rewritten
rather than copied; the one quoted line, "Compassion without action is evil", is
attributed on the page. Figures used are PFA's own About-page prose: founded 1994,
26 hospitals, 165 units, 60 mobile units, 2.5 lakh members. Note that PFA's own
home page banner says 5 lakh members and 160+ units, which contradicts its About
page, confirm which is current before publishing.

Photographs: every `<img>` currently points at a file on PFA's live server so the
page renders complete, and each is marked in a comment at the top of `<main>` to
be downloaded, rights-checked and re-pointed at a self-hosted copy. Each frame
carries an `onerror` that removes the failed image and reveals a labelled
placeholder, so a dead or swapped source degrades to a clean slot instead of a
broken-image icon. Target sizes: portrait 1200×1600 or larger, gallery
1600×1100 or larger.

**v1.22** A **Founder** link now leads the left-hand nav group on every page,
ahead of Laws / Units / The Wire / The Wall, and `founder.html` backs it. The page
is built on the same shell as `laws.html`, `units.html` and `the-wire.html`: hero
and placeholder copy only, with no biography written for it, drop the founder's
name, portrait and story into the `<main>`. Because `.navgroup.left` is hidden
below 860px, Founder is also in the footer's About column, so it is reachable on
a phone; the footer stays identical on every page. `submission-collage.html` is
unchanged: it has no site header or footer. The home page keeps its nav inside an
escaped string, so its copy of both links was patched there.

**v1.21** `donate.html` now carries two ways to give, chosen from a pair of
cards at the top of the card: **Donate to PFA** (the money flow from v1.20,
unchanged) and **Send food to a place**. A line under the cards names which one is
selected and what it means. Each flow keeps its own state, so switching between
them loses nothing.

The food order runs 01 Place / 02 Food / 03 Details / 04 Done. Place takes state,
district or city, an optional village and an optional PIN code; the PIN suggests
the state (all 36 states and union territories, with the awkward prefixes handled:
403 Goa, 605 Puducherry, 826 and 834 Jharkhand, 263 Uttarakhand, 160 Chandigarh,
744 Andaman, and the seven north-eastern circles under 79). It is always shown as a
suggestion to confirm, never a silent fact. Food is a small catalogue with quantity
steppers; the `FOOD` array at the top of the page script holds the items, their
weight and their price, and the running total drives both weight and money. Details
takes name, email and a mobile number, since the volunteer's number is shared back
and the two of you arrange the handover directly.

The dark panel carries the live order the way it carries the gift line: total,
destination and total feed, updating on every change. On desktop it is now sticky,
so the running total stays in view while the form scrolls; below 860px a compact
total travels with the item list instead. The currency toggle sits on 02 Food where
the prices actually are, and USD is display only, with the rupee figure that will
be charged always shown next to it (`FX` in the script; wire it to a real rate).
Quantity changes update only the row that changed, so keyboard focus survives
repeated presses. The food flow makes no 80G claim: the tax treatment of an in-kind
purchase is a finance decision, so PAN is not asked for there. Campaign links work
for both: `donate.html?flow=food&state=Karnataka&district=Udupi` and
`donate.html?amt=2000&freq=monthly`. Both `submit` handlers are still where the
payment gateway goes.

**v1.20** `donate.html`, step 01 rebuilt so one amount is selected at all times.
The blank "Other amount" box no longer sits open under a chosen preset: "Other
amount" is now a fourth choice in the same group, and picking it turns that row
into the field (presets let go, the field takes focus). "Presets" returns to the
last chip used. A typed amount is grouped on blur (₹7,000, not 7000), digits only,
capped at ₹5,00,000, and Enter continues. Continue now says why it stopped instead
of silently focusing an empty box. An off-preset amount gets a real impact line
("14 days of food and care") from the `UNIT` table rather than "towards rescue and
care". Switching once/monthly keeps a typed amount and moves a preset to its
opposite number in the other tier instead of resetting to the middle. Monthly
gifts explain the UPI AutoPay or card standing-instruction mandate on 02 Details.
PAN is checked against the real format. Campaign links can arrive pre-set:
`donate.html?amt=2000&freq=monthly`. Amounts, impact lines and the per-unit
fallbacks are all in `AMTS` and `UNIT` at the top of the page script; the `submit`
handler is still where the gateway goes.

**v1.19** `donate.html`, a three-step gift flow on the site shell. Left: the
ask and a live "Your gift" line that names what the chosen amount does. Right:
01 Amount (give once / monthly, three amounts with what each funds, or another
amount), 02 Details (name, email, optional PAN for 80G, UPI or card), 03 Done
(a thank-you naming the amount and where the receipt goes). Front-end only: the
`submit` handler in the page script is where the payment gateway goes; the
amounts and impact lines are in the `AMTS` object above it. Every Donate button
and footer link on every page now points to `donate.html`.

**v1.18** Each wall has its own theatre. "Watch in theatre" on the short form
wall, any short tile, or `wall.html#theatre-short` opens the theatre with only
the short pieces; the long form link, "Theatre" in the section bar, long tiles
and `#theatre-long` open it with only the long ones. The wordmark carries a
Long / Short tag, the short filmstrip uses 9:16 frames, and short clips are shown
whole (contain) rather than cropped to the landscape stage. The ruler and the
next-piece autoplay run within the open playlist.

**v1.17** Home hero is one surface again. The blurred side-fill behind the
contained photo read as a second grey band on each side, so it is gone; the photo
now fills the frame edge to edge (`object-fit:cover`, framed at 18% from the top,
top-anchored below 860px). The `.hero-fill` element is still in the markup but
hidden, so nothing else moved.

**v1.16** Theatre: the filmstrip, ruler and foot links sit over the film and
slide away while the mouse is on the film, so the picture runs to the bottom
edge; bring the mouse down to the lower part of the screen and they return. They
show for a couple of seconds on open, and stay put on touch screens.

**v1.15** Theatre mode on `wall.html`. An edge to edge player that takes over
the viewport: clock and sound toggle top left, wordmark top centre, progress
meter and Close top right, the film filling the stage, Play/Pause state with the
elapsed time on the right, index and title bottom right, a filmstrip of every
piece, a numbered ruler with a playhead, and the wall's own links along the foot.
Opens from "Theatre" in the section bar, "Watch in theatre" on the long form
wall, any tile, or `wall.html#theatre`. Clicking the stage plays and pauses;
Esc closes, ← → move between pieces, space toggles, M toggles sound, F goes
fullscreen; the ruler seeks. One piece runs into the next. Sound starts off so
autoplay is allowed. The films live in the `WALL` array at the top of the page
script: an `mp4` `src` plays in the site's own player (timecodes, ruler, autoplay
to the next piece); a `yt` or `vimeo` id embeds that service's player instead.
Six placeholder films (Blender Foundation open movies and Google sample clips)
are in there so the walls and the theatre render; replace them with approved
submissions. The two walls now render tiles from the same array and hide their
empty states when there is something to show.

**v1.14** Home hero fits the first screen: height is the viewport minus the
pinned bar, so the whole photo and the Enter PFA button are visible without
scrolling. The photo is shown complete (`object-fit:contain`); a blurred copy of
the same photo fills the width behind it so the panel stays edge to edge. Below
860px the photo fills the frame, anchored to the top.

**v1.13** `wall.html` (The Wall, the community film wall) rebuilt in the site
theme from the supplied page: dark full-bleed hero, sticky section bar under the
nav, long-form and short-form walls (empty states until the first approved piece;
`[data-wall]` grids are ready for tiles), three-step explainer and the submission
form with front-end validation and a confirmation. The form does not post
anywhere yet: wire the `submit` handler in the page script to your backend.
"The Wall" is now in the header on every page and the footer points to it; the
picture wall (`submission-collage.html`) is linked from the wall's section bar and
links back to it.

**v1.12** Home hero photo is now a plain `<img>` (`object-fit:cover`, anchored
top) instead of an `image-slot`, whose own framing was still zooming the picture
in. At the hero's 3:2 ratio (desktop) the whole photo shows edge to edge with no
crop; below 860px it fills the viewport, cropping from the bottom. To replace the
photo, swap the `src` on `#hero-media` and, if the new picture is not 3:2, update
the hero `aspect-ratio`.

**v1.11** Header left group is now Laws / Units / The Wire on every page
(was Adopt / Programs / About Us). Three new pages back them: `laws.html`,
`units.html`, `the-wire.html`, built on the events page shell (same head, nav,
footer, cursor) with a hero and placeholder copy only, drop real content into
each `<main>`. Adopt, Programs and Our story remain reachable from the footer.

**v1.10** Home hero shows the whole photo. Above 860px the hero is full-bleed
at the image's own 3:2 ratio (`aspect-ratio:3/2`, height auto), so the woman and
the dog are fully in frame edge to edge with no crop. Below 860px it goes back to
filling the viewport with the crop anchored to the top of the photo. If the hero
photo is replaced with one of a different ratio, change the `aspect-ratio` to
match.

**v1.9** Pure white. The nav and sticky filter bars were 94% white over a blur,
which read as a grey tint over darker content; they are now opaque `#fff`. The
off-white `--bone` fill (`#faf9f7`, used on the home quiz card, shop impact band
and the bone bands on events/CineKind) is now `#fff`. The `--stone` grey
(`#f4f3f1`) is kept where a panel needs to sit apart from the page: story cards,
kits band, product tiles.

**v1.8** Logo enlarged on all four pages: 36px → 52px tall in the nav, 28px → 40px
below 560px. The nav grows with it; the home hero offset and the shop/events
sticky bars measure the real header height, so they follow automatically.

**v1.7** Light/dark theme removed (v1.5) after it did not hold up in use; pages
are back to the single light theme with no theme script, tokens or button. Home
hero fix kept: the hero starts below the pinned bar (`--bar`, measured from the
real header) and the hero `image-slot` is anchored to the top of the photo rather
than centre-cropped, so the subject's head stays in frame. Automatic anchoring
stands down if the slot is reframed by hand in the editor.

**v1.4** Footer fix on all four pages: `.pfa-footer p{margin:0}` was overriding
the label and wordmark margins (higher specificity), so labels sat flush against
their first link and the wordmark overlapped the link rows. The reset now targets
`.pfa-footer__base p` only. Home page section spacing selectors updated to the
renamed sections (Hens, Pigs, Minds grid, Feelings grid, Findings, Test yourself).

**v1.3** Fix: a doubled backslash in the home page card data (`horses\' heart`,
`Cows\' ears`) broke the page script in v1.2, so the home page rendered without its
card content. Script now parses cleanly.

**v1.2** Home page content rebuilt as an educational experience about farmed
and working animals (hens, pigs, cows, goats, sheep, horses), sourced from
peer-reviewed studies; design, header, hero and footer unchanged. `The Wall`
(`submission-collage.html`) linked from every footer and given a back link to the
home page. Zip now ships all five pages together.

**v1.1** Single pinned bar, unfiltered logo, shared footer, newsletter removed.

**v1.0** Initial home page and shop.

Five pages, all standalone HTML. Keep them in the same folder so the links between
them resolve.

| File | What it is | Runs standalone |
| --- | --- | --- |
| `people-for-animals.html` | Home page. Bundled export, assets embedded. | yes |
| `pfa-shop.html` | Shop page, built here. No dependencies. | yes |
| `events.html` | Events 2026, built here. Linked from every footer. | yes |
| `submission-collage.html` | The wall. Bundled export, assets embedded. | yes |
| `cinekind.html` | CineKind Awards 2026, rebuilt here in the site theme. | yes |
| `wall.html` | The Wall, community film wall, built on the events shell. | yes |
| `donate.html` | Donate. Three-step gift flow, built on the events shell. | yes |
| `laws.html` | Laws. Hero + placeholder, built on the events shell. | yes |
| `units.html` | Units. Hero + placeholder, built on the events shell. | yes |
| `the-wire.html` | The Wire. Hero + placeholder, built on the events shell. | yes |

## cinekind.html is missing its dependencies

This page is not a self contained export. It loads shared files that were not
supplied, so on its own it renders as unstyled text with broken media:

Stylesheets: `assets/site.css`, `assets/header-footer.css`, `assets/cinekind-page.css`

Scripts: `assets/site.js`, `assets/data.js`, `assets/cinekind.js`,
`assets/pfa-global-search.js`, `assets/pfa-location.js`,
`assets/pfa-product-search-index.js`

Media: `media/pfa-logo.png`, `media/pfa-emblem.png`, three mp4 files, and twelve
webp images under `media/cinekind-2025/`

It also links to eighteen sibling pages that are not here, including `index.html`
and `store.html`.

## Links between the pages

The home page header links to `pfa-shop.html`. The shop header and footer link back
to `people-for-animals.html` and its section anchors (`#adopt`, `#programs`,
`#story`, `#donate`). If you rename either file, update those hrefs.

## Shop page notes

Catalogue, kits and pricing live in the `P` and `KITS` arrays near the top of the
script block. Products use `pet` (dog, cat, all) and `c` (food, health, grooming,
home, toys) to drive the filter chips. Tiles are inline SVG line art, so dropping in
real photography means replacing the `.card__tile` contents and nothing else.

Constants: free delivery at 999, one day of care at 150, round up at 29.

## Fonts

Marcellus loads from Google Fonts on the shop page and is embedded in the home page
bundle. If the network is blocked, the shop page falls back to Georgia and the
layout holds.

## Layout

Both pages cap content at 1560px with `--gutter: max(16px, (100% - 1560px) / 2)`,
applied to the nav, hero, section bands, grids and footer. Backgrounds stay full
bleed. Below about 1592px wide the cap has no effect.

The shop hero reserves the fixed header with
`padding-top: calc(var(--ann) + var(--nav) + 72px)` and has no fixed height, so it
grows with its content instead of spilling under the nav. `--nav` is measured from
the real header on load and resize.

Breakpoints: 1000px, 860px, 720px, 560px, 400px.

## events.html

Four legs, each a dark panel followed by its date rows, filtered by a chip bar that
reuses the shop's filter component. Rows carry `data-type` and `data-find`; a leg
with no visible rows hides itself. The date, city and leg counts in the hero are
recomputed from the rows on load, so they cannot drift from the listings.

Event content is placeholder: real Indian cities and plausible venues, but the
dates are invented. Replace the `<li class="row">` entries with real ones and the
counts follow automatically.

## One pinned bar

The promo strip that used to sit above the nav is gone from all four pages, so a
single bar is pinned at any scroll position. On the home page this is done through
the template's own `navTop`, now fixed at 0.

On the shop and events pages the filter bar sticks directly under the nav and the
two share one hairline, so they read as a single block rather than two stacked
bars. The nav drops its bottom border in its solid state to make that join.

The hand-drawn cursor now runs on all four pages, with each page listing its own
dark surfaces so the stroke flips to bone over them.

## The logo

All four pages show the supplied mark in its own colours. The home page previously
applied `brightness(0) invert(1)` over the hero, which flattened it to a white
silhouette; that filter is gone and `logoFilter` is now always `none`.

Nothing sits behind the mark. The nav is a light bar on every page and at every
scroll position, so the transparent PNG reads directly against paper. That removed
the two-state nav entirely: no colour flip, no filter, no plate.

The mark renders at 52px tall (40px below 560px), centred in the bar and goes flush left below 860px. It links to
`people-for-animals.html` from every page, and to the top of the page on the home
page itself. If you rename the home file, update those four hrefs.

The other three pages carry the PNG inline as a data URI, so it renders with no
dependency on a media folder.

## The footer

One block, identical on all four pages, verified byte for byte. The markup is in
`footer.html` shape and its stylesheet is the `.pfa-footer` block at the end of each
page's CSS. To change the footer anywhere, change it in all four, or lift both into
a shared include.

It is self contained: every value it needs is declared on `.pfa-footer` itself
(`--ff-bg`, `--ff-gutter`, `--ff-pad`, the two font stacks), so it does not read any
page level token and can be dropped into a new page as is.

Columns: Adopt, Get Involved, Explore, About. Every page in the site is reachable
from it, including `submission-collage.html` ("The Wall"), which links back to the
home page from its top-left corner. Links to the home page use `people-for-animals.html#anchor` so the same
markup works from any directory depth.

Layout is three stacked bands: one even row of four link groups, the wordmark, then
a hairline and the legal line. Each link group gets a quarter of the width.

There is no membership or signup block. It was removed on request, so the footer
carries navigation and the legal line only.

Breakpoints: four groups across above 860px, a 2x2 grid below it, the legal row
stacks at 720, single column at 420.

The old newsletter signup is gone from every page along with its handlers. If a
mailing list signup is needed later it should live somewhere other than the footer.
