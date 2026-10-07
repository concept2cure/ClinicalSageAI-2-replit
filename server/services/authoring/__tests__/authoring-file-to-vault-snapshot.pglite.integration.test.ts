/** Real filing orchestration and PostgreSQL recording/compensation. Ingest,
 * PDF bytes and audit-chain persistence are explicit seams; no live lock or
 * external storage/scanner qualification is claimed. */
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDispositionHarness, type DispositionFixture, type DispositionHarness,
} from '../../document-data-disposition/__tests__/disposition-fixture';
import type { AuthoringPool } from '../authoring-documents';
import type { AuthoringAuditContext, AuthoringAuditEntry, Queryable } from '../authoring-evidence';
import type { CanonicalStoreDb } from '../../regulatory/canonicalDocumentStore';
import { sectionsDigest, type ExportSectionRow } from '../authoring-export';

const h = vi.hoisted(() => ({ sql: [] as string[], ingest: vi.fn(), trail: vi.fn(), chain: vi.fn(),
  pdf: vi.fn(async (html: string) => Buffer.from(`%PDF-1.7\n${html}`)) }));
vi.mock('../../vault/vault-ingest.service', () => ({ ingestVaultDocument: h.ingest }));
vi.mock('../../vault/vault-placement.service', () => ({ placeVaultDocument: vi.fn() }));
vi.mock('../../vault/vault-filing.service', () => ({ resolveVaultView: vi.fn(), isFolderInView: vi.fn(), folderLabel: vi.fn() }));
vi.mock('../../../export/renderers', () => ({ renderHtmlToPdf: h.pdf }));
vi.mock('../../auditService', () => ({ writeChainedAuditRow: h.chain }));
vi.mock('../authoring-evidence', async importOriginal => {
  const actual = await importOriginal<typeof import('../authoring-evidence')>();
  return { ...actual, writeAuthoringAuditTrail: h.trail };
});
vi.mock('../../regulatory/authoring-approval-carryover', () => ({
  readAuthoringSignatures: vi.fn(async () => []),
  carryAuthoringApproval: vi.fn(async () => ({ carried: false, reason: 'Working draft' })),
}));

let harness: DispositionHarness;
let fileDocument: typeof import('../authoring-file-to-vault').fileAuthoringDocumentToVault;
let pool: AuthoringPool;

beforeAll(async () => {
  harness = await createDispositionHarness();
  await harness.pg.exec(`
    ALTER TABLE authoring_documents ADD COLUMN title text, ADD COLUMN module text,
      ADD COLUMN version text, ADD COLUMN created_by text, ADD COLUMN created_at timestamptz DEFAULT now();
    ALTER TABLE authoring_sections ADD COLUMN code text, ADD COLUMN title text,
      ADD COLUMN content text, ADD COLUMN order_index integer;
    CREATE TABLE authoring_signatures (doc_id uuid, tenant_id integer, signer_email text,
      signer_name text, meaning text, reason text, method text, content_hash text,
      covered_freeze_version text, pin_verified boolean, signed_at timestamptz DEFAULT now());
    CREATE TABLE authoring_export_history (id uuid DEFAULT gen_random_uuid(), document_id uuid,
      export_type text, doc_sha256 text, exported_by text, file_name text, file_size bigint,
      metadata jsonb, tenant_id integer, exported_at timestamptz DEFAULT now());
    CREATE TABLE test_filing_audit (id uuid DEFAULT gen_random_uuid(), tenant_id integer,
      operation text, entry jsonb);
  `);
  const query = async (sql: string, params?: unknown[]) => {
    h.sql.push(sql);
    const result = await harness.pg.query(sql, params);
    return { ...result, rowCount: result.rows.length };
  };
  pool = { query, connect: async () => ({ query, release: () => undefined }) } as unknown as AuthoringPool;
  ({ fileAuthoringDocumentToVault: fileDocument } = await import('../authoring-file-to-vault'));
}, 180_000);
afterAll(async () => { await harness?.close(); });
beforeEach(() => {
  h.sql.length = 0; h.ingest.mockReset(); h.pdf.mockClear(); h.trail.mockReset(); h.chain.mockReset();
  h.trail.mockImplementation(async (ctx: AuthoringAuditContext, entry: AuthoringAuditEntry) => {
    await entry.executor!.query('INSERT INTO test_filing_audit (tenant_id,operation,entry) VALUES ($1,$2,$3)',
      [ctx.tenantId, entry.operationType, JSON.stringify(entry.metadata)]);
  });
  h.chain.mockImplementation(async (q: Queryable, entry: { tenantId: number; action: string }) => {
    await q.query('INSERT INTO test_filing_audit (tenant_id,operation,entry) VALUES ($1,$2,$3)',
      [entry.tenantId, entry.action, JSON.stringify(entry)]);
    return { id: randomUUID(), sha256Chain: 'f'.repeat(64) };
  });
});

type WorkingDraft = { f: DispositionFixture; docId: string; sections: ExportSectionRow[]; admittedId: string };
type FilingHistoryRow = { doc_sha256: string | null; metadata: Record<string, unknown> | null };
type AdmittedVaultRow = { deleted_at: Date | null; content_hash: string | null };
type FilingAuditRow = { operation: string | null };
type DocumentStatusRow = { status: string | null };

async function workingDraft(): Promise<WorkingDraft> {
  const f = await harness.seed();
  const docId = randomUUID();
  const sections = [
    { id: randomUUID(), code: '12', title: 'Efficacy', content: '<p>Original endpoint result.</p>' },
    { id: randomUUID(), code: '13', title: 'Safety', content: '<p>Original safety result.</p>' },
  ];
  await f.pg.query(`INSERT INTO authoring_documents
    (id,tenant_id,status,title,module,client_program_id,version,created_by,provenance)
    VALUES ($1,$2,'draft','Working CSR','M5',$3,'1.0','author@example.test',$4)`,
  [docId, f.org, f.program, JSON.stringify({ source: 'ana', moduleDefaulted: true })]);
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    await f.pg.query(`INSERT INTO authoring_sections (id,doc_id,tenant_id,code,title,content,order_index)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`, [s.id, docId, f.org, s.code, s.title, s.content, i + 1]);
  }
  return { f, docId, sections, admittedId: randomUUID() };
}

function admit(d: WorkingDraft, mutate?: () => Promise<unknown>) {
  h.ingest.mockImplementation(async (args: { fileBuffer: Buffer }) => {
    // The canonical admission boundary is replaced explicitly; its committed
    // Vault row and the ensuing authoring queries are real PostgreSQL rows.
    await d.f.pg.query(`INSERT INTO vault.documents
      (id,organization_id,program_id,document_title,content_hash,processing_status,extracted_text)
      VALUES ($1,$2,$3,'Working CSR',$4,'INDEXED','Rendered working draft')`,
    [d.admittedId, d.f.org, d.f.program, createHash('sha256').update(args.fileBuffer).digest('hex')]);
    await mutate?.();
    return { ok: true, document: { id: d.admittedId }, filing: {
      folderId: null, folderLabel: '', evidenceKind: null, ctdSection: null,
      placementStatus: 'NEEDS_REVIEW', confidence: null, rationale: null, needsReview: true,
    } };
  });
}

async function file(d: WorkingDraft) {
  return fileDocument({ pool, tenantId: d.f.org, docId: d.docId, format: 'pdf',
    actor: { id: '42', email: 'author@example.test' }, lifecycleDb: {} as CanonicalStoreDb,
    audit: { pool, tenantId: d.f.org, actorId: '42', actorEmail: 'author@example.test',
      actorRole: 'author', ipAddress: '127.0.0.1', userAgent: 'snapshot-fixture' } });
}

async function facts(d: WorkingDraft) {
  return {
    history: (await d.f.pg.query<FilingHistoryRow>('SELECT doc_sha256,metadata FROM authoring_export_history WHERE document_id=$1 AND tenant_id=$2', [d.docId, d.f.org])).rows,
    vault: (await d.f.pg.query<AdmittedVaultRow>('SELECT deleted_at,content_hash FROM vault.documents WHERE id=$1 AND program_id=$2', [d.admittedId, d.f.program])).rows[0],
    audit: (await d.f.pg.query<FilingAuditRow>('SELECT operation FROM test_filing_audit WHERE tenant_id=$1', [d.f.org])).rows,
    status: (await d.f.pg.query<DocumentStatusRow>('SELECT status FROM authoring_documents WHERE id=$1 AND tenant_id=$2', [d.docId, d.f.org])).rows[0].status,
  };
}

type Mutation = 'content' | 'title' | 'order' | 'added section';
async function mutate(d: WorkingDraft, mutation: Mutation) {
  const { pg, org } = d.f;
  if (mutation === 'content') return pg.query('UPDATE authoring_sections SET content=$3 WHERE id=$1 AND tenant_id=$2',
    [d.sections[0].id, org, '<p>Changed endpoint result.</p>']);
  if (mutation === 'title') return pg.query('UPDATE authoring_sections SET title=$3 WHERE id=$1 AND tenant_id=$2',
    [d.sections[0].id, org, 'Revised efficacy heading']);
  if (mutation === 'order') return pg.query('UPDATE authoring_sections SET order_index=3-order_index WHERE doc_id=$1 AND tenant_id=$2',
    [d.docId, org]);
  return pg.query(`INSERT INTO authoring_sections (id,doc_id,tenant_id,code,title,content,order_index)
    VALUES ($1,$2,$3,'14','New conclusions','<p>New conclusion.</p>',3)`, [randomUUID(), d.docId, org]);
}

describe('file-to-Vault records the same section snapshot it rendered', () => {
  it.each<Mutation>(['content', 'title', 'order', 'added section'])('refuses unchanged-status %s drift during ingestion and compensates admission', async mutation => {
    const d = await workingDraft();
    admit(d, () => mutate(d, mutation));
    const outcome = await file(d);
    const after = await facts(d);
    expect(outcome, JSON.stringify({ outcome, originalDigest: sectionsDigest(d.sections), ...after })).toMatchObject({
      kind: 'refused', status: 409, code: 'DOCUMENT_CHANGED_DURING_FILING',
    });
    expect(after.status).toBe('draft');
    expect(after.history).toEqual([]);
    expect(after.vault.deleted_at).not.toBeNull();
    expect(after.audit).toEqual([{ operation: 'authoring.document.file_to_vault.reverted' }]);
    expect(h.trail).not.toHaveBeenCalled();
    expect(h.pdf.mock.calls[0][0]).toContain('Original endpoint result.');
    expect(h.pdf.mock.calls[0][0]).not.toContain('Changed endpoint result.');
  });

  it('files a stable working snapshot with its canonical digest and locks sections before the final read/history', async () => {
    const d = await workingDraft();
    admit(d);
    const outcome = await file(d);
    expect(outcome).toMatchObject({ kind: 'filed', sealed: false, vaultDocumentId: d.admittedId });
    const after = await facts(d);
    expect(after.history).toHaveLength(1);
    expect(after.history[0].doc_sha256).toBe(sectionsDigest(d.sections));
    expect(after.history[0].metadata).toHaveProperty('artifactSha256', after.vault.content_hash);
    expect(after.vault.deleted_at).toBeNull();
    expect(after.audit).toEqual([{ operation: 'EXPORT' }, { operation: 'authoring.document.file_to_vault' }]);
    const sectionLock = h.sql.findIndex(sql => /LOCK TABLE authoring_sections IN SHARE MODE/.test(sql));
    const finalSectionRead = h.sql.findIndex((sql, index) => index > sectionLock
      && /SELECT id, code, title, content FROM authoring_sections/.test(sql));
    const history = h.sql.findIndex(sql => /INSERT INTO authoring_export_history/.test(sql));
    const commit = h.sql.findIndex((sql, index) => index > history && /^COMMIT/.test(sql));
    expect(sectionLock).toBeGreaterThanOrEqual(0);
    expect(finalSectionRead).toBeGreaterThan(sectionLock);
    expect(history).toBeGreaterThan(finalSectionRead);
    expect(commit).toBeGreaterThan(history);
  });
});
