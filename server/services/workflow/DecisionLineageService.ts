/**
 * Decision Lineage Service — Immutable audit-ready decision & data lineage
 *
 * Provides a unified view of every decision in the regulatory pipeline:
 *   - Approval decisions (approve / reject / delegate)
 *   - Document state transitions (draft → review → approved → final)
 *   - Workflow step completions and escalations
 *   - Evidence linkage and traceability
 *
 * The lineage graph is:
 *   1. Immutable — backed by tamper-proof hash-chain audit log
 *   2. Reportable — exportable as JSON, CSV, and regulatory-submission XML
 *   3. Queryable — by entity, user, date range, decision type
 *   4. Compliant — FDA 21 CFR Part 11, EU Annex 11, ICH E6(R2), PMDA ERES
 *
 * @module server/services/workflow/DecisionLineageService
 * @compliance FDA 21 CFR Part 11 §11.10(e), EU Annex 11 §9, ICH E6(R2) §5.5.3
 */

import { db } from '../../db';
import { eq, and, gte, lte, desc, sql, inArray } from 'drizzle-orm';
import {
  documentWorkflows,
  workflowApprovals,
  workflowHistory,
  documentAuditLogs,
  unifiedDocuments,
} from '../../../shared/schema/unified_workflow';
import { auditLogs } from '../../../shared/schema';
import auditService from '../auditService';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('decision-lineage');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * WO-16C finding 70. The elements 21 CFR Part 11 requires an audit-trail entry
 * to carry — §11.10(e) "secure, computer-generated, time-stamped audit trails
 * to independently record … the identity of the person" and, where a signature
 * is required, §11.50 signature manifestation.
 */
export type Part11RecordElement = 'attributed-actor' | 'recorded-timestamp' | 'applied-signature';

/**
 * What ONE lineage record can honestly say about itself.
 *
 * This is deliberately NOT a compliance verdict, for the record or for the
 * system: it reports only which of the elements above are present in the row
 * the graph was built from. `COMPLETE` means "this record carries what Part 11
 * requires a record to carry", never "this decision is Part 11 compliant".
 * The field it replaced — `cfr11Compliant: true` — was a literal at all five
 * node constructors, computed from nothing, printed as a conformance assertion
 * into every export and as a badge on every node of the surface.
 */
export interface Part11RecordCheck {
  status: 'COMPLETE' | 'INCOMPLETE';
  /** The required elements this record does not carry. Empty when COMPLETE. */
  missing: Part11RecordElement[];
}

/**
 * Assess one record. Pure, total, and with no default pass: every element is
 * asserted from a value the source row supplied, and absence is reported as
 * absence rather than substituted for.
 */
export function assessPart11Record(record: {
  performedBy: string | null;
  performedAt: string | null;
  requiresSignature: boolean;
  signatureStatus?: 'pending' | 'signed' | 'rejected';
}): Part11RecordCheck {
  const missing: Part11RecordElement[] = [];
  if (!record.performedBy) missing.push('attributed-actor');
  if (!record.performedAt) missing.push('recorded-timestamp');
  if (record.requiresSignature && record.signatureStatus !== 'signed') {
    missing.push('applied-signature');
  }
  return { status: missing.length === 0 ? 'COMPLETE' : 'INCOMPLETE', missing };
}

/** A single node in the decision lineage graph */
export interface LineageNode {
  id: string;
  nodeType: 'decision' | 'document_state' | 'workflow_step' | 'evidence_link' | 'delegation';
  entityType: string;
  entityId: number;
  action: string;
  /**
   * The actor the SOURCE ROW attributes this event to — `null` when the row
   * attributes it to nobody. WO-16C finding 70: this used to fall back to the
   * literal `'system'` for an `audit_logs` row with a NULL `user_id`, and to
   * `assignedTo[0]` for an approval nobody had acted on yet. Both named an
   * actor the record does not name. A missing actor is now missing.
   */
  performedBy: string | null;
  /**
   * ISO 8601, from the record — `null` when the record carries no time for
   * this event, which is the case for an approval still awaiting a decision.
   * It used to fall back to `new Date()`, i.e. the moment the graph or export
   * was built, which reads as the moment the decision was taken.
   */
  performedAt: string | null;
  details: Record<string, unknown>;
  /** Hash of the audit record for tamper verification */
  recordHash?: string;
  /** Upstream node IDs this decision depends on */
  parentIds: string[];
  /** Downstream node IDs triggered by this decision */
  childIds: string[];
  /** Regulatory significance flags */
  regulatory: {
    gxpRelevant: boolean;
    requiresSignature: boolean;
    signatureStatus?: 'pending' | 'signed' | 'rejected';
    /** Which Part 11 record elements this row carries — not a verdict. */
    part11RecordCheck: Part11RecordCheck;
  };
}

/** Complete lineage graph for an entity */
export interface LineageGraph {
  rootEntityType: string;
  rootEntityId: number;
  nodes: LineageNode[];
  edges: Array<{ from: string; to: string; relationship: string }>;
  metadata: {
    generatedAt: string;
    totalDecisions: number;
    totalApprovals: number;
    totalRejections: number;
    totalDelegations: number;
    chainVerified: boolean;
    /** WO-16B: 'unverifiable' when the verifier could not run — not 'failed'. */
    chainVerification: 'verified' | 'failed' | 'unverifiable';
    chainVerificationReason?: string;
    /**
     * WO-16C finding 71. This was a five-element string literal, computed from
     * nothing, printed by all three exports as an assertion of conformance.
     * Each framework now carries the status the same router's compliance
     * report gives it, so an exported audit file and the report agree.
     */
    complianceFrameworks: FrameworkAssessment[];
  };
}

/** A framework's standing, in the vocabulary routes/decision-lineage.ts uses. */
export interface FrameworkAssessment {
  framework: string;
  status: 'COMPLIANT' | 'REVIEW_REQUIRED' | 'UNVERIFIABLE' | 'NOT_ASSESSED';
  note?: string;
}

const NOT_EVALUATED_HERE = 'No check in this lineage record evaluates this framework.';

/**
 * The frameworks a lineage record can speak to, and what it can honestly say
 * about each.
 *
 * Three of the five rest on the hash-chain verifier, so they take its three
 * states — including "the verifier could not run", which WO-16B established is
 * not a failure. The other two are named in the export header but nothing in
 * this subsystem evaluates them, so they say so rather than claim conformance.
 * Identical in content and order to the block in routes/decision-lineage.ts.
 */
export function assessComplianceFrameworks(
  chainVerification: 'verified' | 'failed' | 'unverifiable',
): FrameworkAssessment[] {
  const chainDependent: FrameworkAssessment['status'] =
    chainVerification === 'verified'
      ? 'COMPLIANT'
      : chainVerification === 'failed'
        ? 'REVIEW_REQUIRED'
        : 'UNVERIFIABLE';
  return [
    { framework: 'FDA 21 CFR Part 11', status: chainDependent },
    { framework: 'EU Annex 11', status: chainDependent },
    { framework: 'ICH E6(R2) GCP', status: 'NOT_ASSESSED', note: NOT_EVALUATED_HERE },
    { framework: 'PMDA ERES Guidelines', status: chainDependent },
    { framework: 'GAMP 5', status: 'NOT_ASSESSED', note: NOT_EVALUATED_HERE },
  ];
}

/** One cell of the CSV export: `COMPLETE`, or what the record is missing. */
function formatPart11RecordCheck(check: Part11RecordCheck): string {
  return check.status === 'COMPLETE'
    ? 'COMPLETE'
    : `INCOMPLETE (${check.missing.join('; ')})`;
}

/** Filters for lineage queries */
export interface LineageQueryFilters {
  entityType?: string;
  entityId?: number;
  organizationId?: number;
  userId?: string;
  fromDate?: Date;
  toDate?: Date;
  nodeTypes?: string[];
  limit?: number;
}

/** Export format options */
export type ExportFormat = 'json' | 'csv' | 'xml';

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export class DecisionLineageService {

  /**
   * Record a decision event in the lineage chain.
   * This is the primary entry point — called by approval workflows, document
   * state machines, and evidence linkers.
   */
  async recordDecision(params: {
    organizationId: number;
    entityType: string;
    entityId: number;
    action: string;
    performedBy: string;
    performedByRole?: string;
    details?: Record<string, unknown>;
    parentDecisionIds?: string[];
    gxpRelevant?: boolean;
    requiresSignature?: boolean;
  }): Promise<string> {
    const decisionId = `DEC-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Write to tamper-proof audit trail
    await auditService.logAction({
      tenantId: params.organizationId,
      userId: params.performedBy,
      action: `decision:${params.action}`,
      resourceType: params.entityType,
      resourceId: params.entityId,
      details: {
        decisionId,
        ...params.details,
        // WO-16C finding 70. `audit_logs.user_id` is an integer column, and
        // auditService nulls any actor id that is not numeric — so a caller
        // that identifies people by email or uuid loses the actor entirely and
        // the graph then has nothing to attribute the decision to. Keep what
        // the caller actually said, next to the decision it belongs to.
        performedBy: params.performedBy,
        parentDecisionIds: params.parentDecisionIds || [],
        gxpRelevant: params.gxpRelevant ?? true,
        requiresSignature: params.requiresSignature ?? false,
        performedByRole: params.performedByRole,
      },
    });

    logger.info(`Decision recorded: ${decisionId} [${params.action}] on ${params.entityType}:${params.entityId}`);
    return decisionId;
  }

  /**
   * Build the complete lineage graph for a document or workflow.
   * Traverses all related audit records, approvals, and workflow history
   * to construct a DAG (directed acyclic graph) of decisions.
   */
  async getLineageGraph(
    entityType: string,
    entityId: number,
    organizationId?: number,
  ): Promise<LineageGraph> {
    const nodes: LineageNode[] = [];
    const edges: Array<{ from: string; to: string; relationship: string }> = [];

    let approvalCount = 0;
    let rejectionCount = 0;
    let delegationCount = 0;

    // 1. Gather workflow history for this entity
    try {
      const workflows = await db.select()
        .from(documentWorkflows)
        .where(eq(documentWorkflows.documentId, entityId));

      for (const wf of workflows) {
        // Get all approvals for this workflow
        const approvals = await db.select()
          .from(workflowApprovals)
          .where(eq(workflowApprovals.workflowId, wf.id))
          .orderBy(workflowApprovals.stepOrder);

        for (const approval of approvals) {
          const nodeId = `approval-${approval.id}`;
          const status = (approval.status as string) || 'pending';

          if (status === 'approved') approvalCount++;
          if (status === 'rejected') rejectionCount++;

          // WO-16C finding 70. `assigned_to` is who the step is WAITING ON;
          // `completed_by` / `completed_at` are who acted and when, and both are
          // NULL for a step nobody has acted on. Reporting the assignee at the
          // moment of export as the performer of an `awaiting_decision` node
          // invented the two fields an audit trail exists to record. The
          // assignment is real, so it stays — as an assignment, in `details`.
          const performedBy = (approval.completedBy as string | null) || null;
          const performedAt = approval.completedAt?.toISOString() || null;
          const signatureStatus: 'pending' | 'signed' | 'rejected' =
            status === 'approved' ? 'signed' : status === 'pending' ? 'pending' : 'rejected';

          nodes.push({
            id: nodeId,
            nodeType: 'decision',
            entityType: 'workflow_approval',
            entityId: approval.id,
            action: status === 'pending' ? 'awaiting_decision' : status,
            performedBy,
            performedAt,
            details: {
              workflowId: wf.id,
              stepId: approval.stepId,
              comments: approval.comments,
              status,
              assignedTo: (approval.assignedTo as string[]) || [],
            },
            parentIds: [],
            childIds: [],
            regulatory: {
              gxpRelevant: true,
              requiresSignature: true,
              signatureStatus,
              part11RecordCheck: assessPart11Record({
                performedBy,
                performedAt,
                requiresSignature: true,
                signatureStatus,
              }),
            },
          });
        }

        // Link approvals sequentially
        for (let i = 1; i < approvals.length; i++) {
          const fromId = `approval-${approvals[i - 1].id}`;
          const toId = `approval-${approvals[i].id}`;
          edges.push({ from: fromId, to: toId, relationship: 'precedes' });
          nodes.find(n => n.id === fromId)?.childIds.push(toId);
          nodes.find(n => n.id === toId)?.parentIds.push(fromId);
        }

        // Get workflow history entries
        const history = await db.select()
          .from(workflowHistory)
          .where(eq(workflowHistory.workflowId, wf.id))
          .orderBy(workflowHistory.createdAt);

        for (const entry of history) {
          const nodeId = `history-${entry.id}`;
          const action = (entry.action as string) || '';

          if (action.includes('delegat')) delegationCount++;

          const performedBy = (entry.performedBy as string | null) || null;
          const performedAt = entry.createdAt?.toISOString() || null;

          nodes.push({
            id: nodeId,
            nodeType: action.includes('delegat') ? 'delegation' : 'workflow_step',
            entityType: 'workflow_history',
            entityId: entry.id,
            action,
            performedBy,
            performedAt,
            details: (entry.details as Record<string, unknown>) || {},
            parentIds: [],
            childIds: [],
            regulatory: {
              gxpRelevant: true,
              requiresSignature: false,
              part11RecordCheck: assessPart11Record({
                performedBy,
                performedAt,
                requiresSignature: false,
              }),
            },
          });
        }
      }
    } catch (err) {
      logger.warn('Failed to query workflow data for lineage graph', err);
    }

    // 2. Gather document audit logs
    try {
      const docLogs = await db.select()
        .from(documentAuditLogs)
        .where(eq(documentAuditLogs.documentId, entityId))
        .orderBy(documentAuditLogs.performedAt);

      for (const log of docLogs) {
        const nodeId = `docaudit-${log.id}`;
        const performedBy = (log.performedBy as string | null) || null;
        const performedAt = log.performedAt?.toISOString() || null;

        nodes.push({
          id: nodeId,
          nodeType: 'document_state',
          entityType: 'document_audit',
          entityId: log.id,
          action: (log.action as string) || 'unknown',
          performedBy,
          performedAt,
          details: (log.details as Record<string, unknown>) || {},
          parentIds: [],
          childIds: [],
          regulatory: {
            gxpRelevant: true,
            requiresSignature: false,
            part11RecordCheck: assessPart11Record({
              performedBy,
              performedAt,
              requiresSignature: false,
            }),
          },
        });
      }

      // Link document audit entries sequentially
      for (let i = 1; i < docLogs.length; i++) {
        const fromId = `docaudit-${docLogs[i - 1].id}`;
        const toId = `docaudit-${docLogs[i].id}`;
        edges.push({ from: fromId, to: toId, relationship: 'follows' });
      }
    } catch (err) {
      logger.warn('Failed to query document audit logs for lineage', err);
    }

    // 3. Gather general audit log entries for this entity
    try {
      const generalLogs = await db.select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.recordId, String(entityId)),
            organizationId ? eq(auditLogs.tenantId, organizationId) : undefined,
          )
        )
        .orderBy(desc(auditLogs.createdAt))
        .limit(100);

      for (const log of generalLogs) {
        const nodeId = `audit-${log.id}`;
        const action = log.action || 'unknown';
        if (action.startsWith('decision:')) {
          // These are lineage-specific entries.
          // WO-16C finding 70: `audit_logs.user_id` is nullable, and NULL for
          // every decision whose actor could not be resolved to a numeric user
          // (auditService coerces a non-numeric actor id to NULL before the
          // INSERT). The literal 'system' named an actor that does not exist;
          // the actor the caller supplied, where there was one, is preserved by
          // recordDecision in `details.performedBy` and travels in `details`.
          const performedBy = log.userId != null ? String(log.userId) : null;
          const performedAt = log.createdAt?.toISOString() || null;

          nodes.push({
            id: nodeId,
            nodeType: 'decision',
            entityType: log.tableName || 'unknown',
            entityId: 0,
            action: action.replace('decision:', ''),
            performedBy,
            performedAt,
            details: (log.newValues as Record<string, unknown>) || {},
            parentIds: [],
            childIds: [],
            regulatory: {
              gxpRelevant: true,
              requiresSignature: false,
              part11RecordCheck: assessPart11Record({
                performedBy,
                performedAt,
                requiresSignature: false,
              }),
            },
          });
        }
      }
    } catch (err) {
      logger.warn('Failed to query general audit logs for lineage', err);
    }

    // Verify chain integrity — three outcomes. A verifier that did not run is
    // reported as such; it is not a failed chain (WO-16B finding 12).
    const chainResult = await auditService.verifyChain();
    const chainVerified = chainResult.ran && chainResult.valid;
    const chainVerification: 'verified' | 'failed' | 'unverifiable' = !chainResult.ran
      ? 'unverifiable'
      : chainResult.valid
        ? 'verified'
        : 'failed';
    const chainVerificationReason = !chainResult.ran
      ? chainResult.reason
      : chainResult.valid
        ? undefined
        : chainResult.invalidReason;

    return {
      rootEntityType: entityType,
      rootEntityId: entityId,
      nodes,
      edges,
      metadata: {
        generatedAt: new Date().toISOString(),
        totalDecisions: nodes.filter(n => n.nodeType === 'decision').length,
        totalApprovals: approvalCount,
        totalRejections: rejectionCount,
        totalDelegations: delegationCount,
        chainVerified,
        chainVerification,
        chainVerificationReason,
        complianceFrameworks: assessComplianceFrameworks(chainVerification),
      },
    };
  }

  /**
   * Query lineage events across entities with flexible filters.
   * Used by the audit dashboard and inbox worklist.
   */
  async queryDecisions(filters: LineageQueryFilters): Promise<LineageNode[]> {
    const nodes: LineageNode[] = [];
    const limit = filters.limit || 50;

    try {
      const conditions: ReturnType<typeof eq>[] = [];
      if (filters.organizationId) {
        conditions.push(eq(auditLogs.tenantId, filters.organizationId));
      }
      if (filters.userId) {
        conditions.push(eq(auditLogs.userId, Number(filters.userId)));
      }
      if (filters.entityType) {
        conditions.push(eq(auditLogs.tableName, filters.entityType));
      }
      if (filters.entityId) {
        conditions.push(eq(auditLogs.recordId, String(filters.entityId)));
      }
      if (filters.fromDate) {
        conditions.push(gte(auditLogs.createdAt, filters.fromDate));
      }
      if (filters.toDate) {
        conditions.push(lte(auditLogs.createdAt, filters.toDate));
      }

      const rows = await db.select()
        .from(auditLogs)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(auditLogs.createdAt))
        .limit(limit);

      for (const row of rows) {
        // Same nullable `user_id` as getLineageGraph reads — see the note there.
        const performedBy = row.userId != null ? String(row.userId) : null;
        const performedAt = row.createdAt?.toISOString() || null;

        nodes.push({
          id: `audit-${row.id}`,
          nodeType: row.action?.startsWith('decision:') ? 'decision' : 'document_state',
          entityType: row.tableName || 'unknown',
          entityId: parseInt(row.recordId || '0', 10),
          action: row.action || 'unknown',
          performedBy,
          performedAt,
          details: (row.newValues as Record<string, unknown>) || {},
          parentIds: [],
          childIds: [],
          regulatory: {
            gxpRelevant: true,
            requiresSignature: false,
            part11RecordCheck: assessPart11Record({
              performedBy,
              performedAt,
              requiresSignature: false,
            }),
          },
        });
      }
    } catch (err) {
      logger.warn('Failed to query decisions', err);
    }

    return nodes;
  }

  /**
   * Export lineage data in regulatory-submission formats.
   *
   * Supports:
   *   - JSON: Full graph with all metadata (default)
   *   - CSV: Flat table for spreadsheet review
   *   - XML: eCTD-compatible audit trail format
   */
  async exportLineage(
    entityType: string,
    entityId: number,
    format: ExportFormat = 'json',
    organizationId?: number,
  ): Promise<{ data: string; contentType: string; filename: string }> {
    const graph = await this.getLineageGraph(entityType, entityId, organizationId);

    switch (format) {
      case 'csv':
        return this.exportCSV(graph);
      case 'xml':
        return this.exportXML(graph);
      case 'json':
      default:
        return this.exportJSON(graph);
    }
  }

  // ─── Export helpers ──────────────────────────────────────────────────────────

  private exportJSON(graph: LineageGraph): { data: string; contentType: string; filename: string } {
    return {
      data: JSON.stringify(graph, null, 2),
      contentType: 'application/json',
      filename: `lineage_${graph.rootEntityType}_${graph.rootEntityId}_${Date.now()}.json`,
    };
  }

  private exportCSV(graph: LineageGraph): { data: string; contentType: string; filename: string } {
    const headers = [
      'Node ID', 'Type', 'Entity Type', 'Entity ID', 'Action',
      'Performed By', 'Performed At', 'GxP Relevant', 'Requires Signature',
      'Signature Status', 'Part 11 Record Elements', 'Details',
    ];

    const rows = graph.nodes.map(n => [
      n.id,
      n.nodeType,
      n.entityType,
      n.entityId,
      n.action,
      // An absent actor or time is printed as absent. It was printed as the
      // literal 'system' and as the moment this file was generated (finding 70).
      n.performedBy ?? 'not attributed',
      n.performedAt ?? 'not recorded',
      n.regulatory.gxpRelevant ? 'Yes' : 'No',
      n.regulatory.requiresSignature ? 'Yes' : 'No',
      n.regulatory.signatureStatus || 'N/A',
      formatPart11RecordCheck(n.regulatory.part11RecordCheck),
      JSON.stringify(n.details),
    ]);

    const csvContent = [
      `# Decision Lineage Report`,
      `# Generated: ${graph.metadata.generatedAt}`,
      `# Entity: ${graph.rootEntityType} #${graph.rootEntityId}`,
      `# Part 11 Record Elements: per-record presence check of what 21 CFR Part 11 requires an entry to carry`,
      `#   (§11.10(e) attributed actor and recorded timestamp; §11.50 applied signature where one is required).`,
      `#   COMPLETE means the record carries those elements. It is not a verdict on the decision or the system.`,
      `# Compliance: ${graph.metadata.complianceFrameworks.map(f => `${f.framework} = ${f.status}`).join('; ')}`,
      `# Chain Verified: ${graph.metadata.chainVerification === 'verified' ? 'PASS' : graph.metadata.chainVerification === 'failed' ? 'FAIL' : 'UNVERIFIABLE (the verifier could not run)'}`,
      '',
      headers.join(','),
      ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    return {
      data: csvContent,
      contentType: 'text/csv',
      filename: `lineage_${graph.rootEntityType}_${graph.rootEntityId}_${Date.now()}.csv`,
    };
  }

  private exportXML(graph: LineageGraph): { data: string; contentType: string; filename: string } {
    const escapeXml = (s: string) => s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    const nodesXml = graph.nodes.map(n => `
    <decision-record id="${escapeXml(n.id)}">
      <type>${escapeXml(n.nodeType)}</type>
      <entity-type>${escapeXml(n.entityType)}</entity-type>
      <entity-id>${n.entityId}</entity-id>
      <action>${escapeXml(n.action)}</action>
      ${n.performedBy !== null
        ? `<performed-by>${escapeXml(n.performedBy)}</performed-by>`
        : `<performed-by attributed="false" />`}
      ${n.performedAt !== null
        ? `<performed-at>${escapeXml(n.performedAt)}</performed-at>`
        : `<performed-at recorded="false" />`}
      <regulatory>
        <gxp-relevant>${n.regulatory.gxpRelevant}</gxp-relevant>
        <requires-signature>${n.regulatory.requiresSignature}</requires-signature>
        <signature-status>${n.regulatory.signatureStatus || 'none'}</signature-status>
        <part11-record-elements status="${n.regulatory.part11RecordCheck.status}" missing="${escapeXml(n.regulatory.part11RecordCheck.missing.join(' '))}" />
      </regulatory>
    </decision-record>`).join('');

    const edgesXml = graph.edges.map(e => `
    <lineage-edge from="${escapeXml(e.from)}" to="${escapeXml(e.to)}" relationship="${escapeXml(e.relationship)}" />`).join('');

    const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<!--
  Decision Lineage Report — eCTD Audit Trail
  Generated: ${graph.metadata.generatedAt}
  Compliance: ${graph.metadata.complianceFrameworks.map(f => `${f.framework} = ${f.status}`).join('; ')}
  Chain verification: ${graph.metadata.chainVerification === 'verified' ? 'PASS' : graph.metadata.chainVerification === 'failed' ? 'FAIL' : 'UNVERIFIABLE (the verifier could not run)'}
  part11-record-elements: a per-record presence check of what 21 CFR Part 11 requires an entry to
    carry — §11.10(e) attributed actor and recorded timestamp, §11.50 applied signature where one
    is required. COMPLETE means the record carries those elements; it is not a verdict on the
    decision or on the system. A <performed-by attributed="false"/> or <performed-at recorded="false"/>
    element means the source record names nobody, or records no time, for that event.
-->
<decision-lineage
  xmlns="urn:clinicalsageai:lineage:1.0"
  entity-type="${escapeXml(graph.rootEntityType)}"
  entity-id="${graph.rootEntityId}"
  generated-at="${graph.metadata.generatedAt}">
  <metadata>
    <total-decisions>${graph.metadata.totalDecisions}</total-decisions>
    <total-approvals>${graph.metadata.totalApprovals}</total-approvals>
    <total-rejections>${graph.metadata.totalRejections}</total-rejections>
    <total-delegations>${graph.metadata.totalDelegations}</total-delegations>
    <chain-verified>${graph.metadata.chainVerified}</chain-verified>
    <chain-verification>${graph.metadata.chainVerification}</chain-verification>
    <compliance-frameworks>
      ${graph.metadata.complianceFrameworks
        .map(f =>
          `<framework name="${escapeXml(f.framework)}" status="${escapeXml(f.status)}"${f.note ? ` note="${escapeXml(f.note)}"` : ''} />`,
        )
        .join('\n      ')}
    </compliance-frameworks>
  </metadata>
  <decision-records>${nodesXml}
  </decision-records>
  <lineage-edges>${edgesXml}
  </lineage-edges>
</decision-lineage>`;

    return {
      data: xmlContent,
      contentType: 'application/xml',
      filename: `lineage_${graph.rootEntityType}_${graph.rootEntityId}_${Date.now()}.xml`,
    };
  }
}

// Singleton
export const decisionLineageService = new DecisionLineageService();
