import { readFile } from 'node:fs/promises';

const [hostname, buyerReference, sku, catalogPath] = process.argv.slice(2);
const token = process.env.BUYER_INTAKE_TOKEN;
if (!hostname || !buyerReference || !sku || !catalogPath || !token) {
  console.error('Set BUYER_INTAKE_TOKEN and run: node scripts/create-buyer-link.mjs https://worker-host return-reference SKU catalog.jpg');
  process.exit(1);
}

try {
  const endpoint = new URL('/api/buyer-links', hostname);
  if (endpoint.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(endpoint.hostname)) {
    throw new Error('Use the HTTPS Worker URL.');
  }
  const catalog = (await readFile(catalogPath)).toString('base64');
  const response = await fetch(endpoint, {
    method: 'POST',
    redirect: 'manual',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ buyerReference, sku, catalog }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.headers.get('Content-Type')?.includes('application/json')) {
    throw new Error(`Worker returned HTTP ${response.status}. Check the deployment and Access destinations.`);
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not create a buyer link.');
  console.log(result.url);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
