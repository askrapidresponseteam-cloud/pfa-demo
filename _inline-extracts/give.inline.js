/* ===========================================================
   EXTRACT - give.html
   Donate / Give+Send: amount logic, CCAvenue call

   1 inline <script> block(s), in document order.
   READ-ONLY REFERENCE COPY. The live code is inside
   give.html in the UI/content zip. Edit it THERE; this file
   is a snapshot for reading and review only.
   =========================================================== */

/* ---- block 1 of 1 ---- */
(() => {
      const routeButtons = [...document.querySelectorAll('[data-help-mode]')];
      const routePanels = [...document.querySelectorAll('[data-help-panel]')];
      const routeClarifier = document.getElementById('routeClarifier');

      const routeCopy = {
        donate: '<span aria-hidden="true">●</span><div><strong>You selected a direct donation.</strong> Money goes to PFA and is used for the cause you choose.</div>',
        feed: '<span aria-hidden="true">●</span><div><strong>You selected a food order.</strong> Food items go to a verified volunteer in the district or city you choose. This is not a general donation.</div>'
      };

      function setRoute(mode, scrollIntoView = false) {
        routeButtons.forEach((button) => {
          const selected = button.dataset.helpMode === mode;
          button.setAttribute('aria-selected', String(selected));
        });

        routePanels.forEach((panel) => {
          panel.hidden = panel.dataset.helpPanel !== mode;
        });

        routeClarifier.innerHTML = routeCopy[mode];

        if (scrollIntoView) {
          document.getElementById(mode === 'feed' ? 'feedPanel' : 'donatePanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }

      routeButtons.forEach((button) => {
        button.addEventListener('click', () => setRoute(button.dataset.helpMode, true));
      });

      document.querySelectorAll('[data-route-link]').forEach((link) => {
        link.addEventListener('click', (event) => {
          event.preventDefault();
          setRoute(link.dataset.routeLink, true);
        });
      });

      const feedForm = document.getElementById('feedOrderForm');
      if (!feedForm) return;

      const stateField = document.getElementById('feedState');
      const districtField = document.getElementById('feedDistrict');
      const localityField = document.getElementById('feedLocality');
      const locationButton = document.getElementById('useFeedLocation');
      const locationStatus = document.getElementById('feedLocationStatus');
      const latitudeField = document.getElementById('feedLatitude');
      const longitudeField = document.getElementById('feedLongitude');
      const itemCards = [...document.querySelectorAll('[data-feed-item]')];
      const itemsError = document.getElementById('feedItemsError');
      const totalElement = document.getElementById('feedTotal');
      const destinationElement = document.getElementById('feedDestinationSummary');
      const weightElement = document.getElementById('feedWeightSummary');
      const summaryItemsElement = document.getElementById('feedSummaryItems');
      const emptySummaryElement = document.getElementById('feedEmptySummary');
      const submitButton = document.getElementById('feedSubmitButton');
      const successElement = document.getElementById('feedSuccess');
      let currentStep = 1;
      let paymentSubmitting = false;

      const formatCurrency = (value) => new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
      }).format(value);

      const escapeHTML = (value) => String(value).replace(/[&<>'"]/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      })[character]);

      function getSelectedItems() {
        return itemCards.map((card) => {
          const quantity = Number(card.querySelector('[data-qty-output]').value || card.querySelector('[data-qty-output]').textContent || 0);
          return {
            card,
            name: card.dataset.name,
            pack: card.dataset.pack,
            price: Number(card.dataset.price),
            weight: Number(card.dataset.weight),
            quantity
          };
        }).filter((item) => item.quantity > 0);
      }

      function getDestination() {
        const parts = [localityField.value.trim(), districtField.value.trim(), stateField.value.trim()].filter(Boolean);
        return parts.length ? parts.join(', ') : 'Not selected';
      }

      function updateSummary() {
        const selectedItems = getSelectedItems();
        const total = selectedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const weight = selectedItems.reduce((sum, item) => sum + (item.weight * item.quantity), 0);

        totalElement.textContent = formatCurrency(total);
        weightElement.textContent = `${weight} kg`;
        destinationElement.textContent = getDestination();
        submitButton.textContent = total > 0 ? `Pay ${formatCurrency(total)} and send food` : 'Pay and send food';

        if (selectedItems.length) {
          summaryItemsElement.hidden = false;
          emptySummaryElement.hidden = true;
          summaryItemsElement.innerHTML = selectedItems.map((item) => (
            `<li><span>${escapeHTML(item.name)} × ${item.quantity}</span><strong>${formatCurrency(item.price * item.quantity)}</strong></li>`
          )).join('');
        } else {
          summaryItemsElement.hidden = true;
          summaryItemsElement.innerHTML = '';
          emptySummaryElement.hidden = false;
        }
      }

      function showStep(step) {
        currentStep = step;
        document.querySelectorAll('[data-feed-step]').forEach((panel) => {
          panel.hidden = Number(panel.dataset.feedStep) !== step;
        });

        document.querySelectorAll('[data-progress-step]').forEach((progressItem) => {
          const progressStep = Number(progressItem.dataset.progressStep);
          progressItem.classList.toggle('is-active', progressStep === step);
          progressItem.classList.toggle('is-complete', progressStep < step);
        });

        feedForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      function validatePlace() {
        const validState = stateField.reportValidity();
        const validDistrict = districtField.reportValidity();
        if (!validState) stateField.focus();
        else if (!validDistrict) districtField.focus();
        return validState && validDistrict;
      }

      function validateItems() {
        const valid = getSelectedItems().length > 0;
        itemsError.classList.toggle('is-visible', !valid);
        if (!valid) itemCards[0]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return valid;
      }

      document.querySelectorAll('[data-feed-next]').forEach((button) => {
        button.addEventListener('click', () => {
          const nextStep = Number(button.dataset.feedNext);
          if (currentStep === 1 && !validatePlace()) return;
          if (currentStep === 2 && !validateItems()) return;
          updateSummary();
          showStep(nextStep);
        });
      });

      document.querySelectorAll('[data-feed-back]').forEach((button) => {
        button.addEventListener('click', () => showStep(Number(button.dataset.feedBack)));
      });

      itemCards.forEach((card) => {
        const output = card.querySelector('[data-qty-output]');
        card.querySelectorAll('[data-qty-change]').forEach((button) => {
          button.addEventListener('click', () => {
            const current = Number(output.value || output.textContent || 0);
            const next = Math.max(0, Math.min(10, current + Number(button.dataset.qtyChange)));
            output.value = next;
            output.textContent = next;
            card.classList.toggle('has-quantity', next > 0);
            itemsError.classList.remove('is-visible');
            updateSummary();
          });
        });
      });

      document.getElementById('addFeedBundle')?.addEventListener('click', () => {
        itemCards.forEach((card) => {
          const output = card.querySelector('[data-qty-output]');
          output.value = 1;
          output.textContent = '1';
          card.classList.add('has-quantity');
        });
        itemsError.classList.remove('is-visible');
        updateSummary();
      });

      document.getElementById('clearFeedItems')?.addEventListener('click', () => {
        itemCards.forEach((card) => {
          const output = card.querySelector('[data-qty-output]');
          output.value = 0;
          output.textContent = '0';
          card.classList.remove('has-quantity');
        });
        updateSummary();
      });

      [stateField, districtField, localityField].forEach((field) => {
        field.addEventListener('input', updateSummary);
        field.addEventListener('change', updateSummary);
      });

      locationButton.addEventListener('click', () => {
        if (!navigator.geolocation) {
          locationStatus.textContent = 'Location is not available in this browser. Choose the state and district above.';
          locationStatus.className = 'location-status is-error';
          return;
        }

        locationButton.disabled = true;
        locationStatus.textContent = 'Finding your location...';
        locationStatus.className = 'location-status';

        navigator.geolocation.getCurrentPosition((position) => {
          latitudeField.value = position.coords.latitude.toFixed(6);
          longitudeField.value = position.coords.longitude.toFixed(6);
          locationStatus.textContent = 'Location captured. Check the state and district above are right.';
          locationStatus.className = 'location-status is-success';
          locationButton.textContent = 'Location captured';
          locationButton.disabled = false;
        }, () => {
          locationStatus.textContent = 'We could not read your location. Choose the state and district above.';
          locationStatus.className = 'location-status is-error';
          locationButton.disabled = false;
        }, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000
        });
      });

      function createIdempotencyKey() {
        if (window.crypto?.randomUUID) return window.crypto.randomUUID();
        return `pfa-send-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      }

      feedForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (paymentSubmitting) return;

        if (!validatePlace()) {
          showStep(1);
          return;
        }
        if (!validateItems()) {
          showStep(2);
          return;
        }

        const nameField = document.getElementById('feedName');
        const mobileField = document.getElementById('feedMobile');
        const emailField = document.getElementById('feedEmail');
        const termsField = document.getElementById('feedTerms');
        const fieldsValid = nameField.reportValidity() && mobileField.reportValidity() && emailField.reportValidity() && termsField.reportValidity();
        if (!fieldsValid) return;

        const selectedItems = getSelectedItems();
        paymentSubmitting = true;
        submitButton.disabled = true;
        submitButton.setAttribute('aria-busy', 'true');
        submitButton.textContent = 'Opening secure payment...';
        const clientRef = createIdempotencyKey();
        const payload = {
          type: 'send',
          client_ref: clientRef,
          name: nameField.value,
          mobile: mobileField.value,
          email: emailField.value,
          state: stateField.value,
          district: districtField.value,
          locality: localityField.value,
          latitude: latitudeField.value,
          longitude: longitudeField.value,
          items: selectedItems.map((item) => ({ key: item.name, quantity: item.quantity })),
          terms: 'yes'
        };

        try {
          const response = await fetch('/api/payment/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Idempotency-Key': clientRef },
            body: JSON.stringify(payload)
          });
          const html = await response.text();
          if (!html) throw new Error('The secure payment service returned an empty response.');
          document.open();
          document.write(html);
          document.close();
        } catch (error) {
          paymentSubmitting = false;
          submitButton.disabled = false;
          submitButton.removeAttribute('aria-busy');
          updateSummary();
          locationStatus.textContent = error.message || 'Payment could not be started. Please try again.';
          locationStatus.className = 'location-status is-error';
        }
      });

      updateSummary();
    })();

