"""Bring the hand-built index.html onto the same token meanings as the rest of
the site, and drop the header override it no longer needs."""
import re, sys

SWAP = {'ink': 'white', 'porcelain': 'ink', 'white': 'ink', 'panel': 'porcelain', 'quiet': 'ink-soft'}
ROOT = """:root{
  --white:#0E1116;                  /* page base */
  --porcelain:#12161C;              /* lifted slab */
  --band:#080B0F;                   /* a band that was dark stays a well */
  --ink:#F4F6F7;                    /* primary text, and the inverted slab */
  --ink-soft:#DCE3E8;               /* long-form lines */
  --ink-deep:#090C10;               /* under the hero film */
  --card:#EDF1F3;
  --mut:#8B959E;
  --mut-2:#6E7883;
  --blue:#00A4FF;
  --blue-mid:#35B6FF;
  --blue-ink:#5BC4FF;
  --hair:rgba(255,255,255,0.14);
  --hair-soft:rgba(255,255,255,0.07);
  --font-d:'Archivo',system-ui,sans-serif;
  --font-s:'Marcellus',Georgia,serif;
}"""

def main(path):
    s = open(path, encoding='utf-8').read()
    if '--band:' in s:
        print('index: already aligned'); return
    m = re.search(r'(<style>)(.*?)(</style>)', s, re.S)
    css = m.group(2)
    css = re.sub(r'var\(--(ink|porcelain|white|panel|quiet)\)',
                 lambda x: 'var(--%s)' % SWAP[x.group(1)], css)
    css = re.sub(r':root\{.*?\n\}', ROOT, css, count=1, flags=re.S)
    css = re.sub(r'/\* ---- shared header / cart / mobile menu injected by pfa-header\.js.*?(?=\.pfa-cart,)',
                 '/* ---- floating cart and menu overlay injected by pfa-header.js -------- */\n',
                 css, flags=re.S)
    # open on the padding line rather than centred, so every page can share it
    css = css.replace('.hero-col{min-width:0;align-self:center;',
                      '.hero-col{min-width:0;align-self:start;')
    open(path, 'w', encoding='utf-8').write(s[:m.start(2)] + css + s[m.end(2):])
    print('index: tokens aligned, header override removed')

if __name__ == '__main__':
    main(sys.argv[1])
