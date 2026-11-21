# ReturnProof

A single-page marketing site with a Cloudflare Pages Function that stores pilot requests in D1. The static site lives in `public/` and has no build step.

## Deploy to Cloudflare Pages

From the repository root, use Node.js 22 or later and run:

```sh
npx wrangler login
npx wrangler d1 create returnproof-leads
npx wrangler d1 execute returnproof-leads --remote --file=schema.sql
npx wrangler pages project create returnproof --production-branch main
```

In the Cloudflare dashboard, open **Workers & Pages → returnproof → Settings → Bindings**. Add a D1 binding named `PILOT_DB` and select `returnproof-leads` for production. If you use preview deployments, bind a separate initialized D1 database for previews.

Deploy from the repository root so Wrangler bundles `functions/` alongside the static assets:

```sh
npx wrangler pages deploy public --project-name returnproof --branch main
```

Submit a test request on the deployed site. Confirm it appears in the D1 console, then delete that test row. The form stores leads and shows an on-page confirmation. A team member should check the database and follow up at the submitted work email.

## Run locally

```sh
npx wrangler d1 execute PILOT_DB --local --file=schema.sql --config wrangler.local.jsonc
npx wrangler pages dev public --d1 PILOT_DB=00000000-0000-4000-8000-000000000001
```

Open the address printed by Wrangler. To review leads, run this query in the D1 console:

```sql
SELECT id, name, work_email, store_url, monthly_returns, created_at
FROM pilot_requests
ORDER BY id DESC
LIMIT 50;
```
