/**
 * A section rewritten from the AnA RI chat is written against what that
 * section must contain — the canonical brief from
 * server/services/ind/ctd/requirements-resolver.ts — and a memo is not.
 *
 * Before this test, generateArtifact used `sectionCode` only for placement and
 * governance: a rewritten 2.5 reached the model with no statement of what a
 * Clinical Overview contains, so the "submission-defensible" rewrite was
 * measured against the model's recall (D2 finding 74(d), 2026-10-05).
 *
 * Mutation check: removing the injection in artifact-generator.ts fails the
 * brief, placement, not-indexed and provenance cases here.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  route: vi.fn(),
  executeGovernedAnaOperation: vi.fn(),
}));

vi.mock('../ai-gateway/index.js', () => ({
  getGateway: () => ({ route: mocks.route }),
}));

vi.mock('../governed-ana-execution.js', () => ({
  executeGovernedAnaOperation: mocks.executeGovernedAnaOperation,
}));

import { generateArtifact } from '../ana-ri/artifact-generator.js';
import type { DocumentActionType } from '../ana-ri/document-actions.js';
import { resolveRequirements } from '../ind/ctd/requirements-resolver.js';

type Msg = { role: string; content: string };

const CONTEXT = [
  { role: 'user' as const, content: 'Tighten the benefit-risk argument in our clinical overview.' },
  { role: 'assistant' as const, content: 'Here is what a reviewer will challenge in the current draft.' },
];

const MODEL_OUTPUT = `# Section Rewrite

## Original Assessment
[KNOWN] The current benefit-risk paragraph asserts superiority without citing the pivotal study tables.

## Rewritten Section
The pivotal study met its primary endpoint; the treatment effect and its confidence interval are reported in the efficacy summary and are cited here by table.

## Change Rationale
[INFERRED] Citing the source tables makes each claim traceable for the reviewer.

## Remaining Issues
[MISSING] The integrated safety exposure table is not yet available.
`;

async function run(actionType: DocumentActionType, sectionCode?: string): Promise<Msg[]> {
  await generateArtifact({
    actionType,
    conversationContext: CONTEXT,
    projectId: 7,
    organizationId: 3,
    userId: 11,
    sectionCode,
  });
  expect(mocks.route).toHaveBeenCalledOnce();
  return mocks.route.mock.calls[0][0].messages as Msg[];
}

function provenance(): Record<string, unknown> {
  return mocks.executeGovernedAnaOperation.mock.calls[0][0].artifactMutation.provenance;
}

const BRIEF_2_5 = (() => {
  const r = resolveRequirements({ document: '2.5' });
  if (r.kind !== 'answer') throw new Error('fixture: 2.5 must resolve in the canonical record');
  return r.requirements;
})();

const SECTION_TYPES: DocumentActionType[] = ['rewritten_section', 'revised_artifact', 'attach_to_dossier'];
const MEMO_TYPES: DocumentActionType[] = [
  'risk_memo',
  'strategy_note',
  'reviewer_question_brief',
  'deficiency_preemption_memo',
  'evidence_memo',
];

describe('artifact-generator: a section rewrite carries the section brief', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.route.mockResolvedValue({ content: MODEL_OUTPUT, provider: 'test', model: 'm' });
    mocks.executeGovernedAnaOperation.mockResolvedValue({
      artifactMutation: { artifactId: 1, isNew: true },
      persistenceStatus: 'persisted',
    });
  });

  it.each(SECTION_TYPES)('%s with sectionCode 2.5 sends the canonical 2.5 brief as its own user message', async (actionType) => {
    const messages = await run(actionType, '2.5');
    const briefs = messages.filter((m) => m.content.includes('## Drafting: Module 2.5 — Clinical Overview'));
    expect(briefs).toHaveLength(1);
    const brief = briefs[0];
    expect(brief.role).toBe('user');
    // The whole canonical brief, not a paraphrase of it.
    expect(brief.content).toContain(BRIEF_2_5);
    // Separate from the generation instruction, and placed immediately before it.
    const last = messages[messages.length - 1];
    expect(last.content).not.toContain('## Drafting:');
    expect(messages[messages.length - 2]).toBe(brief);
    // After the conversation, so the chat cannot be read as superseding it.
    expect(messages.indexOf(brief)).toBe(1 + CONTEXT.length);
  });

  it.each(MEMO_TYPES)('%s with sectionCode 2.5 gets no section brief (control)', async (actionType) => {
    const messages = await run(actionType, '2.5');
    expect(messages).toHaveLength(1 + CONTEXT.length + 1);
    expect(messages.some((m) => m.content.includes('## Drafting:'))).toBe(false);
    expect(messages.some((m) => /canonical requirements/i.test(m.content))).toBe(false);
    expect(provenance().requirementsSource).toBeUndefined();
  });

  it('an unrecognised section code is told no canonical requirements are indexed, never given another entry', async () => {
    const messages = await run('rewritten_section', '9.9.9');
    const notice = messages[messages.length - 2];
    expect(notice.role).toBe('user');
    expect(notice.content).toContain('no canonical requirements indexed');
    expect(notice.content).toContain('9.9.9');
    expect(notice.content).toMatch(/do not supply requirements from memory/i);
    expect(messages.some((m) => m.content.includes('## Drafting:'))).toBe(false);
    expect(provenance().requirementsSource).toBe('not_indexed');
  });

  it('a section rewrite with no sectionCode is unchanged: system, context, instruction', async () => {
    const messages = await run('rewritten_section');
    expect(messages).toHaveLength(1 + CONTEXT.length + 1);
    expect(messages.some((m) => /canonical requirements|## Drafting:/i.test(m.content))).toBe(false);
    expect(provenance().requirementsSource).toBeUndefined();
  });

  it('records which record answered in the artifact provenance', async () => {
    await run('rewritten_section', '2.7.3');
    expect(provenance().requirementsSource).toBe('ctd-section:2.7.3');
    const messages = mocks.route.mock.calls[0][0].messages as Msg[];
    expect(messages.some((m) => m.content.includes('## Drafting: Module 2.7.3 — Summary of Clinical Efficacy'))).toBe(true);
  });
});
