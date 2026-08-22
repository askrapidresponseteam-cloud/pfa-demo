(function () {
  'use strict';

  var CORE_PAGES = [
    ['People for Animals', 'Hospitals, rescue teams, legal action, learning, adoption and animal welfare work across India.', 'index.html', 'PFA'],
    ['Hospitals and PFA Units', 'Find veterinary hospitals, rescue centres, units, contacts and local animal help across India.', 'network.html', 'Hospitals'],
    ['Animal Stories', 'Real animals, recoveries, people and field stories from People for Animals.', 'stories.html', 'Stories'],
    ['The Wire', 'Verified public records of animal welfare cases, action taken and what changed.', 'dispatch.html', 'The Wire'],
    ['Learning Center', 'Practical animal first aid, pain, behaviour, emergency, legal and care guidance.', 'learning-center.html', 'Learning'],
    ['Adopt an Animal', 'Meet dogs, cats and other animals looking for safe, permanent homes.', 'adopt.html', 'Adoption'],
    ['The PFA Store', 'Vegetarian pet food, pharmacy, supplements, grooming, toys and pet accessories.', 'store.html', 'Store'],
    ['Become a Patron', 'PFA membership, digital Patron card and member benefits for ₹365 a year.', 'membership.html', 'Membership'],
    ['Get Involved', 'Volunteer, work, campaign and contribute time or skills to People for Animals.', 'get-involved.html', 'Get involved'],
    ['Colony Animal Caretaker Card', 'Official identification for people who feed community animals. Free digital card issued instantly, printed card posted for Rs 100 shipping.', 'caretaker.html', 'Caretaker Card'],
    ['Give', 'Support People for Animals and its animal welfare work across India.', 'give.html', 'Support'],
    ['The Founder', 'Maneka Sanjay Gandhi and the founding vision of People for Animals.', 'founder.html', 'About PFA'],
    ['CineKind Awards', 'Films and filmmakers recognised for choosing kindness towards animals.', 'cinekind.html', 'CineKind'],
    ['Wildlife Gauntlet', 'Wildlife champions, conservation and the hall of fame.', 'champion.html', 'Wildlife'],
    ['Corporate Partnerships', 'CSR and corporate partnerships with People for Animals.', 'csr.html', 'Corporate'],
    ['Trusted Services', 'Animal welfare services and practical support from PFA.', 'services.html', 'Services']
  ];

  var SYNONYMS = {
    vet: ['veterinary', 'hospital', 'clinic'], veterinary: ['vet', 'hospital', 'clinic'],
    hospital: ['clinic', 'vet', 'veterinary'], clinic: ['hospital', 'vet'],
    rescue: ['emergency', 'injured', 'help', 'sos'], emergency: ['rescue', 'urgent', 'injured'],
    hurt: ['injured', 'wound'], wounded: ['injured', 'wound'],
    adopt: ['adoption', 'rehoming'], adoption: ['adopt', 'rehoming'],
    donate: ['donation', 'give', 'support'], donation: ['donate', 'give'],
    dog: ['dogs', 'canine', 'puppy', 'pup'], dogs: ['dog', 'canine', 'puppy'],
    cat: ['cats', 'feline', 'kitten'], cats: ['cat', 'feline', 'kitten'],
    food: ['nutrition', 'feed', 'diet'], vegetarian: ['veg', 'vegan', 'plant'],
    treat: ['treats', 'snack', 'biscuit'], treats: ['treat', 'snacks', 'biscuits'],
    medicine: ['medicines', 'meds', 'pharmacy', 'treatment'],
    medicines: ['medicine', 'meds', 'pharmacy'], tick: ['ticks', 'flea', 'fleas'],
    flea: ['fleas', 'tick', 'ticks'], worm: ['worms', 'dewormer', 'deworming'],
    itch: ['itching', 'skin', 'rash'], joint: ['joints', 'mobility', 'arthritis'],
    liver: ['hepatic'], kidney: ['renal'], stomach: ['gastric', 'digestive'],
    learn: ['learning', 'guide', 'education'], law: ['legal', 'rights', 'act'],
    volunteer: ['volunteering', 'join', 'help'], member: ['membership', 'patron']
  };

  var STOP = { a: 1, an: 1, and: 1, are: 1, at: 1, by: 1, for: 1, from: 1, in: 1, is: 1, it: 1, of: 1, on: 1, or: 1, the: 1, to: 1, with: 1 };
  var records = [];
  var activeIndex = -1;
  var queryTimer = null;

  function normalize(value) {
    return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9₹%]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function words(value) {
    return normalize(value).split(' ').filter(Boolean);
  }

  function unique(values) {
    return values.filter(function (value, index) { return values.indexOf(value) === index; });
  }

  function escapeHTML(value) {
    return String(value || '').replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character];
    });
  }

  function safeURL(value) {
    try {
      var url = new URL(String(value || ''), window.location.href);
      return url.origin === window.location.origin || /^(?:https?:)?\/\/cdn\.shopify\.com$/i.test(url.origin) ? url.href : '';
    } catch (_) {
      return '';
    }
  }

  function editDistance(left, right) {
    if (left === right) return 0;
    if (Math.abs(left.length - right.length) > 2) return 3;
    var row = [], i, j, diagonal, above, minimum;
    for (j = 0; j <= right.length; j += 1) row[j] = j;
    for (i = 1; i <= left.length; i += 1) {
      diagonal = row[0]; row[0] = i; minimum = row[0];
      for (j = 1; j <= right.length; j += 1) {
        above = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
        diagonal = above; minimum = Math.min(minimum, row[j]);
      }
      if (minimum > 2) return 3;
    }
    return row[right.length];
  }

  function fuzzy(term, tokenList) {
    if (term.length < 4) return false;
    var allowed = term.length >= 8 ? 2 : 1;
    for (var i = 0; i < tokenList.length; i += 1) {
      var token = tokenList[i];
      if (Math.abs(token.length - term.length) <= allowed && editDistance(term, token) <= allowed) return true;
    }
    return false;
  }

  function addRecord(record) {
    if (!record || !record.title || !record.url) return;
    var haystack = normalize([record.title, record.title, record.description, record.category, record.sku].join(' '));
    var key = normalize(record.title) + '|' + record.url;
    if (records.some(function (item) { return item.key === key; })) return;
    record.key = key;
    record.haystack = haystack;
    record.tokens = unique(words(haystack));
    records.push(record);
  }

  function addRuntimeData() {
    var roots = [window.PFA_DATA, window.PFAData, window.pfaData, window.SITE_DATA].filter(function (value) { return value && typeof value === 'object'; });
    var seen = [];
    function visit(value, path) {
      if (!value || typeof value !== 'object' || seen.indexOf(value) > -1) return;
      seen.push(value);
      if (Array.isArray(value)) { value.forEach(function (item) { visit(item, path); }); return; }
      var title = String(value.title || value.name || value.productName || value.heading || '').trim();
      var description = String(value.description || value.summary || value.excerpt || value.subtitle || '').trim();
      var rawURL = value.url || value.href || value.link || value.page || value.path;
      if (title && rawURL) addRecord({
        title: title,
        description: description || Object.keys(value).filter(function (key) { return typeof value[key] === 'string'; }).map(function (key) { return value[key]; }).join(' ').slice(0, 360),
        url: safeURL(rawURL),
        category: path || 'PFA',
        kind: /product|store|shop|food|pharmacy/i.test(path) ? 'product' : 'page',
        image: safeURL(value.image || value.imageUrl || value.photo || ''),
        price: value.price || '',
        sku: value.sku || value.id || ''
      });
      Object.keys(value).forEach(function (key) { if (value[key] && typeof value[key] === 'object') visit(value[key], path ? path + ' ' + key : key); });
    }
    roots.forEach(function (root) { visit(root, 'PFA'); });
  }

  function buildIndex() {
    records = [];
    CORE_PAGES.forEach(function (page) {
      addRecord({ title: page[0], description: page[1], url: safeURL(page[2]), category: page[3], kind: 'page' });
    });
    (window.PFA_PRODUCT_SEARCH_INDEX || []).forEach(function (product) {
      addRecord({
        title: product.n,
        description: product.d,
        url: safeURL(product.u),
        category: product.c || 'Store',
        kind: 'product',
        image: safeURL(product.i),
        price: product.p,
        availability: product.a,
        sku: product.s
      });
    });
    addRuntimeData();
  }

  function queryTerms(query) {
    var base = unique(words(query).filter(function (term) { return !STOP[term]; }));
    if (!base.length) base = unique(words(query));
    return base.map(function (term) { return { term: term, related: unique([term].concat(SYNONYMS[term] || [])) }; });
  }

  function scoreRecord(record, query, terms) {
    var title = normalize(record.title), description = normalize(record.description), category = normalize(record.category), phrase = normalize(query);
    var titleTokens = words(title), categoryTokens = words(category);
    var score = 0, hits = 0;
    if (title === phrase) score += 180;
    else if (title.indexOf(phrase) > -1) score += 90;
    if (description.indexOf(phrase) > -1) score += 35;
    terms.forEach(function (entry) {
      var matched = false;
      entry.related.forEach(function (term, relatedIndex) {
        var multiplier = relatedIndex === 0 ? 1 : 0.48;
        if (record.tokens.indexOf(term) > -1) { score += 28 * multiplier; matched = true; }
        if (titleTokens.indexOf(term) > -1) { score += 42 * multiplier; matched = true; }
        else if (term.length >= 3 && titleTokens.some(function (token) { return token.indexOf(term) === 0; })) { score += 18 * multiplier; matched = true; }
        if (categoryTokens.indexOf(term) > -1) { score += 15 * multiplier; matched = true; }
      });
      if (!matched && fuzzy(entry.term, record.tokens)) { score += 13; matched = true; }
      if (matched) hits += 1;
    });
    if (!hits) return 0;
    if (hits === terms.length) score += 30 + terms.length * 6;
    else score += (hits / terms.length) * 8;
    if (record.kind === 'product' && /store|shop|buy|product|food|medicine|pharmacy/i.test(query)) score += 12;
    if (record.availability === 'out') score -= 6;
    return score;
  }

  function search(query) {
    var terms = queryTerms(query);
    if (!terms.length) return [];
    return records.map(function (record) { return { record: record, score: scoreRecord(record, query, terms) }; })
      .filter(function (item) { return item.score > 0; })
      .sort(function (left, right) { return right.score - left.score || left.record.title.localeCompare(right.record.title); });
  }

  function highlight(value, query) {
    var output = escapeHTML(value);
    queryTerms(query).forEach(function (entry) {
      var safe = entry.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      output = output.replace(new RegExp('(^|[^a-z0-9])(' + safe + ')(?=$|[^a-z0-9])', 'ig'), '$1<mark>$2</mark>');
    });
    return output;
  }

  function money(value) {
    var number = Number(value);
    return Number.isFinite(number) && number > 0 ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(number) : '';
  }

  function resultHTML(item, query) {
    var record = item.record;
    var media = record.kind === 'product' && record.image ? '<span class="pfa-gs-image"><img src="' + escapeHTML(record.image) + '" alt="" loading="lazy" decoding="async"></span>' : '<span class="pfa-gs-page-icon" aria-hidden="true">↗</span>';
    var price = money(record.price);
    var meta = escapeHTML(record.kind === 'product' ? record.category : 'PFA · ' + record.category) + (price ? ' · ' + escapeHTML(price) : '');
    return '<a class="pfa-gs-result" href="' + escapeHTML(record.url) + '">' + media + '<span class="pfa-gs-copy"><small>' + meta + '</small><strong>' + highlight(record.title, query) + '</strong><span>' + highlight(record.description || 'Open this page on PFA.', query) + '</span></span></a>';
  }

  var DIRECTORY = [
    ['Help', 'Hospitals & Rescue', 'Find a PFA hospital, unit or local help.', 'network.html'],
    ['Explore', 'Stories', 'Rescue, recovery and the people behind the work.', 'stories.html'],
    ['Public record', 'The Wire', 'Verified public animal welfare records.', 'dispatch.html'],
    ['Learn', 'Learning Center', 'Emergency guidance and animal care.', 'learning-center.html'],
    ['Act', 'Adopt', 'Meet animals ready for a safe home.', 'adopt.html'],
    ['Shop', 'The PFA Store', 'Useful purchases that support the work.', 'store.html'],
    ['Membership', 'Become a Patron', 'Join PFA for one rupee a day.', 'membership.html'],
    ['Volunteer', 'Get involved', 'Give time, skill or practical support.', 'get-involved.html']
  ];
  function emptyHTML() {
    return '<nav class="pfa-gs-dir" aria-label="PFA destinations">' + DIRECTORY.map(function (x) {
      return '<a class="pfa-gs-diritem" href="' + escapeHTML(x[3]) + '"><small>' + escapeHTML(x[0]) + '</small><span class="pfa-gs-dircopy"><strong>' + escapeHTML(x[1]) + '</strong><span>' + escapeHTML(x[2]) + '</span></span><em aria-hidden="true">\u2197</em></a>';
    }).join('') + '</nav>';
  }

  function render(box, query) {
    var clean = String(query || '').trim();
    activeIndex = -1;
    if (!clean) { box.innerHTML = emptyHTML(); return; }
    var ranked = search(clean);
    var products = ranked.filter(function (item) { return item.record.kind === 'product'; }).slice(0, 8);
    var pages = ranked.filter(function (item) { return item.record.kind !== 'product'; }).slice(0, 4);
    if (!products.length && !pages.length) {
      box.innerHTML = '<div class="pfa-gs-none"><strong>No clear match for “' + escapeHTML(clean) + '”.</strong><span>Try fewer words, another spelling, a product brand or what you need help with.</span><a href="search.html?q=' + encodeURIComponent(clean) + '">Search the complete PFA website</a></div>';
      return;
    }
    var html = '<p class="pfa-gs-summary">Best matches across PFA</p>';
    if (products.length) html += '<section class="pfa-gs-section"><h3>Store products <span>' + products.length + '</span></h3>' + products.map(function (item) { return resultHTML(item, clean); }).join('') + '</section>';
    if (pages.length) html += '<section class="pfa-gs-section"><h3>Pages and help</h3>' + pages.map(function (item) { return resultHTML(item, clean); }).join('') + '</section>';
    html += '<a class="pfa-gs-all" href="search.html?q=' + encodeURIComponent(clean) + '">See all results for “' + escapeHTML(clean) + '” <span>→</span></a>';
    box.innerHTML = html;
  }

  function addStyles() {
    if (document.getElementById('pfaGlobalSearchStyles')) return;
    var style = document.createElement('style');
    style.id = 'pfaGlobalSearchStyles';
    style.textContent = '.search-shell{overflow:auto;max-height:min(780px,calc(100dvh - 32px))}.pfa-gs-summary{margin:16px 0 7px;color:#6b675f;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.pfa-gs-section{padding:7px 0 12px}.pfa-gs-section h3{display:flex;align-items:center;justify-content:space-between;margin:0;padding:10px 0;border-bottom:1px solid #dedbd3;color:#111;font-size:13px;letter-spacing:.04em;text-transform:uppercase}.pfa-gs-section h3 span{color:#777;font-size:12px}.pfa-gs-result{display:grid;grid-template-columns:58px minmax(0,1fr);gap:14px;align-items:center;padding:13px 0;border-bottom:1px solid #e8e5de;color:#111;text-decoration:none}.pfa-gs-result:hover strong,.pfa-gs-result:focus-visible strong{text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:3px}.pfa-gs-result:focus-visible{outline:3px solid #f2c94c;outline-offset:3px}.pfa-gs-image,.pfa-gs-page-icon{display:grid;width:58px;height:58px;place-items:center;border:1px solid #dedbd3;background:#fff}.pfa-gs-image img{width:100%;height:100%;object-fit:contain}.pfa-gs-page-icon{background:#f6f4ef;font-size:20px}.pfa-gs-copy{display:block;min-width:0}.pfa-gs-copy small{display:block;margin-bottom:3px;color:#397148;font-size:11px;font-weight:800;text-transform:uppercase}.pfa-gs-copy strong{display:block;margin-bottom:4px;overflow:hidden;color:#111;font-size:16px;line-height:1.28;text-overflow:ellipsis;white-space:nowrap}.pfa-gs-copy>span{display:-webkit-box;overflow:hidden;color:#625f59;font-size:13px;line-height:1.42;-webkit-box-orient:vertical;-webkit-line-clamp:2}.pfa-gs-copy mark{padding:0 .08em;background:rgba(242,201,76,.5);color:inherit}.pfa-gs-all{display:flex;align-items:center;justify-content:space-between;margin-top:5px;padding:15px 0;color:#111;font-size:14px;font-weight:800;text-decoration:none}.pfa-gs-all:hover{text-decoration:underline}.pfa-gs-start,.pfa-gs-none{padding:24px 0;color:#625f59}.pfa-gs-start p,.pfa-gs-none strong,.pfa-gs-none span{display:block;margin:0 0 13px}.pfa-gs-start>div{display:flex;flex-wrap:wrap;gap:8px}.pfa-gs-start button{padding:8px 12px;border:1px solid #dedbd3;border-radius:999px;background:#fff;color:#111;font:inherit;font-size:13px;cursor:pointer}.pfa-gs-start button:hover{border-color:#111;background:#f6f4ef}.pfa-gs-none a{display:inline-block;color:#111;font-weight:800}.pfa-gs-dir{display:block}.pfa-gs-diritem{display:grid;grid-template-columns:104px minmax(0,1fr) auto;gap:16px;align-items:center;padding:9px 0;border-bottom:1px solid #e8e5de;color:#111;text-decoration:none}.pfa-gs-diritem:hover strong,.pfa-gs-diritem:focus-visible strong{text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:3px}.pfa-gs-diritem:focus-visible{outline:3px solid #f2c94c;outline-offset:3px}.pfa-gs-diritem>small{color:#0653ee;font-size:9px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}.pfa-gs-dircopy{display:block;min-width:0}.pfa-gs-dircopy strong{display:block;font-size:clamp(16px,1.7vw,18px);line-height:1.15;color:#111}.pfa-gs-dircopy>span{display:block;margin-top:2px;overflow:hidden;color:#64707a;font-size:13px;line-height:1.35;text-overflow:ellipsis;white-space:nowrap}.pfa-gs-diritem>em{font-style:normal;font-size:19px;color:#0e1116}@media(max-width:560px){.pfa-gs-diritem{grid-template-columns:80px minmax(0,1fr) auto;gap:12px;padding:8px 0}.pfa-gs-dircopy>span{display:none}}@media(max-height:640px){.pfa-gs-diritem{padding:7px 0}.pfa-gs-dircopy>span{display:none}}@media(max-width:600px){.pfa-gs-result{grid-template-columns:50px minmax(0,1fr);gap:11px}.pfa-gs-image,.pfa-gs-page-icon{width:50px;height:50px}.pfa-gs-copy strong{font-size:15px}.pfa-gs-copy>span{-webkit-line-clamp:1}}';
    document.head.appendChild(style);
  }

  function wire() {
    var input = document.getElementById('globalSearch');
    var box = document.getElementById('globalSearchResults');
    if (!input || !box) return;
    addStyles(); buildIndex(); render(box, '');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('aria-controls', 'globalSearchResults');

    input.addEventListener('input', function (event) {
      event.stopImmediatePropagation();
      clearTimeout(queryTimer);
      queryTimer = setTimeout(function () { render(box, input.value); }, 65);
    }, true);
    input.addEventListener('keydown', function (event) {
      var hits = box.querySelectorAll('.pfa-gs-result');
      if (event.key === 'ArrowDown' && hits.length) { event.preventDefault(); activeIndex = (activeIndex + 1) % hits.length; hits[activeIndex].focus(); }
      if (event.key === 'Enter' && input.value.trim() && !hits.length) { window.location.href = 'search.html?q=' + encodeURIComponent(input.value.trim()); }
    }, true);
    box.addEventListener('click', function (event) {
      var suggestion = event.target.closest('[data-pfa-search]');
      if (!suggestion) return;
      input.value = suggestion.getAttribute('data-pfa-search'); render(box, input.value); input.focus();
    });
    document.querySelectorAll('[data-search-open]').forEach(function (button) {
      button.addEventListener('click', function () { setTimeout(function () { buildIndex(); render(box, input.value); }, 20); });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire, { once: true });
  else wire();
  window.PFAGlobalSearch = { rebuild: buildIndex, search: search };
}());
