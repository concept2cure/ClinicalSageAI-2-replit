/**
 * Audit immutability trigger check.
 *
 * The audit stores are append-only because a database trigger refuses UPDATE,
 * DELETE (and, where declared, TRUNCATE) on them — not because the application
 * promises to behave. Those triggers are created by migrations in
 * `C2C_MIGRATION_FILES`, which `deploy-migrate` replays on every deploy, and
 * until this module nothing at boot or in the daily sweep asked whether they
 * were actually there (security audit 2026-09-24 finding DP-06, plan item
 * P0-9a). A database restored from a dump taken before the trigger migrations,
 * a fresh install booted before `deploy-migrate`, or an operator's
 * `ALTER TABLE … DISABLE TRIGGER` all left the stores writable while every
 * integrity surface reported green.
 *
 * `assertAuditImmutabilityTriggers` answers, with one read-only catalog probe,
 * whether every expected trigger exists on its table and is enabled. It
 * returns a report and never throws on a gap: the callers decide the posture —
 * `server/startup/audit-enforcement.ts` refuses a production boot,
 * `server/services/securityHealth.ts` reports it as a critical check, and
 * `server/jobs/auditChainIntegritySweep.ts` raises the tamper-evidence alert.
 *
 * Why pg_trigger and not information_schema.triggers: the standard view omits
 * TRUNCATE triggers and does not expose `tgenabled`, and both migrations'
 * own verification blocks read pg_trigger for the same reason.
 *
 * @compliance FDA 21 CFR Part 11 §11.10(e); EU Annex 11 §9.
 * @module server/services/audit/audit-immutability-triggers
 */

/** One trigger the deploy applier creates and this module requires. */
export interface ExpectedImmutabilityTrigger {
  schema: string;
  table: string;
  trigger: string;
  /** The migration in C2C_MIGRATION_FILES that creates it — the remedy. */
  source: string;
}

/**
 * The triggers, by store. `device_audit_trail` (same esign migration) is not
 * listed: no migration on the applier creates that table, so its trigger is
 * attached only where the table happens to exist and cannot be required.
 */
export const EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS: readonly ExpectedImmutabilityTrigger[] = [
  { schema: 'public', table: 'audit_logs', trigger: 'trg_audit_logs_no_update', source: 'db/migrations/20260617_audit_logs_immutability.sql' },
  { schema: 'public', table: 'audit_logs', trigger: 'trg_audit_logs_no_delete', source: 'db/migrations/20260617_audit_logs_immutability.sql' },
  { schema: 'public', table: 'audit_logs', trigger: 'trg_audit_logs_no_truncate', source: 'db/migrations/20260617_audit_logs_immutability.sql' },
  { schema: 'public', table: 'audit_events', trigger: 'trg_audit_events_no_update', source: 'db/migrations/20260222_audit_events_immutability.sql' },
  { schema: 'public', table: 'audit_events', trigger: 'trg_audit_events_no_delete', source: 'db/migrations/20260222_audit_events_immutability.sql' },
  { schema: 'public', table: 'audit_events', trigger: 'trg_audit_events_no_truncate', source: 'db/migrations/20260222_audit_events_immutability.sql' },
  { schema: 'audit', table: 'tamper_proof_log', trigger: 'trg_prevent_audit_mutation', source: 'db/migrations/20260813_audit_tamper_proof_log.sql' },
  { schema: 'public', table: 'electronic_signatures', trigger: 'trg_electronic_signatures_immutable', source: 'db/migrations/20260730_esign_audit_db_level_immutability.sql' },
];

/** Anything with a `.query` — a pg Pool, a PoolClient, a PGlite instance. */
export interface TriggerCatalogClient {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
}

export interface AuditImmutabilityTriggerReport {
  /** True only when every expected trigger is present AND enabled. */
  ok: boolean;
  /** Number of triggers required. */
  expected: number;
  /** Number found present and enabled. */
  present: number;
  /** `schema.table.trigger` of every expected trigger the catalog does not have (an absent table counts). */
  missing: string[];
  /** `schema.table.trigger` of every trigger that exists but will not fire (DISABLE TRIGGER, or replica-only). */
  disabled: string[];
  /** `schema.table` of every expected store that does not exist. */
  tablesAbsent: string[];
}

const qualifiedTrigger = (t: ExpectedImmutabilityTrigger) => `${t.schema}.${t.table}.${t.trigger}`;
const qualifiedTable = (t: { schema: string; table: string }) => `${t.schema}.${t.table}`;

/**
 * pg_trigger.tgenabled: 'O' fires in origin/local sessions (the default),
 * 'A' always fires, 'D' is disabled, 'R' fires only under
 * session_replication_role = replica. Only 'O' and 'A' protect the table in a
 * normal session.
 */
const FIRING_STATES = new Set(['O', 'A']);

/**
 * One read-only probe of the catalog for every expected trigger. Never throws
 * on a gap — the report carries it — but a failed probe (no connection, no
 * catalog privilege) propagates, because "could not check" is not "ok" and the
 * caller owns that decision.
 */
export async function assertAuditImmutabilityTriggers(
  client: TriggerCatalogClient,
  expected: readonly ExpectedImmutabilityTrigger[] = EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS,
): Promise<AuditImmutabilityTriggerReport> {
  const values = expected
    .map((_, i) => `($${i * 3 + 1}::text, $${i * 3 + 2}::text, $${i * 3 + 3}::text)`)
    .join(', ');
  const params = expected.flatMap((t) => [t.schema, t.table, t.trigger]);

  const { rows } = await client.query(
    `WITH expected(schema_name, table_name, trigger_name) AS (VALUES ${values})
     SELECT e.schema_name, e.table_name, e.trigger_name,
            (c.oid IS NOT NULL) AS table_present,
            (t.oid IS NOT NULL) AS trigger_present,
            t.tgenabled::text   AS tgenabled
       FROM expected e
       LEFT JOIN pg_namespace n ON n.nspname::text = e.schema_name
       LEFT JOIN pg_class c ON c.relnamespace = n.oid
                           AND c.relname::text = e.table_name
                           AND c.relkind IN ('r', 'p')
       LEFT JOIN pg_trigger t ON t.tgrelid = c.oid
                             AND t.tgname::text = e.trigger_name
                             AND NOT t.tgisinternal`,
    params,
  );

  const byName = new Map<string, Record<string, unknown>>();
  for (const r of rows) {
    byName.set(`${r.schema_name}.${r.table_name}.${r.trigger_name}`, r);
  }

  const missing: string[] = [];
  const disabled: string[] = [];
  const tablesAbsent = new Set<string>();
  let present = 0;

  for (const t of expected) {
    const name = qualifiedTrigger(t);
    const row = byName.get(name);
    if (row && row.table_present === false) tablesAbsent.add(qualifiedTable(t));
    // A row that never came back is not a pass: the expected list decides what
    // was checked, not the result set.
    if (!row || row.trigger_present !== true) {
      missing.push(name);
      continue;
    }
    if (!FIRING_STATES.has(String(row.tgenabled ?? ''))) {
      disabled.push(name);
      continue;
    }
    present++;
  }

  return {
    ok: missing.length === 0 && disabled.length === 0,
    expected: expected.length,
    present,
    missing,
    disabled,
    tablesAbsent: [...tablesAbsent],
  };
}

/** The gap in one sentence, with the remedy: which migration creates what is missing. */
export function describeAuditImmutabilityGap(
  report: AuditImmutabilityTriggerReport,
  expected: readonly ExpectedImmutabilityTrigger[] = EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS,
): string {
  const affected = new Set([...report.missing, ...report.disabled]);
  const sources = [...new Set(expected.filter((t) => affected.has(qualifiedTrigger(t))).map((t) => t.source))];
  const parts = [
    `audit immutability triggers are not in force (${report.present}/${report.expected} present and enabled)`,
  ];
  if (report.missing.length) parts.push(`missing: ${report.missing.join(', ')}`);
  if (report.disabled.length) parts.push(`disabled: ${report.disabled.join(', ')}`);
  if (report.tablesAbsent.length) parts.push(`tables absent: ${report.tablesAbsent.join(', ')}`);
  parts.push(
    'without them the audit stores accept UPDATE/DELETE and 21 CFR Part 11 §11.10(e) is not met',
  );
  if (report.missing.length || report.tablesAbsent.length) {
    parts.push(
      `run node scripts/db/deploy-migrate.mjs as the database owner — the triggers are created by ${sources.join(', ')} (every file in C2C_MIGRATION_FILES replays on each deploy)`,
    );
  }
  if (report.disabled.length) {
    parts.push(
      'a disabled trigger was switched off with ALTER TABLE … DISABLE TRIGGER: re-enable it and treat the interval as a potential integrity incident',
    );
  }
  return parts.join('; ') + '.';
}
