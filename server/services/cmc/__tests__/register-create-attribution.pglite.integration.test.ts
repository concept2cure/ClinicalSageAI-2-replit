/**
 * Who recorded a CMC register row — GA plan item 2, against a real (in-process
 * PGlite) Postgres.
 *
 * ── What was wrong ───────────────────────────────────────────────────────────
 * A register row recorded WHEN it was written and never WHO wrote it. None of
 * the nine provisioned register tables carries `created_by`, `updated_by` or
 * any other attribution column, and the audit chain held no row for a register
 * create either: every CMC action on record was a governed *act* — a change
 * proposed, a source-evidence link, a contradiction resolved, an approval
 * withdrawn, a signed retirement. The data entry those signatures are ABOUT
 * was anonymous, so "who recorded this specification limit?" had no answer and
 * the separation-of-duties question a section approval needs to ask — is this
 * approver the last writer of the records the section cites? — could not be
 * asked at all. 21 CFR Part 11 §11.10(e) asks for the operator on every entry
 * that creates a record; the time was there, the operator was not.
 *
 * ── What is pinned here ──────────────────────────────────────────────────────
 * Real tables (built from the Drizzle definitions, so the row has every column
 * the service writes and returns) and the REAL chained audit writer, because
 * the claim worth making is about rows that actually landed:
 *
 *   • each of the seven register creates writes one `cmc.register.create` row
 *     naming the operator, the register, the table and the record;
 *   • a create with nobody to name writes NOTHING — not the register row, not
 *     an audit row;
 *   • the row and the record of who made it commit TOGETHER: with the audit
 *     table unwritable the register row is not left behind;
 *   • the rows join the tenant's hash chain, which the real verifier walks.
 *
 * The Module 3 write-through is stubbed: it is a separate concern with its own
 * tests and never rolls the register row back (link-to-module3.ts).
 *
 * @compliance 21 CFR Part 11 §11.10(e)
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';

vi.mock('../../../metrics.js', () => ({ metrics: { concept2cureErrors: { inc: vi.fn() } } }));

const holder = vi.hoisted(() => ({ pg: null as any, db: null as any }));
vi.mock('../../../db', () => ({
  get db() {
    return holder.db;
  },
  getPool: () => ({ query: (text: string, params?: unknown[]) => holder.pg.query(text, params) }),
}));

const writeThrough = vi.fn(async () => ({
  ok: true as const,
  sourceObjectId: 'so-1',
  sourceHash: 'h',
  staleSections: [],
  isNew: true,
}));
vi.mock('../../cmc-write-through', () => ({
  writeThroughDrugSubstance: () => writeThrough(),
  writeThroughDrugProduct: () => writeThrough(),
  writeThroughContainerClosure: () => writeThrough(),
  writeThroughMaterialSpec: () => writeThrough(),
  writeThroughFormulationRecord: () => writeThrough(),
  writeThroughManufacturingProcess: () => writeThrough(),
  writeThroughCharacterizationStudy: () => writeThrough(),
}));
vi.mock('../project-membership', () => ({ projectBelongsToTenant: async () => true }));

import {
  analyticalMethods,
  cmcChangeControl,
  cmcCharacterizationStudies,
  cmcContainerClosures,
  cmcDissolutionProfiles,
  cmcFormulationRecords,
  cmcImpurityProfiles,
  cmcMaterialSpecs,
  cmcReferenceStandards,
  drugProducts,
  drugSubstances,
  processValidation,
  qcTesting,
  stabilityStudies,
} from '../../../../shared/schema';
import { manufacturingProcesses } from '../../../../shared/cmc-schema';
import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';
import { verifyAuditChain } from '../../audit/chain';
import {
  CMC_REGISTER_CREATE,
  RegisterActorMissingError,
  createOnConnection,
  insertRegisterRow,
  type CmcRegister,
} from '../register-audit';
import {
  createCharacterizationStudy,
  createContainerClosure,
  createDrugProduct,
  createDrugSubstance,
  createFormulationRecord,
  createManufacturingProcess,
  createMaterialSpec,
} from '../register-writes';

/* The chain's order key and its BEFORE INSERT trigger, applied from the real
   migration rather than mirrored, so the audit rows are written in the shape
   the deployed chain has (chain_seq assigned, the announced tenant checked)
   instead of the pre-fix legacy order. */
const CHAIN_SEQ_MIGRATION = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../migrations/20260921_audit_logs_chain_seq.sql',
);

const ORG = 4101;
const RECORDER = 7707;
const PROGRAM = 'aaaaaaaa-0000-4000-8000-0000000004a1';

/**
 * CREATE TABLE from the Drizzle definition, so the row has every column the
 * service writes and `.returning()` reads. A uuid primary key keeps its
 * database-side default: `manufacturing_processes.id` is a uuid the deployed
 * table defaults, and Drizzle sends DEFAULT for it.
 */
function ddlOf(table: PgTable): string {
  const c = getTableConfig(table);
  const cols = c.columns.map((col) => {
    const type = col.getSQLType();
    const key = col.primary ? ` PRIMARY KEY${type === 'uuid' ? ' DEFAULT gen_random_uuid()' : ''}` : '';
    return `"${col.name}" ${type}${key}`;
  });
  return `CREATE TABLE IF NOT EXISTS "${c.name}" (${cols.join(', ')});`;
}

/** The seven with a shared service create, and the eight created in their route. */
const REGISTER_TABLES = [
  drugSubstances,
  drugProducts,
  cmcContainerClosures,
  cmcMaterialSpecs,
  cmcFormulationRecords,
  cmcCharacterizationStudies,
  manufacturingProcesses as unknown as PgTable,
  analyticalMethods,
  processValidation,
  stabilityStudies,
  qcTesting,
  cmcChangeControl,
  cmcReferenceStandards,
  cmcImpurityProfiles,
  cmcDissolutionProfiles,
];

/** The three created with raw `INSERT … RETURNING` SQL in their route. */
const RAW_SQL_DDL = `
CREATE TABLE IF NOT EXISTS cmc_comparability_assessments (
  id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL, tenant_id TEXT,
  project_id TEXT, assessment_name TEXT, change_type TEXT, changed_element TEXT,
  affected_process_parameters JSONB, justification TEXT, reviewed_by TEXT, status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS cmc_batch_records (
  id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL, tenant_id TEXT,
  project_id TEXT, batch_number TEXT, product_name TEXT, status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS quality_specifications (
  id SERIAL PRIMARY KEY, tenant_id TEXT, project_id TEXT, material_type TEXT,
  material_name TEXT, approval_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS specification_audit_log (
  id SERIAL PRIMARY KEY, specification_id INTEGER, action TEXT, changed_by TEXT, new_values JSONB);
`;

/** PGlite in the shape `createOnConnection` asks a pool for: one pinned connection. */
const pinnedPool = {
  connect: async () => ({
    query: (text: string, params?: unknown[]) => holder.pg.query(text, params),
    release: () => undefined,
  }),
};

interface AuditRow {
  action: string;
  actor_id: number | null;
  user_id: number | null;
  tenant_id: number | null;
  table_name: string;
  record_id: string;
  target: string;
  sha256_chain: string | null;
  new_values: { register?: string; projectId?: string | null; recordId?: unknown; row?: Record<string, unknown> } | null;
}

async function auditRows(): Promise<AuditRow[]> {
  const r = await holder.pg.query(
    `SELECT action, actor_id, user_id, tenant_id, table_name, record_id, target, sha256_chain, new_values
       FROM audit_logs ORDER BY occurred_at, id`,
  );
  return r.rows as AuditRow[];
}

async function count(table: string): Promise<number> {
  const r = await holder.pg.query(`SELECT count(*)::int AS n FROM "${table}"`);
  return (r.rows[0] as { n: number }).n;
}

beforeAll(async () => {
  holder.pg = new PGlite();
  holder.db = drizzle(holder.pg);
  await holder.pg.exec([...REGISTER_TABLES.map(ddlOf), RAW_SQL_DDL, AUDIT_LOGS_PGLITE_DDL].join('\n'));
  await holder.pg.exec(readFileSync(CHAIN_SEQ_MIGRATION, 'utf8'));
}, 60_000);

afterAll(async () => {
  await holder.pg?.close();
});

beforeEach(async () => {
  writeThrough.mockClear();
  await holder.pg.exec(
    `${REGISTER_TABLES.map((t) => `DELETE FROM "${getTableConfig(t).name}";`).join(' ')}` +
      ' DELETE FROM cmc_comparability_assessments; DELETE FROM cmc_batch_records;' +
      ' DELETE FROM specification_audit_log; DELETE FROM quality_specifications; DELETE FROM audit_logs;',
  );
});

/** Each register's smallest valid body, and the table its row lands in. */
const CREATES = [
  {
    register: 'drug_substance',
    table: 'drug_substances',
    run: () => createDrugSubstance(ORG, { substanceName: 'BX-701', projectId: PROGRAM }, { userId: RECORDER }),
  },
  {
    register: 'drug_product',
    table: 'drug_products',
    run: () =>
      createDrugProduct(
        ORG,
        { productName: 'BX-701 tablet', dosageForm: 'tablet', strength: '50 mg', projectId: PROGRAM },
        { userId: RECORDER },
      ),
  },
  {
    register: 'container_closure',
    table: 'cmc_container_closures',
    run: () =>
      createContainerClosure(
        ORG,
        {
          scope: 'drug_product',
          componentType: 'primary',
          systemName: 'Blister',
          containerDescription: 'PVC/Al',
          closureDescription: 'Al foil',
          projectId: PROGRAM,
        },
        { userId: RECORDER },
      ),
  },
  {
    register: 'material_spec',
    table: 'cmc_material_specs',
    run: () =>
      createMaterialSpec(
        ORG,
        { materialName: 'Microcrystalline cellulose', materialType: 'excipient', projectId: PROGRAM },
        { userId: RECORDER },
      ),
  },
  {
    register: 'formulation_record',
    table: 'cmc_formulation_records',
    run: () =>
      createFormulationRecord(
        ORG,
        { formulationName: 'BX-701 tablet', version: 'F-v1', projectId: PROGRAM },
        { userId: RECORDER },
      ),
  },
  {
    register: 'characterization_study',
    table: 'cmc_characterization_studies',
    run: () =>
      createCharacterizationStudy(
        ORG,
        { scope: 'drug_substance', studyType: 'polymorph_screen', studyTitle: 'Form screen', projectId: PROGRAM },
        { userId: RECORDER },
      ),
  },
  {
    register: 'manufacturing_process',
    table: 'manufacturing_processes',
    run: () => createManufacturingProcess(ORG, { processName: 'Wet granulation', projectId: PROGRAM }, { userId: RECORDER }),
  },
] as const;

describe('every CMC register create records the person who recorded it', () => {
  it.each(CREATES)('$register', async ({ register, table, run }) => {
    const created = await run();
    expect(await count(table)).toBe(1);

    const rows = await auditRows();
    expect(rows, `${register} wrote no audit row`).toHaveLength(1);
    const [row] = rows;
    expect(row.action).toBe(CMC_REGISTER_CREATE);
    /* The operator. Both columns, because `audit.explain` reads user_id and the
       chain derives from actor_id. */
    expect(row.actor_id).toBe(RECORDER);
    expect(row.user_id).toBe(RECORDER);
    expect(row.tenant_id).toBe(ORG);
    /* The record exactly: its table, its id, and the register it belongs to. */
    expect(row.table_name).toBe(table);
    expect(row.record_id).toBe(String(created.row.id));
    expect(row.target).toBe(`${table}:${created.row.id}`);
    expect(row.new_values?.register).toBe(register);
    expect(row.new_values?.projectId).toBe(PROGRAM);
    /* The entry the operator made, not merely that one was made. */
    expect(row.new_values?.row).toMatchObject({ id: created.row.id, organizationId: ORG });
    /* It joined the chain. */
    expect(row.sha256_chain).toMatch(/^[0-9a-f]{64}$/);
  });
});

/**
 * The eight registers created in their own route, through the SAME shared
 * insert. Driven at the service boundary rather than over HTTP: what is in
 * question is that `insertRegisterRow` records each register and its table, not
 * the route's plumbing, and `register-create-recorded.test.ts` holds the source
 * line that each route uses this door and no other.
 */
const ROUTE_CREATES: ReadonlyArray<readonly [CmcRegister, PgTable, Record<string, unknown>]> = [
  ['analytical_method', analyticalMethods, { methodName: 'HPLC assay', methodType: 'assay' }],
  ['process_validation', processValidation, { validationType: 'process_performance' }],
  ['stability_study', stabilityStudies, { studyType: 'long_term', storageCondition: '25C/60RH' }],
  ['qc_test', qcTesting, { testName: 'Dissolution', testType: 'release' }],
  ['change_control', cmcChangeControl, { changeTitle: 'Supplier change', changeType: 'minor' }],
  ['reference_standard', cmcReferenceStandards, { standardName: 'BX-701 RS-01', standardType: 'primary' }],
  ['impurity_profile', cmcImpurityProfiles, { impurityName: 'Impurity B', impurityType: 'degradation' }],
  ['dissolution_profile', cmcDissolutionProfiles, { profileName: 'F-v1 pH 6.8', medium: 'pH 6.8 buffer' }],
];

describe('the registers created in their route are recorded the same way', () => {
  it.each(ROUTE_CREATES)('%s', async (register, table, body) => {
    const row = (await insertRegisterRow(ORG, { userId: RECORDER }, register, table, {
      ...body,
      projectId: PROGRAM,
      organizationId: ORG,
    } as never)) as { id: number };

    const rows = await auditRows();
    expect(rows, `${register} wrote no audit row`).toHaveLength(1);
    expect(rows[0].action).toBe(CMC_REGISTER_CREATE);
    expect(rows[0].actor_id).toBe(RECORDER);
    expect(rows[0].tenant_id).toBe(ORG);
    expect(rows[0].table_name).toBe(getTableConfig(table).name);
    expect(rows[0].record_id).toBe(String(row.id));
    expect(rows[0].new_values?.register).toBe(register);
  });

  it('refuses a route create that names nobody, and writes nothing', async () => {
    await expect(
      insertRegisterRow(ORG, { userId: null }, 'qc_test', qcTesting, {
        testName: 'Dissolution',
        organizationId: ORG,
      } as never),
    ).rejects.toBeInstanceOf(RegisterActorMissingError);
    expect(await count('qc_testing')).toBe(0);
    expect(await auditRows()).toHaveLength(0);
  });
});

/**
 * The three registers whose create is raw `INSERT … RETURNING` SQL in its
 * route: the comparability assessment, the batch record and the quality
 * specification. They go through `createOnConnection`, which pins one
 * connection for the insert and the chained row — because `pool.query` takes
 * whichever idle connection the pool hands back, and the chain's advisory lock
 * and its transaction-local announcement would not survive the trip.
 */
describe('the raw-SQL registers are recorded on one pinned connection', () => {
  it('a comparability assessment', async () => {
    const row = await createOnConnection(
      pinnedPool,
      { organizationId: ORG, actor: { userId: RECORDER }, register: 'comparability_study', table: 'cmc_comparability_assessments' },
      async (client) => {
        const { rows } = await client.query(
          `INSERT INTO cmc_comparability_assessments (organization_id, tenant_id, project_id, assessment_name, status)
           VALUES ($1, $2, $3, $4, 'draft') RETURNING id, project_id`,
          [ORG, String(ORG), PROGRAM, 'Site transfer'],
        );
        return rows[0] as { id: number };
      },
    );
    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].table_name).toBe('cmc_comparability_assessments');
    expect(rows[0].record_id).toBe(String(row.id));
    expect(rows[0].actor_id).toBe(RECORDER);
    expect(rows[0].new_values?.register).toBe('comparability_study');
    /* The program the row itself records, read off the returned row. */
    expect(rows[0].new_values?.projectId).toBe(PROGRAM);
  });

  it('a batch record', async () => {
    const row = await createOnConnection(
      pinnedPool,
      { organizationId: ORG, actor: { userId: RECORDER }, register: 'batch_record', table: 'cmc_batch_records' },
      async (client) => {
        const { rows } = await client.query(
          `INSERT INTO cmc_batch_records (organization_id, tenant_id, project_id, batch_number, product_name, status)
           VALUES ($1, $2, $3, $4, $5, 'in-progress') RETURNING id, project_id`,
          [ORG, String(ORG), PROGRAM, 'BX-701-001', 'BX-701 tablet'],
        );
        return rows[0] as { id: number };
      },
    );
    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].new_values?.register).toBe('batch_record');
    expect(rows[0].record_id).toBe(String(row.id));
  });

  it('a specification, with its own history row, on the same transaction', async () => {
    const row = await createOnConnection(
      pinnedPool,
      { organizationId: ORG, actor: { userId: RECORDER }, register: 'specification', table: 'quality_specifications' },
      async (client) => {
        const { rows } = await client.query(
          `INSERT INTO quality_specifications (tenant_id, project_id, material_type, material_name, approval_status)
           VALUES ($1, $2, 'drug_substance', 'BX-701', 'draft') RETURNING id, project_id`,
          [String(ORG), PROGRAM],
        );
        const spec = rows[0] as { id: number };
        await client.query(
          `INSERT INTO specification_audit_log (specification_id, action, changed_by, new_values)
           VALUES ($1, 'created', $2, $3)`,
          [spec.id, String(RECORDER), JSON.stringify(spec)],
        );
        return spec;
      },
    );
    expect(await count('quality_specifications')).toBe(1);
    /* The register's own version history and the chain's operator row: two
       different questions, one transaction. */
    const history = await holder.pg.query('SELECT changed_by, action FROM specification_audit_log');
    expect(history.rows).toEqual([{ changed_by: String(RECORDER), action: 'created' }]);
    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].new_values?.register).toBe('specification');
    expect(rows[0].record_id).toBe(String(row.id));
  });

  it('a raw-SQL create with nobody to name opens no transaction and writes nothing', async () => {
    await expect(
      createOnConnection(
        pinnedPool,
        { organizationId: ORG, actor: { userId: 0 }, register: 'batch_record', table: 'cmc_batch_records' },
        async () => {
          throw new Error('the insert must never run');
        },
      ),
    ).rejects.toBeInstanceOf(RegisterActorMissingError);
    expect(await count('cmc_batch_records')).toBe(0);
    expect(await auditRows()).toHaveLength(0);
  });

  it('rolls the row back when its audit row cannot be written', async () => {
    await holder.pg.exec('ALTER TABLE audit_logs RENAME TO audit_logs_away;');
    try {
      await expect(
        createOnConnection(
          pinnedPool,
          { organizationId: ORG, actor: { userId: RECORDER }, register: 'batch_record', table: 'cmc_batch_records' },
          async (client) => {
            const { rows } = await client.query(
              `INSERT INTO cmc_batch_records (organization_id, tenant_id, batch_number) VALUES ($1, $2, 'B-9')
               RETURNING id, project_id`,
              [ORG, String(ORG)],
            );
            return rows[0] as { id: number };
          },
        ),
      ).rejects.toThrow();
      expect(await count('cmc_batch_records'), 'an unattributable batch record was left behind').toBe(0);
    } finally {
      await holder.pg.exec('ALTER TABLE audit_logs_away RENAME TO audit_logs;');
    }
  });
});

describe('a create with nobody to name writes nothing', () => {
  it.each([
    ['no actor at all', undefined],
    ['a session that resolved nobody', { userId: 0 }],
    ['a null user', { userId: null }],
  ] as const)('%s', async (_label, actor) => {
    await expect(
      createDrugSubstance(ORG, { substanceName: 'BX-701', projectId: PROGRAM }, actor as never),
    ).rejects.toBeInstanceOf(RegisterActorMissingError);
    expect(await count('drug_substances')).toBe(0);
    expect(await auditRows()).toHaveLength(0);
  });

  it('says what is required and that nothing was written', async () => {
    await expect(
      createDrugSubstance(ORG, { substanceName: 'BX-701' }, { userId: null }),
    ).rejects.toThrow(/drug substance record cannot be written without the person recording it.*§11\.10\(e\).*Nothing was written/s);
  });
});

describe('the row and the record of who made it commit together', () => {
  it('leaves no register row behind when the audit row cannot be written', async () => {
    await holder.pg.exec('ALTER TABLE audit_logs RENAME TO audit_logs_away;');
    try {
      await expect(
        createDrugSubstance(ORG, { substanceName: 'BX-701', projectId: PROGRAM }, { userId: RECORDER }),
      ).rejects.toThrow();
      expect(await count('drug_substances'), 'an unattributable row was left behind').toBe(0);
    } finally {
      await holder.pg.exec('ALTER TABLE audit_logs_away RENAME TO audit_logs;');
    }
  });

  it('records the Module 3 link failure without rolling the attributed row back', async () => {
    writeThrough.mockResolvedValueOnce({ ok: false as const } as never);
    const created = await createDrugSubstance(ORG, { substanceName: 'BX-701', projectId: PROGRAM }, { userId: RECORDER });
    expect(created.module3Linked).toBe(false);
    expect(await count('drug_substances')).toBe(1);
    expect(await auditRows()).toHaveLength(1);
  });
});

describe('the creates join one verifiable chain', () => {
  it('three creates by two people walk as one tenant chain', async () => {
    await createDrugSubstance(ORG, { substanceName: 'BX-701', projectId: PROGRAM }, { userId: RECORDER });
    await createDrugProduct(
      ORG,
      { productName: 'BX-701 tablet', dosageForm: 'tablet', strength: '50 mg', projectId: PROGRAM },
      { userId: RECORDER },
    );
    await createMaterialSpec(
      ORG,
      { materialName: 'Lactose', materialType: 'excipient', projectId: PROGRAM },
      { userId: RECORDER + 1 },
    );

    const rows = await auditRows();
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.actor_id)).toEqual([RECORDER, RECORDER, RECORDER + 1]);
    expect(new Set(rows.map((r) => r.sha256_chain)).size).toBe(3);

    const verdict = await verifyAuditChain({
      query: (text: string, params?: unknown[]) => holder.pg.query(text, params),
    } as never);
    expect(verdict.ok, JSON.stringify(verdict.brokenAt ?? {})).toBe(true);
    expect(verdict.rowsChecked).toBe(3);
  });
});
