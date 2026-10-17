/**
 * Cross-Module Intelligence — Relationship Detection Across Documents
 *
 * Detects and surfaces relationships, dependencies, and inconsistencies
 * across documents and regulatory modules within a project.
 *
 * What it reports, and on what basis:
 *   - documents that no recorded evidence object or evidence link names
 *     (basis 'evidence_records');
 *   - two co-occurrence observations, labelled as such at low severity:
 *     an approved/published document alongside a draft, and two approved
 *     documents of one type updated 7+ days apart (basis
 *     'co_occurrence_heuristic'). No link between those documents is
 *     recorded in the data model, so none is checked or claimed.
 *
 * 2026-10-15: every approved × draft pairing was a 'missing_dependency' at
 * 'high' and every same-type update gap a 'stale_reference' ("may reference
 * outdated content") with no relationship checked; and the unlinked-document
 * query selected evidence_links.source_id, a column no migration creates, so
 * on a provisioned schema the whole report failed with 42703.
 *
 * @module server/services/intelligence/cross-module-intelligence
 */

import { db } from '../../db.js';
import { sql } from 'drizzle-orm';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface CrossModuleInsight {
  readonly insightId: string;
  readonly type: CrossModuleInsightType;
  readonly severity: 'critical' | 'high' | 'medium' | 'low';
  /**
   * What the insight rests on: the recorded evidence objects and links, or a
   * co-occurrence observation with no link between the documents checked.
   */
  readonly basis: 'evidence_records' | 'co_occurrence_heuristic';
  readonly sourceDocumentId: string;
  readonly sourceDocumentTitle: string;
  /** The other document, when the insight is about a pair; null otherwise. */
  readonly targetDocumentId: string | null;
  readonly targetDocumentTitle: string | null;
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
  | 'stale_reference'
  | 'status_co_occurrence'
  | 'same_type_update_gap'
  | 'no_recorded_evidence_link';

export interface CrossModuleReport {
  readonly projectId: number;
  readonly insights: CrossModuleInsight[];
  readonly totalInsights: number;
  readonly bySeverity: { critical: number; high: number; medium: number; low: number };
  /** Documents named by an insight. */
  readonly documentsCovered: number;
  /** Non-archived, non-obsolete documents in the project the detectors read. */
  readonly documentsExamined: number;
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

  const [updateGaps, statusPairs, unlinkedDocs, examined] = await Promise.allSettled([
    detectSameTypeUpdateGaps(ctx),
    detectStatusCoOccurrence(ctx),
    detectDocumentsWithoutEvidenceRecords(ctx),
    countDocumentsExamined(ctx),
  ]);

  // Fail closed on a read failure, a missing table included: a report that
  // dropped a detector would return fewer insights than the truth (possibly
  // 0), which reads as "all modules consistent". A check that could not run
  // is unknown, not clean.
  for (const settled of [updateGaps, statusPairs, unlinkedDocs]) {
    if (settled.status === 'rejected') throw settled.reason;
    insights.push(...settled.value);
  }
  if (examined.status === 'rejected') throw examined.reason;

  // Count unique documents named by an insight
  const docIds = new Set<string>();
  for (const insight of insights) {
    docIds.add(insight.sourceDocumentId);
    if (insight.targetDocumentId !== null) docIds.add(insight.targetDocumentId);
  }
  const documentsCovered = docIds.size;

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
    documentsExamined: examined.value,
    analyzedAt: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DETECTORS
// ═══════════════════════════════════════════════════════════════════════════════

async function countDocumentsExamined(ctx: CrossModuleContext): Promise<number> {
  const result = await db.execute(sql`
    SELECT COUNT(*)::int AS c
    FROM documents d
    WHERE d.project_id = ${ctx.projectId}
      AND d.organization_id = ${ctx.organizationId}
      AND d.status NOT IN ('archived', 'obsolete')
  `);
  const count = (result.rows[0] as { c?: unknown } | undefined)?.c;
  if (typeof count !== 'number') throw new Error('documents count returned no row');
  return count;
}

/**
 * Two approved/published documents of one type, one updated 7+ days after
 * the other. A co-occurrence observation: no reference between them is
 * recorded, so none is checked.
 */
async function detectSameTypeUpdateGaps(
  ctx: CrossModuleContext,
): Promise<CrossModuleInsight[]> {
  const result = await db.execute(sql`
    SELECT
      d1.id as source_id,
      d1.title as source_title,
      d1.document_type as document_type,
      d2.id as target_id,
      d2.title as target_title
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
  return rows.map(row => ({
    insightId: `same-type-update-gap-${row.source_id}-${row.target_id}`,
    type: 'same_type_update_gap' as const,
    severity: 'low' as const,
    basis: 'co_occurrence_heuristic' as const,
    sourceDocumentId: String(row.source_id),
    sourceDocumentTitle: String(row.source_title),
    targetDocumentId: String(row.target_id),
    targetDocumentTitle: String(row.target_title),
    description:
      `"${row.source_title}" and "${row.target_title}" are both approved ${row.document_type} documents; ` +
      `"${row.target_title}" was updated more than 7 days later. No link between them was checked: ` +
      'this is a co-occurrence observation, not a recorded reference.',
    suggestedResolution: `If "${row.source_title}" relies on "${row.target_title}", review it against the latest version and record the link.`,
    detectedAt: new Date().toISOString(),
  }));
}

/**
 * An approved/published document alongside a draft in the same project. A
 * co-occurrence observation: no dependency between them is recorded, so
 * none is checked.
 */
async function detectStatusCoOccurrence(
  ctx: CrossModuleContext,
): Promise<CrossModuleInsight[]> {
  const result = await db.execute(sql`
    SELECT
      d1.id as published_id,
      d1.title as published_title,
      d1.status as published_status,
      d2.id as draft_id,
      d2.title as draft_title
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
  return rows.map(row => ({
    insightId: `status-co-occurrence-${row.published_id}-${row.draft_id}`,
    type: 'status_co_occurrence' as const,
    severity: 'low' as const,
    basis: 'co_occurrence_heuristic' as const,
    sourceDocumentId: String(row.published_id),
    sourceDocumentTitle: String(row.published_title),
    targetDocumentId: String(row.draft_id),
    targetDocumentTitle: String(row.draft_title),
    description:
      `"${row.published_title}" is ${row.published_status} while "${row.draft_title}" in the same project is a draft. ` +
      'No link between them was checked: this is a co-occurrence observation, not a recorded dependency.',
    suggestedResolution: `If "${row.published_title}" relies on "${row.draft_title}", record that link and bring the draft to the same stage; otherwise no action is needed.`,
    detectedAt: new Date().toISOString(),
  }));
}

/**
 * Documents in the project that no recorded evidence object names as its
 * source document and no evidence link targets as a document.
 */
async function detectDocumentsWithoutEvidenceRecords(
  ctx: CrossModuleContext,
): Promise<CrossModuleInsight[]> {
  const result = await db.execute(sql`
    SELECT d.id, d.title
    FROM documents d
    WHERE d.project_id = ${ctx.projectId}
      AND d.organization_id = ${ctx.organizationId}
      AND d.status NOT IN ('archived', 'obsolete')
      AND NOT EXISTS (
        SELECT 1 FROM evidence_objects eo
        WHERE eo.organization_id = d.organization_id
          AND eo.document_id = d.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM evidence_links el
        WHERE el.organization_id = d.organization_id
          AND el.target_type = 'document'
          AND el.target_id = CAST(d.id AS TEXT)
      )
    ORDER BY d.id
    LIMIT 10
  `);

  const rows = result.rows as Array<Record<string, unknown>>;
  return rows.map(row => ({
    insightId: `no-evidence-link-${row.id}`,
    type: 'no_recorded_evidence_link' as const,
    severity: 'low' as const,
    basis: 'evidence_records' as const,
    sourceDocumentId: String(row.id),
    sourceDocumentTitle: String(row.title),
    targetDocumentId: null,
    targetDocumentTitle: null,
    description: `No recorded evidence object names "${row.title}" as its source document, and no evidence link targets it.`,
    suggestedResolution: `Record the evidence "${row.title}" provides, or link it to what it supports.`,
    detectedAt: new Date().toISOString(),
  }));
}
