/**
 * The knowledge upload's Module 3 auto-map uses a recorded submission track or
 * does not run — it never guesses one.
 *
 * The route called classifyAndMapArtifactToSource with
 * `submissionTrack: (dossierClassification.submissionTrack || 'general')`, so an
 * upload that stated no track was written into the CMC source object and its
 * provenance event as a 'general' submission — a track nobody recorded. The
 * track is now the upload's stated one, else the one its program records
 * (regulatory_programs.program_type via projects.regulatory_program_id); with
 * neither, the map is skipped and the reason is recorded and returned.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { selectLimit, poolQuery, classify, admit } = vi.hoisted(() => ({
  selectLimit: vi.fn(),
  poolQuery: vi.fn(),
  classify: vi.fn(),
  admit: vi.fn(),
}));

// The upload admits its project (current edit authority) before reading the
// file; the admitted project, with its regulatoryProgramId, is the seam here.
vi.mock('../project-access', async (original) => ({
  ...(await original<typeof import('../project-access')>()),
  requireProjectAdmission: admit,
}));

vi.mock('../../../db', () => ({
  db: {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: selectLimit })) })) })),
    insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn(async () => [{ id: 501 }]) })) })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn(async () => [{ id: 1 }]) })) })),
    })),
  },
  pool: { query: (...a: unknown[]) => poolQuery(...a) },
}));
vi.mock('../../../services/concept2cure/governedDocumentContractService', () => ({
  resolveGovernedContext: () => ({
    validation: { valid: true, errors: [], warnings: [] },
    resolved: {},
    contract: { exportEligibility: { gateChecks: [], blockingReasons: [], readinessOutcome: 'exploratory' } },
  }),
}));
vi.mock('../../../services/module3-convergence-service', () => ({ classifyAndMapArtifactToSource: classify }));
vi.mock('../../../services/projects/retrieval-mode.js', () => ({ refreshProjectRetrievalMode: vi.fn(async () => undefined) }));
vi.mock('../../../utils/logger', () => ({
  createScopedLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));
vi.mock('../../../auth', () => ({ authMiddleware: (_q: unknown, _s: unknown, n: () => void) => n() }));
vi.mock('../../../middleware/tenantContext', () => ({
  tenantContextMiddleware: (_q: unknown, _s: unknown, n: () => void) => n(),
  requireOrganizationContext: (_q: unknown, _s: unknown, n: () => void) => n(),
}));
vi.mock('../../../middleware/redisRateLimiter', () => ({
  createRedisRateLimiter: () => (_q: unknown, _s: unknown, n: () => void) => n(),
}));

import router from '../knowledge-sources';

type Handler = (req: unknown, res: unknown) => Promise<unknown>;
function uploadHandler(): Handler {
  const layer = (router.stack as Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Handler }> } }>)
    .find((l) => l.route?.path === '/documents/upload' && l.route.methods.post);
  if (!layer?.route) throw new Error('upload route missing');
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

async function upload(body: Record<string, unknown>) {
  const req = {
    body: { projectId: 'proj_1', feedsModule3: 'true', sourceType: 'specification', ctdSection: '3.2.S.4', ...body },
    params: {},
    query: {},
    headers: {},
    userId: 42,
    tenantContext: { organizationId: '1', clientWorkspaceId: '1' },
    file: { originalname: 'spec.txt', mimetype: 'text/plain', size: 64, buffer: Buffer.from('Drug substance specification: assay 98.0-102.0%.') },
  };
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  await uploadHandler()(req, res);
  return res;
}

/** The provenance event the upload wrote for its dossier classification. */
function classifyEventDetails(): Record<string, unknown> | null {
  const call = poolQuery.mock.calls.find(([sql]) => /concept2cure_provenance_events/.test(String(sql)));
  return call ? JSON.parse(String((call[1] as unknown[])[3])) : null;
}

let programType: string | null;

beforeEach(() => {
  vi.clearAllMocks();
  programType = null;
  classify.mockResolvedValue({ sourceObjectId: 9, sectionKey: '3.2.S.4' });
  admit.mockImplementation(async () => (await selectLimit())[0]);
  poolQuery.mockImplementation(async (sql: string) => {
    if (/FROM regulatory_programs/.test(sql)) return { rows: programType ? [{ program_type: programType }] : [] };
    return { rows: [] };
  });
});

describe('knowledge upload: the Module 3 auto-map never guesses a submission track', () => {
  it('with no stated track and no program, the map is skipped and the reason recorded', async () => {
    selectLimit.mockResolvedValue([{ id: 1, organizationId: 1, settings: {}, regulatoryProgramId: null }]);
    const res = await upload({});
    expect(classify, 'the map ran on a guessed track').not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    const body = res.json.mock.calls[0][0] as { data: { module3SourceMapping?: { status: string; reason?: string } } };
    expect(body.data.module3SourceMapping?.status).toBe('skipped');
    expect(body.data.module3SourceMapping?.reason).toMatch(/no submission track/i);
    expect(JSON.stringify(classifyEventDetails())).toMatch(/no submission track/i);
  });

  it("with no stated track, the program's recorded track is used", async () => {
    selectLimit.mockResolvedValue([{ id: 1, organizationId: 1, settings: {}, regulatoryProgramId: 'prog-uuid' }]);
    programType = 'IND';
    await upload({});
    expect(classify).toHaveBeenCalledTimes(1);
    expect(classify.mock.calls[0][3]).toMatchObject({ submissionTrack: 'IND' });
  });

  it('control: a track the upload states is used as stated', async () => {
    selectLimit.mockResolvedValue([{ id: 1, organizationId: 1, settings: {}, regulatoryProgramId: null }]);
    await upload({ submissionTrack: 'NDA' });
    expect(classify.mock.calls[0][3]).toMatchObject({ submissionTrack: 'NDA' });
  });
});
