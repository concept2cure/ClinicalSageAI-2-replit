/** Canonical upload/source SQL, sequential embedded fixture; no live RLS claim. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDispositionHarness, type DispositionHarness, type DispositionFixture } from '../../document-data-disposition/__tests__/disposition-fixture';
import { admitAnaSelectedSources, assertAnaUploadAccess } from '../source-context-admission';

let harness: DispositionHarness;
let f: DispositionFixture;
const q = { query: (sql: string, params?: unknown[]) => harness.pg.query<Record<string, unknown>>(sql, params) };
const actor = () => ({ organizationId: f.org, userId: 43 });
const upload = () => assertAnaUploadAccess(q, { ...actor(), fileIds: [f.upload] });
const selected = () => admitAnaSelectedSources(q, { ...actor(), sourceIds: [f.capture] });

beforeAll(async () => {
  harness = await createDispositionHarness();
  await harness.pg.exec(`
    ALTER TABLE cre_evidence_sources ADD COLUMN client_workspace_id int,
      ADD COLUMN visibility_class text DEFAULT 'project_private', ADD COLUMN created_by int;
    ALTER TABLE file_uploads ADD COLUMN user_id int;
    INSERT INTO users VALUES (43,'active');
  `);
}, 90_000);
afterAll(async () => { await harness?.close(); });
beforeEach(async () => {
  f = await harness.seed();
  await f.pg.query("UPDATE organization_users SET role='member' WHERE organization_id=$1 AND user_id=42", [f.org]);
  await f.pg.query("INSERT INTO organization_users VALUES ($1,43,'viewer')", [f.org]);
  await f.pg.query('UPDATE projects SET owner_id=42,created_by_id=42 WHERE organization_id=$1', [f.org]);
  await f.pg.query("UPDATE project_visibility_settings SET visibility='private' WHERE organization_id=$1", [f.org]);
  await f.pg.query('UPDATE file_uploads SET user_id=43 WHERE id=$1', [f.upload]);
  await f.pg.query('DELETE FROM concept2cure_artifacts WHERE organization_id=$1', [f.org]);
  await f.pg.query(`UPDATE cre_evidence_sources SET client_program_id=NULL,client_workspace_id=NULL,
    created_by=43,provenance=$1 WHERE id=$2`, [JSON.stringify({ origin: 'chat_upload', fileUploadId: f.upload }), f.capture]);
});

describe('truly unbound chat capture creator access', () => {
  it('keeps the persisted creator upload readable and selectable by a viewer', async () => {
    await expect(upload()).resolves.toBeUndefined();
    await expect(selected()).resolves.toBeUndefined();
  });
  it('denies another active member both upload and selected capture', async () => {
    await expect(assertAnaUploadAccess(q, { organizationId: f.org, userId: 42, fileIds: [f.upload] })).rejects.toMatchObject({ status: 403 });
    await expect(admitAnaSelectedSources(q, { organizationId: f.org, userId: 42, sourceIds: [f.capture] })).rejects.toMatchObject({ status: 403 });
  });
  it('requires both persisted capture creator and upload owner', async () => {
    await f.pg.query('UPDATE file_uploads SET user_id=42 WHERE id=$1', [f.upload]);
    await expect(upload()).rejects.toMatchObject({ status: 403 });
    await expect(selected()).rejects.toMatchObject({ status: 409, code: 'ANA_SOURCE_SCOPE_UNRESOLVED' });
    await f.pg.query('UPDATE file_uploads SET user_id=43 WHERE id=$1', [f.upload]);
    await f.pg.query('UPDATE cre_evidence_sources SET created_by=42 WHERE id=$1', [f.capture]);
    await expect(upload()).rejects.toMatchObject({ status: 403 });
  });
  it('does not turn an unknown unbound capture origin into a creator grant', async () => {
    await f.pg.query("UPDATE cre_evidence_sources SET provenance=provenance || '{\"origin\":\"unknown\"}'::jsonb WHERE id=$1", [f.capture]);
    await expect(upload()).rejects.toMatchObject({ status: 409 });
  });
  it('enforces an additional recorded private parent even for the uploader', async () => {
    await f.pg.query(`INSERT INTO concept2cure_artifacts (organization_id,project_id,metadata)
      SELECT $1,id,$2 FROM projects WHERE organization_id=$1`, [f.org, JSON.stringify({ fileId: f.upload })]);
    // An unbound copy cannot acquire creator access once a parent is recorded.
    await expect(upload()).rejects.toMatchObject({ status: 409, code: 'ANA_SOURCE_SCOPE_UNRESOLVED' });
    await expect(selected()).rejects.toMatchObject({ status: 409, code: 'ANA_SOURCE_SCOPE_UNRESOLVED' });
  });
  it('retains a deleted private capture association when an unbound copy also exists', async () => {
    await f.pg.query(`INSERT INTO cre_evidence_sources (organization_id,client_program_id,source_type,created_by,provenance,deleted_at)
      VALUES ($1,$2,'client_document',43,$3,now())`, [f.org, f.program, JSON.stringify({ origin: 'chat_upload', fileUploadId: f.upload })]);
    await expect(upload()).rejects.toMatchObject({ status: 409, code: 'ANA_SOURCE_SCOPE_UNRESOLVED' });
    await expect(selected()).rejects.toMatchObject({ status: 409, code: 'ANA_SOURCE_SCOPE_UNRESOLVED' });
  });
  it('does not let a creator bypass a recorded private workspace', async () => {
    await f.pg.query(`UPDATE cre_evidence_sources SET client_workspace_id=(SELECT id FROM projects WHERE organization_id=$1) WHERE id=$2`, [f.org, f.capture]);
    await expect(upload()).rejects.toMatchObject({ status: 409, code: 'ANA_SOURCE_SCOPE_UNRESOLVED' });
  });
});
