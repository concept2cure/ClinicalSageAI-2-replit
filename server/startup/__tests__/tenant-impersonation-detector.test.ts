/**
 * The tenant-impersonation detector runs where it can see the session
 * (security audit 2026-09-24, IAM-18 item 4).
 *
 * validateTenantContext (server/middleware/enterprise-security.ts) refuses a
 * request whose `x-organization-id` header names a different organisation
 * from the one the verified session belongs to, and audits the attempt. It
 * was mounted by applySecurityMiddleware, which applyCoreMiddleware runs
 * BEFORE the auth boundary: `req.user` was never set when it ran, so it never
 * refused anything and never audited anything. It now mounts after the
 * boundary, in applyAuthBoundary.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';

const audit = vi.hoisted(() => ({ logAction: vi.fn(async () => undefined) }));
vi.mock('../../services/auditService', () => ({ default: audit }));

import { validateTenantContext } from '../../middleware/enterprise-security';
import { applyAuthBoundary } from '../middleware';

function call(user: unknown, headerOrg?: string) {
  const req = {
    path: '/api/vault/documents',
    method: 'GET',
    ip: '203.0.113.5',
    headers: headerOrg ? { 'x-organization-id': headerOrg } : {},
    user,
  } as unknown as Request;
  const res: any = { statusCode: 200, body: undefined };
  res.status = (c: number) => {
    res.statusCode = c;
    return res;
  };
  res.json = (b: unknown) => {
    res.body = b;
    return res;
  };
  const next = vi.fn() as unknown as NextFunction;
  validateTenantContext(req, res as Response, next);
  return { req, res, next };
}

afterEach(() => audit.logAction.mockClear());

describe('validateTenantContext, given a session', () => {
  it("refuses a header naming another organisation (403 TENANT_MISMATCH) and audits it", async () => {
    const { res, next } = call({ id: 7, organizationId: 7 }, '9');
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ code: 'TENANT_MISMATCH' });
    expect(next).not.toHaveBeenCalled();
    await new Promise(r => setTimeout(r, 0)); // the audit is fire-and-forget
    expect(audit.logAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'tenant_impersonation_attempt', tenantId: 7 }));
  });

  it('passes a header naming the session\'s own organisation', () => {
    const { next } = call({ id: 7, organizationId: 7 }, '7');
    expect(next).toHaveBeenCalledOnce();
  });

  it('passes a request with no header', () => {
    const { next } = call({ id: 7, organizationId: 7 });
    expect(next).toHaveBeenCalledOnce();
  });

  it('with no session it neither refuses nor adopts the header (the boundary already answered)', () => {
    const { req, next } = call(undefined, '9');
    expect(next).toHaveBeenCalledOnce();
    expect((req as any).organizationId).toBeUndefined();
  });
});

describe('where it is mounted', () => {
  it('applyAuthBoundary mounts the boundary and then the detector on /api', () => {
    const app = express();
    const stack = () => ((app as any).router ?? (app as any)._router).stack as Array<{ handle: { name: string } }>;
    const before = stack().length;
    applyAuthBoundary(app);
    const added = stack().slice(before).map((l) => l.handle.name);
    // The boundary, then the detector; then, since 2026-09-26, the Concept2Cure
    // body parsers and their scrub, which read a body only for a session that
    // passed the boundary (security audit IAM-18 item 7).
    expect(added.slice(0, 2), 'the detector is not mounted behind the boundary').toHaveLength(2);
    expect(added[1]).toBe('validateTenantContext');
    expect(added.slice(2), 'the Concept2Cure parsers do not follow the boundary').toEqual(['jsonParser', 'urlencodedParser', 'sanitizeInput']);
  });
});
