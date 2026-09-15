## v1.337

- **The letterbox lands for real.** v1.334's markup swap failed
  silently on a whitespace mismatch: its CSS applied and its HTML did
  not, so the credit sat at the foot of the picture on the owner's
  screen while two changelogs claimed otherwise. The marquee section
  is now replaced whole, by position rather than by string match, and
  the structure is asserted in the build script itself: exactly one
  credit, standing before the picture's stage, the image inside it -
  the black strip above the trophy, at last, in the file and not just
  in the stylesheet.

