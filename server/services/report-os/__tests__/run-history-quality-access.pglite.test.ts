import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ admit: vi.fn(), context: vi.fn(), fallback: vi.fn() }));
vi.mock('../../../db/runtime', () => ({ getPool: h.fallback }));
vi.mock('../project-access', () => ({ canAccessReportScope: h.admit, createReportQualityAccessContext: h.context }));

import { listReportRunHistory } from '../run-history';

let database: PGlite;
const query = vi.fn((text: string, params?: unknown[]) => database.query<Record<string, unknown>>(text, params));
const client = { query };
const actor = { userId: 20, role: 'member' };
const allowedProjects = [11];
const type = 'compliance.audit_assurance_pack';
const receipt = (key: string) => ({ schemaVersion: 1, records: [{ key, title: key, text: key,
  version: '1', sourceScope: 'project', native: { kind: 'qms_documents', id: key }, lifecycle: 'draft' }] });

beforeAll(async () => {
  database = new PGlite();
  await database.exec(`
    CREATE TABLE report_type_registry(type_id text PRIMARY KEY,label text NOT NULL);
    CREATE TABLE concept2cure_artifacts(artifact_id text,organization_id int,project_id int);
    CREATE TABLE c2c_submissions(id text,organization_id int,project_id int);
    CREATE TABLE report_program_groups(id int,organization_id int);
    CREATE TABLE report_program_group_projects(program_group_id int,project_id int,organization_id int);
    CREATE TABLE report_runs(
      id int PRIMARY KEY,run_uuid uuid NOT NULL,organization_id int NOT NULL,client_workspace_id int,
      scope_type text NOT NULL,scope_id text NOT NULL,report_type_id text NOT NULL,status text NOT NULL,
      requested_by int,dependency_summary json,blockers json,confidence int,freshness json,error text,
      started_at timestamp NOT NULL,completed_at timestamp,created_at timestamp NOT NULL,updated_at timestamp NOT NULL
    );
    INSERT INTO report_type_registry VALUES('${type}','Quality assurance'),('other','Other report');
  `);
  const rows = [
    { id: 1, label: 'Legacy report', type: 'other', day: 1 },
    { id: 2, label: 'Allowed Quality source', type, day: 2, qualityEvidence: receipt('allowed-record') },
    { id: 3, label: 'Denied Quality source title', type, day: 4, qualityEvidence: receipt('NATIVE-SECRET') },
    { id: 4, label: 'Embedded private Quality source', type: 'other', day: 5, qualityEvidence: receipt('EMBEDDED-SECRET') },
    { id: 5, label: 'Missing Quality manifest', type, day: 6 },
    { id: 6, label: 'Visible baseline', type: 'other', day: 3 },
    { id: 7, label: 'Foreign Quality source', type, day: 7, qualityEvidence: receipt('FOREIGN-SECRET'), org: 8 },
    { id: 8, label: 'Malformed embedded Quality', type: 'other', day: 8, qualityEvidence: null },
  ];
  for (const row of rows) {
    const summary = { scopeLabel: row.label, accessProjectIds: [11],
      ...('qualityEvidence' in row ? { domain: { qualityEvidence: row.qualityEvidence } } : {}) };
    await database.query(`INSERT INTO report_runs VALUES($1,$2,$3,71,'project','11',$4,'partial',10,$5,NULL,NULL,NULL,NULL,$6,$6,$6,$6)`,
      [row.id, `00000000-0000-4000-8000-${String(row.id).padStart(12, '0')}`, row.org ?? 7, row.type,
        JSON.stringify({ summary }), `2026-01-${String(row.day).padStart(2, '0')}`]);
  }
});
afterAll(async () => { await database?.close(); });
beforeEach(() => {
  query.mockClear(); h.fallback.mockReset(); h.admit.mockReset(); h.context.mockReset();
  h.context.mockImplementation(() => ({}));
  h.admit.mockImplementation(async (_org, _actor, run) => run.id === 2);
});

describe('native Quality admission in saved report history', () => {
  it('admits canonical whole reports before totals, ordering and pagination on the same executor', async () => {
    const history = await listReportRunHistory(7, { actor, accessibleProjectIds: allowedProjects, limit: 1 }, client);
    expect(history.data.map(row => row.id)).toEqual([6]);
    expect(history.meta).toEqual({ limit: 1, offset: 0, total: 3, hasMore: true });
    expect(h.admit.mock.calls.map(([, , run]) => run.id)).toEqual([2, 3, 4, 5, 8]);
    expect(h.context).toHaveBeenCalledExactlyOnceWith(client, { organizationId: 7, userId: actor.userId });
    const qualityContext = h.context.mock.results[0].value;
    expect(h.admit.mock.calls.every(call => call[4]?.qualityContext === qualityContext)).toBe(true);
    expect(h.admit).toHaveBeenCalledWith(7, actor, expect.objectContaining({
      id: 3, organizationId: 7, reportTypeId: type, scopeType: 'project', scopeId: '11',
      dependencySummary: { summary: expect.objectContaining({ scopeLabel: 'Denied Quality source title', domain: { qualityEvidence: receipt('NATIVE-SECRET') } }) },
    }), client, { accessibleIds: allowedProjects, qualityContext });
    expect(h.fallback).not.toHaveBeenCalled();
    expect(JSON.stringify(history)).not.toMatch(/NATIVE-SECRET|EMBEDDED-SECRET|FOREIGN-SECRET|Denied Quality/);
    const next = await listReportRunHistory(7, { actor, accessibleProjectIds: allowedProjects, limit: 1, offset: 1 }, client);
    expect(next.data.map(row => row.id)).toEqual([2]);
    expect(h.context).toHaveBeenCalledTimes(2);
    const nextContext = h.context.mock.results[1].value;
    expect(nextContext).not.toBe(qualityContext);
    expect(h.admit.mock.calls.slice(5).every(call => call[4]?.qualityContext === nextContext)).toBe(true);
  });

  it('excludes denied titles, exact IDs and type counts before search or page construction', async () => {
    const filters = { actor, accessibleProjectIds: allowedProjects };
    const search = await listReportRunHistory(7, { ...filters, search: 'Denied Quality source title', limit: 1 }, client);
    expect(search).toMatchObject({ data: [], meta: { total: 0, hasMore: false } });
    expect((await listReportRunHistory(7, { ...filters, runId: 3 }, client)).data).toEqual([]);
    const typed = await listReportRunHistory(7, { ...filters, reportTypeId: type }, client);
    expect(typed.data.map(row => row.id)).toEqual([2]);
    expect(typed.meta.total).toBe(1);
    const emptyPage = await listReportRunHistory(7, { ...filters, limit: 1, offset: 3 }, client);
    expect(emptyPage).toMatchObject({ data: [], meta: { total: 3, hasMore: false } });
  });

  it('denies Quality packs and embedded or malformed Quality payloads when no actor is supplied', async () => {
    h.admit.mockResolvedValue(true);
    const history = await listReportRunHistory(7, { accessibleProjectIds: allowedProjects }, client);
    expect(history.data.map(row => row.id)).toEqual([6, 1]);
    expect(history.meta.total).toBe(2);
    expect(h.admit).not.toHaveBeenCalled();
    expect(h.context).not.toHaveBeenCalled();
    expect((await listReportRunHistory(7, { runId: 2 }, client)).data).toEqual([]);
    expect((await listReportRunHistory(7, { runId: 1 }, client)).data[0]?.id).toBe(1);
  });

  it('propagates an unavailable admission decision without issuing a count or page query', async () => {
    h.admit.mockRejectedValueOnce(new Error('Native Quality authorization unavailable'));
    await expect(listReportRunHistory(7, { actor, accessibleProjectIds: allowedProjects, search: 'nonmatching' }, client))
      .rejects.toThrow('Native Quality authorization unavailable');
    expect(query.mock.calls.some(([sql]) => sql.includes('WITH matching_runs'))).toBe(false);
  });
});
