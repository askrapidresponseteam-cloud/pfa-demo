/* PFA content guard - loaded on every public page.
A deterrent, not protection: it raises the effort, it does not prevent
anything. Fields are exempt so paste keeps working in the forms. */
(function () {
"use strict";
var stop = function (e) { e.preventDefault(); return false; };
var inField = function (t) {
if (!t || t.nodeType !== 1) return false;
var tag = t.tagName;
return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" ||
t.isContentEditable === true;
};
document.addEventListener("contextmenu", function (e) {
if (inField(e.target)) return true;      /* keep paste usable in forms */
return stop(e);
});
document.addEventListener("dragstart", function (e) {
if (inField(e.target)) return true;
return stop(e);
});
document.addEventListener("keydown", function (e) {
var k = e.key, c = e.ctrlKey || e.metaKey, s = e.shiftKey;
if (k === "F12" ||
(c && s && (k === "I" || k === "J" || k === "C")) ||
(c && (k === "u" || k === "U" || k === "s" || k === "S"))) stop(e);
});
/* iOS fires no contextmenu event: long press raises the callout instead, so
that is turned off at the paint layer for pictures and film. Text is left
selectable everywhere, on purpose, so a phone number or an address can
still be copied. */
var css = "img,video,.emblem{-webkit-touch-callout:none;-webkit-user-drag:none;user-drag:none}";
var st = document.createElement("style");
st.setAttribute("data-pfa-guard", "");
st.appendChild(document.createTextNode(css));
(document.head || document.documentElement).appendChild(st);
})();