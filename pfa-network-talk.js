/* Discussion, mounted inside the unit sheet.

   pfa-network.js owns the sheet and rewrites its contents whenever a unit
   opens, so rather than reach into it this watches the sheet and adds one
   action after it renders. Nothing in the network script needs to change.

   The bubbles are square. The site has no rounded corners anywhere and a
   chat is not a reason to start.
*/
(function () {
  "use strict";

  var CSS = [
    /* the one action added to the unit sheet */
    ".us-talk{display:block;width:100%;margin-top:22px;padding:16px 20px;border:1px solid var(--ink,#0E1116);background:var(--ink,#0E1116);color:#fff;font-family:var(--font-d,'Archivo',system-ui,sans-serif);font-weight:700;font-size:13px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer;line-height:1;transition:background .25s,color .25s,border-color .25s}",
    ".us-talk:hover{background:var(--blue,#00A4FF);border-color:var(--blue,#00A4FF);color:var(--ink,#0E1116)}",

    ".tk{font-family:var(--font-d,'Archivo',system-ui,sans-serif)}",
    ".tk *{box-sizing:border-box;border-radius:0}",
    ".tk-k{font-family:var(--font-s,'Marcellus',Georgia,serif);font-size:11px;letter-spacing:.26em;text-transform:uppercase;color:var(--mut-2,#7A848D);margin:0 0 10px}",
    ".tk-h{font-weight:900;font-size:clamp(22px,3vw,30px);line-height:1.12;letter-spacing:-.015em;color:var(--ink,#0E1116);margin:0 0 12px}",
    ".tk-sub{font-size:15px;line-height:1.6;color:var(--mut,#55606A);margin:0 0 26px}",
    ".tk-note{font-size:13px;line-height:1.55;color:var(--mut-2,#7A848D);margin:14px 0 0}",

    ".tk-go{display:block;width:100%;padding:16px 20px;border:1px solid var(--ink,#0E1116);background:var(--ink,#0E1116);color:#fff;font-weight:700;font-size:13px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer;line-height:1;text-align:center;text-decoration:none;transition:background .25s,color .25s,border-color .25s}",
    ".tk-go:hover{background:var(--blue,#00A4FF);border-color:var(--blue,#00A4FF);color:var(--ink,#0E1116)}",
    ".tk-back{display:block;width:100%;margin-top:12px;padding:14px;border:0;background:0 0;color:var(--mut,#55606A);font-family:inherit;font-size:13px;cursor:pointer}",
    ".tk-back:hover{color:var(--ink,#0E1116)}",
    ".tk-urgent{display:block;margin-top:16px;font-size:13px;color:var(--blue-ink,#006DB3);text-decoration:none;border-bottom:1px solid transparent}",
    ".tk-urgent:hover{border-bottom-color:currentColor}",

    ".tk-cats{display:grid;gap:1px;background:var(--hair-soft,rgba(14,17,22,.1));border:1px solid var(--hair-soft,rgba(14,17,22,.1))}",
    ".tk-cat{padding:17px 18px;border:0;background:#fff;font-family:inherit;font-size:15px;font-weight:700;color:var(--ink,#0E1116);text-align:left;cursor:pointer;transition:background .2s,color .2s}",
    ".tk-cat:hover{background:var(--blue,#00A4FF);color:var(--ink,#0E1116)}",

    /* the transcript */
    ".tk-log{margin:0 0 20px;display:flex;flex-direction:column;gap:10px}",
    ".tk-said{margin:0;padding:13px 16px;font-size:15px;line-height:1.55;max-width:82%;white-space:pre-wrap;word-break:break-word}",
    ".tk-them{align-self:flex-start;background:var(--porc,#F4F6F7);color:var(--ink,#0E1116);border-left:2px solid var(--blue,#00A4FF)}",
    ".tk-you{align-self:flex-end;background:var(--ink,#0E1116);color:#fff;border:0;font-family:inherit;text-align:left;cursor:pointer}",
    "button.tk-you:hover{background:var(--blue-ink,#006DB3)}",
    ".tk-wait{color:var(--mut,#55606A);background:0 0;border-left-color:var(--hair-soft,rgba(14,17,22,.14))}",
    ".tk-when{display:block;margin-top:6px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.6}",

    ".tk-field{width:100%;padding:14px 16px;border:1px solid var(--hair-soft,rgba(14,17,22,.18));font-family:inherit;font-size:15px;line-height:1.5;color:var(--ink,#0E1116);resize:vertical}",
    ".tk-field:focus{outline:0;border-color:var(--blue-ink,#006DB3)}",
    ".tk-send{margin-top:10px;padding:14px 24px;border:1px solid var(--ink,#0E1116);background:var(--ink,#0E1116);color:#fff;font-family:inherit;font-weight:700;font-size:12px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}",
    ".tk-send:hover{background:var(--blue,#00A4FF);border-color:var(--blue,#00A4FF);color:var(--ink,#0E1116)}",
    ".tk-skip{margin:10px 0 0 10px;padding:14px 18px;border:1px solid var(--hair-soft,rgba(14,17,22,.18));background:0 0;font-family:inherit;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--mut,#55606A);cursor:pointer}",
    ".tk-warn{margin:10px 0 0;font-size:13px;line-height:1.5;color:#B3261E;display:none}",
    ".tk-warn.on{display:block}",

    ".tk-review{margin:0 0 4px;padding:18px;background:var(--porc,#F4F6F7);border-left:2px solid var(--blue,#00A4FF)}",
    ".tk-review p{margin:0;font-size:15px;line-height:1.6;color:var(--ink,#0E1116);white-space:pre-wrap}",
    ".tk-meta{margin-top:8px!important;font-size:12px!important;letter-spacing:.1em;text-transform:uppercase;color:var(--mut-2,#7A848D)!important}",

    ".tk-near{margin-top:30px;padding-top:22px;border-top:1px solid var(--hair-soft,rgba(14,17,22,.11))}",
    ".tk-nearrow{display:block;width:100%;padding:14px 0;border:0;border-bottom:1px solid var(--hair-soft,rgba(14,17,22,.11));background:0 0;font-family:inherit;text-align:left;cursor:pointer}",
    ".tk-nearrow b{display:block;font-size:15px;color:var(--ink,#0E1116);margin-bottom:3px}",
    ".tk-nearrow span{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut-2,#7A848D)}",
    ".tk-nearrow:hover b{color:var(--blue-ink,#006DB3)}",

    ".tk-steps{margin:20px 0 0;padding-left:20px;color:var(--mut,#55606A);font-size:14px;line-height:1.7}",
    ".tk-inline{margin-top:1px;padding:26px clamp(18px,3vw,30px);background:#fff;border:1px solid var(--hair-soft,rgba(14,17,22,.11));border-top:2px solid var(--blue,#00A4FF)}"
  ].join("");

  var st = document.createElement("style");
  st.id = "pfa-talk-css";
  st.textContent = CSS;
  document.head.appendChild(st);

  /* which unit the sheet is showing. The card carries it, so take it there
     rather than parsing the heading back out of the rendered sheet. */
  var current = null;
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

  function addAction() {
    var body = document.getElementById("sheetBody");
    if (!body || body.querySelector(".us-talk") || body.querySelector(".tk")) return;

    /* Read the unit out of the sheet rather than remembering which card was
       clicked. The sheet is also opened from the result card and from a
       #u-<id> deep link, and neither of those goes through a card click, so
       the remembered id was empty and no button appeared. */
    var tag = body.querySelector("[data-u]");
    var u = unitById(tag ? tag.getAttribute("data-u") : current);
    if (!u) {
      var nm = body.querySelector(".us-name");
      if (nm) u = unitByCity(nm.textContent.replace(/^PFA\s+/, "").trim());
    }
    if (!u) return;

    var b = document.createElement("button");
    b.type = "button";
    b.className = "us-talk";
    b.textContent = "Talk to " + u.city;
    b.addEventListener("click", function () {
      if (window.PFATalk) PFATalk.open(u, body);
    });

    /* above Call unit, because calling is the urgent case and talking is the
       usual one. The pair below stays exactly where it was. */
    var contact = body.querySelector(".us-contact");
    if (contact) contact.parentNode.insertBefore(b, contact);
    else body.appendChild(b);
  }

  /* the result card is the first thing you see after locating, so the
     conversation belongs there rather than three clicks inside a modal */
  function addToResult() {
    var res = document.getElementById("faResult");
    if (!res) return;
    var card = res.querySelector(".fa-card");
    if (!card || card.querySelector(".us-talk") || res.querySelector(".tk")) return;
    var name = card.querySelector(".fa-name");
    if (!name) return;
    var u = unitByCity(name.textContent.replace(/^PFA\s+/, "").trim());
    if (!u) return;

    var b = document.createElement("button");
    b.type = "button";
    b.className = "us-talk";
    b.textContent = "Talk to " + u.city;
    b.addEventListener("click", function () {
      /* opens where you are standing. No modal, no page change. */
      var host = document.createElement("div");
      host.className = "tk-inline";
      card.parentNode.insertBefore(host, card.nextSibling);
      b.remove();
      if (window.PFATalk) PFATalk.open(u, host);
      host.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    (card.querySelector(".fa-act") || card).appendChild(b);
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
