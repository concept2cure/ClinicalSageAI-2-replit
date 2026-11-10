/** Independent app_service sessions exercise the actual capture reservation,
 * forced tenant RLS, immutable source records and chained audit writes. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { databaseUrl } from '../setup.db';
import { nativeCatalogRunId, seedNativeCatalogProject, withNativeCatalogClient, type NativeCatalogActor } from './catalog-native-fixture';
import { assertVaultFixtureDatabase, closeVaultFixtureRuntime } from './vault-current-access-fixture';
import { captureClientSource, type CreateSourceParams } from '../../server/services/clinical-regulatory-evidence/evidence-spine.service';
import { lockDocumentDispositionProgram } from '../../server/services/document-data-disposition/program-lock';

const RUN = nativeCatalogRunId();
const PREFIX = `source-capture-${RUN}`;
const PROTOCOL_A = `STUDY-A-${RUN}`;
const PROTOCOL_B = `STUDY-B-${RUN}`;
let owner: Pool;
let actor: NativeCatalogActor;
let outsider: NativeCatalogActor;
let programId: string;
let studyA: number;
let studyB: number;
let uploadCount = 0;

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  await assertVaultFixtureDatabase(owner);
  const org = (await owner.query(`INSERT INTO organizations(name,slug,status)
    VALUES($1,$1,'active') RETURNING id,uuid`, [PREFIX])).rows[0];
  const createActor = async (suffix: string): Promise<NativeCatalogActor> => {
    const user = (await owner.query(`INSERT INTO users(email,name,password_hash,status)
      VALUES($1,$2,'fixture-only-no-login','active') RETURNING id`, [`${PREFIX}-${suffix}@example.invalid`, `${PREFIX} ${suffix}`])).rows[0];
    await owner.query("INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,'member')", [org.id, user.id]);
    return { organizationId: Number(org.id), organizationUuid: String(org.uuid), userId: Number(user.id),
      role: 'member', caller: 'tests/db/source-capture-study-concurrency.dbtest.ts' };
  };
  actor = await createActor('owner');
  outsider = await createActor('unshared');
  const program = (await owner.query(`INSERT INTO regulatory_programs
    (organization_id,name,code,program_type,product_type,primary_agency,product_name,lead_user_id)
    VALUES($1,$2,$3,'IND','drug','FDA','Source capture fixture',$4) RETURNING id`,
  [org.id, PREFIX, PREFIX, actor.userId])).rows[0];
  programId = String(program.id);
  const project = await seedNativeCatalogProject(owner, { organizationId: actor.organizationId,
    userId: actor.userId, programId, namespace: PREFIX });
  await owner.query(`INSERT INTO project_visibility_settings(organization_id,project_id,visibility)
    VALUES($1,$2,'private') ON CONFLICT (project_id) DO UPDATE SET visibility='private'`, [org.id, project.projectId]);
  for (const protocol of [PROTOCOL_A, PROTOCOL_B]) {
    const study = (await owner.query(`INSERT INTO cdisc_prm_studies
      (tenant_id,study_id,protocol_id,protocol_title,protocol_version,program_id)
      VALUES($1,$2,$3,'Source capture fixture','1.0',$4) RETURNING id`,
    [org.id, `sd_${protocol}`, protocol, programId])).rows[0];
    if (protocol === PROTOCOL_A) studyA = Number(study.id);
    else studyB = Number(study.id);
  }
  // The canonical fixture verifies actual app_service/NOSUPERUSER/NOBYPASSRLS,
  // tenant/account scope and RLS-on before any call below may use the pool.
  await withNativeCatalogClient(actor, async () => undefined);
}, 60_000);

afterAll(async () => {
  // Retain captures, original bytes and audit history in this disposable
  // namespace. Neither immutability nor audit triggers are disabled for cleanup.
  await owner?.end();
  await closeVaultFixtureRuntime();
});

async function upload(title: string, text: string, by = actor): Promise<CreateSourceParams> {
  const id = `${PREFIX}-${++uploadCount}`;
  const bytes = Buffer.from(text);
  const checksum = createHash('sha256').update(bytes).digest('hex');
  const storagePath = `uploads/org-${by.organizationId}/${id}`;
  await fs.mkdir(path.dirname(path.resolve(storagePath)), { recursive: true });
  await fs.writeFile(path.resolve(storagePath), bytes);
  await owner.query(`INSERT INTO file_uploads
    (id,user_id,organization_id,original_name,mime_type,file_size,storage_path,checksum_sha256,status)
    VALUES($1,$2,$3,$4,'text/plain',$5,$6,$7,'uploaded')`,
  [id, by.userId, by.organizationId, title, bytes.length, storagePath, checksum]);
  return { sourceType: 'client_document', visibilityClass: 'project_private', clientProgramId: programId,
    clientWorkspaceId: null, title, checksum, storedArtifactRef: storagePath, createdBy: by.userId,
    provenance: { origin: 'chat_upload', fileUploadId: id, uploadedByUserId: by.userId } };
}

const capture = (params: CreateSourceParams, text: string, by = actor) =>
  withNativeCatalogClient(by, async () => captureClientSource(by.organizationId, params, { text }));

async function waitingCaptures(count: number): Promise<void> {
  const deadline = Date.now() + 3_500;
  let observed: number;
  do {
    const result = await owner.query(`SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE datname=current_database() AND usename='app_service' AND wait_event='advisory'
        AND query LIKE '%pg_advisory_xact_lock%'`);
    observed = Number(result.rows[0].waiting);
    if (observed === count) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  } while (Date.now() < deadline);
  expect(observed, 'Independent runtime captures must actually be waiting on the database reservation').toBe(count);
}

/** Hold the production reservation until all separate runtime clients have
 * reached it. No same-connection Promise.all can satisfy this observation. */
async function reservedRace<T>(work: Array<() => Promise<T>>, whileWaiting?: () => Promise<void>): Promise<PromiseSettledResult<T>[]> {
  const blocker = await owner.connect();
  let results: Promise<PromiseSettledResult<T>[]> | undefined;
  try {
    await blocker.query('BEGIN');
    await lockDocumentDispositionProgram(blocker, actor.organizationId, programId);
    results = Promise.allSettled(work.map(run => run()));
    await waitingCaptures(work.length);
    await whileWaiting?.();
    await blocker.query('COMMIT');
    return await results;
  } finally {
    await blocker.query('ROLLBACK').catch(() => undefined);
    blocker.release();
    await results;
  }
}

function value<T>(result: PromiseSettledResult<T>): T {
  if (result.status === 'rejected') throw result.reason;
  return result.value;
}
const sources = async (title: string) => (await owner.query(`SELECT id,study_ref,is_current,previous_version_id,checksum,provenance
  FROM cre_evidence_sources WHERE organization_id=$1 AND title=$2 ORDER BY id`, [actor.organizationId, title])).rows;
const auditCount = async (sourceId: number, action: string) => Number((await owner.query(`SELECT count(*)::int AS count
  FROM audit_logs WHERE tenant_id=$1 AND record_id=$2 AND action=$3`, [actor.organizationId, String(sourceId), action])).rows[0].count);

describe('native concurrent study-specific source capture', () => {
  it('two overlapping initial captures of identical bytes commit one identity and one capture audit', async () => {
    const title = `${PREFIX}-same-bytes.txt`;
    const text = `Protocol Number: ${PROTOCOL_A}\nThe same original bytes.`;
    const [firstUpload, secondUpload] = await Promise.all([upload(title, text), upload(title, text)]);
    const results = (await reservedRace([() => capture(firstUpload, text), () => capture(secondUpload, text)])).map(value);
    expect(new Set(results.map(result => result.source.id)).size).toBe(1);
    expect(results.map(result => result.reused).sort()).toEqual([false, true]);
    const [source] = await sources(title);
    expect(await sources(title)).toHaveLength(1);
    expect(source).toMatchObject({ study_ref: studyA, is_current: true, previous_version_id: null });
    expect([firstUpload.provenance!.fileUploadId, secondUpload.provenance!.fileUploadId]).toContain(source.provenance.fileUploadId);
    expect(await auditCount(Number(source.id), 'data_room.capture')).toBe(1);
  });

  it('overlapping distinct revisions form one chain without losing captured bytes or audit history', async () => {
    const title = `${PREFIX}-revision-race.txt`;
    const originalText = `Protocol Number: ${PROTOCOL_A}\nOriginal`;
    const original = await capture(await upload(title, originalText), originalText);
    const revisions = [`${originalText}\nRevision A`, `${originalText}\nRevision B`];
    const uploads = await Promise.all(revisions.map(text => upload(title, text)));
    const changed = (await reservedRace(uploads.map((params, i) => () => capture(params, revisions[i])))).map(value);
    const rows = await sources(title);
    expect(rows).toHaveLength(3);
    expect(rows.filter(row => row.is_current)).toHaveLength(1);
    expect(rows.filter(row => row.previous_version_id != null)).toHaveLength(2);
    expect(new Set(rows.filter(row => row.previous_version_id != null).map(row => row.previous_version_id)).size).toBe(2);
    expect(rows[0]).toMatchObject({ id: original.source.id, checksum: original.source.checksum, is_current: false });
    expect(changed.every(result => result.supersededId !== null)).toBe(true);
    for (const row of rows) expect(await auditCount(Number(row.id), 'data_room.capture')).toBe(1);
    for (const row of rows.filter(row => !row.is_current)) expect(await auditCount(Number(row.id), 'data_room.supersede')).toBe(1);
    await expect(capture(await upload(title, originalText), originalText)).rejects.toMatchObject({ code: 'SOURCE_CAPTURE_RETIRED' });
    expect(await sources(title)).toHaveLength(3);
  });

  it('same-named files for two studies remain current and unrelated under contention', async () => {
    const title = `${PREFIX}-two-studies.txt`;
    const texts = [PROTOCOL_A, PROTOCOL_B].map(protocol => `Protocol Number: ${protocol}\nStudy-specific report`);
    const uploads = await Promise.all(texts.map(text => upload(title, text)));
    const results = (await reservedRace(uploads.map((params, i) => () => capture(params, texts[i])))).map(value);
    expect(results.every(result => result.supersededId === null)).toBe(true);
    const rows = await sources(title);
    expect(rows).toHaveLength(2);
    expect(rows.every(row => row.is_current && row.previous_version_id === null)).toBe(true);
    expect(rows.map(row => row.study_ref).sort((a, b) => a - b)).toEqual([studyA, studyB].sort((a, b) => a - b));
  });

  it('rechecks the current actor after a real lock wait', async () => {
    const title = `${PREFIX}-revoked.txt`;
    const text = `Protocol Number: ${PROTOCOL_A}\nRevoked actor`;
    const params = await upload(title, text);
    try {
      const [result] = await reservedRace([() => capture(params, text)], async () => {
        await owner.query('DELETE FROM organization_users WHERE organization_id=$1 AND user_id=$2', [actor.organizationId, actor.userId]);
      });
      expect(result.status).toBe('rejected');
      if (result.status === 'rejected') expect(result.reason).toMatchObject({ status: 403 });
      expect(await sources(title)).toHaveLength(0);
    } finally {
      await owner.query("INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,'member') ON CONFLICT DO NOTHING",
        [actor.organizationId, actor.userId]);
    }
  });

  it('an active organization member without the private project grant cannot capture or resolve its source', async () => {
    const title = `${PREFIX}-private.txt`;
    const text = `Protocol Number: ${PROTOCOL_A}\nPrivate evidence`;
    await capture(await upload(title, text), text);
    await expect(capture(await upload(title, text, outsider), text, outsider)).rejects.toMatchObject({ status: 403 });
    expect(await sources(title)).toHaveLength(1);
  });
});
