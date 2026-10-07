/** Actual PostgreSQL SQL against the existing disposition migration. Single
 * PGlite instance, not independent connections, live RLS or audit-HMAC PQ. */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DocumentDispositionLinkedIds } from '../../../../shared/document-data-disposition';
import { capturedDataEligibleSql } from '../eligibility';
import { readDerivedCaptureImpact } from '../derived-impact';
import {
  createDispositionHarness, insertCapturedSuccessor,
  type DispositionFixture, type DispositionHarness,
} from './disposition-fixture';

let harness: DispositionHarness;
const ORIGINAL_HASH = 'a'.repeat(64);
const DERIVED_HASH = 'b'.repeat(64);
beforeAll(async () => { harness = await createDispositionHarness(); });
afterAll(async () => { await harness.close(); });

function links(f: DispositionFixture): DocumentDispositionLinkedIds {
  return { capturedSourceIds: [f.capture], vaultDocumentIds: [f.vault],
    artifactIds: [String(f.artifact), f.artifactNativeId], uploadIds: [f.upload] };
}

async function child(f: DispositionFixture, opts: {
  crossProject?: boolean;
  organizationId?: number;
  provenance?: Record<string, unknown>;
} = {}) {
  const organizationId = opts.organizationId ?? f.org;
  let programId = f.program;
  if (opts.crossProject || organizationId !== f.org) {
    programId = randomUUID();
    await f.pg.query('INSERT INTO regulatory_programs VALUES ($1,$2,42,NULL)', [programId, organizationId]);
  }
  const fileId = `file_derived_${randomUUID()}`;
  await f.pg.query(`INSERT INTO file_uploads (id,organization_id,checksum_sha256,storage_path,status)
    VALUES ($1,$2,$3,$4,'processed')`, [fileId, organizationId, DERIVED_HASH, `uploads/org-${organizationId}/${fileId}`]);
  const provenance = opts.provenance ?? {
    origin: 'spreadsheet_edit', fileUploadId: fileId,
    derivedFromFileId: f.upload, derivedFromSha256: ORIGINAL_HASH,
    parentSourceIds: opts.crossProject ? [] : [f.capture],
  };
  const id = (await f.pg.query<{ id: number }>(`INSERT INTO cre_evidence_sources
      (organization_id,client_program_id,source_type,title,checksum,extraction_status,ingestion_status,provenance,metadata,is_current)
    VALUES ($1,$2,'client_document','Edited assay workbook.xlsx',$3,'extracted','ingested',$4,'{}',true) RETURNING id`,
  [organizationId, programId, DERIVED_HASH, JSON.stringify(provenance)])).rows[0].id;
  return { id, fileId, programId };
}

function impact(f: DispositionFixture) {
  return readDerivedCaptureImpact(f.db, f.org, links(f), ORIGINAL_HASH);
}

describe('derived capture impact SQL', () => {
  it.each([null, {}, [{}]])('refuses malformed query rows rather than certifying a dependency projection: %j', async malformed => {
    const f = await harness.seed();
    const invalidQuery = { query: async () => ({ rows: malformed as unknown[] }) };
    await expect(readDerivedCaptureImpact(invalidQuery, f.org, links(f), ORIGINAL_HASH))
      .rejects.toMatchObject({ status: 503, code: 'IMPACT_UNAVAILABLE' });
  });

  it.each([false, true])('finds exact direct children with cross-project=%s', async crossProject => {
    const f = await harness.seed();
    const derived = await child(f, { crossProject });
    const found = await impact(f);
    expect(found).toMatchObject({ count: 1, unverifiedCount: 0 });
    expect(found.rows).toEqual([expect.objectContaining({ id: derived.id, client_program_id: derived.programId, parent_edge_verified: true })]);
    expect(found.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('does not infer lineage from digest equality or include another tenant’s named parent', async () => {
    const f = await harness.seed();
    await child(f, { provenance: { origin: 'spreadsheet_edit', derivedFromFileId: 'file_unrelated',
      derivedFromSha256: ORIGINAL_HASH, parentSourceIds: [] } });
    await child(f, { organizationId: f.org + 10_000 });
    const found = await impact(f);
    expect(found.count).toBe(0);
    expect(found.rows).toEqual([]);
  });

  it.each([
    { parentSourceIds: [], derivedFromSha256: 'c'.repeat(64) },
    { parentSourceIds: { malformed: true }, derivedFromSha256: ORIGINAL_HASH },
    { parentSourceIds: [], derivedFromSha256: null },
  ])('keeps a named original upload dependency for review when lineage is inconsistent: %j', async invalid => {
    const f = await harness.seed();
    await child(f, { provenance: { origin: 'spreadsheet_edit', derivedFromFileId: f.upload, ...invalid } });
    expect(await impact(f)).toMatchObject({ count: 1, unverifiedCount: 1 });
  });

  it('does not lose an exact named parent when its digest is wrong or the ID array is malformed', async () => {
    const f = await harness.seed();
    await child(f, { provenance: { parentSourceIds: [f.capture], derivedFromSha256: 'c'.repeat(64) } });
    await child(f, { provenance: { parentSourceIds: String(f.capture), derivedFromSha256: ORIGINAL_HASH } });
    await child(f, { provenance: { parentSourceIds: [String(f.capture)], derivedFromSha256: ORIGINAL_HASH } });
    expect(await impact(f)).toMatchObject({ count: 3, unverifiedCount: 3 });
  });

  it('fingerprints a newly created child and a changed recorded dependency without mutating them', async () => {
    const f = await harness.seed();
    const before = await impact(f);
    const derived = await child(f);
    const added = await impact(f);
    expect(added.fingerprint).not.toBe(before.fingerprint);
    await f.pg.query(`UPDATE cre_evidence_sources SET provenance=provenance || $2::jsonb WHERE id=$1`,
      [derived.id, JSON.stringify({ derivedFromSha256: 'c'.repeat(64) })]);
    const changed = await impact(f);
    expect(changed.fingerprint).not.toBe(added.fingerprint);
    expect(changed).toMatchObject({ count: 1, unverifiedCount: 1 });
  });

  it('retained child data is a dependency and withdrawn child data is no longer usable', async () => {
    const f = await harness.seed();
    const derived = await child(f);
    await f.apply('keep_data', { targetId: String(derived.id) });
    expect(await impact(f)).toMatchObject({ count: 1 });
    await f.apply('remove_data', { targetId: String(derived.id) });
    expect(await impact(f)).toMatchObject({ count: 0 });
    expect((await f.apply('remove_data')).disposition.choice).toBe('remove_data');
  });
});

describe('disposition direct-child containment', () => {
  it.each([false, true])('offers keep_data and holds terminal parent withdrawal with cross-project=%s', async crossProject => {
    const f = await harness.seed();
    await child(f, { crossProject });
    const preview = await f.service.preview(f.scope);
    expect(preview.counts.downstreamReferences).toBe(2);
    expect(preview.allowedChoices).toEqual(['keep_data']);
    await expect(f.apply('remove_data')).rejects.toMatchObject({ code: 'DISPOSITION_BLOCKED' });
    expect(await f.records()).toEqual([]);
    expect(await f.audits()).toEqual([]);
  });

  it('holds parent supersession rather than guessing a replacement for an edited dataset', async () => {
    const f = await harness.seed();
    await child(f);
    const replacementId = await insertCapturedSuccessor(f);
    await expect(f.apply('supersede', { replacementId })).rejects.toMatchObject({ code: 'DISPOSITION_BLOCKED' });
    expect(await f.records()).toEqual([]);
  });

  it('holds removal through the linked Vault target rather than allowing an ID-space bypass', async () => {
    const f = await harness.seed();
    await child(f, { crossProject: true });
    const target = { targetType: 'vault_document' as const, targetId: f.vault };
    expect((await f.service.preview({ ...f.scope, ...target })).allowedChoices).toEqual(['keep_data']);
    await expect(f.apply('remove_data', target)).rejects.toMatchObject({ code: 'DISPOSITION_BLOCKED' });
    expect(await f.records()).toEqual([]);
  });

  it('permits original-file withdrawal while retaining both parent extraction and edited data', async () => {
    const f = await harness.seed();
    const derived = await child(f, { crossProject: true });
    const result = await f.apply('keep_data');
    expect(result.disposition.choice).toBe('keep_data');
    const rows = (await f.pg.query(`SELECT id, ${capturedDataEligibleSql('s')} AS data
      FROM cre_evidence_sources s WHERE id=ANY($1::integer[]) ORDER BY id`, [[f.capture, derived.id]])).rows;
    expect(rows).toEqual([{ id: f.capture, data: true }, { id: derived.id, data: true }]);
    expect((await f.service.preview(f.scope)).allowedChoices).toEqual([]);
    await expect(f.apply('remove_data')).rejects.toMatchObject({ code: 'DISPOSITION_BLOCKED' });
  });

  it('refuses an old withdrawal preview after a direct derived capture is created', async () => {
    const f = await harness.seed();
    const preview = await f.service.preview(f.scope);
    await child(f, { crossProject: true });
    await expect(f.service.apply({ ...f.scope, choice: 'remove_data',
      reason: 'Withdraw invalid assay data after review', previewToken: preview.previewToken }))
      .rejects.toMatchObject({ code: 'STALE_PREVIEW' });
    expect(await f.records()).toEqual([]);
  });

  it('requires a fresh preview when an existing child changes without changing the dependency count', async () => {
    const f = await harness.seed();
    const derived = await child(f);
    const preview = await f.service.preview(f.scope);
    await f.pg.query(`UPDATE cre_evidence_sources SET metadata=$2 WHERE id=$1`,
      [derived.id, JSON.stringify({ scientificQualification: 'requires_review' })]);
    await expect(f.service.apply({ ...f.scope, choice: 'keep_data',
      reason: 'Retain the extracted assay data for review', previewToken: preview.previewToken }))
      .rejects.toMatchObject({ code: 'STALE_PREVIEW' });
    expect(await f.records()).toEqual([]);
  });

  it('permits terminal withdrawal when matching digests or named parents belong to unrelated evidence', async () => {
    const f = await harness.seed();
    await child(f, { provenance: { derivedFromFileId: 'file_unrelated', derivedFromSha256: ORIGINAL_HASH, parentSourceIds: [] } });
    await child(f, { organizationId: f.org + 10_000 });
    expect((await f.apply('remove_data')).disposition.choice).toBe('remove_data');
  });
});
