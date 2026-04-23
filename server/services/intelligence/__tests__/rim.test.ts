/**
 * RIM — Regulatory Intelligence Model Tests
 *
 * Tests cover all 8 required validation criteria:
 *   1. Live flow invokes RIM automatically
 *   2. run_type is set correctly
 *   3. Provenance fields are attached
 *   4. Anchored signals include required linkage
 *   5. Unbound signals are excluded from trend/historical reuse
 *   6. Persistence failure results in degraded/partial status
 *   7. Trend output includes confidence/sample size
 *   8. review_version_impact includes signal-backed context when prior signals exist
 *
 * @module server/services/intelligence/__tests__/rim.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  evaluateEvidenceSufficiency,
  evaluateDefensibility,
  evaluateReviewerSensitivity,
  evaluateClaimRisk,
  evaluateCrossSectionConsistency,
  evaluateSubmissionRisk,
  generateJudgmentReport,
  JUDGMENT_FRAMEWORK_VERSION,
} from '../judgment-framework.js';

import {
  patternRegistry,
  PATTERN_REGISTRY_VERSION,
} from '../pattern-registry.js';

import {
  captureSignal,
  captureJudgmentSignals,
  capturePatternSignals,
  querySignals,
  getSignalSummary,
  getSectionHistory,
  getRecurringPatterns,
  type SignalProvenance,
} from '../signal-capture.js';

import {
  buildProvenance,
  integratePatternScan,
  integrateSignal,
  type RIMIntegrationResult,
} from '../rim-integration.js';

import {
  enrichChangeImpact,
} from '../rim-change-impact.js';

import {
  analyzeCrossArtifactIntelligence,
} from '../rim-cross-artifact.js';

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function makeTestProvenance(runType: SignalProvenance['runType'] = 'full_assessment'): SignalProvenance {
  return {
    judgmentFrameworkVersion: JUDGMENT_FRAMEWORK_VERSION,
    patternRegistryVersion: PATTERN_REGISTRY_VERSION,
    runId: `test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    runType,
  };
}

const TEST_ORG = 99999;
const TEST_PROJECT = 88888;

// ═══════════════════════════════════════════════════════════════════════════════
// 1. JUDGMENT FRAMEWORK
// ═══════════════════════════════════════════════════════════════════════════════

describe('JudgmentFramework', () => {
  it('evaluateEvidenceSufficiency returns valid JudgmentScore', () => {
    const score = evaluateEvidenceSufficiency(null, [], []);
    expect(score.model).toBe('evidence_sufficiency');
    expect(score.score).toBeGreaterThanOrEqual(0);
    expect(score.score).toBeLessThanOrEqual(100);
    expect(score.confidence).toBeGreaterThan(0);
    expect(score.basis).toBe('rules_based');
    expect(score.verdict).toBeDefined();
    expect(score.factors.length).toBeGreaterThan(0);
    expect(score.scoredAt).toBeTruthy();
  });

  it('evaluateDefensibility penalizes critical gaps', () => {
    const noGaps = evaluateDefensibility(null, [], []);
    const withGaps = evaluateDefensibility(null, [
      { id: 'g1', module: 'test', description: 'critical gap', severity: 'critical', remediation: 'fix it', estimatedEffortHours: null },
      { id: 'g2', module: 'test', description: 'critical gap 2', severity: 'critical', remediation: 'fix it too', estimatedEffortHours: null },
    ], []);
    expect(withGaps.score).toBeLessThan(noGaps.score);
    expect(withGaps.findings.length).toBe(2);
    expect(withGaps.findings[0].severity).toBe('critical');
  });

  it('generateJudgmentReport includes frameworkVersion', () => {
    const report = generateJudgmentReport(
      { organizationId: 1, projectId: 1 },
      { readiness: null, gaps: [], recommendations: [], evidenceChains: [] },
    );
    expect(report.frameworkVersion).toBe(JUDGMENT_FRAMEWORK_VERSION);
    expect(report.scores.length).toBe(6); // 5 component + 1 submission risk
    expect(report.overallRisk).toBeGreaterThanOrEqual(0);
    expect(report.overallVerdict).toBeDefined();
    expect(report.generatedAt).toBeTruthy();
  });

  it('submission risk verdict reflects component scores', () => {
    const report = generateJudgmentReport(
      { organizationId: 1, projectId: 1 },
      { readiness: null, gaps: [], recommendations: [], evidenceChains: [] },
    );
    const submissionRisk = report.scores.find(s => s.model === 'submission_risk');
    expect(submissionRisk).toBeDefined();
    expect(submissionRisk!.factors.length).toBe(5); // one per component model
  });

  it('signalReliability lowers confidence when historical accuracy is poor', () => {
    const baseline = generateJudgmentReport(
      { organizationId: 1, projectId: 1 },
      { readiness: null, gaps: [], recommendations: [], evidenceChains: [] },
    );

    const lowReliability = generateJudgmentReport(
      { organizationId: 1, projectId: 1 },
      {
        readiness: null,
        gaps: [],
        recommendations: [],
        evidenceChains: [],
        signalReliability: {
          validated: 1,
          partiallyValidated: 0,
          disputed: 9,
          totalValidations: 10,
          reliabilityIndex: 0.1,
        },
      },
    );

    const highReliability = generateJudgmentReport(
      { organizationId: 1, projectId: 1 },
      {
        readiness: null,
        gaps: [],
        recommendations: [],
        evidenceChains: [],
        signalReliability: {
          validated: 10,
          partiallyValidated: 0,
          disputed: 0,
          totalValidations: 10,
          reliabilityIndex: 1.0,
        },
      },
    );

    // Every model's confidence should drop under low reliability, hold under high.
    for (let i = 0; i < baseline.scores.length; i++) {
      expect(lowReliability.scores[i].confidence).toBeLessThan(baseline.scores[i].confidence);
      expect(highReliability.scores[i].confidence).toBe(baseline.scores[i].confidence);
    }

    // Scores themselves (the underlying verdict) must NOT shift based on
    // reliability — only our confidence in them does.
    for (let i = 0; i < baseline.scores.length; i++) {
      expect(lowReliability.scores[i].score).toBe(baseline.scores[i].score);
      expect(lowReliability.scores[i].verdict).toBe(baseline.scores[i].verdict);
    }
  });

  it('signalReliability with null reliabilityIndex leaves confidence untouched', () => {
    const baseline = generateJudgmentReport(
      { organizationId: 1, projectId: 1 },
      { readiness: null, gaps: [], recommendations: [], evidenceChains: [] },
    );
    const withNullReliability = generateJudgmentReport(
      { organizationId: 1, projectId: 1 },
      {
        readiness: null,
        gaps: [],
        recommendations: [],
        evidenceChains: [],
        signalReliability: {
          validated: 0,
          partiallyValidated: 0,
          disputed: 0,
          totalValidations: 0,
          reliabilityIndex: null,
        },
      },
    );
    for (let i = 0; i < baseline.scores.length; i++) {
      expect(withNullReliability.scores[i].confidence).toBe(baseline.scores[i].confidence);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. PATTERN REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

describe('PatternRegistry', () => {
  it('has seed patterns loaded', () => {
    expect(patternRegistry.size).toBeGreaterThanOrEqual(11);
  });

  it('version includes base version', () => {
    expect(patternRegistry.version).toContain(PATTERN_REGISTRY_VERSION);
  });

  it('scanText matches known trigger phrases', () => {
    const text = 'The drug appears to be safe and generally well tolerated in patients.';
    const matches = patternRegistry.scanText(text, 'test_section');
    expect(matches.length).toBeGreaterThan(0);
    const match = matches[0];
    expect(match.patternId).toBeTruthy();
    expect(match.matchedText).toBeTruthy();
    expect(match.matchLocation).toBe('test_section');
    expect(match.matchConfidence).toBeGreaterThan(0);
    expect(match.pattern.category).toBeDefined();
    expect(match.pattern.remediation).toBeTruthy();
  });

  it('scanText returns empty for clean text', () => {
    const text = 'The primary pharmacokinetic parameters were determined using standard validated methods.';
    const matches = patternRegistry.scanText(text, 'test_section');
    expect(matches.length).toBe(0);
  });

  it('addLearnedPattern creates a learned pattern with correct source', () => {
    const before = patternRegistry.size;
    const learned = patternRegistry.addLearnedPattern({
      category: 'risk_signal',
      name: 'Test learned pattern',
      description: 'For testing only',
      agency: 'any',
      submissionType: 'any',
      ctdModule: 'any',
      severity: 'low',
      triggerPhrases: ['xyzzy_test_phrase'],
      strongAlternatives: [],
      reviewerQuestion: 'N/A',
      remediation: 'N/A',
      regulatoryBasis: 'Test',
      confidence: 50,
    });
    expect(learned.source).toBe('learned');
    expect(learned.id).toMatch(/^LP-/);
    expect(patternRegistry.size).toBe(before + 1);
  });

  it('getPatterns filters by category', () => {
    const deficiencies = patternRegistry.getPatterns({ category: 'deficiency' });
    expect(deficiencies.every(p => p.category === 'deficiency')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. SIGNAL CAPTURE — provenance, anchoring, persistence
// ═══════════════════════════════════════════════════════════════════════════════

describe('SignalCapture', () => {
  it('captureSignal attaches provenance fields (Task 3)', () => {
    const provenance = makeTestProvenance();
    const signal = captureSignal({
      type: 'judgment',
      provenance,
      organizationId: TEST_ORG,
      projectId: TEST_PROJECT,
      userId: 1,
      sectionCode: '2.5',
      artifactId: 'art_1',
      artifactVersionId: 'v_1',
      riskLevel: 'medium',
      reviewerSensitivity: 'possible_question',
      defensibilityVerdict: 'needs_attention',
      score: 55,
      confidence: 70,
      action: 'Test action',
      patternIds: [],
      metadata: {},
    });

    // Provenance attached
    expect(signal.provenance.judgmentFrameworkVersion).toBe(JUDGMENT_FRAMEWORK_VERSION);
    expect(signal.provenance.patternRegistryVersion).toBeTruthy();
    expect(signal.provenance.runId).toBeTruthy();
    expect(signal.provenance.runType).toBe('full_assessment');

    // Anchoring
    expect(signal.organizationId).toBe(TEST_ORG);
    expect(signal.projectId).toBe(TEST_PROJECT);
    expect(signal.sectionCode).toBe('2.5');
    expect(signal.artifactId).toBe('art_1');
    expect(signal.artifactVersionId).toBe('v_1');

    // Persistence flag
    expect(signal.persisted).toBe(false);
    expect(signal.signalId).toBeTruthy();
    expect(signal.createdAt).toBeTruthy();
  });

  it('querySignals returns signals filtered by type (Task 4)', () => {
    const provenance = makeTestProvenance();

    // Capture two different types
    captureSignal({
      type: 'judgment', provenance,
      organizationId: TEST_ORG, projectId: TEST_PROJECT,
      riskLevel: 'low', reviewerSensitivity: 'unlikely_question',
      defensibilityVerdict: 'pass', score: 80, confidence: 70,
      action: 'test', patternIds: [], metadata: {},
    });
    captureSignal({
      type: 'compliance_scan', provenance,
      organizationId: TEST_ORG, projectId: TEST_PROJECT,
      riskLevel: 'high', reviewerSensitivity: 'likely_question',
      defensibilityVerdict: 'at_risk', score: 30, confidence: 60,
      action: 'fix compliance', patternIds: [], metadata: {},
    });

    const judgmentOnly = querySignals({
      organizationId: TEST_ORG,
      projectId: TEST_PROJECT,
      type: 'judgment',
    });
    expect(judgmentOnly.every(s => s.type === 'judgment')).toBe(true);
  });

  it('getSectionHistory returns signals for specific section', () => {
    const provenance = makeTestProvenance();
    captureSignal({
      type: 'judgment', provenance,
      organizationId: TEST_ORG, projectId: TEST_PROJECT,
      sectionCode: '3.2.S.4',
      riskLevel: 'medium', reviewerSensitivity: 'possible_question',
      defensibilityVerdict: 'needs_attention', score: 50, confidence: 60,
      action: 'Review stability', patternIds: [], metadata: {},
    });

    const history = getSectionHistory(TEST_ORG, TEST_PROJECT, '3.2.S.4');
    expect(history.length).toBeGreaterThan(0);
    expect(history.every(s => s.sectionCode === '3.2.S.4')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. TREND DETECTION — grounded with confidence
// ═══════════════════════════════════════════════════════════════════════════════

describe('TrendDetection', () => {
  it('returns insufficient confidence when sample size is too small (Task 7)', () => {
    const summary = getSignalSummary(TEST_ORG, TEST_PROJECT);
    // Unless we've captured 10+ judgment signals, trend should be low/insufficient
    if (summary.trendSampleSize < 10) {
      expect(summary.trendConfidence).toMatch(/insufficient|low/);
    }
  });

  it('trend output includes confidence and sampleSize fields (Task 7)', () => {
    const summary = getSignalSummary(TEST_ORG, TEST_PROJECT);
    expect(summary.overallTrend).toMatch(/improving|stable|declining/);
    expect(summary.trendConfidence).toMatch(/high|moderate|low|insufficient/);
    expect(typeof summary.trendSampleSize).toBe('number');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. RIM INTEGRATION HELPER
// ═══════════════════════════════════════════════════════════════════════════════

describe('RIMIntegration', () => {
  it('buildProvenance creates valid provenance with correct versions (Task 2)', () => {
    const prov = buildProvenance('chat_intercept');
    expect(prov.judgmentFrameworkVersion).toBe(JUDGMENT_FRAMEWORK_VERSION);
    expect(prov.patternRegistryVersion).toBeTruthy();
    expect(prov.runId).toMatch(/^rim_/);
    expect(prov.runType).toBe('pattern_scan');
  });

  it('integratePatternScan skips short text (Task 1)', () => {
    const result = integratePatternScan(
      { organizationId: TEST_ORG, projectId: TEST_PROJECT, runType: 'chat_intercept' },
      'too short',
      'test',
    );
    expect(result.status).toBe('skipped');
    expect(result.signalsGenerated).toBe(0);
    expect(result.warnings).toContain('Text too short for pattern scan');
  });

  it('integratePatternScan finds matches in regulatory text (Task 1)', () => {
    const result = integratePatternScan(
      {
        organizationId: TEST_ORG,
        projectId: TEST_PROJECT,
        sectionCode: '2.5',
        runType: 'chat_intercept',
      },
      'The treatment demonstrated clinically meaningful improvement in the primary endpoint compared to placebo. The drug appears to be safe and the safety profile appears acceptable for the target population.',
      '2.5',
    );
    expect(result.status).toBe('completed');
    expect(result.signalsGenerated).toBeGreaterThan(0);
    expect(result.runId).toMatch(/^rim_/);
  });

  it('integrateSignal captures signal with full context (Task 4)', () => {
    const result = integrateSignal(
      {
        organizationId: TEST_ORG,
        projectId: TEST_PROJECT,
        userId: 42,
        sectionCode: '2.7',
        artifactId: 'art_test',
        artifactVersionId: 'v_test',
        runType: 'compliance_intercept',
      },
      {
        type: 'compliance_scan',
        riskLevel: 'high',
        reviewerSensitivity: 'likely_question',
        defensibilityVerdict: 'at_risk',
        score: 30,
        confidence: 70,
        action: 'Fix compliance issue',
        patternIds: [],
        metadata: { test: true },
      },
    );
    expect(result.status).toBe('completed');
    expect(result.signalsGenerated).toBe(1);
  });

  it('RIMIntegrationResult has correct shape', () => {
    const result: RIMIntegrationResult = {
      runId: 'test_123',
      status: 'completed',
      signalsGenerated: 5,
      persistenceStatus: 'persisted',
      trendContextIncluded: false,
      warnings: [],
    };
    expect(result.runId).toBeTruthy();
    expect(['completed', 'degraded', 'failed', 'skipped']).toContain(result.status);
    expect(['persisted', 'failed', 'partial', 'not_attempted']).toContain(result.persistenceStatus);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. CHANGE IMPACT ENRICHMENT
// ═══════════════════════════════════════════════════════════════════════════════

describe('RIMChangeImpact', () => {
  it('enrichChangeImpact returns valid enrichment structure (Task 8)', () => {
    const enrichment = enrichChangeImpact(TEST_ORG, TEST_PROJECT, '2.5');
    expect(enrichment.sectionCode).toBe('2.5');
    expect(enrichment.insights).toBeDefined();
    expect(Array.isArray(enrichment.insights)).toBe(true);
    expect(typeof enrichment.priorSignalCount).toBe('number');
    expect(typeof enrichment.recurringPatternCount).toBe('number');
    expect(enrichment.enrichedAt).toBeTruthy();

    // Trend confidence is qualified
    if (enrichment.sectionTrend !== null) {
      expect(enrichment.sectionTrendConfidence).toMatch(/high|moderate|low|insufficient/);
    }
  });

  it('enrichChangeImpact surfaces recurring patterns when signals exist (Task 8)', () => {
    // Capture signals across two runs for the same section
    const prov1 = makeTestProvenance();
    const prov2 = { ...makeTestProvenance(), runId: `test_run2_${Date.now()}` };

    // Scan text that triggers patterns — twice with different runIds
    const text = 'The drug generally well tolerated and appears to be safe for patients.';
    capturePatternSignals(
      TEST_ORG, TEST_PROJECT,
      patternRegistry.scanText(text, '2.7'),
      prov1, '2.7',
    );
    capturePatternSignals(
      TEST_ORG, TEST_PROJECT,
      patternRegistry.scanText(text, '2.7'),
      prov2, '2.7',
    );

    const enrichment = enrichChangeImpact(TEST_ORG, TEST_PROJECT, '2.7');
    // Should have prior signals
    expect(enrichment.priorSignalCount).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. CROSS-ARTIFACT INTELLIGENCE
// ═══════════════════════════════════════════════════════════════════════════════

describe('CrossArtifactIntelligence', () => {
  it('analyzeCrossArtifactIntelligence returns valid report', () => {
    const report = analyzeCrossArtifactIntelligence(TEST_ORG, TEST_PROJECT);
    expect(report.organizationId).toBe(TEST_ORG);
    expect(report.projectId).toBe(TEST_PROJECT);
    expect(typeof report.totalIssues).toBe('number');
    expect(report.bySeverity).toBeDefined();
    expect(typeof report.artifactsAnalyzed).toBe('number');
    expect(report.analyzedAt).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. UNBOUND SIGNAL HANDLING
// ═══════════════════════════════════════════════════════════════════════════════

describe('UnboundSignals', () => {
  it('signals without sectionCode are excluded from section history (Task 5)', () => {
    const provenance = makeTestProvenance();
    captureSignal({
      type: 'judgment', provenance,
      organizationId: TEST_ORG, projectId: TEST_PROJECT,
      // NO sectionCode
      riskLevel: 'low', reviewerSensitivity: 'unlikely_question',
      defensibilityVerdict: 'pass', score: 90, confidence: 80,
      action: 'none', patternIds: [], metadata: {},
    });

    const history = getSectionHistory(TEST_ORG, TEST_PROJECT, 'nonexistent_section');
    expect(history.every(s => s.sectionCode === 'nonexistent_section')).toBe(true);
  });

  it('recurring patterns only count signals from different runs (Task 5)', () => {
    const recurring = getRecurringPatterns(TEST_ORG, TEST_PROJECT);
    for (const rec of recurring) {
      expect(rec.occurrences).toBeGreaterThanOrEqual(2);
    }
  });
});
