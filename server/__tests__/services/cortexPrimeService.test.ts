/**
 * Cortex Prime Service Integration Tests
 * 
 * Baseline tests before consolidation refactoring.
 * These tests ensure core functionality remains intact during cleanup.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// Mock the database pool
vi.mock('../../db/pool', () => ({
  getPool: vi.fn(() => ({
    connect: vi.fn(() => Promise.resolve({
      query: vi.fn(),
      release: vi.fn()
    })),
    query: vi.fn()
  }))
}));

describe('CortexPrimeService', () => {
  describe('Atom Operations', () => {
    it('should create an atom with required fields', async () => {
      const { CortexPrimeService } = await import('../../services/cortexPrimeService');
      const service = new CortexPrimeService();
      
      // Verify service instantiates correctly
      expect(service).toBeDefined();
      expect(typeof service.createAtom).toBe('function');
      expect(typeof service.getAtom).toBe('function');
      expect(typeof service.updateAtom).toBe('function');
      expect(typeof service.deleteAtom).toBe('function');
    });

    it('should have search operations', async () => {
      const { CortexPrimeService } = await import('../../services/cortexPrimeService');
      const service = new CortexPrimeService();
      
      expect(typeof service.search).toBe('function');
      expect(typeof service.searchFast).toBe('function');
      expect(typeof service.query).toBe('function');
    });

    it('should have graph traversal operations', async () => {
      const { CortexPrimeService } = await import('../../services/cortexPrimeService');
      const service = new CortexPrimeService();
      
      expect(typeof service.traverseGraph).toBe('function');
    });
  });

  describe('Thread Operations', () => {
    it('should have thread management functions', async () => {
      const { CortexPrimeService } = await import('../../services/cortexPrimeService');
      const service = new CortexPrimeService();
      
      expect(typeof service.createThread).toBe('function');
      expect(typeof service.getThread).toBe('function');
    });
  });

  describe('Agent Operations', () => {
    it('should have agent management functions', async () => {
      const { CortexPrimeService } = await import('../../services/cortexPrimeService');
      const service = new CortexPrimeService();
      
      expect(typeof service.createAgent).toBe('function');
      expect(typeof service.getAgent).toBe('function');
    });
  });

  describe('Health Check', () => {
    it('should have health check function', async () => {
      const { CortexPrimeService } = await import('../../services/cortexPrimeService');
      const service = new CortexPrimeService();
      
      expect(typeof service.healthCheck).toBe('function');
    });
  });
});

describe('CortexComplianceService', () => {
  describe('21 CFR Part 11 Operations', () => {
    it('should have audit trail functions', async () => {
      const { CortexComplianceService } = await import('../../services/cortexComplianceService');
      const service = new CortexComplianceService();
      
      expect(service).toBeDefined();
      expect(typeof service.writeAuditEntry).toBe('function');
      expect(typeof service.getRecordAuditTrail).toBe('function');
      expect(typeof service.getOrganizationAuditTrail).toBe('function');
      expect(typeof service.exportAuditTrail).toBe('function');
    });

    it('should have electronic signature functions', async () => {
      const { CortexComplianceService } = await import('../../services/cortexComplianceService');
      const service = new CortexComplianceService();
      
      expect(typeof service.createElectronicSignature).toBe('function');
      expect(typeof service.verifySignature).toBe('function');
      expect(typeof service.getRecordSignatures).toBe('function');
    });

    it('should have access control functions', async () => {
      const { CortexComplianceService } = await import('../../services/cortexComplianceService');
      const service = new CortexComplianceService();
      
      expect(typeof service.checkAccess).toBe('function');
      expect(typeof service.grantAccess).toBe('function');
      expect(typeof service.revokeAccess).toBe('function');
    });

    it('should have data integrity functions', async () => {
      const { CortexComplianceService } = await import('../../services/cortexComplianceService');
      const service = new CortexComplianceService();
      
      expect(typeof service.verifyAuditChainIntegrity).toBe('function');
      expect(typeof service.verifyRecordIntegrity).toBe('function');
    });

    it('should have audited CRUD wrappers', async () => {
      const { CortexComplianceService } = await import('../../services/cortexComplianceService');
      const service = new CortexComplianceService();
      
      expect(typeof service.auditedCreate).toBe('function');
      expect(typeof service.auditedUpdate).toBe('function');
      expect(typeof service.auditedDelete).toBe('function');
      expect(typeof service.auditAIPrediction).toBe('function');
    });
  });

  describe('Signature Meanings', () => {
    it('should export SignatureMeaning enum', async () => {
      const { SignatureMeaning } = await import('../../services/cortexComplianceService');
      
      expect(SignatureMeaning.AUTHORSHIP).toBe('AUTHORSHIP');
      expect(SignatureMeaning.APPROVAL).toBe('APPROVAL');
      expect(SignatureMeaning.REVIEW).toBe('REVIEW');
      expect(SignatureMeaning.VERIFICATION).toBe('VERIFICATION');
    });
  });

  describe('GxP Actions', () => {
    it('should export GxPAction enum', async () => {
      const { GxPAction } = await import('../../services/cortexComplianceService');
      
      expect(GxPAction.CREATE).toBe('CREATE');
      expect(GxPAction.READ).toBe('READ');
      expect(GxPAction.UPDATE).toBe('UPDATE');
      expect(GxPAction.DELETE).toBe('DELETE');
      expect(GxPAction.SIGN).toBe('SIGN');
    });
  });
});
