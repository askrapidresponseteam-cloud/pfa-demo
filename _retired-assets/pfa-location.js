(function () {
  'use strict';

  var boundButtons = new WeakSet();
  var boundManualButtons = new WeakSet();

  function byId(id, root) {
    if (!id) return null;
    var scope = root || document;
    return typeof scope.getElementById === 'function' ? scope.getElementById(id) : scope.querySelector('#' + id);
  }

  function fetchJson(url) {
    var controller = new AbortController();
    var timer = window.setTimeout(function () { controller.abort(); }, 9000);
    return fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal })
      .then(function (response) {
        if (!response.ok) throw new Error('Location lookup failed');
        return response.json();
      })
      .finally(function () { window.clearTimeout(timer); });
  }

  function sixDigitPin(value) {
    var match = String(value || '').match(/\b\d{6}\b/);
    return match ? match[0] : '';
  }

  function readBigDataCloud(data) {
    var levels = Array.isArray(data && data.localityInfo && data.localityInfo.administrative)
      ? data.localityInfo.administrative : [];
    var district = levels.find(function (item) {
      return /district/i.test((item && item.description || '') + ' ' + (item && item.name || ''));
    }) || levels.find(function (item) { return Number(item && item.adminLevel) === 5; })
      || levels.find(function (item) { return Number(item && item.adminLevel) === 6; });
    return {
      pin: sixDigitPin(data && data.postcode),
      district: district && district.name || '',
      state: data && data.principalSubdivision || ''
    };
  }

  function readOpenStreetMap(data) {
    var address = data && data.address || {};
    return {
      pin: sixDigitPin(address.postcode),
      district: address.state_district || address.district || address.county || address.city_district || '',
      state: address.state || ''
    };
  }

  function readPinResponse(data) {
    var office = Array.isArray(data) && data[0] && Array.isArray(data[0].PostOffice)
      ? data[0].PostOffice[0] : null;
    return office ? { pin: sixDigitPin(office.Pincode), district: office.District || '', state: office.State || '' } : null;
  }

  function reverseGeocode(latitude, longitude) {
    var result = { pin: '', district: '', state: '' };
    return fetchJson('https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' + encodeURIComponent(latitude) + '&longitude=' + encodeURIComponent(longitude) + '&localityLanguage=en')
      .then(function (data) { result = readBigDataCloud(data); return result; })
      .catch(function () { return result; })
      .then(function (current) {
        if (current.pin && current.district && current.state) return current;
        return fetchJson('https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=' + encodeURIComponent(latitude) + '&lon=' + encodeURIComponent(longitude) + '&accept-language=en')
          .then(function (data) {
            var fallback = readOpenStreetMap(data);
            return { pin: current.pin || fallback.pin, district: current.district || fallback.district, state: current.state || fallback.state };
          })
          .catch(function () { return current; });
      })
      .then(function (current) {
        if (!current.pin || (current.district && current.state)) return current;
        return fetchJson('https://api.postalpincode.in/pincode/' + encodeURIComponent(current.pin))
          .then(function (data) {
            var pinData = readPinResponse(data) || {};
            return { pin: current.pin || pinData.pin, district: current.district || pinData.district, state: current.state || pinData.state };
          })
          .catch(function () { return current; });
      });
  }

  function pinLookup(pin) {
    return fetchJson('https://api.postalpincode.in/pincode/' + encodeURIComponent(pin)).then(readPinResponse);
  }

  function setValue(field, value) {
    if (!field || value == null || String(value).trim() === '') return false;
    var normalized = String(value).trim();
    if (field.tagName === 'SELECT') {
      var option = Array.prototype.find.call(field.options, function (item) {
        return String(item.value || item.textContent).trim().toLowerCase() === normalized.toLowerCase();
      });
      if (!option) {
        option = document.createElement('option');
        option.value = normalized;
        option.textContent = normalized;
        field.appendChild(option);
      }
      field.value = option.value;
    } else {
      field.value = normalized;
    }
    if (field.value !== normalized && field.tagName !== 'SELECT') return false;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function lock(field) {
    if (!field) return;
    field.dataset.pfaLocationLocked = 'true';
    field.classList.add('pfa-location-locked');
    field.setAttribute('aria-readonly', 'true');
    if (field.tagName === 'SELECT') {
      field.tabIndex = -1;
      field.style.pointerEvents = 'none';
      if (!field.dataset.pfaLocationLockHandler) {
        field.addEventListener('change', function () {
          if (field.dataset.pfaLocationLocked === 'true') field.value = field.dataset.pfaLocationValue || field.value;
        }, true);
        field.addEventListener('keydown', function (event) { event.preventDefault(); }, true);
        field.dataset.pfaLocationLockHandler = 'true';
      }
    } else {
      field.readOnly = true;
    }
    field.dataset.pfaLocationValue = field.value;
  }

  function isLocked(field) {
    return !!(field && field.dataset.pfaLocationLocked === 'true');
  }

  function unlock(field) {
    if (!field) return;
    field.dataset.pfaLocationLocked = 'false';
    field.classList.remove('pfa-location-locked');
    field.removeAttribute('aria-readonly');
    field.readOnly = false;
    field.tabIndex = 0;
    field.style.pointerEvents = '';
  }

  /* The lookup can be wrong: a PIN on a boundary, a stale fix. Locking the
     fields without a way back is the thing that makes the journey feel
     stuck, so the status line carries a "Change" link that clears the
     detected values and hands the fields back. */
  function offerUndo(config) {
    if (!config.status) return;
    var link = document.createElement('button');
    link.type = 'button';
    link.className = 'location-undo';
    link.textContent = 'Not right? Change it';
    link.addEventListener('click', function () {
      [config.pin, config.district, config.state].forEach(function (field) {
        unlock(field);
        if (field) { field.value = ''; field.dispatchEvent(new Event('input', { bubbles: true })); }
      });
      if (config.latitude) config.latitude.value = '';
      if (config.longitude) config.longitude.value = '';
      if (config.mode) config.mode.value = 'manual';
      config.button.textContent = config.button.dataset.pfaLocationLabel || 'Use current location';
      statusFor(config, 'Type the PIN code and we fill district and state.', '');
      if (config.pin) config.pin.focus();
    });
    config.status.appendChild(document.createTextNode(' '));
    config.status.appendChild(link);
  }

  function statusFor(config, message, state) {
    if (!config.status) return;
    config.status.textContent = message;
    config.status.dataset.state = state || '';
    config.status.classList.toggle('is-success', state === 'success');
    config.status.classList.toggle('is-error', state === 'error');
  }

  /* A hidden field that is still `required` stops a form submitting with no
     visible reason - the browser refuses and points at something nobody can
     see. While a block is hidden its required flags are suspended; they come
     back the moment it is revealed. */
  function suspendRequired(container) {
    if (!container) return;
    Array.prototype.forEach.call(container.querySelectorAll('[required]'), function (field) {
      field.setAttribute('data-pfa-was-required', 'true');
      field.required = false;
    });
  }

  function restoreRequired(container) {
    if (!container) return;
    Array.prototype.forEach.call(container.querySelectorAll('[data-pfa-was-required="true"]'), function (field) {
      field.required = true;
      field.removeAttribute('data-pfa-was-required');
    });
  }

  function revealManual(config) {
    if (config.manualFields) restoreRequired(config.manualFields);
    if (config.detailFields) restoreRequired(config.detailFields);
    if (config.manualFields) config.manualFields.hidden = false;
    if (config.detailFields) config.detailFields.hidden = false;
    if (config.locationCard) config.locationCard.hidden = true;
    if (config.resolved) config.resolved.hidden = true;
    if (config.mode) config.mode.value = 'manual';
  }

  function focusManual(config) {
    var focus = config.address || config.pin || config.district || config.state;
    if (focus && focus.hidden) return;
    if (focus && typeof focus.focus === 'function') focus.focus();
  }

  function manualAction(config, event) {
    if (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    if (isLocked(config.state) || isLocked(config.district)) {
      if (config.manualFields) config.manualFields.hidden = false;
      if (config.detailFields) config.detailFields.hidden = false;
      statusFor(config, 'District and state came from your location. Add the house and street, or change the detected values.', 'success');
      offerUndo(config);
      focusManual(config);
      return;
    }
    revealManual(config);
    statusFor(config, 'Type the address above.', '');
    focusManual(config);
  }

  function configFor(button) {
    var root = button.closest('form') || document;
    function attr(name) { return button.getAttribute('data-pfa-location-' + name) || ''; }
    return {
      button: button,
      root: root,
      status: byId(attr('status'), root),
      pin: byId(attr('pin'), root),
      state: byId(attr('state'), root),
      district: byId(attr('district'), root),
      districtMirror: byId(attr('district-mirror'), root),
      address: byId(attr('address'), root),
      latitude: byId(attr('latitude'), root),
      longitude: byId(attr('longitude'), root),
      mode: byId(attr('mode'), root),
      manualFields: byId(attr('manual-fields'), root),
      detailFields: byId(attr('detail-fields'), root),
      locationCard: byId(attr('location-card'), root),
      resolved: byId(attr('resolved'), root),
      resolvedText: byId(attr('resolved-text'), root),
      manualButton: byId(attr('manual-button'), root)
    };
  }

  function applyResolved(config, result, latitude, longitude) {
    var pinFilled = setValue(config.pin, result.pin);
    var districtFilled = setValue(config.district, result.district);
    var stateFilled = setValue(config.state, result.state);
    if (config.districtMirror) setValue(config.districtMirror, result.district);
    if (config.latitude) setValue(config.latitude, latitude);
    if (config.longitude) setValue(config.longitude, longitude);
    if (config.mode) config.mode.value = 'auto';
    if (districtFilled && stateFilled) {
      lock(config.district);
      lock(config.state);
    }
    if (config.locationCard) config.locationCard.hidden = true;
    if (config.manualFields && config.manualFields.dataset.pfaKeepVisible !== 'true') config.manualFields.hidden = true;
    if (config.detailFields) { restoreRequired(config.detailFields); config.detailFields.hidden = false; }
    if (config.resolved) config.resolved.hidden = false;
    if (config.resolvedText) config.resolvedText.textContent = [result.district, result.state, result.pin].filter(Boolean).join(', ');
    if (config.manualButton) config.manualButton.hidden = false;
    return pinFilled && districtFilled && stateFilled;
  }

  function bindManual(button) {
    if (!button || boundManualButtons.has(button)) return;
    boundManualButtons.add(button);
    var locationButton = button.closest('form') && button.closest('form').querySelector('[data-pfa-location-button]');
    var config = locationButton ? configFor(locationButton) : configFor(button);
    button.hidden = false;
    button.addEventListener('click', function (event) { manualAction(config, event); }, true);
  }

  function bindLocation(button) {
    if (!button || boundButtons.has(button)) return;
    boundButtons.add(button);
    var config = configFor(button);
    config.manualButton = config.manualButton || (config.root.querySelector && config.root.querySelector('[data-pfa-location-manual]'));
    if (config.manualButton) bindManual(config.manualButton);
    button.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!navigator.geolocation) {
        statusFor(config, 'Location is not available in this browser. Type the PIN code instead.', 'error');
        revealManual(config);
        focusManual(config);
        return;
      }
      button.disabled = true;
      button.dataset.pfaLocationBusy = 'true';
      if (!button.dataset.pfaLocationLabel) button.dataset.pfaLocationLabel = button.textContent;
      button.textContent = 'Finding location...';
      statusFor(config, 'Please allow location access when your browser asks.', '');
      navigator.geolocation.getCurrentPosition(function (position) {
        reverseGeocode(position.coords.latitude, position.coords.longitude).then(function (result) {
          if (!result || !result.state || !result.district) throw new Error('Incomplete address');
          var complete = applyResolved(config, result, position.coords.latitude.toFixed(6), position.coords.longitude.toFixed(6));
          button.disabled = false;
          button.dataset.pfaLocationBusy = 'false';
          button.textContent = 'Location captured';
          statusFor(config, complete ? 'PIN code, district and state filled from your location. Now add the house and street above.' : 'Location partly filled. Complete the rest of the address.', complete ? 'success' : 'error');
          offerUndo(config);
          focusManual(config);
        }).catch(function () {
          button.disabled = false;
          button.dataset.pfaLocationBusy = 'false';
          button.textContent = 'Try location again';
          statusFor(config, 'We could not read the full location. Type the PIN code and we fill the rest.', 'error');
          revealManual(config);
          focusManual(config);
        });
      }, function (error) {
        button.disabled = false;
        button.dataset.pfaLocationBusy = 'false';
        button.textContent = 'Try location again';
        statusFor(config, error && error.code === 1 ? 'Location access was not allowed. Type the PIN code and we fill district and state.' : 'We could not read your location. Type the PIN code and we fill district and state.', 'error');
        revealManual(config);
        focusManual(config);
      }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
    }, true);

    if (config.pin && !config.pin.dataset.pfaLocationPinBound) {
      config.pin.addEventListener('input', function () {
        if (isLocked(config.state) || isLocked(config.district)) return;
        var clean = config.pin.value.replace(/\D/g, '').slice(0, 6);
        if (config.pin.value !== clean) config.pin.value = clean;
        if (clean.length !== 6) return;
        window.clearTimeout(config.pin.dataset.pfaLocationTimer);
        config.pin.dataset.pfaLocationTimer = window.setTimeout(function () {
          pinLookup(clean).then(function (result) {
            if (!result) return;
            setValue(config.district, result.district);
            setValue(config.state, result.state);
            statusFor(config, 'District and state filled from your PIN code. Change them if they are not right.', 'success');
          }).catch(function () {});
        }, 450);
      });
      config.pin.dataset.pfaLocationPinBound = 'true';
    }
  }

  function scan(root) {
    (root || document).querySelectorAll('[data-pfa-location-button]').forEach(bindLocation);
    (root || document).querySelectorAll('[data-pfa-location-manual]').forEach(bindManual);
  }

  window.PFALocation = { lookup: reverseGeocode, bind: scan };
  scan(document);
  new MutationObserver(function (records) {
    records.forEach(function (record) {
      record.addedNodes.forEach(function (node) {
        if (node.nodeType === 1) scan(node);
      });
    });
  }).observe(document.documentElement, { childList: true, subtree: true });

  /* The trap this closes: a page can mark the address fields required after
     load (membership does exactly that when the printed card is chosen) while
     the block is still hidden. The browser then refuses to submit and points at
     a field nobody can see.

     A `submit` listener is no use here, because when constraint validation
     fails the submit event never fires. `invalid` does fire, on each offending
     control, so that is what opens the block and puts the cursor in it. */
  function onInvalidField(event) {
    var field = event.target;
    if (!field || !field.closest) return;
    var block = field.closest('[data-pfa-address-fields]');
    if (!block || !block.hidden) return;
    block.hidden = false;
    restoreRequired(block);
    if (field.focus) field.focus();
  }

  document.addEventListener('invalid', onInvalidField, true);

  /* Anything hidden at load has its required flags suspended straight away. */
  function primeHiddenBlocks() {
    Array.prototype.forEach.call(
      document.querySelectorAll('[data-pfa-address-fields][hidden]'),
      suspendRequired
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', primeHiddenBlocks);
  } else {
    primeHiddenBlocks();
  }

}());
