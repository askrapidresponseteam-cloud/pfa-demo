# Deploy (Hobby plan, single function)

See HANDBOOK.md for the full runbook; this is the short version.

This tree is complete and self-contained. `api/` holds ONE Vercel function (`api/index.js`, reached via the rewrite in `vercel.json`)
that routes every `/api/*` URL to `lib/routes/`. Public URLs are unchanged.

```bash
cd ~/Desktop/PFA_Full_Website
npm test                     # expect 190 pass, 0 fail
npm run build:search         # after adding or renaming a page, or editing units in data.js: rebuilds help.html, the search index and sitemap
git add -A && git commit -m "v1.36: single API function + Shopify order webhooks"
git push origin main
npx vercel --prod --force
curl -s https://pfa-full-website.vercel.app/api/payment/health   # JSON = alive
```

Environment variables (Vercel → Settings → Environment Variables):
see `PFA_STORE_SHOPIFY_SETUP.md` for the Shopify ones. Then:

```bash
npx firebase-tools deploy --only firestore:rules
```
