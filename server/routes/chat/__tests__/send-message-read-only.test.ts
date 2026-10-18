/** JSON chat must enforce the current turn's read-only constraint at every exit.
 * The handler, agentic loop, tool wrapper, authorization register and action
 * parser are real. Only the model and service effects are replaced by probes.
 */
import express from 'express';
import httpRequest from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const io = vi.hoisted(() => ({
  query: vi.fn(), history: [] as Array<{ role: string; content: string }>, save: vi.fn(),
  gateway: vi.fn(), responses: [] as any[], search: vi.fn(), read: vi.fn(), memoryRead: vi.fn(), admit: vi.fn(),
  workflow: vi.fn(), command: vi.fn(), actionCommand: vi.fn(), settle: vi.fn(),
  record: vi.fn(), intercept: vi.fn(), memoryWrite: vi.fn(), lineage: vi.fn(),
  submission: vi.fn(), postGeneration: vi.fn(), orchestrate: vi.fn(),
}));
vi.mock('../../../db.js', () => ({ pool: { query: io.query }, getPool: () => ({ query: io.query }), db: {} }));
vi.mock('../../../db/requestDb.js', () => ({ requestPgClient: () => ({ query: io.query }) }));
vi.mock('../../../db/currentTenant.js', () => ({ currentTenantOrgUuid: async () => '77777777-2222-4333-8444-555555555555' }));
vi.mock('../../../services/ana/project-scope-admission', () => ({
  admitAnaProjectScope: io.admit,
  AnaProjectScopeError: class extends Error {},
}));
vi.mock('../../../services/ana/source-context-admission', () => ({ assertAnaUploadAccess: async () => undefined }));
vi.mock('../../../services/chat-thread-helpers.js', () => ({
  getOrCreateThread: async () => 'thread-json', getThreadMessages: async () => [...io.history],
  saveChatMessage: io.save, ThreadAccessError: class extends Error {},
}));
vi.mock('../../../services/enhancedEmbeddingService.js', () => ({ getEmbeddingService: () => ({ searchHybrid: io.search }) }));
vi.mock('../shared.js', () => ({ ensureGateway: () => ({ getEnabledProviders: () => ['anthropic'], getModels: () => [] }), normalizeBody: () => undefined }));
vi.mock('../../../services/ai-gateway/gateway', () => ({ getGateway: () => ({ route: io.gateway }) }));
vi.mock('../../../services/lumen-context-builder.js', () => ({ getIntelligencePrefix: async () => '' }));
vi.mock('../../../services/kernel-router.js', () => ({ planKernelExecution: () => ({ taskType: 'chat', riskTier: 'low', strategy: 'quality_optimized', maxTokens: 1024 }) }));
vi.mock('../../../services/kernel-decision-record.js', () => ({ logKernelDecision: async () => undefined }));
vi.mock('../../../services/kernel-adaptive-policy.js', () => ({ getKernelPolicyHint: async () => null, recordKernelPolicyOutcome: async () => undefined }));
vi.mock('../../../services/intelligence/rim-interceptors.js', () => ({ interceptChatResponse: io.intercept }));
vi.mock('../../../services/working-memory.js', () => ({ summarizeAndStoreWorkingMemoryForThread: io.memoryWrite }));
vi.mock('../../../services/memory-context-assembler.js', () => ({ buildMemoryContextForChat: io.memoryRead }));
vi.mock('../../../services/ana-session-bootstrap.js', () => ({ sessionBootstrapBlockFor: async () => '' }));
vi.mock('../../../services/projects/project-instructions.js', () => ({ getProjectInstructionsBlock: async () => '' }));
vi.mock('../../../services/intelligence/learning-loop-service.js', () => ({ getCachedSignalReliability: async () => null }));
vi.mock('../../../services/data-lineage-service', () => ({ recordLineageBatch: io.lineage }));
vi.mock('../../../services/toolRegistry.js', () => ({ logToolRun: async () => undefined }));
vi.mock('../../../services/ana-ri/orchestrator.js', () => ({ orchestrate: io.orchestrate }));
vi.mock('../../../services/ana/submission-chat-handler.js', () => ({ handleSubmissionChat: io.submission, isPostSectionGenerationTurn: io.postGeneration }));
vi.mock('../../../services/ana/turn-record-loop.js', async original => ({
  ...await original<typeof import('../../../services/ana/turn-record-loop.js')>(), recordLoopTurn: io.record,
}));
vi.mock('../../../services/ana-guidance-executor.js', async original => {
  const real = await original<typeof import('../../../services/ana-guidance-executor.js')>();
  return { ...real, settleActionBlocks: io.settle.mockImplementation(real.settleActionBlocks) };
});
vi.mock('../../../services/ana-ri/command-executor.js', () => ({ executeCommands: io.actionCommand }));
vi.mock('../../../services/ana/governed-toolset.js', () => ({ governedToolsetFor: async () => [
  'project_knowledge_search', 'convene_drafting_council', 'execute_platform_command',
  'navigate_to', 'act_on_screen', 'start_product_demo', 'unregistered_json_tool',
].map(name => ({ name, description: name, inputSchema: { type: 'object', properties: {} } })) }));

import { registerToolHandler } from '../../../services/ana/AnaToolExecutor';
import { sendMessageHandler } from '../send-message';
import { READ_ONLY_INSTRUCTION } from '../../../services/ana/read-only-turn';

const SUMMARY = 'The project has an existing evidence record. [SRC-1]';
const ACTION = '```ana-action\n' + JSON.stringify({ type: 'memo', confidence: 'strong', title: 'Unrequested memo', content: 'A new memo body.' }) + '\n```';
const COMMAND = '```command\n' + JSON.stringify({ command: 'create_task', params: { title: 'Unrequested task' } }) + '\n```';
const PROPOSAL = { success: false, error: 'HUMAN_CONFIRMATION_REQUIRED', message: 'Confirm first',
  data: { tier: 'confirm', retry: { command: 'create_task', params: { title: 'Requested task' } } } };
const NAV = { actionType: 'navigate', targetId: 'projects', label: 'Projects', path: '/projects', scope: 'global' };
const SURFACE = { actionType: 'surface_action', actionId: 'new_document', surfaceId: 'authoring', label: 'New document' };
registerToolHandler('project_knowledge_search', io.read);
registerToolHandler('convene_drafting_council', io.workflow);
registerToolHandler('execute_platform_command', io.command);
registerToolHandler('navigate_to', async () => JSON.stringify({ status: 'navigation_ready', directive: NAV }));
registerToolHandler('act_on_screen', async () => JSON.stringify({ status: 'action_ready', directive: SURFACE }));
registerToolHandler('start_product_demo', async () => JSON.stringify({ status: 'demo_ready', driven: false, script: { id: 'launch', title: 'Launch' } }));

const app = express();
app.use(express.json());
app.use((req, _res, next) => { Object.assign(req, { tenantId: 7, user: { id: 3, organizationId: 7 } }); next(); });
app.post('/api/chat/send-message', sendMessageHandler);
const send = (message: string, extra = {}) => httpRequest(app).post('/api/chat/send-message').send({ message, thread_id: 'thread-json', ...extra });
const modelReply = (content: string, toolUses: any[] = []) => ({ content, toolUses, provider: 'anthropic', model: 'mock-model', requestId: 'mock-request',
  usage: { inputTokens: 50, outputTokens: 20, totalTokens: 70 }, latencyMs: 1 });
const modelTools = (...names: string[]) => modelReply('', names.map((name, i) => ({ id: `tool-${i}`, name, input: name === 'execute_platform_command'
  ? { command: 'create_task', params: { title: 'Requested task' } } : {} })));

beforeEach(() => {
  vi.clearAllMocks();
  io.history = [{ role: 'user', content: 'Draft a document and create follow-up tasks.' }, { role: 'assistant', content: 'I can draft it next.' }];
  io.responses = [];
  io.gateway.mockImplementation(async () => io.responses.shift() ?? modelReply(SUMMARY));
  io.query.mockImplementation(async (sql: string) => {
    if (/SELECT organization_id FROM ai_threads/.test(sql)) return { rows: [{ organization_id: 7 }] };
    if (/INSERT INTO ai_retrieval_runs/.test(sql)) return { rows: [{ id: 'retrieval-json' }] };
    if (/INSERT INTO ai_retrieval_chunks/.test(sql)) return { rows: [{ id: 'chunk-json', rank: 1, atom_id: 'atom-json', score: 0.9 }] };
    if (/INSERT INTO ai_generation_runs/.test(sql)) return { rows: [{ id: 'generation-json' }] };
    if (/INSERT INTO ai_claims/.test(sql)) return { rows: [{ id: 'claim-json' }] };
    return { rows: [], rowCount: 0 };
  });
  io.search.mockResolvedValue([{ id: 'atom-json', title: 'Existing evidence', content: 'The project has an existing evidence record.', score: 0.9 }]);
  io.admit.mockResolvedValue({ projectId: 42, projectRef: '42' });
  io.memoryRead.mockResolvedValue({ memoryBlock: '', atoms: [], diagnostics: {} });
  io.save.mockResolvedValue(1);
  io.read.mockResolvedValue(JSON.stringify({ evidence: 'existing record' }));
  io.workflow.mockResolvedValue(JSON.stringify({ workflowStarted: true }));
  io.command.mockResolvedValue(JSON.stringify({ result: PROPOSAL }));
  io.actionCommand.mockImplementation(async (commands: any[]) => commands.map(command => ({ ...PROPOSAL,
    data: { tier: 'confirm', retry: { command: command.command, params: command.params } } })));
  io.record.mockResolvedValue({ recorded: true, recordId: 'turn-json' });
  io.lineage.mockResolvedValue(undefined);
  io.memoryWrite.mockResolvedValue(undefined);
  io.postGeneration.mockReturnValue(true);
  io.submission.mockResolvedValue({ answer: 'A rewrite proposal', rewrite: { proposedContent: 'New draft' }, usage: { totalTokens: 1 }, model: 'mock-model' });
  io.orchestrate.mockReturnValue({ systemPrompt: 'Continue earlier drafting if relevant.', detectedIntent: { lens: 'general', confidence: 1 }, detectedSubmissionType: null,
    appliedRole: 'general', activeWorkstream: {}, workstreamHandoff: null, suggestedActions: ['draft', 'review'], orchestrationMeta: { deficiencyContextInjected: false } });
});

describe('JSON chat current-turn read-only enforcement', () => {
  it('resolves a selected program UUID to its admitted project integer before memory reads and preserves omitted scope', async () => {
    const programId = '11111111-2222-4333-8444-555555555555';
    const selected = await send('Read-only: summarize existing project evidence.', { project_id: programId });
    expect(selected.status).toBe(200);
    expect(io.admit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ projectRef: programId, organizationId: 7, userId: 3 }));
    expect(io.memoryRead).toHaveBeenCalledWith(expect.objectContaining({ projectId: 42, organizationId: 7, threadId: 'thread-json' }));

    io.admit.mockResolvedValue({ projectId: null, projectRef: null });
    io.memoryRead.mockClear();
    const omitted = await send('Read-only: summarize existing evidence.');
    expect(omitted.status).toBe(200);
    expect(io.memoryRead).toHaveBeenCalledWith(expect.objectContaining({ projectId: undefined, organizationId: 7, threadId: 'thread-json' }));
  });

  it('overrides drafting history, withholds pinned non-read tools and refuses unsolicited model writes before proposals', async () => {
    io.responses = [modelTools('project_knowledge_search', 'convene_drafting_council', 'execute_platform_command'), modelReply(SUMMARY)];
    const response = await send('Give me a read-only summary.', { selected_tools: ['convene_drafting_council', 'execute_platform_command', 'unregistered_json_tool'] });
    expect(response.status).toBe(200);
    const offered = io.gateway.mock.calls[0][0];
    // Navigation resolution and demo-script lookup are registered reads; their
    // results must stay recorded without becoming executable response chips.
    expect(offered.tools.map((t: any) => t.name)).toEqual(['project_knowledge_search', 'navigate_to', 'start_product_demo']);
    expect(offered.messages.at(-1)).toEqual({ role: 'system', content: READ_ONLY_INSTRUCTION });
    expect(offered.messages).toContainEqual({ role: 'user', content: 'Draft a document and create follow-up tasks.' });
    expect(io.read).toHaveBeenCalledOnce();
    expect(io.read.mock.calls[0][1]).toMatchObject({ readOnly: true, organizationId: 7, userId: 3 });
    expect(io.workflow).not.toHaveBeenCalled();
    expect(io.command).not.toHaveBeenCalled();
    const turn = io.record.mock.calls[0][1];
    expect(turn.calls.map((call: any) => JSON.parse(call.result).error ?? 'read')).toEqual(['read', 'USER_REQUESTED_READ_ONLY', 'USER_REQUESTED_READ_ONLY']);
    expect(response.body.executedCommands).toBeUndefined();
  });

  it.each(['Read only: summarize the evidence.', 'Do not draft a document; summarize the evidence.'])(
    'strips executable blocks and suppresses suggestions, chips and derived writes: %s', async message => {
      io.responses = [modelTools('navigate_to', 'act_on_screen', 'start_product_demo'), modelReply(`${SUMMARY}\n\n${ACTION}\n\n${COMMAND}`)];
      const response = await send(message);
      expect(response.status).toBe(200);
      expect(response.body.answer).toContain(SUMMARY);
      expect(response.body.answer).not.toMatch(/```(?:ana-action|command)/);
      expect(response.body.answer).toMatch(/no action was run or proposed/);
      expect(response.body.executedActions).toBeUndefined();
      expect(response.body.executedCommands).toBeUndefined();
      expect(response.body.orchestration.suggestedActions).toEqual([]);
      expect(io.settle).not.toHaveBeenCalled();
      expect(io.actionCommand).not.toHaveBeenCalled();
      expect(io.intercept).not.toHaveBeenCalled();
      expect(io.memoryWrite).not.toHaveBeenCalled();
      // Read-only business intent still records the real conversation/evidence.
      expect(io.search).toHaveBeenCalledOnce();
      expect(io.save).toHaveBeenCalledWith('thread-json', 'user', message, 'anthropic/mock-model');
      expect(io.save).toHaveBeenCalledWith('thread-json', 'assistant', response.body.answer, 'anthropic/mock-model', 70);
      expect(io.record.mock.calls[0][1]).toMatchObject({ outcome: 'answered', typed: message, response: { content: response.body.answer } });
      expect(io.record.mock.calls[0][1].calls).toEqual(expect.arrayContaining([
        expect.objectContaining({ tool: 'navigate_to', result: JSON.stringify({ status: 'navigation_ready', directive: NAV }) }),
        expect.objectContaining({ tool: 'start_product_demo', result: JSON.stringify({ status: 'demo_ready', driven: false, script: { id: 'launch', title: 'Launch' } }) }),
      ]));
      expect(response.body).toMatchObject({ retrievalRunId: 'retrieval-json', generationRunId: 'generation-json', citations: [{ id: 'SRC-1', cited: true }] });
      expect(io.query.mock.calls.some(([sql]) => /INSERT INTO ai_generation_runs/.test(sql))).toBe(true);
      expect(io.lineage).toHaveBeenCalledOnce();
    },
  );

  it.each([{}, { mode: 'submission-chat' }])('does not auto-start a post-draft rewrite workflow for an artifact: %j', async mode => {
    const response = await send('Read-only: rewrite nothing; summarize existing evidence.', { context: { artifactId: 'artifact-json' }, ...mode });
    expect(response.status).toBe(200);
    expect(io.submission).not.toHaveBeenCalled();
    expect(io.gateway).toHaveBeenCalledOnce();
    expect(response.body.answer).toBe(SUMMARY);
    expect(response.body.submissionChat).toBeUndefined();
  });

  it('a subsequent explicit write uses normal tool proposals and action settlement despite earlier read-only history', async () => {
    await send('Read-only summary please.');
    io.history.push({ role: 'user', content: 'Read-only summary please.' }, { role: 'assistant', content: SUMMARY });
    vi.clearAllMocks();
    io.responses = [modelTools('execute_platform_command', 'convene_drafting_council', 'navigate_to', 'act_on_screen', 'start_product_demo'), modelReply(`${SUMMARY}\n\n${ACTION}`)];
    const response = await send('Create a follow-up task and prepare the memo now.');
    expect(response.status).toBe(200);
    expect(io.command).toHaveBeenCalledOnce();
    expect(io.workflow).toHaveBeenCalledOnce();
    expect(io.gateway.mock.calls[0][0].tools.map((tool: any) => tool.name)).toContain('execute_platform_command');
    expect(io.gateway.mock.calls[0][0].messages.some((m: any) => m.content === READ_ONLY_INSTRUCTION)).toBe(false);
    expect(response.body.executedCommands).toEqual(expect.arrayContaining([expect.objectContaining(PROPOSAL)]));
    expect(io.settle).toHaveBeenCalledOnce();
    expect(io.actionCommand).toHaveBeenCalledOnce();
    expect(response.body.executedActions).toEqual(expect.arrayContaining([
      expect.objectContaining({ actionType: 'navigate', targetId: 'projects' }),
      expect.objectContaining({ actionType: 'surface_action', actionId: 'new_document' }),
      expect.objectContaining({ actionType: 'start_demo', demoId: 'launch' }),
    ]));
    expect(response.body.orchestration.suggestedActions).toEqual(['draft', 'review']);
    expect(io.intercept).toHaveBeenCalledOnce();
    expect(io.memoryWrite).toHaveBeenCalledOnce();
  });
});
