/* ==========================================================================
   PFA Members - "The Circle"
   --------------------------------------------------------------------------
   The data layer. Everything here talks to Firebase and nothing is invented:
   if Firestore is empty, the screens say so rather than showing a rehearsal.

   Identity comes from the same place as everywhere else on this site. The
   member signs in with their member number, /api/member/auth/start emails a
   six digit code, /api/member/auth/verify returns a Firebase custom token,
   and the browser trades it for a session. That token is minted with
   uid = PFA-MBR-XXXXXXXX and role = member, which is exactly what
   firestore.rules already expects, so a member's own id needs no lookup and
   cannot be faked.

   Storage is text only. No photo, no audio, no video, 401 characters a post.
   Nothing in this file touches a file.

   Exposed as window.PFA.circle.
   ========================================================================== */

(function(){
'use strict';

var P = window.PFA;
if(!P) return;

var C = P.circle = {};

C.LIMIT = 401;    /* the house constraint. Also enforced in firestore.rules. */
C.MAX_TAGS = 3;   /* a post may include three people, not summon a crowd */
C.PAGE = 40;      /* posts fetched per screen */

var PREFS_KEY = 'pfa_circle_prefs';
var LAST_SEEN_KEY = 'pfa_circle_seen';

var db = null, auth = null, ready = null;
var me = null;          /* { memberId, name, handle, state, city, role, bio } */
var circlesCache = null;

/* --------------------------------------------------------------------------
   1. Firebase
   -------------------------------------------------------------------------- */

var SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';

function loadScript(src){
  return new Promise(function(resolve, reject){
    var s = document.createElement('script');
    s.src = src; s.async = false;
    s.onload = resolve;
    s.onerror = function(){ reject(new Error('Could not load ' + src)); };
    document.head.appendChild(s);
  });
}

/* Loaded on demand so the public pages never pay for the SDK. */
C.boot = function(){
  if(ready) return ready;
  ready = (function(){
    if(!window.PFA_FIREBASE_PROJECT_ID || String(window.PFA_FIREBASE_PROJECT_ID).indexOf('REPLACE') === 0){
      return Promise.reject(new Error('NO_CONFIG'));
    }
    var chain = (window.firebase && window.firebase.firestore)
      ? Promise.resolve()
      : loadScript(SDK + 'firebase-app-compat.js')
          .then(function(){ return loadScript(SDK + 'firebase-auth-compat.js'); })
          .then(function(){ return loadScript(SDK + 'firebase-firestore-compat.js'); });

    return chain.then(function(){
      if(!window.firebase.apps.length){
        window.firebase.initializeApp({
          apiKey: window.PFA_FIREBASE_API_KEY,
          authDomain: window.PFA_FIREBASE_AUTH_DOMAIN,
          projectId: window.PFA_FIREBASE_PROJECT_ID,
          appId: window.PFA_FIREBASE_APP_ID
        });
      }
      auth = window.firebase.auth();
      db = window.firebase.firestore();
      return auth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL).catch(function(){});
    }).then(function(){
      return new Promise(function(resolve){
        var stop = auth.onAuthStateChanged(function(user){ stop(); resolve(user || null); });
      });
    }).then(function(user){
      if(!user) return null;
      return readStanding().then(function(){ return loadProfile(user.uid); });
    });
  })();
  return ready;
};

/* --------------------------------------------------------------------------
   2b. Standing
   Three states, and the middle one is the whole reason this exists. A Patron
   whose card lapsed on Tuesday has not stopped caring about animals on
   Wednesday, so for thirty days they keep reading. They just cannot write.

   The date comes out of the token claim rather than a Firestore read, which
   means it is the same number firestore.rules is comparing against. If the
   two ever disagreed the rules would win and the screens would be lying, so
   they are made to read from one source.
   -------------------------------------------------------------------------- */

var GRACE_MS = 30 * 24 * 60 * 60 * 1000;
var validUntil = 0;   /* ms, or 0 for a membership with no end date */

function readStanding(){
  if(!auth || !auth.currentUser) { validUntil = 0; return Promise.resolve(); }
  return auth.currentUser.getIdTokenResult().then(function(res){
    var raw = res && res.claims ? res.claims.validUntil : 0;
    validUntil = Number(raw) || 0;
  }).catch(function(){ validUntil = 0; });
}

C.standing = function(){
  if(!validUntil) return {state: 'active', daysLeft: 0, until: null};
  var now = Date.now();
  if(now < validUntil) return {state: 'active', daysLeft: 0, until: new Date(validUntil)};
  if(now < validUntil + GRACE_MS){
    return {
      state: 'grace',
      daysLeft: Math.ceil((validUntil + GRACE_MS - now) / 86400000),
      until: new Date(validUntil)
    };
  }
  return {state: 'ended', daysLeft: 0, until: new Date(validUntil)};
};

/* The single question every write path asks before it does anything. */
C.canWrite = function(){ return C.standing().state === 'active'; };

C.db = function(){ return db; };
C.auth = function(){ return auth; };
C.me = function(){ return me; };
C.signedIn = function(){ return !!(auth && auth.currentUser); };

function stamp(){ return window.firebase.firestore.FieldValue.serverTimestamp(); }
function arrayAdd(v){ return window.firebase.firestore.FieldValue.arrayUnion(v); }
function arrayDrop(v){ return window.firebase.firestore.FieldValue.arrayRemove(v); }
function bump(n){ return window.firebase.firestore.FieldValue.increment(n); }

/* --------------------------------------------------------------------------
   2. Sign in
   -------------------------------------------------------------------------- */

C.normaliseId = function(value){
  var v = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if(v.indexOf('PFAMBR') === 0) v = v.slice(6);
  return v ? 'PFA-MBR-' + v : '';
};

C.isMemberId = function(value){ return /^PFA-MBR-[A-Z0-9]{6,12}$/.test(String(value || '')); };

function postJson(url, payload){
  return fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload)
  }).then(function(r){
    return r.json().catch(function(){ return {}; }).then(function(body){
      if(!r.ok){
        /* Carry the server's own code and payload onto the error. Without
           this every failure arrives as an anonymous string and the caller
           cannot tell "wrong code" from "your membership ended", which are
           two very different things to say to somebody. */
        var error = new Error((body && body.message) || 'That could not be processed.');
        error.code = (body && body.code) || 'ERROR';
        error.status = r.status;
        if(body && body.validUntil) error.validUntil = body.validUntil;
        if(body && body.standing) error.standing = body.standing;
        throw error;
      }
      return body;
    });
  });
}

C.requestCode = function(memberId){
  return postJson('/api/member/auth/start', {memberId: memberId});
};

C.submitCode = function(memberId, code){
  return postJson('/api/member/auth/verify', {memberId: memberId, code: code})
    .then(function(body){
      if(!body.token) throw new Error('That code is not right.');
      return auth.signInWithCustomToken(body.token).then(function(){
        return loadProfile(body.memberId, body.name);
      });
    });
};

C.signOut = function(){
  me = null;
  return auth ? auth.signOut() : Promise.resolve();
};

/* --------------------------------------------------------------------------
   3. Profile
   A member record exists before The Circle does, so the profile here holds
   only what this area needs: the name shown on posts, a handle, a state so
   the feed can be filtered, and an optional note.
   -------------------------------------------------------------------------- */

function loadProfile(memberId, fallbackName){
  return db.collection('circleProfiles').doc(memberId).get().then(function(snap){
    var d = snap.exists ? snap.data() : {};
    me = {
      memberId: memberId,
      name: d.name || fallbackName || '',
      handle: d.handle || '',
      state: d.state || '',
      city: d.city || '',
      role: d.role || '',
      bio: d.bio || '',
      complete: !!(snap.exists && d.name && d.state)
    };
    return me;
  }).catch(function(){
    me = {memberId: memberId, name: fallbackName || '', handle: '', state: '',
          city: '', role: '', bio: '', complete: false};
    return me;
  });
}

C.reloadProfile = function(){
  if(!auth || !auth.currentUser) return Promise.resolve(null);
  return loadProfile(auth.currentUser.uid, me && me.name);
};

C.saveProfile = function(fields){
  if(!C.canWrite()) return Promise.reject(new Error('MEMBERSHIP_LAPSED'));

  /* The same rules every other form uses: no digits in a name or a town,
     Title Case on both, a lowercase handle. A bad entry is refused here with
     the same wording the field would have shown. */
  var R = window.PFA_RULES;
  if (R) {
    var checks = [['name', fields.name, true], ['handle', fields.handle, false], ['state', fields.state, true],
                  ['city', fields.city, false], ['role', fields.role, false], ['bio', fields.bio, false]];
    for (var i = 0; i < checks.length; i++) {
      var msg = R.checkField(checks[i][0], checks[i][1], {required: checks[i][2],
        emptyMessage: checks[i][0] === 'name' ? 'Enter your name.' : 'Choose a state.'});
      if (msg) return Promise.reject(new Error(msg));
    }
  }
  var norm = function(key, value, max){ return (R ? R.normaliseField(key, value) : String(value || '').trim()).slice(0, max); };
  var uid = auth.currentUser.uid;
  var doc = {
    name:   norm('name', fields.name, 60),
    handle: String(fields.handle || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20),
    state:  norm('state', fields.state, 60),
    city:   norm('city', fields.city, 60),
    role:   norm('role', fields.role, 60),
    bio:    norm('bio', fields.bio, 240),
    updatedAt: stamp()
  };
  return db.collection('circleProfiles').doc(uid).set(doc, {merge: true})
    .then(function(){ return loadProfile(uid, doc.name); });
};

/* Handles are cosmetic, so a clash adds digits from the member number rather
   than refusing the name outright. */
C.suggestHandle = function(name, memberId){
  var base = String(name || 'member').toLowerCase().replace(/[^a-z]/g, '').slice(0, 12) || 'member';
  var tail = String(memberId || '').replace(/\D/g, '').slice(-3);
  return db.collection('circleProfiles').where('handle', '==', base).limit(1).get()
    .then(function(s){ return s.empty ? base : base + tail; })
    .catch(function(){ return base + tail; });
};

/* --------------------------------------------------------------------------
   4. States
   Taken from the unit list the rest of the site already runs on, so the
   filter can never drift from where PFA actually is.
   -------------------------------------------------------------------------- */

C.states = function(){
  var units = (window.PFA_DATA && window.PFA_DATA.units) || [];
  var seen = {};
  units.forEach(function(u){ if(u && u.s) seen[u.s] = true; });
  return Object.keys(seen).sort();
};

/* --------------------------------------------------------------------------
   5. Circles
   Structural, not user content. Created once in Firestore by an administrator
   (tools/seed-circles.js) and read here.
   -------------------------------------------------------------------------- */

C.loadCircles = function(force){
  if(circlesCache && !force) return Promise.resolve(circlesCache);
  return db.collection('circles').orderBy('name').get().then(function(snap){
    circlesCache = snap.docs.map(function(d){
      var v = d.data() || {};
      return {id: d.id, name: v.name || d.id, kind: v.kind || 'Topic', blurb: v.blurb || ''};
    });
    return circlesCache;
  });
};

C.circleById = function(id){
  var found = null;
  (circlesCache || []).forEach(function(c){ if(c.id === id) found = c; });
  return found;
};

C.joined = function(){
  if(!auth.currentUser) return Promise.resolve([]);
  return db.collection('circleProfiles').doc(auth.currentUser.uid)
    .collection('joined').get()
    .then(function(snap){ return snap.docs.map(function(d){ return d.id; }); })
    .catch(function(){ return []; });
};

C.toggleJoin = function(circleId, isJoined){
  if(!C.canWrite()) return Promise.reject(new Error('MEMBERSHIP_LAPSED'));

  var ref = db.collection('circleProfiles').doc(auth.currentUser.uid)
    .collection('joined').doc(circleId);
  return isJoined ? ref.delete().then(function(){ return false; })
                  : ref.set({at: stamp()}).then(function(){ return true; });
};

/* --------------------------------------------------------------------------
   6. Posts
   The feed is national by default. A member may narrow it to one state, but
   nobody is walled into their own.
   -------------------------------------------------------------------------- */

C.feedQuery = function(opts){
  opts = opts || {};
  var q = db.collection('circlePosts');
  if(opts.state)    q = q.where('state', '==', opts.state);
  if(opts.circleId) q = q.where('circleId', '==', opts.circleId);
  if(opts.authorId) q = q.where('authorId', '==', opts.authorId);
  return q.orderBy('createdAt', 'desc').limit(opts.limit || C.PAGE);
};

/* Live, because a feed that needs refreshing is a feed people stop reading. */
C.watchFeed = function(opts, onPosts, onError){
  return C.feedQuery(opts).onSnapshot(function(snap){
    onPosts(snap.docs.map(readPost));
  }, onError);
};

function readPost(doc){
  var d = doc.data() || {};
  return {
    id: doc.id,
    authorId: d.authorId || '',
    authorName: d.authorName || '',
    authorHandle: d.authorHandle || '',
    kind: d.kind || 'note',
    circleId: d.circleId || '',
    state: d.state || '',
    text: d.text || '',
    tags: d.tags || [],
    place: d.place || '',
    closed: d.closed === true,
    replyCount: d.replyCount || 0,
    helpful: d.helpful || [],
    same: d.same || [],
    joining: d.joining || [],
    at: (d.createdAt && d.createdAt.toMillis) ? d.createdAt.toMillis() : Date.now()
  };
}
C.readPost = readPost;

C.write = function(fields){
  if(!C.canWrite()) return Promise.reject(new Error('MEMBERSHIP_LAPSED'));

  if(!me || !me.complete) return Promise.reject(new Error('Set up your Circle profile first.'));
  var text = String(fields.text || '').slice(0, C.LIMIT).trim();
  if(!text) return Promise.reject(new Error('There is nothing to post.'));

  return db.collection('circlePosts').add({
    authorId: me.memberId,
    authorName: me.name,
    authorHandle: me.handle,
    state: me.state || '',
    kind: fields.kind || 'note',
    circleId: fields.circleId || '',
    text: text,
    tags: (fields.tags || []).slice(0, C.MAX_TAGS),
    place: String(fields.place || '').slice(0, 80),
    closed: false,
    replyCount: 0,
    helpful: [], same: [], joining: [],
    createdAt: stamp()
  });
};

/* A member may remove their own post and nothing else. The check below is a
   courtesy so the button never appears where it would fail. The rule that
   actually enforces it is in firestore.rules, where it cannot be bypassed. */
C.canDelete = function(item){
  return !!(me && item && item.authorId === me.memberId);
};

C.deletePost = function(postId){
  /* Deliberately not gated on canWrite. Taking back something you wrote is a
     privacy right, not participation, and a lapsed member who could not
     delete would have their words stranded permanently once the grace window
     shuts. firestore.rules agrees: ownsDoc() checks canRead, not canWrite. */

  return db.collection('circlePosts').doc(postId).delete();
};

C.deleteReply = function(postId, replyId){
  /* Deliberately not gated on canWrite. Taking back something you wrote is a
     privacy right, not participation, and a lapsed member who could not
     delete would have their words stranded permanently once the grace window
     shuts. firestore.rules agrees: ownsDoc() checks canRead, not canWrite. */

  var post = db.collection('circlePosts').doc(postId);
  return post.collection('replies').doc(replyId).delete().then(function(){
    return post.update({replyCount: bump(-1)}).catch(function(){});
  });
};

C.close = function(postId, closed){
  if(!C.canWrite()) return Promise.reject(new Error('MEMBERSHIP_LAPSED'));

  return db.collection('circlePosts').doc(postId).update({closed: !closed});
};

/* --------------------------------------------------------------------------
   7. Replies
   -------------------------------------------------------------------------- */

C.watchPost = function(postId, onPost, onError){
  return db.collection('circlePosts').doc(postId).onSnapshot(function(doc){
    onPost(doc.exists ? readPost(doc) : null);
  }, onError);
};

C.watchReplies = function(postId, onReplies, onError){
  return db.collection('circlePosts').doc(postId).collection('replies')
    .orderBy('createdAt', 'asc').limit(200)
    .onSnapshot(function(snap){
      onReplies(snap.docs.map(function(doc){
        var d = doc.data() || {};
        return {
          id: doc.id,
          authorId: d.authorId || '',
          authorName: d.authorName || '',
          authorHandle: d.authorHandle || '',
          text: d.text || '',
          helpful: d.helpful || [],
          at: (d.createdAt && d.createdAt.toMillis) ? d.createdAt.toMillis() : Date.now()
        };
      }));
    }, onError);
};

C.reply = function(postId, text){
  if(!C.canWrite()) return Promise.reject(new Error('MEMBERSHIP_LAPSED'));

  if(!me || !me.complete) return Promise.reject(new Error('Set up your Circle profile first.'));
  var clean = String(text || '').slice(0, C.LIMIT).trim();
  if(!clean) return Promise.reject(new Error('There is nothing to post.'));
  var post = db.collection('circlePosts').doc(postId);
  return post.collection('replies').add({
    authorId: me.memberId,
    authorName: me.name,
    authorHandle: me.handle,
    text: clean,
    helpful: [],
    createdAt: stamp()
  }).then(function(ref){
    return post.update({replyCount: bump(1)}).catch(function(){}).then(function(){ return ref; });
  });
};

/* --------------------------------------------------------------------------
   8. Reactions
   Commitments, not applause. Every one is positive: there is no way to react
   against a person, which is why disagreement here takes words. A member may
   only ever add or remove their own id, and the rules hold them to it.
   -------------------------------------------------------------------------- */

C.react = function(postId, replyId, key, on){
  if(!C.canWrite()) return Promise.reject(new Error('MEMBERSHIP_LAPSED'));

  var ref = replyId
    ? db.collection('circlePosts').doc(postId).collection('replies').doc(replyId)
    : db.collection('circlePosts').doc(postId);
  var patch = {};
  patch[key] = on ? arrayDrop(me.memberId) : arrayAdd(me.memberId);
  return ref.update(patch);
};

/* --------------------------------------------------------------------------
   9. Events
   -------------------------------------------------------------------------- */

C.watchEvents = function(opts, onEvents, onError){
  var q = db.collection('circleEvents');
  if(opts && opts.state) q = q.where('state', '==', opts.state);
  return q.orderBy('startsAt', 'asc').limit(60).onSnapshot(function(snap){
    onEvents(snap.docs.map(function(doc){
      var d = doc.data() || {};
      return {
        id: doc.id,
        title: d.title || '',
        circleId: d.circleId || '',
        hostId: d.hostId || '',
        hostName: d.hostName || '',
        state: d.state || '',
        where: d.where || '',
        note: d.note || '',
        need: d.need || 0,
        going: d.going || [],
        at: (d.startsAt && d.startsAt.toMillis) ? d.startsAt.toMillis() : 0
      };
    }));
  }, onError);
};

C.rsvp = function(eventId, going){
  if(!C.canWrite()) return Promise.reject(new Error('MEMBERSHIP_LAPSED'));

  return db.collection('circleEvents').doc(eventId)
    .update({going: going ? arrayDrop(me.memberId) : arrayAdd(me.memberId)});
};

/* --------------------------------------------------------------------------
   10. Mentions
   -------------------------------------------------------------------------- */

C.loadMentions = function(){
  if(!me) return Promise.resolve([]);
  return db.collection('circlePosts')
    .where('tags', 'array-contains', me.memberId)
    .orderBy('createdAt', 'desc').limit(40).get()
    .then(function(snap){ return snap.docs.map(readPost); });
};

C.lastSeen = function(next){
  if(next != null){ P.store(LAST_SEEN_KEY, next); return next; }
  return P.store(LAST_SEEN_KEY) || 0;
};

/* --------------------------------------------------------------------------
   11. People
   -------------------------------------------------------------------------- */

C.loadPeople = function(state){
  var q = db.collection('circleProfiles');
  if(state) q = q.where('state', '==', state);
  return q.limit(200).get().then(function(snap){
    return snap.docs.map(function(d){
      var v = d.data() || {};
      return {
        memberId: d.id, name: v.name || d.id, handle: v.handle || '',
        state: v.state || '', city: v.city || '', role: v.role || '', bio: v.bio || ''
      };
    }).sort(function(a, b){ return String(a.name).localeCompare(String(b.name)); });
  });
};

C.person = function(memberId){
  return db.collection('circleProfiles').doc(memberId).get().then(function(d){
    if(!d.exists) return null;
    var v = d.data() || {};
    return {
      memberId: d.id, name: v.name || d.id, handle: v.handle || '',
      state: v.state || '', city: v.city || '', role: v.role || '', bio: v.bio || ''
    };
  });
};

/* --------------------------------------------------------------------------
   12. The pause
   Not a filter and not a block. If a reply reads as heated, it is shown back
   to the writer once before it goes anywhere. Most people edit. That single
   extra screen is the difference between this and a comment section.
   -------------------------------------------------------------------------- */

var HEAT = /\b(idiot|idiots|stupid|shut up|nonsense|useless|disgusting|shameful|pathetic|liar|lying|fool|fools|garbage|rubbish|hate|worst|clueless|good for nothing)\b/i;

C.readsHot = function(text){
  var t = String(text || '');
  if(HEAT.test(t)) return true;
  var letters = t.replace(/[^A-Za-z]/g, '');
  if(letters.length > 24 && letters === letters.toUpperCase()) return true;
  if((t.match(/[!?]/g) || []).length >= 4) return true;
  return false;
};

/* --------------------------------------------------------------------------
   13. Presentation helpers
   -------------------------------------------------------------------------- */

var FACES = ['#0653EE','#0D8F5C','#A66A00','#B42318','#5B3FB5','#0E7490','#B4531A','#1F7A52','#0A4FA8','#7A3E9D'];

C.face = function(key){
  var sum = 0;
  String(key || '?').split('').forEach(function(ch){ sum += ch.charCodeAt(0); });
  return FACES[sum % FACES.length];
};

C.initials = function(name){
  var parts = String(name || '?').trim().split(/\s+/);
  var a = (parts[0] || '?')[0] || '?';
  var b = parts.length > 1 ? (parts[parts.length - 1][0] || '') : '';
  return (a + b).toUpperCase();
};

C.faceHtml = function(id, name, size){
  return '<span class="m-face' + (size ? ' ' + size : '') + '" style="--face:' + C.face(id) +
         '" aria-hidden="true">' + P.escape(C.initials(name)) + '</span>';
};

C.when = function(ts){
  var diff = Date.now() - ts;
  if(diff < 60000) return 'just now';
  if(diff < 3600000) return Math.round(diff / 60000) + ' min ago';
  if(diff < 86400000){
    var hrs = Math.round(diff / 3600000);
    return hrs + (hrs === 1 ? ' hour ago' : ' hours ago');
  }
  var days = Math.round(diff / 86400000);
  if(days === 1) return 'yesterday';
  if(days < 7) return days + ' days ago';
  return new Date(ts).toLocaleDateString('en-IN', {day: 'numeric', month: 'short'});
};

C.dateParts = function(ts){
  var d = new Date(ts);
  return {
    month: d.toLocaleDateString('en-IN', {month: 'short'}).toUpperCase(),
    day: d.getDate(),
    weekday: d.toLocaleDateString('en-IN', {weekday: 'short'})
  };
};

/* Escape first, then turn handles into links. Never the other way round. */
C.body = function(text){
  return P.escape(text).replace(/@([a-z0-9_]+)/gi, function(whole, handle){
    return '<a class="m-mention" href="people.html?q=' + encodeURIComponent(handle) + '">@' +
           P.escape(handle) + '</a>';
  });
};

C.KINDS = {
  note:     {label: 'Something to share',   icon: '\u270E', hint: 'Anything worth passing on. Keep it to what you actually saw or did.'},
  ask:      {label: 'A question',           icon: '?',      hint: 'Ask plainly. Someone in the country has almost certainly handled it before.'},
  sighting: {label: 'An animal in trouble', icon: '!',      hint: 'Where, what condition, and whether someone can stay there. Then call your unit: this is a record, not a rescue line.'},
  plan:     {label: 'Organising something', icon: '\u25C7', hint: 'What, when, where, and how many hands you need. People reply by saying they are in.'}
};

C.actionsFor = function(kind){
  if(kind === 'plan')     return [{key:'joining', icon:'\u2713', label:"I'm in",      cls:'help'}, {key:'helpful', icon:'\u2605', label:'Helpful'}];
  if(kind === 'ask')      return [{key:'joining', icon:'\u2713', label:'I can help',  cls:'help'}, {key:'helpful', icon:'\u2605', label:'Helpful'}];
  if(kind === 'sighting') return [{key:'joining', icon:'\u2713', label:'I am nearby', cls:'help'}, {key:'helpful', icon:'\u2605', label:'Helpful'}];
  return [{key:'helpful', icon:'\u2605', label:'Helpful'}, {key:'same', icon:'\u25CE', label:'Same here'}];
};

C.prefs = function(next){
  if(next){ P.store(PREFS_KEY, next); return next; }
  return P.store(PREFS_KEY) || {textsize: 'md', state: '', quiet: false};
};

C.applyTextSize = function(){
  var scale = {sm: 0.92, md: 1, lg: 1.16}[C.prefs().textsize] || 1;
  document.documentElement.style.setProperty('--tsize', scale);
};

})();
