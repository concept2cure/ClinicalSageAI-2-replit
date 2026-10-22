/**
 * requireLicenseAcceptance refuses (503) when acceptance cannot be read; it
 * never lets a request through on an unread licence store.
 *
 * What the code used to do (until 2026-10-15): its catch called next() — "fail
 * open: don't lock users out on a transient licensing-store error" — so a
 * request whose user had not accepted a required agreement was served whenever
 * the store could not be read.
 *
 * The middleware is mounted on no route today; this pins the gate itself.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const eula = vi.hoisted(() => ({ getOutstandingAgreements: vi.fn() }));
vi.mock('../../services/licensing/eula-service.js', () => eula);

import { requireLicenseAcceptance } from '../requireLicenseAcceptance';

function appFor(user: { id: number; organizationId: number } | null) {
  const app = express();
  app.use((req, _res, next) => {
    if (user) (req as unknown as { user: typeof user }).user = user;
    next();
  });
  app.get('/gated', requireLicenseAcceptance(), (_req, res) => res.json({ reached: true }));
  return app;
}

const USER = { id: 42, organizationId: 7 };

// A block body: a function returned from beforeEach is run as a teardown.
beforeEach(() => {
  eula.getOutstandingAgreements.mockReset();
});

describe('requireLicenseAcceptance', () => {
  it('answers 503 when acceptance could not be read, and does not serve the route', async () => {
    eula.getOutstandingAgreements.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432'));
    const res = await request(appFor(USER)).get('/gated');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      error: 'License acceptance could not be verified',
      code: 'LICENSE_ACCEPTANCE_UNAVAILABLE',
    });
    expect(JSON.stringify(res.body)).not.toContain('ECONNREFUSED');
  });

  it('refuses with the outstanding agreements when some are not accepted (control)', async () => {
    eula.getOutstandingAgreements.mockResolvedValue([
      { id: 'a1', agreementKey: 'eula', version: '2', title: 'EULA', scope: 'user' },
    ]);
    const res = await request(appFor(USER)).get('/gated');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'LICENSE_ACCEPTANCE_REQUIRED', outstanding: [{ id: 'a1', agreementKey: 'eula' }] });
    expect(eula.getOutstandingAgreements).toHaveBeenCalledWith(42, 7);
  });

  it('serves the route when every required agreement is accepted (control)', async () => {
    eula.getOutstandingAgreements.mockResolvedValue([]);
    const res = await request(appFor(USER)).get('/gated');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reached: true });
  });

  it('answers 401 without a user (control)', async () => {
    const res = await request(appFor(null)).get('/gated');
    expect(res.status).toBe(401);
    expect(eula.getOutstandingAgreements).not.toHaveBeenCalled();
  });
});
