/**
 * The live stream's post-processing turns an `ana-action` block into a
 * proposal on `post_done`, where the sign-off prompt reads it — and writes
 * nothing (DP-08; P0-12 residual, 2026-10-01).
 *
 * Until this, a strong memo block in AnA's reply created a governed artifact
 * in the project before `post_done` was sent, and the turn reported it as an
 * executed action. The command partition never saw it. Now the block reaches
 * the client the way a gated ```command block does: as a
 * HUMAN_CONFIRMATION_REQUIRED result in `executedCommands`, which
 * extractPendingSignoffs (client/src/concept2cure/components/ana/useGovernedAction.ts)
 * renders as a confirm-tier prompt.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../services/chat-thread-helpers.js', () => ({ saveChatMessage: async () => 41 }));
vi.mock('../../../services/evidence/persist-provenance.js', () => ({ persistProvenance: async () => undefined }));
vi.mock('../../../services/working-memory.js', () => ({ summarizeAndStoreWorkingMemoryForThread: async () => undefined }));
vi.mock('../../../services/intelligence/learning-loop-service.js', () => ({ getCachedSignalReliability: async () => null }));
vi.mock('../../../services/intelligence/rim-interceptors.js', () => ({ interceptChatResponse: () => undefined }));
vi.mock('../../../services/ana/artifactVersionStore.js', () => ({ upsertDocumentArtifactVersion: async () => ({ created: false }) }));

const rbac = vi.hoisted(() => ({ hasRole: vi.fn(async () => true) }));
vi.mock('../../../services/roleBasedAccess', () => ({
  default: { hasRole: (...a: unknown[]) => (rbac.hasRole as any)(...a), getUserRoles: async () => [] },
}));
const writes = vi.hoisted(() => ({
  governed: vi.fn(async () => ({ persistenceStatus: 'persisted', artifactMutation: { artifactId: 501, isNew: true } })),
  transaction: vi.fn(async () => 9001),
}));
vi.mock('../../../services/governed-ana-execution.js', () => ({ executeGovernedAnaOperation: writes.governed }));
const poolStub = vi.hoisted(() => ({
  query: async () => ({ rows: [] as any[], rowCount: 0 }),
  connect: async () => {
    throw new Error('no transaction expected');
  },
}));
vi.mock('../../../db.js', () => ({ db: { transaction: writes.transaction }, pool: poolStub, getPool: () => poolStub }));

import { runStreamPostProcessing, type StreamPostProcessingContext } from '../post-processing';

const CONTENT = [
  '## Summary',
  'The drug substance stability package lacks the six-month accelerated data that ICH Q1A(R2) expects for the proposed retest period, so the shelf-life claim in 3.2.S.7 is not yet supported.',
  '## Evidence',
  '[KNOWN] Long-term data at 25C/60%RH cover 12 months for three primary batches. [MISSING] Accelerated 40C/75%RH data beyond 3 months.',
  '## Recommendation',
  'Complete the accelerated study on the three primary batches and revise the retest period justification before the pre-IND package is assembled.',
].join('\n');
const BLOCK =
  '```ana-action\n' +
  JSON.stringify({ type: 'memo', confidence: 'strong', title: 'Risk Memo: Accelerated Stability', content: CONTENT }) +
  '\n```';

function run(fullContent: string, over: Partial<StreamPostProcessingContext> = {}) {
  const events: any[] = [];
  const res = {
    write: (chunk: string) => {
      for (const line of String(chunk).split('\n')) if (line.startsWith('data: ')) events.push(JSON.parse(line.slice(6)));
      return true;
    },
    end: () => undefined,
    writableEnded: false,
  } as any;
  const c: StreamPostProcessingContext = {
    res,
    fullContent,
    persistenceFailed: false,
    streamProjectId: 5,
    orgId: 61,
    userId: 7,
    threadId: 'th_9',
    userName: 'Rita Ortiz',
    effectiveRole: 'regulatory_lead' as any,
    sectionCode: undefined,
    toolTrace: [],
    toolEvidenceCorpus: [],
    collectedProvenance: [],
    collectedDrafts: [],
    messages: [],
    model: 'm',
    provider: 'anthropic',
    enrichment: { sources: [] },
    ...over,
  };
  return runStreamPostProcessing(c).then(() => events.find((e) => e.type === 'post_done'));
}

beforeEach(() => {
  rbac.hasRole.mockResolvedValue(true);
  writes.governed.mockClear();
  writes.transaction.mockClear();
});

describe('an ana-action block on the live stream', () => {
  it('is a proposal on post_done, and nothing is written before a person confirms it', async () => {
    const done = await run(`The gap and what to do.\n\n${BLOCK}`);

    expect(writes.governed, 'the artifact was created on the model’s word').not.toHaveBeenCalled();
    expect(writes.transaction).not.toHaveBeenCalled();
    const proposals = (done.executedCommands ?? []).filter((r: any) => r.error === 'HUMAN_CONFIRMATION_REQUIRED');
    expect(proposals).toHaveLength(1);
    expect(proposals[0].data).toMatchObject({
      tier: 'confirm',
      retry: { command: 'create_artifact', params: { projectId: 5, title: 'Risk Memo: Accelerated Stability', content: CONTENT } },
    });
    // Nothing is reported as done.
    expect((done.executedActions ?? []).some((a: any) => a.executed === true)).toBe(false);
    expect(done.cleanedResponse).not.toContain('ana-action');
  });

  it('a reply with a command block and an action block carries both proposals', async () => {
    const cmd = '```command\n' + JSON.stringify({ command: 'create_task', params: { title: 'Run accelerated study' } }) + '\n```';
    const done = await run(`Two things.\n\n${BLOCK}\n\n${cmd}`);
    const commands = (done.executedCommands ?? []).map((r: any) => [r.error, r.data?.retry?.command]);
    expect(commands).toEqual(
      expect.arrayContaining([
        ['HUMAN_CONFIRMATION_REQUIRED', 'create_artifact'],
        ['HUMAN_CONFIRMATION_REQUIRED', 'create_task'],
      ]),
    );
    expect(writes.governed).not.toHaveBeenCalled();
  });
});

// Fix round (2026-10-01): the verifier found post_done said "Action executed
// successfully." when the turn carried a navigation chip and nothing ran or was
// proposed — blocksOnlyAnswer([]) answered that sentence for an empty list.
describe('the stream’s answer never claims a run that did not happen', () => {
  const NAV = [{ actionType: 'navigate', targetId: 'projects', label: 'Projects', path: '/projects', scope: 'global' }] as any;
  const provisional = BLOCK.replace('"confidence":"strong"', '"confidence":"provisional"');

  it('a reply of nothing but a provisional block, beside a navigation chip: the draft, marked not saved', async () => {
    const done = await run(provisional, { collectedNavigation: NAV });
    expect(done.cleanedResponse).not.toMatch(/executed successfully/i);
    expect(done.cleanedResponse).toContain(CONTENT);
    expect(done.cleanedResponse).toMatch(/Not saved\. AnA marked it provisional/);
    expect(writes.governed).not.toHaveBeenCalled();
  });

  it('a strong block in a conversation scoped to a program UUID: not proposed, and the answer says why', async () => {
    const done = await run(BLOCK, { streamProjectId: '7abb1c22-1111-4222-8333-944445555666' as any, collectedNavigation: NAV });
    expect((done.executedCommands ?? []).length).toBe(0);
    expect(done.cleanedResponse).not.toMatch(/executed successfully/i);
    expect(done.cleanedResponse).toContain(CONTENT);
    expect(done.cleanedResponse).toMatch(/Not saved\. This conversation is not scoped to a project/);
  });

  it('an empty reply with only a navigation chip: nothing was changed', async () => {
    const done = await run('', { collectedNavigation: NAV });
    expect(done.cleanedResponse).toBe('Nothing was changed.');
  });
});
