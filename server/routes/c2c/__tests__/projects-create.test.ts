/**
 * POST /api/c2c/projects — real project create contract.
 *
 * The v2 New-Project wizard persists here instead of the old client-only
 * window.C2C_PROJECT stub. This locks: org scoping, required-field + enum
 * validation (so bad input never reaches SQL), the INSERT into the SAME
 * regulatory_programs table the portfolio list reads, the org-unique code
 * retry on 23505, the { data } response shaped to the portfolio display
 * contract, and the 503 PENDING_STORE fail-soft on an unprovisioned store.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import type { ScaffoldResult } from '../../../services/c2c/scaffold-project-documents.js';

// The create route now runs the program INSERT and the document scaffold in ONE
// transaction, so it acquires a client. `query` models that client: every
// statement the route issues — BEGIN, the INSERT, the scaffold's reads/writes,
// COMMIT — lands here in order. The pool's own `query` still serves the
// post-commit re-select, which deliberately runs outside the transaction.
const query = vi.fn();
const release = vi.fn();
/** The transaction client the route checked out — captured so the spine test
 *  can prove createSubmissionTx received THIS client (same transaction). */
let txnClient: { query: (...a: unknown[]) => unknown; release: () => void } | null = null;
vi.mock('../../../db.js', () => ({
  pool: {
    query: (...a: unknown[]) => query(...a),
    connect: async () => (txnClient = { query: (...a: unknown[]) => query(...a), release }),
  },
}));
// The scaffold is exercised by its own contract test; here it is stubbed so
// these assertions stay about the create route's transaction and contract.
//
// Typed against the real ScaffoldResult rather than left to inference: inferring
// from the happy-path implementation narrows documentId to `string` and drops
// `skipped` entirely, so the skip test below could not express its own case. The
// import is type-only, so it is erased before vi.mock replaces the module.
const scaffold = vi.fn<(...a: unknown[]) => Promise<ScaffoldResult>>(
  async () => ({ documentId: 'doc_test', sectionCount: 24 }),
);
vi.mock('../../../services/c2c/scaffold-project-documents.js', () => ({
  scaffoldProjectDocuments: (...a: unknown[]) => scaffold(...a),
}));
// Create now enforces the licensed program quota before it opens the
// transaction. checkProgramQuota reads through the same mocked pool, so left
// unstubbed its two statements would consume the head of every queue below and
// every test here would assert against the wrong call. Stubbed for the same
// reason the scaffold is: these assertions are about the create route's
// transaction and contract, and the quota has its own coverage in
// license-manager. The deny path gets an explicit test at the end.
const programQuota = vi.fn(async () => ({ withinQuota: true, currentCount: 0, maxAllowed: 10, unlimited: false }));
vi.mock('../../../services/license-manager.js', () => ({
  checkProgramQuota: (...a: unknown[]) => programQuota(...(a as [])),
}));
// The creation now writes a hash-chained audit_logs row in the same
// transaction. Sealing reads the previous chain head through the client, so
// like the quota it would otherwise consume queue entries these tests assert
// positionally. The chain itself is covered by services/audit; what matters
// here is that the row is written INSIDE the transaction, asserted below.
vi.mock('../../../services/audit/chain.js', () => ({
  hashPayload: () => 'payload-hash-test',
  computeAuditChainSealed: async () => ({ sha256Chain: 'chain-test', hmacSeal: 'seal-test' }),
}));
// Drug intakes now create the canonical `submissions` spine on the SAME
// transaction client, through the submission-service's transactional insert.
// Stubbed so these assertions stay about the route's transaction and contract
// (the insert's field mapping lives in submission-service); the route still
// issues its identity probe (SELECT … FROM submissions) through the mocked
// client, so drug-program tests queue one extra slot for it.
const createSubmissionTx = vi.fn(async () => ({ id: 3101 }));
vi.mock('../../../services/submission-service/submission-service.js', () => ({
  createSubmissionTx: (...a: unknown[]) => createSubmissionTx(...(a as [])),
}));

import projectsRouter from '../projects';

function appWith(org: number | null, userId?: number) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { organizationId: number }).organizationId = org;
    if (userId !== undefined) (req as unknown as { userId: number }).userId = userId;
    next();
  });
  app.use('/api/c2c/projects', projectsRouter);
  return app;
}

beforeEach(() => {
  query.mockReset();
  release.mockReset();
  txnClient = null;
  scaffold.mockReset();
  scaffold.mockResolvedValue({ documentId: 'doc_test', sectionCount: 24 });
  createSubmissionTx.mockReset();
  createSubmissionTx.mockResolvedValue({ id: 3101 });
  programQuota.mockReset();
  programQuota.mockResolvedValue({ withinQuota: true, currentCount: 0, maxAllowed: 10, unlimited: false });
  delete process.env.PROGRAM_QUOTA_MODE;
  // Default: BEGIN and COMMIT resolve; individual tests queue the rest.
  query.mockResolvedValue({ rows: [] });
});

/** Statements the route issued, in order, normalised for assertion. */
const sqlCalls = () => query.mock.calls.map((c) => String(c[0]).trim().split(/\s+/).slice(0, 3).join(' '));
/** The nth call matching a fragment. */
const callWith = (frag: string) =>
  query.mock.calls.find((c) => String(c[0]).includes(frag)) as [string, unknown[]] | undefined;

const KEYS = ['id', 'title', 'ws', 'code', 'stage', 'readiness', 'status', 'lead', 'blocker', 'due', 'activity'];
const shapedRow = () => Object.fromEntries(KEYS.map((k) => [k, k === 'readiness' ? 0 : k === 'blocker' ? null : 'x']));
const validBody = {
  name: 'BX-204 — NDA',
  productName: 'BX-204',
  programType: 'nda',
  productType: 'drug',
  primaryAgency: 'FDA',
  indication: 'Solid tumors',
  targetSubmissionDate: '2026-12-01',
  teamMembers: ['Jordan Chen'],
};

describe('POST /api/c2c/projects', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).post('/api/c2c/projects').send(validBody);
    expect(res.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('400 when name is missing', async () => {
    const res = await request(appWith(7, 3)).post('/api/c2c/projects').send({ ...validBody, name: '' });
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('400 on an invalid programType (never reaches SQL)', async () => {
    const res = await request(appWith(7, 3)).post('/api/c2c/projects').send({ ...validBody, programType: 'bogus' });
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('inserts into regulatory_programs and returns the portfolio display contract', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })                                            // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05' }] }) // INSERT ... RETURNING id
      .mockResolvedValueOnce({ rows: [] })                                            // spine identity SELECT (nda = drug)
      // Program anchor (slice C1), on the same transaction client, between the
      // spine and the audit row: preflight (column present, exactly one
      // workspace) → no existing anchor → INSERT INTO projects RETURNING id.
      .mockResolvedValueOnce({ rows: [{ has_column: 1, workspace_count: 1, workspace_id: 55 }] })
      .mockResolvedValueOnce({ rows: [] })                                            // anchor: no existing project
      .mockResolvedValueOnce({ rows: [{ id: 9001 }] })                                // anchor: INSERT INTO projects
      .mockResolvedValueOnce({ rows: [] })                                            // audit_logs INSERT (same txn)
      .mockResolvedValueOnce({ rows: [] })                                            // COMMIT
      .mockResolvedValueOnce({ rows: [shapedRow()] });                                // re-select (post-commit, on the pool)
    const res = await request(appWith(7, 3)).post('/api/c2c/projects').send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.meta.created).toBe(true);
    for (const k of KEYS) expect(res.body.data).toHaveProperty(k);

    const insert = callWith('INSERT INTO regulatory_programs');
    expect(insert, 'no INSERT was issued').toBeDefined();
    const params = insert![1];
    // org, program_type, product_type persisted as given
    expect(params[0]).toBe(7);
    expect(params).toContain('nda');
    expect(params).toContain('drug');
    // lead_user_id = the creating user
    expect(params).toContain(3);
  });

  it('derives product_type from program_type when the client omits it', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })                                            // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05' }] }) // INSERT
      .mockResolvedValueOnce({ rows: [] })                                            // spine identity SELECT (bla = drug)
      .mockResolvedValueOnce({ rows: [] })                                            // audit_logs INSERT (same txn)
      .mockResolvedValueOnce({ rows: [] })                                            // COMMIT
      .mockResolvedValueOnce({ rows: [shapedRow()] });                                // re-select
    const { productType, ...noProduct } = validBody;
    void productType;
    const res = await request(appWith(7, 3)).post('/api/c2c/projects').send({ ...noProduct, programType: 'bla' });
    expect(res.status).toBe(201);
    const params = callWith('INSERT INTO regulatory_programs')![1];
    expect(params).toContain('biologic'); // bla → biologic
  });

  it('retries with a suffixed code on a unique-code collision (23505)', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })                                            // BEGIN
      .mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }))      // INSERT collides
      .mockResolvedValueOnce({ rows: [] })                                            // ROLLBACK
      .mockResolvedValueOnce({ rows: [] })                                            // BEGIN (fresh txn)
      .mockResolvedValueOnce({ rows: [{ id: 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05' }] }) // retry INSERT
      .mockResolvedValueOnce({ rows: [] })                                            // spine identity SELECT
      .mockResolvedValueOnce({ rows: [] })                                            // audit_logs INSERT (same txn)
      .mockResolvedValueOnce({ rows: [] })                                            // COMMIT
      .mockResolvedValueOnce({ rows: [shapedRow()] });                                // re-select
    const res = await request(appWith(7, 3)).post('/api/c2c/projects').send(validBody);
    expect(res.status).toBe(201);
    const inserts = query.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO regulatory_programs'));
    expect(inserts).toHaveLength(2);
    const firstCode = (inserts[0] as [string, unknown[]])[1][2];
    const retryCode = (inserts[1] as [string, unknown[]])[1][2];
    expect(retryCode).not.toBe(firstCode);
    expect(String(retryCode).startsWith(String(firstCode))).toBe(true);
    // A bare retry inside the aborted transaction would raise 25P02, so the
    // route must ROLLBACK and BEGIN again between attempts.
    expect(sqlCalls()).toContain('ROLLBACK');
  });

  it('runs the insert and the scaffold in ONE transaction, and releases the client', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })                                            // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05' }] }) // INSERT
      .mockResolvedValueOnce({ rows: [] })                                            // spine identity SELECT
      .mockResolvedValueOnce({ rows: [] })                                            // audit_logs INSERT (same txn)
      .mockResolvedValueOnce({ rows: [] })                                            // COMMIT
      .mockResolvedValueOnce({ rows: [shapedRow()] });                                // re-select
    const res = await request(appWith(7, 3)).post('/api/c2c/projects').send(validBody);
    expect(res.status).toBe(201);
    const order = sqlCalls();
    expect(order[0]).toBe('BEGIN');
    expect(order).toContain('COMMIT');
    // The scaffold must run BEFORE the commit — a project that commits without
    // its document is the exact bug being fixed.
    expect(scaffold).toHaveBeenCalledTimes(1);
    expect(order.indexOf('COMMIT')).toBeGreaterThan(0);
    expect(release).toHaveBeenCalled();

    // The audit row is written on the CLIENT, between BEGIN and COMMIT — not
    // after, and not on the pool. A program that commits while its audit row
    // fails is a record a regulated tenant cannot defend, so the two have to
    // roll back together.
    const auditIdx = query.mock.calls.findIndex((c) => String(c[0]).includes('INSERT INTO audit_logs'));
    expect(auditIdx, 'no audit_logs row was written').toBeGreaterThan(-1);
    expect(auditIdx).toBeLessThan(order.indexOf('COMMIT'));
  });

  it('rolls the program back when its audit row cannot be written', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })                                            // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05' }] }) // INSERT
      .mockResolvedValueOnce({ rows: [] })                                            // spine identity SELECT
      .mockRejectedValueOnce(new Error('audit_logs write failed'));                   // audit INSERT fails
    const res = await request(appWith(7, 3)).post('/api/c2c/projects').send(validBody);
    expect(res.status).toBe(500);
    const order = sqlCalls();
    expect(order).toContain('ROLLBACK');
    expect(order).not.toContain('COMMIT');
    expect(release).toHaveBeenCalled();
  });

  it('surfaces a scaffold skip in the 201 body instead of failing or hiding it', async () => {
    scaffold.mockResolvedValueOnce({
      documentId: null, sectionCount: 0,
      skipped: 'UNMAPPED_PROGRAM_TYPE',
      detail: "No document class is defined for program type 'ivd'.",
    });
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05' }] })
      .mockResolvedValueOnce({ rows: [] })                                            // spine identity SELECT
      .mockResolvedValueOnce({ rows: [] })                                            // audit_logs INSERT (same txn)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [shapedRow()] });
    const res = await request(appWith(7, 3)).post('/api/c2c/projects').send(validBody);
    // The project is still legitimately created — only the document is skipped.
    expect(res.status).toBe(201);
    expect(res.body.meta.scaffoldSkipped).toBe('UNMAPPED_PROGRAM_TYPE');
    expect(res.body.meta.scaffoldDetail).toContain('ivd');
    expect(res.body.meta.documentId).toBeNull();
  });

  it('reports the scaffolded document and section count on success', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05' }] })
      .mockResolvedValueOnce({ rows: [] })                                            // spine identity SELECT
      .mockResolvedValueOnce({ rows: [] })                                            // audit_logs INSERT (same txn)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [shapedRow()] });
    const res = await request(appWith(7, 3)).post('/api/c2c/projects').send(validBody);
    expect(res.body.meta.documentId).toBe('doc_test');
    expect(res.body.meta.scaffoldedSections).toBe(24);
  });

  it('503 PENDING_STORE when the store is not provisioned (42P01)', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })                                        // BEGIN
      .mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7, 3)).post('/api/c2c/projects').send(validBody);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('PENDING_STORE');
  });

  it('does NOT call it a provisioning failure when the named relation EXISTS', async () => {
    // A 42P01 names a relation in its message, and the route used to take that
    // name at face value and tell the operator to provision it. The drug-NDA
    // golden journey produces exactly that against a relation the same database
    // still resolves, so the one code path whose job is to say what is wrong
    // was confidently saying the wrong thing — and the operator's next step,
    // provisioning a store that is already there, dead-ends too.
    query
      .mockResolvedValueOnce({ rows: [] })                                   // BEGIN
      .mockRejectedValueOnce(
        Object.assign(new Error('relation "audit_logs" does not exist'), { code: '42P01' }),
      )
      .mockResolvedValueOnce({ rows: [] })                                   // ROLLBACK
      .mockResolvedValueOnce({ rows: [{ reg: 'audit_logs' }] });             // to_regclass — it IS there
    const res = await request(appWith(7, 3)).post('/api/c2c/projects').send(validBody);
    expect(res.status).not.toBe(503);
    expect(res.body.error).not.toBe('PENDING_STORE');
  });

  it('still calls it a provisioning failure when the relation really is absent', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })                                   // BEGIN
      .mockRejectedValueOnce(
        Object.assign(new Error('relation "audit_logs" does not exist'), { code: '42P01' }),
      )
      .mockResolvedValueOnce({ rows: [] })                                   // ROLLBACK
      .mockResolvedValueOnce({ rows: [{ reg: null }] });                     // to_regclass — genuinely missing
    const res = await request(appWith(7, 3)).post('/api/c2c/projects').send(validBody);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('PENDING_STORE');
  });

  it('refuses the create when the org is at its licensed program quota', async () => {
    // The quota ships in warn mode so it cannot retroactively lock out tenants
    // already over a limit that was never enforced; enforce is what this asserts.
    process.env.PROGRAM_QUOTA_MODE = 'enforce';
    programQuota.mockResolvedValue({ withinQuota: false, currentCount: 10, maxAllowed: 10, unlimited: false });
    const res = await request(appWith(7, 3)).post('/api/c2c/projects').send(validBody);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('QUOTA_EXCEEDED');
    // The numbers travel with the refusal so support can answer "why" without a
    // database session, and so the client can name the limit in its message.
    expect(String(res.body.message)).toContain('10 of 10');
    // Nothing was written: the quota gate runs before the transaction opens, so
    // a refused create must not have issued a single statement.
    expect(query).not.toHaveBeenCalled();
  });
});

// ── Canonical submission spine (drug programs) ────────────────────────────────
//
// Intake used to write regulatory_programs + the document scaffold but never a
// `submissions` row, leaving every canonical-core surface (IndLifecycle
// checklist, NdaCockpit, SubmissionCenter, DispatchReadiness) permanently empty
// for self-serve drug programs. These lock: the spine is created on the SAME
// transaction client as the program (commit/rollback atomically), only for drug
// application types, idempotently against the assembler's identity match, and
// reflected in both the sealed audit row and the 201 meta.
describe('POST /api/c2c/projects — canonical submission spine', () => {
  /** Queue the happy-path statement sequence for a drug program. */
  const queueDrugCreate = () => {
    query
      .mockResolvedValueOnce({ rows: [] })                                            // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05' }] }) // program INSERT
      .mockResolvedValueOnce({ rows: [] })                                            // spine identity SELECT (no match)
      .mockResolvedValueOnce({ rows: [] })                                            // audit_logs INSERT
      .mockResolvedValueOnce({ rows: [] })                                            // COMMIT
      .mockResolvedValueOnce({ rows: [shapedRow()] });                                // re-select
  };

  it('creates the submissions row transactionally for a drug program (nda)', async () => {
    queueDrugCreate();
    const res = await request(appWith(7, 3)).post('/api/c2c/projects').send(validBody);
    expect(res.status).toBe(201);

    // The insert ran ONCE, on the SAME client the transaction runs on — not on
    // the pool — so the spine commits or rolls back with the program.
    expect(createSubmissionTx).toHaveBeenCalledTimes(1);
    const [clientArg, input, ctx] = createSubmissionTx.mock.calls[0] as unknown as [
      unknown,
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(clientArg).toBe(txnClient);

    // …and BETWEEN this transaction's BEGIN and COMMIT.
    const order = sqlCalls();
    const beginOrder = query.mock.invocationCallOrder[order.indexOf('BEGIN')];
    const commitOrder = query.mock.invocationCallOrder[order.indexOf('COMMIT')];
    const spineOrder = createSubmissionTx.mock.invocationCallOrder[0];
    expect(spineOrder).toBeGreaterThan(beginOrder);
    expect(spineOrder).toBeLessThan(commitOrder);

    // Identity carried so the ind-checklist-view-assembler's program↔submission
    // match (product_name/title) holds by construction; org + canonical fields.
    expect(input).toMatchObject({
      title: 'BX-204 — NDA',
      productName: 'BX-204',
      applicationType: 'nda',
      clientType: 'pharma', // productType 'drug'
      primaryRegion: 'fda', // primaryAgency FDA
    });
    expect(ctx).toEqual({ organizationId: 7, userId: 3 });

    // The sealed audit row records BOTH creations.
    const audit = callWith('INSERT INTO audit_logs');
    expect(audit).toBeDefined();
    const details = JSON.parse(String(audit![1][14]));
    expect(details.submission_id).toBe(3101);
    expect(details.submission_created).toBe(true);
    expect(details.submission_application_type).toBe('nda');

    // …and the 201 meta surfaces the linkage (never silent).
    expect(res.body.meta.submissionId).toBe(3101);
    expect(res.body.meta.submissionCreated).toBe(true);
  });

  it('links an existing spine by identity instead of duplicating it', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })                                            // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05' }] }) // program INSERT
      .mockResolvedValueOnce({ rows: [{ id: 55 }] })                                  // identity SELECT → existing spine
      .mockResolvedValueOnce({ rows: [] })                                            // audit_logs INSERT
      .mockResolvedValueOnce({ rows: [] })                                            // COMMIT
      .mockResolvedValueOnce({ rows: [shapedRow()] });                                // re-select
    const res = await request(appWith(7, 3)).post('/api/c2c/projects').send(validBody);
    expect(res.status).toBe(201);
    expect(createSubmissionTx).not.toHaveBeenCalled();
    expect(res.body.meta.submissionId).toBe(55);
    expect(res.body.meta.submissionCreated).toBe(false);

    // The probe is org-scoped and keyed by the same identity convention the
    // checklist assembler matches on (application type + product_name/title).
    const probe = callWith('FROM submissions');
    expect(probe).toBeDefined();
    expect(probe![1][0]).toBe(7);
    expect(probe![1][1]).toBe('nda');
    expect(probe![1][2]).toEqual(['bx-204', 'bx-204 — nda']);
  });

  it('creates NO submissions row for a device program (510k)', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })                                            // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05' }] }) // program INSERT
      .mockResolvedValueOnce({ rows: [] })                                            // audit_logs INSERT (no spine slot)
      .mockResolvedValueOnce({ rows: [] })                                            // COMMIT
      .mockResolvedValueOnce({ rows: [shapedRow()] });                                // re-select
    const res = await request(appWith(7, 3))
      .post('/api/c2c/projects')
      .send({ ...validBody, name: 'CGM Sensor 510(k)', programType: '510k', productType: 'device' });
    expect(res.status).toBe(201);
    expect(createSubmissionTx).not.toHaveBeenCalled();
    expect(callWith('FROM submissions')).toBeUndefined();
    expect(res.body.meta).not.toHaveProperty('submissionId');
  });

  it('creates NO submissions row for a CER program', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })                                            // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05' }] }) // program INSERT
      .mockResolvedValueOnce({ rows: [] })                                            // audit_logs INSERT (no spine slot)
      .mockResolvedValueOnce({ rows: [] })                                            // COMMIT
      .mockResolvedValueOnce({ rows: [shapedRow()] });                                // re-select
    const res = await request(appWith(7, 3))
      .post('/api/c2c/projects')
      .send({ ...validBody, name: 'CGM CER', programType: 'cer', productType: 'device' });
    expect(res.status).toBe(201);
    expect(createSubmissionTx).not.toHaveBeenCalled();
    expect(callWith('FROM submissions')).toBeUndefined();
    expect(res.body.meta).not.toHaveProperty('submissionId');
  });

  it('rolls the WHOLE creation back when the spine insert fails', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })                                            // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05' }] }) // program INSERT
      .mockResolvedValueOnce({ rows: [] });                                           // identity SELECT (no match)
    createSubmissionTx.mockRejectedValueOnce(new Error('submissions insert failed'));
    const res = await request(appWith(7, 3)).post('/api/c2c/projects').send(validBody);
    expect(res.status).toBe(500);
    const order = sqlCalls();
    // No half-created program: the transaction rolled back and never committed,
    // and no audit row was written for a creation that did not happen.
    expect(order).toContain('ROLLBACK');
    expect(order).not.toContain('COMMIT');
    expect(callWith('INSERT INTO audit_logs')).toBeUndefined();
    expect(release).toHaveBeenCalled();
  });

  it('503 PENDING_STORE when the submissions store is not provisioned (42P01)', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })                                            // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05' }] }) // program INSERT
      .mockRejectedValueOnce(Object.assign(new Error('relation "submissions" does not exist'), { code: '42P01' })); // identity SELECT
    const res = await request(appWith(7, 3)).post('/api/c2c/projects').send(validBody);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('PENDING_STORE');
    expect(sqlCalls()).toContain('ROLLBACK');
  });

  it('names the step and a support reference, and discloses no schema object', async () => {
    // A bare { error: 'PENDING_STORE' } is a correct status and an unactionable
    // outage: this endpoint touches the quota tables, the program row, the
    // submission spine and the PM-spine anchor, so "some store is missing"
    // narrows it to four candidates and nobody can tell what to provision.
    //
    // The first correction answered that by putting the relation name in the
    // client-facing message. That is the disclosure this asserts is gone: the
    // body is rendered in a browser, and the schema shape of a governed store
    // is not something a regulated product may put on a screen. The relation
    // goes to the log instead, keyed by the correlation id returned here, so
    // the operator question is still one lookup away.
    query
      .mockResolvedValueOnce({ rows: [] })                                            // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05' }] }) // program INSERT
      .mockRejectedValueOnce(
        Object.assign(new Error('relation "submissions" does not exist'), { code: '42P01' }),
      );
    const res = await request(appWith(7, 3)).post('/api/c2c/projects').send(validBody);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('PENDING_STORE');
    expect(res.body.step).toBe('creating the project');
    expect(res.body.correlationId).toEqual(expect.any(String));
    expect(res.body.correlationId.length).toBeGreaterThan(5);

    // Nothing in the envelope names the relation, echoes the driver text, or
    // tells the user to run migrations — none of which is their action to take.
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/submissions/);
    expect(body).not.toMatch(/relation /i);
    expect(body).not.toMatch(/migration/i);
    expect(res.body.store).toBeUndefined();
  });

  it('degrades to the same safe body when the relation cannot be parsed', async () => {
    // Postgres does not populate `err.table` for 42P01, so the relation is read
    // out of the message for the LOG. An unrecognised message must still
    // produce a usable response, never one reading "the undefined store".
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7, 3)).post('/api/c2c/projects').send(validBody);
    expect(res.status).toBe(503);
    expect(res.body.message).not.toMatch(/undefined|null/);
    expect(res.body.correlationId).toEqual(expect.any(String));
    expect(res.body.message.length).toBeGreaterThan(20);
  });
});

/**
 * MDX UAT 2026-08-18, item A1 — the create failure must be diagnosable.
 *
 * The UAT captured three reference ids from three failed creates
 * (3b46779335ffb1ec…, 54492778b381db05…, 39eeaa435dc6b42a…) and none of them
 * could be looked up, because the catch ran
 *
 *   console.error('[c2c/projects] POST /', err);
 *   return res.status(500).json({ error: 'INTERNAL_ERROR' });
 *
 * — no correlation id in the log line, and no message or reference in the body.
 * The UI therefore rendered its generic status fallback ("The server could not
 * complete this request") and invited the user to quote a reference that
 * pointed at nothing in the logs. Fixing the underlying exception needs the
 * exception; this is what makes the NEXT one recoverable in one lookup.
 *
 * The id asserted here is the one `auditLog` (middleware/enterprise-security.ts)
 * sets and echoes as `X-Request-Id` — the same value the user reads off the
 * error banner.
 */
describe('POST /api/c2c/projects — a 500 is diagnosable from the reference the user sees', () => {
  const REF = '3b46779335ffb1ec4187935db4df7570';

  /** The app with the request-id middleware the real server mounts. */
  function appWithRequestId(org: number, userId: number) {
    const app = express();
    app.use(express.json());
    app.use((req: Request, res: Response, next: NextFunction) => {
      res.setHeader('X-Request-Id', REF);
      (req as unknown as { organizationId: number }).organizationId = org;
      (req as unknown as { userId: number }).userId = userId;
      next();
    });
    app.use('/api/c2c/projects', projectsRouter);
    return app;
  }

  it('echoes the reference id in the body and says what failed', async () => {
    // A non-42P01 failure — the class the UAT hit, which falls through the
    // PENDING_STORE branch to the generic catch.
    query
      .mockResolvedValueOnce({ rows: [] })                                  // BEGIN
      .mockRejectedValueOnce(
        Object.assign(new Error('null value in column "code" violates not-null constraint'), {
          code: '23502',
        }),
      );

    const res = await request(appWithRequestId(7, 3)).post('/api/c2c/projects').send(validBody);

    expect(res.status).toBe(500);
    expect(res.body.correlationId).toBe(REF);
    // Names the operation, so the banner is not the bare status fallback.
    expect(res.body.message).toMatch(/creating the project/);
    // …and still discloses nothing internal: no column, constraint, SQL or code.
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/not-null|constraint|23502|column/i);
  });

  it('rolls the transaction back and releases the client on that failure', async () => {
    // The diagnosability change must not have altered the failure semantics:
    // a failed create leaves no half-written program behind.
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(Object.assign(new Error('boom'), { code: '23502' }));

    await request(appWithRequestId(7, 3)).post('/api/c2c/projects').send(validBody);

    expect(sqlCalls()).toContain('ROLLBACK');
    expect(release).toHaveBeenCalled();
  });
});
