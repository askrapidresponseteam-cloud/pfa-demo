/* ===========================================================
   EXTRACT - learning-center.html
   learning centre interactions

   1 inline <script> block(s), in document order.
   READ-ONLY REFERENCE COPY. The live code is inside
   learning-center.html in the UI/content zip. Edit it THERE; this file
   is a snapshot for reading and review only.
   =========================================================== */

/* ---- block 1 of 1 ---- */
(function () {
  const sectionToggles = Array.from(document.querySelectorAll('.lc-section-toggle'));
  sectionToggles.forEach(function (section) {
    section.addEventListener('toggle', function () {
      if (!section.open) return;
      sectionToggles.forEach(function (other) {
        if (other !== section) other.open = false;
      });
    });
  });

  function openSectionForHash() {
    if (!window.location.hash) return;
    const target = document.querySelector(window.location.hash);
    if (!target) return;
    const section = target.closest('.lc-section-toggle');
    if (!section) return;
    section.open = true;
    window.requestAnimationFrame(function () { section.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  }
  document.addEventListener('click', function (event) {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    const target = document.querySelector(link.getAttribute('href'));
    if (!target) return;
    const section = target.closest('.lc-section-toggle');
    if (section) section.open = true;
  });
  window.addEventListener('hashchange', openSectionForHash);
  if (window.location.hash) openSectionForHash();

  const states = ['absent', 'moderate', 'obvious'];
  const notes = {
    ears: [
      '<strong>Ears: 0.</strong> Upright and facing forward.',
      '<strong>Ears: 1.</strong> Slightly pulled apart or rotated outward.',
      '<strong>Ears: 2.</strong> Flattened and rotated outward.'
    ],
    eyes: [
      '<strong>Eyes: 0.</strong> Open, with no orbital tightening.',
      '<strong>Eyes: 1.</strong> Partly closed or mildly narrowed.',
      '<strong>Eyes: 2.</strong> Clearly squinting or tightly narrowed.'
    ],
    muzzle: [
      '<strong>Muzzle: 0.</strong> Relaxed and rounded.',
      '<strong>Muzzle: 1.</strong> Mild tension changes its shape.',
      '<strong>Muzzle: 2.</strong> Obvious tension creates a flatter, elongated muzzle.'
    ],
    whiskers: [
      '<strong>Whiskers: 0.</strong> Relaxed and naturally curved.',
      '<strong>Whiskers: 1.</strong> Slightly straighter or shifted from the relaxed position.',
      '<strong>Whiskers: 2.</strong> Straight, rigid and clearly directed forward or away from the face.'
    ],
    head: [
      '<strong>Head: 0.</strong> Held above the shoulder line.',
      '<strong>Head: 1.</strong> Level with the shoulders.',
      '<strong>Head: 2.</strong> Lowered below the shoulder line or tucked toward the chest.'
    ]
  };
  const outputIds = { ears: 'outEars', eyes: 'outEyes', muzzle: 'outMuzzle', whiskers: 'outWhiskers', head: 'outHead' };
  const focusGroups = { ears: ['earLeft', 'earRight'], eyes: ['eyeLeft', 'eyeRight'], muzzle: ['muzzle'], whiskers: ['whiskersLeft', 'whiskersRight'], head: ['catFeatures'] };
  const sliders = Array.from(document.querySelectorAll('[data-pain]'));
  const cat = document.getElementById('catDemo');
  const focus = document.getElementById('featureFocus');
  const score = document.getElementById('painScore');
  const meaning = document.getElementById('painMeaning');

  function updateFace(activeFeature) {
    const values = Object.fromEntries(sliders.map(function (slider) { return [slider.dataset.pain, Number(slider.value)]; }));
    cat.style.setProperty('--ear-l', (-values.ears * 17) + 'deg');
    cat.style.setProperty('--ear-r', (values.ears * 17) + 'deg');
    cat.style.setProperty('--eye-open', String(1 - values.eyes * .3));
    cat.style.setProperty('--muzzle-x', String(1 - values.muzzle * .1));
    cat.style.setProperty('--muzzle-y', String(1 + values.muzzle * .11));
    cat.style.setProperty('--whisker-l', (values.whiskers * 8) + 'deg');
    cat.style.setProperty('--whisker-r', (-values.whiskers * 8) + 'deg');
    cat.style.setProperty('--head-y', (values.head * 15) + 'px');

    sliders.forEach(function (slider) {
      const value = Number(slider.value);
      document.getElementById(outputIds[slider.dataset.pain]).textContent = value + ' · ' + states[value];
    });
    document.querySelectorAll('.lc-cat-visual .is-active').forEach(function (node) { node.classList.remove('is-active'); });
    (focusGroups[activeFeature] || []).forEach(function (id) { document.getElementById(id).classList.add('is-active'); });
    if (activeFeature) focus.innerHTML = notes[activeFeature][values[activeFeature]];

    const total = Object.values(values).reduce(function (sum, value) { return sum + value; }, 0);
    score.textContent = total + ' / 10';
    if (total < 4) meaning.textContent = 'No clear facial pain pattern. If behaviour or function has changed, repeat the observation and contact a veterinarian.';
    else if (total < 7) meaning.textContent = 'Pain is likely. Arrange a veterinary pain assessment promptly and do not self-medicate.';
    else meaning.textContent = 'Strong facial pain pattern. Seek urgent veterinary assessment and minimise handling.';
  }
  sliders.forEach(function (slider) { slider.addEventListener('input', function () { updateFace(slider.dataset.pain); }); });
  document.getElementById('painReset').addEventListener('click', function () {
    sliders.forEach(function (slider) { slider.value = 0; });
    updateFace('ears');
  });
  updateFace('ears');

  const species = {
    cat: { mark: 'C', title: 'Cat', intro: 'A cat may reduce normal behaviour long before it cries out.', subtle: ['The missed change', 'Hiding, eating less, stopping a usual jump, a tense crouch, squinting or resisting touch can matter more than vocalisation.'], compare: ['Compare, do not guess', 'Use a short video of the same routine on a normal day: walking, jumping, eating and settling. Change from baseline is the useful signal.'], urgent: ['Urgent pattern', 'Open-mouth breathing, collapse, repeated straining with little or no urine, seizure, major trauma or a score of 4 or more with illness needs prompt veterinary care.'], action: ['Safe next action', 'Keep the cat quiet in a ventilated carrier, reduce handling, and send the clinic a breathing video plus the timeline.'] },
    dog: { mark: 'D', title: 'Dog', intro: 'Dogs can show pain as behaviour change, not just limping or crying.', subtle: ['The missed change', 'Restlessness, panting out of context, a fixed posture, slower stairs, repeated turning to one body area, guarding or sudden irritability.'], compare: ['Compare, do not guess', 'Film the dog rising, walking away and turning without encouragement. Panting alone is not specific, so read it with temperature, activity and posture.'], urgent: ['Urgent pattern', 'Laboured breathing, distended abdomen with unproductive retching, collapse, seizure, uncontrolled bleeding, heat illness or inability to urinate.'], action: ['Safe next action', 'Approach from the side, use a towel or blanket for support, and avoid a muzzle if the dog is vomiting or struggling to breathe.'] },
    rabbit: { mark: 'R', title: 'Rabbit', intro: 'For rabbits, appetite and droppings are vital signs you can observe at home.', subtle: ['The missed change', 'Smaller or fewer droppings, reduced hay intake, a hunched posture, half-closed eyes, tooth grinding or staying still.'], compare: ['Compare, do not guess', 'Record when the rabbit last ate normally, the amount and size of droppings, water intake and whether movement has changed.'], urgent: ['Urgent pattern', 'Not eating with very few or no droppings, marked bloating, collapse, breathing difficulty, bleeding or flystrike needs urgent veterinary attention.'], action: ['Safe next action', 'Keep the rabbit quiet and at a comfortable temperature. Do not force-feed if the abdomen is distended or swallowing is poor.'] },
    cattle: { mark: 'B', title: 'Cattle', intro: 'In cattle, reduced function often appears before dramatic distress.', subtle: ['The missed change', 'Less rumination, separation from the group, reduced feed, a lowered head, arched back, altered weight-bearing or repeated rising and lying.'], compare: ['Compare, do not guess', 'Observe from a distance first. Record cud chewing, feed and water access, gait, manure, urination and whether the animal keeps pace with the herd.'], urgent: ['Urgent pattern', 'Severe bloat, difficult calving, inability to stand, open-mouth breathing, heavy bleeding, sudden neurological change or suspected poisoning.'], action: ['Safe next action', 'Keep the area quiet, prevent slipping or crowd pressure, and send the veterinarian a standing and walking video if movement is safe.'] },
    horse: { mark: 'H', title: 'Horse', intro: 'A horse can move from discomfort to emergency quickly, especially with abdominal pain.', subtle: ['The missed change', 'Reduced interest in feed, looking at the flank, pawing, stretching, a tense face, less interaction or repeated shifting of weight.'], compare: ['Compare, do not guess', 'Note manure output, appetite, sweating, abdominal sounds only if trained, pulse if safely known, and the exact timing of every change.'], urgent: ['Urgent pattern', 'Repeated rolling, persistent severe pain, collapse, breathing difficulty, heavy bleeding, choke signs, foaling difficulty or inability to bear weight.'], action: ['Safe next action', 'Call an equine veterinarian early. Remove hazards, keep handlers safe and do not give medication or feed unless directed.'] },
    bird: { mark: 'B', title: 'Bird', intro: 'Birds often hide illness until they have little reserve left.', subtle: ['The missed change', 'Fluffed feathers, less activity, altered droppings, reduced appetite, limping, a hanging wing or tail movement with each breath.'], compare: ['Compare, do not guess', 'Watch without handling. Note perch position, droppings, breathing at rest, food intake, flight or balance and any collision or cat contact.'], urgent: ['Urgent pattern', 'Huddled, weak, unresponsive or lying on the cage bottom, ongoing bleeding, open-mouth breathing or inability to perch is an emergency.'], action: ['Safe next action', 'Transport in a dark, quiet, ventilated box. Do not force food or water into the beak and minimise repeated checking.'] }
  };
  const panel = document.getElementById('speciesPanel');
  function renderSpecies(key) {
    const item = species[key];
    panel.innerHTML = '<div class="lc-species-title"><div class="mark">' + item.mark + '</div><div><h3>' + item.title + '</h3><p>' + item.intro + '</p></div></div><div class="lc-species-grid">' + [item.subtle, item.compare, item.urgent, item.action].map(function (card) { return '<article class="lc-species-card"><small>' + card[0] + '</small><p>' + card[1] + '</p></article>'; }).join('') + '</div>';
  }
  const speciesTabs = Array.from(document.querySelectorAll('[data-species]'));
  speciesTabs.forEach(function (tab, index) {
    tab.addEventListener('click', function () {
      speciesTabs.forEach(function (item) { item.setAttribute('aria-selected', String(item === tab)); });
      renderSpecies(tab.dataset.species);
    });
    tab.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      const next = event.key === 'ArrowRight' ? (index + 1) % speciesTabs.length : (index - 1 + speciesTabs.length) % speciesTabs.length;
      speciesTabs[next].focus();
      speciesTabs[next].click();
    });
  });
  renderSpecies('cat');

  const form = document.getElementById('handoverForm');
  const handoverOutput = document.getElementById('handoverOutput');
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    const value = function (id) { return document.getElementById(id).value.trim() || 'Unknown'; };
    handoverOutput.textContent = 'ANIMAL: ' + value('caseSpecies') + ', ' + value('caseSize') + '\nLOCATION: ' + value('caseLocation') + '\nNOTICED: ' + value('caseTime') + '\nNOW: Breathing ' + value('caseBreathing').toLowerCase() + '; response ' + value('caseResponse').toLowerCase() + '; bleeding ' + value('caseBleeding').toLowerCase() + '.\nEVENT OR CHANGE: ' + value('caseEvent') + '\nHELP NEEDED: Veterinary assessment and safe transport guidance.';
  });
  document.getElementById('copyHandover').addEventListener('click', async function () {
    if (handoverOutput.textContent.indexOf('Complete the case facts') === 0) return;
    try {
      await navigator.clipboard.writeText(handoverOutput.textContent);
      this.textContent = 'Copied';
    } catch (error) {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(handoverOutput);
      selection.removeAllRanges();
      selection.addRange(range);
      this.textContent = 'Selected. Press copy';
    }
  });

  let timerSeconds = 900;
  let timerId = null;
  const timer = document.getElementById('washTimer');
  const timerToggle = document.getElementById('timerToggle');
  function paintTimer() {
    const minutes = Math.floor(timerSeconds / 60);
    const seconds = timerSeconds % 60;
    timer.textContent = String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
  }
  timerToggle.addEventListener('click', function () {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
      timerToggle.textContent = 'Continue';
      return;
    }
    if (timerSeconds === 0) timerSeconds = 900;
    timerToggle.textContent = 'Pause';
    timerId = setInterval(function () {
      timerSeconds -= 1;
      paintTimer();
      if (timerSeconds <= 0) {
        clearInterval(timerId);
        timerId = null;
        timerToggle.textContent = 'Start again';
      }
    }, 1000);
  });
  document.getElementById('timerReset').addEventListener('click', function () {
    if (timerId) clearInterval(timerId);
    timerId = null;
    timerSeconds = 900;
    timerToggle.textContent = 'Start timer';
    paintTimer();
  });
})();

