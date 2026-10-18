/** PM-01/02: native transaction, actuals preservation and concurrency proof.
 * Uses the production pool instrumentation, restricted runtime and FORCE RLS.
 * The three schedule tables use their actual creating migration. Parent/stage
 * tables and tenant-aware keys below are narrow fixtures, not deploy-schema or
 * 20260728 migration proof. No provider, notification or production data is used.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { databaseUrl } from '../setup.db';
import { setupSchedulerDb, waitFor, type SchedulerDb } from './scheduler-harness';
import { generateSchedule } from '../../server/services/projects/schedule-of-events/generator';
import type { GenerateScheduleParams, ScheduleOfEventsView } from '../../server/services/projects/schedule-of-events/service';

vi.mock('../../server/services/notifications/notification-service', () => ({ createNotification: vi.fn() }));

const SOURCE = 'ana_schedule_of_events';
const ORG = 71;
const PROJECT = 710;
const TABLES = ['project_schedule_of_events', 'project_workflow_stages', 'project_schedule_goals', 'project_schedule_revisions', 'project_tasks'];
const migration = readFileSync(new URL('../../db/migrations/20260617_project_schedule_of_events.sql', import.meta.url), 'utf8');
const DDL = `
CREATE TABLE organizations (id integer PRIMARY KEY);
CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer NOT NULL REFERENCES organizations(id), UNIQUE (id, organization_id));
CREATE TABLE project_workflow_stages (
  id serial PRIMARY KEY, organization_id integer NOT NULL, project_id integer NOT NULL,
  name text NOT NULL, description text, "order" integer, status text,
  start_date timestamp, end_date timestamp, due_date timestamp, auto_advance boolean,
  critical_to_quality_factors json, completion_criteria json, assignees text[], reviewers text[],
  approval_status text DEFAULT 'not-started', settings json,
  metadata json, created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
);
CREATE TABLE project_tasks (id serial PRIMARY KEY, organization_id integer NOT NULL, project_id integer NOT NULL,
  workflow_stage_id integer REFERENCES project_workflow_stages(id), name text NOT NULL);
${migration}
-- Minimal fixture of the live arbiter; the public-qualified July migration
-- cannot run unchanged in a scratch schema. This suite tests transactions.
DROP INDEX unique_project_schedule;
CREATE UNIQUE INDEX unique_project_schedule_org ON project_schedule_of_events (organization_id, project_id);
ALTER TABLE project_schedule_of_events ADD FOREIGN KEY (project_id, organization_id) REFERENCES projects(id, organization_id);
CREATE TABLE pm01_fault (phase text NOT NULL DEFAULT '', fired boolean NOT NULL DEFAULT false);
INSERT INTO pm01_fault DEFAULT VALUES;
CREATE FUNCTION pm01_write_fault() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE phase text;
BEGIN
  SELECT f.phase INTO phase FROM pm01_fault f;
  IF (phase = 'stage' AND TG_TABLE_NAME = 'project_workflow_stages' AND NEW."order" = 2) THEN
    RAISE EXCEPTION 'pm01 injected stage failure';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pm01_stage BEFORE INSERT OR UPDATE ON project_workflow_stages FOR EACH ROW EXECUTE FUNCTION pm01_write_fault();
CREATE FUNCTION pm01_goal_fault() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE phase text;
BEGIN
  SELECT f.phase INTO phase FROM pm01_fault f;
  IF (phase = 'goal_retire' AND TG_OP = 'UPDATE' AND NEW.status = 'revised')
     OR (phase = 'goal_insert' AND TG_OP = 'INSERT') THEN
    RAISE EXCEPTION 'pm01 injected goal failure';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pm01_goal BEFORE INSERT OR UPDATE ON project_schedule_goals FOR EACH ROW EXECUTE FUNCTION pm01_goal_fault();
CREATE FUNCTION pm01_revision_fault() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE phase text;
BEGIN
  SELECT f.phase INTO phase FROM pm01_fault f;
  IF phase = 'revision' THEN RAISE EXCEPTION 'pm01 injected revision failure'; END IF;
  IF phase = 'response' THEN UPDATE pm01_fault SET fired = true; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pm01_revision BEFORE INSERT ON project_schedule_revisions FOR EACH ROW EXECUTE FUNCTION pm01_revision_fault();
CREATE FUNCTION pm01_read_ok() RETURNS boolean LANGUAGE plpgsql VOLATILE SET search_path FROM CURRENT AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM pm01_fault WHERE phase = 'response' AND fired) THEN
    RAISE EXCEPTION 'pm01 injected response read failure';
  END IF;
  RETURN true;
END $$;
CREATE POLICY pm01_response_read ON project_schedule_of_events AS RESTRICTIVE FOR SELECT USING (pm01_read_ok());
`;

let env: SchedulerDb;
let runtime: typeof import('../../server/db/runtime');
let store: typeof import('../../server/db/tenantStore');
let service: typeof import('../../server/services/projects/schedule-of-events/service');

const params = (extra: Partial<GenerateScheduleParams> = {}): GenerateScheduleParams => ({
  orgId: ORG, projectId: PROJECT, projectType: 'IND', baselineDate: new Date('2031-01-01T00:00:00Z'),
  goals: [{ title: 'Original filing goal', priority: 'high', metric: 'One approved filing' }],
  triggeredBy: 'pm01-native-test', ...extra,
});
const scoped = <T>(orgId: number, fn: () => T): T => store.runWithTenantScope({
  tenantId: String(orgId), role: 'admin', source: 'test', caller: 'pm01-native-test',
}, fn);
const generate = (input = params()) => scoped(input.orgId, () => service.generateProjectSchedule(input));
function stableView(view: ScheduleOfEventsView) {
  const { assessedAt, ...health } = view.health;
  expect(Number.isFinite(Date.parse(assessedAt))).toBe(true);
  return { ...view, health };
}

async function rows(table: string, clause = '', values: unknown[] = []): Promise<Record<string, any>[]> {
  const result = await env.owner.query(`SELECT to_jsonb(t) AS row FROM ${env.t(table)} t ${clause} ORDER BY id`, values);
  return result.rows.map(r => r.row);
}
async function snapshot() {
  return Object.fromEntries(await Promise.all(TABLES.map(async table => [table, await rows(table)])));
}
async function outsideTarget() {
  return Object.fromEntries(await Promise.all(TABLES.map(async table => [table, await rows(table,
    `WHERE organization_id <> $1 OR project_id <> $2${table === 'project_workflow_stages' ? " OR metadata->>'source' IS DISTINCT FROM $3" : ''}`,
    table === 'project_workflow_stages' ? [ORG, PROJECT, SOURCE] : [ORG, PROJECT],
  )])));
}
async function setFault(phase: string) {
  await env.owner.query(`UPDATE ${env.t('pm01_fault')} SET phase = $1, fired = false`, [phase]);
}
// Driver-shaped rows match JSON.stringify of the service's full-row snapshots
// (pg decodes timestamps as Date; SQL to_jsonb(timestamp) does not append Z).
async function driverRows(table: string) {
  const result = await env.owner.query(`SELECT * FROM ${env.t(table)} WHERE organization_id=$1 AND project_id=$2 ORDER BY id`, [ORG, PROJECT]);
  return JSON.parse(JSON.stringify(result.rows)) as Record<string, any>[];
}
async function stagePatch(key: string, metadata: Record<string, unknown>, status = 'blocked') {
  const result = await env.owner.query(`UPDATE ${env.t('project_workflow_stages')}
    SET status=$1, metadata=(metadata::jsonb || $2::jsonb)::json,
        end_date='2030-12-31 12:34:56.789', assignees=ARRAY['qa-author'], reviewers=ARRAY['qa-reviewer'],
        settings='{"localSetting":true}', completion_criteria='{"reviewRequired":true}',
        critical_to_quality_factors='["synthetic QA check"]', approval_status='pending', auto_advance=true
    WHERE organization_id=$3 AND project_id=$4 AND metadata->>'key'=$5 RETURNING id`,
  [status, JSON.stringify(metadata), ORG, PROJECT, key]);
  return Number(result.rows[0].id);
}
async function completedWithTask() {
  const id = await stagePatch('kickoff', { scheduleStatus: 'completed', progress: 83,
    completedAt: '2030-12-31T12:34:56.789Z', lastAmendNote: 'Synthetic retained actual.', custom: { untouched: ['one', 'two'] } }, 'completed');
  await env.owner.query(`INSERT INTO ${env.t('project_tasks')} (organization_id,project_id,workflow_stage_id,name)
    VALUES ($1,$2,$3,'Synthetic linked work')`, [ORG, PROJECT, id]);
  return id;
}
async function physicalStage(id: number) {
  return (await env.owner.query(`SELECT to_jsonb(t) AS row, xmin::text AS xmin, ctid::text AS ctid, metadata::text AS metadata_text
    FROM ${env.t('project_workflow_stages')} t WHERE id=$1`, [id])).rows[0];
}
async function addHistory() {
  await env.owner.query(`INSERT INTO ${env.t('project_schedule_goals')}
    (organization_id, project_id, schedule_id, title, status)
    SELECT organization_id, project_id, id, 'Retained ' || s, s
    FROM ${env.t('project_schedule_of_events')}, unnest(ARRAY['achieved','dropped','revised']) s
    WHERE organization_id=$1 AND project_id=$2`, [ORG, PROJECT]);
}

beforeAll(async () => {
  env = await setupSchedulerDb(databaseUrl, 'dbpm01', DDL, TABLES);
  await env.owner.query(`INSERT INTO ${env.t('organizations')} VALUES (71),(72)`);
  await env.owner.query(`INSERT INTO ${env.t('projects')} VALUES (710,71),(711,71),(720,72)`);
  // The pool reads APP_DATABASE_URL + PGOPTIONS only at import time.
  runtime = await import('../../server/db/runtime');
  store = await import('../../server/db/tenantStore');
  service = await import('../../server/services/projects/schedule-of-events/service');
  const proof = await scoped(ORG, () => runtime.getPool().query(
    "SELECT current_user AS role, rolsuper, rolbypassrls, current_setting('app.rls_enforce') AS rls FROM pg_roles WHERE rolname=current_user",
  ));
  expect(proof.rows[0]).toEqual({ role: env.runtimeRole, rolsuper: false, rolbypassrls: false, rls: 'on' });
}, 120_000);

beforeEach(async () => {
  await setFault('');
  await env.owner.query(`TRUNCATE ${TABLES.map(t => env.t(t)).join(', ')} RESTART IDENTITY`);
});

afterAll(async () => {
  if (runtime) await runtime.getPool().end();
  if (env) await env.destroy();
});

describe('schedule generation is one native transaction', () => {
  it.each(['stage', 'goal_retire', 'goal_insert', 'revision', 'response'])(
    '%s failure restores the exact existing plan, milestones, goals and revision history', async phase => {
      await generate();
      await addHistory();
      await generate(params({ projectId: 711 }));
      await generate(params({ orgId: 72, projectId: 720 }));
      await env.owner.query(`INSERT INTO ${env.t('project_workflow_stages')}
        (organization_id,project_id,name,metadata) VALUES ($1,$2,'Independent workflow stage','{"source":"manual"}')`, [ORG, PROJECT]);
      const before = await snapshot();
      await setFault(phase);
      await expect(generate(params({ baselineDate: new Date('2032-01-01Z'), goals: [{ title: 'Replacement goal' }] }))).rejects.toThrow(/pm01 injected/);
      expect(await snapshot()).toEqual(before);
      await setFault('');
      // A rolled-back failure must release a usable connection and plan lock.
      expect((await generate()).plan?.version).toBe(2);
    },
  );

  it('a first-generation failure leaves no header, milestone, goal or revision', async () => {
    const before = await snapshot();
    await setFault('stage');
    await expect(generate()).rejects.toThrow('pm01 injected stage failure');
    expect(await snapshot()).toEqual(before);
    await setFault('');
    expect((await generate()).plan?.version).toBe(1);
  });

  it('returns the committed full view, retains plan identity and increments the version once', async () => {
    const first = await generate();
    await addHistory();
    await generate(params({ projectId: 711 }));
    await generate(params({ orgId: 72, projectId: 720 }));
    await env.owner.query(`INSERT INTO ${env.t('project_workflow_stages')}
      (organization_id,project_id,name,metadata) VALUES ($1,$2,'Manual stage','{"source":"manual"}')`, [ORG, PROJECT]);
    const unrelated = await outsideTarget();
    const input = params({ baselineDate: new Date('2032-01-01Z'), createdByAna: false, goals: [{ title: 'Revised target', priority: 'critical', metric: 'Approved dossier' }] });
    const result = await generate(input);
    const expected = generateSchedule(input);
    expect(result.plan).toMatchObject({ id: first.plan!.id, version: 2, projectType: 'IND', generatedByAna: false,
      baselineDate: expected.baselineDate.toISOString(), targetDate: expected.targetDate.toISOString(),
      basisSummary: expected.basisSummary, regulatoryFramework: expected.framework, confidence: expected.confidence });
    expect(result.milestones.map(m => m.key)).toEqual(expected.milestones.map(m => m.key));
    expect(new Set(result.milestones.map(m => m.id)).size).toBe(expected.milestones.length);
    expect(result.milestones.every(m => m.status === 'not_started' && m.progress === 0)).toBe(true);
    expect(result.revisions).toHaveLength(2);
    expect(result.revisions.every(r => r.revisionType === 'generated' && r.id > 0)).toBe(true);
    expect(result.goals.filter(g => g.status === 'active').map(g => g.title)).toEqual(['Revised target']);
    expect(result.goals.find(g => g.title === 'Original filing goal')?.status).toBe('revised');
    for (const status of ['achieved', 'dropped', 'revised']) {
      expect(result.goals.find(g => g.title === `Retained ${status}`)?.status).toBe(status);
    }
    expect(result.health.milestones).toHaveLength(expected.milestones.length);
    expect(stableView(await scoped(ORG, () => service.getScheduleOfEvents(ORG, PROJECT)))).toEqual(stableView(result));
    expect(await outsideTarget()).toEqual(unrelated);
  });

  it.each([
    { label: 'omitted', goals: undefined },
    { label: 'empty', goals: [] },
  ])('preserves existing goal rows when goals are $label', async ({ goals }) => {
    await generate();
    await addHistory();
    const before = await rows('project_schedule_goals');
    const result = await generate(params({ goals }));
    expect(await rows('project_schedule_goals')).toEqual(before);
    expect(result.goals).toHaveLength(before.length);
    expect((await rows('project_schedule_of_events'))[0].goals).toEqual([]);
    expect(result.plan?.version).toBe(2);
  });
});

describe('PM-02 preserves milestone identity and execution records', () => {
  it.each([
    { marker: 'row.status only', status: 'completed', metadataStatus: 'not_started' },
    { marker: 'metadata.scheduleStatus only', status: 'pending', metadataStatus: 'completed' },
  ])('preserves $marker without a task FK or fabricated completion fields', async ({ status, metadataStatus }) => {
    await generate();
    const changed = await env.owner.query(`UPDATE ${env.t('project_workflow_stages')}
      SET status=$1, metadata=jsonb_set(metadata::jsonb-'progress'-'completedAt','{scheduleStatus}',to_jsonb($2::text))::json
      WHERE organization_id=$3 AND project_id=$4 AND metadata->>'key'='kickoff' RETURNING id`,
    [status, metadataStatus, ORG, PROJECT]);
    const id = Number(changed.rows[0].id);
    const before = await physicalStage(id);
    expect(await rows('project_tasks')).toEqual([]);
    const input = params({ baselineDate: new Date('2032-01-01Z') });
    expect(generateSchedule(input).milestones[0].targetDate.toISOString()).not.toBe(new Date(before.row.due_date).toISOString());
    const result = await generate(input);
    expect(result.milestones.find(m => m.id === id)).toMatchObject({ status: 'completed', progress: 0, completedAt: null });
    expect(await physicalStage(id)).toEqual(before);
    const stored = (await physicalStage(id)).row.metadata;
    expect(stored).not.toHaveProperty('completedAt');
    expect(stored).not.toHaveProperty('progress');
  });

  it('leaves a completed row physically unchanged, keeps its task FK, and changes only allowed planning fields elsewhere', async () => {
    await generate();
    const completedId = await completedWithTask();
    const blockedId = await stagePatch('internal_qc', { scheduleStatus: 'blocked', progress: 37,
      lastAmendNote: 'Waiting for a synthetic report.', lastNotifiedStatus: 'blocked',
      dependsOn: ['nonclinical', 'cmc_dev', 'clinical_protocol'], custom: { retained: true } });
    const actual = await physicalStage(completedId);
    const before = await driverRows('project_workflow_stages');
    const tasks = await rows('project_tasks');
    const result = await generate(params({ baselineDate: new Date('2032-01-01Z') }));
    expect(await physicalStage(completedId)).toEqual(actual);
    expect(await rows('project_tasks')).toEqual(tasks);
    const after = await driverRows('project_workflow_stages');
    expect(after.map(s => s.id)).toEqual(before.map(s => s.id));
    const old = before.find(s => s.id === blockedId)!;
    const next = after.find(s => s.id === blockedId)!;
    const proposed = generateSchedule(params({ baselineDate: new Date('2032-01-01Z') })).milestones.find(m => m.key === 'internal_qc')!;
    expect(next.due_date).toBe(proposed.targetDate.toISOString());
    expect(next.metadata.anaRationale).toBe(proposed.anaRationale);
    expect({ ...next, due_date: old.due_date, updated_at: old.updated_at,
      metadata: { ...next.metadata, anaRationale: old.metadata.anaRationale } }).toEqual(old);
    expect(result.milestones.find(m => m.id === completedId)).toMatchObject({ status: 'completed', progress: 83, completedAt: '2030-12-31T12:34:56.789Z' });
    expect(result.milestones.find(m => m.id === blockedId)).toMatchObject({ status: 'blocked', progress: 37, completedAt: null });
  });

  it('accepts a canonical pathway alias without replacing the existing completed milestone', async () => {
    await generate(params({ projectType: '510K' }));
    const id = await completedWithTask();
    const before = await physicalStage(id);
    const result = await generate(params({ projectType: '510(k)', baselineDate: new Date('2032-01-01Z') }));
    expect(result.plan).toMatchObject({ version: 2, projectType: '510K', regulatoryFramework: 'FDA' });
    expect(await physicalStage(id)).toEqual(before);
  });
});

describe('PM-02 records the previous baseline and new work', () => {
  it('records the exact prior rows, proposal, version transition and supplied reason; genuinely new keys start uncompleted', async () => {
    const initial = await generate();
    const firstDetail = initial.revisions[0].detail as any;
    expect(firstDetail).toMatchObject({ before: { plan: null, milestones: [] }, fromVersion: null, toVersion: 1, reason: null, preservedMilestoneIds: [] });
    await completedWithTask();
    // Model an earlier template which lacked this requirement. The current
    // proposal introduces it; no history or completion is invented for it.
    const missingKey = 'nonclinical';
    await env.owner.query(`DELETE FROM ${env.t('project_workflow_stages')} WHERE metadata->>'key'=$1`, [missingKey]);
    const beforePlan = (await driverRows('project_schedule_of_events'))[0];
    const beforeMilestones = await driverRows('project_workflow_stages');
    const previousRevisions = await rows('project_schedule_revisions');
    const reason = '  Replan after the synthetic source delivery date changed.  ';
    const input = params({ baselineDate: new Date('2032-01-01Z'), reason });
    const result = await generate(input);
    const revisions = await rows('project_schedule_revisions');
    expect(revisions.slice(0, -1)).toEqual(previousRevisions);
    expect(revisions.at(-1)!.detail).toMatchObject({ before: { plan: beforePlan, milestones: beforeMilestones },
      fromVersion: 1, toVersion: 2, reason: reason.trim(), preservedMilestoneIds: beforeMilestones.map(m => m.id), newMilestoneKeys: [missingKey] });
    expect(revisions.at(-1)!.detail.before).toEqual({ plan: beforePlan, milestones: beforeMilestones });
    expect(revisions.at(-1)!.detail.proposal).toEqual(JSON.parse(JSON.stringify(generateSchedule(input))));
    const fresh = result.milestones.find(m => m.key === missingKey)!;
    expect(fresh).toMatchObject({ status: 'not_started', progress: 0, completedAt: null });
    expect(beforeMilestones.some(m => m.id === fresh.id)).toBe(false);
  });
});

describe('PM-02 refuses conflicts and rolls back failed replanning', () => {
  it.each([
    { label: 'pathway', projectType: 'NDA' },
    { label: 'framework', sql: "UPDATE project_schedule_of_events SET regulatory_framework='EMA'" },
    { label: 'title', sql: "UPDATE project_workflow_stages SET name=name || ' changed' WHERE metadata->>'key'='nonclinical'" },
    { label: 'description', sql: "UPDATE project_workflow_stages SET description='A different requirement' WHERE metadata->>'key'='nonclinical'" },
    { label: 'category', sql: "UPDATE project_workflow_stages SET metadata=jsonb_set(metadata::jsonb,'{category}','\"internal\"')::json WHERE metadata->>'key'='nonclinical'" },
    { label: 'regulatory basis', sql: "UPDATE project_workflow_stages SET metadata=jsonb_set(metadata::jsonb,'{regulatoryBasis}','\"Different basis\"')::json WHERE metadata->>'key'='nonclinical'" },
    { label: 'dependencies', sql: "UPDATE project_workflow_stages SET metadata=jsonb_set(metadata::jsonb,'{dependsOn}','[]')::json WHERE metadata->>'key'='nonclinical'" },
    { label: 'removed key', sql: "UPDATE project_workflow_stages SET metadata=jsonb_set(metadata::jsonb,'{key}','\"removed-key\"')::json WHERE metadata->>'key'='nonclinical'" },
    { label: 'missing key', sql: "UPDATE project_workflow_stages SET metadata=(metadata::jsonb-'key')::json WHERE metadata->>'key'='nonclinical'" },
    { label: 'duplicate key', sql: "INSERT INTO project_workflow_stages (organization_id,project_id,name,\"order\",status,metadata) SELECT organization_id,project_id,name,\"order\",status,metadata FROM project_workflow_stages WHERE metadata->>'key'='nonclinical'" },
    { label: 'orphan rows', sql: 'DELETE FROM project_schedule_goals; DELETE FROM project_schedule_revisions; DELETE FROM project_schedule_of_events' },
  ])('refuses $label changes without altering plan, actuals, goals or revisions', async ({ sql, projectType }) => {
    await generate();
    await completedWithTask();
    if (sql) {
      const client = await env.owner.connect();
      try { await client.query(`SET search_path TO ${env.schema}`); await client.query(sql); }
      finally { await client.query('RESET search_path'); client.release(); }
    }
    const before = await snapshot();
    await expect(generate(params({ projectType: projectType ?? 'IND', baselineDate: new Date('2032-01-01Z') })))
      .rejects.toMatchObject({ name: 'SchedulePreservationConflict' });
    expect(await snapshot()).toEqual(before);
  });

  it.each(['revision', 'response'])('a late %s fault rolls back preserved actuals, FK references and newly planned dates', async phase => {
    await generate();
    const id = await completedWithTask();
    await stagePatch('internal_qc', { scheduleStatus: 'blocked', progress: 37, lastAmendNote: 'Keep this note.' });
    const before = await snapshot();
    const physical = await physicalStage(id);
    await setFault(phase);
    await expect(generate(params({ baselineDate: new Date('2032-01-01Z') }))).rejects.toThrow(/pm01 injected/);
    expect(await snapshot()).toEqual(before);
    expect(await physicalStage(id)).toEqual(physical);
  });
});

describe('same-project generation serializes across actual PostgreSQL clients', () => {
  it.each([true, false])('produces complete per-call views and one final milestone set (existing plan: %s)', async existing => {
    const initial = existing ? await generate() : null;
    const completedId = existing ? await completedWithTask() : null;
    const actual = completedId ? await physicalStage(completedId) : null;
    const inputs = [
      params({ baselineDate: new Date('2032-01-01Z'), goals: [{ title: 'Concurrent A' }] }),
      params({ baselineDate: new Date('2033-01-01Z'), goals: [{ title: 'Concurrent B' }] }),
    ];
    const holder = await env.owner.connect();
    let pending: Promise<{ value?: ScheduleOfEventsView; error?: unknown }>[] = [];
    let released = false;
    try {
      await holder.query('BEGIN');
      const holderPid = Number((await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
      // The common parent lock exists before either first-generation header.
      await holder.query(`SELECT id FROM ${env.t('projects')} WHERE organization_id=$1 AND id=$2 FOR UPDATE`, [ORG, PROJECT]);
      pending = inputs.map(input => generate(input).then(value => ({ value }), error => ({ error })));
      let contenders: number[] = [];
      const overlapped = await waitFor(async () => {
        const activity = await env.owner.query(`SELECT pid, pg_blocking_pids(pid) AS blockers
          FROM pg_stat_activity WHERE datname=current_database() AND usename=$1
          AND wait_event_type='Lock' AND query LIKE '%projects%' AND query LIKE '%FOR UPDATE%'`, [env.runtimeRole]);
        contenders = activity.rows.map(r => Number(r.pid));
        return contenders.length === 2 && new Set(contenders).size === 2
          && activity.rows.every(r => r.blockers.some((pid: number) => pid === holderPid || contenders.includes(pid)));
      }, 10_000);
      // Release before asserting so an old/failing implementation cannot leave
      // requests blocked while the test tears down its pool.
      await holder.query('COMMIT');
      released = true;
      expect(overlapped, 'two distinct runtime backends must be observed waiting on native locks').toBe(true);
      const settled = await Promise.all(pending);
      expect(settled.map(s => s.error)).toEqual([undefined, undefined]);
      const results = settled.map(s => s.value!);
      expect(results.map(r => r.plan!.version).sort()).toEqual(existing ? [2, 3] : [1, 2]);
      expect(new Set(results.map(r => r.plan!.id)).size).toBe(1);
      if (initial) expect(results[0].plan!.id).toBe(initial.plan!.id);
      for (const [index, result] of results.entries()) {
        expect(result.plan!.projectType).toBe(inputs[index].projectType);
        expect(result.plan!.baselineDate).toBe(inputs[index].baselineDate!.toISOString());
        expect(result.milestones.map(m => m.key)).toEqual(generateSchedule(inputs[index]).milestones.map(m => m.key));
        expect(result.goals.filter(g => g.status === 'active').map(g => g.title)).toEqual([inputs[index].goals![0].title]);
        expect(result.revisions).toHaveLength(result.plan!.version);
        const detail = result.revisions.find(r => (r.detail as any)?.toVersion === result.plan!.version)?.detail as any;
        expect(detail.fromVersion).toBe(result.plan!.version === 1 ? null : result.plan!.version - 1);
        if (existing) {
          expect(detail.before.plan.version).toBe(result.plan!.version - 1);
          expect(detail.before.milestones.find((m: any) => m.id === completedId).metadata.completedAt).toBe('2030-12-31T12:34:56.789Z');
        }
      }
      const winner = results.reduce((a, b) => a.plan!.version > b.plan!.version ? a : b);
      const final = await scoped(ORG, () => service.getScheduleOfEvents(ORG, PROJECT));
      expect(stableView(final)).toEqual(stableView(winner));
      const stages = await rows('project_workflow_stages');
      expect(stages).toHaveLength(winner.milestones.length);
      expect(new Set(stages.map(s => s.metadata.key)).size).toBe(stages.length);
      if (completedId) expect(await physicalStage(completedId)).toEqual(actual);
    } finally {
      if (!released) await holder.query('ROLLBACK').catch(() => undefined);
      holder.release();
      await Promise.all(pending);
    }
  });
});
