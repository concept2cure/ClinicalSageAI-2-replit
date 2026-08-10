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
vi.mock('../../../db.js', () => ({
  pool: {
    query: (...a: unknown[]) => query(...a),
    connect: async () => ({ query: (...a: unknown[]) => query(...a), release }),
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
const programQuota = vi.fn(async () => ({ withinQuota: true, currentCount: 0, maxAllowed: 10 }));
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
  scaffold.mockReset();
  scaffold.mockResolvedValue({ documentId: 'doc_test', sectionCount: 24 });
  programQuota.mockReset();
  programQuota.mockResolvedValue({ withinQuota: true, currentCount: 0, maxAllowed: 10 });
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

  it('refuses the create when the org is at its licensed program quota', async () => {
    programQuota.mockResolvedValue({ withinQuota: false, currentCount: 10, maxAllowed: 10 });
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
