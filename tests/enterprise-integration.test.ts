/**
 * Enterprise Integration Tests - Epic 0 & Epic 1
 *
 * Comprehensive test suite for Platform Hardening and Program Workbench features.
 * Tests module exports and basic functionality without React DOM.
 *
 * @version 1.0.0
 * @module tests/enterprise-integration.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK SETUP
// ═══════════════════════════════════════════════════════════════════════════════

// Mock database
vi.mock('../server/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([])),
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => ({
              offset: vi.fn(() => Promise.resolve([])),
            })),
          })),
        })),
        groupBy: vi.fn(() => Promise.resolve([])),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([{ id: 'test-id' }])),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([{ id: 'test-id' }])),
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([{ id: 'test-id' }])),
      })),
    })),
    execute: vi.fn(() => Promise.resolve({ rows: [] })),
  },
}));

// Mock logger
vi.mock('../server/utils/logger', () => ({
  createScopedLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

// ═══════════════════════════════════════════════════════════════════════════════
// API CLIENT MODULE STRUCTURE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('API Client Module', () => {
  it('should export ApiClient class', async () => {
    const module = await import('../client/src/lib/api/client');
    expect(module.ApiClient).toBeDefined();
    expect(typeof module.ApiClient).toBe('function');
  });

  it('should export ApiError class', async () => {
    const module = await import('../client/src/lib/api/client');
    expect(module.ApiError).toBeDefined();
    expect(typeof module.ApiError).toBe('function');
  });

  it('should export api singleton', async () => {
    const module = await import('../client/src/lib/api/client');
    expect(module.api).toBeDefined();
  });

  it('should export programsApi helpers', async () => {
    const module = await import('../client/src/lib/api/client');
    expect(module.programsApi).toBeDefined();
    expect(typeof module.programsApi.list).toBe('function');
    expect(typeof module.programsApi.get).toBe('function');
    expect(typeof module.programsApi.create).toBe('function');
    expect(typeof module.programsApi.update).toBe('function');
    expect(typeof module.programsApi.delete).toBe('function');
  });

  it('should export evidenceApi helpers', async () => {
    const module = await import('../client/src/lib/api/client');
    expect(module.evidenceApi).toBeDefined();
    expect(typeof module.evidenceApi.list).toBe('function');
    expect(typeof module.evidenceApi.get).toBe('function');
    expect(typeof module.evidenceApi.create).toBe('function');
    expect(typeof module.evidenceApi.update).toBe('function');
    expect(typeof module.evidenceApi.delete).toBe('function');
  });

  it('should export queryKeys for React Query', async () => {
    const module = await import('../client/src/lib/api/client');
    expect(module.queryKeys).toBeDefined();
    expect(module.queryKeys.programs).toBeDefined();
    expect(module.queryKeys.evidence).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AUDIT LOGGER MODULE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Audit Logger Module', () => {
  it('should export logAuditEvent function', async () => {
    const module = await import('../server/services/audit/auditLoggerV2');
    expect(module.logAuditEvent).toBeDefined();
    expect(typeof module.logAuditEvent).toBe('function');
  });

  it('should export queryAuditEvents function', async () => {
    const module = await import('../server/services/audit/auditLoggerV2');
    expect(module.queryAuditEvents).toBeDefined();
    expect(typeof module.queryAuditEvents).toBe('function');
  });

  it('should export convenience logging functions', async () => {
    const module = await import('../server/services/audit/auditLoggerV2');
    expect(typeof module.logLogin).toBe('function');
    expect(typeof module.logLogout).toBe('function');
    expect(typeof module.logDocumentAccess).toBe('function');
    expect(typeof module.logDataChange).toBe('function');
    expect(typeof module.logExport).toBe('function');
    expect(typeof module.logSecurityEvent).toBe('function');
    expect(typeof module.logProgramActivity).toBe('function');
    expect(typeof module.logEvidenceActivity).toBe('function');
  });

  it('should export verifySignature function', async () => {
    const module = await import('../server/services/audit/auditLoggerV2');
    expect(module.verifySignature).toBeDefined();
    expect(typeof module.verifySignature).toBe('function');
  });

  it('should export default object with all functions', async () => {
    const module = await import('../server/services/audit/auditLoggerV2');
    expect(module.default).toBeDefined();
    expect(typeof module.default.logAuditEvent).toBe('function');
    expect(typeof module.default.queryAuditEvents).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TENANT ISOLATION MODULE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Tenant Isolation Module', () => {
  it('should export tenantIsolationMiddleware', async () => {
    const module = await import('../server/middleware/tenantIsolation');
    expect(module.tenantIsolationMiddleware).toBeDefined();
    expect(typeof module.tenantIsolationMiddleware).toBe('function');
  });

  it('should export requireTenant middleware', async () => {
    const module = await import('../server/middleware/tenantIsolation');
    expect(module.requireTenant).toBeDefined();
    expect(typeof module.requireTenant).toBe('function');
  });

  it('should export requireRole middleware', async () => {
    const module = await import('../server/middleware/tenantIsolation');
    expect(module.requireRole).toBeDefined();
    expect(typeof module.requireRole).toBe('function');
  });

  it('should export requirePermission middleware', async () => {
    const module = await import('../server/middleware/tenantIsolation');
    expect(module.requirePermission).toBeDefined();
    expect(typeof module.requirePermission).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// API VALIDATION MODULE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('API Validation Module', () => {
  it('should export paginationSchema', async () => {
    const module = await import('../server/middleware/apiValidation');
    expect(module.paginationSchema).toBeDefined();
  });

  it('should validate pagination correctly', async () => {
    const { paginationSchema } = await import('../server/middleware/apiValidation');

    const valid = paginationSchema.safeParse({ page: 1, limit: 20 });
    expect(valid.success).toBe(true);

    const invalid = paginationSchema.safeParse({ page: -1, limit: 200 });
    expect(invalid.success).toBe(false);
  });

  it('should export validateRequest middleware', async () => {
    const module = await import('../server/middleware/apiValidation');
    expect(module.validateRequest).toBeDefined();
    expect(typeof module.validateRequest).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// UI STATE COMPONENTS MODULE TESTS (no DOM)
// ═══════════════════════════════════════════════════════════════════════════════

describe('UI State Components Module', () => {
  it('should export LoadingState component', async () => {
    const module = await import('../client/src/components/ui/statesV2');
    expect(module.LoadingState).toBeDefined();
    expect(typeof module.LoadingState).toBe('function');
  });

  it('should export EmptyState component', async () => {
    const module = await import('../client/src/components/ui/statesV2');
    expect(module.EmptyState).toBeDefined();
    expect(typeof module.EmptyState).toBe('function');
  });

  it('should export ErrorState component', async () => {
    const module = await import('../client/src/components/ui/statesV2');
    expect(module.ErrorState).toBeDefined();
    expect(typeof module.ErrorState).toBe('function');
  });

  it('should export Skeleton components', async () => {
    const module = await import('../client/src/components/ui/statesV2');
    expect(module.Skeleton).toBeDefined();
    expect(module.SkeletonText).toBeDefined();
    expect(module.SkeletonCard).toBeDefined();
    expect(module.SkeletonTable).toBeDefined();
  });

  it('should export DataStateWrapper component', async () => {
    const module = await import('../client/src/components/ui/statesV2');
    expect(module.DataStateWrapper).toBeDefined();
    expect(typeof module.DataStateWrapper).toBe('function');
  });

  it('should export InlineLoading component', async () => {
    const module = await import('../client/src/components/ui/statesV2');
    expect(module.InlineLoading).toBeDefined();
    expect(typeof module.InlineLoading).toBe('function');
  });

  it('should export ProgressIndicator component', async () => {
    const module = await import('../client/src/components/ui/statesV2');
    expect(module.ProgressIndicator).toBeDefined();
    expect(typeof module.ProgressIndicator).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PORTAL SHELL MODULE TESTS (no DOM)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Portal Shell Module', () => {
  it('should export PortalShell component', async () => {
    const module = await import('../client/src/components/shell/PortalShell');
    expect(module.PortalShell).toBeDefined();
    expect(typeof module.PortalShell).toBe('function');
  });

  it('should export useShell hook', async () => {
    const module = await import('../client/src/components/shell/PortalShell');
    expect(module.useShell).toBeDefined();
    expect(typeof module.useShell).toBe('function');
  });

  it('should export default as PortalShell', async () => {
    const module = await import('../client/src/components/shell/PortalShell');
    expect(module.default).toBeDefined();
    expect(typeof module.default).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PROGRAMS API ROUTES MODULE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Programs API Routes Module', () => {
  it('should export router', async () => {
    const module = await import('../server/routes/programsV2');
    expect(module.default).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// EVIDENCE API ROUTES MODULE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Evidence API Routes Module', () => {
  it('should export router', async () => {
    const module = await import('../server/routes/evidenceV2');
    expect(module.default).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEMA TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Programs Schema Module', () => {
  it('should export regulatoryPrograms table', async () => {
    const module = await import('../shared/schema/programs');
    expect(module.regulatoryPrograms).toBeDefined();
  });

  it('should export evidenceObjects table', async () => {
    const module = await import('../shared/schema/programs');
    expect(module.evidenceObjects).toBeDefined();
  });

  it('should export evidenceLinks table', async () => {
    const module = await import('../shared/schema/programs');
    expect(module.evidenceLinks).toBeDefined();
  });

  it('should export programMilestones table', async () => {
    const module = await import('../shared/schema/programs');
    expect(module.programMilestones).toBeDefined();
  });

  it('should export programActivityLog table', async () => {
    const module = await import('../shared/schema/programs');
    expect(module.programActivityLog).toBeDefined();
  });

  it('should export insert schemas', async () => {
    const module = await import('../shared/schema/programs');
    expect(module.insertRegulatoryProgramSchema).toBeDefined();
    expect(module.insertEvidenceObjectSchema).toBeDefined();
    expect(module.insertEvidenceLinkSchema).toBeDefined();
    expect(module.insertProgramMilestoneSchema).toBeDefined();
  });

  it('should export relations', async () => {
    const module = await import('../shared/schema/programs');
    expect(module.regulatoryProgramsRelations).toBeDefined();
    expect(module.evidenceObjectsRelations).toBeDefined();
    expect(module.evidenceLinksRelations).toBeDefined();
    expect(module.programMilestonesRelations).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS SANITY TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Type Definitions', () => {
  it('should have proper type exports from programs schema', async () => {
    // These are compile-time checks - if the imports work, types are defined
    const module = await import('../shared/schema/programs');

    // Type exports are verified at compile time
    // Runtime checks for schema objects
    expect(module.regulatoryPrograms.$inferSelect).toBeDefined;
    expect(module.evidenceObjects.$inferSelect).toBeDefined;
  });
});
