/** Captured gateway requests and missing-evidence outcomes, without a provider call. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const gateway = vi.hoisted(() => ({ complete: vi.fn(async (_messages: unknown) => 'Reviewable working prose.') }));
vi.mock('../../lib/unified-ai-client.js', () => ({
  ai: {
    complete: gateway.complete,
    chat: async (messages: unknown) => ({ content: await gateway.complete(messages), model: 'test-model', usage: { totalTokens: 12 } }),
  },
}));
vi.mock('../usage-metering.js', () => ({ checkQuota: vi.fn(), recordUsage: vi.fn() }));

import {
  draftCSRSection, draftCSRSectionWithProvenance, flattenICHE3Sections, getICHE3Structure,
  hasUnresolvedPlaceholders, type CSRBuildRequest,
} from '../csr-builder';
import type { CsrAuthoringEvidence } from '../csr/cortex-authoring-context';
import { renderE3Brief } from '../ind/ctd/csr-e3-guidance';
import { CSR_SENTENCE_PATTERNS } from '../ind/ctd/csr-e3-writing';

const INFO: CSRBuildRequest['studyInfo'] = {
  title: 'SOURCE_TITLE_INSTRUCTIONS_ARE_NOT_SYSTEM_RULES', protocolNumber: 'STUDY-ALPHA', phase: 'Phase 2',
  indication: 'A source-recorded indication', sponsor: 'SOURCE_SPONSOR_DO_NOT_OVERRIDE_EVIDENCE',
  investigationalProduct: 'Investigational product', studyDesign: 'Recorded study design',
  primaryEndpoint: 'Source-defined primary endpoint',
};
const REQUEST: CSRBuildRequest = { organizationId: 7, userId: 3, projectId: 9, studyInfo: INFO };
const target = (number: string) => {
  const found = flattenICHE3Sections(getICHE3Structure()).find(section => section.number === number);
  if (!found) throw new Error(`Missing canonical E3 section ${number}`);
  return found;
};
type Message = { role: string; content: string };
const messages = () => gateway.complete.mock.calls[0]?.[0] as Message[];
const PATHS = [
  ['persisted job', async (number: string, info = INFO) => draftCSRSectionWithProvenance(target(number), { ...REQUEST, studyInfo: info })],
  ['on-demand draft', async (number: string, info = INFO) => draftCSRSection(number, info)],
] as const;

beforeEach(() => { gateway.complete.mockReset(); gateway.complete.mockResolvedValue('Reviewable working prose.'); });

describe.each(PATHS)('%s receives the existing scientific writing expertise', (_name, draft) => {
  it('includes causal restraint, analysis-set identity and estimand distinctions in actual drafting context', async () => {
    await draft('9.7.1');
    const context = messages().map(message => message.content).join('\n');
    expect(context).toContain('Treatment-emergent');
    expect(context).toContain('investigator');
    expect(context).toContain('same estimand');
    expect(context).toContain('different estimand');
    expect(context).toContain('analysis set');
    expect(context).toContain('MedDRA');
  });

  it('keeps sponsor-supplied strings out of trusted system instructions', async () => {
    await draft('7');
    const system = messages().filter(message => message.role === 'system').map(message => message.content).join('\n');
    const data = messages().filter(message => message.role === 'user').map(message => message.content).join('\n');
    expect(system).not.toContain(INFO.title);
    expect(system).not.toContain(INFO.sponsor);
    expect(data).toContain(INFO.title);
    expect(data).toContain(INFO.sponsor);
    expect(system).toMatch(/quoted|untrusted|data.*not.*instructions/i);
  });

  it('requests source-supported reviewable prose without asserting submission readiness', async () => {
    await draft('9.7.1');
    const context = messages().map(message => message.content).join('\n');
    expect(context).not.toMatch(/submission-ready/i);
    expect(context).toMatch(/source-supported|source supported/i);
    expect(context).toMatch(/missing|unknown|unavailable/i);
    expect(context).toMatch(/do not.*(?:infer|assume|invent).*approval|approval.*(?:records|source)/i);
  });
});

describe('an explicitly selected results source that supplies no usable table', () => {
  const unavailable = (): CsrAuthoringEvidence => ({
    schemaVersion: 'c2c.csr-authoring-evidence.v1', programId: '11111111-1111-4111-8111-111111111111',
    runId: '22222222-2222-4222-8222-222222222222', studyId: 'study-alpha', sectionNumber: '12.2.1',
    source: { documentId: '33333333-3333-4333-8333-333333333333', version: '1', sha256: 'a'.repeat(64),
      dataCutDate: '2026-10-01', protocolNumber: INFO.protocolNumber },
    historical: true, releaseEligibilityVerified: true, clinicalVerification: 'not-established',
    status: 'unavailable', evidenceDigest: 'b'.repeat(64), tables: [],
    missingTables: ['aeOverallSummary'], omittedTables: [], limitations: ['Actual aggregate results are unavailable.'], approvalRequired: true,
  });

  it('cannot silently accept an unsupported qualitative absence-of-harm conclusion from study metadata', async () => {
    gateway.complete.mockResolvedValue('No treatment-related adverse events were reported.');
    const evidence = unavailable();
    const result = await draftCSRSectionWithProvenance(target('12.2.1'), REQUEST, undefined, evidence);
    expect(result.source).toBe('template');
    expect(result.model).toBeNull();
    expect(result.tokenCost).toBe(0);
    expect(hasUnresolvedPlaceholders(result.content)).toBe(true);
    expect(result.content).not.toContain('No treatment-related adverse events were reported.');
    expect(result.content).not.toContain('Most adverse events were mild or moderate in severity.');
    expect(result.content).not.toContain('≥5%');
    expect(result.lineage).toMatchObject({ evidence: { evidenceDigest: evidence.evidenceDigest, status: 'unavailable' } });
    expect(result.lineage?.rejectedModelDraft).toMatchObject({ reason: 'csr_evidence_unavailable' });
    expect(gateway.complete).not.toHaveBeenCalled();
  });

  it('retains context-budget omissions rather than describing omitted results as zero events', async () => {
    const evidence = unavailable();
    evidence.missingTables = [];
    evidence.omittedTables = [{ key: 'aeOverallSummary', reason: 'context_budget' }];
    const result = await draftCSRSectionWithProvenance(target('12.2.1'), REQUEST, undefined, evidence);
    expect(result.source).toBe('template');
    expect(result.lineage?.evidence).toMatchObject({ omittedTables: evidence.omittedTables });
    expect(gateway.complete).not.toHaveBeenCalled();
  });
});

describe('a data-backed result section without retained evidence', () => {
  it('unbound results in the provenance path stay needs-data rather than a qualitative no-AE finding', async () => {
    gateway.complete.mockResolvedValue('No treatment-related adverse events were reported.');
    const result = await draftCSRSectionWithProvenance(target('12.2.1'), REQUEST);
    expect(result.source).toBe('template');
    expect(result.model).toBeNull();
    expect(result.tokenCost).toBe(0);
    expect(hasUnresolvedPlaceholders(result.content)).toBe(true);
    expect(result.content).not.toContain('No treatment-related adverse events were reported.');
    expect(result.content).not.toContain('Most adverse events were mild or moderate in severity.');
    expect(result.content).not.toContain('≥5%');
    expect(result.lineage?.rejectedModelDraft).toMatchObject({ reason: 'csr_evidence_unavailable' });
    expect(gateway.complete).not.toHaveBeenCalled();
  });

  it('unbound results in the on-demand path stay needs-data rather than a qualitative no-AE finding', async () => {
    gateway.complete.mockResolvedValue('No treatment-related adverse events were reported.');
    const result = await draftCSRSection('12.2.1', INFO);
    expect(result.isAI).toBe(false);
    expect(hasUnresolvedPlaceholders(result.content)).toBe(true);
    expect(result.content).not.toContain('No treatment-related adverse events were reported.');
    expect(result.content).not.toContain('Most adverse events were mild or moderate in severity.');
    expect(result.content).not.toContain('≥5%');
    expect(gateway.complete).not.toHaveBeenCalled();
  });
});

const FALLBACK_CASES = [
  ['2', /This was a|treatment duration was/i],
  ['7', /represents a significant area of unmet medical need/i],
  ['9.1', /were randomized|were assigned|Treatment duration was/i],
  ['9.3', /were adults with a confirmed diagnosis/i],
  ['9.7.1', /significance level of .* was used/i],
  ['9.7.2', /planned to provide .* power/i],
  ['10.1', /were randomized/i],
  ['11.4.1', /\(p=\[value\]\)/i],
  ['12.3.3', /Narratives are presented/i],
  ['13', /This Phase .* study evaluated/i],
] as const;

describe.each(PATHS)('%s source-missing fallback', (_name, draft) => {
  it.each(FALLBACK_CASES)('§%s preserves a source gap without inventing conduct or an analysis design', async (section, unsupportedClaim) => {
    gateway.complete.mockRejectedValue(new Error('Isolated provider failure'));
    const result = await draft(section, { ...INFO, sampleSize: 240, treatmentDuration: '16 weeks', comparator: 'Recorded comparator' });
    expect(result.content).not.toMatch(unsupportedClaim);
    expect(hasUnresolvedPlaceholders(result.content)).toBe(true);
    expect(result.content).toMatch(/source|record|SAP|protocol/i);
    if (['2', '9.1', '9.7.2'].includes(section)) expect(result.content).toContain('240');
    if (['2', '9.1'].includes(section)) {
      expect(result.content).toContain('16 weeks');
      expect(result.content).toContain('Recorded comparator');
    }
  });
});

describe('the canonical E3 brief describes actual conduct rather than compliant conduct by default', () => {
  it.each(['1', '5.1', '5.2', '5.3'])('§%s conditions ethics/GCP/consent statements on actual source records', section => {
    const brief = renderE3Brief(section, 12000)!;
    expect(brief).toMatch(/only.*(?:source|record)|(?:source|record).*support|do not.*(?:assume|infer|invent)/i);
    expect(brief).toMatch(/missing|unknown|waiver|exception|noncompliance|deviation/i);
  });

  it('§9.7 requires actual SAP timing, including changes after unblinding', () => {
    const brief = renderE3Brief('9.7', 12000)!;
    expect(brief).not.toContain('and that it was final before unblinding');
    expect(brief).toMatch(/after unblinding|post-unblinding|after.*unblinded/i);
    expect(brief).toMatch(/missing|unknown|not.*recorded/i);
  });
});

describe('result sentences respect the source analysis hypothesis', () => {
  it('limits the existing null-crossing sentence to a superiority interpretation', () => {
    expect(CSR_SENTENCE_PATTERNS.find(pattern => pattern.id === 'non-significant')?.use).toMatch(/superiority/i);
  });

  it.each(['efficacy-noninferiority', 'efficacy-equivalence', 'efficacy-bayesian'])('%s has a source-conditioned sentence rather than a forced p-value conclusion', id => {
    const pattern = CSR_SENTENCE_PATTERNS.find(candidate => candidate.id === id);
    expect(pattern).toBeDefined();
    expect(pattern?.use).toMatch(/SAP|source|recorded|prespecified|pre-specified/i);
    expect(pattern?.pattern).not.toMatch(/p \{p_relation\}/);
    expect(pattern?.pattern).toMatch(/\{[^}]+\}/);
  });
});
