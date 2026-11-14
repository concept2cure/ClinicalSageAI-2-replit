/**
 * A critical statistical finding's escalation reaches the task board, with its
 * task.create row — or nothing is raised and the answer says so. PGlite, a real
 * engine: the properties are "the row exists" and atomicity.
 *
 * WHAT WENT WRONG
 * `WorkflowIntegrator.createEscalationTask` runs when the judgment says
 * "escalate" (POST /api/ana-biostats/workflow, and AnA's SAP generation). It
 * inserted into `concept2cure_review_tasks`, the review workflow's own store,
 * with `{ organizationId, artifactId, title, description, taskType, status,
 * priority, metadata, createdById } as any`. That table requires task_id,
 * org_id, project_id and created_by_name, none of which the insert named, and
 * has no organizationId, priority or metadata column. The insert could not
 * succeed. Every escalation of a critical-risk design was answered "Escalation
 * task creation failed" and reached nobody. The first case below runs that
 * insert on the table's own DDL.
 *
 * The same escalation already had a canonical shape: the bridge's
 * `action:escalate` task, a Biostatistics task on `unified_tasks`
 * (biostatistics-bridge/task-blueprint.ts). This one writer now raises that,
 * through the same creator and the same ledger call, on one transaction.
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
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const schema = await import('../../../../shared/schema');
  const { pglitePool } = await import('../../ana-ri/__tests__/pglite-pool.fixture');
  const pool = pglitePool(() => holder.pg);
  return { pool, getPool: () => pool, db: drizzle(pool.client as never, { schema }) };
});

import { db } from '../../../db';
import * as schema from '../../../../shared/schema';
import { WorkflowIntegrator } from '../workflow-integrator';

const TASKS_DDL = [
  extractTableDdl('migrations/0000_sweet_joseph.sql', ['unified_tasks']),
  ...[
    'db/migrations/20260727_unified_tasks_mdx_metadata.sql',
    'db/migrations/20260807_unified_tasks_soft_delete.sql',
    'migrations/20261023_review_routes.sql',
    'migrations/20261109_unified_tasks_parent_task.sql',
  ].map((f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8')),
].join('\n');

/* The review workflow's table, from its own migration. Its foreign keys are
   dropped (their tables are not under test); every NOT NULL stays. */
const REVIEW_TASKS_DDL = extractTableDdl('migrations/phase13_review_threads_tasks.sql', ['concept2cure_review_tasks'])
  .replace(/ REFERENCES \w+\(\w+\)( ON DELETE (CASCADE|SET NULL))?/g, '');

const ORG = 9;
const USER = 5;
const ARTIFACT = 41;
const DOCUMENT = {
  organizationId: ORG,
  projectId: 12,
  createdBy: USER,
  title: 'Statistical Analysis Plan — BX-204',
  content: '# SAP\n\nThe primary analysis is an MMRM.\n',
  type: 'full_statistical_analysis_plan',
};
const JUDGMENT = {
  overallRisk: 'critical',
  overallVerdict: 'inadequate',
  actionRecommendation: 'escalate',
  escalationReasons: ['Power below 0.7 at the stated effect', 'No multiplicity control'],
  dimensions: [{ name: 'Power adequacy', verdict: 'inadequate', flags: ['ICH E9'] }],
  roleExplanations: { regulatory: 'The design is not defensible as stated.' },
};

type Result = { action: string; success: boolean; message: string; editorUrl?: string; artifactId?: number };
const integrator = () => new WorkflowIntegrator() as unknown as {
  createEscalationTask: (d: unknown, j: unknown, a: number | null) => Promise<Result>;
  createReviewThread: (d: unknown, j: unknown, a?: number) => Promise<Result>;
  attachToDossier: (a: number, section: number, org: number, user: number) => Promise<Result>;
  prepareEditorHandoff: (d: unknown, a?: number) => Result;
  executeWorkflowActions: (d: unknown, j: unknown, o: Record<string, unknown>) => Promise<Result[]>;
};
const escalate = (document: Record<string, unknown> = DOCUMENT, judgment: Record<string, unknown> = JUDGMENT, artifact: number | null = ARTIFACT) =>
  integrator().createEscalationTask(document, judgment, artifact);
/** A document complete enough for the artifact step to reach its insert. */
const FULL_DOCUMENT = {
  ...DOCUMENT, version: 1, status: 'draft',
  metadata: { clientTrack: 'biotech_pharma', regulatoryBody: 'FDA', studyType: 'superiority', tags: [] },
  provenance: { engineVersion: '1.0.0', generatedAt: '2026-11-12T00:00:00.000Z' },
};
const LEAK = /Failed query|insert into|select |params:|null value|violates|relation|does not exist/i;

const run = (sql: string, params: unknown[] = []) => holder.pg.query<Record<string, any>>(sql, params);
const board = async () => (await run(
  `SELECT task_id, module_type, title, description, priority, task_type, category, status, organization_id, project_id,
          created_by_id, source_entity_type, source_entity_id, metadata->>'blueprintKey' AS key, metadata->>'riskLevel' AS risk
     FROM unified_tasks ORDER BY id`,
)).rows;
const createRows = async () => (await run(`SELECT target, proposed_by FROM c2c_ana_actions WHERE command = 'task.create'`)).rows;
const reviewTasks = async () => (await run('SELECT id FROM concept2cure_review_tasks')).rows;

beforeAll(async () => {
  holder.pg = new PGlite();
  await holder.pg.exec(TASKS_DDL);
  await holder.pg.exec(REVIEW_TASKS_DDL);
  await holder.pg.exec(AUDIT_LOGS_PGLITE_DDL);
  await holder.pg.exec(GOVERNED_ACTION_LEDGER_PGLITE_DDL);
}, 60_000);
afterAll(async () => {
  await holder.pg?.close();
});
beforeEach(async () => {
  await holder.pg.exec('DELETE FROM unified_tasks; DELETE FROM c2c_ana_actions; DELETE FROM audit_logs; DELETE FROM concept2cure_review_tasks;');
});

describe('the insert it used to make', () => {
  it('cannot succeed on the review-task table’s own DDL: four required columns are never named', async () => {
    const old = (db as any).insert((schema as any).concept2cureReviewTasks).values({
      organizationId: ORG,
      artifactId: ARTIFACT,
      title: `Statistical Escalation: ${DOCUMENT.title}`,
      description: 'Statistical analysis identified critical risk.',
      taskType: 'review_task',
      status: 'open',
      priority: 'critical',
      metadata: { escalationType: 'biostatistics' },
      createdById: USER,
    }).returning();
    await expect(old).rejects.toThrow();
    expect(await reviewTasks()).toEqual([]);
  });
});

describe('a critical statistical finding’s escalation', () => {
  it('reaches the task board as a Biostatistics task naming its creator, its project and the document it is about', async () => {
    const out = await escalate();

    const tasks = await board();
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      module_type: 'Biostatistics', priority: 'critical', task_type: 'review', category: 'review', status: 'pending',
      organization_id: ORG, project_id: 12, created_by_id: USER,
      source_entity_type: 'statistical_artifact', source_entity_id: String(ARTIFACT),
      key: 'action:escalate', risk: 'critical',
    });
    expect(tasks[0].title).toBe(`Escalate "${DOCUMENT.title}" to the lead biostatistician`);
    expect(tasks[0].description).toContain('Power below 0.7 at the stated effect; No multiplicity control');
    expect(out).toEqual({
      action: 'create_follow_up_task',
      success: true,
      message: `Escalation raised on the task board: ${tasks[0].title} (${tasks[0].task_id})`,
    });
  });

  it('carries its task.create row, by the person who ran the review', async () => {
    await escalate();
    const [task] = await board();
    expect(await createRows()).toEqual([{ target: `task:${task.task_id}`, proposed_by: expect.anything() }]);
    expect(Number((await createRows())[0].proposed_by)).toBe(USER);
  });

  it('writes nothing to the review workflow’s own store', async () => {
    await escalate();
    expect(await reviewTasks()).toEqual([]);
  });

  it('high risk is a high-priority task; a document on no project is filed on none', async () => {
    await escalate({ ...DOCUMENT, projectId: 0 }, { ...JUDGMENT, overallRisk: 'high' });
    const [task] = await board();
    expect(task).toMatchObject({ priority: 'high', project_id: null, risk: 'high' });
  });

  it('with no escalation reason recorded, it says what the engine said to the regulatory reader', async () => {
    await escalate(DOCUMENT, { ...JUDGMENT, escalationReasons: [] });
    expect((await board())[0].description).toContain('The design is not defensible as stated.');
  });

  it('raised twice for the same document, it is one task', async () => {
    const first = await escalate();
    const second = await escalate();
    const tasks = await board();
    expect(tasks).toHaveLength(1);
    expect(first.success).toBe(true);
    expect(second).toEqual({
      action: 'create_follow_up_task',
      success: true,
      message: `Escalation already on the task board: ${tasks[0].title} (${tasks[0].task_id})`,
    });
    expect(await createRows()).toHaveLength(1);
  });

  it('a different document raises its own', async () => {
    await escalate();
    await escalate(DOCUMENT, JUDGMENT, ARTIFACT + 1);
    expect((await board()).map((t) => t.source_entity_id)).toEqual([String(ARTIFACT), String(ARTIFACT + 1)]);
  });
});

describe('the answer never carries the store’s words', () => {
  it('trunk answered "Escalation task creation failed: Failed query: insert into …" with the statement and its values', async () => {
    const out = await escalate();
    expect(out.message).not.toMatch(/Failed query|insert into|params:|null value|violates/i);
  });
});

describe('all or nothing', () => {
  it('when the ledger cannot be written, no task is raised and the answer is not a success', async () => {
    await holder.pg.exec('ALTER TABLE c2c_ana_actions RENAME TO c2c_ana_actions_away');
    try {
      const out = await escalate();
      expect(out.success).toBe(false);
      expect(out.message).toMatch(/^No escalation task was raised/);
      expect(await board()).toEqual([]);
    } finally {
      await holder.pg.exec('ALTER TABLE c2c_ana_actions_away RENAME TO c2c_ana_actions');
    }
  });

  it('a document that names no creator raises nothing: a task nobody raised is not recorded', async () => {
    const out = await escalate({ ...DOCUMENT, createdBy: undefined });
    expect(out.success).toBe(false);
    expect(await board()).toEqual([]);
    expect(await createRows()).toEqual([]);
  });

  it('the store’s own error text does not reach the answer', async () => {
    await holder.pg.exec('ALTER TABLE unified_tasks RENAME TO unified_tasks_away');
    try {
      const out = await escalate();
      expect(out.success).toBe(false);
      expect(out.message).not.toMatch(/relation|unified_tasks|does not exist|SQL|query|insert into|null value|violates/i);
    } finally {
      await holder.pg.exec('ALTER TABLE unified_tasks_away RENAME TO unified_tasks');
    }
  });
});

describe('the escalation does not wait on the document having been stored', () => {
  /* Here the artifact store does not exist at all, which is how a failed document save looks to
     the workflow: `createArtifact` answers success: false with no id. */
  it('a critical finding whose document failed to save is still raised, and says the document was not stored', async () => {
    const results = await integrator().executeWorkflowActions(FULL_DOCUMENT, JUDGMENT, {});
    expect(results.find((r) => r.action === 'create_artifact')).toMatchObject({ success: false });
    const raised = results.find((r) => r.action === 'create_follow_up_task');
    expect(raised, 'a critical finding raised nothing because its document failed to save').toBeDefined();
    expect(raised!.success).toBe(true);
    const [task] = await board();
    expect(task).toMatchObject({ module_type: 'Biostatistics', priority: 'critical', source_entity_type: 'statistical_document' });
    expect(task.source_entity_id).toMatch(/^[0-9a-f]{64}$/);
    expect(task.description).toContain('The document itself was not stored');
  });

  it('the same text escalated twice is one task; a different text is another', async () => {
    await escalate(DOCUMENT, JUDGMENT, null);
    await escalate(DOCUMENT, JUDGMENT, null);
    expect(await board()).toHaveLength(1);
    await escalate({ ...DOCUMENT, content: '# SAP\n\nRevised.\n' }, JUDGMENT, null);
    expect(await board()).toHaveLength(2);
  });
});

describe('a failed step says what did not happen, in its own words', () => {
  it('the artifact step: no statement, no parameters, no document text', async () => {
    const results = await integrator().executeWorkflowActions(FULL_DOCUMENT, JUDGMENT, {});
    const stored = results.find((r) => r.action === 'create_artifact')!;
    expect(stored.success).toBe(false);
    expect(stored.message).toBe(`The document was not stored: the artifact store could not be written. "${DOCUMENT.title}" exists only in this answer.`);
    expect(stored.message).not.toMatch(LEAK);
    expect(stored.message).not.toContain('The primary analysis is an MMRM');
  });

  it('the review thread and the dossier attachment', async () => {
    const thread = await integrator().createReviewThread(FULL_DOCUMENT, JUDGMENT, ARTIFACT);
    expect(thread).toMatchObject({ success: false, message: 'No review thread was opened: the review store could not be written.' });
    const attached = await integrator().attachToDossier(ARTIFACT, 7, ORG, USER);
    expect(attached.success).toBe(false);
    expect(attached.message).toBe('The document was not attached to dossier section 7: the mapping could not be written.');
    for (const r of [thread, attached]) expect(r.message).not.toMatch(LEAK);
  });

  it('no result of a whole failed run carries the store’s words', async () => {
    const results = await integrator().executeWorkflowActions(FULL_DOCUMENT, JUDGMENT, { reviewRequired: true });
    for (const r of results) expect(r.message, r.action).not.toMatch(LEAK);
  });
});

describe('the hand-off names a place that exists', () => {
  it('a document that was not stored is not "ready for editing"', () => {
    const out = integrator().prepareEditorHandoff(DOCUMENT, undefined);
    expect(out).toEqual({ action: 'open_in_editor', success: false, message: `"${DOCUMENT.title}" was not stored, so there is nothing to open.` });
  });

  it('a stored document is found on Biostatistics, not at a route that was removed', () => {
    const out = integrator().prepareEditorHandoff(DOCUMENT, ARTIFACT);
    expect(out.success).toBe(true);
    expect(out.editorUrl).toBe('/concept2cure/biostatistics');
    expect(out.editorUrl).not.toContain('/concept2cure/editor');
    expect(out.message).toContain('listed under the project’s statistical documents in Biostatistics'.replace('’', "'"));
  });
});
