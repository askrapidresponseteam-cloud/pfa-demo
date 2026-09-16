# People for Animals v1.60

## Changelog

**v1.60** Two tests that failed because the fetch worked.

`ship.sh` runs `npm run media:films` before the tests. It filled the two
unverified titles from YouTube, exactly as it exists to do, and the tests
asserted those two were empty. A correct page, a red suite, and a stopped
ship.

This is the same fault as v1.46, where a test asserted a caption read
"Film 05" and broke on the first build where the titles had been fetched. I
wrote a changelog entry saying a test must not depend on a step having been
skipped, and then built another one three days later.

Both are rules now rather than snapshots. No film may carry any of the five
strings I invented, named in the test so they cannot return by any route. The
three verified films must carry their real titles and MinuteEarth. A film has
either both a title and a credit or neither, because half an attribution is
the error this whole file exists about: a title with no channel reads as ours.
And a tile shows its title when it has one and its number when it does not,
which is true before the fetch and after it.

Run against the page in both states, which is the check v1.46 promised and did
not perform. The fabrication check was confirmed by putting one of the invented
titles back: it fails by name.

`npm test` 625 pass, 0 fail in both states. `lint`, `check:chrome` and `audit`
clean.

**v1.59** The academy films, correctly attributed.

Three of the five were verified and are not what this page said they were.
`bvKKHRCCkfI` is "Are You a Mosquito Magnet?", `UWagM1FBB4c` is "ALL THE CATS,
EXPLAINED" and `tuRl8moQbXU` is "ALL THE DOGS, EXPLAINED", all three by
MinuteEarth. I had captioned them as talks and interviews by a named
politician, and headed the section "The course, in her own words".

That is worse than an unverified caption. It attributed other people's work to
someone who did not make it, on the page of a real person, and it did so two
turns after I had written that inventing a title for a film of a named person
is how a page ends up describing something as what it is not. I wrote it
anyway.

The three verified titles are set exactly, credited to MinuteEarth. The two
that could not be verified carry no title and no credit, because empty is
honest where a guess is not; their tiles show the film's number until the
fetch fills them. The section is now headed for what these are: short films
made by other people, credited to them.

*And the credit comes from YouTube now, not from me.* oEmbed returns the
channel beside the title, so `npm run media:films` writes both. A film
credited to the wrong person is a worse error than an uncredited one, and no
part of that line should have been mine to type.

The tests pin all three verified pairs by id, require the other two to stay
empty, and fail if the old heading ever returns.

`npm test` 622 pass, 0 fail. `lint`, `check:chrome` and `audit` clean.

**v1.58** The academy, from the question rather than the curriculum.

*Who is actually on this page.* Two people, and only one of them is studying.
The other has an animal bleeding in front of them and about ninety seconds of
attention. Both were being greeted with a ten-module syllabus, which is
useless to the second and intimidating to the first. Every previous pass, my
own included, decorated that syllabus instead of asking who it was for.

*So the page opens with the only question that matters in an emergency.* What
is in front of you, and six answers large enough to hit without reading: is it
an emergency, hit by a vehicle, bleeding, snakebite, poisoning, collapsed in
the heat. None of it is new knowledge. All six already existed, eleven hundred
lines down inside Module 07 and Module 05, reachable only by someone calm
enough to scroll a syllabus. A test walks every one of the six and fails on a
link that lands nowhere, because a typo there sends someone holding a bleeding
animal to the top of the page.

*Seventy lessons no longer lie open at once.* That, not the quantity of
knowledge, is what made the page overwhelming: all of it on the screen at the
same moment with nothing to say where to start. A module now shows its title,
its standfirst and what it will teach, and holds its lessons until asked.
They stay in the document, so search, deep links and the filters still find
them, and everything that already revealed lessons opens the module first.

*The films moved to the front.* They were at the foot of a fifteen-hundred-line
page, which is the one place nobody reaches. They are the most inviting thing
on it.

*And the five titles I invented are gone.* YouTube could not be reached from
where this was written, so I wrote five descriptive titles from context. They
read as real and were not, which on films of a named person is worse than
useless. The tiles say the film's number until `npm run media:films` fetches
what each is actually called, and a test now fails if any title on this page
did not come from YouTube.

*Removed:* the position rail, the corner brackets and the bracketed sources
from v1.56. They were three accents nobody could see, and they were right to
be called nothing.

`npm test` 622 pass, 0 fail. `lint`, `check:chrome` and `audit` clean.

**v1.57** The academy, actually redesigned.

v1.56 added a hairline, some 9px brackets and square brackets on buttons, and
called it a rethink of how the page delivers its content. It was not. Nothing
on the page looked different, and it was right to be told so.

*Every module opens on a chapter card.* Ten modules used to begin with an h2
and a hairline rule, so seventy lessons read as one undifferentiated wall of
accordions and nothing told a reader they had arrived somewhere new. Each
module now opens on a card of ink with its number set very large behind the
title, which is what a book does with a chapter page and the reason a course
reads as a course rather than as a long article.

The numeral is a CSS counter, so the modules number themselves: reordering
them, or adding an eleventh, needs no edit to the markup and none here. And
because the numeral already says 01, the kicker above it stopped saying
"Module 01" as well and carries the course's name instead.

*The syllabus is an index, not ten cards.* A grid of cards made a curriculum
look like a blog: nothing lined up, so nothing could be compared, and the
order the modules must be read in was carried only by the numbers printed on
them. As rows with the number, the title, what it covers and the weight in
aligned columns, it reads as the table of contents it is, and ten modules can
be weighed against each other by reading down a column instead of hunting in
ten separate corners.

The standfirst under each chapter card is set against a rule, so it reads as
an opening rather than as the first paragraph of the first lesson.

`npm test` 619 pass, 0 fail. `lint`, `check:chrome` and `audit` clean.

**v1.56** The academy tells you where you are.

Filmbot's lesson is not its decoration. It is that everything on the page is
numbered, framed and credited, so a reader always knows their position in it.
The academy is ten modules and seventy lessons of reference material, and it
had no answer at all to "where am I": every lesson looked like every other and
the only way to judge how far in you were was the scrollbar.

*A position rail*, in the bar that was already sticky. The module being read,
numbered, with its own word taken from the filter chip so the page names it
once; and a hairline of how far through the course the reader has come,
measured across the lessons rather than the page, since the hero above and the
sources below are not part of the course. Both are read off the modules
themselves, so one added or removed needs no second edit.

It answers nothing before it can answer honestly. Before layout every module
reports the same offset, and a loop looking for the last one above the reading
line confidently says the tenth. It holds its opening state until there is
real geometry, which is also what makes it testable.

*The two callouts that can prevent an animal being hurt are framed*, in corner
brackets, the way a viewfinder marks what matters. They were a coloured left
border, which read as a pull quote. The brackets take the callout's own colour
so Do this and Careful stay tellable apart at a glance, and the text stays ink:
only the frame is coloured.

*A source reads as a credit.* The hundred and forty citation buttons are
bracketed, which is what they are: the basis for a claim, named.

`npm test` 615 pass, 0 fail. `lint`, `check:chrome` and `audit` clean.

**v1.55** Five films on the academy page, in the same player.

Talks and interviews that sit beside the modules, mounted on
`assets/theatre.js`: the wall's player, the same file the founder page uses.
Seek, clock, play, sound, speed, the strip, copy-link-to-this-moment, the
keyboard and full screen all came with it rather than being written a third
time.

It is called Lecture Theatre here. The Wall is a section of this site in its
own right, and a player announcing itself as that on a third page would be
pointing somewhere else.

*The bug this nearly shipped with.* The player keeps one list per wall, so a
film's place in the page's array is not its place in its own wall. The short
sits third, which pushed every long film after it down by one: tile four
opened the fifth film and tile five wrapped round to the first. Both looked
like a working player, which is why it survived the first pass and only turned
up when each tile was opened in turn and checked against the id it shows. The
index within its own wall is worked out once, at build, and a test opens all
five and fails on the wrong one.

The short is declared short, so it opens at 9:16 rather than letterboxed into
a stripe, and its tile is the same shape. The film whose link carried `t=25s`
opens at 25 seconds.

*The stills.* Served from this site, not hot-linked: the page asks YouTube for
nothing until Play is pressed, and a test fails if `ytimg.com` ever appears on
it. `scripts/fetch-founder-films.js` now covers both pages rather than a second
script being written, and `npm run media:films` fetches for both.

`npm test` 615 pass, 0 fail. `lint`, `check:chrome`, `audit` and `check:seo`
clean.

**v1.54** The waiting wall, rebuilt. The first one was a placeholder wearing a
new headline.

Two things were wrong with it, and both said the same thing to a visitor:
something is supposed to be here and is not.

*A dashed rectangle.* The original `.wall__empty` rule survived underneath the
new one, so the whole block sat inside `border:1px dashed #c9c7c3`. That is
the drawing every interface on earth uses for a missing file or a drop target.
No headline recovers from being inside it. It is deleted, along with the three
type rules it came with.

*Three hairlines through the type.* The motion I added ran full width behind
the text, which put a line across the headline and another through the button.
They read as strikethroughs. Gone.

What is there now is a band of ink, edge to edge, which is how the rest of
this site marks the thing that matters: the units call to action, the CineKind
band, the founder plate. White Marcellus at up to 108px, one line under it,
one filled control, and a line in small caps saying every piece is chosen by
hand. The only motion is a slow sheen behind the type, eleven seconds and
mostly off screen, angled so it never crosses a letter. Reduced motion parks
it.

Nothing on it stands in for content: no ghost tile, no blurred grid, no count
of nothing. It is a page, and it is gone the moment a film is approved.

`npm test` 606 pass, 0 fail. `lint` and `audit` clean.

**v1.53** The Wall waits, and approval is real.

*The placeholders are gone.* The wall shipped with four films typed into an
array: one real, three sample clips from a Google test bucket. "Approved by an
admin" meant "edited by a developer", and a public page was standing in for
submissions that had not arrived.

*Approval is now a thing an admin does.* `GET /api/wall` returns the films an
admin has put on the wall and nothing else. It does not read `status`: that
vocabulary is new, in-progress, handled and spam, and `handled` means dealt
with rather than fit to publish, so publishing on it would put every rejected
submission on the page the moment someone tidied the queue. Publication is its
own flag, `wall.published`, set by its own admin action, audited separately
and reversible. The admin case view gains one button, shown only on a wall
submission, that says which way it will go.

The route serves a projection, not the record. A submission carries the
sender's email, mobile and IP; a wall needs a title, a credit and a link. The
link is re-checked against the same six hosts the form accepts, because a row
in a database is not evidence that it is still safe to embed, and a link the
player cannot drive is dropped rather than opened onto a blank stage. The
browser never reads the collection: rules stay shut and this runs server-side.
A failure answers with an empty wall, because the waiting state is a page and
an error is a fault a visitor can do nothing about.

*The waiting state.* Type, air, and three hairlines drawing themselves across
and away. "The Wall is waiting for you", the line under it, and Submit your
work as the one filled control on the screen. Nothing on it stands in for
content: there is no ghost tile, no blurred grid, no count of nothing. It
reads as an invitation because that is what it is, and it disappears the
moment a film is approved.

*The tests stopped depending on editorial content.* All 38 theatre tests drove
whatever films the page happened to ship. They carry their own fixture now and
feed it through a stubbed `/api/wall`, which is where a fixture always
belonged: a test should not need a placeholder film kept alive to keep it
passing. Asking for the feed moved to the end of the page's setup, after
everything the build reaches for exists.

`npm test` 606 pass, 0 fail. `lint` and `audit` clean, 25 API routes.

**v1.52** Two reasons YouTube had to choose a low quality, removed.

Quality cannot be set. `setPlaybackQuality` became a no-op in 2019 and the
undocumented `vq` parameter went with it; the player decides, from the frame's
measured size and its first read of the connection, and it decides inside a
cross-origin frame nothing here can reach. So there is no switch to throw.
What there is is a pair of things this player was doing that could push the
decision downwards.

*The frame was built before the stage was measured.* `open()` takes the
theatre from display:none to visible, then builds the embed one line later,
with no layout in between. A browser is free not to have laid that out yet,
and an embed created into a stage of no size is an embed YouTube measures at
nothing, which is the size the lowest tier is chosen for. Reading the stage's
offsetHeight forces the layout first, so the frame is born at full size. A
test pins the order: show, then measure, then build.

*The first bytes arrived behind a cold handshake.* The connection to Google is
now warmed by a preconnect. Deliberately not in the page head, where it would
contact Google on load and break the promise this section is built on, but
from `loadYtApi`, which is already the moment a visitor shows interest: it
runs on hover over a film and on open. A test fails if a preconnect ever
appears in the page itself.

Neither forces anything, and on a good connection with a large player both may
change nothing at all. They remove the two ways this page could have been the
reason for a soft picture.

*Worth knowing, from the fetch log.* Seven of the eight films return a
`maxresdefault` still; `qCKHi-lA6YA` returns only `hqdefault`, at 12KB. That
thumbnail exists only for uploads of 1280x720 or larger, so that film very
likely has no HD source. Nothing done here will make it play at 1080p.

`npm test` 606 pass, 0 fail. `lint`, `check:chrome` and `audit` clean. Only
`assets/theatre.js` and one test file, so the wall gains this too.

**v1.51** The reels play here.

When the reels were moved out of the film grid, I built the strip as links to
Instagram. That was the wrong reading of why they were moved. A reel cannot be
driven from this page: nothing can reach inside the frame to seek it, time it,
pause it or mute it, and that is a reason to give it no transport bar. It is
not a reason to send someone away to watch it. A film on this page plays on
this page.

Every reel tile carries a Play control now, in the same mark the film tiles
use. Pressing it opens a small player over the page at the 9:16 a reel
actually is, with the reel named across the top and Close at the right.
Opening it on Instagram is still there, as a choice rather than the only way.

The frame is built on the press and never before, so nothing is fetched from
Instagram while the page is merely open, which is the promise this section has
always made. Closing tears the frame out rather than hiding it: an iframe left
inside a hidden dialog goes on loading and keeps its cookies. Escape and a
press on the backdrop both close it, and focus returns to the tile it came
from.

`npm test` 603 pass, 0 fail. `lint`, `check:chrome`, `audit` and `check:seo`
clean. Only `founder.html` and its test file.

**v1.50** Two faults in the founder mount.

*The app links were not in their tile.* The Android and iPhone buttons sat in
a row under the grid instead of inside "A calling to come together for
animals". I had made the reel tile one big `<a>` with the app links inside it.
An `<a>` inside an `<a>` is invalid, and a parser does not ignore it: it
closes the outer one, which spilled the app links and the Watch control out of
the tile entirely.

The film tiles already carry a note about exactly this, written when the same
tile could not be one big `<button>` for the same reason. I read that note,
moved the tile to the reels strip, and made the mistake anyway in the other
tag. The tile is a container now, the title and Watch are links of their own,
and a test asserts the tile is not a link and that the apps are inside it.

*The player called itself The Wall on the founder page.* It was written for
the wall, so its name was in four places: the mark in the top bar, the foot
credit, the foot's three wall links, and the media session a phone shows on
its lock screen. On a second page that is not only wrong, it points at a
different section of this site.

The name is an option now. The wall passes nothing and keeps everything it
had, verified: mark, credit and all three foot links unchanged. The founder
page mounts it as "Her, in motion", which is what that section is called.

One more of my own: the helper I wrote for the reel links took the class as an
argument, which reads to anything scanning markup for classes as a class
literally named `cls`. The class is written out at each call instead.

`npm test` 601 pass, 0 fail. `lint`, `check:chrome` and `audit` clean.

**v1.49** The founder page mounts the wall's player. There is one of it now.

v1.48 made the module. This puts the second page on it, which was the point.

*The films.* The eight YouTube films are driven rather than embedded:
`assets/theatre.js` strips the frame bare and works it through the player API,
so the seek bar, the clock, play, pause, sound, speed, the ruler, the
filmstrip, copy-link-to-this-moment, the keyboard and full screen all act on
the film in front of them. None of that was possible in the lookalike, and
none of it had to be written again.

Mounted with its own `progKey`, so where someone got to in a film here is not
confused with the community wall.

*The reels.* The four Instagram reels are out of the film grid and into their
own strip beneath it, as agreed. No page may reach inside an Instagram or
Facebook frame to seek it, time it, pause it or mute it, so putting them in
this player would mean a transport bar that cannot act on what is in front of
it. They open where they live, and keep the app links they carried.

*What went.* The founder page's own theatre: its CSS, its markup, its 250
lines of JS, its embed builder, its `say`, its cursor handling, its full
screen chain. All of it was a second implementation of something that already
existed, and every bug in it had to be found twice. The page carries no
player now, and a test fails if any lookalike markup or CSS returns.

*Tests.* The founder file's theatre tests were rewritten against the mount
rather than the resemblance: the eight films reach the player and the four
reels do not, a tile opens through it, the controls that were impossible are
present, and the module brings its own markup. One had to close its jsdom
windows: a mounted player runs timers, and an open window with a live timer
held the process open long after the assertions had passed.

Two suite-wide numbers moved for the same honest reason. `inline-scripts`
pinned wall.html and founder.html as pages carrying large inline script; both
have been deliberately relieved of it, so the pins moved to pages that still
do, and the 250KB floor became 200KB. The floor guards against the extractor
silently ceasing to match, not against a page being unburdened on purpose.

`npm test` 601 pass, 0 fail. `lint`, `check:chrome`, `audit` and `check:seo`
clean.

**v1.48** The theatre is a module. One player, ready for two pages.

The wall's player was 1,005 lines inside `wall.html`, written as one unit with
the walls themselves. That is why the founder page kept getting a lookalike
instead of the real thing: there was no module to reuse, and I built a
resemblance three times rather than saying so.

The seam was nine names, not a thousand lines. `films` and `progKey` say what
to play and where to remember a position. `onProgress` lets a page repaint its
own tiles. `say` and `live` are the page's toast and live region. `th`,
`video` and `zone` are DOM the module now owns and builds from its own markup.
`muted` always belonged inside it. `clock` and `toggle` come back out through
the returned api.

*What moved, and how.* `assets/theatre.css` is the 230 CSS lines lifted
verbatim. `assets/theatre.js` is the player, plus the markup it injects, so no
page carries a copy free to drift from the code driving it. `wall.html` keeps
what is genuinely its own, the two walls and their tiles, and mounts the
module.

*The evidence.* `test/wall-theatre.test.js` holds 38 tests written against
this code while it lived in the page. All 38 pass against the module. Nothing
in it was redesigned on the way out: that is the difference between an
extraction and a rewrite, and those tests are how it can be told.

Seven other tests read `wall.html` for CSS, comments or code that now sits
beside it, and were repointed at the file each thing moved to rather than
loosened. One read stayed on the page on purpose: the film list and what a
film may declare are the wall's content, not the player's machinery. The
harness inlines `assets/theatre.js` where the page links it, because jsdom
does not fetch a script tag. `PFA_CHROME` is declared a browser global, which
it always was when the same call sat inline.

*Not yet done.* The founder page still runs its own player. Mounting it on
this module is one short step and is the next build; it is not in this one
because I could not finish and verify it here, and a half-mounted page is
worse than a page that works.

`npm test` 609 pass, 0 fail. `lint`, `check:chrome` and `audit` clean.

**v1.47** The founder player's cursor, and full screen that was forbidden
rather than missing.

*The chevron.* The wall rests the drawn cursor when its chrome goes away, the
way every player hides the pointer once a film has the screen. This player
never did, so the chevron sat over the film for as long as one played, and
beside the embeds' own system arrow at that: the picture box restores
`cursor:auto` so an Instagram or YouTube control can be used, which leaves
two pointers on one film. It now rests with the bars and wakes with them,
through the same `PFA_CHROME.restCursor` the wall calls.

*Full screen.* The iframe carried `allowfullscreen`, so this looked like an
oversight in the markup. It was not: `allow` names the whole permissions
policy for a frame, and a list that does not mention `fullscreen` denies it
whatever the legacy attribute says. YouTube's own control was not hidden from
its bar, it was forbidden. `fullscreen` is in the policy now, so the player's
own control works.

Beside it, a control of this page's own, using the wall's chain less the two
steps only a file can answer: the theatre first, the document if that is
refused. The theatre is what goes whole, so the strip and the bars go with
the film rather than the film leaving them behind. Entering or leaving lays
the picture out again, because the stage measured itself against the old
viewport. Closing the theatre while full screen leaves full screen first: a
shut theatre must not leave the screen taken over.

On a browser with no element full screen at all, an embed is reachable only
by its own control inside the frame, which is now permitted, and that is what
the visitor is told.

*A toast with nothing to say.* The page carried a toast element and nothing
that used it, so the one message this needs had nowhere to go. It has a
`say()` now, announced through the element's own `role="status"`.

`npm test` 604 pass, 0 fail. `lint`, `audit` and `check:chrome` clean. Only
`founder.html` and its test file.

**v1.46** A test that failed because it had worked.

`opening a film names it under the strip` asserted the caption read
"Film 05". That is the placeholder a YouTube film shows until
`npm run media:founder --rewrite` fetches its real title, so the test held
only while the script had not been run. The first build where it had been run
stopped the ship with a red suite and a correct page. The failure was mine,
and it was the wrong shape: a test must not depend on a step having been
skipped.

It now reads the titles out of the page and asserts the rule rather than the
words: a film with a title shows it, a film without one shows its number. It
was run against the page in both states, before the fetch and after it, which
is the check that would have caught this when it was written.

Two traps in the same corner, closed while here. A fetched title is written
into a page that forbids em dashes, so `forPage` converts them to hyphens:
one YouTube title carrying an em dash would have turned the whole suite red
on some later build, long after anyone remembered running the fetch. And a
title reaches the tile through innerHTML, so it is escaped at render: the
typed titles are ours, but the YouTube ones are whatever the channel called
the film.

`npm test` 604 pass, 0 fail, in both states. `lint`, `audit` and
`check:chrome` clean. Only `founder.html`, its test file and the fetch script.

**v1.45** The founder page's player, rebuilt in the shape of the wall's.

It was a modal: a bordered box floating in the middle of a dark panel, a bar
above it and a row below. The wall's theatre is a cinema, and that difference
is entirely in the arrangement. The stage now reaches all four edges, the
film is centred in it at its own shape, and the chrome lies over the film
rather than boxing it in.

*The wall's vocabulary, not an imitation of it.* 12px uppercase at .06em,
tabular numerals on anything that counts, the count and the source at the
left, the mark in the middle, Close at the right, and a strip of every film
along the foot with the one playing marked and scrolled to. Sized in `dvh`
with the safe-area insets, for the reason the wall needed them: a fixed
`inset:0` is laid out against the viewport that assumes a phone's own bars
are hidden, and they are not.

*The chrome steps away* when the pointer rests and returns when it moves,
exactly as the wall's does, and never while something inside it holds focus,
so a keyboard is not left tabbing into bars it cannot see. On touch it does
not step away at all: a finger leaves no pointer resting on the film, so the
chrome would go and never come back.

*What is deliberately absent.* The wall has a seek bar, a clock, play, pause
and sound. These are cross-origin embeds. A page cannot reach inside an
Instagram or Facebook frame, so none of that can be made real here, and
drawing controls that do nothing would be worse than not drawing them.
Everything in this bar works.

A film with no still yet shows its number in the strip rather than a black
gap, which is the answer its tile already gives.

*One bug, caught by the new tests.* Renaming the stage from `.th__stage` to
`.th-stage` left `paint()` still asking for the old name, so opening a film
threw on a null and the theatre came up empty. The tests that open a film
and read the strip fail on it.

`npm test` 604 pass, 0 fail. `lint`, `audit` and `check:chrome` clean. Only
`founder.html` and its test file.

**v1.44** Eight films on the founder page, with stills.

Added beside the four reels, not instead of them. The Watch grid is twelve
tiles now and the four that were there are untouched, app links and all.

*The thumbnail problem, and the way round it.* The tiles were type-only for a
documented reason: Instagram and Facebook will not hand a still to a
third-party page without their script or an app token, and their CDN links
are signed and expire. YouTube is the exception. It publishes a still for
every film at a plain, unsigned address, which is what makes this possible.

Hot-linking it would have been the easy answer and the wrong one. This
section's whole promise is that nothing third-party loads until play is
pressed, and a still fetched from i.ytimg.com is a request to Google on page
load, before the visitor has done anything. So the stills are brought local
the way the CineKind photographs were: `npm run media:founder` downloads them
once into `media/founder-films/`, where the page already points. A test
fails if that host appears on the page at all.

*The titles are fetched, not typed.* These are eight films of a named person.
A title invented here would be a caption asserting something about a real
recording, which is how a page ends up describing a film as something it is
not. The same command asks YouTube's oEmbed endpoint what each is called and
`--rewrite` writes the answers in. Until then a tile shows its number and its
source, which is true. The script reads its film list out of the page rather
than keeping a second list, so the two cannot drift.

*The rendering.* Typography first, the frame second: the tile reads as a line
of type and the still comes up under it on hover or keyboard focus, with the
scrim lifting and the image scaling. The grid stays a list to scan, and a
film shows itself when its tile is being considered. Reduced motion keeps the
reveal and drops the scale, because the reveal is the effect.

A tile whose still is not on disk is unaffected: the poster layer is inserted
only once a file has decoded, so the page is correct before the folder is
filled and better after. That is also what lets this ship without the stills.

`npm test` 595 pass, 0 fail. `lint`, `audit` and `check:chrome` clean. Only
`founder.html`, one new script, one new test file and `package.json`.

**v1.43** The ask page takes a real place, and the geography is one file.

*The ask form.* "Your city (optional)", a free box. A question is pointed at
the unit nearest the person who asked it, so a question from nowhere in
particular cannot be routed, and a city that is not in the state beside it
cannot be routed either. It is now a state and a district, both chosen, both
required, the district disabled until there is a state and rebuilt whenever
the state moves.

*The API refuses the same thing.* A form is a convenience; the endpoint is the
rule, and anyone can post to it directly. `PFA-Q` now requires `state` and
`city`, and `lib/submission-fields.js` gained a `pairs` rule that checks the
two together rather than as two fields that each look filled in. It speaks
only when both halves arrived, so a missing city is reported once, as missing,
rather than twice in different words.

*One geography.* v1.42 put the district table inside donate.html. Adding the
ask page would have made two copies, and two copies of a geography drift; the
day they drift is the day a donor picks a district the server then refuses. It
now lives in `assets/india-districts.js`, a UMD module the two pages load with
a script tag and `lib/submission-fields.js` requires, exactly as
`assets/field-rules.js` has always been the one place a field rule lives. It
exports `pairOk`, which is the one question all three ask, and which squashes
surrounding space first: a value can arrive from a form, a saved draft or a
hand-written link, and " Udupi" failing against "Udupi" would be a bug wearing
the costume of a rejection.

Six existing fixtures were given a real place rather than the rule being
softened to let them through: they were testing contact rules, reply refusal,
acknowledgement mail and duplicate presses, and each now sends a question from
somewhere.

Twelve new tests on the ask page, including the pair reached by choosing a
city and then changing the state with the keyboard, which fires no change
event on the city and is how a bad pair survives to the submit button.

`npm test` 582 pass, 0 fail. `lint`, `audit`, `check:chrome` and `check:seo`
clean, and the new module reaches `dist/`.

**v1.42** The food order could be addressed to a place that does not exist.

State was a dropdown and district was a text box, so Punjab with Udupi typed
underneath it was accepted, saved to the draft, and carried into payment. PFA
matches a food order to a volunteer serving the area named on it, and there is
no volunteer serving a district that is not in the state, so that order is
paid for and the feed goes nowhere.

District is a select now, built from the state and disabled until there is
one. The pair is checked in the four places a value can arrive by: choosing a
state, choosing a district, the PIN suggestion moving the state underneath a
district already picked, and a campaign link, which is written by hand and was
previously taken at its word. It is checked once more on the press that leads
to payment, because a restored draft or the back button can reach that press
without passing step one.

A district survives a state change when the new state also has it. Aurangabad
belongs to both Bihar and Maharashtra, and a donor correcting the state should
not lose a district that is still right.

*The data.* 725 districts across all 36 states and union territories, from
sab99r/Indian-States-And-Districts, corrected for what that source predates:
Ladakh separated from Jammu and Kashmir in 2019, so Leh and Kargil moved out
of one and into the other; Dadra and Nagar Haveli merged with Daman and Diu in
2020; Andaman and Nicobar was missing outright; and the union territory names
carried suffixes the state dropdown does not use. Pipe-joined rather than
arrays, which at this count saves more than it costs: 7.8KB inline against a
400KB page ceiling.

Districts are created often in India. When one is missing it is added to that
table and nowhere else, and the tests will fail if a state in the dropdown has
no list, if the table names a state the dropdown does not offer, or if a
district carries a stray space, which would let it be chosen and then fail the
check on the way to payment.

Thirteen new tests, including the reported shape: Udupi picked under
Karnataka, then the state moved to Punjab.

`npm test` 569 pass, 0 fail. `npm run lint`, `audit` and `check:chrome` clean.
Only `donate.html` changed, plus one new test file. Nothing under `api/` or
`lib/`: the server still receives the same `district` field it always did.

**v1.41** Full screen on a phone, and the chain that was two steps short.

Chrome on an iPhone is WebKit, so "it fails on Chrome and Safari both" is one
browser, not two, and it points at what iOS will and will not make full
screen. It refuses a div. It refuses the document. Those were the only two
things this chain asked for before falling through to a webkit call on a
file. Every film on the wall is a YouTube embed, so on an iPhone the chain
reached the end and said full screen was not available. It was right, and it
was also two steps short.

*The video element.* iOS has always allowed a `<video>` to go full screen,
now through the standard call on the element and not only the old webkit one.
That was never in the chain, which asked for the theatre and then the page.
It is in it now, before the webkit spelling.

*The player.* An embed is a cross-origin frame and no call can reach inside
it, so on a browser that will not make an element full screen there is
genuinely nothing to ask. What is left is to hand the film back to YouTube's
own player, which has a full screen control that works, at the second the
film had reached. That is the last step: one press, one reload, the control
is there, and a line saying where it went.

The cost is Fill, which resizes a bare embed and has nothing to resize once
the player has its own controls back. That is the right way round: the embed
is bare by default so Fill works for everyone, and only the press that asks
for full screen gives it up, in exchange for the thing being asked for. The
frame is flagged `_keepNative` so the reopen leaves it alone. Unlike v1.37's
flag this is set by a press rather than by a guess, so it cannot fire on
every rebuild and loop.

Nothing changes on Android, iPad or desktop: the first step still answers
there and the rest is never reached.

Not done: full screen five seconds into playback without a touch. It is not a
restriction that can be worked around. Full screen requires transient
activation, a timer callback has none, and every browser rejects the call.
The rule exists to stop a page taking over the screen on its own, and a
charity's film wall is not the place to go looking for a way around it.

`npm test` 556 pass, 0 fail. Only `wall.html` and `test/wall-theatre.test.js`
changed.

**v1.40** Fill and Full Screen on a phone. Both were the same bug of mine,
and the bug was a fact that expired.

v1.37 branched the theatre on a belief: that an iPhone has no element full
screen, so this page's own button could never make an embed full screen
there, so on such a device the embed should keep YouTube's controls instead.
That was true for years. Safari 17.2 shipped the Fullscreen API to iPhone and
by 17.4 it worked on ordinary elements, which was two years before I wrote
the branch. I did not check.

What the branch cost, on every current iPhone:

*Fill did nothing.* Fill resizes `iframe.bare` and nothing else. The branch
built embeds non-bare, so there was no bare iframe for the rule to find, and
the control changed a class that matched no element.

*Full Screen declined to act.* Reaching an embed on such a device, it said to
use the player's own control rather than doing anything, which from the
outside is a dead button.

Both are gone. The capability test and its flag are deleted, and embeds are
built exactly as they were before v1.37, on every device: bare when the API
is there, `fs=0`, one set of controls. The full screen chain is one chain
again. The webkit spelling and the file fallback below it still carry an
iPhone old enough to need them, and the `webkitbeginfullscreen` listeners
stay, so a system player that does open still reports back.

Kept from v1.37, all of it independent of the branch: `100dvh` and the safe
area insets, the container units that size a bare embed against the stage
rather than the viewport, the strip standing down below 500px of height, and
the retry that answers `NotAllowedError` alone.

The three tests written for the branch are replaced by one that opens a
YouTube film on a simulated iPhone and requires the same bare, driven embed
every other device gets.

`npm test` 553 pass, 0 fail. Only `wall.html` and `test/wall-theatre.test.js`
changed.

**v1.39** The wall's films flickered and never started on a phone. My bug,
from v1.37.

*The loop.* `attachYt`'s `onReady` reopens a non-bare embed as a bare one the
moment the YouTube API answers, on one assumption: that non-bare only ever
means the API lost the race, so reopening is how the page ends up with a
single set of controls. v1.37 made that assumption false. An iPhone has no
element full screen, so this page's own button cannot make an embed full
screen there, and the embed was deliberately left non-bare with `fs=1` so it
keeps a control that works. `onReady` read only `!frame._bare`, saw a non-bare
embed with the API present, and reopened it. The rebuilt embed was non-bare
again, for the same deliberate reason, so it reopened again. The iframe was
destroyed and recreated without end: a continuous flicker, and a film that
never got as far as playing.

The fix is one flag and one condition. `iframe._ownFs` records why the embed
is not bare, and the reopen fires only when non-bare means the race was lost.
Everywhere with element full screen, nothing changes.

*The retry.* v1.37 also retried a rejected `play()` muted, to answer a mobile
browser refusing autoplay with sound on. But `play()` also rejects with
AbortError whenever the `video.load()` immediately above it interrupts the
call, which is routine and has nothing to do with sound. That retry was
muting films nobody asked to mute and overwriting the visitor's sound choice
while doing it. It now answers `NotAllowedError` and only that.

*Why the suite missed it.* Every test before this ran in a DOM that behaves
like a desktop browser, where `elementFsAvailable()` is true and neither fault
can occur. The regression test stands the DOM up as an iPhone and counts how
many times the player is constructed; reverting either line fails it, the loop
one with a runaway count rather than a hung run.

`npm test` 555 pass, 0 fail. Only `wall.html` and `test/wall-theatre.test.js`
changed: three lines of source, and the tests around them.

**v1.37** The wall's theatre on a phone.

*Full screen was not a dummy button, which is worse.* It was wired, and on an
iPhone it could never work. Safari on iPhone has no element full screen at
all: `Element.requestFullscreen` and its webkit spelling are both absent, and
the only full screen iOS has is a video file's own, through
`webkitEnterFullscreen`. That was in the code as a third fallback, but it
reported entry through `fullscreenchange`, which the system player does not
fire. So the button never went pressed, `fsElement()` stayed null, a second
tap tried to enter again instead of leaving, and Escape and Close read the
same null and shut the theatre behind a film still playing full screen.

Now there is a capability test up front and two honest paths, each reporting
through its own events: `webkitbeginfullscreen` and `webkitendfullscreen` are
listened to, so the button, Escape and Close all know where the film is. The
detection identifies an iPhone positively, by the absence of element full
screen alongside a video that can still do its own, so an old browser or a
test DOM is not mistaken for one.

Two things fall out of it. `webkitEnterFullscreen` throws before the file has
metadata, which is exactly where a fast tap lands, so a throw now defers one
retry to `loadedmetadata`. And an embed on an iPhone is reachable by neither
path, so on those devices it keeps its own controls and is built with `fs=1`;
elsewhere it still opens bare with `fs=0` and this page's single set of
controls, as before.

Entering full screen turns the phone to landscape for a 16:9 film, and leaves
shorts alone, since turning the screen for a vertical film turns it the wrong
way. Guarded to the last line: most browsers refuse the lock.

*The film would often not start at all.* iOS and Android refuse `play()` on a
file that is not muted until the visitor has asked for sound on that page. A
returning visitor carries Sound: On, so the promise was rejected, the catch
painted a pause icon over a still frame, and the spinner sat there. It now
retries muted, sets the Sound control to match, and says so, which makes the
next tap obvious instead of mysterious.

*The controls were underneath the browser.* `position:fixed; inset:0` is laid
out against the large viewport, the one that assumes the phone's own bars are
hidden. They are not, so the seek bar and the whole control row sat under
Safari's toolbar and could not be reached. The theatre is `100dvh` now, and
the top and bottom bars take `env(safe-area-inset-*)` so the clock clears the
notch and the controls clear the home indicator.

*A bare embed was cropped to a square of its middle.* Its box is sized in
viewport units while it sits in the stage. That was near enough while the
stage was `100vh`; with the theatre on `100dvh` it is not, and on Fill it
resolved to an iframe half again wider and twice taller than the box holding
it. Container units measure the stage itself, which is what the arithmetic
always meant. Every child of the stage is already out of flow, so
`container-type:size` changes nothing about its own sizing.

*One layout change, and it is deliberate.* Below 500px of viewport height,
which is a phone turned sideways and the only orientation anyone watches in,
the film strip is hidden. Its 96px floor plus the top bar and the control row
left the film about a third of the screen. Every film in it is still reachable
through Previous, Next and the ruler.

Seven new tests stand the DOM up as an iPhone rather than a desktop: no
element full screen, and a video that can only go full screen by itself. Every
bug above shipped past a suite that only ever ran as a desktop browser.

`npm test` 551 pass, 0 fail. `npm run lint` clean. `audit` and `check:chrome`
clean. No change to `api/`, `lib/` or any other page.

**v1.34** Impersonation and donation fraud.

The look and feel of this site cannot be protected: everything a browser
renders has already been sent to the visitor's machine. Being copied is mostly
harmless. Being copied closely enough to collect donations in our name is not,
and it is a different problem with different answers.

*One source for what is genuinely ours.* `lib/official-channels.js` holds the
domains, the two payment hosts and the list of things a donor should never be
asked for. Nothing reads it at runtime; it exists so that every published copy
of the statement can be pinned to it, and `test/impersonation.test.js` fails
when any of them drifts. A domain list on the donate page that disagrees with
the one in security.txt tells a suspicious donor only that we are not paying
attention.

*Something a donor can check against.* `donate.html#verify` is the statement:
the address bars that are ours, the two hosts payment actually happens on, and
five things we never ask for. The never-list is the half that works without
the donor reading a URL at all, because a request for a UPI transfer or an OTP
identifies the asker whatever the address says. The two domain lists are set in
a monospaced face: a homoglyph domain is the entire attack, and it is invisible
in a face where 1 and l are the same shape.

*Reachable from wherever someone is standing.* A line in the shared footer, so
it lands on all nineteen pages. It writes the domain out rather than leaving it
to the link, because on a clone the words are the part that will not match the
address bar.

*A reporting address.* `.well-known/security.txt`, RFC 9116. The people who
notice a clone first are usually a donor, a bank's fraud desk or a registrar,
and all of them look there. `scripts/minify.js` drops every .txt that is not
named, so it is named; `scripts/build-firebase.js` publishes `.well-known` too,
or the two deployments would disagree about whether we can be reached.

*A monitor.* `npm run check:lookalikes` generates the names a person could
mistake for ours, asks DNS which exist, and reports the hits. No key, no
account, no dependency. It reads the real domain from the source module so it
cannot end up watching a domain we no longer use. The column that matters is
the second one: a name that merely resolves is usually parked, while a name
that accepts mail can put our wording in a donor's inbox.

Its first run reports four: `peopleforanimals.com`, `.in`, `.org` and
`pfaindia.org`, three of them accepting mail. A hit is not an accusation and
some of these are probably ours or other organisations of the same name. They
are what someone should look at.

*The rest is procurement.* `BRAND-PROTECTION.md` covers what code cannot do:
which domains to register and redirect, registrar lock and auto-renew, DMARC at
`p=reject` (most donation fraud arrives by mail, and until DMARC is enforcing
nothing on this website affects it), and the takedown runbook in the order that
stops the money first. It also says plainly that the trademark is worth more
than any code in this repository.

*Not done, deliberately.* No test fails on the `Expires` date in security.txt.
A red suite blocks the ship, and this site must never become undeployable
because of a date in a text file; the monitor warns at 45 days instead.

`npm test` 545 pass, 0 fail. `npm run lint` clean. `audit`, `check:chrome` and
`check:seo` clean. Nothing under `api/` or `functions/` was touched, and the
only `lib/` addition is a data module no route requires.

**v1.33** The home page's theme, taken across the site.

*One header, rebuilt.* The mark moves to the left corner and the seven flat
links become four named sections that open a menu on hover or keyboard focus:
Our Work (units, newsroom, the wall, the record), Learn (laws, academy, the
quiz), Get Involved (volunteer, CineKind, events, careers) and About (the
founder, contact), with Donate at the right end as a filled block. Written once
in `assets/chrome-header.html` and stamped into all nineteen pages by
`npm run sync:chrome`, so no page carries its own copy.

`scripts/sync-chrome.js` gains a `group` column beside `current`: a page can sit
in a section without being a destination in it, which is how `report.html`
lights Our Work while marking no item. The section trigger takes `.in-section`
and never `aria-current`, so a section's own landing page cannot emit two
current links at once. `test/header-consistency.test.js` was rewritten for the
grouped nav and reads `data-nav` rather than `href`, because the page's own
entry has its href rewritten to `#top`.

*The header stays fixed, not sticky.* The home page's version is
`position:sticky`. Nineteen pages reserve `calc(var(--ann) + var(--nav) + ...)`
at the top of their first section and `assets/chrome.js` measures both into
those tokens; a sticky header takes part in flow, so it would sit on top of
that reservation and leave an 80px hole under itself on every page. Pinned at
`top:var(--ann)` it looks the same and the pages still line up.

*Donate stops advertising itself.* The sweep of light across the button and the
pulsing halo around it are gone. They were the header's only continuous motion,
and on a bar that is otherwise still they read as an advertisement rather than
a button. It is the one filled thing up there; that is enough to find it.

*The footer turns from ink to paper.* It was the single surface on the site that
inverted. Everything in it is written against four tokens, so the change is four
lines plus the visit odometer, which was drawn in white-on-black rgba and is now
expressed against the same tokens. The three link columns stay: below 900px the
header menus stand down and the footer is how those pages are reached. Its
`data-cursor` flips to `dark`, so the drawn chevron stays the ink one over it.

*The blue is retired.* `--accent:#2b9fd8` becomes `#111` on all eighteen pages
that set it, and the radial glow behind the units CTA loses its blue tint. The
palette is now ink, paper, stone and line, and nothing else.

Two consequences, both handled. Focus rings were `2px solid var(--accent)`; a
fixed colour can only be right on one of two surfaces, so they are now
`currentColor` and can never come out the shade of what they surround.
Selection was blue and legible anywhere; an ink selection is invisible on an
ink surface, so the announcement bar (in `chrome.css`, once for every page) and
the dark reading bands on cinekind, founder, donate, quiz, units and the wall
invert theirs to paper on ink.

*The home page hero.* Two lines instead of three, at the smaller display size;
`Enter PFA` becomes the filled white control and `Report cruelty` joins it as
the outlined one. The photograph is `grayscale(1)`, so the only colour above the
fold is the photography in the mosaic below it. Deleting that one declaration
brings the colour photograph back. The scrim was tuned for the taller three-line
headline and is a stop shallower now, which returns the photograph's white
ceiling where it meets the white header.

*The rest of the pages.* A pass over all eighteen looking for what the theme
had left behind rather than what it had changed.

The pre-paint header reservation was `--nav:69px` on every page and the header
is 81px (an 80px nav plus its rule), so the top of every page started 11px too
high and dropped when `chrome.js` measured the real height. Corrected on all
nineteen, and the home page's own `--bar` fallback with it.

`quiz.html` was the only public page not loading `assets/pfa-theme.css`, so its
labels, display leading, button control and square corners were its own rather
than the shared ones. It loads it now, after its own style, where it wins ties.

`units.html` was the only page without `a:hover{opacity:.65}`. Its several
`opacity:1` hover overrides only make sense as cancellations of that rule, so it
had gone missing there and nowhere else, and links on that page alone did not
answer the pointer.

`index.html` was the only page off the shared token set, painting `#fff` and
`#111` directly. It now declares and uses the same four names as the other
eighteen; no colour changes, but the palette is one edit rather than nineteen.

The footer gains a hairline at its top. On ink it announced itself by
inverting; on paper it opens with three columns of small links directly under
whatever white section ended the page, with nothing to say where the page stops.

Checked and deliberately left alone: the error red `#b3261e` and the success
green `#1a7f4b` are form states, not palette, and a monochrome validation
message is a worse page. The 50% radii are circles, the keycap in the wall's
help panel is a keycap, and the odometer tiles are wheels; all three are shapes
that mean something rather than rounded corners.

`npm test` 536 pass, 0 fail. `npm run lint` clean. `npm run audit` reports 21
pages, 24 API routes, no dead links. `check:chrome` and `check:seo` both clean.
No file under `api/`, `lib/`, `functions/` or `scripts/` other than
`sync-chrome.js` was touched.

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
