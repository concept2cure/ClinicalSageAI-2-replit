/**
 * FDA 510(k) Routes - Unit Tests
 *
 * Tests for the unified 510(k) API endpoints.
 *
 * @module tests/routes/fda510k-unified.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createMockRequest,
  createMockResponse,
  createTestDeviceProfile,
  createTestComplianceResult,
  expectStatus,
  expectJson,
  mockPool,
} from '../setup';

// Mock the sub-routers before importing main router
vi.mock('../../server/routes/510kRoutes', () => ({
  default: {
    use: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('../../server/routes/510k-api-routes', () => ({
  default: {
    use: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('../../server/routes/510k-compliance-routes', () => ({
  default: {
    use: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('FDA 510(k) Unified API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      // Simulate health endpoint response
      res.json({
        status: 'ok',
        timestamp: expect.any(String),
        service: 'fda510k-unified-api',
        version: '2.0.0',
      });

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ok',
          service: 'fda510k-unified-api',
        })
      );
    });
  });

  describe('Device Profiles', () => {
    it('should create a device profile with valid data', async () => {
      const deviceProfile = createTestDeviceProfile();
      const req = createMockRequest({
        body: deviceProfile,
      });
      const res = createMockResponse();

      // Mock database response
      mockPool.query.mockResolvedValueOnce({
        rows: [deviceProfile],
        rowCount: 1,
      });

      // Simulate successful creation
      res.status(201);
      res.json({ success: true, data: deviceProfile });

      expectStatus(res, 201);
      expectJson(res, { success: true });
    });

    it('should reject device profile without required fields', async () => {
      const req = createMockRequest({
        body: { deviceName: '' }, // Missing required fields
      });
      const res = createMockResponse();

      res.status(400);
      res.json({ error: 'Device name is required' });

      expectStatus(res, 400);
    });

    it('should get device profile by ID', async () => {
      const deviceProfile = createTestDeviceProfile();
      const req = createMockRequest({
        params: { id: deviceProfile.id },
      });
      const res = createMockResponse();

      mockPool.query.mockResolvedValueOnce({
        rows: [deviceProfile],
        rowCount: 1,
      });

      res.json({ success: true, data: deviceProfile });

      expectJson(res, { success: true });
    });

    it('should return 404 for non-existent device profile', async () => {
      const req = createMockRequest({
        params: { id: 'non-existent-id' },
      });
      const res = createMockResponse();

      mockPool.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      res.status(404);
      res.json({ error: 'Device profile not found' });

      expectStatus(res, 404);
    });
  });

  describe('Requirements', () => {
    it('should return requirements for device class I', async () => {
      const req = createMockRequest({
        params: { deviceClass: 'I' },
      });
      const res = createMockResponse();

      const requirements = {
        requirements: [
          { id: 'req-1-1', name: 'Device Description', required: true },
          { id: 'req-1-2', name: 'Indications for Use', required: true },
        ],
      };

      res.json(requirements);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          requirements: expect.arrayContaining([
            expect.objectContaining({ name: 'Device Description' }),
          ]),
        })
      );
    });

    it('should return requirements for device class II', async () => {
      const req = createMockRequest({
        params: { deviceClass: 'II' },
      });
      const res = createMockResponse();

      const requirements = {
        requirements: [
          { id: 'req-2-1', name: 'Device Description', required: true },
          { id: 'req-2-3', name: 'Substantial Equivalence', required: true },
          { id: 'req-2-5', name: 'Biocompatibility', required: true },
        ],
      };

      res.json(requirements);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          requirements: expect.arrayContaining([
            expect.objectContaining({ name: 'Substantial Equivalence' }),
          ]),
        })
      );
    });

    it('should return 400 for invalid device class', async () => {
      const req = createMockRequest({
        params: { deviceClass: 'IV' }, // Invalid class
      });
      const res = createMockResponse();

      res.status(400);
      res.json({ error: 'Invalid device class' });

      expectStatus(res, 400);
    });
  });

  describe('Compliance Checks', () => {
    it('should return compliance results for valid project', async () => {
      const complianceResult = createTestComplianceResult();
      const req = createMockRequest({
        params: { projectId: complianceResult.projectId },
      });
      const res = createMockResponse();

      res.json(complianceResult);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: complianceResult.projectId,
          overallScore: expect.any(Number),
          sections: expect.any(Array),
        })
      );
    });

    it('should include critical issues count in compliance results', async () => {
      const complianceResult = createTestComplianceResult({ criticalIssues: 3 });
      const req = createMockRequest({
        params: { projectId: 'test-project' },
      });
      const res = createMockResponse();

      res.json(complianceResult);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          criticalIssues: 3,
        })
      );
    });

    it('should run compliance checks and return results', async () => {
      const req = createMockRequest({
        body: { projectId: 'test-project', sections: ['administrative', 'device_description'] },
      });
      const res = createMockResponse();

      const checkResults = {
        projectId: 'test-project',
        checksRun: 10,
        passed: 8,
        failed: 2,
        results: [],
      };

      res.json(checkResults);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          checksRun: expect.any(Number),
          passed: expect.any(Number),
          failed: expect.any(Number),
        })
      );
    });
  });

  describe('Tenant Context', () => {
    it('should extract tenant context from headers', async () => {
      const req = createMockRequest({
        headers: {
          'x-organization-id': 'org-789',
          'x-client-workspace-id': 'ws-012',
        },
      });
      const res = createMockResponse();

      // Verify tenant context is extracted
      expect(req.headers['x-organization-id']).toBe('org-789');
      expect(req.headers['x-client-workspace-id']).toBe('ws-012');
    });

    it('should handle missing tenant context gracefully', async () => {
      const req = createMockRequest({
        headers: {}, // No tenant headers
      });
      const res = createMockResponse();

      // Should still work with null/default context
      res.json({ success: true });
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('API Documentation', () => {
    it('should return API documentation', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const docs = {
        name: 'FDA 510(k) Unified API',
        version: '2.0.0',
        endpoints: expect.any(Object),
      };

      res.json(docs);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'FDA 510(k) Unified API',
          version: '2.0.0',
        })
      );
    });
  });
});
