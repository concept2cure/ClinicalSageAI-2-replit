import { describe, it, expect, vi } from 'vitest';
import { isValidClientRequestId, requestId } from '../enterprise-security';

describe('isValidClientRequestId', () => {
  it('accepts conservative log-safe shapes', () => {
    expect(isValidClientRequestId('abc123')).toBe(true);
    expect(isValidClientRequestId('req-2026-05-12-01ABC')).toBe(true);
    expect(isValidClientRequestId('a.b_c-1')).toBe(true);
    expect(isValidClientRequestId('1')).toBe(true);
    expect(isValidClientRequestId('a'.repeat(128))).toBe(true);
  });

  it('rejects values that could pollute log streams or correlation systems', () => {
    expect(isValidClientRequestId('contains space')).toBe(false);
    expect(isValidClientRequestId('newline\nhere')).toBe(false);
    expect(isValidClientRequestId('carriage\rreturn')).toBe(false);
    expect(isValidClientRequestId('semi;colon')).toBe(false);
    expect(isValidClientRequestId('a/b')).toBe(false);
    expect(isValidClientRequestId('a\\b')).toBe(false);
    expect(isValidClientRequestId('<script>')).toBe(false);
    expect(isValidClientRequestId('"quoted"')).toBe(false);
  });

  it('rejects oversized values and empties', () => {
    expect(isValidClientRequestId('')).toBe(false);
    expect(isValidClientRequestId('a'.repeat(129))).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(isValidClientRequestId(undefined)).toBe(false);
    expect(isValidClientRequestId(null)).toBe(false);
    expect(isValidClientRequestId(42)).toBe(false);
    expect(isValidClientRequestId(['ok'])).toBe(false);
    expect(isValidClientRequestId({ id: 'ok' })).toBe(false);
  });
});

describe('requestId middleware', () => {
  function makeReq(supplied?: any) {
    return {
      headers: supplied === undefined ? {} : { 'x-request-id': supplied },
    } as any;
  }

  function makeRes() {
    const res: any = {};
    res.setHeader = vi.fn();
    return res;
  }

  it('keeps a client-supplied id that matches the safe pattern', () => {
    const req = makeReq('client-correlation-abc.123');
    const res = makeRes();
    const next = vi.fn();
    requestId(req, res, next);
    expect(req.requestId).toBe('client-correlation-abc.123');
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'client-correlation-abc.123');
    expect(next).toHaveBeenCalledOnce();
  });

  it('replaces an unsafe client-supplied id with a generated one', () => {
    const req = makeReq('inject\nlog\nlines');
    const res = makeRes();
    requestId(req, res, vi.fn());
    expect(req.requestId).not.toContain('\n');
    expect(req.requestId).toMatch(/^[0-9a-f]{32}$/);
  });

  it('generates an id when no header is supplied', () => {
    const req = makeReq();
    const res = makeRes();
    requestId(req, res, vi.fn());
    expect(req.requestId).toMatch(/^[0-9a-f]{32}$/);
  });

  it('replaces oversized client-supplied ids', () => {
    const req = makeReq('a'.repeat(2000));
    const res = makeRes();
    requestId(req, res, vi.fn());
    expect(req.requestId).toMatch(/^[0-9a-f]{32}$/);
  });
});
