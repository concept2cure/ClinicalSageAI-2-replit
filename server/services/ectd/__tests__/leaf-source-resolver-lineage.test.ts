/**
 * A coauthor leaf states where it came from BY IDENTITY (ledger L10, the alias
 * map's first product reader). Three states, each stated as itself:
 *   - the database has no alias table      → available: false
 *   - the row was never aliased             → canonicalId: null, source: null
 *   - the row is a snapshot of an authoring document → canonicalId + source
 * The order of the cases is the order of the states on a real database.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { promises as fs, readFileSync } from 'fs';
import path from 'path';
import os from 'os';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../../db', () => ({ get db() { return holder.db; } }));

import { materializeLeafSources, leafSourceKey } from '../leaf-source-resolver';

const MIGRATION = path.join(__dirname, '..', '..', '..', '..', 'migrations/20260814d_document_alias_map.sql');
const ORG = 1;
const AUTHORING_UUID = '4d1e6f2a-9b3c-4d5e-8f70-1a2b3c4d5e6f';
let harness: IndPgliteDb;
const tmpDirs: string[] = [];

async function materialize(id: number) {
  const stageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'leaf-lineage-'));
  tmpDirs.push(stageDir);
  const r = await materializeLeafSources({
    leaves: [{ documentTable: 'coauthor_documents', documentId: id }],
    organizationId: ORG,
    stageDir,
  });
  return r.byKey.get(leafSourceKey('coauthor_documents', id));
}

beforeAll(async () => {
  harness = await createIndPgliteDb({ submissionCore: true, leafSources: true });
  holder.db = harness.db;
  await harness.pglite.exec(`
    INSERT INTO coauthor_documents (id, organization_id, title, content, module_number)
    VALUES (1, ${ORG}, 'Snapshot of an authoring document', '<p>Body</p>', '2.5'),
           (2, ${ORG}, 'Never aliased', '<p>Body</p>', '2.6');
  `);
}, 120_000);
afterAll(async () => {
  await harness?.close?.();
  await Promise.all(tmpDirs.map((d) => fs.rm(d, { recursive: true, force: true })));
});

describe('coauthor leaf lineage by identity', () => {
  it('reports the alias table as absent, not the leaf as sourceless', async () => {
    const staged = await materialize(1);
    expect(staged?.lineage).toEqual({ available: false, reason: 'relation_absent' });
  });

  it('reports a row that was never aliased as canonicalId null', async () => {
    await harness.pglite.exec(readFileSync(MIGRATION, 'utf8'));
    const staged = await materialize(2);
    expect(staged?.lineage).toEqual({
      available: true, store: 'coauthor_documents', nativeId: '2', canonicalId: null, source: null,
    });
  });

  it('names the authoring document a snapshot represents', async () => {
    await harness.pglite.exec(`
      INSERT INTO c2c_document_aliases (canonical_id, store, native_id, organization_id) VALUES
        ('${AUTHORING_UUID}', 'authoring_documents', '${AUTHORING_UUID}', ${ORG}),
        ('${AUTHORING_UUID}', 'coauthor_documents', '1', ${ORG});
    `);
    const staged = await materialize(1);
    expect(staged?.lineage).toEqual({
      available: true,
      store: 'coauthor_documents',
      nativeId: '1',
      canonicalId: AUTHORING_UUID,
      source: { store: 'authoring_documents', nativeId: AUTHORING_UUID },
    });
  });

  it('never crosses the tenant: another organization sees no alias for the same row', async () => {
    const stageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'leaf-lineage-'));
    tmpDirs.push(stageDir);
    await harness.pglite.exec(`
      INSERT INTO coauthor_documents (id, organization_id, title, content, module_number)
      VALUES (3, 2, 'Other tenant', '<p>Body</p>', '2.7');
      INSERT INTO c2c_document_aliases (canonical_id, store, native_id, organization_id)
      VALUES ('${AUTHORING_UUID}', 'unified_documents', '3', ${ORG});
    `);
    const r = await materializeLeafSources({
      leaves: [{ documentTable: 'coauthor_documents', documentId: 3 }],
      organizationId: 2,
      stageDir,
    });
    expect(r.byKey.get(leafSourceKey('coauthor_documents', 3))?.lineage).toEqual({
      available: true, store: 'coauthor_documents', nativeId: '3', canonicalId: null, source: null,
    });
  });
});
