'use strict';

/* Walks every page and script and reports what would be dead for a visitor:
   a link to a file that is not there, a fragment that no element carries, a
   script or image that 404s, a call to an API route that is not mounted, a
   form nothing listens to, a button nothing handles. Pure file reading, so
   it runs as a test and fails the build the day any of these appear. */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const IGNORE_DIRS = new Set(['node_modules', '.git', 'test', 'scripts', 'docs']);

function walk(dir, out = []) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    if (IGNORE_DIRS.has(e.name) || e.name.startsWith('.')) return;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  });
  return out;
}

const files = walk(ROOT);
const pages = files.filter((f) => f.endsWith('.html') && path.dirname(f) === ROOT);
const scripts = files.filter((f) => f.endsWith('.js') && f.includes(path.join(ROOT, 'assets')));
const read = (f) => fs.readFileSync(f, 'utf8');
const rel = (f) => path.relative(ROOT, f);
const exists = (f) => { try { return fs.statSync(f).isFile(); } catch (_) { return false; } };

/* ---- routes -------------------------------------------------------------- */

function mountedRoutes() {
  const src = read(path.join(ROOT, 'api', 'index.js'));
  const names = new Set();
  [...src.matchAll(/^\s*'([a-z0-9/_-]+)':\s*(?:'\.\/|\(\)\s*=>\s*require)/gm)].forEach((m) => names.add(m[1]));
  return names;
}

/* A URL the site can serve: a file, a rewrite in vercel.json, or an API route. */
function vercelRewrites() {
  try {
    const cfg = JSON.parse(read(path.join(ROOT, 'vercel.json')));
    return (cfg.rewrites || []).map((r) => r.source);
  } catch (_) { return []; }
}

function routeFor(url) {
  const m = /^\/api\/([a-z0-9/_-]+)/i.exec(url);
  return m ? m[1].replace(/\/$/, '') : null;
}

/* ---- pages --------------------------------------------------------------- */

function attrs(html, tag, attr) {
  const out = [];
  const re = new RegExp(`<${tag}\\b[^>]*?\\s${attr}=["']([^"']*)["']`, 'gi');
  let m; while ((m = re.exec(html))) out.push(m[1]);
  return out;
}
function ids(html) {
  return new Set([...html.matchAll(/\sid=["']([^"']+)["']/g)].map((m) => m[1]));
}
function scriptsOf(html) {
  return attrs(html, 'script', 'src').filter((s) => !/^https?:/.test(s)).map((s) => path.join(ROOT, s.replace(/^\//, '')));
}

function markupOf(html) {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, (block) => block.replace(/\/\*[\s\S]*?\*\//g, ' '))
    .replace(/<!--[\s\S]*?-->/g, ' ');
}

function audit() {
  const problems = [];
  /* The filenames media/cinekind-2025/README.md accounts for. Read once, and
     from the same file test/media-present.test.js checks against, so the two
     cannot drift into disagreeing about which absences are known. */
  const documentedMissing = new Set();
  try {
    const readme = fs.readFileSync(path.join(ROOT, 'media', 'cinekind-2025', 'README.md'), 'utf8');
    [...readme.matchAll(/`([^`/]+\.(?:webp|jpg|jpeg|png|mp4|webm))`/g)].forEach((m) => documentedMissing.add(m[1]));
    [...readme.matchAll(/`media\/[^`]*?([^`/]+\.(?:webp|jpg|jpeg|png|mp4|webm))`/g)].forEach((m) => documentedMissing.add(m[1]));
  } catch (_) { /* no README: nothing is documented, so nothing is excused */ }
  const routes = mountedRoutes();
  const rewrites = vercelRewrites();
  const pageIds = new Map(pages.map((p) => [path.basename(p), ids(read(p))]));
  const allJs = scripts.map(read).join('\n') + pages.map((p) => [...read(p).matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join('\n')).join('\n');

  pages.forEach((page) => {
    const html = read(page);
    const name = path.basename(page);
    const inlineJs = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join('\n');
    const pageJs = inlineJs + '\n' + scriptsOf(html).filter(exists).map(read).join('\n');

    /* Links to nowhere. href="#" is only honest when a script assigns the real
       destination later, which founder.html's theatre does, so a bare # counts
       as dead unless the page's own script writes to that element's href.
       Twelve cards and a "Read the sources" link sat like this, looking
       clickable and doing nothing, and the link check never saw them because
       it only ever compared the part before the fragment. */
    [...markupOf(html).matchAll(/<a\b([^>]*href="#")[^>]*>([\s\S]*?)<\/a>/gi)].forEach((tag) => {
      const id = /id="([^"]+)"/.exec(tag[0]);
      const assigned = id
        && new RegExp(`getElementById\\(['"]${id[1]}['"]\\)[\\s\\S]{0,200}\\.href\\s*=`).test(pageJs);
      if (assigned) return;
      const label = tag[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) || '(no text)';
      problems.push(`${name}: link to nowhere, href="#" on "${label}"`);
    });

    /* links */
    attrs(html, 'a', 'href').forEach((href) => {
      if (!href || /^(https?:|mailto:|tel:|javascript:|sms:|whatsapp:|upi:)/i.test(href) || href.includes('${') || href.endsWith('/')) return;
      const [file, frag] = href.split('#');
      if (file && !file.startsWith('/api/')) {
        /* The query is not part of the filename. Only the relative branch used
           to strip it, so a root-absolute link with one - which product.html
           writes, because it is served from /products/<handle> - was looked up
           on disk as "pfa-shop.html?cat=" and reported as a missing page. */
        const bare = file.split('?')[0];
        const target = bare.startsWith('/') ? path.join(ROOT, bare.slice(1)) : path.join(ROOT, bare);
        const isDynamic = rewrites.some((r) => new RegExp('^' + r.replace(/:[a-z]+\*?/g, '.*').replace(/\//g, '\\/') + '$').test('/' + rel(target)));
        if (!exists(target) && !isDynamic && !exists(path.join(target, 'index.html'))) problems.push(`${name}: link to missing page ${href}`);
      }
      if (file && file.startsWith('/api/')) {
        const r = routeFor(file);
        if (r && !routes.has(r)) problems.push(`${name}: link to unmounted API ${file}`);
      }
      if (frag && !/=/.test(frag)) {
        const targetName = file ? path.basename(file.split('?')[0]) : name;
        const targetIds = pageIds.get(targetName);
        const targetJs = file ? (pages.find((p) => path.basename(p) === targetName) ? [...read(pages.find((p) => path.basename(p) === targetName)).matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join('\n') + scriptsOf(read(pages.find((p) => path.basename(p) === targetName))).filter(exists).map(read).join('\n') : '') : pageJs;
        const handledByJs = new RegExp(`['"#]${frag.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}['"=]`).test(targetJs);
        if (targetIds && !targetIds.has(frag) && !handledByJs) problems.push(`${name}: link to ${href} but nothing on ${targetName} has id="${frag}"`);
      }
    });

    /* assets */
    [...attrs(html, 'script', 'src'), ...attrs(html, 'img', 'src'), ...attrs(html, 'link', 'href'), ...attrs(html, 'source', 'src'), ...attrs(html, 'video', 'src'), ...attrs(html, 'video', 'poster')]
      .filter((s) => s && !/^(https?:|data:|\/\/)/.test(s) && !s.includes('${'))
      .forEach((s) => {
        const target = path.join(ROOT, s.replace(/^\//, '').split('?')[0]);
        if (!exists(target)) {
          /* media/ is owned by scripts/check-media.js and test/media-present.test.js,
             which allow a file to be absent provided media/cinekind-2025/README.md
             says what it is and where it should come from. The nine cinekind
             portraits and videos are waiting on photographs PFA has no licence to
             republish, and the page carries onerror handlers that drop the frame.
             Reporting them here as well left two tests disagreeing about the same
             nine files. An undocumented missing file is still a fault. */
          if (documentedMissing.has(path.basename(target))) return;
          problems.push(`${name}: missing asset ${s}`);
        }
      });

    /* API calls made from this page's scripts */
    [...pageJs.matchAll(/['"`](\/api\/[a-z0-9/_-]+)/gi)].forEach((m) => {
      const r = routeFor(m[1]);
      if (r && !routes.has(r)) problems.push(`${name}: calls unmounted API ${m[1]}`);
    });

    /* Markup with comments blanked. A control named in a prose comment is not
       a control on the page: founder.html explains in a JS comment why a tile
       "cannot itself be one big <button>", and that sentence was being read as
       markup and reported as a button with no handler. Block comments are only
       blanked inside <script> and <style>, where they are comments; an HTML
       comment is blanked anywhere, since a commented-out form or button is not
       on the page either. */
    const markup = html
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, (block) => block.replace(/\/\*[\s\S]*?\*\//g, ' '))
      .replace(/<!--[\s\S]*?-->/g, ' ');

    /* forms: something must submit them */
    [...markup.matchAll(/<form\b([^>]*)>/gi)].forEach((m) => {
      const a = m[1];
      const id = (/\sid=["']([^"']+)["']/.exec(a) || [])[1];
      const action = (/\saction=["']([^"']+)["']/.exec(a) || [])[1];
      const data = [...a.matchAll(/\sdata-([a-z-]+)/g)].map((x) => 'data-' + x[1]);
      const cls = ((/\sclass=["']([^"']+)["']/.exec(a) || [])[1] || '').split(/\s+/).filter(Boolean);
      const referenced = (id && new RegExp(`#${id}\\b|getElementById\\(['"]${id}['"]`).test(pageJs))
        || data.some((d) => new RegExp(`\\[${d}`).test(pageJs) || new RegExp(d.replace(/^data-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase())).test(pageJs))
        || cls.some((c) => new RegExp(`\\.${c}\\b`).test(pageJs))
        || /form\b/.test(pageJs) && /addEventListener\(['"]submit['"]/.test(pageJs) && /P\.qa\(['"]form/.test(pageJs);
      if (!action && !referenced) problems.push(`${name}: form${id ? ' #' + id : ''} has no action and nothing submits it`);
    });

    /* buttons: not a submit, no handler hook of any kind */
    [...markup.matchAll(/<button\b([^>]*)>/gi)].forEach((m) => {
      const a = m[1];
      if (/type=["']submit["']/.test(a) || /\sonclick=/.test(a) || a.includes('${')) return;
      const id = (/\sid=["']([^"']+)["']/.exec(a) || [])[1];
      const data = [...a.matchAll(/\sdata-([a-z-]+)/g)].map((x) => x[1]);
      const cls = ((/\sclass=["']([^"']+)["']/.exec(a) || [])[1] || '').split(/\s+/).filter(Boolean);
      const aria = /aria-(controls|expanded|label)=/.test(a);
      const hooked = (id && new RegExp(`#${id}\\b|getElementById\\(['"]${id}['"]|['"]${id}['"]`).test(pageJs))
        || data.some((d) => new RegExp(`data-${d}\\b|${d.replace(/-([a-z])/g, (_, c) => c.toUpperCase())}\\b`).test(pageJs))
        || cls.some((c) => new RegExp(`\\.${c}\\b|['"]${c}['"]`).test(pageJs))
        || (aria && /aria-|expanded|controls/.test(pageJs));
      if (!hooked) problems.push(`${name}: button${id ? ' #' + id : ''}${cls.length ? ' .' + cls.join('.') : ''} has no handler: <button${a.slice(0, 80)}>`);
    });
  });

  /* every route that a script anywhere calls must be mounted */
  [...allJs.matchAll(/['"`](\/api\/[a-z0-9/_-]+)/gi)].forEach((m) => {
    const r = routeFor(m[1]);
    if (r && !routes.has(r)) problems.push(`scripts: call to unmounted API ${m[1]}`);
  });

  return { problems: [...new Set(problems)].sort(), pages: pages.length, routes: routes.size };
}

module.exports = { audit };

if (require.main === module) {
  const { problems, pages: n, routes } = audit();
  console.log(`${n} pages, ${routes} API routes.`);
  if (!problems.length) console.log('No dead links, assets, forms, buttons or API calls.');
  else { console.log(`${problems.length} problems:`); problems.forEach((p) => console.log(' - ' + p)); process.exitCode = 1; }
}
