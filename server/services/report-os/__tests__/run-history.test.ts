import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../../db/runtime', () => ({ getPool: vi.fn() }));

import { listReportRunHistory } from '../run-history';
import { getAccessibleReportProjectIds, canAccessReportScope } from '../project-access';

let database: PGlite;

/** A real SQL executor: filters/order/pagination must work in PostgreSQL. */
const client = {
  query: (text: string, params?: unknown[]) => database.query<Record<string, unknown>>(text, params),
};

beforeAll(async () => {
  database = new PGlite();
  await database.exec(`
    CREATE TABLE report_type_registry (type_id text PRIMARY KEY, label text NOT NULL);
    CREATE TABLE projects(id int PRIMARY KEY, organization_id int, owner_id int, created_by_id int, settings json);
    CREATE TABLE project_visibility_settings(project_id int, organization_id int, visibility text);
    CREATE TABLE project_members(project_id int, organization_id int, user_id int, role text, status text);
    CREATE TABLE concept2cure_artifacts(id int, artifact_id text, organization_id int, project_id int);
    CREATE TABLE concept2cure_review_assignments(artifact_id int, organization_id int, reviewer_id int, status text);
    CREATE TABLE c2c_submissions(id text, organization_id int, project_id int);
    CREATE TABLE report_program_groups(id int, organization_id int);
    CREATE TABLE report_program_group_projects(program_group_id int, project_id int);
    INSERT INTO projects VALUES(11,7,10,10,'{}'),(12,7,10,10,'{}');
    INSERT INTO project_visibility_settings VALUES(11,7,'private'),(12,7,'org_public');
    CREATE TABLE report_runs (
      id serial PRIMARY KEY, run_uuid uuid NOT NULL, organization_id integer NOT NULL,
      client_workspace_id integer, scope_type text NOT NULL, scope_id text NOT NULL,
      report_type_id text NOT NULL, status text NOT NULL, requested_by integer,
      dependency_summary json, blockers json, confidence integer, freshness json,
      error text, started_at timestamp NOT NULL, completed_at timestamp,
      created_at timestamp NOT NULL, updated_at timestamp NOT NULL
    );
    INSERT INTO report_type_registry VALUES ('readiness.executive_digest', 'Executive Readiness Digest');
    INSERT INTO report_runs (
      run_uuid, organization_id, client_workspace_id, scope_type, scope_id,
      report_type_id, status, dependency_summary, confidence, started_at, completed_at,
      created_at, updated_at
    )
    SELECT ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      7, CASE WHEN n % 2 = 0 THEN 71 ELSE 72 END, 'project', CASE WHEN n = 1 THEN '12' ELSE '11' END,
      'readiness.executive_digest', 'computed',
      CASE WHEN n = 1 THEN '{"summary":{"scopeLabel":"Older 100%_report","domainScope":"organization","regulatory":{"regionCode":"EU","registryId":"ema","agency":"EMA"}}}'::json
        WHEN n = 2 THEN '{"summary":{"scopeLabel":"Current program","computedScope":"project","market":{"jurisdiction":"JP","registryId":"JP_MKT_APPROVAL","agency":"PMDA"}}}'::json
        ELSE '{"summary":{"scopeLabel":"Current program","computedScope":"project"}}'::json END,
      CASE WHEN n = 125 THEN NULL ELSE n % 5 END,
      timestamp '2026-01-01' + n * interval '1 day',
      CASE WHEN n = 125 THEN NULL ELSE timestamp '2026-01-01' + n * interval '1 day' END,
      timestamp '2026-01-01' + n * interval '1 day',
      timestamp '2026-01-01' + n * interval '1 day'
    FROM generate_series(1, 125) AS n;
    INSERT INTO report_runs (
      run_uuid, organization_id, client_workspace_id, scope_type, scope_id,
      report_type_id, status, dependency_summary, started_at, created_at, updated_at
    ) VALUES (
      '00000000-0000-4000-8000-000000000999', 8, 71, 'project', '11',
      'readiness.executive_digest', 'final',
      '{"summary":{"scopeLabel":"Older 100%_report foreign"}}',
      '2027-01-01', '2027-01-01', '2027-01-01'
    );
  `);
});

afterAll(async () => { await database?.close(); });

describe('saved report history', () => {
  it('applies the canonical private-project policy before count and pagination', async () => {
    const ids = await getAccessibleReportProjectIds(7, { userId: 20, role: 'member' }, client);
    expect(ids).toEqual([12]);
    const history = await listReportRunHistory(7, { accessibleProjectIds: ids, limit: 1 }, client);
    expect(history.data.map(row => row.id)).toEqual([1]);
    expect(history.meta).toEqual({ limit: 1, offset: 0, total: 1, hasMore: false });
    expect((await listReportRunHistory(7, { runId: 125, accessibleProjectIds: ids }, client)).data).toEqual([]);
  });
  it('uses current sharing membership and pending review assignments with the existing manager policy', async () => {
    const actor = { userId: 20, role: 'viewer' };
    await database.exec("INSERT INTO project_members VALUES(11,7,20,'use','active')");
    expect(await getAccessibleReportProjectIds(7, actor, client)).toEqual([11,12]);
    await database.exec("UPDATE project_members SET status='revoked' WHERE user_id=20");
    expect(await getAccessibleReportProjectIds(7, actor, client)).toEqual([12]);
    await database.exec("INSERT INTO concept2cure_artifacts VALUES(1,'private-doc',7,11); INSERT INTO concept2cure_review_assignments VALUES(1,7,20,'pending')");
    expect(await getAccessibleReportProjectIds(7, actor, client)).toEqual([11,12]);
    await database.exec("UPDATE concept2cure_review_assignments SET status='completed'");
    expect(await getAccessibleReportProjectIds(7, { userId: 20, role: 'manager' }, client)).toEqual([11,12]);
    expect(await getAccessibleReportProjectIds(7, actor, client)).toEqual([12]);
  });
  it('keeps historical program access bound to recorded members when current membership changes', async () => {
    await database.exec("INSERT INTO report_program_groups VALUES(1,7); INSERT INTO report_program_group_projects VALUES(1,12)");
    const actor = { userId: 20, role: 'member' };
    const saved = { scopeType: 'program', scopeId: '1', dependencySummary: { summary: { accessProjectIds: [11,12] } } };
    const publicSaved = { ...saved, dependencySummary: { summary: { accessProjectIds: [12] } } };
    try {
      // Removing the private member from a live group cannot reveal old output.
      expect(await canAccessReportScope(7, actor, { scopeType: 'program', scopeId: '1' }, client)).toBe(true);
      expect(await canAccessReportScope(7, actor, saved, client)).toBe(false);
      await database.exec("INSERT INTO report_program_group_projects VALUES(1,11)");
      // Adding it later cannot withdraw access to output computed only on public project12.
      expect(await canAccessReportScope(7, actor, publicSaved, client)).toBe(true);
      expect(await canAccessReportScope(7, actor, { ...saved, dependencySummary: {} }, client)).toBe(false);
      expect(await canAccessReportScope(7, { userId:20, role:'manager' }, { ...saved, dependencySummary: {} }, client)).toBe(true);
      await database.exec(`UPDATE report_runs SET scope_type='program',scope_id='1',dependency_summary='{"summary":{"accessProjectIds":[11,12]}}' WHERE id=125`);
      expect((await listReportRunHistory(7, { runId:125, accessibleProjectIds:[12] }, client)).data).toEqual([]);
      await database.exec(`UPDATE report_runs SET dependency_summary='{"summary":{"accessProjectIds":[12]}}' WHERE id=125`);
      expect((await listReportRunHistory(7, { runId:125, accessibleProjectIds:[12] }, client)).data[0]?.id).toBe(125);
      await database.exec("UPDATE report_runs SET dependency_summary='{}' WHERE id=125");
      expect((await listReportRunHistory(7, { runId:125, accessibleProjectIds:[11,12] }, client)).data).toEqual([]);
      expect((await listReportRunHistory(7, { runId:125, accessibleProjectIds:[11,12], allowUnboundProgramReports:true }, client)).data[0]?.id).toBe(125);
    } finally {
      await database.exec(`DELETE FROM report_program_group_projects WHERE program_group_id=1; DELETE FROM report_program_groups WHERE id=1;
        UPDATE report_runs SET scope_type='project',scope_id='11',dependency_summary='{"summary":{"scopeLabel":"Current program","computedScope":"project"}}' WHERE id=125`);
    }
  });
});

describe('saved report history query semantics', () => {
  it('searches and exposes the regional engine market metadata', async () => {
    const history = await listReportRunHistory(7, { search: 'PMDA' }, client);
    expect(history.data.map(row => row.id)).toEqual([2]);
    expect(history.data[0]).toMatchObject({ regionCode: 'JP', registryId: 'JP_MKT_APPROVAL', agency: 'PMDA' });
  });
  it('finds a canonical run ID only inside the authenticated organization', async () => {
    expect((await listReportRunHistory(7, { runId: 1, limit: 1 }, client)).data[0]).toMatchObject({ id: 1, organizationId: 7 });
    expect((await listReportRunHistory(8, { runId: 1, limit: 1 }, client)).data).toEqual([]);
  });
  it('searches all tenant records before paging, including a match older than the latest 100', async () => {
    const result = await listReportRunHistory(7, { search: '100%_report', limit: 1 }, client);
    expect(result.data.map(row => row.id)).toEqual([1]);
    expect(result.data[0]).toMatchObject({
      reportTypeLabel: 'Executive Readiness Digest', regionCode: 'EU', registryId: 'ema', agency: 'EMA',
      scopeLabel: 'Older 100%_report', computedScope: 'organization', organizationId: 7,
    });
    expect(result.meta).toEqual({ limit: 1, offset: 0, total: 1, hasMore: false });
  });

  it('keeps search wildcards literal and searches joined catalog labels', async () => {
    expect((await listReportRunHistory(7, { search: '100%Xreport' }, client)).data).toEqual([]);
    expect((await listReportRunHistory(7, { search: 'executive READINESS' }, client)).meta.total).toBe(125);
    expect((await listReportRunHistory(7, { search: "%' OR true --" }, client)).meta.total).toBe(0);
  });

  it('filters scope/status/type/workspace before totals and preserves organization isolation', async () => {
    const result = await listReportRunHistory(7, {
      scopeType: 'project', scopeId: '11', status: 'computed',
      reportTypeId: 'readiness.executive_digest', clientWorkspaceId: 71,
      limit: 10, offset: 10,
    }, client);
    expect(result.meta).toEqual({ limit: 10, offset: 10, total: 62, hasMore: true });
    expect(result.data).toHaveLength(10);
    expect(result.data.every(row => row.organizationId === 7 && row.clientWorkspaceId === 71)).toBe(true);
    expect((await listReportRunHistory(7, { status: 'final' }, client)).meta.total).toBe(0);
    expect((await listReportRunHistory(7, { scopeId: 'other' }, client)).meta.total).toBe(0);
    expect((await listReportRunHistory(7, { reportTypeId: 'other' }, client)).meta.total).toBe(0);
  });

  it('sorts the full set before paging with deterministic ties and nulls last', async () => {
    const ascending = await listReportRunHistory(7, { sortBy: 'confidence', sortOrder: 'asc', limit: 3 }, client);
    expect(ascending.data.map(row => row.id)).toEqual([5, 10, 15]);
    const descending = await listReportRunHistory(7, { sortBy: 'confidence', sortOrder: 'desc', limit: 3 }, client);
    expect(descending.data.map(row => row.id)).toEqual([124, 119, 114]);
    const last = await listReportRunHistory(7, { sortBy: 'completedAt', sortOrder: 'asc', limit: 5, offset: 120 }, client);
    expect(last.data.map(row => row.id)).toEqual([121, 122, 123, 124, 125]);
    expect(last.meta.hasMore).toBe(false);
    expect(ascending.data[0].createdAt).toBeInstanceOf(Date);
    expect(ascending.data[0].computedScope).toBe('project');
  });

  it('returns an accurate total even when the requested page is empty', async () => {
    const result = await listReportRunHistory(7, { limit: 10, offset: 130 }, client);
    expect(result.data).toEqual([]);
    expect(result.meta).toEqual({ limit: 10, offset: 130, total: 125, hasMore: false });
  });

  it('rejects invalid tenant and pagination without issuing a query', async () => {
    const query = vi.fn();
    await expect(listReportRunHistory(0, {}, { query })).rejects.toThrow('organization');
    await expect(listReportRunHistory(7, { offset: -1 }, { query })).rejects.toThrow('offset');
    await expect(listReportRunHistory(7, { limit: 501 }, { query })).rejects.toThrow('limit');
    expect(query).not.toHaveBeenCalled();
  });
});
