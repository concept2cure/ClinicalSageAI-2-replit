/**
 * The IVDR licence gate denies when it cannot read the licence.
 *
 * What the code used to do (2026-10-15): requireIVDRAccess raced its
 * module_subscriptions read against a 3 s timer, and on the timeout it logged
 * "allowing dev mode access" and fell through to the module — in EVERY
 * environment, production included. A slow licence read therefore granted the
 * IVDR module to an organisation that had not bought it. Any other read error
 * was thrown from the async middleware instead of being passed on.
 *
 * The middleware is driven as it is really mounted (captured off the real
 * bootstrap, as ivdr-access-role-map.test.ts does).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

import { ivdrEntitlementReadFailure, registerRegulatoryRoutes } from '../register-regulatory-routes';

type Gate = (req: any, res: any, next: NextFunction) => unknown;

async function captureIvdrGate(pool: { query: (...a: unknown[]) => unknown }): Promise<Gate> {
  const captured: { gate?: Gate } = {};
  const app: any = {
    use: (...args: unknown[]) => {
      if (args[0] === '/api/ivdr') captured.gate = args[2] as Gate;
    },
    get: () => {}, post: () => {}, put: () => {}, patch: () => {}, delete: () => {},
  };
  await registerRegulatoryRoutes({ app, pool: pool as any });
  if (!captured.gate) throw new Error('no middleware captured at /api/ivdr');
  return captured.gate;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('ivdrEntitlementReadFailure', () => {
  it('denies a timed-out read outside development (503), instead of letting it through', () => {
    expect(ivdrEntitlementReadFailure({ message: 'IVDR_ENTITLEMENT_TIMEOUT' }, 'production')).toEqual({
      status: 503,
      body: expect.objectContaining({ code: 'IVDR_ENTITLEMENT_UNAVAILABLE' }),
    });
  });

  it('keeps the unprovisioned-store answer and passes any other read error on', () => {
    expect(ivdrEntitlementReadFailure({ code: '42P01' }, 'production')).toMatchObject({ status: 503, body: { code: 'IVDR_NOT_PROVISIONED' } });
    expect(ivdrEntitlementReadFailure({ message: 'connection reset' }, 'production')).toBe('error');
    expect(ivdrEntitlementReadFailure({ message: 'IVDR_ENTITLEMENT_TIMEOUT' }, undefined)).not.toBeNull();
  });

  it('lets a development request through, as before', () => {
    expect(ivdrEntitlementReadFailure({ message: 'IVDR_ENTITLEMENT_TIMEOUT' }, 'development')).toBeNull();
  });
});

describe('the mounted IVDR gate, when the licence read does not answer in time', () => {
  it('refuses the request in production rather than serving the module', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    // The licence read never answers, so only the gate's own timer can decide.
    const gate = await captureIvdrGate({ query: vi.fn(() => new Promise(() => {})) });
    vi.useFakeTimers();
    const req: any = { method: 'GET', userId: 42, tenantId: 7, userRole: 'admin', user: { id: 42, role: 'admin' } };
    let status = 0; let body: any = null; let passed = false;
    const res: any = {
      status: (c: number) => { status = c; return res; },
      json: (b: any) => { body = b; return res; },
    };
    const run = gate(req as Request, res as Response, (() => { passed = true; }) as NextFunction);
    await vi.advanceTimersByTimeAsync(3_001);
    await run;
    expect(passed, 'a licence read that timed out let the request through').toBe(false);
    expect(status).toBe(503);
    expect(body).toMatchObject({ code: 'IVDR_ENTITLEMENT_UNAVAILABLE' });
  });
});
