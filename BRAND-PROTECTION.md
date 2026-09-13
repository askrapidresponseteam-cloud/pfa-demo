# Impersonation and donation fraud

The look and feel of this site cannot be protected. Everything a browser
renders has already been sent to the visitor's machine, and a copy is a
"Save page as" away. Every technical measure aimed at preventing that costs
accessibility, search ranking and real users while stopping nobody. The
right-click block in `assets/chrome.js` is an example: it blocks copying a
phone number on a phone, which is the thing this site most needs to allow,
and it does not stop anyone who wants the CSS.

Being imitated is mostly harmless. The risk that is not harmless is someone
cloning this site closely enough to **collect donations in our name**. That
is a different problem, and it has three answers: own the names, watch the
names, and publish something a donor can check against.

The third is done, in code. The first two are procurement and a habit.

---

## 1. What is in the repository

| Thing | Where | What it is for |
|---|---|---|
| The domains, payment hosts and warnings | `lib/official-channels.js` | One source. Every published copy is pinned to it. |
| The donor-facing statement | `donate.html#verify` | What someone one click from paying can check the page against. |
| The pointer to it | `assets/chrome-footer.html` | On all nineteen pages, so it is reachable from wherever a donor is standing. |
| The reporting address | `.well-known/security.txt` | Where a registrar, a bank's fraud desk or a researcher looks. |
| The monitor | `scripts/check-lookalikes.js` | `npm run check:lookalikes` |
| The checks | `test/impersonation.test.js` | Fails if any published copy drifts from the source. |

Change a domain or a payment rail in `lib/official-channels.js` and the tests
will tell you every page that now disagrees.

---

## 2. Own the names (not code: someone has to buy these)

A donor who mistypes should land on us, not on a parked page waiting to be
sold to someone who will use it. Registration is a few hundred rupees a year
each and is the single highest-value thing on this page.

Run the monitor first, because it tells you which of these are already gone:

```
npm run check:lookalikes -- --all
```

Register, in this order:

1. **`peopleforanimalsindia.com`** and **`.in`**. The two a donor types by
   habit. If either is already held by someone else, that is the first thing
   to look at, not the last.
2. **`.co.in`, `.org.in`, `.net`.** The rest of the obvious set.
3. **The spoken forms**: `people-for-animals-india.org`,
   `peopleforanimals.org`, `pfaindia.org`. These are what a convincing clone
   is built on, because they read as a plausible official address.
4. **The near misses the monitor reports as free.** Not all of them. The ones
   a person could actually type.

Point every one of them at a 301 to `https://peopleforanimalsindia.org`. A
redirect is enough; they do not need pages.

Two settings on the real domain, once, at the registrar:

- **Registrar lock** (`clientTransferProhibited`). Without it a domain can be
  moved out from under you with a leaked email password.
- **Auto-renew, on a card that does not expire before the domain does.** More
  charities lose a domain to a failed renewal than to an attacker, and an
  expired charity domain is bought within hours by people who know exactly
  what the traffic is worth.

And one on mail, because most donation fraud arrives by email rather than by
web: publish **SPF, DKIM and a DMARC policy at `p=reject`** for
`peopleforanimalsindia.org`. Until DMARC is enforcing, anyone can send mail
that genuinely appears to come from our address, and no amount of care on
this website affects that.

---

## 3. Watch the names

```
npm run check:lookalikes            # the ones that exist
npm run check:lookalikes -- --all   # every candidate, including the free ones
npm run check:lookalikes -- --json  # for a cron or a spreadsheet
```

It generates the names a person could mistake for ours, asks DNS which of
them exist, and reports the hits. It needs no key and no account.

**Read the second column, not the first.** A name that merely resolves is
usually a parking page or a registrar. A name marked `LOOK TODAY` accepts
mail, which means someone can put our wording in a donor's inbox from an
address that passes every check a mail client makes. That is the one to open
the same day.

Run it monthly, and run it the week before any campaign that will put the
donate page in front of a lot of new people. That is when a clone pays for
itself and when one is most likely to appear.

---

## 4. When you find one

The order matters. Payment first: it stops the money while everything else is
still in progress.

1. **Screenshot everything**, with the URL bar visible, before you report it.
   Clones come down fast once reported and the evidence goes with them.
2. **Tell the payment processor.** If it is taking cards, it has a merchant
   account somewhere, and the acquirer will close it faster than any host
   will act. CCAvenue and PayPal both have fraud desks; a page collecting in
   our name is a matter for them whether or not the account is with them.
3. **Report to the host and the registrar.** `whois` the domain for both.
   Point them at `https://peopleforanimalsindia.org/.well-known/security.txt`
   and at `donate#verify`: a published statement of which domains are ours
   makes their decision easy, which is the whole reason those two files exist.
4. **Report to Google Safe Browsing** (`safebrowsing.google.com/safebrowsing/report_phish/`)
   and to Microsoft. This puts a red interstitial in front of the site in most
   browsers within hours, which protects donors before the takedown lands.
5. **Say so publicly.** A short post on the site and on the social accounts
   naming the fake domain. Donors who already paid need to know, and it is the
   record that supports a police complaint later.
6. **Trademark, if registered.** A registered mark turns a request into a
   demand, and registrars act on marks far faster than on a claim of copied
   CSS. This is why the trademark is worth more than any code in this
   repository.

**If money has already gone:** tell affected donors to raise it with their
bank as fraud immediately. Card chargeback windows are short and a bank moves
faster than a takedown does. File at `cybercrime.gov.in` and keep the
acknowledgement number; registrars and platforms outside India take a police
reference seriously in a way they do not take an email.

---

## 5. Keeping the file honest

`security.txt` carries an `Expires` date, and an expired one is ignored by the
people who read it. `npm run check:lookalikes` prints a warning when it is
within 45 days, so the reminder arrives while you are already doing this work.

Deliberately **not** a failing test: a red suite blocks the ship, and this
site must never go undeployable because of a date in a text file.
