/** Held-out merged-source controls using real PGlite SQL and persisted policy.
 * No file bytes, provider calls, PostgreSQL isolation or deployed-role claim. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../../../server/db.js', () => ({ db: {}, pool: { query: () => { throw new Error('Unowned database access'); } } }));
import { createDispositionHarness, type DispositionHarness, type DispositionFixture } from '../../../../server/services/document-data-disposition/__tests__/disposition-fixture.ts';
import { admitAnaSelectedSources, assertAnaUploadAccess } from '../../../../server/services/ana/source-context-admission.ts';
import { createDocumentDispositionService } from '../../../../server/services/document-data-disposition/service.ts';

let harness: DispositionHarness, f: DispositionFixture;
const actor = () => ({ organizationId: f.org, userId: 43 });
const selected = () => admitAnaSelectedSources(harness.db as any, { ...actor(), sourceIds: [f.capture] });
const upload = () => assertAnaUploadAccess(harness.db as any, { ...actor(), fileIds: [f.upload] });
async function share() {
  await f.pg.query("INSERT INTO project_members(organization_id,project_id,user_id,role,status) SELECT $1,id,43,'use','active' FROM projects WHERE organization_id=$1", [f.org]);
}
beforeAll(async () => {
  harness = await createDispositionHarness();
  await harness.pg.exec(`ALTER TABLE cre_evidence_sources ADD COLUMN created_by integer,ADD COLUMN client_workspace_id integer,ADD COLUMN visibility_class text DEFAULT 'project_private';
    ALTER TABLE file_uploads ADD COLUMN user_id integer;
    INSERT INTO users VALUES(43,'active')`);
}, 90_000);
beforeEach(async () => {
  await harness.pg.exec("UPDATE users SET status='active'"); f = await harness.seed();
  await f.pg.query("INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,43,'viewer_custom')", [f.org]);
  await f.pg.query("UPDATE project_visibility_settings SET visibility='private' WHERE organization_id=$1", [f.org]);
  await f.pg.query('UPDATE file_uploads SET user_id=43 WHERE id=$1', [f.upload]);
  await f.pg.query('UPDATE cre_evidence_sources SET created_by=43 WHERE id=$1', [f.capture]);
});
afterAll(async () => { await harness?.close(); });

describe('independent merged recorded-parent and actor controls', () => {
  it('an exact artifact/file relationship resolves legacy numeric scope and fails after its private share is removed', async () => {
    await share();
    const project = (await f.pg.query('SELECT id FROM projects WHERE organization_id=$1', [f.org])).rows[0].id;
    await f.pg.query('UPDATE cre_evidence_sources SET client_program_id=NULL,client_workspace_id=$2,provenance=$3,metadata=$4 WHERE id=$1',
      [f.capture, project, JSON.stringify({ origin: 'chat_upload', fileUploadId: f.upload }), JSON.stringify({ artifactId: f.artifactNativeId })]);
    await expect(selected()).resolves.toBeUndefined(); await expect(upload()).resolves.toBeUndefined();
    await f.pg.query("UPDATE project_members SET status='revoked' WHERE organization_id=$1 AND user_id=43", [f.org]);
    await expect(selected()).rejects.toMatchObject({ status: 403 }); await expect(upload()).rejects.toMatchObject({ status: 403 });
  });
  it('coincident numeric project IDs cannot replace the exact artifact and upload identity', async () => {
    await share();
    const project = (await f.pg.query('SELECT id FROM projects WHERE organization_id=$1', [f.org])).rows[0].id;
    await f.pg.query('UPDATE cre_evidence_sources SET client_program_id=NULL,client_workspace_id=$2,provenance=$3,metadata=$4 WHERE id=$1',
      [f.capture, project, JSON.stringify({ origin: 'chat_upload', fileUploadId: f.upload }), JSON.stringify({ artifactId: 'foreign-artifact-sentinel' })]);
    await expect(selected()).rejects.toMatchObject({ status: 409, code: 'ANA_SOURCE_SCOPE_UNRESOLVED' });
  });
  it.each([false, true])('a creator-owned unbound capture retains a same-byte private ancestor even when deleted=%s', async deleted => {
    await f.pg.query('DELETE FROM concept2cure_artifacts WHERE organization_id=$1', [f.org]);
    await f.pg.query('UPDATE cre_evidence_sources SET client_program_id=NULL,provenance=$2 WHERE id=$1',
      [f.capture, JSON.stringify({ origin: 'chat_upload', fileUploadId: f.upload })]);
    await expect(selected()).resolves.toBeUndefined();
    const checksum = (await f.pg.query('SELECT checksum_sha256 FROM file_uploads WHERE id=$1', [f.upload])).rows[0].checksum_sha256;
    await f.pg.query("INSERT INTO cre_evidence_sources(organization_id,client_program_id,source_type,checksum,provenance,created_by,deleted_at) VALUES($1,$2,'client_document',$3,$4,42,$5)",
      [f.org, f.program, checksum, JSON.stringify({ fileUploadId: 'different-upload-identity' }), deleted ? new Date() : null]);
    await expect(selected()).rejects.toMatchObject({ status: 409, code: 'ANA_SOURCE_SCOPE_UNRESOLVED' });
    await expect(upload()).rejects.toMatchObject({ status: 409, code: 'ANA_SOURCE_SCOPE_UNRESOLVED' });
  });
  it('a custom persisted role can read its explicit share while inactive current actor refuses unchanged source metadata', async () => {
    await share(); await expect(selected()).resolves.toBeUndefined();
    const before = (await f.pg.query('SELECT provenance,metadata,checksum FROM cre_evidence_sources WHERE id=$1', [f.capture])).rows;
    await f.pg.query("UPDATE users SET status='inactive' WHERE id=43");
    await expect(selected()).rejects.toMatchObject({ status: 403, code: 'ANA_SOURCE_ACCESS_DENIED' });
    expect((await f.pg.query('SELECT provenance,metadata,checksum FROM cre_evidence_sources WHERE id=$1', [f.capture])).rows).toEqual(before);
  });
  it('disposition reserves impacts before holding actor rows and refuses a persisted downgrade after that checkpoint', async () => {
    const calls: Array<{ sql: string; args?: unknown[] }> = []; let armed = false;
    const db: any = { query: async (sql: string, args?: unknown[]) => {
      calls.push({ sql, args }); const result = await harness.db.query(sql, args);
      if (armed && sql === 'LOCK TABLE public.document_data_dispositions IN SHARE ROW EXCLUSIVE MODE') {
        await f.pg.query("UPDATE organization_users SET role='viewer' WHERE organization_id=$1 AND user_id=42", [f.org]);
      }
      return result;
    }, connect: async () => ({ query: db.query, release: () => undefined }) };
    const audit = vi.fn(() => { throw new Error('Downgraded actor reached disposition audit'); });
    const service = createDocumentDispositionService({ db, audit, enabled: () => true,
      tokenSecret: 'independent-publication-synthetic-secret-32-characters', clock: () => new Date('2026-10-06T17:00:00.000Z') });
    const scope = { organizationId: f.org, programId: f.program, actorId: 42, orgRole: 'manager', targetType: 'captured_source' as const, targetId: String(f.capture) };
    const preview = await service.preview(scope); calls.length = 0; armed = true;
    await expect(service.apply({ ...scope, choice: 'keep_data', reason: 'Independent current-role confirmation', previewToken: preview.previewToken })).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    const barrier = calls.findIndex(c => c.sql.startsWith('LOCK TABLE public.authoring_citations'));
    const heldActor = calls.findIndex(c => c.sql.includes('FOR SHARE OF ou,u,o'));
    expect(barrier).toBeGreaterThan(-1); expect(heldActor).toBeGreaterThan(barrier);
    expect(calls.slice(0, barrier).some(c => /FOR SHARE/.test(c.sql))).toBe(false);
    expect(calls.some(c => c.sql.includes('SELECT lead_user_id') && c.sql.includes('FOR SHARE'))).toBe(true);
    expect(calls.filter(c => c.sql.includes("set_config('app.current_user_role'")).at(-1)?.args).toEqual(['viewer']);
    expect(audit).not.toHaveBeenCalled();
    expect((await f.pg.query('SELECT id FROM document_data_dispositions WHERE organization_id=$1', [f.org])).rows).toEqual([]);
    // The controlled checkpoint mutation occurred on this transaction; the
    // refused confirmation rolls it back along with any disposition work.
    expect((await f.pg.query('SELECT role FROM organization_users WHERE organization_id=$1 AND user_id=42', [f.org])).rows[0].role).toBe('manager');
  });
});
