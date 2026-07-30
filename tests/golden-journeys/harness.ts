/**
 * Golden-journey harness (WO-01).
 *
 * Runs journeys against the REAL services and the REAL canonical DDL on an
 * in-process Postgres. The db module is redirected (not stubbed): `db` is a
 * drizzle instance over PGlite and `pool` is a duck-typed shim whose `query`
 * is PGlite's — every one of the raw-SQL services' 34 `pool.query` calls
 * executes against genuine schema.
 *
 * The recorder produces the WO-01 journey manifest: a machine-readable record
 * of every step, its evidence (ids, hashes, counts, blocked reasons), and the
 * journey's known limitations — plus a human-readable report rendered FROM the
 * manifest (the JSON is the truth source, per the Proof Packet rule).
 */

import fs from 'node:fs';
import path from 'node:path';

export const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** Canonical migrations a journey database carries, in order. */
export const CANONICAL_JOURNEY_MIGRATIONS = [
  'db/migrations/20260323_assumption_decision_contradiction.sql',
  'db/migrations/20260725_governance_boundary_tables.sql',
  'db/migrations/20260725_resolution_orchestration_tables.sql',
  'db/migrations/20260725_bundle_execution_receipts.sql',
] as const;

/** FK prerequisites + two tenants for isolation assertions. */
export const JOURNEY_PREREQUISITES = `
  CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT);
  CREATE TABLE users (id SERIAL PRIMARY KEY, email TEXT);
  CREATE TABLE projects (id SERIAL PRIMARY KEY, organization_id INTEGER, name TEXT);
  CREATE TABLE concept2cure_artifacts (id SERIAL PRIMARY KEY, artifact_id UUID DEFAULT gen_random_uuid(), organization_id INTEGER, status TEXT, updated_at TIMESTAMPTZ DEFAULT NOW());
  CREATE TABLE concept2cure_artifact_versions (id SERIAL PRIMARY KEY, artifact_id INTEGER, organization_id INTEGER, version INTEGER, content TEXT, content_hash TEXT, change_description TEXT, created_by_id INTEGER, created_at TIMESTAMPTZ DEFAULT NOW());
  CREATE TABLE unified_documents (id SERIAL PRIMARY KEY, organization_id INTEGER, status TEXT);
  INSERT INTO organizations (id, name) VALUES (1, 'journey-org'), (2, 'other-org');
  INSERT INTO users (id, email) VALUES (1, 'author@example.com'), (2, 'reviewer@example.com');
  INSERT INTO projects (id, organization_id, name) VALUES (1, 1, 'journey-project'), (2, 2, 'other-project');
`;

/**
 * Extract named `CREATE TABLE` blocks verbatim from a real migration file.
 *
 * Some journeys need a handful of tables out of a very large file — the drizzle
 * baseline (migrations/0000_sweet_joseph.sql) is thousands of lines and defines
 * hundreds of tables, most irrelevant and some using constructs an in-process
 * Postgres will not accept. The alternative is hand-mirroring the columns into
 * the test, which is exactly the drift this harness exists to avoid (see the
 * header note about server/db/pglite-harness.ts).
 *
 * FK constraints in that baseline are applied by separate `ALTER TABLE … ADD
 * CONSTRAINT` statements at the end of the file, which are deliberately NOT
 * extracted: a journey seeds only the subset of tables it needs, so enforcing
 * every FK would require dragging in the whole graph.
 *
 * Throws when a requested table is absent — a silent miss would surface later as
 * a confusing "relation does not exist" from inside a service.
 */
export function extractTableDdl(file: string, tables: readonly string[]): string {
  const sql = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
  const out: string[] = [];
  for (const table of tables) {
    // Accepts an optional schema qualifier (`public.submissions`) and optional
    // quoting on either part, which the two lineages use inconsistently.
    const re = new RegExp(
      `CREATE TABLE (?:IF NOT EXISTS )?(?:"?public"?\\.)?"?${table}"?\\s*\\(([\\s\\S]*?)\\n\\);`,
      'i',
    );
    const m = sql.match(re);
    if (!m) throw new Error(`extractTableDdl: ${table} not found in ${file}`);
    out.push(`CREATE TABLE IF NOT EXISTS "${table}" (${m[1]}\n);`);
  }
  return out.join('\n');
}

export interface JourneyDb {
  pglite: import('@electric-sql/pglite').PGlite;
  db: unknown;
  /** node-postgres-compatible shim over PGlite for the raw-SQL services. */
  pool: { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };
  close: () => Promise<void>;
}

export async function createJourneyDb(options?: {
  /** Override the FK-prerequisite DDL (defaults to JOURNEY_PREREQUISITES). */
  prereqSql?: string;
  /** Override the canonical migrations to apply (repo-relative paths). */
  migrations?: readonly string[];
  /** Extra TEST-ONLY DDL applied after migrations (e.g. a code-shaped table
   *  whose canonical reconciliation is still pending — must be documented in
   *  the journey's limitations). */
  testOnlySql?: string;
}): Promise<JourneyDb> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');

  const pglite = new PGlite();
  await pglite.exec(options?.prereqSql ?? JOURNEY_PREREQUISITES);
  for (const f of options?.migrations ?? CANONICAL_JOURNEY_MIGRATIONS) {
    await pglite.exec(fs.readFileSync(path.join(REPO_ROOT, f), 'utf8'));
  }
  if (options?.testOnlySql) await pglite.exec(options.testOnlySql);
  return {
    pglite,
    db: drizzle(pglite),
    pool: {
      // node-postgres result shape: handlers check rowCount as well as rows
      // (Journey A found a 404 caused by a rows-only shim — rowCount ?? 0
      // treated every SELECT as empty).
      query: async (text: string, params?: unknown[]) => {
        const r = await pglite.query(text, params);
        const rows = r.rows as unknown[];
        // PGlite reports affectedRows: 0 for SELECTs, so prefer rows.length
        // and fall back to affectedRows only for row-less commands (UPDATE
        // without RETURNING, DELETE, …).
        const affected = (r as { affectedRows?: number }).affectedRows ?? 0;
        return { rows, rowCount: rows.length > 0 ? rows.length : affected };
      },
    },
    close: () => pglite.close(),
  };
}

// ── Recorder ─────────────────────────────────────────────────────────────────

export interface JourneyStep {
  seq: number;
  name: string;
  kind: 'action' | 'known-bad' | 'assertion';
  status: 'ok' | 'blocked-as-expected' | 'failed';
  /** Ids, hashes, counts, blocked reasons — whatever proves the step. */
  evidence: Record<string, unknown>;
}

export interface JourneyManifest {
  journey: string;
  description: string;
  harness: 'wo-01 service-level journey harness';
  migrations: readonly string[];
  steps: JourneyStep[];
  limitations: string[];
  observations: string[];
  summary: { total: number; ok: number; blockedAsExpected: number; failed: number };
}

export class JourneyRecorder {
  private steps: JourneyStep[] = [];
  private seq = 0;
  readonly limitations: string[] = [];
  readonly observations: string[] = [];

  constructor(
    readonly journey: string,
    readonly description: string,
  ) {}

  /** Run a step; its returned object is the recorded evidence. Throws on failure. */
  async step<T extends Record<string, unknown>>(name: string, fn: () => Promise<T>): Promise<T> {
    this.seq += 1;
    try {
      const evidence = await fn();
      this.steps.push({ seq: this.seq, name, kind: 'action', status: 'ok', evidence });
      return evidence;
    } catch (err) {
      this.steps.push({
        seq: this.seq,
        name,
        kind: 'action',
        status: 'failed',
        evidence: { error: err instanceof Error ? err.message : String(err) },
      });
      throw err;
    }
  }

  /**
   * A known-bad step: fn must either return `{ blocked: true, ... }`-shaped
   * evidence or throw. Anything that succeeds unblocked is a journey FAILURE —
   * honest failure behavior is the deliverable.
   */
  async expectBlocked(
    name: string,
    fn: () => Promise<{ blocked: boolean } & Record<string, unknown>>,
  ): Promise<Record<string, unknown>> {
    this.seq += 1;
    try {
      const evidence = await fn();
      if (!evidence.blocked) {
        this.steps.push({
          seq: this.seq,
          name,
          kind: 'known-bad',
          status: 'failed',
          evidence: { ...evidence, error: 'expected to be blocked but was allowed' },
        });
        throw new Error(`Journey step "${name}" expected a block; got success`);
      }
      this.steps.push({ seq: this.seq, name, kind: 'known-bad', status: 'blocked-as-expected', evidence });
      return evidence;
    } catch (err) {
      if (err instanceof Error && /expected a block/.test(err.message)) throw err;
      const evidence = { thrown: err instanceof Error ? err.message : String(err) };
      this.steps.push({ seq: this.seq, name, kind: 'known-bad', status: 'blocked-as-expected', evidence });
      return evidence;
    }
  }

  manifest(): JourneyManifest {
    return {
      journey: this.journey,
      description: this.description,
      harness: 'wo-01 service-level journey harness',
      migrations: CANONICAL_JOURNEY_MIGRATIONS,
      steps: this.steps,
      limitations: this.limitations,
      observations: this.observations,
      summary: {
        total: this.steps.length,
        ok: this.steps.filter((s) => s.status === 'ok').length,
        blockedAsExpected: this.steps.filter((s) => s.status === 'blocked-as-expected').length,
        failed: this.steps.filter((s) => s.status === 'failed').length,
      },
    };
  }

  /** Write manifest JSON + a markdown rendering OF the JSON (JSON is truth). */
  write(slug: string): { jsonPath: string; mdPath: string } {
    const dir = path.join(REPO_ROOT, 'tests', 'golden-journeys', '__reports__');
    fs.mkdirSync(dir, { recursive: true });
    const m = this.manifest();
    const jsonPath = path.join(dir, `${slug}.manifest.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(m, null, 2) + '\n');

    const lines = [
      `# ${m.journey}`,
      '',
      m.description,
      '',
      `**Result:** ${m.summary.failed === 0 ? 'PASS' : 'FAIL'} — ${m.summary.ok} ok, ${m.summary.blockedAsExpected} blocked-as-expected, ${m.summary.failed} failed`,
      '',
      '| # | Step | Kind | Status | Evidence |',
      '|---|---|---|---|---|',
      ...m.steps.map(
        (s) =>
          `| ${s.seq} | ${s.name} | ${s.kind} | ${s.status} | ${JSON.stringify(s.evidence).slice(0, 220)} |`,
      ),
      '',
      '## Observations',
      ...(m.observations.length ? m.observations.map((o) => `- ${o}`) : ['- none']),
      '',
      '## Known limitations',
      ...(m.limitations.length ? m.limitations.map((l) => `- ${l}`) : ['- none']),
      '',
      '_Rendered from the manifest JSON; the JSON is the truth source._',
      '',
    ];
    const mdPath = path.join(dir, `${slug}.report.md`);
    fs.writeFileSync(mdPath, lines.join('\n'));
    return { jsonPath, mdPath };
  }
}
