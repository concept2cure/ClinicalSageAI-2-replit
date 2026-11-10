/**
 * The canonical-table run-coordination fixture: a PGlite database with the
 * canonical DDL (tests/golden-journeys/harness createJourneyDb), the run,
 * turn-record, chain-order and audit-immutability migrations, and an ana_runs
 * row per subject. Shared by turn-plan-and-context.test.ts and
 * run-coordination-dispositions.test.ts, which were one file until the second
 * case set of spike check 1 (§14.4) was added.
 *
 * `fixture` and `pool` are live bindings: they are set by
 * setupCoordinationFixture (call it from beforeAll) and read by the suites.
 */
import { randomUUID } from 'node:crypto';
import { createJourneyDb, extractTableDdl, type JourneyDb } from '../../../../../tests/golden-journeys/harness';
import { PREREQ, AUTHORING_ACCESS_DDL, ORG, AUTHOR } from '../../../../routes/__tests__/_authoring-canvas-fixture';
import { openRunCoordination, type CoordinationPool, type CoordinationScope, type CoordinationProjection } from '../../run-events';
import { admitRunCoordination, runOwnerInstance } from '../../run-control';

export let fixture: JourneyDb;
export let pool: CoordinationPool;
export async function subject(adapter = pool, observed?: (projection: CoordinationProjection) => void) {
  const scope: CoordinationScope = { runId: randomUUID(), organizationId: ORG, userId: Number(AUTHOR.id), projectId: 42, ownerInstance: runOwnerInstance() };
  await pool.query(`INSERT INTO ana_runs(id,organization_id,user_id,project_id,surface,status,owner_instance)
    VALUES($1,$2,$3,'42','ana-ri-stream','running',$4)`, [scope.runId, ORG, scope.userId, scope.ownerInstance]);
  const source = { tiers: [3] as const, recheck: async () => { await admitRunCoordination(pool, scope); } };
  return { scope, source, host: await openRunCoordination({ ...scope, pool: adapter, source, onProjection: observed }) };
}
export const assignment = (intentId: string) => ({ intentId, role: 'research' as const, task: 't1', parentStep: 's1' });
export async function setupCoordinationFixture(onReady?: (shared: CoordinationPool) => void) {
    fixture = await createJourneyDb({ prereqSql: `${PREREQ}${AUTHORING_ACCESS_DDL}
      CREATE ROLE app_service NOLOGIN; CREATE SCHEMA vault;
      CREATE TABLE vault.legal_holds(id serial PRIMARY KEY,organization_id integer,lifted_at timestamptz);
      CREATE TABLE chat_threads(id TEXT PRIMARY KEY,user_id INTEGER,organization_id INTEGER,title TEXT,project_id integer,program_id uuid,
        model text,system_prompt text,metadata jsonb,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
      CREATE TABLE chat_messages(id serial PRIMARY KEY,thread_id text,role text,content text,model text,tokens_used integer,metadata jsonb,created_at timestamptz DEFAULT now());
      ${extractTableDdl('migrations/0013_ana_intelligence_system.sql',['user_intelligence_profiles'])}
      ALTER TABLE organizations ADD COLUMN settings jsonb NOT NULL DEFAULT '{}';`,
      migrations: ['migrations/20260921_audit_logs_chain_seq.sql','db/migrations/20260917_ana_runs.sql',
        'migrations/20260926_ana_turn_records.sql','db/migrations/20260617_audit_logs_immutability.sql'] });
    const query: CoordinationPool['query'] = async (sql, args) => fixture.pglite.query<Record<string, unknown>>(sql, args);
    pool = { query, connect: async () => ({ query, release() {} }) };
    onReady?.(pool);
}

/** Each case starts from an active organization whose author is a current member, in its tenant scope. */
export async function seedCoordinationMember() {
  await pool.query('DELETE FROM organization_users WHERE organization_id=$1 AND user_id=$2', [ORG, Number(AUTHOR.id)]);
  await pool.query("INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,'member')", [ORG, Number(AUTHOR.id)]);
  await pool.query("UPDATE organizations SET settings='{}',status='active'");
  await pool.query("SELECT set_config('app.current_tenant_id',$1,false),set_config('app.current_account_id',$2,false)", [String(ORG), AUTHOR.id]);
}
