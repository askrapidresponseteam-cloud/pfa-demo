/* functions/index.js - PFA console identity.
   Region: asia-south1 (Mumbai), same as the rest of the project.

   Three things live here, and nothing else should:
     1. beforeUserCreated  - no account exists unless it is on the domain.
     2. beforeUserSignedIn - a disabled team member cannot get a session back.
     3. setRole            - only an admin assigns roles, and only through here.

   The role claim is the hinge that firestore.rules turns on. It is minted by
   the Admin SDK and never by a browser. There is no path in this file that lets
   a caller raise their own privileges. */

const { setGlobalOptions } = require("firebase-functions/v2");
const { beforeUserCreated, beforeUserSignedIn, HttpsError } = require("firebase-functions/v2/identity");
const { onCall } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();
setGlobalOptions({ region: "asia-south1" });

const DOMAIN = "pfaindia.org";
const ROLES = ["admin", "ops", "finance", "editor"];

function onDomain(email) {
  return typeof email === "string" && email.toLowerCase().endsWith("@" + DOMAIN);
}

/* 1. The account never comes into existence off-domain. This is stricter than
      rejecting the session: there is no stray user record to be granted a role
      by mistake later. */
exports.gateSignUp = beforeUserCreated((event) => {
  const user = event.data;
  if (!onDomain(user.email)) {
    throw new HttpsError("permission-denied", "The PFA console is limited to " + DOMAIN + " accounts.");
  }
  if (user.emailVerified !== true) {
    throw new HttpsError("permission-denied", "This address is not verified.");
  }
  /* No role at sign up. A new account can sign in and will be told to wait for
     an admin. Automatic roles are how consoles leak. */
  return {};
});

/* 2. Deactivating someone in team/{uid} has to end their access at the next
      session, not merely hide the nav. */
exports.gateSignIn = beforeUserSignedIn(async (event) => {
  const user = event.data;
  if (!onDomain(user.email)) {
    throw new HttpsError("permission-denied", "The PFA console is limited to " + DOMAIN + " accounts.");
  }
  const snap = await admin.firestore().doc("team/" + user.uid).get();
  if (snap.exists && snap.data().active === false) {
    throw new HttpsError("permission-denied", "This console account has been deactivated.");
  }
  return {};
});

/* 3. Role assignment. Admin only, verified from the caller's own token, which
      the caller cannot forge. */
exports.setRole = onCall(async (req) => {
  const caller = req.auth;
  if (!caller) throw new HttpsError("unauthenticated", "Sign in first.");
  if (caller.token.role !== "admin") throw new HttpsError("permission-denied", "Only an admin can assign roles.");
  if (!onDomain(caller.token.email) || caller.token.email_verified !== true) {
    throw new HttpsError("permission-denied", "Caller is not a verified " + DOMAIN + " account.");
  }

  const uid = String(req.data && req.data.uid ? req.data.uid : "");
  const role = req.data && req.data.role === null ? null : String(req.data && req.data.role ? req.data.role : "");
  if (!uid) throw new HttpsError("invalid-argument", "uid is required.");
  if (role !== null && ROLES.indexOf(role) < 0) {
    throw new HttpsError("invalid-argument", "Unknown role: " + role);
  }
  if (uid === caller.uid && role !== "admin") {
    /* Removing your own admin while you are the only admin locks everybody out
       of role assignment for good, and the only way back is the bootstrap script. */
    const admins = await admin.firestore().collection("team").where("role", "==", "admin").get();
    if (admins.size <= 1) throw new HttpsError("failed-precondition", "You are the only admin. Appoint another one first.");
  }

  const target = await admin.auth().getUser(uid);
  if (!onDomain(target.email)) throw new HttpsError("failed-precondition", "Target is not on " + DOMAIN + ".");

  await admin.auth().setCustomUserClaims(uid, role === null ? {} : { role: role });
  await admin.firestore().doc("team/" + uid).set({
    uid: uid,
    name: target.displayName || target.email,
    email: target.email,
    role: role,
    active: role !== null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: caller.token.email
  }, { merge: true });

  /* The audit log is written here, server side, because a client that can write
     its own audit trail does not have one. */
  await admin.firestore().collection("audit").add({
    at: admin.firestore.FieldValue.serverTimestamp(),
    by: caller.token.email,
    action: "role.set",
    target: target.email,
    detail: role === null ? "role removed" : "role set to " + role
  });

  /* The claim only reaches the browser on the next token refresh. The console
     forces one, and revokeRefreshTokens makes an existing session re-fetch. */
  await admin.auth().revokeRefreshTokens(uid);
  return { ok: true, uid: uid, role: role };
});
