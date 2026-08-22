/* ==========================================================================
   PFA Members - screens
   --------------------------------------------------------------------------
   The user interface for The Circle. It knows nothing about Firestore: every
   read and write goes through PFA.circle, so this file is only ever about
   what a person sees and what happens when they touch it.

   Three states a screen can be in, and all three are handled explicitly:
   signed out, signed in without a profile, and signed in and ready. There is
   no fourth state where sample content stands in for real content.
   ========================================================================== */

(function(){
'use strict';

var P = window.PFA;
if(!P || !P.circle) return;
var C = P.circle;

var page = document.body.dataset.mpage;
var gate = P.q('[data-m-gate]');
var app  = P.q('[data-m-app]');
var watchers = [];

function watch(stop){ if(typeof stop === 'function') watchers.push(stop); return stop; }
window.addEventListener('beforeunload', function(){ watchers.forEach(function(s){ try{ s(); }catch(e){} }); });

C.applyTextSize();
document.body.classList.add('m-body');

/* --------------------------------------------------------------------------
   Boot
   -------------------------------------------------------------------------- */

if(gate) gate.innerHTML = '<div class="m-loading"><span class="m-spin" aria-hidden="true"></span>' +
  '<p>Opening the Circle</p></div>';

C.boot().then(function(profile){
  if(!C.signedIn()){ if(gate) signIn(gate); return; }
  if(!profile || !profile.complete){ if(gate) setup(gate); return; }
  if(gate) gate.remove();
  if(app) app.hidden = false;
  return chrome().then(function(){ paintBanner(); return run(); });
}).catch(function(err){
  if(!gate) return;
  if(err && err.message === 'NO_CONFIG'){
    gate.innerHTML = notice('The Circle is not connected yet',
      'assets/firebase-config.js still holds placeholder values, so there is nothing for this page to read. ' +
      'Paste the web app config from the Firebase console and this screen will open.');
  } else {
    gate.innerHTML = notice('The Circle could not load',
      'Check your connection and try again. If this keeps happening, tell your unit and quote the message below.') +
      '<div class="m-pad"><p class="help">' + P.escape(String(err && err.message || err)) + '</p></div>';
  }
});

function notice(title, body){
  return '<div class="m-empty"><strong>' + P.escape(title) + '</strong><p>' + P.escape(body) + '</p>' +
         '<a class="btn dark" href="index.html">Back to the site</a></div>';
}

/* --------------------------------------------------------------------------
   Sign in
   Member number, then a six digit code by email. The same two API routes the
   rest of the site already uses.
   -------------------------------------------------------------------------- */

function signIn(host){
  var memberId = '';

  function askForNumber(message){
    host.innerHTML =
      '<div class="m-gate">' +
        '<p class="kicker">The Circle</p>' +
        '<h1>Members only, and worth being a member for.</h1>' +
        '<p>Patrons from every state, in one place. Questions answered by people who have handled the same thing, ' +
        'plans that need hands, and the daily record of what is happening to animals around the country.</p>' +
        '<p>It is text only. No photographs, no video, no audio, and 401 characters a post. That is a choice, ' +
        'not a shortage: it keeps the place readable and it keeps it cheap enough to run forever.</p>' +
        '<div class="form-shell">' +
          '<div class="form-head"><h3>Sign in</h3><p>Your Patron number is on your card. We will email a code to the address we hold for it.</p></div>' +
          '<div class="form-body">' +
            '<div class="field full"><label for="mId">Patron number</label>' +
              '<input id="mId" type="text" inputmode="latin" autocomplete="username" placeholder="PFA-MBR-XXXXXXXX" value="' + P.escape(memberId) + '">' +
              '<p class="help">It looks like PFA-MBR- followed by eight characters.</p>' +
              (message ? '<p class="error" style="display:block">' + P.escape(message) + '</p>' : '') +
            '</div>' +
            '<div class="form-actions">' +
              '<button class="btn dark" type="button" data-send-code>Email me a code</button>' +
              '<a class="btn light" href="membership.html">Become a Patron</a>' +
            '</div>' +
            '<p class="help">No card yet? Membership is 365 rupees a year, one rupee a day, and it opens this door.</p>' +
          '</div>' +
        '</div>' +
      '</div>';

    var field = P.q('#mId', host);
    var button = P.q('[data-send-code]', host);
    field.addEventListener('keydown', function(e){ if(e.key === 'Enter') button.click(); });

    button.onclick = function(){
      var id = C.normaliseId(field.value);
      if(!C.isMemberId(id)){ memberId = field.value; askForNumber('That is not a valid Patron number.'); return; }
      memberId = id;
      button.disabled = true;
      button.textContent = 'Sending';
      C.requestCode(id).then(function(res){
        askForCode(res && res.email ? res.email : '');
      }).catch(function(err){
        askForNumber(err.message);
      });
    };
  }

  function askForCode(masked, message){
    host.innerHTML =
      '<div class="m-gate">' +
        '<p class="kicker">The Circle</p>' +
        '<h1>Check your email.</h1>' +
        '<p>If ' + P.escape(memberId) + ' is a Patron number we hold, a six digit code is on its way' +
        (masked ? ' to ' + P.escape(masked) : '') + '. It is good for a few minutes.</p>' +
        '<div class="form-shell">' +
          '<div class="form-head"><h3>Enter the code</h3><p>Six digits, from the email.</p></div>' +
          '<div class="form-body">' +
            '<div class="field full"><label for="mCode">Your code</label>' +
              '<input id="mCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6-digit code" style="font-size:24px;letter-spacing:.3em">' +
              (message ? '<p class="error" style="display:block">' + P.escape(message) + '</p>' : '') +
            '</div>' +
            '<div class="form-actions">' +
              '<button class="btn dark" type="button" data-verify>Go in</button>' +
              '<button class="btn light" type="button" data-back>Use a different number</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    var field = P.q('#mCode', host);
    var button = P.q('[data-verify]', host);
    field.focus();
    field.addEventListener('keydown', function(e){ if(e.key === 'Enter') button.click(); });
    P.q('[data-back]', host).onclick = function(){ askForNumber(); };

    button.onclick = function(){
      var code = String(field.value || '').replace(/\D/g, '');
      if(code.length !== 6){ askForCode(masked, 'Enter the six digits from the email.'); return; }
      button.disabled = true;
      button.textContent = 'Checking';
      C.submitCode(memberId, code).then(function(){ location.reload(); })
        .catch(function(err){
          if(err && err.code === 'MEMBERSHIP_ENDED'){ membershipEnded(err); return; }
          askForCode(masked, err.message);
        });
    };
  }

  /* The code was right and the person is who they say they are. They simply
     stopped being a member more than thirty days ago. Telling them that
     plainly is kinder than a validation error, and it is not a leak: they
     have just proved they hold the address on the record. */
  function membershipEnded(err){
    var until = err && err.validUntil ? new Date(err.validUntil) : null;
    var when = until && !isNaN(until.getTime())
      ? until.toLocaleDateString('en-IN', {day:'numeric', month:'long', year:'numeric'}) : '';
    host.innerHTML =
      '<div class="m-gate">' +
        '<p class="kicker">Welcome back</p>' +
        '<h1>Your card ran out' + (when ? ' on ' + P.escape(when) : '') + '.</h1>' +
        '<p>We held the door open for thirty days after that, and that window has now closed. ' +
        'Nothing has been deleted. Everything you wrote is still there, still under your name, ' +
        'and it comes back the moment you renew.</p>' +
        '<div class="form-shell">' +
          '<div class="form-head"><h3>Come back in</h3><p>' + P.money(365) + ' a year. A rupee a day.</p></div>' +
          '<div class="form-body"><div class="form-actions" style="margin-top:0">' +
            '<a class="btn dark" href="membership.html">Renew your membership</a>' +
            '<a class="btn light" href="index.html">Not now</a>' +
          '</div></div>' +
        '</div>' +
      '</div>';
  }

  askForNumber();
}

/* --------------------------------------------------------------------------
   Profile setup
   Asked once, on the first visit. The state matters because it is what makes
   the national feed filterable.
   -------------------------------------------------------------------------- */

function setup(host){
  var me = C.me();

  C.suggestHandle(me.name, me.memberId).then(function(handle){
    host.innerHTML =
      '<div class="m-gate">' +
        '<p class="kicker">One time only</p>' +
        '<h1>Say who you are.</h1>' +
        '<p>This is what people see next to everything you write. It takes a minute and you will never be asked again.</p>' +
        '<div class="form-shell">' +
          '<div class="form-body">' +
            '<div class="form-grid">' +
              '<div class="field full"><label for="pName">Your name</label>' +
                '<input id="pName" type="text" required value="' + P.escape(me.name || '') + '" placeholder="As you would like it to appear"></div>' +
              '<div class="field full"><label for="pHandle">Your handle</label>' +
                '<input id="pHandle" type="text" required value="' + P.escape(handle) + '">' +
                '<p class="help">Lowercase letters and numbers. This is how people tag you.</p></div>' +
              '<div class="field"><label for="pState">Your state</label>' +
                '<select id="pState" required><option value="">Choose a state</option>' +
                C.states().map(function(s){
                  return '<option value="' + P.escape(s) + '"' + (s === me.state ? ' selected' : '') + '>' + P.escape(s) + '</option>';
                }).join('') + '</select>' +
                '<p class="help">Everyone reads the whole country. This only lets people narrow it when they want to.</p></div>' +
              '<div class="field"><label for="pCity">Your town or city</label>' +
                '<input id="pCity" type="text" value="' + P.escape(me.city || '') + '" placeholder="Optional"></div>' +
              '<div class="field full"><label for="pRole">What you do with animals</label>' +
                '<input id="pRole" type="text" value="' + P.escape(me.role || '') + '" placeholder="Community caretaker, foster, rescue driver, student, supporter"></div>' +
              '<div class="field full"><label for="pBio">A line about yourself</label>' +
                '<textarea id="pBio" maxlength="240" placeholder="Optional. This is what people read before they ask you for help.">' + P.escape(me.bio || '') + '</textarea></div>' +
            '</div>' +
            '<div class="form-actions"><button class="btn dark" type="button" data-save-profile>Go in</button></div>' +
            '<p class="error" data-setup-error></p>' +
          '</div>' +
        '</div>' +
      '</div>';

    /* The handle follows the name until somebody edits it themselves, so a
       member who was never asked for one still ends up with a sensible one. */
    var handleTouched = false;
    var handleField = P.q('#pHandle', host);
    handleField.addEventListener('input', function(){ handleTouched = true; });
    P.q('#pName', host).addEventListener('input', function(){
      if(handleTouched) return;
      handleField.value = String(this.value || '').toLowerCase()
        .replace(/[^a-z]/g, '').slice(0, 12) || handle;
    });

    P.q('[data-save-profile]', host).onclick = function(){
      var name = P.q('#pName', host).value.trim();
      var state = P.q('#pState', host).value;
      var err = P.q('[data-setup-error]', host);
      var R = window.PFA_RULES;
      var problem = (!name || !state) ? 'A name and a state are the two we cannot do without.'
        : (R ? R.checkField('name', name, {required: true}) : null);
      if(problem){
        err.textContent = problem;
        err.style.display = 'block';
        return;
      }
      this.disabled = true; this.textContent = 'Saving';
      C.saveProfile({
        name: name,
        handle: P.q('#pHandle', host).value,
        state: state,
        city: P.q('#pCity', host).value,
        role: P.q('#pRole', host).value,
        bio: P.q('#pBio', host).value
      }).then(function(){ location.reload(); })
        .catch(function(e){
          err.textContent = e.message || 'That could not be saved.';
          err.style.display = 'block';
          P.q('[data-save-profile]', host).disabled = false;
          P.q('[data-save-profile]', host).textContent = 'Go in';
        });
    };
  });
}

/* --------------------------------------------------------------------------
   Chrome
   -------------------------------------------------------------------------- */

var NAV = [
  {id:'hub',      href:'hub.html',      icon:'\u2302', label:'Feed',     short:'Feed'},
  {id:'circles',  href:'circles.html',  icon:'\u25CD', label:'Circles',  short:'Circles'},
  {id:'events',   href:'events.html',   icon:'\u25A4', label:'Events',   short:'Events'},
  {id:'people',   href:'people.html',   icon:'\u2687', label:'People',   short:'People'},
  {id:'mentions', href:'mentions.html', icon:'@',      label:'Mentions', short:'Mentions'},
  {id:'you',      href:'you.html',      icon:'\u263A', label:'You',      short:'You'}
];

/* The lapsed-membership banner. It appears on every screen in the area, says
   the same thing each time, and counts down honestly. It is not a modal and
   it does not block anything, because the reader is still welcome here. */
function lapsedBanner(){
  var s = C.standing();
  if(s.state === 'active') return '';
  var until = s.until ? s.until.toLocaleDateString('en-IN', {day:'numeric', month:'long', year:'numeric'}) : '';
  return '<div class="m-lapsed" role="status">' +
    '<div class="m-lapsed-copy">' +
      '<strong>Your card ran out on ' + P.escape(until) + '. You can still read everything.</strong>' +
      '<p>Posting, replying and reacting are paused until you renew. ' +
      'You have <b>' + s.daysLeft + (s.daysLeft === 1 ? ' day' : ' days') + '</b> of reading left, ' +
      'and everything you have written stays exactly where it is.</p>' +
    '</div>' +
    '<a class="btn dark" href="membership.html">Renew for ' + P.money(365) + '</a>' +
  '</div>';
}

function paintBanner(){
  var main = P.q('[data-m-main]');
  if(!main || C.canWrite()) return;
  if(P.q('.m-lapsed', main)) return;
  main.insertAdjacentHTML('afterbegin', lapsedBanner());
}

function chrome(){
  var me = C.me();

  return C.loadMentions().catch(function(){ return []; }).then(function(mentions){
    var unread = C.prefs().quiet ? 0 : mentions.filter(function(m){ return m.at > C.lastSeen(); }).length;

    var rail = P.q('[data-m-rail]');
    if(rail){
      rail.innerHTML =
        '<a class="m-rail-who" href="you.html">' +
          '<strong>' + P.escape(me.name) + '</strong>' +
          (me.handle ? '<span>@' + P.escape(me.handle) + '</span>' : '') +
          '<em>' + P.escape([me.role, me.city || me.state].filter(Boolean).join(' \u00b7 ') || 'Patron') + '</em>' +
        '</a>' +
        '<nav class="m-nav" aria-label="Members area">' +
          NAV.map(function(n){
            return '<a href="' + n.href + '"' + (n.id === page ? ' class="active" aria-current="page"' : '') + '>' +
              '<span class="m-nav-icon" aria-hidden="true">' + n.icon + '</span><span>' + n.label + '</span>' +
              (n.id === 'mentions' && unread ? '<span class="m-nav-mark">' + unread + '</span>' : '') + '</a>';
          }).join('') +
        '</nav>' +
        (C.canWrite()
          ? '<div class="m-rail-cta"><a class="btn blue block" href="hub.html#write">Write something</a></div>'
          : '<div class="m-rail-cta"><a class="btn blue block" href="membership.html">Renew your card</a></div>');
    }

    var bar = P.q('[data-m-bar]');
    if(bar){
      bar.innerHTML = '<div class="m-bar-inner">' + NAV.filter(function(n){ return n.id !== 'people'; }).map(function(n){
        return '<a href="' + n.href + '"' + (n.id === page ? ' class="active" aria-current="page"' : '') + '>' +
          '<span aria-hidden="true">' + n.icon + '</span><span>' + n.short + '</span>' +
          (n.id === 'mentions' && unread ? '<span class="m-bar-dot">' + unread + '</span>' : '') + '</a>';
      }).join('') + '</div>';
    }

    return C.loadCircles().catch(function(){ return []; });
  });
}

/* --------------------------------------------------------------------------
   Shared pieces
   -------------------------------------------------------------------------- */

function loading(host, what){
  host.innerHTML = '<div class="m-loading"><span class="m-spin" aria-hidden="true"></span><p>' +
    P.escape(what || 'Loading') + '</p></div>';
}

function empty(host, title, body, action){
  host.innerHTML = '<div class="m-empty"><strong>' + P.escape(title) + '</strong>' +
    '<p>' + P.escape(body) + '</p>' +
    (action ? '<a class="btn dark" href="' + action.href + '">' + P.escape(action.label) + '</a>' : '') +
    '</div>';
}

function failed(host, err){
  var msg = String(err && err.message || err);
  var index = /index/i.test(msg);
  host.innerHTML = '<div class="m-empty"><strong>That could not be loaded</strong>' +
    '<p>' + (index
      ? 'Firestore needs an index for this view. The console link in the browser log creates it in one click.'
      : 'Check your connection and try again.') + '</p>' +
    '<p class="help" style="max-width:60ch;margin:14px auto 0">' + P.escape(msg) + '</p></div>';
}

/* The state filter. National first, always: the default is the whole country
   and narrowing is something the reader chooses, not something done to them. */
function stateBar(host, current, onPick){
  var states = C.states();
  host.innerHTML =
    '<div class="m-scope">' +
      '<span class="m-scope-label">Showing</span>' +
      '<button class="m-filter" type="button" data-scope="" aria-pressed="' + (!current) + '">All of India</button>' +
      '<label class="skip" for="mState">Filter by state</label>' +
      '<select class="filter-select" id="mState" data-state>' +
        '<option value="">Every state</option>' +
        states.map(function(s){
          return '<option value="' + P.escape(s) + '"' + (s === current ? ' selected' : '') + '>' + P.escape(s) + '</option>';
        }).join('') +
      '</select>' +
      (current ? '<span class="m-scope-note">Narrowed to ' + P.escape(current) + '</span>' : '') +
    '</div>';

  P.q('[data-scope]', host).onclick = function(){ onPick(''); };
  P.q('[data-state]', host).onchange = function(){ onPick(this.value); };
}

function rememberState(value){
  var prefs = C.prefs(); prefs.state = value; C.prefs(prefs);
}

/* --------------------------------------------------------------------------
   Post rendering
   -------------------------------------------------------------------------- */

function postHtml(post, opts){
  opts = opts || {};
  var me = C.me();
  var kindClass = post.closed ? 'answered' : post.kind;
  var kindLabel = post.closed ? 'Answered'
    : ({note:'Shared', ask:'Question', sighting:'Sighting', plan:'Plan'})[post.kind] || 'Shared';
  var circle = C.circleById(post.circleId);

  /* Reactions become plain counts when the card has lapsed. Showing a button
     that cannot be pressed is worse than showing no button. */
  var acts = !C.canWrite() ? C.actionsFor(post.kind).map(function(a){
    var list = post[a.key] || [];
    return list.length
      ? '<span class="m-act is-static"><i aria-hidden="true">' + a.icon + '</i><span>' +
        a.label + '</span><b>' + list.length + '</b></span>'
      : '';
  }).join('') : C.actionsFor(post.kind).map(function(a){
    var list = post[a.key] || [];
    var mine = me && list.indexOf(me.memberId) > -1;
    return '<button class="m-act ' + (a.cls || '') + '" type="button" data-react="' + a.key +
      '" data-post="' + post.id + '" aria-pressed="' + (mine ? 'true' : 'false') + '">' +
      '<i aria-hidden="true">' + a.icon + '</i><span>' + a.label + '</span>' +
      (list.length ? '<b>' + list.length + '</b>' : '') + '</button>';
  }).join('');

  var threadBtn = opts.inThread ? '' :
    '<a class="m-act quiet" href="thread.html?id=' + encodeURIComponent(post.id) + '">' +
    '<i aria-hidden="true">\u21A9</i><span>' +
    (post.replyCount ? post.replyCount + (post.replyCount === 1 ? ' reply' : ' replies') : 'Reply') +
    '</span></a>';

  var mine = C.canDelete(post);
  var closeBtn = (mine && post.kind === 'ask' && C.canWrite())
    ? '<button class="m-act quiet" type="button" data-close="' + post.id + '" data-closed="' + post.closed + '">' +
      '<i aria-hidden="true">\u2713</i><span>' + (post.closed ? 'Reopen' : 'Mark answered') + '</span></button>' : '';

  /* Only ever on your own post. The rule in firestore.rules is what enforces
     it; this is only what stops the button appearing where it would fail. */
  var deleteBtn = mine
    ? '<button class="m-act danger" type="button" data-delete-post="' + post.id + '">' +
      '<i aria-hidden="true">\u00d7</i><span>Delete</span></button>' : '';

  var helpers = post.joining || [];
  var helperLine = helpers.length
    ? '<p class="m-helpers"><strong>' + helpers.length +
      (helpers.length === 1 ? ' person has' : ' people have') + ' offered to help.</strong></p>' : '';

  var place = post.place || post.state;

  return '<article class="m-post" data-post-card="' + post.id + '">' +
    '<a href="person.html?id=' + encodeURIComponent(post.authorId) + '" aria-label="' + P.escape(post.authorName) + '">' +
      C.faceHtml(post.authorId, post.authorName) + '</a>' +
    '<div>' +
      '<div class="m-post-head">' +
        '<a class="m-post-name" href="person.html?id=' + encodeURIComponent(post.authorId) + '">' + P.escape(post.authorName) + '</a>' +
        (post.authorHandle ? '<span class="m-post-handle">@' + P.escape(post.authorHandle) + '</span>' : '') +
        '<span class="m-post-dot" aria-hidden="true">\u00b7</span>' +
        '<span class="m-post-time">' + P.escape(C.when(post.at)) + '</span>' +
        (place ? '<span class="m-post-place">' + P.escape(place) + '</span>' : '') +
      '</div>' +
      '<p class="m-post-text">' + C.body(post.text) + '</p>' +
      '<div class="m-post-meta">' +
        '<span class="m-post-kind ' + kindClass + '">' + kindLabel + '</span>' +
        (circle ? '<a class="m-post-kind" href="circle.html?id=' + encodeURIComponent(circle.id) + '">' + P.escape(circle.name) + '</a>' : '') +
      '</div>' +
      helperLine +
      '<div class="m-post-actions">' + acts + threadBtn + closeBtn + deleteBtn + '</div>' +
    '</div>' +
  '</article>';
}

function replyHtml(post, reply){
  var me = C.me();
  var list = reply.helpful || [];
  var mine = me && list.indexOf(me.memberId) > -1;
  var ownIt = C.canDelete(reply);
  return '<article class="m-post is-reply">' +
    '<a href="person.html?id=' + encodeURIComponent(reply.authorId) + '" aria-label="' + P.escape(reply.authorName) + '">' +
      C.faceHtml(reply.authorId, reply.authorName, 'sm') + '</a>' +
    '<div>' +
      '<div class="m-post-head">' +
        '<a class="m-post-name" href="person.html?id=' + encodeURIComponent(reply.authorId) + '">' + P.escape(reply.authorName) + '</a>' +
        (reply.authorHandle ? '<span class="m-post-handle">@' + P.escape(reply.authorHandle) + '</span>' : '') +
        '<span class="m-post-dot" aria-hidden="true">\u00b7</span>' +
        '<span class="m-post-time">' + P.escape(C.when(reply.at)) + '</span>' +
      '</div>' +
      '<p class="m-post-text">' + C.body(reply.text) + '</p>' +
      '<div class="m-post-actions">' +
        '<button class="m-act" type="button" data-react="helpful" data-post="' + post.id + '" data-reply="' + reply.id + '" aria-pressed="' + (mine ? 'true' : 'false') + '">' +
          '<i aria-hidden="true">\u2605</i><span>Helpful</span>' + (list.length ? '<b>' + list.length + '</b>' : '') + '</button>' +
        (ownIt ? '<button class="m-act danger" type="button" data-delete-reply="' + reply.id + '" data-post="' + post.id + '">' +
          '<i aria-hidden="true">\u00d7</i><span>Delete</span></button>' : '') +
      '</div>' +
    '</div>' +
  '</article>';
}

function paintFeed(host, posts, emptyCopy){
  if(!posts.length){ empty(host, emptyCopy.title, emptyCopy.body, emptyCopy.action); return; }
  var out = '', lastDay = '';
  posts.forEach(function(post){
    var day = dayLabel(post.at);
    if(day !== lastDay){ out += '<div class="m-daymark">' + P.escape(day) + '</div>'; lastDay = day; }
    out += postHtml(post);
  });
  out += '<div class="m-end"><strong>That is everything.</strong>' +
    '<p>You have read the whole Circle. There is no more below this. Come back tomorrow, or write something yourself.</p>' +
    '<a class="btn light" href="hub.html#write">Write something</a></div>';
  host.innerHTML = out;
}

function dayLabel(ts){
  var d = new Date(ts), today = new Date();
  if(d.toDateString() === today.toDateString()) return 'Today';
  if(d.toDateString() === new Date(today.getTime() - 86400000).toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', {weekday:'long', day:'numeric', month:'long'});
}

/* --------------------------------------------------------------------------
   Delegated actions
   One listener covers reactions, closing and deleting, including on anything
   drawn after this runs.
   -------------------------------------------------------------------------- */

document.addEventListener('click', function(e){
  if(!e.target.closest) return;

  var react = e.target.closest('[data-react]');
  if(react){
    var on = react.getAttribute('aria-pressed') === 'true';
    react.setAttribute('aria-pressed', on ? 'false' : 'true');   /* answer the tap at once */
    C.react(react.dataset.post, react.dataset.reply || null, react.dataset.react, on)
      .catch(function(){ react.setAttribute('aria-pressed', on ? 'true' : 'false'); P.toast('That did not save'); });
    return;
  }

  var close = e.target.closest('[data-close]');
  if(close){
    C.close(close.dataset.close, close.dataset.closed === 'true')
      .catch(function(){ P.toast('That did not save'); });
    return;
  }

  var delPost = e.target.closest('[data-delete-post]');
  if(delPost){
    confirmDelete('Delete this post?',
      'It goes for everyone, along with every reply underneath it. This cannot be undone.',
      function(){
        C.deletePost(delPost.dataset.deletePost)
          .then(function(){
            P.toast('Deleted');
            if(page === 'thread') location.href = 'hub.html';
          })
          .catch(function(){ P.toast('You can only delete your own posts'); });
      });
    return;
  }

  var delReply = e.target.closest('[data-delete-reply]');
  if(delReply){
    confirmDelete('Delete this reply?', 'It goes for everyone. This cannot be undone.', function(){
      C.deleteReply(delReply.dataset.post, delReply.dataset.deleteReply)
        .then(function(){ P.toast('Deleted'); })
        .catch(function(){ P.toast('You can only delete your own replies'); });
    });
  }
});

function confirmDelete(title, body, proceed){
  var scrim = P.q('#mConfirm');
  if(!scrim){
    scrim = document.createElement('div');
    scrim.className = 'modal-scrim';
    scrim.id = 'mConfirm';
    document.body.appendChild(scrim);
  }
  scrim.innerHTML =
    '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="mConfirmTitle">' +
      '<div class="modal-body"><div class="m-pause danger">' +
        '<strong id="mConfirmTitle">' + P.escape(title) + '</strong>' +
        '<p>' + P.escape(body) + '</p>' +
        '<div class="m-pause-actions">' +
          '<button class="btn light" type="button" data-no>Keep it</button>' +
          '<button class="btn danger" type="button" data-yes>Delete</button>' +
        '</div>' +
      '</div></div>' +
    '</div>';
  scrim.classList.add('open');
  document.body.classList.add('locked');
  function shut(){ scrim.classList.remove('open'); document.body.classList.remove('locked'); }
  P.q('[data-no]', scrim).onclick = shut;
  P.q('[data-yes]', scrim).onclick = function(){ shut(); proceed(); };
}

/* --------------------------------------------------------------------------
   Composer
   -------------------------------------------------------------------------- */

function composer(host, opts){
  opts = opts || {};
  if(!host) return;

  /* A lapsed member gets an explanation where the box would have been,
     rather than a box that fails when they press Post. Nothing is more
     annoying than being allowed to type four hundred characters and then
     told they do not count. */
  if(!C.canWrite()){
    /* The banner at the top of the screen has already explained the state
       and offered the renewal, so this is deliberately quiet: it marks the
       missing box and gets out of the way. Two amber panels saying the same
       thing would be nagging. */
    host.innerHTML =
      '<div class="m-readonly">' +
        '<span>' + (opts.replyTo ? 'Replying is paused' : 'Writing is paused') +
        ' until you renew.</span>' +
        '<a class="text-link" href="membership.html">Renew your card</a>' +
      '</div>';
    return;
  }

  var me = C.me();
  var circles = C.circleById ? (C.loadCircles.cache || null) : null;

  C.loadCircles().then(function(list){
    var state = {kind: opts.kind || 'note', tags: [], circleId: opts.circleId || (list[0] && list[0].id) || ''};
    var kinds = opts.reply ? [] : Object.keys(C.KINDS);

    host.innerHTML =
      (kinds.length ? '<div class="m-composer-top" role="group" aria-label="What kind of post">' +
        kinds.map(function(k){
          return '<button class="m-kind" type="button" data-kind="' + k + '" aria-pressed="' + (k === state.kind) + '">' +
            '<i aria-hidden="true">' + C.KINDS[k].icon + '</i><span>' + C.KINDS[k].label + '</span></button>';
        }).join('') + '</div>' : '') +
      '<div class="m-composer-body">' +
        '<p class="m-composer-hint" data-hint>' + (opts.reply ? 'Reply to this. Say the useful part first.' : C.KINDS[state.kind].hint) + '</p>' +
        '<label class="skip" for="mWrite">Your message</label>' +
        '<textarea id="mWrite" data-write maxlength="' + C.LIMIT + '" placeholder="' +
          (opts.placeholder || 'Write it plainly. 401 characters is enough for anything worth saying.') + '"></textarea>' +
        '<div class="m-meter" data-meter><span></span></div>' +
      '</div>' +
      '<div class="m-chipline" data-chips></div>' +
      '<div class="m-picker" data-picker>' +
        '<div class="m-picker-search"><input type="search" data-picker-search placeholder="Search members by name or town" aria-label="Search members"></div>' +
        '<div data-picker-list></div>' +
      '</div>' +
      '<div class="m-composer-foot">' +
        '<button class="btn light" type="button" data-tag-open>Tag a member</button>' +
        (opts.reply || !list.length ? '' :
          '<label class="skip" for="mCircle">Post to which circle</label>' +
          '<select class="filter-select" id="mCircle" data-circle>' +
          list.map(function(c){
            return '<option value="' + c.id + '"' + (c.id === state.circleId ? ' selected' : '') + '>' + P.escape(c.name) + '</option>';
          }).join('') + '</select>') +
        '<span class="m-count" data-count><b>401</b><small>left</small></span>' +
        '<button class="btn dark" type="button" data-send disabled>' + (opts.reply ? 'Post reply' : 'Post it') + '</button>' +
      '</div>';

    var write = P.q('[data-write]', host), meter = P.q('[data-meter]', host);
    var count = P.q('[data-count]', host), send = P.q('[data-send]', host);
    var chips = P.q('[data-chips]', host), picker = P.q('[data-picker]', host);
    var pSearch = P.q('[data-picker-search]', host), pList = P.q('[data-picker-list]', host);
    var hint = P.q('[data-hint]', host);
    var people = null;

    function tick(){
      /* maxlength stops typing but not pasting, and not a script setting
         .value directly. Clamping here is what actually holds the 401. */
      if(write.value.length > C.LIMIT){
        var at = write.selectionStart;
        write.value = write.value.slice(0, C.LIMIT);
        try{ write.setSelectionRange(Math.min(at, C.LIMIT), Math.min(at, C.LIMIT)); }catch(e){}
        P.toast('401 characters is the limit');
      }
      var left = C.LIMIT - write.value.length;
      P.q('span', meter).style.width = Math.min((write.value.length / C.LIMIT) * 100, 100) + '%';
      P.q('b', count).textContent = left;
      var warn = left <= 40, stop = left <= 10;
      meter.classList.toggle('warn', warn && !stop);
      meter.classList.toggle('stop', stop);
      count.classList.toggle('warn', warn && !stop);
      count.classList.toggle('stop', stop);
      send.disabled = !write.value.trim();
    }

    function drawChips(){
      chips.innerHTML = state.tags.map(function(t){
        return '<span class="m-tagchip">@' + P.escape(t.handle || t.name) +
          '<button type="button" data-untag="' + P.escape(t.memberId) + '" aria-label="Remove ' + P.escape(t.name) + '">\u00d7</button></span>';
      }).join('');
      P.qa('[data-untag]', chips).forEach(function(b){
        b.onclick = function(){
          state.tags = state.tags.filter(function(t){ return t.memberId !== b.dataset.untag; });
          drawChips();
        };
      });
    }

    function drawPicker(term){
      var q = String(term || '').toLowerCase();
      var list2 = (people || []).filter(function(m){
        if(m.memberId === me.memberId) return false;
        if(state.tags.some(function(t){ return t.memberId === m.memberId; })) return false;
        return !q || (m.name + ' ' + m.handle + ' ' + m.city + ' ' + m.state).toLowerCase().indexOf(q) > -1;
      }).slice(0, 25);

      pList.innerHTML = list2.length ? list2.map(function(m){
        return '<button class="m-pick" type="button" data-add="' + P.escape(m.memberId) + '">' +
          C.faceHtml(m.memberId, m.name, 'sm') +
          '<span><strong>' + P.escape(m.name) + '</strong><small>' +
          (m.handle ? '@' + P.escape(m.handle) : '') +
          ([m.city, m.state].filter(Boolean).length ? ' \u00b7 ' + P.escape([m.city, m.state].filter(Boolean).join(', ')) : '') +
          '</small></span></button>';
      }).join('') : '<div class="m-picker-empty">' +
        (people && people.length ? 'Nobody matches that. Try a first name or a town.' : 'No other members have set up a profile yet.') +
        '</div>';

      P.qa('[data-add]', pList).forEach(function(b){
        b.onclick = function(){
          var found = null;
          people.forEach(function(m){ if(m.memberId === b.dataset.add) found = m; });
          if(!found) return;
          if(state.tags.length >= C.MAX_TAGS){ P.toast('Three people is the limit'); closePicker(); return; }
          state.tags.push(found);
          var m = write.value.match(/@([a-z0-9_]*)$/i);
          if(m) write.value = write.value.slice(0, -m[0].length) + '@' + (found.handle || '') + ' ';
          drawChips(); closePicker(); tick(); write.focus();
        };
      });
    }

    function openPicker(term){
      picker.classList.add('open');
      if(!people){
        pList.innerHTML = '<div class="m-picker-empty">Loading members</div>';
        C.loadPeople().then(function(list3){ people = list3; drawPicker(term); })
          .catch(function(){ pList.innerHTML = '<div class="m-picker-empty">Members could not be loaded.</div>'; });
      } else drawPicker(term);
      pSearch.value = term || '';
      if(!term) setTimeout(function(){ pSearch.focus(); }, 20);
    }
    function closePicker(){ picker.classList.remove('open'); }

    P.q('[data-tag-open]', host).onclick = function(){
      picker.classList.contains('open') ? closePicker() : openPicker('');
    };
    pSearch.oninput = function(){ drawPicker(pSearch.value); };

    write.addEventListener('input', function(){
      tick();
      var m = write.value.slice(0, write.selectionStart).match(/@([a-z0-9_]*)$/i);
      if(m) openPicker(m[1]); else closePicker();
    });
    write.addEventListener('keydown', function(e){
      if(e.key === 'Escape') closePicker();
      if((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !send.disabled) send.click();
    });

    P.qa('[data-kind]', host).forEach(function(b){
      b.onclick = function(){
        state.kind = b.dataset.kind;
        P.qa('[data-kind]', host).forEach(function(x){ x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        hint.textContent = C.KINDS[state.kind].hint;
        write.focus();
      };
    });

    var sel = P.q('[data-circle]', host);
    if(sel) sel.onchange = function(){ state.circleId = sel.value; };

    send.onclick = function(){
      var text = write.value.trim();
      if(!text) return;
      function commit(){
        send.disabled = true;
        var job = opts.reply
          ? C.reply(opts.reply, text)
          : C.write({kind: state.kind, text: text, circleId: state.circleId,
                     tags: state.tags.map(function(t){ return t.memberId; })});
        job.then(function(){
          write.value = ''; state.tags = []; drawChips(); tick();
          P.toast(opts.reply ? 'Reply posted' : 'Posted');
          if(opts.onPost) opts.onPost();
        }).catch(function(err){
          send.disabled = false;
          P.toast(err.message || 'That could not be posted');
        });
      }
      C.readsHot(text) ? pause(text, commit) : commit();
    };

    drawChips(); tick();
  });
}

/* The interstitial. Shown once, never twice for the same text. */
function pause(text, proceed){
  var scrim = P.q('#mPause');
  if(!scrim){
    scrim = document.createElement('div');
    scrim.className = 'modal-scrim'; scrim.id = 'mPause';
    document.body.appendChild(scrim);
  }
  scrim.innerHTML =
    '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="mPauseTitle">' +
      '<div class="modal-body"><div class="m-pause">' +
        '<strong id="mPauseTitle">Read it once more?</strong>' +
        '<p>This one reads as heated. Nobody has seen it yet, so there is nothing to take back. ' +
        'Send it as it is, or change a line first. Both are fine.</p>' +
        '<blockquote>' + P.escape(text) + '</blockquote>' +
        '<div class="m-pause-actions">' +
          '<button class="btn dark" type="button" data-pause-edit>Go back and edit</button>' +
          '<button class="btn light" type="button" data-pause-send>Send it as it is</button>' +
        '</div>' +
      '</div></div>' +
    '</div>';
  scrim.classList.add('open');
  document.body.classList.add('locked');
  function shut(){ scrim.classList.remove('open'); document.body.classList.remove('locked'); }
  P.q('[data-pause-edit]', scrim).onclick = shut;
  P.q('[data-pause-send]', scrim).onclick = function(){ shut(); proceed(); };
}

/* --------------------------------------------------------------------------
   Screens
   -------------------------------------------------------------------------- */

function run(){
  ({hub: hub, circles: circles, circle: oneCircle, events: events, people: people,
    person: person, mentions: mentions, thread: thread, you: you}[page] || hub)();
}

/* ---- Feed ---------------------------------------------------------------- */

function hub(){
  var feed = P.q('[data-m-feed]');
  var kind = 'all';
  var state = C.prefs().state || '';
  var stop = null;

  var KINDS = [
    {value:'all',      label:'Everything'},
    {value:'ask',      label:'Questions'},
    {value:'plan',     label:'Plans'},
    {value:'sighting', label:'Sightings'},
    {value:'note',     label:'Shared'}
  ];

  composer(P.q('[data-m-composer]'), {});

  function drawKinds(){
    var host = P.q('[data-m-filters]');
    host.innerHTML = KINDS.map(function(o){
      return '<button class="m-filter" type="button" data-val="' + o.value + '" aria-pressed="' +
        (o.value === kind) + '">' + P.escape(o.label) + '</button>';
    }).join('');
    P.qa('[data-val]', host).forEach(function(b){
      b.onclick = function(){ kind = b.dataset.val; drawKinds(); attach(); };
    });
  }

  function attach(){
    if(stop) stop();
    loading(feed, 'Reading the Circle');
    stateBar(P.q('[data-m-scope]'), state, function(next){
      state = next; rememberState(next); attach();
    });
    stop = watch(C.watchFeed({state: state}, function(posts){
      var list = kind === 'all' ? posts : posts.filter(function(p){ return p.kind === kind; });
      paintFeed(feed, list, {
        title: state ? 'Nothing from ' + state + ' yet' : 'The Circle is empty',
        body: state
          ? 'No member in ' + state + ' has posted under this filter. Switch back to all of India, or write the first one.'
          : 'Nobody has written anything yet. Somebody has to go first, and it may as well be you.',
        action: {href: 'hub.html#write', label: 'Write the first post'}
      });
    }, function(err){ failed(feed, err); }));
  }

  drawKinds();
  attach();
  sideRails();

  if(location.hash === '#write'){
    setTimeout(function(){ var t = P.q('[data-write]'); if(t) t.focus(); }, 400);
  }
}

function sideRails(){
  var rules = P.q('[data-m-panel-rules]');
  if(rules){
    rules.innerHTML =
      '<div class="m-panel-head"><h2>How this place works</h2></div>' +
      '<div class="m-panel-body"><p>Nine choices, mostly about what is missing. The short version: nobody has a score, ' +
      'nothing can be quoted to be mocked, and the feed ends.</p></div>' +
      '<div class="m-panel-list"><a href="you.html#rules"><span><strong>Read the house rules</strong>' +
      '<small>Nine of them, one screen</small></span></a></div>';
  }

  var mine = P.q('[data-m-panel-circles]');
  if(mine){
    C.joined().then(function(ids){
      mine.innerHTML =
        '<div class="m-panel-head"><h2>Your circles</h2><a class="text-link" href="circles.html">All circles</a></div>' +
        (ids.length
          ? '<div class="m-panel-list">' + ids.map(function(id){
              var c = C.circleById(id);
              return c ? '<a href="circle.html?id=' + encodeURIComponent(id) + '"><span><strong>' +
                P.escape(c.name) + '</strong><small>' + P.escape(c.kind) + '</small></span></a>' : '';
            }).join('') + '</div>'
          : '<div class="m-panel-body"><p>You have not joined a circle yet. Joining does not filter your feed, it just puts a room one tap away.</p></div>');
    });
  }

  var next = P.q('[data-m-panel-next]');
  if(next){
    watch(C.watchEvents({}, function(list){
      var soon = list.filter(function(e){ return e.at > Date.now(); }).slice(0, 3);
      next.innerHTML =
        '<div class="m-panel-head"><h2>Coming up</h2><a class="text-link" href="events.html">All events</a></div>' +
        (soon.length
          ? '<div class="m-panel-list">' + soon.map(function(e){
              var d = C.dateParts(e.at);
              return '<a href="events.html"><span><strong>' + P.escape(e.title) + '</strong><small>' +
                d.weekday + ' ' + d.day + ' ' + d.month + ' \u00b7 ' + P.escape(e.where) + '</small></span></a>';
            }).join('') + '</div>'
          : '<div class="m-panel-body"><p>Nothing is planned yet.</p></div>');
    }, function(){ next.remove(); }));
  }
}

/* ---- Circles ------------------------------------------------------------- */

function circles(){
  var host = P.q('[data-m-circles]');
  var kind = 'all';
  loading(host, 'Loading circles');

  Promise.all([C.loadCircles(), C.joined()]).then(function(res){
    var list = res[0], joined = res[1];

    function paint(){
      var filters = P.q('[data-m-filters]');
      var opts = [{value:'all', label:'All circles'}, {value:'yours', label:'Joined'},
                  {value:'Topic', label:'By topic'}, {value:'City', label:'By place'}];
      filters.innerHTML = opts.map(function(o){
        return '<button class="m-filter" type="button" data-val="' + o.value + '" aria-pressed="' +
          (o.value === kind) + '">' + P.escape(o.label) + '</button>';
      }).join('');
      P.qa('[data-val]', filters).forEach(function(b){
        b.onclick = function(){ kind = b.dataset.val; paint(); };
      });

      var shown = list.filter(function(c){
        if(kind === 'all') return true;
        if(kind === 'yours') return joined.indexOf(c.id) > -1;
        return c.kind === kind;
      });

      if(!list.length){
        empty(host, 'No circles yet',
          'Circles are set up by PFA, not by members. Once an administrator adds them they appear here.');
        return;
      }
      if(!shown.length){
        empty(host, kind === 'yours' ? 'You have not joined any' : 'None of those',
          kind === 'yours' ? 'Join one from the full list and it turns up here.' : 'Try another filter.');
        return;
      }

      host.innerHTML = '<div class="m-grid">' + shown.map(function(c){
        var isIn = joined.indexOf(c.id) > -1;
        return '<div class="m-card">' +
          '<span class="m-post-kind' + (c.kind === 'City' ? ' plan' : '') + '">' + P.escape(c.kind) + '</span>' +
          '<h3>' + P.escape(c.name) + '</h3>' +
          '<p>' + P.escape(c.blurb) + '</p>' +
          '<div class="m-card-foot">' +
            '<a class="btn light" href="circle.html?id=' + encodeURIComponent(c.id) + '">Open</a>' +
            (C.canWrite()
              ? '<button class="btn ' + (isIn ? 'light' : 'dark') + '" type="button" data-join="' + c.id + '">' +
                (isIn ? 'Leave' : 'Join') + '</button>'
              : (isIn ? '<span class="m-act is-static"><span>Joined</span></span>' : '')) +
          '</div></div>';
      }).join('') + '</div>';

      P.qa('[data-join]', host).forEach(function(b){
        b.onclick = function(){
          var id = b.dataset.join, isIn = joined.indexOf(id) > -1;
          b.disabled = true;
          C.toggleJoin(id, isIn).then(function(added){
            if(added) joined.push(id); else joined = joined.filter(function(x){ return x !== id; });
            P.toast(added ? 'Joined' : 'Left');
            paint();
          }).catch(function(){ b.disabled = false; P.toast('That did not save'); });
        };
      });
    }
    paint();
  }).catch(function(err){ failed(host, err); });

  sideRails();
}

/* ---- One circle ---------------------------------------------------------- */

function oneCircle(){
  var id = P.param('id');
  var head = P.q('[data-m-circle-head]');
  var feed = P.q('[data-m-feed]');
  var state = C.prefs().state || '';
  var stop = null;

  if(!id){ empty(head, 'No circle chosen', 'Pick one from the list.', {href:'circles.html', label:'All circles'}); return; }

  Promise.all([C.loadCircles(), C.joined()]).then(function(res){
    var c = C.circleById(id), joined = res[1];
    if(!c){
      empty(head, 'That circle does not exist', 'It may have been renamed.', {href:'circles.html', label:'All circles'});
      var comp = P.q('[data-m-composer]'); if(comp) comp.remove();
      return;
    }

    function paintHead(){
      var isIn = joined.indexOf(id) > -1;
      head.innerHTML =
        '<div class="m-head">' +
          '<p class="kicker">' + P.escape(c.kind) + ' circle</p>' +
          '<h1>' + P.escape(c.name) + '</h1>' +
          '<p>' + P.escape(c.blurb) + '</p>' +
          '<div class="m-profile-actions">' +
            (C.canWrite()
              ? '<button class="btn ' + (isIn ? 'light' : 'dark') + '" type="button" data-join>' +
                (isIn ? 'Leave this circle' : 'Join this circle') + '</button>'
              : (isIn ? '<span class="m-act is-static"><span>You are in this circle</span></span>' : '')) +
            '<a class="btn light" href="circles.html">All circles</a>' +
          '</div>' +
        '</div>' +
        '<div data-m-scope></div>';

      P.q('[data-join]', head).onclick = function(){
        var isNow = joined.indexOf(id) > -1;
        C.toggleJoin(id, isNow).then(function(added){
          if(added) joined.push(id); else joined = joined.filter(function(x){ return x !== id; });
          P.toast(added ? 'Joined ' + c.name : 'Left ' + c.name);
          paintHead(); attachScope();
        });
      };
      attachScope();
    }

    function attachScope(){
      stateBar(P.q('[data-m-scope]', head), state, function(next){
        state = next; rememberState(next); attach();
      });
    }

    function attach(){
      if(stop) stop();
      loading(feed, 'Reading ' + c.name);
      stop = watch(C.watchFeed({circleId: id, state: state}, function(posts){
        paintFeed(feed, posts, {
          title: 'Nothing in here yet',
          body: state
            ? 'Nobody in ' + state + ' has written in this circle. Switch to all of India, or write the first one.'
            : 'This circle is empty. The first post sets the tone, so make it a useful one.'
        });
      }, function(err){ failed(feed, err); }));
    }

    composer(P.q('[data-m-composer]'), {circleId: id});
    paintHead();
    attach();
  }).catch(function(err){ failed(head, err); });

  sideRails();
}

/* ---- Events -------------------------------------------------------------- */

function events(){
  var host = P.q('[data-m-events]');
  var view = 'upcoming';
  var state = C.prefs().state || '';
  var stop = null;
  var me = C.me();

  function attach(){
    if(stop) stop();
    loading(host, 'Loading events');
    stateBar(P.q('[data-m-scope]'), state, function(next){ state = next; rememberState(next); attach(); });

    stop = watch(C.watchEvents({state: state}, function(list){
      var filters = P.q('[data-m-filters]');
      var opts = [{value:'upcoming', label:'Coming up'}, {value:'going', label:'You are going'},
                  {value:'needs', label:'Still needs people'}];
      filters.innerHTML = opts.map(function(o){
        return '<button class="m-filter" type="button" data-val="' + o.value + '" aria-pressed="' +
          (o.value === view) + '">' + P.escape(o.label) + '</button>';
      }).join('');
      P.qa('[data-val]', filters).forEach(function(b){
        b.onclick = function(){ view = b.dataset.val; attach(); };
      });

      var shown = list.filter(function(e){
        if(view === 'going') return (e.going || []).indexOf(me.memberId) > -1;
        if(view === 'needs') return (e.going || []).length < e.need;
        return e.at > Date.now() - 86400000;
      });

      if(!shown.length){
        empty(host, 'Nothing here',
          list.length ? 'No event matches that.' :
          'No events yet. Members organise these themselves: post a Plan in a circle and turn it into one.',
          {href:'hub.html#write', label:'Post a plan'});
        return;
      }

      host.innerHTML = shown.map(function(e){
        var d = C.dateParts(e.at);
        var going = e.going || [];
        var mine = going.indexOf(me.memberId) > -1;
        var short = Math.max(0, e.need - going.length);
        var c = C.circleById(e.circleId);
        return '<article class="m-event">' +
          '<div class="m-date"><span>' + d.month + '</span><strong>' + d.day + '</strong><em>' + d.weekday + '</em></div>' +
          '<div><h3>' + P.escape(e.title) + '</h3>' +
            '<p>' + P.escape(e.note) + '</p>' +
            '<div class="m-event-facts">' +
              '<span><i aria-hidden="true">\u2316</i>' + P.escape([e.where, e.state].filter(Boolean).join(', ')) + '</span>' +
              (e.hostName ? '<span><i aria-hidden="true">\u263A</i>Hosted by ' + P.escape(e.hostName) + '</span>' : '') +
              '<span><i aria-hidden="true">\u2713</i>' + going.length + ' coming' +
                (e.need ? (short ? ' \u00b7 ' + short + ' more needed' : ' \u00b7 enough hands') : '') + '</span>' +
            '</div>' +
            '<div class="m-post-actions">' +
              (C.canWrite()
                ? '<button class="btn ' + (mine ? 'light' : 'dark') + '" type="button" data-rsvp="' + e.id + '" data-going="' + mine + '">' +
                  (mine ? 'You are coming, cancel' : 'I am coming') + '</button>'
                : (mine ? '<span class="m-act is-static"><i aria-hidden="true">\u2713</i><span>You are coming</span></span>' : '')) +
              (c ? '<a class="m-act quiet" href="circle.html?id=' + encodeURIComponent(c.id) + '"><span>' + P.escape(c.name) + '</span></a>' : '') +
            '</div>' +
          '</div></article>';
      }).join('');

      P.qa('[data-rsvp]', host).forEach(function(b){
        b.onclick = function(){
          b.disabled = true;
          C.rsvp(b.dataset.rsvp, b.dataset.going === 'true')
            .then(function(){ P.toast(b.dataset.going === 'true' ? 'Taken off the list' : 'You are on the list'); })
            .catch(function(){ b.disabled = false; P.toast('That did not save'); });
        };
      });
    }, function(err){ failed(host, err); }));
  }

  attach();
  sideRails();
}

/* ---- People -------------------------------------------------------------- */

function people(){
  var host = P.q('[data-m-people]');
  var box = P.q('[data-m-search]');
  var state = C.prefs().state || '';
  var all = [];

  if(P.param('q')) box.value = P.param('q');

  function paint(){
    var q = String(box.value || '').toLowerCase().trim();
    var list = all.filter(function(m){
      return !q || (m.name + ' ' + m.handle + ' ' + m.city + ' ' + m.state + ' ' + m.role + ' ' + m.bio).toLowerCase().indexOf(q) > -1;
    });
    if(!list.length){
      empty(host, all.length ? 'Nobody matches that' : 'No members yet',
        all.length ? 'Try a first name, a town, or the thing you need: legal, foster, birds.'
                   : 'You are the first member here. Others appear as they set up their profile.');
      return;
    }
    host.innerHTML = list.map(function(m){
      return '<div class="m-person">' +
        '<a href="person.html?id=' + encodeURIComponent(m.memberId) + '">' + C.faceHtml(m.memberId, m.name) + '</a>' +
        '<div style="min-width:0"><a href="person.html?id=' + encodeURIComponent(m.memberId) + '">' +
          '<strong>' + P.escape(m.name) + '</strong></a><small>' +
          P.escape([m.role, [m.city, m.state].filter(Boolean).join(', ')].filter(Boolean).join(' \u00b7 ')) + '</small></div>' +
        '<a class="btn light" href="person.html?id=' + encodeURIComponent(m.memberId) + '">Open</a>' +
      '</div>';
    }).join('');
  }

  function load(){
    loading(host, 'Loading members');
    stateBar(P.q('[data-m-scope]'), state, function(next){ state = next; rememberState(next); load(); });
    C.loadPeople(state).then(function(list){ all = list; paint(); })
      .catch(function(err){ failed(host, err); });
  }

  box.addEventListener('input', paint);
  load();
  sideRails();
}

/* ---- One person ---------------------------------------------------------- */

function person(){
  var id = P.param('id') || C.me().memberId;
  var head = P.q('[data-m-person]');
  var feed = P.q('[data-m-feed]');
  loading(head, 'Loading');

  C.person(id).then(function(m){
    if(!m){
      empty(head, 'No such member', 'They may not have set up a Circle profile yet.',
        {href:'people.html', label:'All members'});
      feed.innerHTML = '';
      return;
    }
    head.innerHTML =
      '<div class="m-profile">' + C.faceHtml(m.memberId, m.name, 'lg') +
        '<div class="m-profile-copy">' +
          '<h1>' + P.escape(m.name) + '</h1>' +
          (m.handle ? '<p class="m-profile-handle">@' + P.escape(m.handle) + '</p>' : '') +
          (m.bio ? '<p class="m-profile-bio">' + P.escape(m.bio) + '</p>' : '') +
          '<div class="m-profile-facts">' +
            (m.role ? '<span>' + P.escape(m.role) + '</span>' : '') +
            ([m.city, m.state].filter(Boolean).length ? '<span>' + P.escape([m.city, m.state].filter(Boolean).join(', ')) + '</span>' : '') +
          '</div>' +
          (m.memberId === C.me().memberId ? '<div class="m-profile-actions"><a class="btn light" href="you.html">Edit your details</a></div>' : '') +
        '</div></div>';

    loading(feed, 'Loading posts');
    watch(C.watchFeed({authorId: id}, function(posts){
      paintFeed(feed, posts, {
        title: 'Nothing written yet',
        body: m.memberId === C.me().memberId
          ? 'Your posts appear here once you write one.'
          : String(m.name).split(' ')[0] + ' has not posted yet. You can still tag them.'
      });
    }, function(err){ failed(feed, err); }));
  }).catch(function(err){ failed(head, err); });

  sideRails();
}

/* ---- Mentions ------------------------------------------------------------ */

function mentions(){
  var host = P.q('[data-m-mentions]');
  loading(host, 'Checking mentions');

  C.loadMentions().then(function(list){
    C.lastSeen(Date.now());
    if(!list.length){
      empty(host, 'Nothing waiting',
        'When somebody tags you in a post, it turns up here. Nothing else does: no follows, no likes, no suggestions.',
        {href:'hub.html', label:'Back to the Circle'});
      return;
    }
    host.innerHTML = list.map(function(p){
      return '<div class="m-daymark">' + P.escape(p.authorName) + ' tagged you</div>' + postHtml(p);
    }).join('');
  }).catch(function(err){ failed(host, err); });

  sideRails();
}

/* ---- Thread -------------------------------------------------------------- */

function thread(){
  var id = P.param('id');
  var host = P.q('[data-m-thread]');
  var post = null, replies = [], mounted = false;

  if(!id){ empty(host, 'No conversation chosen', 'Pick one from the feed.', {href:'hub.html', label:'The Circle'}); return; }
  loading(host, 'Loading the conversation');

  function paint(){
    if(!post){
      empty(host, 'That conversation is gone',
        'It may have been deleted by the person who wrote it. The Circle is still there.',
        {href:'hub.html', label:'Back to the Circle'});
      return;
    }
    host.innerHTML =
      postHtml(post, {inThread:true}) +
      (replies.length ? '<div class="m-daymark">' + replies.length + (replies.length === 1 ? ' reply' : ' replies') + '</div>' : '') +
      replies.map(function(r){ return replyHtml(post, r); }).join('') +
      (post.closed
        ? '<div class="m-end"><strong>Answered and closed.</strong><p>' + P.escape(post.authorName) +
          ' marked this answered, so it has stopped taking replies. A solved question should not still be collecting opinions on Thursday.</p></div>'
        : '<section class="m-composer" data-m-reply></section>');

    var box = P.q('[data-m-reply]');
    if(box && !mounted){
      mounted = true;
      composer(box, {reply: post.id, placeholder: 'Reply to ' + String(post.authorName).split(' ')[0] + '. Say the useful part first.'});
    } else if(box){
      composer(box, {reply: post.id, placeholder: 'Reply to ' + String(post.authorName).split(' ')[0] + '. Say the useful part first.'});
    }
  }

  watch(C.watchPost(id, function(p){ post = p; paint(); }, function(err){ failed(host, err); }));
  watch(C.watchReplies(id, function(list){ replies = list; if(post) paint(); }, function(){}));

  sideRails();
}

/* ---- You ----------------------------------------------------------------- */

var HOUSE_RULES = [
  ['Nobody has a score', 'There are no follower counts, no view counts and no leaderboards. You cannot tell who is popular here, which means there is nothing to win by performing.'],
  ['You cannot quote to mock', 'There is no way to lift somebody\u2019s post onto your own page with a comment attached. If you disagree, you reply underneath, where they can answer. That one missing button removes most of what goes wrong elsewhere.'],
  ['Reactions only go one way', 'Helpful, Same here, I\u2019m in. There is no way to react against a person. Disagreement takes words, and words take a moment\u2019s thought.'],
  ['401 characters', 'Long enough for a real answer, short enough that you have to decide what you mean. It is also why this place costs almost nothing to run.'],
  ['No photographs, video or audio', 'Text only, everywhere, always. Partly it is storage we would rather spend on animals. Mostly it is that a page of pictures asks to be scrolled and a page of sentences asks to be read.'],
  ['You own what you wrote', 'You can delete any post or reply of your own, at any time, and it goes for everyone. You cannot delete anybody else\u2019s, and nobody can delete yours.'],
  ['Questions close', 'When the person who asked marks it answered, the thread stops taking replies. A solved problem should not still be collecting opinions on Thursday.'],
  ['A pause before heat', 'If a reply reads as angry, you see it once more before anyone else does. You can still send it exactly as written. Most people change a line.'],
  ['Three tags, not a crowd', 'You can bring three people into a post. You cannot summon forty. Tagging is for including someone, not for pointing at them.'],
  ['The whole country, unless you say otherwise', 'The feed is national by default. You can narrow it to one state whenever you want, and widen it again just as easily. Nobody is walled into their own patch.']
];

function you(){
  var me = C.me();
  var host = P.q('[data-m-you]');

  host.innerHTML =
    '<div class="m-profile">' + C.faceHtml(me.memberId, me.name, 'lg') +
      '<div class="m-profile-copy">' +
        '<h1>' + P.escape(me.name) + '</h1>' +
        (me.handle ? '<p class="m-profile-handle">@' + P.escape(me.handle) + '</p>' : '') +
        '<p class="m-profile-bio">' + (me.bio ? P.escape(me.bio) :
          'You have not written a note about yourself yet. One or two sentences about what you do is enough: it is what people read before they ask you for help.') + '</p>' +
        '<div class="m-profile-facts">' +
          (me.role ? '<span>' + P.escape(me.role) + '</span>' : '') +
          ([me.city, me.state].filter(Boolean).length ? '<span>' + P.escape([me.city, me.state].filter(Boolean).join(', ')) + '</span>' : '') +
          '<span>' + P.escape(me.memberId) + '</span>' +
        '</div>' +
        '<div class="m-profile-actions">' +
          '<button class="btn dark" type="button" data-edit>Edit your details</button>' +
          '<a class="btn light" href="member.html">Your Patron Card</a>' +
          '<button class="btn light" type="button" data-signout>Sign out</button>' +
        '</div>' +
      '</div></div>' +
    '<div data-m-edit hidden></div>';

  P.q('[data-signout]', host).onclick = function(){
    C.signOut().then(function(){ location.href = 'hub.html'; });
  };

  P.q('[data-edit]', host).onclick = function(){
    var box = P.q('[data-m-edit]', host);
    box.hidden = false;
    box.innerHTML =
      '<div class="m-pad"><div class="form-shell"><div class="form-body"><div class="form-grid">' +
        '<div class="field full"><label for="eName">Your name</label><input id="eName" value="' + P.escape(me.name) + '"></div>' +
        '<div class="field full"><label for="eHandle">Your handle</label><input id="eHandle" value="' + P.escape(me.handle) + '"></div>' +
        '<div class="field"><label for="eState">Your state</label><select id="eState">' +
          C.states().map(function(s){ return '<option value="' + P.escape(s) + '"' + (s === me.state ? ' selected' : '') + '>' + P.escape(s) + '</option>'; }).join('') +
        '</select></div>' +
        '<div class="field"><label for="eCity">Your town or city</label><input id="eCity" value="' + P.escape(me.city) + '"></div>' +
        '<div class="field full"><label for="eRole">What you do with animals</label><input id="eRole" value="' + P.escape(me.role) + '"></div>' +
        '<div class="field full"><label for="eBio">A line about yourself</label><textarea id="eBio" maxlength="240">' + P.escape(me.bio) + '</textarea></div>' +
      '</div><div class="form-actions"><button class="btn dark" type="button" data-save>Save</button>' +
      '<button class="btn light" type="button" data-cancel>Cancel</button></div></div></div></div>';

    P.q('[data-cancel]', box).onclick = function(){ box.hidden = true; box.innerHTML = ''; };
    P.q('[data-save]', box).onclick = function(){
      this.disabled = true; this.textContent = 'Saving';
      C.saveProfile({
        name: P.q('#eName', box).value, handle: P.q('#eHandle', box).value,
        state: P.q('#eState', box).value, city: P.q('#eCity', box).value,
        role: P.q('#eRole', box).value, bio: P.q('#eBio', box).value
      }).then(function(){ P.toast('Saved'); location.reload(); })
        .catch(function(e){
          P.toast(e && e.message ? e.message : 'That could not be saved');
          var b = P.q('[data-save]', box); if(b){ b.disabled = false; b.textContent = 'Save'; }
        });
    };
  };

  /* Settings */
  var prefs = C.prefs();
  var settings = P.q('[data-m-settings]');
  settings.innerHTML =
    '<div class="m-set"><div class="m-set-copy"><strong>Text size</strong>' +
      '<p>Makes posts bigger without moving the buttons. Set it once and every screen remembers.</p></div>' +
      '<div class="m-sizer" role="group" aria-label="Text size">' +
        ['sm','md','lg'].map(function(k){
          return '<button type="button" data-size="' + k + '" aria-pressed="' + (prefs.textsize === k) + '">A</button>';
        }).join('') + '</div></div>' +
    '<div class="m-set"><div class="m-set-copy"><strong>Where you read</strong>' +
      '<p>The feed shows the whole country unless you narrow it. This is only the state it opens on, and you can change it on any screen.</p></div>' +
      '<select class="filter-select" data-home-state style="min-width:220px"><option value="">All of India</option>' +
        C.states().map(function(s){ return '<option value="' + P.escape(s) + '"' + (s === prefs.state ? ' selected' : '') + '>' + P.escape(s) + '</option>'; }).join('') +
      '</select></div>' +
    '<div class="m-set"><div class="m-set-copy"><strong>Quiet mentions</strong>' +
      '<p>Turn this on and the count on the Mentions tab disappears. The mentions still arrive, you just decide when to look.</p></div>' +
      '<button class="m-switch" type="button" data-quiet aria-pressed="' + (prefs.quiet ? 'true' : 'false') + '">' +
      '<span class="skip">Quiet mentions</span></button></div>';

  P.qa('[data-size]', settings).forEach(function(b){
    b.onclick = function(){
      var p = C.prefs(); p.textsize = b.dataset.size; C.prefs(p); C.applyTextSize();
      P.qa('[data-size]', settings).forEach(function(x){ x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      P.toast('Text size saved');
    };
  });
  P.q('[data-home-state]', settings).onchange = function(){
    var p = C.prefs(); p.state = this.value; C.prefs(p);
    P.toast(this.value ? 'Opens on ' + this.value : 'Opens on all of India');
  };
  P.q('[data-quiet]', settings).onclick = function(){
    var p = C.prefs(); p.quiet = !p.quiet; C.prefs(p);
    this.setAttribute('aria-pressed', p.quiet ? 'true' : 'false');
    P.toast(p.quiet ? 'Mentions are quiet' : 'Mention counts are back');
  };

  P.q('[data-m-houserules]').innerHTML = HOUSE_RULES.map(function(r){
    return '<div class="m-rule"><div><strong>' + r[0] + '</strong><p>' + r[1] + '</p></div></div>';
  }).join('');

  var yours = P.q('[data-m-yourposts]');
  loading(yours, 'Loading your posts');
  watch(C.watchFeed({authorId: me.memberId}, function(posts){
    yours.innerHTML =
      '<div class="m-head" style="border-top:1px solid var(--line)"><h2 class="m-sub">What you have written</h2>' +
      '<p>' + (posts.length ? 'Newest first. You can delete any of these, and only you can.'
                            : 'Nothing yet, and there is no pressure to change that. Reading is a full membership.') + '</p></div>' +
      posts.map(function(p){ return postHtml(p); }).join('');
  }, function(err){ failed(yours, err); }));

  var card = P.q('[data-m-panel-card]');
  if(card){
    card.innerHTML =
      '<div class="m-panel-head"><h2>Your Patron Card</h2></div>' +
      '<div class="m-panel-body"><p>The card is what lets you in here. It renews once a year and it carries your member number.</p></div>' +
      '<div class="m-panel-list"><a href="member.html"><span><strong>Open your card</strong><small>' +
        P.escape(me.memberId) + '</small></span></a>' +
      '<a href="lost-card.html"><span><strong>Lost your card?</strong><small>Replace it here</small></span></a></div>';
  }

  if(location.hash === '#rules'){
    setTimeout(function(){
      var el = P.q('[data-m-houserules]');
      if(el) el.scrollIntoView({behavior:'smooth', block:'start'});
    }, 120);
  }
}

})();
