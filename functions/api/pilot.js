import { handlePilotRequest } from '../../lib/pilot.js';

export function onRequest({ request, env }) {
  return handlePilotRequest(request, async ({ name, email, store, monthlyReturns }) => {
    const result = await env.PILOT_DB.prepare(
      'INSERT INTO pilot_requests (name, work_email, store_url, monthly_returns) VALUES (?, ?, ?, ?)',
    ).bind(name, email, store, monthlyReturns).run();
    if (!result.success) throw new Error('D1 insert failed');
  });
}
