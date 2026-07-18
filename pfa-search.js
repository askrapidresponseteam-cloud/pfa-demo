/* PFA global search
   One file, dropped into every page. Mounts a visible search bar into the nav,
   indexes real entities from the live data files, and never hand-copies a price.
   Entity sources load lazily on first open, so no page pays for search it never uses.
*/
(function () {
  "use strict";

  var LANDING = "index.html",
      STORE = "store.html",
      PATRON = "membership.html",
      GETINVOLVED = "get-involved.html",
      WLDM = "watch-listen-do-meet.html",
      CSR = "csr.html";

  /* ----------------------------------------------------------------
     1. Curated index - pages, sections and intents only.
        Entities are never listed here. They come from the data files.
     ---------------------------------------------------------------- */
  var PAGES = [
    { t: "People for Animals", p: "Home", u: LANDING + "#top", s: "India's largest animal welfare organisation, since 1992. Rescue, medicine, law, knowledge, care.", k: "pfa home about who we are maneka gandhi 1992 movement india largest animal welfare organisation" },
    { t: "What PFA gives", p: "Home", u: LANDING + "#next", s: "Knowledge, infrastructure, community and products. In the works.", k: "gives free knowledge courses learn law first aid hospitals clinics shelters community" },
    { t: "Learn the law of the land", p: "Home", u: LANDING + "#next", s: "Courses, legal guides and the law. Coming, free, for everyone.", k: "law legal courses learn education guide abc rules first aid knowledge know your law study" },
    { t: "PFA Certified", p: "Home", u: LANDING + "#next", s: "A public standard for animal-friendly premises. In the works.", k: "certified certification mark standard animal friendly restaurants hotels builders apartments schools pet stores corporates cafes audit powered by pfa badge" },
    /* every product, generated from pfa-pharmacy-data.js and pfa-store-data.js.
       Nothing hand-typed: if a SKU changes, regenerate. */
    { t: "Himalaya Digyton Drops - 30ml", p: "Pharmacy", u: STORE + "#/rx/himalayadigyto", s: "Himalaya. 30ml. No prescription needed.", k: "himalaya himalaya digyton drops - 30ml 30ml digestion stomach loose motion diarrhoea appetite bloat medicine pharmacy vet veterinary over the counter otc no prescription dog cat" },
    { t: "Himalaya Immunol Supplement For Cats and Dogs - 100 ml", p: "Pharmacy", u: STORE + "#/rx/himalayaimmuno", s: "Himalaya. 100ml. No prescription needed.", k: "himalaya himalaya immunol supplement for cats and dogs - 100 ml 100ml immunity supplement support vitamin tonic medicine pharmacy vet veterinary over the counter otc no prescription dog cat" },
    { t: "Himalaya Digyton Plus Liquid - 100ml", p: "Pharmacy", u: STORE + "#/rx/himalayadigytox", s: "Himalaya. 100ml. No prescription needed.", k: "himalaya himalaya digyton plus liquid - 100ml 100ml digestion stomach loose motion diarrhoea appetite bloat medicine pharmacy vet veterinary over the counter otc no prescription dog cat" },
    { t: "Bayer Drontal Plus Tasty Dog Deworming 1 Tablet", p: "Pharmacy", u: STORE + "#/rx/bayerdrontalpl", s: "Bayer. 1 Tablet. Prescription needed.", k: "bayer bayer drontal plus tasty dog deworming 1 tablet 1 tablet worms deworming dewormer roundworm tapeworm puppy medicine pharmacy vet veterinary prescription rx dog" },
    { t: "Intas Pomisol Ear Drops For Dog & Cat - 15ml", p: "Pharmacy", u: STORE + "#/rx/intaspomisolea", s: "Intas. 15ml. Prescription needed.", k: "intas intas pomisol ear drops for dog & cat - 15ml 15ml ear ears infection mites otitis smell medicine pharmacy vet veterinary prescription rx dog cat" },
    { t: "Himalaya Himpyrin Liquid - 30ml", p: "Pharmacy", u: STORE + "#/rx/himalayahimpyr", s: "Himalaya. 30ml. No prescription needed.", k: "himalaya himalaya himpyrin liquid - 30ml 30ml liver kidney urinary renal hepatic bladder uti medicine pharmacy vet veterinary over the counter otc no prescription dog cat" },
    { t: "Bravecto Chew Tablet 20kg-40kg For Tick And Flea Control For Dogs - 1000mg", p: "Pharmacy", u: STORE + "#/rx/bravectochewta", s: "Bravecto. 1000mg. Prescription needed.", k: "bravecto bravecto chew tablet 20kg-40kg for tick and flea control for dogs - 1000mg 1000mg ticks fleas tick flea kills repels monthly parasite medicine pharmacy vet veterinary prescription rx dog 20 to 40 kg weight" },
    { t: "Zoetis Simparica TRIO Chewable Tablets for Dogs - 20 to 40kg - 1 Tablet", p: "Pharmacy", u: STORE + "#/rx/zoetissimparic", s: "Zoetis. 1 Tablet. Prescription needed.", k: "zoetis zoetis simparica trio chewable tablets for dogs - 20 to 40kg - 1 tablet 1 tablet ticks fleas tick flea kills repels monthly parasite medicine pharmacy vet veterinary prescription rx dog 20 to 40 kg weight" },
    { t: "Himalaya Anxocare Vet Tablets - 60 Tablets", p: "Pharmacy", u: STORE + "#/rx/himalayaanxoca", s: "Himalaya. 60 Tablets. No prescription needed.", k: "himalaya himalaya anxocare vet tablets - 60 tablets 60 tablets anxiety anxious crackers thunder travel calming stress medicine pharmacy vet veterinary over the counter otc no prescription dog cat" },
    { t: "Bayer Drontal Puppy Deworming Suspension - 20ml", p: "Pharmacy", u: STORE + "#/rx/bayerdrontalpu", s: "Bayer. 20ml. Prescription needed.", k: "bayer bayer drontal puppy deworming suspension - 20ml 20ml worms deworming dewormer roundworm tapeworm puppy medicine pharmacy vet veterinary prescription rx dog" },
    { t: "Himalaya Scavon Vet Spray - 100ml", p: "Pharmacy", u: STORE + "#/rx/himalayascavon", s: "Himalaya. 100ml. No prescription needed.", k: "himalaya himalaya scavon vet spray - 100ml 100ml skin wound wounds mange hot spot itching scratching maggots dressing medicine pharmacy vet veterinary over the counter otc no prescription dog cat" },
    { t: "Himalaya Fur Glow for Dogs", p: "Pharmacy", u: STORE + "#/rx/himalayafurglo", s: "Himalaya. 200ml. No prescription needed.", k: "himalaya himalaya fur glow for dogs 200ml skin wound wounds mange hot spot itching scratching maggots dressing medicine pharmacy vet veterinary over the counter otc no prescription dog" },
    { t: "Himalaya Liv.52 Pet Syrup - 200ml", p: "Pharmacy", u: STORE + "#/rx/himalayaliv52p", s: "Himalaya. 200ml. No prescription needed.", k: "himalaya himalaya liv.52 pet syrup - 200ml 200ml digestion stomach loose motion diarrhoea appetite bloat medicine pharmacy vet veterinary over the counter otc no prescription dog cat" },
    { t: "Zoetis Simparica TRIO Chewable Tablets for Dogs - 2.6 - 5kg - 1 Tablet", p: "Pharmacy", u: STORE + "#/rx/zoetissimparicx", s: "Zoetis. 1 Tablet. Prescription needed.", k: "zoetis zoetis simparica trio chewable tablets for dogs - 2.6 - 5kg - 1 tablet 1 tablet ticks fleas tick flea kills repels monthly parasite medicine pharmacy vet veterinary prescription rx dog 2.6 to 5 kg weight" },
    { t: "Bravecto Chewable 1400Mg Tablet For Dog - 40-56 kg", p: "Pharmacy", u: STORE + "#/rx/bravectochewab", s: "Bravecto. 1400mg. Prescription needed.", k: "bravecto bravecto chewable 1400mg tablet for dog - 40-56 kg 1400mg ticks fleas tick flea kills repels monthly parasite medicine pharmacy vet veterinary prescription rx dog 40 to 56 kg weight" },
    { t: "Himalaya NEFROTEC DS Vet Tablets - 60 Tablets", p: "Pharmacy", u: STORE + "#/rx/himalayanefrot", s: "Himalaya. 60 Tablets. No prescription needed.", k: "himalaya himalaya nefrotec ds vet tablets - 60 tablets 60 tablets liver kidney urinary renal hepatic bladder uti medicine pharmacy vet veterinary over the counter otc no prescription dog cat" },
    { t: "Dr Goel's Cystigo Drops For Pets Homeopathic Remedy For Treating Urinary Problems Infections - 30ml", p: "Pharmacy", u: STORE + "#/rx/drgoelscystigo", s: "Dr Goel's. 30ml. No prescription needed.", k: "dr goel's dr goel's cystigo drops for pets homeopathic remedy for treating urinary problems infections - 30ml 30ml liver kidney urinary renal hepatic bladder uti medicine pharmacy vet veterinary over the counter otc no prescription dog cat" },
    { t: "Virbac Epiotic - Ear Cleanser for Dogs and Cats - 100ml", p: "Pharmacy", u: STORE + "#/rx/virbacepiotice", s: "Virbac. 100ml. No prescription needed.", k: "virbac virbac epiotic - ear cleanser for dogs and cats - 100ml 100ml ear ears infection mites otitis smell medicine pharmacy vet veterinary over the counter otc no prescription dog cat" },
    { t: "Intas D Mag Wound Care Spray for Dogs - 60ml", p: "Pharmacy", u: STORE + "#/rx/intasdmagwound", s: "Intas. 60ml. No prescription needed.", k: "intas intas d mag wound care spray for dogs - 60ml 60ml skin wound wounds mange hot spot itching scratching maggots dressing medicine pharmacy vet veterinary over the counter otc no prescription dog" },
    { t: "Zoetis Simparica TRIO Chewable Tablets for Dogs - 10 to 20kg - 1 Tablet", p: "Pharmacy", u: STORE + "#/rx/zoetissimparicxx", s: "Zoetis. 1 Tablet. Prescription needed.", k: "zoetis zoetis simparica trio chewable tablets for dogs - 10 to 20kg - 1 tablet 1 tablet ticks fleas tick flea kills repels monthly parasite medicine pharmacy vet veterinary prescription rx dog 10 to 20 kg weight" },
    { t: "Himax Ointment - 50g", p: "Pharmacy", u: STORE + "#/rx/himaxointment5", s: "Himax. 50g. No prescription needed.", k: "himax himax ointment - 50g 50g skin wound wounds mange hot spot itching scratching maggots dressing medicine pharmacy vet veterinary over the counter otc no prescription dog cat" },
    { t: "Dr Goel's Cretigo for Dogs and Cats (30ml)", p: "Pharmacy", u: STORE + "#/rx/drgoelscretigo", s: "Dr Goel's. 30ml. No prescription needed.", k: "dr goel's dr goel's cretigo for dogs and cats (30ml) 30ml liver kidney urinary renal hepatic bladder uti medicine pharmacy vet veterinary over the counter otc no prescription dog cat" },
    { t: "The Standard Cap", p: "Store", u: STORE + "#/p/cap1", s: "Cotton twill. Embroidered emblem.", k: "the standard cap cotton twill. embroidered emblem. caps store shop merchandise buy" },
    { t: "The Field Cap", p: "Store", u: STORE + "#/p/cap2", s: "Five-panel. Quick-dry for the rains.", k: "the field cap five-panel. quick-dry for the rains. caps store shop merchandise buy" },
    { t: "The Emblem Tee", p: "Store", u: STORE + "#/p/tee1", s: "220 GSM cotton. Emblem at the chest.", k: "the emblem tee 220 gsm cotton. emblem at the chest. apparel store shop merchandise buy" },
    { t: "The Wordmark Tee", p: "Store", u: STORE + "#/p/tee2", s: "People for Animals, across the back.", k: "the wordmark tee people for animals, across the back. apparel store shop merchandise buy" },
    { t: "The Heavyweight Hoodie", p: "Store", u: STORE + "#/p/hood1", s: "400 GSM fleece. Kangaroo pocket.", k: "the heavyweight hoodie 400 gsm fleece. kangaroo pocket. apparel store shop merchandise buy" },
    { t: "The Coach Jacket", p: "Store", u: STORE + "#/p/jkt1", s: "Water-resistant shell. Emblem in blue, back.", k: "the coach jacket water-resistant shell. emblem in blue, back. apparel store shop merchandise buy" },
    { t: "The Canvas Tote", p: "Store", u: STORE + "#/p/tote1", s: "Fits a rescue kit. Or the groceries.", k: "the canvas tote fits a rescue kit. or the groceries. bags store shop merchandise buy" },
    { t: "The Field Backpack", p: "Store", u: STORE + "#/p/pack1", s: "20 litres. Vet-run ready.", k: "the field backpack 20 litres. vet-run ready. bags store shop merchandise buy" },
    { t: "Notebooks, Set of 3", p: "Store", u: STORE + "#/p/note1", s: "Dot grid. Lies flat.", k: "notebooks, set of 3 dot grid. lies flat. paper store shop merchandise buy" },
    { t: "Wall Calendar 2027", p: "Store", u: STORE + "#/p/cal1", s: "Twelve rescues, twelve months.", k: "wall calendar 2027 twelve rescues, twelve months. paper store shop merchandise buy" },
    { t: "The Rope Leash", p: "Store", u: STORE + "#/p/leash1", s: "Cotton rope. Solid brass clip.", k: "the rope leash cotton rope. solid brass clip. pets store shop merchandise buy" },
    { t: "The Everyday Collar", p: "Store", u: STORE + "#/p/collar1", s: "Soft webbing. Emblem tag included.", k: "the everyday collar soft webbing. emblem tag included. pets store shop merchandise buy" },
    { t: "Vegetarian Treats", p: "Store", u: STORE + "#/p/treat1", s: "Baked, vegetarian, vet-checked.", k: "vegetarian treats baked, vegetarian, vet-checked. pets store shop merchandise buy" },
    { t: "The Enamel Pin", p: "Store", u: STORE + "#/p/pin1", s: "Hard enamel. The emblem, exact.", k: "the enamel pin hard enamel. the emblem, exact. pins store shop merchandise buy" },
    { t: "The Sticker Sheet", p: "Store", u: STORE + "#/p/stk1", s: "Weatherproof vinyl. Nine marks.", k: "the sticker sheet weatherproof vinyl. nine marks. pins store shop merchandise buy" },
    { t: "The Steel Bottle", p: "Store", u: STORE + "#/p/bot1", s: "750 ml. Twelve-hour cold.", k: "the steel bottle 750 ml. twelve-hour cold. home store shop merchandise buy" },
    { t: "The Ceramic Mug", p: "Store", u: STORE + "#/p/mug1", s: "350 ml. The emblem in blue.", k: "the ceramic mug 350 ml. the emblem in blue. home store shop merchandise buy" },
    { t: "PFA Coffee, 250g", p: "Store", u: STORE + "#/p/cof1", s: "Single origin, medium roast.", k: "pfa coffee, 250g single origin, medium roast. home store shop merchandise buy" },
    { t: "The Pharmacy", p: "Store", u: STORE + "#/pharmacy", s: "Medicines for dogs and cats, through a licensed partner pharmacy. Tick and flea, deworming, ear, skin, liver and kidney.", k: "pharmacy medicine medicines chemist drugs tablets drops spray tick flea deworming dewormer ear skin liver kidney prescription rx otc vet veterinary bravecto simparica drontal himalaya zoetis virbac intas bayer" },
    { t: "Prescription medicines", p: "Store", u: STORE + "#/pharmacy", s: "Prescription items are checked by a registered pharmacist at the partner pharmacy before anything is dispatched.", k: "prescription rx vet script pharmacist dispensed schedule h medicine legal" },
    { t: "Corporate Partnership", p: "Corporate Partnership", u: CSR + "#top", s: "Partner with PFA. Campaigns you can put your name to, gifting that funds rescue, and the compliance pack.", k: "brand partnership collaboration cobrand co-brand campaign limited edition corporate csr sponsor partner partner with pfa company companies act schedule vii section 135 two per cent" },
    { t: "Three campaigns you can put your name to", p: "Corporate Partnership", u: CSR + "#campaigns", s: "Whose Street, Shot On The Street, The First Hand. A campaign with your name on it, not a logo on a banner.", k: "campaign campaigns brand name film whose street shot on the street first hand sponsor own" },
    { t: "Corporate gifting with nothing animal in it", p: "Corporate Partnership", u: CSR + "#campaigns", s: "No leather, no silk, no wool. Every unit funds rescue, and an impact receipt goes in every box.", k: "gifting gifts diwali corporate hampers kit leather silk wool vegan impact receipt employee desks second budget" },
    { t: "Compliance and registrations", p: "Corporate Partnership", u: CSR + "#proof", s: "Schedule VII item (iv), CSR-1, 12A, 80G, FCRA, Darpan, audited financials and the Board Report annexure.", k: "compliance csr-1 csr1 12a 80g fcra darpan registration audited financials schedule vii section 135 board report annexure eligible mca diligence" },
    { t: "The corporate partnerships desk", p: "Corporate Partnership", u: CSR + "#contact", s: "A named person who is accountable for everything promised, not a shared inbox.", k: "contact desk partnership corporate talk email phone person accountable" },
    { t: "The PFA app", p: "Home", u: LANDING + "#next", s: "Adoption, SOS, lost and found, ABC tracking. In the works.", k: "app mobile sos emergency rescue lost found pet blood bank abc tracking volunteer discovery events certificates community report cruelty operating system download" },
    { t: "Report cruelty", p: "Home", u: LANDING + "#next", s: "Reporting arrives with the PFA app. In the works.", k: "report cruelty abuse complaint fir police case violence beating harm rescue emergency help" },

    { t: "The PFA network", p: "Network", u: "network.html#top", s: "80 units across 20 states. Tell us what is happening and reach the nearest unit that can help.", k: "network directory units reach pfa near me nearest help emergency animal hurt cruelty rescue state city triage" },
    { t: "Find your PFA unit", p: "Network", u: "network.html#findPfa", s: "Set your state or share your location. Your nearest unit, and what it does.", k: "find my pfa unit near me nearest local state city location contact reach" },
    { t: "An animal is hurt", p: "Network", u: "network.html#top", s: "Do-this-now steps, the nearest capable unit, and an escalation ladder.", k: "animal hurt injured hit accident emergency dog cat cow bird help now sos rescue" },

    { t: "Trusted animal services", p: "Services", u: "services.html#top", s: "Vets, boarding, grooming and ambulances, assessed against the PFA standard.", k: "trusted services directory vet veterinary doctor clinic hospital boarding daycare grooming training shelter ambulance pet friendly assessed verified" },
    { t: "Need a vet now", p: "Services", u: "services.html#top", s: "The nearest open emergency vet, closest first.", k: "emergency vet now open 24x7 urgent animal doctor nearest closest night" },

    { t: "Coexistence heat map", p: "Heat Map", u: "heatmap.html#top", s: "State by state, where animals and people live well together. Sunlight, not shame.", k: "heat map index rankings ranking state coexistence accountability abc compliance cruelty feeder safety municipal map india" },

    { t: "Adopt a life", p: "Adopt", u: "adopt.html", s: "Adopt when you are ready. The door is always open.", k: "adopt adoption dog cat puppy kitten rescue rehome take home animal foster" },
    { t: "Give to the work", p: "Give", u: "give.html", s: "Every rupee funds rescue, medicine and care.", k: "give giving donate donation contribute fund support money charity 80g tax help pay" },

    { t: "Get to learn", p: "Get Involved", u: GETINVOLVED + "?path=volunteer", s: "Rescue, first-aid, animal handling and the law. Come through training and earn your place on the response team.", k: "volunteer volunteering help join sign up give time rescue foster drive shelter support field work training" },
    { t: "Colony Animal Caretaker Card", p: "Get Involved", u: GETINVOLVED + "?path=catc", s: "Official identification for people who feed community animals. Verified against Aadhaar, issued in your name.", k: "catc colony animal caretaker card feeder feeding street dogs community dogs id identification standing abc rules apply legal protection" },

    { t: "The Patron Card", p: "Patron", u: PATRON, s: "One rupee a day. Your name, your number, your years, in matte black.", k: "patron card membership member join become black card apply rupee day 365 year subscribe premium status identity" },
    { t: "One rupee a day", p: "Patron", u: PATRON, s: "Rs 365 a year, billed once. Renews yearly, cancel anytime.", k: "price cost fee 1 one rupee day 365 year cheap payment renewal cancel how much" },
    { t: "Payment: UPI, card, netbanking", p: "Patron", u: PATRON, s: "Pay by UPI, debit or credit card, or netbanking.", k: "payment pay upi gpay phonepe paytm card credit debit netbanking bank checkout secure receipt" },
    { t: "Aadhaar and identity", p: "Patron", u: PATRON, s: "Upload Aadhaar. The name is checked against the name on the card, in your browser.", k: "aadhaar aadhar identity kyc verification proof name match upload document masked last four privacy" },

    { t: "The first hand", p: "Founder", u: "founder.html", s: "Maneka Gandhi opened the first hand in 1992. The founder, the year, and the hands that followed.", k: "founder maneka gandhi who founded pfa history 1992 first hand founders corner about beginning" },
    { t: "Watch. Listen. Do. Meet.", p: "Four rooms", u: WLDM, s: "The films, the podcast, the assignments, and the room where you meet Maneka Gandhi.", k: "watch listen do meet films podcast assignments meet maneka four rooms chambers programme the first hand" },
    { t: "The First Hand, the podcast", p: "Listen", u: WLDM + "#listen", s: "Long-form conversations. Weekly on Sundays.", k: "podcast the first hand listen episode maneka gandhi audio spotify apple podcasts sunday weekly" },
    { t: "An hour with Maneka", p: "Meet", u: WLDM + "#meet", s: "One Sunday a month on Zoom, patrons only. The card is your ticket.", k: "meet maneka gandhi zoom patrons monthly call meeting ticketed live" },

    { t: "Stories", p: "Stories", u: "stories.html", s: "Rescue films, field stories and the moments that carry the movement.", k: "stories video films watch rescue footage content wall community feed" },
    { t: "Submit a story", p: "Stories", u: "stories.html#submit", s: "Send in a rescue, a recovery, a caretaker moment.", k: "submit story share upload post video contribute my footage rescue caretaker" },

    { t: "The Assembly", p: "Assembly", u: "assembly.html", s: "Events, campaigns and the people who show up.", k: "assembly events meetups campaigns volunteer weekend rounds propose stage community" },
    { t: "Hall of Fame", p: "Hall of Fame", u: "hall-of-fame.html", s: "Healers of record. The vets and carers engraved for good.", k: "hall of fame healers vets doctors laureate nominate award recognition engraved" },
    { t: "PFA X", p: "PFA X", u: "pfa-x.html", s: "Certified animal-friendly places, and how a place earns the mark.", k: "pfa x certified certification places cafes hotels restaurants partner mark standard audit" },

    { t: "The PFA store", p: "Store", u: STORE, s: "Everything in the store. The margin funds the work.", k: "store shop buy merchandise merch products goods shopping cart order gifts" },
    { t: "Your orders", p: "Store", u: STORE + "#/orders", s: "Every order you have placed, and where it is now.", k: "orders order history my orders track tracking delivery shipped parcel receipt purchases bought" },
    { t: "Patron pricing", p: "Store", u: STORE, s: "The second price is the patron price. One rupee a day.", k: "discount patron price member price cheaper offer deal savings" }
  ];

  /* ----------------------------------------------------------------
     2. Entity sources - lazily loaded, mapped from live data.
        Change a price in pfa-store-data.js and search follows. No copies.
     ---------------------------------------------------------------- */
  var CAT_WORDS = {
    caps: "cap caps hat hats headwear",
    apparel: "tee tees tshirt t-shirt shirt hoodie jacket clothing clothes wear",
    bags: "bag bags tote backpack rucksack",
    paper: "paper stationery notebook diary calendar",
    pets: "pet pets dog cat leash collar treats food",
    pins: "pin pins badge sticker stickers enamel",
    home: "home bottle flask mug cup coffee kitchen"
  };
  var SVC_LABEL = {
    vet: "Vet", emergency: "Emergency", ambulance: "Ambulance", boarding: "Boarding",
    grooming: "Grooming", training: "Training", shelter: "Shelter", abc: "ABC centre",
    petfriendly: "Pet friendly"
  };
  var TRUST_WORD = {
    assessed: "Assessed against the PFA standard", verified: "Verified",
    provisional: "Provisional", flagged: "Flagged - proceed with care"
  };

  function inr(n) { return "Rs " + Number(n).toLocaleString("en-IN"); }

  var SOURCES = [
    {
      file: "pfa-store-data.js", global: "PFA_PRODUCTS", type: "Product",
      build: function (data) {
        return Object.keys(data).map(function (id) {
          var p = data[id];
          return {
            t: p.name, p: "Store", type: "Product",
            u: STORE + "#/p/" + id,
            s: p.spec + " " + inr(p.price) + ", patrons " + inr(p.mprice) + ".",
            k: [p.cat, p.name, p.spec, p.tag, p.price, p.mprice, CAT_WORDS[p.cat] || ""].join(" ")
          };
        });
      }
    },
    {
      file: "pfa-services-data.js", global: "PFA_SERVICES", type: "Service",
      build: function (data) {
        return data.map(function (v) {
          var label = SVC_LABEL[v.cat] || v.cat;
          return {
            t: v.name, p: label + ", " + v.city, type: "Service",
            u: "services.html#s-" + v.id,
            s: (TRUST_WORD[v.trust] || v.trust) + " - " + v.hours + " - " + v.city + ", " + v.state + ".",
            k: [v.name, v.city, v.state, v.cat, label, v.trust, v.hours,
                v.openNow ? "open now" : "",
                "doctor vet veterinary clinic hospital near me"].join(" ")
          };
        });
      }
    },
    {
      file: "pfa-network-data.js", global: "PFA_UNITS", type: "Unit",
      build: function (data) {
        return data.map(function (u) {
          return {
            t: "PFA " + u.city, p: u.state, type: "Unit",
            u: "network.html#u-" + u.id,
            s: (u.head ? u.head + " - " : "") + u.caps.join(", ") + (u.onCall ? " - on call" : "") + ".",
            k: [u.city, u.state, u.head, u.caps.join(" "),
                u.onCall ? "on call available" : "",
                "unit branch office chapter near me reach"].join(" ")
          };
        });
      }
    },
    {
      file: "pfa-adopt-data.js", global: "PFA_DOGS", type: "Pet",
      build: function (data) {
        return data.map(function (d) {
          return {
            t: d.name, p: d.sex + ", " + d.ageT + ", " + d.loc, type: "Pet",
            u: "adopt.html#/dog/" + d.id,
            s: d.blurb,
            k: [d.name, d.sex, d.size, d.loc, d.ageT, d.ready, d.vax, d.ster,
                (d.temper || []).join(" "), d.activity,
                d.kids ? "good with kids children" : "",
                d.dogs ? "good with dogs" : "",
                d.cats ? "good with cats" : "",
                "adopt adoption dog puppy rescue waiting"].join(" ")
          };
        });
      }
    }
  ];

  /* Orders live in the browser, not in a file.
     Order items carry a product id, not a name, so resolve through the
     catalogue - otherwise an order containing a hoodie is only findable
     by typing "hood1", which nobody does. */
  function orderEntries() {
    var raw;
    try { raw = JSON.parse(localStorage.getItem("pfa_orders") || "[]"); }
    catch (e) { return []; }
    if (!raw || !raw.length) return [];
    var cat = window.PFA_PRODUCTS || {};
    return raw.map(function (o) {
      var when = o.ts ? new Date(o.ts).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";
      var n = (o.items || []).reduce(function (a, i) { return a + (i.qty || 1); }, 0);
      var names = (o.items || []).map(function (i) {
        var p = cat[i.id];
        return p ? p.name : (i.name || i.id || "");
      });
      var lead = names.length ? names.slice(0, 2).join(", ") + (names.length > 2 ? " and " + (names.length - 2) + " more" : "") : "";
      return {
        t: "Order " + o.id, p: "Store", type: "Order",
        u: STORE + "#/order/" + o.id,
        s: [when, n + " item" + (n === 1 ? "" : "s"), lead, o.total ? inr(o.total) : ""]
             .filter(Boolean).join(" - ") + ".",
        k: [o.id, "order", "tracking", "delivery", "receipt", "parcel", "my order", "purchase", "bought",
            names.join(" "),
            (o.items || []).map(function (i) { return i.id; }).join(" "),
            o.addr && o.addr.city ? o.addr.city : ""].join(" ")
      };
    });
  }

  /* ----------------------------------------------------------------
     3. Index assembly
     ---------------------------------------------------------------- */
  var INDEX = PAGES.map(function (e) { e.type = e.type || "Page"; return e; });
  var loaded = {}, loading = null;

  function loadScript(src) {
    return new Promise(function (res) {
      if (loaded[src]) return res(true);
      if (document.querySelector('script[src="' + src + '"]')) { loaded[src] = 1; return res(true); }
      var s = document.createElement("script");
      s.src = src;
      s.onload = function () { loaded[src] = 1; res(true); };
      s.onerror = function () { res(false); };
      document.head.appendChild(s);
    });
  }

  function hydrate() {
    if (loading) return loading;
    loading = Promise.all(SOURCES.map(function (src) {
      if (window[src.global]) return Promise.resolve(src);
      return loadScript(src.file).then(function () { return src; });
    })).then(function (srcs) {
      srcs.forEach(function (src) {
        var data = window[src.global];
        if (!data) return;
        if (INDEX.some(function (e) { return e.type === src.type; })) return;
        try { INDEX = INDEX.concat(src.build(data)); }
        catch (e) { if (window.console) console.warn("PFA search: could not index " + src.global, e); }
      });
      INDEX = INDEX.filter(function (e) { return e.type !== "Order"; }).concat(orderEntries());
      VOCAB = null;
      return INDEX;
    });
    return loading;
  }

  /* ----------------------------------------------------------------
     4. Matching
     ---------------------------------------------------------------- */
  function norm(s) { return (s || "").toString().toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim(); }
  function tokens(s) { return norm(s).split(" ").filter(Boolean); }

  function lev(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    var i, j, prev = [], cur = [];
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      for (j = 1; j <= b.length; j++)
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }

  function fuzzyHit(q, word) {
    if (word.indexOf(q) === 0) return 1;
    if (word.indexOf(q) > -1) return 0.8;
    if (q.length < 4) return 0;
    return lev(q, word) <= (q.length >= 8 ? 2 : 1) ? 0.6 : 0;
  }

  /* A named thing should beat the page that lists it. */
  var TYPE_BOOST = { Order: 1.35, Pet: 1.2, Product: 1.15, Service: 1.15, Unit: 1.1, Page: 1 };

  function score(entry, qTokens, raw) {
    var title = norm(entry.t), keys = norm(entry.k), body = norm(entry.s);
    var total = 0, matched = 0;
    if (raw.length > 2 && title.indexOf(raw) > -1) total += 60;
    if (raw.length > 2 && keys.indexOf(raw) > -1) total += 20;
    var tw = title.split(" "), kw = keys.split(" "), bw = body.split(" ");
    qTokens.forEach(function (q) {
      var best = 0, k;
      for (k = 0; k < tw.length; k++) best = Math.max(best, 30 * fuzzyHit(q, tw[k]));
      for (k = 0; k < kw.length; k++) best = Math.max(best, 18 * fuzzyHit(q, kw[k]));
      for (k = 0; k < bw.length; k++) best = Math.max(best, 8 * fuzzyHit(q, bw[k]));
      if (best > 0) matched++;
      total += best;
    });
    if (!matched) return 0;
    if (matched === qTokens.length && qTokens.length > 1) total *= 1.5;
    return total * (TYPE_BOOST[entry.type] || 1);
  }

  function search(query) {
    var raw = norm(query);
    if (raw.length < 2) return [];
    var qTokens = tokens(query), hits = [];
    INDEX.forEach(function (e) {
      var sc = score(e, qTokens, raw);
      if (sc > 0) hits.push({ e: e, sc: sc });
    });
    hits.sort(function (a, b) { return b.sc - a.sc; });
    return hits.slice(0, 12).map(function (h) { return h.e; });
  }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function highlight(text, qTokens) {
    var out = esc(text);
    qTokens.forEach(function (q) {
      if (q.length < 2) return;
      out = out.replace(new RegExp("(" + q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig"), "<mark>$1</mark>");
    });
    return out;
  }

  var VOCAB = null;
  function vocab() {
    if (VOCAB) return VOCAB;
    var set = {};
    INDEX.forEach(function (e) {
      tokens(e.t + " " + e.k).forEach(function (w) { if (w.length >= 4) set[w] = 1; });
    });
    return (VOCAB = Object.keys(set));
  }
  function didYouMean(query) {
    var qT = tokens(query), best = null;
    qT.forEach(function (q) {
      if (q.length < 3) return;
      vocab().forEach(function (w) {
        var d = lev(q, w);
        if (d > 0 && d <= 2 && d < q.length && (!best || d < best.d)) best = { d: d, from: q, to: w };
      });
    });
    return best ? qT.map(function (t) { return t === best.from ? best.to : t; }).join(" ") : null;
  }

  var RKEY = "pfa.recent";
  function loadRecents() { try { return JSON.parse(localStorage.getItem(RKEY) || "[]").slice(0, 5); } catch (e) { return []; } }
  function saveRecent(q) {
    q = (q || "").trim();
    if (q.length < 2) return;
    try {
      var r = loadRecents().filter(function (x) { return x.toLowerCase() !== q.toLowerCase(); });
      r.unshift(q);
      localStorage.setItem(RKEY, JSON.stringify(r.slice(0, 5)));
    } catch (e) {}
  }

  /* ----------------------------------------------------------------
     5. UI
     ---------------------------------------------------------------- */
  var panel, input, results, scrim, bar, barInput, sel = -1, current = [], _scrollY = 0;

  var PLURAL = {
    Page: "Pages", Product: "Products", Pet: "Animals waiting",
    Service: "Services and doctors", Unit: "PFA units", Order: "Your orders"
  };

  var PAGE = (window.location.pathname.split("/").pop() || "").toLowerCase();
  var SUGGESTIONS =
    PAGE.indexOf("store") > -1 ? ["hoodie", "coach jacket", "my orders", "treats", "patron price"] :
    PAGE.indexOf("adopt") > -1 ? ["puppy", "good with kids", "bengaluru", "small dog"] :
    PAGE.indexOf("services") > -1 ? ["emergency vet", "open now", "boarding", "ambulance"] :
    PAGE.indexOf("network") > -1 ? ["near me", "on call", "wildlife", "ambulance"] :
    ["emergency vet", "adopt", "donate", "hoodie", "my orders"];

  function lockScroll() {
    _scrollY = window.scrollY || window.pageYOffset;
    var b = document.body.style;
    b.position = "fixed"; b.top = -_scrollY + "px"; b.left = "0"; b.right = "0"; b.width = "100%"; b.overflow = "hidden";
  }
  function unlockScroll() {
    var b = document.body.style;
    b.position = ""; b.top = ""; b.left = ""; b.right = ""; b.width = ""; b.overflow = "";
    document.body.offsetHeight;
    var r = document.documentElement, prev = r.style.scrollBehavior;
    r.style.scrollBehavior = "auto";
    window.scrollTo(0, _scrollY);
    r.style.scrollBehavior = prev;
  }

  function open(seed) {
    scrim.classList.add("on");
    panel.classList.add("on");
    lockScroll();
    input.value = seed || "";
    render(input.value);
    hydrate().then(function () { if (panel.classList.contains("on")) render(input.value); });
    setTimeout(function () { input.focus(); }, 60);
  }
  function close() {
    scrim.classList.remove("on");
    panel.classList.remove("on");
    unlockScroll();
    input.value = "";
    if (barInput) barInput.value = "";
    sel = -1;
  }

  function render(q) {
    var qTokens = tokens(q);
    current = search(q);
    sel = -1;

    if (q.trim()) {
      if (current.length) {
        var order = [], groups = {};
        current.forEach(function (e) {
          var g = e.type || "Page";
          if (!groups[g]) { groups[g] = []; order.push(g); }
          groups[g].push(e);
        });
        var i = 0, html = "";
        order.forEach(function (g) {
          html += '<p class="pfa-group">' + esc(PLURAL[g] || g) + "</p>";
          html += groups[g].map(function (e) {
            var row = '<a class="pfa-res" href="' + e.u + '" data-i="' + i + '" role="option">' +
              '<span class="pfa-rtop"><span class="pfa-rt">' + highlight(e.t, qTokens) + "</span>" +
              '<span class="pfa-rp">' + esc(e.p) + "</span></span>" +
              '<span class="pfa-rs">' + highlight(e.s, qTokens) + "</span></a>";
            i++;
            return row;
          }).join("");
        });
        results.innerHTML = html;
        Array.prototype.forEach.call(results.querySelectorAll(".pfa-res"), function (node) {
          node.addEventListener("mouseenter", function () {
            sel = parseInt(node.getAttribute("data-i"), 10);
            paint();
          });
        });
      } else {
        var dym = didYouMean(q);
        results.innerHTML = '<div class="pfa-empty"><b>Nothing for &ldquo;' + esc(q) + "&rdquo;</b>" +
          (dym ? '<button class="pfa-dym" type="button" data-q="' + esc(dym) + '">Did you mean <b>' + esc(dym) + "</b>?</button>" : "Try a different word.") +
          '<div class="pfa-hintrow">' + SUGGESTIONS.map(function (s) {
            return '<button class="pfa-hint" data-q="' + esc(s) + '">' + esc(s) + "</button>";
          }).join("") + "</div></div>";
        bindHints();
        var dy = results.querySelector(".pfa-dym");
        if (dy) dy.addEventListener("click", function () {
          input.value = dy.getAttribute("data-q"); render(input.value); input.focus();
        });
      }
    } else {
      var rec = loadRecents();
      var recHtml = rec.length
        ? '<p class="pfa-sect">Recent <button class="pfa-clear" type="button">Clear</button></p><div class="pfa-hintrow left">' +
          rec.map(function (s) { return '<button class="pfa-hint" data-q="' + esc(s) + '">' + esc(s) + "</button>"; }).join("") + "</div>"
        : "";
      results.innerHTML = '<div class="pfa-empty">' + recHtml +
        "<b>Search everything</b>Pages, products, animals waiting, vets, units and your orders." +
        '<div class="pfa-hintrow">' + SUGGESTIONS.map(function (s) {
          return '<button class="pfa-hint" data-q="' + esc(s) + '">' + esc(s) + "</button>";
        }).join("") + "</div></div>";
      bindHints();
      var cl = results.querySelector(".pfa-clear");
      if (cl) cl.addEventListener("click", function () {
        try { localStorage.removeItem(RKEY); } catch (e) {}
        render("");
      });
    }
  }

  function bindHints() {
    Array.prototype.forEach.call(results.querySelectorAll(".pfa-hint"), function (btn) {
      btn.addEventListener("click", function () {
        input.value = btn.getAttribute("data-q");
        render(input.value);
        input.focus();
      });
    });
  }

  function paint() {
    Array.prototype.forEach.call(results.querySelectorAll(".pfa-res"), function (n) {
      n.classList.toggle("on", parseInt(n.getAttribute("data-i"), 10) === sel);
    });
  }
  function scrollSel() {
    var n = results.querySelector('.pfa-res[data-i="' + sel + '"]');
    if (n && n.scrollIntoView) n.scrollIntoView({ block: "nearest" });
  }
  function onKeys(e) {
    var rows = results.querySelectorAll(".pfa-res");
    if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(sel + 1, rows.length - 1); paint(); scrollSel(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(sel - 1, 0); paint(); scrollSel(); }
    else if (e.key === "Enter") {
      var target = sel >= 0 ? rows[sel] : rows[0];
      if (target) { saveRecent(input.value); window.location.href = target.getAttribute("href"); }
    } else if (e.key === "Escape") { e.preventDefault(); close(); }
  }

  var CSS = [
    ".pfa-scrim{position:fixed;inset:0;background:rgba(14,17,22,.44);opacity:0;pointer-events:none;transition:opacity .22s ease;z-index:1200;-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px)}",
    ".pfa-scrim.on{opacity:1;pointer-events:auto}",
    ".pfa-panel{position:fixed;top:0;left:50%;transform:translate(-50%,-12px);width:min(680px,calc(100vw - 32px));margin-top:11vh;background:#fff;border:1px solid rgba(14,17,22,.14);box-shadow:0 40px 90px -30px rgba(14,17,22,.4);opacity:0;pointer-events:none;transition:opacity .2s ease,transform .2s cubic-bezier(.2,.85,.25,1);z-index:1201;display:flex;flex-direction:column;max-height:78vh}",
    ".pfa-panel.on{opacity:1;pointer-events:auto;transform:translate(-50%,0)}",
    ".pfa-panel *{box-sizing:border-box;border-radius:0!important}",
    ".pfa-sbar{display:flex;align-items:center;gap:14px;padding:18px 22px;border-bottom:1px solid rgba(14,17,22,.14);flex:none}",
    ".pfa-sq{width:10px;height:10px;background:#00A4FF;flex:none}",
    ".pfa-sbar input{flex:1;border:0;outline:0;font-family:'Archivo',system-ui,sans-serif;font-size:17px;color:#0E1116;background:0 0;min-width:0}",
    ".pfa-sbar input::placeholder{color:#7A848D}",
    ".pfa-esc{border:1px solid rgba(14,17,22,.14);background:0 0;font-family:inherit;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#7A848D;padding:7px 10px;cursor:pointer;flex:none}",
    ".pfa-esc:hover{border-color:#0E1116;color:#0E1116}",
    ".pfa-results{overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}",
    ".pfa-group{font-family:'Marcellus',Georgia,serif;font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:#7A848D;padding:16px 22px 8px;border-top:1px solid rgba(14,17,22,.08)}",
    ".pfa-results>.pfa-group:first-child{border-top:0}",
    ".pfa-res{display:block;padding:13px 22px;border-left:2px solid transparent;cursor:pointer;text-decoration:none}",
    ".pfa-res.on,.pfa-res:hover{background:#F4F6F7;border-left-color:#00A4FF}",
    ".pfa-rtop{display:flex;align-items:baseline;justify-content:space-between;gap:16px}",
    ".pfa-rt{font-size:15px;font-weight:600;color:#0E1116;line-height:1.3}",
    ".pfa-rp{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#7A848D;flex:none;white-space:nowrap;max-width:45%;overflow:hidden;text-overflow:ellipsis}",
    ".pfa-rs{font-size:13px;color:#55606A;margin-top:3px;line-height:1.45;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}",
    ".pfa-res mark{background:#DFF0FF;color:inherit;font-weight:600}",
    ".pfa-empty{padding:44px 22px;text-align:center;color:#55606A;font-size:14px}",
    ".pfa-empty b{display:block;font-size:16px;color:#0E1116;margin-bottom:6px}",
    ".pfa-hintrow{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:20px}",
    ".pfa-hint{border:1px solid rgba(14,17,22,.14);padding:11px 15px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#55606A;cursor:pointer;background:#fff;font-family:inherit}",
    ".pfa-hint:hover{border-color:#006DB3;color:#006DB3}",
    ".pfa-sect{display:flex;align-items:center;justify-content:space-between;gap:14px;font-family:inherit;font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:#7A848D;text-align:left;margin-bottom:12px}",
    ".pfa-clear{background:0 0;border:0;cursor:pointer;font-family:inherit;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#7A848D;padding:8px 0 8px 12px}",
    ".pfa-clear:hover{color:#0E1116}",
    ".pfa-hintrow.left{justify-content:flex-start;margin-bottom:26px;margin-top:0}",
    ".pfa-dym{display:block;margin:14px auto 0;background:0 0;border:1px solid #006DB3;color:#006DB3;cursor:pointer;font-family:inherit;font-size:13px;padding:11px 16px}",
    ".pfa-dym:hover{background:#F4F6F7}",
    ".pfa-foot{display:flex;gap:18px;padding:12px 22px;border-top:1px solid rgba(14,17,22,.14);font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#7A848D;flex-wrap:wrap;flex:none}",

    /* the visible bar in the nav */
    ".pfa-searchbar{flex:1 1 auto;display:flex;align-items:center;gap:10px;min-width:0;max-width:400px;height:42px;padding:0 14px;background:#F4F6F7;border:1px solid rgba(14,17,22,.08);cursor:text;transition:border-color .2s ease,background .2s ease}",
    ".pfa-searchbar:hover{border-color:rgba(14,17,22,.22);background:#fff}",
    ".pfa-searchbar input{flex:1 1 auto;width:auto;min-width:0;height:100%;margin:0;padding:0;border:0;outline:0;background:0 0;box-shadow:none;-webkit-appearance:none;appearance:none;font-family:inherit;font-size:13px;line-height:normal;color:#0E1116;cursor:text}",
    ".pfa-searchbar input:focus{border:0;outline:0;box-shadow:none;background:0 0}",
    ".pfa-searchbar input::placeholder{color:#7A848D}",
    ".pfa-searchbar kbd{flex:none;font-family:inherit;font-size:10px;letter-spacing:.06em;color:#7A848D;border:1px solid rgba(14,17,22,.14);padding:3px 6px;background:#fff}",
    ".pfa-searchbar .pfa-mag{flex:none;color:#7A848D}",
    ".pfa-sicon{display:none;flex:none;width:44px;height:44px;align-items:center;justify-content:center;background:0 0;border:1px solid rgba(14,17,22,.14);cursor:pointer;color:#0E1116}",
    ".pfa-sicon:hover{border-color:#0E1116}",
    ".pfa-nav-in .pfa-links{margin-left:0}",
    "@media (max-width:1180px){.pfa-searchbar{display:none}.pfa-sicon{display:flex;margin-left:auto}.pfa-nav-in .pfa-links{margin-left:12px}}",
    "@media (max-width:1023px){.pfa-sicon{margin-left:auto}}",
    "@media (max-width:600px){.pfa-panel{width:100%;margin-top:0;max-height:100vh;height:100vh}.pfa-foot{display:none}.pfa-sbar input{font-size:16px}}",
    "@media (max-height:480px){.pfa-sbar{padding:12px 18px}.pfa-res{padding:11px 18px}.pfa-foot{display:none}}",
    "@media (prefers-reduced-motion:reduce){.pfa-scrim,.pfa-panel{transition:none}}",
    ".pfa-prog{position:fixed;top:0;left:0;height:2px;background:#00A4FF;width:0;z-index:1400;pointer-events:none;transition:width .1s linear}",
    ".pfa-flash{animation:pfaFlash 1.8s ease}",
    "@keyframes pfaFlash{0%,100%{background:transparent}18%{background:#DFF0FF}}"
  ].join("");

  var MAG = '<svg class="pfa-mag" width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true" focusable="false"><circle cx="6.2" cy="6.2" r="4.6" stroke="currentColor" stroke-width="1.6"/><path d="M9.7 9.7 L14 14" stroke="currentColor" stroke-width="1.6"/></svg>';

  function init() {
    var st = document.createElement("style");
    st.textContent = CSS;
    document.head.appendChild(st);

    scrim = document.createElement("div");
    scrim.className = "pfa-scrim";
    panel = document.createElement("div");
    panel.className = "pfa-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Search People for Animals");
    panel.innerHTML =
      '<div class="pfa-sbar"><span class="pfa-sq"></span>' +
      '<input type="text" id="pfa-sinput" autocomplete="off" spellcheck="false" placeholder="Search pages, products, animals, vets, units, orders" aria-label="Search">' +
      '<button class="pfa-esc" id="pfa-sesc">Esc</button></div>' +
      '<div class="pfa-results" id="pfa-sresults" role="listbox"></div>' +
      '<div class="pfa-foot"><span>Enter to open</span><span>Up and down to move</span><span>Esc to close</span></div>';
    document.body.appendChild(scrim);
    document.body.appendChild(panel);

    input = panel.querySelector("#pfa-sinput");
    results = panel.querySelector("#pfa-sresults");
    results.addEventListener("click", function (e) {
      if (e.target.closest(".pfa-res")) saveRecent(input.value);
    });
    scrim.addEventListener("click", close);
    panel.querySelector("#pfa-sesc").addEventListener("click", close);
    input.addEventListener("input", function () { render(input.value); });
    input.addEventListener("keydown", onKeys);

    /* Mount the visible bar. The nav markup is .pfa-nav-in - the old build
       looked for .nav-inner, which is why the trigger never rendered. */
    var nav = document.querySelector(".pfa-nav-in") || document.querySelector(".nav-inner");
    if (nav) {
      bar = document.createElement("div");
      bar.className = "pfa-searchbar";
      bar.innerHTML = MAG + '<input type="text" readonly placeholder="Search PFA" aria-label="Search PFA"><kbd>/</kbd>';
      barInput = bar.querySelector("input");

      var icon = document.createElement("button");
      icon.className = "pfa-sicon";
      icon.setAttribute("aria-label", "Search PFA");
      icon.innerHTML = MAG;

      var openFromBar = function (e) {
        if (e) e.preventDefault();
        open("");
      };
      bar.addEventListener("click", openFromBar);
      barInput.addEventListener("focus", openFromBar);
      icon.addEventListener("click", openFromBar);
      bar.addEventListener("mouseenter", hydrate);
      icon.addEventListener("mouseenter", hydrate);

      var links = nav.querySelector(".pfa-links"),
          burger = nav.querySelector(".pfa-burger") || nav.querySelector("#burger");
      if (links) { nav.insertBefore(bar, links); nav.insertBefore(icon, links); }
      else if (burger) { nav.insertBefore(bar, burger); nav.insertBefore(icon, burger); }
      else { nav.appendChild(bar); nav.appendChild(icon); }
    }

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && panel.classList.contains("on")) { e.preventDefault(); return close(); }
      var ae = document.activeElement;
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && ae !== barInput;
      if ((e.key === "/" && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        open("");
      }
    });
  }

  function chrome() {
    var prog = document.createElement("div");
    prog.className = "pfa-prog";
    prog.setAttribute("aria-hidden", "true");
    document.body.appendChild(prog);
    var nav = document.querySelector("header.pfa-nav") || document.querySelector("header.nav"), ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var max = document.documentElement.scrollHeight - window.innerHeight;
        prog.style.width = (max > 0 ? (window.scrollY / max) * 100 : 0) + "%";
        if (nav) nav.classList.toggle("scrolled", window.scrollY > 12);
        ticking = false;
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
  }

  function landOnHash() {
    var h = window.location.hash;
    if (!h || h.length < 2 || h.indexOf("#/") === 0) return;
    var el;
    try { el = document.querySelector(h); } catch (e) { return; }
    if (!el) return;
    el.classList.add("pfa-flash");
    setTimeout(function () { el.classList.remove("pfa-flash"); }, 1900);
  }

  function boot() {
    try {
      init();
      chrome();
      landOnHash();
      window.addEventListener("hashchange", landOnHash);
    } catch (err) {
      if (window.console) console.error("PFA search failed to start:", err);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
