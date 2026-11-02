import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ access: vi.fn(), write: vi.fn() }));
vi.mock('../../c2c/current-program-access', () => ({ requireCurrentProgramAccess: h.access }));
vi.mock('../../c2c/governed-program-write', () => ({ requireGovernedProgramWriteTx: h.write }));
import { inOwnedRbmTransaction, inOwnedRbmTransactionFromPool, seedRbmAssessment, seedRbmAssessmentFromPool } from '../rbm-assessment-seed';
import { DEFAULT_CTQ_FACTORS } from '../rbm-engine';
const PROGRAM = '11111111-1111-4111-8111-111111111111';
let db: PGlite;
beforeAll(async () => { db = new PGlite(); await db.exec(`CREATE TABLE rbm_risk_assessments(id serial PRIMARY KEY,organization_id integer,program_id uuid,title text,framework text,overall_risk text,status text,created_by integer,approved_by integer,approved_at timestamptz,version integer NOT NULL DEFAULT 1,deleted_at timestamptz);
 CREATE TABLE rbm_risk_items(id serial PRIMARY KEY,organization_id integer,assessment_id integer,program_id uuid,category text,ctq_factor text,risk_description text,likelihood integer,impact integer,risk_score integer,is_critical boolean,mitigation text,status text,metadata jsonb DEFAULT '{}'::jsonb);`); }, 30000);
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.exec('TRUNCATE rbm_risk_items,rbm_risk_assessments'); h.access.mockReset().mockResolvedValue({}); h.write.mockReset().mockResolvedValue(undefined); });
const q = () => ({ query: (sql: string, args?: unknown[]) => db.query<Record<string, unknown>>(sql, args) });
describe('shared canonical assessment seed', () => {
 it('commits a draft and its default factors together, with the actor and no signature', async () => {
  const out = await seedRbmAssessment(q(), { organizationId: 7, userId: 3 }, { programId: PROGRAM }, 'owned');
  expect(out).toMatchObject({ status: 'draft', created_by: 3, approved_by: null, approved_at: null }); expect(out.items.length).toBeGreaterThan(0);
  expect(h.write).toHaveBeenCalledWith(expect.anything(), 7, 3, PROGRAM);
  expect((await db.query('SELECT COUNT(*)::int AS count FROM rbm_risk_assessments')).rows[0]).toEqual({ count: 1 });
 });
 // A library rating reads as assessed unless it says otherwise; same vocabulary as ctq-derivation.ts (F1 2026-11-02).
 it('marks every seeded factor\'s rating as an untailored library default', async () => {
  const out = await seedRbmAssessment(q(), { organizationId: 7, userId: 3 }, { programId: PROGRAM }, 'owned');
  for (const row of out.items) expect(row.metadata).toEqual({ ratingSource: 'default_seed', ratingFrom: { table: 'DEFAULT_CTQ_FACTORS', ctqFactor: row.ctq_factor } });
 });
 it('rolls back the assessment and already-written factors when a later factor fails', async () => {
  let writes = 0;
  const client = { query: async (sql: string, args?: unknown[]) => { if (sql.includes('INSERT INTO rbm_risk_items') && ++writes === 2) throw new Error('Controlled second factor failure'); return db.query<Record<string, unknown>>(sql, args); } };
  await expect(seedRbmAssessment(client, { organizationId: 7, userId: 3 }, { programId: PROGRAM }, 'owned')).rejects.toThrow('Controlled second factor failure');
  expect(writes).toBe(2);
  expect((await db.query('SELECT COUNT(*)::int AS count FROM rbm_risk_assessments')).rows[0]).toEqual({ count: 0 });
  expect((await db.query('SELECT COUNT(*)::int AS count FROM rbm_risk_items')).rows[0]).toEqual({ count: 0 });
 });
 it('rechecks current write authority inside the transaction before any record is inserted', async () => {
  h.write.mockRejectedValue(new Error('Current authority revoked'));
  await expect(seedRbmAssessment(q(), { organizationId: 7, userId: 3 }, { programId: PROGRAM }, 'owned')).rejects.toThrow('Current authority revoked');
  expect((await db.query('SELECT COUNT(*)::int AS count FROM rbm_risk_assessments')).rows[0]).toEqual({ count: 0 });
 });
 it('leaves a caller-owned transaction open so the caller can roll the seed back', async () => {
  await db.exec('BEGIN'); let open = true;
  try {
   await seedRbmAssessment(q(), { organizationId: 7, userId: 3 }, { programId: PROGRAM }, 'caller-owned');
   await db.exec('ROLLBACK'); open = false;
   expect((await db.query('SELECT COUNT(*)::int AS count FROM rbm_risk_assessments')).rows[0]).toEqual({ count: 0 });
   expect((await db.query('SELECT COUNT(*)::int AS count FROM rbm_risk_items')).rows[0]).toEqual({ count: 0 });
  } finally { if (open) await db.exec('ROLLBACK'); }
 });
 it('uses an already-connected client as supplied instead of inferring ownership from its connect method', async () => {
  const client = { ...q(), connect: vi.fn(async () => { throw new Error('Client has already been connected'); }) };
  const out = await seedRbmAssessment(client, { organizationId: 7, userId: 3 }, { programId: PROGRAM }, 'owned');
  expect(out.status).toBe('draft'); expect(client.connect).not.toHaveBeenCalled();
 });

 it('uses one explicitly owned pool lease and releases it after its atomic seed', async () => {
  const lease = { ...q(), release: vi.fn() }, pool = { connect: vi.fn(async () => lease) };
  const out = await seedRbmAssessmentFromPool(pool, { organizationId: 7, userId: 3 }, { programId: PROGRAM });
  expect(out.status).toBe('draft'); expect(pool.connect).toHaveBeenCalledOnce(); expect(lease.release).toHaveBeenCalledOnce();
  expect((await db.query('SELECT COUNT(*)::int AS count FROM rbm_risk_assessments')).rows[0]).toEqual({ count: 1 });
 });
 it('does not roll back a caller’s earlier work when a caller-owned seed fails', async () => {
  await db.exec('BEGIN'); let open = true;
  try {
   await db.exec("INSERT INTO rbm_risk_assessments(title) VALUES('Caller work')");
   let writes = 0;
   const client = { query: async (sql: string, args?: unknown[]) => { if (sql.includes('INSERT INTO rbm_risk_items') && ++writes === 2) throw new Error('Caller-owned seed failure'); return db.query<Record<string, unknown>>(sql, args); } };
   await expect(seedRbmAssessment(client, { organizationId: 7, userId: 3 }, { programId: PROGRAM }, 'caller-owned')).rejects.toThrow('Caller-owned seed failure');
   expect((await db.query("SELECT COUNT(*)::int AS count FROM rbm_risk_assessments WHERE title='Caller work'")).rows[0]).toEqual({ count: 1 });
   await db.exec('ROLLBACK'); open = false;
   expect((await db.query('SELECT COUNT(*)::int AS count FROM rbm_risk_assessments')).rows[0]).toEqual({ count: 0 });
  } finally { if (open) await db.exec('ROLLBACK'); }
 });

 // The same owned transaction carries AnA's add_ctq_factor write (F1 2026-11-01).
 it('rolls back another RBM write through the shared owned transaction when its work fails', async () => {
  const work = async (tx: { query: (sql: string, args?: unknown[]) => Promise<unknown> }) => {
   await tx.query("INSERT INTO rbm_risk_items(organization_id, program_id, ctq_factor) VALUES (7, $1, 'Late SAE entry')", [PROGRAM]);
   throw new Error('Controlled failure after the insert');
  };
  await expect(inOwnedRbmTransaction(q(), work)).rejects.toThrow('Controlled failure after the insert');
  expect((await db.query('SELECT COUNT(*)::int AS count FROM rbm_risk_items')).rows[0]).toEqual({ count: 0 });
 });
 it('commits another RBM write on one released pool lease', async () => {
  const lease = { ...q(), release: vi.fn() }, pool = { connect: vi.fn(async () => lease) };
  const out = await inOwnedRbmTransactionFromPool(pool, async tx => (await tx.query("INSERT INTO rbm_risk_items(organization_id, ctq_factor) VALUES (7, 'x') RETURNING id")).rows[0]);
  expect(out).toMatchObject({ id: expect.any(Number) });
  expect(pool.connect).toHaveBeenCalledOnce(); expect(lease.release).toHaveBeenCalledOnce();
  expect((await db.query('SELECT COUNT(*)::int AS count FROM rbm_risk_items')).rows[0]).toEqual({ count: 1 });
 });

});

// The "no assessment yet" check runs inside the seed's own transaction, under a
// per-study lock, on every path (F1 2026-11-02, docs/evidence/F1/2026-11-02-rbm-outside-items/).
describe('the seed refuses a study that already has an assessment', () => {
 const count = async (table: string) => (await db.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM ${table}`)).rows[0].count;
 it('refuses a second seed of the same study inside its transaction, and writes nothing', async () => {
  await seedRbmAssessment(q(), { organizationId: 7, userId: 3 }, { programId: PROGRAM }, 'owned');
  await expect(seedRbmAssessment(q(), { organizationId: 7, userId: 3 }, { programId: PROGRAM }, 'owned')).rejects.toMatchObject({ status: 409, code: 'RBM_ASSESSMENT_EXISTS' });
  expect(await count('rbm_risk_assessments')).toBe(1);
  expect(await count('rbm_risk_items')).toBe(DEFAULT_CTQ_FACTORS.length);
 });
 it('refuses a study that already has an approved version', async () => {
  await db.query("INSERT INTO rbm_risk_assessments(organization_id,program_id,title,status,version) VALUES (7,$1,'Signed RACT','active',2)", [PROGRAM]);
  await expect(seedRbmAssessment(q(), { organizationId: 7, userId: 3 }, { programId: PROGRAM }, 'owned')).rejects.toMatchObject({ status: 409, code: 'RBM_ASSESSMENT_EXISTS', message: expect.stringMatching(/version 2, active/) });
  expect((await db.query('SELECT status, version FROM rbm_risk_assessments')).rows).toEqual([{ status: 'active', version: 2 }]);
 });
 it('takes the per-study lock, then reads existing versions, after BEGIN and before the INSERT', async () => {
  const log: string[] = [];
  const client = { query: (sql: string, args?: unknown[]) => { log.push(sql.replace(/\s+/g, ' ').trim()); return db.query<Record<string, unknown>>(sql, args); } };
  await seedRbmAssessment(client, { organizationId: 7, userId: 3 }, { programId: PROGRAM }, 'owned');
  const at = (re: RegExp) => log.findIndex(s => re.test(s));
  const [begin, lock, read, insert] = [at(/^BEGIN$/), at(/pg_advisory_xact_lock/), at(/^SELECT .* FROM rbm_risk_assessments/), at(/^INSERT INTO rbm_risk_assessments/)];
  expect(begin).toBeGreaterThanOrEqual(0);
  expect([begin < lock, lock < read, read < insert]).toEqual([true, true, true]);
 });
});
