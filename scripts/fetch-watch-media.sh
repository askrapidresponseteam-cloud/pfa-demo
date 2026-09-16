#!/usr/bin/env bash
#
# Poster stills, and optionally the video files, for the Watch grid on
# founder.html.
#
#   bash scripts/fetch-watch-media.sh            # posters only
#   bash scripts/fetch-watch-media.sh --video    # posters and MP4s
#
# Run it from the site root, on your own machine. It writes into img/ and
# media/watch/, then tells you the one line to change in founder.html.
#
# Why this exists: Instagram will not hand a thumbnail to a third-party page
# without their script running or an app access token, and the CDN links it does
# expose are signed and expire within days. So the stills have to be self-hosted.
# These are PFA's own reels from PFA's own account, so pulling them down for
# PFA's own site is a copy of your own material, not a scrape of someone else's.
#
# Needs yt-dlp and ffmpeg:  brew install yt-dlp ffmpeg

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

WANT_VIDEO=0
[ "${1:-}" = "--video" ] && WANT_VIDEO=1

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
warn() { printf '\033[33m    %s\033[0m\n' "$1"; }
fail() { printf '\n\033[31mSTOPPED: %s\033[0m\n' "$1" >&2; exit 1; }

command -v yt-dlp  >/dev/null || fail "yt-dlp not found.   brew install yt-dlp"
command -v ffmpeg  >/dev/null || fail "ffmpeg not found.   brew install ffmpeg"

# Keep this list in step with VIDEOS in founder.html.
REELS=(
  "01 DTOAdZZEyUf"
  "02 DXuZ2tak7pG"
  "03 DYhxVU4z64O"
  "04 Dbnstj0gf7o"
)

mkdir -p img media/watch
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

COOKIES=()
FAILED=()

fetch_one() {
  local n="$1" id="$2" url="https://www.instagram.com/reel/$2/"

  if [ "$WANT_VIDEO" = "1" ]; then
    yt-dlp "${COOKIES[@]+"${COOKIES[@]}"}" -q --no-warnings \
      -o "$TMP/$n.%(ext)s" "$url" 2>/dev/null || return 1
    local got; got="$(ls "$TMP/$n."* 2>/dev/null | head -1)" || return 1
    ffmpeg -v error -y -i "$got" -c copy "media/watch/watch-$n.mp4" </dev/null
    # first clean frame, half a second in, so it is not a fade from black
    ffmpeg -v error -y -ss 0.5 -i "$got" -frames:v 1 "$TMP/$n-raw.jpg" </dev/null
  else
    yt-dlp "${COOKIES[@]+"${COOKIES[@]}"}" -q --no-warnings \
      --skip-download --write-thumbnail --convert-thumbnails jpg \
      -o "$TMP/$n" "$url" 2>/dev/null || return 1
    local got; got="$(ls "$TMP/$n"*.jpg 2>/dev/null | head -1)" || return 1
    mv "$got" "$TMP/$n-raw.jpg"
  fi

  # The tile is 4:5 and the type sits over the lower half, so scale to cover and
  # then crop to 4:5 biased toward the top of the frame rather than the centre.
  # Written without nested commas: ffmpeg reads those as filter separators.
  ffmpeg -v error -y -i "$TMP/$n-raw.jpg" \
    -vf "scale=800:1000:force_original_aspect_ratio=increase,crop=800:1000:(iw-800)/2:(ih-1000)*0.28" \
    -q:v 4 "img/watch-$n.jpg" </dev/null
  return 0
}

step "Pulling $( [ "$WANT_VIDEO" = 1 ] && echo "posters and video" || echo "posters" ) for ${#REELS[@]} reels"

for entry in "${REELS[@]}"; do
  set -- $entry
  n="$1"; id="$2"
  printf '  %s  %s ... ' "$n" "$id"
  if fetch_one "$n" "$id"; then
    printf '\033[32mok\033[0m\n'
  elif [ ${#COOKIES[@]} -eq 0 ]; then
    # Instagram increasingly wants a signed-in session even for public reels.
    printf 'retrying with your Chrome session\n'
    COOKIES=(--cookies-from-browser chrome)
    if fetch_one "$n" "$id"; then printf '      \033[32mok\033[0m\n'
    else printf '      \033[31mfailed\033[0m\n'; FAILED+=("$n $id"); fi
  else
    printf '\033[31mfailed\033[0m\n'; FAILED+=("$n $id")
  fi
done

if [ ${#FAILED[@]} -gt 0 ]; then
  step "Could not fetch ${#FAILED[@]} of ${#REELS[@]}"
  for f in "${FAILED[@]}"; do warn "$f"; done
  warn "Open the reel, pause on the frame you want, screenshot it, crop to 4:5"
  warn "and save it as img/watch-NN.jpg. That works just as well."
fi

step "Done"
ls -la img/watch-*.jpg 2>/dev/null || warn "No posters written."

if [ "$WANT_VIDEO" = "1" ] && ls media/watch/*.mp4 >/dev/null 2>&1; then
  ls -la media/watch/*.mp4
  cat <<'NOTE'

To play these instead of the Instagram embeds, set the file field in
founder.html, in the VIDEOS list near the bottom:

    file:'media/watch/watch-01.mp4'

A clip with a file set plays from your own server and starts with sound.
A clip left with file:'' keeps the Instagram embed exactly as it is now.
NOTE
fi
