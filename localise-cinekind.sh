#!/usr/bin/env bash
# Downloads the six CineKind event photos from filmfederation.in and rewrites
# cinekind.html to serve them locally, so the site does not depend on a third-
# party server. Run from the site root. Requires curl (cwebp optional).
set -euo pipefail
mkdir -p media/cinekind-2025
for n in 14 15 16 18 22 29; do
  echo "fetching $n.jpg"
  curl -fsSL "https://filmfederation.in/images/events/cinekind/${n}.jpg" \
       -o "media/cinekind-2025/event-${n}.jpg"
  if command -v cwebp >/dev/null 2>&1; then
    cwebp -quiet -q 82 "media/cinekind-2025/event-${n}.jpg" \
          -o "media/cinekind-2025/event-${n}.webp"
    rm "media/cinekind-2025/event-${n}.jpg"
    EXT=webp
  else
    EXT=jpg
  fi
  sed -i.bak "s|https://filmfederation.in/images/events/cinekind/${n}.jpg|media/cinekind-2025/event-${n}.${EXT}|g" cinekind.html
done
rm -f cinekind.html.bak
echo "done - images are now local"
