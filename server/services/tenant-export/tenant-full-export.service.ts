/**
 * Complete, catalog-driven tenant export — and the receipt that makes a purge
 * precondition mean something.
 *
 * ── Why this exists alongside the curated export ──────────────────────────────
 * `tenant-export.service.ts` produces a *structured* manifest: eleven named
 * tables, hand-picked, shaped for a human reading a Q-Sub programme. It is a good
 * artifact and it is not going away.
 *
 * It is also not a data return. Measured against
 * `tenant-offboarding.PURGE_CHILD_TABLES`, the curated manifest covers exactly
 * ONE of the eight tables a purge destroys (`regulatory_programs`). A customer
 * handed that manifest on offboarding would receive their programme records and
 * none of their documents, vault contents, uploads, projects or workspaces —
 * while the purge deleted all of them. Under GDPR Art. 20 and the data-return
 * clause of this product's standard MSA, that is not a discharged obligation.
 *
 * Worse, the purge gate as first written asked for a `finalExportDigest` and
 * accepted any non-empty string. A precondition nothing can satisfy honestly is
 * theatre: it looks like evidence in the code review and proves nothing at the
 * moment it matters.
 *
 * This module closes both halves:
 *
 *   1. **Completeness** — the export set is DISCOVERED from the catalog, the same
 *      way `0021_enable_rls_everywhere.sql` discovers what to policy. Every table
 *      carrying a tenant key is exported. New tenant-bearing tables are covered
 *      the day they ship, with nobody remembering to add them to a list.
 *   2. **Verifiability** — each export writes a RECEIPT (org, digest, table and
 *      row counts, who, when). `purgeTenant` verifies the supplied digest against
 *      a receipt for that same organization, so "a final export was produced"
 *      becomes a checkable fact rather than a claim in a request body.
 *
 * ── On the digest ─────────────────────────────────────────────────────────────
 * SHA-256 over the canonical JSON of the payload. It identifies *which* export
 * was handed over; it is not a tamper-proof seal, and nothing here claims it is.
 * The tamper-evident artifact is the hash-chain attestation next door
 * (`attestation-report.service.ts`), which the offboarding runbook pairs with
 * this one.
 *
 * @module server/services/tenant-export/tenant-full-export
 */

import crypto from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('tenant-full-export');

/** Tenant key columns, in the order 0021 and the RLS sweep prefer them. */
const TENANT_KEY_COLUMNS = ['organization_id', 'org_id', 'tenant_id'] as const;

/**
 * Tables deliberately excluded from a tenant export.
 *
 * These are not omissions — each is either cross-tenant infrastructure or a
 * record the tenant does not own. Anything NOT on this list is exported, which
 * is the correct default for a data-return artifact.
 */
export const EXPORT_EXCLUDED_TABLES: readonly string[] = Object.freeze([
  // Migration bookkeeping.
  '__drizzle_migrations',
  'c2c_migration_journal',
  // Stripe's record of its own webhooks; the tenant's billing history is
  // exported from the billing tables, not from the raw event log.
  'stripe_events',
  // Cross-tenant admin surfaces.
  'billing_budgets',
  'billing_alerts',
  // Secrets. An export is handed to a customer; API key material is not part of
  // their data and re-issuing it is the offboarding path.
  'api_keys',
]);

/** Row cap per table, so one pathological table cannot exhaust memory. */
const MAX_ROWS_PER_TABLE = 50_000;

export interface ExportedTable {
  table: string;
  tenantColumn: string;
  rowCount: number;
  /** True when the table hit MAX_ROWS_PER_TABLE and the dump is partial. */
  truncated: boolean;
  rows: Array<Record<string, unknown>>;
}

export interface TenantFullExport {
  schemaVersion: '2.0';
  exportedAt: string;
  organization: { id: number; slug: string; name: string; status: string };
  coverage: {
    tablesDiscovered: number;
    tablesExported: number;
    tablesEmpty: number;
    tablesFailed: Array<{ table: string; error: string }>;
    totalRows: number;
    truncatedTables: string[];
  };
  tables: ExportedTable[];
}

export class TenantNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantNotFoundError';
  }
}

/**
 * Every table in `public` carrying a tenant key, minus the exclusions.
 *
 * Catalog-driven on purpose. A hand-maintained list is how the curated export
 * drifted to covering one eighth of what a purge destroys: nothing forces the
 * list to grow when the schema does.
 */
export async function discoverTenantTables(
  client: Pool | PoolClient
): Promise<Array<{ table: string; tenantColumn: string }>> {
  const { rows } = await client.query<{ table_name: string; column_name: string }>(
    `SELECT c.table_name, c.column_name
       FROM information_schema.columns c
       JOIN information_schema.tables t
         ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE c.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
        AND c.column_name = ANY($1::text[])
      ORDER BY c.table_name,
               array_position($1::text[], c.column_name)`,
    [[...TENANT_KEY_COLUMNS]]
  );

  // A table may carry more than one recognized key; take the most preferred.
  const seen = new Map<string, string>();
  for (const row of rows) {
    if (!seen.has(row.table_name)) seen.set(row.table_name, row.column_name);
  }
  for (const excluded of EXPORT_EXCLUDED_TABLES) seen.delete(excluded);

  return [...seen.entries()].map(([table, tenantColumn]) => ({ table, tenantColumn }));
}

/**
 * Canonical JSON — keys sorted at every level — so the digest depends on the
 * DATA and not on property insertion order. Without this the same export
 * digests differently between Node versions or driver upgrades, and a receipt
 * stops matching for reasons that have nothing to do with the tenant.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(',')}}`;
}

export function digestOf(payload: unknown): string {
  return `sha256:${crypto.createHash('sha256').update(canonicalize(payload)).digest('hex')}`;
}

/**
 * Dump every tenant-owned row for one organization.
 *
 * A table that fails to read is RECORDED in `coverage.tablesFailed` rather than
 * aborting the export. An offboarding customer is better served by a complete
 * export with three named gaps than by no export at all — and the gaps are
 * exactly what the operator needs to see before authorizing a purge.
 */
export async function exportTenantFull(
  client: Pool | PoolClient,
  organizationId: number
): Promise<TenantFullExport> {
  const orgResult = await client.query<{
    id: number;
    slug: string;
    name: string;
    status: string;
  }>(`SELECT id, slug, name, status FROM organizations WHERE id = $1 LIMIT 1`, [organizationId]);
  if (orgResult.rows.length === 0) {
    throw new TenantNotFoundError(`Organization ${organizationId} not found`);
  }

  const discovered = await discoverTenantTables(client);
  const tables: ExportedTable[] = [];
  const tablesFailed: Array<{ table: string; error: string }> = [];
  const truncatedTables: string[] = [];
  let totalRows = 0;
  let tablesEmpty = 0;

  for (const { table, tenantColumn } of discovered) {
    try {
      // Identifiers come from the catalog, never from caller input. The regex is
      // a belt-and-braces assertion on that invariant, matching the same guard
      // the purge applies to its own frozen table list.
      if (!/^[a-z_][a-z0-9_]*$/.test(table) || !/^[a-z_][a-z0-9_]*$/.test(tenantColumn)) {
        tablesFailed.push({ table, error: 'unsafe identifier' });
        continue;
      }
      const { rows } = await client.query(
        `SELECT * FROM "${table}" WHERE "${tenantColumn}"::text = $1 LIMIT ${MAX_ROWS_PER_TABLE + 1}`,
        [String(organizationId)]
      );
      const truncated = rows.length > MAX_ROWS_PER_TABLE;
      const kept = truncated ? rows.slice(0, MAX_ROWS_PER_TABLE) : rows;
      if (truncated) truncatedTables.push(table);
      if (kept.length === 0) tablesEmpty += 1;
      totalRows += kept.length;
      tables.push({ table, tenantColumn, rowCount: kept.length, truncated, rows: kept });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('Tenant export could not read a table', { organizationId, table, error: message });
      tablesFailed.push({ table, error: message.slice(0, 200) });
    }
  }

  return {
    schemaVersion: '2.0',
    exportedAt: new Date().toISOString(),
    organization: orgResult.rows[0],
    coverage: {
      tablesDiscovered: discovered.length,
      tablesExported: tables.length,
      tablesEmpty,
      tablesFailed,
      totalRows,
      truncatedTables,
    },
    tables,
  };
}

export interface ExportReceipt {
  organizationId: number;
  digest: string;
  tableCount: number;
  rowCount: number;
  createdAt: Date;
  createdBy: number | null;
}

/**
 * Persist the receipt that `purgeTenant` later verifies against.
 *
 * Best-effort by design at the WRITE side — an export must still be delivered to
 * the customer if the receipt table is unavailable. The strictness lives at the
 * READ side: `findExportReceipt` returning nothing means the purge refuses. That
 * ordering fails safe in both directions — a lost receipt blocks a destruction,
 * it never permits one.
 */
export async function recordExportReceipt(
  client: Pool | PoolClient,
  params: {
    organizationId: number;
    digest: string;
    tableCount: number;
    rowCount: number;
    createdBy: number | null;
  }
): Promise<void> {
  try {
    await client.query(
      `INSERT INTO tenant_export_receipts
         (organization_id, digest, table_count, row_count, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (organization_id, digest) DO NOTHING`,
      [
        params.organizationId,
        params.digest,
        params.tableCount,
        params.rowCount,
        params.createdBy,
      ]
    );
  } catch (error) {
    logger.warn('Failed to record tenant export receipt — a later purge will refuse this digest', {
      organizationId: params.organizationId,
      digest: params.digest,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Look up a receipt for this organization and digest. Null when there is none. */
export async function findExportReceipt(
  client: Pool | PoolClient,
  organizationId: number,
  digest: string
): Promise<ExportReceipt | null> {
  const { rows } = await client.query(
    `SELECT organization_id, digest, table_count, row_count, created_at, created_by
       FROM tenant_export_receipts
      WHERE organization_id = $1 AND digest = $2
      LIMIT 1`,
    [organizationId, digest]
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    organizationId: r.organization_id,
    digest: r.digest,
    tableCount: r.table_count,
    rowCount: r.row_count,
    createdAt: r.created_at,
    createdBy: r.created_by,
  };
}
