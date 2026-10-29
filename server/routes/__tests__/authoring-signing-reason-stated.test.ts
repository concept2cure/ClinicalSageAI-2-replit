/**
 * An Authoring signature carries what it means to its signer, stated
 * (21 CFR 11.50(a)(3); POST /docs/:docId/e-sign `intent`, POST /docs/:docId/sign
 * `reason`).
 *
 * Both routes checked only that the field was truthy, so a reason of spaces, a
 * number or an object passed and was stored verbatim as the meaning of a
 * legally binding signature (CSR path review, 2026-10-29). The signing dialog
 * already asks for eight characters (EsignModal MIN_REASON); the server now
 * holds the same rule (governed-reason.ts), so a refusal here is one the
 * product's own dialog never sends.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';

const resolveSignerOrgRole = vi.hoisted(() => vi.fn(async () => 'approver'));
vi.mock('../../services/part11/resolve-signer-role.js', () => ({ resolveSignerOrgRole }));
vi.mock('../../middleware/orgMembership', () => ({
  enforceOrgMembership: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireEditorAccess: (_req: unknown, _res: unknown, next: () => void) => next(),
  GOVERNED_WRITE_ROLES: new Set(['owner', 'admin', 'approver', 'reviewer']),
  invalidateOrgMembershipCache: () => undefined,
}));

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));
vi.mock('../../db', () => ({
  pool: {
    query: (...a: unknown[]) => mockQuery(...a),
    connect: async () => ({ query: (...a: unknown[]) => mockQuery(...a), release: () => undefined }),
  },
  getPool: () => ({ query: (...a: unknown[]) => mockQuery(...a) }),
  query: (...a: unknown[]) => mockQuery(...a),
  db: {},
}));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-signing-reason';
process.env.JWT_SECRET_DEV = process.env.JWT_SECRET;

import router from '../authoring.router';

const DOC = 'd0c0d0c0-0000-4000-8000-0000000000d1';

async function bearer(): Promise<string> {
  const token = await new SignJWT({ userId: '41', id: '41', sub: '41', email: 'qa@test.co', organizationId: '3',
    role: 'admin', roles: ['admin'], type: 'access' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('10m')
    .sign(new TextEncoder().encode(process.env.JWT_SECRET));
  return `Bearer ${token}`;
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/authoring', router);
  return app;
}

const signatureWrites = () => mockQuery.mock.calls.filter(([sql]) => /INSERT INTO authoring_signatures/i.test(String(sql)));

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async (sql: unknown) => {
    if (String(sql).includes('organization_users')) return { rowCount: 1, rows: [{ role: 'admin', organization_id: 3, user_id: 41 }] };
    return { rowCount: 0, rows: [] };
  });
});

const ROUTES = [
  { path: 'e-sign', field: 'intent' },
  { path: 'sign', field: 'reason' },
] as const;

describe.each(ROUTES)('POST /docs/:docId/$path', ({ path, field }) => {
  it.each([
    ['missing', undefined], ['empty', ''], ['spaces only', '        '], ['seven characters', 'Approve'],
    ['a number', 12345678], ['an object', { text: 'Approving this document' }],
  ])(`refuses a ${field} that is %s, and signs nothing`, async (_label, value) => {
    const res = await request(makeApp()).post(`/api/authoring/docs/${DOC}/${path}`).set('Authorization', await bearer())
      .send({ password: 'signer-password', meaning: 'APPROVER', ...(value === undefined ? {} : { [field]: value }) });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SIGNATURE_REASON_REQUIRED');
    expect(res.body.error).toMatch(/Nothing was signed/);
    expect(signatureWrites()).toHaveLength(0);
  });

  it(`a stated ${field} passes this check and goes on to the next (here, the unknown document)`, async () => {
    const res = await request(makeApp()).post(`/api/authoring/docs/${DOC}/${path}`).set('Authorization', await bearer())
      .send({ password: 'signer-password', meaning: 'APPROVER', [field]: '  Approving this document for filing  ' });
    expect(res.body.code).not.toBe('SIGNATURE_REASON_REQUIRED');
    expect(res.status).toBe(404);
  });
});
