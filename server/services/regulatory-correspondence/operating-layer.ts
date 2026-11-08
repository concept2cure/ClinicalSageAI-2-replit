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
import type { RequestDb } from '../../db/requestDb';
import { hasConfirmedObjectiveDisposition, isCurrentConfirmedObjectiveBlocker } from './issue-parser';
import { issueRowToCorrespondenceIssue, type CorrespondenceIssueRow } from './issue-row-mapper';

/**
 * Where the writes below go. Defaults to the shared `db`; the correspondence
 * intake passes its transaction so a letter and everything derived from it
 * commit together or not at all (2026-09-30, row D2).
 */
type Executor = RequestDb;

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
  if (hasConfirmedObjectiveDisposition(issue)) return 'publish_gate_remediation';
  if (issue.category === 'missing_information_clarification') return 'evidence_request';
  if (issue.category === 'ectd_technical_formatting') return 'section_revision';
  return 'issue_review';
}

interface CorrespondenceImpactInput {
  orgId: number;
  projectId: number;
  submissionId: string;
  correspondenceId: string;
  issue: CorrespondenceIssue;
}

export { isCurrentConfirmedObjectiveBlocker } from './issue-parser';

function issueOwnerFunction(issue: CorrespondenceIssue): string {
  return issue.structuredExtraction?.recommendedOwnerFunction || issue.owner || 'regulatory_affairs';
}

function reviewActor(issue: CorrespondenceIssue): number | null {
  const actor = issue.structuredExtraction?.humanReview?.reviewedBy;
  return typeof actor === 'number' && Number.isSafeInteger(actor) && actor > 0 ? actor : null;
}

async function synchronizeDerivedBlockers(input: CorrespondenceImpactInput,
  state: { issue: CorrespondenceIssue; eligible: boolean; packageId: number | null; linkedSections: OperatingImpactResult['linkedSections'] }, executor: Executor,
): Promise<boolean> {
  const { issue, eligible, packageId, linkedSections } = state;
  const existing = await executor
      .select({ id: c2cBlockers.id, packageDbId: c2cBlockers.packageDbId, status: c2cBlockers.status })
      .from(c2cBlockers)
      .where(
        and(
          eq(c2cBlockers.orgId, input.orgId),
          eq(c2cBlockers.projectId, input.projectId),
          eq(c2cBlockers.blockerType, 'regulatory_correspondence_issue'),
          eq(c2cBlockers.title, `Regulatory issue ${issue.id}`)
        )
      )
      .orderBy(asc(c2cBlockers.id));
  const retained = eligible && packageId !== null ? existing.find(b => b.packageDbId === packageId) : undefined;
  const close = existing.filter(b => b.status === 'open' && b.id !== retained?.id).map(b => b.id);
  if (close.length) await executor.update(c2cBlockers).set({ status: 'resolved', resolvedAt: new Date(),
    resolvedById: reviewActor(issue), updatedAt: new Date() })
    .where(and(eq(c2cBlockers.orgId, input.orgId), eq(c2cBlockers.projectId, input.projectId), inArray(c2cBlockers.id, close)));

  let blockerOpened = false;
  if (packageId !== null && eligible) {
    if (retained) {
      await executor.update(c2cBlockers).set({ status: 'open', resolvedAt: null, resolvedById: null,
        sectionDbId: linkedSections[0]?.sectionDbId ?? null, severity: issue.severity, updatedAt: new Date() })
        .where(and(eq(c2cBlockers.id, retained.id), eq(c2cBlockers.orgId, input.orgId), eq(c2cBlockers.projectId, input.projectId)));
      blockerOpened = retained.status !== 'open';
    } else {
      await executor.insert(c2cBlockers).values({
        blockerId: `blk_${crypto.randomUUID()}`,
        orgId: input.orgId,
        projectId: input.projectId,
        packageDbId: packageId,
        sectionDbId: linkedSections[0]?.sectionDbId ?? null,
        blockerType: 'regulatory_correspondence_issue',
        ownerFunction: issueOwnerFunction(issue),
        severity: issue.severity,
        title: `Regulatory issue ${issue.id}`,
        description: `Correspondence ${input.correspondenceId} raised ${issue.category}`,
        status: 'open',
      });
      blockerOpened = true;
    }
  }

  return blockerOpened;
}

/**
 * Synchronize only blockers derived from this stored issue. The caller owns the
 * transaction: review, blocker changes and governed audit must commit together.
 * Locking the stored issue serializes repeat reviews; model/caller issue fields
 * cannot substitute for its current source and recorded human disposition.
 */
export async function synchronizeReviewedCorrespondenceIssueImpact(
  input: CorrespondenceImpactInput, executor: Executor,
): Promise<OperatingImpactResult> {
  const current = await executor.execute<CorrespondenceIssueRow & Record<string, unknown> & { parsed_text: string | null; direction: string | null }>(sql`
    SELECT i.*, c.parsed_text, c.direction FROM c2c_correspondence_issues i
    JOIN c2c_correspondence c ON c.id = i.correspondence_id
    JOIN c2c_submissions s ON s.id = c.submission_id
      AND s.organization_id = c.organization_id AND s.project_id = c.project_id
    WHERE i.id = ${input.issue.id} AND c.id = ${input.correspondenceId}
      AND c.organization_id = ${input.orgId} AND c.project_id = ${input.projectId}
      AND c.submission_id = ${input.submissionId}
    FOR UPDATE OF i, c
  `);
  const row = current.rows[0];
  if (!row) return { linkedPackageDbId: null, linkedSections: [], blockerOpened: false,
    readinessPenalty: 0, recommendedResponsePackageType: 'agency_response' };
  const issue = issueRowToCorrespondenceIssue(row);
  const eligible = typeof row.parsed_text === 'string' && isCurrentConfirmedObjectiveBlocker(issue, row.parsed_text, row.direction);
  const [linkedPackage] = await executor
    .select({ id: c2cSubmissionPackages.id, packageFamily: c2cSubmissionPackages.packageFamily })
    .from(c2cSubmissionPackages)
    .where(
      and(
        eq(c2cSubmissionPackages.orgId, input.orgId),
        eq(c2cSubmissionPackages.projectId, input.projectId),
        inArray(c2cSubmissionPackages.status, ['active', 'draft', 'in_review', 'ready', 'locked'])
      )
    )
    .orderBy(asc(c2cSubmissionPackages.createdAt))
    .limit(1);

  let linkedSections: Array<{ sectionDbId: number; sectionKey: string }> = [];
  if (linkedPackage && issue.mappedCtdSections.length) {
    linkedSections = await executor
      .select({ sectionDbId: c2cPackageSections.id, sectionKey: c2cPackageSections.sectionKey })
      .from(c2cPackageSections)
      .where(
        and(
          eq(c2cPackageSections.packageDbId, linkedPackage.id),
          inArray(c2cPackageSections.sectionKey, issue.mappedCtdSections)
        )
      );
  }

  const blockerOpened = await synchronizeDerivedBlockers(input, { issue, eligible, packageId: linkedPackage?.id ?? null, linkedSections }, executor);

  return {
    linkedPackageDbId: linkedPackage?.id ?? null,
    linkedSections,
    blockerOpened,
    readinessPenalty: eligible ? { critical: 25, high: 15, medium: 5, low: 5 }[issue.severity] : 0,
    recommendedResponsePackageType:
      issue.structuredExtraction?.recommendedResponsePackageType || 'agency_response',
  };
}

export async function computeCorrespondenceIssueImpact(
  input: CorrespondenceImpactInput, executor: Executor = db,
): Promise<OperatingImpactResult> {
  return synchronizeReviewedCorrespondenceIssueImpact(input, executor);
}

export async function createCanonicalTasksForIssue(input: {
  orgId: number;
  projectId: number;
  issue: CorrespondenceIssue;
  ownerUserId: number;
  ownerName: string;
  linkedSectionKeys: string[];
}, executor: Executor = db): Promise<CanonicalTaskRecord[]> {
  const dueAt = new Date(Date.now() + slaHoursForSeverity(input.issue.severity) * 60 * 60 * 1000);
  const taskType = taskTypeForIssue(input.issue);
  const workItemId = `wi_${crypto.randomUUID()}`;

  await executor.insert(c2cProjectWorkItems).values({
    workItemId,
    orgId: input.orgId,
    projectId: input.projectId,
    // Correspondence is its own source, not a review task. Sharing 'review_task'
    // put agency-letter work on the same (source_type, source_id, org_id) dedup
    // key as real review tasks — and, with source_id 0, on the same key as every
    // other correspondence item. source_ref carries the issue id so each row
    // stays traceable to the letter that produced it.
    sourceType: 'correspondence',
    sourceId: 0,
    sourceRef: input.issue.id,
    title: `[${taskType}] ${input.issue.category}`,
    status: 'open',
    priority: input.issue.severity,
    dueAt,
    ownerId: input.ownerUserId || null,
    ownerName: input.ownerName || null,
    ctdSection: input.linkedSectionKeys[0] || null,
    blockerType: hasConfirmedObjectiveDisposition(input.issue) ? 'regulatory_correspondence_issue' : null,
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
      blockerImpact: hasConfirmedObjectiveDisposition(input.issue) ? 'publish_block' : 'none',
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
