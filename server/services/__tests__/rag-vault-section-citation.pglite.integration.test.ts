/**
 * A retrieved Vault passage carries the section it was cut from — written by
 * the real chunk writer, read back by the real canonical lexical SQL — and its
 * locator keeps the page beside the section.
 *
 * The RAG reader has always selected section_title and mapped it to
 * sectionTitle and the locator; the writer never filled it, so it was NULL on
 * every passage. Filling it would, on its own, have cost the citation its
 * page: the locator returned the section INSTEAD of "p.N", and a page is the
 * one thing a reviewer can turn to. Both now travel: "p.2 · 11.4.1 …".
 *
 * PGlite stands in for both connections (the disposition harness, with the
 * chunk columns the writer stores added in migrations/20260905b's types). It
 * does not model native RLS or embeddings; the arm under test is keyless.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';

const h = vi.hoisted(() => ({ pg: null as PGlite | null }));

async function query(sql: string, params: unknown[] = []) {
  if (!h.pg) throw new Error('Section citation test database is not ready');
  const result = await h.pg.query(sql, params);
  // PGlite SELECT has affectedRows=0; pg reports the returned row count.
  return { rows: result.rows, rowCount: result.rows.length || result.affectedRows || 0 };
}

// The chunk writer's pool; `embed: false` below means it never reaches a provider.
vi.mock('../../db.js', () => ({
  pool: {
    query: (sql: string, params?: unknown[]) => query(sql, params),
    connect: async () => ({ query, release: () => undefined }),
  },
}));

import { AdvancedRAGPipeline, type RetrievedDocument } from '../advancedRAGPipeline.js';
import {
  createDispositionHarness, type DispositionFixture, type DispositionHarness,
} from '../document-data-disposition/__tests__/disposition-fixture.js';
import { chunkAndEmbedDocument } from '../vault/document-chunking.service.js';

type Internal = {
  vaultLexicalArm(client: DispositionFixture['db'], args: {
    query: string; limit: number; organizationUuid: string; keyless: boolean;
  }): Promise<RetrievedDocument[]>;
};

const SECTION = '11.4.1 Primary Efficacy Endpoint';
const STATISTIC = 'The pooled responder rate at Week 24 was 102 of 212 subjects (48.2%) in the active arm.';
const narrative = Array.from({ length: 50 }, (_, i) =>
  `Subject ${i + 1} completed the Week 24 visit inside the window and contributed to the analysis.`);
const REPORT = [
  'CLINICAL STUDY REPORT EXM-301',
  'Sponsor: Example Pharma Ltd',
  SECTION,
  ...narrative,
  STATISTIC,
].join('\n');

let harness: DispositionHarness;
beforeAll(async () => {
  harness = await createDispositionHarness();
  h.pg = harness.pg;
  await harness.pg.exec(`
    ALTER TABLE organizations ADD COLUMN uuid uuid NOT NULL DEFAULT gen_random_uuid();
    ALTER TABLE vault.documents ADD COLUMN file_name text;
    ALTER TABLE vault.document_chunks ADD COLUMN chunk_index integer;
    ALTER TABLE vault.document_chunks ADD COLUMN chunk_type text NOT NULL DEFAULT 'TEXT';
    ALTER TABLE vault.document_chunks ADD COLUMN char_start integer;
    ALTER TABLE vault.document_chunks ADD COLUMN char_end integer;
    ALTER TABLE vault.document_chunks ADD COLUMN page_number integer;
    ALTER TABLE vault.document_chunks ADD COLUMN section_title text;
    ALTER TABLE vault.document_chunks ADD COLUMN section_hierarchy text[];
    ALTER TABLE vault.document_chunks ADD COLUMN embedding_model text;
    ALTER TABLE vault.document_chunks ADD COLUMN token_count integer;
    ALTER TABLE vault.document_chunks ADD COLUMN vectorized_at timestamptz;
  `);
});
afterAll(async () => { await harness.close(); });

async function indexedReport() {
  const f = await harness.seed();
  const uuid = randomUUID();
  await f.pg.query('UPDATE organizations SET uuid=$2 WHERE id=$1', [f.org, uuid]);
  // tenant-isolation-safe: isolated fixture document selected by exact organization and ID.
  await f.pg.query('UPDATE vault.documents SET extracted_text=$2 WHERE id=$1 AND organization_id=$3', [f.vault, REPORT, f.org]);
  const result = await chunkAndEmbedDocument({
    documentId: f.vault, organizationId: f.org, text: REPORT, embed: false,
    pageSpans: [{ page: 1, start: 0, end: 2000 }, { page: 2, start: 2001, end: REPORT.length }],
  });
  expect(result).toMatchObject({ ok: true, embedded: false });
  expect(result.chunkCount).toBeGreaterThan(1);
  const pipeline = Object.create(AdvancedRAGPipeline.prototype) as Internal;
  Object.assign(pipeline, { pool: f.db });
  const search = (q: string) => pipeline.vaultLexicalArm(f.db, { query: q, limit: 10, organizationUuid: uuid, keyless: true });
  return { search };
}

describe('a Vault passage is cited by its section and its page', () => {
  it('the passage quoting the statistic carries its section title, and the locator keeps the page', async () => {
    const { search } = await indexedReport();
    const hits = await search('pooled responder rate');
    const quoting = hits.find(d => d.content.includes('102 of 212 subjects (48.2%)'));
    expect(quoting).toBeDefined();
    expect(quoting).toMatchObject({ sectionTitle: SECTION, pageNumber: 2, locator: `p.2 · ${SECTION}` });
  });

  it('a passage before the first heading has no section, and its locator is the page alone', async () => {
    const { search } = await indexedReport();
    const cover = (await search('Example Pharma')).find(d => d.content.startsWith('CLINICAL STUDY REPORT'));
    expect(cover).toBeDefined();
    expect(cover).toMatchObject({ sectionTitle: null, pageNumber: 1, locator: 'p.1' });
  });
});
