/* Talk, inside the unit's own panel.

   One home. The conversation with a unit lives in the unit sheet and
   nowhere else. The result card starts it, the sheet starts it, and both
   land in the same place, so there is never a second copy of the same
   conversation on screen and never a panel stranded under a card.

   Inside the sheet it is a view, not a replacement: the unit's profile is
   hidden while you talk and restored when you step back, with every button
   still wired, because the nodes were never destroyed.

   pfa-network.js owns the sheet and rewrites it whenever a unit opens, so
   this file watches the sheet and adds to it after it renders. Nothing in
   the network script changes.
*/
(function () {
  "use strict";

  var CSS = [
    /* the one action added to unit surfaces */
    ".us-talk{display:block;width:100%;margin-top:22px;padding:16px 20px;border:1px solid var(--ink,#F4F6F7);background:var(--ink,#F4F6F7);color:#0E1116;font-family:var(--font-d,'Archivo',system-ui,sans-serif);font-weight:700;font-size:13px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer;line-height:1;transition:background .25s,color .25s,border-color .25s}",
    ".us-talk:hover{background:var(--blue,#00A4FF);border-color:var(--blue,#00A4FF);color:var(--ink,#F4F6F7)}",

    /* the way back from the conversation to the profile. Also what keeps the
       unit named while the compact panel below stays free of repetition. */
    ".tk-unitback{display:block;margin:0 0 20px;padding:0;border:0;background:0 0;font-family:var(--font-s,'Marcellus',Georgia,serif);font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:var(--mut,#8B959E);cursor:pointer;text-align:left}",
    ".tk-unitback:hover{color:var(--ink,#F4F6F7)}",

    ".tk{font-family:var(--font-d,'Archivo',system-ui,sans-serif)}",
    ".tk *{box-sizing:border-box;border-radius:0}",
    ".tk-k{font-family:var(--font-s,'Marcellus',Georgia,serif);font-size:11px;letter-spacing:.26em;text-transform:uppercase;color:var(--mut-2,#6E7883);margin:0 0 10px}",
    ".tk-h{font-weight:900;font-size:clamp(22px,3vw,30px);line-height:1.12;letter-spacing:-.015em;color:var(--ink,#F4F6F7);margin:0 0 12px}",
    ".tk-sub{font-size:15px;line-height:1.6;color:var(--mut,#8B959E);margin:0 0 26px}",
    ".tk-note{font-size:13px;line-height:1.55;color:var(--mut-2,#6E7883);margin:14px 0 0}",

    ".tk-go{display:block;width:100%;padding:16px 20px;border:1px solid var(--ink,#F4F6F7);background:var(--ink,#F4F6F7);color:#0E1116;font-weight:700;font-size:13px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer;line-height:1;text-align:center;text-decoration:none;transition:background .25s,color .25s,border-color .25s}",
    ".tk-go:hover{background:var(--blue,#00A4FF);border-color:var(--blue,#00A4FF);color:var(--ink,#F4F6F7)}",
    ".tk-back{display:block;width:100%;margin-top:12px;padding:14px;border:0;background:0 0;color:var(--mut,#8B959E);font-family:inherit;font-size:13px;cursor:pointer}",
    ".tk-back:hover{color:var(--ink,#F4F6F7)}",
    ".tk-urgent{display:block;margin-top:16px;font-size:13px;color:var(--blue-ink,#5BC4FF);text-decoration:none;border-bottom:1px solid transparent}",
    ".tk-urgent:hover{border-bottom-color:currentColor}",

    ".tk-cats{display:grid;gap:1px;background:var(--hair-soft,rgba(255,255,255,.1));border:1px solid var(--hair-soft,rgba(255,255,255,.1))}",
    ".tk-cat{padding:17px 18px;border:0;background:#0E1116;font-family:inherit;font-size:15px;font-weight:700;color:var(--ink,#F4F6F7);text-align:left;cursor:pointer;transition:background .2s,color .2s}",
    ".tk-cat:hover{background:var(--blue,#00A4FF);color:var(--ink,#F4F6F7)}",

    /* the transcript */
    ".tk-log{margin:0 0 20px;display:flex;flex-direction:column;gap:10px}",
    ".tk-said{margin:0;padding:13px 16px;font-size:15px;line-height:1.55;max-width:82%;white-space:pre-wrap;word-break:break-word}",
    ".tk-them{align-self:flex-start;background:var(--porc,#12161C);color:var(--ink,#F4F6F7);border-left:2px solid var(--blue,#00A4FF)}",
    ".tk-you{align-self:flex-end;background:var(--ink,#F4F6F7);color:#0E1116;border:0;font-family:inherit;text-align:left;cursor:pointer}",
    "button.tk-you:hover{background:var(--blue-ink,#5BC4FF)}",
    ".tk-wait{color:var(--mut,#8B959E);background:0 0;border-left-color:var(--hair-soft,rgba(255,255,255,.14))}",
    ".tk-when{display:block;margin-top:6px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.6}",

    ".tk-field{width:100%;padding:14px 16px;border:1px solid var(--hair-soft,rgba(255,255,255,.18));font-family:inherit;font-size:15px;line-height:1.5;color:var(--ink,#F4F6F7);resize:vertical}",
    ".tk-field:focus{outline:0;border-color:var(--blue-ink,#5BC4FF)}",
    ".tk-send{margin-top:10px;padding:14px 24px;border:1px solid var(--ink,#F4F6F7);background:var(--ink,#F4F6F7);color:#0E1116;font-family:inherit;font-weight:700;font-size:12px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}",
    ".tk-send:hover{background:var(--blue,#00A4FF);border-color:var(--blue,#00A4FF);color:var(--ink,#F4F6F7)}",
    ".tk-skip{margin:10px 0 0 10px;padding:14px 18px;border:1px solid var(--hair-soft,rgba(255,255,255,.18));background:0 0;font-family:inherit;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--mut,#8B959E);cursor:pointer}",
    ".tk-warn{margin:10px 0 0;font-size:13px;line-height:1.5;color:#FF6B6B;display:none}",
    ".tk-warn.on{display:block}",

    ".tk-review{margin:0 0 4px;padding:18px;background:var(--porc,#12161C);border-left:2px solid var(--blue,#00A4FF)}",
    ".tk-review p{margin:0;font-size:15px;line-height:1.6;color:var(--ink,#F4F6F7);white-space:pre-wrap}",
    ".tk-meta{margin-top:8px!important;font-size:12px!important;letter-spacing:.1em;text-transform:uppercase;color:var(--mut-2,#6E7883)!important}",

    ".tk-near{margin-top:30px;padding-top:22px;border-top:1px solid var(--hair-soft,rgba(255,255,255,.11))}",
    ".tk-nearrow{display:block;width:100%;padding:14px 0;border:0;border-bottom:1px solid var(--hair-soft,rgba(255,255,255,.11));background:0 0;font-family:inherit;text-align:left;cursor:pointer}",
    ".tk-nearrow b{display:block;font-size:15px;color:var(--ink,#F4F6F7);margin-bottom:3px}",
    ".tk-nearrow span{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut-2,#6E7883)}",
    ".tk-nearrow:hover b{color:var(--blue-ink,#5BC4FF)}",

    /* the action row is a nowrap flex line, so a full-width button in it
       squeezes the link beside it onto two ragged lines */
    ".fa-act .us-talk{width:auto!important;margin-top:0!important;flex:0 1 auto;padding:16px 30px;white-space:nowrap}",
    ".fa-act .us-2nd{flex:none;white-space:nowrap;background:0 0!important;border:0!important;padding:0!important;margin-left:0;color:var(--blue-ink,#5BC4FF)!important;font-size:13px!important;font-weight:600;letter-spacing:.02em!important;text-transform:none!important;box-shadow:none!important;cursor:pointer;line-height:1.4;text-align:left}",
    ".fa-act .us-2nd:hover{text-decoration:underline}",
    ".tk-reply{margin:0 0 16px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--mut-2,#6E7883)}",
    ".tk-ask{margin:0 0 12px;font-size:17px;font-weight:700;color:var(--ink,#F4F6F7)}",
    ".tk-steps{margin:20px 0 0;padding-left:20px;color:var(--mut,#8B959E);font-size:14px;line-height:1.7}"
  ].join("");

  var st = document.createElement("style");
  st.id = "pfa-talk-css";
  st.textContent = CSS;
  document.head.appendChild(st);

  var current = null;      /* last grid card clicked, one way the sheet learns its unit */
  var pendingTalk = null;  /* set by the card so the sheet opens straight into the talk */

  document.addEventListener("click", function (e) {
    var card = e.target.closest && e.target.closest(".unit-card[data-u]");
    if (card) current = card.getAttribute("data-u");
  }, true);

  function unitById(id) {
    var U = window.PFA_UNITS || [];
    for (var i = 0; i < U.length; i++) if (U[i].id === id) return U[i];
    return null;
  }

  function unitByCity(city) {
    var U = window.PFA_UNITS || [];
    for (var i = 0; i < U.length; i++) if (U[i].city === city) return U[i];
    return null;
  }

  /* the sheet is opened from cards, the result, and deep links; read the
     unit out of what it rendered rather than remembering how it opened */
  function resolveUnit(body) {
    var tag = body.querySelector("[data-u]");
    var u = unitById(tag ? tag.getAttribute("data-u") : current);
    if (!u) {
      var nm = body.querySelector(".us-name");
      if (nm) u = unitByCity(nm.textContent.replace(/^PFA\s+/, "").trim());
    }
    return u;
  }

  /* --------------------------------------------------------------------
     The conversation as a view of the sheet. The profile is hidden, not
     destroyed, so stepping back restores it with its buttons still wired.
     The slim bar above the panel keeps the unit named, which is what lets
     the compact panel below it say nothing twice.
     -------------------------------------------------------------------- */
  function enterTalk(u, body) {
    if (body.querySelector(".tk-host")) return;
    var kids = Array.prototype.slice.call(body.children);
    kids.forEach(function (c) { c.style.display = "none"; });

    var back = document.createElement("button");
    back.type = "button";
    back.className = "tk-unitback";
    back.textContent = "\u2190  PFA " + u.city;
    back.setAttribute("aria-label", "Back to the PFA " + u.city + " profile");

    var host = document.createElement("div");
    host.className = "tk-host";

    back.addEventListener("click", function () {
      back.remove();
      host.remove();
      kids.forEach(function (c) { c.style.display = ""; });
    });

    body.appendChild(back);
    body.appendChild(host);
    if (window.PFATalk) PFATalk.open(u, host, { inContext: true });

    var sheet = document.getElementById("unitSheet");
    if (sheet) sheet.scrollTop = 0;
    body.scrollTop = 0;
  }

  function addAction() {
    var body = document.getElementById("sheetBody");
    if (!body) return;
    var u = resolveUnit(body);
    if (!u) return;

    if (!body.querySelector(".us-talk")) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "us-talk";
      b.textContent = "Talk to " + u.city;
      b.addEventListener("click", function () { enterTalk(u, body); });
      /* above Call unit: calling is the urgent case, talking is the usual one */
      var contact = body.querySelector(".us-contact");
      if (contact) contact.parentNode.insertBefore(b, contact);
      else body.appendChild(b);
    }

    if (pendingTalk === u.id) {
      pendingTalk = null;
      enterTalk(u, body);
    }
  }

  /* --------------------------------------------------------------------
     The result card starts the same conversation in the same place. It
     routes through the sheet's own deep link, so the sheet opens exactly
     as it does from anywhere else, then goes straight in.
     -------------------------------------------------------------------- */
  function openSheetTalk(u) {
    pendingTalk = u.id;
    var want = "#u-" + u.id;
    if (location.hash === want) {
      try { window.dispatchEvent(new HashChangeEvent("hashchange")); }
      catch (e) { location.hash = ""; location.hash = want; }
    } else {
      location.hash = want;
    }
  }

  function addToResult() {
    var res = document.getElementById("faResult");
    if (!res) return;
    var card = res.querySelector(".fa-card");
    if (!card || card.querySelector(".us-talk")) return;
    var name = card.querySelector(".fa-name");
    if (!name) return;
    var u = unitByCity(name.textContent.replace(/^PFA\s+/, "").trim());
    if (!u) return;

    var b = document.createElement("button");
    b.type = "button";
    b.className = "us-talk";
    b.textContent = "Talk to " + u.city;
    b.addEventListener("click", function () { openSheetTalk(u); });

    /* one primary per surface: talking takes it, the profile steps down */
    var act = card.querySelector(".fa-act") || card;
    act.insertBefore(b, act.firstChild);
    var open = act.querySelector(".np-open");
    if (open) open.classList.add("us-2nd");
  }

  function start() {
    var body = document.getElementById("sheetBody");
    if (body) {
      new MutationObserver(function () { addAction(); }).observe(body, { childList: true });
      addAction();
    }
    var res = document.getElementById("faResult");
    if (res) {
      new MutationObserver(function () { addToResult(); }).observe(res, { childList: true, subtree: true });
      addToResult();
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
