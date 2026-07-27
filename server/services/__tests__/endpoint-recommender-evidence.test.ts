/**
 * Endpoint evidence scoring (Phase 8 confidence-hygiene) — the honest replacement
 * for the former fabricated success_rate defaults (75/80) and arbitrary +10/+15
 * bumps. Endpoints are ranked/labeled by real evidence strength; a success rate is
 * emitted ONLY from real outcome data, never synthesized. Pure.
 */

import { describe, it, expect } from 'vitest';
import {
  classifyEndpointBasis, deriveEvidenceStrength, normalizeEndpointEvidence,
  type EndpointRecommendation,
} from '../endpoint-recommender-service';

function rec(partial: Partial<EndpointRecommendation>): EndpointRecommendation {
  return {
    endpoint: 'ORR', occurrence_count: 1, success_rate: null, evidence: [],
    is_primary: true, ...partial,
  };
}
const csr = { source_id: '1', source_type: 'csr' as const, title: 't', reference_text: 'r', confidence: 0.5 };
const academic = { source_id: 'p1', source_type: 'academic' as const, title: 't', reference_text: 'r', confidence: 0.5 };
const aiGen = { source_id: 'ai-generated', source_type: 'academic' as const, title: 't', reference_text: 'r', confidence: 0.5 };
const fdaGuidance = { authority: 'FDA', document_name: 'Guidance', guidance_text: 'Use ORR' };

describe('classifyEndpointBasis — highest authority present', () => {
  it('regulatory beats everything', () => {
    expect(classifyEndpointBasis(rec({ regulatory_guidance: [fdaGuidance], evidence: [csr] }))).toBe('regulatory_recommended');
  });
  it('CSR with real outcome data → corpus_outcomes; without → corpus_frequency', () => {
    expect(classifyEndpointBasis(rec({ evidence: [csr], success_rate: 60 }))).toBe('corpus_outcomes');
    expect(classifyEndpointBasis(rec({ evidence: [csr] }))).toBe('corpus_frequency');
  });
  it('academic literature vs an AI-generated stub', () => {
    expect(classifyEndpointBasis(rec({ evidence: [academic] }))).toBe('academic_literature');
    expect(classifyEndpointBasis(rec({ evidence: [aiGen] }))).toBe('ai_suggested');
  });
});

describe('deriveEvidenceStrength — transparent, bounded, ordered', () => {
  it('orders regulatory > corpus > academic > ai', () => {
    const reg = deriveEvidenceStrength(rec({}), 'regulatory_recommended');
    const corpus = deriveEvidenceStrength(rec({}), 'corpus_frequency');
    const ai = deriveEvidenceStrength(rec({}), 'ai_suggested');
    expect(reg).toBeGreaterThan(corpus);
    expect(corpus).toBeGreaterThan(ai);
  });
  it('rewards corpus recurrence and corroboration, capped at 100', () => {
    const once = deriveEvidenceStrength(rec({ occurrence_count: 1 }), 'corpus_frequency');
    const many = deriveEvidenceStrength(rec({ occurrence_count: 6, evidence: [csr, academic, aiGen] }), 'corpus_frequency');
    expect(many).toBeGreaterThan(once);
    expect(many).toBeLessThanOrEqual(100);
  });
});

describe('normalizeEndpointEvidence — never fabricates a success rate', () => {
  it('leaves success_rate null for a non-outcome endpoint, and labels it honestly', () => {
    const n = normalizeEndpointEvidence(rec({ evidence: [aiGen] }));
    expect(n.success_rate).toBeNull();
    expect(typeof n.evidence_strength).toBe('number');
    expect(n.evidence_basis).toBe('ai_suggested');
  });
  it('preserves a real outcome-derived success_rate', () => {
    const n = normalizeEndpointEvidence(rec({ evidence: [csr], success_rate: 72 }));
    expect(n.success_rate).toBe(72);
    expect(n.evidence_basis).toBe('corpus_outcomes');
  });
});
