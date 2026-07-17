/* PFA shared form helpers
   -------------------------------------------------------------------
   Indian mobile numbers, handled once, the same way on every page.

   Before this, five pages each did it differently: two normalised
   properly, two ran the right regex against un-normalised input so
   "+91 81052 50299" was rejected, and the store checkout tested
   /^\d{10}$/ which accepts 0000000000 as a delivery number.

   The rule: a mobile number in India is ten digits and begins 6, 7, 8
   or 9. It may reach us as +91XXXXXXXXXX, 0XXXXXXXXXX, 91XXXXXXXXXX,
   or with spaces and hyphens anywhere. All of those are the same
   number and all of them are accepted. Anything else is not.
*/
(function () {
  "use strict";

  /* Strip everything that is not a digit, then peel off the country
     or trunk prefix if one is present. Returns the bare subscriber
     number, which may still be invalid - validate separately. */
  function normPhone(raw) {
    var d = String(raw == null ? "" : raw).replace(/\D/g, "");
    if (d.length === 13 && d.indexOf("091") === 0) d = d.slice(3);
    else if (d.length === 12 && d.indexOf("91") === 0) d = d.slice(2);
    else if (d.length === 11 && d.charAt(0) === "0") d = d.slice(1);
    return d;
  }

  function validPhone(raw) {
    return /^[6-9][0-9]{9}$/.test(normPhone(raw));
  }

  /* Display form. India groups a mobile 5-5. */
  function formatPhone(raw) {
    var d = normPhone(raw);
    if (!/^[6-9][0-9]{9}$/.test(d)) return String(raw == null ? "" : raw);
    return d.slice(0, 5) + " " + d.slice(5);
  }

  /* Wire an input: permit only plausible characters while typing, then
     tidy to the display form on blur. Never blocks a valid paste.
     Also fits a +91 prefix, so the field says which country it wants. */
  function bindPhone(el) {
    if (!el || el.__pfaPhone) return;
    el.__pfaPhone = 1;
    el.setAttribute("inputmode", "tel");
    el.setAttribute("autocomplete", "tel");
    /* The +91 chip beside the field carries the country code, so the input
       itself never needs to hold more than ten digits plus the 5-5 space.
       An 18-char allowance let 14-digit numbers sit in the field looking
       accepted until submit rejected them. */
    el.setAttribute("maxlength", "11");
    if (/10-digit/.test(el.getAttribute("placeholder") || "")) {
      el.setAttribute("placeholder", "81052 50299");
    }

    injectCss();
    if (el.parentNode && !el.parentNode.classList.contains("pfa-tel")) {
      var wrap = document.createElement("span");
      wrap.className = "pfa-tel";
      el.parentNode.insertBefore(wrap, el);
      var cc = document.createElement("span");
      cc.className = "pfa-tel-cc";
      cc.textContent = "+91";
      cc.setAttribute("aria-hidden", "true");
      wrap.appendChild(cc);
      wrap.appendChild(el);
    }

    el.addEventListener("input", function () {
      var raw = el.value, d = raw.replace(/\D/g, "");
      /* Peel a pasted country or trunk prefix, but only once the string is
         longer than a subscriber number - so a real number beginning 91
         (9198765432) is never truncated. */
      if (d.length > 10) {
        if (d.indexOf("91") === 0) d = d.slice(2);
        else if (d.charAt(0) === "0") d = d.slice(1);
      }
      d = d.slice(0, 10);
      var out = d.length > 5 ? d.slice(0, 5) + " " + d.slice(5) : d;
      if (out !== raw) {
        var atEnd = el.selectionStart === raw.length;
        el.value = out;
        if (atEnd) { try { el.setSelectionRange(out.length, out.length); } catch (e) {} }
      }
    });
    el.addEventListener("blur", function () {
      if (el.value.trim() && validPhone(el.value)) el.value = formatPhone(el.value);
    });
  }

  var cssDone = false;
  function injectCss() {
    if (cssDone) return;
    cssDone = true;
    var st = document.createElement("style");
    st.textContent = [
      ".fgroup.seq-locked{opacity:.42;transition:opacity .25s ease}",
      ".fgroup.seq-locked input,.fgroup.seq-locked select,",
        ".fgroup.seq-locked textarea{cursor:not-allowed}",
      ".pfa-tel{display:flex;align-items:stretch;width:100%}",
      ".pfa-tel-cc{display:flex;align-items:center;padding:0 12px;flex:none;",
        "font-family:var(--font-s,inherit);font-size:13px;letter-spacing:.06em;",
        "color:var(--mut-2,#7A848D);background:var(--porcelain,#F4F6F7);",
        "border:1px solid var(--hair,rgba(14,17,22,.14));border-right:0;border-radius:0;",
        "user-select:none}",
      ".pfa-tel input{flex:1;min-width:0;border-radius:0!important}",
      ".fgroup.invalid .pfa-tel-cc{border-color:var(--bad,#c0392b)}"
    ].join("");
    document.head.appendChild(st);
  }

  function bindAll(root) {
    var scope = root || document;
    var els = scope.querySelectorAll('input[type="tel"][data-phone], input[data-phone]');
    Array.prototype.forEach.call(els, bindPhone);
  }


  /* Sequential fill.
     Each field unlocks only when every REQUIRED field before it is validly
     filled. Optional fields never block the chain.

     Deliberately does NOT use the disabled attribute. A disabled input is
     skipped by browser autofill, removed from the tab order, and invisible to
     screen readers - and on a payment or Aadhaar step that costs more than the
     guidance is worth. Instead the field stays focusable and autofillable, is
     dimmed, is announced as aria-disabled, and bounces focus back to the first
     field that still needs an answer. Autofill therefore still populates the
     whole form in one action, and the chain re-evaluates and opens. */
  function sequence(chain) {
    function firstOpen() {
      for (var i = 0; i < chain.length; i++) {
        if (!chain[i].optional && !chain[i].ok()) return i;
      }
      return chain.length;
    }
    function apply() {
      var edge = firstOpen();
      chain.forEach(function (f, i) {
        var locked = i > edge;
        var g = f.el.closest ? f.el.closest('.fgroup') : null;
        if (g) g.classList.toggle('seq-locked', locked);
        if (locked) f.el.setAttribute('aria-disabled', 'true');
        else f.el.removeAttribute('aria-disabled');
        f._locked = locked;
      });
    }
    chain.forEach(function (f, i) {
      ['input', 'change', 'blur'].forEach(function (ev) {
        f.el.addEventListener(ev, apply);
      });
      f.el.addEventListener('focus', function () {
        if (!f._locked) return;
        var edge = firstOpen();
        var target = chain[Math.min(edge, chain.length - 1)];
        if (target && target.el !== f.el) { try { target.el.focus(); } catch (e) {} }
      });
    });
    apply();
    return apply;
  }

  window.PFAForm = {
    normPhone: normPhone,
    validPhone: validPhone,
    formatPhone: formatPhone,
    bindPhone: bindPhone,
    bindAll: bindAll,
    sequence: sequence
  };

  /* Forms that are built on demand - the store's checkout, for instance -
     do not exist at load. Watch for them instead of asking every caller to
     remember to re-bind. */
  function watch() {
    if (!window.MutationObserver) return;
    new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var added = records[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          if (n.nodeType !== 1) continue;
          if (n.matches && n.matches("input[data-phone]")) bindPhone(n);
          else if (n.querySelectorAll) bindAll(n);
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  function start() { bindAll(); watch(); }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
