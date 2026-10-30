/**
 * An organisation's retention period (P1-22 remainder, DP-20; ADR-0014 §6):
 * the one read of it, and how it is stated.
 *
 * Moved here from server/routes/vault-retention-period.ts (2026-10-29), which
 * set and read it alone, so the tenant offboarding custody attestation
 * (services/tenant/offboarding-custody.ts, P-58) states the same period the
 * Records retention card shows (RetentionPeriodCard), from the same row, by
 * the same rule: the organisation's own, else DEFAULT_RETENTION_YEARS.
 *
 * @module server/services/vault/retention-period
 */
import { DEFAULT_RETENTION_YEARS } from '../../../shared/schema/vault';

/** The columns of a period, as the route's writes return them; the read below names the same list literally. */
export const RETENTION_PERIOD_COLUMNS = 'organization_id, retention_years, reason, governing_rule, set_by, set_at';

export interface RetentionPeriodRow {
  organization_id: number;
  retention_years: number;
  reason: string | null;
  governing_rule: string | null;
  set_by: number;
  set_at: Date | string;
}

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };

/** The organisation's own period, or null when it has set none (the default is in force). */
export async function readRetentionPeriod(client: Queryable, orgId: number): Promise<RetentionPeriodRow | null> {
  // tenant-isolation-safe: keyed by the caller's organisation, on the caller's RLS-scoped client.
  const r = await client.query(
    'SELECT organization_id, retention_years, reason, governing_rule, set_by, set_at FROM organization_retention_settings WHERE organization_id = $1',
    [orgId],
  );
  return (r.rows[0] as RetentionPeriodRow | undefined) ?? null;
}

/** What the organisation's period is, as the API and the audit row state it. */
export function presentRetentionPeriod(row: RetentionPeriodRow | null) {
  return {
    years: row?.retention_years ?? DEFAULT_RETENTION_YEARS,
    defaultYears: DEFAULT_RETENTION_YEARS,
    isDefault: row === null,
    reason: row?.reason ?? null,
    governingRule: row?.governing_rule ?? null,
    setBy: row?.set_by ?? null,
    setAt: row?.set_at ?? null,
  };
}
