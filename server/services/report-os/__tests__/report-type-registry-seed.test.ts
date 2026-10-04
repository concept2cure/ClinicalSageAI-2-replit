/**
 * The report type registry seed migration is generated from the in-code
 * report types, and the committed file is exactly what the generator writes.
 *
 * Why it matters (2026-09-30, D2): migrations/20260930_report_type_registry_seed.sql
 * is the only path by which report types reach any database (the dev-only
 * POST /taxonomy/seed was deleted in review round 1). A type added or
 * relabelled in code without regenerating the file would 404 on every
 * database. This test fails until the file is regenerated:
 *
 *   npx tsx scripts/db/generate-report-type-registry-seed.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  REPORT_TYPE_REGISTRY_SEED,
  REPORT_TYPE_REGISTRY_SEED_FILE,
  buildReportTypeRegistrySeedSql,
} from '../../../../scripts/db/generate-report-type-registry-seed';
import { REPORT_TYPE_SEED } from '../taxonomy';
import { GLOBAL_REPORT_TYPE_SEED } from '../taxonomy-global';
import { PREDICTION_REPORT_TYPES } from '../prediction/report-types';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const committed = () => readFileSync(path.join(repoRoot, REPORT_TYPE_REGISTRY_SEED_FILE), 'utf8');

describe('report type registry seed migration', () => {
  it('is byte-identical to what the generator writes from the in-code report types', () => {
    expect(committed()).toBe(buildReportTypeRegistrySeedSql());
  });

  it('seeds every in-code report type, base, global and prediction, once each, row for row', () => {
    const all = [...REPORT_TYPE_SEED, ...GLOBAL_REPORT_TYPE_SEED, ...PREDICTION_REPORT_TYPES];
    // The generator is the one writer of the registry: its rows are the seed arrays, whole.
    expect(REPORT_TYPE_REGISTRY_SEED).toEqual(all);
    expect(new Set(all.map((t) => t.typeId)).size).toBe(all.length);
    const sql = buildReportTypeRegistrySeedSql();
    for (const { typeId } of all) expect(sql).toContain(`('${typeId}', `);
    expect(sql).toContain(`expected CONSTANT integer := ${all.length};`);
  });

  it('refreshes every descriptive column on conflict and never touches enabled', () => {
    const sql = buildReportTypeRegistrySeedSql();
    const set = sql.slice(sql.indexOf('ON CONFLICT (type_id) DO UPDATE SET'), sql.indexOf('updated_at = now();'));
    for (const column of [
      'label', 'family', 'allowed_scopes', 'allowed_personas', 'allowed_client_segments',
      'data_dependencies', 'artifact_dependencies', 'workflow_dependencies', 'ana_modules',
      'export_template', 'governance_requirements', 'truthfulness_rules',
    ]) {
      expect(set).toContain(`${column} = EXCLUDED.${column},`);
    }
    // The header explains why `enabled` is left alone; the statements must not name it.
    const statements = sql.split('\n').filter((line) => !line.startsWith('--')).join('\n');
    expect(statements).not.toMatch(/\benabled\b/);
    expect(statements).not.toMatch(/\bDROP\b/i);
  });

  it('writes each json column as the JSON text drizzle sends for it', () => {
    const [first] = REPORT_TYPE_REGISTRY_SEED;
    const sql = buildReportTypeRegistrySeedSql();
    expect(sql).toContain(`'${JSON.stringify(first.allowedScopes)}'::json`);
    expect(sql).toContain(`'${JSON.stringify(first.truthfulnessRules)}'::json`);
  });

  it('raises on a missing table and on a short registry', () => {
    const sql = buildReportTypeRegistrySeedSql();
    expect(sql).toMatch(/IF to_regclass\('public\.report_type_registry'\) IS NULL THEN\s+RAISE EXCEPTION/);
    expect(sql).toMatch(/IF present < expected THEN\s+RAISE EXCEPTION/);
  });

  // The negative control: the comparison above is only worth something if a
  // one-label difference fails it. A copy of the generated text with one label
  // changed must not equal it.
  it('a copy with one label changed does not match', () => {
    const [first] = REPORT_TYPE_REGISTRY_SEED;
    const generated = buildReportTypeRegistrySeedSql();
    const edited = generated.replace(`'${first.label}'`, `'${first.label} (edited)'`);
    expect(edited).toContain(`'${first.label} (edited)'`);
    expect(edited).not.toBe(generated);
  });

  it('refuses a duplicated type id and a missing column instead of writing a file that fails on deploy', () => {
    const [first] = REPORT_TYPE_REGISTRY_SEED;
    expect(() => buildReportTypeRegistrySeedSql([first, first])).toThrow(/more than once/);
    const missing = { ...first, exportTemplate: undefined } as unknown as typeof first;
    expect(() => buildReportTypeRegistrySeedSql([missing])).toThrow(/every seeded column must be set/);
    const quoted = { ...first, label: "Sponsor's pack" };
    expect(buildReportTypeRegistrySeedSql([quoted])).toContain(`'Sponsor''s pack'`);
  });
});
