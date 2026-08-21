/**
 * 21 CFR Part 11 §11.10(g) signing authority on the AUTHORING signature routes
 * (POST /docs/:docId/e-sign and POST /docs/:docId/sign).
 *
 * ── What was open ────────────────────────────────────────────────────────────
 * Both handlers verified identity (a JWT) and a credential (the §11.200 PIN)
 * and then let ANY authenticated member sign. Neither consulted the caller's
 * role, so `meaning: 'APPROVER'` — which flips the document to APPROVED and
 * inserts a frozen_documents row — was available to a viewer who knew a PIN.
 *
 * §11.10(g) requires "controls to ensure that persons who ... electronically
 * sign records ... have the authority to do so". Identity is not authority.
 * The policy already existed in signing-authority.ts, whose own header lists
 * the surfaces that consult it; this router was not among them.
 *
 * ── Why the gate sits before the PIN check ───────────────────────────────────
 * An unauthorized caller must not learn whether a PIN is correct. If authority
 * were checked after the credential, this endpoint would answer 401 for a wrong
 * PIN and 403 for a right one — a PIN oracle for the signing credential of any
 * account whose email the caller can guess. The ordering is asserted below, not
 * merely arranged: `rejects an unauthorized role BEFORE verifying the PIN`
 * sends a deliberately wrong PIN and requires 403, not 401.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';

const resolveSignerOrgRole = vi.hoisted(() => vi.fn());
vi.mock('../../services/part11/resolve-signer-role.js', () => ({ resolveSignerOrgRole }));

/**
 * The router's own membership re-check (AUTH_009/AUTH_010) resolves through
 * Drizzle, not raw SQL, and fail-closes with 503 when it cannot reach a
 * catalog. It answers "is this user still in this org" and never looks at the
 * ROLE — which is exactly why the §11.10(g) gate under test is a separate
 * control rather than a duplicate of it. Stubbed to PASS here so these tests
 * exercise the authority decision and nothing else.
 */
vi.mock('../../middleware/orgMembership', () => ({
  enforceOrgMembership: (_req: unknown, _res: unknown, next: () => void) => next(),
  invalidateOrgMembershipCache: () => undefined,
}));

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));
vi.mock('../../db', () => ({
  pool: {
    query: (...a: unknown[]) => mockQuery(...a),
    connect: async () => ({
      query: (...a: unknown[]) => mockQuery(...a),
      release: () => undefined,
    }),
  },
  getPool: () => ({ query: (...a: unknown[]) => mockQuery(...a) }),
  query: (...a: unknown[]) => mockQuery(...a),
  db: {},
}));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-signing-authority';
process.env.JWT_SECRET_DEV = process.env.JWT_SECRET;

import router from '../authoring.router';

async function bearer(): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const token = await new SignJWT({
    userId: '7',
    id: '7',
    sub: '7',
    email: 'signer@test.co',
    organizationId: '3',
    role: 'viewer',
    roles: ['viewer'],
    type: 'access',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(secret);
  return `Bearer ${token}`;
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/authoring', router);
  return app;
}

/**
 * The router runs its OWN membership re-check first (AUTH_009/AUTH_010) and
 * fail-closes with 503 when it cannot verify one. That check answers "is this
 * user still in this org" — it does not look at the ROLE, which is why the
 * §11.10(g) gate under test is a separate control and not a duplicate of it.
 * The mock satisfies membership so the tests reach the gate they are about.
 */
beforeEach(() => {
  resolveSignerOrgRole.mockReset();
  mockQuery.mockReset();
  mockQuery.mockImplementation(async (sql: unknown) => {
    if (String(sql).includes('organization_users')) {
      return { rowCount: 1, rows: [{ role: 'viewer', organization_id: 3, user_id: 7 }] };
    }
    return { rowCount: 0, rows: [] };
  });
});

describe('§11.10(g) — authoring e-signature requires signing authority', () => {
  for (const path of ['e-sign', 'sign']) {
    it(`/${path}: a role outside the allowlist is refused`, async () => {
      resolveSignerOrgRole.mockResolvedValue('viewer');

      const res = await request(makeApp())
        .post(`/api/authoring/docs/D1/${path}`)
        .set('Authorization', await bearer())
        .send({ pin: '1234', meaning: 'APPROVER', intent: 'Approve', reason: 'approving now' });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ESIGNATURE_NO_AUTHORITY');
    });

    it(`/${path}: no membership row at all is refused (fails closed)`, async () => {
      resolveSignerOrgRole.mockResolvedValue(null);

      const res = await request(makeApp())
        .post(`/api/authoring/docs/D1/${path}`)
        .set('Authorization', await bearer())
        .send({ pin: '1234', meaning: 'REVIEWER', intent: 'Review', reason: 'reviewing now' });

      expect(res.status).toBe(403);
    });

    it(`/${path}: rejects an unauthorized role BEFORE verifying the PIN`, async () => {
      resolveSignerOrgRole.mockResolvedValue('viewer');

      // A PIN that could not possibly verify. If authority were checked after
      // the credential this would be 401; 403 proves the ordering, and proves
      // the endpoint cannot be used to probe PINs.
      const res = await request(makeApp())
        .post(`/api/authoring/docs/D1/${path}`)
        .set('Authorization', await bearer())
        .send({ pin: 'definitely-wrong', meaning: 'APPROVER', intent: 'Approve', reason: 'approving' });

      expect(res.status).toBe(403);
      expect(res.status).not.toBe(401);
    });

    it(`/${path}: an authorized role passes the gate and proceeds`, async () => {
      resolveSignerOrgRole.mockResolvedValue('approver');

      const res = await request(makeApp())
        .post(`/api/authoring/docs/D1/${path}`)
        .set('Authorization', await bearer())
        .send({ pin: '1234', meaning: 'APPROVER', intent: 'Approve', reason: 'approving now' });

      // Past the authority gate. What it becomes next (404 for the unknown
      // document, 401 for the unverifiable PIN) is another control's business —
      // the one thing it must NOT be is a §11.10(g) refusal.
      expect(res.status).not.toBe(403);
    });
  }
});

describe('§11.70 — a signature must be linked to a real record', () => {
  it('e-sign refuses an unknown document rather than binding to sha256("")', async () => {
    resolveSignerOrgRole.mockResolvedValue('approver');
    // Every SELECT returns nothing: the document does not exist for this tenant.
    mockQuery.mockResolvedValue({ rowCount: 0, rows: [] });

    const res = await request(makeApp())
      .post('/api/authoring/docs/does-not-exist/e-sign')
      .set('Authorization', await bearer())
      .send({ pin: '1234', meaning: 'APPROVER', intent: 'Approve' });

    // computeDocHash hashes zero section rows to sha256(""), which is
    // indistinguishable from an unknown or cross-tenant id — so without this
    // guard the handler signed, attempted an approval flip against zero rows,
    // inserted a frozen_documents row, and returned success.
    expect(res.status).toBe(404);
  });
});
