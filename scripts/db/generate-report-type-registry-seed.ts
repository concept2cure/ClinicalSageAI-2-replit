/**
 * Generate the migration that seeds report_type_registry from the in-code
 * report type definitions.
 *
 *   npx tsx scripts/db/generate-report-type-registry-seed.ts          # write the file
 *   npx tsx scripts/db/generate-report-type-registry-seed.ts --check  # exit 1 on drift
 *
 * WHY (2026-09-30, D2 Reporting & analytics). report_runs.report_type_id is a
 * foreign key to report_type_registry(type_id), and POST /api/report-os/runs
 * answers 404 for a type the registry does not hold. The only writer of the
 * registry was POST /api/report-os/taxonomy/seed, which production refused, and
 * no migration inserted into it — so on a database provisioned the canonical
 * way (drizzle-kit push + the migration set) the registry was empty and every
 * Run in the Reporting canvas failed.
 *
 * This is now the ONE writer of the registry: that route was deleted in review
 * round 1 (zero duplication). The rows are the three in-code seed arrays, in
 * that order, column for column, each json column as JSON.stringify of the
 * value — the text drizzle's json column sends, which is what the deleted route
 * wrote. server/services/report-os/__tests__/report-type-registry-seed.test.ts
 * pins the rows to the seed arrays and the committed file to this module's
 * output, byte for byte; tests/db/report-os-registry-seed.dbtest.ts applies it.
 *
 * The file is generated, never edited by hand: change a type in code, run this,
 * commit both.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPORT_TYPE_SEED, type ReportTypeDefinition } from '../../server/services/report-os/taxonomy';
import { GLOBAL_REPORT_TYPE_SEED } from '../../server/services/report-os/taxonomy-global';
import { PREDICTION_REPORT_TYPES } from '../../server/services/report-os/prediction/report-types';

/** Repo-relative path of the generated migration (listed in C2C_MIGRATION_FILES). */
export const REPORT_TYPE_REGISTRY_SEED_FILE = 'migrations/20260930_report_type_registry_seed.sql';

/** Every code-defined report type: base, global markets, prediction, in that order. */
export const REPORT_TYPE_REGISTRY_SEED: readonly ReportTypeDefinition[] = [
  ...REPORT_TYPE_SEED,
  ...GLOBAL_REPORT_TYPE_SEED,
  ...PREDICTION_REPORT_TYPES,
];

type ColumnKind = 'text' | 'json';

/**
 * The registry columns the seed writes, as shared/schema/report-os.ts names
 * them. `type_id` is the conflict key; every other entry is a descriptive
 * column the upsert refreshes. `enabled` is deliberately absent: an operator's
 * disable must survive every deploy.
 */
const COLUMNS: ReadonlyArray<readonly [column: string, key: keyof ReportTypeDefinition, kind: ColumnKind]> = [
  ['type_id', 'typeId', 'text'],
  ['label', 'label', 'text'],
  ['family', 'family', 'text'],
  ['allowed_scopes', 'allowedScopes', 'json'],
  ['allowed_personas', 'allowedPersonas', 'json'],
  ['allowed_client_segments', 'allowedClientSegments', 'json'],
  ['data_dependencies', 'dataDependencies', 'json'],
  ['artifact_dependencies', 'artifactDependencies', 'json'],
  ['workflow_dependencies', 'workflowDependencies', 'json'],
  ['ana_modules', 'anaModules', 'json'],
  ['export_template', 'exportTemplate', 'text'],
  ['governance_requirements', 'governanceRequirements', 'json'],
  ['truthfulness_rules', 'truthfulnessRules', 'json'],
];

/** A standard-conforming SQL string literal. */
function literal(text: string): string {
  if (text.includes('\0')) throw new Error('A report type value contains a NUL character.');
  return `'${text.replace(/'/g, "''")}'`;
}

function cell(row: ReportTypeDefinition, key: keyof ReportTypeDefinition, kind: ColumnKind): string {
  const value = row[key];
  if (value === undefined || value === null) {
    // A missing value would insert the column default and then overwrite a
    // real value on every deploy. Refuse instead of guessing.
    throw new Error(`Report type ${row.typeId} has no ${String(key)}; every seeded column must be set.`);
  }
  if (kind === 'json') return `${literal(JSON.stringify(value))}::json`;
  if (typeof value !== 'string') throw new Error(`Report type ${row.typeId}: ${String(key)} must be a string.`);
  return literal(value);
}

function assertUniqueTypeIds(rows: readonly ReportTypeDefinition[]): void {
  const seen = new Set<string>();
  for (const { typeId } of rows) {
    // One INSERT … ON CONFLICT DO UPDATE cannot touch a row twice, so a
    // duplicate would fail every deploy; it is caught here instead.
    if (seen.has(typeId)) throw new Error(`Report type ${typeId} is defined more than once.`);
    seen.add(typeId);
  }
}

function header(count: number): string[] {
  return [
    '-- ============================================================================',
    '-- 20260930_report_type_registry_seed.sql — GENERATED. DO NOT EDIT BY HAND.',
    '--',
    '-- Source:     REPORT_TYPE_SEED            server/services/report-os/taxonomy.ts',
    '--             GLOBAL_REPORT_TYPE_SEED     server/services/report-os/taxonomy-global.ts',
    '--             PREDICTION_REPORT_TYPES     server/services/report-os/prediction/report-types.ts',
    '-- Generator:  npx tsx scripts/db/generate-report-type-registry-seed.ts',
    '-- Drift test: server/services/report-os/__tests__/report-type-registry-seed.test.ts',
    '-- ============================================================================',
    '--',
    '-- 2026-09-30 (D2, Reporting & analytics joins the launch catalog). Why this',
    '-- file exists: report_runs.report_type_id references',
    '-- report_type_registry(type_id) ON DELETE RESTRICT, and POST /api/report-os/runs',
    '-- answers 404 "Unknown reportTypeId" for a type the registry does not hold. No',
    '-- migration inserted into the registry, and its only writer,',
    '-- POST /api/report-os/taxonomy/seed, was refused in production. On a database',
    '-- provisioned the canonical way (drizzle-kit push + the migration set) the',
    '-- registry held 0 rows, so every Run in the Reporting canvas failed.',
    '--',
    '-- What it does, on every deploy (CLAUDE.md Rule 1: every file in',
    '-- C2C_MIGRATION_FILES re-runs on every deploy):',
    '--   1. Refuses when report_type_registry is missing. drizzle-kit push creates',
    '--      it from shared/schema/report-os.ts at provisioning; a database without',
    '--      it was not provisioned completely, and this file does not create it.',
    `--   2. Upserts the ${count} code-defined types, each json column as the text`,
    "--      drizzle's json column sends: ON CONFLICT (type_id) DO UPDATE SET every",
    '--      descriptive column and updated_at = now(), so the registry mirrors the',
    '--      code after every deploy. `enabled` is not in the SET list: an',
    "--      operator's disable survives every deploy.",
    `--   3. Raises when fewer than ${count} of the seeded type_ids are present.`,
    '--',
    '-- Changing a type: edit it in code and regenerate this file; the drift test',
    '-- fails until they match. Regenerating in place registers as `drift` in',
    '-- c2c_migration_journal, which is expected for this file. A type removed from',
    '-- the code keeps its row (report_runs and report_subscriptions reference it',
    '-- ON DELETE RESTRICT); retire it with enabled = false.',
    '--',
    '-- Review round 1 (2026-09-30): POST /taxonomy/seed was deleted. This file is',
    '-- the one writer of the registry.',
    '--',
    '-- No DDL, no DROP.',
    '',
  ];
}

function tableGuard(): string[] {
  return [
    'DO $$',
    'BEGIN',
    "  IF to_regclass('public.report_type_registry') IS NULL THEN",
    "    RAISE EXCEPTION 'report_type_registry does not exist. drizzle-kit push creates it from shared/schema/report-os.ts when the database is provisioned (scripts/db/install-fresh.mjs); this database was not provisioned completely, and this migration does not create the table.';",
    '  END IF;',
    'END $$;',
    '',
  ];
}

function upsert(rows: readonly ReportTypeDefinition[]): string[] {
  const values = rows.map(
    (row, i) => `  (${COLUMNS.map(([, key, kind]) => cell(row, key, kind)).join(', ')})${i < rows.length - 1 ? ',' : ''}`,
  );
  const updates = COLUMNS.filter(([column]) => column !== 'type_id').map(
    ([column]) => `  ${column} = EXCLUDED.${column},`,
  );
  return [
    'INSERT INTO public.report_type_registry',
    `  (${COLUMNS.map(([column]) => column).join(', ')})`,
    'VALUES',
    ...values,
    'ON CONFLICT (type_id) DO UPDATE SET',
    ...updates,
    '  updated_at = now();',
    '',
  ];
}

function countAssertion(rows: readonly ReportTypeDefinition[]): string[] {
  return [
    'DO $$',
    'DECLARE',
    `  expected CONSTANT integer := ${rows.length};`,
    '  present integer;',
    'BEGIN',
    '  SELECT count(*) INTO present',
    '    FROM public.report_type_registry',
    '   WHERE type_id = ANY (ARRAY[',
    ...rows.map(({ typeId }, i) => `     ${literal(typeId)}${i < rows.length - 1 ? ',' : ''}`),
    '   ]);',
    '  IF present < expected THEN',
    "    RAISE EXCEPTION 'report_type_registry holds % of the % seeded report types after the seed; the file is incomplete or a row was refused.', present, expected;",
    '  END IF;',
    'END $$;',
    '',
  ];
}

/** The full text of the migration, from the in-code seeds. Pure. */
export function buildReportTypeRegistrySeedSql(
  rows: readonly ReportTypeDefinition[] = REPORT_TYPE_REGISTRY_SEED,
): string {
  if (rows.length === 0) throw new Error('There are no report types to seed.');
  assertUniqueTypeIds(rows);
  return [...header(rows.length), ...tableGuard(), ...upsert(rows), ...countAssertion(rows)].join('\n');
}

function main(): void {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const target = path.join(repoRoot, REPORT_TYPE_REGISTRY_SEED_FILE);
  const sql = buildReportTypeRegistrySeedSql();
  if (process.argv.includes('--check')) {
    let committed = '';
    try {
      committed = readFileSync(target, 'utf8');
    } catch {
      committed = '';
    }
    if (committed !== sql) {
      console.error(`${REPORT_TYPE_REGISTRY_SEED_FILE} does not match the in-code report types. Regenerate it.`);
      process.exit(1);
    }
    console.log(`${REPORT_TYPE_REGISTRY_SEED_FILE} matches the ${REPORT_TYPE_REGISTRY_SEED.length} in-code report types.`);
    return;
  }
  writeFileSync(target, sql);
  console.log(`Wrote ${REPORT_TYPE_REGISTRY_SEED_FILE}: ${REPORT_TYPE_REGISTRY_SEED.length} report types.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
