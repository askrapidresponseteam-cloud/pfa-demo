/* PFA sign-in
==========================================================================
Guest first. Nothing here ever blocks a purchase, and nothing here opens
by itself. The sheet appears only when someone asks for it, or when they
reach for something that genuinely needs an address to send to.
Gating is declarative. Put an attribute on the element and this file does
the rest:
<a data-auth="in">Your favourites</a>     signed in only
<a data-auth="out">Sign in</a>            signed out only
<span data-auth-name></span>              filled with the first name
<button data-auth-go="favourites">        opens the sheet, then runs
the intent once signed in
Everything with a data-auth attribute is hidden by a stylesheet written at
parse time and only revealed once the session is known, so a gated item
never flashes on screen before it is resolved.
The backend is pluggable. If window.PFAAuthBackend is present this file
uses it; see pfa-auth-firebase.js for the adapter to fill in with your
Firebase config. Without a backend it runs a local demo session so the
whole flow can be built and reviewed before the keys exist.
========================================================================== */
(function () {
"use strict";
if (window.PFAAuth) return;
var KEY = "pfa_session";
var listeners = [];
var user = null;
var resolved = false;
var pending = null;   /* what they were reaching for when the sheet opened */
/* ---------------------------------------------------------------- store */
function readLocal() {
try {
var v = localStorage.getItem(KEY);
return v ? JSON.parse(v) : null;
} catch (e) { return null; }
}
function writeLocal(u) {
try {
if (u) localStorage.setItem(KEY, JSON.stringify(u));
else localStorage.removeItem(KEY);
} catch (e) {}
}
/* ------------------------------------------------------------- gating */
var CSS = [
/* hidden until the session is known, so nothing flashes */
"[data-auth]{display:none!important}",
"html.pfa-known [data-auth=out]{display:revert!important}",
"html.pfa-in [data-auth=out]{display:none!important}",
"html.pfa-in [data-auth=in]{display:revert!important}",
".pfa-au-scrim{position:fixed;inset:0;z-index:1200;background:rgba(255,255,255,.62);-webkit-backdrop-filter:blur(9px) saturate(1.1);backdrop-filter:blur(9px) saturate(1.1);opacity:0;visibility:hidden;transition:opacity .3s cubic-bezier(.2,.6,.2,1),visibility 0s linear .3s}",
".pfa-au-scrim.on{opacity:1;visibility:visible;transition-delay:0s}",
".pfa-au{position:fixed;z-index:1201;left:50%;top:50%;transform:translate(-50%,-48%);width:min(430px,calc(100vw - 32px));max-height:calc(100vh - 48px);overflow-y:auto;background:rgba(255,255,255,.94);-webkit-backdrop-filter:blur(34px) saturate(1.5);backdrop-filter:blur(34px) saturate(1.5);border:1px solid rgba(255,255,255,.5);box-shadow:inset 0 1px 0 rgba(255,255,255,.85),0 40px 90px -50px rgba(14,17,22,.55);opacity:0;visibility:hidden;transition:opacity .3s cubic-bezier(.2,.6,.2,1),transform .3s cubic-bezier(.2,.6,.2,1),visibility 0s linear .3s}",
".pfa-au.on{opacity:1;visibility:visible;transform:translate(-50%,-50%);transition-delay:0s}",
".pfa-au *{box-sizing:border-box;border-radius:0}",
".pfa-au-in{padding:34px 32px 30px}",
".pfa-au-k{font-family:var(--font-s,'Marcellus',Georgia,serif);font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:var(--mut-2,#6E7883);margin:0 0 12px}",
".pfa-au h2{font-family:var(--font-d,'Archivo',system-ui,sans-serif);font-weight:900;font-size:26px;line-height:1.1;letter-spacing:-.015em;color:var(--ink,#F4F6F7);margin:0 0 10px}",
".pfa-au-sub{font-family:var(--font-d,'Archivo',system-ui,sans-serif);font-size:14px;line-height:1.55;color:var(--mut,#8B959E);margin:0 0 24px}",
".pfa-au-btn{width:100%;display:flex;align-items:center;justify-content:center;gap:11px;font-family:var(--font-d,'Archivo',system-ui,sans-serif);font-weight:700;font-size:13px;letter-spacing:.1em;text-transform:uppercase;padding:15px 18px;border:1px solid var(--ink,#F4F6F7);background:var(--ink,#F4F6F7);color:#0E1116;cursor:pointer;line-height:1;transition:background .25s,color .25s,border-color .25s}",
".pfa-au-btn:hover{background:var(--blue,#00A4FF);border-color:var(--blue,#00A4FF);color:var(--ink,#F4F6F7)}",
".pfa-au-btn.ghost{background:0 0;color:var(--ink,#F4F6F7);border-color:rgba(255,255,255,.2)}",
".pfa-au-btn.ghost:hover{border-color:var(--ink,#F4F6F7);background:0 0;color:var(--ink,#F4F6F7)}",
".pfa-au-btn[disabled]{opacity:.5;cursor:default}",
".pfa-au-or{display:flex;align-items:center;gap:14px;margin:18px 0;font-family:var(--font-s,'Marcellus',Georgia,serif);font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:var(--mut-2,#6E7883)}",
".pfa-au-or::before,.pfa-au-or::after{content:'';flex:1;height:1px;background:rgba(255,255,255,.11)}",
".pfa-au-f{width:100%;height:50px;padding:0 14px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.7);font-family:var(--font-d,'Archivo',system-ui,sans-serif);font-size:14px;color:var(--ink,#F4F6F7);margin-bottom:10px}",
".pfa-au-f:focus{outline:0;border-color:var(--blue-ink,#5BC4FF)}",
".pfa-au-note{font-family:var(--font-d,'Archivo',system-ui,sans-serif);font-size:12px;line-height:1.5;color:var(--mut-2,#6E7883);margin:20px 0 0}",
".pfa-au-guest{margin:22px 0 0;padding-top:18px;border-top:1px solid rgba(255,255,255,.11);font-family:var(--font-d,'Archivo',system-ui,sans-serif);font-size:13px;line-height:1.5;color:var(--mut,#8B959E)}",
".pfa-au-x{position:absolute;top:12px;right:12px;width:38px;height:38px;border:0;background:0 0;cursor:pointer;color:var(--mut,#8B959E);font-size:20px;line-height:1}",
".pfa-au-x:hover{color:var(--ink,#F4F6F7)}",
".pfa-au-err{font-family:var(--font-d,'Archivo',system-ui,sans-serif);font-size:13px;color:#FF6B6B;margin:0 0 12px;display:none}",
".pfa-au-err.on{display:block}",
".pfa-au-done{font-family:var(--font-d,'Archivo',system-ui,sans-serif);font-size:14px;line-height:1.6;color:var(--ink,#F4F6F7)}",
"@media (prefers-reduced-motion:reduce){.pfa-au,.pfa-au-scrim{transition:none!important}}"
].join("");
var st = document.createElement("style");
st.id = "pfa-auth-css";
st.textContent = CSS;
(document.head || document.documentElement).appendChild(st);
function applyGate() {
var r = document.documentElement;
r.classList.add("pfa-known");
r.classList.toggle("pfa-in", !!user);
var first = user && user.name ? String(user.name).split(" ")[0] : "";
Array.prototype.forEach.call(document.querySelectorAll("[data-auth-name]"), function (n) {
n.textContent = first || (user && user.email ? user.email : "");
});
}
function emit() {
applyGate();
listeners.forEach(function (f) { try { f(user); } catch (e) {} });
}
/* ---------------------------------------------------------------- sheet */
var scrim, sheet, lastFocus;
function build() {
if (sheet) return;
scrim = document.createElement("div");
scrim.className = "pfa-au-scrim";
scrim.addEventListener("click", closeSheet);
sheet = document.createElement("div");
sheet.className = "pfa-au";
sheet.setAttribute("role", "dialog");
sheet.setAttribute("aria-modal", "true");
sheet.setAttribute("aria-label", "Sign in to PFA");
sheet.innerHTML =
'<button class="pfa-au-x" type="button" aria-label="Close">&times;</button>' +
'<div class="pfa-au-in">' +
'<p class="pfa-au-k">People for Animals</p>' +
"<h2>Sign in</h2>" +
'<p class="pfa-au-sub">So your favourites, price alerts and reorder reminders follow you to any device. You do not need an account to buy anything.</p>' +
'<p class="pfa-au-err" role="alert"></p>' +
'<div class="pfa-au-body">' +
'<button class="pfa-au-btn" type="button" data-go="google">' +
'<svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">' +
'<path fill="#4285F4" d="M45 24c0-1.6-.1-2.7-.4-3.9H24v7.1h12c-.2 1.9-1.5 4.7-4.4 6.6l6.7 5.2C42.2 35.3 45 30.1 45 24z"/>' +
'<path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-6.9-5.4c-1.9 1.3-4.4 2.2-7.6 2.2-5.8 0-10.7-3.8-12.5-9.1l-7.1 5.5C8 41.1 15.4 46 24 46z"/>' +
'<path fill="#FBBC05" d="M11.5 28.4c-.5-1.4-.8-2.8-.8-4.4s.3-3 .7-4.4l-7.1-5.5C2.9 17 2 20.4 2 24s.9 7 2.4 9.9l7.1-5.5z"/>' +
'<path fill="#EA4335" d="M24 10.6c4.1 0 6.9 1.8 8.5 3.3l6.2-6C34.9 4.4 29.9 2 24 2 15.4 2 8 6.9 4.4 14.1l7.1 5.5c1.8-5.3 6.7-9 12.5-9z"/>' +
"</svg>" +
"<span>Continue with Google</span>" +
"</button>" +
'<p class="pfa-au-or">or</p>' +
'<input class="pfa-au-f" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" aria-label="Email address">' +
'<button class="pfa-au-btn ghost" type="button" data-go="email">Email me a sign-in link</button>' +
"</div>" +
'<p class="pfa-au-note">No password to remember. The link signs you in and expires after use.</p>' +
'<p class="pfa-au-guest">Just buying something? <b>Carry on as a guest.</b> Checkout never asks you to sign in.</p>' +
"</div>";
document.body.appendChild(scrim);
document.body.appendChild(sheet);
sheet.querySelector(".pfa-au-x").addEventListener("click", closeSheet);
sheet.querySelector('[data-go="google"]').addEventListener("click", function () { go("google"); });
sheet.querySelector('[data-go="email"]').addEventListener("click", function () { go("email"); });
sheet.querySelector(".pfa-au-f").addEventListener("keydown", function (e) {
if (e.key === "Enter") { e.preventDefault(); go("email"); }
});
document.addEventListener("keydown", function (e) {
if (e.key === "Escape" && sheet.classList.contains("on")) closeSheet();
});
}
function err(msg) {
var e = sheet.querySelector(".pfa-au-err");
e.textContent = msg || "";
e.classList.toggle("on", !!msg);
}
function go(how) {
err("");
var body = sheet.querySelector(".pfa-au-body");
var email = sheet.querySelector(".pfa-au-f").value.trim();
if (how === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
err("That does not look like an email address.");
return;
}
Array.prototype.forEach.call(sheet.querySelectorAll(".pfa-au-btn"), function (b) { b.disabled = true; });
var be = window.PFAAuthBackend;
var p = be
? (how === "google" ? be.signInWithGoogle() : be.sendSignInLink(email))
: demo(how, email);
p.then(function (res) {
if (how === "email" && (!res || res.sent)) {
body.innerHTML = '<p class="pfa-au-done">Check <b>' + esc(email) +
"</b>. We have sent a sign-in link. You can close this and carry on browsing.</p>";
return;
}
setUser(res);
closeSheet();
runPending();
}).catch(function (e) {
err((e && e.message) || "That did not work. Try again in a moment.");
Array.prototype.forEach.call(sheet.querySelectorAll(".pfa-au-btn"), function (b) { b.disabled = false; });
});
}
/* stands in until the Firebase adapter is wired, so the flow can be reviewed */
function demo(how, email) {
return new Promise(function (res) {
setTimeout(function () {
res(how === "google"
? { id: "demo-google", name: "Demo Patron", email: "demo@peopleforanimals.in", via: "google" }
: { id: "demo-email", name: email.split("@")[0], email: email, via: "email" });
}, 420);
});
}
function esc(s) {
return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function openSheet(intent) {
build();
pending = intent || null;
lastFocus = document.activeElement;
scrim.classList.add("on");
sheet.classList.add("on");
var f = sheet.querySelector(".pfa-au-btn");
if (f) setTimeout(function () { f.focus(); }, 60);
}
function closeSheet() {
if (!sheet) return;
scrim.classList.remove("on");
sheet.classList.remove("on");
if (lastFocus && lastFocus.focus) lastFocus.focus();
}
function runPending() {
var i = pending; pending = null;
if (i && typeof i === "function") i(user);
else if (i && window.PFAIntents && window.PFAIntents[i]) window.PFAIntents[i](user);
}
function setUser(u) {
user = u || null;
writeLocal(user);
emit();
}
/* ----------------------------------------------------------------- api */
window.PFAAuth = {
user: function () { return user; },
isIn: function () { return !!user; },
ready: function () { return resolved; },
open: openSheet,
close: closeSheet,
/* call this from anything that needs a signed-in person. If they are
already in, the callback runs at once and no sheet appears. */
require: function (intent) {
if (user) { if (typeof intent === "function") intent(user); return true; }
openSheet(intent);
return false;
},
signOut: function () {
var be = window.PFAAuthBackend;
if (be && be.signOut) { try { be.signOut(); } catch (e) {} }
setUser(null);
},
on: function (f) { if (typeof f === "function") { listeners.push(f); if (resolved) f(user); } }
};
/* --------------------------------------------------------------- start */
function start() {
var be = window.PFAAuthBackend;
if (be && be.onChange) {
be.onChange(function (u) { resolved = true; setUser(u); });
if (be.completeLinkSignIn) be.completeLinkSignIn();
} else {
user = readLocal();
resolved = true;
emit();
}
/* one quiet entry point, inside the menu, not in the header rail */
menuEntry();
bindTriggers();
}
function menuEntry() {
var foot = document.querySelector(".pfa-menu .pm-foot");
if (!foot || foot.querySelector("[data-auth]")) return;
var wrap = document.createElement("p");
wrap.className = "pm-meta";
wrap.innerHTML =
'<a href="#" data-auth="out" data-auth-open>Sign in</a>' +
'<span data-auth="in">Signed in as <b data-auth-name></b>. ' +
'<a href="#" data-auth-out>Sign out</a></span>';
foot.appendChild(wrap);
applyGate();
}
function bindTriggers() {
document.addEventListener("click", function (e) {
var open = e.target.closest && e.target.closest("[data-auth-open]");
if (open) { e.preventDefault(); openSheet(open.getAttribute("data-auth-go") || null); return; }
var out = e.target.closest && e.target.closest("[data-auth-out]");
if (out) { e.preventDefault(); window.PFAAuth.signOut(); return; }
var go = e.target.closest && e.target.closest("[data-auth-go]");
if (go) { e.preventDefault(); window.PFAAuth.require(go.getAttribute("data-auth-go")); }
});
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();
})();