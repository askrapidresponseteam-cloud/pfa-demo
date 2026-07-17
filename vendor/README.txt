Firebase JS SDK 10.12.2, compat build. Apache 2.0.
Taken from the npm package `firebase@10.12.2` (files firebase-app-compat.js and
firebase-auth-compat.js), byte for byte.

Self-hosted deliberately. The console handles Aadhaar-bearing records, and a
script tag pointed at a third party is a write-access dependency on that third
party plus a request that tells them who is signing in and when. Same origin
removes both, and removes the need for an SRI hash that cannot be verified from
here anyway.

To upgrade: npm pack firebase@<version>, copy the two files out, re-run the gate
tests, and check the console still boots for each role.
