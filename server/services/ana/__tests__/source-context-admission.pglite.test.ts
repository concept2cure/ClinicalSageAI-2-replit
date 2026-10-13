/** Real source/project SQL and canonical upload loader; filesystem is the
 * explicit seam. These fixtures prove access before content, not live RLS. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDispositionHarness, type DispositionHarness, type DispositionFixture } from '../../document-data-disposition/__tests__/disposition-fixture';

const h = vi.hoisted(() => ({ db: null as any, readFile: vi.fn(), writeFile: vi.fn(), unlink: vi.fn() }));
vi.mock('../../../db.js', () => ({ getPool: () => h.db, pool: { query: (sql: string, args?: unknown[]) => h.db.query(sql, args) } }));
vi.mock('node:fs', async original => {
  const fs = await original<typeof import('node:fs')>();
  return { ...fs, promises: { ...fs.promises, readFile: h.readFile, writeFile: h.writeFile, unlink: h.unlink,
    mkdir: async () => undefined } };
});

import { admitAnaSelectedSources, assertAnaUploadAccess } from '../source-context-admission';
import { loadUploadedFile, loadUploadedFileMetadata, saveDerivedUpload, sha256Hex } from '../uploaded-file-access';
import { getToolHandler } from '../AnaToolExecutor';

let harness: DispositionHarness;
let f: DispositionFixture;
const bytes = Buffer.from('private saved study evidence');
const actor = () => ({ organizationId: f.org, userId: 43 });
const sources = () => admitAnaSelectedSources(h.db, { ...actor(), sourceIds: [f.capture] });
const uploads = () => assertAnaUploadAccess(h.db, { ...actor(), fileIds: [f.upload] });
async function share() {
  await f.pg.query(`INSERT INTO project_members (project_id,organization_id,user_id,role,status)
    SELECT id,$1,43,'use','active' FROM projects WHERE organization_id=$1`, [f.org]);
}

beforeAll(async () => {
  harness = await createDispositionHarness(); h.db = harness.db;
  await harness.pg.exec(`
    CREATE TABLE users(id int PRIMARY KEY,status text);
    CREATE TABLE organizations(id int PRIMARY KEY,status text);
    CREATE TABLE organization_users(organization_id int,user_id int,role text);
    CREATE TABLE project_visibility_settings(project_id int,organization_id int,visibility text);
    CREATE TABLE project_members(project_id int,organization_id int,user_id int,role text,status text);
    CREATE TABLE concept2cure_review_assignments(artifact_id int,organization_id int,reviewer_id int,status text);
    ALTER TABLE projects ADD COLUMN client_workspace_id int, ADD COLUMN owner_id int,
      ADD COLUMN created_by_id int, ADD COLUMN settings jsonb DEFAULT '{}';
    ALTER TABLE cre_evidence_sources ADD COLUMN client_workspace_id int,
      ADD COLUMN visibility_class text DEFAULT 'project_private';
    ALTER TABLE cre_evidence_sources ALTER COLUMN organization_id DROP NOT NULL;
    ALTER TABLE file_uploads ADD COLUMN user_id int, ADD COLUMN original_name text,
      ADD COLUMN mime_type text, ADD COLUMN file_size bigint;
    INSERT INTO users VALUES (42,'active'),(43,'active');
  `);
}, 90_000);
afterAll(async () => { await harness?.close(); });
beforeEach(async () => {
  h.readFile.mockReset().mockResolvedValue(bytes);
  h.writeFile.mockReset().mockResolvedValue(undefined); h.unlink.mockReset().mockResolvedValue(undefined);
  await harness.pg.exec("UPDATE users SET status='active'");
  f = await harness.seed();
  await f.pg.query("INSERT INTO organizations VALUES ($1,'active')", [f.org]);
  await f.pg.query("INSERT INTO organization_users VALUES ($1,42,'member'),($1,43,'member')", [f.org]);
  await f.pg.query('UPDATE projects SET owner_id=42,created_by_id=42 WHERE organization_id=$1', [f.org]);
  await f.pg.query("INSERT INTO project_visibility_settings SELECT id,$1,'private' FROM projects WHERE organization_id=$1", [f.org]);
  await f.pg.query("UPDATE file_uploads SET user_id=43,original_name='private-study.txt',mime_type='text/plain',checksum_sha256=$1 WHERE id=$2", [sha256Hex(bytes), f.upload]);
});

describe('spreadsheet copies recheck access on their canonical write transaction', () => {
  const derive = () => saveDerivedUpload({ buffer: Buffer.from('derived working copy'), fileName: 'edited.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', organizationId: f.org, userId: 43,
    derivation: { sourceFileId: f.upload, sourceSha256: sha256Hex(bytes), projectRef: f.program,
      edits: [{ cell: 'A1', value: 7 }], createdSheets: [] } });
  it('refuses source access revoked after the original was read, before creating bytes or rows', async () => {
    await share();
    h.readFile.mockImplementationOnce(async () => {
      await f.pg.query("UPDATE project_members SET status='revoked' WHERE organization_id=$1", [f.org]);
      return bytes;
    });
    await expect(derive()).rejects.toMatchObject({ status: 403 });
    expect(h.writeFile).not.toHaveBeenCalled();
    expect((await f.pg.query('SELECT id FROM file_uploads WHERE organization_id=$1', [f.org])).rows).toHaveLength(1);
  });
  it('refuses a private destination even when the actor owns an unbound conversation source', async () => {
    await f.pg.query('DELETE FROM cre_evidence_sources WHERE organization_id=$1', [f.org]);
    await f.pg.query('DELETE FROM concept2cure_artifacts WHERE organization_id=$1', [f.org]);
    await expect(derive()).rejects.toMatchObject({ status: 403 });
    expect(h.writeFile).not.toHaveBeenCalled();
    expect((await f.pg.query('SELECT id FROM file_uploads WHERE organization_id=$1', [f.org])).rows).toHaveLength(1);
  });
});

describe('selected source identity keeps its recorded private project', () => {
  it('refuses an unassigned organization member before source text or bytes', async () => {
    await expect(sources()).rejects.toMatchObject({ status: 403, code: 'ANA_PROJECT_ACCESS_DENIED' });
    expect(h.readFile).not.toHaveBeenCalled();
  });
  it('allows an explicitly shared project and honors revocation on the next read', async () => {
    await share(); await expect(sources()).resolves.toBeUndefined();
    await f.pg.query("UPDATE project_members SET status='revoked' WHERE organization_id=$1", [f.org]);
    await expect(sources()).rejects.toMatchObject({ status: 403 });
  });
  it('refuses a selected source from another organization', async () => {
    const other = await harness.seed();
    await expect(admitAnaSelectedSources(h.db, { ...actor(), sourceIds: [other.capture] })).rejects.toMatchObject({ status: 403, code: 'ANA_SOURCE_ACCESS_DENIED' });
  });
  it('fails closed on missing and ambiguous program relationships', async () => {
    await share();
    await f.pg.query('DELETE FROM projects WHERE organization_id=$1', [f.org]);
    await expect(sources()).rejects.toMatchObject({ status: 409 });
    await f.pg.query('INSERT INTO projects(organization_id,regulatory_program_id) VALUES ($1,$2),($1,$2)', [f.org, f.program]);
    await expect(sources()).rejects.toMatchObject({ status: 409 });
  });
  it('keeps global public references readable without relabeling private records', async () => {
    await f.pg.query("UPDATE cre_evidence_sources SET organization_id=NULL,client_program_id=NULL,visibility_class='global_public' WHERE id=$1", [f.capture]);
    await expect(sources()).resolves.toBeUndefined();
  });
  it('rejects malformed IDs rather than dropping them into an unscoped turn', async () => {
    for (const id of ['12tail', true, 0, -1, 2_147_483_648]) {
      await expect(admitAnaSelectedSources(h.db, { ...actor(), sourceIds: [id] })).rejects.toMatchObject({ status: 400 });
    }
  });
});

describe('registered AnA file tools preserve interactive source access', () => {
  it.each([
    'inspect_uploaded_document', 'read_uploaded_document', 'ocr_document_pages', 'read_spreadsheet', 'search_large_document',
  ])('%s refuses a private upload before file content can reach the tool', async name => {
    const handler = getToolHandler(name);
    expect(handler).toBeDefined();
    const result = JSON.parse(await handler!({ file_id: f.upload, queries: ['study'], user_id: 42 },
      { organizationId: f.org, userId: 43, humanConfirmed: true }));
    expect(result.error).toMatch(/current access/);
    expect(h.readFile).not.toHaveBeenCalled();
  });
});

describe('direct upload IDs cannot bypass private-source admission', () => {
  it('refuses private upload metadata even to its uploader after project access was lost', async () => {
    await expect(loadUploadedFileMetadata([f.upload], f.org, { userId: 43 })).rejects.toMatchObject({ status: 403 });
    expect(h.readFile).not.toHaveBeenCalled();
  });
  it('refuses private upload bytes before the filesystem is read', async () => {
    await expect(loadUploadedFile(f.upload, f.org, { userId: 43 })).rejects.toMatchObject({ status: 403 });
    expect(h.readFile).not.toHaveBeenCalled();
  });
  it('uses the same canonical byte and integrity reader once current sharing permits it', async () => {
    await share();
    expect(await loadUploadedFile(f.upload, f.org, { userId: 43 })).toMatchObject({ buffer: bytes, integrity: 'verified' });
    expect(h.readFile).toHaveBeenCalledOnce();
  });
  it('restricts a conversation-only upload to its authenticated uploader', async () => {
    await f.pg.query('DELETE FROM cre_evidence_sources WHERE organization_id=$1', [f.org]);
    await f.pg.query('DELETE FROM concept2cure_artifacts WHERE organization_id=$1', [f.org]);
    await expect(uploads()).resolves.toBeUndefined();
    await expect(assertAnaUploadAccess(h.db, { organizationId: f.org, userId: 42, fileIds: [f.upload] })).rejects.toMatchObject({ status: 403 });
  });
  it('does not discard a historic private association after source deletion', async () => {
    await f.pg.query('UPDATE cre_evidence_sources SET deleted_at=now() WHERE id=$1', [f.capture]);
    await expect(uploads()).rejects.toMatchObject({ status: 403 });
  });
  it('refuses suspended membership and unavailable verification before bytes', async () => {
    await share(); await f.pg.query("UPDATE users SET status='suspended' WHERE id=43");
    await expect(loadUploadedFile(f.upload, f.org, { userId: 43 })).rejects.toMatchObject({ status: 403 });
    await expect(assertAnaUploadAccess({ query: async () => { throw new Error('connection unavailable'); } }, { ...actor(), fileIds: [f.upload] })).rejects.toMatchObject({ status: 503, code: 'ANA_SOURCE_ACCESS_UNAVAILABLE' });
    expect(h.readFile).not.toHaveBeenCalled();
  });
});
