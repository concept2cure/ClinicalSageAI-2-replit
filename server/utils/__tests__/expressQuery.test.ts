/**
 * Express 5 makes `req.query` a getter-backed prototype property, so the
 * Express-4 idiom `req.query = validated` throws
 * "Cannot set property query of #<IncomingMessage> which has only a getter".
 *
 * That threw on five shipped code paths, including the two shared validation
 * middlewares — GET /api/evidence returned 500 with exactly that message.
 *
 * These tests exercise the real shape: an object whose `query` comes from a
 * getter on its PROTOTYPE, which is what Express hands a handler.
 */

import { describe, it, expect } from 'vitest';
import type { Request } from 'express';
import { setRequestQuery } from '../expressQuery';

/** A request whose `query` is a getter on the prototype, as Express 5 builds it. */
function makeExpress5Request(initial: Record<string, unknown>): Request {
  const proto = {};
  Object.defineProperty(proto, 'query', {
    get() {
      return initial;
    },
    configurable: true,
  });
  return Object.create(proto) as Request;
}

describe('setRequestQuery', () => {
  it('reproduces the failure it exists to fix', () => {
    const req = makeExpress5Request({ limit: '10' });
    // Direct assignment is what the five call sites used to do.
    expect(() => {
      'use strict';
      (req as unknown as { query: unknown }).query = { limit: 10 };
    }).toThrow(/only a getter/i);
  });

  it('replaces the query object despite the prototype getter', () => {
    const req = makeExpress5Request({ limit: '10' });
    setRequestQuery(req, { limit: 10, offset: 0 });
    expect(req.query).toEqual({ limit: 10, offset: 0 });
  });

  it('preserves Zod coercion — handlers must read parsed types, not raw strings', () => {
    // The reason an in-place scrub is not enough: validation coerces.
    const req = makeExpress5Request({ limit: '10', flag: 'true' });
    setRequestQuery(req, { limit: 10, flag: true });
    expect(req.query.limit).toBe(10);
    expect(req.query.flag).toBe(true);
  });

  it('can be applied twice, so validation layers may run in sequence', () => {
    const req = makeExpress5Request({ a: '1' });
    setRequestQuery(req, { a: 1 });
    setRequestQuery(req, { a: 1, b: 2 });
    expect(req.query).toEqual({ a: 1, b: 2 });
  });

  it('leaves the property enumerable, as request logging and spreads expect', () => {
    const req = makeExpress5Request({ a: '1' });
    setRequestQuery(req, { a: 1 });
    expect(Object.keys(req)).toContain('query');
    expect({ ...req }).toHaveProperty('query');
  });
});
