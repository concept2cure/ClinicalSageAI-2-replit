/**
 * The EU IVDR module answered 403 to the DEFAULT organisation role.
 *
 * `requireIVDRAccess` grants permissions from a `rolePermMap` keyed by
 * `organization_users.role`, whose vocabulary is admin | manager | member |
 * viewer. The map listed neither `manager` nor `member` — and `member` is the
 * role every invited user gets by default. `rolePermMap[userRole]` was
 * `undefined`, the permission set came out empty, and the gate refused
 * `ivdr:read` on GET as readily as `ivdr:write` on POST. A customer who had
 * bought and been licensed for the module could not open a single page of it
 * unless someone had made them an org admin.
 *
 * The keys that WERE there — regulatory_lead, regulatory, quality_assurance,
 * user — are in no role vocabulary this product issues.
 *
 * These tests drive the real middleware, captured off the real mount, so they
 * exercise the map as it is actually wired rather than a copy of it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

import { GOVERNED_WRITE_ROLES } from '../../middleware/orgMembership';
import { registerRegulatoryRoutes } from '../register-regulatory-routes';

/** Capture the middleware the bootstrap mounts at /api/ivdr. */
async function captureIvdrGate() {
  let gate: ((req: any, res: any, next: NextFunction) => unknown) | null = null;
  const app: any = {
    use: (...args: unknown[]) => {
      if (args[0] === '/api/ivdr') gate = args[2] as any;
    },
    get: () => {}, post: () => {}, put: () => {}, patch: () => {}, delete: () => {},
  };
  // Entitlement query: one active subscription row, so licensing never decides.
  const pool: any = { query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }) };
  await registerRegulatoryRoutes({ app, pool });
  if (!gate) throw new Error('no middleware captured at /api/ivdr');
  return gate;
}

/** Run the captured gate and report what it did. */
async function attempt(gate: any, role: string, method: 'GET' | 'POST') {
  const req: any = { method, userId: 42, tenantId: 7, userRole: role, user: { id: 42, role } };
  let status = 0; let body: any = null; let passed = false;
  const res: any = {
    status: (c: number) => { status = c; return res; },
    json: (b: any) => { body = b; return res; },
  };
  await gate(req as Request, res as Response, (() => { passed = true; }) as NextFunction);
  return { passed, status, body, perms: req.ivdrPermissions as Set<string> | undefined };
}

let gate: any;
beforeEach(async () => { vi.stubEnv('NODE_ENV', 'production'); gate = await captureIvdrGate(); });

describe('IVDR access gate — the organization role vocabulary', () => {
  it.each(['admin', 'manager', 'member'])('lets a %s READ the module', async (role) => {
    const r = await attempt(gate, role, 'GET');
    expect(r.passed, `${role} refused: ${JSON.stringify(r.body)}`).toBe(true);
    expect(r.perms?.has('ivdr:read')).toBe(true);
  });

  it.each(['admin', 'manager', 'member'])('lets a %s WRITE', async (role) => {
    const r = await attempt(gate, role, 'POST');
    expect(r.passed, `${role} refused: ${JSON.stringify(r.body)}`).toBe(true);
    expect(r.perms?.has('ivdr:write')).toBe(true);
  });

  it('keeps a viewer read-only', async () => {
    expect((await attempt(gate, 'viewer', 'GET')).passed).toBe(true);
    const w = await attempt(gate, 'viewer', 'POST');
    expect(w.passed).toBe(false);
    expect(w.status).toBe(403);
  });

  it('still refuses a role nobody issues', async () => {
    const r = await attempt(gate, 'contractor', 'GET');
    expect(r.passed).toBe(false);
    expect(r.status).toBe(403);
  });

  /* Approve is the one supervisory permission — CDx stage advancement into
     notified-body review. It is the single place the module asks for a second
     pair of eyes, so the default role does not hold it. */
  it('reserves ivdr:approve for admin and manager, not the default member', async () => {
    expect((await attempt(gate, 'admin', 'POST')).perms?.has('ivdr:approve')).toBe(true);
    expect((await attempt(gate, 'manager', 'POST')).perms?.has('ivdr:approve')).toBe(true);
    expect((await attempt(gate, 'member', 'POST')).perms?.has('ivdr:approve')).toBe(false);
  });

  it('is case-insensitive about the role, as the canonical gate is', async () => {
    expect((await attempt(gate, 'Admin', 'POST')).passed).toBe(true);
  });

  /* The drift guard. If someone adds a role to GOVERNED_WRITE_ROLES and forgets
     this map, that role must not be locked out of the module — which is exactly
     what happened to `manager` and `member`. */
  it('grants write to every role the rest of the product lets write governed data', async () => {
    for (const role of GOVERNED_WRITE_ROLES) {
      const r = await attempt(gate, role, 'POST');
      expect(r.passed, `${role} is in GOVERNED_WRITE_ROLES but cannot write IVDR`).toBe(true);
    }
  });
});
