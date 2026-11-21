# ReturnProof

A single-page marketing site with a server-side pilot request form. The static site lives in `public/` and has no build step.

## Deploy to Vercel

1. Import `V3N0M101/CaseHacks` into Vercel and select `main` as the production branch. Use the repository root, the **Other** framework preset and no build command. The checked-in `vercel.json` sets the output directory to `public`.
2. Create a Neon Postgres database or connect one through the Vercel Marketplace. In the Neon SQL Editor, run [schema.postgres.sql](schema.postgres.sql) against the database used by the site.
3. Set `DATABASE_URL` to the Neon connection string in the Vercel project’s environment settings. Set it for Production and redeploy if the initial deployment preceded the change. To test form submissions in Preview, use a separate Neon branch or database and apply the schema there too.
4. Submit a test request on the deployed site, confirm the row in Neon, and delete the test row. See the lead query below. A team member should check for new requests and follow up at the submitted work email.

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

## Run Cloudflare Pages locally

```sh
npx wrangler d1 execute PILOT_DB --local --file=schema.sql --config wrangler.local.jsonc
npx wrangler pages dev public --d1 PILOT_DB=00000000-0000-4000-8000-000000000001
```

Open the address printed by Wrangler. ## Review pilot requests

Run this query in the Neon SQL Editor or D1 console:

```sql
SELECT id, name, work_email, store_url, monthly_returns, created_at
FROM pilot_requests
ORDER BY id DESC
LIMIT 50;
```
