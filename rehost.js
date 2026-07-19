#!/usr/bin/env node
/* ============================================================
   rehost.js - pull every supplier image onto PFA media and
   rewrite the data modules to point at the local copies.

   Run it from the project root, where store.html lives:
       node rehost.js            download + rewrite
       node rehost.js --dry      report only, touch nothing

   Why this exists: the apparel, pets and worm modules currently
   reference 162 images across two suppliers' Shopify CDNs. Those
   URLs carry ?v= stamps that rotate whenever the supplier
   re-uploads, and a CDN can start refusing cross-origin referrers
   at any time. Both failures are silent - the store just shows
   gaps, and nobody finds out until a donor screenshots it.

   Safe to re-run. Existing files are skipped, so a partial run
   picks up where it stopped.
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");
const https = require("https");
const crypto = require("crypto");

const DRY = process.argv.includes("--dry");
const OUT = path.join("media", "store");
const MODULES = ["pfa-apparel-data.js", "pfa-pets-data.js", "pfa-pharmacy-data.js"];

/* Load the modules the way the browser does, then ask them for their
   URLs. Regex would miss the ones built as CDN + filename. */
function collect() {
  global.window = {};
  for (const m of MODULES) {
    const p = path.resolve(m);
    if (!fs.existsSync(p)) { console.error("missing module: " + m); process.exit(1); }
    delete require.cache[p];
    require(p);
  }
  const urls = new Set();
  Object.values(global.window.PFA_PRODUCTS || {}).forEach(function (p) {
    if (p.imgs) Object.values(p.imgs).forEach(function (l) { l.forEach(function (u) { urls.add(u); }); });
  });
  Object.values(global.window.PFA_PHARMACY || {}).forEach(function (m) {
    if (m.img) urls.add(m.img);
  });
  return [...urls];
}

/* Stable local name: keep something human-readable, but hash the full
   URL so two suppliers can't collide on a name like "98_20.jpg", and so
   a rotated ?v= stamp maps to a genuinely different file. */
function localName(u) {
  const clean = u.split("?")[0];
  const ext = (clean.match(/\.(jpg|jpeg|png|webp|gif)$/i) || [".jpg"])[0].toLowerCase();
  const stem = path.basename(clean, path.extname(clean))
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "img";
  const h = crypto.createHash("sha1").update(u).digest("hex").slice(0, 8);
  return `${stem}-${h}${ext}`;
}

function get(url, redirects) {
  redirects = redirects || 0;
  return new Promise(function (resolve, reject) {
    if (redirects > 5) return reject(new Error("too many redirects"));
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0", Accept: "image/*" } }, function (res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(get(new URL(res.headers.location, url).href, redirects + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error("HTTP " + res.statusCode)); }
      const type = res.headers["content-type"] || "";
      if (!/^image\//.test(type)) { res.resume(); return reject(new Error("not an image: " + type)); }
      const chunks = [];
      res.on("data", function (c) { chunks.push(c); });
      res.on("end", function () { resolve(Buffer.concat(chunks)); });
    }).on("error", reject);
  });
}

(async function () {
  const urls = collect();
  const map = {};
  urls.forEach(function (u) { map[u] = path.posix.join(OUT, localName(u)); });

  const hosts = {};
  urls.forEach(function (u) { const h = u.split("/")[2]; hosts[h] = (hosts[h] || 0) + 1; });
  console.log(urls.length + " images across " + Object.keys(hosts).length + " supplier hosts");
  Object.entries(hosts).forEach(function (e) { console.log("  " + e[0].padEnd(24) + e[1]); });

  if (DRY) {
    console.log("\ndry run. would write into " + OUT + "/ , for example:");
    urls.slice(0, 3).forEach(function (u) { console.log("  " + u.slice(0, 62) + "...\n    -> " + map[u]); });
    console.log("\nrerun without --dry to download and rewrite.");
    return;
  }

  fs.mkdirSync(OUT, { recursive: true });
  let ok = 0, skip = 0;
  const failed = [];
  for (let i = 0; i < urls.length; i++) {
    const u = urls[i], dest = map[u];
    process.stdout.write("\r  " + (i + 1) + "/" + urls.length + "  ");
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) { skip++; continue; }
    try {
      const buf = await get(u);
      if (buf.length < 512) throw new Error("suspiciously small: " + buf.length + " bytes");
      fs.writeFileSync(dest, buf);
      ok++;
    } catch (e) {
      failed.push({ url: u, why: e.message });
    }
  }
  console.log("\n  downloaded " + ok + ", already present " + skip + ", failed " + failed.length);

  if (failed.length) {
    console.log("\nFAILED - these stay pointed at the supplier, fix before launch:");
    failed.forEach(function (f) { console.log("  " + f.why.padEnd(22) + f.url); });
  }

  /* Rewrite only if every image came down. The CDN constant is a single
     switch for a whole module, so flipping it while any image is missing
     would point the store at files that are not there - the exact silent
     gap this script exists to prevent. Partial runs are resumable, so the
     fix is to rerun, not to half-rewrite. */
  const live = {};
  Object.keys(map).forEach(function (u) {
    if (fs.existsSync(map[u]) && fs.statSync(map[u]).size > 0) live[u] = map[u];
  });
  if (Object.keys(live).length !== urls.length) {
    console.log("\nNOT rewriting: " + (urls.length - Object.keys(live).length) +
                " of " + urls.length + " images are missing.");
    console.log("Everything downloaded so far is kept. Fix the failures above and rerun.");
    return;
  }

  for (const m of MODULES) {
    let src = fs.readFileSync(m, "utf8");
    const before = src;
    Object.keys(live).forEach(function (u) {
      const file = u.split("/").pop();
      src = src.split(u).join(live[u]);
      src = src.split('"' + file + '"').join('"' + path.posix.basename(live[u]) + '"');
    });
    // the modules prefix a CDN constant onto bare filenames
    src = src.replace(/var (CDN|LEGACY) = "https?:\/\/[^"]*"/g, 'var $1 = "' + OUT + '/"');
    if (src !== before) {
      fs.writeFileSync(m + ".bak", before);
      fs.writeFileSync(m, src);
      console.log("  rewrote " + m + "  (original kept as " + m + ".bak)");
    }
  }

  const left = collect().filter(function (u) { return /^https?:/.test(u); });
  console.log("\nremaining third-party urls: " + left.length);
  if (left.length) left.slice(0, 10).forEach(function (u) { console.log("  " + u); });
})();
