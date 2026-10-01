/**
 * The task board shows every task store's work (row D2; the open half of the
 * board's "Two task stores" entry).
 *
 * GET /api/task-management/board read `unified_tasks` only. The schedule and
 * the Communication Center write `project_tasks`, agency correspondence writes
 * `c2c_project_work_items`, and a tracked filing lives in `estar_submissions`,
 * so none of that work reached the board, and its Blocked tile could not see a
 * task blocked anywhere else. The platform already has one view that reads all
 * four stores (services/unified-work/unified-work-view.ts loadUnifiedWork);
 * the board now reads through it rather than a second merge.
 *
 * What a person must see, and what is checked here:
 *   - work from each store, labelled with where it lives, read-only, with the
 *     screen that owns it (the board invents no write path into another store);
 *   - the board's own tasks keep their editability;
 *   - a task AnA created is in two stores (project_tasks and its board mirror)
 *     and appears once, as the editable board card;
 *   - another organisation's work never appears;
 *   - a store that cannot be read is named, and the board says it is partial,
 *     instead of silently showing less.
 *
 * Real PostgreSQL, the non-superuser runtime role with RLS_ENFORCE=on, the
 * route behind the real establishRequestTenantScope.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';
import { provisionAppServiceRole, resolveAppServiceRole } from '../../scripts/db/provision-app-role.mjs';

type Runtime = typeof import('../../server/db/runtime');

const ORG = 91910;
const OTHER_ORG = 91911;
const TAG = 'dbtbes';
const RUN = `${process.pid}_${Date.now().toString(36)}`;
const RUNTIME_PASSWORD = 'dbtbes-task-board-runtime-password';
const runtimeRole = resolveAppServiceRole({ APP_SERVICE_DB_ROLE: `dbtbes_rt_${RUN}` });

let owner: Pool;
let runtime: Runtime;
let app: express.Express;
let projectId: number;
let otherProjectId: number;
const ids: Record<string, string> = {};

interface BoardCard {
  taskId: string;
  title: string;
  status: string;
  source: string;
  blocked: boolean;
  project: string;
  readOnly?: boolean;
  home?: { surface: string; projectId: number | null } | null;
}

async function cleanup(): Promise<void> {
  const orgs = [ORG, OTHER_ORG];
  await owner.query('DELETE FROM estar_submissions WHERE organization_id = ANY($1::int[])', [orgs]);
  await owner.query('DELETE FROM project_tasks WHERE organization_id = ANY($1::int[])', [orgs]);
  await owner.query('DELETE FROM unified_tasks WHERE organization_id = ANY($1::int[])', [orgs]);
  await owner.query('DELETE FROM c2c_project_work_items WHERE org_id = ANY($1::int[])', [orgs]);
  await owner.query('DELETE FROM projects WHERE organization_id = ANY($1::int[])', [orgs]);
  await owner.query('DELETE FROM client_workspaces WHERE organization_id = ANY($1::int[])', [orgs]);
  const rows = (
    await owner.query(`SELECT uuid::text AS uuid FROM organizations WHERE id = ANY($1::int[])`, [orgs])
  ).rows as Array<{ uuid: string }>;
  await owner.query('DELETE FROM organizations WHERE id = ANY($1::int[])', [orgs]);
  if (rows.length > 0) {
    await owner
      .query(`DELETE FROM identity.organizations WHERE id = ANY($1::uuid[]) AND created_by = 'c48-stage1-sync'`, [
        rows.map((o) => o.uuid),
      ])
      .catch(() => {/* mirror absent or referenced: a harmless leftover */});
  }
}

async function seedOrganisation(org: number, projectName: string): Promise<number> {
  await owner.query(
    `INSERT INTO organizations (id, name, slug, tier, industry_mode, status)
     VALUES ($1, $2, $2, 'free', 'biotech', 'active')`,
    [org, `${TAG}-${org}-${RUN}`],
  );
  const ws = await owner.query(
    `INSERT INTO client_workspaces (organization_id, name, slug) VALUES ($1, $2, $2) RETURNING id`,
    [org, `${TAG}-ws-${org}-${RUN}`],
  );
  const project = await owner.query(
    `INSERT INTO projects (organization_id, client_workspace_id, name, type, status)
     VALUES ($1, $2, $3, 'regulatory', 'active') RETURNING id`,
    [org, ws.rows[0].id, projectName],
  );
  return project.rows[0].id as number;
}

async function seedWork(): Promise<void> {
  const yesterday = new Date(Date.now() - 86_400_000).toISOString();
  // The schedule / Communication Center store: one blocked, one done, and one
  // that AnA created and mirrored onto the board.
  const pt = await owner.query(
    `INSERT INTO project_tasks (organization_id, project_id, name, status, due_date) VALUES
       ($1, $2, '${TAG} statistical analysis plan', 'blocked', $3),
       ($1, $2, '${TAG} draft the clinical overview', 'done', NULL),
       ($1, $2, '${TAG} task AnA created', 'todo', NULL)
     RETURNING id, name`,
    [ORG, projectId, yesterday],
  );
  const byName = new Map(pt.rows.map((r: { id: number; name: string }) => [r.name, String(r.id)]));
  ids.blockedSchedule = byName.get(`${TAG} statistical analysis plan`)!;
  ids.doneSchedule = byName.get(`${TAG} draft the clinical overview`)!;
  ids.anaProjectTask = byName.get(`${TAG} task AnA created`)!;

  // The board's own store: a task of its own, and AnA's mirror of the task above
  // (command-executor.ts mirrorProjectTaskToUnified: source_entity_type
  // 'project_task', source_entity_id the project_tasks id).
  ids.boardOwn = `${TAG}-board-${RUN}`;
  ids.anaMirror = `TASK-PT-${ORG}-${ids.anaProjectTask}`;
  await owner.query(
    `INSERT INTO unified_tasks (task_id, organization_id, module_type, title, status, project_id, source_entity_type, source_entity_id) VALUES
       ($1, $3, 'ind', '${TAG} confirm the pre-IND meeting date', 'pending', $4, NULL, NULL),
       ($2, $3, 'general', '${TAG} task AnA created', 'pending', $4, 'project_task', $5)`,
    [ids.boardOwn, ids.anaMirror, ORG, projectId, ids.anaProjectTask],
  );

  // Agency correspondence, as the intake writes it (regulatory-correspondence/
  // operating-layer.ts: source_type 'correspondence', a string work_item_id).
  ids.correspondence = `wi_${TAG}_${RUN}`;
  await owner.query(
    `INSERT INTO c2c_project_work_items (work_item_id, org_id, project_id, source_type, source_id, title, status, blocker_type)
     VALUES ($1, $2, $3, 'correspondence', 1, '${TAG} answer the FDA information request', 'open', 'agency_hold')`,
    [ids.correspondence, ORG, projectId],
  );

  // A tracked filing the agency is waiting on.
  const f = await owner.query(
    `INSERT INTO estar_submissions (organization_id, project_id, catalog_key, program_type, status)
     VALUES ($1, $2, '${TAG}-510k', '510k', 'additional_info') RETURNING id::text AS id`,
    [ORG, projectId],
  );
  ids.filing = f.rows[0].id;

  // Another organisation's blocked task.
  await owner.query(
    `INSERT INTO project_tasks (organization_id, project_id, name, status) VALUES ($1, $2, '${TAG} foreign task', 'blocked')`,
    [OTHER_ORG, otherProjectId],
  );
}

async function buildApp(): Promise<express.Express> {
  const createTaskBoardRoutes = (await import('../../server/routes/taskBoard.routes')).default;
  const { establishRequestTenantScope } = await import('../../server/middleware/establishRequestTenantScope');
  const a = express();
  a.use(express.json());
  // Authentication is not under test: supply what the real auth middleware sets.
  a.use((req, _res, next) => {
    const r = req as unknown as Record<string, unknown>;
    r.userId = 1;
    r.tenantId = ORG;
    r.userRole = 'admin';
    r.user = { id: 1, userId: 1, organizationId: ORG, role: 'admin', email: `${TAG}@example.invalid` };
    next();
  });
  a.use(establishRequestTenantScope);
  a.use('/api/task-management', createTaskBoardRoutes());
  return a;
}

async function board(): Promise<{ status: number; cards: BoardCard[]; meta: Record<string, unknown> | undefined }> {
  const res = await request(app).get('/api/task-management/board');
  return { status: res.status, cards: (res.body?.data ?? []) as BoardCard[], meta: res.body?.meta };
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  await cleanup();
  let provisioned: { skipped: boolean } | undefined;
  for (let attempt = 1; ; attempt++) {
    try {
      provisioned = await provisionAppServiceRole(owner, {
        env: { APP_SERVICE_DB_ROLE: runtimeRole, APP_SERVICE_DB_PASSWORD: RUNTIME_PASSWORD },
      });
      break;
    } catch (err) {
      if (attempt >= 5 || !/tuple concurrently updated/.test((err as Error).message)) throw err;
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }
  if (provisioned!.skipped) throw new Error('[dbtbes] provisionAppServiceRole skipped — no runtime role.');
  const runtimeUrl = new URL(databaseUrl);
  runtimeUrl.username = runtimeRole;
  runtimeUrl.password = RUNTIME_PASSWORD;
  process.env.APP_DATABASE_URL = runtimeUrl.toString();
  process.env.RLS_ENFORCE = 'on';
  runtime = await import('../../server/db/runtime');

  projectId = await seedOrganisation(ORG, `${TAG} lead project ${RUN}`);
  otherProjectId = await seedOrganisation(OTHER_ORG, `${TAG} foreign project ${RUN}`);
  await seedWork();
  app = await buildApp();
}, 180_000);

afterAll(async () => {
  if (runtime) await runtime.getPool().end().catch(() => {});
  if (owner) {
    await cleanup().catch((err) => console.warn('[dbtbes] cleanup left rows:', err?.message));
    for (let attempt = 1; ; attempt++) {
      try {
        await owner.query(`REASSIGN OWNED BY ${runtimeRole} TO CURRENT_USER; DROP OWNED BY ${runtimeRole}`);
        await owner.query(`DROP ROLE IF EXISTS ${runtimeRole}`);
        break;
      } catch (err) {
        if (attempt >= 5) {
          console.warn('[dbtbes] runtime role left behind:', (err as Error).message);
          break;
        }
        await new Promise((r) => setTimeout(r, 250 * attempt));
      }
    }
    await owner.end();
  }
});

describe('the task board, as the runtime role with RLS on', () => {
  it('runs as a role that RLS binds (the posture these results depend on)', async () => {
    const { rows } = await owner.query(`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1`, [runtimeRole]);
    expect(rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
  });

  it("shows the schedule's, correspondence's and filings' work, each labelled, read-only, with the screen that owns it", async () => {
    const { status, cards } = await board();
    expect(status).toBe(200);
    const byId = new Map(cards.map((c) => [c.taskId, c]));

    expect(byId.get(`schedule:${ids.blockedSchedule}`), 'a blocked schedule task is missing from the board').toMatchObject({
      source: 'schedule', status: 'blocked', blocked: true, readOnly: true, project: String(projectId),
      home: { surface: 'project-home', projectId },
    });
    expect(byId.get(`schedule:${ids.doneSchedule}`)).toMatchObject({ source: 'schedule', status: 'completed', readOnly: true });
    expect(byId.get(`correspondence:${ids.correspondence}`), 'agency correspondence is missing from the board').toMatchObject({
      source: 'correspondence', status: 'pending', readOnly: true, home: { surface: 'project-home', projectId },
    });
    expect(byId.get(`filing:${ids.filing}`), 'a tracked filing is missing from the board').toMatchObject({
      source: 'filing', status: 'blocked', blocked: true, readOnly: true, home: { surface: 'submission-center', projectId },
    });
  });

  it("keeps the board's own tasks editable, and shows a task AnA created once, as its editable board card", async () => {
    const { cards } = await board();
    const own = cards.find((c) => c.taskId === ids.boardOwn);
    expect(own).toBeDefined();
    expect(own!.readOnly ?? false).toBe(false);
    const anaCards = cards.filter((c) => c.title === `${TAG} task AnA created`);
    expect(anaCards.map((c) => c.taskId)).toEqual([ids.anaMirror]);
    expect(anaCards[0].readOnly ?? false).toBe(false);
  });

  it("counts blocked work from every store, and never another organisation's", async () => {
    const { cards } = await board();
    expect(cards.filter((c) => c.blocked).map((c) => c.taskId).sort()).toEqual(
      [`filing:${ids.filing}`, `schedule:${ids.blockedSchedule}`].sort(),
    );
    expect(cards.some((c) => c.title === `${TAG} foreign task`)).toBe(false);
  });

  it('says it read every store', async () => {
    const { meta } = await board();
    expect(meta).toMatchObject({ partial: false, unreadSources: [] });
  });

  it('names a store it could not read and says it is partial, instead of showing less without a word', async () => {
    await owner.query(`REVOKE SELECT ON estar_submissions FROM ${runtimeRole}`);
    try {
      const { status, cards, meta } = await board();
      expect(status).toBe(200);
      expect(meta).toMatchObject({ partial: true, unreadSources: ['estar_submissions'] });
      expect(cards.some((c) => c.taskId === `filing:${ids.filing}`)).toBe(false);
      // What could be read is still shown.
      expect(cards.some((c) => c.taskId === `schedule:${ids.blockedSchedule}`)).toBe(true);
      expect(cards.some((c) => c.taskId === ids.boardOwn)).toBe(true);
    } finally {
      await owner.query(`GRANT SELECT ON estar_submissions TO ${runtimeRole}`);
    }
  });
});
