/**
 * Pure-helper tests for the PDEV AI drafting service.
 *
 * The two pure helpers — pickTargetDocument and buildSystemPrompt — are
 * the parts a CI run can verify without DB or LLM mocks.
 */
import { describe, expect, test, vi } from 'vitest';

vi.mock('../../../db', () => ({
  db: {},
  pool: undefined,
  getPool: () => {
    throw new Error('not in test scope');
  },
}));

import { pickTargetDocument, buildSystemPrompt } from '../pdev-ai-drafting';
import { getActivityByKey } from '../pdev-activity-registry';

const program = {
  productName: 'TEST-DRUG-001',
  indication: 'Refractory anemia',
  programType: 'IND',
};

describe('pdev ai drafting — pickTargetDocument', () => {
  test('picks the first mandatory document when no preference passed', () => {
    const a = getActivityByKey('cmc.specifications')!;
    const doc = pickTargetDocument(a);
    expect(doc).toBeDefined();
    expect(doc!.mandatoryForInd).toBe(true);
  });
  test('honours explicit document code', () => {
    const a = getActivityByKey('cmc.specifications')!;
    const doc = pickTargetDocument(a, 'cmc-dp-specifications');
    expect(doc?.code).toBe('cmc-dp-specifications');
  });
  test('returns undefined when code does not match', () => {
    const a = getActivityByKey('cmc.specifications')!;
    expect(pickTargetDocument(a, 'not-a-real-code')).toBeUndefined();
  });
  test('falls back to first document when activity has no mandatory doc', () => {
    const a = getActivityByKey('cmc.comparability')!;
    // comparability has 1 doc, mandatoryForInd: false
    const doc = pickTargetDocument(a);
    expect(doc?.code).toBe('cmc-comparability-assessment');
  });
});

describe('pdev ai drafting — buildSystemPrompt', () => {
  test('embeds activity, workstream, stage, and document context', () => {
    const a = getActivityByKey('nonclinical.glp_tox')!;
    const doc = a.requiredDocuments[0];
    const prompt = buildSystemPrompt(a, doc, program);
    expect(prompt).toContain('TEST-DRUG-001');
    expect(prompt).toContain('Refractory anemia');
    expect(prompt).toContain('nonclinical');
    expect(prompt).toContain('late_pdev');
    expect(prompt).toContain('GLP toxicology studies');
    expect(prompt).toContain(doc.title);
  });
  test('declares eCTD destination when present', () => {
    const a = getActivityByKey('cmc.gmp_readiness')!;
    const doc = a.requiredDocuments[0];
    const prompt = buildSystemPrompt(a, doc, program);
    expect(prompt).toContain('M3 3.2.A.1');
  });
  test('marks documents with no eCTD destination', () => {
    const a = getActivityByKey('regulatory.strategy_memo')!;
    const doc = a.requiredDocuments[0];
    const prompt = buildSystemPrompt(a, doc, program);
    expect(prompt).toContain('no eCTD destination');
  });
  test('rules section enforces evidence tagging and tone', () => {
    const a = getActivityByKey('clinical.full_protocol')!;
    const doc = a.requiredDocuments[0];
    const prompt = buildSystemPrompt(a, doc, program);
    expect(prompt).toContain('[KNOWN]');
    expect(prompt).toContain('[INFERRED]');
    expect(prompt).toContain('[MISSING]');
    expect(prompt).toContain('sentence case');
  });
});
