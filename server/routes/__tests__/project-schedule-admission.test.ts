/** Caller-boundary proof for the existing schedule and unified-work routes.
 * Canonical membership/sharing answers and schedule I/O are mocked here;
 * native policy/transaction proof lives beside the real services. Request
 * executor, Drizzle identity and governed session actor helpers are real. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const h = vi.hoisted(() => ({
  query: vi.fn(), globalQuery: vi.fn(), actor: vi.fn(), program: vi.fn(), access: vi.fn(), anchor: vi.fn(),
  get: vi.fn(), generate: vi.fn(), amend: vi.fn(), review: vi.fn(), reset: vi.fn(), unified: vi.fn(),
}));
vi.mock('../../db', () => ({ pool: { query: h.globalQuery }, db: { legacyGlobal: true } }));
vi.mock('../../services/c2c/program-project-anchor', async original => ({
  ...(await original<typeof import('../../services/c2c/program-project-anchor')>()),
  resolveProgramProjectAnchor: h.anchor,
}));
vi.mock('../../services/c2c/current-program-access', async original => ({
  ...(await original<typeof import('../../services/c2c/current-program-access')>()),
  readCurrentProgramActor: h.actor, requireCurrentProgramAccess: h.program,
}));
vi.mock('../../services/report-os/project-access', async original => ({
  ...(await original<typeof import('../../services/report-os/project-access')>()), canAccessReportProject: h.access,
}));
vi.mock('../../services/projects/schedule-of-events', () => ({
  getScheduleOfEvents: h.get, generateProjectSchedule: h.generate, amendMilestone: h.amend,
  resetProjectGoals: h.reset, reviewScheduleHealth: h.review,
}));
vi.mock('../../services/unified-work/unified-work-view', () => ({ loadUnifiedWork: h.unified }));

import router from '../project-schedule-of-events';
import { ProgramReadAccessError } from '../../services/c2c/current-program-access';
import { requestDb } from '../../db/requestDb';

const PROGRAM = 'D979E567-4622-46F1-8CB7-8BF434227F25';
const OTHER_PROGRAM = '11111111-1111-4111-8111-111111111111';
const actor = { userId: 41, role: 'member' };
const q = { query: h.query };
const context = { actorUserId: 41, executor: q };
const view = { plan: null, milestones: [], goals: [], revisions: [], health: {} };
const work = { items: [], summary: { total: 0 }, sources: {} };
const calls = [h.get, h.generate, h.amend, h.review, h.reset, h.unified];
const cases = [
  { name: 'schedule read', method: 'get', suffix: '/schedule-of-events', service: h.get, body: {} },
  { name: 'generation', method: 'post', suffix: '/schedule-of-events/generate', service: h.generate, body: { reason: 'Reviewed the revised plan.' } },
  { name: 'amendment', method: 'post', suffix: '/schedule-of-events/amend', service: h.amend, body: { milestone_key: 'IND_SUBMISSION', note: 'Reviewed a new date.' } },
  { name: 'health review', method: 'post', suffix: '/schedule-of-events/review', service: h.review, body: { apply: true } },
  { name: 'goal reset', method: 'post', suffix: '/schedule-of-events/goals/reset', service: h.reset, body: { goals: [{ title: 'Submit the reviewed package' }], rationale: 'Updated sponsor target.' } },
  { name: 'unified work', method: 'get', suffix: '/unified-work', service: h.unified, body: {} },
] as const;
type Caller = { organizationId?: unknown; userId?: unknown; dbClient?: unknown; user?: unknown; tenantContext?: unknown };
const received: Request[] = [];
function app(caller: Caller = {}) {
  const a = express(); a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, {
      tenantId: Object.hasOwn(caller, 'organizationId') ? caller.organizationId : 7,
      userId: Object.hasOwn(caller, 'userId') ? caller.userId : 41,
      user: caller.user ?? { role: 'admin' }, // cached role never replaces current admission
      dbClient: Object.hasOwn(caller, 'dbClient') ? caller.dbClient : q,
      ...(Object.hasOwn(caller, 'tenantContext') ? { tenantContext: caller.tenantContext } : {}),
    });
    received.push(req); next();
  });
  a.use('/api/concept2cure', router); return a;
}
function send(action: typeof cases[number], caller: Caller = {}, id = '12', body: unknown = action.body) {
  const target = request(app(caller)); const url = `/api/concept2cure/projects/${id}${action.suffix}`;
  return action.method === 'get' ? target.get(url) : target.post(url).send(body as object);
}
function noProtectedWork() { for (const service of calls) expect(service).not.toHaveBeenCalled(); }
beforeEach(() => {
  for (const mock of Object.values(h)) mock.mockReset(); received.length = 0;
  h.query.mockResolvedValue({ rows: [{ type: 'IND', metadata: {} }] });
  h.globalQuery.mockResolvedValue({ rows: [{ type: 'IND', metadata: {} }] });
  h.anchor.mockResolvedValue(11);
  h.actor.mockResolvedValue(actor); h.access.mockResolvedValue(true);
  h.program.mockImplementation(async (_executor, input) => ({ actor, programId: input.programId.toLowerCase(), projectId: 11, clientWorkspaceId: null }));
  h.get.mockResolvedValue(view); h.generate.mockResolvedValue(view);
  h.amend.mockResolvedValue({ changed: true }); h.review.mockResolvedValue({ assessed: true }); h.reset.mockResolvedValue({ reset: true });
  h.unified.mockResolvedValue(work);
});

describe('current schedule caller admission and executor forwarding', () => {
  it.each(cases)('passes the server actor and request executor for $name', async action => {
    const res = await send(action);
    expect(res.status).toBe(200);
    expect(h.actor).toHaveBeenCalledWith(q, { organizationId: 7, userId: 41 });
    expect(h.access).toHaveBeenCalledWith(7, actor, 12, q);
    expect(h.globalQuery).not.toHaveBeenCalled(); expect(h.anchor).not.toHaveBeenCalled();
    expect(h.query).toHaveBeenCalledWith(expect.any(String), [12, 7]);
    if (action.service === h.unified) expect(h.unified).toHaveBeenCalledExactlyOnceWith({ organizationId: 7, projectId: 12 }, requestDb(received[0]));
    else if (action.service === h.get) expect(h.get).toHaveBeenCalledExactlyOnceWith(7, 12, context);
    else {
      expect(action.service).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ orgId: 7, projectId: 12, triggeredBy: 'user' }), context);
      if (action.service !== h.generate) expect(h.get).toHaveBeenCalledExactlyOnceWith(7, 12, context);
    }
  });

  it('uses the numeric session fallback when upstream supplies req.user.id', async () => {
    const res = await send(cases[0], { userId: undefined, user: { id: '41', role: 'admin' } });
    expect(res.status).toBe(200); expect(h.actor).toHaveBeenCalledWith(q, { organizationId: 7, userId: 41 });
    expect(h.get).toHaveBeenCalledExactlyOnceWith(7, 12, context);
  });
  it('uses the authoritative exact-digit tenant organization over a conflicting legacy tenantId', async () => {
    const res = await send(cases[0], { organizationId: 99, tenantContext: { organizationId: '7' } });
    expect(res.status).toBe(200); expect(h.actor).toHaveBeenCalledWith(q, { organizationId: 7, userId: 41 });
    expect(h.get).toHaveBeenCalledExactlyOnceWith(7, 12, context);
  });
  it('retains the tenantId fallback when tenantContext has no organizationId property', async () => {
    const res = await send(cases[0], { tenantContext: {} });
    expect(res.status).toBe(200); expect(h.get).toHaveBeenCalledExactlyOnceWith(7, 12, context);
  });
  it.each([null, undefined])('refuses authoritative organizationId=%j instead of falling back to tenantId', async organizationId => {
    const res = await send(cases[0], { tenantContext: { organizationId } });
    expect(res.status).toBe(403); noProtectedWork(); expect(h.query).not.toHaveBeenCalled();
    expect(h.actor).not.toHaveBeenCalled(); expect(h.globalQuery).not.toHaveBeenCalled();
  });

  it.each(cases)('never falls back to the global pool for $name without a request executor', async action => {
    const res = await send(action, { dbClient: undefined });
    expect(res.status).toBe(500); expect(res.body.error).toBe('INTERNAL_ERROR');
    noProtectedWork(); expect(h.globalQuery).not.toHaveBeenCalled();
  });
  it.each([{}, { query: 'not callable' }])('refuses malformed request executor %j', async dbClient => {
    const res = await send(cases[0], { dbClient });
    expect(res.status).toBe(500); noProtectedWork(); expect(h.globalQuery).not.toHaveBeenCalled();
  });

  it.each([undefined, null, 0, -1, 1.5, '41junk', 2_147_483_648, Number.MAX_SAFE_INTEGER + 1])('refuses invalid governed actor %j despite a cached admin role', async userId => {
    const res = await send(cases[1], { userId });
    expect(res.status).toBe(403); noProtectedWork(); expect(h.globalQuery).not.toHaveBeenCalled();
  });
  it.each([0, -1, 7.5, '7junk', '7.5', 2_147_483_648, Number.MAX_SAFE_INTEGER + 1])('does not truncate invalid organization context %j', async organizationId => {
    const res = await send(cases[0], { organizationId });
    expect([400, 403]).toContain(res.status); noProtectedWork(); expect(h.globalQuery).not.toHaveBeenCalled();
  });
  it('does not hide an invalid authoritative tenant context behind a valid tenantId', async () => {
    const res = await send(cases[0], { tenantContext: { organizationId: '7junk' } });
    expect([400, 403]).toContain(res.status); noProtectedWork();
  });
  it.each(['0', 'proj_0', '2147483648', '9007199254740992', 'proj_9007199254740992', '12abc', '12.5', '-12'])('refuses invalid project identity %s before admission or work', async id => {
    const res = await send(cases[0], {}, id);
    expect(res.status).toBe(400); noProtectedWork();
    expect(h.query).not.toHaveBeenCalled(); expect(h.globalQuery).not.toHaveBeenCalled();
  });

  it.each(cases)('refuses retired current membership before $name, regardless of cached role', async action => {
    h.actor.mockRejectedValue(new ProgramReadAccessError(403, 'PROJECT_ACTOR_ACCESS_DENIED', 'Current membership is required.'));
    h.program.mockRejectedValue(new ProgramReadAccessError(403, 'PROJECT_ACTOR_ACCESS_DENIED', 'Current membership is required.'));
    const res = await send(action);
    expect(res.status).toBe(403); expect(res.body.code).toBe('PROJECT_ACTOR_ACCESS_DENIED'); noProtectedWork();
    expect(h.query).not.toHaveBeenCalled(); expect(h.globalQuery).not.toHaveBeenCalled();
  });
  it.each(cases)('refuses current private-project denial before $name', async action => {
    h.access.mockResolvedValue(false);
    const res = await send(action);
    expect(res.status).toBe(403); noProtectedWork();
    expect(h.query).not.toHaveBeenCalled(); expect(h.globalQuery).not.toHaveBeenCalled();
  });
  it('refuses a canonical actor result belonging to a different request identity', async () => {
    h.actor.mockResolvedValue({ userId: 42, role: 'admin' });
    const res = await send(cases[0]); expect(res.status).toBe(403); noProtectedWork();
  });
  it('keeps unavailable current admission distinct from absent schedule data', async () => {
    h.actor.mockRejectedValue(new ProgramReadAccessError(503, 'PROJECT_ACCESS_UNAVAILABLE', 'Current project access could not be verified.'));
    const res = await send(cases[0]); expect(res.status).toBe(503);
    expect(res.body.code).toBe('PROJECT_ACCESS_UNAVAILABLE'); noProtectedWork();
  });
  it('does not convert a failed sharing read into an empty or denied schedule', async () => {
    h.access.mockRejectedValue(new Error('private sharing lookup lost connection'));
    const res = await send(cases[0]); expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain('private sharing lookup'); noProtectedWork();
  });
});

describe('program UUID admission reuses the canonical unique anchor scope', () => {
  it.each([cases[0], cases[1], cases[5]])('passes the exact request executor and normalized UUID for $name', async action => {
    const res = await send(action, {}, PROGRAM); expect(res.status).toBe(200);
    expect(h.program).toHaveBeenCalledWith(q, { organizationId: 7, userId: 41, programId: PROGRAM.toLowerCase() });
    expect(h.anchor).not.toHaveBeenCalled(); expect(h.globalQuery).not.toHaveBeenCalled();
    if (action.service === h.get) expect(h.get).toHaveBeenCalledExactlyOnceWith(7, 11, context);
    else if (action.service === h.unified) expect(h.unified).toHaveBeenCalledExactlyOnceWith({ organizationId: 7, projectId: 11 }, requestDb(received[0]));
    else expect(h.generate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ orgId: 7, projectId: 11 }), context);
  });
  it.each(['missing', 'ambiguous'])('maps a %s anchor to generic PROGRAM_UNANCHORED without using the lowest row', async state => {
    h.program.mockRejectedValue(new ProgramReadAccessError(409, 'PROJECT_ANCHOR_UNRESOLVED', `PRIVATE-ANCHOR-721 ${state}`));
    const res = await send(cases[0], {}, PROGRAM);
    expect([404, 409]).toContain(res.status); expect(res.body.code).toBe('PROGRAM_UNANCHORED');
    expect(JSON.stringify(res.body)).not.toContain('PRIVATE-ANCHOR-721'); noProtectedWork(); expect(h.anchor).not.toHaveBeenCalled();
  });
  it.each([403, 404, 503] as const)('preserves a canonical UUID refusal status %s', async status => {
    h.program.mockRejectedValue(new ProgramReadAccessError(status, 'PROJECT_SCOPE_REFUSED', 'Current project access was refused.'));
    const res = await send(cases[0], {}, PROGRAM); expect(res.status).toBe(status);
    expect(res.body.code).toBe('PROJECT_SCOPE_REFUSED'); noProtectedWork();
  });
  it.each([
    { actor: { userId: 42, role: 'admin' }, programId: PROGRAM.toLowerCase(), projectId: 11 },
    { actor, programId: OTHER_PROGRAM, projectId: 11 },
    { actor, programId: PROGRAM.toLowerCase(), projectId: 0 },
    { actor, programId: PROGRAM.toLowerCase(), projectId: Number.MAX_SAFE_INTEGER + 1 },
  ])('refuses a mismatched or invalid canonical UUID tuple %#', async scope => {
    h.program.mockResolvedValue(scope);
    const res = await send(cases[0], {}, PROGRAM); expect([403, 503]).toContain(res.status); noProtectedWork();
  });
});

describe('browser input supplies schedule intent, never execution authority', () => {
  it.each(cases.filter(action => action.method === 'post'))('ignores payload actor/executor/job authority for $name', async action => {
    const res = await send(action, {}, '12', { ...action.body, organizationId: 99, orgId: 99, projectId: 99,
      userId: 99, actorUserId: 99, executor: { query: 'untrusted' }, sqlClient: { query: 'untrusted' }, triggeredBy: 'job', createdByAna: true, system: true });
    expect(res.status).toBe(200);
    expect(action.service).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ orgId: 7, projectId: 12, triggeredBy: 'user' }), context);
    const input = action.service.mock.calls[0][0]; expect(input).not.toHaveProperty('actorUserId'); expect(input).not.toHaveProperty('executor');
  });
  it('cannot supply a missing session actor or request executor through the body', async () => {
    const res = await send(cases[1], { userId: undefined }, '12', { actorUserId: 41, executor: q, triggeredBy: 'job' });
    expect(res.status).toBe(403); noProtectedWork();
  });
  it.each(cases.filter(action => action.method === 'post'))('preserves the service edit refusal after read admission for $name', async action => {
    action.service.mockRejectedValueOnce(new ProgramReadAccessError(403, 'PROJECT_WRITE_ACCESS_DENIED', 'Current permissions do not permit a schedule change.'));
    const res = await send(action);
    expect(res.status).toBe(403); expect(res.body.code).toBe('PROJECT_WRITE_ACCESS_DENIED');
    expect(h.get).not.toHaveBeenCalled();
  });
  it.each([
    { status: 409 as const, code: 'PROJECT_NOT_ACTIVE' },
    { status: 503 as const, code: 'PROJECT_ACCESS_UNAVAILABLE' },
  ])('preserves service refusal $code without reading a success schedule', async refusal => {
    h.generate.mockRejectedValueOnce(new ProgramReadAccessError(refusal.status, refusal.code, 'The schedule change could not be admitted.'));
    const res = await send(cases[1]); expect(res.status).toBe(refusal.status); expect(res.body.code).toBe(refusal.code);
    expect(h.get).not.toHaveBeenCalled();
  });
  it.each(['actor', 'private access'] as const)('refuses composed unified-work prose after %s is revoked during loading', async changed => {
    h.unified.mockImplementationOnce(async () => {
      if (changed === 'actor') h.actor.mockRejectedValue(new ProgramReadAccessError(403, 'PROJECT_ACTOR_ACCESS_DENIED', 'Membership ended.'));
      else h.access.mockResolvedValue(false);
      return { ...work, items: [{ title: 'PRIVATE-WORK-NOTE' }] };
    });
    const res = await send(cases[5]); expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain('PRIVATE-WORK-NOTE'); expect(h.unified).toHaveBeenCalledOnce();
  });
  it('does not expose an earlier unified-work result after the unique program anchor changes', async () => {
    h.unified.mockImplementationOnce(async () => {
      h.program.mockResolvedValue({ actor, programId: PROGRAM.toLowerCase(), projectId: 12, clientWorkspaceId: null });
      return { ...work, items: [{ title: 'PRIVATE-EARLIER-ANCHOR' }] };
    });
    const res = await send(cases[5], {}, PROGRAM); expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain('PRIVATE-EARLIER-ANCHOR'); expect(h.program).toHaveBeenCalledTimes(2);
    expect(h.unified).toHaveBeenCalledExactlyOnceWith({ organizationId: 7, projectId: 11 }, requestDb(received[0]));
  });
});
