/* PFA unit conversations
   ==========================================================================
   Not a wall. Not a feed. A conversation you own, with the unit nearest you.

   The shape, and why:

     Private first        You open a thread with the unit. Nobody else sees it.
                          A spammer's message lands somewhere nobody reads,
                          which is a better defence than any filter.

     Public by choice     The unit can open a thread to the neighbourhood when
                          others nearby genuinely benefit. Curated by a person,
                          with no one waiting on approval, because your own
                          thread was live the moment you sent it.

     One at a time        One open conversation per person per unit. You cannot
                          start another until this one is settled. This does
                          more against flooding than a rate limit, and it reads
                          as considered rather than defensive.

     No scoreboard        No votes, no karma, no counts, no ranking, no trending,
                          no infinite scroll, no anonymous handles. Every one of
                          those is a load-bearing part of what makes Reddit feel
                          like Reddit. Their absence is the design.

   The urgent door is not here. It is a phone call, because a conversation waits
   for someone to be present and an injured animal cannot.
   ========================================================================== */
(function () {
  "use strict";
  if (window.PFATalk) return;

  var KEY = "pfa_talk";

  /* the questions, asked one at a time, in the unit's voice */
  var ASK = [
    { k: "body",  q: "What is happening?",                     min: 40, hint: "A sentence or two is plenty." },
    { k: "place", q: "Where is this?",                          min: 3,  hint: "An area or a landmark." },
    { k: "extra", q: "Anything else we should know?",           min: 0,  hint: "Optional.", skip: "Nothing else" }
  ];

  var CATS = [
    ["stray", "A stray needs help"],
    ["sterilise", "Sterilisation or vaccination"],
    ["adopt", "Adoption or fostering"],
    ["conflict", "A feeding or neighbour issue"],
    ["advice", "Care or vet advice"],
    ["thanks", "Thanks, or an update"]
  ];

  /* ---- what never reaches the unit ---------------------------------- */
  var LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|in|org|io|shop|xyz|ru|link)\b)/i;
  var CONTACT = /(\+?\d[\d\s-]{8,}\d|[^\s@]+@[^\s@]+\.[a-z]{2,})/i;
  var ACCUSE = /\b(kill(ed|er)?|abus(e|er|ed)|beat(en|ing)?|poison(ed|er)?|torture[ds]?|murder(ed|er)?)\b/i;
  var NAMED = /\b(mr|mrs|ms|dr|shri|smt)\.?\s+[a-z]+|\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/;

  function refuse(text, key) {
    var t = (text || "").trim();
    var step = ASK.filter(function (a) { return a.k === key; })[0] || {};
    if (step.min && t.length < step.min) return "";           /* silent, not a scolding */
    if (CONTACT.test(t)) return "Leave numbers and emails out. The unit already has yours.";
    if (LINK.test(t)) return "Links do not go through. Say it in your own words.";
    if (ACCUSE.test(t) && NAMED.test(t))
      return "Tell us what happened without naming anyone. Naming a person in a thread that may become public creates a legal problem for PFA, and it is not what gets the animal helped. If someone needs reporting, say so here and the unit will take it from there.";
    return "";
  }

  /* ---- store --------------------------------------------------------- */
  function read() { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { return []; } }
  function write(a) { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) {} }
  function me() { var u = window.PFAAuth && PFAAuth.user(); return (u && u.id) || null; }

  function mine(unitId) {
    var id = me();
    return read().filter(function (c) { return c.unit === unitId && c.by === id; });
  }
  function openOne(unitId) {
    return mine(unitId).filter(function (c) { return c.state !== "closed"; })[0] || null;
  }
  function nearby(unitId) {
    return read().filter(function (c) { return c.unit === unitId && c.shared; }).slice(0, 3);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function ago(ms) {
    var m = Math.round((Date.now() - ms) / 6e4);
    if (m < 1) return "just now";
    if (m < 60) return m + " min ago";
    if (m < 1440) return Math.round(m / 60) + " hr ago";
    return Math.round(m / 1440) + " days ago";
  }

  /* ---- screens -------------------------------------------------------- */
  var mount, unit;

  function paint(html) { mount.innerHTML = html; }

  /* the unit, calmly. one action, and what is happening near you. */
  function home() {
    var open = openOne(unit.id), near = nearby(unit.id);
    paint(
      '<section class="tk">' +
        '<p class="tk-k">' + esc(unit.state) + "</p>" +
        '<h2 class="tk-h">Talk to ' + esc(unit.city) + "</h2>" +
        '<p class="tk-sub">' + esc(unit.head) + " and the team look after animals here. " +
          "They usually reply within a day.</p>" +
        (open
          ? '<button class="tk-go" type="button" data-resume>Open your conversation</button>' +
            '<p class="tk-note">One conversation at a time, so nothing gets lost.</p>'
          : '<button class="tk-go" type="button" data-start>Start a conversation</button>') +
        '<a class="tk-urgent" href="#" data-urgent>An animal is in danger right now</a>' +
        (near.length
          ? '<div class="tk-near"><p class="tk-k">Happening nearby</p>' +
            near.map(function (c) {
              return '<button type="button" class="tk-nearrow" data-open="' + c.id + '">' +
                "<b>" + esc(c.subject) + "</b><span>" + esc(c.place) + " &middot; " + ago(c.at) + "</span></button>";
            }).join("") + "</div>"
          : "") +
      "</section>"
    );
    on("[data-start]", function () { doors(); });
    on("[data-resume]", function () { thread(open.id); });
    on("[data-urgent]", function (e) { e.preventDefault(); urgent(); });
    all("[data-open]", function (b) { thread(b.getAttribute("data-open")); });
  }

  /* the one door that is not a conversation */
  function urgent() {
    var tel = unit.phone ? String(unit.phone).replace(/[^\d+]/g, "") : "";
    paint(
      '<section class="tk">' +
        '<p class="tk-k">Right now</p>' +
        '<h2 class="tk-h">Call. Do not type.</h2>' +
        '<p class="tk-sub">A message waits for somebody to open it. This will not wait.</p>' +
        (tel
          ? '<a class="tk-go" href="tel:' + esc(tel) + '">Call ' + esc(unit.city) + "</a>"
          : '<a class="tk-go" href="report.html">Rapid Response</a>') +
        '<ol class="tk-steps">' +
          "<li>Keep the animal still and warm. No food, no water.</li>" +
          "<li>Fix the exact location before you move.</li>" +
          "<li>Photograph only if it does not delay the call.</li>" +
        "</ol>" +
        '<button class="tk-back" type="button" data-back>It is not urgent</button>' +
      "</section>"
    );
    on("[data-back]", home);
  }

  function doors() {
    if (window.PFAAuth && !PFAAuth.isIn()) return gate();
    paint(
      '<section class="tk">' +
        '<p class="tk-k">To ' + esc(unit.city) + "</p>" +
        '<h2 class="tk-h">What is this about?</h2>' +
        '<div class="tk-cats">' +
          CATS.map(function (c) {
            return '<button type="button" class="tk-cat" data-cat="' + c[0] + '">' + c[1] + "</button>";
          }).join("") +
        "</div>" +
        '<button class="tk-back" type="button" data-back>Back</button>' +
      "</section>"
    );
    all("[data-cat]", function (b) { compose({ cat: b.getAttribute("data-cat"), catLabel: b.textContent }); });
    on("[data-back]", home);
  }

  function gate() {
    paint(
      '<section class="tk">' +
        '<h2 class="tk-h">Sign in first</h2>' +
        '<p class="tk-sub">So ' + esc(unit.city) + " can reply to you, and so this stays a real conversation. " +
          "Reading needs nothing.</p>" +
        '<button class="tk-go" type="button" data-auth-open>Sign in</button>' +
        '<button class="tk-back" type="button" data-back>Back</button>' +
      "</section>"
    );
    on("[data-back]", home);
    if (window.PFAAuth) PFAAuth.on(function (u) { if (u) doors(); });
  }

  /* the form, wearing a conversation. one question at a time, answers stay
     visible as sent, and nothing is counted at you while you type. */
  function compose(draft) {
    draft.answers = draft.answers || {};
    var i = 0;
    while (i < ASK.length && draft.answers[ASK[i].k] !== undefined) i++;

    if (i >= ASK.length) return confirm(draft);
    var step = ASK[i];

    paint(
      '<section class="tk tk-chat">' +
        '<div class="tk-log">' +
          '<p class="tk-said tk-them">' + esc(unit.city) + " &middot; " + esc(draft.catLabel) + "</p>" +
          ASK.slice(0, i).map(function (a) {
            var v = draft.answers[a.k];
            return '<p class="tk-said tk-them">' + esc(a.q) + "</p>" +
              '<button type="button" class="tk-said tk-you" data-edit="' + a.k + '">' +
                esc(v || a.skip || "Nothing else") + "</button>";
          }).join("") +
          '<p class="tk-said tk-them">' + esc(step.q) + "</p>" +
        "</div>" +
        '<div class="tk-input">' +
          '<textarea class="tk-field" rows="3" aria-label="' + esc(step.q) + '" placeholder="' + esc(step.hint) + '"></textarea>' +
          '<p class="tk-warn" role="alert"></p>' +
          '<button class="tk-send" type="button" data-send>Send</button>' +
          (step.min === 0 ? '<button class="tk-skip" type="button" data-skip>' + esc(step.skip) + "</button>" : "") +
        "</div>" +
        '<button class="tk-back" type="button" data-back>Back</button>' +
      "</section>"
    );

    var field = mount.querySelector(".tk-field");
    var warn = mount.querySelector(".tk-warn");
    field.focus();

    function send() {
      var v = field.value.trim();
      var no = refuse(v, step.k);
      if (no) { warn.textContent = no; warn.classList.add("on"); return; }
      if (step.min && v.length < step.min) {
        /* say it once, on the attempt, rather than counting at them the whole time */
        warn.textContent = "A little more, so somebody can actually help.";
        warn.classList.add("on");
        return;
      }
      draft.answers[step.k] = v;
      compose(draft);
    }

    field.addEventListener("input", function () { warn.classList.remove("on"); });
    field.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); }
    });
    on("[data-send]", send);
    on("[data-skip]", function () { draft.answers[step.k] = ""; compose(draft); });
    on("[data-back]", function () { doors(); });
    all("[data-edit]", function (b) {
      delete draft.answers[b.getAttribute("data-edit")];
      compose(draft);
    });
  }

  function confirm(draft) {
    var a = draft.answers;
    paint(
      '<section class="tk">' +
        '<p class="tk-k">Ready to send</p>' +
        '<h2 class="tk-h">' + esc(unit.city) + " will see this</h2>" +
        '<div class="tk-review"><p>' + esc(a.body) + "</p>" +
          '<p class="tk-meta">' + esc(a.place) + (a.extra ? " &middot; " + esc(a.extra) : "") + "</p></div>" +
        '<p class="tk-note">This is between you and the unit. If it would help others nearby, ' +
          esc(unit.city) + " may ask you before opening it up.</p>" +
        '<button class="tk-go" type="button" data-send>Send to ' + esc(unit.city) + "</button>" +
        '<button class="tk-back" type="button" data-back>Change something</button>' +
      "</section>"
    );
    on("[data-send]", function () {
      var c = {
        id: "c" + Date.now(), unit: unit.id, by: me(), byName: (PFAAuth.user() || {}).name || "",
        cat: draft.cat, subject: draft.catLabel, place: a.place, at: Date.now(),
        shared: false, state: "open",
        messages: [{ from: "you", text: a.body + (a.extra ? "\n\n" + a.extra : ""), at: Date.now() }]
      };
      var all_ = read(); all_.unshift(c); write(all_);
      thread(c.id);
    });
    on("[data-back]", function () { delete draft.answers.extra; compose(draft); });
  }

  function thread(id) {
    var c = read().filter(function (x) { return x.id === id; })[0];
    if (!c) return home();
    paint(
      '<section class="tk tk-chat">' +
        '<p class="tk-k">' + esc(unit.city) + " &middot; " + esc(c.subject) + "</p>" +
        '<div class="tk-log">' +
          c.messages.map(function (m) {
            return '<p class="tk-said tk-' + (m.from === "you" ? "you" : "them") + '">' +
              esc(m.text) + '<span class="tk-when">' + ago(m.at) + "</span></p>";
          }).join("") +
          (c.messages.length === 1
            ? '<p class="tk-said tk-them tk-wait">' + esc(unit.city) + " has this. They usually reply within a day.</p>"
            : "") +
        "</div>" +
        '<div class="tk-input">' +
          '<textarea class="tk-field" rows="2" aria-label="Reply" placeholder="Add something"></textarea>' +
          '<p class="tk-warn" role="alert"></p>' +
          '<button class="tk-send" type="button" data-reply>Send</button>' +
        "</div>" +
        '<button class="tk-back" type="button" data-back>Back to ' + esc(unit.city) + "</button>" +
      "</section>"
    );
    var field = mount.querySelector(".tk-field");
    var warn = mount.querySelector(".tk-warn");
    on("[data-reply]", function () {
      var v = field.value.trim();
      if (v.length < 2) return;
      var no = refuse(v, "body");
      if (no) { warn.textContent = no; warn.classList.add("on"); return; }
      var all_ = read();
      all_.forEach(function (x) { if (x.id === id) x.messages.push({ from: "you", text: v, at: Date.now() }); });
      write(all_);
      thread(id);
    });
    on("[data-back]", home);
  }

  /* ---- helpers -------------------------------------------------------- */
  function on(sel, fn) { var e = mount.querySelector(sel); if (e) e.addEventListener("click", fn); }
  function all(sel, fn) {
    Array.prototype.forEach.call(mount.querySelectorAll(sel), function (b) {
      b.addEventListener("click", function () { fn(b); });
    });
  }

  window.PFATalk = {
    open: function (u, el) { unit = u; mount = el; home(); },
    refuse: refuse,
    _state: { read: read, openOne: openOne }
  };
})();
