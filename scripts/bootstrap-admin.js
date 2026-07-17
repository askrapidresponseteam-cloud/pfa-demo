/* scripts/bootstrap-admin.js - mint the first admin, once.

   setRole requires an admin to already exist. Somebody has to be first, and
   that somebody is minted here, from a machine holding service account
   credentials, not from a browser.

   Run once, from your machine, then do not run it again:

     export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
     node scripts/bootstrap-admin.js maneka@pfaindia.org

   The account must have signed in at least once, so that it exists. */

const admin = require("firebase-admin");

const email = process.argv[2];
if (!email) { console.error("Usage: node scripts/bootstrap-admin.js someone@pfaindia.org"); process.exit(1); }
if (!/@pfaindia\.org$/i.test(email)) { console.error("Refusing: " + email + " is not on pfaindia.org"); process.exit(1); }

admin.initializeApp();

(async () => {
  const user = await admin.auth().getUserByEmail(email);
  const existing = await admin.firestore().collection("team").where("role", "==", "admin").get();
  if (!existing.empty) {
    console.error("Refusing: an admin already exists (" + existing.docs.map(d => d.data().email).join(", ") + "). Use setRole from the console.");
    process.exit(1);
  }
  await admin.auth().setCustomUserClaims(user.uid, { role: "admin" });
  await admin.firestore().doc("team/" + user.uid).set({
    uid: user.uid, name: user.displayName || email, email: email,
    role: "admin", active: true,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: "bootstrap"
  }, { merge: true });
  await admin.firestore().collection("audit").add({
    at: admin.firestore.FieldValue.serverTimestamp(), by: "bootstrap",
    action: "role.set", target: email, detail: "first admin"
  });
  await admin.auth().revokeRefreshTokens(user.uid);
  console.log("Admin claim set on " + email + ". Sign out and back in. Do not run this again.");
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
