import { describe, it, expect } from 'vitest';
import { corsHeaders, json, error } from '../../functions/_shared/response.mts';

describe('corsHeaders()', () => {
  it('returns all 4 CORS headers with FRONTEND_URL value', () => {
    const headers = corsHeaders();
    expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
    expect(headers['Access-Control-Allow-Methods']).toBe('GET, POST, OPTIONS');
    expect(headers['Access-Control-Allow-Headers']).toBe('Content-Type');
    expect(headers['Access-Control-Max-Age']).toBe('86400');
  });
});

describe('json()', () => {
  it('returns Response with status 200, Content-Type application/json, CORS headers, and matching body', async () => {
    const res = json({ test: true });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS');
    expect(res.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
    expect(res.headers.get('Access-Control-Max-Age')).toBe('86400');
    const body = await res.json();
    expect(body).toEqual({ test: true });
  });

  it('returns status 201 when specified', async () => {
    const res = json({ test: true }, 201);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ test: true });
  });
});

describe('error()', () => {
  it('returns error shape with status 400 and default error code', async () => {
    const res = error('bad', 400);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({
      error: 'BadRequest',
      message: 'bad',
      statusCode: 400,
    });
  });

  it('uses custom error code when provided', async () => {
    const res = error('not found', 404, 'NotFound');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({
      error: 'NotFound',
      message: 'not found',
      statusCode: 404,
    });
  });
});
