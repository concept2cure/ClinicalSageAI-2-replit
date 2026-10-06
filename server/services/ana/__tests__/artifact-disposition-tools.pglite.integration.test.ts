import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createDispositionHarness, insertCapturedSuccessor, type DispositionHarness, type DispositionFixture,
} from '../../document-data-disposition/__tests__/disposition-fixture.js';

const database = vi.hoisted(() => {
  const state: { query?: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> } = {};
  const pool = {
    query: vi.fn(async (sql: string, params?: unknown[]) => state.query ? state.query(sql, params) : { rows: [] }),
    connect: vi.fn(),
  };
  return { state, pool };
});
vi.mock('../../../db', () => ({ getPool: () => database.pool, pool: database.pool, db: {} }));
import { getToolHandler } from '../AnaToolExecutor.js';

let harness: DispositionHarness;
beforeAll(async () => {
  harness = await createDispositionHarness();
  await harness.pg.exec(`
    ALTER TABLE concept2cure_artifacts ADD COLUMN title text DEFAULT 'Study artifact';
    ALTER TABLE concept2cure_artifacts ADD COLUMN type text DEFAULT 'report';
    ALTER TABLE concept2cure_artifacts ADD COLUMN category text DEFAULT 'study';
    ALTER TABLE concept2cure_artifacts ADD COLUMN ctd_section text DEFAULT '5.3';
    ALTER TABLE concept2cure_artifacts ADD COLUMN version integer DEFAULT 1;
    ALTER TABLE concept2cure_artifacts ADD COLUMN created_at timestamptz DEFAULT now();
    ALTER TABLE concept2cure_artifacts ADD COLUMN updated_at timestamptz DEFAULT now();
    ALTER TABLE concept2cure_artifacts ADD COLUMN locked_at timestamptz;
    ALTER TABLE c2c_documents ADD COLUMN title text;
    ALTER TABLE c2c_documents ADD COLUMN doc_type text;
    ALTER TABLE c2c_documents ADD COLUMN agency text;
    ALTER TABLE c2c_documents ADD COLUMN readiness text;
    ALTER TABLE c2c_documents ADD COLUMN updated_at timestamptz;
    CREATE TABLE tmf_artifacts (id text PRIMARY KEY, organization_id integer, tmf_file_id text,
      zone text, artifact_name text, status text, deleted_at timestamptz);
  `);
  database.state.query = harness.db.query;
});
afterAll(async () => { database.state.query = undefined; await harness.close(); });
const run = async (f: DispositionFixture, name: string, input: Record<string, unknown>) =>
  JSON.parse(await getToolHandler(name)!(input, { organizationId: f.org, userId: 42 } as never));

describe('legacy Anna artifact tools apply the canonical disposition gate before returning text', () => {
  it('reads and lists stored kept text with original-unavailable markers, then excludes a later withdrawal', async () => {
    const f = await harness.seed();
    const original = await run(f, 'read_vault_document', { artifact_id: f.artifactNativeId });
    expect(original.content).toBe('Extracted authored rendition');
    expect(original.document.original_file_available).toBe(true);
    await f.apply('keep_data');
    const retained = await run(f, 'read_vault_document', { artifact_id: String(f.artifact) });
    expect(retained.content).toBe(original.content);
    expect(retained.document.original_file_available).toBe(false);
    expect(retained.document.source_availability).toContain('Original file unavailable; extracted data retained');
    const listing = await run(f, 'list_vault_documents', {});
    expect(listing.documents).toHaveLength(1);
    expect(listing.documents[0].original_file_available).toBe(false);
    const search = await run(f, 'search_all_documents', { query: 'Study' });
    expect(search.hits).toHaveLength(1);
    expect(search.hits[0].original_file_available).toBe(false);

    await f.apply('remove_data');
    const denied = await run(f, 'read_vault_document', { artifact_id: f.artifactNativeId });
    expect(denied.error).toContain('currently eligible');
    expect(denied.content).toBeUndefined();
    expect((await run(f, 'list_vault_documents', {})).documents).toEqual([]);
    expect((await run(f, 'search_all_documents', { query: 'Study' })).hits).toEqual([]);
    expect((await f.pg.query<{ content: string }>('SELECT content FROM concept2cure_artifacts WHERE id=$1', [f.artifact])).rows[0].content)
      .toBe(original.content);
  });

  it('excludes a superseded representation and refuses foreign artifact ids', async () => {
    const f = await harness.seed();
    const foreign = await harness.seed();
    const foreignRead = await run(f, 'read_vault_document', { artifact_id: foreign.artifactNativeId });
    expect(foreignRead.content).toBeUndefined();
    expect(foreignRead.error).toBeTruthy();
    await f.apply('supersede', { replacementId: await insertCapturedSuccessor(f) });
    const denied = await run(f, 'read_vault_document', { artifact_id: f.artifactNativeId });
    expect(denied.content).toBeUndefined();
    expect(denied.error).toContain('currently eligible');
    expect((await run(f, 'search_all_documents', { query: 'Study' })).hits).toEqual([]);
  });

  it('reports a failed policy store explicitly and never returns the previously readable artifact text', async () => {
    const f = await harness.seed();
    const actual = harness.db.query;
    database.state.query = async (sql, params) => {
      if (sql.includes('document_data_dispositions')) throw new Error('Disposition policy store unavailable');
      return actual(sql, params);
    };
    try {
      const denied = await run(f, 'read_vault_document', { artifact_id: f.artifactNativeId });
      expect(denied.error).toContain('Disposition policy store unavailable');
      expect(denied.content).toBeUndefined();
      const search = await run(f, 'search_all_documents', { query: 'Study' });
      expect(search.ok).toBe(false);
      expect(search.unavailable_stores).toContain('vault');
      expect(search.error).toContain('not evidence that no records exist');
      expect(search.hits).toEqual([]);
    } finally { database.state.query = actual; }
  });
});
