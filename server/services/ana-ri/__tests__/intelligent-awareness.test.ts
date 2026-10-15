/** Prompt-contract coverage, not a claim of live model behavior. */
import { describe, expect, it } from 'vitest';
import { ANA_PERSONALITY_CORE, ANA_PERSONALITY_BRIEF } from '../personality-core.js';
import { ANA_CHAT_REGISTER } from '../response-register.js';
import { buildAnaRISystemPrompt } from '../persona.js';
import { orchestrate } from '../orchestrator.js';
import { ANA_BEHAVIOR, ANA_SYSTEM_PROMPT, ANA_COMPACT_PROMPT } from '../../ana-personality.js';
import { BASE_SYSTEM_PROMPT } from '../../lumen-context/base-system-prompt.js';
import { buildSystemPrompt, buildStreamingSystemPrompt } from '../../ana/submission-chat-handler.js';

const heading = '## IA — Intelligent Awareness';
const artifact = { id: 1, artifact_id: 'ART-1', project_id: 1, organization_id: 1, title: 'Clinical Overview', ctd_section: '2.5', type: 'document', category: 'clinical' } satisfies import('../../ana/submission-chat-handler.js').ArtifactRow;
const surfaces = [
  ['RI', buildAnaRISystemPrompt()],
  ['stream orchestration', orchestrate({ message: 'Which pathway should we choose?' }).systemPrompt],
  ['cortex', ANA_SYSTEM_PROMPT],
  ['compact cortex', ANA_COMPACT_PROMPT],
  ['unified cortex', BASE_SYSTEM_PROMPT],
  ['submission buffered', buildSystemPrompt(artifact, [artifact], [])],
  ['submission streaming', buildStreamingSystemPrompt(artifact, [artifact], [])],
] as const;

describe('IA across AnA prompt paths', () => {
  it.each(surfaces)('%s receives the shared awareness policy exactly once', (_name, prompt) => {
    expect(prompt.split(heading).length - 1).toBe(1);
    expect(prompt).toContain('Ask before recommending or acting');
    expect(prompt).toContain('Do not ask again for facts already supplied');
    expect(prompt).toContain('A provisional answer');
    expect(prompt).toContain('Never claim the whole picture is complete');
  });

  it.each([['full', ANA_PERSONALITY_CORE], ['brief', ANA_PERSONALITY_BRIEF]])('%s preserves the practical boundaries', (_name, prompt) => {
    expect(prompt).toContain('one to three focused questions');
    expect(prompt).toContain('missing, unavailable, stale, or contradictory');
    expect(prompt).toContain('does not mean the evidence does not exist');
    expect(prompt).toContain('Reassess after each reply');
    expect(prompt).toContain('Do not turn every answer into an interview');
    expect(prompt).toContain('permission, approval, or authority');
    expect(prompt).toContain('hypothetical inputs');
  });

  it('does not let the chat register force a verdict before a blocking question', () => {
    expect(ANA_CHAT_REGISTER).toContain('When context is sufficient');
    expect(ANA_CHAT_REGISTER).toContain('Intelligent Awareness takes priority');
  });

  it('does not let strategy or drafting shortcuts override IA', () => {
    expect(ANA_BEHAVIOR).not.toContain('You give your recommendation first');
    expect(ANA_BEHAVIOR).not.toContain('You draft it. Not an outline');
    expect(ANA_BEHAVIOR).toContain('When the decisive context is known');
    expect(ANA_BEHAVIOR).toContain('missing facts');
  });
});


describe('IA is subject matter judgment', () => {
  it.each(surfaces)('%s carries scientific and market-specific critical thinking', (_name, prompt) => {
    for (const term of ['medical device', 'diagnostic/IVD', 'biotech', 'pharmaceutical', 'contract research organization', 'Europe', 'United States', 'Japan', 'Canada', 'China']) expect(prompt).toContain(term);
    expect(prompt).toContain('clinical validity');
    expect(prompt).toContain('intended use');
    expect(prompt).toContain('sponsor responsibilities');
    expect(prompt).toContain('bias, controls');
    expect(prompt).toContain('binding law');
    expect(prompt).toContain('effective date');
    expect(prompt).toContain('disconfirming evidence');
    expect(prompt).toContain('Do not transfer a rule between markets');
    expect(prompt).toContain('only the domain facts that could change this answer');
  });
});

// Guard late orchestration overlays, where a more specific instruction could
// otherwise undo the shared IA policy after it was correctly composed.
describe('IA survives orchestration overlays', () => {
  it.each([
    'What does CTD stand for?',
    'Draft the supplied clinical overview using these confirmed results.',
    'Which market should we target? I have not chosen an intended use yet.',
  ])('does not force a verdict or full intake for "%s"', message => {
    const prompt = orchestrate({ message }).systemPrompt;
    expect(prompt.includes('still answer first')).toBe(false);
    expect(prompt.includes('For a small clarification, ask focused questions in chat')).toBe(true);
    expect(prompt.includes('Do not automatically start or restart an interview')).toBe(true);
    expect(prompt.includes('Within an active structured flow, ask its questions through the tool')).toBe(true);
    expect(prompt.includes('Apply Intelligent Awareness to decide whether the gap blocks')).toBe(true);
    expect(prompt.includes('start_war_game')).toBe(true);
  });

  it('allows explicit reconsideration without silently rewriting recorded decisions', () => {
    const profile: NonNullable<Parameters<typeof orchestrate>[0]['_projectIntelligenceProfile']> = {
      profileId: 1, projectId: 1, organizationId: 1,
      regulatoryStrategy: 'Original plan targets the United States.',
      targetIndication: null, targetPopulation: null,
      riskFactors: [], openQuestions: [], learnedInsights: [],
      keyDecisions: [{ decision: 'Target the United States', rationale: 'Original plan', date: '2026-10-01' }],
      documentStats: { totalIngested: 0, totalTokens: 0, lastIngestedAt: null },
      memoryEntryCount: 0, profileStatus: 'active', lastEnrichedAt: null,
    };
    const prompt = orchestrate({
      message: 'We are now considering Japan. Reconsider the old plan.',
      _projectIntelligenceProfile: profile,
      conversationHistory: [
        { role: 'user', content: 'The original plan targets the United States.' },
        { role: 'assistant', content: 'Which market should this recommendation cover?' },
        { role: 'user', content: 'Japan for this task.' },
      ],
    }).systemPrompt;
    expect(prompt.includes('Target the United States')).toBe(true);
    expect(prompt.includes('Do not repeat recommendations that contradict prior decisions')).toBe(false);
    expect(prompt.includes('Reconsider prior recommendations when new evidence or an explicit user correction changes their basis')).toBe(true);
    expect(prompt.includes('Explain the departure; do not silently amend a recorded decision')).toBe(true);
    expect(prompt.includes('A documented decision is never overturned silently')).toBe(true);
  });
});
