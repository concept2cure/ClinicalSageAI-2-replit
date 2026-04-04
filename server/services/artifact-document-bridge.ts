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

export const DOCUMENT_IDENTITY_VERSION = '1.0.0';

export function getCanonicalDocumentIdentity() {
  return {
    canonical: 'concept2cureArtifacts' as const,
    canonicalIdField: 'artifactId' as const,
    secondaryTable: 'documents' as const,
    relationship: 'independent_same_project_scope' as const,
    bridge: 'project_id + organization_id' as const,
  };
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
