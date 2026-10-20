import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const stubs = vi.hoisted(() => ({ query: vi.fn(), persist: vi.fn(), compute: vi.fn() }));
vi.mock('../../../db', () => ({ getPool: () => ({ query: stubs.query }), pool: { query: stubs.query } }));
vi.mock('../../../middleware/orgMembership', () => ({ GOVERNED_WRITE_ROLES: new Set(['admin', 'manager', 'member']) }));
vi.mock('../scheduling/entitlement', () => ({ scheduledReportsEntitled: async () => ({ entitled: true, tier: 'professional', requiredTier: 'professional' }), scheduledReportsRefusal: () => ({ error: 'Not entitled' }) }));
vi.mock('../segment', () => ({ deriveScopeSegments: async () => ['pharma'], deriveOrgSegments: async () => ['pharma'], filterTypesForSegment: (types: unknown[]) => types }));
vi.mock('../compute-run', () => ({ computeRunForType: stubs.compute }));
vi.mock('../persistence', () => ({ persistReportRun: stubs.persist }));
vi.mock('../../notifications/notification-service', () => ({ createNotification: vi.fn() }));
vi.mock('../../auditService', () => ({ writeChainedAuditRow: vi.fn() }));

import { canAccessReportProject, canAccessReportScope, getAccessibleReportProjectIds } from '../project-access';
import { validateSubscriptionConfiguration } from '../scheduling/configuration';
import { generateAndDeliver } from '../scheduling/generate-deliver';
import type { CreateSubscriptionInput } from '../scheduling/subscription-service';
import type { ReportSubscriptionRow } from '../../../../shared/schema/report-os';

let database: PGlite;
const query = (sql: string, params?: unknown[]) => database.query<Record<string, unknown>>(sql, params);
const client = { query };
const input: CreateSubscriptionInput = { organizationId: 7, createdBy: 99, scopeType: 'project', scopeId: '11', reportTypeId: 'readiness.executive_digest', schedule: { cadence: 'daily', hour: 9 }, channel: 'platform', format: 'in_app' };

beforeAll(async () => {
  database = new PGlite();
  stubs.query.mockImplementation(query);
  await database.exec(`
    CREATE TABLE organizations(id int PRIMARY KEY, status text);
    CREATE TABLE users(id int PRIMARY KEY, email text, status text);
    CREATE TABLE organization_users(organization_id int, user_id int, role text);
    CREATE TABLE client_workspaces(id int PRIMARY KEY, organization_id int, status text);
    CREATE TABLE projects(id int PRIMARY KEY, organization_id int, client_workspace_id int, status text, created_by_id int, owner_id int, settings json);
    CREATE TABLE project_visibility_settings(project_id int, organization_id int, visibility text);
    CREATE TABLE project_members(project_id int, organization_id int, user_id int, role text, status text, invited_by_id int, accepted_at timestamp);
    CREATE TABLE concept2cure_artifacts(id int PRIMARY KEY, artifact_id text, organization_id int, project_id int);
    CREATE TABLE concept2cure_review_assignments(artifact_id int, organization_id int, reviewer_id int, status text);
    CREATE TABLE report_program_groups(id int PRIMARY KEY, organization_id int, client_workspace_id int, status text);
    CREATE TABLE report_program_group_projects(program_group_id int, project_id int, organization_id int NOT NULL);
    CREATE TABLE report_type_registry(type_id text PRIMARY KEY, label text, family text, allowed_scopes json, allowed_client_segments json, enabled boolean);
    INSERT INTO organizations VALUES (7,'active'),(8,'active');
    INSERT INTO users VALUES (5,'member@example.com','active'),(6,'shared@example.com','active'),(8,'viewer@example.com','active'),(9,'recipient@example.com','active'),(10,'manager@example.com','active'),(20,'foreign@example.com','active'),(99,'owner@example.com','active');
    INSERT INTO organization_users VALUES (7,5,'member'),(7,6,'member'),(7,8,'viewer'),(7,9,'viewer'),(7,10,'manager'),(8,20,'member'),(7,99,'member');
    INSERT INTO client_workspaces VALUES (71,7,'active'),(81,8,'active');
    INSERT INTO projects VALUES
      (11,7,71,'active',99,99,'{}'), (12,7,71,'active',88,88,'{}'),
      (13,7,71,'active',88,88,'{}'), (21,8,81,'active',20,20,'{}');
    INSERT INTO project_visibility_settings VALUES (11,7,'private'),(12,7,'private'),(13,7,'org_public'),(21,8,'private');
    INSERT INTO project_members VALUES (11,7,6,'use','active',99,now()),(11,7,9,'use','active',99,now());
    INSERT INTO concept2cure_artifacts VALUES (120,'artifact-12',7,12);
    INSERT INTO concept2cure_review_assignments VALUES (120,7,8,'pending');
    INSERT INTO report_program_groups VALUES (1,7,71,'active');
    INSERT INTO report_program_group_projects VALUES (1,11,7),(1,12,7);
    INSERT INTO report_type_registry VALUES
      ('readiness.executive_digest','Readiness','readiness','["project"]','[]',true),
      ('fcoi.disclosure_register','FCOI','fcoi','["account","program","project"]','[]',true);
  `);
}, 60_000);
afterAll(async () => { await database?.close(); });
beforeEach(() => { stubs.persist.mockReset(); stubs.compute.mockReset(); });

describe('reporting reuses the existing project-sharing boundary', () => {
  it('denies an unassigned same-organization member and viewer while allowing owner and explicit use members', async () => {
    expect(await canAccessReportProject(7, { userId: 5, role: 'member' }, 11, client)).toBe(false);
    expect(await canAccessReportProject(7, { userId: 8, role: 'viewer' }, 11, client)).toBe(false);
    expect(await canAccessReportProject(7, { userId: 99, role: 'member' }, 11, client)).toBe(true);
    expect(await canAccessReportProject(7, { userId: 6, role: 'member' }, 11, client)).toBe(true);
    expect(await canAccessReportProject(7, { userId: 9, role: 'viewer' }, 11, client)).toBe(true);
  });
  it('retains public-project and pending-review access without admitting another organization', async () => {
    expect(await getAccessibleReportProjectIds(7, { userId: 8, role: 'viewer' }, client)).toEqual(expect.arrayContaining([12, 13]));
    expect(await canAccessReportProject(7, { userId: 10, role: 'manager' }, 11, client)).toBe(true);
    expect(await canAccessReportProject(7, { userId: 10, role: 'manager' }, 21, client)).toBe(false);
  });
  it('refuses a writing creator who has no actual access to the private project', async () => {
    await expect(validateSubscriptionConfiguration({ ...input, createdBy: 5 })).rejects.toMatchObject({ code: 'REPORT_CREATOR_PROJECT_ACCESS_DENIED', status: 403 });
  });
  it('permits scheduling by an explicit project member and delivery to an authorized viewer', async () => {
    expect(await validateSubscriptionConfiguration({ ...input, createdBy: 6, recipients: ['recipient@example.com'] })).toMatchObject({ projectId: 11, recipientUserIds: [9] });
  });
  it('honors project-membership revocation on the next delivery validation', async () => {
    await database.exec("UPDATE project_members SET status = 'revoked' WHERE project_id = 11 AND user_id = 9");
    try {
      await expect(validateSubscriptionConfiguration({ ...input, recipients: ['recipient@example.com'] })).rejects.toMatchObject({ code: 'REPORT_RECIPIENT_PROJECT_ACCESS_DENIED' });
    } finally {
      await database.exec("UPDATE project_members SET status = 'active' WHERE project_id = 11 AND user_id = 9");
    }
  });
  it('refuses an unauthorized same-organization recipient before computing or persisting any output', async () => {
    const sub = { ...input, id: 50, recipients: ['viewer@example.com'], enabled: true, nextRunAt: new Date('2026-10-10T09:00:00Z'), createdAt: new Date('2026-10-09T10:00:00Z'), updatedAt: new Date('2026-10-09T10:00:00Z'), lastRunAt: null } as ReportSubscriptionRow;
    await expect(generateAndDeliver(sub, new Date('2026-10-13T10:00:00Z'))).rejects.toMatchObject({ code: 'REPORT_RECIPIENT_PROJECT_ACCESS_DENIED', status: 403 });
    expect(stubs.compute).not.toHaveBeenCalled(); expect(stubs.persist).not.toHaveBeenCalled();
  });
  it('requires access to every private project referenced by a program-group schedule', async () => {
    await expect(validateSubscriptionConfiguration({ ...input, reportTypeId: 'fcoi.disclosure_register', scopeType: 'program', scopeId: '1' })).rejects.toMatchObject({ code: 'REPORT_CREATOR_PROJECT_ACCESS_DENIED' });
  });
  it('keeps genuine organization registers governed by their existing organization policy', async () => {
    expect(await validateSubscriptionConfiguration({ ...input, createdBy: 5, reportTypeId: 'fcoi.disclosure_register', scopeType: 'account', scopeId: '7' })).toMatchObject({ projectId: null, recipientUserIds: [5] });
  });
});


it('guards saved account reports by their actual source projects and rechecks a schedule recipient after compute', async () => {
  const scope = { organizationId: 7, scopeType: 'account', scopeId: '7', dependencySummary: { summary: { accessProjectIds: [11] } } };
  expect(await canAccessReportScope(7, { userId: 5, role: 'member' }, scope, client)).toBe(false);
  expect(await canAccessReportScope(7, { userId: 9, role: 'viewer' }, scope, client)).toBe(true);
  expect(await canAccessReportScope(7, { userId: 5, role: 'member' }, { ...scope, dependencySummary: { summary: {} } }, client)).toBe(true);
  stubs.compute.mockResolvedValue({ computed: { summary: { accessProjectIds: [11] }, providers: [], blockers: [], criticalBlockers: [], confidence: null } });
  const sub = { ...input, reportTypeId: 'fcoi.disclosure_register', scopeType: 'account', scopeId: '7', id: 51, recipients: ['viewer@example.com'], enabled: true, nextRunAt: new Date('2026-10-10T09:00:00Z'), createdAt: new Date('2026-10-09T10:00:00Z'), updatedAt: new Date('2026-10-09T10:00:00Z'), lastRunAt: null } as ReportSubscriptionRow;
  await expect(generateAndDeliver(sub, new Date('2026-10-13T10:00:00Z'))).rejects.toMatchObject({ code: 'REPORT_RECIPIENT_PROJECT_ACCESS_DENIED', status: 403 });
  expect(stubs.compute).toHaveBeenCalledOnce(); expect(stubs.persist).not.toHaveBeenCalled();
});


it('rechecks actual source-project recipient access inside the persistence transaction before cursor or delivery effects', async () => {
  stubs.compute.mockResolvedValue({ computed: { summary: { accessProjectIds: [11] }, providers: [], blockers: [], criticalBlockers: [], confidence: null } });
  stubs.persist.mockImplementation(async (_rows, _actor, effect) => {
    await database.exec("UPDATE project_members SET status='revoked' WHERE project_id=11 AND user_id=9");
    return effect(client, { run: { id: 999 } });
  });
  const sub = { ...input, reportTypeId: 'fcoi.disclosure_register', scopeType: 'account', scopeId: '7', id: 52, recipients: ['recipient@example.com'], enabled: true, nextRunAt: new Date('2026-10-10T09:00:00Z'), createdAt: new Date('2026-10-09T10:00:00Z'), updatedAt: new Date('2026-10-09T10:00:00Z'), lastRunAt: null } as ReportSubscriptionRow;
  try {
    await expect(generateAndDeliver(sub, new Date('2026-10-13T10:00:00Z'))).rejects.toMatchObject({ code: 'REPORT_RECIPIENT_PROJECT_ACCESS_DENIED', status: 403 });
    expect(stubs.persist).toHaveBeenCalledOnce();
  } finally { await database.exec("UPDATE project_members SET status='active' WHERE project_id=11 AND user_id=9"); }
});


it.each([null, {invalid:true}, ['11']])('refuses malformed present source evidence %j on direct account reads', async accessProjectIds => {
  expect(await canAccessReportScope(7,{userId:99,role:'member'},{scopeType:'account',scopeId:'7',dependencySummary:{summary:{accessProjectIds}}},client)).toBe(false);
});
