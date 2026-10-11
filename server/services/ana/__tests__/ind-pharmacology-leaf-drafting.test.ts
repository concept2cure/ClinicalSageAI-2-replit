import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import preserved from '../../../../tests/regulatory/fixtures/ind-pharmacology/preexisting-records.json';

const gatewayRoute = vi.hoisted(() => vi.fn(async (_request: unknown) => ({
  content: 'pharmacology gateway wiring sentinel', model: 'test-double',
  usage: { inputTokens: 1, outputTokens: 1, estimatedCostUsd: 0 },
  latencyMs: 1, finishReason: 'end_turn',
})));
vi.mock('../../ai-gateway/gateway', () => ({ getGateway: () => ({ route: gatewayRoute }) }));

import { AnaDocumentDraftingService, resolveDraftingRequirements } from '../AnaDocumentDraftingService';
import { CTD_AUTHORING_GUIDANCE } from '../../ind/ctd/authoring-guidance';
import { resolveRequirements } from '../../ind/ctd/requirements-resolver';
import { ICH_M4_HEADINGS, isIchHeading, ichHeadingTitle } from '../../ind/ctd/ich-m4-headings';
import { resolveSectionBriefSource } from '../../ind/ctd/section-brief';

// These tests qualify catalogue fidelity and the actual gateway request path.
// The gateway double supplies no scientific evidence or model qualification.
const LEAVES = [
  ['2.6.2.1', 'Brief Summary'],
  ['2.6.2.2', 'Primary Pharmacodynamics'],
  ['2.6.2.3', 'Secondary Pharmacodynamics'],
  ['2.6.2.4', 'Safety Pharmacology'],
  ['2.6.2.5', 'Pharmacodynamic Drug Interactions'],
  ['2.6.2.6', 'Discussion and Conclusions'],
  ['2.6.2.7', 'Tables and Figures'],
] as const;
const promoted = LEAVES.map(([code]) => code as string);
const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

describe('IND pharmacology exact leaf guidance through existing AnA drafting', () => {
  beforeEach(() => gatewayRoute.mockClear());

  it.each(LEAVES)('resolves %s as its own recorded section with the final M4S heading', (code, title) => {
    for (const document of [code, `m${code}`]) {
      const answer = resolveRequirements({ document });
      expect(answer.kind).toBe('answer');
      if (answer.kind !== 'answer') throw new Error(`No recorded guidance for ${code}`);
      expect(answer.match).toBe('exact');
      expect(answer.source).toEqual({ kind: 'ctd-section', code });
      expect(answer.title).toBe(title);
      // Static authoring references do not supply a qualified scientific basis.
      expect(answer.basis).toEqual([]);
      expect(resolveSectionBriefSource(document)?.kind).toBe('exact');
      expect(resolveSectionBriefSource(document)?.entry?.code).toBe(code);
      expect(isIchHeading(document)).toBe(true);
      expect(ichHeadingTitle(document)).toBe(title);
    }
  });

  it.each(LEAVES)('passes exact %s guidance and evidence limits to the real drafting gateway', async (code, title) => {
    const service = new AnaDocumentDraftingService();
    const instructions = 'Phase 1 IND. Evidence cutoff 2026-10-10. Route, population, duration and supporting study results were not supplied; preserve these gaps.';
    const result = await service.draftDocument({
      framework: 'general_regulatory', submissionType: 'US_IND', sectionType: code,
      instructions, organizationId: 41, userId: 7, projectId: 93,
    });
    expect(gatewayRoute).toHaveBeenCalledTimes(1);
    const sent = gatewayRoute.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
      metadata: Record<string, unknown>; organizationId: number; projectId: number;
    };
    const user = sent.messages.find(m => m.role === 'user')!.content;
    expect(user).toContain(`## Drafting: Module ${code} — ${title}`);
    expect(user).toContain(instructions);
    for (const guard of ['development phase', 'modality', 'route', 'population', 'duration', 'Do not fabricate', 'unresolved']) {
      expect(user, `${code}: ${guard}`).toContain(guard);
    }
    const source = sent.metadata.requirementsSource as string;
    expect(source).toBeTypeOf('string');
    expect(source.endsWith(`record:ctd-section:${code}:exact`)).toBe(true);
    expect(sent.metadata.productContextSource).toBe('unassessed');
    expect(sent.metadata.productModality).toBeNull();
    expect(sent.organizationId).toBe(41);
    expect(sent.projectId).toBe(93);
    expect(result.content).toBe('pharmacology gateway wiring sentinel');
  });

  it('carries declared gene-therapy context into safety pharmacology without treating it as verified evidence', async () => {
    await new AnaDocumentDraftingService().draftDocument({
      framework: 'general_regulatory', submissionType: 'US_IND', sectionType: '2.6.2.4',
      instructions: 'Phase 1; no safety pharmacology reports supplied.',
      projectContext: { therapeuticArea: 'oncology', modality: 'gene therapy' },
      organizationId: 41, userId: 7, projectId: 93,
    });
    const sent = gatewayRoute.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>; metadata: Record<string, unknown>;
    };
    const user = sent.messages.find(m => m.role === 'user')!.content;
    expect(user).toContain('## Drafting: Module 2.6.2.4 — Safety Pharmacology');
    expect(user).toContain('CALLER-DECLARED, UNVERIFIED ADVISORY');
    expect(user).toContain('do not infer modality from therapeutic area');
    expect(user).toContain('no safety pharmacology reports supplied');
    expect(sent.metadata.productContextSource).toBe('caller-declared-unverified');
    expect(sent.metadata.productModality).toBe('gene_therapy');
  });

  it('preserves the prefix guards when the existing renderer clips the authoring guidance', () => {
    for (const [code] of LEAVES) {
      const leaf = CTD_AUTHORING_GUIDANCE[code];
      expect(leaf, code).toBeDefined();
      const prefix = leaf.authoringGuidance.slice(0, 900);
      for (const guard of ['development phase', 'modality', 'route', 'population', 'duration', 'Do not fabricate', 'unresolved']) {
        expect(prefix, `${code}: ${guard}`).toContain(guard);
      }
      expect(leaf.generationPrompt).toContain('{{PHASE}}');
      expect(leaf.generationPrompt).toContain('unresolved');
      expect(leaf.parentCode).toBe('2.6.2');
      expect(leaf.required).toBe(false);
      expect(leaf.requiredFor).toEqual([]);
    }
  });

});

describe('IND pharmacology canonical record and hierarchy fidelity', () => {
  it('preserves every original record and moves exactly seven headings between the canonical halves', () => {
    expect(Object.keys(CTD_AUTHORING_GUIDANCE).filter(code => !promoted.includes(code)))
      .toEqual(preserved.guidance.map(row => row.code));
    for (const row of preserved.guidance) {
      expect(fingerprint(CTD_AUTHORING_GUIDANCE[row.code]), row.code).toBe(row.sha256);
    }
    const remaining = preserved.structural.filter(row => !promoted.includes(row.code));
    expect(ICH_M4_HEADINGS.map(row => row.code)).toEqual(remaining.map(row => row.code));
    for (const [index, row] of remaining.entries()) {
      expect(fingerprint(ICH_M4_HEADINGS[index]), row.code).toBe(row.sha256);
    }
    const codes = [...Object.keys(CTD_AUTHORING_GUIDANCE), ...ICH_M4_HEADINGS.map(row => row.code)];
    expect(Object.keys(CTD_AUTHORING_GUIDANCE)).toHaveLength(134);
    expect(ICH_M4_HEADINGS).toHaveLength(115);
    expect(new Set(codes).size).toBe(249);
    const terminal = codes.filter(code => !codes.some(child => child.startsWith(`${code}.`)));
    expect(terminal).toHaveLength(203);
    expect(terminal.filter(code => CTD_AUTHORING_GUIDANCE[code])).toHaveLength(110);
    expect(terminal.filter(code => !CTD_AUTHORING_GUIDANCE[code])).toHaveLength(93);
  });

  it('keeps unsupported deeper numbering inherited and wholly unindexed codes unresolved', () => {
    for (const [document, ancestor] of [['2.6.2.99', '2.6.2'], ['2.6.2.7.99', '2.6.2.7']]) {
      const answer = resolveRequirements({ document });
      expect(answer.kind).toBe('answer');
      if (answer.kind !== 'answer') throw new Error('Existing ancestor contract changed');
      expect(answer.match).toBe('ancestor');
      expect(answer.source).toEqual({ kind: 'ctd-section', code: ancestor });
      expect(isIchHeading(document)).toBe(false);
    }
    expect(resolveRequirements({ document: '9.9.9' }).kind).toBe('not_indexed');
    const absent = resolveDraftingRequirements('US_IND', '9.9.9');
    expect(absent.requirementsSource).toBe('record:not-indexed');
    expect(absent.requirements).toContain('do not supply requirements from memory');
  });
});
