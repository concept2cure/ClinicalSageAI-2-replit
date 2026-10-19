/** Real filing orchestration and PostgreSQL recording/compensation. Ingest,
 * PDF bytes and audit-chain persistence are explicit seams; no live lock or
 * external storage/scanner qualification is claimed. */
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
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
vi.mock('../../../export/renderers', () => ({
  renderHtmlToPdf: h.pdf,
  // The export renders through the tracked form (QA 2026-10-08, j4); same stub.
  renderHtmlToPdfTracked: async (html: string) => ({ buffer: await h.pdf(html), usedFallback: false }),
}));
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
  await harness.pg.exec(readFileSync(new URL('../../../../db/migrations/20260725_authoring_audit_trail.sql',import.meta.url),'utf8'));
  await harness.pg.exec(`
    ALTER TABLE authoring_documents ADD COLUMN title text, ADD COLUMN module text,
      ADD COLUMN version text, ADD COLUMN created_by text, ADD COLUMN created_at timestamptz DEFAULT now();
    ALTER TABLE authoring_sections ADD COLUMN code text, ADD COLUMN title text,
      ADD COLUMN content text, ADD COLUMN order_index integer, ADD COLUMN created_at timestamptz DEFAULT now();
    CREATE TABLE authoring_signatures (doc_id uuid, tenant_id integer, signer_email text,
      signer_name text, meaning text, reason text, method text, content_hash text,
      covered_freeze_version text, pin_verified boolean, signed_at timestamptz DEFAULT now());
    CREATE TABLE IF NOT EXISTS authoring_export_history (id uuid DEFAULT gen_random_uuid(), document_id uuid,
      export_type text, doc_sha256 text, exported_by text, file_name text, file_size bigint,
      metadata jsonb, tenant_id integer, exported_at timestamptz DEFAULT now());
    CREATE TABLE test_filing_audit (id uuid DEFAULT gen_random_uuid(), tenant_id integer,
      operation text, entry jsonb);
    /* The governed filing store, so the P-29.2 agreement check has something to
       compare against. Without these three pieces filingAgreesWithEditing
       answers "the governed document store is not provisioned here" and records
       nothing — which is the correct fail-soft posture, and is also why the
       divergence case below could not be written against this harness before. */
    ALTER TABLE authoring_documents ADD COLUMN IF NOT EXISTS c2c_document_id text;
    ALTER TABLE c2c_document_sections ADD COLUMN IF NOT EXISTS section_key text,
      ADD COLUMN IF NOT EXISTS content jsonb;
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
  // The shared fixture already records active actor 42, current organization
  // membership, and this programme's unique project anchor and sharing.
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
  it('uses signing order for duplicate section indices in the rendered and retained full snapshot', async () => {
    const d = await workingDraft();
    await d.f.pg.query(`UPDATE authoring_sections SET order_index=1,
      created_at=CASE WHEN id=$1 THEN '2026-10-14T12:00:00Z'::timestamptz ELSE '2026-10-14T11:00:00Z'::timestamptz END
      WHERE doc_id=$2 AND tenant_id=$3`, [d.sections[0].id,d.docId,d.f.org]);
    admit(d);
    expect(await file(d)).toMatchObject({ kind:'filed' });
    const rendered = String(h.pdf.mock.calls[0][0]);
    expect(rendered.indexOf('Original safety result.')).toBeLessThan(rendered.indexOf('Original endpoint result.'));
    expect((await facts(d)).history[0].doc_sha256).toBe(sectionsDigest([...d.sections].reverse()));
  });
  it('records imported source lineage on a different-byte Vault rendition and blocks withdrawing the original data', async () => {
    const d = await workingDraft();
    const origin = { kind: 'vault', id: d.f.vault, programId: d.f.program, sha256: 'a'.repeat(64),
      title: 'Original source', fileName: 'source.pdf', mimeType: 'application/pdf', documentType: null,
      sectionCode: '12', conversion: 'extracted-text' };
    await d.f.pg.query('UPDATE authoring_documents SET provenance=$1 WHERE id=$2 AND tenant_id=$3',
      [JSON.stringify({ source: 'import', moduleDefaulted: true, importSource: origin }), d.docId, d.f.org]);
    admit(d);
    const outcome = await file(d);
    expect(outcome, JSON.stringify(outcome)).toMatchObject({ kind: 'filed', vaultDocumentId: d.admittedId });
    const after = await facts(d);
    expect(after.history[0].metadata?.importSource).toEqual(origin);
    expect(after.vault.content_hash).not.toBe(origin.sha256);
    const preview = await d.f.service.preview(d.f.scope);
    expect(preview.dataWithdrawalBlockers?.join(' ')).toContain('filed editor rendition');
    expect(preview.allowedChoices).toEqual(['keep_data']);
    await expect(d.f.service.apply({ ...d.f.scope, choice: 'remove_data', reason: 'Withdraw the original source after filing', previewToken: preview.previewToken }))
      .rejects.toMatchObject({ code: 'DISPOSITION_BLOCKED' });
    expect(await d.f.records()).toEqual([]);
  });

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

  it('records on the filed rendition that the filing holds other text, without refusing the draft', async () => {
    /* P-29.2. Filing to the Vault is the one exit outside the seal cone: it
       takes working drafts BY DESIGN and stamps "WORKING DRAFT — not a sealed
       21 CFR Part 11 record" on page one, so refusing here would dead-end a
       draft for no gain. But a filed rendition whose source sections' filed
       copies are not this document's text is a fact about THIS artefact, so it
       belongs on the artefact's own record. */
    const d = await workingDraft();
    const filingId = 'filing_ftv_1';
    await d.f.pg.query(`INSERT INTO c2c_documents (id, org_id) VALUES ($1, $2)`, [filingId, d.f.org]);
    await d.f.pg.query(
      `INSERT INTO c2c_document_sections (document_id, section_key, content)
       VALUES ($1, $2, jsonb_build_object('text', $3::text))`,
      [filingId, d.sections[0].code, 'Text nobody typed here.'],
    );
    await d.f.pg.query(`UPDATE authoring_documents SET c2c_document_id=$1 WHERE id=$2`, [filingId, d.docId]);

    admit(d);
    await file(d);
    const [row] = (await facts(d)).history;
    // The draft still filed: it has an export record and a live Vault row.
    expect(row, 'a working draft must still file').toBeDefined();
    const diverged = (row.metadata as { filingDiverged?: Array<{ key: string; filed: string }> }).filingDiverged;
    expect(diverged, 'the filed rendition says nothing about a filing holding other text').toEqual([
      { key: d.sections[0].code, filed: 'different', section: d.sections[0].code },
    ]);
  });

  it('says nothing on the record when the document is bound to no filing', async () => {
    // The control: the common case must not grow a key, and the check must not
    // invent a divergence out of an unbound document.
    const d = await workingDraft();
    admit(d);
    await file(d);
    const after = await facts(d);
    expect(after.history[0], 'the draft must still file').toBeDefined();
    expect(after.history[0].metadata).not.toHaveProperty('filingDiverged');
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
