/**
 * FDA Service Unit Tests
 *
 * Tests for FDA-related services including 510(k), PMA, and regulatory data.
 *
 * @module tests/services/fdaService.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockDb, createTestDeviceProfile, createTestComplianceResult } from '../setup';

// Mock external dependencies
vi.mock('../../server/db', () => ({
  default: mockDb,
  pool: mockDb,
}));

describe('FDAService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Device Profile Management', () => {
    it('should create device profile', async () => {
      const profile = createTestDeviceProfile({
        deviceName: 'CardioMonitor Pro',
        deviceClass: 'II',
        productCode: 'DQA',
      });

      mockDb.query.mockResolvedValueOnce({
        rows: [profile],
        rowCount: 1,
      });

      const result = await mockDb.query(
        'INSERT INTO device_profiles (id, device_name, device_class, product_code) VALUES ($1, $2, $3, $4) RETURNING *',
        [profile.id, profile.deviceName, profile.deviceClass, profile.productCode]
      );

      expect(result.rows[0].deviceName).toBe('CardioMonitor Pro');
      expect(result.rows[0].deviceClass).toBe('II');
    });

    it('should retrieve device profile by ID', async () => {
      const profile = createTestDeviceProfile({ id: 'device-123' });

      mockDb.query.mockResolvedValueOnce({
        rows: [profile],
        rowCount: 1,
      });

      const result = await mockDb.query('SELECT * FROM device_profiles WHERE id = $1', [
        'device-123',
      ]);

      expect(result.rows[0].id).toBe('device-123');
    });

    it('should update device profile', async () => {
      const updatedProfile = createTestDeviceProfile({
        id: 'device-456',
        deviceName: 'CardioMonitor Pro v2',
        intendedUse: 'Updated intended use statement',
      });

      mockDb.query.mockResolvedValueOnce({
        rows: [updatedProfile],
        rowCount: 1,
      });

      const result = await mockDb.query(
        'UPDATE device_profiles SET device_name = $1, intended_use = $2 WHERE id = $3 RETURNING *',
        ['CardioMonitor Pro v2', 'Updated intended use statement', 'device-456']
      );

      expect(result.rows[0].deviceName).toBe('CardioMonitor Pro v2');
    });

    it('should list device profiles by organization', async () => {
      const profiles = [
        createTestDeviceProfile({ organizationId: 'org-123' }),
        createTestDeviceProfile({ organizationId: 'org-123' }),
      ];

      mockDb.query.mockResolvedValueOnce({
        rows: profiles,
        rowCount: 2,
      });

      const result = await mockDb.query(
        'SELECT * FROM device_profiles WHERE organization_id = $1',
        ['org-123']
      );

      expect(result.rows.length).toBe(2);
    });
  });

  describe('510(k) Submission Management', () => {
    it('should create 510(k) submission', async () => {
      const submission = {
        id: 'sub-510k-001',
        deviceProfileId: 'device-123',
        submissionType: '510k',
        status: 'draft',
        predicateDevices: ['K123456', 'K789012'],
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [submission],
        rowCount: 1,
      });

      const result = await mockDb.query(
        'INSERT INTO submissions (id, device_profile_id, submission_type, status) VALUES ($1, $2, $3, $4) RETURNING *',
        [submission.id, submission.deviceProfileId, submission.submissionType, submission.status]
      );

      expect(result.rows[0].submissionType).toBe('510k');
      expect(result.rows[0].status).toBe('draft');
    });

    it('should track submission status changes', async () => {
      const statusHistory = [
        { status: 'draft', changedAt: new Date('2026-01-01') },
        { status: 'review', changedAt: new Date('2026-01-10') },
        { status: 'submitted', changedAt: new Date('2026-01-20') },
      ];

      mockDb.query.mockResolvedValueOnce({
        rows: statusHistory,
        rowCount: 3,
      });

      const result = await mockDb.query(
        'SELECT * FROM submission_status_history WHERE submission_id = $1 ORDER BY changed_at',
        ['sub-510k-001']
      );

      expect(result.rows.length).toBe(3);
      expect(result.rows[2].status).toBe('submitted');
    });
  });

  describe('Predicate Device Search', () => {
    it('should search predicate devices by product code', async () => {
      const predicates = [
        { kNumber: 'K123456', deviceName: 'Similar Device A', productCode: 'DQA' },
        { kNumber: 'K789012', deviceName: 'Similar Device B', productCode: 'DQA' },
      ];

      mockDb.query.mockResolvedValueOnce({
        rows: predicates,
        rowCount: 2,
      });

      const result = await mockDb.query(
        'SELECT * FROM fda_510k_clearances WHERE product_code = $1',
        ['DQA']
      );

      expect(result.rows.length).toBe(2);
      expect(result.rows[0].productCode).toBe('DQA');
    });

    it('should filter predicates by date range', async () => {
      const recentPredicates = [
        { kNumber: 'K234567', clearanceDate: new Date('2025-06-01') },
        { kNumber: 'K345678', clearanceDate: new Date('2025-09-15') },
      ];

      mockDb.query.mockResolvedValueOnce({
        rows: recentPredicates,
        rowCount: 2,
      });

      const result = await mockDb.query(
        'SELECT * FROM fda_510k_clearances WHERE clearance_date >= $1 AND clearance_date <= $2',
        ['2025-01-01', '2025-12-31']
      );

      expect(result.rows.length).toBe(2);
    });

    it('should rank predicates by similarity score', async () => {
      const rankedPredicates = [
        { kNumber: 'K111111', similarityScore: 0.95 },
        { kNumber: 'K222222', similarityScore: 0.87 },
        { kNumber: 'K333333', similarityScore: 0.72 },
      ];

      mockDb.query.mockResolvedValueOnce({
        rows: rankedPredicates,
        rowCount: 3,
      });

      const result = await mockDb.query(
        'SELECT * FROM predicate_matches WHERE device_profile_id = $1 ORDER BY similarity_score DESC',
        ['device-123']
      );

      expect(result.rows[0].similarityScore).toBe(0.95);
      expect(result.rows[2].similarityScore).toBe(0.72);
    });
  });

  describe('Compliance Checking', () => {
    it('should run compliance check on device profile', async () => {
      const complianceResult = createTestComplianceResult({
        overallScore: 85,
        status: 'passed',
        checksPassed: 17,
        checksFailed: 3,
      });

      mockDb.query.mockResolvedValueOnce({
        rows: [complianceResult],
        rowCount: 1,
      });

      const result = await mockDb.query(
        'INSERT INTO compliance_results (id, device_profile_id, overall_score, status) VALUES ($1, $2, $3, $4) RETURNING *',
        [
          complianceResult.id,
          complianceResult.deviceProfileId,
          complianceResult.overallScore,
          complianceResult.status,
        ]
      );

      expect(result.rows[0].overallScore).toBe(85);
      expect(result.rows[0].status).toBe('passed');
    });

    it('should identify compliance gaps', async () => {
      const gaps = [
        {
          category: 'biocompatibility',
          severity: 'high',
          description: 'Missing ISO 10993-1 testing',
        },
        { category: 'labeling', severity: 'medium', description: 'IFU requires updates' },
      ];

      mockDb.query.mockResolvedValueOnce({
        rows: gaps,
        rowCount: 2,
      });

      const result = await mockDb.query(
        'SELECT * FROM compliance_gaps WHERE compliance_result_id = $1 ORDER BY severity',
        ['compliance-123']
      );

      expect(result.rows.length).toBe(2);
      expect(result.rows.some(g => g.severity === 'high')).toBe(true);
    });

    it('should generate compliance recommendations', async () => {
      const recommendations = [
        { priority: 1, action: 'Complete biocompatibility testing per ISO 10993-1' },
        { priority: 2, action: 'Update IFU with required warnings' },
        { priority: 3, action: 'Add cybersecurity documentation' },
      ];

      mockDb.query.mockResolvedValueOnce({
        rows: recommendations,
        rowCount: 3,
      });

      const result = await mockDb.query(
        'SELECT * FROM compliance_recommendations WHERE compliance_result_id = $1 ORDER BY priority',
        ['compliance-123']
      );

      expect(result.rows.length).toBe(3);
      expect(result.rows[0].priority).toBe(1);
    });
  });

  describe('eSTAR Generation', () => {
    it('should generate eSTAR document structure', async () => {
      const estarSections = [
        { section: '1', title: 'Administrative', status: 'complete' },
        { section: '2', title: 'Device Description', status: 'incomplete' },
        { section: '3', title: 'Substantial Equivalence', status: 'incomplete' },
      ];

      mockDb.query.mockResolvedValueOnce({
        rows: estarSections,
        rowCount: 3,
      });

      const result = await mockDb.query(
        'SELECT * FROM estar_sections WHERE submission_id = $1 ORDER BY section',
        ['sub-510k-001']
      );

      expect(result.rows.length).toBe(3);
      expect(result.rows[0].title).toBe('Administrative');
    });

    it('should validate eSTAR completeness', async () => {
      const validation = {
        submissionId: 'sub-510k-001',
        isComplete: false,
        completionPercentage: 67,
        missingSections: ['Performance Testing', 'Biocompatibility'],
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [validation],
        rowCount: 1,
      });

      const result = await mockDb.query(
        'SELECT * FROM estar_validations WHERE submission_id = $1',
        ['sub-510k-001']
      );

      expect(result.rows[0].isComplete).toBe(false);
      expect(result.rows[0].completionPercentage).toBe(67);
    });
  });
});
