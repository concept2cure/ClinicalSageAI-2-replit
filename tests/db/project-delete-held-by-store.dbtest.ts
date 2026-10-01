/**
 * DELETE /api/projects/:id when another store still names the project
 * (PF-13 follow-up, D5), on real PostgreSQL with the migration set's schema.
 *
 * The route judges what the delete would destroy (projectDeletionHolds: the
 * anchor row, documents past draft) and then deletes. Forty-odd stores name a
 * project under a key that does not cascade (ON DELETE NO ACTION: agency
 * correspondence, submissions, evidence-chain records, AnA's working memory …).
 * The holds read does not enumerate them, so the database refuses the DELETE
 * with 23503, and the route answered a bare 500 "Failed to delete project":
 *
 *   - a record the project holds (here, an FDA communication) is a reason to
 *     archive instead, and the person is told so: 409 PROJECT_HOLDS_RECORDS,
 *     nothing deleted;
 *   - AnA's working memory is a summary of a conversation, not a record. The
 *     conversation itself cascades with the project, so its summary must not
 *     hold the project either: the summary stays, detached (project_id NULL),
 *     and a draft-only project deletes, as PF-13 allows.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';

const PROBE = 'dbtest-project-delete';

let owner: Pool;
let app: express.Express;
let orgId: number;
let orgUuid: string;
let userId: number;
let workspaceId: number;

async function project(name: string): Promise<number> {
  const { rows } = await owner.query(
    `INSERT INTO projects (organization_id, client_workspace_id, name, type) VALUES ($1, $2, $3, 'ind') RETURNING id`,
    [orgId, workspaceId, `${PROBE} ${name}`],
  );
  return Number(rows[0].id);
}

const exists = async (id: number) =>
  (await owner.query('SELECT 1 FROM projects WHERE id = $1', [id])).rows.length === 1;

async function buildApp(): Promise<express.Express> {
  const router = (await import('../../server/routes/projects-management')).default;
  const { establishRequestTenantScope } = await import('../../server/middleware/establishRequestTenantScope');
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    const r = req as unknown as Record<string, unknown>;
    r.userId = userId;
    r.tenantId = orgId;
    r.userRole = 'admin';
    r.user = { id: userId, organizationId: orgId, organizationUuid: orgUuid, role: 'admin', email: 'pd@dbtest.local' };
    next();
  });
  a.use(establishRequestTenantScope);
  a.use('/api/projects', router);
  return a;
}

async function cleanup(): Promise<void> {
  await owner.query(`DELETE FROM conversation_working_memory WHERE thread_id LIKE $1`, [`${PROBE}%`]);
  await owner.query(`DELETE FROM fda_communications WHERE subject LIKE $1`, [`${PROBE}%`]);
  await owner.query(`DELETE FROM projects WHERE name LIKE $1`, [`${PROBE}%`]);
  await owner.query(`DELETE FROM client_workspaces WHERE slug LIKE $1`, [`${PROBE}%`]);
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  await cleanup().catch(() => {});
  const org = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2) ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id, uuid`,
    [`${PROBE} org`, `${PROBE}-org`],
  );
  orgId = Number(org.rows[0].id);
  orgUuid = String(org.rows[0].uuid);
  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, 'PD', 'x')
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [`${PROBE}@dbtest.local`],
  );
  userId = Number(user.rows[0].id);
  const ws = await owner.query(
    `INSERT INTO client_workspaces (organization_id, name, slug) VALUES ($1, 'Main', $2) RETURNING id`,
    [orgId, `${PROBE}-ws`],
  );
  workspaceId = Number(ws.rows[0].id);
  app = await buildApp();
}, 60_000);

afterAll(async () => {
  await cleanup().catch(() => {});
  await owner?.end();
});

describe('a draft-only project whose conversation AnA summarized', () => {
  it('is deleted, and the summary stays, detached from it', async () => {
    const id = await project('summarized');
    const wm = await owner.query(
      `INSERT INTO conversation_working_memory (thread_id, project_id, organization_id, summary, message_count_at_generation)
       VALUES ($1, $2, $3, 'what was discussed', 20) RETURNING id`,
      [`${PROBE}-thread`, id, orgId],
    );
    const res = await request(app).delete(`/api/projects/${id}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await exists(id)).toBe(false);
    const { rows } = await owner.query('SELECT project_id, summary FROM conversation_working_memory WHERE id = $1', [wm.rows[0].id]);
    expect(rows).toEqual([{ project_id: null, summary: 'what was discussed' }]);
  });
});

describe('a project another store holds a record of', () => {
  it('is refused 409 PROJECT_HOLDS_RECORDS, telling the person to archive, and nothing is deleted', async () => {
    const id = await project('corresponded');
    await owner.query(
      `INSERT INTO fda_communications (organization_id, project_id, subject) VALUES ($1, $2, $3)`,
      [orgId, id, `${PROBE} Type B meeting minutes`],
    );
    const res = await request(app).delete(`/api/projects/${id}`);
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error).toBe('PROJECT_HOLDS_RECORDS');
    expect(res.body.message).toMatch(/Archive it instead/);
    // No table or constraint name reaches the person; the log has them.
    expect(JSON.stringify(res.body)).not.toMatch(/fda_communications|_fk|fkey/);
    expect(await exists(id)).toBe(true);
    const { rows } = await owner.query('SELECT count(*)::int AS n FROM fda_communications WHERE project_id = $1', [id]);
    expect(rows[0].n).toBe(1);
  });
});
