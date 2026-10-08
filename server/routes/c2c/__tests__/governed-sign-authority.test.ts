/**
 * POST /api/c2c/actions/sign applies the same §11.10(g) signing-authority rule
 * as every other signing route (services/part11/signing-authority).
 *
 * QA walk 2026-10-08 (J8): the Electronic signature register listed a
 * manager's 'approval' signature on an eCTD sequence, persisted through this
 * route, while POST /api/mdx/qms/documents/:id/approve refused the same role
 * with QMS_NO_SIGNING_AUTHORITY. The only authority gate here was the
 * permission-atom check, which runs only when GOVERNANCE_RBAC_ENFORCE is
 * 'true' — and that flag is set nowhere — so any member who knew their own
 * password could sign.
 *
 * The rule is checked in the QMS order: authority from the membership row
 * BEFORE the credential, so the route is not a password oracle for a role that
 * may not sign, and nothing is read or written for a refused signer.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const h = vi.hoisted(() => ({
  role: vi.fn(async (): Promise<string | null> => 'manager'),
  queries: [] as string[],
}));

vi.mock('../../../db.js', () => ({
  pool: {
    query: async (sql: string) => {
      h.queries.push(String(sql));
      // No stored password: the credential check refuses (401), which is how
      // a signer WITH authority shows it got past the authority gate.
      if (/password_hash/.test(sql)) return { rows: [] };
      if (/SELECT status FROM users/.test(sql)) return { rows: [{ status: 'active' }] };
      return { rows: [] };
    },
    connect: async () => ({
      query: async (sql: string) => {
        h.queries.push(String(sql));
        return { rows: [] };
      },
      release: () => {},
    }),
  },
}));
vi.mock('../../../services/auth-security-service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/auth-security-service.js')>()),
  isAccountLocked: async () => ({ locked: false }),
  recordFailedLogin: async () => ({ locked: false, remainingAttempts: 5 }),
}));
vi.mock('../../../services/mfaService.js', () => ({
  verifyToken: vi.fn(async () => false),
  isMfaEnabled: vi.fn(async () => false),
}));
vi.mock('../../../services/part11/resolve-signer-role.js', () => ({
  resolveSignerOrgRole: (...a: unknown[]) => h.role(...(a as [])),
}));

import actionsRouter from '../actions.js';

const ORG = 1;
const USER = 3;

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { id: USER, organizationId: ORG, role: 'manager' };
    next();
  });
  a.use('/api/c2c/actions', actionsRouter);
  return a;
}

const BODY = {
  target: 'ectd-sequence:6',
  reason: 'QA J6 freeze probe for the release',
  payload: { meaning: 'approval' },
  reauth: { password: 'demo-password' },
};

beforeEach(() => {
  h.queries.length = 0;
  h.role.mockReset();
});

describe('POST /api/c2c/actions/sign — signing authority (21 CFR Part 11 §11.10(g))', () => {
  it.each(['manager', 'member', 'viewer'])(
    'refuses a %s with 403 ESIGNATURE_NO_AUTHORITY, before the password is read, writing nothing',
    async (role) => {
      h.role.mockResolvedValue(role);
      const res = await request(app()).post('/api/c2c/actions/sign').send(BODY);
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('ESIGNATURE_NO_AUTHORITY');
      expect(res.body.detail).toMatch(/§11\.10\(g\)/);
      expect(h.role).toHaveBeenCalledWith(USER, ORG);
      expect(h.queries.some((q) => /password_hash/.test(q))).toBe(false);
      expect(h.queries.some((q) => /INSERT/i.test(q))).toBe(false);
    },
  );

  it('refuses a caller with no membership in the organisation (no role is no authority)', async () => {
    h.role.mockResolvedValue(null);
    const res = await request(app()).post('/api/c2c/actions/sign').send(BODY);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('ESIGNATURE_NO_AUTHORITY');
  });

  it('refuses, and does not sign, when the role cannot be read', async () => {
    h.role.mockRejectedValue(new Error('connection refused'));
    const res = await request(app()).post('/api/c2c/actions/sign').send(BODY);
    expect(res.status).toBe(500);
    expect(h.queries.some((q) => /password_hash/.test(q))).toBe(false);
    expect(JSON.stringify(res.body)).not.toMatch(/connection refused/);
  });

  it('lets a role with signing authority through to the credential check', async () => {
    h.role.mockResolvedValue('admin');
    const res = await request(app()).post('/api/c2c/actions/sign').send(BODY);
    // The credential check ran (no stored password → refused): the authority
    // gate admitted the admin.
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('REAUTH_PASSWORD_INVALID');
    expect(h.queries.some((q) => /password_hash/.test(q))).toBe(true);
  });

  it('applies the same rule to revoking a signature, which writes a signature row too', async () => {
    h.role.mockResolvedValue('manager');
    const res = await request(app()).post('/api/c2c/actions/revoke-signature').send(BODY);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('ESIGNATURE_NO_AUTHORITY');
  });

  it('leaves a non-signature command alone (claim needs no signing authority)', async () => {
    h.role.mockResolvedValue('member');
    const res = await request(app()).post('/api/c2c/actions/claim').send({ ...BODY, payload: {} });
    expect(res.status).not.toBe(403);
    expect(h.role).not.toHaveBeenCalled();
  });
});
