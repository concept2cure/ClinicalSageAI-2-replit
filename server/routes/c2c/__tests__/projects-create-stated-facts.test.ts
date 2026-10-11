/**
 * POST /api/c2c/projects records only regulated facts the person stated, and
 * the project record carries the registry context the readiness digest reads
 * (QA 2026-10-08, second walk: j1, j7, j8).
 *
 * Same mocked transaction client as projects-create.test.ts: every statement
 * the route issues lands on `query` in order; the scaffold, the licence quota,
 * the audit seal and the submission insert are stubbed (each has its own
 * contract). The end-to-end proof on real SQL is
 * projects-create-digest-readiness.pglite.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../../db.js', () => ({
  pool: {
    query: (...a: unknown[]) => query(...a),
    connect: async () => ({ query: (...a: unknown[]) => query(...a), release: () => undefined }),
  },
}));
vi.mock('../../../services/c2c/scaffold-project-documents.js', () => ({
  scaffoldProjectDocuments: async () => ({ documentId: 'doc_test', sectionCount: 24 }),
}));
vi.mock('../../../services/license-manager.js', () => ({
  checkProgramQuota: async () => ({ withinQuota: true, currentCount: 0, maxAllowed: 10, unlimited: false }),
}));
vi.mock('../../../services/audit/chain.js', () => ({
  hashPayload: () => 'payload-hash-test',
  computeAuditChainSealed: async () => ({ sha256Chain: 'chain-test', hmacSeal: 'seal-test' }),
}));
const createSubmissionTx = vi.fn(async (..._a: unknown[]) => ({ id: 3101 }));
vi.mock('../../../services/submission-service/submission-service.js', () => ({
  createSubmissionTx: (...a: unknown[]) => createSubmissionTx(...a),
}));

import projectsRouter from '../projects';

function appWith(org: number, userId: number) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { organizationId: number }).organizationId = org;
    (req as unknown as { userId: number }).userId = userId;
    next();
  });
  app.use('/api/c2c/projects', projectsRouter);
  return app;
}

beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue({ rows: [] });
  createSubmissionTx.mockClear();
});

const callWith = (frag: string) =>
  query.mock.calls.find((c) => String(c[0]).includes(frag)) as [string, unknown[]] | undefined;
/** The anchor's statements: preflight (column present, one workspace), no existing anchor, the INSERT. */
const ANCHOR = [
  { rows: [{ has_column: 1, workspace_count: 1, workspace_id: 55, default_workspace_id: null }] },
  { rows: [] },
  { rows: [{ id: 9001 }] },
];
const KEYS = ['id', 'title', 'ws', 'code', 'stage', 'readiness', 'status', 'lead', 'blocker', 'due', 'activity'];
const shapedRow = () => Object.fromEntries(KEYS.map((k) => [k, k === 'readiness' ? 0 : k === 'blocker' ? null : 'x']));
/** A drug program's happy path: BEGIN, INSERT, spine probe, anchor ×3, audit, COMMIT, re-select. */
const queueDrugCreate = () =>
  query
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ id: 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05' }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce(ANCHOR[0]).mockResolvedValueOnce(ANCHOR[1]).mockResolvedValueOnce(ANCHOR[2])
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [shapedRow()] });
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

// ── P-21 at intake: regulated choices are stated, never derived (QA 2026-10-08,
// second walk j1/j7). An IND, CTA, MAA or J-NDA does not say whether its
// product is a drug or a biologic; the vocabulary used to answer 'biologic' for
// every IND, and the wizard sent the workstream tab's class. The program row and
// its submission spine (submissions.client_type) are both NOT NULL on the class,
// so a class nobody stated is refused rather than invented.
describe('POST /api/c2c/projects — the product type of an IND is stated', () => {
  const ind = { ...validBody, name: 'QA-W2 Tolvexa — IND', programType: 'ind', submissionTypeId: 'us_ind' };

  it('refuses an IND whose product type nobody stated, naming the choice, before any SQL', async () => {
    const { productType, ...noProduct } = ind;
    void productType;
    const res = await request(appWith(7, 3)).post('/api/c2c/projects').send(noProduct);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/drug or a biologic/i);
    expect(query).not.toHaveBeenCalled();
  });

  it('refuses a device class for an IND', async () => {
    const res = await request(appWith(7, 3)).post('/api/c2c/projects').send({ ...ind, productType: 'device' });
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('records the stated class, and the spine carries the matching client type', async () => {
    queueDrugCreate();
    const res = await request(appWith(7, 3)).post('/api/c2c/projects').send({ ...ind, productType: 'drug' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const params = callWith('INSERT INTO regulatory_programs')![1];
    expect(params[4]).toBe('drug');
    const [, spineInput] = createSubmissionTx.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
    expect(spineInput).toMatchObject({ applicationType: 'ind', clientType: 'pharma' });
  });

  it('records no indication when none was stated', async () => {
    queueDrugCreate();
    const { indication, ...noIndication } = ind;
    void indication;
    const res = await request(appWith(7, 3)).post('/api/c2c/projects').send({ ...noIndication, productType: 'biologic' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const params = callWith('INSERT INTO regulatory_programs')![1];
    expect(params[8]).toBeNull();
  });
});

// ── The readiness engine's registry context, on the project record (QA
// 2026-10-08, second walk j8). The Executive Readiness Digest
// (services/report-os/orchestrator.ts) reads projects.metadata.registryId or
// .submissionType for the project it reports on, and intake wrote neither: it
// put the wizard's submissionTypeId on the PROGRAM's metadata and wrote the
// project record with no metadata at all, so every program — one created
// today with submissionTypeId 'us_ind' included — "records no registry
// context" and readiness was never computed.
describe('POST /api/c2c/projects — the project record carries its registry context', () => {
  const anchorMetadata = (): Record<string, unknown> | null => {
    const insert = callWith('INSERT INTO projects');
    expect(insert, 'no project record was written').toBeDefined();
    const json = insert![1].find((p) => typeof p === 'string' && p.startsWith('{'));
    return json ? (JSON.parse(String(json)) as Record<string, unknown>) : null;
  };

  it('writes the registry entry the filing type the person chose names', async () => {
    queueDrugCreate();
    const res = await request(appWith(7, 3))
      .post('/api/c2c/projects')
      .send({ ...validBody, programType: 'ind', productType: 'drug', submissionTypeId: 'us_ind' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(anchorMetadata()).toMatchObject({ registryId: 'US_IND', submissionType: 'us_ind' });
  });

  it('with no registry choice sent, an unambiguous filing type and agency name the entry', async () => {
    queueDrugCreate();
    const res = await request(appWith(7, 3)).post('/api/c2c/projects').send(validBody); // nda · FDA
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(anchorMetadata()).toMatchObject({ registryId: 'US_NDA' });
  });
});
