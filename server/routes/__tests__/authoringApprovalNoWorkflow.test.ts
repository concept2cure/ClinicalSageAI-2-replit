/**
 * "Zero pending approvals" is not the same fact as "all approvals complete".
 *
 * POST /docs/:docId/sign updates the signer's workflow step, then asks:
 *
 *     SELECT COUNT(*) AS pending FROM authoring_workflow_steps
 *      WHERE doc_id = $1 AND status = 'PENDING' AND tenant_id = $2
 *
 * and on '0' flips the document to APPROVED. That count is also '0' when NO
 * STEPS EXIST AT ALL — and the only thing that creates them is
 * POST /docs/:docId/submit, which has no client caller anywhere.
 *
 * So on the normal path — a document that was never submitted for approval —
 * the first signature by a QA/RA_CMC role finds zero pending steps, concludes
 * the approval chain is complete, and marks a regulated document APPROVED. An
 * approval chain that was never required reads exactly like one that finished.
 * APPROVED is a sealed state here: docSealed treats it as frozen and the
 * content becomes immutable.
 *
 * This is the same defect class this repository keeps removing — a check that
 * ran zero assertions reporting a pass — applied to the strongest state
 * transition in the authoring lifecycle.
 */
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery, mockClientQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockClientQuery: vi.fn(),
}));

vi.mock('../../db', () => {
  const api = {
    query: (...a: unknown[]) => mockQuery(...a),
    connect: async () => ({ query: (...a: unknown[]) => mockClientQuery(...a), release: () => {} }),
  };
  return { pool: api, getPool: () => api, query: (...a: unknown[]) => mockQuery(...a), db: {} };
});
vi.mock('../../services/part11/resolve-signer-role.js', () => ({
  resolveSignerOrgRole: async () => 'QA',
}));
vi.mock('../../services/part11/signing-authority.js', () => ({
  isSigningAuthorized: () => true,
  SIGNING_ROLES: ['QA'],
}));

// The signing routes re-verify the signer with the platform ceremony
// (services/part11/reverify-signer.ts); its production wiring is stubbed to an
// account whose password is PASSWORD, with no second factor enrolled. The
// ceremony itself has its own suites (authoring-sign-ceremony.test.ts).
vi.mock('../../services/part11/reverify-signer-deps', () => ({
  signerReverificationDeps: () => ({
    loadPasswordHash: async () => 'stored-hash',
    comparePassword: async (plain: string) => plain === 'signer-password',
    isMfaEnabled: async () => false,
    verifyMfaToken: async () => false,
    isAccountActive: async () => true,
    isAccountLocked: async () => false,
    recordFailedAttempt: async () => {},
    warn: () => {},
  }),
}));
// A signer is a numeric account; its membership re-check has its own suite.
vi.mock('../../middleware/orgMembership', () => ({
  enforceOrgMembership: (_req: unknown, _res: unknown, next: () => void) => next(),
  invalidateOrgMembershipCache: () => undefined,
}));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-approval-chain';
process.env.JWT_SECRET_DEV = process.env.JWT_SECRET;

import router from '../authoring.router';

async function bearer(): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  return `Bearer ${await new SignJWT({
    sub: '41', // a signer is a numeric account (membership re-check stubbed above)
    organizationId: 7,
    email: 'qa@test.co',
    roles: ['APPROVER', 'QA'],
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(secret)}`;
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/authoring', router);
  return app;
}

/** Every statement the transaction issued. */
const txStatements = () => mockClientQuery.mock.calls.map(c => String(c[0]));

/**
 * A document with NO workflow steps — never submitted for approval.
 * `pendingSteps` therefore counts zero, which is the whole point.
 */
const PASSWORD = 'signer-password';

function wireWorkflow(counts: { pending: string; total: string }) {
  mockQuery.mockImplementation(async (sql: unknown) => {
    const s = String(sql);
    if (s.includes('FROM authoring_documents')) {
      return { rowCount: 1, rows: [{ id: 'D1', title: 'Doc', status: 'draft' }] };
    }
    return { rowCount: 0, rows: [] };
  });
  mockClientQuery.mockImplementation(async (sql: unknown) => {
    const s = String(sql);
    if (s.includes('COUNT(*)') && s.includes('authoring_workflow_steps')) {
      return { rowCount: 1, rows: [counts] };
    }
    if (s.includes('FROM authoring_documents')) {
      return { rowCount: 1, rows: [{ id: 'D1', status: 'draft' }] };
    }
    return { rowCount: 1, rows: [{ id: 'X' }] };
  });
}

beforeEach(async () => {
  mockQuery.mockReset();
  mockClientQuery.mockReset();
});

describe('POST /docs/:docId/sign on a document with NO approval workflow', () => {
  it('does not flip the document to APPROVED', async () => {
    // No steps exist at all. Not "all approved" — never required.
    wireWorkflow({ pending: '0', total: '0' });
    await request(makeApp())
      .post('/api/authoring/docs/D1/sign')
      .set('Authorization', await bearer())
      .send({ meaning: 'APPROVER', reason: 'looks fine', password: PASSWORD });

    const approvals = txStatements().filter(
      s => s.includes('UPDATE authoring_documents') && s.includes("'APPROVED'"),
    );
    // An approval chain that was never required must not read as one that finished.
    expect(approvals).toHaveLength(0);
  });

  it('still records the signature — only the APPROVAL is withheld', async () => {
    wireWorkflow({ pending: '0', total: '0' });
    const res = await request(makeApp())
      .post('/api/authoring/docs/D1/sign')
      .set('Authorization', await bearer())
      .send({ meaning: 'APPROVER', reason: 'looks fine', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(txStatements().some(s => s.includes('INSERT INTO authoring_signatures'))).toBe(true);
  });

  it('does not seal the document into frozen_documents either', async () => {
    wireWorkflow({ pending: '0', total: '0' });
    await request(makeApp())
      .post('/api/authoring/docs/D1/sign')
      .set('Authorization', await bearer())
      .send({ meaning: 'APPROVER', reason: 'looks fine', password: PASSWORD });

    // APPROVED is a sealed state — the flip also froze the record.
    expect(txStatements().some(s => s.includes('INSERT INTO frozen_documents'))).toBe(false);
  });
});

describe('POST /docs/:docId/sign where an approval workflow DID exist', () => {
  it('still flips to APPROVED once every step is approved', async () => {
    // The real path must keep working: steps existed, none remain pending.
    wireWorkflow({ pending: '0', total: '3' });
    await request(makeApp())
      .post('/api/authoring/docs/D1/sign')
      .set('Authorization', await bearer())
      .send({ meaning: 'APPROVER', reason: 'final approval', password: PASSWORD });

    const approvals = txStatements().filter(
      s => s.includes('UPDATE authoring_documents') && s.includes("'APPROVED'"),
    );
    expect(approvals).toHaveLength(1);
  });

  it('does NOT approve while a step is still pending', async () => {
    wireWorkflow({ pending: '2', total: '3' });
    await request(makeApp())
      .post('/api/authoring/docs/D1/sign')
      .set('Authorization', await bearer())
      .send({ meaning: 'APPROVER', reason: 'my turn', password: PASSWORD });

    const approvals = txStatements().filter(
      s => s.includes('UPDATE authoring_documents') && s.includes("'APPROVED'"),
    );
    expect(approvals).toHaveLength(0);
  });
});
