/**
 * Cortex Prime Service — MODULE SHAPE ONLY. These are not integration tests.
 *
 * ── RELABELLED 2026-09-10 (WO-1/WO-14), because the old title was a claim ────
 * This file called itself "Cortex Prime Service Integration Tests" and said
 * "these tests ensure core functionality remains intact". It does neither.
 * Every one of its 29 assertions is `expect(typeof service.X).toBe('function')`
 * — it verifies that TypeScript exports exist. No method is called, and the
 * pool is mocked to answer `{ rows: [] }` to any query, so even if one were,
 * the SQL would never meet a schema.
 *
 * That matters because of what the file was green over. An adversarial review
 * on 2026-09-10 materialised the cortex schema from the migrations, in each
 * applier's own sort order, on a real PostgreSQL 16 and ran this service's
 * literal SQL against it. Result: getAtom, updateAtom, deleteAtom (:310, :355,
 * :367), getThread (:555) and getExpertiseScores (:846) all fail with
 * `column "is_active" does not exist` — no definition of cortex.atoms,
 * cortex.threads or cortex.expertise_scores has that column, on any applier, and
 * no ALTER adds it. Every write method is worse: createAtom wants
 * source_id/quality_score/metadata, createThread wants
 * title/context_atom_ids/expires_at, createAgent wants
 * agent_name/description/prompt_template, createEdge wants evidence/metadata,
 * createTrace wants input/output/reasoning/status/token_usage — none of which
 * any migration creates. The failing column even DIFFERS BY ENVIRONMENT:
 * createEdge dies on `evidence` against an operator-provisioned database and on
 * `strength` against a fresh install, because the two appliers build different
 * shapes (evaluation §4).
 *
 * `/api/cortex` is mounted — startup/routes.ts:127 -> bootstrap/
 * register-document-routes.ts:425 -> cortex-unified.ts:1145 — so those are live
 * HTTP 500s, not dead code.
 *
 * Mocking the exact boundary where the bug lives is why this survived. A mock
 * that answers `{ rows: [] }` to every query cannot distinguish a correct query
 * from one naming a column that does not exist, and asserting on `typeof`
 * removes even that chance.
 *
 * These assertions are KEPT — a module that stops exporting its API is worth
 * catching, and the file's own history says the mock target was wrong once
 * before. They are relabelled so nobody reads them as coverage of behaviour.
 * The real coverage this subsystem needs is a schema-contract test that applies
 * the cortex migrations and runs the service's SQL; that is WO-14, along with
 * the product decision the review could not make — whether Cortex Prime is a
 * live capability or dead code, given that
 * docs/validation/IQ-CORTEX-001-INSTALLATION_QUALIFICATION.md presents it as
 * qualified.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock the database pool. CortexPrimeService imports `getPool` from
// `../db` (server/db.ts), NOT `../db/pool` — the previous mock targeted
// the wrong module, so the real getPool() ran in the no-DB test env and
// threw "Database connection not available" at construction. Keep all
// real `../db` exports and override only getPool with a fake pool.
vi.mock('../../db', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const fakePool = {
    connect: vi.fn(() => Promise.resolve({ query: vi.fn(() => Promise.resolve({ rows: [] })), release: vi.fn() })),
    query: vi.fn(() => Promise.resolve({ rows: [] })),
    end: vi.fn(() => Promise.resolve()),
  };
  return { ...actual, getPool: vi.fn(() => fakePool) };
});

describe('CortexPrimeService — module shape (NOT behaviour; see the header)', () => {
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
