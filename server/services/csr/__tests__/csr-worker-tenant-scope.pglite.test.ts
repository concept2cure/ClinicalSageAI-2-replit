/**
 * The queued CSR workers read the Vault in their job's organization's FULL tenant scope (B1 of
 * docs/evidence/DEMO/2026-11-05-csr-lifecycle/; docs/evidence/D2-CSR/2026-11-05-worker-tenant-scope/).
 *
 * The defect: the narrative and assembly workers opened their connection with the organization's integer id alone
 * (withTenantConnection with no orgUuid), so app.current_org_id was empty. vault.documents has FORCE ROW LEVEL
 * SECURITY and reads through core.can_access_program → identity.current_org_id(), which reads only the uuid. As a
 * role that is neither superuser nor the table's owner, the source row was invisible and validateCsrSourceReceipts
 * refused with CSR_SOURCE_DATA_UNAVAILABLE. A recovered build (the boot sweep) ran under runWithOrgJobScope, also
 * with no uuid. A mock connection, or the owner's, hides all of this: so nothing here is mocked between the worker
 * and the database. The production wiring runs as it ships: each worker's default deps, the real
 * withTenantConnection, the real instrumentPool over a PGlite-backed pool, and the deployed policies:
 *
 *   - db/migrations/069_gcc_multitenant_rls_expansion.sql (core/identity.can_access_program);
 *   - db/migrations/20260821_uuid_org_guc_cast_heal.sql (identity.current_org_id());
 *   - db/migrations/044c_gcc_vault_schema.sql (vault.documents, FORCE RLS, its policies);
 *   - migrations/20260926_organizations_own_writes.sql (public.organizations);
 *   - migrations/20260628_csr_job_state.sql, twice; db/migrations/20260801_tenant_isolation_sweep.sql, twice.
 *
 * Every worker statement runs as csr_runtime: NOSUPERUSER, NOBYPASSRLS, owning nothing. Only the source readers above
 * the database (the retained run's tables, the ADaM bytes) and the assembler's PDF work are stubbed; each stub reads
 * vault.documents through the worker's own connection and calls the real validateCsrSourceReceipts, the line B1 was
 * refused at. SYNTHETIC data (support/adam-narrative-synthetic.ts).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const previous = process.env.RLS_ENFORCE;
  process.env.RLS_ENFORCE = 'on'; // production accepts only this posture
  return {
    previous, pg: null as unknown, pool: null as unknown,
    tables: vi.fn(), adam: vi.fn(), assemble: vi.fn(), storeLeaf: vi.fn(), build: vi.fn(),
    seen: [] as Array<{ worker: string; organizationId: number; orgUuid: string | null; documents: string[] }>,
  };
});
vi.mock('../../../db/runtime', () => ({ getPool: () => h.pool }));
vi.mock('../../../db', () => ({ db: null, get pool() { return h.pool; }, getPool: () => h.pool }));
vi.mock('../saved-clinical-tables.js', () => ({ readSavedClinicalTables: h.tables }));
vi.mock('../vault-source-input.js', () => ({ readCsrAdamDatasets: h.adam }));
vi.mock('../csr-assembly-source.js', () => ({ assembleCsrJob: h.assemble }));
vi.mock('../../ectd/rendered-leaf-files.js', () => ({ storeRenderedLeafFile: h.storeLeaf }));
vi.mock('../../tenant/tenant-lifecycle', () => ({ filterTenantsForBackgroundWork: async (ids: number[]) => new Set(ids) }));
vi.mock('../csr-job-runner', async original => ({ ...(await original<typeof import('../csr-job-runner')>()), runCSRBuildJob: h.build }));
// The recovery's requester check has its own suite (csr-queue-recovery.pglite.test.ts); here it is the scope that is under test.
vi.mock('../project-scope', async original => ({ ...(await original<typeof import('../project-scope')>()), requireCsrJobAccess: async () => true }));

import { instrumentPool } from '../../../db/poolInstrumentation';
import { getTenantScope } from '../../../db/tenantStore';
import { CSR_SOURCE_FORMAT, type CsrSourceReceipt } from '../../../../shared/csr-source-input';
import { validateCsrSourceReceipts } from '../source-receipt-eligibility';
import { enqueueNarrativeRun, runNarrativeRun } from '../csr-narrative-run';
import { enqueueCsrAssembly, runCsrAssembly } from '../csr-assembly-run';
import { csrBuildFailureText } from '../csr-job-runner';
import { runCsrQueueRecoveryOnce } from '../../../jobs/csrQueueRecovery';
import { narrativeBundle, narrativeDatasets } from './support/adam-narrative-synthetic';

const ROOT = path.resolve(__dirname, '../../../..');
const file = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');
const ROLE = 'csr_runtime';
const PROTOCOL = 'SYN-LMN201-PROTOCOL';
const RUN = '0b9f3c1e-6a4d-4b7e-9c2a-5d1e8f7a6b31';
const ORG = { 7: 'a7a7a7a7-0000-4000-8000-000000000007', 8: 'b8b8b8b8-0000-4000-8000-000000000008' } as const;
const PROGRAM: Record<number, string> = { 7: '11111111-2222-4333-8444-000000000007', 8: '11111111-2222-4333-8444-000000000008', 9: '11111111-2222-4333-8444-000000000009' };
const DOCUMENT: Record<number, string> = { 7: '22222222-2222-4333-8444-000000000007', 8: '22222222-2222-4333-8444-000000000008', 9: '22222222-2222-4333-8444-000000000009' };
const SHA: Record<number, string> = { 7: '7'.repeat(64), 8: '8'.repeat(64), 9: '9'.repeat(64) };
const studyInfo = { title: 'Synthetic study', protocolNumber: PROTOCOL, phase: '2', indication: 'Synthetic indication', sponsor: 'Synthetic sponsor',
  investigationalProduct: 'SYN-1', studyDesign: 'Synthetic design', primaryEndpoint: 'Synthetic endpoint' };
const receipt = (org: number): CsrSourceReceipt => ({ adapter: CSR_SOURCE_FORMAT, documentId: DOCUMENT[org], documentTitle: 'Synthetic source', version: '1.0',
  sha256: SHA[org], dataCutDate: '2026-06-30', studyId: 'SYN-NARR', protocolNumber: PROTOCOL, studyInfo,
  clinicalVerification: 'not-established', sourceApproval: 'canonical-lifecycle' });

let pg: PGlite;
type Row = Record<string, unknown>;
const run = async (text: string, params?: unknown[]) => {
  const r = await pg.query<Row>(text, params as never[]);
  return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length, fields: r.fields };
};
/**
 * A pg.Pool over the one PGlite session. A checkout holds the session until it is released, as a real pool hands
 * each borrower its own connection: two workers (the boot sweep runs two lanes) never share session variables.
 */
function pglitePool() {
  let tail: Promise<void> = Promise.resolve();
  const connect = async () => {
    let free!: () => void;
    const held = new Promise<void>(resolve => { free = resolve; });
    const previous = tail;
    tail = previous.then(() => held);
    await previous;
    return { query: run, release: () => free() };
  };
  const query = async (text: string, params?: unknown[]) => {
    const client = await connect();
    try { return await client.query(text, params); } finally { client.release(); }
  };
  return { query, connect, on: () => undefined, end: async () => undefined };
}
/** The test's own reads and seeds, as the owner (a superuser, which row security does not filter). */
async function asOwner<T>(fn: () => Promise<T>): Promise<T> {
  await pg.query('RESET ROLE');
  try { return await fn(); } finally { await pg.query(`SET ROLE ${ROLE}`); }
}
const owner = { query: (text: string, params?: unknown[]) => asOwner(() => run(text, params)) };
const rowOf = async (table: string, id: number) => (await owner.query(`SELECT status, error FROM ${table} WHERE id = $1`, [id])).rows[0];

/** What a worker's connection can see of the Vault, recorded before the receipt check that B1 refused at. */
async function look(worker: string, q: { query: typeof run }, organizationId: number) {
  const { rows } = await q.query('SELECT id::text AS id FROM vault.documents ORDER BY id');
  h.seen.push({ worker, organizationId, orgUuid: getTenantScope()?.orgUuid ?? null, documents: rows.map(r => String(r.id)) });
}

async function job(id: number, org: number, status = 'complete', staleHours = 0) {
  const bound = JSON.stringify({ studyInfo: { protocolNumber: PROTOCOL }, evidenceSource: { programId: PROGRAM[org], runId: RUN, studyId: 'SYN-NARR' } });
  await owner.query(`INSERT INTO csr_build_jobs (id, organization_id, project_id, study_id, status, study_info_snapshot, requested_by, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, 5, now() - $7 * interval '1 hour')`, [id, org, 10 + org, PROTOCOL, status, bound, staleHours]);
}

beforeAll(async () => {
  pg = new PGlite();
  h.pg = pg;
  h.pool = instrumentPool(pglitePool() as never);
  await pg.exec(`
    CREATE SCHEMA identity; CREATE SCHEMA core;
    CREATE FUNCTION uuid_generate_v4() RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
    CREATE FUNCTION identity.current_org_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$; -- replaced by the heal file
    CREATE TABLE identity.organizations (id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE identity.org_relationships (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sponsor_org_id uuid NOT NULL, delegate_org_id uuid NOT NULL,
      contract_start_date date NOT NULL, contract_end_date date, can_view_submissions boolean DEFAULT false, can_edit_submissions boolean DEFAULT false,
      scope_all_programs boolean DEFAULT false, scoped_program_ids uuid[]);
    CREATE TABLE core.programs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
    INSERT INTO identity.organizations (id) VALUES ('${ORG[7]}'), ('${ORG[8]}');`);
  await pg.exec(file('db/migrations/069_gcc_multitenant_rls_expansion.sql'));
  await pg.exec(file('db/migrations/20260821_uuid_org_guc_cast_heal.sql'));
  await pg.exec(file('db/migrations/044c_gcc_vault_schema.sql'));
  // The integer tenant key and the soft-delete column later deploy files add to vault.documents.
  await pg.exec('ALTER TABLE vault.documents ADD COLUMN organization_id integer, ADD COLUMN deleted_at timestamptz;');
  await pg.exec(`
    CREATE TABLE organizations (id integer PRIMARY KEY, uuid uuid, status text NOT NULL DEFAULT 'active');
    CREATE TABLE users (id integer PRIMARY KEY);
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer NOT NULL, status text NOT NULL DEFAULT 'active');
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id integer NOT NULL);
    CREATE TABLE document_data_dispositions (id serial PRIMARY KEY, organization_id integer NOT NULL, program_id uuid, vault_document_id uuid,
      captured_source_id integer, linked_ids jsonb NOT NULL DEFAULT '{}', source_sha256 text, choice text NOT NULL,
      disposition_sequence integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now());
    -- Organization 9 is a legacy row with no uuid: its Vault has no key, so its full scope cannot be opened.
    INSERT INTO organizations (id, uuid) VALUES (7, '${ORG[7]}'), (8, '${ORG[8]}'), (9, NULL);
    INSERT INTO users VALUES (5);
    INSERT INTO projects (id, organization_id) VALUES (17, 7), (18, 8), (19, 9);`);
  await pg.exec(file('migrations/20260926_organizations_own_writes.sql'));
  await pg.exec(file('migrations/20260628_csr_job_state.sql'));
  await pg.exec(file('migrations/20260628_csr_job_state.sql')); // every deploy re-runs the file
  const sweep = file('db/migrations/20260801_tenant_isolation_sweep.sql');
  await pg.exec(sweep);
  await pg.exec(sweep);
  for (const org of [7, 8, 9]) {
    await pg.query('INSERT INTO core.programs (id, name, org_id) VALUES ($1, $2, $3)', [PROGRAM[org], `Program ${org}`, ORG[org as 7 | 8] ?? null]);
    await pg.query('INSERT INTO regulatory_programs VALUES ($1, $2)', [PROGRAM[org], org]);
    await pg.query(`INSERT INTO vault.documents (id, program_id, organization_id, filename, content_hash, status) VALUES ($1, $2, $3, 'source.json', $4, 'completed')`,
      [DOCUMENT[org], PROGRAM[org], org, SHA[org]]);
  }
  await pg.exec(`CREATE ROLE ${ROLE} NOSUPERUSER NOBYPASSRLS;
    GRANT USAGE ON SCHEMA public, vault, core, identity TO ${ROLE};
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public, vault TO ${ROLE};
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public, vault TO ${ROLE};
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA core, identity TO ${ROLE};
    SET ROLE ${ROLE};`);
}, 180_000);
afterAll(async () => {
  await pg?.close();
  if (h.previous === undefined) delete process.env.RLS_ENFORCE; else process.env.RLS_ENFORCE = h.previous;
});
beforeEach(() => {
  h.seen.length = 0;
  h.tables.mockReset().mockImplementation(async (q: { query: typeof run }, scope: { organizationId: number; userId: number; programId: string }, runId: string) => {
    await look('narratives', q, scope.organizationId);
    await validateCsrSourceReceipts(q as never, scope, [receipt(scope.organizationId)], { historical: true });
    return { runId, programId: scope.programId, studies: [{ source: receipt(scope.organizationId), tables: {} }] };
  });
  h.adam.mockReset().mockResolvedValue({ bundle: narrativeBundle(), datasets: narrativeDatasets(30), componentsApproved: true });
  h.assemble.mockReset().mockImplementation(async (q: { query: typeof run }, input: { organizationId: number; userId: number; programId: string; jobId: number }) => {
    await look('assembly', q, input.organizationId);
    await validateCsrSourceReceipts(q as never, input, [receipt(input.organizationId)], { historical: true });
    return { status: 'incomplete', jobId: input.jobId, runId: RUN, sourceSha256: SHA[input.organizationId], jobFingerprint: 'f'.repeat(64), leaves: [],
      missing: [], notApplicable: [], bodyGaps: [], placeholderSections: [], unresolvedReferences: [], structure: null, stfWarnings: [], pdfa: null, listings: [] };
  });
  h.storeLeaf.mockReset();
  h.build.mockReset().mockImplementation(async () => {
    const scope = getTenantScope();
    await look('build', h.pool as { query: typeof run }, Number(scope?.tenantId));
  });
});

describe('the database the workers run on (the condition B1 was measured under)', () => {
  it('runs them as a role that is neither superuser nor owner, under forced row security, where the Vault reads only through the uuid', async () => {
    const role = await pg.query<Row>('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user');
    expect(role.rows).toEqual([{ rolsuper: false, rolbypassrls: false }]);
    const vault = await pg.query<Row>(`SELECT c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner) <> current_user AS not_owner
      FROM pg_class c WHERE c.oid = 'vault.documents'::regclass`);
    expect(vault.rows).toEqual([{ relrowsecurity: true, relforcerowsecurity: true, not_owner: true }]);
    const read = async (orgUuid: string) => {
      await pg.query(`SELECT set_config('app.rls_enforce', 'on', false), set_config('app.current_tenant_id', '7', false), set_config('app.current_org_id', $1, false)`, [orgUuid]);
      return (await pg.query<Row>('SELECT id::text AS id FROM vault.documents ORDER BY id')).rows.map(r => r.id);
    };
    // The walk's measurement, as the runtime role: 0 rows with tenant 7 and no uuid, 1 with the org's uuid.
    expect(await read('')).toEqual([]);
    expect(await read(ORG[7])).toEqual([DOCUMENT[7]]);
    await pg.query("SELECT set_config('app.current_tenant_id', '', false), set_config('app.current_org_id', '', false), set_config('app.rls_enforce', '', false)");
  });
});

describe('narratives and assembly, through their own default deps', () => {
  it('the narrative worker reads its source in its organization’s scope and composes; no other organization’s row is visible to it', async () => {
    await job(1, 7);
    const { runId } = await enqueueNarrativeRun(owner, { organizationId: 7, userId: 5, jobId: 1 });
    await runNarrativeRun(runId, 7);
    expect(h.seen).toEqual([{ worker: 'narratives', organizationId: 7, orgUuid: ORG[7], documents: [DOCUMENT[7]] }]);
    expect(await rowOf('csr_narrative_runs', runId)).toMatchObject({ status: 'complete', error: null });
    const landed = await owner.query(`SELECT section_number FROM csr_section_outputs WHERE job_id = 1 ORDER BY section_number`);
    expect(landed.rows.map(r => r.section_number)).toEqual(['12.3.2', '14.3.3']);
  });

  it('the assembly worker reads its source in its organization’s scope and assembles; no other organization’s row is visible to it', async () => {
    await job(2, 7);
    const { assemblyId } = await enqueueCsrAssembly(owner, { organizationId: 7, userId: 5, jobId: 2 });
    await runCsrAssembly(assemblyId, 7);
    expect(h.seen).toEqual([{ worker: 'assembly', organizationId: 7, orgUuid: ORG[7], documents: [DOCUMENT[7]] }]);
    expect(await rowOf('csr_assembly_runs', assemblyId)).toMatchObject({ status: 'assembled', error: null });
  });

  it('another organization’s worker sees its own source and not organization 7’s', async () => {
    await job(4, 8);
    const { runId } = await enqueueNarrativeRun(owner, { organizationId: 8, userId: 5, jobId: 4 });
    await runNarrativeRun(runId, 8);
    expect(h.seen).toEqual([{ worker: 'narratives', organizationId: 8, orgUuid: ORG[8], documents: [DOCUMENT[8]] }]);
    expect(await rowOf('csr_narrative_runs', runId)).toMatchObject({ status: 'complete' });
  });

  it('a job whose organization has no uuid is refused by name and reads nothing: never run in the integer scope alone', async () => {
    await job(3, 9);
    const { runId } = await enqueueNarrativeRun(owner, { organizationId: 9, userId: 5, jobId: 3 });
    await runNarrativeRun(runId, 9);
    expect(await rowOf('csr_narrative_runs', runId)).toMatchObject({ status: 'failed', error: { code: 'CSR_TENANT_SCOPE_UNAVAILABLE' } });
    const { assemblyId } = await enqueueCsrAssembly(owner, { organizationId: 9, userId: 5, jobId: 3 });
    await runCsrAssembly(assemblyId, 9);
    expect(await rowOf('csr_assembly_runs', assemblyId)).toMatchObject({ status: 'failed', error: { code: 'CSR_TENANT_SCOPE_UNAVAILABLE' } });
    expect(h.tables).not.toHaveBeenCalled();
    expect(h.assemble).not.toHaveBeenCalled();
    expect(h.seen).toEqual([]);
  });
});

describe('the boot sweep (jobs/csrQueueRecovery.ts), through its own default deps', () => {
  it('resumes a stalled build in its organization’s full scope, and refuses by name the one whose organization has no uuid', async () => {
    await job(5, 7, 'drafting', 2);
    await job(6, 9, 'drafting', 2);
    const summary = await runCsrQueueRecoveryOnce();
    expect(summary.items).toEqual(expect.arrayContaining([
      { queue: 'build', id: 5, outcome: 'resumed' },
      { queue: 'build', id: 6, outcome: 'refused', code: 'CSR_TENANT_SCOPE_UNAVAILABLE' },
    ]));
    expect(h.build.mock.calls).toEqual([[5]]);
    expect(h.seen).toEqual([{ worker: 'build', organizationId: 7, orgUuid: ORG[7], documents: [DOCUMENT[7]] }]);
    const refused = await rowOf('csr_build_jobs', 6);
    expect(refused).toMatchObject({ status: 'failed', error: { reason: 'tenant_scope_unavailable', code: 'CSR_TENANT_SCOPE_UNAVAILABLE' } });
    expect(csrBuildFailureText(refused.error)).toMatch(/no tenant key/);
  });
});
