/**
 * remember_document_in_project tells the model what was actually read and
 * stored — through the real handler and the real project-ingestion service, on
 * PGlite.
 *
 * ── What the code used to do (until 2026-10-15) ─────────────────────────────
 * For a file the ingestion path could not read (any PDF or XLSX under the ESM
 * build, any .pptx), the service stored a bracketed placeholder as the text and
 * reported 'completed', so the tool answered "Remembered X into project memory
 * (1 entry embedded). It will be surfaced automatically in future sessions." —
 * no byte of X had been read. It also said "embedded" for entries whose
 * embedding had failed (the service logs that failure and stores them anyway,
 * where semantic recall cannot find them).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import {
  projectIntelligenceProfiles,
  projectMemoryEntries,
  projectIngestedDocuments,
  projects,
} from '../../../../shared/schema';

const h = vi.hoisted(() => ({
  pg: null as any,
  db: null as any,
  load: vi.fn(),
  resolveSignerOrgRole: vi.fn(async () => 'member'),
}));

const { dbMock } = vi.hoisted(() => ({
  dbMock: async (importOriginal: () => Promise<unknown>) => ({
    ...(await importOriginal() as object),
    get db() { return h.db; },
    getDb: () => h.db,
  }),
}));
vi.mock('../../../db', dbMock);
vi.mock('../../../db.js', dbMock);
vi.mock('../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole: h.resolveSignerOrgRole }));
vi.mock('../../part11/resolve-signer-role.js', () => ({ resolveSignerOrgRole: h.resolveSignerOrgRole }));
vi.mock('../project-scope-admission.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../project-scope-admission.js')>()),
  admitAnaProjectScope: vi.fn(async () => undefined),
}));
vi.mock('../uploaded-file-access.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../uploaded-file-access.js')>()),
  loadUploadedFile: h.load,
}));
// The embedding provider is down: entries are stored without an embedding.
vi.mock('../../enhancedEmbeddingService.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../enhancedEmbeddingService.js')>()),
  getEmbeddingService: () => ({ embedBatch: async () => { throw new Error('embedding provider unavailable'); } }),
}));

import { getToolHandler, type ToolContext } from '../AnaToolExecutor.js';

const ORG = 7;
const PROJECT = 83;
const PDF_NAME = 'Bioanalytical_Methods_Template_v1.pdf';
const PDF = readFileSync(path.resolve(__dirname, '../../../../templates/authoring', PDF_NAME));
const PPTX = Buffer.from('PK\u0003\u0004 a slide deck no extractor reads');
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

function ddlOf(table: PgTable): string {
  const c = getTableConfig(table);
  const cols = c.columns.map((col) => {
    const type = col.getSQLType().startsWith('vector') ? 'text' : col.getSQLType();
    const d = col.default;
    const literal = typeof d === 'number' || typeof d === 'boolean' ? ` DEFAULT ${d}`
      : typeof d === 'string' ? ` DEFAULT '${d.replace(/'/g, "''")}'` : '';
    return `"${col.name}" ${type}${col.primary ? ' PRIMARY KEY' : ''}${literal}`;
  });
  return `CREATE TABLE IF NOT EXISTS "${c.name}" (${cols.join(', ')});`;
}

const ctx: ToolContext = { organizationId: ORG, userId: 41, projectId: PROJECT, humanConfirmed: true };

async function remember(fileName: string, mimeType: string, buffer: Buffer) {
  h.load.mockResolvedValue({ fileId: 'file_1', fileName, mimeType, fileSize: buffer.length, buffer, integrity: 'verified' });
  const handler = getToolHandler('remember_document_in_project');
  expect(handler).toBeDefined();
  return JSON.parse(await handler!({ file_id: 'file_1' }, ctx)) as { ok?: boolean; message?: string; error?: string };
}

beforeAll(async () => {
  process.env.MEMORY_LLM_EXTRACTION_ENABLED = 'false';
  h.pg = new PGlite();
  h.db = drizzle(h.pg);
  for (const t of [projectIntelligenceProfiles, projectMemoryEntries, projectIngestedDocuments, projects]) {
    await h.pg.exec(ddlOf(t as PgTable));
  }
  await h.pg.query(
    `INSERT INTO projects (id, organization_id, client_workspace_id, name, type) VALUES ($1, $2, 1, 'Study 001', 'clinical')`,
    [PROJECT, ORG]);
  await h.pg.query(
    `INSERT INTO project_intelligence_profiles (project_id, organization_id, profile_status) VALUES ($1, $2, 'active')`,
    [PROJECT, ORG]);
}, 60_000);

afterAll(async () => {
  delete process.env.MEMORY_LLM_EXTRACTION_ENABLED;
  await h.pg?.close();
});

beforeEach(() => h.resolveSignerOrgRole.mockResolvedValue('member'));

describe('remember_document_in_project', () => {
  it('says it could not read a file nothing could be read from, instead of "Remembered …"', async () => {
    const out = await remember('pitch-deck.pptx', PPTX_MIME, PPTX);
    expect(out.message, 'the tool claimed to remember a file it never read').not.toMatch(/Remembered/);
    expect(out.ok).toBe(false);
    expect(out.message).toMatch(/^Could not remember pitch-deck\.pptx: Could not read any text from pitch-deck\.pptx/);
  });

  it('does not say "embedded" for entries whose embedding failed', async () => {
    const out = await remember(PDF_NAME, 'application/pdf', PDF);
    expect(out.ok).toBe(true);
    expect(out.message, 'the tool claimed embeddings that were never written').not.toMatch(/entr(y|ies) embedded\)/);
    expect(out.message).toMatch(/^Remembered Bioanalytical_Methods_Template_v1\.pdf into project memory \(\d+ entr(y|ies) stored, 0 embedded\)/);
  });
});
