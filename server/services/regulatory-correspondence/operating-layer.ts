import crypto from 'node:crypto';
import { db } from '../../db';
import {
  c2cProjectWorkItems,
  c2cBlockers,
  c2cSubmissionPackages,
  c2cPackageSections,
} from '../../../shared/schema';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { CorrespondenceIssue } from '@shared/types/regulatory-correspondence';

export type CanonicalTaskType =
  | 'correspondence_triage'
  | 'issue_review'
  | 'evidence_request'
  | 'section_revision'
  | 'response_package_drafting'
  | 'approval_review'
  | 'publish_gate_remediation'
  | 'regulator_follow_up'
  | 'mailbox_sync_exception'
  | 'digest_acknowledgment';

export interface OperatingImpactResult {
  linkedPackageDbId: number | null;
  linkedSections: Array<{ sectionDbId: number; sectionKey: string }>;
  blockerOpened: boolean;
  readinessPenalty: number;
  recommendedResponsePackageType: string;
}

export interface CanonicalTaskRecord {
  taskId: string;
  taskType: CanonicalTaskType;
  sourceObjectType: 'correspondence_issue';
  sourceObjectId: string;
  projectId: number;
  ownerFunction: string;
  ownerPersonId: number | null;
  dueAt: string;
  escalationPolicy: string;
  blockerImpact: 'none' | 'degrades_readiness' | 'publish_block';
  linkedSections: string[];
  linkedArtifactIds: string[];
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
}

function slaHoursForSeverity(severity: CorrespondenceIssue['severity']): number {
  if (severity === 'critical') return 24;
  if (severity === 'high') return 48;
  if (severity === 'medium') return 72;
  return 120;
}

function taskTypeForIssue(issue: CorrespondenceIssue): CanonicalTaskType {
  if (issue.blocker) return 'publish_gate_remediation';
  if (issue.category === 'missing_information_clarification') return 'evidence_request';
  if (issue.category === 'ectd_technical_formatting') return 'section_revision';
  return 'issue_review';
}

export async function computeCorrespondenceIssueImpact(input: {
  orgId: number;
  projectId: number;
  submissionId: string;
  correspondenceId: string;
  issue: CorrespondenceIssue;
}): Promise<OperatingImpactResult> {
  const [linkedPackage] = await db
    .select({ id: c2cSubmissionPackages.id, packageFamily: c2cSubmissionPackages.packageFamily })
    .from(c2cSubmissionPackages)
    .where(
      and(
        eq(c2cSubmissionPackages.orgId, input.orgId),
        eq(c2cSubmissionPackages.projectId, input.projectId),
        inArray(c2cSubmissionPackages.status, ['draft', 'in_review', 'ready', 'locked'])
      )
    )
    .orderBy(asc(c2cSubmissionPackages.createdAt))
    .limit(1);

  let linkedSections: Array<{ sectionDbId: number; sectionKey: string }> = [];
  if (linkedPackage && input.issue.mappedCtdSections.length) {
    linkedSections = await db
      .select({ sectionDbId: c2cPackageSections.id, sectionKey: c2cPackageSections.sectionKey })
      .from(c2cPackageSections)
      .where(
        and(
          eq(c2cPackageSections.packageDbId, linkedPackage.id),
          inArray(c2cPackageSections.sectionKey, input.issue.mappedCtdSections)
        )
      );
  }

  let blockerOpened = false;
  if (linkedPackage && input.issue.blocker) {
    const [existing] = await db
      .select({ id: c2cBlockers.id })
      .from(c2cBlockers)
      .where(
        and(
          eq(c2cBlockers.orgId, input.orgId),
          eq(c2cBlockers.projectId, input.projectId),
          eq(c2cBlockers.packageDbId, linkedPackage.id),
          eq(c2cBlockers.title, `Regulatory issue ${input.issue.id}`),
          eq(c2cBlockers.status, 'open')
        )
      )
      .limit(1);

    if (!existing) {
      await db.insert(c2cBlockers).values({
        blockerId: `blk_${crypto.randomUUID()}`,
        orgId: input.orgId,
        projectId: input.projectId,
        packageDbId: linkedPackage.id,
        sectionDbId: linkedSections[0]?.sectionDbId ?? null,
        blockerType: 'regulatory_correspondence_issue',
        ownerFunction:
          input.issue.structuredExtraction?.recommendedOwnerFunction || input.issue.owner || 'regulatory_affairs',
        severity: input.issue.severity,
        title: `Regulatory issue ${input.issue.id}`,
        description: `Correspondence ${input.correspondenceId} raised ${input.issue.category}`,
        status: 'open',
      });
      blockerOpened = true;
    }
  }

  return {
    linkedPackageDbId: linkedPackage?.id ?? null,
    linkedSections,
    blockerOpened,
    readinessPenalty: input.issue.severity === 'critical' ? 25 : input.issue.severity === 'high' ? 15 : 5,
    recommendedResponsePackageType:
      input.issue.structuredExtraction?.recommendedResponsePackageType || 'agency_response',
  };
}

export async function createCanonicalTasksForIssue(input: {
  orgId: number;
  projectId: number;
  issue: CorrespondenceIssue;
  ownerUserId: number;
  ownerName: string;
  linkedSectionKeys: string[];
}): Promise<CanonicalTaskRecord[]> {
  const dueAt = new Date(Date.now() + slaHoursForSeverity(input.issue.severity) * 60 * 60 * 1000);
  const taskType = taskTypeForIssue(input.issue);
  const workItemId = `wi_${crypto.randomUUID()}`;

  await db.insert(c2cProjectWorkItems).values({
    workItemId,
    orgId: input.orgId,
    projectId: input.projectId,
    sourceType: 'review_task',
    sourceId: 0,
    title: `[${taskType}] ${input.issue.category}`,
    status: 'open',
    priority: input.issue.severity,
    dueAt,
    ownerId: input.ownerUserId || null,
    ownerName: input.ownerName || null,
    ctdSection: input.linkedSectionKeys[0] || null,
    blockerType: input.issue.blocker ? 'regulatory_correspondence_issue' : null,
  });

  return [
    {
      taskId: workItemId,
      taskType,
      sourceObjectType: 'correspondence_issue',
      sourceObjectId: input.issue.id,
      projectId: input.projectId,
      ownerFunction:
        input.issue.structuredExtraction?.recommendedOwnerFunction || input.issue.owner || 'regulatory_affairs',
      ownerPersonId: input.ownerUserId || null,
      dueAt: dueAt.toISOString(),
      escalationPolicy: input.issue.severity === 'critical' ? 'immediate_escalation' : 'standard_sla',
      blockerImpact: input.issue.blocker ? 'publish_block' : 'degrades_readiness',
      linkedSections: input.linkedSectionKeys,
      linkedArtifactIds: input.issue.mappedArtifactIds || [],
      status: 'open',
    },
  ];
}

export async function readCanonicalDueSoonAndWorkload(input: {
  orgId: number;
  projectId?: number;
}): Promise<{
  dueSoon: Array<Record<string, unknown>>;
  workload: Array<Record<string, unknown>>;
}> {
  const now = new Date();
  const next7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const dueSoon = await db.execute(sql`
    SELECT work_item_id, owner_id, owner_name, title, status, priority, due_at
    FROM c2c_project_work_items
    WHERE org_id = ${input.orgId}
      AND (${input.projectId ?? null}::int IS NULL OR project_id = ${input.projectId ?? null})
      AND status IN ('open','in_progress')
      AND due_at IS NOT NULL
      AND due_at <= ${next7d}
    ORDER BY due_at ASC
  `);

  const workload = await db.execute(sql`
    SELECT owner_id, COALESCE(owner_name, '') AS owner_name,
      COUNT(*) FILTER (WHERE status IN ('open','in_progress'))::int AS open_tasks,
      COUNT(*) FILTER (WHERE status IN ('open','in_progress') AND due_at < ${now})::int AS overdue_tasks
    FROM c2c_project_work_items
    WHERE org_id = ${input.orgId}
      AND (${input.projectId ?? null}::int IS NULL OR project_id = ${input.projectId ?? null})
    GROUP BY owner_id, owner_name
    ORDER BY overdue_tasks DESC, open_tasks DESC
  `);

  return {
    dueSoon: dueSoon.rows as Array<Record<string, unknown>>,
    workload: workload.rows as Array<Record<string, unknown>>,
  };
}
