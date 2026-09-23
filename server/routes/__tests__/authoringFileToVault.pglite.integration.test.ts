/**
 * POST /api/authoring/docs/:docId/file-to-vault (WM, 2026-09-21).
 *
 * The REAL router, the REAL ingest and placement services and the REAL
 * chained audit writer over in-process Postgres (PGlite). Only what reaches
 * outside the process is replaced: the storage provider (bytes to disk/S3),
 * the OCR extractor, the HTML→PDF engine, and the catalog/chunking toggles
 * that read their own connection.
 *
 * Proves: the vault row exists with the SHA-256 of the rendered bytes, filed
 * in the CTD module folder; the export is in the document's export history;
 * ONE governed action `authoring.document.file_to_vault` sits in the tenant's
 * hash chain and the chain verifies; a document with no program and a
 * document mid-freeze are refused 409; and a failure after the vault row was
 * admitted reverts it (never a partial write).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createHash } from 'node:crypto';
import type express from 'express';
import type { PoolClient } from 'pg';
import { createJourneyDb, type JourneyDb } from '../../../tests/golden-journeys/harness';
import { PREREQ, VAULT_DDL, AUTHOR, PROGRAM, ORG, mint, makeApp, asToken, M25_SECTIONS } from './_authoring-canvas-fixture';

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown, put: vi.fn() }));
vi.mock('../../db', () => ({
  get db() { return h.db; },
  get pool() { return h.pool; },
  getPool: () => h.pool,
  query: (text: string, params?: unknown[]) =>
    (h.pool as { query: (t: string, p?: unknown[]) => Promise<unknown> }).query(text, params),
}));
vi.mock('../../services/storage/index', () => ({
  getStorageProvider: () => ({ name: 'local', put: h.put, get: vi.fn(), delete: vi.fn() }),
}));
vi.mock('../../services/ocr/index', () => ({
  extractDocumentText: async () => ({ text: 'Overview of Clinical Pharmacology', method: 'test', confidence: 1 }),
}));
vi.mock('../../services/ocr/pdfInspector', () => ({ pdfPageCount: async () => 1 }));
vi.mock('../../services/vault/document-catalog.service', () => ({
  isDocumentCatalogEnabled: async () => false,
  recordExtractionOutcome: vi.fn(),
  buildExtractionOutcome: () => ({ status: 'none' }),
}));
vi.mock('../../services/vault/document-chunking.service', () => ({
  isVaultChunkingEnabled: async () => false,
  chunkDocumentForIngest: vi.fn(),
}));
/* Bytes that differ per document (the title is in the HTML) so two filings in
   one program do not collide on the vault's (program, content_hash) rule the
   way one shared buffer would. A real '%PDF-' header so the magic-byte check
   the ingest runs is exercised for real. */
vi.mock('../../export/renderers', () => ({
  renderHtmlToPdf: async (html: string) => Buffer.from(`%PDF-1.7\n% rendered by the test engine\n${html}`),
}));
const lastStoredBytes = (): Buffer => (h.put.mock.calls.at(-1)?.[0] as { bytes: Buffer }).bytes;

const T = 180_000;
let jdb: JourneyDb;
let app: express.Express;
let author: (r: request.Test) => request.Test;

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: PREREQ + VAULT_DDL,
    migrations: [
      'db/migrations/20260725_authoring_document_loop_tables.sql',
      'db/migrations/20260817_doc_revisions_immutable_ledger.sql',
      'db/migrations/20260725_authoring_audit_trail.sql',
      'db/migrations/20260813_audit_tamper_proof_log.sql',
      'db/migrations/20260725_authoring_signatures_and_workflow.sql',
      'db/migrations/20260725_authoring_signature_freeze_binding.sql',
      'db/migrations/20260730_authoring_runtime_ddl.sql',
      'db/migrations/20260730_authoring_comments_router_columns.sql',
      'db/migrations/20260727_authoring_object_permissions.sql',
      'db/migrations/20260803_document_span_lineage.sql',
      'migrations/20260907_span_lineage_accepted_machine_draft.sql',
      'migrations/20260908_span_lineage_machine_draft.sql',
      'migrations/20260728_authoring_comments_threading.sql',
      'migrations/20260727_authoring_document_program_scope.sql',
      'migrations/20260728_authoring_document_governed_binding.sql',
      'migrations/20260814d_document_alias_map.sql',
      'migrations/20260921_audit_logs_chain_seq.sql',
      'migrations/20260921_authoring_document_provenance.sql',
    ],
  });
  h.db = jdb.db;
  h.pool = jdb.pool;
  h.put.mockImplementation(async (opts: { bytes: Buffer }) => ({
    vaultFileId: `vault://${ORG}/${PROGRAM}/file`,
    vaultVersionId: `ver-${createHash('sha256').update(opts.bytes).digest('hex').slice(0, 8)}`,
    sizeBytes: opts.bytes.length,
    sha256: createHash('sha256').update(opts.bytes).digest('hex'),
    provider: 'local',
  }));
  author = asToken(await mint(AUTHOR));
  const { default: router } = await import('../authoring.router');
  app = makeApp(router);
}, T);

afterAll(async () => {
  await jdb?.close();
});

async function draftDocument(title: string, programId: string | null = PROGRAM): Promise<string> {
  if (programId) {
    const res = await author(request(app).post('/api/authoring/docs/from-draft')).send({
      programId, title, module: 'M2', sections: M25_SECTIONS, provenance: { source: 'ana' },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.data.doc.id;
  }
  const res = await author(request(app).post('/api/authoring/docs')).send({ title, module: 'M2' });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.document.id;
}

describe('POST /docs/:docId/file-to-vault', () => {
  it('renders, ingests, files and records ONE governed action — the vault row carries the export bytes’ SHA-256', async () => {
    const docId = await draftDocument('Module 2.5 Clinical Overview — to file');
    const res = await author(request(app).post(`/api/authoring/docs/${docId}/file-to-vault`)).send({ format: 'pdf' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const { vaultDocumentId, folder, sha256, format, sealed } = res.body.data;
    expect(format).toBe('pdf');
    expect(sealed).toBe(false);
    // The hash the response and the row carry IS the hash of the bytes that went to storage.
    const stored = lastStoredBytes();
    expect(stored.subarray(0, 5).toString()).toBe('%PDF-');
    expect(sha256).toBe(createHash('sha256').update(stored).digest('hex'));
    // Filed by the CTD module through the placement service, confirmed.
    expect(folder.folderId).toBe('module-2');
    expect(folder.placementStatus).toBe('confirmed');

    // The vault row: the same hash, the program, filed, not deleted.
    const vrow = await jdb.pool.query(
      `SELECT program_id, content_hash, document_type, folder_id, placement_status, deleted_at, mime_type
         FROM vault.documents WHERE id = $1`,
      [vaultDocumentId],
    );
    expect(vrow.rows).toHaveLength(1);
    expect(vrow.rows[0]).toMatchObject({
      program_id: PROGRAM, content_hash: sha256, document_type: 'MODULE_2',
      folder_id: 'module-2', placement_status: 'confirmed', deleted_at: null, mime_type: 'application/pdf',
    });
    // The bytes went through the storage seam.
    expect(h.put).toHaveBeenCalled();

    // The document's export history lists it, with the artifact hash.
    const hist = await jdb.pool.query(
      `SELECT export_type, metadata FROM authoring_export_history WHERE document_id = $1 AND tenant_id = $2`,
      [docId, ORG],
    );
    expect(hist.rows).toHaveLength(1);
    const rawMeta = (hist.rows[0] as { metadata: string | Record<string, unknown> }).metadata;
    const meta = typeof rawMeta === 'string' ? JSON.parse(rawMeta) : rawMeta;
    expect(meta).toMatchObject({ filedToVault: true, vaultDocumentId, artifactSha256: sha256 });

    // ONE governed action in the tenant's hash chain, naming everything.
    const governed = await jdb.pool.query(
      `SELECT action, record_id, sha256_chain, new_values FROM audit_logs
        WHERE tenant_id = $1 AND action = 'authoring.document.file_to_vault'`,
      [ORG],
    );
    expect(governed.rows).toHaveLength(1);
    const g = governed.rows[0] as { record_id: string; sha256_chain: string; new_values: Record<string, unknown> | string };
    expect(g.record_id).toBe(docId);
    expect(g.sha256_chain).toMatch(/^[0-9a-f]{64}$/);
    const details = typeof g.new_values === 'string' ? JSON.parse(g.new_values) : g.new_values;
    expect(details).toMatchObject({ vaultDocumentId, artifactSha256: sha256, folderId: 'module-2', format: 'pdf' });

    // The chain verifies end to end: the ingest row, the placement row and the governed row link.
    const { verifyAuditChain } = await import('../../services/audit/chain');
    const client = (await jdb.pool.connect()) as unknown as PoolClient;
    const verdict = await verifyAuditChain(client, { tenantId: ORG });
    expect(verdict.ok, JSON.stringify(verdict)).toBe(true);
    expect(verdict.rowsChecked).toBeGreaterThanOrEqual(3);
  });

  it('refuses 409 DOCUMENT_HAS_NO_PROGRAM for an org-wide document — nothing filed', async () => {
    const docId = await draftDocument('Org-wide working notes', null);
    const before = await jdb.pool.query('SELECT COUNT(*)::int AS n FROM vault.documents');
    const res = await author(request(app).post(`/api/authoring/docs/${docId}/file-to-vault`)).send({ format: 'pdf' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DOCUMENT_HAS_NO_PROGRAM');
    const after = await jdb.pool.query('SELECT COUNT(*)::int AS n FROM vault.documents');
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it('refuses 409 DOCUMENT_MID_FREEZE when the document carries a lock but no sealed status', async () => {
    const docId = await draftDocument('Locked mid-freeze');
    await jdb.pool.query(`UPDATE authoring_documents SET locked_at = NOW() WHERE id = $1`, [docId]);
    const res = await author(request(app).post(`/api/authoring/docs/${docId}/file-to-vault`)).send({ format: 'docx' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DOCUMENT_MID_FREEZE');
  });

  it('refuses 400 on a format it does not file', async () => {
    const docId = await draftDocument('Wrong format');
    const res = await author(request(app).post(`/api/authoring/docs/${docId}/file-to-vault`)).send({ format: 'xml' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FORMAT');
  });

  it('files a DOCX too — real docx bytes, the same folder', async () => {
    const docId = await draftDocument('Module 2.5 — docx');
    const res = await author(request(app).post(`/api/authoring/docs/${docId}/file-to-vault`)).send({ format: 'docx' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const vrow = await jdb.pool.query(`SELECT mime_type, folder_id FROM vault.documents WHERE id = $1`, [res.body.data.vaultDocumentId]);
    expect(vrow.rows[0]).toMatchObject({
      mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      folder_id: 'module-2',
    });
  });

  it('never leaves a partial write: a failure after ingest reverts the vault row and answers 500', async () => {
    const docId = await draftDocument('Compensation case');
    // Force the record transaction to fail AFTER the ingest committed: take the
    // export-history table away, so logExport raises inside recordFiling.
    await jdb.pool.query('ALTER TABLE authoring_export_history RENAME TO authoring_export_history_gone');
    let res: request.Response;
    try {
      res = await author(request(app).post(`/api/authoring/docs/${docId}/file-to-vault`)).send({ format: 'pdf' });
    } finally {
      await jdb.pool.query('ALTER TABLE authoring_export_history_gone RENAME TO authoring_export_history');
    }
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('FILE_TO_VAULT_FAILED');
    // The admitted row is no longer visible to any vault read (soft-deleted)…
    const rows = await jdb.pool.query(
      `SELECT deleted_at FROM vault.documents WHERE document_code = $1`,
      [`authoring-${docId}`],
    );
    expect(rows.rows).toHaveLength(1);
    expect((rows.rows[0] as { deleted_at: string | null }).deleted_at).not.toBeNull();
    // …and the reversal is on the record beside the ingest, while the governed
    // filing action was never written.
    const actions = await jdb.pool.query(
      `SELECT action FROM audit_logs WHERE tenant_id = $1 AND new_values::text LIKE '%' || $2 || '%' ORDER BY occurred_at`,
      [ORG, docId],
    );
    const names = (actions.rows as { action: string }[]).map((r) => r.action);
    expect(names).not.toContain('authoring.document.file_to_vault');
    const reverted = await jdb.pool.query(
      `SELECT action FROM audit_logs WHERE tenant_id = $1 AND action = 'authoring.document.file_to_vault.reverted'`,
      [ORG],
    );
    expect(reverted.rows.length).toBeGreaterThanOrEqual(1);
  });
});
