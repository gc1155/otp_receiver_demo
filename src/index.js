/**
 * OTP Receiver Worker
 *
 * Dev-only Cloudflare Worker that acts as a simple OTP store so that Auth0
 * can POST a one-time code here and a polling client can GET it back – no SMS
 * provider required.
 *
 * Routes
 *   POST /otp          { phone, code }  – store a code for the given phone number
 *   GET  /otp?phone=…               – retrieve (and remove) the stored code
 *   DELETE /otp?phone=…             – explicitly remove a stored code
 *   OPTIONS *                       – CORS preflight
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname !== '/otp') {
      return jsonResponse({ error: 'Not found' }, 404);
    }

    // POST /otp  – receive a code from Auth0
    if (request.method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ error: 'Invalid JSON body' }, 400);
      }

      const { phone, code } = body;
      if (!phone || !code) {
        return jsonResponse({ error: `phone and code are required: ${body}`}, 400);
      }

      await env.OTP_STORE.put(phone, JSON.stringify({ code: String(code), ts: Date.now() }));
      return jsonResponse({ ok: true });
    }

    // GET /otp?phone=… – poll for a code
    if (request.method === 'GET') {
      const phone = url.searchParams.get('phone');
      if (!phone) {
        return jsonResponse({ error: 'phone query parameter is required' }, 400);
      }

      const raw = await env.OTP_STORE.get(phone);
      if (!raw) {
        return jsonResponse({});
      }

      // Remove the code once it has been retrieved (one-time use)
      await env.OTP_STORE.delete(phone);
      return jsonResponse(JSON.parse(raw));
    }

    // DELETE /otp?phone=… – explicitly clear a stored code
    if (request.method === 'DELETE') {
      const phone = url.searchParams.get('phone');
      if (!phone) {
        return jsonResponse({ error: 'phone query parameter is required' }, 400);
      }
      await env.OTP_STORE.delete(phone);
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: 'Method not allowed' }, 405);
  },
};
