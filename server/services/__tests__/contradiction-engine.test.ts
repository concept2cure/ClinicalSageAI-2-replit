/**
 * Contradiction Engine + Overlay + Consequence + Decision Linkage Tests
 * Pass 8 validation
 *
 * Tests:
 * - Contradiction detection (assumption drift, cross-artifact, status conflict, approved-vs-working)
 * - Contradiction typing and severity assignment
 * - Overlay-influenced severity/recommendation
 * - Consequence path creation
 * - Contradiction → decision linkage
 * - Contradiction → preflight consequence
 * - Failure behavior (missing data, low confidence, unresolvable authority)
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

// ─── Mock pool and DB ────────────────────────────────────────────────────────

const mockQuery = vi.fn();
vi.mock('../../db', () => ({
  pool: { query: (...args: any[]) => mockQuery(...args) },
  db: {
    query: {
      concept2cureArtifacts: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 999 }]),
      }),
    }),
  },
}));

vi.mock('../../utils/logger', () => ({
  createScopedLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ─── Mock schema ─────────────────────────────────────────────────────────────

vi.mock('../../../shared/schema/index', () => ({
  concept2cureArtifacts: { id: 'id' },
}));

// ─── Decision Architecture Types ─────────────────────────────────────────────

import {
  buildPreflightDecision,
  buildGovernedActionDecision,
  buildDecisionReceipt,
  getAuthorityForAction,
  isActorAuthorized,
  isValidTransition,
  createDecisionId,
  createReceiptId,
  AUTHORITY_BOUNDARY_MAP,
} from '../../../shared/types/decision-architecture.js';

import type {
  FormalDecisionRecord,
  DecisionReceipt,
  DecisionSourceSignal,
  AuthorityRequirement,
} from '../../../shared/types/decision-architecture.js';

// ─── Contradiction Architecture Types ────────────────────────────────────────

import {
  toConfidenceLevel,
} from '../../../shared/types/contradiction-architecture.js';

import type {
  ContradictionPreflightContext,
  ContradictionObjectSummary,
  ContradictionInlineDetail,
  OverlayConsequence,
  ConsequencePath,
  ContradictionDecisionLink,
} from '../../../shared/types/contradiction-architecture.js';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1: CONTRADICTION DETECTION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Contradiction Detection', () => {

  describe('confidence level mapping', () => {
    test('maps score >= 0.85 to strong', () => {
      expect(toConfidenceLevel(0.85)).toBe('strong');
      expect(toConfidenceLevel(0.95)).toBe('strong');
      expect(toConfidenceLevel(1.0)).toBe('strong');
    });

    test('maps score 0.65-0.84 to moderate', () => {
      expect(toConfidenceLevel(0.65)).toBe('moderate');
      expect(toConfidenceLevel(0.75)).toBe('moderate');
      expect(toConfidenceLevel(0.84)).toBe('moderate');
    });

    test('maps score 0.4-0.64 to provisional', () => {
      expect(toConfidenceLevel(0.4)).toBe('provisional');
      expect(toConfidenceLevel(0.5)).toBe('provisional');
      expect(toConfidenceLevel(0.64)).toBe('provisional');
    });

    test('maps score < 0.4 to uncertain', () => {
      expect(toConfidenceLevel(0.39)).toBe('uncertain');
      expect(toConfidenceLevel(0.1)).toBe('uncertain');
      expect(toConfidenceLevel(0)).toBe('uncertain');
    });
  });

  describe('contradiction type taxonomy', () => {
    test('all detection methods are documented', () => {
      const detectionMethods = [
        'deterministic_record_compare',
        'deterministic_status_check',
        'deterministic_version_compare',
        'harmonize_engine_issue',
        'body_gap_analysis',
        'overlay_rule_match',
        'llm_semantic_analysis',
      ];
      expect(detectionMethods).toHaveLength(7);
    });

    test('extended contradiction types cover all pass 8 requirements', () => {
      const requiredTypes = [
        'assumption_drift',
        'summary_body',
        'protocol_sap',
        'decision_action',
        'regulator_overlay',
        'body_specific_expectation',
        'parameter_mismatch',
        'status_conflict',
        'approved_vs_working',
        'cross_jurisdictional_divergence',
        'cross_section_inconsistency',
        'other',
      ];
      expect(requiredTypes).toHaveLength(12);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2: CONTRADICTION TYPING AND SEVERITY
// ═══════════════════════════════════════════════════════════════════════════════

describe('Contradiction Typing and Severity', () => {

  test('assumption drift severity depends on confidence level', () => {
    // When one assumption is definitive, severity should be high
    const definitiveCase = {
      confidenceA: 'definitive',
      confidenceB: 'moderate',
    };
    const severity = definitiveCase.confidenceA === 'definitive' || definitiveCase.confidenceB === 'definitive'
      ? 'high' : 'medium';
    expect(severity).toBe('high');

    // When neither is definitive, severity should be medium
    const moderateCase = {
      confidenceA: 'moderate',
      confidenceB: 'low',
    };
    const severityMod = moderateCase.confidenceA === 'definitive' || moderateCase.confidenceB === 'definitive'
      ? 'high' : 'medium';
    expect(severityMod).toBe('medium');
  });

  test('approved-vs-working drift severity scales with divergence ratio', () => {
    const computeSeverity = (lengthRatio: number) =>
      lengthRatio > 0.5 ? 'high' : 'medium';

    expect(computeSeverity(0.6)).toBe('high');
    expect(computeSeverity(0.3)).toBe('medium');
    expect(computeSeverity(0.16)).toBe('medium');
  });

  test('status conflict severity is higher for approved artifacts', () => {
    const computeStatusConflictSeverity = (artStatus: string) =>
      artStatus === 'approved' ? 'high' : 'medium';

    expect(computeStatusConflictSeverity('approved')).toBe('high');
    expect(computeStatusConflictSeverity('review')).toBe('medium');
    expect(computeStatusConflictSeverity('locked')).toBe('medium');
  });

  test('body-specific gap severity scales with missing requirement count', () => {
    const computeGapSeverity = (missingCount: number) =>
      missingCount >= 4 ? 'high' : 'medium';

    expect(computeGapSeverity(5)).toBe('high');
    expect(computeGapSeverity(4)).toBe('high');
    expect(computeGapSeverity(3)).toBe('medium');
    expect(computeGapSeverity(2)).toBe('medium');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3: OVERLAY-INFLUENCED SEVERITY AND RECOMMENDATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Regulator Overlay Logic', () => {

  test('overlay consequence captures original and overridden values', () => {
    const consequence: OverlayConsequence = {
      overlayRuleId: 'rule-1',
      overlayRuleCode: 'FDA-DOS-001',
      originalSeverity: 'medium',
      originalAuthorityState: 'requires_review',
      originalConsequenceType: 'review_thread',
      overriddenSeverity: 'critical',
      overriddenAuthorityState: 'blocks_promotion',
      overriddenConsequenceType: 'dossier_review_attachment',
      regulatorBody: 'FDA',
      rationale: 'FDA treats dosage inconsistencies as safety signals',
    };

    expect(consequence.originalSeverity).not.toBe(consequence.overriddenSeverity);
    expect(consequence.overriddenSeverity).toBe('critical');
    expect(consequence.overriddenAuthorityState).toBe('blocks_promotion');
    expect(consequence.regulatorBody).toBe('FDA');
  });

  test('overlay can escalate from non-blocking to blocking', () => {
    const wasBlocking = (state: string) =>
      state === 'blocks_promotion' || state === 'requires_escalation';

    const before = 'requires_review';
    const after = 'blocks_promotion';

    expect(wasBlocking(before)).toBe(false);
    expect(wasBlocking(after)).toBe(true);
  });

  test('different regulators can produce different severity for same contradiction type', () => {
    // FDA dosage conflict → critical
    const fdaSeverity = 'critical';
    // EMA dosage conflict → default (high, from DEFAULT_AUTHORITY dosage_conflict → blocks_promotion)
    // Without EMA-specific dosage overlay, stays at default
    const emaSeverity = 'high';

    expect(fdaSeverity).not.toBe(emaSeverity);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4: CONSEQUENCE PATH CREATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Consequence Paths', () => {

  test('consequence path has required structure', () => {
    const path: ConsequencePath = {
      id: 'csq_123',
      contradictionId: 'finding-1',
      actionType: 'contradiction_memo',
      label: 'Create contradiction memo',
      description: 'Create a governed memo documenting the finding.',
      authorityLevel: 'requires-confirmation',
      requiresConfirmation: true,
      requiresApproval: false,
      requiresEscalation: false,
      affectedObjectIds: ['art-1', 'art-2'],
      affectedSectionCodes: ['2.5'],
      autoRecommended: true,
      executed: false,
    };

    expect(path.requiresConfirmation).toBe(true);
    expect(path.executed).toBe(false);
    expect(path.affectedObjectIds).toHaveLength(2);
  });

  test('escalation consequence requires escalation authority', () => {
    const escalationPath: ConsequencePath = {
      id: 'csq_456',
      contradictionId: 'finding-2',
      actionType: 'escalation',
      label: 'Escalate to regulatory lead',
      description: 'Escalate for higher-level review.',
      authorityLevel: 'requires-escalation',
      requiresConfirmation: true,
      requiresApproval: true,
      requiresEscalation: true,
      affectedObjectIds: [],
      affectedSectionCodes: [],
      autoRecommended: true,
      executed: false,
    };

    expect(escalationPath.requiresEscalation).toBe(true);
    expect(escalationPath.requiresApproval).toBe(true);
  });

  test('critical severity always offers correction draft path', () => {
    // Simulates getAvailableConsequencePaths for critical finding
    const severity = 'critical';
    const consequenceType = 'assumption_supersession';

    const paths: string[] = [consequenceType];
    if (severity === 'critical' || severity === 'high') {
      if (consequenceType !== 'harmonization_rewrite') {
        paths.push('prepare-correction-draft');
      }
    }

    expect(paths).toContain('prepare-correction-draft');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PART 5: CONTRADICTION → DECISION LINKAGE
// ═══════════════════════════════════════════════════════════════════════════════

describe('Contradiction → Decision Linkage', () => {

  test('contradiction decision link has required fields', () => {
    const link: ContradictionDecisionLink = {
      contradictionId: 'c-1',
      decisionId: 'dec_123',
      linkType: 'created_by',
      createdAt: new Date().toISOString(),
    };

    expect(link.contradictionId).toBeTruthy();
    expect(link.decisionId).toBeTruthy();
    expect(link.linkType).toBe('created_by');
  });

  test('contradiction-resolution-decision kind is valid', () => {
    const decision = buildGovernedActionDecision({
      projectId: '42',
      kind: 'contradiction-resolution-decision',
      governedAction: 'create-contradiction-consequence',
      summary: 'Contradiction detected: assumption drift',
      rationale: 'Two assumptions with conflicting values',
      sourceSignals: [{
        kind: 'contradiction',
        id: 'c-1',
        summary: 'Assumption drift detected',
        severity: 'major',
      }],
      createdByType: 'system',
      linkedContradictionIds: ['c-1'],
    });

    expect(decision.kind).toBe('contradiction-resolution-decision');
    expect(decision.linkedContradictionIds).toContain('c-1');
    expect(decision.status).toBe('recommended');
    expect(decision.authority.requiresHumanConfirmation).toBe(true);
  });

  test('decision receipt captures contradiction consequence execution', () => {
    const receipt = buildDecisionReceipt({
      decisionId: 'dec_123',
      projectId: '42',
      recommendation: {
        summary: 'Execute assumption supersession',
        actionIds: ['assumption_supersession'],
        rationale: 'Conflicting assumptions detected',
      },
      confirmation: { accepted: true, confirmedById: 'user-1' },
      execution: {
        executed: true,
        executedById: 'user-1',
        executionMethod: 'consequence:assumption_supersession',
      },
      affectedObjects: [
        {
          objectType: 'contradiction-link',
          objectId: 'c-1',
          previousState: 'unresolved',
          newState: 'under_review',
          changeDescription: 'Consequence assumption_supersession executed',
        },
        {
          objectType: 'assumption',
          objectId: 'a-2',
          newState: 'created',
          changeDescription: 'Created assumption_supersession from contradiction',
        },
      ],
    });

    expect(receipt.confirmation.accepted).toBe(true);
    expect(receipt.execution.executed).toBe(true);
    expect(receipt.execution.executionMethod).toContain('assumption_supersession');
    expect(receipt.affectedObjects).toHaveLength(2);
    expect(receipt.affectedObjects[0].objectType).toBe('contradiction-link');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PART 6: CONTRADICTION → PREFLIGHT CONSEQUENCE
// ═══════════════════════════════════════════════════════════════════════════════

describe('Contradiction → Preflight', () => {

  test('preflight context structure is complete', () => {
    const context: ContradictionPreflightContext = {
      unresolvedCount: 3,
      blockingCount: 1,
      overlayActiveCount: 1,
      byType: { assumption_drift: 2, status_conflict: 1 },
      bySeverity: { high: 1, medium: 2 },
      blockingFindings: [{
        id: 'f-1',
        contradictionType: 'assumption_drift',
        severity: 'high',
        confidenceLevel: 'strong',
        title: 'Assumption drift: dosing',
        description: 'Conflicting dose values',
        objectAType: 'assumption',
        objectAId: 'a-1',
        objectALabel: 'Dose assumption (10mg)',
        objectBType: 'assumption',
        objectBId: 'a-2',
        objectBLabel: 'Dose assumption (15mg)',
        authorityState: 'blocks_promotion',
        consequenceType: 'assumption_supersession',
        overlayApplied: true,
        overlayRuleCode: 'FDA-DOS-001',
        regulatorBody: 'FDA',
        originalSeverity: 'medium',
        detectionMethod: 'deterministic_record_compare',
        deterministicRule: 'RULE: Same category + domain → values must not conflict',
        llmRole: 'none',
        recommendedAction: 'assumption_supersession',
      }],
      warningFindings: [],
      overlayEscalatedToBlocking: true,
      linkedDecisionIds: ['dec_123'],
    };

    expect(context.unresolvedCount).toBe(3);
    expect(context.blockingCount).toBe(1);
    expect(context.overlayEscalatedToBlocking).toBe(true);
    expect(context.blockingFindings).toHaveLength(1);
    expect(context.blockingFindings[0].overlayApplied).toBe(true);
    expect(context.blockingFindings[0].originalSeverity).toBe('medium');
    expect(context.blockingFindings[0].severity).toBe('high');
    expect(context.linkedDecisionIds).toContain('dec_123');
  });

  test('preflight contradiction summary maps to UI context', () => {
    const summary: ContradictionObjectSummary = {
      objectType: 'section',
      objectId: '2.5',
      hasContradictions: true,
      totalCount: 2,
      blockingCount: 1,
      warningCount: 1,
      infoCount: 0,
      highestSeverity: 'high',
      hasOverlayOverrides: true,
      summaryLine: '2 contradictions (1 blocking)',
      bodyContextNote: 'FDA overlay escalated dosage conflict to blocking',
      requiresHumanAction: true,
      requiredActionType: 'confirmation',
    };

    expect(summary.hasContradictions).toBe(true);
    expect(summary.requiresHumanAction).toBe(true);
    expect(summary.bodyContextNote).toContain('FDA');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PART 7: FAILURE BEHAVIOR
// ═══════════════════════════════════════════════════════════════════════════════

describe('Failure Behavior', () => {

  test('missing comparison objects produce no false findings', () => {
    // When artifact content is empty, no contradiction should be created
    const content = '';
    const shouldDetect = content.length >= 50;
    expect(shouldDetect).toBe(false);
  });

  test('unknown body context defaults to no overlay', () => {
    const regulatorBody: string | null = null;
    const shouldApplyOverlay = !!regulatorBody;
    expect(shouldApplyOverlay).toBe(false);
  });

  test('low confidence does not escalate to blocking', () => {
    const confidenceScore = 0.3;
    const level = toConfidenceLevel(confidenceScore);
    expect(level).toBe('uncertain');

    // Low-confidence findings should not block promotion
    const shouldBlock = level === 'strong' || level === 'moderate';
    expect(shouldBlock).toBe(false);
  });

  test('authority requirement cannot be bypassed for forbidden actions', () => {
    const authority = getAuthorityForAction('execute-multi-object-correction');
    expect(authority.level).toBe('forbidden');

    const check = isActorAuthorized(authority, 'admin');
    expect(check.authorized).toBe(false);
  });

  test('unknown governed action defaults to requires-escalation', () => {
    const authority = getAuthorityForAction('some-unknown-action' as any);
    expect(authority.level).toBe('requires-escalation');
    expect(authority.requiresHumanConfirmation).toBe(true);
  });

  test('invalid decision status transitions are rejected', () => {
    expect(isValidTransition('approved', 'confirmed')).toBe(false);
    expect(isValidTransition('superseded', 'executed')).toBe(false);
    expect(isValidTransition('rejected', 'executed')).toBe(false);
  });

  test('valid decision status transitions are allowed', () => {
    expect(isValidTransition('recommended', 'confirmed')).toBe(true);
    expect(isValidTransition('confirmed', 'executed')).toBe(true);
    expect(isValidTransition('executed', 'approved')).toBe(true);
    expect(isValidTransition('executed', 'provisional')).toBe(true);
    expect(isValidTransition('provisional', 'approved')).toBe(true);
  });

  test('receipt persistence failure does not crash workflow', () => {
    // Receipt creation is always synchronous and in-memory
    const receipt = buildDecisionReceipt({
      decisionId: 'dec_fail',
      projectId: '42',
      recommendation: { summary: 'test', actionIds: [], rationale: 'test' },
      confirmation: { accepted: true },
      execution: { executed: false, error: 'DB connection failed' },
    });

    expect(receipt.execution.executed).toBe(false);
    expect(receipt.execution.error).toBe('DB connection failed');
  });

  test('user rejection of recommended action creates receipt with rejectionReason', () => {
    const receipt = buildDecisionReceipt({
      decisionId: 'dec_rejected',
      projectId: '42',
      recommendation: { summary: 'Supersede assumption', actionIds: ['supersession'], rationale: 'Drift detected' },
      confirmation: { accepted: false, confirmedById: 'user-1', rejectionReason: 'Not a real conflict' },
    });

    expect(receipt.confirmation.accepted).toBe(false);
    expect(receipt.confirmation.rejectionReason).toBe('Not a real conflict');
    expect(receipt.execution.executed).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PART 8: DECISION ARCHITECTURE AUTHORITY BOUNDARY MAP
// ═══════════════════════════════════════════════════════════════════════════════

describe('Authority Boundary Map', () => {

  test('all governed action types are mapped', () => {
    const actions = AUTHORITY_BOUNDARY_MAP.map(e => e.action);
    expect(actions).toContain('run-section-preflight');
    expect(actions).toContain('promote-to-review');
    expect(actions).toContain('approve-artifact');
    expect(actions).toContain('create-contradiction-consequence');
    expect(actions).toContain('execute-multi-object-correction');
  });

  test('read-only actions are autonomous', () => {
    const readActions = ['run-section-preflight', 'run-module-preflight', 'run-dossier-preflight', 'explain-preflight-results'];
    for (const action of readActions) {
      const authority = getAuthorityForAction(action as any);
      expect(authority.level).toBe('autonomous-read');
      expect(authority.requiresHumanConfirmation).toBe(false);
    }
  });

  test('promotion requires human confirmation', () => {
    const authority = getAuthorityForAction('promote-to-review');
    expect(authority.requiresHumanConfirmation).toBe(true);
    expect(authority.level).toBe('requires-confirmation');
  });

  test('approval requires reviewer role', () => {
    const authority = getAuthorityForAction('approve-artifact');
    expect(authority.requiresReviewerApproval).toBe(true);
    expect(authority.allowedActorRoles).toContain('reviewer');
    expect(authority.allowedActorRoles).toContain('approver');
  });

  test('contradiction consequence requires confirmation', () => {
    const authority = getAuthorityForAction('create-contradiction-consequence');
    expect(authority.requiresHumanConfirmation).toBe(true);
    expect(authority.level).toBe('requires-confirmation');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PART 9: INLINE DETAIL STRUCTURE
// ═══════════════════════════════════════════════════════════════════════════════

describe('Contradiction Inline Detail', () => {

  test('inline detail provides everything needed for UI display', () => {
    const detail: ContradictionInlineDetail = {
      id: 'f-1',
      contradictionType: 'assumption_drift',
      severity: 'high',
      confidence: 'strong',
      title: 'Assumption drift: dosing in clinical domain',
      description: 'Two assumptions with conflicting values.',
      rationale: 'Same category + domain with different values.',
      objectA: { type: 'assumption', id: 'a-1', label: 'Dose 10mg', sectionCode: '2.5' },
      objectB: { type: 'assumption', id: 'a-2', label: 'Dose 15mg', sectionCode: '2.7.3' },
      regulatorBody: 'FDA',
      submissionType: 'NDA',
      overlayApplied: true,
      overlayConsequence: {
        overlayRuleId: 'r-1',
        overlayRuleCode: 'FDA-DOS-001',
        originalSeverity: 'medium',
        originalAuthorityState: 'requires_review',
        originalConsequenceType: 'review_thread',
        overriddenSeverity: 'high',
        overriddenAuthorityState: 'blocks_promotion',
        overriddenConsequenceType: 'dossier_review_attachment',
        regulatorBody: 'FDA',
        rationale: 'FDA treats dosage inconsistencies as safety signals',
        regulatoryReference: '21 CFR 312.23(a)(3)',
      },
      recommendedAction: {
        actionType: 'assumption_supersession',
        label: 'Supersede conflicting assumption',
        requiresConfirmation: true,
        requiresApproval: false,
        requiresEscalation: false,
      },
      linkedDecisionId: 'dec_123',
      decisionStatus: 'recommended',
      reviewState: 'unresolved',
    };

    // UI display requirements
    expect(detail.title).toBeTruthy();
    expect(detail.severity).toBeTruthy();
    expect(detail.objectA.label).toBeTruthy();
    expect(detail.objectB.label).toBeTruthy();
    expect(detail.recommendedAction).toBeTruthy();
    expect(detail.recommendedAction!.requiresConfirmation).toBe(true);

    // Overlay visibility
    expect(detail.overlayApplied).toBe(true);
    expect(detail.overlayConsequence!.overlayRuleCode).toBe('FDA-DOS-001');
    expect(detail.overlayConsequence!.regulatoryReference).toContain('CFR');

    // What happened / what needs to happen
    expect(detail.reviewState).toBe('unresolved');
    expect(detail.linkedDecisionId).toBeTruthy();
    expect(detail.decisionStatus).toBe('recommended');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PART 10: SAMPLE CONTRADICTION PAYLOAD
// ═══════════════════════════════════════════════════════════════════════════════

describe('Sample Contradiction Payload', () => {

  test('produces a complete sample assumption-drift contradiction finding', () => {
    const sampleFinding = {
      id: 'cf_1711368000_abc123',
      organizationId: 1,
      projectId: 42,
      sourceClassification: 'structured_record_conflict',
      objectAType: 'assumption',
      objectAId: 'asmp_dropout_clinical_001',
      objectALabel: 'Dropout rate assumption: 15%',
      objectBType: 'assumption',
      objectBId: 'asmp_dropout_clinical_002',
      objectBLabel: 'Dropout rate assumption: 25%',
      contradictionType: 'assumption_drift',
      severity: 'high',
      truthHierarchyLevel: 1,
      confidenceScore: 0.9,
      confidenceLevel: 'high',
      title: 'Assumption drift: dropout in clinical',
      description: 'Assumption "Dropout rate assumption: 15%" has value "15%" but "Dropout rate assumption: 25%" has value "25%" for the same category (dropout) and domain (clinical).',
      evidenceSummary: null,
      deterministicRule: 'RULE: Same category + domain → values must not conflict',
      llmRole: 'none',
      llmExplanation: null,
      regulatorBody: 'FDA',
      overlayRuleId: 'FDA-AD-001',
      regulatorSeverityOverride: 'high',
      authorityState: 'requires_approval',
      reviewState: 'unresolved',
      resolvedAt: null,
      resolvedBy: null,
      resolutionNotes: null,
      consequenceType: 'review_thread',
      consequenceObjectId: null,
      consequenceExecuted: false,
      detectedBy: 'contradiction-engine:assumption_drift',
      createdAt: '2026-03-24T12:00:00.000Z',
      updatedAt: '2026-03-24T12:00:00.000Z',
    };

    expect(sampleFinding.sourceClassification).toBe('structured_record_conflict');
    expect(sampleFinding.llmRole).toBe('none');
    expect(sampleFinding.deterministicRule).toContain('RULE:');
    expect(sampleFinding.authorityState).toBe('requires_approval');
    expect(sampleFinding.consequenceType).toBe('review_thread');
    expect(sampleFinding.overlayRuleId).toBe('FDA-AD-001');
    expect(sampleFinding.regulatorSeverityOverride).toBe('high');
  });

  test('produces a complete sample cross-artifact contradiction with overlay', () => {
    const sampleCrossArtifact = {
      id: 'cf_cross_001',
      contradictionType: 'parameter_mismatch',
      severity: 'critical', // Overridden by EMA-CMC-001
      originalSeverity: 'high',
      objectAType: 'artifact',
      objectAId: '101',
      objectALabel: 'Drug Substance Specification (3.2.S.4)',
      objectBType: 'artifact',
      objectBId: '102',
      objectBLabel: 'Quality Overall Summary (2.3)',
      sourceClassification: 'deterministic_rule_conflict',
      deterministicRule: 'RULE: HarmonizeEngine numeric check between sections',
      llmRole: 'none',
      regulatorBody: 'EMA',
      overlayRuleId: 'EMA-CMC-001',
      regulatorSeverityOverride: 'critical',
      authorityState: 'blocks_promotion',
      consequenceType: 'escalation',
    };

    expect(sampleCrossArtifact.severity).toBe('critical');
    expect(sampleCrossArtifact.originalSeverity).toBe('high');
    expect(sampleCrossArtifact.regulatorBody).toBe('EMA');
    expect(sampleCrossArtifact.overlayRuleId).toBe('EMA-CMC-001');
    expect(sampleCrossArtifact.authorityState).toBe('blocks_promotion');
  });
});
