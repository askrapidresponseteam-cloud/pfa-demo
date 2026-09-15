## v1.317

- **The first film speaks its title again.** Film 1's fetched YouTube
  title begins with a literal double quote, and the page's esc() helper
  escaped angle brackets but not quotes - so the quote closed
  data-title at its first character, the attribute came out empty, and
  the hover stage had nothing to say for that one tile. esc() now
  escapes double quotes too, which also mends the tile's aria-label.
  One character of escaping; every title on the wall survives it.

