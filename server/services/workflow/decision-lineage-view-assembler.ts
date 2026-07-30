/**
 * Assemble the v2 DecisionLineage surface's list of governed decision trails from the
 * REAL workflow + audit store — NOT the seed-only c2c_decision_lineage blob.
 *
 * The per-artifact graph is already real: decisionLineageService.getLineageGraph()
 * traverses the org's document_workflows / workflow_approvals / workflow_history /
 * document_audit_logs + the hash-chained audit_logs to build the exact LineageGraph the
 * surface renders (nodes, edges, metadata — with real approvers, statuses, signature
 * state, and chain verification). What was missing was the LIST: the surface reads a
 * useLiveRows list of one graph per artifact, and that list came from the blob. This
 * assembler enumerates the org's real artifacts that actually have a decision trail and
 * builds each graph through the same real service, adding the surface's `artifactLabel`
 * (the document title). No blob, no fabrication: an artifact with no recorded trail is
 * omitted, and an org with none returns [] (the surface shows its honest empty state).
 */
import { pool } from '../../db';
import { decisionLineageService } from './DecisionLineageService';

const MAX_ARTIFACTS = 25;

/**
 * Assemble every governed artifact's real decision-lineage graph for the org, newest
 * first. Returns [] when the org has no artifact with a recorded trail.
 */
export async function assembleOrgDecisionLineage(orgId: number): Promise<Record<string, unknown>[]> {
  // Enumerate the org's documents that actually have a decision trail (a workflow or an
  // audit-logged action). Org scope comes from the owning document.
  const { rows } = await pool.query(
    `SELECT d.id, d.title
       FROM unified_documents d
      WHERE d.organization_id = $1
        AND (
          EXISTS (SELECT 1 FROM document_workflows w WHERE w.document_id = d.id)
          OR EXISTS (SELECT 1 FROM document_audit_logs a WHERE a.document_id = d.id)
        )
      ORDER BY d.updated_at DESC NULLS LAST, d.id DESC
      LIMIT $2`,
    [orgId, MAX_ARTIFACTS],
  );
  const docs = rows as Array<{ id: number; title: string }>;
  if (docs.length === 0) return [];

  const graphs = await Promise.all(
    docs.map(async (d) => {
      const graph = await decisionLineageService.getLineageGraph('artifact', Number(d.id), orgId);
      // Only surface artifacts that actually resolved to a trail (honest — no empty cards).
      if (!graph.nodes || graph.nodes.length === 0) return null;
      return { ...graph, artifactLabel: d.title } as Record<string, unknown>;
    }),
  );
  return graphs.filter((g): g is Record<string, unknown> => g !== null);
}
