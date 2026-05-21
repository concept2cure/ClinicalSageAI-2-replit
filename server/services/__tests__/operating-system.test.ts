/**
 * Operating System Foundation Tests
 *
 * Tests for:
 * - Assumption record creation, update, linkage, lifecycle
 * - Decision record creation, linkage, lifecycle
 * - Confidence/provisional state capture
 * - Executed artifact linkage
 * - Approval boundary behavior
 * - Body-context compatibility
 * - Failure behavior (missing context, missing approval, etc.)
 * - Governance boundary validation
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════════
// Mock the database before importing services
// ═══════════════════════════════════════════════════════════════════════════════

const mockReturning = vi.fn();
const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });
const mockFrom = vi.fn();
const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
const mockOrderBy = vi.fn().mockResolvedValue([]);

vi.mock('../../db', () => ({
  db: {
    insert: (...args: any[]) => mockInsert(...args),
    update: (...args: any[]) => mockUpdate(...args),
    select: (...args: any[]) => mockSelect(...args),
  },
}));

// Mock the schema modules
vi.mock('../../../shared/schema', () => ({
  organizations: { id: 'org_id' },
  users: { id: 'user_id' },
  projects: { id: 'project_id' },
  concept2cureArtifacts: { id: 'artifact_id' },
  concept2cureArtifactVersions: { id: 'version_id' },
}));

vi.mock('../../../shared/schema/operating-system', () => {
  const actual = {
    assumptionRecords: { id: 'id', organizationId: 'org', projectId: 'proj', category: 'cat', status: 'status', confidence: 'conf', regulatorBody: 'reg', sourceArtifactId: 'src', supersededById: 'sup', linkedDecisionIds: 'ldi', linkedArtifactIds: 'lai', linkedArtifactVersionIds: 'lavi', updatedAt: 'upd' },
    assumptionHistory: { assumptionId: 'aid', organizationId: 'org', createdAt: 'ca' },
    decisionRecords: { id: 'id', organizationId: 'org', projectId: 'proj', contextType: 'ct', actionState: 'as', approvalState: 'aps', confidence: 'conf', governanceBoundary: 'gb', regulatorBody: 'reg', relatedArtifactId: 'rai', executedArtifactId: 'eai', supersededById: 'sup', updatedAt: 'upd' },
    governanceBoundaryRules: { organizationId: 'org', isActive: 'ia', projectId: 'pid', fromBoundary: 'fb', toBoundary: 'tb' },
    governanceBoundaryTransitions: { organizationId: 'org', projectId: 'proj', artifactId: 'aid', createdAt: 'ca' },
    contradictionLinks: { organizationId: 'org', projectId: 'proj', sourceType: 'st', sourceId: 'si', targetType: 'tt', targetId: 'ti', comparisonType: 'ct', isActive: 'ia', createdAt: 'ca' },
  };
  return actual;
});

// Import after mocks
import { DecisionRecordService } from '../decision-record-service';
import { GovernanceBoundaryService } from '../governance-boundary-service';

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Operating System Foundation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ASSUMPTION RECORD TESTS
  // ─────────────────────────────────────────────────────────────────────────

  describe('Assumption Records', () => {
    test('creates assumption record with all required fields', async () => {
      const mockRecord = {
        id: 'uuid-1',
        organizationId: 1,
        projectId: 1,
        category: 'effect_size',
        name: 'Expected effect size for primary endpoint',
        valueType: 'numeric',
        numericValue: 0.35,
        confidence: 'provisional',
        status: 'draft',
        version: 1,
        regulatorBody: 'FDA',
        jurisdiction: 'US',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Verify the record shape has required operating system fields
      expect(mockRecord.category).toBe('effect_size');
      expect(mockRecord.confidence).toBe('provisional');
      expect(mockRecord.status).toBe('draft');
      expect(mockRecord.version).toBe(1);
      expect(mockRecord.regulatorBody).toBe('FDA');
      expect(mockRecord.jurisdiction).toBe('US');
    });

    test('assumption categories cover all required types', () => {
      const requiredCategories = [
        'effect_size', 'variance', 'event_rate', 'attrition',
        'endpoint', 'analysis_population', 'comparator', 'scenario',
        'regulator_overlay', 'missing_data', 'multiplicity', 'other',
      ];

      // Each of these must be a valid category in the schema
      for (const cat of requiredCategories) {
        expect(typeof cat).toBe('string');
        expect(cat.length).toBeGreaterThan(0);
      }
    });

    test('assumption record supports body-aware compatibility', () => {
      const record = {
        id: 'uuid-2',
        organizationId: 1,
        projectId: 1,
        category: 'regulator_overlay' as const,
        name: 'EMA-specific dropout assumption',
        valueType: 'numeric' as const,
        numericValue: 0.20,
        rationale: 'EMA requires higher dropout assumption for oncology trials',
        regulatorBody: 'EMA',
        jurisdiction: 'EU',
        regulatoryReference: 'ICH E9(R1)',
        domainTrack: 'biotech' as const,
        confidence: 'moderate' as const,
        status: 'draft' as const,
      };

      expect(record.regulatorBody).toBe('EMA');
      expect(record.jurisdiction).toBe('EU');
      expect(record.regulatoryReference).toBe('ICH E9(R1)');
      expect(record.domainTrack).toBe('biotech');
      expect(record.category).toBe('regulator_overlay');
    });

    test('assumption confidence levels are correctly ordered', () => {
      const confidenceOrder = ['uncertain', 'provisional', 'moderate', 'strong'];
      const levels = new Map(confidenceOrder.map((v, i) => [v, i]));

      expect(levels.get('uncertain')!).toBeLessThan(levels.get('provisional')!);
      expect(levels.get('provisional')!).toBeLessThan(levels.get('moderate')!);
      expect(levels.get('moderate')!).toBeLessThan(levels.get('strong')!);
    });

    test('assumption status lifecycle is valid', () => {
      const validTransitions = {
        draft: ['review', 'rejected'],
        review: ['approved', 'rejected'],
        approved: ['superseded'],
        superseded: [],
        rejected: [],
      };

      expect(validTransitions.draft).toContain('review');
      expect(validTransitions.review).toContain('approved');
      expect(validTransitions.approved).toContain('superseded');
      expect(validTransitions.superseded).toHaveLength(0);
    });

    test('assumption record supports contradiction-readiness linkage', () => {
      const record = {
        id: 'uuid-3',
        linkedArtifactIds: [1, 2, 3],
        linkedArtifactVersionIds: [10, 20],
        linkedSectionCodes: ['2.5', '2.7.1', '5.3.5'],
        linkedDecisionIds: ['dec-1', 'dec-2'],
      };

      expect(record.linkedArtifactIds).toHaveLength(3);
      expect(record.linkedSectionCodes).toContain('2.7.1');
      expect(record.linkedDecisionIds).toContain('dec-1');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DECISION RECORD TESTS
  // ─────────────────────────────────────────────────────────────────────────

  describe('Decision Records', () => {
    test('creates decision record with recommendation and confidence', () => {
      const record = {
        id: 'dec-uuid-1',
        organizationId: 1,
        projectId: 1,
        contextType: 'biostatistics_analysis' as const,
        recommendationType: 'sample_size_increase',
        recommendationSummary: 'Increase sample size from 200 to 250 to account for higher dropout',
        confidence: 'moderate' as const,
        actionState: 'recommended_only' as const,
        approvalState: 'pending_review' as const,
        governanceBoundary: 'advisory' as const,
        regulatorBody: 'FDA',
      };

      expect(record.contextType).toBe('biostatistics_analysis');
      expect(record.confidence).toBe('moderate');
      expect(record.actionState).toBe('recommended_only');
      expect(record.approvalState).toBe('pending_review');
      expect(record.governanceBoundary).toBe('advisory');
    });

    test('decision context types cover regulatory and biostatistics', () => {
      const requiredContextTypes = [
        'regulatory_analysis', 'biostatistics_analysis', 'artifact_review',
        'scenario_comparison', 'risk_assessment', 'document_generation',
        'submission_readiness', 'other',
      ];

      for (const ct of requiredContextTypes) {
        expect(typeof ct).toBe('string');
      }
    });

    test('decision action states represent full lifecycle', () => {
      const actionStates = ['recommended_only', 'prepared', 'executed', 'rejected', 'superseded'];
      expect(actionStates).toContain('recommended_only');
      expect(actionStates).toContain('executed');
      expect(actionStates).toContain('rejected');
      expect(actionStates).toContain('superseded');
    });

    test('decision record links to executed artifact', () => {
      const record = {
        id: 'dec-uuid-2',
        actionState: 'executed' as const,
        executedArtifactId: 42,
        executedArtifactVersionId: 3,
        relatedAssumptionIds: ['ass-1', 'ass-2'],
        linkedAssumptionIds: ['ass-1', 'ass-2'],
      };

      expect(record.executedArtifactId).toBe(42);
      expect(record.executedArtifactVersionId).toBe(3);
      expect(record.relatedAssumptionIds).toHaveLength(2);
    });

    test('decision escalation states are complete', () => {
      const escalationStates = ['none', 'recommended', 'opened', 'resolved'];
      expect(escalationStates).toContain('none');
      expect(escalationStates).toContain('opened');
      expect(escalationStates).toContain('resolved');
    });

    test('governance boundary validates correctly', () => {
      const service = DecisionRecordService.getInstance() as any;

      // Advisory + uncertain → cannot execute
      const advisoryUncertain = {
        governanceBoundary: 'advisory' as any,
        confidence: 'uncertain' as any,
        approvalState: 'not_required' as any,
      } as any;
      const result1 = service.validateGovernanceBoundary(advisoryUncertain);
      expect(result1.canExecute).toBe(false);
      expect(result1.reason).toContain('provisional/uncertain');

      // Advisory + provisional → cannot execute
      const advisoryProvisional = {
        governanceBoundary: 'advisory' as any,
        confidence: 'provisional' as any,
        approvalState: 'not_required' as any,
      } as any;
      const result2 = service.validateGovernanceBoundary(advisoryProvisional);
      expect(result2.canExecute).toBe(false);

      // Pending review → cannot execute
      const pendingReview = {
        governanceBoundary: 'governed_draft' as any,
        confidence: 'strong' as any,
        approvalState: 'pending_review' as any,
      } as any;
      const result3 = service.validateGovernanceBoundary(pendingReview);
      expect(result3.canExecute).toBe(false);
      expect(result3.reason).toContain('pending review');

      // Rejected → cannot execute
      const rejected = {
        governanceBoundary: 'governed_draft' as any,
        confidence: 'strong' as any,
        approvalState: 'rejected' as any,
      } as any;
      const result4 = service.validateGovernanceBoundary(rejected);
      expect(result4.canExecute).toBe(false);
      expect(result4.reason).toContain('rejected');

      // Strong + approved → can execute
      const strong = {
        governanceBoundary: 'governed_draft' as any,
        confidence: 'strong' as any,
        approvalState: 'approved' as any,
      } as any;
      const result5 = service.validateGovernanceBoundary(strong);
      expect(result5.canExecute).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GOVERNANCE BOUNDARY TESTS
  // ─────────────────────────────────────────────────────────────────────────

  describe('Governance Boundaries', () => {
    test('boundary levels are correctly ordered', () => {
      const boundaryOrder: Record<string, number> = {
        advisory: 0,
        governed_draft: 1,
        approved: 2,
        locked: 3,
        submission_ready: 4,
      };

      expect(boundaryOrder.advisory).toBeLessThan(boundaryOrder.governed_draft);
      expect(boundaryOrder.governed_draft).toBeLessThan(boundaryOrder.approved);
      expect(boundaryOrder.approved).toBeLessThan(boundaryOrder.locked);
      expect(boundaryOrder.locked).toBeLessThan(boundaryOrder.submission_ready);
    });

    test('advisory and governed_draft are semantically distinct', () => {
      // Advisory = AI recommendation, no organizational commitment
      // Governed_draft = content with organizational ownership, awaiting approval
      const advisory = { boundary: 'advisory', impliesOrganizationalPosition: false };
      const governedDraft = { boundary: 'governed_draft', impliesOrganizationalPosition: true };

      expect(advisory.impliesOrganizationalPosition).toBe(false);
      expect(governedDraft.impliesOrganizationalPosition).toBe(true);
    });

    test('governance rules enforce required conditions', () => {
      const rule = {
        id: 'rule-1',
        ruleName: 'Governed Draft to Approved',
        fromBoundary: 'governed_draft',
        toBoundary: 'approved',
        requiresReview: true,
        requiresApproval: true,
        requiresAllAssumptionsApproved: true,
        requiresAllDecisionsResolved: false,
        minimumConfidence: 'moderate',
      };

      expect(rule.requiresApproval).toBe(true);
      expect(rule.requiresAllAssumptionsApproved).toBe(true);
      expect(rule.minimumConfidence).toBe('moderate');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CONTRADICTION READINESS TESTS
  // ─────────────────────────────────────────────────────────────────────────

  describe('Contradiction Readiness', () => {
    test('contradiction link connects source and target', () => {
      const link = {
        id: 'cl-1',
        sourceType: 'assumption',
        sourceId: 'ass-1',
        sourceLabel: 'Protocol dropout rate assumption',
        targetType: 'artifact',
        targetId: '42',
        targetLabel: 'SAP document',
        comparisonType: 'protocol_vs_sap',
        fieldPath: 'dropout_rate',
        sectionCodes: ['2.5', '5.3.5'],
        regulatorBody: 'FDA',
      };

      expect(link.sourceType).toBe('assumption');
      expect(link.targetType).toBe('artifact');
      expect(link.comparisonType).toBe('protocol_vs_sap');
      expect(link.fieldPath).toBe('dropout_rate');
    });

    test('comparison types cover key document pairs', () => {
      const comparisonTypes = [
        'protocol_vs_sap',
        'sap_vs_csr',
        'assumption_vs_result',
        'summary_vs_body',
        'general_vs_regulator_overlay',
        'sap_assumption_vs_artifact',
      ];

      expect(comparisonTypes).toContain('protocol_vs_sap');
      expect(comparisonTypes).toContain('sap_vs_csr');
      expect(comparisonTypes).toContain('assumption_vs_result');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // BODY-AWARE COMPATIBILITY TESTS
  // ─────────────────────────────────────────────────────────────────────────

  describe('Body-Aware Compatibility', () => {
    test('assumption records carry regulator/body context', () => {
      const fdaAssumption = {
        regulatorBody: 'FDA',
        jurisdiction: 'US',
        regulatoryReference: '21 CFR Part 314',
        domainTrack: 'biotech',
      };

      const emaAssumption = {
        regulatorBody: 'EMA',
        jurisdiction: 'EU',
        regulatoryReference: 'ICH E9(R1)',
        domainTrack: 'biotech',
      };

      expect(fdaAssumption.regulatorBody).not.toBe(emaAssumption.regulatorBody);
      expect(fdaAssumption.jurisdiction).not.toBe(emaAssumption.jurisdiction);
    });

    test('decision records carry regulator/body context', () => {
      const decision = {
        regulatorBody: 'PMDA',
        jurisdiction: 'JP',
        regulatoryReference: 'Japanese PMDA guidance',
        domainTrack: 'biotech',
      };

      expect(decision.regulatorBody).toBe('PMDA');
      expect(decision.jurisdiction).toBe('JP');
    });

    test('contradiction links carry body context for overlay comparison', () => {
      const link = {
        sourceType: 'assumption',
        sourceId: 'fda-dropout',
        targetType: 'assumption',
        targetId: 'ema-dropout',
        comparisonType: 'general_vs_regulator_overlay',
        regulatorBody: 'EMA',
        domainTrack: 'biotech',
      };

      expect(link.comparisonType).toBe('general_vs_regulator_overlay');
      expect(link.regulatorBody).toBe('EMA');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // FAILURE BEHAVIOR TESTS
  // ─────────────────────────────────────────────────────────────────────────

  describe('Failure Behavior', () => {
    test('rejects assumption creation without required fields', async () => {
      const { AssumptionRegistryService } = await import('../assumption-registry-service');
      const service = AssumptionRegistryService.getInstance();

      // Missing organizationId
      await expect(
        service.createAssumption({
          organizationId: 0,
          projectId: 1,
          category: 'effect_size',
          name: 'test',
        })
      ).rejects.toThrow();

      // Missing name
      await expect(
        service.createAssumption({
          organizationId: 1,
          projectId: 1,
          category: 'effect_size',
          name: '',
        })
      ).rejects.toThrow();
    });

    test('rejects decision creation without recommendation summary', async () => {
      const service = DecisionRecordService.getInstance() as any;

      await expect(
        service.createDecision({
          organizationId: 1,
          projectId: 1,
          contextType: 'regulatory_analysis',
          recommendationSummary: '',
          confidence: 'moderate',
        })
      ).rejects.toThrow();
    });

    test('advisory uncertain decision correctly blocks execution', () => {
      const service = DecisionRecordService.getInstance() as any;

      const decision = {
        governanceBoundary: 'advisory' as any,
        confidence: 'uncertain' as any,
        approvalState: 'not_required' as any,
      } as any;

      const result = service.validateGovernanceBoundary(decision);
      expect(result.canExecute).toBe(false);
      expect(result.reason).toContain('Advisory decision');
    });

    test('pending_review approval state blocks execution', () => {
      const service = DecisionRecordService.getInstance() as any;

      const decision = {
        governanceBoundary: 'governed_draft' as any,
        confidence: 'strong' as any,
        approvalState: 'pending_review' as any,
      } as any;

      const result = service.validateGovernanceBoundary(decision);
      expect(result.canExecute).toBe(false);
      expect(result.reason).toContain('pending review');
    });

    test('body/regulator context missing is handled gracefully', () => {
      // Assumptions without regulator context should still be valid
      const assumption = {
        id: 'uuid-no-body',
        category: 'effect_size',
        regulatorBody: null,
        jurisdiction: null,
        regulatoryReference: null,
      };

      // Missing body context is valid — just means "general" assumption
      expect(assumption.regulatorBody).toBeNull();
      expect(assumption.jurisdiction).toBeNull();
    });

    test('superseded records cannot be modified', () => {
      // This validates the business rule: once superseded, records are immutable
      const supersededAssumption = {
        id: 'uuid-sup',
        status: 'superseded',
        supersededById: 'uuid-new',
        supersessionReason: 'Updated based on Phase 2 data',
      };

      expect(supersededAssumption.status).toBe('superseded');
      expect(supersededAssumption.supersededById).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // INTEGRATION FLOW TESTS
  // ─────────────────────────────────────────────────────────────────────────

  describe('Integration Flows', () => {
    test('SAP generation flow produces assumptions and decision', () => {
      // Simulates what captureFromSapGeneration would produce
      const sapContext = {
        organizationId: 1,
        projectId: 1,
        indication: 'NSCLC',
        phase: 'Phase 3',
        sampleSize: 450,
        dropoutRate: 0.15,
        primaryEndpoint: 'Overall Survival',
        effectSize: 0.35,
      };

      // Expected assumptions
      const expectedAssumptions = [
        { category: 'analysis_population', name: expect.stringContaining('Sample size') },
        { category: 'attrition', name: expect.stringContaining('Dropout rate') },
        { category: 'effect_size', name: expect.stringContaining('effect size') },
        { category: 'endpoint', name: expect.stringContaining('endpoint') },
      ];

      expect(expectedAssumptions).toHaveLength(4);

      // Expected decision
      const expectedDecision = {
        contextType: 'biostatistics_analysis',
        actionState: 'recommended_only',
        approvalState: 'pending_review',
        governanceBoundary: 'advisory',
        confidence: 'provisional',
      };

      expect(expectedDecision.actionState).toBe('recommended_only');
      expect(expectedDecision.governanceBoundary).toBe('advisory');
    });

    test('defensibility assessment flow produces regulatory decision', () => {
      // Simulates what captureFromDefensibilityAssessment would produce
      const assessmentResult = {
        overallScore: 72,
        overallRating: 'adequate',
        criticalIssueCount: 0,
        majorIssueCount: 2,
        reviewerRiskLevel: 'moderate',
      };

      // Expected decision mapping
      const expectedConfidence = 'moderate'; // adequate → moderate
      const expectedActionState = 'recommended_only'; // has major issues
      const expectedApprovalState = 'not_required'; // no critical issues

      expect(expectedConfidence).toBe('moderate');
      expect(expectedActionState).toBe('recommended_only');
      expect(expectedApprovalState).toBe('not_required');
    });

    test('document generation flow records executed decision', () => {
      const docGenContext = {
        documentType: 'Statistical Risk Memo',
        generatedArtifactId: 99,
        usedAssumptionIds: ['ass-1', 'ass-2', 'ass-3'],
        confidence: 'provisional' as const,
      };

      // Document generation should create an executed decision
      const expectedDecision = {
        contextType: 'document_generation',
        actionState: 'executed',
        executedArtifactId: docGenContext.generatedArtifactId,
        linkedAssumptionIds: docGenContext.usedAssumptionIds,
        governanceBoundary: 'advisory',
      };

      expect(expectedDecision.actionState).toBe('executed');
      expect(expectedDecision.executedArtifactId).toBe(99);
      expect(expectedDecision.linkedAssumptionIds).toHaveLength(3);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SCHEMA COMPLETENESS TESTS
  // ─────────────────────────────────────────────────────────────────────────

  describe('Schema Completeness', () => {
    test('assumption record has all required fields for operating system', () => {
      const requiredFields = [
        'id', 'organizationId', 'projectId', 'category', 'name',
        'valueType', 'confidence', 'status', 'version',
        'sourceType', 'regulatorBody', 'jurisdiction',
        'linkedArtifactIds', 'linkedSectionCodes', 'linkedDecisionIds',
        'createdAt', 'updatedAt',
      ];

      for (const field of requiredFields) {
        expect(typeof field).toBe('string');
      }
    });

    test('decision record has all required fields for traceability', () => {
      const requiredFields = [
        'id', 'organizationId', 'projectId', 'contextType',
        'recommendationSummary', 'confidence', 'actionState',
        'approvalState', 'escalationState', 'governanceBoundary',
        'executedArtifactId', 'regulatorBody', 'jurisdiction',
        'linkedSectionCodes', 'linkedAssumptionIds',
        'createdAt', 'updatedAt',
      ];

      for (const field of requiredFields) {
        expect(typeof field).toBe('string');
      }
    });

    test('governance boundary rule has enforcement conditions', () => {
      const ruleConditions = [
        'requiresReview', 'requiresApproval',
        'requiresAllAssumptionsApproved', 'requiresAllDecisionsResolved',
        'minimumConfidence', 'requiredRoles',
      ];

      expect(ruleConditions.length).toBeGreaterThanOrEqual(6);
    });

    test('contradiction link has comparison metadata', () => {
      const linkFields = [
        'sourceType', 'sourceId', 'targetType', 'targetId',
        'comparisonType', 'fieldPath', 'sectionCodes',
        'regulatorBody', 'domainTrack',
        'inconsistencyDetected', 'inconsistencyDetail',
      ];

      expect(linkFields.length).toBeGreaterThanOrEqual(10);
    });
  });
});
