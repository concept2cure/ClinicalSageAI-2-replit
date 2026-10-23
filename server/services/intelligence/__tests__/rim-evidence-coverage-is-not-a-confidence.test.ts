/**
 * A RIM evidence chain built from fixed evidence weights carries a heuristic
 * evidence coverage, labelled so — never a confidence.
 *
 * What the code used to do (until 2026-10-15): rim.ts Step 2 mapped each
 * recommendation's evidence into buildEvidenceChain and dropped its
 * relevanceBasis ('fixed_weight': a weight set by hand per kind of evidence).
 * computeConfidence — base 40, plus terms for the number of sources, their mean
 * relevance, their kinds and recency — turned those weights into the chain's
 * confidenceScore: a profile risk (one source at the fixed 0.85) became 65,
 * chain strength "moderate". persistEvidenceChain wrote it to
 * evidence_chain_records.confidence_score, and formatEvidenceForAudit printed
 * "Confidence: 65%". Nothing had measured a confidence.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  recs: vi.fn(),
  persisted: [] as unknown[],
}));

vi.mock('../../../db', () => ({ db: {}, pool: {}, getPool: () => ({}) }));
vi.mock('../../data-lineage-service', () => ({
  persistEvidenceChain: vi.fn(async (...args: unknown[]) => {
    h.persisted.push(args[4]);
    return null;
  }),
}));
vi.mock('../readiness-scoring-engine', () => ({ computeReadinessScore: async () => null }));
vi.mock('../recommendation-engine', () => ({ generateRecommendations: h.recs }));
vi.mock('../cross-module-intelligence', () => ({ analyzeCrossModuleRelationships: async () => ({ insights: [] }) }));
vi.mock('../project-intelligence-service', () => ({ getProjectIntelligence: async () => null }));
vi.mock('../learning-loop-service', () => ({ getFeedbackSummary: async () => null }));

import { runRIMAssessment } from '../rim';
import { buildEvidenceChain, formatEvidenceForAudit, type EvidenceChain } from '../evidence-confidence-model';

/** What recommendation-engine's profile generator emits for one recorded risk. */
const PROFILE_RISK = {
  recommendationId: 'rec-1',
  type: 'risk_mitigation',
  severity: 'high',
  sourceType: 'ai_inferred',
  targetObjectType: 'project',
  targetObjectId: '9',
  reason: 'Risk identified: Hepatotoxicity signal',
  evidence: [{
    sourceType: 'document_state',
    sourceId: '11',
    sourceTitle: 'Project Intelligence Profile',
    relevance: 0.85,
    relevanceBasis: 'fixed_weight',
  }],
  confidence: null,
  suggestedAction: 'Address risk: Hepatotoxicity signal',
  requiresApproval: false,
  status: 'active',
  createdAt: '2026-10-15T00:00:00.000Z',
};

beforeEach(() => {
  h.persisted = [];
  h.recs.mockReset().mockResolvedValue({
    recommendations: [PROFILE_RISK],
    generatedAt: '2026-10-15T00:00:00.000Z',
    totalGenerated: 1,
    bySeverity: { critical: 0, high: 1, medium: 0, low: 0 },
    bySource: { rules_based: 0, validation_based: 0, ai_inferred: 1 },
    assessedTypes: ['risk_mitigation', 'evidence_gap'],
    failedGenerators: [],
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('the RIM evidence chain over fixed evidence weights', () => {
  it('is persisted with no confidence, its heuristic coverage beside it, and the relevance basis kept', async () => {
    await runRIMAssessment({ organizationId: 1, projectId: 9, artifactId: 'art-1' });

    expect(h.persisted).toHaveLength(1);
    const chain = h.persisted[0] as EvidenceChain;
    expect(chain.confidenceScore, 'a coverage figure over fixed weights was stored as the chain confidence').toBeNull();
    expect(chain.evidenceCoverage).toBe(65);
    expect(chain.chainStrength).toBe('moderate');
    expect(chain.primarySource.relevanceBasis, 'rim.ts dropped the relevance basis').toBe('fixed_weight');
  });

  it('is printed for audit as heuristic evidence coverage, not as "Confidence: NN%"', async () => {
    await runRIMAssessment({ organizationId: 1, projectId: 9, artifactId: 'art-1' });
    const audit = formatEvidenceForAudit(h.persisted[0] as EvidenceChain);

    expect(audit).not.toMatch(/Confidence: \d+%/);
    expect(audit).toContain('Confidence: not assessed');
    expect(audit).toContain('Evidence coverage (heuristic, not a confidence): 65/100');
    expect(audit).toContain('Chain Strength (from that heuristic): moderate');
    expect(audit).toContain('(relevance: 0.85, fixed weight)');
  });
});

describe('formatEvidenceForAudit — the other bases', () => {
  const SOURCE = { sourceType: 'document_state' as const, sourceId: 'd1', sourceTitle: 'Protocol', relevance: 1 };

  it('a rules-based chain is deterministic and carries no heuristic', () => {
    const chain = buildEvidenceChain([SOURCE], 'rules_based');
    expect(chain.confidenceScore).toBeNull();
    expect(chain.evidenceCoverage).toBeUndefined();
    const audit = formatEvidenceForAudit(chain);
    expect(audit).toContain('Confidence: Deterministic (rules-based)');
    expect(audit).not.toContain('Evidence coverage');
    expect(audit).toContain('Chain Strength: strong');
  });

  it('a confidence the caller measured and stated is printed as one', () => {
    const chain = buildEvidenceChain([SOURCE], 'validation_based', 80);
    expect(chain.confidenceScore).toBe(80);
    expect(formatEvidenceForAudit(chain)).toContain('Confidence: 80%');
  });
});
