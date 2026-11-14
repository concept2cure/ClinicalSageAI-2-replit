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

// The creation gate (requireProjectCreationAccess) reads the caller's current
// membership; the shared double answers it from the seats, so the queue below
// stays the creation's own SQL and "before any SQL" still means exactly that.
vi.mock('../../../services/c2c/current-program-access', async (original) => {
  const real = await original<typeof import('../../../services/c2c/current-program-access')>();
  return { ...real, ...(await import('./support/current-member')).currentAccessDouble(real.ProgramReadAccessError) };
});

import projectsRouter from '../projects';
import { clearSeats, seatMember } from './support/current-member';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { organizationId: number }).organizationId = 7;
    (req as unknown as { userId: number }).userId = 3;
    (req as unknown as { dbClient: unknown }).dbClient = { query: (...a: unknown[]) => query(...a) };
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
  clearSeats();
  seatMember(7, 3, 'member');
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
    .mockResolvedValueOnce({ rows: [{ id: 55, name: 'Fixture client' }] })
      .mockResolvedValueOnce({ rows: [{ id: 9001 }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ id: 'x', title: 'x' }] })
    .mockResolvedValueOnce({ rows: [{ id: 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05' }] });
}

/** BEGIN, program INSERT, spine identity SELECT, anchor x3, audit, COMMIT, re-select. */
function queueDrugCreate() {
  query
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ id: 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05' }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ has_column: 1, workspace_count: 1, workspace_id: 55, default_workspace_id: null }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ id: 55, name: 'Fixture client' }] })
      .mockResolvedValueOnce({ rows: [{ id: 9001 }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ id: 'x', title: 'x' }] })
    .mockResolvedValueOnce({ rows: [{ id: 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05' }] });
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
  // Added 2026-11-01 (D2 3b Slice 4; P-55 row 5, F-D). ICH takes no filing, and the QOS,
  // a drug substance and a drug product each say where they are written. Before, all
  // of these read "Not supported: the platform has no filing outline or channel for
  // ICH / Global". The wizard sends every such row as an NDA (Projects.tsx programTypeFor).
  {
    name: 'Module 3.2.S at "ICH / Global", sent as the wizard sends it (an NDA)',
    send: { programType: 'nda', primaryAgency: 'ICH / Global', submissionTypeId: 'ich_m3_ds' },
    reason: /^Not offered as its own project: drug substance quality is Module 3\.2\.S of its application/,
  },
  {
    name: 'the Quality Overall Summary at "ICH / Global", by its legacy id',
    send: { programType: 'nda', primaryAgency: 'ICH / Global', submissionTypeId: 'qos_23' },
    reason: /^Not offered as its own project: the Quality Overall Summary is Module 2\.3 of its application/,
  },
  {
    name: 'any other filing at "ICH / Global" (a comparability protocol)',
    send: { programType: 'nda', primaryAgency: 'ICH / Global', submissionTypeId: 'ich_comparability' },
    reason: /^Not offered: ICH is no jurisdiction and takes no filing, and this filing is not authored here as a project of its own\.$/,
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
      .send(body({ programType, productType: programType === 'ivdr' ? 'ivd' : 'device', primaryAgency: 'EU / Notified Body' }));
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

// ── Added 2026-10-18: filing document classes ──────────────────────────────
// A supplement and a CSR are documents, not applications. Before, the wizard
// sent them as 'nda' and 'ind': the PAS was created with an NDA submission spine
// and scaffolded the NDA dossier; the CSR at 'ICH / Global' was refused as "Not
// supported". Now each is its own class: created, author-only, scaffolded from
// its own pack, and given no submission spine.
describe('POST /api/c2c/projects — a filing that is a document is created as its own class', () => {
  it('a Prior Approval Supplement at FDA: created author-only, its own outline, no submission spine', async () => {
    queueDeviceCreate();
    const res = await request(app()).post('/api/c2c/projects')
      .send(body({ programType: 'pas', primaryAgency: 'FDA', submissionTypeId: 'us_nda_supp' }));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.meta.marketSupport).toMatchObject({ tier: 'author_only', label: 'Author documents for this market' });
    expect(res.body.meta.marketSupport.reason).toMatch(/An FDA supplement is not built as a sequence yet/);
    expect(scaffold).toHaveBeenCalledWith(expect.objectContaining({ programType: 'pas', primaryAgency: 'FDA' }));
    expect(createSubmissionTx).not.toHaveBeenCalled();
    expect(sqlCalls()).toContain('COMMIT');
  });

  it('a clinical study report at "ICH / Global": created author-only, scaffolded against ICH, no submission spine', async () => {
    queueDeviceCreate();
    const res = await request(app()).post('/api/c2c/projects')
      .send(body({ programType: 'csr', primaryAgency: 'ICH / Global', submissionTypeId: 'ich_csr' }));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.meta.marketSupport.tier).toBe('author_only');
    expect(res.body.meta.marketSupport.reason).toMatch(/harmonised \(ICH\) document/);
    expect(scaffold).toHaveBeenCalledWith(expect.objectContaining({ programType: 'csr', primaryAgency: 'ICH' }));
    expect(createSubmissionTx).not.toHaveBeenCalled();
  });

  it('a class covers drugs and biologics alike, so the product class must be stated', async () => {
    const res = await request(app()).post('/api/c2c/projects')
      .send(body({ programType: 'cbe', primaryAgency: 'FDA', productType: undefined }));
    expect(res.status).toBe(400);
    expect(res.body.message ?? res.body.error).toMatch(/drug or a biologic/);
    expect(query).not.toHaveBeenCalled();
  });
});

// ── Added 2026-11-09 (S12 biotech sweep, package S1) ───────────────────────
// The filing chosen decides the application type. The gate above judged only
// the programType and agency the caller sent; submissionTypeId was recorded and
// never compared with the type the catalog gives that filing. So a Type II
// Variation sent as an MAA got a full MAA scaffold, though the New project
// picker asks the verdict about the type that filing creates (an NDA at EMA)
// and marks it not offered. The type is computed by the picker's own rule
// (programTypeFor, shared/constants/domain/filing-application-type.ts).
describe('POST /api/c2c/projects — the filing chosen decides the application type', () => {
  const programInserts = () => query.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO regulatory_programs'));

  /* Until 2026-11-13 a Type II Variation was an NDA by the wizard's 'ctd' default, and this refusal named the NDA.
     The catalog states no type for it, so it creates no project, whatever type it is sent as. */
  it.each([
    ['its catalog id', 'eu_variation_ii'],
    ['its legacy id', 'type_ii_var'],
  ])('a Type II Variation (by %s) sent as an MAA is refused 422 FILING_NOT_OFFERED in its own name, before any SQL', async (_label, submissionTypeId) => {
    queueDrugCreate();
    const res = await request(app()).post('/api/c2c/projects')
      .send(body({ programType: 'maa', primaryAgency: 'EMA', submissionTypeId }));
    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(res.body.error).toBe('FILING_NOT_OFFERED');
    expect(res.body.message).toBe('Not offered: no project type is stated for Type II Variation (Major), so no project is created from it.');
    expect(programInserts()).toHaveLength(0);
    expect(query).not.toHaveBeenCalled();
    expect(scaffold).not.toHaveBeenCalled();
    expect(createSubmissionTx).not.toHaveBeenCalled();
  });

  it('a filing that creates one application, sent as another (a Conditional Marketing Authorisation as an NDA), is refused 422 FILING_NOT_OFFERED, before any SQL', async () => {
    queueDrugCreate();
    const res = await request(app()).post('/api/c2c/projects')
      .send(body({ programType: 'nda', primaryAgency: 'EMA', submissionTypeId: 'eu_cma' }));
    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(res.body.error).toBe('FILING_NOT_OFFERED');
    expect(res.body.message).toMatch(/ creates an MAA project, not an NDA\. /);
    expect(programInserts()).toHaveLength(0);
    expect(query).not.toHaveBeenCalled();
    expect(scaffold).not.toHaveBeenCalled();
    expect(createSubmissionTx).not.toHaveBeenCalled();
  });

  /* S12 sweep items 3 and 4 (2026-11-13): until then this filing was an NDA by the wizard's 'ctd' default, so the
     same request was created as a full NDA project. */
  it.each([
    ['as an NDA, as the wizard sent it', 'nda'],
    ['as an IND', 'ind'],
  ])('a filing the catalog states no type for (a Device Master Record) creates no project, sent %s: 422 in its own name, before any SQL', async (_label, programType) => {
    queueDrugCreate();
    const res = await request(app()).post('/api/c2c/projects')
      .send(body({ programType, primaryAgency: 'FDA', submissionTypeId: 'qms_dmr' }));
    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(res.body.error).toBe('FILING_NOT_OFFERED');
    expect(res.body.message).toBe('Not offered: Device Master Record (DMR) is a quality system record, not a filing, so no project is created from it.');
    expect(programInserts()).toHaveLength(0);
    expect(query).not.toHaveBeenCalled();
    expect(scaffold).not.toHaveBeenCalled();
    expect(createSubmissionTx).not.toHaveBeenCalled();
  });

  it('where the verdict refuses the filing\'s own type in that market, the refusal says so too, with that offer', async () => {
    queueDrugCreate();
    const res = await request(app()).post('/api/c2c/projects')
      .send(body({ programType: 'nda', primaryAgency: 'MHRA', submissionTypeId: 'us_ind' }));
    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(res.body.error).toBe('FILING_NOT_OFFERED');
    expect(res.body.message).toBe('Investigational New Drug Application creates an IND project, not an NDA. Not offered: the UK has no IND application type.');
    expect(res.body.marketSupport).toMatchObject({ tier: 'not_offered', label: 'Not offered' });
    expect(query).not.toHaveBeenCalled();
    expect(scaffold).not.toHaveBeenCalled();
  });

  it('the type the picker gives the filing, sent with it, is still created (an EU MAA as an MAA): 201', async () => {
    queueDrugCreate();
    const res = await request(app()).post('/api/c2c/projects')
      .send(body({ programType: 'maa', primaryAgency: 'EMA', submissionTypeId: 'eu_maa' }));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(programInserts()).toHaveLength(1);
    expect(sqlCalls()).toContain('COMMIT');
  });

  it('a filing whose pathway names its application (a 505(b)(2) is an NDA) is created as that application: 201', async () => {
    queueDrugCreate();
    const res = await request(app()).post('/api/c2c/projects')
      .send(body({ programType: 'nda', primaryAgency: 'FDA', submissionTypeId: 'us_505b2' }));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(programInserts()).toHaveLength(1);
  });
});
