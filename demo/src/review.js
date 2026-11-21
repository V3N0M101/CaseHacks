import { createRemoteJWKSet, jwtVerify } from 'jose';

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const PAGE_SIZE = 20;
const fields = 'reference, buyer_reference, sku, findings, elapsed_ms, created_at, status, decided_at, decided_by';
let keySet;

export function retentionCutoff() {
  return new Date(Date.now() - RETENTION_MS).toISOString();
}

async function reviewer(request, env) {
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  const domain = env.ACCESS_TEAM_DOMAIN;
  if (!token || !env.ACCESS_AUDIENCE || !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain || '')) return null;

  const issuer = `https://${domain}`;
  if (keySet?.issuer !== issuer) {
    keySet = {
      issuer,
      jwks: createRemoteJWKSet(new URL('/cdn-cgi/access/certs', issuer), { timeoutDuration: 5000 }),
    };
  }
  try {
    const { payload } = await jwtVerify(token, keySet.jwks, {
      issuer,
      audience: env.ACCESS_AUDIENCE,
      algorithms: ['RS256'],
      requiredClaims: ['exp', 'iat', 'sub', 'email'],
    });
    return typeof payload.email === 'string' && payload.email ? payload.email : null;
  } catch {
    return null;
  }
}

function toInspection(row) {
  return { ...row, findings: JSON.parse(row.findings) };
}

async function listInspections(url, db, json) {
  const value = url.searchParams.get('before');
  const before = value === null ? Number.MAX_SAFE_INTEGER : Number(value);
  if (!Number.isSafeInteger(before) || before <= 0) return json({ error: 'Invalid page cursor.' }, 400);

  const { results } = await db.prepare(
    `SELECT id, ${fields} FROM inspections WHERE id < ? AND created_at >= ? ORDER BY id DESC LIMIT ?`,
  ).bind(before, retentionCutoff(), PAGE_SIZE + 1).all();
  const inspections = results.slice(0, PAGE_SIZE).map(({ id, ...row }) => toInspection(row));
  const next = results.length > PAGE_SIZE ? results[PAGE_SIZE - 1].id : null;
  return json({ inspections, next });
}

async function recordDecision(request, url, db, reference, email, json) {
  const origin = request.headers.get('Origin');
  if (origin !== url.origin) return json({ error: 'Use the merchant review page to decide.' }, 403);
  const decision = url.searchParams.get('decision');
  if (decision !== 'accepted' && decision !== 'rejected') {
    return json({ error: 'Choose accept or reject.' }, 400);
  }

  const cutoff = retentionCutoff();
  const update = await db.prepare(
    "UPDATE inspections SET status = ?, decided_at = ?, decided_by = ? WHERE reference = ? AND status = 'pending' AND created_at >= ?",
  ).bind(decision, new Date().toISOString(), email, reference, cutoff).run();
  const row = await db.prepare(
    `SELECT ${fields} FROM inspections WHERE reference = ? AND created_at >= ?`,
  ).bind(reference, cutoff).first();
  if (!row) return json({ error: 'Inspection was not found or has expired.' }, 404);
  if (update.meta.changes === 0 && row.status !== decision) {
    return json({ error: 'This inspection already has a different decision.', inspection: toInspection(row) }, 409);
  }
  return json({ inspection: toInspection(row) });
}

export async function handleReview(request, url, env, json) {
  const email = await reviewer(request, env);
  if (!email) return json({ error: 'Sign in through Cloudflare Access to review inspections.' }, 401);

  const { pathname } = url;
  if ((pathname === '/review' || pathname === '/review/') && request.method === 'GET') {
    const asset = await env.ASSETS.fetch(new Request(new URL('/merchant', url)));
    const headers = new Headers(asset.headers);
    headers.set('Cache-Control', 'private, no-store');
    headers.set('Permissions-Policy', 'camera=(), microphone=()');
    return new Response(asset.body, { status: asset.status, headers });
  }

  const db = env.INSPECTIONS_DB;
  try {
    if (pathname === '/review/api/inspections' && request.method === 'GET') {
      return await listInspections(url, db, json);
    }
    const match = /^\/review\/api\/inspections\/([a-f0-9-]{36})$/.exec(pathname);
    if (match && request.method === 'POST') {
      return await recordDecision(request, url, db, match[1], email, json);
    }
    return json({ error: 'Unknown review endpoint.' }, 404);
  } catch {
    return json({ error: 'Could not access saved inspections. Try again.' }, 503);
  }
}
