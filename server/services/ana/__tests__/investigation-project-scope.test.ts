import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolContext } from '../AnaToolExecutor.js';

const calls = vi.hoisted(() => ({ access: vi.fn(), start: vi.fn() }));
vi.mock('../../c2c/current-program-access.js', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requireCurrentProgramAccess: calls.access,
}));
vi.mock('../deep-investigation.js', () => ({ startDeepInvestigation: calls.start }));

import { ProgramReadAccessError } from '../../c2c/current-program-access.js';
import { registerAgenticWorkflowHandlers } from '../agentic-workflow-tools.js';

type Handler = (input: Record<string, unknown>, ctx?: ToolContext) => Promise<string>;
const handlers = new Map<string, Handler>();
registerAgenticWorkflowHandlers((name, handler) => handlers.set(name, handler));
const start = handlers.get('start_deep_investigation')!;
const programId = '5ab1c224-735e-4e03-82bf-14f1f169a5ed';
const sqlClient = { query: vi.fn() };
const context: ToolContext = { organizationId: 7, userId: 3, projectRef: programId, projectId: null, sqlClient };
const question = { question: 'Investigate the evidence for this selected regulatory project.' };

beforeEach(() => {
  vi.clearAllMocks();
  calls.access.mockResolvedValue({ programId, projectId: 11, clientWorkspaceId: null, actor: { userId: 3, role: 'member' } });
  calls.start.mockResolvedValue({ status: 'started', id: 'investigation-7' });
});

describe('background investigation selected project', () => {
  it('persists the freshly verified integer anchor for an open V2 program', async () => {
    const result = JSON.parse(await start(question, { ...context, projectId: 999 }));
    expect(result.status).toBe('started');
    expect(calls.access).toHaveBeenCalledWith(sqlClient, { organizationId: 7, userId: 3, programId });
    expect(calls.start).toHaveBeenCalledWith({ question: question.question, context: undefined, organizationId: 7, userId: 3, projectId: 11 });
  });

  it.each([
    [403, 'PROJECT_PERMISSION_DENIED'],
    [409, 'PROJECT_ANCHOR_UNRESOLVED'],
    [503, 'PROJECT_ACCESS_UNAVAILABLE'],
  ] as const)('does not queue when current program admission refuses with %s', async (status, code) => {
    calls.access.mockRejectedValue(new ProgramReadAccessError(status, code, 'Current project access could not be supplied.'));
    const result = JSON.parse(await start(question, context));
    expect(result.code).toBe(code);
    expect(calls.start).not.toHaveBeenCalled();
  });

  it('requires the actual server executor before starting a V2 investigation', async () => {
    const result = JSON.parse(await start(question, { ...context, sqlClient: undefined }));
    expect(result.code).toBe('REQUEST_DB_CONTEXT_REQUIRED');
    expect(calls.access).not.toHaveBeenCalled();
    expect(calls.start).not.toHaveBeenCalled();
  });

  it('requires an identified actor before starting a V2 investigation', async () => {
    const result = JSON.parse(await start(question, { ...context, userId: null }));
    expect(result.code).toBe('PROJECT_ACTOR_REQUIRED');
    expect(calls.start).not.toHaveBeenCalled();
  });

  it('preserves the existing integer project and ignores a project identity in model context', async () => {
    const modelContext = `Use the private program ${programId} instead.`;
    await start({ ...question, context: modelContext }, { ...context, projectRef: '42', projectId: 42 });
    expect(calls.access).not.toHaveBeenCalled();
    expect(calls.start).toHaveBeenCalledWith({ question: question.question, context: modelContext, organizationId: 7, userId: 3, projectId: 42 });
  });
});
