import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ApiError, errorHandler } from '../errorHandler';

function makeRes() {
  const res: any = { headersSent: false };
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

function makeReq(overrides: Partial<{ path: string; method: string; id: string }> = {}) {
  return { path: '/api/widgets', method: 'POST', id: 'req-1', ...overrides } as any;
}

const ORIGINAL_ENV = process.env.NODE_ENV;

describe('errorHandler', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
  });

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_ENV;
  });

  it('scrubs 5xx error message and details in production', () => {
    const err = new ApiError(500, 'pg: relation "users" does not exist at /app/server/db.ts:42', 'DB_ERROR', {
      query: 'SELECT * FROM users WHERE password = $1',
    });
    const res = makeRes();
    errorHandler(err, makeReq(), res as any, () => {});
    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body.error.message).toBe('Internal server error');
    expect(body.error.details).toBeUndefined();
    expect(body.error.code).toBe('DB_ERROR');
    expect(body.error.request_id).toBe('req-1');
  });

  it('preserves 4xx error details in production for actionable client feedback', () => {
    const err = new ApiError(400, 'name is required', 'VALIDATION_ERROR', [{ path: 'name', message: 'required' }]);
    const res = makeRes();
    errorHandler(err, makeReq(), res as any, () => {});
    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.error.message).toBe('name is required');
    expect(body.error.details).toEqual([{ path: 'name', message: 'required' }]);
  });

  it('preserves 5xx detail outside production for debuggability', () => {
    process.env.NODE_ENV = 'development';
    const err = new ApiError(500, 'connection refused', 'DB_ERROR', { host: 'db.local' });
    const res = makeRes();
    errorHandler(err, makeReq(), res as any, () => {});
    const body = res.json.mock.calls[0][0];
    expect(body.error.message).toBe('connection refused');
    expect(body.error.details).toEqual({ host: 'db.local' });
  });

  it('defaults statusCode-less errors to a generic 500 in production', () => {
    const err: any = new Error('something broke');
    const res = makeRes();
    errorHandler(err, makeReq(), res as any, () => {});
    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body.error.message).toBe('Internal server error');
    expect(body.error.code).toBe('SERVER_ERROR');
  });
});
