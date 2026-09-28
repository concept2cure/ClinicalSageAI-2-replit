/**
 * Cross-Object Reasoning Resolver — Phase 3
 *
 * Assembles structured reasoning payloads from multiple project objects.
 * This is the intelligence aggregation layer that lets AI reason across:
 * - documents, artifacts, validations, tasks, modules, evidence, actions
 *
 * All queries are tenant-scoped (organizationId) and project-scoped.
 */

import { db } from '../../db';
import { eq, and, desc, sql, gte } from 'drizzle-orm';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('cross-object-resolver');
import {
  projects,
  concept2cureArtifacts,
  concept2cureConversations,
  regulatoryAuditLogs,
} from '../../../shared/schema';
import type {
  CrossObjectReasoningPayload,
  ProjectSnapshot,
  DocumentSnapshot,
  ArtifactSnapshot,
  ValidationSnapshot,
  TaskSnapshot,
  ModulePlacementSnapshot,
  ActionHistoryEntry,
  EvidenceSnapshot,
  CmcSignalSnapshot,
  CmcContradictionSnapshot,
} from '../../../shared/types/orchestration';

/**
 * The payload could not be assembled, because a read it depends on failed or
 * the project is not in the organisation. `failedReads` names each one; the
 * underlying causes are logged, not returned, since they carry SQL.
 */
export class CrossObjectReadError extends Error {
  readonly failedReads: string[];

  constructor(failedReads: string[]) {
    super(
      `The project could not be assessed: ${failedReads.join(', ')} could not be read. Nothing was assessed.`,
    );
    this.name = 'CrossObjectReadError';
    this.failedReads = failedReads;
  }
}

/** A read failed: log its cause, and fail the payload naming the read. */
function readFailed(read: string, err: unknown): CrossObjectReadError {
  if (err instanceof CrossObjectReadError) return err;
  logger.warn('Resolver query failed', { read, error: err instanceof Error ? err.message : err });
  return new CrossObjectReadError([read]);
}

// ---------------------------------------------------------------------------
// Main Resolver
// ---------------------------------------------------------------------------

export interface ResolverScope {
  organizationId: number;
  projectId: number;
  module?: string;
}

/**
 * Assemble a complete cross-object reasoning payload for a project.
 * This payload is structured for AI consumption — not raw DB dumps.
 */
export async function assembleCrossObjectPayload(
  scope: ResolverScope
): Promise<CrossObjectReasoningPayload> {
  const { organizationId, projectId } = scope;

  // Run all queries in parallel for speed. Every one must succeed: each
  // resolver used to answer a failed read with an empty result, so a project
  // nothing could be read from was assessed as an empty one, and the readiness
  // review reported "No critical issues found" for it (VSR-001 F-23). Rows that
  // are absent are an answer; a read that failed is not, so the payload fails
  // and names every read that did.
  const settled = await Promise.allSettled([
    resolveProjectSnapshot(organizationId, projectId),
    resolveDocuments(organizationId, projectId, scope.module),
    resolveArtifacts(organizationId, projectId, scope.module),
    resolveValidations(organizationId, projectId),
    resolveTasks(organizationId, projectId, scope.module),
    resolveModulePlacements(organizationId, projectId),
    resolveRecentActions(organizationId, projectId),
    resolveEvidence(organizationId, projectId),
    resolveCmcSignals(organizationId, projectId),
    resolveLastSignalAt(organizationId, projectId),
  ] as const);
  const failedReads = settled.flatMap((r) =>
    r.status === 'rejected'
      ? r.reason instanceof CrossObjectReadError
        ? r.reason.failedReads
        : ['an unnamed read']
      : [],
  );
  if (failedReads.length > 0) throw new CrossObjectReadError(failedReads);
  const [
    projectSnap,
    documents,
    artifacts,
    validations,
    tasks,
    moduleMap,
    recentActions,
    evidence,
    cmcSignals,
    lastSignalAt,
  ] = settled.map((r) => (r as PromiseFulfilledResult<unknown>).value) as [
    ProjectSnapshot,
    DocumentSnapshot[],
    ArtifactSnapshot[],
    ValidationSnapshot[],
    TaskSnapshot[],
    ModulePlacementSnapshot[],
    ActionHistoryEntry[],
    EvidenceSnapshot[],
    CmcSignalSnapshot,
    string | null,
  ];

  return {
    project: projectSnap,
    documents,
    artifacts,
    validations,
    tasks,
    moduleMap,
    recentActions,
    evidence,
    cmcSignals,
    assembledAt: new Date().toISOString(),
    lastSignalAt,
    scope: {
      organizationId,
      projectId,
      module: scope.module,
    },
  };
}

// ---------------------------------------------------------------------------
// Individual Resolvers
// ---------------------------------------------------------------------------

async function resolveProjectSnapshot(
  orgId: number,
  projectId: number
): Promise<ProjectSnapshot> {
  try {
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.organizationId, orgId)))
      .limit(1);

    // Not a project this organisation holds: nothing about it can be read, so
    // it is refused rather than assessed as an empty "Unknown Project".
    if (!project) throw new CrossObjectReadError(['project']);

    // Count related entities. count(*) is a bigint, which the driver returns
    // as a string: cast it, so the snapshot carries the number its type says.
    const [artifactCounts] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(concept2cureArtifacts)
      .where(
        and(
          eq(concept2cureArtifacts.projectId, projectId),
          eq(concept2cureArtifacts.organizationId, orgId)
        )
      );

    return {
      id: project.id,
      name: project.name,
      status: project.status || 'active',
      progress: project.progress ?? 0,
      riskLevel: (project as any).riskLevel,
      submissionType: (project as any).submissionType,
      therapeuticArea: (project as any).therapeuticArea,
      targetDate: (project as any).targetDate,
      totalDocuments: artifactCounts?.count ?? 0,
      totalTasks: 0,
      blockedTasks: 0,
      overdueTasks: 0,
    };
  } catch (err) {
    throw readFailed('project', err);
  }
}

async function resolveDocuments(
  orgId: number,
  projectId: number,
  module?: string
): Promise<DocumentSnapshot[]> {
  try {
    // Use unified documents / artifacts as the document source
    const conditions = [
      eq(concept2cureArtifacts.projectId, projectId),
      eq(concept2cureArtifacts.organizationId, orgId),
    ];

    const artifacts = await db
      .select()
      .from(concept2cureArtifacts)
      .where(and(...conditions))
      .orderBy(desc(concept2cureArtifacts.updatedAt))
      .limit(100);

    return artifacts.map((a) => ({
      id: a.id,
      title: a.title,
      type: a.type || 'document',
      status: a.status || 'draft',
      module: (a as any).ctdSection ? mapSectionToModule((a as any).ctdSection) : undefined,
      lastModified: a.updatedAt?.toISOString(),
      version: a.version ?? 1,
      hasValidation: false, // Will be enriched by validation resolver
      isRouted: !!(a as any).ctdSection,
      routedTo: (a as any).ctdSection,
    }));
  } catch (err) {
    throw readFailed('documents', err);
  }
}

async function resolveArtifacts(
  orgId: number,
  projectId: number,
  module?: string
): Promise<ArtifactSnapshot[]> {
  try {
    const artifacts = await db
      .select()
      .from(concept2cureArtifacts)
      .where(
        and(
          eq(concept2cureArtifacts.projectId, projectId),
          eq(concept2cureArtifacts.organizationId, orgId)
        )
      )
      .orderBy(desc(concept2cureArtifacts.updatedAt))
      .limit(100);

    return artifacts.map((a) => ({
      id: a.id,
      title: a.title,
      type: a.type || 'markdown',
      status: a.status || 'draft',
      version: a.version ?? 1,
      isPublished: !!a.publishedVersionId,
      isPromoted: a.status === 'approved' || a.status === 'locked',
      ctdSection: (a as any).ctdSection,
      lastModified: a.updatedAt?.toISOString(),
    }));
  } catch (err) {
    throw readFailed('artifacts', err);
  }
}

async function resolveValidations(
  orgId: number,
  projectId: number
): Promise<ValidationSnapshot[]> {
  // Query audit logs for validation actions to reconstruct validation state
  try {
    const validationLogs = await db
      .select()
      .from(regulatoryAuditLogs)
      .where(
        and(
          eq(regulatoryAuditLogs.organizationId, orgId),
          eq(regulatoryAuditLogs.action, 'run_validation'),
          eq(regulatoryAuditLogs.entityType, 'ai_action')
        )
      )
      .orderBy(desc(regulatoryAuditLogs.createdAt))
      .limit(50);

    return validationLogs
      .filter((log) => {
        const newVal = log.newValue as any;
        return newVal?.projectId === projectId && newVal?.success;
      })
      .map((log) => {
        const newVal = log.newValue as any;
        const result = newVal?.result || {};
        const findings = result?.findings || [];
        return {
          documentId: newVal?.targetId || 0,
          documentTitle: result?.documentType || 'Document',
          isValid: result?.isValid ?? true,
          complianceScore: result?.complianceScore ?? 0,
          criticalCount: findings.filter((f: any) => f.severity === 'critical').length,
          majorCount: findings.filter((f: any) => f.severity === 'major').length,
          minorCount: findings.filter((f: any) => f.severity === 'minor').length,
          validatedAt: log.createdAt?.toISOString() || new Date().toISOString(),
          findings,
        };
      });
  } catch (err) {
    throw readFailed('validations', err);
  }
}

async function resolveTasks(
  orgId: number,
  projectId: number,
  module?: string
): Promise<TaskSnapshot[]> {
  // Tasks come from the unified task service — query if available
  try {
    const taskLogs = await db
      .select()
      .from(regulatoryAuditLogs)
      .where(
        and(
          eq(regulatoryAuditLogs.organizationId, orgId),
          eq(regulatoryAuditLogs.entityType, 'task')
        )
      )
      .orderBy(desc(regulatoryAuditLogs.createdAt))
      .limit(50);

    return taskLogs.map((log, i) => ({
      id: i + 1,
      title: (log.newValue as any)?.title || log.action || 'Task',
      status: (log.newValue as any)?.status || 'pending',
      priority: (log.newValue as any)?.priority || 'medium',
      module: (log.newValue as any)?.module,
      assignee: log.userName || undefined,
      isBlocked: (log.newValue as any)?.status === 'blocked',
      isOverdue: false,
    }));
  } catch (err) {
    throw readFailed('tasks', err);
  }
}

async function resolveModulePlacements(
  orgId: number,
  projectId: number
): Promise<ModulePlacementSnapshot[]> {
  try {
    const artifacts = await db
      .select()
      .from(concept2cureArtifacts)
      .where(
        and(
          eq(concept2cureArtifacts.projectId, projectId),
          eq(concept2cureArtifacts.organizationId, orgId)
        )
      );

    // Group by CTD section/module
    const moduleGroups = new Map<string, typeof artifacts>();
    for (const a of artifacts) {
      const section = (a as any).ctdSection;
      const mod = section ? mapSectionToModule(section) : 'unassigned';
      if (!moduleGroups.has(mod)) moduleGroups.set(mod, []);
      moduleGroups.get(mod)!.push(a);
    }

    // Standard CTD modules expected
    const expectedModules = ['Module 1', 'Module 2', 'Module 3', 'Module 4', 'Module 5'];
    const result: ModulePlacementSnapshot[] = [];

    for (const mod of expectedModules) {
      const items = moduleGroups.get(mod) || [];
      const published = items.filter((a) => !!a.publishedVersionId);
      result.push({
        module: mod,
        documentCount: items.length,
        artifactCount: items.length,
        completenessPercent: items.length > 0 ? Math.min(100, items.length * 20) : 0,
        hasValidation: false,
        missingItems: items.length === 0 ? [`No documents assigned to ${mod}`] : [],
      });
    }

    // Add unassigned if any
    const unassigned = moduleGroups.get('unassigned');
    if (unassigned && unassigned.length > 0) {
      result.push({
        module: 'Unassigned',
        documentCount: unassigned.length,
        artifactCount: unassigned.length,
        completenessPercent: 0,
        hasValidation: false,
        missingItems: unassigned.map((a) => `${a.title} — not routed to any module`),
      });
    }

    return result;
  } catch (err) {
    throw readFailed('module placements', err);
  }
}

async function resolveRecentActions(
  orgId: number,
  projectId: number
): Promise<ActionHistoryEntry[]> {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const logs = await db
      .select()
      .from(regulatoryAuditLogs)
      .where(
        and(
          eq(regulatoryAuditLogs.organizationId, orgId),
          eq(regulatoryAuditLogs.entityType, 'ai_action'),
          gte(regulatoryAuditLogs.createdAt, thirtyDaysAgo)
        )
      )
      .orderBy(desc(regulatoryAuditLogs.createdAt))
      .limit(50);

    return logs
      .filter((log) => {
        const nv = log.newValue as any;
        return nv?.projectId === projectId;
      })
      .map((log) => {
        const nv = log.newValue as any;
        return {
          actionId: log.auditId || log.entityId || '',
          actionType: nv?.actionType || log.action || '',
          targetType: nv?.targetType || '',
          targetId: nv?.targetId || '',
          status: nv?.success ? 'completed' : 'failed',
          timestamp: log.createdAt?.toISOString() || '',
          userId: log.userId ?? 0,
        };
      });
  } catch (err) {
    throw readFailed('recent actions', err);
  }
}

// ---------------------------------------------------------------------------
// CMC Signals — Module 3 source objects, sections, and contradictions
// ---------------------------------------------------------------------------

/**
 * Aggregate CMC operating-system tables for a project. project_id in
 * cmc_source_objects / cmc_module3_sections / cmc_contradictions is a UUID
 * referencing cmc_projects; the resolver scope uses the integer projects.id.
 * Cast both sides to text so the query is type-safe regardless of which
 * project flavor (legacy integer or CMC UUID) the caller supplied. Returns
 * an empty signal set when the project has no CMC rows — readiness treats
 * that as "CMC not in scope," not as a failure. A query that fails is a
 * failure, and fails the payload.
 */
async function resolveCmcSignals(
  orgId: number,
  projectId: number,
): Promise<CmcSignalSnapshot> {
  try {
    const projectIdParam = String(projectId);

    const [sourceRes, sectionRes, contradictionRes] = await Promise.all([
      db.execute(sql`
        SELECT source_type
        FROM cmc_source_objects
        WHERE organization_id = ${orgId}
          AND project_id::text = ${projectIdParam}
      `),
      db.execute(sql`
        SELECT stale
        FROM cmc_module3_sections
        WHERE organization_id = ${orgId}
          AND project_id::text = ${projectIdParam}
      `),
      db.execute(sql`
        SELECT id, severity, contradiction_type, details,
               impacted_sections, status
        FROM cmc_contradictions
        WHERE organization_id = ${orgId}
          AND project_id::text = ${projectIdParam}
        ORDER BY
          CASE severity
            WHEN 'critical' THEN 0
            WHEN 'high' THEN 1
            WHEN 'medium' THEN 2
            ELSE 3
          END,
          created_at DESC
        LIMIT 100
      `),
    ]);

    const sourceRows = sourceRes.rows as Array<Record<string, unknown>>;
    const sectionRows = sectionRes.rows as Array<Record<string, unknown>>;
    const contradictionRows = contradictionRes.rows as Array<Record<string, unknown>>;

    const sourceTypeBreakdown: Record<string, number> = {};
    for (const r of sourceRows) {
      const t = String(r.source_type ?? 'unknown');
      sourceTypeBreakdown[t] = (sourceTypeBreakdown[t] ?? 0) + 1;
    }

    const staleSectionCount = sectionRows.filter(r => r.stale === true).length;

    const contradictions: CmcContradictionSnapshot[] = contradictionRows.map(r => {
      const impacted = r.impacted_sections;
      const impactedSections = Array.isArray(impacted)
        ? (impacted as unknown[]).map(s => String(s))
        : [];
      const severity = String(r.severity ?? 'low').toLowerCase() as CmcContradictionSnapshot['severity'];
      return {
        id: String(r.id ?? ''),
        severity: (['low','medium','high','critical'] as const).includes(severity as any)
          ? severity
          : 'low',
        contradictionType: String(r.contradiction_type ?? ''),
        details: String(r.details ?? ''),
        impactedSections,
        status: String(r.status ?? 'open'),
      };
    });

    const counts = {
      critical: 0, high: 0, medium: 0, low: 0, open: 0, resolved: 0,
    };
    for (const c of contradictions) {
      counts[c.severity]++;
      const s = c.status.toLowerCase();
      if (s === 'resolved' || s === 'closed') counts.resolved++;
      else counts.open++;
    }

    return {
      sourceObjectCount: sourceRows.length,
      sourceTypeBreakdown,
      sectionCount: sectionRows.length,
      staleSectionCount,
      contradictions,
      contradictionCounts: counts,
    };
  } catch (err) {
    throw readFailed('CMC signals', err);
  }
}

/**
 * Returns the most recent updated_at across the project's underlying data
 * (artifacts, CMC source objects, CMC contradictions). Consumers compare
 * this against their last cached `assessedAt` to detect stale scores
 * without requiring an event bus subscription.
 */
async function resolveLastSignalAt(
  orgId: number,
  projectId: number,
): Promise<string | null> {
  try {
    const projectIdParam = String(projectId);
    const result = await db.execute(sql`
      SELECT MAX(ts) AS last_signal_at
      FROM (
        SELECT MAX(updated_at) AS ts
        FROM concept2cure_artifacts
        WHERE organization_id = ${orgId}
          AND project_id = ${projectId}
        UNION ALL
        SELECT MAX(updated_at) AS ts
        FROM cmc_source_objects
        WHERE organization_id = ${orgId}
          AND project_id::text = ${projectIdParam}
        UNION ALL
        SELECT MAX(updated_at) AS ts
        FROM cmc_contradictions
        WHERE organization_id = ${orgId}
          AND project_id::text = ${projectIdParam}
      ) sub
    `);
    const row = result.rows[0] as Record<string, unknown> | undefined;
    const ts = row?.last_signal_at;
    if (!ts) return null;
    if (ts instanceof Date) return ts.toISOString();
    return new Date(String(ts)).toISOString();
  } catch (err) {
    throw readFailed('last signal', err);
  }
}

async function resolveEvidence(
  orgId: number,
  projectId: number
): Promise<EvidenceSnapshot[]> {
  // Evidence objects from the programs schema — query if available
  try {
    const evidenceLogs = await db
      .select()
      .from(regulatoryAuditLogs)
      .where(
        and(
          eq(regulatoryAuditLogs.organizationId, orgId),
          eq(regulatoryAuditLogs.entityType, 'evidence')
        )
      )
      .orderBy(desc(regulatoryAuditLogs.createdAt))
      .limit(30);

    return evidenceLogs.map((log, i) => {
      const nv = log.newValue as any;
      return {
        id: i + 1,
        type: nv?.evidenceType || 'literature',
        category: nv?.category || 'clinical',
        status: nv?.status || 'pending',
        qualityScore: nv?.qualityScore,
        relevanceScore: nv?.relevanceScore,
        isVerified: nv?.isVerified ?? false,
        linkedDocumentId: nv?.documentId,
      };
    });
  } catch (err) {
    throw readFailed('evidence', err);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapSectionToModule(section: string): string {
  if (!section) return 'unassigned';
  const first = section.charAt(0);
  switch (first) {
    case '1': return 'Module 1';
    case '2': return 'Module 2';
    case '3': return 'Module 3';
    case '4': return 'Module 4';
    case '5': return 'Module 5';
    default: return 'unassigned';
  }
}

/**
 * Build a compact text summary of the reasoning payload for AI prompts.
 * This is what gets passed into system prompts / workflow steps.
 */
export function summarizePayloadForAI(payload: CrossObjectReasoningPayload): string {
  const p = payload.project;
  const lines: string[] = [
    `## Project: ${p.name}`,
    `Status: ${p.status} | Progress: ${p.progress}% | Risk: ${p.riskLevel || 'unknown'}`,
    `Documents: ${p.totalDocuments} | Tasks: ${p.totalTasks} | Blocked: ${p.blockedTasks}`,
    '',
  ];

  // Document summary
  if (payload.documents.length > 0) {
    lines.push(`### Documents (${payload.documents.length})`);
    const byStatus = groupBy(payload.documents, 'status');
    for (const [status, docs] of Object.entries(byStatus)) {
      lines.push(`- ${status}: ${docs.length}`);
    }
    const unrouted = payload.documents.filter((d) => !d.isRouted);
    if (unrouted.length > 0) {
      lines.push(`- Unrouted: ${unrouted.length}`);
    }
    lines.push('');
  }

  // Validation summary
  if (payload.validations.length > 0) {
    const totalCritical = payload.validations.reduce((s, v) => s + v.criticalCount, 0);
    const totalMajor = payload.validations.reduce((s, v) => s + v.majorCount, 0);
    const avgScore = Math.round(
      payload.validations.reduce((s, v) => s + v.complianceScore, 0) / payload.validations.length
    );
    lines.push(`### Validations (${payload.validations.length} runs)`);
    lines.push(`Avg compliance: ${avgScore}% | Critical findings: ${totalCritical} | Major: ${totalMajor}`);
    lines.push('');
  }

  // Module placements
  if (payload.moduleMap.length > 0) {
    lines.push('### Module Coverage');
    for (const m of payload.moduleMap) {
      const status = m.completenessPercent >= 80 ? 'OK' : m.completenessPercent > 0 ? 'Partial' : 'Empty';
      lines.push(`- ${m.module}: ${m.documentCount} docs, ${m.completenessPercent}% [${status}]`);
      if (m.missingItems.length > 0) {
        for (const mi of m.missingItems.slice(0, 3)) {
          lines.push(`  - Missing: ${mi}`);
        }
      }
    }
    lines.push('');
  }

  // Recent actions
  if (payload.recentActions.length > 0) {
    lines.push(`### Recent Actions (last ${payload.recentActions.length})`);
    for (const a of payload.recentActions.slice(0, 10)) {
      lines.push(`- ${a.actionType} on ${a.targetType}:${a.targetId} [${a.status}] (${a.timestamp})`);
    }
  }

  return lines.join('\n');
}

function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of arr) {
    const k = String(item[key] ?? 'unknown');
    if (!result[k]) result[k] = [];
    result[k].push(item);
  }
  return result;
}
