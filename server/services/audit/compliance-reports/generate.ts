/**
 * Run one compliance report for one organisation.
 *
 * Only the report that verifies the chain walks it, before the snapshot (review
 * round 1, DP-46: a walk loads the tenant's whole chain and, for legacy rows,
 * other tenants' legacy hashes; it is not run for reports that do not state a
 * chain verdict). Every section is read on ONE connection, in ONE read-only transaction at
 * REPEATABLE READ, stamped with the organisation (setTenantContextTx) — so the
 * sections of a report describe the same moment, under row-level security,
 * and the run can write nothing. Each statement also carries its own
 * organisation predicate. Any failure rolls back and is thrown; the caller
 * answers it, and no partial report is produced.
 *
 * @module server/services/audit/compliance-reports/generate
 */
import { setTenantContextTx } from '../../tenant/governed-tenant-context.js';
import type {
  ChainSummary,
  IntegrityChecks,
  PeriodBounds,
  ReportData,
  ReportDefinition,
  ReportPeriod,
  ReportSection,
  SectionResult,
  SqlClient,
  TenantChainWalk,
} from './types';

export interface ConnectablePool {
  connect: () => Promise<SqlClient & { release: () => void }>;
}

export interface RunDeps {
  walkChain: (orgId: number) => Promise<TenantChainWalk>;
  checks: IntegrityChecks;
  now?: () => Date;
}

export const SNAPSHOT_BEGIN = 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY';

/** Run `fn` on one tenant-stamped, read-only snapshot; roll back on any failure. */
export async function inTenantSnapshot<T>(pool: ConnectablePool, orgId: number, fn: (client: SqlClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(SNAPSHOT_BEGIN);
    await setTenantContextTx(client, orgId);
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** What every report that does not verify the chain says about it. */
export const CHAIN_NOT_CHECKED: Readonly<ChainSummary> = Object.freeze({
  ok: null,
  scope: 'not-checked',
  reason: 'This report does not verify the audit chain. The audit trail integrity attestation does.',
} as const);

function layOut(def: ReportDefinition, results: Record<string, SectionResult>): ReportSection[] {
  return def.sections.map((s) => {
    const r = results[s.key];
    // A section the definition declares and its query did not return is a defect, not an empty section.
    if (!r) throw new Error(`compliance report ${def.id}: section ${s.key} was not produced`);
    return {
      ...s,
      rows: r.rows,
      rowCount: r.rows.length,
      truncated: r.truncated,
      ...(r.notes?.length ? { notes: r.notes } : {}),
    };
  });
}

export async function runComplianceReport(
  pool: ConnectablePool,
  def: ReportDefinition,
  orgId: number,
  window: { period: ReportPeriod; bounds: PeriodBounds },
  deps: RunDeps,
): Promise<{ data: ReportData; chain: ChainSummary }> {
  const run = def.run;
  if (!run) throw new Error(`compliance report ${def.id} is not run by the report generator`);
  const walk = def.walksChain ? await deps.walkChain(orgId) : undefined;
  const results = await inTenantSnapshot(pool, orgId, (client) =>
    run({ client, orgId, period: window.period, bounds: window.bounds, ...(walk ? { chain: walk } : {}), checks: deps.checks }),
  );
  const chain = def.chainSummary ? def.chainSummary(results, walk) : { ...CHAIN_NOT_CHECKED };
  const data: ReportData = {
    report: { id: def.id, title: def.title, version: 1 },
    organizationId: orgId,
    period: window.period,
    generatedAt: (deps.now ?? (() => new Date()))().toISOString(),
    chain,
    sections: layOut(def, results),
    notRecorded: [...def.notRecorded],
  };
  return { data, chain };
}
