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

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

export interface AuditExportRequest {
  organizationId?: number;
  startDate?: string;
  endDate?: string;
  eventType?: string;
  userId?: number;
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
  chainIntegrity: {
    status: 'intact' | 'broken' | 'unavailable';
    totalEntries: number;
    brokenLinks: number;
    verifiedAt: string;
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

function sha256(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// CHAIN INTEGRITY SNAPSHOT
// ---------------------------------------------------------------------------

async function snapshotChainIntegrity(
  pool: Pool,
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

    if (rows.length === 0) {
      return { status: 'intact', totalEntries: 0, brokenLinks: 0, verifiedAt: new Date().toISOString() };
    }

    let brokenLinks = 0;
    const prevHashByOrg: Record<number, string> = {};

    for (const row of rows) {
      const oid = row.organization_id;
      const prevHash = prevHashByOrg[oid] || null;

      if (row.previous_hash !== prevHash && prevHash !== null && row.previous_hash !== null) {
        brokenLinks++;
      }
      prevHashByOrg[oid] = row.record_hash;
    }

    return {
      status: brokenLinks === 0 ? 'intact' : 'broken',
      totalEntries: rows.length,
      brokenLinks,
      verifiedAt: new Date().toISOString(),
    };
  } catch {
    return { status: 'unavailable', totalEntries: 0, brokenLinks: 0, verifiedAt: new Date().toISOString() };
  }
}

// ---------------------------------------------------------------------------
// QUERY AUDIT DATA
// ---------------------------------------------------------------------------

async function queryAuditData(pool: Pool, req: AuditExportRequest) {
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

  const truncated = rows.length > 50000;
  if (truncated) {
    rows.length = 50000; // trim to exact limit
  }

  return { rows, truncated };
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
    'id', 'timestamp', 'organization_id', 'event_type', 'entity_type', 'entity_id',
    'user_id', 'user_name', 'user_role', 'ip_address', 'reason',
    'regulatory_significant', 'gxp_relevant',
    'record_hash', 'previous_hash', 'sequence_number',
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
  pool: Pool,
  request: AuditExportRequest
): Promise<SignedAuditExport> {
  // 1. Query data
  const { rows, truncated } = await queryAuditData(pool, request);

  // 2. Format
  const data = request.format === 'csv' ? formatCSV(rows) : formatJSON(rows);
  const dataHash = sha256(data);

  // 3. Snapshot chain integrity at time of export
  const chainIntegrity = await snapshotChainIntegrity(pool, request.organizationId);

  // 4. Build manifest
  const exportId = `AUDIT-EXPORT-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
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
    },
    format: request.format,
    rowCount: rows.length,
    truncated,
    dataHash,
    hashAlgorithm: 'SHA-256',
    chainIntegrity,
    compliance: {
      standard: '21 CFR Part 11',
      section: '§11.10(e)',
      description: 'Tamper-evident audit trail export with cryptographic integrity verification',
    },
  };

  // 5. Sign manifest
  const canonicalManifest = JSON.stringify(manifest, Object.keys(manifest).sort());
  const signature = hmacSign(canonicalManifest);

  // 6. Build filename
  const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const filename = `audit_export_${ts}_${exportId.substring(exportId.length - 8)}.${request.format}`;

  // 7. Record the export event itself in audit trail
  try {
    await pool.query(
      `INSERT INTO audit_events
        (organization_id, event_type, entity_type, entity_id, user_id, user_name,
         user_role, ip_address, timestamp, reason, metadata, regulatory_significant, gxp_relevant)
       VALUES ($1, 'audit.export', 'audit_export', $2, $3, $4, $5, $6, NOW(), $7, $8, true, true)`,
      [
        request.organizationId ?? null,
        exportId,
        request.exportedBy,
        request.exportedBy,
        request.exportedByRole || 'unknown',
        request.ipAddress || 'unknown',
        `Audit trail exported: ${rows.length} records, format=${request.format}`,
        JSON.stringify({
          dataHash,
          signature: signature.substring(0, 16) + '...',
          chainIntegrityAtExport: chainIntegrity.status,
          filters: manifest.queryFilters,
        }),
      ]
    );
  } catch (err: any) {
    console.error('[SignedExport] Failed to log export event:', err.message);
  }

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

  // 2. Verify manifest signature
  const canonicalManifest = JSON.stringify(manifest, Object.keys(manifest).sort());
  const expectedSignature = hmacSign(canonicalManifest);
  if (signature !== expectedSignature) {
    errors.push('Manifest signature invalid — manifest or signing key has been altered');
  }

  return { valid: errors.length === 0, errors };
}
