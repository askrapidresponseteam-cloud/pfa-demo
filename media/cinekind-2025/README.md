# CineKind media — what is missing and where it should come from

`cinekind.html` asks for nine local files that are not in this tree. Until they
are, the page shows the cards without photographs. Run `npm run check:media` at
any time to see the current list.

Drop the files in at exactly these paths and nothing else needs changing.

## Honouree portraits

`media/cinekind-2025/<file>` — 4:5 portrait, 800×1000 or larger, `.webp`.

| File | Honouree | Link on the page |
| --- | --- | --- |
| `harsha.webp` | Dr Harsha Atmakuri | maakadoodh.in |
| `dolly.webp` | Dolly Vyas Ahuja | Times of India |
| `rupali.webp` | Rupali Ganguly | Times of India |
| `pooja.webp` | Pooja Bhatt | Filmfare |
| `sandhya.webp` | Dr Sandhya Sekar | Mongabay India |
| `mohit.webp` | Mohit Chauhan | Times of India |

**Those links are citations, not photo sources.** They are there to show why
each person was honoured, and they point at articles on Times of India,
Filmfare and Mongabay. The photographs on those pages belong to those
publications and their photographers, and PFA has no licence to republish them.
Copying or hot-linking them onto this site would be infringement, and Times of
India in particular pursues it.

Three ways to fill these in properly, best first:

1. **Ask the honourees.** Each was given an award by PFA; a portrait they are
   happy for PFA to use is usually one email. This also gets a better
   photograph than a news crop.
2. **Use the ceremony photographs.** The Film Federation of India's CineKind
   set (`filmfederation.in/events.php`, images 1–29) covers the evening the
   awards were presented, and PFA is co-presenter, so the rights question is
   answerable rather than hopeless. `npm run media:cinekind` downloads the set.
   **Tell me which numbered image shows which honouree and I will wire them in
   — I cannot open the files to tell.**
3. **Licence them.** Each publication sells reuse rights.

## Ceremony videos

`media/cinekind-elephant.mp4`, `media/cinekind-langur.mp4`,
`media/cinekind-lion.mp4` — short silent loops, muted and autoplaying, used as
a decorative strip. Any short PFA-owned footage works; they are not captioned
and carry `aria-hidden`, so nothing depends on what is in them.

If PFA does not have them, delete that strip from `cinekind.html` rather than
leaving three empty frames.
