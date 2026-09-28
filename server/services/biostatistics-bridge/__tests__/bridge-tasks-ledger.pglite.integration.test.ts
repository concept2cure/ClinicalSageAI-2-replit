/**
 * Tasks raised from a statistical assessment reach the board with their
 * task.create rows, all together or not at all. PGlite, a real engine: the
 * property is atomicity.
 *
 * WHAT WENT WRONG
 * POST /api/biostat-bridge/designs/:studyId/tasks (createTasksForDesign)
 * inserted each task on its own, then wrote its task.create row through the
 * best-effort branch of auditTaskAction and discarded the outcome. A ledger
 * that could not be written left the tasks on the board with no record, and
 * the route answered them "created". A task that failed part-way through the
 * selection left the ones before it on the board. And no task named its
 * creator (`created_by_id` was never set).
 *
 * The design is loaded through a stub (the study-design store is not what is
 * under test); the assessment, the task blueprint, the board write and the
 * ledger are the production code, over one PGlite connection.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';
import { GOVERNED_ACTION_LEDGER_PGLITE_DDL } from '../../ana-ri/__tests__/governed-action-ledger.fixture';
import { extractTableDdl, REPO_ROOT } from '../../../../tests/golden-journeys/harness';
import type { StudyDesign } from '../../study-design/study-design-types';

const holder = vi.hoisted(() => ({ pg: null as unknown as import('@electric-sql/pglite').PGlite }));

vi.mock('../../../db', async () => {
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const schema = await import('../../../../shared/schema');
  const { pglitePool } = await import('../../ana-ri/__tests__/pglite-pool.fixture');
  const pool = pglitePool(() => holder.pg);
  return { pool, getPool: () => pool, db: drizzle(pool.client as never, { schema }) };
});

vi.mock('../../study-design/study-design-repository', async (importOriginal) => {
  const { validateDesign } = await import('../../study-design/design-validation');
  const design = {
    title: 'A phase 3 study of Drug X in type 2 diabetes',
    phase: '3',
    indication: 'type 2 diabetes',
    productType: 'drug',
    targetRegions: ['US'],
    objectives: [],
    estimands: [],
    endpoints: [{ name: 'HbA1c change', role: 'primary', type: 'continuous', definition: 'change from baseline in HbA1c at week 24' }],
    arms: [],
    programId: null,
  } as unknown as StudyDesign;
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    loadStudyDesign: async () => ({ design, validation: validateDesign(design) }),
  };
});

import { assessDesign, createTasksForDesign } from '../bridge-service';

const DDL = [
  extractTableDdl('migrations/0000_sweet_joseph.sql', ['unified_tasks']),
  ...[
    'db/migrations/20260727_unified_tasks_mdx_metadata.sql',
    'db/migrations/20260807_unified_tasks_soft_delete.sql',
  ].map(f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8')),
].join('\n');

const ORG = 7;
const USER = 5;
const STUDY = 'study-bx-204';
let proposedKeys: string[] = [];

const run = (sql: string, params: unknown[] = []) => holder.pg.query<Record<string, any>>(sql, params);
const board = async () =>
  (await run(`SELECT task_id, created_by_id, metadata->>'blueprintKey' AS key FROM unified_tasks ORDER BY id`)).rows;
const createRows = async () =>
  (await run(`SELECT target, proposed_by FROM c2c_ana_actions WHERE command = 'task.create' ORDER BY seq`)).rows;
const auditRows = async () =>
  (await run(`SELECT target FROM audit_logs WHERE action = 'c2c.work.task.create'`)).rows;
const raise = (keys = proposedKeys, userId: number | null = USER) =>
  createTasksForDesign({ organizationId: ORG, userId, studyId: STUDY, keys, reason: 'Raised at the design review.' });

beforeAll(async () => {
  holder.pg = new PGlite();
  await holder.pg.exec(DDL);
  await holder.pg.exec(AUDIT_LOGS_PGLITE_DDL);
  await holder.pg.exec(GOVERNED_ACTION_LEDGER_PGLITE_DDL);
  await holder.pg.exec('ALTER TABLE c2c_ana_actions ADD COLUMN seq serial');
  proposedKeys = (await assessDesign(ORG, STUDY))!.proposedTasks.map(t => t.key);
}, 60_000);
afterAll(async () => {
  await holder.pg?.close();
});
beforeEach(async () => {
  await holder.pg.exec('DELETE FROM unified_tasks; DELETE FROM c2c_ana_actions; DELETE FROM audit_logs;');
});

describe('tasks raised from a statistical assessment', () => {
  it('the design proposes at least two tasks (the cases below need a selection of more than one)', () => {
    expect(proposedKeys.length).toBeGreaterThanOrEqual(2);
  });

  it('each reach the board naming its creator, with a task.create row, in the order raised', async () => {
    const out = await raise();

    const tasks = await board();
    expect(tasks.map(t => t.key)).toEqual(proposedKeys);
    expect(tasks.every(t => t.created_by_id === USER), 'a raised task does not name its creator').toBe(true);
    const rows = await createRows();
    expect(rows.map(r => r.target), 'a raised task has no task.create row').toEqual(tasks.map(t => `task:${t.task_id}`));
    expect(rows.every(r => Number(r.proposed_by) === USER)).toBe(true);
    expect(await auditRows()).toHaveLength(tasks.length);
    expect(out.created.map(c => c.taskId)).toEqual(tasks.map(t => t.task_id));
  });

  it('when the ledger cannot be written, nothing is raised and nothing is answered "created"', async () => {
    await holder.pg.exec('ALTER TABLE c2c_ana_actions RENAME TO c2c_ana_actions_away');
    let answer: unknown;
    try {
      answer = await raise().catch(() => null);
    } finally {
      await holder.pg.exec('ALTER TABLE c2c_ana_actions_away RENAME TO c2c_ana_actions');
    }

    expect(answer, 'tasks with no ledger row were answered "created"').toBeNull();
    expect(await board(), 'tasks committed with no ledger').toEqual([]);
    expect(await auditRows(), 'half a ledger pair committed').toEqual([]);
  });

  it('with no creator to name, nothing is raised', async () => {
    await expect(raise(proposedKeys, null)).rejects.toMatchObject({ code: 'AUDIT_WRITE_FAILED', reason: 'NOT_ATTRIBUTABLE' });

    expect(await board(), 'an unattributed task is on the board').toEqual([]);
  });

  it('a task that cannot be written takes the ones before it back: all or none', async () => {
    // Every insert after the first is refused.
    await holder.pg.exec(
      `CREATE FUNCTION refuse_second() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN IF (SELECT count(*) FROM unified_tasks) >= 1 THEN RAISE EXCEPTION 'refused'; END IF; RETURN NEW; END $$;
       CREATE TRIGGER refuse_second BEFORE INSERT ON unified_tasks FOR EACH ROW EXECUTE FUNCTION refuse_second();`,
    );
    try {
      await expect(raise()).rejects.toThrow();
    } finally {
      await holder.pg.exec('DROP TRIGGER refuse_second ON unified_tasks; DROP FUNCTION refuse_second();');
    }

    expect(await board(), 'part of the selection was raised').toEqual([]);
    expect(await createRows(), 'a row outlived its task').toEqual([]);
  });
});
