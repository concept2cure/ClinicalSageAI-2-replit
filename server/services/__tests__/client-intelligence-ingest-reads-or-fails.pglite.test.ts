/**
 * Document ingestion into client/project intelligence memory reads the file
 * with the canonical extractor, or fails and says so.
 *
 * ── What the code used to do (until 2026-10-15) ─────────────────────────────
 * ingestDocument / ingestProjectDocument read files through a duplicate
 * extractor (memory/document-text-extraction.ts). Under the ESM build that
 * production runs it could not load pdf-parse v2 (no default export) or exceljs
 * (Workbook only on .default), and every failure returned a bracketed
 * placeholder AS the text — "[PDF file: X — text extraction unavailable]". The
 * service stored that as extracted_text with processing_status 'completed',
 * made an "Ingested: X … Opening content: [PDF file …" memory atom at
 * confidence 1.0 from it, and counted the document as ingested. A file with no
 * extractor at all (.pptx) got "[File: X (type) — unsupported format …]" the
 * same way. No byte of those files was read.
 *
 * Tables from their drizzle definitions (with their literal column defaults, so
 * the 0.8 confidence default is live), on PGlite.
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
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const PPTX = Buffer.from('PK\u0003\u0004 a slide deck no extractor reads');
const PLACEHOLDER = /^\[(PDF|DOCX|Excel)? ?[Ff]ile/;

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
  process.env.MEMORY_LLM_EXTRACTION_ENABLED = 'false'; // the deterministic heuristic path
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
}, 60_000);

afterAll(async () => {
  delete process.env.MEMORY_LLM_EXTRACTION_ENABLED;
  await holder.pg?.close();
});

describe('client document ingestion', () => {
  it('reads a valid PDF through the canonical extractor instead of storing a placeholder', async () => {
    const result = await ingestDocument(clientProfileId, ORG, file(PDF, PDF_NAME, 'application/pdf'), USER);
    const row = await one('SELECT * FROM client_ingested_documents WHERE id = $1', [result.documentId]);

    expect(row.extracted_text, 'the stored "text" is a placeholder, not the PDF').toContain('Technical Specifications Document');
    expect(row.extracted_text).not.toMatch(PLACEHOLDER);
    expect(row).toMatchObject({ processing_status: 'completed', page_count: 9 });

    const ingested = await one(
      `SELECT content FROM client_memory_entries WHERE profile_id = $1 AND title = $2`, [clientProfileId, `Ingested: ${PDF_NAME}`]);
    expect(ingested.content).toContain('Opening content: Bioanalytical Methods Templates Guidance for Industry');
  });

  it('reads an XLSX under the module shape production loads exceljs with', async () => {
    const ExcelJS = ((await import('exceljs')) as unknown as { default: typeof import('exceljs') }).default;
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Pipeline').addRow(['Asset', 'Phase']);
    wb.getWorksheet('Pipeline')!.addRow(['ABC-1234', 'Phase II']);
    const bytes = Buffer.from(await wb.xlsx.writeBuffer());

    const result = await ingestDocument(clientProfileId, ORG,
      file(bytes, 'pipeline.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), USER);
    const row = await one('SELECT * FROM client_ingested_documents WHERE id = $1', [result.documentId]);

    expect(row.extracted_text, 'the stored "text" is a placeholder, not the workbook').toContain('ABC-1234');
    expect(row.processing_status).toBe('completed');
  });

  it('fails a file nothing can be read from: no placeholder, no memory atoms, no counter increment', async () => {
    const before = await one('SELECT total_documents_ingested FROM client_intelligence_profiles WHERE id = $1', [clientProfileId]);
    const result = await ingestDocument(clientProfileId, ORG, file(PPTX, 'pitch-deck.pptx', PPTX_MIME), USER);
    const row = await one('SELECT * FROM client_ingested_documents WHERE id = $1', [result.documentId]);
    const atoms = await all(`SELECT id FROM client_memory_entries WHERE source_document_name = 'pitch-deck.pptx'`);
    const after = await one('SELECT total_documents_ingested FROM client_intelligence_profiles WHERE id = $1', [clientProfileId]);

    expect(result.status, 'an unread file was reported as ingested').toBe('failed');
    expect(result.error).toMatch(/^Could not read any text from pitch-deck\.pptx/);
    expect(result).toMatchObject({ unreadable: true, memoryEntriesCreated: 0, extractedText: '' });
    expect(row).toMatchObject({ processing_status: 'failed', extracted_text: null, processing_error: result.error });
    expect(atoms, 'memory atoms were made from text nobody read').toHaveLength(0);
    expect(after.total_documents_ingested).toBe(before.total_documents_ingested);
  });

  it('stores no confidence nobody measured (null, not a rule constant or the 0.8 column default)', async () => {
    const scores = await all(
      'SELECT DISTINCT confidence_score FROM client_memory_entries WHERE profile_id = $1', [clientProfileId]);
    expect(scores.length).toBeGreaterThan(0);
    expect(scores.map(s => s.confidence_score)).toEqual([null]);
  });

  // 2026-10-15: every row was stamped extracted_by 'ai', though with the model
  // off the entries come from the rule-based extractor.
  it('names the extractor that produced the entries (the model is off here)', async () => {
    const by = await all(
      'SELECT DISTINCT extracted_by FROM client_memory_entries WHERE profile_id = $1', [clientProfileId]);
    expect(by.map(r => r.extracted_by)).toEqual(['heuristic']);
  });
});

describe('project document ingestion', () => {
  it('reads a valid PDF and counts it', async () => {
    const result = await ingestProjectDocument(projectProfileId, PROJECT, ORG, file(PDF, PDF_NAME, 'application/pdf'), USER);
    const row = await one('SELECT * FROM project_ingested_documents WHERE id = $1', [result.documentId]);
    const profile = await one('SELECT total_documents_ingested FROM project_intelligence_profiles WHERE id = $1', [projectProfileId]);

    expect(row.extracted_text).toContain('Technical Specifications Document');
    expect(row.processing_status).toBe('completed');
    expect(profile.total_documents_ingested).toBe(1);
  });

  it('fails a file nothing can be read from and does not count it', async () => {
    const result = await ingestProjectDocument(projectProfileId, PROJECT, ORG, file(PPTX, 'pitch-deck.pptx', PPTX_MIME), USER);
    const row = await one('SELECT * FROM project_ingested_documents WHERE id = $1', [result.documentId]);
    const atoms = await all(`SELECT id FROM project_memory_entries WHERE source_document_name = 'pitch-deck.pptx'`);
    const profile = await one('SELECT total_documents_ingested FROM project_intelligence_profiles WHERE id = $1', [projectProfileId]);

    expect(result.status, 'an unread file was reported as ingested').toBe('failed');
    expect(result.unreadable).toBe(true);
    expect(row).toMatchObject({ processing_status: 'failed', extracted_text: null });
    expect(atoms).toHaveLength(0);
    expect(profile.total_documents_ingested).toBe(1);
  });
});
