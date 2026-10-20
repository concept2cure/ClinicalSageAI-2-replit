/** Registered schedule callers must carry the server actor/executor and never
 * replace current scope with model fields. Real policy is qualified separately. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
const H = vi.hoisted(() => ({
  admit: vi.fn(), generate: vi.fn(), amend: vi.fn(), review: vi.fn(), reset: vi.fn(),
  role: vi.fn(async (): Promise<string | null> => 'member'),
}));
vi.mock('../project-scope-admission', async original => ({
  ...await original<Record<string, unknown>>(), admitAnaProjectScope: H.admit,
}));
vi.mock('../../projects/schedule-of-events', () => ({
  generateProjectSchedule: H.generate, amendMilestone: H.amend,
  reviewScheduleHealth: H.review, resetProjectGoals: H.reset,
}));
vi.mock('../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole: H.role }));
vi.mock('../../part11/resolve-signer-role.js', () => ({ resolveSignerOrgRole: H.role }));
import { getToolHandler, type ToolContext } from '../AnaToolExecutor';
import { AnaProjectScopeError } from '../project-scope-admission';

const sqlClient = { query: vi.fn() };
const context: ToolContext = { organizationId: 3, userId: 7, projectId: 12, projectType: 'IND', sqlClient, humanConfirmed: true };
const input = { reason: 'The sponsor requested this schedule change.', milestone_key: 'kickoff',
  rationale: 'A sponsor-approved target change.', goals: [{ title: 'File the application' }] };
const tools = [
  ['generate_schedule_of_events', H.generate], ['amend_schedule_of_events', H.amend],
  ['review_schedule_of_events_health', H.review], ['reset_project_goals', H.reset],
] as const;
async function run(tool: string, ctx: ToolContext = context, extra = {}) {
  return JSON.parse(await getToolHandler(tool)!({ ...input, ...extra }, ctx));
}
beforeEach(() => {
  vi.clearAllMocks(); H.role.mockResolvedValue('member');
  H.admit.mockResolvedValue({ projectId: 12, programId: null, projectRef: '12' });
  H.generate.mockResolvedValue({ plan: { id: 8 }, milestones: [], goals: [], health: {} });
  H.amend.mockResolvedValue({ ok: true }); H.review.mockResolvedValue({ ok: true }); H.reset.mockResolvedValue({ ok: true });
});
describe('schedule registered caller current context', () => {
  it.each(tools)('%s forwards only trusted actor, project and executor', async (tool, service) => {
    const result = await run(tool, context, { userId: 99, actorUserId: 99, organizationId: 99, projectId: 99, sqlClient: {} });
    expect(result.error).toBeUndefined();
    expect(H.admit).toHaveBeenCalledWith(sqlClient, { organizationId: 3, userId: 7, projectId: 12, projectRef: undefined });
    expect(service).toHaveBeenCalledWith(expect.objectContaining({ orgId: 3, projectId: 12 }), { actorUserId: 7, executor: sqlClient });
  });
  it.each(tools)('%s refuses missing request executor before service entry', async (tool, service) => {
    const result = await run(tool, { ...context, sqlClient: undefined });
    expect(result.error).toBeTruthy(); expect(service).not.toHaveBeenCalled(); expect(H.admit).not.toHaveBeenCalled();
  });
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '7'])('does not coerce malformed actor %j into trusted authority', async userId => {
    const result = await run('generate_schedule_of_events', { ...context, userId } as ToolContext);
    expect(result.error).toBeTruthy(); expect(H.generate).not.toHaveBeenCalled(); expect(H.admit).not.toHaveBeenCalled();
  });
  it('reaches the verified program anchor when V2 supplies no numeric project', async () => {
    const projectRef = '5ab1c224-735e-4e03-82bf-14f1f169a5ed';
    H.admit.mockResolvedValue({ projectId: 28, programId: projectRef, projectRef });
    const result = await run('generate_schedule_of_events', { ...context, projectId: null, projectRef });
    expect(result.error).toBeUndefined();
    expect(H.admit).toHaveBeenCalledWith(sqlClient, { organizationId: 3, userId: 7, projectId: null, projectRef });
    expect(H.generate).toHaveBeenCalledWith(expect.objectContaining({ projectId: 28 }), { actorUserId: 7, executor: sqlClient });
  });
  it.each([403, 409, 503] as const)('refuses current canonical admission failure %s without invoking any domain action', async status => {
    H.admit.mockRejectedValue(new AnaProjectScopeError(status, 'ANA_PROJECT_ACCESS_DENIED', 'Current project access could not be supplied.'));
    const result = await run('generate_schedule_of_events');
    expect(result.code).toBe('ANA_PROJECT_ACCESS_DENIED'); expect(result.status).toBe(status);
    expect(H.generate).not.toHaveBeenCalled();
  });
  it('keeps the captured principal if mutable context changes while admission is pending', async () => {
    const ctx = { ...context };
    H.admit.mockImplementation(async () => { ctx.userId = 99; ctx.organizationId = 99; ctx.sqlClient = { query: vi.fn() }; return { projectId: 12, programId: null, projectRef: '12' }; });
    await run('generate_schedule_of_events', ctx);
    expect(H.generate).toHaveBeenCalledWith(expect.objectContaining({ orgId: 3, projectId: 12 }), { actorUserId: 7, executor: sqlClient });
  });
});
