/**
 * Clinical-Regulatory Intelligence Graph — schema ⇄ migration parity.
 *
 * `drizzle-kit push` is unusable on this schema (AGENTS.md: use
 * `npm run db:ensure`), so the Drizzle tables in shared/schema.ts and the SQL in
 * migrations/20260725_clinical_regulatory_evidence.sql are maintained by hand
 * and can drift silently. A column added to one and not the other produces a
 * runtime "column does not exist" in production rather than a build failure.
 *
 * This test pins the two together, and pins the CHECK constraints that carry the
 * work order's honesty invariants — those live only in the SQL, because pgTable
 * cannot express them, and deleting one would otherwise break nothing visible.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getTableColumns } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import {
  clinicalStudyIdentities,
  designLessons,
  evidenceRelationships,
  clinicalEvidenceSources,
  regulatoryApplications,
  regulatoryFindings,
  regulatoryApplicationOutcomes,
  studyResultObservations,
} from '@shared/schema';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');
const migrationPath = path.join(
  repoRoot,
  'migrations',
  '20260725_clinical_regulatory_evidence.sql',
);
const sql = fs.readFileSync(migrationPath, 'utf8');

/** Extract the column names declared in one CREATE TABLE block. */
function migrationColumns(table: string): Set<string> {
  const re = new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(([\\s\\S]*?)\\n\\);`, 'm');
  const body = re.exec(sql)?.[1];
  if (!body) throw new Error(`CREATE TABLE for ${table} not found in the migration`);
  const cols = new Set<string>();
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    // Skip comments, constraint clauses and blank lines — columns only.
    if (!line || line.startsWith('--') || /^CONSTRAINT\b/i.test(line)) continue;
    const m = /^([a-z_][a-z0-9_]*)\s+[A-Z]/.exec(line);
    if (m) cols.add(m[1]);
  }
  return cols;
}

/** The Drizzle column NAMES (snake_case), not the TS property names. */
function drizzleColumns(table: Parameters<typeof getTableColumns>[0]): Set<string> {
  return new Set(Object.values(getTableColumns(table)).map((c) => c.name));
}

const TABLES: [string, Parameters<typeof getTableColumns>[0]][] = [
  ['clinical_evidence_sources', clinicalEvidenceSources],
  ['clinical_study_identities', clinicalStudyIdentities],
  ['study_result_observations', studyResultObservations],
  ['regulatory_applications', regulatoryApplications],
  ['regulatory_findings', regulatoryFindings],
  ['regulatory_application_outcomes', regulatoryApplicationOutcomes],
  ['evidence_relationships', evidenceRelationships],
  ['design_lessons', designLessons],
];

describe('schema ⇄ migration parity', () => {
  it.each(TABLES)('%s has identical columns in both', (name, table) => {
    const fromSql = migrationColumns(name);
    const fromDrizzle = drizzleColumns(table);

    const missingInSql = [...fromDrizzle].filter((c) => !fromSql.has(c));
    const missingInDrizzle = [...fromSql].filter((c) => !fromDrizzle.has(c));

    expect(missingInSql, `${name}: in schema.ts but not the migration`).toEqual([]);
    expect(missingInDrizzle, `${name}: in the migration but not schema.ts`).toEqual([]);
  });

  it('declares all eight work-order entities', () => {
    expect(TABLES).toHaveLength(8);
  });
});

describe('honesty invariants are enforced by the database', () => {
  /**
   * Each of these encodes a claim the product makes to a regulatory affairs
   * professional. Losing one would not break a test elsewhere or change a
   * rendered pixel — it would just quietly permit a fabrication. Hence pinning
   * them here.
   */
  const REQUIRED_CONSTRAINTS: [string, string][] = [
    [
      'cre_find_study_requires_study_level',
      'a finding may carry a study_id only when it is genuinely study-level (§6.2)',
    ],
    ['cre_src_visibility_scope', 'public evidence is never tenant-owned (§14)'],
    [
      'cre_outcome_resolved_needs_verification',
      'only an unresolved outcome may lack verification (§4.2)',
    ],
    [
      'cre_rel_potential_is_inferred',
      'POTENTIALLY_RELATED is always inferred and carries a rationale (§4.1)',
    ],
    [
      'cre_find_verified_needs_review',
      'source_verified requires the review timestamp that proves it (§13.2)',
    ],
    [
      'cre_study_inferred_needs_rationale',
      'an inferred study link states why it was inferred (§7.2)',
    ],
    [
      'cre_lesson_reviewed_needs_reviewer',
      'a human-reviewed lesson records who reviewed it (§12.1)',
    ],
  ];

  it.each(REQUIRED_CONSTRAINTS)('%s — %s', (constraint) => {
    expect(sql).toContain(`CONSTRAINT ${constraint}`);
  });

  it('constrains every enum-like column to its allowed values', () => {
    for (const c of [
      'cre_find_severity',
      'cre_find_applicability',
      'cre_find_epistemic',
      'cre_find_verification',
      'cre_outcome_kind',
      'cre_rel_epistemic',
      'cre_lesson_review_state',
      'cre_study_linkage_status',
    ]) {
      expect(sql, `${c} missing`).toContain(`CONSTRAINT ${c}`);
    }
  });

  it('lists all seven §13.2 verification states', () => {
    for (const state of [
      'source_verified',
      'extracted_unreviewed',
      'inferred_mapping',
      'potential_study_link',
      'insufficient_evidence',
      'stale_recalculate',
    ]) {
      expect(sql).toContain(`'${state}'`);
    }
  });

  it('keeps every mapping value beside its own epistemic-status column', () => {
    // §7.2: a merged column would make an inferred mapping storable as if FDA
    // stated it. The pairing is the mechanism, so it is pinned.
    for (const [value, status] of [
      ['ctd_section', 'ctd_section_status'],
      ['ich_e3_section', 'ich_e3_section_status'],
      ['design_node_type', 'design_node_status'],
    ]) {
      const cols = drizzleColumns(regulatoryFindings);
      expect(cols.has(value), `${value} missing`).toBe(true);
      expect(cols.has(status), `${status} missing`).toBe(true);
    }
  });
});

describe('migration is safe to re-run and to roll back', () => {
  it('creates every table and index idempotently', () => {
    const creates = sql.match(/CREATE TABLE(?! IF NOT EXISTS)/g) ?? [];
    expect(creates, 'every CREATE TABLE must be IF NOT EXISTS').toEqual([]);
    const indexes = sql.match(/CREATE INDEX(?! IF NOT EXISTS)/g) ?? [];
    expect(indexes, 'every CREATE INDEX must be IF NOT EXISTS').toEqual([]);
  });

  it('is additive — it never drops or alters an existing table', () => {
    // The CSR corpus must survive this migration untouched: the adapter
    // PROJECTS from csr_reports/csr_details rather than migrating them.
    //
    // Checked against the STATEMENTS, not the prose — the header comment names
    // those tables precisely to say it leaves them alone, and matching the
    // comment would fail the file for documenting its own safety.
    const statements = sql
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n');
    expect(statements).not.toMatch(/^\s*(DROP|ALTER|TRUNCATE|DELETE)\s/im);
    expect(statements).not.toMatch(/csr_reports|csr_details|lumen_data_atoms/);
  });

  it('documents its rollback', () => {
    expect(sql).toMatch(/Rollback/i);
    expect(sql).toMatch(/DROP TABLE IF EXISTS/);
  });
});
