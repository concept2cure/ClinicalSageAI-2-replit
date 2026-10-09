/**
 * A drafting task belongs to its program's organization, in the database and
 * not only in the route (D3, 2026-09-28; evidence
 * docs/evidence/D3/2026-09-28-drafting-tasks/).
 *
 * public.drafting_tasks holds generated draft content — the document title,
 * its eCTD section and the draft text — and names its program by a text
 * project_id with no foreign key and no organization column. The two drafting
 * routes (server/routes/misc-inline-routes.ts) read and write it only through
 * the program's ownership, but the table carried no row-level security, so any
 * statement running as app_service in tenant A's scope read tenant B's drafts,
 * and could write a task under B's program or rewrite B's draft.
 *
 * Every statement runs through the application pool (app_service, RLS
 * enforcing, asserted by the fixture). The route cases go through the
 * production drafting router behind server/auth.ts authMiddleware.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { getPool } from '../../server/db';
import { runWithSystemTenantScope, runWithTenantScope } from '../../server/db/tenantStore';
import { authMiddleware } from '../../server/auth';
import { createMiscInlineRoutes } from '../../server/routes/misc-inline-routes';
import {
  TAG,
  ORG_A,
  ORG_B,
  owner,
  userA,
  userB,
  accessToken,
  auth,
  provisionTwoTenantFixture,
  teardownTwoTenantFixture,
} from './two-tenant-fixture';

const SECRET = `${TAG}-B-CONFIDENTIAL-DRAFT`;
const TASK_B = `${TAG}-task-b`;
let programA = '';
let programB = '';
let app: express.Express;

async function newProgram(org: number, suffix: string): Promise<string> {
  const { rows } = await owner.query(
    `INSERT INTO regulatory_programs
       (organization_id,name,code,program_type,product_type,primary_agency,product_name)
     VALUES ($1,$2,$3,'ind','drug','FDA',$4) RETURNING id`,
    [org, `${TAG}-${suffix}`, `${TAG}-${suffix}`, `${TAG}-product-${suffix}`]
  );
  return String(rows[0].id);
}

/** Everything this file wrote: its tasks go before the fixture's users (FK). */
async function removeTasks(): Promise<void> {
  await owner.query(
    `DELETE FROM drafting_tasks WHERE task_id LIKE $1 OR project_id = ANY($2::text[])
        OR created_by_id = ANY($3::int[])`,
    [`${TAG}%`, [programA, programB].filter(Boolean), [userA, userB]]
  );
}

/** B's task, exactly as seeded. */
async function seedTaskB(): Promise<void> {
  await owner.query('DELETE FROM drafting_tasks WHERE task_id = $1', [TASK_B]);
  await owner.query(
    `INSERT INTO drafting_tasks (task_id, project_id, ectd_section, document_title, status, draft_content, created_by_id)
     VALUES ($1, $2, '2.5', 'B clinical overview', 'COMPLETED', $3, $4)`,
    [TASK_B, programB, SECRET, userB]
  );
}

beforeAll(async () => {
  await provisionTwoTenantFixture();
  programA = await newProgram(ORG_A, 'drafting-a');
  programB = await newProgram(ORG_B, 'drafting-b');
  await seedTaskB();
  app = express();
  app.use(express.json());
  app.use('/api', createMiscInlineRoutes(getPool() as never, authMiddleware));
}, 60_000);

afterAll(async () => {
  if (owner) await removeTasks();
  await teardownTwoTenantFixture();
});

/** One statement in tenant A's request scope, as a plain member. */
function asA(sql: string, params: unknown[] = []) {
  return runWithTenantScope(
    { tenantId: String(ORG_A), role: 'member', source: 'request', caller: 'drafting-tasks.dbtest' },
    () => getPool().query(sql, params)
  );
}
function asPlatform(sql: string, params: unknown[] = []) {
  return runWithSystemTenantScope('drafting-tasks.dbtest', () => getPool().query(sql, params));
}

/** rowCount of a write, a refusal counted as nothing written. */
async function written(run: () => Promise<{ rowCount: number | null }>): Promise<number> {
  try {
    return (await run()).rowCount ?? 0;
  } catch (err) {
    if ((err as { code?: string }).code === '42501') return 0;
    throw err;
  }
}

const draftOfB = async () =>
  (await owner.query('SELECT draft_content FROM drafting_tasks WHERE task_id = $1', [TASK_B]))
    .rows[0]?.draft_content ?? null;

describe('the drafting routes, positive control (D3)', () => {
  it('A starts a task for its own program and reads it back', async () => {
    const start = await request(app)
      .post('/api/v1/drafting/start_task')
      .set(auth(accessToken(userA, ORG_A, 'member')))
      .send({ project_id: programA, ectd_section: '2.5', document_title: `${TAG} A overview` });
    expect(start.status, JSON.stringify(start.body).slice(0, 300)).toBe(202);
    const status = await request(app)
      .get(`/api/v1/drafting/task_status/${start.body.task_id}`)
      .set(auth(accessToken(userA, ORG_A, 'member')));
    expect(status.status, JSON.stringify(status.body).slice(0, 300)).toBe(200);
    expect(status.body).toMatchObject({ project_id: programA, status: 'COMPLETED' });
    expect(String(status.body.draft_content)).toContain(`${TAG} A overview`);
  });

  it("the route refuses B's task and B's program to A's token", async () => {
    const status = await request(app)
      .get(`/api/v1/drafting/task_status/${TASK_B}`)
      .set(auth(accessToken(userA, ORG_A, 'member')));
    expect(status.status).toBe(404);
    const start = await request(app)
      .post('/api/v1/drafting/start_task')
      .set(auth(accessToken(userA, ORG_A, 'member')))
      .send({ project_id: programB, ectd_section: '2.5', document_title: 'into B' });
    expect(start.status).toBe(404);
  });
});

describe("tenant A's scope cannot reach tenant B's drafts (D3)", () => {
  it("reads none of B's drafting tasks, by id, by program, or by scanning the content", async () => {
    const byId = await asA('SELECT task_id, draft_content FROM drafting_tasks WHERE task_id = $1', [
      TASK_B,
    ]);
    const byProgram = await asA('SELECT task_id FROM drafting_tasks WHERE project_id = $1', [
      programB,
    ]);
    const scan = await asA('SELECT task_id FROM drafting_tasks WHERE draft_content = $1', [SECRET]);
    expect(
      { byId: byId.rows, byProgram: byProgram.rows, scan: scan.rows },
      "A's scope read B's draft"
    ).toEqual({ byId: [], byProgram: [], scan: [] });
  });

  it("cannot rewrite or delete B's draft", async () => {
    const updated = await written(() =>
      asA("UPDATE drafting_tasks SET draft_content = 'overwritten by A' WHERE task_id = $1", [
        TASK_B,
      ])
    );
    const deleted = await written(() =>
      asA('DELETE FROM drafting_tasks WHERE task_id = $1', [TASK_B])
    );
    try {
      expect({ updated, deleted }).toEqual({ updated: 0, deleted: 0 });
      expect(await draftOfB()).toBe(SECRET);
    } finally {
      await seedTaskB(); // a red run rewrote or removed it
    }
  });

  it("cannot file a task under B's program, or under no program at all", async () => {
    const intoB = await written(() =>
      asA(
        `INSERT INTO drafting_tasks (task_id, project_id, ectd_section, document_title, draft_content)
         VALUES ($1, $2, '2.5', 'planted in B', 'planted')`,
        [`${TAG}-planted-b`, programB]
      )
    );
    const orphan = await written(() =>
      asA(
        `INSERT INTO drafting_tasks (task_id, project_id, ectd_section, document_title, draft_content)
         VALUES ($1, 'not-a-program', '2.5', 'orphan', 'orphan')`,
        [`${TAG}-orphan`]
      )
    );
    try {
      expect({ intoB, orphan }).toEqual({ intoB: 0, orphan: 0 });
    } finally {
      await owner.query('DELETE FROM drafting_tasks WHERE task_id = ANY($1::text[])', [
        [`${TAG}-planted-b`, `${TAG}-orphan`],
      ]);
    }
  });
});

describe('what still reaches the drafts (D3)', () => {
  it("A's scope reads and writes its own program's tasks", async () => {
    const task = `${TAG}-task-a-sql`;
    expect(
      await written(() =>
        asA(
          `INSERT INTO drafting_tasks (task_id, project_id, ectd_section, document_title, draft_content)
           VALUES ($1, $2, '2.7', 'A summary', 'A draft')`,
          [task, programA]
        )
      )
    ).toBe(1);
    expect(
      (await asA('SELECT task_id FROM drafting_tasks WHERE task_id = $1', [task])).rows
    ).toEqual([{ task_id: task }]);
  });

  it("the platform scope reads every organization's tasks", async () => {
    const { rows } = await asPlatform('SELECT task_id FROM drafting_tasks WHERE task_id = $1', [
      TASK_B,
    ]);
    expect(rows).toEqual([{ task_id: TASK_B }]);
  });
});
