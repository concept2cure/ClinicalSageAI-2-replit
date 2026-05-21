/**
 * Tenant-isolation guards on the prisma/client.js wrapper.
 *
 * These guards converted three silent cross-tenant read paths into loud
 * runtime errors on 2026-05-07. The tests exist so a future refactor
 * can't accidentally remove the throws.
 *
 * No DB pool is used — every test exercises a code path that throws
 * before it touches the pool.
 */
import { describe, it, expect, vi} from 'vitest';

// vi.hoisted ensures env vars are set BEFORE any ESM imports (including
// transitive ones) are evaluated. Loading the auth/db/config chain at
// module init requires these to be present, or the chain throws.
vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || 'stage3-test-secret-padded-to-32-chars-or-more-okay';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});


// @ts-expect-error — JS module, no .d.ts, intentional for the runtime guard test.
import prisma from '../client.js';

describe('prisma compat layer — tenant-isolation guards', () => {
  describe('audit_log.findMany', () => {
    it('throws when called with no where', async () => {
      await expect(prisma.audit_log.findMany()).rejects.toThrow(/requires where\.tenantId/);
    });
    it('throws when where lacks tenantId/tenant_id', async () => {
      await expect(prisma.audit_log.findMany({ where: { action: 'login' } })).rejects.toThrow(
        /requires where\.tenantId/
      );
    });
  });

  describe('document.findMany', () => {
    it('throws when called with no where', async () => {
      await expect(prisma.document.findMany()).rejects.toThrow(
        /requires where\.organizationId or where\.clientWorkspaceId/
      );
    });
    it('throws when where has only an unrelated filter', async () => {
      await expect(prisma.document.findMany({ where: { status: 'draft' } })).rejects.toThrow(
        /requires where\.organizationId/
      );
    });
  });

  describe('document.findUnique', () => {
    it('returns null when no id provided (consistent with prior behavior)', async () => {
      await expect(prisma.document.findUnique({ where: {} })).resolves.toBeNull();
    });
    it('throws when id provided but organizationId missing', async () => {
      await expect(prisma.document.findUnique({ where: { id: 'doc-uuid' } })).rejects.toThrow(
        /requires where\.organizationId/
      );
    });
  });

  describe('signature.findMany', () => {
    it('throws when called with no where', async () => {
      await expect(prisma.signature.findMany()).rejects.toThrow(
        /requires where\.documentId or where\.signerId/
      );
    });
  });
});
