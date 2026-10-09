/**
 * Approving a QMS change is an electronic signature.
 *
 * Security review 2026-09-24, DP-31 (remediation plan P1-28). A change-control
 * record was approved with no ceremony on either door:
 * `POST /api/mdx/qms/changes/:id/transition {to:'approved'}` and the AnA tool
 * `qms_change_transition` both reached `transitionChange`, whose only control on
 * the approve step was segregation of duties. There was no re-authentication, no
 * meaning and no electronic_signatures row, and the audit write came after the
 * stamp. ICH Q10 §3.2.3 makes the approval of a change the controlled step, and
 * §11.50 makes an approval a signed record.
 *
 * The approval now has one door, the same ceremony as a controlled document's:
 *   - `transition {to:'approved'}` → 428 CHANGE_APPROVAL_REQUIRES_SIGNATURE,
 *                                     nothing written
 *   - empty body                    → 400, nothing verified or written
 *   - no signing authority          → 403 before the password is looked at
 *   - wrong password                → 401, nothing written
 *   - the proposer approving        → 403 QMS_SELF_APPROVAL, rolled back
 *   - not under assessment          → 409 QMS_INVALID_STATE, rolled back
 *   - a valid signing               → 200, the approval stamp, ONE chained ledger
 *                                     row (command 'approve') and ONE signature
 *                                     bound to the change's content digest,
 *                                     meaning APPROVED, on one transaction
 *
 * The ceremony (reverifySigner) runs for real; only its production wiring is
 * replaced by the account's state, as in qms-document-approval-signature.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const H = vi.hoisted(() => ({
  query: vi.fn(),
  txQuery: vi.fn(),
  release: vi.fn(),
  compare: vi.fn(),
  failures: vi.fn(),
  role: vi.fn(),
  recordGoverned: vi.fn(),
  persistSignature: vi.fn(),
}));

vi.mock('../../db', () => ({
  pool: {
    query: (...a: unknown[]) => H.query(...a),
    connect: async () => ({ query: (...a: unknown[]) => H.txQuery(...a), release: H.release }),
  },
}));
vi.mock('../../services/audit/audit-write-outcome', () => ({
  recordAuditRow: async () => ({ persisted: true, chained: true }),
}));
vi.mock('../../services/part11/reverify-signer-deps', () => ({
  signerReverificationDeps: () => ({
    loadPasswordHash: async () => 'stored-hash',
    comparePassword: (plain: string, hash: string) => H.compare(plain, hash),
    isMfaEnabled: async () => false,
    verifyMfaToken: async () => false,
    isAccountActive: async () => true,
    isAccountLocked: async () => false,
    recordFailedAttempt: (id: number) => H.failures(id),
    warn: () => {},
  }),
}));
vi.mock('../../services/part11/resolve-signer-role', () => ({
  resolveSignerOrgRole: (...a: unknown[]) => H.role(...a),
}));
vi.mock('../c2c/actions', () => ({
  recordGovernedAction: (...a: unknown[]) => H.recordGoverned(...a),
}));
vi.mock('../../services/part11/signature-persistence', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../services/part11/signature-persistence')>();
  return { ...real, persistGovernedActionSignature: (...a: unknown[]) => H.persistSignature(...a) };
});

import mdxQmsRouter from '../mdx-qms';

const ORG = 9;
const SIGNER = 8;
const PROPOSER = 7;

const UNDER_ASSESSMENT = {
  id: 1, organization_id: ORG, change_number: 'CC-2026-014', title: 'Sterile filter supplier change',
  description: 'Replace the 0.22 µm filter supplier.', change_type: 'supplier', classification: 'major',
  risk_level: 'high', status: 'under_assessment', reason: 'Supplier discontinued the part.',
  impact_assessment: 'Requalify the filter; no product-contact change.', implementation_plan: 'PQ runs x3.',
  proposed_by: PROPOSER, assessed_by: SIGNER, approved_by: null, approved_at: null,
  target_implementation_date: '2026-11-01', qms_document_id: null, metadata: {},
};

const VALID_BODY = { password: 'correct horse', meaning: 'APPROVED', reason: 'Impact assessment reviewed; approved for implementation.' };

function app(userId = SIGNER) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { organizationId: ORG, id: userId };
    next();
  });
  a.use('/api/mdx', mdxQmsRouter);
  return a;
}

const txSql = () => H.txQuery.mock.calls.map((c) => String(c[0]));
const wroteApproval = () =>
  [...txSql(), ...H.query.mock.calls.map((c) => String(c[0]))].some((s) => /UPDATE qms_change_controls/i.test(s) && /approved/i.test(s));

/** Transaction script: FOR UPDATE read returns `row`; the UPDATE returns it approved. */
function scriptTransaction(row: Record<string, unknown> | null) {
  H.txQuery.mockImplementation(async (sql: string) => {
    const text = String(sql);
    if (/^(BEGIN|COMMIT|ROLLBACK)/.test(text)) return { rows: [] };
    if (text.includes('FOR UPDATE')) return { rows: row ? [row] : [] };
    if (/^\s*UPDATE qms_change_controls/i.test(text)) {
      return { rows: row ? [{ ...row, status: 'approved', approved_by: SIGNER, approved_at: '2026-09-25T09:00:00.000Z' }] : [] };
    }
    return { rows: [] };
  });
}

beforeEach(() => {
  for (const f of [H.query, H.txQuery, H.release, H.compare, H.failures, H.role, H.recordGoverned, H.persistSignature]) f.mockReset();
  H.query.mockResolvedValue({ rows: [UNDER_ASSESSMENT] });
  H.compare.mockImplementation(async (plain: string) => plain === 'correct horse');
  H.role.mockResolvedValue('admin');
  H.recordGoverned.mockResolvedValue({ actionId: 'act-1', auditId: 'aud-1', sha256Chain: 'c'.repeat(64) });
  H.persistSignature.mockResolvedValue({ id: 41, signedAt: new Date('2026-09-25T09:00:00.000Z') });
  scriptTransaction(UNDER_ASSESSMENT);
});

describe('the unsigned door is closed', () => {
  it('transition {to:"approved"} is refused 428 and writes nothing', async () => {
    const res = await request(app()).post('/api/mdx/qms/changes/1/transition').send({ to: 'approved' });
    expect(res.status).toBe(428);
    expect(res.body.details?.code).toBe('CHANGE_APPROVAL_REQUIRES_SIGNATURE');
    expect(wroteApproval()).toBe(false);
    expect(H.persistSignature).not.toHaveBeenCalled();
  });

  it('an illegal move is still named as one (closed → approved is 409)', async () => {
    H.query.mockResolvedValue({ rows: [{ ...UNDER_ASSESSMENT, status: 'closed' }] });
    const res = await request(app()).post('/api/mdx/qms/changes/1/transition').send({ to: 'approved' });
    expect(res.status).toBe(409);
  });
});

describe('POST /api/mdx/qms/changes/:id/approve — the signed door', () => {
  it('400 on an empty body, naming the missing components; nothing verified', async () => {
    const res = await request(app()).post('/api/mdx/qms/changes/1/approve').send({});
    expect(res.status).toBe(400);
    expect(H.compare).not.toHaveBeenCalled();
    expect(H.txQuery).not.toHaveBeenCalled();
  });

  it('403 without signing authority, before the password is looked at', async () => {
    H.role.mockResolvedValue('viewer');
    const res = await request(app()).post('/api/mdx/qms/changes/1/approve').send(VALID_BODY);
    expect(res.status).toBe(403);
    expect(H.compare).not.toHaveBeenCalled();
    expect(H.txQuery).not.toHaveBeenCalled();
  });

  it('401 on a wrong password; nothing written', async () => {
    const res = await request(app()).post('/api/mdx/qms/changes/1/approve').send({ ...VALID_BODY, password: 'wrong' });
    expect(res.status).toBe(401);
    expect(H.txQuery).not.toHaveBeenCalled();
  });

  it('403 QMS_SELF_APPROVAL when the proposer signs; rolled back', async () => {
    const res = await request(app(PROPOSER)).post('/api/mdx/qms/changes/1/approve').send(VALID_BODY);
    expect(res.status).toBe(403);
    expect(res.body.details?.code).toBe('QMS_SELF_APPROVAL');
    expect(txSql()).toContain('ROLLBACK');
    expect(H.persistSignature).not.toHaveBeenCalled();
    expect(wroteApproval()).toBe(false);
  });

  it('409 when the change is not under assessment; rolled back', async () => {
    scriptTransaction({ ...UNDER_ASSESSMENT, status: 'proposed' });
    const res = await request(app()).post('/api/mdx/qms/changes/1/approve').send(VALID_BODY);
    expect(res.status).toBe(409);
    expect(txSql()).toContain('ROLLBACK');
    expect(H.persistSignature).not.toHaveBeenCalled();
  });

  it('a valid signing stamps the approval, writes one ledger row and one digest-bound signature, and commits', async () => {
    const res = await request(app()).post('/api/mdx/qms/changes/1/approve').send(VALID_BODY);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.status).toBe('approved');

    expect(H.recordGoverned).toHaveBeenCalledTimes(1);
    expect(H.recordGoverned.mock.calls[0][1]).toMatchObject({
      command: 'approve', target: 'qms-change:1', reason: VALID_BODY.reason, userId: SIGNER, orgId: ORG,
    });
    expect(H.persistSignature).toHaveBeenCalledTimes(1);
    const sig = H.persistSignature.mock.calls[0][1] as { binding: { digest: string; basis: string }; payload: { meaning: string } };
    const { computeQmsChangeContentDigest, QMS_CHANGE_BINDING_BASIS } = await import('../../services/qms/change-approval-signature');
    expect(sig.binding.digest).toBe(computeQmsChangeContentDigest(UNDER_ASSESSMENT));
    expect(sig.binding.basis).toBe(QMS_CHANGE_BINDING_BASIS);
    expect(sig.payload.meaning).toBe('APPROVED');

    const sql = txSql();
    expect(sql[0]).toMatch(/^BEGIN/);
    expect(sql[sql.length - 1]).toMatch(/^COMMIT/);
    expect(res.body.meta?.signature).toMatchObject({ id: 41, meaning: 'APPROVED' });
  });
});
