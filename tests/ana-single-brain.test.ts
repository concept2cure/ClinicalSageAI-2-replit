/**
 * AnA Single-Brain Hardening — Test Suite
 *
 * Covers:
 * 1. Evidence validation — grounding, overclaims, contradictions
 * 2. Memory acceptance — confidence scoring, dedup, contradiction checks
 * 3. Response contract — builder helpers
 * 4. Enforcement upgrades — overclaim detection, known ratio
 * 5. Auth token centralization
 *
 * @module tests/ana-single-brain.test
 */

import { describe, it, expect } from 'vitest';
import {
  validateEvidence,
  quickEvidenceCheck,
} from '../server/services/ana-ri/evidence-validation';
import {
  evaluateMemoryCandidate,
  checkForContradictions,
  type MemoryProvenance,
} from '../server/services/ana-ri/memory-acceptance';
import {
  buildQueueMeta,
  buildFallbackMarker,
  buildEmptyEvidenceVerdict,
} from '../server/services/ana-ri/response-contract';
import {
  checkEvidenceDiscipline,
  validateArtifactQuality,
} from '../server/services/ana-ri/enforcement';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_PROVENANCE: MemoryProvenance = {
  source_route: '/api/ana-ri/chat',
  model: 'claude-sonnet-4-20250514',
  provider: 'anthropic',
  evidence_validated: true,
  structure_score: 5,
  generated_at: '2026-03-30T00:00:00Z',
  triggered_by: 1,
};

const WELL_GROUNDED_RESPONSE = `
## Overall Assessment

The clinical study protocol demonstrates adequate safety monitoring. [KNOWN: Per ICH E6(R2)]
The primary endpoint is well-defined with clear statistical methods. [KNOWN: Study Protocol v3.0]

## Reviewer Concerns

The sample size calculation [INFERRED: Based on preliminary data] may be questioned by FDA reviewers.
The missing biomarker data [MISSING: No validated assay available] represents a data gap.

## Recommended Actions

- Provide additional statistical justification for the primary endpoint
- Address the biomarker gap with a bridging study plan
`;

const POORLY_GROUNDED_RESPONSE = `
## Overall Assessment

The data definitively proves the drug is safe and effective for all patient populations.
This is comprehensive evidence that meets all FDA requirements without any remaining concerns.
The study results guarantee approval with no risk of clinical hold.

## Recommended Actions

There is no additional data needed. The evidence eliminates all possible reviewer concerns.
`;

const SHORT_RESPONSE = 'Yes, that looks correct.';

// ── Evidence Validation Tests ─────────────────────────────────────────────────

describe('Evidence Validation', () => {
  it('validates a well-grounded response', () => {
    const result = validateEvidence(WELL_GROUNDED_RESPONSE);
    expect(result.attempted).toBe(true);
    expect(result.validated).toBe(true);
    expect(result.source_count).toBeGreaterThan(0);
    expect(result.grounded_claim_count).toBeGreaterThan(0);
    expect(result.provider).toBe('ana-ri');
  });

  it('flags a poorly grounded response', () => {
    const result = validateEvidence(POORLY_GROUNDED_RESPONSE);
    expect(result.attempted).toBe(true);
    expect(result.weak_or_ungrounded_claim_count).toBeGreaterThan(0);
    expect(result.reviewer_risk_summary).toBeTruthy();
  });

  it('passes short responses without deep validation', () => {
    const result = validateEvidence(SHORT_RESPONSE);
    expect(result.attempted).toBe(true);
    expect(result.validated).toBe(true);
    expect(result.source_count).toBe(0);
  });

  it('detects multiple source types', () => {
    const result = validateEvidence(WELL_GROUNDED_RESPONSE);
    expect(result.source_types.length).toBeGreaterThan(0);
    expect(result.source_types).toContain('regulatory_reference');
  });

  it('quick check detects need for attention', () => {
    const result = quickEvidenceCheck(POORLY_GROUNDED_RESPONSE);
    expect(result.hasSubstantiveClaims).toBe(true);
    expect(result.hasLabels).toBe(false);
    expect(result.needsAttention).toBe(true);
  });

  it('quick check passes labeled content', () => {
    const result = quickEvidenceCheck(WELL_GROUNDED_RESPONSE);
    expect(result.hasLabels).toBe(true);
    expect(result.labelCount).toBeGreaterThan(0);
  });
});

// ── Memory Acceptance Tests ───────────────────────────────────────────────────

describe('Memory Acceptance', () => {
  const qualitySignals = {
    evidenceValidated: true,
    structureScore: 5,
    structureMaxScore: 6,
    hasKnownLabels: true,
    hasInferredLabels: false,
    hasMissingLabels: false,
  };

  it('accepts high-confidence memory', () => {
    const result = evaluateMemoryCandidate({
      content:
        'The FDA requires bioequivalence studies for generic 505(b)(2) submissions per 21 CFR 320.',
      category: 'insight',
      provenance: BASE_PROVENANCE,
      qualitySignals,
    });
    expect(result.acceptance_status).toBe('accepted');
    expect(result.confidence_score).toBeGreaterThanOrEqual(0.7);
    expect(result.human_review_required).toBe(false);
  });

  it('rejects too-short content', () => {
    const result = evaluateMemoryCandidate({
      content: 'OK',
      category: 'insight',
      provenance: BASE_PROVENANCE,
      qualitySignals,
    });
    expect(result.acceptance_status).toBe('rejected');
    expect(result.decision_reason).toContain('too short');
  });

  it('rejects too-long content', () => {
    const result = evaluateMemoryCandidate({
      content: 'A'.repeat(6000),
      category: 'insight',
      provenance: BASE_PROVENANCE,
      qualitySignals,
    });
    expect(result.acceptance_status).toBe('rejected');
    expect(result.decision_reason).toContain('too long');
  });

  it('rejects duplicates', () => {
    const content = 'The sponsor must demonstrate bioequivalence per FDA guidance.';
    const result = evaluateMemoryCandidate({
      content,
      category: 'insight',
      provenance: BASE_PROVENANCE,
      qualitySignals,
      existingMemories: [{ id: 42, content, category: 'insight' }],
    });
    expect(result.acceptance_status).toBe('rejected');
    expect(result.decision_reason).toContain('Duplicate');
  });

  it('flags contradictions for human review', () => {
    const result = evaluateMemoryCandidate({
      content: 'The data is insufficient for approval.',
      category: 'insight',
      provenance: BASE_PROVENANCE,
      qualitySignals,
      existingMemories: [
        { id: 10, content: 'The data is sufficient for regulatory review.', category: 'insight' },
      ],
    });
    expect(result.acceptance_status).toBe('pending_review');
    expect(result.human_review_required).toBe(true);
    expect(result.contradiction_check_result.has_contradiction).toBe(true);
  });

  it('lowers confidence for unvalidated evidence', () => {
    const result = evaluateMemoryCandidate({
      content: 'The clinical data shows adequate safety margins for the proposed dose range.',
      category: 'insight',
      provenance: BASE_PROVENANCE,
      qualitySignals: { ...qualitySignals, evidenceValidated: false, hasKnownLabels: false },
    });
    expect(result.confidence_score).toBeLessThan(0.7);
  });
});

describe('Contradiction Detection', () => {
  it('detects sufficient/insufficient contradiction', () => {
    const result = checkForContradictions('The evidence is insufficient.', [
      { id: 1, content: 'The evidence is sufficient for submission.', category: 'insight' },
    ]);
    expect(result.has_contradiction).toBe(true);
    expect(result.conflicting_entry_ids).toContain(1);
  });

  it('detects compliant/non-compliant contradiction', () => {
    const result = checkForContradictions('The submission is non-compliant with ICH guidelines.', [
      {
        id: 2,
        content: 'The package is compliant with regulatory requirements.',
        category: 'decision',
      },
    ]);
    expect(result.has_contradiction).toBe(true);
  });

  it('does not flag non-contradictory memories', () => {
    const result = checkForContradictions('The safety data shows a favorable profile.', [
      { id: 3, content: 'The efficacy data supports the primary endpoint.', category: 'insight' },
    ]);
    expect(result.has_contradiction).toBe(false);
  });
});

// ── Response Contract Tests ───────────────────────────────────────────────────

describe('Response Contract', () => {
  it('builds queue metadata for successful turn', () => {
    const meta = buildQueueMeta({ threadId: 'thread_123' });
    expect(meta.thread_id).toBe('thread_123');
    expect(meta.handoff_ready).toBe(true);
    expect(meta.turn_status).toBe('completed');
    expect(meta.can_process_next).toBe(true);
    expect(meta.blocked_reason).toBeNull();
  });

  it('builds queue metadata for blocked turn', () => {
    const meta = buildQueueMeta({
      threadId: 'thread_456',
      persistenceFailed: true,
    });
    expect(meta.handoff_ready).toBe(false);
    expect(meta.turn_status).toBe('blocked');
    expect(meta.blocked_reason).toBe('thread_persistence_failed');
  });

  it('builds queue metadata with error reason', () => {
    const meta = buildQueueMeta({
      threadId: null,
      error: 'gateway_timeout',
    });
    expect(meta.turn_status).toBe('blocked');
    expect(meta.blocked_reason).toBe('gateway_timeout');
  });

  it('builds fallback marker', () => {
    const marker = buildFallbackMarker('ana_ri_unavailable', '/api/ana-ri/stream');
    expect(marker?.active).toBe(true);
    expect(marker?.original_path).toBe('/api/ana-ri/stream');
    expect(marker?.degraded_capabilities).toContain('orchestration');
    expect(marker?.degraded_capabilities).toContain('evidence_validation');
  });

  it('builds empty evidence verdict', () => {
    const verdict = buildEmptyEvidenceVerdict();
    expect(verdict.attempted).toBe(false);
    expect(verdict.validated).toBe(false);
    expect(verdict.source_count).toBe(0);
    expect(verdict.provider).toBe('none');
  });
});

// ── Enforcement Upgrade Tests ─────────────────────────────────────────────────

describe('Evidence Discipline (Upgraded)', () => {
  it('detects overclaims when no KNOWN labels exist', () => {
    const response = `## Assessment\n\nThe data definitively proves safety across all patient populations examined in the registrational program. **This is comprehensive evidence** that eliminates all risk of adverse cardiac events during long-term treatment.\n\nThe clinical benefit has been unequivocally demonstrated in pivotal trials, and there is zero concern about the tolerability profile in the target population.\n\n## Reviewer Concerns\nNo significant reviewer concerns are anticipated based on the available dataset.\n\n## Recommended Actions\nNone needed — the evidence base is complete and fully validated.`;
    const result = checkEvidenceDiscipline(response);
    expect(result.hasOverclaims).toBe(true);
    expect(result.overclaimCount).toBeGreaterThan(0);
    expect(result.compliant).toBe(false);
  });

  it('allows strong language when KNOWN labels are present', () => {
    const response = `## Assessment\n\n[KNOWN: Study 301 results] The data demonstrates comprehensive evidence of safety across all age groups.\n\n## Reviewer Concerns\n[INFERRED] Minor concerns about dosing.\n\n## Recommended Actions\nSubmit as planned.`;
    const result = checkEvidenceDiscipline(response);
    expect(result.hasOverclaims).toBe(false);
    expect(result.knownCount).toBeGreaterThan(0);
  });

  it('reports known ratio', () => {
    const response = `## Assessment\n\n[KNOWN: ICH E6] Safety is adequate.\n[INFERRED: Based on precedent] Efficacy likely meets threshold.\n[MISSING: Long-term data] No 2-year data yet.\n\n## Risks\nSome risk items.\n\n## Recommended Actions\nProceed with caution.`;
    const result = checkEvidenceDiscipline(response);
    expect(result.knownRatio).toBeGreaterThan(0);
    expect(result.knownRatio).toBeLessThanOrEqual(1);
    expect(result.totalLabels).toBe(3);
  });

  it('passes a compliant response', () => {
    const response = `## Assessment\n\n[KNOWN: Protocol v2.0] The primary endpoint is defined.\n\n## Reviewer Concerns\n[INFERRED] Reviewers may question sample size.\n\n## Recommended Actions\nProvide power analysis.`;
    const result = checkEvidenceDiscipline(response);
    expect(result.compliant).toBe(true);
    expect(result.hasUnlabeledClaims).toBe(false);
  });

  it('detects superlative claims without KNOWN labels', () => {
    const response = `## Assessment\n\nThis is the best approach for managing **risk** in regulatory submissions. The most effective strategy eliminates uncertainty and ensures a clean pathway.\n\n## Reviewer Concerns\nUnlikely to trigger concerns.\n\n## Recommended Actions\nProceed immediately.`;
    const result = checkEvidenceDiscipline(response);
    expect(result.hasOverclaims).toBe(true);
    expect(result.compliant).toBe(false);
  });

  it('detects false equivalence claims without KNOWN labels', () => {
    const response = `## Assessment\n\nThe device is equivalent to the predicate in all material respects. The **safety** profile is identical to the marketed reference device. Performance testing confirms equivalent results across all endpoints evaluated.\n\n## Reviewer Concerns\nNone expected.\n\n## Recommended Actions\nSubmit 510(k) with confidence.`;
    const result = checkEvidenceDiscipline(response);
    expect(result.hasOverclaims).toBe(true);
    expect(result.compliant).toBe(false);
  });

  it('detects confabulation patterns without KNOWN labels', () => {
    const response = `## Assessment\n\nStudies show that this approach significantly reduces **risk** of adverse events in the target population. Research confirms that the mechanism of action is well-understood.\n\n## Reviewer Concerns\nMinimal.\n\n## Recommended Actions\nNo additional studies needed.`;
    const result = checkEvidenceDiscipline(response);
    expect(result.hasOverclaims).toBe(true);
    expect(result.compliant).toBe(false);
  });

  it('allows superlatives when KNOWN labels back claims', () => {
    const response = `## Assessment\n\n[KNOWN: FDA guidance 2024] This is the best approach for **risk** management per current regulatory standards.\n\n## Reviewer Concerns\n[INFERRED] May request additional justification.\n\n## Recommended Actions\nPrepare supplemental materials.`;
    const result = checkEvidenceDiscipline(response);
    expect(result.hasOverclaims).toBe(false);
    expect(result.compliant).toBe(true);
  });

  it('handles mixed overclaim patterns (multiple hits)', () => {
    const response = `## Assessment\n\nThe definitive evidence establishes **safety** beyond doubt. Studies confirm that this is the only approach with zero risk. The data guarantees regulatory approval.\n\n## Reviewer Concerns\nThere is no concern about the submission.\n\n## Recommended Actions\nNone — evidence is absolute.`;
    const result = checkEvidenceDiscipline(response);
    expect(result.overclaimCount).toBeGreaterThanOrEqual(3);
    expect(result.compliant).toBe(false);
  });
});

// ── Artifact Quality Gate Tests ──────────────────────────────────────────────

describe('Artifact Quality Gate', () => {
  it('rejects very short content', () => {
    const result = validateArtifactQuality('Short.', 'risk_memo');
    expect(result.pass).toBe(false);
    expect(result.grade).toBe('rejected');
  });

  it('rejects content with excessive filler', () => {
    const content = `## Assessment\n\nI'd be happy to help with this analysis. Let me know if you'd like more details. Feel free to ask questions. Here's an example of a risk memo.\n\nI hope this helps! Don't hesitate to reach out. As an AI, I cannot provide medical advice.\n\n## Recommended Actions\nTBD`;
    const result = validateArtifactQuality(content, 'general');
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('passes well-structured analytical content', () => {
    const content = `## Risk Assessment\n\nThe primary safety signal involves hepatotoxicity based on preclinical findings.\n\n[KNOWN: Study 101] Dose-dependent ALT elevations observed in 12% of subjects.\n[INFERRED: Mechanistic analysis] Likely related to CYP3A4 metabolism.\n[MISSING: Long-term data] No 12-month hepatic monitoring data available.\n\n## Root Cause Analysis\n\nThe hepatotoxicity is driven by reactive metabolite formation due to CYP3A4-mediated oxidation at the para-hydroxyl position. This mechanism is consistent with ICH S7A guidance on safety pharmacology.\n\n## Recommended Actions\n\n1. Conduct a dedicated hepatic safety study per FDA guidance\n2. Provide PK/PD modeling data to support dose justification\n3. Draft a risk management plan per ICH E2E`;
    const result = validateArtifactQuality(content, 'risk_memo');
    expect(result.pass).toBe(true);
    expect(result.grade).toBe('high');
  });

  it('flags content missing semantic depth for analytical types', () => {
    const content = `## Risk Assessment\n\nThere are some risks. The product has issues.\n\n## Concerns\n\nReviewers might have questions.\n\n## Recommended Actions\n\nDo more work on the submission. Gather additional data. Review the guidelines.`;
    const result = validateArtifactQuality(content, 'risk_memo');
    expect(result.issues.some(i => i.includes('semantic depth'))).toBe(true);
  });
});
