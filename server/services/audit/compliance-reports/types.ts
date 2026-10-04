/**
 * The shapes shared by the compliance-report catalog, its queries, the
 * generator and the route (GET /api/audit/reports, /api/audit/reports/:id).
 *
 * A report is deterministic: every number and every row comes from SQL run on
 * one tenant-stamped, read-only snapshot. Nothing here is composed by a model.
 *
 * @module server/services/audit/compliance-reports/types
 */

import type { TenantChainHead } from '../tenant-chain-verdict';

export type PeriodKind = 'range' | 'as-of';

/** The period a report covers, as stated in the report and its manifest. UTC dates, inclusive. */
export interface ReportPeriod {
  from: string | null;
  to: string;
  kind: PeriodKind;
}

/**
 * The same period as the half-open interval the SQL compares against.
 * `start` is the first instant of `from` (of `to` for an as-of report);
 * `end` is the first instant of the day after `to`.
 */
export interface PeriodBounds {
  start: string;
  end: string;
}

export interface ColumnDef {
  key: string;
  label: string;
}

export interface SectionDef {
  key: string;
  title: string;
  columns: ColumnDef[];
}

/** What a query returns for one section, before it is laid out in the report. */
export interface SectionResult {
  rows: Record<string, unknown>[];
  truncated: boolean;
  notes?: string[];
}

export interface ReportSection extends SectionDef {
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
  notes?: string[];
}

/**
 * What a report says about the audit chain (`data.chain`, `manifest.chainAtGeneration`).
 *
 * Only the integrity attestation checks the chain (`scope: 'integrity-checks'`):
 * `ok` is true only when every one of its checks is intact, false when any is
 * broken, and null otherwise. Every other report states `scope: 'not-checked'`,
 * `ok: null` — it does not walk the chain (review round 1, DP-46: every run
 * loaded the whole chain, and for legacy rows other tenants' legacy hashes).
 */
export interface ChainSummary {
  ok: boolean | null;
  scope: 'integrity-checks' | 'not-checked';
  rowsChecked?: number;
  reason?: string;
  checks?: { total: number; intact: number; broken: number; notVerified: number };
}

export interface ReportData {
  report: { id: string; title: string; version: 1 };
  organizationId: number;
  period: ReportPeriod;
  generatedAt: string;
  chain: ChainSummary;
  sections: ReportSection[];
  notRecorded: string[];
}

/** The one method a report query needs: a pg client inside the tenant snapshot. */
export interface SqlClient {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
}

/** The tenant audit_logs chain walk (services/audit/audited-export.ts walkTenantChain). */
export interface TenantChainWalk {
  ok: boolean | null;
  rowsChecked?: number;
  brokenAt?: unknown;
  reason?: string;
  /** The chain head against the latest anchor (tenant-chain-verdict.ts TenantChainHead). */
  head?: TenantChainHead;
}

/** The audit_events linkage snapshot (signedAuditExport.ts snapshotChainIntegrity). */
export interface LinkageSnapshot {
  status: 'intact' | 'broken' | 'unverified' | 'unavailable';
  totalEntries: number;
  hashedEntries?: number;
  brokenLinks: number;
  reason?: string;
}

/** The audit_logs HMAC seal check for one tenant. `ran: false` is never a verdict. */
export type SealCheck =
  | { ran: true; valid: boolean; sealedRows: number; brokenAt: number | null }
  | { ran: false; reason: string };

/** The integrity checks the audit-trail-integrity report states. Injected so a test can drive each state. */
export interface IntegrityChecks {
  auditEventsLinkage: (client: SqlClient, orgId: number) => Promise<LinkageSnapshot>;
  auditLogsSeals: (orgId: number) => Promise<SealCheck>;
}

export interface RunContext {
  client: SqlClient;
  orgId: number;
  period: ReportPeriod;
  bounds: PeriodBounds;
  /** The tenant chain walk, before the snapshot — present only for a report that `walksChain`. */
  chain?: TenantChainWalk;
  checks: IntegrityChecks;
}

export interface ReportDefinition {
  id: string;
  title: string;
  /** One plain sentence: what the report answers. */
  purpose: string;
  /** The regulatory clauses the report is evidence for. */
  basis: string[];
  period: PeriodKind;
  sections: SectionDef[];
  /** What the platform does not record, so the report cannot show it. Stated, never implied. */
  notRecorded: string[];
  /** Present only on an entry whose run is another endpoint. */
  endpoint?: string;
  /** Absent only on an entry whose run is another endpoint. */
  run?: (ctx: RunContext) => Promise<Record<string, SectionResult>>;
  /** True only for the report that verifies the chain; no other report walks it. */
  walksChain?: boolean;
  /** The chain statement of a report that checks it; every other report is 'not-checked'. */
  chainSummary?: (results: Record<string, SectionResult>, walk: TenantChainWalk | undefined) => ChainSummary;
}

/** The catalog entry as the client receives it. */
export interface ReportSummary {
  id: string;
  title: string;
  purpose: string;
  basis: string[];
  period: PeriodKind;
  sections: { key: string; title: string }[];
  notRecorded: string[];
  endpoint?: string;
}
