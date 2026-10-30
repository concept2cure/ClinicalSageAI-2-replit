import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db.js', () => ({ pool: { query: async () => ({ rows: [] }) } }));
vi.mock('../orchestration/cross-object-resolver', () => ({
  assembleCrossObjectPayload: async () => { throw new Error('readiness unavailable'); },
}));

import { assembleSystemPrompt, type AnAContext } from '../lumen-context-builder';
import { BASE_SYSTEM_PROMPT } from '../lumen-context/base-system-prompt';
import { getModuleIntelligence, detectActiveModule } from '../module-intelligence';
import { assembleInstructionEnginePrompt } from '../lumen-instruction-engine';
import { getSubmissionTypeContext } from '../../../shared/regulatory/submission-type-bridge';
import type { UserIntelligence } from '../user-intelligence';

function recordedPromptContext(type = 'US_IND', enabledModules = ['submission-center', 'document-authoring']): AnAContext {
  const summary = { id: 7, name: 'Recorded program', submissionType: type, phase: null,
    status: 'active', progress: 0, therapeuticArea: null, role: 'owner', lastAccessedAt: null };
  const userIntelligence = { organizationId: 3, organization: { id: 3, name: 'Recorded org',
    enabledModules, industryMode: null, tier: null }, identity: null, projects: [],
    activeProject: summary, currentSession: null, recentSessions: [], workQueue: [],
    recentActivity: [], conversationMemory: null, unread: [] } as unknown as UserIntelligence;
  return { project: { ...summary, submissionTypeContext: getSubmissionTypeContext(type),
    description: null, priority: null, riskLevel: null, tags: [], depth: 0, parentProjectId: null },
  userIntelligence, documents: null, workflow: null, conversation: null, userRole: null,
  userName: null, organizationName: null, accountCanon: null, clientIntelligence: null,
  projectIntelligence: null, anaIntelligenceContext: null, unreadContext: ['project documents'], timestamp: '2026-10-27' };
}

describe('real-base prompt assembly preserves required regulatory context', () => {
  it.each(['US_IND', 'US_510K', 'US_PMA', 'EU_MAA', 'EU_CER', 'US_NDA', 'US_BLA', 'ICH_CSR'])('retains complete selected intelligence, instructions and exact recorded qualifier for %s', async type => {
    const context = recordedPromptContext(type);
    const prompt = await assembleSystemPrompt(context);
    const intel = context.userIntelligence!;
    const module = getModuleIntelligence(detectActiveModule(intel)!, intel.activeProject)!;
    expect(prompt).toContain(BASE_SYSTEM_PROMPT);
    expect(prompt).toContain('## Active Project Context (Currently Working On)');
    expect(prompt).toContain(`(${context.project!.submissionTypeContext!.registryId})`);
    expect(prompt).toContain('**Progress**: 0%');
    expect(prompt).toContain(module.systemPromptAddon);
    expect(prompt).toContain('### AI-Draftable Document Types in This Module');
    expect(prompt).toContain('### Standard Workflow Stages');
    expect(prompt).toContain(assembleInstructionEnginePrompt(intel.organization!.enabledModules));
    for (const block of [BASE_SYSTEM_PROMPT, module.systemPromptAddon,
      assembleInstructionEnginePrompt(intel.organization!.enabledModules)]) {
      expect(prompt.split(block)).toHaveLength(2);
    }
    expect(prompt).toContain('## Context Not Read');
    expect(prompt).toContain('project documents');
    expect(prompt).toContain('## Tool Usage Guidance');
    expect(prompt).toContain('## Context-Aware Instructions');
    if (type === 'EU_MAA') expect(prompt).toContain('## MAA Specific Guidance');
  });

  it('bounds only optional whole blocks, names omission and retains later small context in order', async () => {
    const context = recordedPromptContext();
    context.clientIntelligence = `OPTIONAL_OVERSIZED_START${'x'.repeat(12_001)}OPTIONAL_OVERSIZED_END`;
    context.projectIntelligence = 'OPTIONAL_SMALL_PROJECT_CONTEXT';
    const prompt = await assembleSystemPrompt(context);
    expect(prompt).not.toContain('OPTIONAL_OVERSIZED_START');
    expect(prompt).not.toContain('OPTIONAL_OVERSIZED_END');
    expect(prompt).toContain('OPTIONAL_SMALL_PROJECT_CONTEXT');
    expect(prompt).toContain('## Optional Context Omitted');
    expect(prompt.indexOf('OPTIONAL_SMALL_PROJECT_CONTEXT')).toBeLessThan(prompt.indexOf('## eCTD Co-Author'));
    expect(prompt).toContain('## IND-Specific Guidance');
  });

  it('does not mistake empty or unread subscription context for every feature grant', async () => {
    for (const unread of [false, true]) {
      const context = recordedPromptContext('US_IND', []);
      if (unread) {
        context.userIntelligence!.organization = null;
        context.unreadContext.push('organization profile');
      }
      const prompt = await assembleSystemPrompt(context);
      expect(prompt).toContain('## Instruction Engine');
      expect(prompt).not.toContain('## Dossier Assembly Workflow');
      expect(prompt).not.toContain('## Dossier Project Manager');
      expect(prompt).not.toContain('## Document Editor Intelligence');
      if (unread) expect(prompt).toContain('organization profile');
    }
  });

  it('shares one optional allowance across blocks without slicing a later block', async () => {
    const context = recordedPromptContext();
    context.clientIntelligence = `OPTIONAL_FIRST${'a'.repeat(7_000)}OPTIONAL_FIRST_END`;
    context.projectIntelligence = `OPTIONAL_SECOND${'b'.repeat(7_000)}OPTIONAL_SECOND_END`;
    context.anaIntelligenceContext = 'OPTIONAL_LATER_SMALL';
    const prompt = await assembleSystemPrompt(context);
    expect(prompt).toContain(context.clientIntelligence);
    expect(prompt).not.toContain('OPTIONAL_SECOND');
    expect(prompt).not.toContain('OPTIONAL_SECOND_END');
    expect(prompt).toContain('OPTIONAL_LATER_SMALL');
    expect(prompt).toContain('## Optional Context Omitted');
  });

  it('retains the caller-provided custom prompt verbatim', async () => {
    expect(await assembleSystemPrompt(recordedPromptContext(), 'CALLER CUSTOM')).toBe('CALLER CUSTOM');
  });
});
