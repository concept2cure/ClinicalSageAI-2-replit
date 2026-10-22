/**
 * The submission-center item routes (ledger L161): they were written behind a
 * registrar nothing called, so the table had no reachable reader. This pins
 * that the router answers, fails closed when its tables are missing, refuses
 * an illegal lifecycle transition without writing, and 404s an unknown item —
 * plus the two helpers whose only other implementation was deleted with the
 * dead module.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const poolQuery = vi.fn();
const dbInsert = vi.fn();
const currentAccess = vi.fn();
const admission = vi.fn();
const requestExecutor = { query:vi.fn() };
vi.mock('../../../db/requestDb', () => ({ requestPgClient:() => requestExecutor }));
vi.mock('../../../services/c2c/current-program-access', () => ({
  requireCurrentProgramAccess:(...args:unknown[]) => currentAccess(...args),
  ProgramReadAccessError:class extends Error {
    constructor(readonly status:number, readonly code:string, message:string) { super(message); }
  },
}));
vi.mock('../../../db', () => ({
  pool: { query: (...a: unknown[]) => poolQuery(...a) },
  db: { insert: (...a: unknown[]) => dbInsert(...a) },
}));
vi.mock('../../../middleware/redisRateLimiter', () => ({
  createRedisRateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../../auth', () => ({
  authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../../middleware/tenantContext', () => ({
  tenantContextMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireOrganizationContext: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
const createNotification = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock('../notifications', () => ({ createNotification: (...a: unknown[]) => createNotification(...a) }));
vi.mock('../../../services/governed-ana-execution.js', () => ({
  buildCanonicalGovernedState: async () => ({ decision: 'allow' }),
}));
// This suite isolates schema availability and item lifecycle behavior. Real
// current-membership, project-sharing and stale-role admission are exercised
// through the mounted routers in c2c-audit-outcomes.pglite.test.ts.
vi.mock('../project-access', () => ({
  projectAdmissionMiddleware: () => (req:Request, res:Response, next:NextFunction) => {
    admission(req.params.projectId);
    // The existing numeric policy refuses a UUID until it is canonically admitted.
    if (!/^(?:proj_)?[1-9]\d*$/.test(String(req.params.projectId))) return res.status(404).json({ error:'Project not found' });
    next();
  },
}));

type Mod = typeof import('../communication-center');
// The router caches its schema probe at module level ('ready' after the first
// success), so every test gets a fresh module: its first pool.query is always
// the probe, and the fail-closed case cannot be masked by an earlier pass.
let mod: Mod;
beforeEach(async () => {
  vi.resetModules();
  mod = await import('../communication-center');
});

const ALL_TABLES = [
  'concept2cure_authority_profiles',
  'concept2cure_agency_communications',
  'concept2cure_publishops_services',
  'concept2cure_submission_center_items',
];
const ITEM_ROW = {
  item_id: 'sci_1', title: 'Initial NDA', authority: 'FDA', submission_type: 'NDA',
  sequence_number: '0000', gateway_profile: null, status: 'draft', ectd_path: null,
  dispatch_ready: false, metadata: {}, created_by: 'a@b.c',
  created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z',
};

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    req.userId = 5;
    req.userEmail = 'a@b.c';
    req.tenantContext = { organizationId:7 };
    next();
  });
  a.use('/api/concept2cure', mod.default);
  return a;
}

/** pool.query answers in order: the schema probe, then whatever the handler asks. */
function wire(answers: Array<{ rows: unknown[] }>) {
  poolQuery.mockReset();
  for (const a of answers) poolQuery.mockResolvedValueOnce(a);
}
const tables = (names: string[]) => ({ rows: names.map((table_name) => ({ table_name })) });

beforeEach(() => {
  poolQuery.mockReset();
  currentAccess.mockReset().mockResolvedValue({ projectId:42, actor:{ userId:5, role:"member" } });
  admission.mockClear();
  createNotification.mockClear();
  dbInsert.mockReset();
  // logAuditEntry awaits db.insert(...).values(...); the task writer chains .returning().
  const chain = { returning: async () => [{ id: 11 }], then: (r: (v: unknown) => void) => r(undefined) };
  dbInsert.mockReturnValue({ values: () => chain });
});

describe('helpers the dead module duplicated', () => {
  it('parses project ids with and without the proj_ prefix', () => {
    expect(mod.parseProjectParam('proj_42')).toBe(42);
    expect(mod.parseProjectParam('7')).toBe(7);
    expect(() => mod.parseProjectParam('proj_bad')).toThrow('Invalid project ID');
    expect(() => mod.parseProjectParam(undefined)).toThrow('Invalid project ID');
  });
  it('applies visibility-tier gating by role', () => {
    expect(mod.canViewVisibilityTier('shared_client_c2c', 'client_reviewer')).toBe(true);
    expect(mod.canViewVisibilityTier('publishops_only', 'client_reviewer')).toBe(false);
    expect(mod.canViewVisibilityTier('publishops_only', 'managed_publishops_operator')).toBe(true);
    expect(mod.canViewVisibilityTier('restricted_legal_sensitive', 'legal_counsel')).toBe(true);
    expect(mod.canViewVisibilityTier('restricted_legal_sensitive', 'client_reviewer')).toBe(false);
    expect(mod.canViewVisibilityTier('c2c_internal', 'c2c_analyst')).toBe(true);
    expect(mod.canViewVisibilityTier('c2c_internal', 'client_reviewer')).toBe(false);
    expect(mod.canViewVisibilityTier('c2c_internal', 'admin')).toBe(true);
    expect(mod.canViewVisibilityTier('client_internal', 'client_reviewer')).toBe(true);
    expect(mod.canViewVisibilityTier('unknown_tier' as never, 'admin')).toBe(false);
  });
});

describe('GET /projects/:projectId/submission-center/items', () => {
  it('lists the project\'s items with the lifecycle states in meta', async () => {
    wire([tables(ALL_TABLES), { rows: [ITEM_ROW] }]);
    const res = await request(app()).get('/api/concept2cure/projects/proj_3/submission-center/items');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ id: 'sci_1', projectId: 3, organizationId: 7, status: 'draft' });
    expect(res.body.meta.states).toContain('draft');
    const [sqlText, params] = poolQuery.mock.calls[1] as [string, unknown[]];
    expect(sqlText).toMatch(/FROM concept2cure_submission_center_items/);
    expect(params).toEqual([7, 3]);
  });

  it('fails closed with 503 naming the missing table, and reads nothing', async () => {
    wire([tables(ALL_TABLES.slice(0, 3))]);
    const res = await request(app()).get('/api/concept2cure/projects/3/submission-center/items');
    expect(res.status).toBe(503);
    expect(res.body.error.message).toMatch(/concept2cure_submission_center_items/);
    expect(poolQuery).toHaveBeenCalledTimes(1);
  });
});

describe('PATCH /projects/:projectId/submission-center/items/:itemId/status', () => {
  it('refuses an illegal transition with 400 and writes nothing', async () => {
    wire([tables(ALL_TABLES), { rows: [ITEM_ROW] }]);
    const res = await request(app())
      .patch('/api/concept2cure/projects/3/submission-center/items/sci_1/status')
      .send({ status: 'accepted_by_authority' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Invalid submission status transition: draft -> accepted_by_authority/);
    expect(poolQuery.mock.calls.some(([q]) => /UPDATE/.test(String(q)))).toBe(false);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('404s an item that is not in this org and project', async () => {
    wire([tables(ALL_TABLES), { rows: [] }]);
    const res = await request(app())
      .patch('/api/concept2cure/projects/3/submission-center/items/sci_9/status')
      .send({ status: 'preparing' });
    expect(res.status).toBe(404);
  });

  it('applies a legal transition, audits it, and notifies through the one writer only past ready_for_publish', async () => {
    wire([tables(ALL_TABLES), { rows: [ITEM_ROW] }, { rows: [] }]);
    const res = await request(app())
      .patch('/api/concept2cure/projects/3/submission-center/items/sci_1/status')
      .send({ status: 'preparing' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('preparing');
    const update = poolQuery.mock.calls.find(([q]) => /UPDATE concept2cure_submission_center_items/.test(String(q)));
    expect(update).toBeTruthy();
    expect((update as [string, unknown[]])[1].slice(0, 1)).toEqual(['preparing']);
    expect(createNotification).not.toHaveBeenCalled();
    expect(dbInsert).toHaveBeenCalled(); // the audit row
  });
});

describe('program UUID communication routing', () => {
  it('admits the UUID on the actual request executor before applying the numeric policy', async () => {
    wire([tables(ALL_TABLES), { rows:[ITEM_ROW] }]);
    const r = await request(app()).get('/api/concept2cure/projects/73404fc6-d7a5-4e16-bc5d-201aca29e09f/submission-center/items');
    expect(r.status).toBe(200);
    expect(currentAccess).toHaveBeenCalledWith(requestExecutor, {
      organizationId:7, userId:5, programId:'73404fc6-d7a5-4e16-bc5d-201aca29e09f',
    });
    expect(admission).toHaveBeenCalledWith('42');
    expect(r.body.data[0].projectId).toBe(42);
  });

  it('supplies no communication content when the current private program is refused', async () => {
    currentAccess.mockRejectedValue(new Error('private access unavailable'));
    const r = await request(app()).get('/api/concept2cure/projects/73404fc6-d7a5-4e16-bc5d-201aca29e09f/submission-center/items');
    expect(r.status).toBe(503);
    expect(r.body).not.toHaveProperty('data');
    expect(poolQuery).not.toHaveBeenCalled();
    expect(admission).not.toHaveBeenCalled();
  });

  it('refuses revoked private-program access before any content read', async () => {
    const { ProgramReadAccessError } = await import('../../../services/c2c/current-program-access');
    currentAccess.mockRejectedValue(new ProgramReadAccessError(403, 'PROJECT_PERMISSION_DENIED', 'Current project access does not permit this operation.'));
    const r = await request(app()).get('/api/concept2cure/projects/73404fc6-d7a5-4e16-bc5d-201aca29e09f/submission-center/items');
    expect(r.status).toBe(403);
    expect(r.body).not.toHaveProperty('data');
    expect(poolQuery).not.toHaveBeenCalled();
    expect(admission).not.toHaveBeenCalled();
  });

  const uuid = '73404fc6-d7a5-4e16-bc5d-201aca29e09f';
  const req = () => ({ params: { projectId: uuid }, userId:5, tenantContext: { organizationId: 7 } }) as unknown as Request;
  it('resolves only through the current organisation anchor', async () => {
    expect(await mod.resolveCommunicationProject(req())).toBe(42);
    expect(currentAccess).toHaveBeenLastCalledWith(requestExecutor, {
      programId:uuid, organizationId:7, userId:5,
    });
  });
  it('rejects a program without an anchor and propagates lookup failures', async () => {
    const { ProgramReadAccessError } = await import('../../../services/c2c/current-program-access');
    currentAccess.mockRejectedValueOnce(new ProgramReadAccessError(409, 'PROJECT_ANCHOR_UNRESOLVED', 'A unique project anchor is required.'));
    await expect(mod.resolveCommunicationProject(req())).rejects.toThrow('A unique project anchor is required.');
    currentAccess.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(mod.resolveCommunicationProject(req())).rejects.toThrow('database unavailable');
  });
});

describe('POST /projects/:projectId/agency-communications — a linked data-room letter', () => {
  const body = (linkedArtifactIds: string[]) => ({
    sourceType: 'uploaded_official_correspondence', communicationType: 'Advice letter', sourceChannel: 'Manually logged',
    linkedSectionCodes: [], linkedArtifactIds, urgency: 'medium', responseRequired: true, extractedIssues: [],
    visibilityTier: 'shared_client_c2c',
  });
  const inserted = () => poolQuery.mock.calls.some(([q]) => /INSERT INTO concept2cure_agency_communications/.test(String(q)));

  it('refuses a cre_source that is not this organisation\'s source in this project, and writes nothing', async () => {
    // The tenant-scoped lookup finds no such source (another tenant's id, or another project's).
    wire([tables(ALL_TABLES), { rows: [] }]);
    const res = await request(app()).post('/api/concept2cure/projects/3/agency-communications').send(body(['cre_source:901']));
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/cre_source:901/);
    expect(inserted()).toBe(false);
    const [sqlText, params] = poolQuery.mock.calls[1] as [string, unknown[]];
    expect(sqlText).toMatch(/FROM cre_evidence_sources/);
    expect(sqlText).toMatch(/organization_id = \$1/);
    expect(sqlText).toMatch(/regulatory_program_id = s\.client_program_id/);
    expect(params).toEqual([7, 3, [901]]);
  });

  it('refuses a malformed cre_source reference without looking anything up', async () => {
    wire([tables(ALL_TABLES)]);
    const res = await request(app()).post('/api/concept2cure/projects/3/agency-communications').send(body(['cre_source:abc']));
    expect(res.status).toBe(400);
    expect(poolQuery).toHaveBeenCalledTimes(1);
  });

  it('links a source of this project and stores the reference as sent', async () => {
    wire([tables(ALL_TABLES), { rows: [{ id: 88 }] }, { rows: [] }]);
    const res = await request(app()).post('/api/concept2cure/projects/3/agency-communications').send(body(['cre_source:88', 'art_1']));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.linkedArtifactIds).toEqual(['cre_source:88', 'art_1']);
    const insert = poolQuery.mock.calls.find(([q]) => /INSERT INTO concept2cure_agency_communications/.test(String(q))) as [string, unknown[]];
    expect(insert[1][9]).toBe(JSON.stringify(['cre_source:88', 'art_1']));
  });

  it('looks nothing up when no data-room letter is linked', async () => {
    wire([tables(ALL_TABLES), { rows: [] }]);
    const res = await request(app()).post('/api/concept2cure/projects/3/agency-communications').send(body([]));
    expect(res.status).toBe(200);
    expect(poolQuery.mock.calls.some(([q]) => /cre_evidence_sources/.test(String(q)))).toBe(false);
  });
});

describe('POST /projects/:projectId/agency-communications — the submission a letter concerns (gap 6.5)', () => {
  const body = (linkedSubmissionId?: string) => ({
    sourceType: 'uploaded_official_correspondence', communicationType: 'Information request', sourceChannel: 'esg',
    linkedSectionCodes: [], linkedArtifactIds: [], urgency: 'high', responseRequired: true, extractedIssues: [],
    visibilityTier: 'shared_client_c2c', ...(linkedSubmissionId === undefined ? {} : { linkedSubmissionId }),
  });
  const inserted = () => poolQuery.mock.calls.find(([q]) => /INSERT INTO concept2cure_agency_communications/.test(String(q))) as [string, unknown[]] | undefined;

  it('refuses a reference that is not a submission id without looking anything up', async () => {
    wire([tables(ALL_TABLES)]);
    const res = await request(app()).post('/api/concept2cure/projects/3/agency-communications').send(body('IND 123456'));
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/not a submission id/);
    expect(poolQuery).toHaveBeenCalledTimes(1);
  });

  it("refuses a submission the organisation-and-program lookup does not find, and writes nothing", async () => {
    wire([tables(ALL_TABLES), { rows: [] }]);
    const res = await request(app()).post('/api/concept2cure/projects/3/agency-communications').send(body('41'));
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/not one of this project's submissions/);
    expect(inserted()).toBeUndefined();
    const [sqlText, params] = poolQuery.mock.calls[1] as [string, unknown[]];
    expect(sqlText).toMatch(/FROM submissions sub/);
    expect(sqlText).toMatch(/p\.regulatory_program_id = sub\.program_id/);
    expect(sqlText).toMatch(/sub\.deleted_at IS NULL/);
    expect(params).toEqual([7, 3, 41]);
  });

  it('stores the id the lookup found and returns the submission it names', async () => {
    wire([tables(ALL_TABLES), { rows: [{ id: 41, title: 'IND 123456', application_type: 'ind', primary_region: 'fda' }] }, { rows: [] }]);
    const res = await request(app()).post('/api/concept2cure/projects/3/agency-communications').send(body(' 41 '));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({ linkedSubmissionId: '41', linkedSubmission: { id: 41, title: 'IND 123456', applicationType: 'ind', primaryRegion: 'fda' } });
    expect(inserted()![1][6]).toBe('41');
  });

  it('treats an empty choice as no submission and looks nothing up', async () => {
    wire([tables(ALL_TABLES), { rows: [] }]);
    const res = await request(app()).post('/api/concept2cure/projects/3/agency-communications').send(body(''));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.linkedSubmission).toBeNull();
    expect(poolQuery.mock.calls.some(([q]) => /FROM submissions/.test(String(q)))).toBe(false);
    expect(inserted()![1][6]).toBeNull();
  });
});
