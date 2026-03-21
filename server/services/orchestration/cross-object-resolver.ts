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
} from '../../../shared/types/orchestration';

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

  // Run all queries in parallel for speed
  const [
    projectSnap,
    documents,
    artifacts,
    validations,
    tasks,
    moduleMap,
    recentActions,
    evidence,
  ] = await Promise.all([
    resolveProjectSnapshot(organizationId, projectId),
    resolveDocuments(organizationId, projectId, scope.module),
    resolveArtifacts(organizationId, projectId, scope.module),
    resolveValidations(organizationId, projectId),
    resolveTasks(organizationId, projectId, scope.module),
    resolveModulePlacements(organizationId, projectId),
    resolveRecentActions(organizationId, projectId),
    resolveEvidence(organizationId, projectId),
  ]);

  return {
    project: projectSnap,
    documents,
    artifacts,
    validations,
    tasks,
    moduleMap,
    recentActions,
    evidence,
    assembledAt: new Date().toISOString(),
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

    if (!project) {
      return {
        id: projectId,
        name: 'Unknown Project',
        status: 'unknown',
        progress: 0,
        totalDocuments: 0,
        totalTasks: 0,
        blockedTasks: 0,
        overdueTasks: 0,
      };
    }

    // Count related entities
    const [artifactCounts] = await db
      .select({ count: sql<number>`count(*)` })
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
    console.warn('[Cross-Object Resolver] Failed to resolve project snapshot:', err instanceof Error ? err.message : err);
    return {
      id: projectId,
      name: 'Project',
      status: 'active',
      progress: 0,
      totalDocuments: 0,
      totalTasks: 0,
      blockedTasks: 0,
      overdueTasks: 0,
    };
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
    console.warn('[Cross-Object Resolver] Resolver query failed:', err instanceof Error ? err.message : err);
    return [];
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
    console.warn('[Cross-Object Resolver] Resolver query failed:', err instanceof Error ? err.message : err);
    return [];
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
    console.warn('[Cross-Object Resolver] Resolver query failed:', err instanceof Error ? err.message : err);
    return [];
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
    console.warn('[Cross-Object Resolver] Resolver query failed:', err instanceof Error ? err.message : err);
    return [];
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
    console.warn('[Cross-Object Resolver] Resolver query failed:', err instanceof Error ? err.message : err);
    return [];
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
    console.warn('[Cross-Object Resolver] Resolver query failed:', err instanceof Error ? err.message : err);
    return [];
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
    console.warn('[Cross-Object Resolver] Resolver query failed:', err instanceof Error ? err.message : err);
    return [];
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
