/**
 * Innovation Platform Test Suite — the Submission Readiness Twin.
 *
 * 2026-10-15: this file tested all eight innovation services. The other seven,
 * and the unmounted router that was their only importer, were deleted; their
 * suites (and the cross-feature, performance and security suites built on
 * them) went with them. What remains needs RUN_INTEGRATION_TESTS, a database
 * and OPENAI_API_KEY.
 */

import { describe as baseDescribe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

import { SubmissionReadinessTwinService } from '../../server/services/innovation/submission-readiness-twin-service';

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
    await testPool.end();
  });
}

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

    // Pinned the invented ±5 confidenceInterval until 2026-10-15; the method
    // now returns the latest recorded score and nothing it did not compute.
    it('reports the latest recorded score, with no invented interval', async () => {
      const result = await service.generatePredictions(testIds.programId);

      expect(result).toHaveProperty('latestRecordedScore');
      expect(result).not.toHaveProperty('confidenceInterval');
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
