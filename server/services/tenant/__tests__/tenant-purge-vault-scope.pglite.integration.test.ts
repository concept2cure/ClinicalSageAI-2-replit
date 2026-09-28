/**
 * GDPR erasure must not leave vault bytes behind — against REAL Postgres.
 *
 * The purge's vault entries were keyed on `organization_id = $1`. That column
 * is NULLABLE by design: shared/schema/vault.ts records "NULL = unattributable
 * — the program is missing or soft-deleted". So a document whose programme had
 * been soft-deleted carried NULL, matched nothing, and survived an erasure with
 * its bytes intact. Naming the vault tables where they actually live fixed the
 * table-level miss and left this row-level one behind, in precisely the rows
 * most likely to be old enough for someone to ask about.
 *
 * These run the REAL predicate strings from the module against a real database.
 * A mocked pool records SQL text; only an engine tells you which rows it spares.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { PURGE_PARENT_SCOPED, PURGE_CHILD_TABLES } from '../tenant-offboarding';
import { exportTenantFull } from '../../tenant-export/tenant-full-export.service';

const ORG = 11;
const OTHER_ORG = 22;
const LIVE_PROGRAM = '11111111-1111-4111-8111-111111111111';
const SOFT_DELETED_PROGRAM = '33333333-3333-4333-8333-333333333333';
const OTHER_PROGRAM = '22222222-2222-4222-8222-222222222222';

let pglite: PGlite;

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(`
    CREATE SCHEMA IF NOT EXISTS vault;
    CREATE TABLE regulatory_programs (
      id UUID PRIMARY KEY, organization_id INTEGER, deleted_at TIMESTAMPTZ
    );
    CREATE TABLE vault.documents (
      id UUID PRIMARY KEY, program_id UUID NOT NULL, organization_id INTEGER
    );
    CREATE TABLE vault.document_chunks (
      id UUID PRIMARY KEY, document_id UUID NOT NULL
    );
    -- The export reads the organization row first, then every tenant-keyed table.
    CREATE TABLE organizations (id INTEGER PRIMARY KEY, slug TEXT, name TEXT, status TEXT);
    INSERT INTO organizations VALUES (${ORG}, 'o', 'Org', 'active'), (${OTHER_ORG}, 'x', 'Other', 'active');
  `);
});

afterAll(async () => {
  await pglite?.close?.();
});

const DOC_ATTRIBUTED = '44444444-4444-4444-8444-000000000001';
const DOC_NULL_ORG_SOFT_DELETED_PROGRAM = '44444444-4444-4444-8444-000000000002';
const DOC_OTHER_TENANT = '44444444-4444-4444-8444-000000000003';

beforeEach(async () => {
  await pglite.exec('DELETE FROM vault.document_chunks; DELETE FROM vault.documents; DELETE FROM regulatory_programs;');
  await pglite.query(
    `INSERT INTO regulatory_programs (id, organization_id, deleted_at) VALUES
       ($1::uuid,$2,NULL), ($3::uuid,$4,now()), ($5::uuid,$6,NULL)`,
    [LIVE_PROGRAM, ORG, SOFT_DELETED_PROGRAM, ORG, OTHER_PROGRAM, OTHER_ORG],
  );
  await pglite.query(
    `INSERT INTO vault.documents (id, program_id, organization_id) VALUES
       ($1::uuid,$2::uuid,$3),
       ($4::uuid,$5::uuid,NULL),
       ($6::uuid,$7::uuid,$8)`,
    [
      DOC_ATTRIBUTED, LIVE_PROGRAM, ORG,
      // The row the old predicate spared: its programme is this tenant's but
      // soft-deleted, so organization_id was never resolvable.
      DOC_NULL_ORG_SOFT_DELETED_PROGRAM, SOFT_DELETED_PROGRAM,
      DOC_OTHER_TENANT, OTHER_PROGRAM, OTHER_ORG,
    ],
  );
  await pglite.query(
    `INSERT INTO vault.document_chunks (id, document_id) VALUES
       ('55555555-5555-4555-8555-000000000001'::uuid,$1::uuid),
       ('55555555-5555-4555-8555-000000000002'::uuid,$2::uuid),
       ('55555555-5555-4555-8555-000000000003'::uuid,$3::uuid)`,
    [DOC_ATTRIBUTED, DOC_NULL_ORG_SOFT_DELETED_PROGRAM, DOC_OTHER_TENANT],
  );
});

/** Run the module's real predicate, in the module's real table order. */
async function purgeVaultFor(organizationId: number, predicateFor: (t: string) => string) {
  const vaultTables = PURGE_CHILD_TABLES.filter((t) => t.startsWith('vault.'));
  for (const table of vaultTables) {
    await pglite.query(`DELETE FROM ${table} WHERE ${predicateFor(table)}`, [organizationId]);
  }
}

const realPredicate = (t: string) => PURGE_PARENT_SCOPED[t] ?? 'organization_id = $1';

const remaining = async (table: string): Promise<string[]> => {
  const r = await pglite.query(`SELECT id FROM ${table} ORDER BY id`);
  return (r.rows as Array<{ id: string }>).map((x) => x.id);
};

describe('vault purge scope', () => {
  it('erases every vault document the tenant owns, including one on a soft-deleted programme', async () => {
    await purgeVaultFor(ORG, realPredicate);

    // Only the other tenant's document survives.
    expect(await remaining('vault.documents')).toEqual([DOC_OTHER_TENANT]);
  });

  it('erases the chunks of those documents too', async () => {
    await purgeVaultFor(ORG, realPredicate);
    expect(await remaining('vault.document_chunks')).toEqual([
      '55555555-5555-4555-8555-000000000003',
    ]);
  });

  it("never reaches another tenant's documents", async () => {
    await purgeVaultFor(OTHER_ORG, realPredicate);
    expect(await remaining('vault.documents')).toEqual([
      DOC_ATTRIBUTED,
      DOC_NULL_ORG_SOFT_DELETED_PROGRAM,
    ]);
  });

  /**
   * The regression, stated as a test rather than a comment: the OLD predicate,
   * run against the same fixture, leaves the unattributable document behind.
   * If someone reverts the predicate, the test above fails — and this one
   * documents exactly what they reverted to.
   */
  it('the old organization_id-only predicate leaves the bytes behind (why this changed)', async () => {
    // The predicates exactly as they were: the documents table fell through to
    // the uniform default, and the chunks subselect asked the same column.
    const oldPredicate = (t: string) =>
      t === 'vault.document_chunks'
        ? 'document_id IN (SELECT id FROM vault.documents WHERE organization_id = $1)'
        : 'organization_id = $1';
    await purgeVaultFor(ORG, oldPredicate);

    const left = await remaining('vault.documents');
    expect(left).toContain(DOC_NULL_ORG_SOFT_DELETED_PROGRAM);
    // And the real predicate does not.
    expect(realPredicate('vault.documents')).not.toBe('organization_id = $1');
  });

  it('scopes chunks through the same document predicate, not a weaker one', () => {
    const docs = PURGE_PARENT_SCOPED['vault.documents'];
    const chunks = PURGE_PARENT_SCOPED['vault.document_chunks'];
    expect(docs).toBeTruthy();
    // The chunk predicate must embed the document predicate verbatim; a
    // divergent copy is how the two drift apart.
    expect(chunks).toContain(docs);
  });

  it('keeps the predicate map frozen and free of request-derived input', () => {
    expect(Object.isFrozen(PURGE_PARENT_SCOPED)).toBe(true);
    for (const predicate of Object.values(PURGE_PARENT_SCOPED)) {
      // $1 is the only bind slot; anything else means a value was interpolated.
      expect(predicate).not.toMatch(/\$[2-9]/);
    }
  });
});

/**
 * The export that authorizes a purge must contain everything the purge
 * destroys.
 *
 * The purge's vault predicate reaches documents through their programme,
 * including a programme that has been soft-deleted (whose documents carry a NULL
 * organization_id). The export read vault.documents by `organization_id` alone,
 * so it never contained them — and an erasure could destroy documents the
 * customer was never given back. Found by the 2026-09-24 re-verification; the
 * purge predicate came from this file's own fix.
 */
describe('the export contains what the purge destroys', () => {
  const exportedVaultIds = async (org: number): Promise<string[]> => {
    const out = await exportTenantFull(pglite as never, org);
    const t = out.tables.find((x) => x.table === 'vault.documents');
    return (t?.rows ?? []).map((r) => String((r as { id: string }).id)).sort();
  };
  const purgedVaultIds = async (org: number): Promise<string[]> => {
    const r = await pglite.query(
      `SELECT id FROM vault.documents WHERE ${PURGE_PARENT_SCOPED['vault.documents']} ORDER BY id`,
      [org],
    );
    return (r.rows as Array<{ id: string }>).map((x) => String(x.id)).sort();
  };

  it('exports the document on a soft-deleted programme that the purge will erase', async () => {
    expect(await exportedVaultIds(ORG)).toContain(DOC_NULL_ORG_SOFT_DELETED_PROGRAM);
  });

  it('for every tenant: the purge set is a subset of the export set — exactly equal here', async () => {
    for (const org of [ORG, OTHER_ORG]) {
      const exported = await exportedVaultIds(org);
      const purged = await purgedVaultIds(org);
      for (const id of purged) expect(exported, `org ${org} purges ${id} it never exported`).toContain(id);
      expect(exported).toEqual(purged);
    }
  });

  it("never exports another tenant's document", async () => {
    expect(await exportedVaultIds(ORG)).not.toContain(DOC_OTHER_TENANT);
    expect(await exportedVaultIds(OTHER_ORG)).toEqual([DOC_OTHER_TENANT]);
  });
});
