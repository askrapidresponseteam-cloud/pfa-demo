/* People for Animals — site search.
   ------------------------------------------------------------------------
   One script, four jobs:
   1. INDEX: every page, section, action, law and product a visitor can reach.
      Curated rows live below; a crawled index (search-index.json, built by
      build-index.js) is merged on top when present, so new pages become
      searchable without touching this file.
   2. ENGINE: field-weighted, IDF-scaled ranking with stemming, stop words,
      synonyms, prefix matching, typo tolerance (edit distance via trigram
      candidates), phrase bonuses, coverage bonuses and "did you mean".
   3. OVERLAY: the "What would you like to do today?" layer, with live
      results, query completions, recent searches and full keyboard control.
   4. RESULTS PAGE: search.html, with section facets, counts and in-place
      re-ranking. Fires `pfa:search` / `pfa:search-click` events for analytics.
   Include with: <link rel="stylesheet" href="pfa-search.css">
                 <script src="pfa-search.js" defer></script>
   ------------------------------------------------------------------------ */
(function () {
  'use strict';

  /* ================================================================ INDEX */
  /* t title · s section · y type (action|place|law|page|product|article)
     u url · d description · k keywords · p price (products only)            */
  var CURATED = [
    /* ---- Do something ---- */
    { t: 'Report cruelty', s: 'Do something', y: 'action', u: 'report.html',
      d: 'Tell PFA about an animal being hurt, neglected or abandoned. A named person picks it up, you get a reference, and you can follow it.',
      k: 'report abuse beaten beating hurt neglect abandoned injured emergency rescue complaint cruelty animal dog cat cow street stray poisoning police' },
    { t: 'Careers: Zonal Head', s: 'Do something', y: 'action', u: 'careers.html',
      d: 'PFA is hiring Zonal Heads for its nine Zones: field-based coordinators for the Unit network. Two years, \u20b935,000 a month plus travel. Apply in two minutes.',
      k: 'careers jobs job work hiring vacancy vacancies openings zonal head zone coordinator employment recruit apply position salary' },
    { t: 'Ask us anything', s: 'Do something', y: 'action', u: 'ask.html',
      d: 'A question about an animal, a law, a unit, adoption or anything else. A named person answers, and you get a reference.',
      k: 'ask question help contact email call talk someone query enquiry inquiry doubt advice support helpline' },
    { t: 'Who to report cruelty to, and which sections', s: 'Laws', y: 'law', u: 'laws.html#a33',
      d: 'Filing with the police yourself: BNS 325 with PCA s.11, why it is cognizable, and what to do if the FIR is refused.',
      k: 'report cruelty police fir section 325 cognizable refuse superintendent magistrate complaint' },
    { t: 'What a good complaint should contain', s: 'Do something', y: 'action', u: 'laws.html#d49',
      d: 'The facts, sections and evidence to put in a cruelty complaint so it cannot be brushed aside.',
      k: 'complaint write draft file fir police letter evidence sections report' },
    { t: 'Police refuse to register an FIR', s: 'Do something', y: 'action', u: 'laws.html#b48',
      d: 'What to do when a station will not take your complaint: BNSS Section 173(4) and 175(3).',
      k: 'fir refuse refused police station magistrate bnss 173 175 complaint' },
    { t: 'Apply for a colony caregiver card', s: 'Do something', y: 'action', u: 'get-involved.html#caregiver',
      d: 'The application: about you, your colony, a \u20b950 fee, and a named person at PFA decides. You get an application number the moment the fee clears.',
      k: 'colony caregiver card apply id identity feeder feeding community dogs colony caregiver application register form abc rules rwa' },
    { t: 'Is feeding community dogs legal? Caregiver rights', s: 'Laws', y: 'law', u: 'laws.html#a10',
      d: 'Feeding community dogs is lawful under the ABC Rules 2023. What the law says about caregivers, and the RWA rules.',
      k: 'feeding community dogs legal lawful abc rules 2023 rwa caregiver rights society stop feeding' },
    { t: 'Can my RWA ban pets or feeding?', s: 'Do something', y: 'action', u: 'laws.html#a11',
      d: 'No. What the ABC Rules 2023 and the courts say about societies that try to stop feeding or keeping pets.',
      k: 'rwa society apartment ban pets feeding stray dogs colony resident welfare' },
    { t: 'Donate', s: 'Do something', y: 'action', u: 'donate.html',
      d: 'Fund a rescue outright, or buy food at cost for a shelter you choose. Tax-deductible.',
      k: 'donate donation give money support fund sponsor monthly 80g tax deductible pay' },
    { t: 'Send food to a shelter', s: 'Do something', y: 'action', u: 'donate.html#flowFood',
      d: 'Buy feed at cost for a shelter you pick by state and district, delivered in your name.',
      k: 'food feed shelter donate kibble bulk district village pin' },
    { t: 'Volunteer', s: 'Do something', y: 'action', u: 'index.html#programs',
      d: 'Give a few hours a week at a shelter, hospital or rescue unit near you.',
      k: 'volunteer volunteering help join work weekend internship student foster' },
    { t: 'Send a rescue story to The Wall', s: 'Do something', y: 'action', u: 'wall.html#submit',
      d: 'Submit a video of an animal you helped, long or short form.',
      k: 'submit send upload video story rescue wall reel instagram' },
    { t: 'Nominate someone for CineKind', s: 'Do something', y: 'action', u: 'cinekind.html#nominations',
      d: 'Put forward a film-maker or public figure whose work moved people towards animals.',
      k: 'nominate nomination cinekind award film' },

    /* ---- Places ---- */
    { t: 'Animal hospitals', s: 'Places', y: 'place', u: 'units.html',
      d: 'PFA hospitals, shelters, mobile clinics and rescue teams, city by city.',
      k: 'hospital hospitals clinic vet veterinary doctor treatment surgery sterilisation sterilization vaccination near me shelter unit units centre center location city' },
    { t: 'Events near you', s: 'Places', y: 'place', u: 'events.html',
      d: 'Adoption drives, vaccination camps, walks and talks, searchable by city.',
      k: 'events event camp drive walk talk calendar upcoming city venue date' },

    /* ---- Laws ---- */
    { t: 'Animal laws in India', s: 'Laws', y: 'law', u: 'laws.html',
      d: 'Answers on animal law in India, each citing the section it rests on: dogs, cattle, husbandry, and horses.',
      k: 'law laws legal rights act rules court police fir section ipc bns constitution pca questions' },
    { t: 'Laws: dogs', s: 'Laws', y: 'law', u: 'laws.html#part-a',
      d: 'Fifty questions on street dogs, pets, feeding, bites, RWAs and the ABC Rules.',
      k: 'law dog dogs street stray pet bite abc rules feeding' },
    { t: 'Laws: cows and cattle', s: 'Laws', y: 'law', u: 'laws.html#part-b',
      d: 'Fifty questions on cattle, dairies, transport, slaughter and seizure.',
      k: 'law cow cows cattle dairy gaushala transport slaughter seizure bull buffalo' },
    { t: 'Laws: animal husbandry', s: 'Laws', y: 'law', u: 'laws.html#part-c',
      d: 'Fifty questions on farms, poultry, feed, antibiotics and veterinary practice.',
      k: 'law farm poultry chicken hen feed antibiotics husbandry veterinary' },
    { t: 'Laws: horses and working equines', s: 'Laws', y: 'law', u: 'laws.html#part-d',
      d: 'Fifty questions on horses, donkeys, mules, tongas, weddings, racing and rescue.',
      k: 'law horse horses donkey mule equine tonga wedding racing branding' },

    /* ---- Shop ---- */
    { t: 'Shop', s: 'Shop', y: 'page', u: 'pfa-shop.html',
      d: 'Food, medicine and gear for the animal you adopted, at prices that fund rescue work.',
      k: 'shop store buy products catalogue food kibble medicine meds gear kit cart' },
    { t: 'New adopter kits', s: 'Shop', y: 'page', u: 'pfa-shop.html#kits',
      d: 'Everything a new dog or cat needs in one box.',
      k: 'kit kits starter adopter bundle new dog cat' },

    /* ---- Explore ---- */
    { t: 'Newsroom', s: 'Explore', y: 'article', u: 'newsroom.html',
      d: 'Cases, campaigns and what changed this week, with the record of how each one moved.',
      /* `wire` stays in the keywords on purpose: the section was called The
         Wire, and anyone who remembers that should still land here. */
      k: 'news dispatch dispatches wire updates blog stories press campaign latest cases record' },
    { t: 'The Wall', s: 'Explore', y: 'page', u: 'wall.html',
      d: 'Rescue videos sent in by people across the country, long form and short form.',
      k: 'wall gallery videos photos rescued animals reel' },
    { t: 'CineKind Awards', s: 'Explore', y: 'page', u: 'cinekind.html',
      d: 'The award for cinema that moves a country towards kindness, and its honourees.',
      k: 'cinekind film films movie cinema award awards honourees ceremony' },
    { t: 'What animals know, learn and remember', s: 'Explore', y: 'article', u: 'index.html#adopt',
      d: 'The research on hens, pigs, cows, goats, sheep and horses, from peer-reviewed studies.',
      k: 'science research cognition intelligence hen pig cow goat sheep horse chicken mind feelings sentience study' },
    { t: 'Test yourself: who would you underestimate?', s: 'Explore', y: 'page', u: 'index.html#quiz',
      d: 'A two-minute quiz on what farm animals can do.', k: 'quiz test game' },

    { t: 'Track a submission or an order', s: 'Do something', y: 'page', u: 'track.html',
      d: 'Follow a report, a question, an application or a shop order with the number you were given.',
      k: 'track follow status where is my order application reference number check progress complaint' },

    { t: 'The record: what PFA has changed', s: 'About', y: 'page', u: 'achievements.html',
      d: 'Thirty years of rules rewritten, orders obtained and practices ended, on eight fronts.',
      k: 'achievements record history impact wins what we have done milestones results track record' },

    /* ---- About ---- */
    { t: 'Founder: Maneka Sanjay Gandhi', s: 'About', y: 'page', u: 'founder.html',
      d: 'The person who started People for Animals, and what she set out to build.',
      k: 'founder maneka gandhi history started who' }
  ];

  var SECTIONS = ['Do something', 'Places', 'Laws', 'Shop', 'Explore', 'About'];
  var TYPE_BOOST = { action: 1.15, place: 1.1, law: 1.0, product: 1.0, page: 1.0, article: 0.95 };

  /* What visitors type → what the index says. */
  var SYNONYMS = {
    vet: 'hospital', veterinary: 'hospital', doctor: 'hospital', clinic: 'hospital', treatment: 'hospital',
    abuse: 'cruelty', abused: 'cruelty', beating: 'cruelty', beaten: 'cruelty', torture: 'cruelty',
    hurt: 'cruelty', hurting: 'cruelty', poison: 'cruelty', kicked: 'cruelty', violence: 'cruelty',
    stray: 'street', strays: 'street', puppies: 'puppy', kittens: 'kitten',
    id: 'card', identity: 'card', feeder: 'caregiver', feeding: 'caregiver',
    money: 'donate', give: 'donate', giving: 'donate', payment: 'donate', pay: 'donate', contribute: 'donate',
    legal: 'law', rights: 'law', act: 'law', police: 'fir', complaint: 'report', report: 'cruelty',
    location: 'units', locations: 'units', branch: 'units', branches: 'units',
    centre: 'units', center: 'units', centres: 'units', centers: 'units', office: 'contact',
    film: 'cinekind', films: 'cinekind', movie: 'cinekind', movies: 'cinekind',
    news: 'wire', update: 'wire', updates: 'wire',
    merch: 'shop', merchandise: 'shop', buy: 'shop', store: 'shop', products: 'shop', product: 'shop',
    kibble: 'food', treats: 'food', meds: 'medicine', medication: 'medicine', dewormer: 'medicine', leash: 'gear', collar: 'gear'
  };
  var STOP = /^(a|an|the|to|of|for|in|on|is|it|i|my|me|do|how|what|who|can|and|or|being|near|with|about|want|need|please|where|when|there|any|some|get|find|show|open|page|pfa)$/;

  /* Shown before anyone types. */
  var QUICK = ['Report cruelty', 'Ask us anything', 'Animal hospitals', 'Animal laws in India', 'Apply for a colony caregiver card', 'Shop', 'Donate'];
  /* Seed only. Real "most asked" comes from /api/search-popular; this is what
     shows on a cold start, offline, or on a build with no API behind it. */
  var CURATED_FALLBACK = ['Report cruelty', 'Animal hospitals', 'Apply for a colony caregiver card',
                          'Animal laws in India', 'Shop', 'Events near you', 'Donate'];

  /* ================================================================ TEXT */
  function stem(w) {
    if (w.length > 5 && /ing$/.test(w)) return w.slice(0, -3);
    if (w.length > 4 && /ies$/.test(w)) return w.slice(0, -3) + 'y';
    if (w.length > 4 && /es$/.test(w))  return w.slice(0, -2);
    if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
    return w;
  }
  function tokens(str) {
    return String(str).toLowerCase().replace(/[^a-z0-9()-]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ============================================================== ENGINE */
  var INDEX = [], VOCAB = {}, TRIGRAM = {}, DF = {}, N = 0;

  function trigrams(w) { var s = '  ' + w + ' ', out = []; for (var i = 0; i < s.length - 2; i++) out.push(s.substr(i, 3)); return out; }
  function editDistance(a, b) {          /* Damerau-Levenshtein */
    var m = a.length, n = b.length, d = [], i, j;
    for (i = 0; i <= m; i++) { d[i] = [i]; }
    for (j = 0; j <= n; j++) { d[0][j] = j; }
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) {
      var c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return d[m][n];
  }
  function build(rows) {
    INDEX = rows; VOCAB = {}; TRIGRAM = {}; DF = {}; N = rows.length;
    rows.forEach(function (row, id) {
      row.id = id;
      row.tt = tokens(row.t).map(stem);
      row.kt = tokens(row.k || '').map(stem);
      row.dt = tokens(row.d || '').map(stem);
      var seen = {};
      [row.tt, row.kt, row.dt].forEach(function (list) {
        list.forEach(function (w) {
          if (!seen[w]) { seen[w] = 1; DF[w] = (DF[w] || 0) + 1; }
          if (!VOCAB[w]) {
            VOCAB[w] = 1;
            trigrams(w).forEach(function (g) { (TRIGRAM[g] = TRIGRAM[g] || []).push(w); });
          }
        });
      });
    });
  }
  function idf(w) { return Math.log(1 + N / (1 + (DF[w] || 0))); }

  /* Closest vocabulary word for a typo, or null. */
  function correct(w) {
    if (VOCAB[w] || w.length < 3) return null;
    var maxD = w.length >= 6 ? 2 : 1, counts = {};
    trigrams(w).forEach(function (g) { (TRIGRAM[g] || []).forEach(function (c) { counts[c] = (counts[c] || 0) + 1; }); });
    var best = null, bestD = 99, bestDf = 0;
    Object.keys(counts).forEach(function (c) {
      if (counts[c] < 2 || Math.abs(c.length - w.length) > maxD) return;
      var d = editDistance(w, c);
      if (d <= maxD && (d < bestD || (d === bestD && (DF[c] || 0) > bestDf))) { best = c; bestD = d; bestDf = DF[c] || 0; }
    });
    return best;
  }

  /* "reportcruelty", "dogfood": two known words typed as one. */
  function split(w) {
    if (VOCAB[w] || w.length < 6) return null;
    for (var i = 3; i <= w.length - 3; i++) {
      var a = w.slice(0, i), b = w.slice(i);
      if ((VOCAB[a] || VOCAB[stem(a)]) && (VOCAB[b] || VOCAB[stem(b)])) return [a, b];
    }
    return null;
  }

  /* Character-level similarity, 0..1, for the last resort. */
  function similarity(a, b) {
    var ga = trigrams(a), gb = {}, hit = 0;
    trigrams(b).forEach(function (g) { gb[g] = (gb[g] || 0) + 1; });
    ga.forEach(function (g) { if (gb[g]) { hit++; gb[g]--; } });
    return ga.length ? (2 * hit) / (ga.length + Object.keys(gb).length + hit) : 0;
  }

  /* When nothing matches even after correction: the closest rows anyway,
     by how much the query looks like each title and its keywords. Never an
     empty screen for a real query. */
  function closest(query, limit) {
    var full = tokens(query).join(' ');
    if (!full) return [];
    var qt = tokens(query);
    return INDEX.map(function (row) {
      var title = row.t.toLowerCase();
      var sc = similarity(full, title) * 3;
      qt.forEach(function (w) {
        var best = 0;
        row.tt.concat(row.kt).forEach(function (v) {
          var d = editDistance(w, v), r = 1 - d / Math.max(w.length, v.length);
          if (r > best) best = r;
        });
        sc += best;
      });
      sc *= TYPE_BOOST[row.y] || 1;
      return { row: row, score: sc };
    }).sort(function (a, b) { return b.score - a.score; }).slice(0, limit || 5).map(function (x) { return x.row; });
  }

  /* One query word → the forms we look for, each with a confidence weight. */
  function forms(w0) {
    var out = [], push = function (w, c) { if (w && !out.some(function (o) { return o.w === w; })) out.push({ w: w, c: c }); };
    push(w0, 1); push(stem(w0), 1);
    if (SYNONYMS[w0]) { push(SYNONYMS[w0], 0.85); push(stem(SYNONYMS[w0]), 0.85); }
    var st = stem(w0);
    if (!VOCAB[w0] && !VOCAB[st]) {
      var c = correct(w0) || correct(st);
      if (c) push(c, 0.6);
      var parts = split(w0);
      if (parts) parts.forEach(function (pw) { push(pw, 0.7); push(stem(pw), 0.7); });
    }
    return out;
  }
  function fieldHit(list, w) {     /* 1 exact, .55 prefix, 0 none */
    var best = 0;
    for (var i = 0; i < list.length; i++) {
      if (list[i] === w) return 1;
      if (w.length > 2 && list[i].indexOf(w) === 0) best = 0.55;
    }
    return best;
  }
  /* Returns {rows, corrected} — corrected is the query with typos fixed, or null. */
  function search(query, opts) {
    opts = opts || {};
    var raw = tokens(query), q = raw.filter(function (w) { return !STOP.test(w); });
    if (!q.length) q = raw;
    if (!q.length) return { rows: [], corrected: null };
    var full = String(query).toLowerCase().trim();
    var termForms = q.map(forms), corrected = null;

    var scored = [];
    INDEX.forEach(function (row) {
      if (opts.section && row.s !== opts.section) return;
      var score = 0, matched = 0;
      termForms.forEach(function (fs) {
        var best = 0;
        fs.forEach(function (f) {
          var s = (fieldHit(row.tt, f.w) * 8 + fieldHit(row.kt, f.w) * 4 + fieldHit(row.dt, f.w) * 1.5) * f.c * idf(f.w);
          if (s > best) best = s;
        });
        if (best) matched++;
        score += best;
      });
      if (!matched) return;
      if (q.length > 2 && matched < Math.ceil(q.length / 2)) return;
      score *= Math.pow(matched / q.length, 2) * 1.5 + 0.25;              /* coverage */
      var tl = row.t.toLowerCase();
      if (tl === full) score += 30; else if (tl.indexOf(full) === 0) score += 14; else if (tl.indexOf(full) > -1) score += 7;
      else if ((row.d || '').toLowerCase().indexOf(full) > -1) score += 3;   /* phrase */
      score *= TYPE_BOOST[row.y] || 1;
      scored.push({ row: row, score: score });
    });
    scored.sort(function (a, b) { return b.score - a.score || a.row.t.localeCompare(b.row.t); });

    /* Did you mean: rebuild the query with corrections where a word was unknown. */
    var fixed = raw.map(function (w) {
      if (VOCAB[w] || VOCAB[stem(w)] || STOP.test(w) || SYNONYMS[w]) return w;
      var parts = split(w); if (parts) return parts.join(' ');
      return correct(w) || correct(stem(w)) || w;
    });
    if (fixed.join(' ') !== raw.join(' ')) corrected = fixed.join(' ');

    var rows = scored.slice(0, opts.limit || 100).map(function (x) { return x.row; });
    var via = null;
    if (!rows.length && !opts.noFallback) {
      var alt = corrected ? search(corrected, { limit: opts.limit, section: opts.section, noFallback: true }).rows : [];
      if (alt.length) { rows = alt; via = 'corrected'; }
      else { rows = closest(query, Math.min(opts.limit || 6, 6)).filter(function (r) { return !opts.section || r.s === opts.section; }); if (rows.length) via = 'closest'; }
    }
    return { rows: rows, corrected: corrected, via: via };
  }

  /* Query completions: titles and popular phrases that continue what was typed. */
  function complete(query, limit) {
    var qn = String(query).toLowerCase().trim(); if (!qn) return [];
    var phrases = INDEX.map(function (r) { return r.t; }).concat(
      ['report cruelty', 'report a dog being beaten', 'hospital near me', 'colony caregiver card', 'street dog rights',
       'how to file an FIR', 'adopt a puppy', 'donate monthly', 'volunteer near me']);
    var out = [], seen = {};
    phrases.forEach(function (p) {
      var pl = p.toLowerCase();
      if (pl !== qn && (pl.indexOf(qn) === 0 || pl.split(' ').some(function (w) { return w.indexOf(qn) === 0 && qn.length > 2; })) && !seen[pl]) { seen[pl] = 1; out.push(p); }
    });
    return out.slice(0, limit || 5);
  }

  /* Recent searches (this browser only). */
  var RECENT_KEY = 'pfa-recent-searches';
  function recent() { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (e) { return []; } }
  function remember(q) {
    q = q.trim(); if (!q) return;
    try { var r = recent().filter(function (x) { return x.toLowerCase() !== q.toLowerCase(); }); r.unshift(q); localStorage.setItem(RECENT_KEY, JSON.stringify(r.slice(0, 6))); } catch (e) {}
  }
  function forget() { try { localStorage.removeItem(RECENT_KEY); } catch (e) {} }

  function emit(name, detail) { try { window.dispatchEvent(new CustomEvent(name, { detail: detail })); } catch (e) {} }

  /* ================================================================ HTML */
  function mark(text, query) {
    var words = tokens(query).filter(function (w) { return w.length > 1 && !STOP.test(w); });
    words = words.concat(words.map(stem)).filter(function (w, i, a) { return a.indexOf(w) === i; });
    if (!words.length) return esc(text);
    var re = new RegExp('\\b(' + words.map(function (w) { return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')', 'ig');
    return esc(text).replace(re, '<mark>$1</mark>');
  }
  function byTitle(t) { return INDEX.filter(function (r) { return r.t === t; })[0]; }

  /* ======================================================== MOST ASKED
     What visitors actually open, not a hand-written guess.

     Clicks are posted to /api/search-popular as a bare destination path; the
     query text never leaves the browser. The endpoint returns paths and
     counts only, and every path is resolved back to a row of THIS index
     before it is shown, so a path the site does not have is dropped rather
     than rendered. CURATED_FALLBACK covers the cold start, an offline visitor
     and any deployment without the API.                                     */
  var POPULAR_ENDPOINT = '/api/search-popular';
  var POPULAR_SHOWN = 6;        // how many rows the visitor sees
  var POPULAR_MIN_HITS = 8;     // below this the sample is too thin to be "most asked"
  var POPULAR_CACHE_KEY = 'pfa:popular:v1';
  var POPULAR_TTL = 6 * 60 * 60 * 1000;
  var liveHits = null;          // [{u, c}] once loaded

  function popularNormalise(u) {
    return String(u || '').trim().toLowerCase();
  }
  /* Index lookup by url, built lazily and only once. */
  var urlMap = null;
  function byUrl(u) {
    if (!urlMap) {
      urlMap = {};
      INDEX.forEach(function (r) {
        var key = popularNormalise(r.u);
        if (key && !urlMap[key]) urlMap[key] = r;
      });
    }
    return urlMap[popularNormalise(u)];
  }

  function readPopularCache() {
    try {
      var raw = sessionStorage.getItem(POPULAR_CACHE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.items)) return null;
      if (Date.now() - (parsed.at || 0) > POPULAR_TTL) return null;
      return parsed.items;
    } catch (_) { return null; }
  }
  function writePopularCache(items) {
    try { sessionStorage.setItem(POPULAR_CACHE_KEY, JSON.stringify({ at: Date.now(), items: items })); } catch (_) {}
  }

  /* Resolve counts to index rows. Unknown paths are dropped, which is what
     keeps anything written to the counter off the page. */
  function popularRows(limit) {
    var want = limit || POPULAR_SHOWN;
    var rows = [], seen = {};
    var total = (liveHits || []).reduce(function (sum, h) { return sum + (h.c || 0); }, 0);
    if (liveHits && total >= POPULAR_MIN_HITS) {
      liveHits.forEach(function (hit) {
        if (rows.length >= want) return;
        var row = byUrl(hit.u);
        if (!row || seen[row.t]) return;
        seen[row.t] = 1;
        rows.push(row);
      });
    }
    /* Top up from the curated list so the panel is never half empty while the
       real counts are still building. */
    CURATED_FALLBACK.forEach(function (t) {
      if (rows.length >= want) return;
      var row = byTitle(t);
      if (!row || seen[row.t]) return;
      seen[row.t] = 1;
      rows.push(row);
    });
    return rows;
  }

  function loadPopular(after) {
    var cached = readPopularCache();
    if (cached) { liveHits = cached; if (after) after(); return; }
    if (typeof fetch !== 'function') { if (after) after(); return; }
    fetch(POPULAR_ENDPOINT, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !Array.isArray(data.items)) return;
        liveHits = data.items.filter(function (row) { return row && row.u && row.c > 0; });
        writePopularCache(liveHits);
        if (after) after();
      })
      .catch(function () { /* offline or not deployed: the curated list stands */ });
  }

  /* Fire and forget. keepalive lets the request outlive the navigation the
     visitor just started, so counting never delays the page they asked for. */
  function recordOpen(url) {
    var u = popularNormalise(url);
    if (!u || !byUrl(u)) return;              // only paths this index knows
    /* Rows like `events.html?q=Bengaluru` are real, but the query is free text
       and must not be stored. Count the page instead: the interest in events
       is recorded, the city the visitor typed is not. */
    u = u.split('?')[0];
    if (!u || !byUrl(u)) return;
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(POPULAR_ENDPOINT, new Blob([JSON.stringify({ u: u })], { type: 'application/json' }));
        return;
      }
      fetch(POPULAR_ENDPOINT, {
        method: 'POST', keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ u: u })
      }).catch(function () {});
    } catch (_) {}
  }

  function rowHtml(row, query, i) {
    return '<li role="option" id="pfa-opt-' + i + '" aria-selected="false" data-id="' + row.id + '">' +
      '<a href="' + esc(row.u) + '" tabindex="-1">' +
        '<span class="pfa-s-title">' + mark(row.t, query) + '</span>' +
        '<span class="pfa-s-desc">' + mark(row.d || '', query) + '</span>' +
      '</a></li>';
  }

  /* ============================================================= OVERLAY */
  var overlay, input, list, chips, label, active = -1, opener = null;
  function buildOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'pfa-search';
    overlay.setAttribute('data-cursor', 'dark');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Search People for Animals');
    overlay.hidden = true;
    overlay.innerHTML =
      '<button type="button" class="pfa-search__close" data-search-close aria-label="Close search">✕</button>' +
      '<form class="pfa-search__form" action="search.html" method="get" role="search">' +
        '<label for="pfa-q" class="pfa-search__ask">What would you like to do today?</label>' +
        '<div class="pfa-search__field">' +
          '<input id="pfa-q" name="q" type="search" autocomplete="off" spellcheck="false" ' +
            'placeholder="Report cruelty, hospitals, laws, colony caregiver card, shop…" ' +
            'role="combobox" aria-expanded="false" aria-controls="pfa-results" aria-autocomplete="list">' +
          '<button type="submit" aria-label="Search">→</button>' +
        '</div>' +
        '<ul class="pfa-search__chips" data-chips aria-label="Suggestions"></ul>' +
        '<p class="pfa-search__hint" aria-hidden="true">Enter opens the top result · ↑ ↓ to move · Tab completes · Esc closes</p>' +
      '</form>' +
      '<nav class="pfa-search__quick" aria-label="Quick actions"><p class="pfa-search__label">Or go straight to</p><ul>' +
        QUICK.map(function (t) { var r = byTitle(t); return r ? '<li><a href="' + esc(r.u) + '" data-id="' + r.id + '">' + esc(r.t) + '</a></li>' : ''; }).join('') +
      '</ul></nav>' +
      '<div class="pfa-search__body">' +
        '<p class="pfa-search__label" id="pfa-results-label"></p>' +
        '<ul id="pfa-results" class="pfa-search__list" role="listbox" aria-labelledby="pfa-results-label"></ul>' +
      '</div>';
    document.body.appendChild(overlay);
    input = overlay.querySelector('#pfa-q');
    list = overlay.querySelector('#pfa-results');
    chips = overlay.querySelector('[data-chips]');
    label = overlay.querySelector('#pfa-results-label');

    input.addEventListener('input', function () { render(input.value); });
    input.addEventListener('keydown', onKey);
    overlay.querySelector('form').addEventListener('submit', function (e) {
      var q = input.value.trim();
      if (!q) { e.preventDefault(); return; }
      remember(q);
      var pick = active > -1 ? list.children[active] : (list.children[0] && list.dataset.mode === 'results' ? list.children[0] : null);
      if (pick) { e.preventDefault(); go(pick, q); }
    });
    overlay.addEventListener('click', function (e) {
      if (e.target.closest('[data-search-close]')) { close(); return; }
      var chip = e.target.closest('[data-fill]');
      if (chip) { e.preventDefault(); input.value = chip.getAttribute('data-fill'); render(input.value); input.focus(); return; }
      if (e.target.closest('[data-forget]')) { e.preventDefault(); forget(); render(''); return; }
      var quick = e.target.closest('.pfa-search__quick a');
      if (quick) { emit('pfa:search-click', { query: input.value, title: quick.textContent, url: quick.getAttribute('href'), surface: 'quick' }); recordOpen(quick.getAttribute('href')); return; }
      var li = e.target.closest('#pfa-results li');
      if (li) { e.preventDefault(); remember(input.value); go(li, input.value); }
    });
    list.addEventListener('mousemove', function (e) {
      var li = e.target.closest('li'); if (!li) return;
      setActive(Array.prototype.indexOf.call(list.children, li));
    });
    return overlay;
  }
  function go(li, q) {
    var row = INDEX[+li.getAttribute('data-id')];
    emit('pfa:search-click', { query: q, title: row.t, url: row.u, position: Array.prototype.indexOf.call(list.children, li) + 1 });
    recordOpen(row.u);
    location.href = row.u;
  }
  function render(q) {
    q = q.trim();
    var rows, mode = 'results';
    chips.innerHTML = '';
    if (!q) {
      var rec = recent();
      rows = popularRows(POPULAR_SHOWN);
      label.innerHTML = 'Most asked';
      if (rec.length) {
        chips.innerHTML = '<li class="pfa-search__chiplabel">Recent</li>' + rec.map(function (r) {
          return '<li><a href="search.html?q=' + encodeURIComponent(r) + '" data-fill="' + esc(r) + '">' + esc(r) + '</a></li>';
        }).join('') + '<li><button type="button" data-forget>Clear</button></li>';
      }
      mode = 'popular';
    } else {
      var res = search(q, { limit: 8 });
      rows = res.rows;
      var comps = complete(q, 5);
      if (comps.length) chips.innerHTML = comps.map(function (c) {
        return '<li><a href="search.html?q=' + encodeURIComponent(c) + '" data-fill="' + esc(c) + '">' + mark(c, q) + '</a></li>';
      }).join('');
      var seeAll = ' <a href="search.html?q=' + encodeURIComponent(q) + '">See all results →</a>';
      if (res.via === 'corrected') {
        label.innerHTML = 'Showing results for <a href="#" data-fill="' + esc(res.corrected) + '">' + esc(res.corrected) + '</a>. No pages match “' + esc(q) + '”.';
      } else if (res.via === 'closest') {
        label.innerHTML = 'No exact match for “' + esc(q) + '”. The closest:';
      } else if (rows.length) {
        label.innerHTML = esc(rows.length === 1 ? 'One result' : 'Top ' + rows.length) + seeAll;
        if (res.corrected) label.innerHTML += ' <span class="pfa-search__dym">Did you mean <a href="#" data-fill="' + esc(res.corrected) + '">' + esc(res.corrected) + '</a>?</span>';
      }
      if (!rows.length) {
        label.innerHTML = 'Nothing matched “' + esc(q) + '”. Check the spelling or start from one of these.';
        rows = popularRows(4); mode = 'popular';
      }
      emit('pfa:search', { query: q, results: res.rows.length, corrected: res.corrected, surface: 'overlay' });
    }
    list.dataset.mode = mode;
    list.innerHTML = rows.map(function (r, i) { return rowHtml(r, mode === 'results' ? q : '', i); }).join('');
    input.setAttribute('aria-expanded', rows.length ? 'true' : 'false');
    setActive(-1);
  }
  function setActive(i) {
    var items = list.children;
    if (active > -1 && items[active]) items[active].setAttribute('aria-selected', 'false');
    active = i;
    if (i > -1 && items[i]) {
      items[i].setAttribute('aria-selected', 'true');
      input.setAttribute('aria-activedescendant', items[i].id);
      items[i].scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  }
  function onKey(e) {
    var n = list.children.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(n ? (active + 1) % n : -1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(n ? (active - 1 + n) % n : -1); }
    else if (e.key === 'Tab' && !e.shiftKey) {
      var first = chips.querySelector('[data-fill]');
      if (first && input.value.trim()) { e.preventDefault(); input.value = first.getAttribute('data-fill'); render(input.value); }
    }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  }
  function open(from) {
    buildOverlay();
    opener = from || document.activeElement;
    var top = 0;
    Array.prototype.forEach.call(document.querySelectorAll('header, .announce, .pfa-ann'), function (el) {
      if (el.closest('.pfa-search')) return;
      var cs = getComputedStyle(el); if (cs.display === 'none' || cs.position !== 'fixed') return;
      top = Math.max(top, el.getBoundingClientRect().bottom);
    });
    overlay.style.top = Math.max(0, Math.round(top)) + 'px';
    overlay.hidden = false;
    document.documentElement.classList.add('pfa-search-open');
    render(input.value);
    if (!liveHits) loadPopular(function () { if (overlay && !overlay.hidden && !input.value.trim()) render(''); });
    requestAnimationFrame(function () { overlay.classList.add('is-open'); input.focus(); input.select(); });
  }
  function close() {
    if (!overlay || overlay.hidden) return;
    overlay.classList.remove('is-open');
    overlay.hidden = true;
    document.documentElement.classList.remove('pfa-search-open');
    if (opener && opener.focus) opener.focus();
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-open-search]');
    if (!t) return;
    e.preventDefault(); open(t);
  });
  document.addEventListener('keydown', function (e) {
    var el = document.activeElement, tag = el && el.tagName;
    var typing = tag === 'INPUT' || tag === 'TEXTAREA' || (el && el.isContentEditable);
    if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); open(); return; }
    if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey && !document.querySelector('input#q:not([data-search-input])')) { e.preventDefault(); open(); return; }
    if (e.key === 'Escape') close();
  });

  /* ======================================================== RESULTS PAGE */
  function renderPage(root) {
    var params = new URLSearchParams(location.search);
    var q = (params.get('q') || '').trim(), section = params.get('in') || '';
    var field = root.querySelector('[data-search-input]');
    var heading = root.querySelector('[data-search-heading]');
    var count = root.querySelector('[data-search-count]');
    var facets = root.querySelector('[data-search-facets]');
    var out = root.querySelector('[data-search-results]');
    var note = root.querySelector('[data-search-note]');
    if (field && field.value !== q) field.value = q;
    document.title = (q ? '“' + q + '” · ' : '') + 'Search · People for Animals';
    note.innerHTML = ''; facets.innerHTML = '';

    if (!q) {
      heading.textContent = 'What would you like to do today?';
      heading.classList.add('is-prompt');
      count.textContent = 'Most asked';
      /* A short ranked list, not the whole index grouped into every section. */
      out.innerHTML = popularListHtml(popularRows(POPULAR_SHOWN));
      if (!liveHits) loadPopular(function () { out.innerHTML = popularListHtml(popularRows(POPULAR_SHOWN)); });
      return;
    }
    var all = search(q), shown = q, res = all;
    if (all.via === 'corrected') {
      shown = all.corrected;
      note.innerHTML = 'Showing results for <strong>' + esc(all.corrected) + '</strong>. No pages match “' + esc(q) + '”.';
    } else if (all.via === 'closest') {
      note.innerHTML = 'No page matches “' + esc(q) + '” exactly. These are the closest.';
    } else if (all.corrected) {
      note.innerHTML = 'Did you mean <a href="search.html?q=' + encodeURIComponent(all.corrected) + '">' + esc(all.corrected) + '</a>?';
    }
    heading.textContent = q;
    heading.classList.remove('is-prompt');
    emit('pfa:search', { query: q, results: res.rows.length, corrected: all.corrected, section: section, surface: 'page' });

    if (!res.rows.length) {
      count.textContent = 'Nothing matched';
      out.innerHTML =
        '<div class="pfa-sr-empty">' +
          '<p>No page on this site matches “' + esc(q) + '”. Check the spelling, try a shorter word, or start from one of these.</p>' +
          '<ul class="pfa-sr-chips">' + popularRows(POPULAR_SHOWN).map(function (r) { return '<li><a href="' + esc(r.u) + '">' + esc(r.t) + '</a></li>'; }).join('') + '</ul>' +
          '<p class="pfa-sr-fallback">If it is urgent, <a href="laws.html#a33">see who to report to</a>.</p>' +
        '</div>';
      return;
    }
    /* facets with counts */
    var counts = {}; res.rows.forEach(function (r) { counts[r.s] = (counts[r.s] || 0) + 1; });
    var base = 'search.html?q=' + encodeURIComponent(q);
    facets.innerHTML = '<li><a href="' + base + '"' + (!section ? ' aria-current="true"' : '') + '>All <span>' + res.rows.length + '</span></a></li>' +
      SECTIONS.concat(Object.keys(counts).filter(function (s) { return SECTIONS.indexOf(s) < 0; })).filter(function (s) { return counts[s]; }).map(function (s) {
        return '<li><a href="' + base + '&in=' + encodeURIComponent(s) + '"' + (section === s ? ' aria-current="true"' : '') + '>' + esc(s) + ' <span>' + counts[s] + '</span></a></li>';
      }).join('');
    var rows = section ? res.rows.filter(function (r) { return r.s === section; }) : res.rows;
    count.textContent = (rows.length === 1 ? 'One result' : rows.length + ' results') + (section ? ' in ' + section : '') + ' for';
    out.innerHTML = groupHtml(rows, shown);
  }
  /* Idle state on search.html: one short ranked list. The grouped layout is
     for actual results, where the section headings earn their space. */
  function popularListHtml(rows) {
    if (!rows.length) return '';
    return '<ol class="pfa-sr-popular">' + rows.map(function (r) {
      return '<li><a href="' + esc(r.u) + '" data-id="' + r.id + '">' +
        '<span class="pfa-sr-title">' + esc(r.t) + '</span>' +
        (r.d ? '<span class="pfa-sr-desc">' + esc(r.d) + '</span>' : '') +
      '</a></li>';
    }).join('') + '</ol>';
  }
  function groupHtml(rows, q) {
    var groups = {};
    rows.forEach(function (r) { (groups[r.s] = groups[r.s] || []).push(r); });
    var order = SECTIONS.concat(Object.keys(groups).filter(function (s) { return SECTIONS.indexOf(s) < 0; }));
    return order.filter(function (s) { return groups[s]; }).map(function (s) {
      var gid = 'g-' + s.replace(/\W/g, '');
      return '<section class="pfa-sr-group" aria-labelledby="' + gid + '">' +
        '<h2 id="' + gid + '">' + esc(s) + '</h2>' +
        '<ol>' + groups[s].map(function (r) {
          return '<li><a href="' + esc(r.u) + '" data-id="' + r.id + '">' +
            '<span class="pfa-sr-title">' + mark(r.t, q) + '</span>' +
            '<span class="pfa-sr-url">' + esc(r.p ? r.p : r.u.replace(/\.html/, '').replace(/#/, ' › ')) + '</span>' +
            '<span class="pfa-sr-desc">' + mark(r.d || '', q) + '</span>' +
          '</a></li>';
        }).join('') + '</ol></section>';
    }).join('');
  }
  function initPage(root) {
    renderPage(root);
    var field = root.querySelector('[data-search-input]');
    if (field) {
      var t;
      field.addEventListener('input', function () {
        clearTimeout(t);
        t = setTimeout(function () {
          var q = field.value.trim();
          history.replaceState(null, '', q ? 'search.html?q=' + encodeURIComponent(q) : 'search.html');
          renderPage(root);
        }, 120);
      });
      root.querySelector('form').addEventListener('submit', function () { remember(field.value); });
    }
    root.addEventListener('click', function (e) {
      var a = e.target.closest('a[data-id]'); if (!a) return;
      var row = INDEX[+a.getAttribute('data-id')];
      emit('pfa:search-click', { query: field ? field.value : '', title: row.t, url: row.u, surface: 'page' });
    });
    window.addEventListener('popstate', function () { renderPage(root); });
  }

  /* =============================================================== BOOT */
  build(CURATED);

  /* The shop's products are fetched by the browser, so build-index.js never
     sees them: crawling pfa-shop.html yields the page copy and not one product
     name. They come from the same snapshot the shop grid paints from, so search
     can only ever offer what the shop is actually showing.

     One row per product, not per variant: a 3 kg and a 10 kg bag of the same
     food are two lines at checkout but one thing to search for.

     The snapshot already has the Store switch applied by build-catalog.js, so a
     closed shop or a non-vegetarian line is absent here rather than filtered
     again. If the file was never written (Shopify unreachable at deploy time,
     in which case build-catalog.js deletes it) the fetch fails and search
     carries on with pages alone. */
  var SHOP_SNAPSHOT = '/assets/catalog-snapshot.json';
  function money(n) { return '\u20b9' + Math.round(Number(n) || 0).toLocaleString('en-IN'); }
  function shopRows(data) {
    if (!data || !Array.isArray(data.products)) return [];
    var rows = [], seen = {};
    data.products.forEach(function (p) {
      if (!p || !p.handle || !p.title || p.available === false) return;
      var url = '/products/' + encodeURIComponent(p.handle);
      if (seen[url]) return;
      seen[url] = 1;
      var price = p.minPrice == null ? ''
        : (p.maxPrice != null && Number(p.maxPrice) > Number(p.minPrice)
            ? money(p.minPrice) + '\u2013' + money(p.maxPrice) : money(p.minPrice));
      var kind = p.productType || p.categoryLabel || '';
      rows.push({
        t: p.title,
        s: 'Shop',
        y: 'product',
        u: url,
        d: [kind, price].filter(Boolean).join(' \u00b7 ') || 'In the PFA shop.',
        /* the handle carries words the title sometimes does not */
        k: [p.title, kind, p.categoryLabel, p.animal, 'shop buy product',
            String(p.handle).replace(/-/g, ' ')].filter(Boolean).join(' ').toLowerCase()
      });
    });
    return rows;
  }

  /* Merge the crawled index if the site ships one (see build-index.js), and the
     shop's products. Both are optional and either may fail; the index is built
     once, when whichever arrive have arrived, so a slow shop cannot delay pages.
     Curated rows win on duplicate URLs so hand-written copy is never overwritten. */
  /* The panel and the API are never search results. search-index.json is built
     by a crawler that is not in this repo, and it had walked into admin.html:
     four rows, one of them quoting the signed-in panel's own headings back at
     a stranger. Cleaning the file fixed today; this line is what stops the next
     crawl putting them back. Mirrors PRIVATE in scripts/build-search-index.js.
     Applied to the shop rows too, so nothing merged in can bypass it. */
  var PRIVATE = /^\/?(admin\b|api\/)/i;
  function isPrivate(u) { return PRIVATE.test(String(u == null ? '' : u).trim()); }

  function mergeCrawl(done) {
    if (!window.fetch) { done(); return; }
    function grab(url, opts) {
      return fetch(url, opts).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    }
    Promise.all([
      grab('search-index.json', { cache: 'no-cache' }),
      grab(SHOP_SNAPSHOT, { headers: { Accept: 'application/json' } })
    ]).then(function (results) {
      var extra = Array.isArray(results[0]) ? results[0] : [];
      var have = {}; CURATED.forEach(function (r) { have[r.u] = 1; });
      var add = extra.filter(function (r) { return r && r.t && r.u && !have[r.u] && !isPrivate(r.u); });
      add.forEach(function (r) { have[r.u] = 1; });
      shopRows(results[1]).forEach(function (r) { if (!have[r.u] && !isPrivate(r.u)) { have[r.u] = 1; add.push(r); } });
      if (add.length) build(CURATED.concat(add));
      done();
    }).catch(done);
  }
  /* Hand a ?q= from the site search to a page that has its own filter box
     (shop, laws, events), so a result can land on the page already narrowed. */
  function handoff() {
    var box = document.querySelector('input#q:not([data-search-input])'); if (!box) return;
    var q = new URLSearchParams(location.search).get('q'); if (!q) return;
    box.value = q; box.dispatchEvent(new Event('input', { bubbles: true }));
    setTimeout(function () { box.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 150);
  }
  function ready() {
    handoff();
    mergeCrawl(function () {
      var root = document.querySelector('[data-search-page]');
      if (root) initPage(root);
      if (overlay && !overlay.hidden) render(input.value);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();

  window.PFASearch = { search: search, complete: complete, open: open, close: close, index: function () { return INDEX; } };
})();
