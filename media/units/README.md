# Photographs of the units

Two ways a photograph gets here, and who wins:

1. `npm run media:units` (scripts/fetch-unit-photos.js) reads every unit's
   own page on peopleforanimalsindia.org - units/details/<id>.html, keyed
   by the `d:` id in units.html's UNITS array - and saves that page's own
   /uploads/unit/ photograph as `<city-slug>.jpg` or `.png`. The deploy
   runs it, and `manifest.json` records slug, city, official id, source
   URL and status for every unit so the mapping can be reviewed line by
   line. By construction a unit's file can only come from that unit's
   official page.

2. A portrait dropped here by hand as `<city-slug>.webp` (lower-case,
   hyphens: `calicut.webp`, `charkhi-dadri.webp`) still works and needs no
   code change - but the official jpg/png outranks it: units.html probes
   jpg, jpeg, png, then webp, and shows the first that loads.

Until any file exists for a unit, the page renders its typographic plate;
nothing ever shows a broken frame or the wrong face. Units whose official
page carries no photograph are listed in manifest.json with status
"no-photo" - that is the review list, and their plates stand until the
official site gains a picture or one is dropped here by hand. Portrait
crops around 3:4 and at least 700px wide read best.
