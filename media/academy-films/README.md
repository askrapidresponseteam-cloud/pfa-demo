# Founder page film stills

Empty until `npm run media:founder` is run with a network connection.

Each file is `<youtube-id>.jpg`, the still YouTube publishes for that film,
downloaded once rather than hot-linked. The founder page points here, and a
tile whose still is missing stays type-only rather than showing a broken
image, so the page is correct before this folder is filled and better after.

Do not hot-link `i.ytimg.com` instead. The Watch section's promise is that
nothing third-party loads until play is pressed, and a still fetched from
YouTube on page load breaks that before the visitor has done anything.
