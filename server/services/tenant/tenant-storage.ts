/**
 * Per-tenant storage accounting and the `max_storage` quota decision.
 *
 * ── Why this did not exist ────────────────────────────────────────────────────
 * `organizations.max_storage` (GB) has been on the schema since the first
 * billing migration and is written by the Stripe webhook on every subscription
 * change. Nothing ever read it, for a reason that is worth stating: there is no
 * single place a tenant's bytes live. Eleven tables in the shipped schema carry
 * BOTH a tenant key and a size column — `project_documents`, `rag_documents`,
 * `device_submission_documents`, `file_uploads`, and so on. "How much storage
 * does this tenant use" was never a question the code could answer, so the
 * quota was decoration.
 *
 * ── Catalog-driven, for the same reason the export is ─────────────────────────
 * The set is DISCOVERED from `information_schema` — any table with a recognized
 * tenant key and a recognized size column counts. A hand-maintained list is how
 * `tenant-export` came to cover one eighth of what the purge destroyed: nothing
 * forces the list to grow when the schema does, and storage tables are added far
 * more often than anyone remembers to update an accounting constant.
 *
 * ── The number is deliberately an UNDER-count, and says so ────────────────────
 * This measures rows the database knows the size of. It does NOT measure object
 * storage the database has no row for, nor bytes in tables with no size column.
 * `measured: 'partial'` is returned so a caller can present it honestly rather
 * than as a precise bill. Enforcing a quota on an under-count is the safe
 * direction — a tenant is never blocked for bytes we cannot attribute to them.
 *
 * Pure decision + thin I/O, matching `seat-licensing.evaluateSeats` and
 * `tenant-lifecycle.backgroundWorkPermitted`: the policy is what deserves
 * exhaustive testing, and a policy behind a database call cannot get it.
 *
 * @module server/services/tenant/tenant-storage
 */

import type { Pool, PoolClient } from 'pg';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('tenant-storage');

const TENANT_KEY_COLUMNS = ['organization_id', 'org_id', 'tenant_id'] as const;

/**
 * Size-column name pattern. Deliberately narrow: a column called `size` alone is
 * ambiguous (a page size, a cohort size, a font size), and counting it would
 * inflate a tenant's usage with numbers that are not bytes.
 */
const SIZE_COLUMN_PATTERN = '(file_size|size_bytes|_bytes$)';

const BYTES_PER_GB = 1024 ** 3;

export interface StorageTable {
  table: string;
  tenantColumn: string;
  sizeColumn: string;
}

export interface TenantStorageUsage {
  organizationId: number;
  bytes: number;
  /** Always 'partial' — see the module note on under-counting. */
  measured: 'partial';
  tablesCounted: number;
  tablesFailed: Array<{ table: string; error: string }>;
}

/** Tables carrying both a tenant key and a byte-size column. */
export async function discoverStorageTables(
  client: Pool | PoolClient
): Promise<StorageTable[]> {
  const { rows } = await client.query<{
    table_name: string;
    tenant_col: string;
    size_col: string;
  }>(
    `SELECT c1.table_name, c1.column_name AS tenant_col, c2.column_name AS size_col
       FROM information_schema.columns c1
       JOIN information_schema.columns c2
         ON c2.table_schema = c1.table_schema AND c2.table_name = c1.table_name
       JOIN information_schema.tables t
         ON t.table_schema = c1.table_schema AND t.table_name = c1.table_name
      WHERE c1.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
        AND c1.column_name = ANY($1::text[])
        AND c2.column_name ~ $2
        AND c2.data_type IN ('integer','bigint','numeric','smallint')
      ORDER BY c1.table_name,
               array_position($1::text[], c1.column_name)`,
    [[...TENANT_KEY_COLUMNS], SIZE_COLUMN_PATTERN]
  );

  // A table may match on more than one tenant key; take the most preferred.
  const seen = new Map<string, StorageTable>();
  for (const r of rows) {
    if (!seen.has(r.table_name)) {
      seen.set(r.table_name, {
        table: r.table_name,
        tenantColumn: r.tenant_col,
        sizeColumn: r.size_col,
      });
    }
  }
  return [...seen.values()];
}

/**
 * Sum a tenant's known bytes.
 *
 * A table that fails to read is RECORDED rather than aborting the sum — the same
 * choice the export makes. A quota decision built on a partial count under-counts
 * and therefore under-blocks, which is the safe direction; refusing to answer at
 * all would either block every upload or disable the quota entirely.
 *
 * ── The cost, stated ──────────────────────────────────────────────────────────
 * One catalog query plus one aggregate per storage table — currently twelve round
 * trips. They run SEQUENTIALLY on purpose: firing eleven concurrent aggregates
 * would trade a few milliseconds of latency for eleven simultaneous pool
 * connections per cold tenant, which is a much worse failure under load. The
 * cache in `getTenantStorage` is what keeps this off the hot path; it is paid
 * once per tenant per TTL, not once per upload.
 *
 * If this ever becomes hot the fix is a materialized per-tenant usage row
 * maintained by trigger, NOT a longer cache TTL — a longer TTL buys latency by
 * widening the window in which a tenant can outrun its own quota, which is the
 * property this module exists to hold.
 */
export async function computeTenantStorage(
  client: Pool | PoolClient,
  organizationId: number
): Promise<TenantStorageUsage> {
  const tables = await discoverStorageTables(client);
  const tablesFailed: Array<{ table: string; error: string }> = [];
  let bytes = 0;
  let tablesCounted = 0;

  for (const t of tables) {
    // Identifiers come from the catalog, never from caller input; the regex is a
    // belt-and-braces assertion on that invariant.
    if (!/^[a-z_][a-z0-9_]*$/.test(t.table) || !/^[a-z_][a-z0-9_]*$/.test(t.sizeColumn)) {
      tablesFailed.push({ table: t.table, error: 'unsafe identifier' });
      continue;
    }
    try {
      const { rows } = await client.query<{ total: string | null }>(
        `SELECT COALESCE(SUM("${t.sizeColumn}"), 0)::bigint AS total
           FROM "${t.table}" WHERE "${t.tenantColumn}"::text = $1`,
        [String(organizationId)]
      );
      bytes += Number(rows[0]?.total ?? 0);
      tablesCounted += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      tablesFailed.push({ table: t.table, error: message.slice(0, 200) });
    }
  }

  if (tablesFailed.length) {
    logger.warn('Tenant storage sum skipped one or more tables', {
      organizationId,
      skipped: tablesFailed.map(f => f.table),
    });
  }

  return { organizationId, bytes, measured: 'partial', tablesCounted, tablesFailed };
}

export type StorageQuotaOutcome = 'allowed' | 'exceeded' | 'unlimited';

export interface StorageQuotaDecision {
  outcome: StorageQuotaOutcome;
  usedBytes: number;
  limitBytes: number | null;
  incomingBytes: number;
  projectedBytes: number;
  /** Remaining headroom after the incoming write; 0 when exceeded or unlimited. */
  remainingBytes: number;
  allowed: boolean;
}

/**
 * The pure decision. No I/O.
 *
 * A non-positive or missing `maxStorageGb` means UNLIMITED, matching
 * `seat-licensing.evaluateSeats`' treatment of `seats_purchased <= 0`. Two
 * quota systems on one product disagreeing about what "0" means is how an
 * unlimited enterprise tenant gets locked out on a Friday afternoon.
 */
export function evaluateStorageQuota(args: {
  usedBytes: number;
  maxStorageGb: number | null | undefined;
  incomingBytes: number;
}): StorageQuotaDecision {
  const usedBytes = Math.max(0, Math.floor(args.usedBytes || 0));
  const incomingBytes = Math.max(0, Math.floor(args.incomingBytes || 0));
  const gb = Math.floor(args.maxStorageGb ?? 0);
  const projectedBytes = usedBytes + incomingBytes;

  if (!Number.isFinite(gb) || gb <= 0) {
    return {
      outcome: 'unlimited',
      usedBytes,
      limitBytes: null,
      incomingBytes,
      projectedBytes,
      remainingBytes: 0,
      allowed: true,
    };
  }

  const limitBytes = gb * BYTES_PER_GB;
  const allowed = projectedBytes <= limitBytes;
  return {
    outcome: allowed ? 'allowed' : 'exceeded',
    usedBytes,
    limitBytes,
    incomingBytes,
    projectedBytes,
    remainingBytes: allowed ? limitBytes - projectedBytes : 0,
    allowed,
  };
}

/**
 * Whether storage quota actually BLOCKS.
 *
 * Same posture as `seat-licensing.isSeatEnforcementOn`, and the same reasoning:
 * enforce in production by default so the control is not born inert, but leave a
 * spelled-out `report` escape for the window in which existing over-quota tenants
 * are reconciled. A typo falls back to the environment default rather than
 * silently disabling a paid limit.
 */
export function isStorageEnforcementOn(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env.STORAGE_LIMIT_ENFORCEMENT || '').trim().toLowerCase();
  if (raw === 'enforce') return true;
  if (raw === 'report') return false;
  if (raw !== '') {
    logger.warn(
      "Unrecognized STORAGE_LIMIT_ENFORCEMENT; using the environment default. Use 'enforce' or 'report'.",
      { value: raw }
    );
  }
  return (env.NODE_ENV ?? '').toLowerCase() === 'production';
}

/** Short TTL over the expensive multi-table SUM. */
const USAGE_CACHE_TTL_MS = 30_000;

interface CacheEntry {
  usage: TenantStorageUsage;
  expiresAt: number;
  /**
   * Bytes admitted by the quota guard SINCE this entry was computed.
   *
   * ── Why a cache alone is not enough ───────────────────────────────────────
   * A pure TTL cache has a hole a bulk importer walks straight through: with a
   * 30-second window and a stale `usedBytes`, a tenant one file below its limit
   * can admit fifty files in that window because every one of them is evaluated
   * against the same pre-burst number. The quota would hold on paper and fail in
   * practice — the exact shape of "the control exists but does not control".
   *
   * So admitted bytes accumulate here and count toward the next decision. The
   * counter resets when the entry is recomputed, because by then the database
   * sum includes them and counting both would double-charge.
   *
   * An admitted upload that later FAILS leaves its bytes counted for up to the
   * TTL. That over-counts, which blocks marginally early and self-heals on the
   * next recompute — the safe direction, and the same bias as the partial
   * measurement itself.
   */
  admittedBytes: number;
}

const usageCache = new Map<number, CacheEntry>();

export function invalidateTenantStorage(organizationId?: number): void {
  if (organizationId === undefined) usageCache.clear();
  else usageCache.delete(organizationId);
}

/**
 * Charge bytes the guard has just admitted against the cached figure.
 *
 * Called only after a decision to ALLOW; a refused upload writes nothing and
 * must not be charged. No-op when the tenant has no cache entry, since the next
 * read recomputes from the database anyway.
 */
export function recordAdmittedBytes(organizationId: number, bytes: number): void {
  const entry = usageCache.get(organizationId);
  if (!entry) return;
  entry.admittedBytes += Math.max(0, Math.floor(bytes || 0));
}

/** Bytes admitted since the cached sum was taken. Exported for tests/reporting. */
export function admittedBytesSinceMeasure(organizationId: number): number {
  return usageCache.get(organizationId)?.admittedBytes ?? 0;
}

/**
 * Cached usage, plus anything admitted since the sum was taken.
 *
 * The SUM spans every table carrying a tenant key and a size column, so an
 * uncached call on every upload in a bulk import would dominate the request.
 * Thirty seconds is short enough to stay close to the truth and long enough that
 * a burst pays for the scan once — and the admitted-bytes counter above closes
 * the window the TTL would otherwise open.
 */
export async function getTenantStorage(
  client: Pool | PoolClient,
  organizationId: number
): Promise<TenantStorageUsage> {
  const cached = usageCache.get(organizationId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.admittedBytes === 0
      ? cached.usage
      : { ...cached.usage, bytes: cached.usage.bytes + cached.admittedBytes };
  }
  const usage = await computeTenantStorage(client, organizationId);
  usageCache.set(organizationId, {
    usage,
    expiresAt: Date.now() + USAGE_CACHE_TTL_MS,
    admittedBytes: 0,
  });
  return usage;
}
