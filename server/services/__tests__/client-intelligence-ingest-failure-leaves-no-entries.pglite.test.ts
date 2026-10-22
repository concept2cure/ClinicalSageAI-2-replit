/**
 * A document whose ingest fails after its memory entries were inserted leaves
 * no entry behind.
 *
 * ── What the code used to do (until 2026-10-15) ─────────────────────────────
 * ingestDocument / ingestProjectDocument inserted the extracted memory entries
 * (status 'active'), then updated the document row and the profile counters as
 * separate statements. When a later step failed, the catch marked the document
 * 'failed' and reported memoryEntriesCreated: 0 — but the inserted entries
 * stayed active and reached AnA's context as facts from a document the service
 * said it had not ingested. Steps 5-7 now run in one transaction.
 *
 * The later failure is a trigger that rejects the profile-counter UPDATE.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import {
  clientIntelligenceProfiles,
  clientMemoryEntries,
  clientIngestedDocuments,
  projectIntelligenceProfiles,
  projectMemoryEntries,
  projectIngestedDocuments,
  projects,
} from '../../../shared/schema';

const holder = vi.hoisted(() => ({ pg: null as any, db: null as any }));
const dbDouble = vi.hoisted(() => ({
  get db() { return holder.db; },
  pool: { query: async (text: string, params?: unknown[]) => holder.pg.query(text, params) },
  getDb: () => holder.db,
  getPool: () => ({ query: async (text: string, params?: unknown[]) => holder.pg.query(text, params) }),
}));
vi.mock('../../db', () => dbDouble);
vi.mock('../../db.js', () => dbDouble);
// Embedding is not under test: the service records entries without one.
vi.mock('../enhancedEmbeddingService.js', () => ({
  getEmbeddingService: () => ({ embedBatch: async () => [] }),
}));
vi.mock('../ragRouter.js', () => ({ ragRetrieve: vi.fn() }));
// The shape native ESM gives exceljs in production: Workbook only on .default.
vi.mock('exceljs', async (importOriginal) => {
  const actual = (await importOriginal()) as { default?: unknown };
  return { default: actual.default ?? actual };
});

import { ingestDocument, ingestProjectDocument } from '../client-intelligence-memory';

const ORG = 7;
const USER = 41;
const PROJECT = 83;
const PDF_NAME = 'Bioanalytical_Methods_Template_v1.pdf';
const PDF = readFileSync(path.resolve(__dirname, '../../../templates/authoring', PDF_NAME));

let clientProfileId = 0;
let projectProfileId = 0;

/** CREATE TABLE from the drizzle definition: columns, types, literal defaults. */
function ddlOf(table: PgTable): string {
  const c = getTableConfig(table);
  const cols = c.columns.map((col) => {
    // No pgvector in this PGlite; embeddings are not under test.
    const type = col.getSQLType().startsWith('vector') ? 'text' : col.getSQLType();
    const d = col.default;
    const literal = typeof d === 'number' || typeof d === 'boolean' ? ` DEFAULT ${d}`
      : typeof d === 'string' ? ` DEFAULT '${d.replace(/'/g, "''")}'` : '';
    return `"${col.name}" ${type}${col.primary ? ' PRIMARY KEY' : ''}${literal}`;
  });
  return `CREATE TABLE IF NOT EXISTS "${c.name}" (${cols.join(', ')});`;
}

const file = (buffer: Buffer, originalname: string, mimetype: string) =>
  ({ buffer, originalname, mimetype, size: buffer.length });
const one = async (sql: string, params: unknown[] = []) => (await holder.pg.query(sql, params)).rows[0] as any;
const all = async (sql: string, params: unknown[] = []) => (await holder.pg.query(sql, params)).rows as any[];

beforeAll(async () => {
  process.env.MEMORY_LLM_EXTRACTION_ENABLED = 'false';
  holder.pg = new PGlite();
  holder.db = drizzle(holder.pg);
  for (const t of [clientIntelligenceProfiles, clientMemoryEntries, clientIngestedDocuments,
    projectIntelligenceProfiles, projectMemoryEntries, projectIngestedDocuments, projects]) {
    await holder.pg.exec(ddlOf(t as PgTable));
  }
  clientProfileId = (await one(
    `INSERT INTO client_intelligence_profiles (organization_id, company_name, profile_status)
     VALUES ($1, 'Acme Bio', 'active') RETURNING id`, [ORG])).id;
  await holder.pg.query(
    `INSERT INTO projects (id, organization_id, client_workspace_id, name, type) VALUES ($1, $2, 1, 'Study 001', 'clinical')`,
    [PROJECT, ORG]);
  projectProfileId = (await one(
    `INSERT INTO project_intelligence_profiles (project_id, organization_id) VALUES ($1, $2) RETURNING id`,
    [PROJECT, ORG])).id;
  await holder.pg.exec(`
    CREATE FUNCTION refuse_counter_update() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'profile counter update failed'; END $$;
    CREATE TRIGGER refuse_client_counter BEFORE UPDATE ON client_intelligence_profiles
      FOR EACH ROW EXECUTE FUNCTION refuse_counter_update();
    CREATE TRIGGER refuse_project_counter BEFORE UPDATE ON project_intelligence_profiles
      FOR EACH ROW EXECUTE FUNCTION refuse_counter_update();`);
}, 60_000);

afterAll(async () => {
  delete process.env.MEMORY_LLM_EXTRACTION_ENABLED;
  await holder.pg?.close();
});

describe('a failure after the entries were inserted leaves no entry behind', () => {
  it('client ingest: failed, 0 entries reported, 0 entries stored', async () => {
    const result = await ingestDocument(clientProfileId, ORG, file(PDF, PDF_NAME, 'application/pdf'), USER);
    const doc = await one('SELECT * FROM client_ingested_documents WHERE id = $1', [result.documentId]);
    const entries = await all('SELECT id, status FROM client_memory_entries WHERE source_document_name = $1', [PDF_NAME]);

    expect(result).toMatchObject({ status: 'failed', memoryEntriesCreated: 0 });
    expect(doc.processing_status).toBe('failed');
    expect(entries, 'entries from a failed ingest are still stored (and active)').toEqual([]);
  });

  it('project ingest: failed, 0 entries reported, 0 entries stored', async () => {
    const result = await ingestProjectDocument(projectProfileId, PROJECT, ORG, file(PDF, PDF_NAME, 'application/pdf'), USER);
    const doc = await one('SELECT * FROM project_ingested_documents WHERE id = $1', [result.documentId]);
    const entries = await all('SELECT id, status FROM project_memory_entries WHERE source_document_name = $1', [PDF_NAME]);

    expect(result).toMatchObject({ status: 'failed', memoryEntriesCreated: 0 });
    expect(doc.processing_status).toBe('failed');
    expect(entries, 'entries from a failed ingest are still stored (and active)').toEqual([]);
  });
});
