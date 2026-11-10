/** Actual CAPA service and migration SQL; caller admission/audit are isolated
 * here. Native permission, concurrency and audit qualification remains in
 * tests/db/capa-governed-transactions.dbtest.ts. */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let pg: PGlite;
let db: ReturnType<typeof drizzle>;
const PROGRAM = '11111111-1111-4111-8111-111111111111';
const caller = { userId: 7 };
const context = { organizationId: 1, caller, role: 'member', write: true,
  db: undefined as unknown, q: {}, auditWrites: 0 };
const audit = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../../auditService', () => ({ writeChainedAuditRow: audit }));
vi.mock('../capa-tasks', () => ({ scheduleCapaTask: async () => undefined, scheduleCapaActionTask: async () => undefined }));
vi.mock('../governed-context', () => ({
  capaContext: () => context,
  authorizeCapaProgram: async () => undefined,
  visibleCapaPrograms: async () => [PROGRAM],
  mutateCapa: async (_org: number, _caller: unknown, action: () => Promise<object>) => db.transaction(async tx => {
    context.db = tx;
    const row = await action();
    return { ...row, auditTrail: { persisted: true, chained: true } };
  }),
  readCapa: async (_org: number, _caller: unknown, action: () => Promise<object>) => {
    context.db = db;
    return action();
  },
  CapaAccessError: class extends Error {},
  CapaPersistenceError: class extends Error {},
}));
import { addCapaAction, transitionCapa, transitionCapaAction } from '../capaMdr.service';

beforeAll(async () => {
  pg = new PGlite();
  db = drizzle(pg);
  await pg.exec(readFileSync('migrations/20260504_capa_mdr.sql', 'utf8'));
  await pg.exec(`CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id int NOT NULL);
    INSERT INTO regulatory_programs VALUES ('${PROGRAM}',1)`);
});
afterAll(async () => { await pg?.close(); });
beforeEach(async () => {
  await pg.exec('DELETE FROM vigilance_events; DELETE FROM capa_actions; DELETE FROM capa_records');
  audit.mockClear();
});

async function capa(state = 'effectiveness_check') {
  const id = randomUUID();
  await pg.query(`INSERT INTO capa_records (id,program_id,capa_code,title,type,source,state)
    VALUES ($1,$2,$3,'Closure proof','corrective','nonconformance',$4)`, [id, PROGRAM, id, state]);
  return id;
}
async function action(capaId: string, state: string, evidence: unknown = null) {
  const id = randomUUID();
  await pg.query(`INSERT INTO capa_actions (id,capa_id,n,type,description,state,evidence_refs)
    VALUES ($1,$2,1,'corrective','Recorded action',$3,$4::json)`, [id, capaId, state, JSON.stringify(evidence)]);
  return id;
}
const effective = { outcome: 'effective', narrative: 'No recurrence in the assessed batches.' };
const ineffective = { outcome: 'not_effective', narrative: 'The acceptance criterion was not met.' };
async function snapshot() {
  return (await pg.query(`SELECT jsonb_build_object(
    'capa',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM capa_records c),
    'actions',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM capa_actions a),
    'events',(SELECT jsonb_agg(to_jsonb(v) ORDER BY id) FROM vigilance_events v)) AS value`)).rows[0];
}

describe('CAPA native closure prerequisites', () => {
  it.each([undefined, null, {}, [], 'effective', { outcome: 'effective' },
    { outcome: 'effective', narrative: '  ' }, { outcome: 'not_effective', narrative: 'Failed.' }].map(value => [value]))(
    'refuses effective closure without its matching outcome and narrative: %j', async (result) => {
      const id = await capa();
      const before = await snapshot();
      await expect(transitionCapa(1, id, { to: 'closed_effective', effectivenessCheckResult: result as never }, caller))
        .rejects.toMatchObject({ name: 'InvalidTransitionError', message: expect.stringMatching(/effectiveness/i) });
      expect(await snapshot()).toEqual(before);
      expect(audit).not.toHaveBeenCalled();
    },
  );

  it.each(['planned', 'in_progress', 'blocked', 'cancelled'])(
    'does not call an action plan implemented while an action is %s', async state => {
      const id = await capa('action_planned');
      await action(id, state);
      const before = await snapshot();
      await expect(transitionCapa(1, id, { to: 'action_implemented' }, caller)).rejects.toMatchObject({
        name: 'InvalidTransitionError', message: expect.stringMatching(/action.*done/i),
      });
      expect(await snapshot()).toEqual(before);
    },
  );

  it('rechecks actions for effective closure, including a legacy record already at effectiveness check', async () => {
    const id = await capa();
    await action(id, 'planned');
    await expect(transitionCapa(1, id, { to: 'closed_effective', effectivenessCheckResult: effective }, caller))
      .rejects.toMatchObject({ name: 'InvalidTransitionError' });
  });

  it.each([undefined, [], [{}], [{ kind: 'reference', label: ' ' }]].map(value => [value]))(
    'does not complete an action without recorded completion evidence: %j', async evidenceRefs => {
      const id = await capa('action_planned');
      const actionId = await action(id, 'in_progress');
      const before = await snapshot();
      await expect(transitionCapaAction(1, actionId, { to: 'done', evidenceRefs }, caller))
        .rejects.toMatchObject({ name: 'InvalidTransitionError', message: expect.stringMatching(/evidence/i) });
      expect(await snapshot()).toEqual(before);
    },
  );

  it('completes a documented action and closes with the matching effective result under the actual actor', async () => {
    const id = await capa('action_planned');
    const actionId = await action(id, 'in_progress');
    await transitionCapaAction(1, actionId, { to: 'done', evidenceRefs: [{ kind: 'reference', label: 'TR-42' }] }, caller);
    await transitionCapa(1, id, { to: 'action_implemented' }, caller);
    await transitionCapa(1, id, { to: 'effectiveness_check' }, caller);
    const row = await transitionCapa(1, id, { to: 'closed_effective', actor: '999', effectivenessCheckResult: effective }, caller);
    expect(row).toMatchObject({ state: 'closed_effective', closedBy: '7', effectivenessCheckResult: effective,
      auditTrail: { persisted: true, chained: true } });
    expect(row.closedAt).toBeTruthy();
    expect(audit).toHaveBeenCalledTimes(4);
  });

  it('records unsuccessful effectiveness honestly and keeps its existing reopen path', async () => {
    const id = await capa();
    await action(id, 'blocked');
    const row = await transitionCapa(1, id, { to: 'closed_not_effective', effectivenessCheckResult: ineffective }, caller);
    expect(row).toMatchObject({ state: 'closed_not_effective', effectivenessCheckResult: ineffective });
    await expect(transitionCapa(1, id, { to: 'investigation' }, caller)).resolves.toMatchObject({ state: 'investigation' });
  });

  it.each(['closed_effective', 'closed_not_effective'])('does not append an action to a %s CAPA', async state => {
    const id = await capa(state);
    const before = await snapshot();
    await expect(addCapaAction(1, { capaId: id, type: 'corrective', description: 'A later action' }, caller))
      .rejects.toMatchObject({ name: 'InvalidTransitionError' });
    expect(await snapshot()).toEqual(before);
  });
});
