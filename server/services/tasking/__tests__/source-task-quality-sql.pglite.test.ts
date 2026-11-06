/** Native ownership and the canonical numeric anchor run as real SQL; task writes and actor admission are seams. */
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({
  query: null as null | ((text: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>),
  create: vi.fn(), transition: vi.fn(), audit: vi.fn(), admit: vi.fn(), actor: vi.fn(), qmsRead: vi.fn(),
}));
const runner = vi.hoisted(() => ({ select: () => ({ from: () => ({ where: async () => [] }) }) }));
vi.mock('../../../db', () => ({ db: runner }));
vi.mock('drizzle-orm/node-postgres', () => ({ drizzle: () => runner }));
vi.mock('../../../db/withTenantConnection', () => ({
  withTenantConnection: async (_scope: unknown, fn: (q: unknown) => Promise<unknown>) => fn({
    query: (text: string, params?: unknown[]) => H.query!(text, params),
  }),
}));
vi.mock('../task-project', () => ({ admitTaskCreationProject: H.admit }));
vi.mock('../../c2c/current-program-access', () => ({ readCurrentProgramActor: H.actor }));
vi.mock('../../qms/controlled-document-content', () => ({ authorizeQmsContentRead: H.qmsRead }));
vi.mock('../task-audit', () => ({ auditTaskActionInTx: H.audit }));
vi.mock('../../unifiedTaskService', () => ({ default: { createUnifiedTask: H.create, updateTaskStatus: H.transition } }));

import { replaceSourceTask, type ReplaceSourceTask } from '../source-task';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const OTHER_PROGRAM = '88888888-8888-4888-8888-888888888888';
const DELETED_PROGRAM = '99999999-9999-4999-8999-999999999999';
const DOC = '44444444-4444-4444-8444-444444444444';
const OTHER_DOC = '55555555-5555-4555-8555-555555555555';
const CAPA = '22222222-2222-4222-8222-222222222222';
const OTHER_CAPA = '66666666-6666-4666-8666-666666666666';
const ACTION = '33333333-3333-4333-8333-333333333333';
let pg: PGlite;
const input = (sourceEntityType: string, sourceEntityId: string): ReplaceSourceTask => ({
  organizationId: 7, actorId: 12, sourceEntityType, sourceEntityId, closeAs: 'cancelled', same: () => false,
  next: { moduleType: 'Quality', title: 'Follow up on the native record', projectId: 999,
    dueDate: new Date('2026-12-01T00:00:00Z') },
});

beforeAll(async () => {
  pg = new PGlite();
  // Canonical Authoring uses tenant_id, not organization_id, and has no deleted_at column.
  // Omit cross-table FKs to exercise defensive reads of legacy or corrupted pointers too.
  await pg.exec(`
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id integer, deleted_at timestamptz);
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer, regulatory_program_id uuid, client_workspace_id integer);
    CREATE TABLE authoring_documents (id uuid PRIMARY KEY, tenant_id integer, client_program_id uuid);
    CREATE TABLE qms_documents (id integer PRIMARY KEY, organization_id integer, authoring_document_id uuid, metadata jsonb, deleted_at timestamptz);
    CREATE TABLE capa_records (id uuid PRIMARY KEY, program_id text NOT NULL,assigned_to text,created_by text,
      target_close_date timestamptz DEFAULT '2026-12-01',state text DEFAULT 'open');
    CREATE TABLE capa_actions (id uuid PRIMARY KEY, capa_id uuid NOT NULL,owner text,
      due_date timestamptz DEFAULT '2026-12-01',state text DEFAULT 'planned');
  `);
  H.query = async (text, params) => {
    // The lock is a concurrency primitive; ownership and anchor SQL execute unchanged.
    if (text.includes('pg_advisory_xact_lock')) return { rows: [] };
    return pg.query<Record<string, unknown>>(text, params);
  };
});
afterAll(async () => { H.query = null; await pg.close(); });

beforeEach(async () => {
  H.create.mockReset().mockResolvedValue({ taskId: 'new-task' });
  H.transition.mockReset(); H.audit.mockReset().mockResolvedValue(undefined);
  H.actor.mockReset().mockResolvedValue({ userId: 12, role: 'member' }); H.qmsRead.mockReset().mockResolvedValue(undefined);
  H.admit.mockReset().mockImplementation(async (_q: unknown, scope: { projectId: number }) => ({ projectId: scope.projectId, clientWorkspaceId: 4 }));
  await pg.exec('TRUNCATE projects,regulatory_programs,authoring_documents,qms_documents,capa_records,capa_actions');
  await pg.query(`INSERT INTO regulatory_programs VALUES ($1,7,NULL),($2,8,NULL),($3,7,NOW())`, [PROGRAM, OTHER_PROGRAM, DELETED_PROGRAM]);
  await pg.query(`INSERT INTO projects VALUES (41,7,$1,4),(81,8,$2,8)`, [PROGRAM, OTHER_PROGRAM]);
  await pg.query(`INSERT INTO authoring_documents VALUES ($1,7,$2),($3,8,$4)`, [DOC, PROGRAM, OTHER_DOC, OTHER_PROGRAM]);
  await pg.query(`INSERT INTO qms_documents VALUES
    (12,7,$1,$3::jsonb,NULL),(13,8,$2,'{}',NULL),(14,7,$2,'{}',NULL),(15,7,NULL,$3::jsonb,NULL),(16,7,$1,'{}',NOW())`,
  [DOC, OTHER_DOC, JSON.stringify({ programId: OTHER_PROGRAM })]);
  await pg.query(`INSERT INTO capa_records(id,program_id) VALUES ($1,$2),($3,$4)`, [CAPA, PROGRAM, OTHER_CAPA, OTHER_PROGRAM]);
  await pg.query('INSERT INTO capa_actions(id,capa_id) VALUES ($1,$2)', [ACTION, CAPA]);
});

describe('the real native owner query reaches the canonical project anchor', () => {
  it('uses the controlled document’s bound Authoring tenant/program, ignoring stale metadata', async () => {
    expect(await replaceSourceTask(input('qms_periodic_review', 'qms-document:12'))).toBe('scheduled');
    expect(H.qmsRead).toHaveBeenCalledWith(expect.anything(), 7, 12, expect.objectContaining({ id: 12, organization_id: 7, authoring_document_id: DOC }));
    expect(H.admit).not.toHaveBeenCalled();
    expect(H.create).toHaveBeenCalledWith(expect.objectContaining({ projectId: 41, clientWorkspaceId: 4 }), runner);
  });

  it('keeps an unbound legacy document organization-wide even when its metadata names a project', async () => {
    expect(await replaceSourceTask(input('qms_periodic_review', 'qms-document:15'))).toBe('scheduled');
    expect(H.admit).not.toHaveBeenCalled();
    expect(H.create).toHaveBeenCalledWith(expect.objectContaining({ projectId: undefined, clientWorkspaceId: undefined }), runner);
  });

  it.each([['capa_record', `capa:${CAPA}`], ['capa_action', `capa-action:${ACTION}`]])('places %s using the CAPA parent’s recorded program', async (kind, key) => {
    expect(await replaceSourceTask(input(kind, key))).toBe('scheduled');
    expect(H.create).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 7, projectId: 41 }), runner);
  });
});

describe('native SQL refuses unavailable or foreign ownership before any task write', () => {
  it.each([
    ['another tenant’s document', 'qms_periodic_review', 'qms-document:13'],
    ['an authored pointer crossing tenants', 'qms_periodic_review', 'qms-document:14'],
    ['a deleted controlled document', 'qms_periodic_review', 'qms-document:16'],
    ['another tenant’s CAPA', 'capa_record', `capa:${OTHER_CAPA}`],
  ])('refuses %s', async (_name, kind, key) => {
    expect(await replaceSourceTask(input(kind, key))).toBe('failed');
    expect(H.admit).not.toHaveBeenCalled(); expect(H.create).not.toHaveBeenCalled();
  });

  it('refuses a bound document whose recorded program is deleted despite a valid tracking anchor', async () => {
    const deletedDoc = '77777777-7777-4777-8777-777777777777';
    await pg.query('INSERT INTO projects VALUES (43,7,$1,4)', [DELETED_PROGRAM]);
    await pg.query('INSERT INTO authoring_documents VALUES ($1,7,$2)', [deletedDoc, DELETED_PROGRAM]);
    await pg.query("INSERT INTO qms_documents VALUES (17,7,$1,'{}',NULL)", [deletedDoc]);
    expect(await replaceSourceTask(input('qms_periodic_review', 'qms-document:17'))).toBe('failed');
    expect(H.admit).not.toHaveBeenCalled(); expect(H.create).not.toHaveBeenCalled();
  });

  it('does not hide an ambiguous anchor by choosing one tracking project', async () => {
    await pg.query('INSERT INTO projects VALUES (42,7,$1,4)', [PROGRAM]);
    expect(await replaceSourceTask(input('capa_record', `capa:${CAPA}`))).toBe('failed');
    expect(H.admit).not.toHaveBeenCalled(); expect(H.create).not.toHaveBeenCalled();
  });

  it('preserves the actor admission refusal after the real owner and anchor resolve', async () => {
    H.admit.mockRejectedValue(new Error('Project is private to another team'));
    expect(await replaceSourceTask(input('capa_action', `capa-action:${ACTION}`))).toBe('failed');
    expect(H.admit).toHaveBeenCalledWith(expect.anything(), { organizationId: 7, actorUserId: 12, projectId: 41 });
    expect(H.create).not.toHaveBeenCalled();
  });
});
