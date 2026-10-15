/**
 * A new project's blueprint milestones reach the board with their task.create
 * rows, all together or not at all. PGlite, a real engine: the property is
 * atomicity.
 *
 * WHAT WENT WRONG
 * POST /api/concept2cure/projects seeded the registry blueprint's milestones
 * with one `pool.query` each and no lineage row. Every new project began with
 * tasks on the regulated board that no record said anyone created, and a
 * failure part-way left some milestones seeded and the rest missing.
 *
 * `unified_tasks` is built exactly as the migration set builds it; the ledger
 * is the governed writer's two stores.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';
import { GOVERNED_ACTION_LEDGER_PGLITE_DDL } from '../../ana-ri/__tests__/governed-action-ledger.fixture';
import { extractTableDdl, REPO_ROOT } from '../../../../tests/golden-journeys/harness';

const holder = vi.hoisted(() => ({ pg: null as unknown as import('@electric-sql/pglite').PGlite }));

vi.mock('../../../db', async () => {
  const { pglitePool } = await import('../../ana-ri/__tests__/pglite-pool.fixture');
  const pool = pglitePool(() => holder.pg);
  return { pool, getPool: () => pool, db: {} };
});

import { seedBlueprintMilestones } from '../blueprint-milestones';

const DDL = [
  extractTableDdl('migrations/0000_sweet_joseph.sql', ['unified_tasks']),
  ...[
    'db/migrations/20260727_unified_tasks_mdx_metadata.sql',
    'db/migrations/20260807_unified_tasks_soft_delete.sql',
  ].map(f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8')),
].join('\n');

const ORG = 7;
const PROJECT = 41;
const USER = 5;
const REGISTRY = 'US_IND';
const MILESTONES = [
  { id: 'pre-ind', title: 'Pre-IND meeting', description: 'Request and hold the Pre-IND meeting.' },
  { id: 'cmc', title: 'CMC package', description: 'Module 3 quality documentation.' },
  { id: 'submit', title: 'IND submission', description: null },
];
const seed = (over: Partial<Parameters<typeof seedBlueprintMilestones>[0]> = {}) =>
  seedBlueprintMilestones({ organizationId: ORG, projectId: PROJECT, userId: USER, registryId: REGISTRY, milestones: MILESTONES, ...over });

const run = (sql: string, params: unknown[] = []) => holder.pg.query<Record<string, any>>(sql, params);
const board = async () =>
  (await run(`SELECT task_id, status, task_type, created_by_id FROM unified_tasks ORDER BY task_id`)).rows;
const createRows = async () =>
  (await run(`SELECT target, proposed_by, payload FROM c2c_ana_actions WHERE command = 'task.create' ORDER BY seq`)).rows;
const auditRows = async () =>
  (await run(`SELECT target FROM audit_logs WHERE action = 'c2c.work.task.create' ORDER BY target`)).rows;

beforeAll(async () => {
  holder.pg = new PGlite();
  await holder.pg.exec(DDL);
  await holder.pg.exec(AUDIT_LOGS_PGLITE_DDL);
  await holder.pg.exec(GOVERNED_ACTION_LEDGER_PGLITE_DDL);
  // Write order (the fixture's ids are text).
  await holder.pg.exec('ALTER TABLE c2c_ana_actions ADD COLUMN seq serial');
}, 60_000);
afterAll(async () => {
  await holder.pg?.close();
});
beforeEach(async () => {
  await holder.pg.exec('DELETE FROM unified_tasks; DELETE FROM c2c_ana_actions; DELETE FROM audit_logs;');
});

describe('a new project’s blueprint milestones', () => {
  it('each reach the board with a task.create row naming its creator, in the order they were seeded', async () => {
    await seed();

    expect(await board(), 'the board').toEqual(
      MILESTONES.map(m => ({ task_id: `TASK-BP-${PROJECT}-${m.id}`, status: 'pending', task_type: 'milestone', created_by_id: USER }))
        .sort((a, b) => a.task_id.localeCompare(b.task_id)),
    );
    const rows = await createRows();
    expect(rows.map(r => r.target), 'a seeded milestone has no task.create row').toEqual(
      MILESTONES.map(m => `task:TASK-BP-${PROJECT}-${m.id}`),
    );
    expect(rows.every(r => Number(r.proposed_by) === USER), 'the row names someone other than the creator').toBe(true);
    expect(rows[0].payload).toMatchObject({ sourceEntityType: 'registry_blueprint', sourceEntityId: `${REGISTRY}:pre-ind`, status: 'pending' });
    expect(await auditRows(), 'the audit log is missing its half of a pair').toHaveLength(MILESTONES.length);
  });

  it('seeded twice, the second run adds no task and no row', async () => {
    await seed();
    const second = await seed();

    expect(second).toEqual([]);
    expect(await board()).toHaveLength(MILESTONES.length);
    expect(await createRows()).toHaveLength(MILESTONES.length);
  });

  it('with no creator to name, nothing is seeded — no board task without its record', async () => {
    await expect(seed({ userId: null })).rejects.toMatchObject({ code: 'AUDIT_WRITE_FAILED', reason: 'NOT_ATTRIBUTABLE' });

    expect(await board(), 'an unattributed milestone is on the board').toEqual([]);
    expect(await createRows()).toEqual([]);
  });

  it('when the ledger cannot be written, no milestone stays on the board', async () => {
    await holder.pg.exec('ALTER TABLE c2c_ana_actions RENAME TO c2c_ana_actions_away');
    try {
      await expect(seed()).rejects.toThrow();
    } finally {
      await holder.pg.exec('ALTER TABLE c2c_ana_actions_away RENAME TO c2c_ana_actions');
    }

    expect(await board(), 'milestones committed with no ledger').toEqual([]);
    expect(await auditRows(), 'half a ledger pair committed').toEqual([]);
  });

  it('a milestone that cannot be written takes the ones before it back: all or none', async () => {
    const broken = [MILESTONES[0], { id: 'no-title', title: null as unknown as string }, MILESTONES[2]];
    await expect(seed({ milestones: broken })).rejects.toThrow();

    expect(await board(), 'part of the blueprint was seeded').toEqual([]);
    expect(await createRows(), 'a row outlived its task').toEqual([]);
  });
});

/**
 * D5 (2026-10-01): a seeded milestone is the system's act, and nobody states a
 * reason for it. Each row used to record "Milestone seeded from the <registry>
 * blueprint when the project was created" as the reason for change; that is
 * now the payload's summary, and the reason is null.
 */
describe('the reason a seeded milestone records', () => {
  it('is null — what happened is the summary', async () => {
    await seed();

    const rows = (await run(`SELECT a.decision_reason, a.payload, l.reason AS audit_reason
                               FROM c2c_ana_actions a JOIN audit_logs l ON l.ana_action_id = a.id
                              WHERE a.command = 'task.create' ORDER BY a.seq`)).rows;
    expect(rows).toHaveLength(MILESTONES.length);
    for (const r of rows) {
      expect(r.decision_reason).toBeNull();
      expect(r.audit_reason).toBeNull();
      expect(r.payload.summary).toBe(`Milestone seeded from the ${REGISTRY} blueprint when the project was created`);
    }
  });
});
