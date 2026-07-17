/* pfa-admin-auth.js
   The gate in front of the PFA console.

   Contract:
     PFAAuth.ready(fn)  fn({name,email,role}) runs once, only for a signed-in
                        account on the allowed domain holding a known role claim.
                        It never runs for anybody else, for any reason.
     PFAAuth.signOut()  ends the session and returns to the gate.

   What this file is not: it is not security. It decides what renders. The only
   thing standing between an attacker and the data is firestore.rules, which
   reads request.auth.token.role and never trusts anything the browser says.
   This file exists so that the console does not render a Dashboard to a stranger
   while the rules quietly reject every read behind it.

   Fail closed. Every path that is not a verified signed-in account with a role
   ends at the gate with a sentence on screen. There is no path that boots the
   console on error. */
window.PFAAuth = (function () {
  "use strict";

  var KNOWN_ROLES = ["admin", "ops", "finance", "editor"];
  var CLAIM_RETRIES = 6;      /* first sign-in: the claim is minted by a Cloud
                                 Function after the account exists, so the first
                                 token can legitimately arrive without it. */
  var CLAIM_BACKOFF = 400;    /* ms, doubled each attempt: 0.4s to ~12s total */

  var el = {};
  var booted = false;

  function $(id) { return document.getElementById(id); }

  function grab() {
    el.gate = $("gate");
    el.btn = $("gateBtn");
    el.err = $("gateErr");
    el.spin = $("gateSpin");
    el.out = $("signOut");
  }

  function show(state) {
    /* state: "signin" | "working" | "error" */
    if (!el.gate) return;
    el.gate.setAttribute("data-state", state);
    if (el.btn) el.btn.disabled = (state === "working");
    if (el.spin) el.spin.hidden = (state !== "working");
  }

  function stop(msg) {
    /* Terminal. The console does not render after this, ever. */
    if (el.err) { el.err.textContent = msg; el.err.hidden = false; }
    show("error");
    try { console.warn("[pfa.auth] " + msg); } catch (e) {}
  }

  function configured() {
    var c = window.PFA_FIREBASE_CONFIG;
    if (!c) return false;
    for (var k in c) {
      if (Object.prototype.hasOwnProperty.call(c, k)) {
        if (typeof c[k] !== "string" || c[k].indexOf("REPLACE_ME") > -1) return false;
      }
    }
    return true;
  }

  function domainOf(email) {
    var i = String(email || "").lastIndexOf("@");
    return i < 0 ? "" : email.slice(i + 1).toLowerCase();
  }

  /* Force a token refresh until the role claim appears, or give up.
     This is the first-sign-in race: the account is created, the function fires,
     the claim lands a moment later. Retrying is correct. Booting without the
     claim is not. */
  function roleFor(user, tries, wait, done) {
    user.getIdTokenResult(true).then(function (t) {
      var role = t && t.claims ? t.claims.role : null;
      if (role && KNOWN_ROLES.indexOf(role) > -1) return done(null, role);
      if (role) return done("This account carries an unknown role (" + role + "). Ask an admin to correct it.");
      if (tries <= 0) return done("This account has no role yet. An admin has to assign one before the console will open.");
      setTimeout(function () { roleFor(user, tries - 1, wait * 2, done); }, wait);
    }).catch(function (e) {
      done("Could not read this session (" + (e && e.code ? e.code : "unknown") + "). Sign in again.");
    });
  }

  function start(cb) {
    grab();

    if (!configured()) {
      return stop("This console is not configured. pfa-firebase-config.js still holds REPLACE_ME values, so there is nothing to sign in to.");
    }
    if (!window.firebase || !firebase.initializeApp || !firebase.auth) {
      return stop("The Firebase SDK did not load. The console cannot verify who you are, so it will not open.");
    }

    try { firebase.initializeApp(window.PFA_FIREBASE_CONFIG); }
    catch (e) { if (!/already exists/i.test(String(e && e.message))) return stop("Firebase failed to start: " + e.message); }

    var auth = firebase.auth();
    try { auth.useDeviceLanguage(); } catch (e) {}

    var provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ hd: window.PFA_ALLOWED_DOMAIN, prompt: "select_account" });

    if (el.btn) el.btn.addEventListener("click", function () {
      show("working");
      if (el.err) el.err.hidden = true;
      auth.signInWithPopup(provider).catch(function (e) {
        var code = e && e.code ? e.code : "";
        if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") { show("signin"); return; }
        stop("Sign in failed: " + (e && e.message ? e.message : code));
      });
    });

    if (el.out) el.out.addEventListener("click", function () {
      auth.signOut().then(function () { location.reload(); });
    });

    auth.onAuthStateChanged(function (user) {
      if (!user) { show("signin"); return; }

      if (domainOf(user.email) !== String(window.PFA_ALLOWED_DOMAIN).toLowerCase()) {
        var bad = user.email;
        return auth.signOut().then(function () {
          stop("The console is limited to " + window.PFA_ALLOWED_DOMAIN + " accounts. " + bad + " is not one.");
        });
      }

      show("working");
      roleFor(user, CLAIM_RETRIES, CLAIM_BACKOFF, function (err, role) {
        if (err) return auth.signOut().then(function () { stop(err); });
        if (booted) return;
        booted = true;
        if (el.gate) el.gate.hidden = true;
        document.body.classList.remove("locked");
        cb({
          name: user.displayName || user.email,
          email: user.email,
          role: role,
          uid: user.uid
        });
      });
    });
  }

  return {
    ready: function (cb) {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () { start(cb); });
      } else { start(cb); }
    },
    signOut: function () {
      try { firebase.auth().signOut().then(function () { location.reload(); }); } catch (e) { location.reload(); }
    }
  };
})();
