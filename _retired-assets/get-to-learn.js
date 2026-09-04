/* Get to Learn: the training application.

   It used to be five boxes in a modal. The problem with that is not that it
   looked plain, it is that it asked nothing worth answering, so PFA learned
   nothing about the person and the person learned nothing about PFA.

   This version is a briefing that happens to collect an application. It moves
   one question at a time, each screen tells you something true about the work
   before it asks anything, and the answers assemble into a posting summary the
   person can read back before they send it.

   It also reads the Wildlife Gauntlet result. The Gauntlet was sitting on the
   site unconnected to anything; now it is the entrance trial. Clearing it is
   not required to apply, because a willing pair of hands on a Sunday morning
   matters more than a quiz score, but it is carried on the application and it
   is shown as standing. */

(function () {
  'use strict';
  var P = window.PFA;
  if (!P) return;
  var root = P.q('#gtl');
  if (!root) return;

  var GAUNTLET_KEY = 'pfa_champion';

  /* The four routes are the work PFA actually has to give. Each one names what
     a first month really looks like, because "content and events" means
     nothing to someone deciding whether to give up their Sundays. */
  var ROUTES = [
    {
      id: 'rescue',
      name: 'Rescue runs',
      line: 'The van, the net, the road.',
      month: 'You ride along on calls for the first month without touching an animal. Watching is the training. By week four you are handling the ones that are calm.',
      needs: ['A phone that stays on', 'Able to be somewhere within the hour', 'Not squeamish about blood'],
      hard: 'Some calls end with an animal that does not make it. That happens on your first month, not your tenth.'
    },
    {
      id: 'hospital',
      name: 'Hospital floor',
      line: 'Kennels, feeds, dressings, records.',
      month: 'Cleaning and feeding first, because that is how you learn to read an animal. Then assisting at dressings and post-operative watches.',
      needs: ['A regular shift you can keep', 'Comfortable around illness', 'Patience with repetition'],
      hard: 'It is unglamorous and physical. The animals that need you most are the least grateful.'
    },
    {
      id: 'legal',
      name: 'Legal and casework',
      line: 'FIRs, ABC complaints, follow-through.',
      month: 'Reading real case files and learning what makes a complaint survive being forwarded. Then drafting under supervision.',
      needs: ['Careful with detail', 'Can write plainly', 'Will chase a thing for months'],
      hard: 'Most of the work is waiting, reminding and filing again. Wins take a year.'
    },
    {
      id: 'field',
      name: 'Field and records',
      line: 'Feeding rounds, ABC follow-up, photographs.',
      month: 'Walking a beat with someone who knows it, learning the animals by sight, and keeping the record that makes ABC follow-up possible.',
      needs: ['Know your own area well', 'Consistent on the same days', 'Will keep notes'],
      hard: 'Nobody sees this work. It is the reason the other three can function.'
    }
  ];

  var SKILLS = [
    'Drive a four wheeler', 'Ride a two wheeler', 'First aid trained',
    'Veterinary background', 'Legal background', 'Photography or video',
    'Social media', 'Fundraising', 'Local language beyond English',
    'Heavy lifting', 'Design or writing', 'Data and spreadsheets'
  ];

  var WHEN = ['Weekday mornings', 'Weekday evenings', 'Weekends', 'Emergency call-outs at any hour'];

  var state = { route: '', skills: [], when: [], step: 0 };
  var champion = null;
  try { champion = P.store(GAUNTLET_KEY); } catch (e) { champion = null; }

  function esc(t) { return P.escape(String(t == null ? '' : t)); }

  /* ---- the standing panel: what the Gauntlet says about you --------------- */

  function standingCard() {
    if (champion && champion.cleared) {
      return '<div class="gtl-standing is-won">' +
        '<div class="gtl-standing-mark">CLEARED</div>' +
        '<div><strong>Champion of the Wild</strong>' +
        '<p>You cleared the Wildlife Gauntlet with ' + esc(champion.correct) + ' of ' + esc(champion.total) +
        ' and ' + esc(champion.lives) + ' ' + (champion.lives === 1 ? 'life' : 'lives') + ' left.' +
        (champion.code ? ' Certificate ' + esc(champion.code) + '.' : '') +
        ' This goes on your application.</p></div></div>';
    }
    if (champion) {
      return '<div class="gtl-standing is-tried">' +
        '<div class="gtl-standing-mark">' + esc(champion.correct) + '/' + esc(champion.total) + '</div>' +
        '<div><strong>You have run the Gauntlet</strong>' +
        '<p>You did not clear it last time. That does not stop you applying, and the attempt is carried on the form. ' +
        '<a href="champion.html">Run it again</a> if you want the certificate on there instead.</p></div></div>';
    }
    return '<div class="gtl-standing">' +
      '<div class="gtl-standing-mark">?</div>' +
      '<div><strong>You have not run the Gauntlet</strong>' +
      '<p>Fifteen questions, three lives, ten seconds each. It is not required to apply, but it is the fastest way to show you already know something. ' +
      '<a href="champion.html">Take the Gauntlet first</a>.</p></div></div>';
  }

  /* ---- steps -------------------------------------------------------------- */

  function stepRoute() {
    return '<div class="gtl-step-head"><span class="gtl-num">01</span><div>' +
      '<h3>Which work?</h3><p>Read what the first month is actually like before you pick. You can change route later; PFA would rather you chose honestly now.</p>' +
      '</div></div>' +
      '<div class="gtl-routes">' + ROUTES.map(function (r) {
        var on = state.route === r.id;
        return '<button class="gtl-route' + (on ? ' is-on' : '') + '" type="button" data-route="' + r.id + '" aria-pressed="' + on + '">' +
          '<span class="gtl-route-name">' + esc(r.name) + '</span>' +
          '<span class="gtl-route-line">' + esc(r.line) + '</span>' +
          '<span class="gtl-route-month">' + esc(r.month) + '</span>' +
          '<span class="gtl-route-needs">' + r.needs.map(function (n) { return '<i>' + esc(n) + '</i>'; }).join('') + '</span>' +
          '<span class="gtl-route-hard"><b>The hard part.</b> ' + esc(r.hard) + '</span>' +
          '</button>';
      }).join('') + '</div>';
  }

  function stepWhen() {
    return '<div class="gtl-step-head"><span class="gtl-num">02</span><div>' +
      '<h3>When can you actually turn up?</h3><p>This is the question that decides whether a volunteer lasts. Pick only what you could still do in three months on a bad week.</p>' +
      '</div></div>' +
      '<div class="gtl-chips">' + WHEN.map(function (w) {
        var on = state.when.indexOf(w) > -1;
        return '<button class="gtl-chip' + (on ? ' is-on' : '') + '" type="button" data-when="' + esc(w) + '" aria-pressed="' + on + '">' + esc(w) + '</button>';
      }).join('') + '</div>' +
      '<p class="gtl-hint">Choosing nothing is an answer too. Say so and PFA will find you something that fits an unpredictable week.</p>';
  }

  function stepSkills() {
    return '<div class="gtl-step-head"><span class="gtl-num">03</span><div>' +
      '<h3>What can you already do?</h3><p>Not qualifications. Things you could be asked to do this Sunday. A person who can drive is worth three who cannot when a call comes in at night.</p>' +
      '</div></div>' +
      '<div class="gtl-chips">' + SKILLS.map(function (s) {
        var on = state.skills.indexOf(s) > -1;
        return '<button class="gtl-chip' + (on ? ' is-on' : '') + '" type="button" data-skill="' + esc(s) + '" aria-pressed="' + on + '">' + esc(s) + '</button>';
      }).join('') + '</div>';
  }

  function stepDetails() {
    return '<div class="gtl-step-head"><span class="gtl-num">04</span><div>' +
      '<h3>Where to find you</h3><p>PFA routes you to the nearest unit, so the city matters as much as the phone number.</p>' +
      '</div></div>' +
      '<div class="form-grid">' +
      '<div class="field"><label for="gtlName">Your name</label><input id="gtlName" name="name" required maxlength="80" autocomplete="name"><span class="error">Enter your name.</span></div>' +
      '<div class="field"><label for="gtlMobile">Mobile</label><input id="gtlMobile" name="mobile" required inputmode="numeric" maxlength="10" pattern="[6-9][0-9]{9}" autocomplete="tel"><span class="error">Enter your mobile number.</span></div>' +
      '<div class="field"><label for="gtlCity">City or town</label><input id="gtlCity" name="city" required autocomplete="address-level2"><span class="error">Enter your city.</span></div>' +
      '<div class="field"><label for="gtlEmail">Email, optional</label><input id="gtlEmail" name="email" type="email" maxlength="254" autocomplete="email"><span class="error">Check this email address.</span></div>' +
      '<div class="field full"><label for="gtlWhy">Why this, and what have you done before?</label><textarea id="gtlWhy" name="details" required rows="4" maxlength="2000" placeholder="Anything true. Fed the dogs on your street for six years. Once carried a hit dog to a clinic and did not know what to do. No experience at all."></textarea><span class="error">Tell us a little, in your own words.</span></div>' +
      '</div>';
  }

  var STEPS = [
    { key: 'route', render: stepRoute, guard: function () { return state.route ? null : 'Pick a route to continue.'; } },
    { key: 'when', render: stepWhen, guard: function () { return null; } },
    { key: 'skills', render: stepSkills, guard: function () { return null; } },
    { key: 'details', render: stepDetails, guard: function () { return null; } }
  ];

  /* ---- the running summary ------------------------------------------------ */

  function summary() {
    var r = ROUTES.filter(function (x) { return x.id === state.route; })[0];
    var rows = [];
    rows.push(['Route', r ? r.name : 'Not chosen yet']);
    rows.push(['Available', state.when.length ? state.when.join(', ') : 'Flexible, unpredictable']);
    rows.push(['Brings', state.skills.length ? state.skills.join(', ') : 'Willingness']);
    rows.push(['Gauntlet', champion ? (champion.cleared ? 'Cleared, ' + champion.correct + '/' + champion.total : 'Attempted, ' + champion.correct + '/' + champion.total) : 'Not attempted']);
    return '<div class="gtl-summary-head">Your posting so far</div>' +
      rows.map(function (row) {
        return '<div class="gtl-summary-row"><span>' + esc(row[0]) + '</span><strong>' + esc(row[1]) + '</strong></div>';
      }).join('');
  }

  /* ---- render ------------------------------------------------------------- */

  function render() {
    var step = STEPS[state.step];
    root.innerHTML =
      '<div class="gtl-rail">' +
        '<div class="gtl-progress" role="list">' +
          STEPS.map(function (s, i) {
            return '<span role="listitem" class="gtl-pip' + (i === state.step ? ' is-now' : (i < state.step ? ' is-done' : '')) + '"></span>';
          }).join('') +
        '</div>' +
        standingCard() +
        '<div class="gtl-summary">' + summary() + '</div>' +
      '</div>' +
      '<form class="gtl-panel" id="gtlForm" novalidate>' +
        '<div class="gtl-step">' + step.render() + '</div>' +
        '<p class="gtl-error" role="alert"></p>' +
        '<div class="gtl-nav">' +
          (state.step > 0 ? '<button class="btn light" type="button" data-back>Back</button>' : '<span></span>') +
          (state.step < STEPS.length - 1
            ? '<button class="btn dark" type="button" data-next>Continue</button>'
            : '<button class="btn dark" type="submit">Send application</button>') +
        '</div>' +
      '</form>';
    var first = P.q('.gtl-step h3', root);
    if (first && state.step > 0) first.setAttribute('tabindex', '-1'), first.focus();
  }

  /* The number comes from PFA's server, so the page waits for it; if the
     send fails the application is still in hand and can be sent again. */
  function done(pending) {
    var r = ROUTES.filter(function (x) { return x.id === state.route; })[0];
    root.innerHTML = '<div class="gtl-done">' +
      '<p class="kicker">Sending your application</p>' +
      '<h3>One moment\u2026</h3>' +
      '<p>PFA is issuing your reference number.</p></div>';
    pending.then(function (ref) {
      root.innerHTML = '<div class="gtl-done">' +
        '<p class="kicker">Application received</p>' +
        '<h3>' + esc(ref) + '</h3>' +
        '<p>You applied for <strong>' + esc(r ? r.name : 'training') + '</strong>. Someone from the nearest unit calls you; keep this number. ' +
        'You can follow it any time from Help \u2192 Follow one you raised, with the email or mobile you gave.</p>' +
        '<div class="gtl-done-acts">' +
          '<button class="btn light" type="button" data-copy>Copy reference</button>' +
          '<a class="btn light" href="' + P.followUrl(ref) + '">Follow it</a>' +
          (champion && champion.cleared ? '' : '<a class="btn light" href="champion.html">Run the Gauntlet</a>') +
          '<a class="btn light" href="network.html">Find your unit</a>' +
        '</div></div>';
      var c = P.q('[data-copy]', root);
      if (c) c.onclick = function () { P.copy(ref); };
    }, function (err) {
      root.innerHTML = '<div class="gtl-done">' +
        '<p class="kicker">Not sent</p>' +
        '<h3>PFA did not get it.</h3>' +
        '<p>' + esc(err && err.message || 'Could not reach PFA.') + ' Your answers are still here.</p>' +
        '<div class="gtl-done-acts"><button class="btn dark" type="button" data-retry>Try again</button></div></div>';
      var t = P.q('[data-retry]', root);
      if (t) t.onclick = function () { done(pending.retry ? pending.retry() : pending); };
    });
  }

  root.addEventListener('click', function (e) {
    var t = e.target.closest('button');
    if (!t) return;

    if (t.dataset.route) { state.route = t.dataset.route; render(); return; }
    if (t.dataset.when !== undefined && t.hasAttribute('data-when')) {
      var w = t.dataset.when, i = state.when.indexOf(w);
      if (i > -1) state.when.splice(i, 1); else state.when.push(w);
      render(); return;
    }
    if (t.dataset.skill !== undefined && t.hasAttribute('data-skill')) {
      var s = t.dataset.skill, j = state.skills.indexOf(s);
      if (j > -1) state.skills.splice(j, 1); else state.skills.push(s);
      render(); return;
    }
    if (t.hasAttribute('data-back')) { state.step = Math.max(0, state.step - 1); render(); return; }
    if (t.hasAttribute('data-next')) {
      var problem = STEPS[state.step].guard();
      if (problem) { P.q('.gtl-error', root).textContent = problem; return; }
      state.step = Math.min(STEPS.length - 1, state.step + 1);
      render();
    }
  });

  root.addEventListener('submit', function (e) {
    e.preventDefault();
    var form = e.target;
    if (!P.validate(form)) return;
    var data = P.formData(form);
    var r = ROUTES.filter(function (x) { return x.id === state.route; })[0];
    data.route = r ? r.name : '';
    data.availability = state.when.join(', ') || 'Flexible';
    data.skills = state.skills.join(', ') || 'None stated';
    data.gauntlet = champion
      ? (champion.cleared ? 'Cleared ' + champion.correct + '/' + champion.total + (champion.code ? ' (' + champion.code + ')' : '') : 'Attempted ' + champion.correct + '/' + champion.total)
      : 'Not attempted';
    done(P.saveSubmission('PFA-V', data));
  });

  render();
}());
