#!/usr/bin/env node
/* ============================================================
   rehost.js - pull every supplier image onto PFA media and
   rewrite the data modules to point at the local copies.

   Run from the project root, where store.html lives:
       node rehost.js            download + rewrite
       node rehost.js --dry      report only, touch nothing
       node rehost.js --force    re-download even if present

   Why this exists: the product and pharmacy modules reference
   ~300 images across three suppliers' CDNs (fingrella, shopify,
   zigly). Hotlinked images fail cross-origin the moment they
   leave localhost, and the ?v= stamps rotate whenever a supplier
   re-uploads. Both failures are silent - the store just shows
   gaps, and nobody finds out until a donor screenshots it.

   Safe to re-run. Existing files are skipped, so a partial or
   interrupted run resumes cleanly. The data modules are only
   rewritten once every image is present locally, and the
   originals are kept as <module>.bak.
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const crypto = require("crypto");

const DRY = process.argv.includes("--dry");
const FORCE = process.argv.includes("--force");
const OUT = path.join("media", "store");
const MODULES = ["pfa-store-data.js", "pfa-apparel-data.js", "pfa-pets-data.js", "pfa-pharmacy-data.js"];

const CONCURRENCY = 6;      // parallel downloads
const TIMEOUT_MS = 20000;   // per attempt
const RETRIES = 3;          // attempts per image before giving up
const MIN_BYTES = 512;      // anything smaller is almost certainly an error page

const EXT_BY_TYPE = {
  "image/jpeg": ".jpg", "image/jpg": ".jpg", "image/png": ".png",
  "image/webp": ".webp", "image/gif": ".gif", "image/avif": ".avif", "image/svg+xml": ".svg"
};

/* Load modules the way the browser does, then read their URLs.
   Regex over the source would miss any built as CDN + filename. */
function collect() {
  global.window = { PFA_PRODUCTS: {} };
  for (const m of MODULES) {
    const p = path.resolve(m);
    if (!fs.existsSync(p)) continue;      // store-data may be the only base; others are additive
    delete require.cache[p];
    require(p);
  }
  const urls = new Set();
  Object.values(global.window.PFA_PRODUCTS || {}).forEach(function (p) {
    if (p.imgs) Object.values(p.imgs).forEach(function (l) {
      (Array.isArray(l) ? l : [l]).forEach(function (u) { if (/^https?:/.test(u)) urls.add(u); });
    });
    if (p.img && /^https?:/.test(p.img)) urls.add(p.img);
    if (p.shots) (Array.isArray(p.shots) ? p.shots : []).forEach(function (u) { if (/^https?:/.test(u)) urls.add(u); });
  });
  Object.values(global.window.PFA_PHARMACY || {}).forEach(function (m) {
    if (m.img && /^https?:/.test(m.img)) urls.add(m.img);
  });
  return [...urls];
}

/* Stable, human-ish local name; hash the full URL so two suppliers
   cannot collide on a name like "98_20.jpg" and a rotated ?v= maps
   to a genuinely different file. Extension may be corrected after
   the response content-type is known. */
function localName(u, typeExt) {
  const clean = u.split("?")[0];
  const urlExt = (clean.match(/\.(jpe?g|png|webp|gif|avif|svg)$/i) || [""])[0].toLowerCase().replace("jpeg", "jpg");
  const ext = typeExt || urlExt || ".jpg";
  const stem = path.basename(clean, path.extname(clean))
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "img";
  const h = crypto.createHash("sha1").update(u).digest("hex").slice(0, 8);
  return stem + "-" + h + ext;
}

function fetchOnce(url, redirects) {
  redirects = redirects || 0;
  return new Promise(function (resolve, reject) {
    if (redirects > 5) return reject(new Error("too many redirects"));
    const lib = url.startsWith("http://") ? http : https;
    const req = lib.get(url, { headers: { "User-Agent": "Mozilla/5.0 (PFA rehost)", "Accept": "image/*,*/*" } }, function (res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(fetchOnce(new URL(res.headers.location, url).href, redirects + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error("HTTP " + res.statusCode)); }
      const type = (res.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
      if (type && !/^image\//.test(type)) { res.resume(); return reject(new Error("not an image: " + type)); }
      const chunks = [];
      res.on("data", function (c) { chunks.push(c); });
      res.on("end", function () { resolve({ buf: Buffer.concat(chunks), ext: EXT_BY_TYPE[type] || null }); });
    });
    req.setTimeout(TIMEOUT_MS, function () { req.destroy(new Error("timeout after " + TIMEOUT_MS + "ms")); });
    req.on("error", reject);
  });
}

async function fetchRetry(url) {
  let last;
  for (let a = 1; a <= RETRIES; a++) {
    try { return await fetchOnce(url); }
    catch (e) { last = e; if (a < RETRIES) await new Promise(function (r) { setTimeout(r, 400 * a); }); }
  }
  throw last;
}

async function pool(items, n, worker) {
  const q = items.slice(); let active = 0;
  return new Promise(function (resolve) {
    const results = [];
    function next() {
      if (!q.length && active === 0) return resolve(results);
      while (active < n && q.length) {
        const item = q.shift(); active++;
        Promise.resolve(worker(item)).then(function (r) { results.push(r); }).catch(function () {}).finally(function () { active--; next(); });
      }
    }
    next();
  });
}

(async function () {
  const urls = collect();
  const hosts = {};
  urls.forEach(function (u) { const h = u.split("/")[2]; hosts[h] = (hosts[h] || 0) + 1; });
  console.log(urls.length + " images across " + Object.keys(hosts).length + " supplier hosts");
  Object.entries(hosts).sort(function (a, b) { return b[1] - a[1]; }).forEach(function (e) { console.log("  " + e[0].padEnd(24) + e[1]); });

  // provisional local names from the URL; corrected after download if content-type disagrees
  const map = {};
  urls.forEach(function (u) { map[u] = path.posix.join(OUT, localName(u)); });

  if (DRY) {
    console.log("\ndry run. would write into " + OUT + "/ , for example:");
    urls.slice(0, 3).forEach(function (u) { console.log("  " + u.slice(0, 62) + "...\n    -> " + map[u]); });
    console.log("\nrerun without --dry to download and rewrite.");
    return;
  }

  fs.mkdirSync(OUT, { recursive: true });
  let ok = 0, skip = 0, done = 0;
  const failed = [];
  const finalMap = {};   // url -> actual local posix path written

  await pool(urls, CONCURRENCY, async function (u) {
    done++;
    process.stdout.write("\r  " + done + "/" + urls.length + "   ");
    const provisional = map[u];
    if (!FORCE && fs.existsSync(provisional) && fs.statSync(provisional).size >= MIN_BYTES) { skip++; finalMap[u] = provisional; return; }
    try {
      const r = await fetchRetry(u);
      if (r.buf.length < MIN_BYTES) throw new Error("suspiciously small: " + r.buf.length + " bytes");
      const dest = path.posix.join(OUT, localName(u, r.ext));   // correct ext from content-type if known
      fs.writeFileSync(dest, r.buf);
      finalMap[u] = dest;
      ok++;
    } catch (e) {
      failed.push({ url: u, why: e.message });
    }
  });

  console.log("\n  downloaded " + ok + ", already present " + skip + ", failed " + failed.length);
  if (failed.length) {
    console.log("\nFAILED - these stay pointed at the supplier, fix before launch:");
    failed.slice(0, 40).forEach(function (f) { console.log("  " + f.why.padEnd(24) + f.url.slice(0, 90)); });
    if (failed.length > 40) console.log("  ... and " + (failed.length - 40) + " more");
  }

  // write a manifest for auditing regardless of completeness
  try { fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(finalMap, null, 1)); } catch (e) {}

  /* Rewrite only when every image is present locally. Flipping a module
     while any image is missing would point the store at files that are
     not there - the exact silent gap this script exists to prevent.
     Partial runs are resumable, so the fix is to rerun, not half-rewrite. */
  if (Object.keys(finalMap).length !== urls.length) {
    console.log("\nNOT rewriting: " + (urls.length - Object.keys(finalMap).length) + " of " + urls.length + " images still missing.");
    console.log("Everything downloaded so far is kept (and in manifest.json). Fix the failures above and rerun.");
    return;
  }

  let totalReplaced = 0;
  for (const m of MODULES) {
    if (!fs.existsSync(m)) continue;
    let src = fs.readFileSync(m, "utf8");
    const before = src;
    Object.keys(finalMap).forEach(function (u) {
      if (src.indexOf(u) !== -1) { src = src.split(u).join(finalMap[u]); totalReplaced++; }
    });
    if (src !== before) {
      fs.writeFileSync(m + ".bak", before);
      fs.writeFileSync(m, src);
      console.log("  rewrote " + m + "  (original kept as " + m + ".bak)");
    }
  }
  console.log("  rewrote " + totalReplaced + " url references");

  const left = collect().filter(function (u) { return /^https?:/.test(u); });
  console.log("\nremaining third-party urls: " + left.length);
  if (left.length) left.slice(0, 10).forEach(function (u) { console.log("  " + u); });
  else console.log("every image now served from " + OUT + "/. Commit media/store and the rewritten modules.");
})();
