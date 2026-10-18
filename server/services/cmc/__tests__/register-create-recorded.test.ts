/**
 * Contract: a CMC register row is created by ONE of two recorded paths, and by
 * nothing else — so every register row has an operator on the audit chain.
 *
 * ── Why a source-level guard ─────────────────────────────────────────────────
 * The behaviour is proved against a real Postgres in
 * `register-create-attribution.pglite.integration.test.ts`. What that cannot
 * prove is the absence of a NEW write path: a route added next month with its
 * own `db.insert(stabilityStudies)` would write a perfectly valid register row
 * that no audit row names, and nothing would fail — recording would appear to
 * work. That is exactly how the registers came to have no operator in the
 * first place: sixteen creates, written one at a time, each reasonable.
 *
 * So the two doors are named here:
 *
 *   • `insertRegisterRow(orgId, actor, register, table, values)` — the Drizzle
 *     path, used by the register service and by the routes that create their
 *     own register rows;
 *   • `createOnConnection(pool, {…}, insert)` — the pinned-connection path for
 *     the three registers whose create is raw `INSERT … RETURNING` SQL.
 *
 * Both live in `services/cmc/register-audit.ts`, which is the only module that
 * may insert a register row, and the only one that writes
 * `cmc.register.create`.
 *
 * @compliance 21 CFR Part 11 §11.10(e)
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

/**
 * Comments stripped before scanning. These files' own notes NAME the inserts
 * they used to make, and a guard that cannot tell a description of a write
 * from a write would be satisfied by deleting the explanation.
 */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** Every .ts under server/, except tests and the recorded-insert module itself. */
function serverSources(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name === '_archive') continue;
        walk(full);
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        out.push(path.relative(repoRoot, full));
      }
    }
  };
  walk(path.join(repoRoot, 'server'));
  return out;
}

const RECORDED_INSERT_MODULE = 'server/services/cmc/register-audit.ts';

/** The Drizzle definition of every register whose create goes through the shared insert. */
const DRIZZLE_REGISTERS = [
  'drugSubstances',
  'drugProducts',
  'cmcContainerClosures',
  'cmcMaterialSpecs',
  'cmcFormulationRecords',
  'cmcCharacterizationStudies',
  'manufacturingProcesses',
  'analyticalMethods',
  'processValidation',
  'stabilityStudies',
  'qcTesting',
  'cmcChangeControl',
  'cmcReferenceStandards',
  'cmcImpurityProfiles',
  'cmcDissolutionProfiles',
] as const;

/** The three registers created with raw SQL, and the one route module that may. */
const RAW_SQL_REGISTERS: ReadonlyArray<readonly [table: string, owner: string]> = [
  ['cmc_comparability_assessments', 'server/api/cmc/routes.ts'],
  ['cmc_batch_records', 'server/api/cmc/batchRecordRoutes.ts'],
  ['quality_specifications', 'server/api/cmc/specificationRoutes.ts'],
];

const sources = serverSources().map((file) => ({
  file,
  src: code(fs.readFileSync(path.join(repoRoot, file), 'utf8')),
}));

describe('no register row is inserted outside the recorded path', () => {
  it.each(DRIZZLE_REGISTERS)('%s has no insert of its own', (table) => {
    const pattern = new RegExp(`\\.insert\\(\\s*${table}\\s*\\)`);
    const offenders = sources.filter((s) => pattern.test(s.src)).map((s) => s.file);
    expect(
      offenders,
      `${table} is inserted directly in ${offenders.join(', ')}. A register create goes through ` +
        `insertRegisterRow (${RECORDED_INSERT_MODULE}), which writes the row and the §11.10(e) ` +
        `record of who recorded it on one transaction.`,
    ).toEqual([]);
  });

  it.each(RAW_SQL_REGISTERS)('%s is inserted only by %s', (table, owner) => {
    const pattern = new RegExp(`INSERT\\s+INTO\\s+"?${table}"?`, 'i');
    const offenders = sources.filter((s) => pattern.test(s.src)).map((s) => s.file);
    expect(offenders, `an INSERT INTO ${table} appeared outside ${owner}`).toEqual([owner]);
  });

  it.each(RAW_SQL_REGISTERS)('%s is created on a pinned connection (%s)', (_table, owner) => {
    const src = fs.readFileSync(path.join(repoRoot, owner), 'utf8');
    expect(src).toContain("from '../../services/cmc/register-audit'");
    expect(src).toContain('createOnConnection');
  });
});

describe('cmc.register.create has one writer', () => {
  it('only register-audit.ts writes it', () => {
    const offenders = sources
      .filter((s) => s.file !== RECORDED_INSERT_MODULE && /cmc\.register\.create/.test(s.src))
      .map((s) => s.file);
    expect(offenders, `cmc.register.create is written outside ${RECORDED_INSERT_MODULE}`).toEqual([]);
  });

  it('register-audit.ts is the only module that inserts a register row by table handle', () => {
    const src = fs.readFileSync(path.join(repoRoot, RECORDED_INSERT_MODULE), 'utf8');
    /* The generic insert, on the caller's transaction, beside the chained row. */
    expect(src).toMatch(/tx\.insert\(table\)/);
    expect(src).toContain('writeChainedAuditRow');
    /* And the actor is resolved before the transaction opens, so a create with
       nobody to name writes nothing at all. */
    expect(src).toMatch(/const actorId = resolveRegisterActor\([\s\S]{0,60}\);\s*\n\s*return db\.transaction/);
  });
});

describe('the register catalogue is complete', () => {
  it('names a register for each of the eighteen creates', () => {
    const src = fs.readFileSync(path.join(repoRoot, RECORDED_INSERT_MODULE), 'utf8');
    const union = /export type CmcRegister =([\s\S]*?);/.exec(src)?.[1] ?? '';
    const names = [...union.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual([
      'drug_substance',
      'drug_product',
      'container_closure',
      'material_spec',
      'formulation_record',
      'manufacturing_process',
      'characterization_study',
      'analytical_method',
      'process_validation',
      'stability_study',
      'qc_test',
      'change_control',
      'reference_standard',
      'impurity_profile',
      'dissolution_profile',
      'comparability_study',
      'batch_record',
      'specification',
    ]);
  });
});
