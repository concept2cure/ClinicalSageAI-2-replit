/** Actual current actor, private-project policy and unique program anchors precede native reads. */
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ collect: vi.fn(), fallback: vi.fn() }));
vi.mock('../../../db', () => ({ db: {}, pool: { query: h.fallback }, getPool: () => ({ query: h.fallback }) }));
vi.mock('../../qms/project-evidence', () => ({ readQualityProjectEvidence: h.collect,
  QualityEvidenceUnavailable: class extends Error { constructor(message = 'Quality evidence is unavailable.') { super(message); this.name = 'QualityEvidenceUnavailable'; } },
}));
import { computeDomainReport } from '../research-compliance-report-providers';
import { renderReport } from '../render/render';

const TYPE = 'compliance.audit_assurance_pack';
const A = '00000000-0000-4000-8000-000000000011', B = '00000000-0000-4000-8000-000000000012';
let pg: PGlite;
const q = { query: vi.fn((sql: string, parameters?: unknown[]) => pg.query<Record<string, unknown>>(sql, parameters)) };
const context = (userId = 5) => ({ userId, executor: q });
const record = (key: string, title: string, sourceScope: 'project' | 'organization') => ({ key, title, sourceScope,
  version: null, lifecycle: 'recorded', text: JSON.stringify({ title }), native: { kind: 'qms_internal_audits', id: key } });
const ORG = record('org-audit', 'Explicit organization audit', 'organization');

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE organizations(id int PRIMARY KEY,status text); CREATE TABLE users(id int PRIMARY KEY,status text);
    CREATE TABLE organization_users(organization_id int,user_id int,role text);
    CREATE TABLE regulatory_programs(id uuid PRIMARY KEY,organization_id int,deleted_at timestamp);
    CREATE TABLE projects(id int PRIMARY KEY,organization_id int,regulatory_program_id uuid,client_workspace_id int,status text,owner_id int,created_by_id int,settings json);
    CREATE TABLE project_visibility_settings(project_id int,organization_id int,visibility text);
    CREATE TABLE project_members(project_id int,organization_id int,user_id int,role text,status text);
    CREATE TABLE concept2cure_artifacts(id int PRIMARY KEY,artifact_id text,organization_id int,project_id int);
    CREATE TABLE concept2cure_review_assignments(artifact_id int,organization_id int,reviewer_id int,status text);
    INSERT INTO organizations VALUES(7,'active'),(8,'active'); INSERT INTO users VALUES(5,'active'),(6,'active'),(9,'inactive');
    INSERT INTO organization_users VALUES(7,5,'member'),(7,6,'member'),(7,9,'manager');
    INSERT INTO regulatory_programs VALUES
      ('${A}',7,NULL),('${B}',7,NULL),('00000000-0000-4000-8000-000000000013',7,now()),
      ('00000000-0000-4000-8000-000000000014',8,NULL),('00000000-0000-4000-8000-000000000015',7,NULL);
    INSERT INTO projects VALUES
      (11,7,'${A}',71,'active',5,5,'{}'),(12,7,'${B}',72,'active',6,6,'{}'),
      (13,7,'00000000-0000-4000-8000-000000000013',71,'active',5,5,'{}'),
      (14,8,'00000000-0000-4000-8000-000000000014',81,'active',5,5,'{}'),
      (15,7,'00000000-0000-4000-8000-000000000015',71,'active',5,5,'{}'),
      (16,7,'00000000-0000-4000-8000-000000000015',71,'active',6,6,'{}');
    INSERT INTO project_visibility_settings VALUES(11,7,'private'),(12,7,'private'),(13,7,'private'),(14,8,'private'),(15,7,'private'),(16,7,'private');
  `);
});
beforeEach(async () => {
  vi.clearAllMocks();
  await pg.exec('UPDATE projects SET owner_id=5,created_by_id=5 WHERE id=11');
  h.collect.mockImplementation(async (executor, input) => {
    expect(executor).toBe(q);
    if (input.programId === A) return [record('project-audit-a', 'Admitted project A audit', 'project'), ORG];
    if (input.programId === B) return [record('project-audit-b', 'Private project B audit', 'project'), ORG];
    if (input.programId === null) return [ORG];
    throw new Error('An unadmitted program reached the Quality collector');
  });
});
afterAll(async () => { await pg?.close(); });

describe('Quality report source isolation with the actual sharing policy', () => {
  it('reads only admitted project records and explicit organization context, never private/foreign/deleted/ambiguous parents', async () => {
    const result = await computeDomainReport(TYPE, 7, { scopeType: 'account', scopeId: '7', recordContext: context() });
    expect(h.collect.mock.calls.map(([, input]) => input.programId)).toEqual([A, A]);
    expect(result).toMatchObject({ computedScope: 'organization', accessProjectIds: [11], provider: { status: 'partial' },
      summary: { projectEvidenceSnapshots: 1, organizationEvidenceSnapshots: 1 } });
    expect(JSON.stringify(result)).toContain('Admitted project A audit');
    expect(JSON.stringify(result)).not.toMatch(/Private project B audit|000000000012|000000000013|000000000014|000000000015/);
    expect(h.fallback).not.toHaveBeenCalled();
  });

  it.each(['12', '13', '14', '15', '999'])('refuses unadmitted tracking project %s before any native record read', async scopeId => {
    await expect(computeDomainReport(TYPE, 7, { scopeType: 'project', scopeId, recordContext: context() })).rejects.toThrow(/project.*verified/);
    expect(h.collect).not.toHaveBeenCalled();
  });

  it('admits the other private project only for its owner', async () => {
    const result = await computeDomainReport(TYPE, 7, { scopeType: 'project', scopeId: '12', clientWorkspaceId: 72, recordContext: context(6) });
    expect(h.collect).toHaveBeenCalledTimes(2);
    expect(h.collect).toHaveBeenCalledWith(q, { organizationId: 7, userId: 6, programId: B });
    expect(result?.accessProjectIds).toEqual([12]);
  });

  it('refuses an inactive actor and access revoked while native facts are being collected', async () => {
    await expect(computeDomainReport(TYPE, 7, { scopeType: 'account', scopeId: '7', recordContext: context(9) })).rejects.toMatchObject({ code: 'PROJECT_ACTOR_ACCESS_DENIED' });
    expect(h.collect).not.toHaveBeenCalled();
    h.collect.mockImplementationOnce(async () => {
      await pg.exec('UPDATE projects SET owner_id=6,created_by_id=6 WHERE id=11');
      return [record('project-audit-a', 'Private after revocation', 'project'), ORG];
    });
    await expect(computeDomainReport(TYPE, 7, { scopeType: 'project', scopeId: '11', recordContext: context() })).rejects.toMatchObject({ code: 'PROJECT_ACCESS_CHANGED' });
  });

  it('carries exact native facts and scope disclosures into the existing renderer', async () => {
    const domain = await computeDomainReport(TYPE, 7, { scopeType: 'project', scopeId: '11', recordContext: context() });
    const output = renderReport({ reportTypeId: TYPE, reportTypeLabel: 'Compliance & Audit Assurance Pack', scopeType: 'project', scopeId: '11',
      providers: [domain!.provider], blockers: [domain!.provider.blocker!], status: 'partial',
      summary: { computedScope: domain!.computedScope, domain: domain!.summary } });
    const body = JSON.stringify(output);
    expect(body).toContain('Admitted project A audit'); expect(body).toContain('Explicit organization audit');
    expect(body).toContain('Organization context is not assigned to this project.');
    expect(body).toContain('Audit-chain integrity and compliance controls are not assessed.');
    expect(body).not.toMatch(/Private project B audit|No gaps detected|Submission readiness/);
  });
});
