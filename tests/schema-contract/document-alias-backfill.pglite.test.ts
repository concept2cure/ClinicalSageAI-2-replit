/**
 * The alias backfill (ledger L10): idempotent, org-scoped, and it never invents
 * an identity. Run on PGlite with the real migration and the two stores'
 * identity columns.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import { join } from 'path';
import { backfillDocumentAliases } from '../../server/services/c2c/document-alias-backfill';

const MIGRATION = join(__dirname, '..', '..', 'migrations/20260814d_document_alias_map.sql');
const A1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const A2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const OTHER_ORG_DOC = 'bbbbbbbb-0000-4000-8000-000000000009';
const GHOST = 'cccccccc-0000-4000-8000-000000000042';

let db: PGlite;
const count = async () => Number(((await db.query(`SELECT count(*)::int AS n FROM c2c_document_aliases`)).rows[0] as { n: number }).n);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE authoring_documents (id UUID PRIMARY KEY, tenant_id INTEGER NOT NULL, c2c_document_id TEXT);
    CREATE TABLE coauthor_documents (id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL, metadata JSON);
    INSERT INTO authoring_documents VALUES ('${A1}', 1, 'c2c-77'), ('${A2}', 1, NULL), ('${OTHER_ORG_DOC}', 2, NULL);
    INSERT INTO coauthor_documents (organization_id, metadata) VALUES
      (1, '{"source":"authoring-document","docId":"${A1}","status":"APPROVED"}'),   -- 1: snapshot of A1
      (1, NULL),                                                                      -- 2: no recorded source
      (1, '{"source":"authoring-document","docId":"${GHOST}"}'),                       -- 3: names a document this org lacks
      (1, '{"source":"authoring-document","docId":"${OTHER_ORG_DOC}"}'),               -- 4: names another org's document
      (2, '{"source":"authoring-document","docId":"${OTHER_ORG_DOC}"}');               -- 5: the other org's own snapshot
  `);
}, 60_000);
afterAll(async () => { await db?.close(); });

describe('backfillDocumentAliases', () => {
  it('refuses to run without a tenant', async () => {
    await expect(backfillDocumentAliases(db, { organizationId: 0, apply: true })).rejects.toThrow(/one tenant per run/);
  });

  it('reports the alias table as absent and examines nothing', async () => {
    const r = await backfillDocumentAliases(db, { organizationId: 1, apply: true });
    expect(r.relationAbsent).toBe(true);
    expect(r.authoring.examined).toBe(0);
  });

  it('dry run does the analysis and writes nothing', async () => {
    await db.exec(readFileSync(MIGRATION, 'utf8'));
    const r = await backfillDocumentAliases(db, { organizationId: 1, apply: false });
    expect(r.authoring).toEqual({ examined: 2, toRecord: 2, alreadyRecorded: 0, boundToRecord: 1, boundAlreadyRecorded: 0 });
    expect(r.coauthor.examined).toBe(4);
    expect(r.coauthor.toRecord).toBe(1);
    expect(r.coauthor.sourceless).toBe(1);
    expect(r.coauthor.sourceMissing).toEqual([
      { coauthorId: 3, namedSource: GHOST },
      { coauthorId: 4, namedSource: OTHER_ORG_DOC },
    ]);
    expect(await count()).toBe(0);
  });

  it('apply records exactly the rows the dry run named, for this tenant only', async () => {
    const r = await backfillDocumentAliases(db, { organizationId: 1, apply: true });
    expect(r.authoring.toRecord).toBe(2);
    expect(r.authoring.boundToRecord).toBe(1);
    expect(r.coauthor.toRecord).toBe(1);
    expect(r.forks).toEqual([]);
    const rows = (await db.query(`SELECT store, native_id, canonical_id, organization_id FROM c2c_document_aliases ORDER BY store, native_id`)).rows;
    expect(rows).toEqual([
      { store: 'authoring_documents', native_id: A1, canonical_id: A1, organization_id: 1 },
      { store: 'authoring_documents', native_id: A2, canonical_id: A2, organization_id: 1 },
      { store: 'c2c_documents', native_id: 'c2c-77', canonical_id: A1, organization_id: 1 },
      { store: 'coauthor_documents', native_id: '1', canonical_id: A1, organization_id: 1 },
    ]);
  });

  it('a second run records nothing new', async () => {
    const before = await count();
    const r = await backfillDocumentAliases(db, { organizationId: 1, apply: true });
    expect(r.authoring).toEqual({ examined: 2, toRecord: 0, alreadyRecorded: 2, boundToRecord: 0, boundAlreadyRecorded: 1 });
    expect(r.coauthor.toRecord).toBe(0);
    expect(r.coauthor.alreadyRecorded).toBe(1);
    expect(await count()).toBe(before);
  });

  it('reports a fork instead of forcing it', async () => {
    // Someone recorded coauthor 2 under A2 by hand; the backfill's own analysis
    // (row 2 has no source) never touches it — but a coauthor row whose
    // metadata now names A1 while the map says A2 is a fork, and is reported.
    await db.exec(`
      INSERT INTO c2c_document_aliases (canonical_id, store, native_id, organization_id) VALUES ('${A2}', 'coauthor_documents', '2', 1);
      UPDATE coauthor_documents SET metadata = '{"source":"authoring-document","docId":"${A1}"}' WHERE id = 2;
    `);
    const before = await count();
    const r = await backfillDocumentAliases(db, { organizationId: 1, apply: true });
    expect(r.forks).toEqual([
      expect.objectContaining({ store: 'coauthor_documents', nativeId: '2', canonicalId: A1 }),
    ]);
    expect(await count()).toBe(before);
  });

  it('the other tenant sees only its own documents', async () => {
    const r = await backfillDocumentAliases(db, { organizationId: 2, apply: true });
    expect(r.authoring.examined).toBe(1);
    expect(r.coauthor.examined).toBe(1);
    expect(r.coauthor.toRecord).toBe(1);
    const rows = (await db.query(`SELECT native_id FROM c2c_document_aliases WHERE organization_id = 2 ORDER BY store`)).rows;
    expect(rows).toEqual([{ native_id: OTHER_ORG_DOC }, { native_id: '5' }]);
  });
});
