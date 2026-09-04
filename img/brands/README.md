# Brand logos for the shop's brand band

Drop a logo here and the band shows it in place of the brand's name on the
next deploy. Nothing else to edit.

- File name is the seller's collection handle: `farmina.png`, `royal-canin.svg`,
  `boehringer-ingelheim.webp`. The handle is the last part of the seller's
  collection URL (pawsandtails24.com/collections/**farmina**) and is what
  `/api/paws-catalog?view=list` lists under `brands[].handle`.
- `.svg`, `.png` or `.webp`, transparent background, roughly 4:1 or wider,
  at least 400px wide with the mark filling the canvas (no wide empty
  margins). The band draws it 52px tall, up to 200px wide.
- A file here wins over the logo the seller set on their Shopify collection;
  a brand with neither shows its name.
- Logos are the brands' marks. Use files the brand or the seller supplied,
  not images lifted from search results.

`sources.txt` lists a URL per brand; `npm run fetch:logos` downloads them
here (keeping any file you placed by hand). `scripts/build-brand-logos.js` reads this folder at deploy and writes
`assets/brand-logos.js`; `npm run build:logos` does the same locally.
