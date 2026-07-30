/**
 * Schema-backed acceptance test for ModuleIntegrationService.documentExists — the
 * dedup guard at the canonical document-enrollment boundary.
 *
 * WHY THIS EXISTS. documentExists() previously built its query as
 *     .select({ count: { count: 'id' } })
 * and returned `result[0].count > 0`. That projection is neither a column nor a
 * `sql` expression — it is a nested plain object — so Drizzle never emitted a
 * COUNT(*), and `result[0].count` was never a meaningful number. The guard's
 * truth value was an artifact of that malformed shape, not of whether the
 * document actually existed. A dedup guard that cannot be trusted either lets a
 * duplicate module document enroll twice or blocks a legitimately new one.
 *
 * This test runs the REAL service against a REAL Postgres (PGlite) carrying the
 * exact module_documents shape from shared/schema/unified_workflow.ts, and pins
 * the semantics the fixed existence probe must have: true for the exact
 * (moduleType, originalId, organizationId) triple, and false for every partial
 * match — including a different tenant with the same originalId, which is where a
 * broken guard leaks across orgs.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ModuleIntegrationService, isModuleType } from '../../server/services/ModuleIntegrationService';

const DB_TIMEOUT_MS = 120_000;

let pglite: import('@electric-sql/pglite').PGlite;
let service: ModuleIntegrationService;

beforeAll(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');

  pglite = new PGlite();
  // Exactly the shape shared/schema/unified_workflow.ts defines (module_documents
  // is a drizzle-push table with no migration DDL of its own), plus the minimal
  // unified_documents parent the FK points at.
  await pglite.exec(`
    CREATE TYPE module_type AS ENUM ('cmc','cer','study','ectd','510k','vault');
    CREATE TABLE unified_documents (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      organization_id INTEGER NOT NULL
    );
    CREATE TABLE module_documents (
      id SERIAL PRIMARY KEY,
      unified_document_id INTEGER NOT NULL REFERENCES unified_documents(id) ON DELETE CASCADE,
      module_type module_type NOT NULL,
      original_id TEXT NOT NULL,
      organization_id INTEGER NOT NULL,
      metadata JSONB DEFAULT '{}'
    );
    -- org 1 owns a CMC document with original id DOC-1.
    INSERT INTO unified_documents (id, title, organization_id) VALUES (1, 'Drug substance spec', 1);
    INSERT INTO module_documents (unified_document_id, module_type, original_id, organization_id)
      VALUES (1, 'cmc', 'DOC-1', 1);
    -- org 2 owns an UNRELATED document that happens to reuse original id DOC-1
    -- under a different module — the exact collision a tenant-blind guard leaks on.
    INSERT INTO unified_documents (id, title, organization_id) VALUES (2, 'Clinical eval', 2);
    INSERT INTO module_documents (unified_document_id, module_type, original_id, organization_id)
      VALUES (2, 'cer', 'DOC-1', 2);
  `);

  service = new ModuleIntegrationService(drizzle(pglite) as never);
}, DB_TIMEOUT_MS);

afterAll(async () => {
  await pglite?.close();
});

describe('ModuleIntegrationService.documentExists — schema-backed dedup guard', () => {
  it('returns true only for the exact enrolled (moduleType, originalId, org) triple', async () => {
    expect(await service.documentExists('cmc', 'DOC-1', 1)).toBe(true);
  });

  it('returns false when the document is not enrolled at all', async () => {
    expect(await service.documentExists('cmc', 'DOC-DOES-NOT-EXIST', 1)).toBe(false);
  });

  it('is tenant-scoped: org 2 reusing the same originalId+module does not match org 1', async () => {
    // org 1 has ('cmc','DOC-1'); org 2 has ('cer','DOC-1'). Neither cross-matches.
    expect(await service.documentExists('cmc', 'DOC-1', 2)).toBe(false);
    expect(await service.documentExists('cer', 'DOC-1', 1)).toBe(false);
  });

  it('discriminates on module_type: org 2 owns cer/DOC-1, not cmc/DOC-1', async () => {
    expect(await service.documentExists('cer', 'DOC-1', 2)).toBe(true);
    expect(await service.documentExists('cmc', 'DOC-1', 2)).toBe(false);
  });
});

describe('isModuleType — the enrollment-boundary enum guard', () => {
  it('accepts every legal module_type and rejects anything else', () => {
    for (const legal of ['cmc', 'cer', 'study', 'ectd', '510k', 'vault']) {
      expect(isModuleType(legal)).toBe(true);
    }
    expect(isModuleType('not-a-module')).toBe(false);
    expect(isModuleType('CMC')).toBe(false); // case-sensitive: the column is lower-case
    expect(isModuleType(undefined)).toBe(false);
    expect(isModuleType(510)).toBe(false);
    expect(isModuleType(['cmc'])).toBe(false);
  });
});
