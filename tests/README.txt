Alignment and spacing harness. Standing rule: no run-together text, no frame drift,
ever, on any page or section.

Setup, once:
  npm i puppeteer-core @sparticuz/chromium
  node -e "require('@sparticuz/chromium').default.executablePath().then(console.log)"

Serve the site, then:
  node tests/alignment-audit.js 8095 "label"      one page, deep: run-together + frame parity
  node tests/spacing-sweep.js                     every page: run-together

What they assert, on measured geometry only, never on what the CSS claims:

  RUN-TOGETHER   an inline element whose next sibling is a text node starting with a
                 non-space, non-punctuation character. This is what produced
                 "The Coach Jacket<Rs>3,499" in the recently-viewed strip.

  FRAME PARITY   within one strip or grid, every art box must share the same width as a
                 percentage of its frame, the same inset, and the same frame background.
                 This is what produced photos bleeding to the card edge at 100% while the
                 line art sat at 78% with a 13px inset.

Both were verified to FIRE on v70 and pass on v72. A check that has never failed on a
known-bad build is not a check.
