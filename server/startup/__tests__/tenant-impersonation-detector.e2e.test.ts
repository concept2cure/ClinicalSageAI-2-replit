/**
 * The tenant-impersonation detector, end to end through the /api boundary
 * (security audit 2026-09-24, IAM-18 item 4; the proof the item named,
 * filed 2026-09-26 under docs/evidence/D6/2026-09-25-p1/P1-17-residuals/).
 *
 * tenant-impersonation-detector.test.ts drives validateTenantContext with a
 * hand-built request. This file builds the app the way server/index.ts builds
 * the /api surface — applyAuthBoundary(app) mounts createAuthBoundary() and then
 * the detector on '/api' — and sends real requests carrying a token minted by
 * jwt.sign against the test JWT_SECRET, so the boundary's real authenticateToken
 * sets req.user and the detector compares the header against it.
 * AUTH_BOUNDARY_MODE=enforce, as production runs.
 *
 * Doubles, as auth-session-currency.test.ts uses them: the pool answers the two
 * statements the gate issues (revocation, account standing) and refuses any
 * other; membership, tenant scope, lifecycle and quota guards are pass-throughs.
 * The audit service is a spy.
 *
 * Under an `app.use('/api', …)` mount Express 5 hands the detector a
 * mount-relative req.path ('/vault/documents'). The audit row must name the
 * path the client sent ('/api/vault/documents'), as the boundary itself reads it
 * (`${req.baseUrl}${req.path}`, authBoundary.ts). Pinned by the first case.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { Express, NextFunction, Request, Response } from 'express';

const poolDouble = vi.hoisted(() => ({
  pool: {
    query: async (sql: string) => {
      if (/FROM revoked_tokens/i.test(sql)) return { rows: [], rowCount: 0 };
      if (/SELECT status FROM users/i.test(sql)) {
        return { rows: [{ status: 'active', password_changed_at_seconds: null }], rowCount: 1 };
      }
      throw new Error(`unmodelled pool query: ${sql}`);
    },
  },
  db: {},
}));
vi.mock('../../db.js', () => poolDouble);
vi.mock('../../db', () => poolDouble);

// Hoisted with the factories that use it: the static import of '../middleware'
// below runs them before a plain `const` here would be initialised.
const { passThrough } = vi.hoisted(() => ({
  passThrough: (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock('../../middleware/orgMembership', async importOriginal => ({
  ...(await importOriginal<typeof import('../../middleware/orgMembership')>()),
  enforceOrgMembership: passThrough,
}));
vi.mock('../../middleware/establishRequestTenantScope', async importOriginal => ({
  ...(await importOriginal<typeof import('../../middleware/establishRequestTenantScope')>()),
  establishRequestTenantScope: passThrough,
}));
vi.mock('../../middleware/tenantLifecycleGuard', async importOriginal => ({
  ...(await importOriginal<typeof import('../../middleware/tenantLifecycleGuard')>()),
  enforceTenantLifecycle: passThrough,
}));
vi.mock('../../middleware/storageQuotaGuard', async importOriginal => ({
  ...(await importOriginal<typeof import('../../middleware/storageQuotaGuard')>()),
  enforceStorageQuota: passThrough,
}));

type AuditRow = Record<string, unknown> & { details?: Record<string, unknown> };
const audit = vi.hoisted(() => ({ logAction: vi.fn(async (_row: Record<string, unknown>) => undefined) }));
vi.mock('../../services/auditService', () => ({ default: audit }));

import { applyAuthBoundary } from '../middleware';

const secret = process.env.JWT_SECRET as string;

/** An access token as the sign-in mints one: subject, organisation, and the session claims (sid/sst/idl). */
function mintAccessToken(organizationId: number): string {
  const iat = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { userId: '42', email: 'holder@example.com', role: 'user', type: 'access', organizationId, sid: randomUUID(), sst: iat, idl: 24 * 3600, iat },
    secret,
    { expiresIn: '1h' },
  );
}

/** The /api surface as server/index.ts wires it: boundary, then detector, then routes. */
function buildApp(): Express {
  const app = express();
  applyAuthBoundary(app);
  app.get('/api/vault/documents', (req, res) => {
    res.json({ ok: true, organizationId: (req as Request & { organizationId?: unknown }).organizationId ?? null });
  });
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

/** A tick, so a fire-and-forget audit that was going to happen has happened. */
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));

const savedMode = process.env.AUTH_BOUNDARY_MODE;
let app: Express;
let token7: string;

beforeAll(() => {
  process.env.AUTH_BOUNDARY_MODE = 'enforce';
  app = buildApp();
  token7 = mintAccessToken(7);
});

afterAll(() => {
  if (savedMode === undefined) delete process.env.AUTH_BOUNDARY_MODE;
  else process.env.AUTH_BOUNDARY_MODE = savedMode;
});

afterEach(() => audit.logAction.mockClear());

describe('the impersonation detector behind the /api boundary (enforce)', () => {
  it('Bearer(org 7) + x-organization-id: 9 → 403 TENANT_MISMATCH, and the audit row names the path the client sent', async () => {
    const res = await request(app)
      .get('/api/vault/documents')
      .set('Authorization', `Bearer ${token7}`)
      .set('x-organization-id', '9');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Organization mismatch', code: 'TENANT_MISMATCH' });

    await vi.waitFor(() => expect(audit.logAction).toHaveBeenCalledTimes(1));
    const row = audit.logAction.mock.calls[0][0] as AuditRow;
    expect(row).toMatchObject({
      action: 'tenant_impersonation_attempt',
      resourceType: 'security_event',
      tenantId: 7,
      userId: '42',
      resourceId: '9',
    });
    expect(row.details).toMatchObject({ jwtOrg: 7, headerOrg: '9', userId: '42', method: 'GET' });
    // Express 5 gives a '/api'-mounted handler a mount-relative req.path; the
    // row must carry the /api prefix the client sent, not '/vault/documents'.
    expect(row.details?.path, 'the audited path lost its /api prefix').toBe('/api/vault/documents');
  });

  it("Bearer(org 7) + x-organization-id: 7 → the handler runs, with the organisation taken from the session", async () => {
    const res = await request(app)
      .get('/api/vault/documents')
      .set('Authorization', `Bearer ${token7}`)
      .set('x-organization-id', '7');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, organizationId: 7 });
    await settle();
    expect(audit.logAction).not.toHaveBeenCalled();
  });

  it('no token + x-organization-id: 9 → the boundary answers 401 AUTH_001 first; the detector never runs and nothing is audited', async () => {
    const res = await request(app).get('/api/vault/documents').set('x-organization-id', '9');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { code: 'AUTH_001', message: 'No authentication token provided' } });
    await settle();
    expect(audit.logAction).not.toHaveBeenCalled();
  });

  it('on a PUBLIC_API_ALLOWLIST path the boundary establishes no session, so the detector has nothing to compare: the request passes and nothing is audited', async () => {
    // This is why the detector keeps no public-path skip list of its own: the
    // boundary's allowlist already decides which /api paths arrive without a
    // session, and /healthz and /readyz never reach a '/api' mount at all.
    const res = await request(app)
      .get('/api/health')
      .set('Authorization', `Bearer ${token7}`)
      .set('x-organization-id', '9');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    await settle();
    expect(audit.logAction).not.toHaveBeenCalled();
  });
});
