/**
 * Each tracked device filing's gate, and its history, over HTTP (D2, fold F5
 * item 1, 2026-10-30; decision P-61 items 1 and 2;
 * docs/evidence/D2-ONE-ANA/2026-10-29/fold-f5-device-filing/).
 *
 * The retired device-submission screen gated each package on the package
 * store's readiness; the decision moves the gate to the filing, from the
 * filing's deterministic readiness, the one EstarFilingPanel shows (POST
 * /filing-readiness with the project's content). These pin:
 *   - GET /submissions/:id/readiness answers what POST /filing-readiness
 *     answers for the filing's catalogue key, variant and project, from the
 *     same engine on the same inputs;
 *   - a filing tracked under no project, or whose project anchors no program, is
 *     not assessed, and says which: a readiness over no project's content would
 *     be the organization-wide read the panel was fixed to refuse;
 *   - both reads admit the filing's project first, and a refusal assesses and
 *     reads nothing;
 *   - GET /submissions/:id/events returns the filing's history.
 * The content, registration, template and flag reads are stubbed with fixed
 * answers; the readiness engine is the real one.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRequest, createMockResponse } from '../setup';

const h = vi.hoisted(() => ({
  filing: { id: 'f-1', catalogKey: '510k', variant: 'device', projectId: 41 as number | null, organizationId: 2 },
  programs: new Map<number, { id: string; title: string }>(),
  admit: vi.fn(async () => ({ id: 41 })),
  events: vi.fn(async () => [{ id: 1, eventType: 'created', fromStatus: null, toStatus: 'draft', actorUserId: 9, detail: {}, occurredAt: '2026-10-30T00:00:00.000Z' }]),
  scope: vi.fn(async (_org: number, opts: { programId?: string }) => ({ scope: { programId: opts.programId }, source: 'governed_program' })),
  leaves: vi.fn(async () => [{ sectionCode: 'device-description', title: 'Device description', substantive: true }]),
}));

vi.mock('../../server/auth', () => ({ authMiddleware: (_req: any, _res: any, next: any) => next() }));
vi.mock('../../server/services/pathway-engines/estar/estar-submission-service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getEstarSubmission: vi.fn(async () => h.filing),
  listEstarSubmissionEvents: h.events,
}));
vi.mock('../../server/routes/c2c/project-access', () => {
  class ProjectAdmissionRefusal extends Error {
    constructor(public status: number, public code: string, message: string) { super(message); }
  }
  return { requireCurrentProjectActor: vi.fn(async () => ({ userId: 9, role: 'viewer' })), requireProjectAdmission: h.admit, ProjectAdmissionRefusal };
});
vi.mock('../../server/services/tasking/task-home-programs', () => ({
  loadTaskHomePrograms: vi.fn(async (_c: unknown, _org: number, ids: number[]) => new Map(ids.filter((i) => h.programs.has(i)).map((i) => [i, h.programs.get(i)!]))),
}));
vi.mock('../../server/services/pathway-engines/estar/estar-content-leaves', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolveDeviceContentScope: h.scope,
  loadDeviceContentLeaves: h.leaves,
}));
vi.mock('../../server/services/pathway-engines/estar/estar-registration-service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolveClientRegistration: vi.fn(async () => ({ clientId: 'org-2', satisfied: ['establishment-registration'] })),
}));
vi.mock('../../server/services/pathway-engines/estar/estar-fill', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  fillEstarSubmission: vi.fn(async () => ({ templateAvailable: true, fieldMapPopulated: false })),
}));
vi.mock('../../server/services/pathway-engines/estar/program-device-flags', () => ({ loadProgramDeviceFlags: vi.fn(async () => undefined) }));
vi.mock('../../server/db', () => ({ db: {}, pool: { query: vi.fn() } }));
vi.mock('../../server/db/requestDb', () => ({ requestDb: () => ({}), requestPgClient: () => ({ query: vi.fn() }) }));

import estarRoutes from '../../server/routes/510k-estar-routes';
import { ProjectAdmissionRefusal } from '../../server/routes/c2c/project-access';

function handler(path: string, method: 'get' | 'post') {
  const layer = estarRoutes.stack.find((l: any) => l.route?.path === path && l.route?.methods?.[method]);
  if (!layer) throw new Error(`Missing route ${method.toUpperCase()} ${path}`);
  const stack = layer.route!.stack;
  return stack[stack.length - 1].handle as (req: unknown, res: unknown) => Promise<void>;
}
async function call(path: string, method: 'get' | 'post', init: { params?: Record<string, string>; body?: Record<string, unknown> } = {}) {
  const req = createMockRequest({ params: init.params ?? {}, body: init.body ?? {} }) as any;
  req.userId = 9;
  req.resolvedOrganizationId = 2;
  const res = createMockResponse() as any;
  await handler(path, method)(req, res);
  const status = res.status.mock.calls.at(-1)?.[0] ?? 200;
  const body = res.json.mock.calls.at(-1)?.[0];
  return { status, body };
}

const PROGRAM = '00000000-0000-4000-8000-0000000000d1';
beforeEach(() => {
  vi.clearAllMocks();
  h.filing = { id: 'f-1', catalogKey: '510k', variant: 'device', projectId: 41, organizationId: 2 };
  h.programs = new Map([[41, { id: PROGRAM, title: 'Pump' }]]);
  h.admit.mockImplementation(async () => ({ id: 41 }));
});

describe('GET /submissions/:id/readiness — the filing\'s own gate', () => {
  it('answers what the filing-readiness panel answers for the filing\'s type, variant and project', async () => {
    const row = await call('/submissions/:id/readiness', 'get', { params: { id: 'f-1' } });
    expect(row.status).toBe(200);
    expect(h.admit).toHaveBeenCalledWith(expect.anything(), '41');
    const panel = await call('/filing-readiness', 'post', { body: { catalogKey: '510k', variant: 'device', useProjectContent: true, programId: PROGRAM } });
    expect(panel.status).toBe(200);
    expect(row.body).toEqual({ assessed: true, filingId: 'f-1', programId: PROGRAM, readiness: panel.body });
    // Real engine, real verdict: an unpopulated field map blocks filing.
    expect(row.body.readiness.canFileNow).toBe(false);
    expect(row.body.readiness.blockers.length).toBeGreaterThan(0);
    expect(h.scope).toHaveBeenLastCalledWith(2, expect.objectContaining({ programId: PROGRAM }));
  });

  it('does not assess a filing tracked under no project, and says so', async () => {
    h.filing = { ...h.filing, projectId: null };
    const r = await call('/submissions/:id/readiness', 'get', { params: { id: 'f-1' } });
    expect(r).toMatchObject({ status: 200, body: { assessed: false, reason: 'no_project', filingId: 'f-1' } });
    expect(h.scope).not.toHaveBeenCalled();
  });

  it('does not assess a filing whose project anchors no program, and says so', async () => {
    h.programs = new Map();
    const r = await call('/submissions/:id/readiness', 'get', { params: { id: 'f-1' } });
    expect(r).toMatchObject({ status: 200, body: { assessed: false, reason: 'no_program', filingId: 'f-1' } });
    expect(h.scope).not.toHaveBeenCalled();
  });

  it('assesses nothing for a caller the filing\'s project does not admit', async () => {
    h.admit.mockRejectedValueOnce(new (ProjectAdmissionRefusal as any)(403, 'PROJECT_ACCESS_DENIED', 'No.'));
    const r = await call('/submissions/:id/readiness', 'get', { params: { id: 'f-1' } });
    expect(r.status).toBe(403);
    expect(h.scope).not.toHaveBeenCalled();
  });
});

describe('GET /submissions/:id/events — the filing\'s history', () => {
  it('returns the history once the filing\'s project admits the caller', async () => {
    const r = await call('/submissions/:id/events', 'get', { params: { id: 'f-1' } });
    expect(r.status).toBe(200);
    expect(r.body.events).toHaveLength(1);
    expect(h.events).toHaveBeenCalledWith('f-1', { organizationId: 2 });
    expect(h.admit).toHaveBeenCalledWith(expect.anything(), '41');
  });

  it('reads nothing for a caller the project does not admit', async () => {
    h.admit.mockRejectedValueOnce(new (ProjectAdmissionRefusal as any)(404, 'PROJECT_NOT_FOUND', 'No.'));
    const r = await call('/submissions/:id/events', 'get', { params: { id: 'f-1' } });
    expect(r.status).toBe(404);
    expect(h.events).not.toHaveBeenCalled();
  });
});
