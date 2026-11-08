/** A retained report is not a new grant to its embedded Quality source documents. */
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ authorize: vi.fn(), collect: vi.fn(), fallback: vi.fn() }));
vi.mock('../../../db', () => ({ db: {}, getPool: () => ({ query: h.fallback }), pool: { query: h.fallback } }));
vi.mock('../../qms/project-evidence', () => ({ authorizeQualityEvidenceSnapshot: h.authorize, readQualityProjectEvidence: h.collect,
  QualityEvidenceNotReadable: class extends Error { readonly code = 'QUALITY_RECORD_NOT_AVAILABLE'; readonly status = 404; },
}));
import { QualityEvidenceNotReadable } from '../../qms/project-evidence';
import { canAccessReportScope, createReportQualityAccessContext } from '../project-access';
import { qualityFamilyQuery } from '../../qms/project-evidence-queries';

const A = '00000000-0000-4000-8000-000000000011', B = '00000000-0000-4000-8000-000000000012';
const DOC = '00000000-0000-4000-8000-000000000099';
const actor = { userId: 5, role: 'member' };
let pg: PGlite;
const q = { query: vi.fn((sql: string, args?: unknown[]) => pg.query<Record<string, unknown>>(sql, args)) };
function snapshot(id: string, sourceScope: 'project' | 'organization' = 'project', programId = A) {
  const native = { kind: 'qms_documents', id, ...(sourceScope === 'project' ? { authoringDocumentId: DOC } : {}) };
  return { key: `quality:qms_documents:${id}:working`, title: 'Private procedure title', version: '2', lifecycle: 'draft', sourceScope, native,
    text: JSON.stringify({ evidenceKind: 'qms', sourceScope, native, ...(sourceScope === 'project' ? { programId } : {}), data: { content: 'Private procedure text' } }) };
}
const saved = (records = [snapshot('2')], scopeType = 'project', scopeId = '11') => ({ organizationId: 7, reportTypeId: 'compliance.audit_assurance_pack',
  scopeType, scopeId, dependencySummary: { summary: { accessProjectIds: scopeType === 'project' ? [Number(scopeId)] : [], domain: { qualityEvidence: { schemaVersion: 1, records } } } } });

function registerSnapshot(kind: string, row: Record<string, unknown>) {
  const sourceScope = kind === 'qms_change_controls' && row.program_id ? 'project' : 'organization';
  const native = { kind, id: String(row.id) };
  return { ...snapshot(native.id, sourceScope), key: `quality:${kind}:${native.id}`, native,
    title: String(row.name ?? row.title ?? 'Retained Quality finding'),
    text: JSON.stringify({ evidenceKind: 'qms', sourceScope, native,
      ...(sourceScope === 'project' ? { programId: row.program_id } : {}), data: { record: row } }) };
}

/** Reuse the collector's literal SQL with real native rows and workspace values. */
async function readRegisterFixtures(reader: typeof q, input: { organizationId: number; programId: string | null }) {
  const workspace = input.programId ? (await reader.query('SELECT client_workspace_id FROM projects WHERE regulatory_program_id=$1::uuid AND organization_id=$2',
    [input.programId, input.organizationId])).rows[0]?.client_workspace_id : null;
  const records: ReturnType<typeof registerSnapshot>[] = [];
  for (const kind of ['quality_management_plans', 'qms_change_controls']) {
    const query = qualityFamilyQuery(kind, { organizationId: input.organizationId, programId: input.programId,
      workspaceId: typeof workspace === 'number' ? workspace : null, documentIds: [], trainingVersions: '[]', changeIds: [], roleIds: [], planIds: [], limit: 1001 });
    if (query) for (const row of (await reader.query(query.sql, query.args)).rows) records.push(registerSnapshot(kind, row));
  }
  return records;
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE TABLE organizations(id int,status text); CREATE TABLE users(id int,status text);
    CREATE TABLE organization_users(organization_id int,user_id int,role text);
    CREATE TABLE regulatory_programs(id uuid PRIMARY KEY,organization_id int,deleted_at timestamp);
    CREATE TABLE projects(id int,organization_id int,regulatory_program_id uuid,client_workspace_id int,status text,owner_id int,created_by_id int,settings json);
    CREATE TABLE project_visibility_settings(project_id int,organization_id int,visibility text);
    CREATE TABLE project_members(project_id int,organization_id int,user_id int,role text,status text);
    CREATE TABLE concept2cure_artifacts(id int,artifact_id text,organization_id int,project_id int);
    CREATE TABLE concept2cure_review_assignments(artifact_id int,organization_id int,reviewer_id int,status text);
    CREATE TABLE report_runs(id int,run_uuid uuid,organization_id int,scope_type text,scope_id text,report_type_id text,dependency_summary json);
    CREATE TABLE authoring_documents(id uuid,tenant_id int,client_program_id uuid,status text,created_by text);
    CREATE TABLE qms_documents(id int,organization_id int,authoring_document_id uuid,metadata jsonb,deleted_at timestamptz);
    CREATE TABLE quality_management_plans(id int,organization_id int,client_workspace_id int,name text,deleted_at timestamptz);
    CREATE TABLE qms_change_controls(id int,organization_id int,program_id uuid,title text,deleted_at timestamptz);
    CREATE TABLE doc_permissions(tenant_id int,doc_id uuid,principal_id text,email text,role text,section_id uuid,revoked_at timestamptz,valid_from timestamptz,valid_until timestamptz);
    INSERT INTO organizations VALUES(7,'active'); INSERT INTO users VALUES(5,'active'),(6,'active');
    INSERT INTO organization_users VALUES(7,5,'member'),(7,6,'member');
    INSERT INTO regulatory_programs VALUES('${A}',7,NULL),('${B}',7,NULL);
    INSERT INTO projects VALUES(11,7,'${A}',71,'active',5,5,'{}'),(12,7,'${B}',72,'active',6,6,'{}');
    INSERT INTO authoring_documents VALUES('${DOC}',7,'${A}','draft','6');
    INSERT INTO qms_documents VALUES(1,7,'${DOC}','{}',NULL);
    INSERT INTO doc_permissions VALUES(7,'${DOC}','5',NULL,'VIEWER',NULL,NULL,'2020-01-01',NULL);
    INSERT INTO project_visibility_settings VALUES(11,7,'private'),(12,7,'private');`);
});
beforeEach(async () => {
  vi.clearAllMocks(); await pg.exec('DELETE FROM report_runs; DELETE FROM quality_management_plans; DELETE FROM qms_change_controls');
  h.authorize.mockImplementation(async (_q, _input, native) => { if (native.id === '2') throw new QualityEvidenceNotReadable(); });
  h.collect.mockResolvedValue([]);
});
afterAll(async () => { await pg?.close(); });

describe('current exact-object admission for retained Quality reports', () => {
  it('denies the whole report when project access remains but one authored source is no longer readable', async () => {
    expect(await canAccessReportScope(7, actor, saved([snapshot('1'), snapshot('2')]), q)).toBe(false);
    expect(h.authorize).toHaveBeenCalledWith(q, { organizationId: 7, userId: 5, programId: A }, snapshot('2').native);
    expect(h.fallback).not.toHaveBeenCalled();
  });

  it('rechecks exact retained authoring parents, deduplicates repeated receipts, and admits a fully authorized report', async () => {
    const receipt = snapshot('1');
    expect(await canAccessReportScope(7, actor, saved([receipt, receipt]), q)).toBe(true);
    expect(h.authorize).toHaveBeenCalledExactlyOnceWith(q, { organizationId: 7, userId: 5, programId: A }, receipt.native);
  });

  it('does not bypass native authorization for organization-only account output', async () => {
    expect(await canAccessReportScope(7, actor, saved([snapshot('2', 'organization')], 'account', '7'), q)).toBe(false);
    expect(h.authorize).toHaveBeenCalledWith(q, { organizationId: 7, userId: 5, programId: null }, snapshot('2', 'organization').native);
  });

  it('rejects a wrong project binding, inconsistent receipt or missing native manifest', async () => {
    expect(await canAccessReportScope(7, actor, saved([snapshot('1', 'project', B)]), q)).toBe(false);
    const mismatched = { ...snapshot('1'), native: snapshot('2').native };
    expect(await canAccessReportScope(7, actor, saved([mismatched]), q)).toBe(false);
    expect(await canAccessReportScope(7, actor, { ...saved(), dependencySummary: {} }, q)).toBe(false);
    expect(h.authorize).not.toHaveBeenCalled();
  });

  it('propagates unavailable source admission and refuses a membership change during receipt authorization', async () => {
    h.authorize.mockRejectedValueOnce(new Error('Current source admission unavailable'));
    await expect(canAccessReportScope(7, actor, saved([snapshot('1')]), q)).rejects.toThrow('Current source admission unavailable');
    h.authorize.mockImplementationOnce(async () => { await pg.exec("UPDATE organization_users SET role='viewer' WHERE user_id=5"); });
    try { await expect(canAccessReportScope(7, actor, saved([snapshot('1')]), q)).rejects.toMatchObject({ code: 'PROJECT_ACCESS_CHANGED' }); }
    finally { await pg.exec("UPDATE organization_users SET role='member' WHERE user_id=5"); }
  });

  it('loads canonical receipts for stripped bundle items and verifies the exact stored run identity', async () => {
    const row = saved();
    await pg.query('INSERT INTO report_runs VALUES($1,$2,$3,$4,$5,$6,$7)', [9, DOC, 7, row.scopeType, row.scopeId, row.reportTypeId, JSON.stringify(row.dependencySummary)]);
    const item = { organizationId: 7, runId: 9, runUuid: DOC, reportTypeId: row.reportTypeId, scopeType: row.scopeType, scopeId: row.scopeId, accessProjectIds: [11], recorded: true };
    expect(await canAccessReportScope(7, actor, item, q)).toBe(false);
    expect(h.authorize).toHaveBeenCalled();
    h.authorize.mockResolvedValue(undefined);
    expect(await canAccessReportScope(7, actor, item, q)).toBe(true);
    expect(await canAccessReportScope(7, actor, { ...item, runUuid: A }, q)).toBe(false);
  });

  it('batches native-register admission once per actor/program and keeps historical facts without matching current text', async () => {
    const audit = (id: string) => {
      const native = { kind: 'qms_internal_audits', id };
      return { ...snapshot(id, 'organization'), native,
        text: JSON.stringify({ evidenceKind: 'qms', sourceScope: 'organization', native, data: { status: 'historical' } }) };
    };
    const receipts = [audit('17'), audit('18')];
    h.collect.mockResolvedValue(receipts.map(row => ({ ...row, text: 'Current facts changed since the saved report' })));
    expect(await canAccessReportScope(7, actor, saved([...receipts, receipts[0]], 'account', '7'), q)).toBe(true);
    expect(h.collect).toHaveBeenCalledExactlyOnceWith(q, { organizationId: 7, userId: 5, programId: null });
    expect(h.authorize).not.toHaveBeenCalled();
    h.collect.mockResolvedValue([receipts[0]]);
    expect(await canAccessReportScope(7, actor, saved(receipts, 'account', '7'), q)).toBe(false);
  });

  it('rechecks authored bindings per report in an executor/actor-bound read, and refuses forged or rebound contexts', async () => {
    const qualityContext = createReportQualityAccessContext(q, { organizationId: 7, userId: 5 });
    const scope = saved([snapshot('1')]);
    expect(await canAccessReportScope(7, actor, scope, q, { qualityContext })).toBe(true);
    expect(await canAccessReportScope(7, actor, scope, q, { qualityContext })).toBe(true);
    expect(h.authorize).toHaveBeenCalledTimes(2);
    await expect(canAccessReportScope(7, actor, scope, { query: q.query }, { qualityContext })).rejects.toThrow(/executor-bound/);
    await expect(canAccessReportScope(7, actor, scope, q, { qualityContext: { kind: 'report-quality-access' } })).rejects.toThrow(/executor-bound/);
    const account = saved([snapshot('1', 'organization')], 'account', '7');
    await expect(canAccessReportScope(7, { userId: 6, role: 'member' }, account, q, { qualityContext })).rejects.toThrow(/executor-bound/);
    h.authorize.mockRejectedValueOnce(new QualityEvidenceNotReadable());
    expect(await canAccessReportScope(7, actor, scope, q, { qualityContext: createReportQualityAccessContext(q, { organizationId: 7, userId: 5 }) })).toBe(false);
  });

  it('refuses a current role change rather than reusing a previous authored-object grant in the same read', async () => {
    const qualityContext = createReportQualityAccessContext(q, { organizationId: 7, userId: 5 });
    expect(await canAccessReportScope(7, actor, saved([snapshot('1')]), q, { qualityContext })).toBe(true);
    await pg.exec("UPDATE organization_users SET role='viewer' WHERE user_id=5");
    try { await expect(canAccessReportScope(7, actor, saved([snapshot('1')]), q, { qualityContext })).rejects.toMatchObject({ code: 'REPORT_SOURCE_ACCESS_CHANGED' }); }
    finally { await pg.exec("UPDATE organization_users SET role='member' WHERE user_id=5"); }
  });

  it('retains organization ownership while admitting a workspace-bound QMP through its project context, without caching that grant for another workspace', async () => {
    const native = { kind: 'quality_management_plans', id: '17' };
    const receipt = { ...snapshot('17', 'organization'), native,
      text: JSON.stringify({ evidenceKind: 'qms', sourceScope: 'organization', native, data: { client_workspace_id: 71 } }) };
    h.collect.mockImplementation(async (_q, input) => input.programId === A ? [receipt] : []);
    const qualityContext = createReportQualityAccessContext(q, { organizationId: 7, userId: 5 });
    expect(await canAccessReportScope(7, actor, saved([receipt]), q, { qualityContext })).toBe(true);
    expect(h.collect).toHaveBeenCalledWith(q, { organizationId: 7, userId: 5, programId: A });
    await pg.exec("INSERT INTO project_members VALUES(12,7,5,'use','active')");
    try { expect(await canAccessReportScope(7, actor, saved([receipt], 'project', '12'), q, { qualityContext })).toBe(false); }
    finally { await pg.exec('DELETE FROM project_members WHERE project_id=12 AND user_id=5'); }
  });

  it('admits organization account context through the union of current admitted project workspaces and explicit organization context', async () => {
    const native = { kind: 'qc_deviations', id: '18' };
    const receipt = { ...snapshot('18', 'organization'), native,
      text: JSON.stringify({ evidenceKind: 'qms', sourceScope: 'organization', native, data: { client_workspace_id: 71 } }) };
    h.collect.mockImplementation(async (_q, input) => input.programId === A ? [receipt] : []);
    expect(await canAccessReportScope(7, actor, saved([receipt], 'account', '7'), q)).toBe(true);
  });
});

describe('current authored-object grants within batched report reads', () => {
  it('rechecks real authored-object grants across saved reports in the same batched read after revocation', async () => {
    const actual = await vi.importActual<typeof import('../../qms/project-evidence')>('../../qms/project-evidence');
    h.authorize.mockImplementation(async (...args: Parameters<typeof actual.authorizeQualityEvidenceSnapshot>) => {
      try { await actual.authorizeQualityEvidenceSnapshot(...args); }
      catch (error) { if (error instanceof actual.QualityEvidenceNotReadable) throw new QualityEvidenceNotReadable(); throw error; }
    });
    const qualityContext = createReportQualityAccessContext(q, { organizationId: 7, userId: 5 });
    expect(await canAccessReportScope(7, actor, saved([snapshot('1')]), q, { qualityContext })).toBe(true);
    await pg.exec('UPDATE doc_permissions SET revoked_at=NOW()');
    try { expect(await canAccessReportScope(7, actor, saved([snapshot('1')]), q, { qualityContext })).toBe(false); }
    finally { await pg.exec('UPDATE doc_permissions SET revoked_at=NULL'); }
  });
});

describe('current native register admission within batched report reads', () => {
  it.each(['plan removed', 'change retired'])('refuses the whole later report when its %s without any role or anchor change', async change => {
    await pg.query('INSERT INTO quality_management_plans VALUES(17,7,71,$1,NULL)', ['Historical plan title']);
    await pg.query('INSERT INTO qms_change_controls VALUES(21,7,$1,$2,NULL)', [A, 'Historical change title']);
    h.collect.mockImplementation(readRegisterFixtures);
    const receipt = registerSnapshot(change === 'plan removed' ? 'quality_management_plans' : 'qms_change_controls',
      change === 'plan removed' ? { id: 17, name: 'Historical plan title' } : { id: 21, title: 'Historical change title', program_id: A });
    const scope = saved([receipt, receipt]);
    const original = JSON.stringify(scope);
    const qualityContext = createReportQualityAccessContext(q, { organizationId: 7, userId: 5 });
    expect(await canAccessReportScope(7, actor, scope, q, { qualityContext })).toBe(true);
    expect(h.collect).toHaveBeenCalledTimes(1);
    await pg.exec(change === 'plan removed' ? 'DELETE FROM quality_management_plans WHERE id=17'
      : 'UPDATE qms_change_controls SET deleted_at=NOW() WHERE id=21');
    expect(await canAccessReportScope(7, actor, scope, q, { qualityContext })).toBe(false);
    expect(h.collect).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(scope)).toBe(original);
  });

  it.each(['native workspace', 'project workspace'])('rechecks the %s for the same admitted program in a later report', async change => {
    await pg.query('INSERT INTO quality_management_plans VALUES(17,7,71,$1,NULL)', ['Workspace 71 private finding']);
    h.collect.mockImplementation(readRegisterFixtures);
    const scope = saved([registerSnapshot('quality_management_plans', { id: 17, name: 'Workspace 71 private finding' })]);
    const qualityContext = createReportQualityAccessContext(q, { organizationId: 7, userId: 5 });
    expect(await canAccessReportScope(7, actor, scope, q, { qualityContext })).toBe(true);
    await pg.exec(change === 'native workspace' ? 'UPDATE quality_management_plans SET client_workspace_id=72 WHERE id=17'
      : 'UPDATE projects SET client_workspace_id=72 WHERE id=11');
    try { expect(await canAccessReportScope(7, actor, scope, q, { qualityContext })).toBe(false); }
    finally { await pg.exec('UPDATE projects SET client_workspace_id=71 WHERE id=11'); }
  });

  it('recollects each report once while retaining historical text when the same native record remains admitted', async () => {
    await pg.query('INSERT INTO quality_management_plans VALUES(17,7,71,$1,NULL)', ['Original finding']);
    h.collect.mockImplementation(readRegisterFixtures);
    const scope = saved([registerSnapshot('quality_management_plans', { id: 17, name: 'Original finding' })]);
    const original = JSON.stringify(scope);
    const qualityContext = createReportQualityAccessContext(q, { organizationId: 7, userId: 5 });
    expect(await canAccessReportScope(7, actor, scope, q, { qualityContext })).toBe(true);
    await pg.query('UPDATE quality_management_plans SET name=$1 WHERE id=17', ['Updated current finding']);
    expect(await canAccessReportScope(7, actor, scope, q, { qualityContext })).toBe(true);
    expect(h.collect).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(scope)).toBe(original);
  });

  it('does not reuse a native grant after the tracking anchor no longer admits its saved project binding', async () => {
    await pg.query('INSERT INTO qms_change_controls VALUES(21,7,$1,$2,NULL)', [A, 'Historical project finding']);
    h.collect.mockImplementation(readRegisterFixtures);
    const scope = saved([registerSnapshot('qms_change_controls', { id: 21, title: 'Historical project finding', program_id: A })]);
    const qualityContext = createReportQualityAccessContext(q, { organizationId: 7, userId: 5 });
    expect(await canAccessReportScope(7, actor, scope, q, { qualityContext })).toBe(true);
    await pg.exec("UPDATE projects SET status='deleted' WHERE id=11");
    try { expect(await canAccessReportScope(7, actor, scope, q, { qualityContext })).toBe(false); }
    finally { await pg.exec("UPDATE projects SET status='active' WHERE id=11"); }
  });
});
