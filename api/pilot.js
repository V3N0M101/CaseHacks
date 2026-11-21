import { neon } from '@neondatabase/serverless';
import { handlePilotRequest } from '../lib/pilot.js';

export default {
  fetch(request) {
    return handlePilotRequest(request, async ({ name, email, store, monthlyReturns }) => {
      const sql = neon(process.env.DATABASE_URL);
      await sql`
        INSERT INTO pilot_requests (name, work_email, store_url, monthly_returns)
        VALUES (${name}, ${email}, ${store}, ${monthlyReturns})
      `;
    });
  },
};
