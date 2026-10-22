/**
 * The cross-artifact consistency alert store reaches deployed databases.
 *
 * db/migrations/20260508_consistency_alerts.sql is the only file that creates
 * cross_artifact_consistency_alerts with its CHECKs and the unique partial
 * index the scanner's `ON CONFLICT … WHERE status IN ('open','acknowledged')`
 * names as its arbiter. Until 2026-10-15 it was on no deploy path: it is not
 * `_gcc_`, so install-fresh does not apply it, and it was not in
 * C2C_MIGRATION_FILES. A database provisioned before the table was declared in
 * shared/schema.ts has no table (every scan, list and summary fails 42P01); one
 * provisioned after has the drizzle-pushed table without the arbiter index, so
 * every alert insert fails 42P10. Mounted routes (/api/ana/consistency/*), the
 * readiness aggregate and the authoring plan all read or write it.
 *
 * The file is public + organization_id INTEGER NOT NULL, CREATE … IF NOT
 * EXISTS throughout and drops nothing, so it is listed above the isolation
 * tail, which gives the table its tenant policy. This applies it twice to
 * PGlite: on a database without the table, and on one with the pushed shape.
 */
import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { C2C_MIGRATION_FILES, TENANT_ISOLATION_SWEEP } from '../../../scripts/db/migration-set.mjs';

const FILE = 'db/migrations/20260508_consistency_alerts.sql';
const SQL = fs.readFileSync(path.join(process.cwd(), FILE), 'utf8');
const T = 120_000;

/** cross_artifact_consistency_alerts as drizzle push creates it from shared/schema.ts: no CHECKs, no unique index. */
const PUSHED_SHAPE = `
  CREATE TABLE cross_artifact_consistency_alerts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id integer NOT NULL,
    project_id integer NOT NULL,
    artifact_a_id text NOT NULL,
    artifact_a_pk integer NOT NULL,
    artifact_a_ctd_section text,
    sentence_content_hash text NOT NULL,
    sentence_text text NOT NULL,
    artifact_b_id text NOT NULL,
    artifact_b_pk integer NOT NULL,
    artifact_b_ctd_section text,
    contradicting_passage text,
    severity text NOT NULL,
    severity_rule_id text,
    status text NOT NULL DEFAULT 'open',
    acknowledged_at timestamptz,
    acknowledged_by integer,
    resolved_at timestamptz,
    resolved_by integer,
    metadata jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX idx_consistency_alerts_org ON cross_artifact_consistency_alerts (organization_id);
  CREATE INDEX idx_consistency_alerts_project ON cross_artifact_consistency_alerts (organization_id, project_id);
  CREATE INDEX idx_consistency_alerts_artifact_a ON cross_artifact_consistency_alerts (artifact_a_id);
  CREATE INDEX idx_consistency_alerts_artifact_b ON cross_artifact_consistency_alerts (artifact_b_id);`;

/** The scanner's insert (cross-artifact-consistency-scanner.ts), with its arbiter. */
const SCANNER_INSERT = `
  INSERT INTO cross_artifact_consistency_alerts (
    organization_id, project_id, artifact_a_id, artifact_a_pk, artifact_a_ctd_section,
    sentence_content_hash, sentence_text, artifact_b_id, artifact_b_pk, artifact_b_ctd_section,
    contradicting_passage, severity, severity_rule_id, metadata
  ) VALUES (7, 1, 'art_a', 1, '2.4', 'h1', 'The NOAEL was 50 mg/kg/day.', 'art_b', 2, '2.4', NULL, 'major', NULL, NULL)
  ON CONFLICT (organization_id, project_id, artifact_a_id, artifact_b_id, sentence_content_hash)
    WHERE status IN ('open','acknowledged')
  DO NOTHING
  RETURNING id`;

async function indexes(pg: PGlite): Promise<string[]> {
  const r = await pg.query<{ indexname: string }>(
    `SELECT indexname FROM pg_indexes WHERE tablename = 'cross_artifact_consistency_alerts' ORDER BY indexname`,
  );
  return r.rows.map((x) => x.indexname);
}

describe(FILE, () => {
  it('is in the deploy set, ahead of the isolation tail', () => {
    const files = C2C_MIGRATION_FILES as readonly string[];
    const at = files.indexOf(FILE);
    expect(at, 'the consistency alert store is on no deploy path').toBeGreaterThan(-1);
    expect(at).toBeLessThan(files.indexOf(TENANT_ISOLATION_SWEEP) - 2);
  });

  it('creates the store on a database without it, and re-runs as a no-op', async () => {
    const pg = new PGlite();
    try {
      for (let deploy = 0; deploy < 2; deploy++) await pg.exec(SQL);

      expect(await indexes(pg)).toContain('idx_consistency_alerts_unique_active');
      expect((await pg.query(SCANNER_INSERT)).rows).toHaveLength(1);
      expect((await pg.query(SCANNER_INSERT)).rows, 'a re-scan duplicated an open alert').toHaveLength(0);
      await expect(
        pg.query(`UPDATE cross_artifact_consistency_alerts SET severity = 'unknown'`),
      ).rejects.toThrow(/check constraint/);
    } finally {
      await pg.close();
    }
  }, T);

  it('gives a push-provisioned table the arbiter index every alert insert needs, keeping its rows', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(PUSHED_SHAPE);
      await expect(pg.query(SCANNER_INSERT), 'without the file, no alert can be stored').rejects.toMatchObject({
        code: '42P10',
      });

      for (let deploy = 0; deploy < 2; deploy++) await pg.exec(SQL);

      expect(await indexes(pg)).toEqual([
        'cross_artifact_consistency_alerts_pkey',
        'idx_consistency_alerts_artifact_a',
        'idx_consistency_alerts_artifact_b',
        'idx_consistency_alerts_org',
        'idx_consistency_alerts_project',
        'idx_consistency_alerts_status_severity',
        'idx_consistency_alerts_unique_active',
      ]);
      expect((await pg.query(SCANNER_INSERT)).rows).toHaveLength(1);
      await pg.exec(SQL);
      expect((await pg.query(`SELECT count(*)::int AS n FROM cross_artifact_consistency_alerts`)).rows).toEqual([
        { n: 1 },
      ]);
    } finally {
      await pg.close();
    }
  }, T);
});
