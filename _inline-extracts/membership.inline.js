/* ===========================================================
   EXTRACT - membership.html
   Patron journey: form, card preview, CCAvenue call

   2 inline <script> block(s), in document order.
   READ-ONLY REFERENCE COPY. The live code is inside
   membership.html in the UI/content zip. Edit it THERE; this file
   is a snapshot for reading and review only.
   =========================================================== */

/* ---- block 1 of 2 ---- */
(() => {
  const BASE_MEMBERSHIP_FEE = 365;
  const PHYSICAL_CARD_FEE = 149;
  const USD_MEMBERSHIP_FEE = 10;
  let currency = 'inr';
  const formatMoney = (value) => currency === 'usd'
    ? '$' + Number(value || 0).toLocaleString('en-US')
    : '₹' + Number(value || 0).toLocaleString('en-IN');
  const beginButton = document.getElementById('patronBegin');
  const journey = document.getElementById('join');
  const journeyTitle = document.getElementById('patronFormTitle');
  const physicalRow = document.getElementById('physicalRow');
  const physicalSwitch = document.getElementById('patronSwitch');
  const physicalSummary = document.getElementById('patronPhysical');
  const totalSummary = document.getElementById('patronTotal');
  const amountLabel = document.getElementById('patronAmountLabel');
  const payButton = document.getElementById('patronPay');
  const physicalCardInput = document.getElementById('patronPhysicalCard');
  const deliverySection = document.getElementById('patronDeliverySection');
  const physicalChoiceNote = document.getElementById('physicalChoiceNote');
  const fulfilmentNote = document.getElementById('patronFulfilmentNote');
  const locationButton = document.getElementById('patronLocation');
  const locationStatus = document.getElementById('patronLocationStatus');
  const pinInput = document.getElementById('patronPin');
  const districtInput = document.getElementById('patronDistrict');
  const stateInput = document.getElementById('patronState');
  const addressInput = document.getElementById('patronAddress');
  const deliveryFields = [addressInput, pinInput, districtInput, stateInput].filter(Boolean);
  const addressPreviews = document.querySelectorAll('[data-patron-address]');
  const addressLine1 = document.querySelectorAll('[data-patron-addr1]');
  const addressLine2 = document.querySelectorAll('[data-patron-addr2]');
  const addressLine3 = document.querySelectorAll('[data-patron-addr3]');
  const patronCards = document.querySelectorAll('[data-patron-card]');
  const cardFlipButtons = document.querySelectorAll('[data-card-flip]');
  const cardSideButtons = document.querySelectorAll('[data-card-side]');
  const nameInput = document.getElementById('patronName');

  /* The photograph control is the shared one, identical to the Caretaker Card
     journey: drag to position, zoom, and a warning when the file is too small
     to print cleanly. The Patron card face itself is unchanged. */
  let patronPhotoEditor = null;
  const mountPhotoEditor = () => {
    /* enforceJourneyState runs on every state change; re-mounting would wipe a
       photograph the applicant has already positioned. */
    if (patronPhotoEditor) return;
    if (!window.PFAJourney || !document.getElementById('patronPhotoEditor')) return;
    patronPhotoEditor = window.PFAJourney.photo({
      mount: '#patronPhotoEditor',
      input: '#patronPhoto',
      label: '#patronPhotoLabel',
      aspect: 4 / 3,
      outputWidth: 1200,
      /* The Patron card's photograph well, so a lifted subject sits on the
         same colour the card will print behind it. */
      ground: [237, 246, 251],
      /* The hosted fallback, for photographs the on-device cut-out declines.
         The route answers 503 until a provider is configured, so leaving this
         set on a deployment without one simply means the button never works -
         it does not send anything anywhere. */
      remote: '/api/photo/remove-background',
      onLoaded: () => applyPatronPhoto()
    });
    const mount = document.getElementById('patronPhotoEditor');
    ['pointerup', 'input'].forEach((name) => mount.addEventListener(name, () => {
      if (patronPhotoEditor && patronPhotoEditor.hasImage()) applyPatronPhoto();
    }));
  };

  const applyPatronPhoto = () => {
    if (!patronPhotoEditor || !patronPhotoEditor.hasImage()) return;
    const dataUrl = patronPhotoEditor.toDataUrl();
    document.querySelectorAll('[data-patron-photo]').forEach((node) => {
      node.classList.add('has-photo');
      /* Belt-and-braces: an <img loading="lazy" decoding="async"> for reliable rendering, plus a
         background-image as a fallback. The CSS styles both. */
      let img = node.querySelector('img.pfa-card-photo-img');
      if (!img) {
        img = document.createElement('img');
        img.className = 'pfa-card-photo-img';
        img.alt = '';
        img.setAttribute('aria-hidden', 'true');
        node.appendChild(img);
      }
      img.src = dataUrl;
      node.style.backgroundImage = `url("${dataUrl}")`;
      node.style.backgroundSize = 'cover';
      node.style.backgroundPosition = 'center top';
    });
    try { window.sessionStorage.setItem('pfa_patron_photo', dataUrl); } catch (_) {}
  };
  const currencyField = document.getElementById('patronCurrency');
  const currencyChipsHost = document.getElementById('patronCurrencyChips');

  /* Line lengths are capped so nothing can run past the edge of the card.
     The same limits are set on the fields themselves. */
  const LINE_LIMIT = { street: 72, district: 40, state: 40 };

  /* Every line is put into Title Case, so the card reads "MG Road, Bengaluru
     Urban" however it was typed or fetched. */
  const clean = (value, limit) => {
    const text = String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
    return window.PFA_RULES ? window.PFA_RULES.titleCase(text) : text;
  };

  /* A value fills the line and clears the dimmed styling; no value puts
     the placeholder back. */
  const setOrGhost = (nodes, value, placeholder) => {
    nodes.forEach((node) => {
      if (value) {
        node.textContent = String(value);
        node.classList.remove('ghost');
      } else {
        node.textContent = placeholder;
        node.classList.toggle('ghost', Boolean(placeholder));
      }
    });
  };

  const showCardSide = (side) => {
    const showBack = side === 'back';
    patronCards.forEach((card) => {
      card.dataset.view = showBack ? 'back' : 'front';
      card.classList.remove('is-flipped', 'flipped');
    });
    cardFlipButtons.forEach((button) => button.setAttribute('aria-pressed', String(showBack)));
    cardSideButtons.forEach((button) => button.classList.toggle('active', button.dataset.cardSide === side));
  };

  /* The address is on the card whether or not a physical card is ordered. */
  const updateAddressPreviews = () => {
    const street = clean(addressInput?.value, LINE_LIMIT.street);
    const pin = clean(pinInput?.value, 6);
    const district = clean(districtInput?.value, LINE_LIMIT.district);
    const state = clean(stateInput?.value, LINE_LIMIT.state);

    setOrGhost(addressLine1, street, 'Address line');
    setOrGhost(addressLine2, district && pin ? district + ' ' + pin : (district || pin), 'District, PIN');
    setOrGhost(addressLine3, state, 'State');

    addressPreviews.forEach((preview) => {
      preview.textContent = [street, district, pin, state].filter(Boolean).join(', ');
    });
  };

  /* The printed card is optional. INR members choose it with the toggle;
     USD memberships are digital only because PFA does not post internationally. */
  const updatePhysicalCard = () => {
    const physicalActuallySelected = currency !== 'usd' && !!(physicalSwitch && physicalSwitch.classList.contains('on'));
    const total = currency === 'usd'
      ? USD_MEMBERSHIP_FEE
      : BASE_MEMBERSHIP_FEE + (physicalActuallySelected ? PHYSICAL_CARD_FEE : 0);

    physicalSwitch?.setAttribute('aria-checked', String(physicalActuallySelected));
    physicalSwitch?.setAttribute('aria-expanded', String(physicalActuallySelected));
    physicalSwitch?.classList.toggle('on', physicalActuallySelected);
    physicalRow?.classList.toggle('selected', physicalActuallySelected);
    if (physicalCardInput) physicalCardInput.value = physicalActuallySelected ? 'yes' : 'no';
    deliveryFields.forEach((field) => {
      field.required = physicalActuallySelected;
    });

    /* The address is asked for once, here, and is both printed on the card and
       used for delivery - the same rule the Caretaker Card journey follows. */
    if (deliverySection) deliverySection.hidden = !physicalActuallySelected;

    if (physicalSummary) {
      physicalSummary.textContent = physicalActuallySelected
        ? `Printed card included (${formatMoney(PHYSICAL_CARD_FEE)}) · delivered within 14 days`
        : (currency === 'usd'
            ? 'International membership. Digital card only.'
            : 'Digital card only. Nothing will be shipped.');
    }
    if (physicalChoiceNote) {
      physicalChoiceNote.textContent = physicalActuallySelected
        ? 'Your printed card is delivered within 14 days.'
        : 'International memberships are digital only.';
    }
    if (fulfilmentNote) {
      fulfilmentNote.textContent = physicalActuallySelected
        ? 'Your physical Patron card will be delivered within 14 days.'
        : 'You will receive a digital Patron card. Nothing will be shipped.';
    }
    if (totalSummary) totalSummary.textContent = formatMoney(total);
    if (amountLabel) amountLabel.textContent = `${formatMoney(total)} total`;
    if (payButton) payButton.textContent = `Continue to pay ${formatMoney(total)}`;
    updateAddressPreviews();
  };

  const setCurrency = (next) => {
    if (next === currency) return;
    currency = next;
    if (currencyField) currencyField.value = currency;
    currencyChipsHost?.querySelectorAll('[data-currency]').forEach((button) => {
      button.classList.toggle('active', button.dataset.currency === currency);
    });
    if (currency === 'usd') {
      if (physicalRow) physicalRow.hidden = true;
    } else if (physicalRow) {
      physicalRow.hidden = false;
    }
    updatePhysicalCard();
  };

  currencyChipsHost?.querySelectorAll('[data-currency]').forEach((button) => {
    button.addEventListener('click', () => setCurrency(button.dataset.currency));
  });

  /* The physical card opt-in. One owner for the click: this handler flips the
     switch and recomputes everything (total, delivery section, notes, cards). */
  physicalSwitch?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (currency === 'usd') return;
    const on = !physicalSwitch.classList.contains('on');
    physicalSwitch.classList.toggle('on', on);
    physicalSwitch.setAttribute('aria-checked', String(on));
    updatePhysicalCard();
  }, true);

  const enforceJourneyState = () => {
    if (physicalRow) physicalRow.hidden = false;
    updatePhysicalCard();
  mountPhotoEditor();

    if (journey?.dataset.journeyOpen !== 'true') {
      journey?.setAttribute('data-journey-open', 'false');
      if (journey) journey.hidden = true;
      beginButton?.setAttribute('aria-expanded', 'false');
    }
  };

  enforceJourneyState();
  window.addEventListener('load', () => window.setTimeout(enforceJourneyState, 0), { once: true });

  beginButton?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();

    if (!journey) return;
    journey.hidden = false;
    journey.dataset.journeyOpen = 'true';
    beginButton.setAttribute('aria-expanded', 'true');

    window.requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      journey.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      journeyTitle?.focus({ preventScroll: true });
    });
  }, true);


  deliveryFields.forEach((field) => {
    field.addEventListener('focus', () => showCardSide('back'));
  });

  nameInput?.addEventListener('focus', () => showCardSide('front'));

  deliveryFields.forEach((field) => {
    field.addEventListener('input', () => {
      window.queueMicrotask(updateAddressPreviews);
    });
  });

  if (!locationButton || !locationStatus || !pinInput || !districtInput || !stateInput) return;

  const setStatus = (message, state = '') => {
    locationStatus.textContent = message;
    if (state) locationStatus.dataset.state = state;
    else delete locationStatus.dataset.state;
  };

  const setField = (field, value) => {
    if (!value) return false;
    field.value = String(value).trim();
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  };

  const fetchJson = async (url) => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      if (!response.ok) throw new Error('Location lookup failed');
      return await response.json();
    } finally {
      window.clearTimeout(timeout);
    }
  };

  const sixDigitPin = (value) => {
    const match = String(value || '').match(/\b\d{6}\b/);
    return match ? match[0] : '';
  };

  const readBigDataCloud = (data) => {
    const levels = Array.isArray(data?.localityInfo?.administrative)
      ? data.localityInfo.administrative
      : [];
    const district = levels.find((item) => /district/i.test(`${item?.description || ''} ${item?.name || ''}`))
      || levels.find((item) => Number(item?.adminLevel) === 5)
      || levels.find((item) => Number(item?.adminLevel) === 6);

    return {
      pin: sixDigitPin(data?.postcode),
      district: district?.name || '',
      state: data?.principalSubdivision || ''
    };
  };

  const readOpenStreetMap = (data) => {
    const address = data?.address || {};
    return {
      pin: sixDigitPin(address.postcode),
      district: address.state_district || address.district || address.county || address.city_district || '',
      state: address.state || ''
    };
  };

  const reverseGeocode = async (latitude, longitude) => {
    let result = { pin: '', district: '', state: '' };

    try {
      const data = await fetchJson(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}&localityLanguage=en`);
      result = readBigDataCloud(data);
    } catch (error) {
      /* The second provider below is the user-facing fallback. */
    }

    if (result.pin && result.district && result.state) return result;

    try {
      const data = await fetchJson(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&accept-language=en`);
      const fallback = readOpenStreetMap(data);
      return {
        pin: result.pin || fallback.pin,
        district: result.district || fallback.district,
        state: result.state || fallback.state
      };
    } catch (error) {
      return result;
    }
  };

  let pinLookupTimer;
  const fillFromPin = async (pin) => {
    try {
      const result = await fetchJson(`https://api.postalpincode.in/pincode/${encodeURIComponent(pin)}`);
      const office = Array.isArray(result) ? result[0]?.PostOffice?.[0] : null;
      if (!office) return;

      if (districtInput.dataset.pfaLocationLocked !== 'true') setField(districtInput, office.District);
      if (stateInput.dataset.pfaLocationLocked !== 'true') setField(stateInput, office.State);
      setStatus('District and state filled from your PIN code. Change them if they are not right.', 'success');
    } catch (error) {
      setStatus('We could not find that PIN code. Type the district and state.', 'error');
    }
  };

  pinInput.addEventListener('input', () => {
    const cleaned = pinInput.value.replace(/\D/g, '').slice(0, 6);
    if (pinInput.value !== cleaned) pinInput.value = cleaned;
    window.clearTimeout(pinLookupTimer);
    if (cleaned.length === 6) {
      pinLookupTimer = window.setTimeout(() => fillFromPin(cleaned), 450);
    }
  });

  locationButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();

    if (!navigator.geolocation) {
      setStatus('Location is not available in this browser. Enter your PIN code and we will fill the district and state.', 'error');
      pinInput.focus();
      return;
    }

    locationButton.disabled = true;
    locationButton.textContent = 'Finding location...';
    setStatus('Please allow location access when your browser asks.');

    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      const result = await reverseGeocode(coords.latitude, coords.longitude);
      const pinFilled = setField(pinInput, result.pin);
      const districtFilled = setField(districtInput, result.district);
      const stateFilled = setField(stateInput, result.state);

      locationButton.disabled = false;
      locationButton.textContent = 'Use current location';

      if (pinFilled && districtFilled && stateFilled) {
        setStatus('PIN code, district, and state filled. Please review them and add your house and street.', 'success');
      } else if (pinFilled || districtFilled || stateFilled) {
        setStatus('We filled the location details we found. Please complete any blank field and review everything.', 'success');
      } else {
        setStatus('We found your location but could not read the address. Please enter the PIN code, district, and state.', 'error');
      }

      addressInput?.focus();
    }, (error) => {
      locationButton.disabled = false;
      locationButton.textContent = 'Use current location';

      const message = error.code === error.PERMISSION_DENIED
        ? 'Location access was not allowed. Enter your PIN code and we will fill the district and state.'
        : 'We could not read your location. Enter your PIN code and we will fill the district and state.';
      setStatus(message, 'error');
      pinInput.focus();
    }, {
      enableHighAccuracy: false,
      maximumAge: 300000,
      timeout: 10000
    });
  });
})();

/* ---- block 2 of 2 ---- */
(() => {
  const cards = [...document.querySelectorAll('[data-patron-card]')];
  const flipButtons = [...document.querySelectorAll('[data-card-flip]')];
  const sideButtons = [...document.querySelectorAll('[data-card-side]')];

  const setSide = (side) => {
    const showBack = side === 'back';
    cards.forEach((card) => {
      card.dataset.view = showBack ? 'back' : 'front';
      card.classList.remove('is-flipped', 'flipped');
    });
    flipButtons.forEach((button) => button.setAttribute('aria-pressed', String(showBack)));
    sideButtons.forEach((button) => button.classList.toggle('active', button.dataset.cardSide === side));
  };

  flipButtons.forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const card = button.querySelector('[data-patron-card]');
      setSide(card?.dataset.view === 'back' ? 'front' : 'back');
    }, true);
  });

  sideButtons.forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      setSide(button.dataset.cardSide === 'back' ? 'back' : 'front');
    }, true);
  });

  setSide('front');
})();

