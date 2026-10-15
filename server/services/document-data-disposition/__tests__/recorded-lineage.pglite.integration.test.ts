/** Recorded identity lineage runs against actual PostgreSQL SQL. The fixture
 * represents legacy terminal decisions; it does not exercise concurrent
 * connections, production RLS, archival recovery or audit-HMAC verification. */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { capturedDataEligibleSql, uploadedBinaryAvailableSql } from '../eligibility';
import { createDispositionHarness, type DispositionFixture, type DispositionHarness } from './disposition-fixture';

let harness: DispositionHarness;
beforeAll(async () => { harness = await createDispositionHarness(); });
afterAll(async () => { await harness.close(); });

async function descendant(f: DispositionFixture, parent: { id: number; fileId: string; hash: string }, opts: {
  crossProject?: boolean; provenance?: Record<string, unknown>;
} = {}) {
  const hash = randomUUID().replaceAll('-', '').repeat(2);
  const fileId = `file_lineage_${randomUUID()}`;
  const programId = opts.crossProject ? randomUUID() : f.program;
  if (opts.crossProject) await f.pg.query('INSERT INTO regulatory_programs VALUES ($1,$2,42,NULL)', [programId, f.org]);
  await f.pg.query(`INSERT INTO file_uploads (id,organization_id,checksum_sha256,storage_path,status)
    VALUES ($1,$2,$3,$4,'uploaded')`, [fileId, f.org, hash, `uploads/org-${f.org}/${fileId}`]);
  const provenance = opts.provenance ?? { origin: 'spreadsheet_edit', fileUploadId: fileId,
    derivedFromFileId: parent.fileId, derivedFromSha256: parent.hash, parentSourceIds: [parent.id] };
  const id = (await f.pg.query<{ id: number }>(`INSERT INTO cre_evidence_sources
    (organization_id,client_program_id,source_type,title,checksum,extraction_status,ingestion_status,provenance,metadata,is_current)
    VALUES ($1,$2,'client_document','Recorded edited workbook.xlsx',$3,'extracted','ingested',$4,'{}',true) RETURNING id`,
  [f.org, programId, hash, JSON.stringify(provenance)])).rows[0].id;
  return { id, fileId, hash };
}

async function availability(f: DispositionFixture, child: { id: number; fileId: string }) {
  return {
    data: (await f.pg.query<{ data: boolean }>(`SELECT ${capturedDataEligibleSql('s')} AS data
      FROM cre_evidence_sources s WHERE id=$1`, [child.id])).rows[0].data,
    binary: (await f.pg.query<{ binary: boolean }>(`SELECT ${uploadedBinaryAvailableSql('u')} AS binary
      FROM file_uploads u WHERE id=$1`, [child.fileId])).rows[0].binary,
  };
}

async function auditedUpload(f: DispositionFixture, parent: { fileId: string; hash: string }, options: {
  tenantId?: number; details?: Record<string, unknown>; tableName?: string;
} = {}) {
  const fileId = `file_audit_lineage_${randomUUID()}`;
  const hash = randomUUID().replaceAll('-', '').repeat(2);
  await f.pg.query(`INSERT INTO file_uploads (id,organization_id,checksum_sha256,storage_path,status)
    VALUES ($1,$2,$3,$4,'uploaded')`, [fileId, f.org, hash, `uploads/org-${f.org}/${fileId}`]);
  const details = { operation: 'spreadsheet_edit', fileId, checksumSha256: hash,
    sourceFileId: parent.fileId, sourceSha256: parent.hash, parentSourceIds: [], ...options.details };
  await f.pg.query(`INSERT INTO audit_logs (id,tenant_id,action,table_name,record_id,target,new_values)
    VALUES ($1,$2,'file_upload.derived',$3,$4,$5,$6::json)`,
  [randomUUID(), options.tenantId ?? f.org, options.tableName ?? 'file_upload', fileId, `file_upload:${fileId}`, JSON.stringify(details)]);
  return { fileId, hash };
}
async function binary(f: DispositionFixture, fileId: string) {
  return (await f.pg.query<{ binary: boolean }>(`SELECT ${uploadedBinaryAvailableSql('u')} AS binary
    FROM file_uploads u WHERE id=$1`, [fileId])).rows[0].binary;
}

describe('known legacy workbook ancestry eligibility', () => {
  it.each([false, true])('withholds an exact descendant of legacy removed data with cross-project=%s', async crossProject => {
    const f = await harness.seed();
    // Install the terminal decision first, then the retained historical child.
    // This models the final legacy state without bypassing the append-only
    // migration or weakening current preview/apply containment.
    await f.apply('remove_data');
    const child = await descendant(f, { id: f.capture, fileId: f.upload, hash: 'a'.repeat(64) }, { crossProject });
    expect(await availability(f, child)).toEqual({ data: false, binary: false });
  });

  it('withholds a two-hop exact descendant while preserving its historical rows', async () => {
    const f = await harness.seed(); await f.apply('remove_data');
    const child = await descendant(f, { id: f.capture, fileId: f.upload, hash: 'a'.repeat(64) }, { crossProject: true });
    const grandchild = await descendant(f, child);
    expect(await availability(f, grandchild)).toEqual({ data: false, binary: false });
    expect((await f.pg.query('SELECT id FROM cre_evidence_sources WHERE id=ANY($1::integer[])', [[child.id, grandchild.id]])).rows).toHaveLength(2);
  });

  it('keeps descendants usable when the ancestor retained extracted data', async () => {
    const f = await harness.seed(); await f.apply('keep_data');
    const child = await descendant(f, { id: f.capture, fileId: f.upload, hash: 'a'.repeat(64) }, { crossProject: true });
    expect(await availability(f, child)).toEqual({ data: true, binary: true });
  });

  it('keeps another project’s independent same-byte capture usable', async () => {
    const f = await harness.seed(); await f.apply('remove_data');
    const child = await descendant(f, { id: f.capture, fileId: f.upload, hash: 'a'.repeat(64) },
      { crossProject: true, provenance: { origin: 'manual' } });
    await f.pg.query('UPDATE cre_evidence_sources SET checksum=$2 WHERE id=$1', [child.id, 'a'.repeat(64)]);
    expect((await availability(f, child)).data).toBe(true);
  });

  it.each([
    { derivedFromFileId: 'file_missing', derivedFromSha256: 'a'.repeat(64), parentSourceIds: [] },
    { derivedFromFileId: null, derivedFromSha256: 'a'.repeat(64), parentSourceIds: [999999] },
    { derivedFromSha256: 'f'.repeat(64), parentSourceIds: 'malformed' },
  ])('does not silently qualify unresolved or malformed named ancestry: %j', async provenance => {
    const f = await harness.seed();
    const child = await descendant(f, { id: f.capture, fileId: f.upload, hash: 'a'.repeat(64) },
      { provenance: { origin: 'spreadsheet_edit', ...provenance } });
    expect((await availability(f, child)).data).toBe(false);
  });

  it('retains extraction when its original upload association is absent and no parent edge was recorded', async () => {
    const f = await harness.seed(); await f.apply('keep_data');
    // Disposed metadata is immutable. Deleting the original upload row is not
    // necessary: the ordinary capture's historic association already has no
    // derivation event and must remain data, independently of its binary.
    expect((await f.pg.query<{ data: boolean }>(`SELECT ${capturedDataEligibleSql('s')} AS data
      FROM cre_evidence_sources s WHERE id=$1`, [f.capture])).rows[0].data).toBe(true);
    expect(await binary(f, f.upload)).toBe(false);
    const independent = await descendant(f, { id: f.capture, fileId: f.upload, hash: 'a'.repeat(64) },
      { provenance: { origin: 'manual', fileUploadId: 'historic_unavailable_upload' } });
    expect((await availability(f, independent)).data).toBe(true);
  });

  it('does not invent ancestry from an ordinary capture/upload association with a legacy missing upload digest', async () => {
    const f = await harness.seed();
    await f.pg.query('UPDATE file_uploads SET checksum_sha256=NULL WHERE id=$1', [f.upload]);
    expect(await binary(f, f.upload)).toBe(true);
    expect((await f.pg.query<{ data: boolean }>(`SELECT ${capturedDataEligibleSql('s')} AS data
      FROM cre_evidence_sources s WHERE id=$1`, [f.capture])).rows[0].data).toBe(true);
  });

  it('does not turn an empty parent array into an original-upload dependency for retained extraction', async () => {
    const f = await harness.seed();
    await f.pg.query('UPDATE cre_evidence_sources SET provenance=$2 WHERE id=$1',
      [f.capture, JSON.stringify({ fileUploadId: f.upload, parentSourceIds: [] })]);
    await f.apply('keep_data');
    expect((await f.pg.query<{ data: boolean }>(`SELECT ${capturedDataEligibleSql('s')} AS data
      FROM cre_evidence_sources s WHERE id=$1`, [f.capture])).rows[0].data).toBe(true);
    expect(await binary(f, f.upload)).toBe(false);
  });

  it.each(['w','rw','c','f','rl_seed','rl_walk'])('keeps the outer source identity when its SQL alias is %s', async sqlAlias => {
    const f = await harness.seed();
    expect((await f.pg.query<{ data: boolean }>(`SELECT ${capturedDataEligibleSql(sqlAlias)} AS data
      FROM cre_evidence_sources ${sqlAlias} WHERE ${sqlAlias}.id=$1`, [f.capture])).rows[0].data).toBe(true);
  });

  it('does not accept a named parent path that crosses tenant namespaces through dot segments', async () => {
    const f = await harness.seed();
    await f.pg.query('UPDATE file_uploads SET storage_path=$2 WHERE id=$1',
      [f.upload, `uploads/org-${f.org}/../org-${f.org + 1}/foreign`]);
    const child = await descendant(f, { id: f.capture, fileId: f.upload, hash: 'a'.repeat(64) });
    expect(await availability(f, child)).toEqual({ data: false, binary: false });
  });

  it('refuses a recorded upload cycle instead of reporting truncated ancestry as usable', async () => {
    const f = await harness.seed();
    const first = await auditedUpload(f, { fileId: f.upload, hash: 'a'.repeat(64) });
    const second = await auditedUpload(f, first);
    await f.pg.query(`UPDATE audit_logs SET new_values=jsonb_set(jsonb_set(to_jsonb(new_values),
      '{sourceFileId}',to_jsonb($2::text)),'{sourceSha256}',to_jsonb($3::text))::json WHERE record_id=$1`,
    [first.fileId, second.fileId, second.hash]);
    expect(await binary(f, first.fileId)).toBe(false);
  });

  it('refuses depth exhaustion instead of calling the bounded walk complete', async () => {
    const f = await harness.seed();
    let parent: { fileId: string; hash: string } = { fileId: f.upload, hash: 'a'.repeat(64) };
    for (let i = 0; i < 65; i++) parent = await auditedUpload(f, parent);
    expect(await binary(f, parent.fileId)).toBe(false);
  }, 60_000);
});

describe('conversation-only recorded audit ancestry', () => {
  it.each(['keep_data', 'remove_data'] as const)('%s has its stated descendant consequence without creating a capture', async choice => {
    const f = await harness.seed(); await f.apply(choice);
    const child = await auditedUpload(f, { fileId: f.upload, hash: 'a'.repeat(64) });
    const grandchild = await auditedUpload(f, child);
    expect(await binary(f, grandchild.fileId)).toBe(choice === 'keep_data');
    expect((await f.pg.query('SELECT id FROM cre_evidence_sources WHERE organization_id=$1', [f.org])).rows).toHaveLength(1);
  });

  it.each([
    { checksumSha256: 'f'.repeat(64) }, { fileId: 'different_child' },
    { sourceSha256: 'f'.repeat(64) }, { parentSourceIds: 'malformed' },
  ])('refuses a contradictory recorded audit identity: %j', async details => {
    const f = await harness.seed();
    const child = await auditedUpload(f, { fileId: f.upload, hash: 'a'.repeat(64) }, { details });
    expect(await binary(f, child.fileId)).toBe(false);
  });

  it('does not import another tenant’s event despite matching child/parent identities and bytes', async () => {
    const f = await harness.seed(); await f.apply('remove_data');
    const child = await auditedUpload(f, { fileId: f.upload, hash: 'a'.repeat(64) }, { tenantId: f.org + 1 });
    expect(await binary(f, child.fileId)).toBe(true);
  });

  it('refuses an ambiguous duplicate event instead of choosing one', async () => {
    const f = await harness.seed();
    const child = await auditedUpload(f, { fileId: f.upload, hash: 'a'.repeat(64) });
    await f.pg.query(`INSERT INTO audit_logs (id,tenant_id,action,table_name,record_id,target,new_values)
      SELECT $2,tenant_id,action,table_name,record_id,target,new_values FROM audit_logs WHERE record_id=$1`,
    [child.fileId, randomUUID()]);
    expect(await binary(f, child.fileId)).toBe(false);
  });
});
