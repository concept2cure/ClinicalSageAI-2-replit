/**
 * Cross-Module Intelligence — Relationship Detection Across Documents
 *
 * Detects and surfaces relationships, dependencies, and inconsistencies
 * across documents and regulatory modules within a project.
 *
 * Capabilities:
 *   - Cross-reference validation (does referenced section exist?)
 *   - Terminology consistency (same drug/device name used everywhere?)
 *   - Data consistency (same endpoint values across CSR, protocol, IB?)
 *   - Dependency mapping (which documents feed into which modules?)
 *
 * @module server/services/intelligence/cross-module-intelligence
 */

import { db } from '../../db.js';
import { eq, and, sql } from 'drizzle-orm';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface CrossModuleInsight {
  readonly insightId: string;
  readonly type: CrossModuleInsightType;
  readonly severity: 'critical' | 'high' | 'medium' | 'low';
  readonly sourceDocumentId: string;
  readonly sourceDocumentTitle: string;
  readonly targetDocumentId: string;
  readonly targetDocumentTitle: string;
  readonly description: string;
  readonly suggestedResolution: string;
  readonly detectedAt: string;
}

export type CrossModuleInsightType =
  | 'broken_cross_reference'
  | 'terminology_inconsistency'
  | 'data_discrepancy'
  | 'missing_dependency'
  | 'circular_reference'
  | 'stale_reference';

export interface CrossModuleReport {
  readonly projectId: number;
  readonly insights: CrossModuleInsight[];
  readonly totalInsights: number;
  readonly bySeverity: { critical: number; high: number; medium: number; low: number };
  readonly documentsCovered: number;
  readonly analyzedAt: string;
}

export interface CrossModuleContext {
  readonly organizationId: number;
  readonly projectId: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYSIS ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Analyze cross-module relationships for a project.
 */
export async function analyzeCrossModuleRelationships(
  ctx: CrossModuleContext,
): Promise<CrossModuleReport> {
  const insights: CrossModuleInsight[] = [];
  let documentsCovered = 0;

  const [staleRefs, statusGaps, orphanedDocs] = await Promise.allSettled([
    detectStaleReferences(ctx),
    detectStatusGaps(ctx),
    detectOrphanedDocuments(ctx),
  ]);

  // Fail closed on a real read failure. The detectors already swallow the only
  // legitimate empty (a missing table → []), so a REJECTED detector is an actual
  // failure — and a report that dropped it would return totalInsights lower than
  // the truth (potentially 0), which the intelligence surface reads as "all
  // modules consistent." A consistency check that could not run is unknown, not
  // clean: surface the failure (→ the caller's error path) rather than a
  // fabricated all-clear.
  for (const settled of [staleRefs, statusGaps, orphanedDocs]) {
    if (settled.status === 'rejected') throw settled.reason;
    insights.push(...settled.value);
  }

  // Count unique documents involved
  const docIds = new Set<string>();
  for (const insight of insights) {
    docIds.add(insight.sourceDocumentId);
    docIds.add(insight.targetDocumentId);
  }
  documentsCovered = docIds.size;

  // Sort by severity
  const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  insights.sort((a, b) => (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4));

  return {
    projectId: ctx.projectId,
    insights,
    totalInsights: insights.length,
    bySeverity: {
      critical: insights.filter(i => i.severity === 'critical').length,
      high: insights.filter(i => i.severity === 'high').length,
      medium: insights.filter(i => i.severity === 'medium').length,
      low: insights.filter(i => i.severity === 'low').length,
    },
    documentsCovered,
    analyzedAt: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DETECTORS
// ═══════════════════════════════════════════════════════════════════════════════

// A detector's query hits core tables (documents, evidence_links). A missing
// table (42P01) is a legitimately-unprovisioned org → a genuine "nothing to
// detect"; the detector swallows only that and returns []. Any OTHER error
// (timeout, dropped connection, JOIN failure) is a real read failure and MUST
// propagate — a swallowed failure here becomes a fabricated "0 inconsistencies /
// everything consistent" all-clear on the intelligence surface.
function rethrowUnlessMissingTable(e: unknown): void {
  if ((e as { code?: string })?.code !== '42P01') throw e;
}

/**
 * Detect documents referencing other documents that have been updated more recently.
 */
async function detectStaleReferences(
  ctx: CrossModuleContext,
): Promise<CrossModuleInsight[]> {
  const insights: CrossModuleInsight[] = [];

  try {
    // Find documents that are approved but were last updated before their
    // referenced documents were modified (indicating potential staleness)
    const result = await db.execute(sql`
      SELECT
        d1.id as source_id,
        d1.title as source_title,
        d1.updated_at as source_updated,
        d1.status as source_status,
        d2.id as target_id,
        d2.title as target_title,
        d2.updated_at as target_updated
      FROM documents d1
      JOIN documents d2 ON d2.project_id = d1.project_id
        AND d2.organization_id = d1.organization_id
        AND d2.id != d1.id
      WHERE d1.project_id = ${ctx.projectId}
        AND d1.organization_id = ${ctx.organizationId}
        AND d1.status IN ('approved', 'published')
        AND d2.status IN ('approved', 'published')
        AND d2.updated_at > d1.updated_at + INTERVAL '7 days'
        AND d1.document_type = d2.document_type
      ORDER BY d2.updated_at - d1.updated_at DESC
      LIMIT 10
    `);

    const rows = result.rows as Array<Record<string, unknown>>;
    for (const row of rows) {
      insights.push({
        insightId: `stale-ref-${row.source_id}-${row.target_id}`,
        type: 'stale_reference',
        severity: 'medium',
        sourceDocumentId: String(row.source_id),
        sourceDocumentTitle: String(row.source_title),
        targetDocumentId: String(row.target_id),
        targetDocumentTitle: String(row.target_title),
        description: `"${row.source_title}" may reference outdated content from "${row.target_title}" which was updated more recently`,
        suggestedResolution: `Review "${row.source_title}" for consistency with the latest version of "${row.target_title}"`,
        detectedAt: new Date().toISOString(),
      });
    }
  } catch (e) {
    rethrowUnlessMissingTable(e);
  }

  return insights;
}

/**
 * Detect documents in the same project with mismatched lifecycle status.
 * E.g., a published CSR referencing a draft protocol.
 */
async function detectStatusGaps(
  ctx: CrossModuleContext,
): Promise<CrossModuleInsight[]> {
  const insights: CrossModuleInsight[] = [];

  try {
    // Find approved/published documents alongside draft documents of related types
    const result = await db.execute(sql`
      SELECT
        d1.id as published_id,
        d1.title as published_title,
        d1.status as published_status,
        d1.document_type as published_type,
        d2.id as draft_id,
        d2.title as draft_title,
        d2.document_type as draft_type
      FROM documents d1
      JOIN documents d2 ON d2.project_id = d1.project_id
        AND d2.organization_id = d1.organization_id
        AND d2.id != d1.id
      WHERE d1.project_id = ${ctx.projectId}
        AND d1.organization_id = ${ctx.organizationId}
        AND d1.status IN ('approved', 'published')
        AND d2.status = 'draft'
      ORDER BY d2.updated_at ASC
      LIMIT 10
    `);

    const rows = result.rows as Array<Record<string, unknown>>;
    for (const row of rows) {
      insights.push({
        insightId: `status-gap-${row.published_id}-${row.draft_id}`,
        type: 'missing_dependency',
        severity: 'high',
        sourceDocumentId: String(row.published_id),
        sourceDocumentTitle: String(row.published_title),
        targetDocumentId: String(row.draft_id),
        targetDocumentTitle: String(row.draft_title),
        description: `"${row.published_title}" is ${row.published_status} but "${row.draft_title}" is still in draft`,
        suggestedResolution: `Complete and advance "${row.draft_title}" to match the lifecycle stage of "${row.published_title}"`,
        detectedAt: new Date().toISOString(),
      });
    }
  } catch (e) {
    rethrowUnlessMissingTable(e);
  }

  return insights;
}

/**
 * Detect documents that exist in the project but aren't linked to any
 * regulatory program module.
 */
async function detectOrphanedDocuments(
  ctx: CrossModuleContext,
): Promise<CrossModuleInsight[]> {
  const insights: CrossModuleInsight[] = [];

  try {
    const result = await db.execute(sql`
      SELECT d.id, d.title, d.document_type, d.status
      FROM documents d
      WHERE d.project_id = ${ctx.projectId}
        AND d.organization_id = ${ctx.organizationId}
        AND d.status != 'archived'
        AND NOT EXISTS (
          SELECT 1 FROM evidence_links el
          WHERE el.source_id = CAST(d.id AS TEXT)
            OR el.target_id = CAST(d.id AS TEXT)
        )
      LIMIT 10
    `);

    const rows = result.rows as Array<Record<string, unknown>>;
    for (const row of rows) {
      insights.push({
        insightId: `orphan-${row.id}`,
        type: 'missing_dependency',
        severity: 'low',
        sourceDocumentId: String(row.id),
        sourceDocumentTitle: String(row.title),
        targetDocumentId: 'project',
        targetDocumentTitle: 'Project Regulatory Program',
        description: `"${row.title}" is not linked to any regulatory program module or evidence chain`,
        suggestedResolution: `Link "${row.title}" to the appropriate eCTD module or evidence object`,
        detectedAt: new Date().toISOString(),
      });
    }
  } catch (e) {
    rethrowUnlessMissingTable(e);
  }

  return insights;
}
