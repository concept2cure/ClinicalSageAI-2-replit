/** Actual SQL tests; PGlite does not model two concurrent connections. */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createDocumentDispositionService } from '../service';
import {
  createDispositionHarness, insertCapturedSuccessor, insertVaultSuccessor, DISPOSITION_TEST_CLOCK,
  type DispositionHarness,
} from './disposition-fixture';

let harness: DispositionHarness;
let pg: PGlite;
const setup: DispositionHarness['seed'] = options => harness.seed(options);
beforeAll(async () => { harness = await createDispositionHarness(); pg = harness.pg; });
afterAll(async () => { await harness.close(); });
const HASH = 'a'.repeat(64);

describe('document disposition impact preview', () => {
  it('counts the complete captured, vault, extraction and lineage set within the program', async () => {
    const f = await setup();
    const result = await f.service.preview(f.scope);
    expect(result.counts).toEqual({ extractedTexts: 3, chunks: 2, atoms: 3, catalogValues: 2, citations: 2, downstreamReferences: 1 });
    expect(result.linkedIds).toEqual({ capturedSourceIds: [f.capture], vaultDocumentIds: [f.vault], artifactIds: [String(f.artifact), f.artifactNativeId].sort(), uploadIds: [f.upload] });
    expect(result.retention).toEqual({ legalHolds: 0, retentionUntil: '2030-12-31', physicalErasure: false });
    expect(result.previewToken).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(result.expiresAt).toBe('2026-10-06T17:10:00.000Z');
    expect(await f.records()).toEqual([]);
    expect(await f.audits()).toEqual([]);
  });

  it('refuses unavailable impact instead of reporting a missing store as zero', async () => {
    const f = await setup();
    await pg.query('ALTER TABLE authoring_citations RENAME TO missing_authoring_citations');
    try {
      await expect(f.service.preview(f.scope)).rejects.toMatchObject({ status: 503, code: 'IMPACT_UNAVAILABLE' });
      expect(await f.records()).toEqual([]);
    } finally {
      await pg.query('ALTER TABLE missing_authoring_citations RENAME TO authoring_citations');
    }
  });

  it('refuses an unknown aggregate count returned by the database seam', async () => {
    const f = await setup();
    const query = async (sql: string, params?: unknown[]) => {
      const result = await harness.db.query(sql, params);
      return sql.startsWith('SELECT count(*)::int AS n') && sql.includes('FROM lumen_data_atoms')
        ? { rows: result.rows.map(row => ({ ...row, n: null })) } : result;
    };
    const service = createDocumentDispositionService({
      db: { query, connect: async () => ({ query, release: () => undefined }) },
      audit: async () => ({ id: randomUUID(), sha256Chain: 'f'.repeat(64) }),
      enabled: () => true, tokenSecret: 'unknown-count-test-secret-at-least-32-characters',
    });
    await expect(service.preview(f.scope)).rejects.toMatchObject({ status: 503, code: 'IMPACT_UNAVAILABLE' });
    expect(await f.records()).toEqual([]);
  });

  it('denies source and project reads across both organization and program boundaries', async () => {
    const f = await setup();
    const other = await setup();
    await expect(f.service.preview({ ...f.scope, organizationId: other.org })).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    await expect(f.service.preview({ ...f.scope, programId: other.program })).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    await expect(f.service.preview({ ...f.scope, targetId: String(other.capture) })).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    const secondProgram = randomUUID();
    await pg.query('INSERT INTO regulatory_programs VALUES ($1,$2,42,NULL)', [secondProgram, f.org]);
    await expect(f.service.preview({ ...f.scope, programId: secondProgram })).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('blocks active legal holds and governed approval dependencies', async () => {
    const held = await setup();
    await pg.query('INSERT INTO vault.legal_holds (organization_id,program_id) VALUES ($1,$2)', [held.org, held.program]);
    const preview = await held.service.preview(held.scope);
    expect(preview.retention.legalHolds).toBe(1);
    expect(preview.allowedChoices).toEqual([]);
    await expect(held.service.apply({ ...held.scope, choice: 'keep_data', reason: 'Requested document removal', previewToken: preview.previewToken })).rejects.toMatchObject({ status: 409, code: 'DISPOSITION_BLOCKED' });
    const approved = await setup();
    await pg.query('INSERT INTO canonical_documents (canonical_id,organization_id,source_refs,stage) VALUES ($1,$2,$3,\'approved\')', [randomUUID(), approved.org, JSON.stringify({ vault_documents: { nativeId: approved.vault } })]);
    const approvedPreview = await approved.service.preview(approved.scope);
    expect(approvedPreview.approvals.active).toBe(1);
    expect(approvedPreview.allowedChoices).toEqual([]);
  });

  it('checks approved downstream authoring and document sections even when the original has no approval', async () => {
    const f = await setup();
    const doc = randomUUID();
    const section = randomUUID();
    await pg.query(`INSERT INTO authoring_documents (id,tenant_id,status,approved_at) VALUES ($1,$2,'draft',now())`, [doc,f.org]);
    await pg.query('INSERT INTO authoring_sections VALUES ($1,$2,$3)', [section,doc,f.org]);
    await pg.query('UPDATE authoring_citations SET section_id=$1 WHERE tenant_id=$2', [section,f.org]);
    const preview = await f.service.preview(f.scope);
    expect(preview.approvals.active).toBe(1);
    expect(preview.allowedChoices).toEqual([]);
    await expect(f.service.apply({ ...f.scope, choice: 'remove_data', reason: 'Requested document removal', previewToken: preview.previewToken }))
      .rejects.toMatchObject({ status: 409, code: 'DISPOSITION_BLOCKED' });

    const c2c = await setup();
    const c2cDoc = randomUUID();
    await pg.query(`INSERT INTO c2c_documents VALUES ($1,$2,$3,'draft')`, [c2cDoc,c2c.org,c2c.program]);
    const c2cSection = (await pg.query<{ id: string }>(`INSERT INTO c2c_document_sections (document_id,status) VALUES ($1,'approved') RETURNING id`, [c2cDoc])).rows[0].id;
    await pg.query(`INSERT INTO document_span_lineage (organization_id,document_table,document_id,source,reference_id)
      VALUES ($1,'c2c_document_sections',$2,'cre_evidence_source',$3)`, [c2c.org,String(c2cSection),String(c2c.capture)]);
    const c2cPreview = await c2c.service.preview(c2c.scope);
    expect(c2cPreview.approvals.active).toBe(1);
    expect(c2cPreview.allowedChoices).toEqual([]);
  });

  it('allows a captured source with extracted atoms before it has ever been filed into Vault', async () => {
    const f = await setup();
    const unfiled = (await pg.query<{ id: number }>(`INSERT INTO cre_evidence_sources
      (organization_id,client_program_id,source_type,title,checksum,extraction_status,ingestion_status,provenance,metadata,is_current)
      VALUES ($1,$2,'client_document','Unfiled source.pdf',$3,'extracted','ingested','{}','{}',true) RETURNING id`, [f.org,f.program,'9'.repeat(64)])).rows[0].id;
    await pg.query(`INSERT INTO lumen_data_atoms (organization_id,source_type,source_id,content,status)
      VALUES ($1,'chat_upload',$2,'Known unfiled extraction','active')`, [f.org,`cre_source:${unfiled}`]);
    const input = { ...f.scope, targetId: String(unfiled) };
    const preview = await f.service.preview(input);
    expect(preview.linkedIds).toEqual({ capturedSourceIds: [unfiled], vaultDocumentIds: [], artifactIds: [], uploadIds: [] });
    expect(preview.counts).toEqual({ extractedTexts: 1, chunks: 0, atoms: 1, catalogValues: 0, citations: 0, downstreamReferences: 0 });
    const result = await f.service.apply({ ...input, choice: 'keep_data', reason: 'Retain values after removing source', previewToken: preview.previewToken });
    expect(result.disposition.target.id).toBe(String(unfiled));
    expect((await f.service.preview(input)).counts).toEqual(preview.counts);
  });
});

describe('document disposition confirmation', () => {
  it.each(['keep_data', 'remove_data'] as const)('%s writes one decision and audit receipt while preserving all source and lineage rows', async choice => {
    const f = await setup();
    const before = await f.service.preview(f.scope);
    const result = await f.apply(choice);
    expect(result.disposition).toMatchObject({ choice, replacementId: null, createdAt: DISPOSITION_TEST_CLOCK.toISOString(), target: before.target, linkedIds: before.linkedIds });
    expect(result.preview.currentDisposition?.id).toBe(result.disposition.id);
    expect(result.preview.allowedChoices).toEqual(choice === 'keep_data' ? ['remove_data', 'supersede'] : []);
    const rows = await f.records();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ organization_id: f.org, program_id: f.program, captured_source_id: f.capture, choice, actor_id: 42, source_sha256: HASH });
    expect(rows[0].audit_receipt).toEqual(result.disposition.auditReceipt);
    expect(await f.audits()).toHaveLength(1);
    const after = await f.service.preview(f.scope);
    expect(after.counts).toEqual(before.counts);
    expect(after.linkedIds).toEqual(before.linkedIds);
  });

  it('requires explicit activation and project mutation authority', async () => {
    const disabled = await setup({ enabled: false });
    expect((await disabled.service.preview(disabled.scope)).allowedChoices).toEqual([]);
    await expect(disabled.apply()).rejects.toMatchObject({ status: 503, code: 'DISPOSITIONS_NOT_ACTIVATED' });
    const f = await setup();
    const scope = { ...f.scope, actorId: 99, orgRole: 'viewer' };
    const preview = await f.service.preview(scope);
    await expect(f.service.apply({ ...scope, choice: 'keep_data', reason: 'Requested document removal', previewToken: preview.previewToken })).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    expect(await f.records()).toEqual([]);
  });

});

describe('retained data lifecycle and transaction safety', () => {
  it.each(['remove_data','supersede'] as const)('appends keep_data → %s without rewriting the first decision or retained lineage', async choice => {
    const f = await setup();
    const original = await f.apply('keep_data');
    const first = (await f.records())[0];
    const replacementId = choice === 'supersede' ? await insertCapturedSuccessor(f) : undefined;
    const result = await f.apply(choice, replacementId ? { replacementId } : {});
    const rows = await f.records();
    expect(rows).toHaveLength(2);
    expect(rows.find(row => row.id === first.id)).toEqual(first);
    expect(rows.find(row => row.id === result.disposition.id)).toMatchObject({
      choice, previous_disposition_id: original.disposition.id, disposition_sequence: 2,
      source_sha256: HASH, captured_source_id: f.capture,
    });
    expect(await f.audits()).toHaveLength(2);
    expect(result.preview.allowedChoices).toEqual([]);
    expect((await f.service.preview(f.scope)).counts).toEqual({ extractedTexts: 3, chunks: 2, atoms: 3, catalogValues: 2, citations: 2, downstreamReferences: 1 });
    const terminalPreview = await f.service.preview(f.scope);
    await expect(f.service.apply({ ...f.scope, choice: 'keep_data', reason: 'Attempt to reactivate retained data', previewToken: terminalPreview.previewToken }))
      .rejects.toMatchObject({ status: 409, code: 'DISPOSITION_BLOCKED' });
    expect(await f.records()).toHaveLength(2);
  });

  it('binds supersession to the named verified direct successor with usable extraction', async () => {
    const f = await setup();
    const replacementId = await insertCapturedSuccessor(f);
    const result = await f.apply('supersede', { replacementId });
    expect(result.disposition.replacementId).toBe(replacementId);
    expect((await f.records())[0].replacement_captured_source_id).toBe(Number(replacementId));
    const unrelated = await setup();
    const unrelatedId = await insertCapturedSuccessor(unrelated, unrelated.capture + 10_000);
    await expect(unrelated.service.preview({ ...unrelated.scope, replacementId: unrelatedId })).rejects.toMatchObject({ status: 409, code: 'INVALID_SUCCESSOR' });
    const unusable = await setup();
    const unusableId = await insertCapturedSuccessor(unusable);
    await pg.query('UPDATE lumen_data_atoms SET content=\'\' WHERE organization_id=$1 AND source_id=$2', [unusable.org, `cre_source:${unusableId}`]);
    await expect(unusable.service.preview({ ...unusable.scope, replacementId: unusableId })).rejects.toMatchObject({ status: 409, code: 'INVALID_SUCCESSOR' });
    await expect(f.service.preview({ ...f.scope, replacementId: unrelatedId })).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('binds Vault supersession to its indexed direct successor and refuses a same-file replacement', async () => {
    const f = await setup();
    const replacementId = await insertVaultSuccessor(f);
    const extra = { targetType: 'vault_document' as const, targetId: f.vault, replacementId };
    const result = await f.apply('supersede', extra);
    expect(result.disposition.replacementId).toBe(replacementId);
    expect((await f.records())[0]).toMatchObject({ vault_document_id: f.vault, replacement_vault_document_id: replacementId, captured_source_id: null });
    const same = await setup();
    await expect(same.service.preview({ ...same.scope, targetType: 'vault_document', targetId: same.vault, replacementId: same.vault }))
      .rejects.toMatchObject({ status: 409, code: 'INVALID_SUCCESSOR' });
  });

  it('invalidates a supersession preview when replacement extraction content changes', async () => {
    const f = await setup();
    const replacementId = await insertCapturedSuccessor(f);
    const input = { ...f.scope, replacementId };
    const preview = await f.service.preview(input);
    await pg.query(`UPDATE lumen_data_atoms SET content='Updated replacement endpoint' WHERE organization_id=$1 AND source_id=$2`,
      [f.org,`cre_source:${replacementId}`]);
    await expect(f.service.apply({ ...input, choice: 'supersede', reason: 'Use verified replacement extraction', previewToken: preview.previewToken }))
      .rejects.toMatchObject({ status: 409, code: 'STALE_PREVIEW' });
    expect(await f.records()).toEqual([]);
  });

  it('refuses a tampered, expired, replayed or cross-actor preview', async () => {
    const f = await setup();
    const preview = await f.service.preview(f.scope);
    const input = { ...f.scope, choice: 'keep_data' as const, reason: 'Requested document removal', previewToken: preview.previewToken };
    await expect(f.service.apply({ ...input, previewToken: `${preview.previewToken}x` })).rejects.toMatchObject({ status: 409, code: 'STALE_PREVIEW' });
    await expect(f.service.apply({ ...input, actorId: 43 })).rejects.toMatchObject({ status: 409, code: 'STALE_PREVIEW' });
    f.advance(10 * 60_000);
    await expect(f.service.apply(input)).rejects.toMatchObject({ status: 409, code: 'STALE_PREVIEW' });
    const fresh = await f.service.preview(f.scope);
    await f.service.apply({ ...input, previewToken: fresh.previewToken });
    await expect(f.service.apply({ ...input, previewToken: fresh.previewToken })).rejects.toMatchObject({ status: 409, code: 'STALE_PREVIEW' });
    expect(await f.records()).toHaveLength(1);
    expect(await f.audits()).toHaveLength(1);
  });

  it('rejects both count changes and content changes that leave the count unchanged', async () => {
    const f = await setup();
    const preview = await f.service.preview(f.scope);
    await pg.query('INSERT INTO vault.document_chunks (document_id,chunk_text) VALUES ($1,\'Late extracted page\')', [f.vault]);
    await expect(f.service.apply({ ...f.scope, choice: 'remove_data', reason: 'Requested document removal', previewToken: preview.previewToken })).rejects.toMatchObject({ status: 409, code: 'STALE_PREVIEW' });
    const second = await f.service.preview(f.scope);
    await pg.query('UPDATE lumen_data_atoms SET content=\'Changed extraction\' WHERE organization_id=$1 AND source_id=$2', [f.org, `cre_source:${f.capture}`]);
    await expect(f.service.apply({ ...f.scope, choice: 'remove_data', reason: 'Requested document removal', previewToken: second.previewToken })).rejects.toMatchObject({ status: 409, code: 'STALE_PREVIEW' });
    expect(await f.records()).toEqual([]);
    expect(await f.audits()).toEqual([]);
  });

  it('rolls back an audit write when audit creation fails or returns an invalid receipt', async () => {
    const failing = await setup({ auditFails: true });
    await expect(failing.apply()).rejects.toMatchObject({ status: 503, code: 'IMPACT_UNAVAILABLE' });
    expect(await failing.records()).toEqual([]);
    expect(await failing.audits()).toEqual([]);
    const invalid = await setup({ invalidAudit: true });
    await expect(invalid.apply()).rejects.toMatchObject({ status: 503, code: 'AUDIT_UNAVAILABLE' });
    expect(await invalid.records()).toEqual([]);
    expect(await invalid.audits()).toEqual([]);
  });
});
