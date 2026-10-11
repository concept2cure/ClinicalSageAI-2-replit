/**
 * POST /runs/:id/finalize is the run's electronic signature and an event on
 * the record (21 CFR Part 11 §11.10(e), (g); §11.50, §11.70, §11.200). Split
 * from report-os-audit-recording.test.ts on 2026-10-01, over the same doubles
 * (_report-os-route-harness.ts).
 *
 * Pinned here: owners, admins and managers only, refused before any read
 * (review round 1, DP-47), and only when the signing policy gives the
 * membership's role authority to sign (P1-44b); a reason of at least 8
 * characters, a declared meaning and re-authentication before anything is
 * written; separation of duties against the run's requester; a run already
 * final, or with no snapshot to hold its seal, refused; the status, the seal
 * with the exact document it sealed, the chained `report_os.run_finalized`
 * row, the sign ledger row and the electronic_signatures row in ONE
 * tenant-stamped transaction on one connection: all land or none (503,
 * nothing changed). The ceremony's own edges (verifyReauth, the ledger
 * writer, the signature writer, the membership lookup) are replaced;
 * separation of duties and the signing policy run for real.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const h = await vi.hoisted(async () => (await import('./_report-os-route-harness')).createReportOsHarness());

vi.mock('../../db', () => ({ db: h.db, pool: h.pool, getPool: () => h.pool, getDb: () => h.db, query: vi.fn(), transaction: vi.fn() }));
vi.mock('../../auth', () => ({ authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock('../../utils/authedOrgId', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/authedOrgId')>()),
  authedOrgId: () => 7,
}));
vi.mock('../../services/report-os/entitlement-map', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/report-os/entitlement-map')>()),
  requireReportEntitlement: h.gate,
}));
vi.mock('../../services/report-os/orchestrator', () => ({ computeInitialRun: h.compute }));
vi.mock('../../services/report-os/research-compliance-report-providers', () => ({ computeDomainReport: async () => null }));
/* The attempt limiter's budget is its own test's subject
   (middleware/__tests__/signing-attempt-limiter.test.ts); here it would refuse
   this suite's eleventh finalize. It passes through and records its scope. */
vi.mock('../../middleware/signing-attempt-limiter', () => ({
  signingAttemptLimiter: (scope: string) => {
    h.limiterScopes.push(scope);
    return (_req: unknown, _res: unknown, next: () => void) => next();
  },
}));
vi.mock('../c2c/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../c2c/actions')>()),
  verifyReauth: h.reauth,
  recordGovernedAction: h.ledger,
}));
vi.mock('../../services/part11/signature-persistence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/part11/signature-persistence')>()),
  persistGovernedSignSignature: h.signature,
}));
/* The membership lookup reads organization_users; the policy it feeds
   (services/part11/signing-authority.ts) is real. */
vi.mock('../../services/part11/resolve-signer-role', () => ({ resolveSignerOrgRole: h.memberRole }));
vi.mock('../../services/auditService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/auditService')>()),
  writeChainedAuditRow: h.audit,
}));

import reportOsRouter from '../report-os';
import { resetReportOsHarness } from './_report-os-route-harness';
import { verifySeal } from '../../services/report-os/sealing/seal';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  /* organizationId is what the real auth middleware sets; the router's write
     gate (requireEditorAccessForWrites) reads it. */
  (req as unknown as { user: { id: number; role: string; organizationId: number } }).user = {
    id: 5, role: req.get('x-test-role') ?? 'manager', organizationId: 7,
  };
  next();
});
app.use('/api/report-os', reportOsRouter);

const STAMP = "SELECT set_config('app.current_tenant_id', $1, true)";
const TYPE = { typeId: 'readiness.executive_digest', label: 'Executive Readiness Digest', family: 'readiness', allowedScopes: ['program', 'project', 'submission'] };
const RUN = {
  id: 41, runUuid: '00000000-0000-4000-8000-000000000041', organizationId: 7, scopeType: 'submission', scopeId: 'sub-1',
  reportTypeId: TYPE.typeId, status: 'completed', confidence: 90, blockers: [] as string[],
  dependencySummary: { providers: [], summary: {}, criticalBlockers: [] },
  createdAt: new Date('2026-09-30T12:00:00Z'), completedAt: new Date('2026-09-30T12:00:00Z'),
};

const auditEntry = () => h.audit.mock.calls[0]?.[1] as Record<string, any> | undefined;
const auditFails = () =>
  h.audit.mockImplementation(async () => {
    h.statements.push('<audit row>');
    throw new Error('audit_logs refused the row');
  });

beforeEach(() => resetReportOsHarness(h));

const SIGNED = { reason: 'Issued for the board pack', meaning: 'authorship', reauth: { password: 'correct horse' } };
const finalize = (role = 'manager', body: Record<string, unknown> = SIGNED) =>
  request(app).post(`/api/report-os/runs/${RUN.id}/finalize`).set('x-test-role', role).send(body);
const eligible = (status = 'completed') => h.queued.select.push([{ ...RUN, status }], [{ label: TYPE.label, truthfulnessRules: {} }]);
/** The connection answers the run reads with `locked` and requester 5 (the session user), and the snapshot read with one snapshot. */
const lockedAs = (locked: string, requestedBy: number | null = 5) => {
  h.respond.fn = (sql) =>
    /FROM report_runs/.test(sql)
      ? [{ status: locked, requested_by: requestedBy }]
      : /FROM report_snapshots/.test(sql) ? [{ id: 3, snapshot_metadata: { reportTypeId: TYPE.typeId } }] : [];
};
const nothingWritten = () => {
  expect(h.statements.filter((x) => /^UPDATE/.test(x))).toEqual([]);
  expect(h.audit).not.toHaveBeenCalled();
  expect(h.ledger).not.toHaveBeenCalled();
  expect(h.signature).not.toHaveBeenCalled();
};

describe('POST /runs/:id/finalize (DP-47)', () => {

  it.each(['member', 'viewer'])('refuses a %s with 403 before reading anything', async (role) => {
    eligible();
    const res = await finalize(role);
    expect(res.status).toBe(403);
    expect(h.reads.select).toBe(0);
    expect(h.statements).toEqual([]);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it.each(['owner', 'admin', 'manager'])('lets the %s finalize where the signing policy admits the role: status, seal, chain row and signature commit together', async (role) => {
    // The deployment's policy (ESIGNATURE_SIGNING_ROLES) admits the whole tier;
    // the default policy's refusal of an owner or a manager is pinned below.
    process.env.ESIGNATURE_SIGNING_ROLES = 'owner,admin,manager';
    h.memberRole.mockResolvedValue(role);
    eligible();
    lockedAs('completed');
    const res = await finalize(role);
    expect(res.status).toBe(200);
    expect(h.memberRole).toHaveBeenCalledWith(5, 7);
    const seal = res.body.data.seal;
    expect(seal.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.data.signature).toEqual({ signatureId: 'sig_1', signedAt: '2026-10-01T09:00:00.000Z', meaning: 'authorship' });
    // The signature row is over report-run:41 and its manifest names the seal
    // it signed (the manifest is what the §11.200 attribution hash covers).
    expect(h.signature.mock.calls[0][1]).toMatchObject({
      target: 'report-run:41',
      extraManifest: { act: { finalized: true, sealHash: seal.contentHash, algorithm: 'sha256' } },
    });
    expect(auditEntry()).toMatchObject({
      tenantId: 7,
      userId: 5,
      action: 'report_os.run_finalized',
      resourceType: 'report_run',
      resourceId: '41',
      details: {
        reportTypeId: TYPE.typeId, sealHash: seal.contentHash, algorithm: 'sha256', atomCount: seal.atomCount,
        reason: SIGNED.reason, meaning: 'authorship', priorStatus: 'completed',
      },
    });
    expect(h.reauth).toHaveBeenCalledWith(5, { password: 'correct horse' });
    expect(h.ledger.mock.calls[0][1]).toMatchObject({
      orgId: 7, userId: 5, command: 'sign', target: 'report-run:41', reason: SIGNED.reason, domain: 'report_os',
      payload: { finalized: true, sealHash: seal.contentHash, priorStatus: 'completed', meaning: 'authorship' },
    });
    // One connection, one transaction: the lock, both writes and the row sit between BEGIN and COMMIT.
    const s = h.statements;
    expect(s.slice(0, 2)).toEqual(['BEGIN', STAMP]);
    expect(s.slice(-2)).toEqual(['COMMIT', '<released>']);
    const at = (re: RegExp) => s.findIndex((x) => re.test(x));
    expect(at(/FROM report_runs .*FOR UPDATE/)).toBeGreaterThan(1);
    expect(at(/^UPDATE report_runs SET status = 'final'/)).toBeGreaterThan(at(/FOR UPDATE/));
    expect(at(/^UPDATE report_snapshots SET snapshot_metadata/)).toBeGreaterThan(at(/^UPDATE report_runs/));
    expect(at(/<audit row>/)).toBeGreaterThan(at(/^UPDATE report_snapshots/));
    expect(at(/<sign ledger>/)).toBeGreaterThan(at(/<audit row>/));
    expect(at(/<signature row>/)).toBeGreaterThan(at(/<sign ledger>/));
    expect(at(/COMMIT/)).toBeGreaterThan(at(/<signature row>/));
    expect(h.reads.select, 'the run and its type are read before the transaction; nothing else').toBe(2);
  });

});

describe('POST /runs/:id/finalize is an electronic signature (reporting review 2026-10-01)', () => {
  it('limits signing attempts on finalize (11.300(d))', () => {
    expect(h.limiterScopes).toContain('report-finalize');
  });

  it.each([
    ['no reason', { ...SIGNED, reason: undefined }],
    ['a reason under 8 characters', { ...SIGNED, reason: 'ok' }],
  ])('refuses %s with 400 REASON_REQUIRED before reading anything', async (_label, body) => {
    eligible();
    const res = await finalize('manager', body);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'REASON_REQUIRED' }, field: 'reason' });
    expect(h.reads.select).toBe(0);
    expect(h.reauth).not.toHaveBeenCalled();
    nothingWritten();
  });

  it('refuses a password that is not accepted with 401, before any transaction', async () => {
    eligible();
    lockedAs('completed');
    h.reauth.mockResolvedValue({ ok: false, error: 'REAUTH_PASSWORD_INVALID' });
    const res = await finalize();
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: { code: 'REAUTH_PASSWORD_INVALID' } });
    expect(res.body.error.message).toMatch(/Nothing was signed/);
    expect(h.statements).toEqual([]);
    nothingWritten();
  });

  it('refuses a meaning a finalize cannot carry', async () => {
    eligible();
    const res = await finalize('manager', { ...SIGNED, meaning: 'release' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MEANING_NOT_ALLOWED');
    nothingWritten();
  });

});

/*
 * P1-44b (2026-10-01). Finalizing is the run's signature, so the signer needs
 * the authority to sign (§11.10(g)) as well as finalize's tier. The role is
 * the membership row's, never the token's or the body's.
 *
 * Follow-up decision "Report finalize" (docs/LAUNCH_DEFINITION_OF_DONE.md):
 * finalize keeps ONE authority check, the ceremony's floor
 * (governed-signature-ceremony assertSigningAuthority, 505f71263). The route
 * carried its own copy ahead of it, so the membership was read twice and the
 * two copies could drift. With the copy removed, these refusals come from the
 * ceremony: after the run is read, before any password is compared or any
 * transaction is opened, so they spend no guess and write nothing.
 */
const CEREMONY_NO_AUTHORITY =
  'Your role does not permit applying an electronic signature (21 CFR Part 11 §11.10(g)). Nothing was signed.';

describe('POST /runs/:id/finalize needs signing authority, checked once, by the ceremony (P1-44b, 21 CFR 11.10(g))', () => {
  it.each(['owner', 'manager'])(
    'refuses the role %s, which the default signing policy does not admit: the ceremony\'s 403, before any password or transaction',
    async (role) => {
      h.memberRole.mockResolvedValue(role);
      eligible();
      lockedAs('completed');
      const res = await finalize(role);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ success: false, error: { code: 'ESIGNATURE_NO_AUTHORITY', message: CEREMONY_NO_AUTHORITY } });
      expect(h.memberRole, 'one authority check').toHaveBeenCalledTimes(1);
      expect(h.memberRole).toHaveBeenCalledWith(5, 7);
      expect(h.reauth, 'no password is compared').not.toHaveBeenCalled();
      expect(h.statements, 'no transaction is opened').toEqual([]);
      nothingWritten();
    },
  );

  it.each([
    ['a viewer membership under a token saying admin (the role is the membership\'s)', 'viewer'],
    ['no membership in the organization', null],
  ])('refuses %s, through the ceremony', async (_label, member) => {
    h.memberRole.mockResolvedValue(member);
    eligible();
    const res = await finalize('admin');
    expect(res.status).toBe(403);
    expect(res.body.error).toEqual({ code: 'ESIGNATURE_NO_AUTHORITY', message: CEREMONY_NO_AUTHORITY });
    expect(h.memberRole).toHaveBeenCalledTimes(1);
    nothingWritten();
  });

  it('a membership that cannot be read signs nothing: the ceremony\'s 503, with no detail', async () => {
    h.memberRole.mockRejectedValue(new Error('organization_users unreadable: secret-detail'));
    eligible();
    const res = await finalize('admin');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SIGNING_AUTHORITY_UNVERIFIED');
    expect(JSON.stringify(res.body)).not.toContain('secret-detail');
    expect(h.reauth).not.toHaveBeenCalled();
    expect(h.statements).toEqual([]);
    nothingWritten();
  });

  it('a role with authority is looked up once, by the ceremony, and signs', async () => {
    h.memberRole.mockResolvedValue('admin');
    eligible();
    lockedAs('completed');
    const res = await finalize('admin');
    expect(res.status).toBe(200);
    expect(h.memberRole).toHaveBeenCalledTimes(1);
    expect(h.memberRole).toHaveBeenCalledWith(5, 7);
  });
});

describe('POST /runs/:id/finalize: separation of duties and the signature row', () => {
  it('refuses an approval from the run\'s own requester (separation of duties) and rolls back', async () => {
    eligible();
    lockedAs('completed', 5);
    const res = await finalize('manager', { ...SIGNED, meaning: 'approval' });
    expect(res.status).toBe(403);
    expect(h.statements.slice(-2)).toEqual(['ROLLBACK', '<released>']);
    nothingWritten();
  });

  it('refuses an authorship signature from someone who did not request the run', async () => {
    eligible();
    lockedAs('completed', 99);
    const res = await finalize();
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_AN_AUTHOR');
    expect(res.body.error.message).toMatch(/not an author of this report/);
    nothingWritten();
  });

  it('answers 503 with nothing changed when the signature row cannot be written', async () => {
    eligible();
    lockedAs('completed');
    h.signature.mockImplementation(async () => {
      h.statements.push('<signature row>');
      throw new Error('electronic_signatures refused the row');
    });
    const res = await finalize();
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ error: { code: 'REPORT_FINALIZE_NOT_RECORDED' } });
    expect(JSON.stringify(res.body)).not.toContain('electronic_signatures refused');
    expect(h.statements).not.toContain('COMMIT');
    expect(h.statements.slice(-2)).toEqual(['ROLLBACK', '<released>']);
  });

  it('refuses a run that is already final with 409 RUN_ALREADY_FINAL and writes nothing', async () => {
    eligible('final');
    const res = await finalize();
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ success: false, error: { code: 'RUN_ALREADY_FINAL' } });
    expect(h.statements).toEqual([]);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it('refuses when a concurrent finalize won the lock, and rolls back', async () => {
    eligible();
    lockedAs('final');
    const res = await finalize();
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RUN_ALREADY_FINAL');
    expect(h.statements.filter((x) => /^UPDATE/.test(x))).toEqual([]);
    expect(h.statements.slice(-2)).toEqual(['ROLLBACK', '<released>']);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it('answers 503 with nothing changed when the chain row cannot be written: the writes roll back with it', async () => {
    eligible();
    lockedAs('completed');
    auditFails();
    const res = await finalize();
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ success: false, error: { code: 'REPORT_FINALIZE_NOT_RECORDED' }, data: { runId: 41 } });
    expect(res.body.error.message).toMatch(/not finalized/i);
    expect(res.body.error.message).toMatch(/Nothing was changed/);
    expect(JSON.stringify(res.body)).not.toContain('audit_logs refused');
    expect(h.statements).not.toContain('COMMIT');
    expect(h.statements.slice(-3)).toEqual(['<audit row>', 'ROLLBACK', '<released>']);
  });

  it('records nothing when the truthfulness gate refuses the finalize', async () => {
    h.queued.select.push(
      [{ ...RUN, blockers: ['missing CSR'] }],
      [{ label: TYPE.label, truthfulnessRules: { requireBlockers: true, allowPartial: true } }],
    );
    const res = await finalize();
    expect(res.status).toBe(409);
    expect(h.statements).toEqual([]);
    expect(h.audit).not.toHaveBeenCalled();
  });
});

describe('the seal is stored with what it sealed (reporting review 2026-10-01)', () => {
  it('stores the exact sealed document beside its seal on the snapshot', async () => {
    eligible();
    lockedAs('completed');
    const res = await finalize();
    expect(res.status).toBe(200);
    const i = h.statements.findIndex((x) => /^UPDATE report_snapshots SET snapshot_metadata/.test(x));
    const stored = JSON.parse(String(h.params[i][1]));
    expect(stored.seal.contentHash).toBe(res.body.data.seal.contentHash);
    expect(stored.sealedDocument.sections.length).toBeGreaterThan(0);
    // What is stored is what was sealed: the document hashes to the stored seal.
    expect(verifySeal(stored.sealedDocument, stored.seal).ok).toBe(true);
    expect(verifySeal({ ...stored.sealedDocument, status: 'partial' }, stored.seal).ok).toBe(false);
    // The chain row records that the document was stored, so its later removal reads as a mismatch.
    expect(auditEntry()?.details).toMatchObject({ documentStored: true, sealHash: stored.seal.contentHash });
    expect(stored.sealedDocument.status).toBe('final');
    // The document is stamped with the run's computation time, not the moment of sealing.
    expect(stored.sealedDocument.generatedAt).toBe(RUN.createdAt.toISOString());
  });

  // P1-44b: the seal is the signature's binding, so a run with nowhere to keep
  // it is not made final, and nothing is signed or recorded.
  it('refuses a run with no snapshot to hold its seal, and rolls back: nothing signed or recorded', async () => {
    eligible();
    h.respond.fn = (sql) => (/FROM report_runs/.test(sql) ? [{ status: 'completed', requested_by: 5 }] : []);
    const res = await finalize();
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ success: false, error: { code: 'RUN_HAS_NO_SNAPSHOT' }, data: { runId: 41 } });
    expect(res.body.error.message).toMatch(/Nothing was signed/);
    expect(h.statements).not.toContain('COMMIT');
    expect(h.statements.slice(-2)).toEqual(['ROLLBACK', '<released>']);
    nothingWritten();
  });
});
