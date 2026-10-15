import { beforeEach, describe, expect, it, vi } from 'vitest';

const gatewayRoute = vi.hoisted(() => vi.fn(async (_request: unknown) => ({
  content: 'gateway wiring sentinel',
  model: 'test-double',
  usage: { inputTokens: 1, outputTokens: 1, estimatedCostUsd: 0 },
  latencyMs: 1,
  finishReason: 'end_turn',
})));
vi.mock('../../ai-gateway/gateway', () => ({ getGateway: () => ({ route: gatewayRoute }) }));

import { AnaDocumentDraftingService, resolveDraftingRequirements } from '../AnaDocumentDraftingService';
import { CTD_AUTHORING_GUIDANCE } from '../../ind/ctd/authoring-guidance';
import { resolveRequirements } from '../../ind/ctd/requirements-resolver';
import { isIchHeading, ichHeadingTitle } from '../../ind/ctd/ich-m4-headings';
import { resolveSectionBriefSource } from '../../ind/ctd/section-brief';

// These are exact recorded-content coverage and real gateway-wiring checks.
// A gateway double does not qualify model output, product applicability or a filing.
const LEAVES = [
  ['3.2.S.1.1', 'Nomenclature', 'name'],
  ['3.2.S.1.2', 'Structure', 'stereochemistry'],
  ['3.2.S.1.3', 'General Properties', 'biological activity'],
  ['3.2.P.2.1.1', 'Drug Substance', 'compatibility'],
  ['3.2.P.2.1.2', 'Excipients', 'function'],
  ['3.2.P.2.2.1', 'Formulation Development', 'formulation'],
  ['3.2.P.2.2.2', 'Overages', 'overage'],
  ['3.2.P.2.2.3', 'Physicochemical and Biological Properties', 'performance'],
  ['3.2.P.2.3', 'Manufacturing Process Development', 'process'],
  ['3.2.P.2.4', 'Container Closure System', 'container'],
  ['3.2.P.2.5', 'Microbiological Attributes', 'sterile'],
  ['3.2.P.2.6', 'Compatibility', 'diluent'],
] as const;

describe('IND CMC exact leaf guidance through existing AnA drafting', () => {
  beforeEach(() => gatewayRoute.mockClear());

  it.each(LEAVES)('resolves %s as its own recorded section, rather than a broad ancestor', (code, title, topic) => {
    const answer = resolveRequirements({ document: code });
    expect(answer.kind).toBe('answer');
    if (answer.kind !== 'answer') throw new Error(`No recorded guidance for ${code}`);
    expect(answer.match).toBe('exact');
    expect(answer.source).toEqual({ kind: 'ctd-section', code });
    expect(answer.title).toBe(title);
    expect(answer.requirements.toLowerCase()).toContain(topic);
    expect(resolveSectionBriefSource(`m${code}`)?.entry?.code).toBe(code);
    expect(isIchHeading(code)).toBe(true);
    expect(ichHeadingTitle(code)).toBe(title);
  });

  it.each(LEAVES)('passes exact %s guidance and missing-evidence limits to the real drafting gateway', async (code, title, topic) => {
    const service = new AnaDocumentDraftingService();
    const result = await service.draftDocument({
      framework: 'general_regulatory', submissionType: 'US_IND', sectionType: code,
      instructions: 'Phase 1 IND. Product modality and supporting study results are unavailable; retain those gaps.',
      organizationId: 41, userId: 7, projectId: 93,
    });
    expect(gatewayRoute).toHaveBeenCalledTimes(1);
    const sent = gatewayRoute.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
      metadata: Record<string, unknown>;
      organizationId: number; projectId: number;
    };
    const user = sent.messages.find(m => m.role === 'user')!.content;
    expect(user).toContain(`## Drafting: Module ${code} — ${title}`);
    expect(user.toLowerCase()).toContain(topic);
    expect(user).toContain('development phase');
    expect(user).toContain('Do not fabricate');
    expect(user).toContain('unresolved');
    expect(user).not.toContain('M4Q(R2)');
    const requirementsSource = sent.metadata.requirementsSource as string;
    expect(requirementsSource).toBeTypeOf('string');
    expect(requirementsSource.endsWith(`record:ctd-section:${code}:exact`)).toBe(true);
    expect(sent.organizationId).toBe(41);
    expect(sent.projectId).toBe(93);
    expect(result.content).toBe('gateway wiring sentinel');
  });

  it('keeps missing phase/modality and sponsor data unresolved in every new leaf prompt', () => {
    for (const [code] of LEAVES) {
      const guidance = CTD_AUTHORING_GUIDANCE[code];
      expect(guidance, code).toBeDefined();
      expect(guidance.authoringGuidance).toContain('development phase');
      expect(guidance.authoringGuidance).toContain('modality');
      expect(guidance.authoringGuidance).toContain('Do not fabricate');
      expect(guidance.generationPrompt).toContain('{{PHASE}}');
      expect(guidance.generationPrompt).toContain('unresolved');
      expect(guidance.generationPrompt).not.toContain('M4Q(R2)');
    }
  });

  it('retains an explicit refusal to invent wholly unindexed section guidance', () => {
    expect(resolveRequirements({ document: '3.9.99' }).kind).toBe('not_indexed');
    const result = resolveDraftingRequirements('US_IND', '3.9.99');
    expect(result.requirementsSource).toBe('record:not-indexed');
    expect(result.requirements).toContain('do not supply requirements from memory');
  });

  it('labels unsupported deeper numbering as inherited guidance, never exact coverage', () => {
    const result = resolveRequirements({ document: '3.2.P.2.6.99' });
    expect(result.kind).toBe('answer');
    if (result.kind !== 'answer') throw new Error('Existing ancestor contract changed');
    expect(result.match).toBe('ancestor');
    expect(result.source).toEqual({ kind: 'ctd-section', code: '3.2.P.2.6' });
    expect(result.requirements).toContain("these are 3.2.P.2.6's requirements");
  });
});
