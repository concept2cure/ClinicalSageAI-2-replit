/**
 * Signed Audit Export Service
 *
 * Provides tamper-evident audit trail exports for regulatory inspection.
 * Every export includes:
 *   1. An integrity manifest with SHA-256 hashes of all content
 *   2. An HMAC-SHA256 signature over the manifest (server-side key)
 *   3. Export metadata (who exported, when, query filters used)
 *   4. Chain integrity verification result at time of export
 *
 * Compliance: 21 CFR Part 11 §11.10(e) — audit trail exports must be
 * tamper-evident so inspectors can verify the data has not been altered
 * after download.
 *
 * @module server/services/audit/signedAuditExport
 */

import crypto from 'crypto';
import { Pool } from 'pg';
import type { ChainVerificationResult } from './chain.js';

import { stableStringify } from '../../../shared/canonical-json.js';
import {
  VerificationUnavailableError,
  describeFailure,
  isVerificationUnavailable,
} from '../../lib/verification-outcome.js';

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

export interface AuditExportRequest {
  organizationId?: number;
  startDate?: string;
  endDate?: string;
  eventType?: string;
  userId?: number;
  /** Narrow both stores to one record type (audit_logs.table_name / audit_events.entity_type). */
  resourceType?: string;
  /** Narrow both stores to these records (audit_logs.record_id / audit_events.entity_id). */
  recordIds?: string[];
  format: 'csv' | 'json';
  exportedBy: string;
  exportedByRole?: string;
  ipAddress?: string;
}

export interface SignedAuditExport {
  /** The actual data payload (CSV string or JSON array) */
  data: string;
  /** Content-Type header for the response */
  contentType: string;
  /** Suggested filename */
  filename: string;
  /** Integrity manifest */
  manifest: ExportManifest;
  /** HMAC-SHA256 signature of the canonical manifest */
  signature: string;
}

export interface ExportManifest {
  exportId: string;
  exportedAt: string;
  exportedBy: string;
  exportedByRole: string;
  exportSource: string;
  queryFilters: Record<string, any>;
  format: string;
  rowCount: number;
  truncated: boolean;
  dataHash: string;          // SHA-256 of the raw data payload
  hashAlgorithm: string;
  /**
   * Which canonicalization sealed this manifest — see {@link canonicalizeManifest}.
   * Absent on exports issued before the fix in ledger L55; those verify under
   * version 1, which is what makes this field a compatibility marker rather
   * than a version bump.
   */
  manifestVersion?: 1 | 2;
  /**
   * Linkage verification at export time. Four states (WO-16B finding 25):
   *   intact       every hashed row's previous_hash matched its predecessor
   *   broken       at least one link did not match
   *   unverified   the query RAN but nothing could be verified — no rows, or no
   *                row carries a record_hash — so no verdict exists
   *   unavailable  the query did not run
   * `intact` used to be returned for both `unverified` cases; a manifest then
   * HMAC-signed a verdict nothing had earned.
   */
  chainIntegrity: {
    status: 'intact' | 'broken' | 'unverified' | 'unavailable';
    totalEntries: number;
    /** Rows carrying a record_hash — the only rows a link can be checked on. */
    hashedEntries?: number;
    /** Rows carrying no record_hash. Absent on exports sealed before WO-16B. */
    unhashedEntries?: number;
    brokenLinks: number;
    verifiedAt: string;
    /** Why the status is not a verdict, when it is not one. */
    reason?: string;
  };
  /**
   * The audit_events row that records this export — written BEFORE the
   * manifest is sealed so the signature covers it (WO-16B finding 26). Absent
   * on exports sealed before that change.
   */
  exportRecord?: { auditEventId: number };
  /**
   * How many rows each store contributed. The export used to read audit_events
   * only, so no event the launch apps write to audit_logs (Vault ingest, filing,
   * download; Submission Center; QMS) reached an inspector. Absent on exports
   * sealed before VR-02.
   */
  sources?: { audit_events: number; audit_logs: number };
  /**
   * The verdict on the tenant's audit_logs chain. `chainIntegrity` above is
   * about audit_events only and says nothing of these rows. Without a verifier
   * this is 'unverified' with a reason, never 'intact'. Absent before VR-02.
   */
  auditLogsChain?: {
    status: 'intact' | 'broken' | 'unverified' | 'unavailable';
    rowsChecked?: number;
    legacyRows?: number;
    sequencedRows?: number;
    brokenAt?: string;
    verifiedAt: string;
    reason?: string;
  };
  compliance: {
    standard: string;
    section: string;
    description: string;
  };
}

// ---------------------------------------------------------------------------
// SIGNING KEY
// ---------------------------------------------------------------------------

function getSigningKey(): string {
  const key = process.env.AUDIT_EXPORT_SIGNING_KEY
    || process.env.JWT_SECRET_PROD
    || process.env.JWT_SECRET;
  if (!key) {
    throw new Error(
      'No signing key configured. Set AUDIT_EXPORT_SIGNING_KEY, JWT_SECRET_PROD, or JWT_SECRET. ' +
      'Refusing to sign with a default key per 21 CFR Part 11 §11.10(e).'
    );
  }
  return key;
}

function hmacSign(data: string): string {
  return crypto
    .createHmac('sha256', getSigningKey())
    .update(data, 'utf8')
    .digest('hex');
}

/**
 * Canonicalize a manifest for signing, by the version that sealed it.
 *
 * ── What version 1 did, and why it is kept ──────────────────────────────────
 * `JSON.stringify(manifest, Object.keys(manifest).sort())` reads as "stringify
 * with sorted keys" and is not that. The second argument is a replacer ARRAY —
 * a key allow-list applied at every depth, whose order `JSON.stringify` ignores.
 * No nested key name also appears at the top level, so `queryFilters`,
 * `chainIntegrity` and `compliance` each serialized to `{}`. The signature
 * therefore covered none of them: an export for one date range with an intact
 * chain and an export for another with `chainIntegrity.status: 'broken'`
 * produced byte-identical signed manifests, so a broken chain could be
 * presented as an intact one without invalidating the signature. `dataHash` is
 * top level and WAS covered, so modification of the exported rows always
 * remained detectable — the gap was the manifest's claims about itself.
 *
 * Version 1 stays here, frozen and reachable only from the verify path, because
 * exports already issued were signed with it. Deleting it would not fix those
 * signatures; it would make them unverifiable, which is worse. It must never be
 * called on a write path.
 *
 * ── Version 2 ───────────────────────────────────────────────────────────────
 * The one canonicalizer in `shared/canonical-json.ts`, which sorts keys at
 * every depth and drops nothing.
 */
export function canonicalizeManifest(manifest: ExportManifest): string {
  if (manifest.manifestVersion === 2) return stableStringify(manifest);
  // No marker means an export sealed before L55 was fixed. Reproduce the
  // original expression exactly — including its defect — so the signature it
  // produced still verifies.
  return JSON.stringify(manifest, Object.keys(manifest).sort());
}

function sha256(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// CHAIN INTEGRITY SNAPSHOT
// ---------------------------------------------------------------------------

async function snapshotChainIntegrity(
  pool: Pick<Pool, 'query'>,
  organizationId?: number
): Promise<ExportManifest['chainIntegrity']> {
  try {
    const orgFilter = organizationId ? `WHERE organization_id = $1` : '';
    const params = organizationId ? [organizationId] : [];

    const { rows } = await pool.query(
      `SELECT id, organization_id, sequence_number, event_type, entity_type,
              entity_id, user_id, user_name, timestamp, reason,
              record_hash, previous_hash
       FROM audit_events ${orgFilter}
       ORDER BY organization_id, sequence_number ASC`,
      params
    );

    const verifiedAt = new Date().toISOString();
    if (rows.length === 0) {
      // Nothing to verify is not "verified".
      return {
        status: 'unverified',
        totalEntries: 0,
        hashedEntries: 0,
        unhashedEntries: 0,
        brokenLinks: 0,
        verifiedAt,
        reason: 'no entries: there is no chain to verify',
      };
    }

    let brokenLinks = 0;
    let hashedEntries = 0;
    let unhashedEntries = 0;
    const prevHashByOrg: Record<number, string | null> = {};

    for (const row of rows) {
      const oid = row.organization_id;
      const prevHash = prevHashByOrg[oid] ?? null;

      if (!row.record_hash) {
        // A row that was never hashed cannot be a link in the chain. The
        // hash-chain trigger (db/migrations/20260222_audit_events_hash_chain.sql)
        // is not in C2C_MIGRATION_FILES, so on a canonically-provisioned
        // database every row is like this — and this loop used to skip them
        // all and report 'intact' over a chain in which nothing was checked.
        unhashedEntries++;
        prevHashByOrg[oid] = null;
        continue;
      }
      hashedEntries++;
      if (row.previous_hash !== prevHash && prevHash !== null && row.previous_hash !== null) {
        brokenLinks++;
      }
      prevHashByOrg[oid] = row.record_hash;
    }

    if (brokenLinks > 0) {
      return { status: 'broken', totalEntries: rows.length, hashedEntries, unhashedEntries, brokenLinks, verifiedAt };
    }
    if (hashedEntries === 0) {
      return {
        status: 'unverified',
        totalEntries: rows.length,
        hashedEntries,
        unhashedEntries,
        brokenLinks: 0,
        verifiedAt,
        reason: 'no row carries a record_hash: the chain has never been hashed, so no link could be checked',
      };
    }
    if (unhashedEntries > 0) {
      return {
        status: 'unverified',
        totalEntries: rows.length,
        hashedEntries,
        unhashedEntries,
        brokenLinks: 0,
        verifiedAt,
        reason: `${unhashedEntries} of ${rows.length} rows carry no record_hash; the links through them could not be checked`,
      };
    }
    return { status: 'intact', totalEntries: rows.length, hashedEntries, unhashedEntries: 0, brokenLinks: 0, verifiedAt };
  } catch (err) {
    // The honest branch, unchanged in meaning: the query did not run.
    return {
      status: 'unavailable',
      totalEntries: 0,
      brokenLinks: 0,
      verifiedAt: new Date().toISOString(),
      reason: describeFailure(err),
    };
  }
}

// ---------------------------------------------------------------------------
// QUERY AUDIT DATA
// ---------------------------------------------------------------------------

/** What the export reads with: a Pool, or a client inside a tenant-stamped transaction. */
type Queryable = Pick<Pool, 'query'>;

export interface AuditExportDeps {
  /** The tenant audit_logs chain verdict (services/audit/tenant-chain-verdict.ts). */
  verifyAuditLogsChain?: (orgId: number) => Promise<ChainVerificationResult>;
}

const EXPORT_ROW_LIMIT = 50000;

/**
 * The tenant's audit_logs rows, in the same row shape as audit_events so one
 * file carries both, each labelled by source. Every row is included, chained or
 * not: a complete copy (§11.10(b)) does not drop the rows a chain cannot vouch
 * for, it says which they are (sha256_chain / chain_seq NULL).
 */
async function queryAuditLogs(pool: Queryable, req: AuditExportRequest) {
  const params: unknown[] = [req.organizationId];
  const cond: string[] = ['a.tenant_id = $1'];
  if (req.eventType) { params.push(req.eventType); cond.push(`a.action = $${params.length}`); }
  if (req.userId) { params.push(req.userId); cond.push(`COALESCE(a.actor_id, a.user_id) = $${params.length}`); }
  if (req.startDate) { params.push(new Date(req.startDate)); cond.push(`COALESCE(a.occurred_at, a.created_at) >= $${params.length}`); }
  if (req.endDate) { params.push(new Date(req.endDate)); cond.push(`COALESCE(a.occurred_at, a.created_at) <= $${params.length}`); }
  if (req.resourceType) { params.push(req.resourceType); cond.push(`a.table_name = $${params.length}`); }
  if (req.recordIds?.length) { params.push(req.recordIds); cond.push(`a.record_id = ANY($${params.length}::text[])`); }
  params.push(EXPORT_ROW_LIMIT + 1);
  const { rows } = await pool.query(
    `SELECT a.id::text AS id, a.tenant_id AS organization_id, a.action AS event_type,
            a.table_name AS entity_type, a.record_id AS entity_id,
            COALESCE(a.actor_id, a.user_id) AS user_id, a.ip_address,
            COALESCE(a.occurred_at, a.created_at) AS timestamp, a.reason, a.target,
            a.payload_hash, a.sha256_chain, a.chain_seq, a.hmac_seal
       FROM audit_logs a
      WHERE ${cond.join(' AND ')}
      ORDER BY COALESCE(a.occurred_at, a.created_at) ASC, a.chain_seq ASC NULLS FIRST, a.id ASC
      LIMIT $${params.length}`,
    params,
  );
  const truncated = rows.length > EXPORT_ROW_LIMIT;
  if (truncated) rows.length = EXPORT_ROW_LIMIT;
  return { rows: rows.map((r: Record<string, unknown>) => ({ source: 'audit_logs', ...r })), truncated };
}

async function queryAuditData(pool: Queryable, req: AuditExportRequest) {
  const events = await queryAuditEvents(pool, req);
  const logs = await queryAuditLogs(pool, req);
  const at = (r: Record<string, unknown>) => new Date(String(r.timestamp)).getTime() || 0;
  const merged = [...events.rows, ...logs.rows].sort((a, b) => at(a) - at(b));
  const truncated = events.truncated || logs.truncated || merged.length > EXPORT_ROW_LIMIT;
  if (merged.length > EXPORT_ROW_LIMIT) merged.length = EXPORT_ROW_LIMIT;
  return {
    rows: merged,
    truncated,
    sources: {
      audit_events: merged.filter((r) => r.source === 'audit_events').length,
      audit_logs: merged.filter((r) => r.source === 'audit_logs').length,
    },
  };
}

async function queryAuditEvents(pool: Queryable, req: AuditExportRequest) {
  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (req.organizationId) {
    conditions.push(`organization_id = $${idx++}`);
    params.push(req.organizationId);
  }
  if (req.eventType) {
    conditions.push(`event_type = $${idx++}`);
    params.push(req.eventType);
  }
  if (req.userId) {
    conditions.push(`user_id = $${idx++}`);
    params.push(req.userId);
  }
  if (req.startDate) {
    conditions.push(`timestamp >= $${idx++}`);
    params.push(new Date(req.startDate));
  }
  if (req.endDate) {
    conditions.push(`timestamp <= $${idx++}`);
    params.push(new Date(req.endDate));
  }
  if (req.resourceType) {
    conditions.push(`entity_type = $${idx++}`);
    params.push(req.resourceType);
  }
  if (req.recordIds?.length) {
    conditions.push(`entity_id::text = ANY($${idx++}::text[])`);
    params.push(req.recordIds);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT id, organization_id, event_type, entity_type, entity_id,
            user_id, user_name, user_role, ip_address, timestamp,
            reason, comments, regulatory_significant, gxp_relevant,
            record_hash, previous_hash, sequence_number, created_at
     FROM audit_events ${where}
     ORDER BY timestamp ASC
     LIMIT 50001`,
    params
  );

  const truncated = rows.length > EXPORT_ROW_LIMIT;
  if (truncated) {
    rows.length = EXPORT_ROW_LIMIT; // trim to exact limit
  }

  return { rows: rows.map((r: Record<string, unknown>) => ({ source: 'audit_events', ...r })), truncated };
}

/** The audit_logs chain verdict for the manifest. A missing verifier is 'unverified', never 'intact'. */
async function auditLogsChainVerdict(
  orgId: number | undefined,
  verify: AuditExportDeps['verifyAuditLogsChain'],
): Promise<NonNullable<ExportManifest['auditLogsChain']>> {
  const verifiedAt = new Date().toISOString();
  if (!verify || orgId == null) {
    return { status: 'unverified', verifiedAt, reason: 'no audit_logs chain verifier was supplied to this export' };
  }
  try {
    const v = await verify(orgId);
    return {
      status: v.ok ? 'intact' : 'broken',
      rowsChecked: v.rowsChecked,
      legacyRows: v.legacyRows,
      sequencedRows: v.sequencedRows,
      ...(v.brokenAt ? { brokenAt: String(v.brokenAt) } : {}),
      verifiedAt,
    };
  } catch (err) {
    return { status: 'unavailable', verifiedAt, reason: describeFailure(err) };
  }
}

// ---------------------------------------------------------------------------
// FORMAT DATA
// ---------------------------------------------------------------------------

function sanitizeCsvValue(val: unknown): string {
  const str = String(val ?? '');
  // Prevent CSV injection: prefix formula-triggering characters with a single quote
  if (/^[=+\-@\t\r]/.test(str)) {
    return `"'${str.replace(/"/g, '""')}"`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

function formatCSV(rows: any[]): string {
  const headers = [
    'source', 'id', 'timestamp', 'organization_id', 'event_type', 'entity_type', 'entity_id',
    'user_id', 'user_name', 'user_role', 'ip_address', 'reason',
    'regulatory_significant', 'gxp_relevant',
    'record_hash', 'previous_hash', 'sequence_number',
    'sha256_chain', 'chain_seq', 'hmac_seal', 'payload_hash', 'target',
  ];

  const csvRows = rows.map(row =>
    headers.map(h => sanitizeCsvValue(row[h])).join(',')
  );

  return [headers.join(','), ...csvRows].join('\n');
}

function formatJSON(rows: any[]): string {
  return JSON.stringify(rows, null, 2);
}

// ---------------------------------------------------------------------------
// MAIN EXPORT FUNCTION
// ---------------------------------------------------------------------------

/**
 * Generate a signed, tamper-evident audit export.
 *
 * Returns the data payload, an integrity manifest, and an HMAC signature.
 * The signature can be verified by anyone with the signing key to prove
 * the export has not been modified since generation.
 */
export async function generateSignedAuditExport(
  pool: Queryable,
  request: AuditExportRequest,
  deps: AuditExportDeps = {},
): Promise<SignedAuditExport> {
  // 1. Query data — both chained stores, each row labelled by source.
  const { rows, truncated, sources } = await queryAuditData(pool, request);

  // 2. Format
  const data = request.format === 'csv' ? formatCSV(rows) : formatJSON(rows);
  const dataHash = sha256(data);

  // 3. Snapshot chain integrity at time of export
  const chainIntegrity = await snapshotChainIntegrity(pool, request.organizationId);
  const auditLogsChain = await auditLogsChainVerdict(request.organizationId, deps.verifyAuditLogsChain);

  // 4. Record the export in the audit trail — BEFORE the manifest is sealed,
  //    so the signature covers the record's id, and refusing outright when
  //    the row cannot be written (WO-16B finding 26). This INSERT used to run
  //    after signing, put the export id (a string) into
  //    `audit_events.entity_id integer NOT NULL`, fail 22P02 on every call,
  //    and be swallowed — so no export was ever recorded and every manifest
  //    was sealed as if it had been. The signing key is resolved first so the
  //    only step after the row lands is deterministic.
  getSigningKey();
  const exportId = `AUDIT-EXPORT-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  if (request.organizationId == null || !Number.isFinite(Number(request.organizationId))) {
    throw new VerificationUnavailableError(
      'audit-export record',
      'no organisation id: audit_events.organization_id is NOT NULL and an export must be attributable to a tenant',
    );
  }
  let exportAuditEventId: number;
  try {
    const recorded = await pool.query(
      `INSERT INTO audit_events
        (organization_id, event_type, entity_type, entity_id, user_id, user_name,
         user_role, ip_address, timestamp, reason, metadata, regulatory_significant, gxp_relevant)
       VALUES ($1, 'audit.export', 'audit_export', $2, $3, $4, $5, $6, NOW(), $7, $8, true, true)
       RETURNING id`,
      [
        Number(request.organizationId),
        // entity_id is integer NOT NULL and an export has no integer entity;
        // 0 is the repository's convention for "no entity" (ivdr-pack-worker,
        // orchestration-checkpoints). The export id is in reason and metadata.
        0,
        Number.isFinite(Number(request.exportedBy)) ? Number(request.exportedBy) : null,
        request.exportedBy,
        request.exportedByRole || 'unknown',
        request.ipAddress || 'unknown',
        `Audit trail export ${exportId}: ${rows.length} records, format=${request.format}`,
        JSON.stringify({
          exportId,
          dataHash,
          chainIntegrityAtExport: chainIntegrity.status,
          auditLogsChainAtExport: auditLogsChain.status,
          sources,
          filters: {
            organizationId: request.organizationId,
            startDate: request.startDate,
            endDate: request.endDate,
            eventType: request.eventType,
            userId: request.userId,
            resourceType: request.resourceType,
            recordIds: request.recordIds,
          },
        }),
      ]
    );
    const id = Number((recorded.rows[0] as { id?: unknown } | undefined)?.id);
    if (!Number.isInteger(id)) {
      throw new VerificationUnavailableError('audit-export record', 'INSERT returned no row id');
    }
    exportAuditEventId = id;
  } catch (err) {
    if (isVerificationUnavailable(err)) throw err;
    console.error('[SignedExport] refusing: the export could not be recorded in the audit trail:', describeFailure(err));
    throw new VerificationUnavailableError('audit-export record', describeFailure(err));
  }

  // 5. Build manifest
  const manifest: ExportManifest = {
    exportId,
    exportedAt: new Date().toISOString(),
    exportedBy: request.exportedBy,
    exportedByRole: request.exportedByRole || 'unknown',
    exportSource: 'Concept2Cure / Concept2Cure Platform',
    queryFilters: {
      organizationId: request.organizationId,
      startDate: request.startDate,
      endDate: request.endDate,
      eventType: request.eventType,
      userId: request.userId,
      resourceType: request.resourceType,
      recordIds: request.recordIds,
    },
    format: request.format,
    rowCount: rows.length,
    truncated,
    dataHash,
    hashAlgorithm: 'SHA-256',
    manifestVersion: 2,
    chainIntegrity,
    auditLogsChain,
    sources,
    exportRecord: { auditEventId: exportAuditEventId },
    compliance: {
      standard: '21 CFR Part 11',
      section: '§11.10(e)',
      description: 'Tamper-evident audit trail export with cryptographic integrity verification',
    },
  };

  // 6. Sign manifest — every field, at every depth (L55), the export record included.
  const canonicalManifest = canonicalizeManifest(manifest);
  const signature = hmacSign(canonicalManifest);

  // 7. Build filename
  const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const filename = `audit_export_${ts}_${exportId.substring(exportId.length - 8)}.${request.format}`;

  return {
    data,
    contentType: request.format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
    filename,
    manifest,
    signature,
  };
}

/**
 * Verify the integrity of a previously exported audit package.
 *
 * Given the raw data and its manifest+signature, re-computes the data hash
 * and verifies the HMAC signature to confirm nothing has been altered.
 */
export function verifySignedAuditExport(
  data: string,
  manifest: ExportManifest,
  signature: string
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 1. Verify data hash
  const computedDataHash = sha256(data);
  if (computedDataHash !== manifest.dataHash) {
    errors.push('Data hash mismatch — export data has been modified');
  }

  // 2. Verify manifest signature, using the serializer that sealed it.
  const canonicalManifest = canonicalizeManifest(manifest);
  const expectedSignature = hmacSign(canonicalManifest);
  if (signature !== expectedSignature) {
    errors.push('Manifest signature invalid — manifest or signing key has been altered');
  }

  return { valid: errors.length === 0, errors };
}
