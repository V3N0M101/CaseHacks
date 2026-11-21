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


## Deploy the inspection demo to Cloudflare Workers

The demo lives in [demo/](demo/) and runs as its own Worker with static assets. The marketing site and lead form can still run on Vercel. The demo uses the device’s live camera. It samples two frames while you show the item and two while you show its label. The vision provider receives those frames and the catalog image when you run the inspection. The video feed stays in the browser and audio is disabled.

1. Create a Turnstile widget in Cloudflare for the demo's public hostname. Set its public site key as `TURNSTILE_SITE_KEY` in [demo/wrangler.jsonc](demo/wrangler.jsonc). For a first deploy, use the exact `returnproof-demo.<workers-subdomain>.workers.dev` hostname if you plan to use Workers.dev.
2. Authenticate Wrangler, then from the repository run:

   ```sh
   cd demo
   npx wrangler login
   npx wrangler secret put OPENAI_API_KEY
   npx wrangler secret put TURNSTILE_SECRET
   npx wrangler deploy
   ```

   Use an OpenAI key with access to the configured vision model. Set a provider budget and rotate credentials through managed secrets. The Worker receives same-origin requests, verifies Turnstile, and limits inspection attempts per IP. It does not persist images or findings. OpenAI processes the submitted frames under your account's data controls. Use sample or consented photos and review the provider's data handling before accepting real shopper photos.

3. Open the deployed Worker URL on an HTTPS-capable browser with a camera. Use your own catalog photo and SKU for a product you can hold up, then click **Start camera** and grant permission. Show the whole item and click **Scan item**, then show the legible label and click **Scan label**. Complete verification and click **Run live inspection**. Check that the camera stays active while the result appears with separate item, SKU, parts, packaging and wear findings. Click **Stop camera** when finished.
4. Once you have tested the deployed URL, link to it from the marketing site or share it directly.

For local development, run `npx wrangler dev` from `demo/`. The included illustrative catalog and live camera controls work before provider setup on localhost. To run a live inspection locally, put `OPENAI_API_KEY` and `TURNSTILE_SECRET` in the untracked `demo/.dev.vars` file. Add the official always-pass Turnstile site key `1x00000000000000000000AA` there as `TURNSTILE_SITE_KEY` and use the matching test secret. Use this test pair only on localhost. Live model calls can incur usage charges.
