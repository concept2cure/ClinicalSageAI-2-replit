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
 * Schemas the catalog sweep covers.
 *
 * It was `public` alone — which meant this module's own opening paragraph was
 * wrong about itself. It says a curated manifest would hand a customer "their
 * programme records and none of their documents, VAULT CONTENTS, uploads..." and
 * then discovered no vault table, because vault.documents lives in the `vault`
 * schema. The export claimed to be catalog-driven and complete while omitting
 * the customer's actual regulatory documents — the single largest thing they
 * would expect a data return to contain.
 *
 * An explicit list rather than "every schema": this database also carries
 * cortex, ai, compliance, identity and others holding derived, internal or
 * cross-tenant state, and sweeping them wholesale would put material in a
 * customer's data return that is not the customer's. A schema is added here when
 * someone has decided its contents belong to the tenant.
 */
const EXPORT_SCHEMAS: readonly string[] = Object.freeze(['public', 'vault']);

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
): Promise<Array<{ schema: string; table: string; tenantColumn: string }>> {
  const { rows } = await client.query<{
    table_schema: string;
    table_name: string;
    column_name: string;
  }>(
    `SELECT c.table_schema, c.table_name, c.column_name
       FROM information_schema.columns c
       JOIN information_schema.tables t
         ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE c.table_schema = ANY($2::text[])
        AND t.table_type = 'BASE TABLE'
        AND c.column_name = ANY($1::text[])
      ORDER BY c.table_schema, c.table_name,
               array_position($1::text[], c.column_name)`,
    [[...TENANT_KEY_COLUMNS], [...EXPORT_SCHEMAS]]
  );

  // A table may carry more than one recognized key; take the most preferred.
  // Keyed by schema.table, so a name existing in two schemas is two entries
  // rather than one silently shadowing the other.
  const seen = new Map<string, { schema: string; table: string; tenantColumn: string }>();
  for (const row of rows) {
    const key = `${row.table_schema}.${row.table_name}`;
    if (!seen.has(key)) {
      seen.set(key, {
        schema: row.table_schema,
        table: row.table_name,
        tenantColumn: row.column_name,
      });
    }
  }
  /* Exclusions stay BARE table names, matching how they are written, and are
     applied per schema — an excluded `public.audit_logs` must not silently
     exclude a same-named table in another schema nobody considered. */
  for (const excluded of EXPORT_EXCLUDED_TABLES) seen.delete(`public.${excluded}`);

  return [...seen.values()];
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

  for (const { schema, table, tenantColumn } of discovered) {
    /* Reported schema-qualified whenever it is not `public`, so a reader of the
       export can tell vault.documents from a public table of the same name, and
       so the coverage report names what was actually read. */
    const label = schema === 'public' ? table : `${schema}.${table}`;
    try {
      // Identifiers come from the catalog, never from caller input. The regex is
      // a belt-and-braces assertion on that invariant, matching the same guard
      // the purge applies to its own frozen table list. Each part is checked
      // separately and quoted separately — a single check over "schema.table"
      // would have to admit a dot, and a dot inside one quoted identifier is a
      // literal character, not a qualifier.
      const SAFE = /^[a-z_][a-z0-9_]*$/;
      if (!SAFE.test(schema) || !SAFE.test(table) || !SAFE.test(tenantColumn)) {
        tablesFailed.push({ table: label, error: 'unsafe identifier' });
        continue;
      }
      const { rows } = await client.query(
        `SELECT * FROM "${schema}"."${table}" WHERE "${tenantColumn}"::text = $1 LIMIT ${MAX_ROWS_PER_TABLE + 1}`,
        [String(organizationId)]
      );
      const truncated = rows.length > MAX_ROWS_PER_TABLE;
      const kept = truncated ? rows.slice(0, MAX_ROWS_PER_TABLE) : rows;
      if (truncated) truncatedTables.push(label);
      if (kept.length === 0) tablesEmpty += 1;
      totalRows += kept.length;
      tables.push({ table: label, tenantColumn, rowCount: kept.length, truncated, rows: kept });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('Tenant export could not read a table', {
        organizationId,
        table: label,
        error: message,
      });
      tablesFailed.push({ table: label, error: message.slice(0, 200) });
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
