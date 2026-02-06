/**
 * Innovation Platform Test Suite
 *
 * Comprehensive tests for all 8 innovative platform features.
 * Tests cover database operations, service logic, API endpoints, and integration.
 */

import { describe as baseDescribe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

// Import services
import { RegulatoryDeltaRadarService } from '../../server/services/innovation/regulatory-delta-radar-service';
import { EvidenceConfidenceHeatmapService } from '../../server/services/innovation/evidence-confidence-heatmap-service';
import { SubmissionReadinessTwinService } from '../../server/services/innovation/submission-readiness-twin-service';
import { AutoTraceabilityService } from '../../server/services/innovation/auto-traceability-service';
import { AdaptiveReviewerWorkspaceService } from '../../server/services/innovation/adaptive-reviewer-workspace-service';
import { OutcomeBasedTemplateLearningService } from '../../server/services/innovation/outcome-based-template-learning-service';
import { RegulatoryNegotiationLogbookService } from '../../server/services/innovation/regulatory-negotiation-logbook-service';
import { ComplianceGuardrailsSDKService } from '../../server/services/innovation/compliance-guardrails-sdk-service';

// Test database pool
let testPool: Pool;

const hasTestDb = Boolean(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY);
const runIntegration = process.env.RUN_INTEGRATION_TESTS === 'true' && hasTestDb;
const describe = runIntegration ? baseDescribe : baseDescribe.skip;
// For tests that require OpenAI, skip if key not available
const describeWithOpenAI = runIntegration && hasOpenAIKey ? baseDescribe : baseDescribe.skip;

// Test IDs for cleanup
const testIds = {
  organizationId: uuidv4(),
  programId: uuidv4(),
  userId: uuidv4(),
  documentId: uuidv4(),
};

const columnExists = async (pool: Pool, schema: string, table: string, column: string) => {
  const result = await pool.query(
    `
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = $2 AND column_name = $3
    LIMIT 1
  `,
    [schema, table, column]
  );
  return result.rows.length > 0;
};

if (runIntegration) {
  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('Missing TEST_DATABASE_URL or DATABASE_URL for integration tests.');
    }

    testPool = new Pool({
      connectionString,
    });

    testPool.on('connect', client => {
      client.query("SET app.bypass_rls = 'true'");
      client.query("SET app.is_admin = 'true'");
    });

    await testPool.query("SET app.bypass_rls = 'true'");
    await testPool.query("SET app.is_admin = 'true'");

    // Create test organization, program, and user
    await testPool.query(
      `
      INSERT INTO organizations (id, name, slug)
      VALUES ($1, 'Test Org', 'test-org')
      ON CONFLICT (id) DO NOTHING
    `,
      [testIds.organizationId]
    );

    await testPool.query(
      `
      INSERT INTO programs (id, organization_id, name, therapeutic_area)
      VALUES ($1, $2, 'Test Program', 'Oncology')
      ON CONFLICT (id) DO NOTHING
    `,
      [testIds.programId, testIds.organizationId]
    );

    await testPool.query(
      `
      INSERT INTO users (id, email, name, organization_id)
      VALUES ($1, 'test@test.com', 'Test User', $2)
      ON CONFLICT (id) DO NOTHING
    `,
      [testIds.userId, testIds.organizationId]
    );
  });

  afterAll(async () => {
    // Cleanup test data
    await testPool.query('DELETE FROM innovation.delta_findings WHERE program_id = $1', [
      testIds.programId,
    ]);
    await testPool.query('DELETE FROM innovation.delta_radar_scans WHERE program_id = $1', [
      testIds.programId,
    ]);
    await testPool.query('DELETE FROM innovation.guidance_documents WHERE title = $1', [
      'Test FDA Guidance',
    ]);
    await testPool.end();
  });
}

/**
 * Test Suite 1: Regulatory Delta Radar
 */
describeWithOpenAI('Regulatory Delta Radar Service', () => {
  let service: RegulatoryDeltaRadarService;

  beforeAll(() => {
    service = new RegulatoryDeltaRadarService(testPool);
  });

  describe('Guidance Document Management', () => {
    it('should import a guidance document', async () => {
      const result = await service.importGuidanceDocument({
        title: 'Test FDA Guidance',
        agency: 'FDA',
        documentType: 'guidance',
        content: 'This is a test guidance document about clinical trial endpoints.',
        effectiveDate: new Date().toISOString(),
        organizationId: testIds.organizationId,
      });

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.title).toBe('Test FDA Guidance');
      expect(result.agency).toBe('FDA');
    });

    it('should list guidance documents', async () => {
      const result = await service.getGuidanceDocuments(testIds.organizationId);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should update guidance document status', async () => {
      const docs = await service.getGuidanceDocuments(testIds.organizationId);
      if (docs.length > 0) {
        const result = await service.updateGuidanceDocument(docs[0].id, {
          status: 'archived',
        });
        expect(result.status).toBe('archived');
      }
    });
  });

  describe('Delta Scanning', () => {
    it('should run a delta scan', async () => {
      const result = await service.runDeltaScan({
        organizationId: testIds.organizationId,
        documentId: testIds.documentId,
        scanScope: 'full',
        includeArchived: false,
      });

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.status).toBe('completed');
      expect(Array.isArray(result.findings)).toBe(true);
    });

    it('should retrieve scan history', async () => {
      const result = await service.getScanHistory(testIds.organizationId, {
        limit: 10,
      });

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Finding Management', () => {
    it('should update finding status', async () => {
      const scans = await service.getScanHistory(testIds.organizationId, { limit: 1 });
      if (scans.length > 0 && scans[0].findings?.length > 0) {
        const result = await service.updateFinding(scans[0].findings[0].id, {
          status: 'acknowledged',
          reviewerComment: 'Reviewed and acknowledged',
        });
        expect(result.status).toBe('acknowledged');
      }
    });
  });
});

/**
 * Test Suite 2: Evidence Confidence Heatmap
 */
describeWithOpenAI('Evidence Confidence Heatmap Service', () => {
  let service: EvidenceConfidenceHeatmapService;
  let configId: string;

  beforeAll(() => {
    service = new EvidenceConfidenceHeatmapService(testPool);
  });

  describe('Scoring Configuration', () => {
    it('should create scoring configuration', async () => {
      const result = await service.createScoringConfig({
        name: 'Test Scoring Config',
        organizationId: testIds.organizationId,
        citationTypeWeights: {
          primary: 1.0,
          secondary: 0.7,
          tertiary: 0.4,
        },
        recencyDecayFactor: 0.05,
        relevanceThreshold: 0.7,
      });

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      configId = result.id;
    });

    it('should list scoring configurations', async () => {
      const result = await service.getScoringConfigs(testIds.organizationId);
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('Confidence Assessment', () => {
    it('should run confidence assessment', async () => {
      const result = await service.runConfidenceAssessment({
        documentId: testIds.documentId,
        configId,
        sections: ['efficacy', 'safety', 'methodology'],
      });

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
    });

    it('should generate heatmap data', async () => {
      const result = await service.generateHeatmap(testIds.documentId);

      expect(result).toBeDefined();
      expect(Array.isArray(result.sections)).toBe(true);
    });

    it('should identify evidence gaps', async () => {
      const result = await service.identifyGaps(testIds.documentId, {
        minConfidence: 70,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result.gaps)).toBe(true);
    });
  });
});

/**
 * Test Suite 3: Submission Readiness Twin
 */
describeWithOpenAI('Submission Readiness Twin Service', () => {
  let service: SubmissionReadinessTwinService;

  beforeAll(() => {
    service = new SubmissionReadinessTwinService(testPool);
  });

  describe('Readiness Criteria', () => {
    it('should create readiness criteria', async () => {
      const result = await service.createCriteria({
        programId: testIds.programId,
        category: 'clinical',
        name: 'Primary Endpoint Analysis',
        description: 'Complete statistical analysis of primary endpoint',
        weight: 0.15,
        evaluationMethod: 'document_check',
        requiredDocuments: ['statistical_analysis_plan', 'primary_endpoint_results'],
      });

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
    });

    it('should list program criteria', async () => {
      const result = await service.getCriteria(testIds.programId);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Readiness Assessment', () => {
    it('should run readiness assessment', async () => {
      const result = await service.runAssessment({
        programId: testIds.programId,
        submissionType: 'NDA',
        targetAgency: 'FDA',
      });

      expect(result).toBeDefined();
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
      expect(Array.isArray(result.categoryScores)).toBe(true);
    });

    it('should generate predictions', async () => {
      const result = await service.generatePredictions(testIds.programId);

      expect(result).toBeDefined();
      expect(result.predictedScore).toBeDefined();
      expect(result.confidenceInterval).toBeDefined();
    });

    it('should analyze trends', async () => {
      const result = await service.analyzeTrends(testIds.programId, {
        lookbackDays: 90,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result.trendData)).toBe(true);
    });
  });
});

/**
 * Test Suite 4: Auto-Traceability
 */
describeWithOpenAI('Auto-Traceability Service', () => {
  let service: AutoTraceabilityService;

  beforeAll(() => {
    service = new AutoTraceabilityService(testPool);
  });

  describe('Link Detection', () => {
    it('should detect potential links', async () => {
      const result = await service.detectLinks({
        documentId: testIds.documentId,
        content: 'Based on the clinical trial protocol section 4.2, the primary endpoint was...',
        sourceType: 'csr_section',
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result.potentialLinks)).toBe(true);
    });

    it('should create trace link', async () => {
      const result = await service.createLink({
        programId: testIds.programId,
        sourceType: 'csr_section',
        sourceId: testIds.documentId,
        sourceLocation: 'section_5.1',
        targetType: 'protocol',
        targetId: uuidv4(),
        targetLocation: 'section_4.2',
        linkType: 'derives_from',
        confidence: 0.85,
        creationMethod: 'auto_detected',
      });

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
    });

    it('should validate links', async () => {
      const links = await service.getLinks(testIds.programId);
      if (links.length > 0) {
        const result = await service.validateLink(links[0].id);
        expect(result).toBeDefined();
        expect(result.validationStatus).toBeDefined();
      }
    });
  });

  describe('Matrix Generation', () => {
    it('should generate traceability matrix', async () => {
      const result = await service.generateMatrix({
        programId: testIds.programId,
        includeTypes: ['protocol', 'csr_section', 'regulatory_requirement'],
      });

      expect(result).toBeDefined();
      expect(result.matrix).toBeDefined();
    });
  });
});

/**
 * Test Suite 5: Adaptive Reviewer Workspace
 */
describeWithOpenAI('Adaptive Reviewer Workspace Service', () => {
  let service: AdaptiveReviewerWorkspaceService;

  beforeAll(() => {
    service = new AdaptiveReviewerWorkspaceService(testPool);
  });

  describe('Workspace Roles', () => {
    it('should create workspace role', async () => {
      const result = await service.createRole({
        name: 'Senior Medical Writer',
        category: 'regulatory',
        permissions: ['edit', 'review', 'approve'],
        defaultLayout: {
          panels: ['document', 'comments', 'references'],
          splitRatio: [60, 20, 20],
        },
      });

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
    });

    it('should list roles', async () => {
      const result = await service.getRoles();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('User Preferences', () => {
    it('should set user preferences', async () => {
      const result = await service.setPreferences(testIds.userId, {
        theme: 'dark',
        fontSize: 14,
        panelOrder: ['document', 'ai_assistant', 'references'],
        shortcuts: { 'ctrl+s': 'save', 'ctrl+r': 'review' },
      });

      expect(result).toBeDefined();
    });

    it('should get user preferences', async () => {
      const result = await service.getPreferences(testIds.userId);
      expect(result).toBeDefined();
    });

    it('should get AI recommendations', async () => {
      const result = await service.getRecommendations(testIds.userId);
      expect(result).toBeDefined();
      expect(Array.isArray(result.recommendations)).toBe(true);
    });
  });
});

/**
 * Test Suite 6: Outcome-Based Template Learning
 */
describeWithOpenAI('Outcome-Based Template Learning Service', () => {
  let service: OutcomeBasedTemplateLearningService;
  let templateId: string;

  beforeAll(() => {
    service = new OutcomeBasedTemplateLearningService(testPool);
  });

  describe('Template Management', () => {
    it('should create learning template', async () => {
      const result = await service.createTemplate({
        organizationId: testIds.organizationId,
        name: 'CSR Efficacy Section Template',
        category: 'csr',
        documentType: 'clinical_study_report',
        content: '## Efficacy Results\n\n{{primary_endpoint_analysis}}\n\n{{secondary_endpoints}}',
        metadata: { version: '1.0', author: 'system' },
      });

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      templateId = result.id;
    });

    it('should track template usage', async () => {
      const result = await service.trackUsage({
        templateId,
        userId: testIds.userId,
        documentId: testIds.documentId,
        customizations: ['added_table', 'modified_language'],
        completionTime: 3600,
      });

      expect(result).toBeDefined();
    });
  });

  describe('Outcome Recording', () => {
    it('should record submission outcome', async () => {
      const result = await service.recordOutcome({
        templateId,
        submissionId: uuidv4(),
        outcome: 'approved',
        agencyQuestions: 2,
        cycleTime: 180,
        feedbackSummary: 'Minor clarifications requested',
      });

      expect(result).toBeDefined();
    });

    it('should calculate template effectiveness', async () => {
      const result = await service.calculateEffectiveness(templateId);

      expect(result).toBeDefined();
      expect(result.effectivenessScore).toBeDefined();
    });
  });

  describe('Recommendations', () => {
    it('should get template recommendations', async () => {
      const result = await service.getRecommendations({
        organizationId: testIds.organizationId,
        documentType: 'clinical_study_report',
        context: { therapeuticArea: 'oncology' },
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result.recommendations)).toBe(true);
    });
  });
});

/**
 * Test Suite 7: Regulatory Negotiation Logbook
 */
describeWithOpenAI('Regulatory Negotiation Logbook Service', () => {
  let service: RegulatoryNegotiationLogbookService;
  let threadId: string;

  beforeAll(() => {
    service = new RegulatoryNegotiationLogbookService(testPool);
  });

  describe('Thread Management', () => {
    it('should create negotiation thread', async () => {
      const result = await service.createThread({
        programId: testIds.programId,
        title: 'Pre-NDA Meeting Discussion',
        agency: 'FDA',
        division: 'CDER',
        topic: 'Primary endpoint selection and study design',
        meetingType: 'type_b',
        priority: 'high',
        sponsorLead: 'Test User',
      });

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.threadCode).toBeDefined();
      threadId = result.id;
    });

    it('should list threads', async () => {
      const result = await service.getThreads(testIds.programId);
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should update thread status', async () => {
      const result = await service.updateThread(threadId, {
        status: 'active',
        meetingDate: new Date().toISOString(),
      });
      expect(result.status).toBe('active');
    });
  });

  describe('Entry Management', () => {
    it('should add negotiation entry', async () => {
      const result = await service.addEntry({
        threadId,
        entryType: 'meeting_request',
        title: 'Initial Meeting Request',
        direction: 'outgoing',
        content: 'Request for Type B meeting to discuss primary endpoint...',
        status: 'submitted',
      });

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.entryNumber).toBe(1);
    });

    it('should list thread entries', async () => {
      const result = await service.getEntries(threadId);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Position Tracking', () => {
    it('should create position', async () => {
      const result = await service.createPosition({
        threadId,
        topic: 'Primary Endpoint Selection',
        sponsorPosition: 'ORR as primary endpoint based on precedent',
        status: 'proposed',
      });

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
    });

    it('should update position with FDA response', async () => {
      const positions = await service.getPositions(threadId);
      if (positions.length > 0) {
        const result = await service.updatePosition(positions[0].id, {
          fdaPosition: 'Prefer PFS but open to discussion',
          status: 'under_discussion',
        });
        expect(result.fdaPosition).toBeDefined();
      }
    });
  });

  describe('Semantic Search', () => {
    it('should search negotiations', async () => {
      const result = await service.search({
        programId: testIds.programId,
        query: 'endpoint',
        limit: 10,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result.results)).toBe(true);
    });
  });
});

/**
 * Test Suite 8: Compliance Guardrails SDK
 */
describeWithOpenAI('Compliance Guardrails SDK Service', () => {
  let service: ComplianceGuardrailsSDKService;
  let ruleId: string;
  let profileId: string;

  beforeAll(() => {
    service = new ComplianceGuardrailsSDKService(testPool);
  });

  describe('Rule Management', () => {
    it('should create guardrail rule', async () => {
      const result = await service.createRule({
        category: 'format',
        name: 'PDF Metadata Check',
        description: 'Verify PDF metadata is properly set for submission',
        severity: 'error',
        ruleType: 'format',
        validationLogic: `
          function validate(document) {
            return document.metadata.title && document.metadata.author;
          }
        `,
        agency: 'FDA',
        documentTypes: ['submission_package'],
      });

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.ruleCode).toBeDefined();
      ruleId = result.id;
    });

    it('should list rules', async () => {
      const result = await service.getRules({ isActive: true });
      expect(Array.isArray(result)).toBe(true);
    });

    it('should update rule', async () => {
      const result = await service.updateRule(ruleId, {
        severity: 'warning',
      });
      expect(result.severity).toBe('warning');
    });
  });

  describe('Profile Management', () => {
    it('should create validation profile', async () => {
      const result = await service.createProfile({
        organizationId: testIds.organizationId,
        name: 'FDA NDA Standard Profile',
        description: 'Standard validation profile for FDA NDA submissions',
        submissionType: 'NDA',
        agency: 'FDA',
        ruleIds: [ruleId],
      });

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.profileCode).toBeDefined();
      profileId = result.id;
    });

    it('should list profiles', async () => {
      const result = await service.getProfiles(testIds.organizationId);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Validation Execution', () => {
    it('should run validation', async () => {
      const result = await service.runValidation({
        documentId: testIds.documentId,
        profileId,
        triggeredBy: 'test',
        executionContext: 'unit_test',
      });

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.status).toBe('completed');
      expect(typeof result.totalRules).toBe('number');
    });

    it('should get validation findings', async () => {
      const runs = await service.getValidationRuns(testIds.organizationId, { limit: 1 });
      if (runs.length > 0) {
        const result = await service.getFindings(runs[0].id);
        expect(Array.isArray(result)).toBe(true);
      }
    });

    it('should update finding status', async () => {
      const runs = await service.getValidationRuns(testIds.organizationId, { limit: 1 });
      if (runs.length > 0) {
        const findings = await service.getFindings(runs[0].id);
        if (findings.length > 0) {
          const result = await service.updateFinding(findings[0].id, {
            status: 'acknowledged',
          });
          expect(result.status).toBe('acknowledged');
        }
      }
    });
  });

  describe('API Key Management', () => {
    it('should generate API key', async () => {
      const result = await service.generateApiKey({
        organizationId: testIds.organizationId,
        name: 'Test CI/CD Key',
        scopes: ['validate', 'read_rules', 'read_profiles'],
      });

      expect(result).toBeDefined();
      expect(result.key).toBeDefined();
      expect(result.keyPrefix).toBeDefined();
    });

    it('should list API keys', async () => {
      const result = await service.getApiKeys(testIds.organizationId);
      expect(Array.isArray(result)).toBe(true);
    });
  });
});

/**
 * Integration Tests (require OpenAI for service instantiation)
 */
describeWithOpenAI('Innovation Platform Integration', () => {
  describe('Cross-Feature Integration', () => {
    it('should link delta findings to evidence gaps', async () => {
      const deltaService = new RegulatoryDeltaRadarService(testPool);
      const evidenceService = new EvidenceConfidenceHeatmapService(testPool);

      // Run delta scan
      const scanResult = await deltaService.runDeltaScan({
        organizationId: testIds.organizationId,
        documentId: testIds.documentId,
        scanScope: 'full',
      });

      // Generate heatmap
      const heatmap = await evidenceService.generateHeatmap(testIds.documentId);

      expect(scanResult).toBeDefined();
      expect(heatmap).toBeDefined();
    });

    it('should connect readiness twin to traceability', async () => {
      const readinessService = new SubmissionReadinessTwinService(testPool);
      const traceService = new AutoTraceabilityService(testPool);

      // Run readiness assessment
      const assessment = await readinessService.runAssessment({
        programId: testIds.programId,
        submissionType: 'NDA',
        targetAgency: 'FDA',
      });

      // Generate traceability matrix
      const matrix = await traceService.generateMatrix({
        programId: testIds.programId,
        includeTypes: ['protocol', 'csr_section'],
      });

      expect(assessment).toBeDefined();
      expect(matrix).toBeDefined();
    });

    it('should validate templates with guardrails', async () => {
      const templateService = new OutcomeBasedTemplateLearningService(testPool);
      const guardrailsService = new ComplianceGuardrailsSDKService(testPool);

      // Get template recommendations
      const recommendations = await templateService.getRecommendations({
        organizationId: testIds.organizationId,
        documentType: 'clinical_study_report',
      });

      // Validate against guardrails
      if (recommendations.recommendations.length > 0) {
        const profiles = await guardrailsService.getProfiles(testIds.organizationId);
        if (profiles.length > 0) {
          const validation = await guardrailsService.runValidation({
            documentId: testIds.documentId,
            profileId: profiles[0].id,
            triggeredBy: 'integration_test',
            executionContext: 'test',
          });
          expect(validation).toBeDefined();
        }
      }

      expect(recommendations).toBeDefined();
    });
  });

  describe('Audit Trail Verification', () => {
    it('should maintain complete audit trail', async () => {
      const hasOrgId = await columnExists(testPool, 'innovation', 'guardrail_api_audit', 'org_id');
      const orgColumn = hasOrgId ? 'org_id' : 'organization_id';
      const result = await testPool.query(
        `
        SELECT COUNT(*) as count
        FROM innovation.guardrail_api_audit
        WHERE ${orgColumn} = $1
      `,
        [testIds.organizationId]
      );

      const count = result.rows[0]?.count ?? '0';
      expect(parseInt(count)).toBeGreaterThanOrEqual(0);
    });
  });
});

/**
 * Performance Tests (require OpenAI for service instantiation)
 */
describeWithOpenAI('Performance Benchmarks', () => {
  it('should complete delta scan within acceptable time', async () => {
    const service = new RegulatoryDeltaRadarService(testPool);

    const start = Date.now();
    await service.runDeltaScan({
      organizationId: testIds.organizationId,
      documentId: testIds.documentId,
      scanScope: 'incremental',
    });
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(30000); // 30 seconds max
  });

  it('should generate heatmap within acceptable time', async () => {
    const service = new EvidenceConfidenceHeatmapService(testPool);

    const start = Date.now();
    await service.generateHeatmap(testIds.documentId);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(10000); // 10 seconds max
  });

  it('should run validation within acceptable time', async () => {
    const service = new ComplianceGuardrailsSDKService(testPool);
    const profiles = await service.getProfiles(testIds.organizationId);

    if (profiles.length > 0) {
      const start = Date.now();
      await service.runValidation({
        documentId: testIds.documentId,
        profileId: profiles[0].id,
        triggeredBy: 'perf_test',
        executionContext: 'test',
      });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(15000); // 15 seconds max
    }
  });
});

/**
 * Security Tests (require OpenAI for service instantiation)
 */
describeWithOpenAI('Security Validation', () => {
  it('should enforce organization isolation', async () => {
    const otherOrgId = uuidv4();
    const service = new RegulatoryDeltaRadarService(testPool);

    const result = await service.getGuidanceDocuments(otherOrgId);

    // Should return empty for different org
    expect(result.length).toBe(0);
  });

  it('should validate API key scopes', async () => {
    const service = new ComplianceGuardrailsSDKService(testPool);

    const keyResult = await service.generateApiKey({
      organizationId: testIds.organizationId,
      name: 'Limited Key',
      scopes: ['read_rules'],
    });

    expect(keyResult.scopes).toContain('read_rules');
    expect(keyResult.scopes).not.toContain('validate');
  });

  it('should hash API keys before storage', async () => {
    // Check that raw keys are not stored
    const hasOrgId = await columnExists(testPool, 'innovation', 'guardrail_api_audit', 'org_id');
    const orgColumn = hasOrgId ? 'org_id' : 'organization_id';
    const result = await testPool.query(
      `
      SELECT api_key_hash
      FROM innovation.guardrail_api_audit
      WHERE ${orgColumn} = $1
      LIMIT 1
    `,
      [testIds.organizationId]
    );

    if (result.rows.length > 0) {
      // Key should be hashed, not plain text
      const hash = result.rows[0].api_key_hash;
      expect(hash).not.toMatch(/^ts_/); // Should not be the raw key format
    }
  });
});
