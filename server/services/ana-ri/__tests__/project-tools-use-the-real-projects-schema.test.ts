/**
 * AnA's list_projects and update_project use the real projects schema.
 * The retired create_project path cannot write a standalone PM-spine project.
 *
 * Before (to 2026-10-15): all three named projects.submission_type, and
 * update_project a projects.phase, neither of which exists — a project records
 * its submission type in `metadata` (as loadUserContext and the canonical
 * POST /api/concept2cure/projects write and read it). So list_projects and
 * create_project failed on every call, and an update naming submissionType
 * failed the whole write. create_project also omitted two NOT NULL columns
 * (client_workspace_id, type). update_project's success message listed fields
 * it had silently skipped. (update-project-dispatch.contract.test.ts builds its
 * table by hand, with both phantom columns, which is how this stayed hidden.)
 *
 * Real `projects` and `client_workspaces` DDL from the Drizzle schema, NOT NULL
 * included, on PGlite.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { clientWorkspaces, projects } from '../../../../shared/schema';
import { regulatoryPrograms } from '../../../../shared/schema/programs';

const h = vi.hoisted(() => ({ pool: null as unknown }));
vi.mock('../../../db', () => ({ getPool: () => h.pool, pool: h.pool, db: {} }));

vi.mock('../../roleBasedAccess', () => ({ default: { hasRole: async () => true, getUserRoles: async () => [] } }));

import { COMMAND_HANDLERS, COMMAND_REGISTRY, executeCommands, processCommandsInResponse, listProjects, updateProject } from '../command-executor';
import { COMMAND_AUTHORIZATION, PROPOSE_ONLY_COMMANDS } from '../command-rbac';

const ALPHA = 1;
const BETA = 2;
/** An organization with two client workspaces, neither marked as its own. */
const GAMMA = 3;
let pg: PGlite;

function ddlOf(table: PgTable): string {
  const c = getTableConfig(table);
  const cols = c.columns.map((col) => {
    const d = col.default;
    const literal = typeof d === 'number' || typeof d === 'boolean' ? ` DEFAULT ${d}`
      : typeof d === 'string' ? ` DEFAULT '${d.replace(/'/g, "''")}'`
      : d !== undefined && col.getSQLType().startsWith('timestamp') ? ' DEFAULT now()' : '';
    const type = col.getSQLType() === 'serial' ? 'serial' : col.getSQLType();
    return `"${col.name}" ${type}${col.primary ? ' PRIMARY KEY' : ''}${col.notNull && !col.primary ? ' NOT NULL' : ''}${literal}`;
  });
  return `CREATE TABLE IF NOT EXISTS "${c.name}" (${cols.join(', ')});`;
}

const ctx = (organizationId: number) => ({ userId: 9, organizationId }) as never;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(ddlOf(clientWorkspaces as PgTable));
  await pg.exec(ddlOf(projects as PgTable));
  await pg.exec(ddlOf(regulatoryPrograms as PgTable));
  await pg.exec(`
    INSERT INTO client_workspaces (id, organization_id, name, slug) VALUES
      (11, ${ALPHA}, 'Alpha', 'alpha'), (21, ${BETA}, 'Beta', 'beta'),
      (31, ${GAMMA}, 'Gamma client A', 'ga'), (32, ${GAMMA}, 'Gamma client B', 'gb');
    INSERT INTO projects (id, organization_id, client_workspace_id, name, type, metadata) VALUES
      (101, ${ALPHA}, 11, 'Alpha IND', 'concept2cure', '{"submissionType":"IND"}'),
      (201, ${BETA}, 21, 'BETA-SECRET NDA', 'concept2cure', '{"submissionType":"NDA"}');
    SELECT setval(pg_get_serial_sequence('projects', 'id'), 500);
  `);
  h.pool = {
    query: async (text: string, params?: unknown[]) => {
      const r = await pg.query(text, params);
      const rows = r.rows as unknown[];
      return { rows, rowCount: rows.length > 0 ? rows.length : ((r as { affectedRows?: number }).affectedRows ?? 0) };
    },
  };
}, 60_000);

afterAll(async () => {
  await pg?.close();
});

beforeEach(() => {
  /* each case reads what it wrote */
});

describe('list_projects', () => {
  it("lists the caller's organization's projects with their recorded submission type", async () => {
    const r = await listProjects(ctx(ALPHA));
    expect(r.success, `list_projects failed: ${r.message} ${r.error ?? ''}`).toBe(true);
    const rows = (r.data as { projects: Array<{ name: string; submission_type: string | null }> }).projects;
    expect(rows.map((p) => p.name)).toContain('Alpha IND');
    expect(rows.find((p) => p.name === 'Alpha IND')?.submission_type).toBe('IND');
    expect(JSON.stringify(rows)).not.toContain('BETA-SECRET');
  });

  it('a failed read is a failure, never an empty list', async () => {
    const real = h.pool;
    h.pool = { query: async () => { throw new Error('connection terminated'); } };
    try {
      const r = await listProjects(ctx(ALPHA));
      expect(r.success).toBe(false);
      expect(r.data).toBeUndefined();
    } finally {
      h.pool = real;
    }
  });
});

describe('the retired create_project writer', () => {
  const stale = { command: 'create_project', params: { name: 'Unanchored project', submissionType: 'NDA' } };
  async function holdings() {
    return (await pg.query<{ projects: number; programs: number }>(
      'SELECT (SELECT count(*)::int FROM projects) AS projects, (SELECT count(*)::int FROM regulatory_programs) AS programs',
    )).rows[0];
  }

  it.each([false, true])('writes no standalone project or proposal, even with human confirmation %s', async (humanConfirmed) => {
    const before = await holdings();
    const result = await executeCommands([stale] as never, {
      userId: 9, organizationId: ALPHA, anaToolPolicy: {}, part11Enforce: false, humanConfirmed,
    });
    expect(await holdings(), 'the retired writer created a PM-spine row without a regulatory program').toEqual(before);
    expect(result).toMatchObject([{ success: false, action: 'create_project', error: 'COMMAND_NOT_REGISTERED' }]);
    expect(result[0].data).toBeUndefined();
  });

  it('is absent from dispatch, authorization, proposal partition and discovery', () => {
    expect(Object.hasOwn(COMMAND_HANDLERS, 'create_project')).toBe(false);
    expect(Object.hasOwn(COMMAND_AUTHORIZATION, 'create_project')).toBe(false);
    expect(PROPOSE_ONLY_COMMANDS.has('create_project')).toBe(false);
    expect(COMMAND_REGISTRY.some(command => command.name === 'create_project')).toBe(false);
  });

  it('answers an old chat command block honestly without a project write or proposal', async () => {
    const before = await holdings();
    const result = await processCommandsInResponse('Here is the requested action.\n```command\n' + JSON.stringify(stale) + '\n```', {
      userId: 9, organizationId: ALPHA, anaToolPolicy: {}, part11Enforce: false,
    });
    expect(result.executedCommands).toMatchObject([{ success: false, error: 'COMMAND_NOT_REGISTERED' }]);
    expect(await holdings()).toEqual(before);
    expect(result.cleanedText).toBe('Here is the requested action.');
  });
});

describe('update_project', () => {
  it('records a submission type in metadata, keeping the rest of it', async () => {
    const r = await updateProject(ctx(ALPHA), { projectId: 101, updates: { submissionType: 'BLA', name: 'Alpha BLA' } });
    expect(r.success, `update_project failed: ${r.message}`).toBe(true);
    const row = (await pg.query<any>('SELECT name, metadata FROM projects WHERE id = 101')).rows[0];
    expect(row.name).toBe('Alpha BLA');
    expect(row.metadata).toMatchObject({ submissionType: 'BLA' });
  });

  it('refuses a field the project has no place for, naming it, and writes nothing', async () => {
    const r = await updateProject(ctx(ALPHA), { projectId: 101, updates: { phase: 'Phase 3', name: 'Renamed' } });
    expect(r.success).toBe(false);
    expect(r.message).toContain('phase');
    expect((await pg.query<any>('SELECT name FROM projects WHERE id = 101')).rows[0].name).toBe('Alpha BLA');
  });

  it("cannot change another organization's project", async () => {
    const r = await updateProject(ctx(ALPHA), { projectId: 201, updates: { submissionType: 'IND' } });
    expect(r.success).toBe(false);
    const row = (await pg.query<any>('SELECT metadata FROM projects WHERE id = 201')).rows[0];
    expect(row.metadata).toMatchObject({ submissionType: 'NDA' });
  });
});
