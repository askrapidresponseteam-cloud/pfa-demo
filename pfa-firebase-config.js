/* pfa-firebase-config.js
   Web config for the PFA console. Replace every REPLACE_ME below with the values
   from Firebase console -> Project settings -> Your apps -> Web app.

   These values are not secrets. They identify the project, they do not grant
   access. Access is granted by Firebase Auth and enforced by firestore.rules.

   The console refuses to boot while any REPLACE_ME remains. That is deliberate.
   A half-configured console that renders is worse than one that does not. */
window.PFA_FIREBASE_CONFIG = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME.firebaseapp.com",
  projectId: "REPLACE_ME",
  storageBucket: "REPLACE_ME.appspot.com",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME"
};

/* Only accounts on this domain may sign in. Enforced three times over:
   here in the UI, in the Cloud Function that mints the role claim, and in
   firestore.rules. The UI check is the weakest of the three and exists only
   so a wrong account gets a sentence instead of a silent failure. */
window.PFA_ALLOWED_DOMAIN = "pfaindia.org";
