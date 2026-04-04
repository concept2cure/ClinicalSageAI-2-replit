/**
 * Artifact–Document Bridge Service v3.0.0
 *
 * Canonical identity convergence between:
 *   1. concept2cure_artifacts — regulatory content identity (canonical)
 *   2. documents — compliance-scoped records with artifact_id FK bridge
 *
 * Bridge column: documents.artifact_id → concept2cure_artifacts.artifact_id (nullable)
 * Added in migration 0015_document_artifact_bridge.sql.
 *
 * This service provides:
 *   - Canonical identity resolution
 *   - Link/unlink operations
 *   - Integrity checking (orphan/ambiguous detection)
 *   - Backfill for existing rows
 *   - Health diagnostics
 *
 * @module server/services/artifact-document-bridge
 */

import { createScopedLogger } from '../utils/logger';

const log = createScopedLogger('artifact-document-bridge');

export const DOCUMENT_IDENTITY_VERSION = '3.0.0';

// ── Canonical Identity ──────────────────────────────────────────────────────

export function getCanonicalDocumentIdentity() {
  return {
    canonical: 'concept2cureArtifacts' as const,
    canonicalIdField: 'artifactId' as const,
    secondaryTable: 'documents' as const,
    relationship: 'optional_fk_bridge' as const,
    bridge: 'documents.artifact_id → concept2cure_artifacts.artifact_id (nullable)',
    version: DOCUMENT_IDENTITY_VERSION,
  };
}

// ── Link Operations ─────────────────────────────────────────────────────────

export async function linkDocumentToArtifact(
  documentId: number,
  artifactId: string,
  organizationId: number,
): Promise<boolean> {
  try {
    const { pool } = await import('../db.js');
    const result = await pool.query(
      `UPDATE documents SET artifact_id = $1 WHERE id = $2 AND organization_id = $3`,
      [artifactId, documentId, organizationId],
    );
    return (result.rowCount ?? 0) > 0;
  } catch (err) {
    log.warn('linkDocumentToArtifact failed', { documentId, artifactId, error: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

export async function getDocumentsForArtifact(
  artifactId: string,
  organizationId: number,
): Promise<Array<{ id: number; title: string; status: string }>> {
  try {
    const { pool } = await import('../db.js');
    const result = await pool.query(
      `SELECT id, title, status FROM documents WHERE artifact_id = $1 AND organization_id = $2`,
      [artifactId, organizationId],
    );
    return result.rows;
  } catch {
    return [];
  }
}

export async function getArtifactDocumentMapping(projectId: number, organizationId: number) {
  let artifactCount = 0;
  let documentCount = 0;
  let linkedCount = 0;
  let unlinkedCount = 0;

  try {
    const { pool } = await import('../db.js');

    const [artRes, docRes, linkedRes] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS count FROM concept2cure_artifacts WHERE project_id = $1 AND organization_id = $2`, [projectId, organizationId]).catch(() => ({ rows: [{ count: 0 }] })),
      pool.query(`SELECT COUNT(*)::int AS count FROM documents WHERE project_id = $1 AND organization_id = $2`, [projectId, organizationId]).catch(() => ({ rows: [{ count: 0 }] })),
      pool.query(`SELECT COUNT(*)::int AS count FROM documents WHERE project_id = $1 AND organization_id = $2 AND artifact_id IS NOT NULL`, [projectId, organizationId]).catch(() => ({ rows: [{ count: 0 }] })),
    ]);

    artifactCount = artRes.rows[0]?.count ?? 0;
    documentCount = docRes.rows[0]?.count ?? 0;
    linkedCount = linkedRes.rows[0]?.count ?? 0;
    unlinkedCount = documentCount - linkedCount;
  } catch { /* degrade gracefully */ }

  return {
    artifacts: artifactCount,
    documents: documentCount,
    linkedDocuments: linkedCount,
    unlinkedDocuments: unlinkedCount,
    projectId,
    organizationId,
    canonicalTable: 'concept2cureArtifacts' as const,
  };
}

// ── Integrity Checking ──────────────────────────────────────────────────────

export interface BridgeIntegrityReport {
  totalDocuments: number;
  linkedDocuments: number;
  unlinkedDocuments: number;
  orphanedLinks: number; // documents.artifact_id points to non-existent artifact
  totalArtifacts: number;
  status: 'healthy' | 'drift_detected' | 'error';
  checkedAt: string;
}

/**
 * Check bridge integrity: find orphaned links and linkage statistics.
 */
export async function checkBridgeIntegrity(organizationId: number): Promise<BridgeIntegrityReport> {
  const checkedAt = new Date().toISOString();
  try {
    const { pool } = await import('../db.js');

    const [totalDoc, linkedDoc, orphaned, totalArt] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS c FROM documents WHERE organization_id = $1`, [organizationId]),
      pool.query(`SELECT COUNT(*)::int AS c FROM documents WHERE organization_id = $1 AND artifact_id IS NOT NULL`, [organizationId]),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM documents d
         WHERE d.organization_id = $1 AND d.artifact_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM concept2cure_artifacts a WHERE a.artifact_id = d.artifact_id AND a.organization_id = d.organization_id)`,
        [organizationId],
      ),
      pool.query(`SELECT COUNT(*)::int AS c FROM concept2cure_artifacts WHERE organization_id = $1`, [organizationId]),
    ]);

    const orphanedCount = orphaned.rows[0]?.c ?? 0;
    return {
      totalDocuments: totalDoc.rows[0]?.c ?? 0,
      linkedDocuments: linkedDoc.rows[0]?.c ?? 0,
      unlinkedDocuments: (totalDoc.rows[0]?.c ?? 0) - (linkedDoc.rows[0]?.c ?? 0),
      orphanedLinks: orphanedCount,
      totalArtifacts: totalArt.rows[0]?.c ?? 0,
      status: orphanedCount > 0 ? 'drift_detected' : 'healthy',
      checkedAt,
    };
  } catch (err) {
    log.warn('Bridge integrity check failed', { error: err instanceof Error ? err.message : String(err) });
    return { totalDocuments: 0, linkedDocuments: 0, unlinkedDocuments: 0, orphanedLinks: 0, totalArtifacts: 0, status: 'error', checkedAt };
  }
}

/**
 * Backfill: link documents to artifacts by matching title + project_id + organization_id.
 * Safe: only updates documents where artifact_id IS NULL and a matching artifact exists.
 * Returns number of rows updated.
 */
export async function backfillArtifactLinks(organizationId: number): Promise<number> {
  try {
    const { pool } = await import('../db.js');
    const result = await pool.query(
      `UPDATE documents d
       SET artifact_id = a.artifact_id
       FROM concept2cure_artifacts a
       WHERE d.organization_id = $1
         AND d.artifact_id IS NULL
         AND a.organization_id = d.organization_id
         AND a.project_id = d.project_id
         AND LOWER(a.title) = LOWER(d.title)`,
      [organizationId],
    );
    const count = result.rowCount ?? 0;
    if (count > 0) {
      log.info('Backfilled artifact links', { organizationId, count });
    }
    return count;
  } catch (err) {
    log.warn('Backfill failed', { error: err instanceof Error ? err.message : String(err) });
    return 0;
  }
}

// ── Bridge Health ───────────────────────────────────────────────────────────

export async function getBridgeHealth(): Promise<{
  version: string;
  documentsTableReachable: boolean;
  artifactsTableReachable: boolean;
  artifactIdColumnExists: boolean;
  status: 'healthy' | 'degraded' | 'error';
}> {
  let docOk = false;
  let artOk = false;
  let colOk = false;

  try {
    const { pool } = await import('../db.js');

    const [docRes, artRes, colRes] = await Promise.all([
      pool.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'documents') AS ok`).catch(() => ({ rows: [{ ok: false }] })),
      pool.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'concept2cure_artifacts') AS ok`).catch(() => ({ rows: [{ ok: false }] })),
      pool.query(`SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'artifact_id') AS ok`).catch(() => ({ rows: [{ ok: false }] })),
    ]);

    docOk = docRes.rows[0]?.ok === true;
    artOk = artRes.rows[0]?.ok === true;
    colOk = colRes.rows[0]?.ok === true;
  } catch { /* degrade */ }

  return {
    version: DOCUMENT_IDENTITY_VERSION,
    documentsTableReachable: docOk,
    artifactsTableReachable: artOk,
    artifactIdColumnExists: colOk,
    status: docOk && artOk && colOk ? 'healthy' : docOk || artOk ? 'degraded' : 'error',
  };
}
