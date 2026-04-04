/**
 * Artifact–Document Bridge Service
 * Version: 1.0.0
 *
 * Documents the relationship between the two document tables in the system:
 *
 * 1. `concept2cure_artifacts` — Canonical table for regulatory content identity.
 *    Holds drafts, versions, provenance, and section-level content. This is the
 *    primary production table for the Concept2Cure product.
 *
 * 2. `documents` — Generic document records with compliance tracking. Used for
 *    access control, validation status, encryption metadata, and audit trails.
 *
 * Relationship: The tables share `project_id` + `organization_id` scope but
 * operate independently — there is no foreign key between them. Artifacts own
 * the regulatory content lifecycle; documents own compliance metadata.
 */

export const DOCUMENT_IDENTITY_VERSION = '2.0.0';

export function getCanonicalDocumentIdentity() {
  return {
    canonical: 'concept2cureArtifacts' as const,
    canonicalIdField: 'artifactId' as const,
    secondaryTable: 'documents' as const,
    relationship: 'optional_fk_bridge' as const,
    bridge: 'documents.artifact_id → concept2cure_artifacts.artifact_id (nullable)',
  };
}

/**
 * Link a document record to its source artifact.
 * Sets the artifact_id column on the documents table (added in migration 0015).
 */
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
  } catch {
    return false;
  }
}

/**
 * Find documents linked to a specific artifact.
 */
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

export async function getArtifactDocumentMapping(
  projectId: number,
  organizationId: number,
) {
  const { pool } = await import('../db.js');

  let artifactCount = 0;
  let documentCount = 0;

  try {
    const artifactResult = await pool.query(
      `SELECT COUNT(*)::int AS count FROM concept2cure_artifacts
       WHERE project_id = $1 AND organization_id = $2`,
      [projectId, organizationId],
    );
    artifactCount = artifactResult.rows[0]?.count ?? 0;
  } catch {
    // Table may not exist — degrade gracefully
  }

  try {
    const documentResult = await pool.query(
      `SELECT COUNT(*)::int AS count FROM documents
       WHERE project_id = $1 AND organization_id = $2`,
      [projectId, organizationId],
    );
    documentCount = documentResult.rows[0]?.count ?? 0;
  } catch {
    // Table may not exist — degrade gracefully
  }

  return {
    artifacts: artifactCount,
    documents: documentCount,
    projectId,
    organizationId,
    canonicalTable: 'concept2cureArtifacts' as const,
  };
}
