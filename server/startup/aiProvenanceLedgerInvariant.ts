/**
 * AI provenance ledger boot invariant.
 *
 * ── What was wrong ───────────────────────────────────────────────────────────
 * `ai.gateway_audit_log` is the record of which model, at which temperature,
 * from which prompt, on which substrate, produced every AI output on this
 * platform. It recorded nothing, for two independent reasons, both silent:
 *
 *   1. The table had no migration. Its only creator was runtime DDL inside
 *      GatewayAuditLogger (`CREATE SCHEMA IF NOT EXISTS ai` + CREATE TABLE) in
 *      a catch that logged and returned — and PostgreSQL evaluates the
 *      database-level CREATE privilege BEFORE the IF NOT EXISTS short-circuit,
 *      so a least-privileged runtime role is refused on statement one.
 *      scripts/ci/tables-live-schema-baseline.json confirmed the table absent
 *      on a fully provisioned database.
 *   2. Nothing ever passed the logger a pool. `GatewayConfig.dbPool` is
 *      optional, `buildConfig()` never set it, and all 103 `getGateway()` call
 *      sites call it with no arguments — so `persistToDb` was guarded by an
 *      `if (this.pool)` that was permanently false.
 *
 * Throughout, the gateway reported every call as audited. A control that says
 * it is recording while recording nothing is worse than an absent one, because
 * only the first gets relied on in an inspection.
 *
 * ── Why this is a boot check and not a request check ─────────────────────────
 * The per-call writer stays deliberately non-blocking: an audit-store outage
 * mid-flight must not take inference down. That leaves the failure with nowhere
 * to surface, which is precisely how the two defects above survived. Boot is
 * the right place — it is the one moment where refusing to continue costs
 * nothing that is already in progress.
 *
 * Production fails closed. Outside production it warns, because a developer
 * running against a database that has not had the migration set applied is an
 * ordinary state and should not be blocked from booting.
 *
 * @compliance 21 CFR Part 11 (audit trail); FDA AI/ML guidance (traceability).
 * @module server/startup/aiProvenanceLedgerInvariant
 */

export interface LedgerInvariantLogger {
  warn: (message: string) => void;
}

export interface LedgerInvariantOptions {
  /** Injected for tests; defaults to the gateway's own assertion. */
  assertReady?: () => Promise<void>;
  env?: NodeJS.ProcessEnv;
  logger?: LedgerInvariantLogger;
}

/**
 * Assert the AI provenance ledger is writable.
 *
 * @throws in production when the ledger is missing, unwritable, or has no pool.
 */
export async function assertAiProvenanceLedgerForProduction(
  options: LedgerInvariantOptions = {},
): Promise<void> {
  const env = options.env ?? process.env;
  const logger = options.logger ?? { warn: (m: string) => console.warn(m) };
  const isProduction = (env.NODE_ENV ?? '').toLowerCase() === 'production';

  const assertReady =
    options.assertReady ??
    (async () => {
      // Imported lazily so this module stays free of the gateway's provider-SDK
      // import graph for anything that only wants the invariant.
      const { assertAiProvenanceLedgerReady } = await import('../services/ai-gateway/gateway');
      await assertAiProvenanceLedgerReady();
    });

  try {
    await assertReady();
  } catch (error: any) {
    const detail = error?.message ?? String(error);
    if (isProduction) {
      throw new Error(`[ai-provenance-ledger] FAIL-CLOSED: ${detail}`);
    }
    logger.warn(
      `[ai-provenance-ledger] ${detail} — non-fatal outside production, but AI calls ` +
        'are not being recorded. Apply the migration set to silence this.',
    );
  }
}

export default assertAiProvenanceLedgerForProduction;
