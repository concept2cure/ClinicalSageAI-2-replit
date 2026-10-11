/**
 * POST /api/c2c/projects refuses a filing the market verdict does not offer,
 * with the verdict's own reason, before anything is written (FILING_SPINE F19,
 * `offer` in services/regulatory/market-support.ts; WORKFLOW_DECISION_2026-10-08
 * §4 question 2).
 *
 * Before: every one of these was created. Health Canada and TGA got a program
 * with no outline (NO_RULE_PACK, reported after the fact in the 201); an MHRA
 * "IND" got the mislabelled ind:mhra outline, though the UK has no IND; a new
 * J-NDA got a submission spine for an eCTD v3.2.2 sequence PMDA no longer
 * accepts for new applications. Author-only markets (the EU, a continuing PMDA
 * application, US devices) are still created and say what they are.
 *
 * Two points, one verdict. A refusal no outline could lift (an unmapped agency,
 * an MHRA "IND", a new Japanese application) is made before any SQL. "No
 * outline" is known once the scaffold has looked for the pack, in the verdict's
 * own order; the scaffold is mocked here to answer as it does on trunk for each
 * class (NO_RULE_PACK for Health Canada, TGA and an EMA NDA), and the creation
 * is rolled back. The reasons asserted are literal on purpose, so this file
 * runs unchanged against the route as it was before the change.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
const release = vi.fn();
vi.mock('../../../db.js', () => ({
  pool: {
    query: (...a: unknown[]) => query(...a),
    connect: async () => ({ query: (...a: unknown[]) => query(...a), release }),
  },
}));
type Scaffolded = { documentId: string | null; sectionCount: number; skipped?: string; detail?: string };
const scaffold = vi.fn(async (): Promise<Scaffolded> => ({ documentId: 'doc_test', sectionCount: 24 }));
const NO_RULE_PACK: Scaffolded = { documentId: null, sectionCount: 0, skipped: 'NO_RULE_PACK', detail: 'No rule pack.' };
vi.mock('../../../services/c2c/scaffold-project-documents.js', () => ({
  scaffoldProjectDocuments: (...a: unknown[]) => scaffold(...(a as [])),
}));
vi.mock('../../../services/license-manager.js', () => ({
  checkProgramQuota: async () => ({ withinQuota: true, currentCount: 0, maxAllowed: 10, unlimited: false }),
}));
vi.mock('../../../services/audit/chain.js', () => ({
  hashPayload: () => 'payload-hash-test',
  computeAuditChainSealed: async () => ({ sha256Chain: 'chain-test', hmacSeal: 'seal-test' }),
}));
const createSubmissionTx = vi.fn(async () => ({ id: 3101 }));
vi.mock('../../../services/submission-service/submission-service.js', () => ({
  createSubmissionTx: (...a: unknown[]) => createSubmissionTx(...(a as [])),
}));

import projectsRouter from '../projects';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { organizationId: number }).organizationId = 7;
    (req as unknown as { userId: number }).userId = 3;
    next();
  });
  a.use('/api/c2c/projects', projectsRouter);
  return a;
}

beforeEach(() => {
  query.mockReset();
  release.mockReset();
  scaffold.mockReset();
  scaffold.mockResolvedValue({ documentId: 'doc_test', sectionCount: 24 });
  createSubmissionTx.mockClear();
  query.mockResolvedValue({ rows: [] });
});

const body = (over: Record<string, unknown>) => ({
  name: 'BX-204 programme',
  productName: 'BX-204',
  productType: 'drug',
  indication: 'Solid tumors',
  ...over,
});

/** BEGIN, program INSERT, anchor x3, audit, COMMIT, re-select (no spine for a device class). */
function queueDeviceCreate() {
  query
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ id: 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05' }] })
    .mockResolvedValueOnce({ rows: [{ has_column: 1, workspace_count: 1, workspace_id: 55, default_workspace_id: null }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ id: 9001 }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ id: 'x', title: 'x' }] });
}

/** BEGIN, program INSERT, spine identity SELECT, anchor x3, audit, COMMIT, re-select. */
function queueDrugCreate() {
  query
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ id: 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05' }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ has_column: 1, workspace_count: 1, workspace_id: 55, default_workspace_id: null }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ id: 9001 }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ id: 'x', title: 'x' }] });
}

const sqlCalls = () => query.mock.calls.map((c) => String(c[0]).trim().split(/\s+/)[0].toUpperCase());

function expectRefused(res: request.Response, reason: RegExp) {
  expect(res.status, JSON.stringify(res.body)).toBe(422);
  expect(res.body.error).toBe('FILING_NOT_OFFERED');
  expect(res.body.message).toMatch(reason);
  expect(res.body.marketSupport).toMatchObject({ tier: 'not_offered', label: 'Not offered' });
  expect(createSubmissionTx).not.toHaveBeenCalled();
}

const BEFORE_SQL: Array<{ name: string; send: Record<string, unknown>; reason: RegExp }> = [
  { name: 'an MHRA "IND"', send: { programType: 'ind', primaryAgency: 'MHRA' }, reason: /^Not offered: the UK has no IND/ },
  {
    name: 'a new Japanese NDA',
    send: { programType: 'jnda', primaryAgency: 'PMDA', submissionTypeId: 'jp_mkt_approval' },
    reason: /^PMDA requires eCTD v4\.0 for new applications/,
  },
  { name: 'an agency nothing maps (Swissmedic)', send: { programType: 'nda', primaryAgency: 'Swissmedic' }, reason: /^Not supported: the platform has no filing outline or channel for / }, // wording amended 2026-10-08 (design review)
  {
    name: 'a drug application at a Notified Body',
    send: { programType: 'nda', primaryAgency: 'EU / Notified Body' },
    // Wording amended 2026-10-08 (filing-spine design review): the agency's limit reads "Not offered".
    reason: /^Not offered: A Notified Body assesses EU MDR and IVDR technical documentation/,
  },
];

const NO_OUTLINE: Array<{ name: string; send: Record<string, unknown>; reason: RegExp }> = [
  {
    name: 'Health Canada (an NDS, sent as the wizard sends it)',
    send: { programType: 'nda', primaryAgency: 'Health Canada', submissionTypeId: 'ca_nds' },
    reason: /^Health Canada has no governed NDA outline here, so a project would have nothing to author and no channel to send it\.$/,
  },
  { name: 'an agency with no outline (TGA)', send: { programType: 'nda', primaryAgency: 'TGA' }, reason: /^TGA has no governed NDA outline here/ },
  { name: 'an EMA application with no EU outline (an NDA)', send: { programType: 'nda', primaryAgency: 'EMA' }, reason: /^EMA has no governed NDA outline here/ },
];

describe('POST /api/c2c/projects — a filing the verdict does not offer is refused at creation', () => {
  for (const c of BEFORE_SQL) {
    it(`refuses ${c.name} with 422 FILING_NOT_OFFERED and its reason, before any SQL`, async () => {
      // A full successful creation is queued, so the route as it was is seen
      // creating the program (201); a refusal never reads the queue.
      queueDrugCreate();
      const res = await request(app()).post('/api/c2c/projects').send(body(c.send));
      expectRefused(res, c.reason);
      expect(query).not.toHaveBeenCalled();
      expect(scaffold).not.toHaveBeenCalled();
    });
  }

  for (const c of NO_OUTLINE) {
    it(`refuses ${c.name} once the scaffold finds no outline, rolled back, nothing committed`, async () => {
      queueDrugCreate();
      scaffold.mockResolvedValueOnce(NO_RULE_PACK);
      const res = await request(app()).post('/api/c2c/projects').send(body(c.send));
      expectRefused(res, c.reason);
      expect(sqlCalls()).toContain('ROLLBACK');
      expect(sqlCalls()).not.toContain('COMMIT');
      expect(release).toHaveBeenCalled();
    });
  }

  it('a program type with no document class (a bare device) has no outline to look for: refused before any SQL', async () => {
    queueDrugCreate();
    scaffold.mockResolvedValueOnce({ documentId: null, sectionCount: 0, skipped: 'UNMAPPED_PROGRAM_TYPE' });
    const res = await request(app()).post('/api/c2c/projects')
      .send(body({ programType: 'device', productType: 'device', primaryAgency: 'FDA' }));
    expectRefused(res, /^FDA has no governed DEVICE outline here/);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('POST /api/c2c/projects — offered markets are created, and say what is offered', () => {
  it('an EU MAA: created, "Author documents for this market", with the reason', async () => {
    queueDrugCreate();
    const res = await request(app()).post('/api/c2c/projects')
      .send(body({ programType: 'maa', primaryAgency: 'EMA', submissionTypeId: 'eu_maa' }));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.meta.marketSupport).toMatchObject({ tier: 'author_only', label: 'Author documents for this market' });
    expect(res.body.meta.marketSupport.reason).toMatch(/no EMA sequence is built/);
  });

  it('a continuing PMDA application (an approval number on file): created, author-only', async () => {
    queueDrugCreate();
    const res = await request(app()).post('/api/c2c/projects')
      .send(body({ programType: 'jnda', primaryAgency: 'PMDA', applicationNumber: '30100AMX00001000' }));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.meta.marketSupport.tier).toBe('author_only');
  });

  it('a US commercial IND: created, build and sequence', async () => {
    queueDrugCreate();
    const res = await request(app()).post('/api/c2c/projects')
      .send(body({ programType: 'ind', primaryAgency: 'FDA', submissionTypeId: 'us_ind' }));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.meta.marketSupport.tier).toBe('build_and_sequence');
    expect(sqlCalls()).toContain('COMMIT');
  });
});

// ── Added 2026-10-08 (F19b review) ──────────────────────────────────────────
// The scaffold is asked about the market the verdict judged. Before, the EU
// MDR/IVDR lane (catalog agency 'EU / Notified Body') was refused at creation
// though its packs exist, and an API caller naming a region code ('us', 'EU')
// was told the market had no outline while the verdict offered it.
describe('POST /api/c2c/projects — the scaffold reads the agency the verdict judged', () => {
  it.each(['mdr', 'ivdr'])('an EU %s technical file at "EU / Notified Body": created, author-only, scaffolded from the EU device outline', async (programType) => {
    queueDeviceCreate();
    const res = await request(app()).post('/api/c2c/projects')
      .send(body({ programType, productType: 'device', primaryAgency: 'EU / Notified Body' }));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.meta.marketSupport).toMatchObject({ tier: 'author_only', label: 'Author documents for this market' });
    expect(res.body.meta.marketSupport.reason).toMatch(/no Notified Body sequence/);
    expect(scaffold).toHaveBeenCalledWith(expect.objectContaining({ programType, primaryAgency: 'EMA' }));
    expect(sqlCalls()).toContain('COMMIT');
  });

  it.each([['us', 'FDA'], ['US', 'FDA']])('an NDA sent with the region code %s: scaffolded against %s and created', async (primaryAgency, judged) => {
    queueDrugCreate();
    const res = await request(app()).post('/api/c2c/projects')
      .send(body({ programType: 'nda', primaryAgency }));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(scaffold).toHaveBeenCalledWith(expect.objectContaining({ primaryAgency: judged }));
    expect(res.body.meta.marketSupport.tier).toBe('build_and_sequence');
  });
});
