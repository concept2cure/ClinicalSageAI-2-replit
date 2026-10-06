import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  query: vi.fn(), route: vi.fn(), persist: vi.fn(), save: vi.fn(), retrieve: vi.fn(),
  openThread: vi.fn(), memory: vi.fn(), readHistory: vi.fn(),
  history: [] as Array<{ role: 'user' | 'assistant'; content: string }>,
}));
vi.mock('../../../db/runtime.js', () => ({ getPool: () => ({ query: h.query }) }));
vi.mock('../../../routes/chat/shared.js', () => ({ ensureGateway: () => ({ getEnabledProviders: () => ['fixture'], route: h.route }) }));
vi.mock('../../ragRouter.js', () => ({ ragRouter: { retrieve: h.retrieve } }));
vi.mock('../../memory-context-assembler.js', () => ({ buildMemoryContextForChat: h.memory }));
vi.mock('../../projects/project-instructions.js', () => ({ getProjectInstructionsBlock: async () => '' }));
vi.mock('../../chat-thread-helpers.js', () => ({ getThreadMessages: h.readHistory, saveChatMessage: h.save, getOrCreateThread: h.openThread }));
vi.mock('../../../routes/chat/verifier.js', () => ({ verifyClaim: () => ({ flag: 'SUPPORTED' }) }));
vi.mock('../submission-chat-proposal-store.js', () => ({ persistRewriteProposal: h.persist, getActiveProposalForThreadArtifact: async () => null }));
vi.mock('../submission-chat-metrics.js', () => ({ emit: vi.fn(), countCitationMix: () => ({ supports: 0, contradicts: 0, gap: 0 }) }));
vi.mock('../../clinical-regulatory-evidence/retrieval-source-link.js', () => ({ resolveEvidenceSourceIdsByArtifact: async () => new Map() }));

import { buildSystemPrompt, buildStreamingSystemPrompt, handleSubmissionChat, type ArtifactRow } from '../submission-chat-handler.js';
import { handleSubmissionChatStream, type StreamEvent } from '../submission-chat-stream-handler.js';

const artifact: ArtifactRow = { id: 1, artifact_id: 'ART-1', project_id: 2, organization_id: 7, title: 'Clinical Overview', ctd_section: '2.5', type: 'document', category: 'clinical' };
const request = { artifactId: 'ART-1', threadId: 'thread-1', organizationId: 7, userId: 3, question: 'Rewrite this section for Japan.' };
const usage = { inputTokens: 30, outputTokens: 20, totalTokens: 50 };
const builders = [['buffered', buildSystemPrompt], ['streaming', buildStreamingSystemPrompt]] as const;

beforeEach(() => {
  vi.clearAllMocks(); h.history = [];
  h.openThread.mockResolvedValue('thread-1');
  h.readHistory.mockImplementation(async () => h.history);
  h.memory.mockResolvedValue({ memoryBlock: '' });
  h.save.mockImplementation(async (_thread: string, role: 'user' | 'assistant', content: string) => { h.history.push({ role, content }); });
  h.query.mockImplementation(async (sql: string) => ({ rows: sql.includes('FROM concept2cure_artifacts') ? [artifact] : [] }));
  h.retrieve.mockResolvedValue({ documents: [] });
  h.persist.mockResolvedValue({ id: 'proposal-1', contentHash: 'hash', expiresAt: new Date('2026-10-07') });
});

function reply(answer: string, rewrite: unknown = null) {
  h.route.mockResolvedValue({ content: JSON.stringify({ intent: 'rewrite', answer, citations: [], rewrite }), provider: 'fixture', model: 'fixture', usage });
}

function streamed(answer: string, rewrite = '') {
  h.route.mockImplementation(async (input: { onStream: (chunk: string) => void }) => {
    const text = `%%ANSWER%%${answer}${rewrite ? `%%REWRITE%%${rewrite}` : ''}%%STRUCTURE%%${JSON.stringify({ intent: 'rewrite', citations: [], rewriteMetadata: rewrite ? { sectionCode: '2.5', targetAgency: 'PMDA', rationale: 'Based on supplied results' } : null })}%%END%%`;
    // The real handler passes onStream; this fixture is provider output, never a live eval.
    for (let offset = 0; offset < text.length; offset += 7) input.onStream(text.slice(offset, offset + 7));
    return { content: text, provider: 'fixture', model: 'fixture', usage };
  });
}

describe('a clarification is not a rewrite proposal', () => {
  it.each(['Which intended use should this cover?', 'I cannot verify efficacy without the study results.'])('keeps a buffered answer-only response out of the proposal store: %s', async answer => {
    reply(answer); const result = await handleSubmissionChat(request);
    expect(result.answer).toBe(answer); expect(result.rewrite).toBeNull(); expect(h.persist).not.toHaveBeenCalled();
    expect(h.save).toHaveBeenCalledWith('thread-1', 'assistant', answer, 'fixture/fixture', 50);
  });
  it('preserves an explicit proposal and its scope', async () => {
    reply('The proposed text follows.', { sectionCode: '2.5', targetAgency: 'PMDA', proposedContent: 'The supplied study results are summarized here.', rationale: 'Supplied evidence' });
    const result = await handleSubmissionChat(request);
    expect(result.rewrite?.proposalId).toBe('proposal-1');
    expect(h.save).toHaveBeenCalledWith('thread-1', 'assistant', expect.stringContaining('The supplied study results are summarized here.'), 'fixture/fixture', 50);
    expect(h.persist).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 7, projectId: 2, proposedContent: 'The supplied study results are summarized here.' }));
  });
  it('keeps streamed questions in the answer channel without a proposal', async () => {
    streamed('Which intended use should this cover?'); const events: StreamEvent[] = [];
    await handleSubmissionChatStream(request, event => events.push(event));
    expect(events.some(e => e.type === 'delta' && e.channel === 'answer')).toBe(true);
    expect(events.some(e => e.type === 'rewrite' || e.type === 'proposal')).toBe(false);
    expect(h.persist).not.toHaveBeenCalled();
  });
});

describe('submission prompt IA boundaries', () => {
  it.each(builders)('%s permits clarification without inventing a rewrite or gap source', (_name, build) => {
    const prompt = build(artifact, [artifact], [], { intent: 'rewrite' });
    expect(prompt.includes('No retrieved passages is not proof')).toBe(true);
    expect(prompt.includes('Do not invent a gap citation')).toBe(true);
    expect(prompt.includes('ask the decisive question in the answer')).toBe(true);
    expect(prompt.includes('REQUIRED when intent="rewrite"')).toBe(false);
    expect(prompt.includes('THEN propose a "rewrite" object')).toBe(false);
    expect(prompt.includes('clarification-only')).toBe(true);
  });
  it.each(builders)('%s retains the ending of a long clarification answer and declares the omitted middle', (_name, build) => {
    const correction = 'Correction: Japan, not the United States; intended use is screening.';
    const prompt = build(artifact, [artifact], [], { history: [{ role: 'user', content: 'Context begins. ' + 'x'.repeat(2000) + correction }] });
    expect(prompt.includes(correction)).toBe(true);
    expect(prompt.includes('[Middle of this turn omitted')).toBe(true);
  });
  it('keeps the same correction in the gateway conversation turns', async () => {
    const correction = 'Correction: Japan; the population is adults only.';
    h.history = [{ role: 'user', content: 'x'.repeat(2500) + correction }, { role: 'assistant', content: 'Which specimen?' }];
    reply('Which specimen should this assay use?'); await handleSubmissionChat(request);
    const messages = h.route.mock.calls[0][0].messages;
    expect(messages.find((m: { role: string; content: string }) => m.role === 'user' && m.content.includes(correction))).toBeDefined();
  });
});


describe('streamed follow-up and proposal controls', () => {
  it('preserves an explicitly emitted rewrite and persists its body in history', async () => {
    streamed('The proposed text follows.', 'Explicit revised draft.'); const events: StreamEvent[] = [];
    await handleSubmissionChatStream(request, event => events.push(event));
    expect(events.some(e => e.type === 'rewrite' && e.rewrite.proposedContent === 'Explicit revised draft.')).toBe(true);
    expect(h.persist).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 7, proposedContent: 'Explicit revised draft.' }));
    expect(h.save).toHaveBeenCalledWith('thread-1', 'assistant', expect.stringContaining('Explicit revised draft.'), 'fixture/fixture', 50);
  });
  it('retains a long user correction in streaming model input', async () => {
    const correction = 'Correction: use serum, not plasma.';
    h.history = [{ role: 'user', content: 'x'.repeat(2500) + correction }];
    streamed('Which population?'); await handleSubmissionChatStream(request, () => {});
    expect(h.route.mock.calls[0][0].messages.some((m: { role: string; content: string }) => m.role === 'user' && m.content.includes(correction))).toBe(true);
  });
  it('a bare text fallback is an answer, never an inferred proposal', async () => {
    h.route.mockResolvedValue({ content: 'Please provide the intended use.', provider: 'fixture', model: 'fixture', usage });
    const result = await handleSubmissionChat(request);
    expect(result.answer).toBe('Please provide the intended use.'); expect(result.rewrite).toBeNull(); expect(h.persist).not.toHaveBeenCalled();
  });
});


describe('retrieval uncertainty reaches the model', () => {
  it.each(['buffered', 'streaming'])('%s distinguishes a failed search from a verified dossier gap', async mode => {
    h.retrieve.mockRejectedValue(new Error('fixture retrieval unavailable'));
    const scoped = { ...request, organizationUuid: '00000000-0000-4000-8000-000000000007' };
    if (mode === 'buffered') { reply('Please supply the study report.'); await handleSubmissionChat(scoped); }
    else { streamed('Please supply the study report.'); await handleSubmissionChatStream(scoped, () => {}); }
    const prompt = h.route.mock.calls[0][0].messages[0].content;
    expect(prompt.includes('Some retrieval was unavailable or not run')).toBe(true);
    expect(prompt.includes('No retrieved passages is not proof')).toBe(true);
    expect(h.persist).not.toHaveBeenCalled();
  });
  it.each(builders)('%s declares actually shortened evidence passages', (_name, build) => {
    const prompt = build(artifact, [artifact], [{ id: 'c1', title: 'Report', content: 'x'.repeat(1200), score: 0.9, artifactId: 'ART-1', sectionCode: '2.5', pageRef: '1' }]);
    expect(prompt.includes('Some retrieved passages were shortened')).toBe(true);
  });
});


describe('clarification round trips through real handlers', () => {
  it.each(['buffered', 'streaming'])('%s retains the question and supplied answer before creating an explicit proposal', async mode => {
    const question = 'Which intended use and specimen should this cover?';
    if (mode === 'buffered') { reply(question); await handleSubmissionChat(request); }
    else { streamed(question); await handleSubmissionChatStream(request, () => {}); }
    expect(h.persist).not.toHaveBeenCalled();
    const clarification = { ...request, question: 'Screening in adults, using serum.' };
    if (mode === 'buffered') {
      reply('Based on the supplied clarification.', { sectionCode: '2.5', targetAgency: 'PMDA', proposedContent: 'Explicit revised draft after clarification.', rationale: 'Supplied intended use' });
      await handleSubmissionChat(clarification);
    } else {
      streamed('Based on the supplied clarification.', 'Explicit revised draft after clarification.');
      await handleSubmissionChatStream(clarification, () => {});
    }
    const messages = h.route.mock.calls[1][0].messages;
    expect(messages.some((m: { role: string; content: string }) => m.role === 'assistant' && m.content === question)).toBe(true);
    expect(messages.some((m: { role: string; content: string }) => m.role === 'user' && m.content === clarification.question)).toBe(true);
    expect(h.persist).toHaveBeenCalledTimes(1);
    expect(h.persist).toHaveBeenCalledWith(expect.objectContaining({ proposedContent: 'Explicit revised draft after clarification.', organizationId: 7 }));
  });
  it.each(builders)('%s keeps contradictory retrieved sources distinct from a missing passage', (_name, build) => {
    const chunks = [
      { id: 'c1', title: 'Original report', content: 'The intended population is adults.', score: 0.9, artifactId: 'ART-1', sectionCode: '2.5', pageRef: '1' },
      { id: 'c2', title: 'Updated report', content: 'The intended population is pediatric.', score: 0.9, artifactId: 'ART-2', sectionCode: '2.5', pageRef: '2' },
    ];
    const prompt = build(artifact, [artifact], chunks, { intent: 'rewrite' });
    expect(prompt.includes('unresolved source conflicts block a defensible rewrite')).toBe(true);
    expect(prompt.includes('[SRC-1]')).toBe(true); expect(prompt.includes('[SRC-2]')).toBe(true);
    expect(prompt.includes('cite both')).toBe(true);
  });
});


describe('private clarification context belongs to the caller', () => {
  it.each(['buffered', 'streaming'])('%s refuses a colleague thread before history, memory, or a model call', async mode => {
    h.openThread.mockRejectedValue(Object.assign(new Error('fixture foreign thread'), { code: 'THREAD_FORBIDDEN' }));
    reply('not reached');
    if (mode === 'buffered') await expect(handleSubmissionChat(request)).rejects.toMatchObject({ code: 'THREAD_FORBIDDEN' });
    else {
      const events: StreamEvent[] = []; await handleSubmissionChatStream(request, event => events.push(event));
      expect(events).toContainEqual(expect.objectContaining({ type: 'error', code: 'THREAD_FORBIDDEN' }));
    }
    expect(h.readHistory).not.toHaveBeenCalled(); expect(h.memory).not.toHaveBeenCalled(); expect(h.route).not.toHaveBeenCalled(); expect(h.save).not.toHaveBeenCalled(); expect(h.persist).not.toHaveBeenCalled();
  });
  it.each(['buffered', 'streaming'])('%s uses only the caller-resolved ID for context and writes', async mode => {
    h.openThread.mockResolvedValue('caller-thread');
    if (mode === 'buffered') { reply('Which population?'); const result = await handleSubmissionChat(request); expect(result.threadId).toBe('caller-thread'); }
    else { streamed('Which population?'); await handleSubmissionChatStream(request, () => {}); }
    expect(h.openThread).toHaveBeenCalledWith('thread-1', 3, 'ana-submission', 7);
    expect(h.readHistory).toHaveBeenCalledWith('caller-thread');
    expect(h.memory).toHaveBeenCalledWith(expect.objectContaining({ threadId: 'caller-thread', organizationId: 7 }));
    expect(h.save).toHaveBeenCalledWith('caller-thread', 'user', request.question, 'fixture/fixture');
  });
  it.each(['buffered', 'streaming'])('%s fails closed when the caller identity is missing', async mode => {
    const anonymous = { ...request, userId: null };
    if (mode === 'buffered') await expect(handleSubmissionChat(anonymous)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    else { const events: StreamEvent[] = []; await handleSubmissionChatStream(anonymous, event => events.push(event)); expect(events).toContainEqual(expect.objectContaining({ type: 'error', code: 'AUTH_REQUIRED' })); }
    expect(h.readHistory).not.toHaveBeenCalled(); expect(h.memory).not.toHaveBeenCalled(); expect(h.route).not.toHaveBeenCalled(); expect(h.save).not.toHaveBeenCalled();
  });
});

it.each(['buffered', 'streaming'])('%s does not answer from a silently missing conversation after history failure', async mode => {
  h.readHistory.mockRejectedValue(new Error('fixture history storage unavailable'));
  if (mode === 'buffered') { reply('Not reached'); await expect(handleSubmissionChat(request)).rejects.toMatchObject({ code: 'HISTORY_UNAVAILABLE' }); }
  else { streamed('Not reached'); const events: StreamEvent[] = []; await handleSubmissionChatStream(request, event => events.push(event)); expect(events).toContainEqual(expect.objectContaining({ type: 'error', code: 'HISTORY_UNAVAILABLE' })); }
  expect(h.route).not.toHaveBeenCalled(); expect(h.persist).not.toHaveBeenCalled(); expect(h.save).not.toHaveBeenCalled();
});
