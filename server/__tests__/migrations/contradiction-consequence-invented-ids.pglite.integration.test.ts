/**
 * migrations/20261015b_contradiction_consequence_invented_ids.sql withdraws
 * the records of contradiction consequences that were never carried out, and
 * nothing else.
 *
 * The old consequence paths returned ids they made up
 * (`thread_contradiction_<finding>_<ms>`, `memo_<finding>`, …) and recorded
 * them as executed on the finding, the consequence log and the decision
 * receipt; the auto-trigger logged "auto_created_*" for objects it never
 * created. Run here as the real file, on both shapes the tables can have
 * (install-fresh's creator and the deploy set's, which CHECKs
 * execution_status), twice, as every deploy re-runs it.
 */
import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const sql = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
const CORRECTION = sql('migrations/20261015b_contradiction_consequence_invented_ids.sql');
const SHARED = [
  'db/migrations/20260323_reactive_dependency_layer.sql',
  'db/migrations/20260325_decision_receipts.sql',
];
const LINEAGES = {
  'install-fresh creator': ['migrations/20260524_contradiction_engine_schema.sql', ...SHARED],
  'deploy-set creator': ['db/migrations/20260323_assumption_decision_contradiction.sql', ...SHARED],
};
const T = 120_000;

const F = {
  thread: '00000000-0000-4000-8000-000000000001',
  memoEngine: '00000000-0000-4000-8000-000000000002',
  harmonize: '00000000-0000-4000-8000-000000000003',
  supersessionFailed: '00000000-0000-4000-8000-000000000004',
  escalation: '00000000-0000-4000-8000-000000000005',
  realMemo: '00000000-0000-4000-8000-000000000006',
  realSupersession: '00000000-0000-4000-8000-000000000007',
  otherFindingsId: '00000000-0000-4000-8000-000000000008',
} as const;

/** The consequence object id each finding was left holding. */
const OBJECT_ID: Record<keyof typeof F, string> = {
  thread: `thread_contradiction_${F.thread}_1760000000000`,
  memoEngine: `memo_${F.memoEngine}`,
  harmonize: `harmonize_${F.harmonize}_1760000000000`,
  supersessionFailed: `supersession_failed_${F.supersessionFailed}`,
  escalation: `escalation_${F.escalation}_1760000000000`,
  realMemo: '4321', // a concept2cure_artifacts id
  realSupersession: '9b2e7c1a-3f4d-4e5a-8b6c-7d8e9f0a1b2c', // an assumption
  // An invented-looking id, but another finding's: the patterns are anchored.
  otherFindingsId: `memo_${F.thread}`,
};
const INVENTED: Array<keyof typeof F> = ['thread', 'memoEngine', 'harmonize', 'supersessionFailed', 'escalation'];
const REAL: Array<keyof typeof F> = ['realMemo', 'realSupersession', 'otherFindingsId'];

async function seed(pg: PGlite) {
  for (const [key, id] of Object.entries(F) as Array<[keyof typeof F, string]>) {
    await pg.query(
      `INSERT INTO contradiction_findings (
         id, organization_id, project_id, source_classification,
         object_a_type, object_a_id, object_b_type, object_b_id,
         contradiction_type, severity, truth_hierarchy_level, confidence_level,
         title, description, llm_role,
         consequence_type, consequence_object_id, consequence_executed)
       VALUES ($1, 3, 12, 'structured_record_conflict', 'artifact', '101', 'artifact', '102',
               'parameter_mismatch', 'high', '3', 'high', $2, 'Dose differs', 'none',
               'contradiction_memo', $3, true)`,
      [id, key, OBJECT_ID[key]],
    );
    await pg.query(
      `INSERT INTO contradiction_consequence_log (
         organization_id, finding_id, consequence_type, consequence_object_id,
         consequence_object_type, executed_by, execution_status)
       VALUES (3, $1, 'contradiction_memo', $2, 'contradiction_memo', '7', 'executed')`,
      [id, OBJECT_ID[key]],
    );
    await pg.query(
      `INSERT INTO decision_receipts (
         id, decision_id, project_id, organization_id, confirmation_accepted,
         execution_executed, executed_at, execution_method, affected_objects)
       VALUES ($1, $2, 12, 3, true, true, now(), 'consequence:contradiction_memo', $3::jsonb)`,
      [
        `rcpt-${key}`, `dec-${key}`,
        JSON.stringify([
          { objectType: 'contradiction-link', objectId: id, newState: 'under_review' },
          { objectType: 'contradiction_memo', objectId: OBJECT_ID[key], newState: 'created' },
        ]),
      ],
    );
  }
  // A receipt outside the consequence path keeps its execution, whatever ids it lists.
  await pg.query(
    `INSERT INTO decision_receipts (
       id, decision_id, project_id, organization_id, confirmation_accepted,
       execution_executed, executed_at, execution_method, affected_objects)
     VALUES ('rcpt-promotion', 'dec-promotion', 12, 3, true, true, now(), 'promote', $1::jsonb)`,
    [JSON.stringify([
      { objectType: 'contradiction-link', objectId: F.thread },
      { objectType: 'artifact', objectId: `memo_${F.thread}` },
    ])],
  );

  const propagation = (action: string, impacted: string | null, trigger = 'contradiction_created') =>
    pg.query(
      `INSERT INTO impact_propagation_log (
         organization_id, project_id, trigger_type, trigger_object_type, trigger_object_id,
         action_taken, impacted_object_id, auto_triggered, triggered_by)
       VALUES (3, 12, $1, 'contradiction', $2, $3, $4, true, 'system')`,
      [trigger, F.thread, action, impacted],
    );
  await propagation('auto_created_review_thread', null);
  await propagation('auto_created_contradiction_memo', null);
  await propagation('auto_superseded_assumption', null);
  await propagation('marked_stale', 'artifact-101');
  // A "created" action that names what it created is not the removed writer's.
  await propagation('auto_created_contradiction_memo', '4321');
}

async function state(pg: PGlite) {
  const findings = await pg.query<{ title: string; consequence_executed: boolean; consequence_object_id: string | null }>(
    'SELECT title, consequence_executed, consequence_object_id FROM contradiction_findings');
  const log = await pg.query<{ consequence_object_id: string; execution_status: string; notes: string | null }>(
    'SELECT consequence_object_id, execution_status, notes FROM contradiction_consequence_log');
  const receipts = await pg.query<{ id: string; execution_executed: boolean; executed_at: unknown; execution_error: string | null }>(
    'SELECT id, execution_executed, executed_at, execution_error FROM decision_receipts');
  const propagations = await pg.query<{ action_taken: string; impacted_object_id: string | null }>(
    'SELECT action_taken, impacted_object_id FROM impact_propagation_log ORDER BY action_taken, impacted_object_id');
  return {
    finding: Object.fromEntries(findings.rows.map((r) => [r.title, r])),
    log: Object.fromEntries(log.rows.map((r) => [r.consequence_object_id, r])),
    receipt: Object.fromEntries(receipts.rows.map((r) => [r.id, r])),
    propagations: propagations.rows,
  };
}

describe.each(Object.entries(LINEAGES))('on the %s', (_name, creators) => {
  it('withdraws every invented consequence, keeps every real one, and is idempotent', async () => {
    const pg = new PGlite();
    try {
      for (const rel of creators) await pg.exec(sql(rel));
      await seed(pg);

      let first: Awaited<ReturnType<typeof state>> | null = null;
      for (let deploy = 0; deploy < 2; deploy++) {
        await pg.exec(CORRECTION);
        const s = await state(pg);

        for (const key of INVENTED) {
          expect(s.finding[key], key).toMatchObject({ consequence_executed: false, consequence_object_id: null });
          expect(s.log[OBJECT_ID[key]].execution_status, key).toBe('failed');
          expect(s.log[OBJECT_ID[key]].notes, key).toMatch(/^\[Corrected 2026-10-15: nothing was created/);
          expect(s.receipt[`rcpt-${key}`], key).toMatchObject({ execution_executed: false, executed_at: null });
          expect(s.receipt[`rcpt-${key}`].execution_error, key).toMatch(/the affected object id was invented/);
        }
        for (const key of REAL) {
          expect(s.finding[key], key).toMatchObject({ consequence_executed: true, consequence_object_id: OBJECT_ID[key] });
          expect(s.log[OBJECT_ID[key]], key).toMatchObject({ execution_status: 'executed', notes: null });
          expect(s.receipt[`rcpt-${key}`], key).toMatchObject({ execution_executed: true, execution_error: null });
        }
        expect(s.receipt['rcpt-promotion']).toMatchObject({ execution_executed: true, execution_error: null });
        expect(s.propagations).toEqual([
          { action_taken: 'auto_created_contradiction_memo', impacted_object_id: '4321' },
          { action_taken: 'marked_stale', impacted_object_id: 'artifact-101' },
        ]);

        // A second deploy changes nothing — the note is not appended twice.
        if (first) expect(s).toEqual(first);
        first = s;
      }
    } finally {
      await pg.close();
    }
  }, T);
});
