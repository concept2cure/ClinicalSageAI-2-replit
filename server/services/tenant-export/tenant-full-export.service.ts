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

import { PURGE_PARENT_SCOPED, EXPORT_DERIVED_TABLES } from '../tenant/purge-parent-scope';
import type { Pool, PoolClient } from 'pg';
import { createScopedLogger } from '../../utils/logger';
import { readCompanyExportOrganization, readCompanyDocumentsExportEnvelope, companyDocumentsExportDescriptor,
  validCompanyDocumentsExportDescriptor, type CompanyDocumentsExportDescriptor, type CompanyDocumentsExportEnvelope } from './company-document-envelope';
export { canonicalize, digestOf } from './canonical-json';

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

/**
 * Columns whose VALUES are withheld from a tenant export, and why.
 *
 * The export reads every tenant-keyed table with SELECT *. Until 2026-10-05 that
 * returned credential material to whoever downloaded the data return: OAuth
 * access and refresh tokens, connector and agency-gateway credentials, session
 * keys, and the hashes bearer tokens are checked against. None of it is the
 * customer's data in the GDPR Art. 20 sense. It is key material: usable, or
 * replayable, by whoever holds the file, and re-issued, not returned, when an
 * account closes (the api_keys rule above, one level down).
 *
 * Withheld, not dropped: a non-null value becomes `[withheld: <reason>]`, null
 * stays null, and the table names the columns it withheld. So the customer can
 * see that a credential existed and which account held it, but cannot read it.
 * Every other column of the row is returned as stored.
 *
 * A new secret-shaped column in an exported table is caught against the fully
 * migrated schema by tests/db/tenant-export-withheld-columns.dbtest.ts: it must
 * be listed here or in EXPORT_COLUMNS_NOT_SECRET.
 */
export const EXPORT_WITHHELD_COLUMNS: Readonly<Record<string, Readonly<Record<string, string>>>> = Object.freeze({
  c2c_mailbox_connections: { token_reference: 'a mailbox token or credential-store reference' },
  connector_credentials: { credentials: 'connector credentials' },
  // Exported through its document since 2026-10-29 (purge-parent-scope.ts).
  document_locks: { lock_token: "a document lock's token, which lets its holder act on the lock" },
  document_sessions: { session_token: 'a session token' },
  gate_approvals: { verification_token: 'a one-time verification token' },
  integration_tokens: { access_token: 'an OAuth access token', refresh_token: 'an OAuth refresh token' },
  licenses: { access_token: 'a license access token' },
  mcp_oauth_refresh_tokens: { token_hash: 'the hash a refresh token is checked against' },
  organization_gateway_accounts: { credentials_ciphertext: 'agency gateway credentials, encrypted under a platform key' },
  scim_tenants: { token_hash: 'the hash a SCIM bearer token is checked against' },
  session_activity: { session_key: 'a sign-in session key' },
  submission_gateway_credentials: { secrets_ref: 'where a gateway secret is stored' },
});

/**
 * Text columns whose NAMES look like secrets but whose values are not, and why.
 * Read with EXPORT_WITHHELD_COLUMNS by the schema guard; a column on neither
 * list fails it, so this is a decision record, not a convenience.
 */
export const EXPORT_COLUMNS_NOT_SECRET: Readonly<Record<string, Readonly<Record<string, string>>>> = Object.freeze({
  audit_events: { hmac_seal: "the row's integrity seal; it proves the row, it does not unlock anything" },
  audit_logs: { hmac_seal: "the row's integrity seal; it proves the row, it does not unlock anything" },
  authoring_tokens: { token_key: 'a citation token in authored content' },
  client_security_settings: { password_policy_settings: 'the password POLICY (length, expiry), no password' },
  ind_investigators: { credentials: 'professional credentials such as MD, PhD' },
  organization_gateway_accounts: { credential_fields: 'the NAMES of the credential fields held, not their values' },
  stab_exports: { tokens: 'recorded P.8 authoring fields, such as study identity, conditions and result summary' },
  submission_gateway_credentials: { credential_kind: 'the kind of credential, a label' },
});

const withheldMarker = (reason: string) => `[withheld: ${reason}]`;

/** One table of the export, with its withheld columns' values replaced. */
function exportedTable(
  table: string,
  tenantColumn: string,
  rows: Array<Record<string, unknown>>,
  truncated: boolean,
): ExportedTable {
  // Own-key lookup: a bare index reaches Object.prototype.
  const withheld = Object.prototype.hasOwnProperty.call(EXPORT_WITHHELD_COLUMNS, table)
    ? EXPORT_WITHHELD_COLUMNS[table]
    : null;
  if (!withheld) return { table, tenantColumn, rowCount: rows.length, truncated, rows };
  return {
    table,
    tenantColumn,
    rowCount: rows.length,
    truncated,
    withheldColumns: Object.keys(withheld),
    rows: rows.map((row) => withholdSecrets(row, withheld)),
  };
}

/** The row with its withheld columns' non-null values replaced by a marker. */
function withholdSecrets(row: Record<string, unknown>, withheld: Readonly<Record<string, string>>): Record<string, unknown> {
  const out = { ...row };
  for (const [column, reason] of Object.entries(withheld)) {
    if (Object.prototype.hasOwnProperty.call(out, column) && out[column] != null) out[column] = withheldMarker(reason);
  }
  return out;
}

/** Row cap per table, so one pathological table cannot exhaust memory. */
const MAX_ROWS_PER_TABLE = 50_000;

/**
 * Tables whose tenant rows are NOT "the tenant column equals the org id", with
 * the predicate that selects them instead — the SAME predicate the purge
 * deletes by (../tenant/purge-parent-scope, one map read by both), so an export
 * never contains less than the erasure it authorizes destroys. `$1` is the
 * organization id as an integer.
 *
 * Most have no tenant column at all: legacy children scoped by their parent
 * (2026-10-29). Until then the export did not discover them, so a customer's
 * legacy document versions, CER sections and the like never came back; the
 * purge now erases them, so it must return them. A wrong predicate here hands
 * one customer another's rows, so each is the parent and key of the table's
 * row-level-security policy, and tests/db/tenant-purge-blocking-keys.dbtest.ts
 * checks, table by table, that a tenant's export holds its own row and not
 * another tenant's.
 *
 * vault.document_chunks is deliberately absent (EXPORT_DERIVED_TABLES): it is
 * derived — the passages are cut from the documents' extracted_text, which IS
 * exported with each document. The purge removes chunks with their parent; the
 * data return carries the text they were cut from.
 */
const EXPORT_SCOPED_PREDICATES: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(Object.entries(PURGE_PARENT_SCOPED).filter(([table]) => !EXPORT_DERIVED_TABLES.includes(table))),
);

/** The tenant column a parent-scoped table is reported with: its rows are selected through their parent. */
export const PARENT_SCOPED_TENANT_COLUMN = 'parent';

export interface ExportedTable {
  table: string;
  tenantColumn: string;
  rowCount: number;
  /** True when the table hit MAX_ROWS_PER_TABLE and the dump is partial. */
  truncated: boolean;
  /** Columns whose values this export withheld (EXPORT_WITHHELD_COLUMNS); absent when none. */
  withheldColumns?: string[];
  rows: Array<Record<string, unknown>>;
}

export interface TenantFullExport {
  schemaVersion: '2.0';
  exportedAt: string;
  organization: { id: number; slug: string; name: string; status: string };
  companyDocuments?: CompanyDocumentsExportEnvelope;
  coverage: {
    tablesDiscovered: number;
    tablesExported: number;
    tablesEmpty: number;
    tablesFailed: Array<{ table: string; error: string }>;
    totalRows: number;
    truncatedTables: string[];
    companyDocuments?: CompanyDocumentsExportDescriptor;
    /** The scope the read ran in, as its database session stated it (readExportScope). */
    scope?: ExportScope;
  };
  tables: ExportedTable[];
}

/**
 * The scope an export's read ran in, read from its own database session
 * (P-58's data return, 2026-10-29; docs/evidence/D6-OFFBOARDING-CUSTODY/2026-10-29/).
 *
 *   organization  RLS enforced, in the exported organization's own scope: its
 *                 tenant id and its organization uuid. Every tenant policy
 *                 admits the organization's own rows, so the export's
 *                 predicate alone decides (routes/tenant-export.ts).
 *   unrestricted  nothing filtered the read: RLS not enforced on the session,
 *                 or a role that bypasses it (the owner, a test fixture).
 *   restricted    any other scope. The platform scope (tenant '0', no uuid)
 *                 is one: under it vault.* and the knowledge graph returned
 *                 none of the organization's rows, and nothing failed.
 */
export interface ExportScope {
  kind: 'organization' | 'unrestricted' | 'restricted';
  rlsEnforced: boolean;
  tenantId: string;
  organizationUuid: string;
}

/** The scopes whose read returns every row the export selects: the only ones whose export records a receipt, and so the only ones a purge accepts. */
export const COMPLETE_EXPORT_SCOPES: readonly string[] = Object.freeze(['organization', 'unrestricted']);

/** The export's scope, from its session. A scope that cannot be read is `restricted`: it records no receipt. */
export async function readExportScope(client: Pool | PoolClient, organizationId: number): Promise<ExportScope> {
  try {
    const { rows } = await client.query(
      `SELECT current_setting('app.rls_enforce', true) AS enforce,
              current_setting('app.current_tenant_id', true) AS tenant,
              current_setting('app.current_org_id', true) AS org_uuid,
              (SELECT r.rolsuper OR r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user) AS bypass,
              (SELECT to_jsonb(o)->>'uuid' FROM organizations o WHERE o.id = $1) AS own_uuid`,
      [organizationId],
    );
    const r = rows[0] ?? {};
    const rlsEnforced = r.enforce === 'on';
    const tenantId = String(r.tenant ?? '');
    const organizationUuid = String(r.org_uuid ?? '');
    const own = rlsEnforced && tenantId === String(organizationId) && !!r.own_uuid && organizationUuid === String(r.own_uuid);
    const kind: ExportScope['kind'] = !rlsEnforced || r.bypass === true ? 'unrestricted' : own ? 'organization' : 'restricted';
    return { kind, rlsEnforced, tenantId, organizationUuid };
  } catch {
    return { kind: 'restricted', rlsEnforced: false, tenantId: '', organizationUuid: '' };
  }
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

  /* The parent-scoped tables with no tenant column of their own, when this
     database has them: read through EXPORT_SCOPED_PREDICATES, never by a column. */
  const scoped = Object.keys(EXPORT_SCOPED_PREDICATES)
    .map((label) => (label.includes('.') ? label : `public.${label}`))
    .filter((key) => !seen.has(key));
  if (scoped.length) {
    const { rows: present } = await client.query<{ table_schema: string; table_name: string }>(
      `SELECT table_schema, table_name FROM information_schema.tables
        WHERE table_type = 'BASE TABLE' AND table_schema || '.' || table_name = ANY($1::text[])
        ORDER BY 1, 2`,
      [scoped]
    );
    for (const row of present) {
      seen.set(`${row.table_schema}.${row.table_name}`, {
        schema: row.table_schema,
        table: row.table_name,
        tenantColumn: PARENT_SCOPED_TENANT_COLUMN,
      });
    }
  }

  return [...seen.values()];
}

/**
 * Canonical JSON — keys sorted at every level — so the digest depends on the
 * DATA and not on property insertion order. Without this the same export
 * digests differently between Node versions or driver upgrades, and a receipt
 * stops matching for reasons that have nothing to do with the tenant.
 */
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
  const orgResult = await readCompanyExportOrganization(client, organizationId);
  if (orgResult.rows.length === 0) {
    throw new TenantNotFoundError(`Organization ${organizationId} not found`);
  }
  const org = orgResult.rows[0];
  const scope = await readExportScope(client, organizationId);
  const companyDocuments = await readCompanyDocumentsExportEnvelope(client, organizationId, org);

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
      // Own-key lookup: a bare index reaches Object.prototype.
      const scoped = Object.prototype.hasOwnProperty.call(EXPORT_SCOPED_PREDICATES, label)
        ? EXPORT_SCOPED_PREDICATES[label]
        : null;
      const { rows } = scoped
        ? await client.query(
            `SELECT * FROM "${schema}"."${table}" WHERE ${scoped} LIMIT ${MAX_ROWS_PER_TABLE + 1}`,
            [organizationId]
          )
        : await client.query(
            `SELECT * FROM "${schema}"."${table}" WHERE "${tenantColumn}"::text = $1 LIMIT ${MAX_ROWS_PER_TABLE + 1}`,
            [String(organizationId)]
          );
      const truncated = rows.length > MAX_ROWS_PER_TABLE;
      const kept = truncated ? rows.slice(0, MAX_ROWS_PER_TABLE) : rows;
      if (truncated) truncatedTables.push(label);
      if (kept.length === 0) tablesEmpty += 1;
      totalRows += kept.length;
      tables.push(exportedTable(label, tenantColumn, kept, truncated));
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
    organization: { id: org.id, slug: org.slug, name: org.name, status: org.status },
    companyDocuments,
    coverage: {
      tablesDiscovered: discovered.length,
      tablesExported: tables.length,
      tablesEmpty,
      tablesFailed,
      totalRows,
      truncatedTables,
      companyDocuments: companyDocumentsExportDescriptor(companyDocuments),
      scope,
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
  companyDocumentsVersion?: number | null;
  companyDocumentsSha256?: string | null;
  /** The scope its export ran in (COMPLETE_EXPORT_SCOPES); null for a receipt recorded before 2026-10-29. */
  exportScope?: string | null;
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
/**
 * Whether a receipt for this digest exists after the call.
 *
 * Found by the adversarial review of the WO-16C #133 conversion in
 * routes/tenant-export.ts. This function returned `Promise<void>` and swallowed
 * its own INSERT failure, and its own warning says what that costs: "a later
 * purge will refuse this digest". So the caller handed a customer an export
 * whose digest looked receipt-backed and was not, and could not have known.
 *
 * `ON CONFLICT DO NOTHING` means a re-export of byte-identical data writes no
 * row, which is NOT a failure — the receipt is already there. `recorded` is
 * therefore "a receipt exists", not "an INSERT happened"; `inserted` says which,
 * for a caller that wants to distinguish a fresh export from a repeat.
 */
export interface ExportReceiptOutcome {
  /** True when a receipt for (organizationId, digest) exists after this call. */
  recorded: boolean;
  /** True only when THIS call wrote the row (false on an ON CONFLICT no-op). */
  inserted: boolean;
  /**
   * Set when no receipt was written because the export was incomplete: a table
   * failed to read, or one was truncated. The receipt is what authorizes a
   * purge, and an incomplete return of a tenant's data must never authorize its
   * destruction. Names the tables, so the operator knows what to fix.
   */
  incomplete?: { tablesFailed: string[]; truncatedTables: string[]; scope?: string };
}

export async function recordExportReceipt(
  client: Pool | PoolClient,
  params: {
    organizationId: number;
    digest: string;
    tableCount: number;
    rowCount: number;
    createdBy: number | null;
    /** The export's own coverage report (`payload.coverage`). */
    coverage: {
      tablesFailed: ReadonlyArray<{ table: string } | string>;
      truncatedTables: ReadonlyArray<string>;
      companyDocuments?: CompanyDocumentsExportDescriptor;
      scope?: Pick<ExportScope, 'kind'>;
    };
  }
): Promise<ExportReceiptOutcome> {
  const tablesFailed = params.coverage.tablesFailed.map((t) => (typeof t === 'string' ? t : t.table));
  const truncatedTables = [...params.coverage.truncatedTables];
  const companyDocuments = params.coverage.companyDocuments;
  if (companyDocuments !== undefined && !validCompanyDocumentsExportDescriptor(companyDocuments)) tablesFailed.push('organizations.companyDocuments');
  // An export read in a scope that returns less than exists is incomplete although no table failed:
  // under the platform scope, vault.* and the knowledge graph returned nothing (P-58's data return).
  const scope = params.coverage.scope?.kind ?? 'unstated';
  if (!COMPLETE_EXPORT_SCOPES.includes(scope)) {
    logger.warn('Tenant export read outside the organization\'s own scope — no receipt recorded; this digest cannot authorize a purge', {
      organizationId: params.organizationId,
      digest: params.digest,
      scope,
    });
    return { recorded: false, inserted: false, incomplete: { tablesFailed, truncatedTables, scope } };
  }
  if (tablesFailed.length > 0 || truncatedTables.length > 0) {
    // No receipt: this digest must not open a purge (tenant-purge.dbtest.ts).
    logger.warn('Tenant export incomplete — no receipt recorded; this digest cannot authorize a purge', {
      organizationId: params.organizationId,
      digest: params.digest,
      tablesFailed,
      truncatedTables,
    });
    return { recorded: false, inserted: false, incomplete: { tablesFailed, truncatedTables } };
  }
  try {
    const res = await client.query(
      `INSERT INTO tenant_export_receipts
         (organization_id, digest, table_count, row_count, created_by, company_documents_version, company_documents_sha256, export_scope)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (organization_id, digest) DO NOTHING`,
      [
        params.organizationId,
        params.digest,
        params.tableCount,
        params.rowCount,
        params.createdBy,
        companyDocuments?.schemaVersion ?? null,
        companyDocuments?.sha256 ?? null,
        scope,
      ]
    );
    // A conflict wrote nothing and is still a receipt-backed digest.
    return { recorded: true, inserted: (res.rowCount ?? 0) > 0 };
  } catch (error) {
    // Still swallowed — a failed receipt must not deny the customer an export of
    // their own data, which is real and already assembled. What changes is that
    // the caller is told, so it can stop implying the digest is purge-usable.
    // The store's own text stays here.
    logger.warn('Failed to record tenant export receipt — a later purge will refuse this digest', {
      organizationId: params.organizationId,
      digest: params.digest,
      error: error instanceof Error ? error.message : String(error),
    });
    return { recorded: false, inserted: false };
  }
}

/** Look up a receipt for this organization and digest. Null when there is none. */
export async function findExportReceipt(
  client: Pool | PoolClient,
  organizationId: number,
  digest: string,
  opts: { hold?: boolean } = {}
): Promise<ExportReceipt | null> {
  const { rows } = await client.query(
    `SELECT organization_id, digest, table_count, row_count, created_at, created_by,
            to_jsonb(r)->'company_documents_version' AS company_documents_version,
            to_jsonb(r)->>'company_documents_sha256' AS company_documents_sha256,
            to_jsonb(r)->>'export_scope' AS export_scope
       FROM tenant_export_receipts r
      WHERE organization_id = $1 AND digest = $2
      LIMIT 1${opts.hold ? ' FOR SHARE' : ''}`,
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
    companyDocumentsVersion: r.company_documents_version ?? null,
    companyDocumentsSha256: r.company_documents_sha256 ?? null,
    exportScope: r.export_scope ?? null,
  };
}
