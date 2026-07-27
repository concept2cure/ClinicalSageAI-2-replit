/**
 * Schema-contract test harness (ADR-0010).
 *
 * Applies REAL migration files to an in-process Postgres (PGlite) and exposes
 * introspection helpers, so contract tests assert against the schema a
 * deployment would actually produce.
 *
 * Why this exists: the operating-system unit tests call `vi.mock('../../db')`
 * and replace the entire Drizzle surface with stubs. They pass while asserting
 * nothing about the schema — mocks accept any column name and any enum value.
 * That is how conflicts C-1, C-2 and C-7 (see
 * docs/architecture/C2C_SCHEMA_AND_ENUM_CONFLICT_LEDGER.md) survived undetected.
 *
 * Contrast with server/db/pglite-harness.ts, which hand-mirrors DDL in a
 * template literal ("keep them in sync"). Hand-mirrored DDL cannot detect
 * migration drift — it *is* a second copy that can drift. This harness reads
 * the migration files from disk instead.
 *
 * @compliance ICH E6(R2) data integrity — the schema under test is the schema
 *             that ships.
 */

import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

/**
 * Baseline objects that exist in any real database before the operating-system
 * migrations run (FK targets). Kept deliberately minimal — only what the
 * migrations under test reference.
 */
export const FK_PREREQUISITES = `
CREATE TABLE IF NOT EXISTS organizations (
  id SERIAL PRIMARY KEY,
  name TEXT
);
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT
);
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER REFERENCES organizations(id),
  name TEXT
);
CREATE TABLE IF NOT EXISTS concept2cure_artifacts (
  id SERIAL PRIMARY KEY,
  artifact_id UUID DEFAULT gen_random_uuid(),
  organization_id INTEGER,
  status TEXT,
  updated_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS concept2cure_artifact_versions (
  id SERIAL PRIMARY KEY,
  artifact_id INTEGER
);
`;

export interface AppliedMigration {
  file: string;
  applied: boolean;
  /** First line of the failure, when the migration did not apply. */
  error?: string;
}

export class SchemaContractDb {
  private constructor(
    readonly pg: PGlite,
    readonly applied: AppliedMigration[],
  ) {}

  /**
   * Spin up a fresh database, install FK prerequisites, then apply the given
   * migration files in order.
   *
   * A migration that throws is recorded rather than rethrown — several contract
   * tests exist precisely to assert *which* migrations fail and why.
   */
  static async create(migrationFiles: string[]): Promise<SchemaContractDb> {
    const pg = new PGlite();
    await pg.exec(FK_PREREQUISITES);

    const applied: AppliedMigration[] = [];
    for (const file of migrationFiles) {
      const abs = path.isAbsolute(file) ? file : path.join(REPO_ROOT, file);
      try {
        await pg.exec(fs.readFileSync(abs, 'utf8'));
        applied.push({ file, applied: true });
      } catch (err) {
        applied.push({
          file,
          applied: false,
          error: String((err as Error)?.message ?? err).split('\n')[0],
        });
      }
    }
    return new SchemaContractDb(pg, applied);
  }

  /** Column names of a table, in ordinal order. Empty array if absent. */
  async columns(table: string): Promise<string[]> {
    const r = await this.pg.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = $1 ORDER BY ordinal_position`,
      [table],
    );
    return r.rows.map((x) => x.column_name);
  }

  /** Values of a pg enum type. Null if the type does not exist. */
  async enumValues(typeName: string): Promise<string[] | null> {
    try {
      const r = await this.pg.query<{ v: string }>(
        `SELECT unnest(enum_range(NULL::${typeName}))::text AS v`,
      );
      return r.rows.map((x) => x.v);
    } catch {
      return null;
    }
  }

  async tableExists(table: string): Promise<boolean> {
    return (await this.columns(table)).length > 0;
  }

  /**
   * Attempt a write and report whether the schema accepted it.
   * Used to assert that every value a service can produce is actually storable.
   */
  async tryWrite(sql: string, params: unknown[] = []): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.pg.query(sql, params);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String((err as Error)?.message ?? err).split('\n')[0] };
    }
  }

  async close(): Promise<void> {
    await this.pg.close();
  }
}

/** The two colliding operating-system migrations (conflict C-1 / C-2 / C-6). */
export const OPERATING_SYSTEM_MIGRATIONS = {
  /** Drizzle-shaped: matches shared/schema/operating-system.ts */
  drizzleShaped: 'migrations/0010_operating_system_foundation.sql',
  /** Raw-SQL-shaped: matches server/services/assumption-registry-service.ts */
  rawSqlShaped: 'db/migrations/20260323_assumption_decision_contradiction.sql',
} as const;
