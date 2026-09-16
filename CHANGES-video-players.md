# Video players: mobile and full screen fixes (16 Sep 2026)

Files changed: assets/theatre.js, assets/theatre.css, cinekind.html,
founder.html, test/wall-theatre.test.js (toast selector), and a new
test/players-mobile.test.js (12 tests). 690 tests pass.

## Shared theatre (Wall, Founder, Academy)
- Toast messages were painted under the theatre (page #toast z-index 75 < theatre 90)
  and outside the fullscreened element; Academy has no #toast. The theatre now has
  its own #thToast inside the dialog. This is where "Started with sound off. Tap
  Sound to turn it on" lives on phones.
- Legacy webkit full screen: webkitRequestFullscreen returns undefined on success;
  the chain read that as a refusal and cascaded to the document and then the <video>,
  ending in the native player. Now waits for the change/error event.
- Fast Next/Next on a slow connection: a deferred start seek from film A could fire
  on film B. Guarded by a load counter.
- Touch screens: the bottom controls never hide (by design), but the caption offset
  was zeroed, sliding the caption under them. Offset now stays measured under hover:none.
- .th-stage gets touch-action:none: double tap is the player's, not the browser's zoom;
  a drag on the film no longer scrolls the page behind on iOS.
- A sound toggle on an undriven embed preserves the native-controls flag.

## CineKind screening room
- 100dvh + safe-area insets: the bar sat under Safari's toolbar.
- Bar wraps to two rows under 720px: it overflowed on phones.
- Portrait phones: film fitted to width instead of cover-cropped to its middle third.
- Pause/Play reflects the player's real state. If mobile autoplay is refused the
  button says Play and the frame becomes tappable so YouTube's own play button works.
- No full screen control: the room is a fixed takeover of the whole viewport, so a
  button offering more of it was redundant (owner's call, 16 Sep 2026).

## Founder reel box
- 9:16 frame height cap now measures the stage via container units, not the viewport
  (landscape phones squashed the reel). Dead body.th-open selector -> body.theatre-lock.

## Recommend a real-device pass
iPhone: YouTube embed autoplay-with-sound in the theatre relies on allow="autoplay"
delegation, which cannot be exercised in jsdom.

## Newsroom (16 Sep 2026, same drop)
The page opened on the word "Newsroom" on white, then a bordered panel. It
now opens on its lead story: the protest photograph runs full-bleed behind a
transparent header (header-on-dark, the toggle cinekind.html uses), the
case's headline stands on it, and the dateline sits at the foot. The case
is set as a ledger - the count (35) on the left, the four-move record on the
right, the verdict under it - then the two remaining photographs, then the
close on ink. Every word of the case is unchanged. test/units-page.test.js
no longer uses newsroom.html as the reference compact hero.

## Newsroom: field notes (16 Sep 2026, later the same day)
The newsroom now takes the work people do for animals and publishes it.
- Form on newsroom.html (#fieldForm) posts PFA-W ("Wire report", a kind the
  server carried since the start with no page sending it) through pfa-forms.js.
  Spec in lib/submission-fields.js: type (select), headline, account, city,
  name required; one of mobile/email; group and link optional.
- Admin: the "wall" publish action (lib/routes/admin/case.js) accepts PFA-W;
  the panel button reads "Publish in the newsroom" for one.
- GET /api/field-notes (lib/routes/field-notes.js) serves published notes
  projected to headline, account, type, city, credit, link. Never mobile,
  email or IP.
- The strip at the top of the newsroom renders the API's answer; with none it
  holds an invitation, not a placeholder.
- Fixed on the way: lib/routes/wall.js read `data`; the intake writes `fields`,
  so the wall could never show an approved film. Both keys read now.
- Naming: "dispatch" and "wire" were avoided on purpose (test/section-names).
- Tests: test/newsroom-field-notes.test.js; the form joins the registers in
  forms-wired, every-form-reaches-admin, submission-fields, field-validate.

## Newsroom rebuilt as a magazine front (16 Sep 2026, on the owner's reference)
The page now follows caracaranyc.com's structure on the site's white paper, every
section led by a photograph: split lead (two case photographs, headline centred
beneath); field-note card carousel with photographs and NEW badges; a 50/50
spread that steps through the case's four moves; a four-tile photo grid of the
units; an image-and-text invitation; the form; a moodboard with one tile of type
that folds on a phone; and a scattered picture strip pointing at Instagram.
Headings are set in the display face without the site's uppercase, by design.
- Field notes can carry up to three photographs (pfa-forms.js wire() now
  passes `photos`). /api/field-notes reports the count; the new
  GET /api/field-note-photo?ref=&n= serves a photograph only for a published
  PFA-W note (404 otherwise; 400 for any other kind). Tested.
- Every word of Case 001 is unchanged.
