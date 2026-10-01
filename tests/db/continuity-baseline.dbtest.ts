/**
 * U14 — AnA Command's continuity baseline is shared across API tasks.
 *
 * ── The defect (docs/evidence/W2/2026-09-24-multi-task/audit-findings.json) ──
 * server/services/orchestration/continuity-service.ts kept the "previous
 * snapshot" in two module-level Maps. Production runs two API tasks behind an
 * ALB with no stickiness, plus a worker on the same server image, so each task
 * held its own baseline per project. The trajectory verdict (score moved more
 * than 5 points), the start of the "what changed" window and the "newly ready"
 * set all depended on which task served the previous page view, and after
 * every deploy the first answer was "stable" whatever the real movement.
 *
 * ── How tasks are simulated ─────────────────────────────────────────────────
 * Each "task" is a fresh module graph (vi.resetModules): its own copy of the
 * service, its own pg pool, its own tenant-scope store — exactly the state one
 * ECS task holds that another does not. All tasks share ONE real PostgreSQL 16
 * database, as production's tasks share RDS. A task booted after the others
 * have written is the post-deploy case.
 *
 * ── What is stubbed, and why it does not touch the subject ──────────────────
 * The readiness score is computed by assembleCrossObjectPayload →
 * computeReadinessAssessment over the project spine. Those are stubbed to
 * return a score the test sets, because the subject here is what the score is
 * COMPARED AGAINST, not how it is computed (the engine has its own tests,
 * including tests/db/cross-object-resolver.dbtest.ts on the real schema). The
 * snapshot store, the baseline choice and the verdict run for real, as the
 * non-superuser runtime role, under RLS_ENFORCE=on.
 *
 * ── Isolation ───────────────────────────────────────────────────────────────
 * Lane "dbtcb": organisations 92200–92209. Every row written belongs to them
 * and is removed afterwards. The migration and the tenant sweep are applied
 * here (both are idempotent and re-run on every deploy — CLAUDE.md Rule 1).
 */

import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';
import {
  provisionAppServiceRole,
  resolveAppServiceRole,
} from '../../scripts/db/provision-app-role.mjs';

const ORG = 92200;
const OTHER_ORG = 92201;
const RUN = `${process.pid}_${Date.now().toString(36)}`;
const RUNTIME_PASSWORD = 'dbtcb-continuity-runtime-password';
const runtimeRole = resolveAppServiceRole({ APP_SERVICE_DB_ROLE: `dbtcb_rt_${RUN}` });

const REPO = path.resolve(__dirname, '..', '..');
const MIGRATION = path.join(REPO, 'migrations/20261001_project_continuity_snapshots.sql');
const SWEEP = path.join(REPO, 'db/migrations/20260801_tenant_isolation_sweep.sql');

/** What the stubbed readiness engine reports right now. */
const engine = vi.hoisted(() => ({
  score: 60,
  blockers: [] as Array<Record<string, unknown>>,
  documents: [] as Array<{ id: number; title: string; status: string }>,
}));

vi.mock('../../server/services/orchestration/cross-object-resolver', () => ({
  assembleCrossObjectPayload: async ({ projectId }: { projectId: number }) => ({
    project: { id: projectId, name: `dbtcb project ${projectId}`, totalTasks: 0, blockedTasks: 0 },
    documents: engine.documents,
    validations: [],
  }),
}));
vi.mock('../../server/services/orchestration/readiness-engine', () => ({
  computeReadinessAssessment: () => ({
    overallScore: engine.score,
    status: 'partial',
    blockers: engine.blockers,
  }),
}));
vi.mock('../../server/services/orchestration/recommendation-engine', () => ({
  generateRecommendations: () => ({ recommendations: [] }),
}));

type Service = typeof import('../../server/services/orchestration/continuity-service');
type Briefing = Awaited<ReturnType<Service['generateContinuitySnapshot']>> & {
  baseline?: { snapshotAt: string; readinessScore: number } | null;
};

interface Task {
  service: Service;
  /** Run in the org's tenant scope, as an authenticated request does on this task. */
  as<T>(org: number, fn: () => Promise<T>): Promise<T>;
  /** Count a project's rows through this task's runtime pool — RLS decides what it sees. */
  visibleRows(org: number, projectId: number): Promise<number>;
  end(): Promise<void>;
}

const tasks: Task[] = [];
let owner: Pool;
let nextProject = 7_000_000 + Math.floor(Math.random() * 1_000_000);
const project = () => nextProject++;

/** One API task: a fresh module graph — service, pool and tenant store of its own. */
async function bootTask(): Promise<Task> {
  vi.resetModules();
  const tenantStore = await import('../../server/db/tenantStore');
  const runtime = await import('../../server/db/runtime');
  const service = await import('../../server/services/orchestration/continuity-service');
  const task: Task = {
    service,
    as: (org, fn) =>
      tenantStore.runWithTenantScope(
        { tenantId: String(org), role: 'admin', source: 'test', caller: 'dbtcb' },
        fn,
      ),
    visibleRows: (org, projectId) =>
      task.as(org, async () => {
        const r = await runtime.getPool().query(
          // Deliberately no organization_id predicate: only the policy filters.
          `SELECT count(*)::int AS n FROM project_continuity_snapshots WHERE project_id = $1`,
          [projectId],
        );
        return r.rows[0].n as number;
      }),
    end: () => runtime.getPool().end().catch(() => {}),
  };
  tasks.push(task);
  return task;
}

function brief(task: Task, projectId: number, org = ORG): Promise<Briefing> {
  return task.as(org, () => task.service.generateContinuitySnapshot(org, projectId)) as Promise<Briefing>;
}

/** Age every snapshot of a project, as the passage of time would. */
async function age(projectId: number, hours: number): Promise<void> {
  await owner.query(
    `UPDATE project_continuity_snapshots
        SET created_at = created_at - make_interval(hours => $2)
      WHERE organization_id = $1 AND project_id = $3`,
    [ORG, hours, projectId],
  ).catch(() => {/* no table on the pre-fix code path: nothing to age */});
}

async function rowCount(projectId: number, org = ORG): Promise<number> {
  const r = await owner.query(
    `SELECT count(*)::int AS n FROM project_continuity_snapshots WHERE organization_id = $1 AND project_id = $2`,
    [org, projectId],
  );
  return r.rows[0].n as number;
}

async function cleanup(): Promise<void> {
  await owner
    .query(`DELETE FROM project_continuity_snapshots WHERE organization_id = ANY($1::int[])`, [[ORG, OTHER_ORG]])
    .catch(() => {});
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  await owner.query(fs.readFileSync(MIGRATION, 'utf8'));
  await owner.query(fs.readFileSync(SWEEP, 'utf8'));
  await cleanup();

  for (let attempt = 1; ; attempt++) {
    try {
      const r = await provisionAppServiceRole(owner, {
        env: { APP_SERVICE_DB_ROLE: runtimeRole, APP_SERVICE_DB_PASSWORD: RUNTIME_PASSWORD },
      });
      if (r.skipped) throw new Error('[dbtcb] provisionAppServiceRole skipped — no runtime role.');
      break;
    } catch (err) {
      if (attempt >= 5 || !/tuple concurrently updated/.test((err as Error).message)) throw err;
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }
  await owner.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON project_continuity_snapshots TO ${runtimeRole};
     GRANT USAGE, SELECT ON SEQUENCE project_continuity_snapshots_id_seq TO ${runtimeRole}`,
  );

  const url = new URL(databaseUrl);
  url.username = runtimeRole;
  url.password = RUNTIME_PASSWORD;
  process.env.APP_DATABASE_URL = url.toString();
  process.env.RLS_ENFORCE = 'on';
}, 120_000);

afterAll(async () => {
  for (const t of tasks) await t.end();
  if (!owner) return;
  await cleanup();
  await owner
    .query(`REASSIGN OWNED BY ${runtimeRole} TO CURRENT_USER; DROP OWNED BY ${runtimeRole}`)
    .catch(() => {});
  await owner.query(`DROP ROLE IF EXISTS ${runtimeRole}`).catch(() => {});
  await owner.end();
});

beforeEach(() => {
  engine.score = 60;
  engine.blockers = [];
  engine.documents = [];
});

describe('no baseline yet is said, not dressed up as "stable"', () => {
  it('a project never snapshotted reports no_baseline and no newly-ready claims', async () => {
    const a = await bootTask();
    const pid = project();
    const first = await brief(a, pid);
    expect(first.trajectory).toBe('no_baseline');
    expect(first.baseline).toBeNull();
    expect(first.newlyReady).toEqual([]);
  });

  it('a snapshot minutes old is not a baseline: a 12-point move is not called a trend yet', async () => {
    const a = await bootTask();
    const pid = project();
    await brief(a, pid);
    engine.score = 72;
    const second = await brief(a, pid);
    // The pre-fix service compared against the previous page view and said
    // "improving" — a verdict the next task to answer would not repeat.
    expect(second.trajectory).toBe('no_baseline');
  });
});

describe('every task answers from the same baseline', () => {
  it('task A records at 60; a day later tasks B, C (post-deploy) and A all say improving at 72', async () => {
    const a = await bootTask();
    const pid = project();
    await brief(a, pid);
    await age(pid, 25);

    engine.score = 72;
    const b = await bootTask();
    const onB = await brief(b, pid);
    const c = await bootTask(); // the deploy: a task that has served nothing
    const onC = await brief(c, pid);
    const onA = await brief(a, pid);

    expect([onA.trajectory, onB.trajectory, onC.trajectory]).toEqual(['improving', 'improving', 'improving']);
    for (const r of [onA, onB, onC]) expect(r.baseline?.readinessScore).toBe(60);
  });

  it('page views on another task do not move the baseline', async () => {
    const a = await bootTask();
    const b = await bootTask();
    const pid = project();
    await brief(a, pid);
    await age(pid, 25);

    engine.score = 72;
    for (let i = 0; i < 3; i++) await brief(b, pid);
    // Pre-fix: A's "previous" was its own last view and B's views replaced
    // nothing on A; the shared store must give A the same day-old baseline.
    const onA = await brief(a, pid);
    expect(onA.trajectory).toBe('improving');
    expect(onA.baseline?.readinessScore).toBe(60);
  });

  it('declining is measured against the shared baseline too', async () => {
    const a = await bootTask();
    const pid = project();
    engine.score = 80;
    await brief(a, pid);
    await age(pid, 30);
    engine.score = 61;
    const onB = await brief(await bootTask(), pid);
    expect(onB.trajectory).toBe('declining');
  });

  it('newly ready is what cleared since the baseline task A recorded', async () => {
    const a = await bootTask();
    const pid = project();
    engine.score = 50;
    engine.documents = [{ id: 501, title: 'Clinical overview', status: 'draft' }];
    engine.blockers = [{ targetType: 'document', targetId: 501, message: 'Not approved', severity: 'high' }];
    await brief(a, pid);
    await age(pid, 26);

    engine.score = 80;
    engine.documents = [{ id: 501, title: 'Clinical overview', status: 'approved' }];
    engine.blockers = [];
    const onB = await brief(await bootTask(), pid);
    expect(onB.newlyReady).toEqual([{ type: 'document', id: 501, title: 'Clinical overview' }]);
  });

  it('the latest snapshot is readable from a task that never generated one', async () => {
    const a = await bootTask();
    const pid = project();
    await brief(a, pid);
    const c = await bootTask();
    const latest = await c.as(ORG, async () => c.service.getLatestSnapshot(ORG, pid));
    expect(latest?.projectId).toBe(pid);
    expect(latest?.metrics.readinessScore).toBe(60);
  });
});

describe('the store stays bounded', () => {
  it('records at most one snapshot per project per hour', async () => {
    const a = await bootTask();
    const b = await bootTask();
    const pid = project();
    await brief(a, pid);
    await brief(b, pid);
    await brief(a, pid);
    expect(await rowCount(pid)).toBe(1);
  });

  it('drops rows older than the current baseline, which can never be a baseline again', async () => {
    const a = await bootTask();
    const pid = project();
    for (const hoursAgo of [72, 48, 30]) {
      await owner.query(
        `INSERT INTO project_continuity_snapshots (organization_id, project_id, readiness_score, snapshot, created_at)
         VALUES ($1, $2, $3, '{"activeBlockers": []}'::jsonb, NOW() - make_interval(hours => $4))`,
        [ORG, pid, 100 - hoursAgo, hoursAgo],
      );
    }
    engine.score = 90;
    const r = await brief(a, pid);
    expect(r.baseline?.readinessScore).toBe(70); // the 30-hour-old row
    expect(r.trajectory).toBe('improving');
    const left = await owner.query(
      `SELECT readiness_score FROM project_continuity_snapshots
        WHERE organization_id = $1 AND project_id = $2 ORDER BY created_at`,
      [ORG, pid],
    );
    expect(left.rows.map((x) => Number(x.readiness_score))).toEqual([70, 90]);
  });
});

describe('tenant isolation', () => {
  it('the sweep gives the new table the tenant policy, with RLS forced', async () => {
    const r = await owner.query(
      `SELECT c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
              EXISTS (SELECT 1 FROM pg_policies p
                       WHERE p.schemaname = 'public' AND p.tablename = c.relname
                         AND p.policyname = 'tenant_isolation_policy') AS policied
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'project_continuity_snapshots'`,
    );
    expect(r.rows[0]).toEqual({ rls: true, forced: true, policied: true });
  });

  it("another organisation neither sees nor inherits a project's baseline", async () => {
    const a = await bootTask();
    const pid = project();
    await brief(a, pid);
    await age(pid, 25);

    // As the runtime role, with no organization predicate in the SQL: RLS alone.
    expect(await a.visibleRows(ORG, pid)).toBe(1);
    expect(await a.visibleRows(OTHER_ORG, pid)).toBe(0);
    const seen = await a.as(OTHER_ORG, async () => a.service.getLatestSnapshot(OTHER_ORG, pid));
    expect(seen ?? null).toBeNull();
    engine.score = 90;
    const theirs = await brief(a, pid, OTHER_ORG);
    expect(theirs.trajectory).toBe('no_baseline');
  });
});
