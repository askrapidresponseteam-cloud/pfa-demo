/* Firebase web configuration.
 *
 * Fill in the three values below once. The admin panel reads them, and the
 * member area will read the same file, so the project is identified in one
 * place rather than pasted into each page that needs it.
 *
 * Firebase console -> Project settings -> General -> Your apps -> Web app.
 * If there is no web app yet, click "Add app" and choose the web icon (</>).
 * Registering it does not create anything billable; it just issues the config.
 *
 * None of this is secret. The web API key identifies the project to the
 * Firebase SDK and is meant to sit in page source - Google documents it as
 * public. What actually protects the data is the `admin` custom claim, the
 * rules in firestore.rules, and the server verifying the ID token on every
 * request. Do not put the service account key here; that one IS secret and
 * belongs only in the Vercel environment variables.
 */
window.PFA_FIREBASE_API_KEY = 'AIzaSyCdmXx4uTv-N8RW7_tz1IqxvJBmRF91dDg';
window.PFA_FIREBASE_AUTH_DOMAIN = 'pfa-new-website.firebaseapp.com';
window.PFA_FIREBASE_PROJECT_ID = 'pfa-new-website';
window.PFA_FIREBASE_APP_ID = '1:494074297632:web:96f8aa76cf816a24156b45';

/* A quick sanity check in the console rather than a silent failure later. */
(function () {
  'use strict';
  if (String(window.PFA_FIREBASE_PROJECT_ID).indexOf('REPLACE') === 0) {
    console.warn(
      'PFA: assets/firebase-config.js still holds placeholders. ' +
      'Sign-in will fail until the web app config from the Firebase console is pasted in.'
    );
  }
}());
