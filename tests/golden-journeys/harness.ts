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
import { recordSchemaGaps, type SchemaGap } from '../../server/db/pglite-harness';

export type { SchemaGap };

export const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** Canonical migrations a journey database carries, in order. */
export const CANONICAL_JOURNEY_MIGRATIONS = [
  // Cross-cutting: the 21 CFR Part 11 tamper-evident store. Four journeys were
  // asserting Part 11 claims while every write to it failed with `relation
  // "audit.tamper_proof_log" does not exist` — swallowed by the caller, which
  // falls back to a console writer and logs the failure as non-fatal. That
  // fallback is correct in production and fatal to the evidence here, so the
  // journeys passed. Self-contained and role-guarded, so it runs under PGlite.
  'db/migrations/20260813_audit_tamper_proof_log.sql',
  'db/migrations/20260323_assumption_decision_contradiction.sql',
  // The reactive dependency layer — governed_dependencies / impact_propagation_log.
  // The HAQ-correction journey's whole subject is propagating a correction across
  // dependent documents, and it was running with neither table present: every
  // dependency read and every propagation write failed and was swallowed, and the
  // journey still reported the correction propagating.
  'db/migrations/20260323_reactive_dependency_layer.sql',
  'db/migrations/20260725_governance_boundary_tables.sql',
  'db/migrations/20260725_resolution_orchestration_tables.sql',
  'db/migrations/20260725_bundle_execution_receipts.sql',
] as const;

/** FK prerequisites + two tenants for isolation assertions. */
export const JOURNEY_PREREQUISITES = `
  -- \`uuid\` as db/migrations/20260129_add_org_uuid_alignment.sql adds it. The
  -- org-membership middleware LEFT JOINs it on every request and, when the
  -- column is missing, falls back to a membership-only decision with
  -- orgUuid = null — so without it the authoring journey exercised the degraded
  -- path on every request and never the enriched one (ledger L148).
  CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT, uuid UUID NOT NULL DEFAULT gen_random_uuid());
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
  /** node-postgres-compatible shim over PGlite for the raw-SQL services.
   *  `connect()` returns a client with the same shim so handlers that run
   *  BEGIN/COMMIT on a checked-out client work under the single-connection
   *  PGlite (release() is a no-op). Declared here so services type-checked
   *  outside tests/** (e.g. server/**) see the real runtime shape. */
  pool: {
    query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
    connect: () => Promise<{
      query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
      release: () => void;
    }>;
  };
  /**
   * Every query this journey issued that failed because the SCHEMA did not have
   * what the code asked for — an undefined table (42P01) or an undefined column
   * (42703). See `assertNoSchemaGaps`.
   */
  schemaGaps: SchemaGap[];
  close: () => Promise<void>;
}

/**
 * A journey that provoked a missing table or column and still passed is proving
 * less than it claims.
 *
 * Journeys build their database by naming the tables they need
 * (`extractTableDdl`) — a hand-maintained list, and the failure mode is not that
 * the list is short but that a SHORT LIST IS INVISIBLE. The route under test
 * writes to a table nobody named; the write fails; the service swallows it
 * (audit and telemetry writers are deliberately non-fatal, which is correct in
 * production and fatal to the evidence here); the assertion under test still
 * passes; and the journey reports that a regulated claim holds.
 *
 * Found in `submission-release-signature.journey.test.ts` (ledger L138/L145):
 * it asserted the §11.10(e) audit claim of the Part 11 release gate with NO
 * `audit_logs` table in the database at all. Nothing failed, because the write
 * that needed it was outside the transaction and swallowed its own error.
 *
 * Call this in an `afterAll` in every journey. `__tests__/journey-schema-gaps.test.ts`
 * enforces that every journey does.
 */
/**
 * A journey that ran every request on the org-membership degraded fallback
 * proved its tenant claims with `app.current_org_id` empty.
 *
 * Ledger L148: `ind-authoring` did exactly that — its `organizations` stub
 * predated `20260129_add_org_uuid_alignment`, the enrichment LEFT JOIN threw
 * 42703 on every request, and the membership-only fallback answered with
 * `orgUuid = null`. Membership was still decided correctly, which is why
 * nothing failed, and the only trace was a warning a test cannot read. That
 * residual was carried on L148 rather than closed; this closes it.
 *
 * Call it in the same `afterAll` as `assertNoSchemaGaps`. A journey that WANTS
 * to exercise the fallback asserts the count itself instead.
 */
export async function assertNoDegradedTenantEnrichment(): Promise<void> {
  const { degradedEnrichmentCount, degradedEnrichmentSample } = await import(
    '../../server/middleware/orgMembership'
  );
  const n = degradedEnrichmentCount();
  if (n === 0) return;
  const seen = degradedEnrichmentSample()
    .map((d) => `  user ${d.userId} / org ${d.organizationId}: ${d.error}`)
    .join('\n');
  throw new Error(
    `${n} request(s) in this journey answered on the org-membership DEGRADED fallback, ` +
      `so app.current_org_id was empty for them and any tenant-scoping this journey ` +
      `asserts was proven without it:\n\n${seen}\n\n` +
      `Usually the journey's own \`organizations\` stub is missing a column the real ` +
      `schema has (the uuid alignment migration adds one). Fix the stub, not this check.`,
  );
}

export function assertNoSchemaGaps(
  jdb: Pick<JourneyDb, 'schemaGaps'>,
  /**
   * Relations this journey is KNOWN to run without, each with the ledger row
   * that owns closing it. Shrink-only by convention: an entry here is a journey
   * proving less than it claims, recorded so it is visible rather than silent.
   * Never add one to make a run green — add the missing table instead.
   */
  known: readonly { relation: string; row: string }[] = [],
): void {
  const allowed = new Set(known.map((k) => k.relation));
  const unexplained = jdb.schemaGaps.filter(
    (g) => ![...allowed].some((rel) => g.message.includes(`"${rel}"`)),
  );
  jdb = { schemaGaps: unexplained };
  if (jdb.schemaGaps.length === 0) return;
  const seen = new Set<string>();
  const lines = jdb.schemaGaps
    .filter((g) => {
      const k = `${g.code}:${g.message}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((g) => `  [${g.code}] ${g.message}\n      ${g.sql}`);
  throw new Error(
    `This journey ran against a database missing ${seen.size} relation(s)/column(s) its own ` +
      `subject asked for, and still reached its assertions:\n\n${lines.join('\n')}\n\n` +
      `Add the missing table(s) to this journey's extractTableDdl list, or the missing ` +
      `column(s) via the ALTER the real migration performs. A journey whose database is ` +
      `smaller than the code under test proves less than it says it does.`,
  );
}

/**
 * The `req.dbClient` shape that `requireTenantContext` installs, backed by
 * PGlite — so a journey can drive a route that uses `requestDb(req)` /
 * `requestPgClient(req)` WITHOUT mocking either of them.
 *
 * Drizzle's node-postgres driver calls `.query(queryConfig, params)` with
 * `{ text, rowMode: 'array' }` for row-mapped selects and maps the array rows
 * itself, so `rowMode` is forwarded to PGlite verbatim. Raw-SQL callers
 * (requestPgClient) pass a plain string; both forms are accepted here, exactly
 * as the production lazy client accepts both.
 *
 * Single connection (PGlite), which is what the request-scoped client is: one
 * connection carrying the tenant session variables. Ported from the proven shim
 * in server/routes/__tests__/saved-precedent-queries.rls.test.ts.
 *
 * Missing relations on this client are recorded at the PGlite seam by
 * `recordSchemaGaps` (attached in `createJourneyDb`), so it carries no
 * instrumentation of its own.
 */
export function makeRequestDbClient(pglite: import('@electric-sql/pglite').PGlite) {
  return {
    query: async (textOrConfig: unknown, values?: unknown[]) => {
      const text =
        typeof textOrConfig === 'string' ? textOrConfig : (textOrConfig as { text: string }).text;
      const rowMode =
        typeof textOrConfig === 'string'
          ? undefined
          : (textOrConfig as { rowMode?: string }).rowMode;
      const r = await pglite.query(
        text,
        (values ?? []) as unknown[],
        rowMode === 'array' ? { rowMode: 'array' } : undefined,
      );
      const rows = r.rows as unknown[];
      const affected = (r as { affectedRows?: number }).affectedRows ?? 0;
      return {
        rows,
        rowCount: rows.length > 0 ? rows.length : affected,
        fields: (r as { fields?: unknown[] }).fields ?? [],
      };
    },
  };
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
  // Attached before any statement runs, so DDL gaps in the journey's own
  // extractTableDdl list are observed too.
  const schemaGaps = recordSchemaGaps(pglite);
  await pglite.exec(options?.prereqSql ?? JOURNEY_PREREQUISITES);
  for (const f of options?.migrations ?? CANONICAL_JOURNEY_MIGRATIONS) {
    await pglite.exec(fs.readFileSync(path.join(REPO_ROOT, f), 'utf8'));
  }
  if (options?.testOnlySql) await pglite.exec(options.testOnlySql);

  // node-postgres result shape: handlers check rowCount as well as rows
  // (Journey A found a 404 caused by a rows-only shim — rowCount ?? 0 treated
  // every SELECT as empty).
  //
  // Both call forms are accepted, exactly as node-postgres accepts both:
  // `query(text, params)` for the raw-SQL services, and `query(queryConfig,
  // params)` — `{ text, rowMode }` — which is what Drizzle's node-postgres
  // driver issues. A journey that runs Drizzle ON A TRANSACTION CLIENT hits the
  // second form (e.g. createSubmissionTx inside the C2C intake transaction);
  // without it PGlite is handed an object where it expects a string and the
  // route reports an opaque INTERNAL_ERROR.
  // Missing relations are NOT recorded here. Drizzle (`db` below) talks to
  // PGlite directly and never passes through this shim, so a shim-level
  // recorder missed every statement the ORM issued — `recordSchemaGaps`
  // (above) sits at the PGlite seam instead and sees both.

  const runQuery = async (textOrConfig: unknown, params?: unknown[]) => {
    const text =
      typeof textOrConfig === 'string' ? textOrConfig : (textOrConfig as { text: string }).text;
    const rowMode =
      typeof textOrConfig === 'string' ? undefined : (textOrConfig as { rowMode?: string }).rowMode;
    const r = await pglite.query(
      text,
      params as unknown[],
      rowMode === 'array' ? { rowMode: 'array' } : undefined,
    );
    const rows = r.rows as unknown[];
    // PGlite reports affectedRows: 0 for SELECTs, so prefer rows.length and fall
    // back to affectedRows only for row-less commands (UPDATE without
    // RETURNING, DELETE, …).
    const affected = (r as { affectedRows?: number }).affectedRows ?? 0;
    return {
      rows,
      rowCount: rows.length > 0 ? rows.length : affected,
      fields: (r as { fields?: unknown[] }).fields ?? [],
    };
  };

  return {
    pglite,
    schemaGaps,
    db: drizzle(pglite),
    pool: {
      query: runQuery,
      // Handlers that must write several rows atomically take a client and run
      // BEGIN/COMMIT on it — the authoring save does this so a section's content
      // and its data lineage commit together. Without connect() here the shim
      // fails those routes with "pool.connect is not a function", which reads
      // like a route bug rather than a missing test double.
      //
      // PGlite is a single connection, so the "client" is this same shim and
      // BEGIN/COMMIT/ROLLBACK go through it as ordinary statements. release()
      // is a no-op because there is no pool to return anything to.
      connect: async () => ({ query: runQuery, release: () => {} }),
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

  /**
   * @param schemaSources What schema the journey's database was built from —
   *   canonical migration files by default, but a journey that provisions its
   *   DB from DDL constants (e.g. the IND PGlite harness) MUST pass its real
   *   sources so the manifest does not misstate its own provenance. Honesty of
   *   the proof record is the point (docs/architecture/PROOF_HIERARCHY.md).
   */
  constructor(
    readonly journey: string,
    readonly description: string,
    readonly schemaSources: readonly string[] = CANONICAL_JOURNEY_MIGRATIONS,
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
      // A thrown error is how a service-level block manifests — but a failed
      // assertion inside the step is the TEST failing, not the subject
      // blocking, and must not be filed as the block the step exists to prove.
      if (err instanceof Error && err.name === 'AssertionError') {
        this.steps.push({
          seq: this.seq,
          name,
          kind: 'known-bad',
          status: 'failed',
          evidence: { error: err.message },
        });
        throw err;
      }
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
      migrations: this.schemaSources,
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

  /**
   * Write manifest JSON + a markdown rendering OF the JSON (JSON is truth).
   *
   * @param outDir Repo-relative directory for the proof packet. Defaults to the
   *   golden-journeys reports dir; export-format proofs (not DB journeys) pass
   *   their own so the two proof families stay in separate homes.
   */
  write(slug: string, outDir = 'tests/golden-journeys/__reports__'): { jsonPath: string; mdPath: string } {
    const dir = path.join(REPO_ROOT, outDir);
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
