import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ collect: vi.fn(), fallback: vi.fn() }));
vi.mock('../../../db', () => ({ db: {}, pool: { query: h.fallback }, getPool: () => ({ query: h.fallback }) }));
vi.mock('../../../db/runtime', () => ({ getPool: () => ({ query: h.fallback }) }));
vi.mock('../../qms/project-evidence', () => ({ readQualityProjectEvidence: h.collect,
  QualityEvidenceNotReadable: class extends Error { readonly status = 404; },
}));

import { qualityFamilyQuery } from '../../qms/project-evidence-queries';
import { listReportRunHistory } from '../run-history';

const PROGRAM = '00000000-0000-4000-8000-000000000011';
const TYPE = 'compliance.audit_assurance_pack';
const actor = { userId: 5, role: 'member' };
let pg: PGlite;
let programReads = 0;
let deleteBetweenReports = false;
const query = vi.fn(async (sql: string, args?: unknown[]) => {
  if (sql.startsWith('SELECT id::text FROM regulatory_programs')) {
    programReads += 1;
    if (deleteBetweenReports && programReads === 3) await pg.exec('DELETE FROM quality_management_plans WHERE id=17');
  }
  return pg.query<Record<string, unknown>>(sql, args);
});
const q = { query };
function snapshot(title: string, id = 17) {
  const native = { kind: 'quality_management_plans', id: String(id) };
  return { key: `quality:quality_management_plans:${id}`, title, version: '1', lifecycle: 'active',
    sourceScope: 'organization' as const, native,
    text: JSON.stringify({ evidenceKind: 'qms', sourceScope: 'organization', native, data: { title } }) };
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE organizations(id int,status text); CREATE TABLE users(id int,status text);
    CREATE TABLE organization_users(organization_id int,user_id int,role text);
    CREATE TABLE regulatory_programs(id uuid PRIMARY KEY,organization_id int,deleted_at timestamp);
    CREATE TABLE projects(id int,organization_id int,regulatory_program_id uuid,client_workspace_id int,status text,owner_id int,created_by_id int,settings json);
    CREATE TABLE project_visibility_settings(project_id int,organization_id int,visibility text);
    CREATE TABLE project_members(project_id int,organization_id int,user_id int,role text,status text);
    CREATE TABLE concept2cure_artifacts(id int,artifact_id text,organization_id int,project_id int);
    CREATE TABLE concept2cure_review_assignments(artifact_id int,organization_id int,reviewer_id int,status text);
    CREATE TABLE c2c_submissions(id text,organization_id int,project_id int);
    CREATE TABLE report_program_groups(id int,organization_id int);
    CREATE TABLE report_program_group_projects(program_group_id int,organization_id int,project_id int);
    CREATE TABLE report_type_registry(type_id text,label text);
    CREATE TABLE quality_management_plans(id int,organization_id int,client_workspace_id int,name text,deleted_at timestamptz);
    CREATE TABLE report_runs(id int,run_uuid uuid,organization_id int,client_workspace_id int,scope_type text,scope_id text,
      report_type_id text,status text,requested_by int,dependency_summary json,blockers json,confidence int,freshness json,error text,
      started_at timestamp,completed_at timestamp,created_at timestamp,updated_at timestamp);
    INSERT INTO organizations VALUES(7,'active'); INSERT INTO users VALUES(5,'active');
    INSERT INTO organization_users VALUES(7,5,'member'); INSERT INTO regulatory_programs VALUES('${PROGRAM}',7,NULL);
    INSERT INTO projects VALUES(11,7,'${PROGRAM}',71,'active',5,5,'{}');
    INSERT INTO project_visibility_settings VALUES(11,7,'private');
    INSERT INTO report_type_registry VALUES('${TYPE}','Quality assurance');
  `);
  for (const id of [1, 2]) {
    const title = id === 1 ? 'First admitted Quality facts' : 'SECOND-PRIVATE-QMP-TEXT';
    const summary = { accessProjectIds: [11], scopeLabel: title,
      domain: { qualityEvidence: { schemaVersion: 1, records: [snapshot(title)] } } };
    await pg.query(`INSERT INTO report_runs VALUES($1,$2,7,71,'project','11',$3,'partial',5,$4,NULL,NULL,NULL,NULL,$5,$5,$5,$5)`,
      [id, `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`, TYPE, JSON.stringify({ summary }), `2026-01-0${id}`]);
  }
});
afterAll(async () => { await pg?.close(); });
beforeEach(async () => {
  programReads = 0; deleteBetweenReports = false; query.mockClear(); h.fallback.mockReset(); h.collect.mockReset();
  await pg.exec("DELETE FROM quality_management_plans; INSERT INTO quality_management_plans VALUES(17,7,71,'Current QMP facts',NULL)");
  h.collect.mockImplementation(async (executor: typeof q, input: { organizationId: number; programId: string | null }) => {
    const statement = qualityFamilyQuery('quality_management_plans', { organizationId: input.organizationId,
      programId: input.programId, workspaceId: input.programId === PROGRAM ? 71 : null, documentIds: [], trainingVersions: '[]',
      changeIds: [], roleIds: [], planIds: [], limit: 1001 });
    if (!statement) throw new Error('The existing QMP query must be available.');
    return (await executor.query(statement.sql, statement.args)).rows.map(row => snapshot(String(row.name), Number(row.id)));
  });
});

describe('native source freshness across a whole saved-history read', () => {
  it('admits historical facts while the shared native QMP remains currently readable', async () => {
    const history = await listReportRunHistory(7, { actor, accessibleProjectIds: [11] }, q);
    expect(history.data.map(row => row.id)).toEqual([2, 1]);
    expect(history.meta.total).toBe(2);
    expect(h.fallback).not.toHaveBeenCalled();
  });

  it('excludes the second whole report and its count after native deletion between report admissions', async () => {
    deleteBetweenReports = true;
    const history = await listReportRunHistory(7, { actor, accessibleProjectIds: [11] }, q);
    expect(programReads).toBeGreaterThanOrEqual(3);
    expect((await pg.query('SELECT id FROM quality_management_plans')).rows).toEqual([]);
    expect(history.data.map(row => row.id)).toEqual([1]);
    expect(history.meta).toEqual({ limit: 100, offset: 0, total: 1, hasMore: false });
    expect(JSON.stringify(history)).not.toContain('SECOND-PRIVATE-QMP-TEXT');
    expect(h.fallback).not.toHaveBeenCalled();
  });
});
