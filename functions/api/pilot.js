const MAX_BODY_BYTES = 8192;

export async function onRequest({ request, env }) {
  const headers = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  const wantsJson = request.headers.get('Accept')?.includes('application/json');

  function respond(status, message) {
    const ok = status === 200;
    return new Response(wantsJson ? JSON.stringify({ ok, message }) : message, {
      status,
      headers: {
        ...headers,
        'Content-Type': wantsJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
      },
    });
  }

  if (request.method !== 'POST') {
    headers.Allow = 'POST';
    return respond(405, 'Use the pilot form to send your request.');
  }
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) {
    return respond(403, 'Send your request from the ReturnProof website.');
  }
  const contentType = request.headers.get('Content-Type')?.split(';')[0].trim();
  if (contentType !== 'application/x-www-form-urlencoded') {
    return respond(415, 'Use the pilot form to send your request.');
  }

  let fields;
  try {
    const reader = request.body?.getReader();
    const decoder = new TextDecoder();
    let size = 0;
    let body = '';
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY_BYTES) {
          await reader.cancel();
          return respond(413, 'The request is too large.');
        }
        body += decoder.decode(value, { stream: true });
      }
    }
    fields = new URLSearchParams(body + decoder.decode());
  } catch {
    return respond(400, 'Could not read the form. Please try again.');
  }

  if (fields.get('company_site')) {
    return respond(400, 'Could not accept the request. Use the pilot form to try again.');
  }
  const name = fields.get('name')?.trim() ?? '';
  const email = fields.get('email')?.trim() ?? '';
  const store = fields.get('store')?.trim() ?? '';
  const returns = fields.get('returns')?.trim() ?? '';
  if (!name || name.length > 120) return respond(400, 'Enter your full name.');
  if (email.length > 254 || !/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email)) {
    return respond(400, 'Enter a valid work email address.');
  }
  let url;
  try {
    url = new URL(store);
  } catch {
    return respond(400, 'Enter a store URL beginning with https:// or http://.');
  }
  if (store.length > 300 || !/^https?:\/\//i.test(store) || url.username || url.password || !url.hostname.includes('.')) {
    return respond(400, 'Enter a valid public store URL beginning with https:// or http://.');
  }
  if (!/^\d{1,10}$/.test(returns) || Number(returns) > 1000000000) {
    return respond(400, 'Enter a whole number of monthly returns between 0 and 1,000,000,000.');
  }

  try {
    const result = await env.PILOT_DB.prepare(
      'INSERT INTO pilot_requests (name, work_email, store_url, monthly_returns) VALUES (?, ?, ?, ?)',
    ).bind(name, email, url.href, Number(returns)).run();
    if (!result.success) throw new Error('Insert failed');
  } catch {
    console.error('Could not write a pilot request to D1.');
    return respond(503, 'Pilot requests are temporarily unavailable. Please try again later.');
  }

  return respond(200, 'Your pilot request was received. We’ll follow up at your work email.');
}
