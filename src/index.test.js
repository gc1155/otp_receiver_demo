import { describe, it, expect, beforeEach } from 'vitest';
import worker from './index.js';

// Helper that calls the worker fetch handler directly
async function req(method, path, body) {
  const url = `https://example.com${path}`;
  const init = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  return worker.fetch(new Request(url, init));
}

// Reset the in-memory store between tests by deleting all keys via the
// DELETE endpoint, or simply by reloading the module.  Because vitest
// isolates modules per test file (not per test), we clean up manually.
async function clearPhone(phone) {
  await req('DELETE', `/otp?phone=${encodeURIComponent(phone)}`);
}

describe('OTP Receiver Worker', () => {
  const PHONE = '+15550001234';

  beforeEach(async () => {
    await clearPhone(PHONE);
  });

  // ── POST /otp ────────────────────────────────────────────────────────────

  it('POST /otp stores a code and returns { ok: true }', async () => {
    const res = await req('POST', '/otp', { phone: PHONE, code: '123456' });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
  });

  it('POST /otp returns 400 when phone is missing', async () => {
    const res = await req('POST', '/otp', { code: '123456' });
    expect(res.status).toBe(400);
  });

  it('POST /otp returns 400 when code is missing', async () => {
    const res = await req('POST', '/otp', { phone: PHONE });
    expect(res.status).toBe(400);
  });

  it('POST /otp returns 400 for invalid JSON', async () => {
    const res = await worker.fetch(
      new Request('https://example.com/otp', {
        method: 'POST',
        body: 'not-json',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
  });

  // ── GET /otp ─────────────────────────────────────────────────────────────

  it('GET /otp returns the stored code and then removes it', async () => {
    await req('POST', '/otp', { phone: PHONE, code: '654321' });

    const res = await req('GET', `/otp?phone=${encodeURIComponent(PHONE)}`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.code).toBe('654321');
    expect(typeof json.ts).toBe('number');

    // Second GET must return an empty object (one-time use)
    const res2 = await req('GET', `/otp?phone=${encodeURIComponent(PHONE)}`);
    const json2 = await res2.json();
    expect(json2).toEqual({});
  });

  it('GET /otp returns {} when no code is stored', async () => {
    const res = await req('GET', `/otp?phone=${encodeURIComponent(PHONE)}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  it('GET /otp returns 400 when phone param is missing', async () => {
    const res = await req('GET', '/otp');
    expect(res.status).toBe(400);
  });

  // ── DELETE /otp ───────────────────────────────────────────────────────────

  it('DELETE /otp removes a stored code', async () => {
    await req('POST', '/otp', { phone: PHONE, code: '999' });
    const del = await req('DELETE', `/otp?phone=${encodeURIComponent(PHONE)}`);
    expect(del.status).toBe(200);

    const res = await req('GET', `/otp?phone=${encodeURIComponent(PHONE)}`);
    expect(await res.json()).toEqual({});
  });

  it('DELETE /otp returns 400 when phone param is missing', async () => {
    const res = await req('DELETE', '/otp');
    expect(res.status).toBe(400);
  });

  // ── OPTIONS (CORS preflight) ──────────────────────────────────────────────

  it('OPTIONS returns 204 with CORS headers', async () => {
    const res = await req('OPTIONS', '/otp');
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  // ── Unknown routes ────────────────────────────────────────────────────────

  it('returns 404 for unknown paths', async () => {
    const res = await req('GET', '/unknown');
    expect(res.status).toBe(404);
  });

  it('returns 405 for unsupported methods', async () => {
    const res = await req('PATCH', '/otp');
    expect(res.status).toBe(405);
  });

  // ── CORS headers present on all responses ────────────────────────────────

  it('GET response includes CORS header', async () => {
    const res = await req('GET', `/otp?phone=${encodeURIComponent(PHONE)}`);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('POST response includes CORS header', async () => {
    const res = await req('POST', '/otp', { phone: PHONE, code: '111' });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});
