/**
 * c2c_document_aliases — the alias map's contract, on a real Postgres engine.
 *
 * Document Identity Contract 2026-08 §5 asks for exactly this: alias
 * uniqueness, the attribute-free invariant, and backfill idempotence — plus
 * the writer's fail-closed rules, which are the part a migration cannot state.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  DOCUMENT_ALIAS_STORES,
  DocumentAliasConflictError,
  aliasesFor,
  canonicalIdFor,
  recordDocumentAlias,
} from '../../server/services/c2c/document-alias-map';

const MIGRATION = join(__dirname, '..', '..', 'migrations/20260814d_document_alias_map.sql');
const A = '0b6f2a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
const B = '1c7f3b5f-2d3e-4f60-9b0c-1d2e3f4a5b6c';

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(MIGRATION, 'utf8'));
}, 60_000);
afterAll(async () => {
  await db?.close();
});

describe('the migration', () => {
  it('applies twice without error', async () => {
    await expect(db.exec(readFileSync(MIGRATION, 'utf8'))).resolves.toBeDefined();
  });

  it('creates a table with identity, tenancy and a creation time — and nothing else', async () => {
    const r = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'c2c_document_aliases' ORDER BY column_name`,
    );
    expect(r.rows.map((x) => x.column_name)).toEqual(
      ['canonical_id', 'created_at', 'native_id', 'organization_id', 'store'],
    );
  });

  it('refuses a store outside the vocabulary, which the service mirrors exactly', async () => {
    await expect(
      db.query(
        `INSERT INTO c2c_document_aliases (canonical_id, store, native_id, organization_id)
         VALUES ($1, 'coauthor', 'x', 1)`,
        [A],
      ),
    ).rejects.toThrow(/c2c_document_aliases_store_check/);
    const r = await db.query<{ src: string }>(
      `SELECT pg_get_constraintdef(oid) AS src FROM pg_constraint
        WHERE conname = 'c2c_document_aliases_store_check'`,
    );
    for (const store of DOCUMENT_ALIAS_STORES) expect(r.rows[0].src).toContain(`'${store}'`);
  });
});

describe('recordDocumentAlias', () => {
  it('records a representation and is idempotent for the identical row', async () => {
    const ref = { organizationId: 1, canonicalId: A, store: 'authoring_documents' as const, nativeId: A };
    expect(await recordDocumentAlias(db, ref)).toEqual({ recorded: true });
    expect(await recordDocumentAlias(db, ref)).toEqual({ recorded: false, reason: 'already_recorded' });
    const r = await db.query(`SELECT count(*)::int AS n FROM c2c_document_aliases WHERE native_id = $1`, [A]);
    expect((r.rows[0] as { n: number }).n).toBe(1);
  });

  it('refuses to fork: the same native id under another canonical id', async () => {
    await expect(
      recordDocumentAlias(db, { organizationId: 1, canonicalId: B, store: 'authoring_documents', nativeId: A }),
    ).rejects.toBeInstanceOf(DocumentAliasConflictError);
  });

  it('refuses to fork: the same canonical id twice in one store', async () => {
    expect(
      await recordDocumentAlias(db, { organizationId: 1, canonicalId: A, store: 'coauthor_documents', nativeId: '17' }),
    ).toEqual({ recorded: true });
    await expect(
      recordDocumentAlias(db, { organizationId: 1, canonicalId: A, store: 'coauthor_documents', nativeId: '18' }),
    ).rejects.toBeInstanceOf(DocumentAliasConflictError);
  });

  it('refuses another tenant\'s native id without saying whose it is', async () => {
    await expect(
      recordDocumentAlias(db, { organizationId: 2, canonicalId: A, store: 'coauthor_documents', nativeId: '17' }),
    ).rejects.toThrow(/already recorded as a different document/);
  });

  it('refuses malformed identity before touching the database', async () => {
    await expect(
      recordDocumentAlias(db, { organizationId: 0, canonicalId: A, store: 'coauthor_documents', nativeId: '1' }),
    ).rejects.toThrow(/organization/);
    await expect(
      recordDocumentAlias(db, { organizationId: 1, canonicalId: 'not-a-uuid', store: 'coauthor_documents', nativeId: '1' }),
    ).rejects.toThrow(/canonical uuid/);
    await expect(
      recordDocumentAlias(db, { organizationId: 1, canonicalId: A, store: 'coauthor' as never, nativeId: '1' }),
    ).rejects.toThrow(/Unknown document store/);
  });
});

describe('reads carry the tenant', () => {
  it('lists every representation for the owning tenant and none for another', async () => {
    expect(await aliasesFor(db, { organizationId: 1, canonicalId: A })).toEqual({
      available: true,
      aliases: [
        { store: 'authoring_documents', nativeId: A },
        { store: 'coauthor_documents', nativeId: '17' },
      ],
    });
    expect(await aliasesFor(db, { organizationId: 2, canonicalId: A })).toEqual({ available: true, aliases: [] });
  });

  it('resolves a native id to its canonical id only for the owning tenant', async () => {
    expect(await canonicalIdFor(db, { organizationId: 1, store: 'coauthor_documents', nativeId: '17' })).toEqual({
      available: true,
      canonicalId: A,
    });
    expect(await canonicalIdFor(db, { organizationId: 2, store: 'coauthor_documents', nativeId: '17' })).toEqual({
      available: true,
      canonicalId: null,
    });
  });
});

describe('a database without the migration', () => {
  it('is reported as relation_absent, never as "nothing aliased"', async () => {
    const bare = new PGlite();
    try {
      expect(
        await recordDocumentAlias(bare, { organizationId: 1, canonicalId: A, store: 'coauthor_documents', nativeId: '1' }),
      ).toEqual({ recorded: false, reason: 'relation_absent' });
      expect(await aliasesFor(bare, { organizationId: 1, canonicalId: A })).toEqual({
        available: false,
        reason: 'relation_absent',
      });
      expect(await canonicalIdFor(bare, { organizationId: 1, store: 'coauthor_documents', nativeId: '1' })).toEqual({
        available: false,
        reason: 'relation_absent',
      });
    } finally {
      await bare.close();
    }
  });
});
