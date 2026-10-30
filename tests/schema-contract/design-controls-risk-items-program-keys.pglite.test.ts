/**
 * 20261029c_design_controls_and_risk_items_program_keys.sql: a design input names
 * the project it belongs to, by key, and a design input or a risk item can name
 * only a project of its own organization (D2, fold F1 slice A, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/fold-f1a-risk-design-controls-safety/).
 *
 * Real DDL: regulatory_programs from 20260524, c2c_design_controls from 20260717,
 * and the risk_items table statement of 20260507 (that file also creates tables
 * this test does not need, which reference q_submissions and ectd_templates).
 * Rows are recorded BEFORE the migration: a design input with no project, as
 * every input was until now, and a risk item anchored to ANOTHER organization's
 * project, which the 20260507 key allowed. Then the creators and the file are
 * replayed, as every deploy does (Rule 1), and the replay adds nothing.
 *
 * risk_items has two lineages. 20260507 gives program_id a NO ACTION key on
 * regulatory_programs(id); drizzle push (shared/schema.ts riskItems) gives it
 * none. The new key takes the delete action of the key the table already has,
 * so a program delete behaves on each lineage as it did before. The drizzle
 * lineage is the same statement without the program key.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import { join } from 'path';
import { C2C_MIGRATION_FILES, UUID_TENANT_ISOLATION_NONPUBLIC } from '../../scripts/db/migration-set.mjs';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const KEY = 'migrations/20261029c_design_controls_and_risk_items_program_keys.sql';
const PROGRAMS = 'migrations/20260524_program_workbench_schema.sql';
const DESIGN_CONTROLS = 'db/migrations/20260717_design_controls_store.sql';
const RISK = 'migrations/20260507_mdx_beta_surfaces.sql';

/** The risk_items statement of 20260507, as written there. */
function riskItemsDdl(): string {
  const m = read(RISK).match(/CREATE TABLE IF NOT EXISTS risk_items \(([\s\S]*?)\n\);/);
  if (!m) throw new Error(`risk_items not found in ${RISK}`);
  return `CREATE TABLE IF NOT EXISTS risk_items (${m[1]}\n);`;
}
/** The drizzle lineage: the same table with no key on program_id (shared/schema.ts riskItems). */
function riskItemsDrizzleDdl(): string {
  const ddl = riskItemsDdl();
  const keyless = ddl.replace(/program_id(\s+)uuid REFERENCES regulatory_programs\(id\)/, 'program_id$1uuid');
  if (keyless === ddl) throw new Error('the 20260507 program_id key was not found to remove');
  return keyless;
}

const P1 = '11111111-1111-4111-8111-111111111111'; // organization 1
const P2 = '22222222-2222-4222-8222-222222222222'; // organization 2
const P3 = '33333333-3333-4333-8333-333333333333'; // organization 1, deleted later (design input)
const P4 = '44444444-4444-4444-8444-444444444444'; // organization 1, delete attempted (risk)
const P_MISSING = '99999999-9999-4999-8999-999999999999';

const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string }) => e.code ?? String(e));

async function base(db: PGlite, riskDdl: string) {
  await db.exec(`CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT); CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT);
                 INSERT INTO organizations (id, name) VALUES (1, 'one'), (2, 'two'); INSERT INTO users (id, name) VALUES (5, 'u');`);
  await db.exec(read(PROGRAMS));
  await db.exec(read(DESIGN_CONTROLS));
  await db.exec(riskDdl);
  for (const [id, org, name] of [[P1, 1, 'Alpha'], [P2, 2, 'Beta'], [P3, 1, 'Gamma'], [P4, 1, 'Delta']] as const) {
    await db.query(
      `INSERT INTO regulatory_programs (id, organization_id, name, code, program_type, product_type, primary_agency, product_name)
       VALUES ($1, $2, $3, $4, '510K', 'device', 'FDA', $5)`,
      [id, org, name, name, name],
    );
  }
}
/** Two deploys: the file, then every creator and the file again. */
async function deployTwice(db: PGlite, riskDdl: string) {
  await db.exec(read(KEY));
  await db.exec(read(PROGRAMS));
  await db.exec(read(DESIGN_CONTROLS));
  await db.exec(riskDdl);
  await db.exec(read(KEY));
}
const risk = (db: PGlite, org: number, programId: string | null) =>
  db.query<{ id: number }>(
    `INSERT INTO risk_items (organization_id, program_id, hazard, harm, severity, probability) VALUES ($1, $2, 'h', 'x', 3, 2) RETURNING id`,
    [org, programId],
  );
const riskRow = async (db: PGlite, id: number) =>
  (await db.query<{ program_id: string | null; organization_id: number; status: string }>(
    `SELECT program_id, organization_id, status FROM risk_items WHERE id = $1`, [id],
  )).rows[0];
const foreignKeys = async (db: PGlite, table: string) =>
  (await db.query<{ conname: string; convalidated: boolean; def: string }>(
    `SELECT conname, convalidated, pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conrelid = $1::regclass AND contype = 'f' ORDER BY conname`, [`public.${table}`],
  )).rows;

describe('20261029c on the applier', () => {
  it('runs after the files that create its tables and the program key, and before the uuid and tenant sweeps', () => {
    const files = C2C_MIGRATION_FILES as string[];
    const at = files.indexOf(KEY);
    expect(at).toBeGreaterThan(-1);
    for (const before of [PROGRAMS, DESIGN_CONTROLS, RISK, 'migrations/20260926b_program_same_org_keys.sql']) {
      expect(files.indexOf(before), before).toBeGreaterThan(-1);
      expect(files.indexOf(before), before).toBeLessThan(at);
    }
    expect(at).toBeLessThan(files.indexOf(UUID_TENANT_ISOLATION_NONPUBLIC as string));
  });
});

describe('the 20260507 lineage (risk_items.program_id already keyed, NO ACTION)', () => {
  let db: PGlite;
  let legacyInput = '';
  let legacyCrossRisk = 0;
  const dcShape = async () => ({
    column: (await db.query<{ data_type: string; is_nullable: string }>(
      `SELECT data_type, is_nullable FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'c2c_design_controls' AND column_name = 'program_id'`,
    )).rows,
    constraints: await foreignKeys(db, 'c2c_design_controls'),
    indexes: (await db.query<{ indexname: string; indexdef: string }>(
      `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'c2c_design_controls' ORDER BY indexname`,
    )).rows,
    risk: await foreignKeys(db, 'risk_items'),
  });
  const input = (org: number, id: string, programId: string | null) =>
    db.query(`INSERT INTO c2c_design_controls (id, organization_id, req, program_id) VALUES ($1, $2, 'r', $3)`, [id, org, programId]);
  const inputRow = async (org: number, id: string) =>
    (await db.query<{ program_id: string | null; organization_id: number }>(
      `SELECT program_id, organization_id FROM c2c_design_controls WHERE organization_id = $1 AND id = $2`, [org, id],
    )).rows[0];

  beforeAll(async () => {
    db = new PGlite();
    await base(db, riskItemsDdl());
    // Before the migration: an input with no project column at all, and a risk of
    // organization 1 anchored to organization 2's project, which the old key allowed.
    legacyInput = 'dc-legacy';
    await db.query(`INSERT INTO c2c_design_controls (id, organization_id, req) VALUES ($1, 1, 'Legacy requirement')`, [legacyInput]);
    legacyCrossRisk = (await risk(db, 1, P2)).rows[0].id;
    await deployTwice(db, riskItemsDdl());
  }, 60_000);
  afterAll(async () => { await db?.close(); });

  it('a replay adds nothing: one nullable uuid column, two NOT VALID keys, one partial index', async () => {
    expect(await dcShape()).toEqual({
      column: [{ data_type: 'uuid', is_nullable: 'YES' }],
      constraints: [{
        conname: 'c2c_design_controls_program_same_org_fk', convalidated: false,
        def: 'FOREIGN KEY (program_id, organization_id) REFERENCES regulatory_programs(id, organization_id) ON DELETE SET NULL (program_id) NOT VALID',
      }],
      indexes: [
        expect.objectContaining({ indexname: 'c2c_design_controls_pkey' }),
        {
          indexname: 'idx_c2c_design_controls_org_program',
          indexdef: expect.stringMatching(/\(organization_id, program_id, id\) WHERE \(program_id IS NOT NULL\)/),
        },
      ],
      risk: [
        { conname: 'risk_items_assigned_to_fkey', convalidated: true, def: 'FOREIGN KEY (assigned_to) REFERENCES users(id)' },
        { conname: 'risk_items_organization_id_fkey', convalidated: true, def: 'FOREIGN KEY (organization_id) REFERENCES organizations(id)' },
        { conname: 'risk_items_program_id_fkey', convalidated: true, def: 'FOREIGN KEY (program_id) REFERENCES regulatory_programs(id)' },
        {
          conname: 'risk_items_program_same_org_fk', convalidated: false,
          def: 'FOREIGN KEY (program_id, organization_id) REFERENCES regulatory_programs(id, organization_id) NOT VALID',
        },
      ],
    });
  });

  it('a third replay is still a no-op on the shape', async () => {
    const before = await dcShape();
    await db.exec(read(KEY));
    expect(await dcShape()).toEqual(before);
  });

  it('the input recorded before the column keeps no project', async () => {
    expect(await inputRow(1, legacyInput)).toEqual({ program_id: null, organization_id: 1 });
  });

  it('a legacy cross-organization risk does not fail the deploy, and keeps accepting updates that leave its key alone', async () => {
    expect(await code(db.query(`UPDATE risk_items SET status = 'mitigating' WHERE id = $1`, [legacyCrossRisk]))).toBe('ok');
    expect(await riskRow(db, legacyCrossRisk)).toEqual({ program_id: P2, organization_id: 1, status: 'mitigating' });
  });

  it('an input or a risk naming its own organization\'s project is written', async () => {
    expect(await code(input(1, 'dc-own', P1))).toBe('ok');
    expect(await code(risk(db, 1, P1))).toBe('ok');
    expect(await code(risk(db, 1, null))).toBe('ok');
  });

  it('an input or a risk naming another organization\'s project, or a missing one, is refused', async () => {
    expect(await code(input(1, 'dc-cross', P2))).toBe('23503');
    expect(await code(input(1, 'dc-ghost', P_MISSING))).toBe('23503');
    expect(await code(db.query(`UPDATE c2c_design_controls SET program_id = $1 WHERE id = $2`, [P2, legacyInput]))).toBe('23503');
    expect(await code(risk(db, 1, P2))).toBe('23503');
    const own = (await risk(db, 1, P1)).rows[0].id;
    expect(await code(db.query(`UPDATE risk_items SET program_id = $1 WHERE id = $2`, [P2, own]))).toBe('23503');
    expect(await code(db.query(`UPDATE risk_items SET organization_id = 2 WHERE id = $1`, [own]))).toBe('23503');
  });

  it('deleting a project unbinds its design inputs and keeps their organization', async () => {
    await input(1, 'dc-gamma', P3);
    await db.query(`DELETE FROM regulatory_programs WHERE id = $1`, [P3]);
    expect(await inputRow(1, 'dc-gamma')).toEqual({ program_id: null, organization_id: 1 });
  });

  it('deleting a project with risks anchored to it is refused, as the 20260507 key already refused it', async () => {
    const id = (await risk(db, 1, P4)).rows[0].id;
    expect(await code(db.query(`DELETE FROM regulatory_programs WHERE id = $1`, [P4]))).toBe('23503');
    expect(await riskRow(db, id)).toEqual({ program_id: P4, organization_id: 1, status: 'open' });
  });
});

describe('the drizzle lineage (risk_items.program_id with no key)', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await base(db, riskItemsDrizzleDdl());
    await deployTwice(db, riskItemsDrizzleDdl());
  }, 60_000);
  afterAll(async () => { await db?.close(); });

  it('the new key is the only program key, and it nulls only the program', async () => {
    const keys = (await foreignKeys(db, 'risk_items')).filter((k) => /regulatory_programs/.test(k.def));
    expect(keys).toEqual([{
      conname: 'risk_items_program_same_org_fk', convalidated: false,
      def: 'FOREIGN KEY (program_id, organization_id) REFERENCES regulatory_programs(id, organization_id) ON DELETE SET NULL (program_id) NOT VALID',
    }]);
  });

  it('a risk naming another organization\'s project is refused here too', async () => {
    expect(await code(risk(db, 1, P2))).toBe('23503');
  });

  it('deleting a project unbinds its risks and keeps their organization, as it left them before', async () => {
    const id = (await risk(db, 1, P4)).rows[0].id;
    await db.query(`DELETE FROM regulatory_programs WHERE id = $1`, [P4]);
    expect(await riskRow(db, id)).toEqual({ program_id: null, organization_id: 1, status: 'open' });
  });
});
