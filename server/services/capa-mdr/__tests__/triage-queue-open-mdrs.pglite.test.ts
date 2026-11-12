/** GA-DEMO-08 (2026-11-10): the open reporting queue leaves out MDRs already filed.
 *
 * getTriageQueueTx read open complaints and open CAPAs, but MDR events in every
 * state: listMdrEventsTx was called with no state filter. A filed, acknowledged
 * or closed MDR whose due date was still ahead was counted on the post-market
 * screen as a report still due. The queue now asks for open MDRs only, the same
 * way it asks for open complaints and CAPAs, and `open_only=false` still returns
 * every state. Actual service and migration SQL on PGlite; access and audit are
 * isolated here exactly as in capa-closure.pglite.test.ts. */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let pg: PGlite;
let db: ReturnType<typeof drizzle>;
const PROGRAM = '22222222-2222-4222-8222-222222222222';
const caller = { userId: 7 };
const context = { organizationId: 1, caller, role: 'member', write: false,
  db: undefined as unknown, q: {}, auditWrites: 0 };
vi.mock('../../auditService', () => ({ writeChainedAuditRow: vi.fn(async () => undefined) }));
vi.mock('../capa-tasks', () => ({ scheduleCapaTask: async () => undefined, scheduleCapaActionTask: async () => undefined }));
vi.mock('../governed-context', () => ({
  capaContext: () => context,
  authorizeCapaProgram: async () => undefined,
  visibleCapaPrograms: async () => [PROGRAM],
  mutateCapa: async () => { throw new Error('no writes in this test'); },
  readCapa: async (_org: number, _caller: unknown, action: () => Promise<unknown>) => {
    context.db = db;
    return action();
  },
  CapaAccessError: class extends Error {},
  CapaPersistenceError: class extends Error {},
}));
import { getTriageQueue } from '../capaMdr.service';

beforeAll(async () => {
  pg = new PGlite();
  db = drizzle(pg);
  await pg.exec(readFileSync('migrations/20260504_capa_mdr.sql', 'utf8'));
  await pg.exec(`CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id int NOT NULL);
    INSERT INTO regulatory_programs VALUES ('${PROGRAM}',1)`);
});
afterAll(async () => { await pg?.close(); });
beforeEach(async () => { await pg.exec('DELETE FROM mdr_events'); });

const STATES = ['open', 'preparing', 'filed', 'acknowledged', 'followup_required', 'closed'] as const;

/** One MDR per state, every one due in two days. */
async function oneMdrPerState() {
  for (const state of STATES) {
    await pg.query(`INSERT INTO mdr_events (id,program_id,mdr_code,jurisdiction,us_fda_report_type,decision_date,
      report_due_at,event_narrative,state) VALUES ($1,$2,$3,'us_fda','initial_30day',now(),now() + interval '2 days',
      'Event narrative',$4)`, [randomUUID(), PROGRAM, `MDR-${state}`, state]);
  }
}

describe('triage queue: MDR events', () => {
  it('leaves out filed, acknowledged and closed MDRs from the open queue', async () => {
    await oneMdrPerState();
    const items = await getTriageQueue(1, { programId: PROGRAM }, caller);
    const codes = items.filter(i => i.kind === 'mdr').map(i => i.code).sort();
    expect(codes).toEqual(['MDR-followup_required', 'MDR-open', 'MDR-preparing']);
  });

  it('still lists every state when the caller asks for closed items too', async () => {
    // Over-correction guard: open_only=false is the full history.
    await oneMdrPerState();
    const items = await getTriageQueue(1, { programId: PROGRAM, openOnly: false }, caller);
    expect(items.filter(i => i.kind === 'mdr')).toHaveLength(STATES.length);
  });
});
