# PFA site — ink build

The site now runs on the black and blue theme from `index.html`, and pages and
sections can be turned off from the console instead of being deleted.

## The palette

One set of tokens, identical on all 19 pages:

| token | value | what it is |
|---|---|---|
| `--white` | `#0E1116` | the page |
| `--porcelain` | `#12161C` | a lifted slab |
| `--band` | `#080B0F` | a band that was dark on the light site, now a well |
| `--ink` | `#F4F6F7` | type, and the inverted slab a button sits on |
| `--ink-soft` | `#DCE3E8` | long-form lines |
| `--blue` | `#00A4FF` | unchanged |
| `--blue-ink` | `#5BC4FF` | lifted so links read on ink |
| `--hair` / `--hair-soft` | white at 14% / 7% | separators |

The token names kept their meanings, so `background:var(--white)` is still the
page and `color:var(--ink)` is still type. Only the values moved.

Held back from the conversion: the brand blue, the Patron Card's gold and foil,
the hologram, video and scrim blacks, and the surfaces that were already dark by
design. Those keep their authored colours; only their background token moved, so
an accent band is still an accent band rather than a white slab.

Type on a blue fill stays dark. Dark on `#00A4FF` is the readable pairing.

## Turning pages and sections off

In the console: **Site → Pages and sections**. Every page and every content
section has a switch, and Save applies it to the site immediately.

- A page turned off stops resolving and stops being linked from the nav, the
  menu and the foot.
- A section turned off leaves its page in place and drops that block.
- Nothing is deleted, so anything can be turned back on.

Journey steps are deliberately not listed. The store's product, prescription and
tracking views, the adopt and volunteer flows, and the give checkout are steps in
a path, not content, and hiding one would break the path.

**Making it permanent.** The console change lives in the browser it was made in.
To ship a change, use **Copy as defaults** and paste the snippet over the last
line of `pfa-site-map.js`. That ships hidden and needs no console.

## One opening line

The gap between the fixed header and the first block of content used to be set
in a different place on each page: sometimes on the `<main>`, sometimes on the
hero section, sometimes on a `.wrap` inside it, with values from 105px to 196px.
Pages opened anywhere between 108px and 305px down.

`tools/layout.py` measures where that gap actually comes from on each page, pins
it to one value, and zeroes any other padding above it in the same chain. It
then reloads, measures where the first glyph landed, and takes the remainder off
the padding, because the first line of text sits a different distance inside its
container on each page.

The value is the home page's: `calc(76px + clamp(26px,3.5vw,48px))`, 124px on a
desktop. All sixteen standardised pages now open on exactly that line, spread
0px at 1440 and 1024 wide.

The home page hero used to centre its content in the viewport, so it opened
lower than its own padding line and moved with the window height. It is now
anchored to that line, which is what lets every other page match it. One line in
`tools/index_align.py` if you want it centred again.

**Left alone:** the store and the gauntlet. A full-bleed carousel and a game
screen have their own reasons to start where they do.

## The Patron Card corners

The radius was written as `clamp(13px, 4%, 20px)`. A percentage in a border
radius resolves against the width for the horizontal arc and the height for the
vertical one, so on a 500 x 315 card the used value came out around 20px across
and 13px down: four ellipses rather than four arcs, changing shape with every
resize, and the two faces resolving them independently.

Measured on a magenta backdrop, the corner arcs reached 15.5 x 10.5 CSS px, a
ratio of 1.48. They now reach 14.5 x 14.5 on all four corners, from a single
length shared by the card and both faces.

### The card face

Three further corrections, all in `tools/tweaks.py` and each revertible on its own:

- **The mark is never recoloured.** It carries its own blue and white on the
  card exactly as it does everywhere else on the site.
- **The ground.** The face was a neutral charcoal. A navy wash now lays over it,
  sampled against the reference card: its navy field is rgb(14,23,34) at hue
  213, and the card now lands on rgb(16,24,34) at hue 215. It washes over the
  ground rather than replacing it, so the guilloche still shows through.
- **A hairline rule set in from the edge**, in the reference's gold, which is
  what makes a card read as a plate rather than a printed rectangle. The mark
  repeats large and faint on the right at 6% opacity, tone on tone.
- **The photo window.** A flat slab with square corners cut into a rounded,
  foil-edged card, which read as a hole. It now has a hairline in the card's
  gold, a corner that follows the card's own, and a little depth.
- **The middle band.** It is 46% of the card's height and its content was
  pressed into the last twelfth, leaving the face looking half empty. The
  number and name now sit in that band, where the embossed line sits on a real
  card: the number moved from 68% down the face to 51%.

## The menu sheet

The menu was a translucent sheet over a 34px blur, so what it looked like
depended on the page behind it. Over the film hero on Watch. Listen. Do. Meet.
it picked up the photo and rendered mottled and brighter than elsewhere;
measured across seven pages the sheet varied by 8.8 in luminance with identical
CSS on every page. The difference was the backdrop, not the styling.

It is now an opaque sheet carrying the same sheen and rim, with the blur
dropped as redundant. Measured again across eight pages: 16.72 luminance on
every one, spread 0.00. Type, spacing, stagger and timing were always shared,
since they live in `pfa-header.js`.

## The moving parts

| file | what it does |
|---|---|
| `pfa-site-map.js` | what can be shown and hidden, plus the shipped defaults |
| `pfa-visibility.js` | applies it, before first paint so nothing flashes |
| `pfa-glass.css` | retuned by hand: panels take the quiet recipe on ink |

To add a section to the registry, give the `<section>` a `data-sec="key"` and add
that key to its page in `pfa-site-map.js`.

## Rebuilding

`tools/build.sh <clean-light-repo> <output>` regenerates this whole build:
palette conversion, glass retune, measured contrast pins, the visibility
registry and the console panel. Run it against an updated repo rather than
re-converting by hand. The `tools/` folder is build machinery and can be deleted
from a deployment.

## Checks at the time of the build

Two scans run over the build. The first looks at what is on screen. The second,
`tools/deepscan.py`, looks where the first one cannot:

- later steps of a flow and other markup that is present but not shown yet
- the SPA views that the store, adopt and give pages switch between
- markup that shared scripts write at runtime, which is how a widget styled on
  one page but used on six can arrive unstyled on the other five

Results: 0 nodes flagged by either scan across 19 pages. The light site it
replaces flags 26 by the shallower measure alone. No page throws at load. Every
page is under 6% light pixels, and the rest is photography.

Both are worth re-running after a content change: `python3 tools/deepscan.py <dir>`.
