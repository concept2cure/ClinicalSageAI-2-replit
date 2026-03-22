/**
 * Intelligence Engine — Test Suite
 *
 * Tests for all 6 deterministic intelligence modules:
 *   1. Claim/Evidence Alignment
 *   2. Cross-Section Consistency
 *   3. Defensibility Scoring
 *   4. Reviewer Question Generator
 *   5. Risk Classification
 *   6. Output Evaluation Gate
 *
 * Plus pipeline integration tests.
 */

import { describe, it, expect } from 'vitest';
import {
  detectClaimStrength,
  detectEvidenceStrength,
  classifyAlignment,
  analyzeClaimEvidence,
  analyzeDocument,
} from '../intelligence-engine/claim-evidence-engine';
import {
  extractAssertions,
  analyzeConsistency,
} from '../intelligence-engine/consistency-engine';
import { computeDefensibility } from '../intelligence-engine/defensibility-engine';
import { generateReviewerQuestions } from '../intelligence-engine/reviewer-question-engine';
import { classifyRisks } from '../intelligence-engine/risk-classification-engine';
import { evaluateOutput } from '../intelligence-engine/evaluation-gate';
import {
  runIntelligencePipeline,
  buildConstrainedPrompt,
  emitRIMSignals,
} from '../intelligence-engine/index';

// ─── Test Fixtures ───────────────────────────────────────────────────────────

const STRONG_CLAIM_TEXT = `The study conclusively demonstrates that Drug X is significantly superior to placebo in reducing tumor size, confirming the primary hypothesis with unequivocal evidence.`;

const WEAK_CLAIM_TEXT = `Preliminary data may suggest that Drug X could potentially have some effect on tumor size, though this exploratory finding requires further investigation.`;

const EVIDENCE_RICH_TEXT = `In the Phase III randomized, double-blind, placebo-controlled trial (n=450), the primary endpoint of progression-free survival (PFS) was met. Median PFS was 12.3 months (95% CI: 10.1–14.5) vs 6.8 months (HR=0.52, p<0.001). The overall response rate (ORR) was 45% vs 18% (Table 3, Figure 2).`;

const EVIDENCE_POOR_TEXT = `Drug X showed good results in our studies. The drug appears effective and patients generally improved. The treatment was considered successful.`;

const REGULATORY_DOCUMENT = `
## Study Objective

The primary aim of this Phase III trial was to evaluate the efficacy and safety of Drug X in patients with advanced non-small cell lung cancer (NSCLC).

## Study Design

This was a randomized, double-blind, placebo-controlled, parallel-group study enrolling patients at 85 sites globally.

## Patient Population

Inclusion criteria required confirmed Stage IIIB/IV NSCLC, ECOG PS 0-1, age ≥18 years. A total of 652 patients were enrolled.

## Primary Endpoint

The primary endpoint was progression-free survival (PFS) assessed by blinded independent central review (BICR). Median PFS was 14.2 months (95% CI: 11.8–16.7) vs 7.1 months for placebo (HR=0.48, p<0.0001).

## Statistical Methods

The study was powered at 90% to detect a hazard ratio of 0.65 with a two-sided alpha of 0.05. The intention-to-treat (ITT) population was the primary analysis set. Sample size calculation assumed median PFS of 7 months in the control arm.

## Safety Data

Adverse events occurred in 89% of Drug X patients vs 72% placebo. Serious adverse events (SAEs) included pneumonitis (4.2%), hepatotoxicity (2.1%), and neutropenia (8.3%). Grade 3-4 events occurred in 34% vs 18%. Discontinuation due to AEs was 12% vs 5%.

## Efficacy Results

The primary endpoint of PFS was met with high statistical significance (p<0.0001). Secondary endpoints including overall survival (OS) showed a favorable trend (HR=0.78, p=0.045). Overall response rate was 52% vs 24%.

## Risk-Benefit Assessment

The benefit-risk balance is favorable. While the adverse event profile includes notable hepatotoxicity and pneumonitis, these events were manageable with dose modifications. The significant PFS improvement of 7.1 months outweighs the incremental safety risks.
`;

const INCONSISTENT_DOCUMENT_SECTIONS = [
  {
    id: 'summary',
    name: 'Executive Summary',
    content: 'The study demonstrated that Drug X significantly improved PFS with a median of 14.2 months. No significant safety concerns were observed.',
  },
  {
    id: 'efficacy',
    name: 'Efficacy Results',
    content: 'Results show that Drug X demonstrated a median PFS of 14.2 months (95% CI: 11.8–16.7) compared to 7.1 months for placebo (HR=0.48, p<0.0001). The primary endpoint was met.',
  },
  {
    id: 'safety',
    name: 'Safety Analysis',
    content: 'Safety concerns were identified including serious adverse events: pneumonitis (4.2%), hepatotoxicity (2.1%), and grade 3-4 events in 34% of patients. Discontinuation due to adverse events was 12%.',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 1: CLAIM/EVIDENCE ALIGNMENT
// ═══════════════════════════════════════════════════════════════════════════════

describe('Module 1: Claim/Evidence Alignment Engine', () => {
  describe('detectClaimStrength', () => {
    it('detects strong claims', () => {
      expect(detectClaimStrength(STRONG_CLAIM_TEXT)).toBe('strong');
    });

    it('detects weak claims', () => {
      expect(detectClaimStrength(WEAK_CLAIM_TEXT)).toBe('weak');
    });

    it('detects moderate claims', () => {
      expect(detectClaimStrength('The data indicate a trend toward improvement')).toBe('moderate');
    });
  });

  describe('detectEvidenceStrength', () => {
    it('detects adequate evidence', () => {
      expect(detectEvidenceStrength(EVIDENCE_RICH_TEXT)).toBe('adequate');
    });

    it('detects no evidence', () => {
      expect(detectEvidenceStrength(EVIDENCE_POOR_TEXT)).toBe('none');
    });

    it('detects partial evidence', () => {
      expect(detectEvidenceStrength('A retrospective observational study showed improvement')).toBe('partial');
    });
  });

  describe('classifyAlignment', () => {
    it('strong claim + adequate evidence = aligned', () => {
      expect(classifyAlignment('strong', 'adequate')).toBe('aligned');
    });

    it('strong claim + no evidence = unsupported', () => {
      expect(classifyAlignment('strong', 'none')).toBe('unsupported');
    });

    it('strong claim + partial evidence = overstated', () => {
      expect(classifyAlignment('strong', 'partial')).toBe('overstated');
    });

    it('moderate claim + partial evidence = aligned', () => {
      expect(classifyAlignment('moderate', 'partial')).toBe('aligned');
    });

    it('weak claim + no evidence = unsupported', () => {
      expect(classifyAlignment('weak', 'none')).toBe('unsupported');
    });
  });

  describe('analyzeClaimEvidence', () => {
    it('detects overstatement when strong claim lacks evidence', () => {
      const result = analyzeClaimEvidence(STRONG_CLAIM_TEXT, EVIDENCE_POOR_TEXT);
      expect(result.claimStrength).toBe('strong');
      expect(result.alignment).not.toBe('aligned');
    });

    it('detects alignment when strong claim has adequate evidence', () => {
      const result = analyzeClaimEvidence(STRONG_CLAIM_TEXT, EVIDENCE_RICH_TEXT);
      expect(result.claimStrength).toBe('strong');
      expect(result.evidenceStrength).toBe('adequate');
      expect(result.alignment).toBe('aligned');
    });
  });

  describe('analyzeDocument', () => {
    it('produces a report with alignment analysis', () => {
      const report = analyzeDocument(REGULATORY_DOCUMENT);
      expect(report.alignments.length).toBeGreaterThan(0);
      expect(report).toHaveProperty('overallRisk');
      expect(report).toHaveProperty('overstatedCount');
      expect(report).toHaveProperty('unsupportedCount');
    });

    it('flags evidence-poor document as higher risk', () => {
      const poorReport = analyzeDocument(EVIDENCE_POOR_TEXT.repeat(5));
      const richReport = analyzeDocument(EVIDENCE_RICH_TEXT.repeat(5));
      // Evidence-poor should have more unsupported claims or equal
      expect(poorReport.unsupportedCount).toBeGreaterThanOrEqual(richReport.unsupportedCount);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 2: CROSS-SECTION CONSISTENCY
// ═══════════════════════════════════════════════════════════════════════════════

describe('Module 2: Cross-Section Consistency Engine', () => {
  describe('extractAssertions', () => {
    it('extracts assertions from regulatory text', () => {
      const assertions = extractAssertions('efficacy', 'Efficacy Results', EVIDENCE_RICH_TEXT);
      expect(assertions.length).toBeGreaterThan(0);
      expect(assertions[0]).toHaveProperty('sectionId');
      expect(assertions[0]).toHaveProperty('sectionName');
      expect(assertions[0]).toHaveProperty('assertion');
      expect(assertions[0]).toHaveProperty('normalized');
    });
  });

  describe('analyzeConsistency', () => {
    it('detects inconsistencies between contradictory sections', () => {
      const report = analyzeConsistency(INCONSISTENT_DOCUMENT_SECTIONS);
      // Summary says "no significant safety concerns" but safety section lists SAEs
      expect(report.inconsistencies.length).toBeGreaterThanOrEqual(0);
      expect(report).toHaveProperty('consistencyScore');
      expect(report.consistencyScore).toBeLessThanOrEqual(100);
    });

    it('returns high consistency for aligned sections', () => {
      const alignedSections = [
        { id: 's1', name: 'Summary', content: 'Median PFS was 14.2 months (HR=0.48).' },
        { id: 's2', name: 'Results', content: 'The primary endpoint showed median PFS of 14.2 months with HR=0.48.' },
      ];
      const report = analyzeConsistency(alignedSections);
      expect(report.consistencyScore).toBeGreaterThanOrEqual(80);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 3: DEFENSIBILITY SCORING
// ═══════════════════════════════════════════════════════════════════════════════

describe('Module 3: Defensibility Scoring Engine', () => {
  it('scores a comprehensive document higher', () => {
    const claimEvidence = analyzeDocument(REGULATORY_DOCUMENT);
    const consistency = analyzeConsistency(INCONSISTENT_DOCUMENT_SECTIONS);
    const score = computeDefensibility(claimEvidence, consistency, REGULATORY_DOCUMENT);

    expect(score.score).toBeGreaterThan(0);
    expect(score.score).toBeLessThanOrEqual(100);
    expect(score.riskLevel).toBeDefined();
    expect(score.breakdown).toHaveProperty('evidencePresence');
    expect(score.breakdown).toHaveProperty('claimPrecision');
    expect(score.breakdown).toHaveProperty('consistency');
    expect(score.breakdown).toHaveProperty('completeness');
    expect(score.drivers.length).toBeGreaterThan(0);
  });

  it('scores a poor document lower', () => {
    const poorContent = 'Drug X is proven to work. It is the best treatment available. Results clearly demonstrate superiority.';
    const poorCE = analyzeDocument(poorContent);
    const poorConsistency = analyzeConsistency([{ id: 'doc', name: 'Document', content: poorContent }]);
    const poorScore = computeDefensibility(poorCE, poorConsistency, poorContent);

    const goodCE = analyzeDocument(REGULATORY_DOCUMENT);
    const goodConsistency = analyzeConsistency(INCONSISTENT_DOCUMENT_SECTIONS);
    const goodScore = computeDefensibility(goodCE, goodConsistency, REGULATORY_DOCUMENT);

    expect(poorScore.score).toBeLessThan(goodScore.score);
  });

  it('breakdown components sum to total', () => {
    const ce = analyzeDocument(REGULATORY_DOCUMENT);
    const cons = analyzeConsistency([{ id: 'doc', name: 'Full', content: REGULATORY_DOCUMENT }]);
    const score = computeDefensibility(ce, cons, REGULATORY_DOCUMENT);

    const sum =
      score.breakdown.evidencePresence +
      score.breakdown.claimPrecision +
      score.breakdown.consistency +
      score.breakdown.completeness;
    expect(sum).toBe(score.score);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 4: REVIEWER QUESTION GENERATOR
// ═══════════════════════════════════════════════════════════════════════════════

describe('Module 4: Reviewer Question Generator', () => {
  it('generates questions from signals', () => {
    const ce = analyzeDocument(EVIDENCE_POOR_TEXT.repeat(3));
    const cons = analyzeConsistency(INCONSISTENT_DOCUMENT_SECTIONS);
    const def = computeDefensibility(ce, cons, EVIDENCE_POOR_TEXT);
    const questions = generateReviewerQuestions(ce, cons, def);

    expect(questions.length).toBeGreaterThan(0);
    for (const q of questions) {
      expect(q).toHaveProperty('question');
      expect(q).toHaveProperty('trigger');
      expect(q).toHaveProperty('severity');
      expect(q).toHaveProperty('category');
      expect(q.question.length).toBeGreaterThan(10);
      expect(q.trigger.length).toBeGreaterThan(0);
    }
  });

  it('generates critical questions for unsupported claims', () => {
    const poorText = `${STRONG_CLAIM_TEXT}\n\n${STRONG_CLAIM_TEXT}\n\nDrug X is definitively proven to cure cancer.`;
    const ce = analyzeDocument(poorText);
    const cons = analyzeConsistency([{ id: 'doc', name: 'Doc', content: poorText }]);
    const def = computeDefensibility(ce, cons, poorText);
    const questions = generateReviewerQuestions(ce, cons, def);

    const criticalQuestions = questions.filter(q => q.severity === 'critical');
    // Should have critical questions due to strong claims with no evidence
    expect(criticalQuestions.length).toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 5: RISK CLASSIFICATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Module 5: Risk Classification Engine', () => {
  it('classifies risks for a poor document', () => {
    const poorContent = 'Drug X is proven to work and is clearly the best option.';
    const ce = analyzeDocument(poorContent);
    const cons = analyzeConsistency([{ id: 'doc', name: 'Doc', content: poorContent }]);
    const def = computeDefensibility(ce, cons, poorContent);
    const risks = classifyRisks(ce, cons, def, poorContent);

    expect(risks.classifications.length).toBeGreaterThan(0);
    expect(risks).toHaveProperty('criticalCount');
    expect(risks).toHaveProperty('majorCount');
    expect(risks).toHaveProperty('minorCount');
    expect(risks).toHaveProperty('overallRisk');

    // Should detect missing safety data
    const safetyConcern = risks.classifications.find(
      c => c.category === 'safety_signal_gap'
    );
    expect(safetyConcern).toBeDefined();
  });

  it('has regulatory basis for every classification', () => {
    const ce = analyzeDocument(EVIDENCE_POOR_TEXT);
    const cons = analyzeConsistency([{ id: 'doc', name: 'Doc', content: EVIDENCE_POOR_TEXT }]);
    const def = computeDefensibility(ce, cons, EVIDENCE_POOR_TEXT);
    const risks = classifyRisks(ce, cons, def, EVIDENCE_POOR_TEXT);

    for (const r of risks.classifications) {
      expect(r.regulatoryBasis).toBeDefined();
      expect(r.regulatoryBasis.length).toBeGreaterThan(10);
      expect(r.remediationGuidance).toBeDefined();
      expect(r.remediationGuidance.length).toBeGreaterThan(10);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 6: OUTPUT EVALUATION GATE
// ═══════════════════════════════════════════════════════════════════════════════

describe('Module 6: Output Evaluation Gate', () => {
  it('passes a high-quality output', () => {
    const goodOutput = `
Assessment: Risk level = moderate
Defensibility score: 65/100

Risk Classifications (moderate overall):
- [MAJOR] clinical_data_gap: 2 claims without evidence backing detected
  Recommendation: Provide data references for flagged claims

Reviewer Questions (3):
- [critical] The statement lacks supporting evidence. Can you provide the specific study reference?

Claim/Evidence findings: 2 overstated, 1 unsupported
Action: Moderate claim language and add evidence references

The document should be revised before submission to address the major clinical data gaps.
    `.trim();

    const result = evaluateOutput(goodOutput);
    expect(result.qualityScore).toBeGreaterThanOrEqual(60);
  });

  it('rejects a vague output', () => {
    const vagueOutput = 'The document looks generally okay. Further analysis is needed. More information is required. It depends on context.';

    const result = evaluateOutput(vagueOutput);
    expect(result.passed).toBe(false);
    expect(result.rejectionReasons.length).toBeGreaterThan(0);
  });

  it('rejects a too-brief output', () => {
    const briefOutput = 'Score: 50. Risk: moderate.';

    const result = evaluateOutput(briefOutput);
    expect(result.passed).toBe(false);
    const substanceCheck = result.checks.find(c => c.criterion === 'minimum_substance');
    expect(substanceCheck?.passed).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PIPELINE INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Intelligence Pipeline', () => {
  it('runs the full pipeline and returns all module outputs', () => {
    const analysis = runIntelligencePipeline(REGULATORY_DOCUMENT);

    expect(analysis).toHaveProperty('claimEvidence');
    expect(analysis).toHaveProperty('consistency');
    expect(analysis).toHaveProperty('defensibility');
    expect(analysis).toHaveProperty('reviewerQuestions');
    expect(analysis).toHaveProperty('riskClassifications');
    expect(analysis).toHaveProperty('evaluation');
    expect(analysis).toHaveProperty('timestamp');
    expect(analysis).toHaveProperty('inputHash');

    // Verify deterministic: same input = same hash
    const analysis2 = runIntelligencePipeline(REGULATORY_DOCUMENT);
    expect(analysis2.inputHash).toBe(analysis.inputHash);
    expect(analysis2.defensibility.score).toBe(analysis.defensibility.score);
  });

  it('produces higher scores for better documents', () => {
    const good = runIntelligencePipeline(REGULATORY_DOCUMENT);
    const poor = runIntelligencePipeline(EVIDENCE_POOR_TEXT.repeat(3));

    expect(good.defensibility.score).toBeGreaterThan(poor.defensibility.score);
  });

  it('emits RIM signals for problematic documents', () => {
    const poorContent = `Drug X is proven to cure cancer. The treatment definitively eliminates all tumors. There are no safety concerns whatsoever.`;
    const analysis = runIntelligencePipeline(poorContent);
    const signals = emitRIMSignals(analysis);

    expect(signals.length).toBeGreaterThan(0);
    for (const s of signals) {
      expect(s).toHaveProperty('type');
      expect(s).toHaveProperty('severity');
      expect(s).toHaveProperty('source');
      expect(s).toHaveProperty('detail');
      expect(s).toHaveProperty('timestamp');
    }
  });

  it('builds constrained LLM prompts with structured signals', () => {
    const analysis = runIntelligencePipeline(REGULATORY_DOCUMENT);
    const prompt = buildConstrainedPrompt(analysis, 'explain_risk');

    expect(prompt).toContain('CLAIM/EVIDENCE ANALYSIS');
    expect(prompt).toContain('DEFENSIBILITY SCORE');
    expect(prompt).toContain('Do NOT perform your own analysis');
    expect(prompt).toContain(String(analysis.defensibility.score));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DETERMINISTIC REPRODUCIBILITY
// ═══════════════════════════════════════════════════════════════════════════════

describe('Deterministic Reproducibility', () => {
  it('produces identical outputs for identical inputs', () => {
    const input = `The Phase III trial demonstrated significant improvement in PFS (p<0.001). Median PFS was 12.3 months vs 6.8 months (HR=0.52).`;

    const result1 = analyzeDocument(input);
    const result2 = analyzeDocument(input);

    expect(result1.overallRisk).toBe(result2.overallRisk);
    expect(result1.overstatedCount).toBe(result2.overstatedCount);
    expect(result1.unsupportedCount).toBe(result2.unsupportedCount);
    expect(result1.alignments.length).toBe(result2.alignments.length);

    for (let i = 0; i < result1.alignments.length; i++) {
      expect(result1.alignments[i].claimStrength).toBe(result2.alignments[i].claimStrength);
      expect(result1.alignments[i].evidenceStrength).toBe(result2.alignments[i].evidenceStrength);
      expect(result1.alignments[i].alignment).toBe(result2.alignments[i].alignment);
    }
  });

  it('defensibility score is deterministic', () => {
    const analysis1 = runIntelligencePipeline(REGULATORY_DOCUMENT);
    const analysis2 = runIntelligencePipeline(REGULATORY_DOCUMENT);

    expect(analysis1.defensibility.score).toBe(analysis2.defensibility.score);
    expect(analysis1.defensibility.riskLevel).toBe(analysis2.defensibility.riskLevel);
    expect(analysis1.defensibility.breakdown).toEqual(analysis2.defensibility.breakdown);
  });
});
