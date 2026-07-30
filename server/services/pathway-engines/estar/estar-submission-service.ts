/**
 * eSTAR submission-tracking service — org-scoped persistence + lifecycle for the
 * program-agnostic filing tracker (estar_submissions).
 *
 * This is the bridge that connects the readiness/catalog engine to lifecycle
 * tracking: `createEstarSubmission` starts a tracked record from a catalog key,
 * denormalizing the program type and review clock (reviewGoalDays) from the
 * catalog so the decision-due date is computed from the FDA review goal.
 * `advanceEstarSubmission` moves it through the lifecycle with validated
 * transitions and stamps the clock on filing.
 *
 * Pure lifecycle helpers (transition table, decision-due math) are exported for
 * unit testing without a DB; every read/write is tenant-scoped from ctx and
 * audited — mirroring estar-registration-service / ind-master-data-service.
 *
 * @module server/services/pathway-engines/estar/estar-submission-service
 */

import { and, eq, desc } from 'drizzle-orm';
import { db } from '../../../db';
import {
  estarSubmissions,
  ESTAR_SUBMISSION_STATUSES,
  type EstarSubmissionRow,
  type EstarSubmissionStatus,
} from '../../../../shared/schema/estar-submission';
import { getCatalogEntry, type EstarCatalogKey } from './estar-catalog';
import auditService from '../../auditService';
import { createScopedLogger } from '../../../utils/logger';

const logger = createScopedLogger('estar-submission-service');

export type EstarSubmissionErrorCode = 'NOT_FOUND' | 'VALIDATION';
export class EstarSubmissionError extends Error {
  constructor(public code: EstarSubmissionErrorCode, message: string) {
    super(message);
    this.name = 'EstarSubmissionError';
  }
}

interface Ctx {
  organizationId: number;
  userId: number;
}

// ── Pure lifecycle helpers (no DB) ───────────────────────────────────────────

/** Allowed forward transitions; `decision` and `withdrawn` are terminal. */
const TRANSITIONS: Record<EstarSubmissionStatus, readonly EstarSubmissionStatus[]> = {
  draft: ['filed', 'withdrawn'],
  filed: ['under_review', 'withdrawn'],
  under_review: ['additional_info', 'decision', 'withdrawn'],
  additional_info: ['under_review', 'decision', 'withdrawn'],
  decision: [],
  withdrawn: [],
};

/** True when `to` is a permitted next status from `from`. */
export function canTransition(from: EstarSubmissionStatus, to: EstarSubmissionStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Decision-due date = filedAt + reviewGoalDays; null when there is no clock. */
export function computeDecisionDue(filedAt: Date, reviewGoalDays?: number | null): Date | null {
  if (!reviewGoalDays || reviewGoalDays <= 0) return null;
  return new Date(filedAt.getTime() + reviewGoalDays * 24 * 60 * 60 * 1000);
}

// ── CRUD + lifecycle (DB) ────────────────────────────────────────────────────

export interface CreateEstarSubmissionInput {
  catalogKey: string;
  variant?: 'device' | 'ivd';
  title?: string | null;
  qSubmissionId?: string | null;
  notes?: string | null;
  /** Project this filing belongs to — connects tracking to the PM spine. */
  projectId?: number | null;
}

/**
 * Start tracking a filing from a catalog key. Program type + review clock are
 * pulled from the catalog (the filing→tracking bridge); starts in `draft`.
 */
export async function createEstarSubmission(
  input: CreateEstarSubmissionInput,
  ctx: Ctx,
): Promise<EstarSubmissionRow> {
  const entry = getCatalogEntry(input.catalogKey as EstarCatalogKey);
  if (!entry) {
    throw new EstarSubmissionError('VALIDATION', `No eSTAR catalog entry for "${input.catalogKey}".`);
  }
  const [row] = await db
    .insert(estarSubmissions)
    .values({
      organizationId: ctx.organizationId,
      catalogKey: input.catalogKey,
      programType: entry.programType,
      variant: input.variant ?? 'device',
      title: input.title ?? entry.label,
      status: 'draft',
      reviewGoalDays: entry.reviewGoalDays ?? null,
      qSubmissionId: input.qSubmissionId ?? null,
      projectId: input.projectId ?? null,
      notes: input.notes ?? null,
      createdBy: ctx.userId,
    })
    .returning();
  await auditService.logAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'ESTAR_SUBMISSION_CREATED',
    resourceType: 'estar_submission',
    resourceId: row.id,
    details: { catalogKey: input.catalogKey, programType: entry.programType },
  });
  logger.info('Created eSTAR submission', { id: row.id, organizationId: ctx.organizationId });
  return row as EstarSubmissionRow;
}

export async function listEstarSubmissions(
  ctx: { organizationId: number },
  filters: { status?: EstarSubmissionStatus; projectId?: number } = {},
): Promise<EstarSubmissionRow[]> {
  const conds = [eq(estarSubmissions.organizationId, ctx.organizationId)];
  if (filters.status) conds.push(eq(estarSubmissions.status, filters.status));
  // Project view: "what filings does this project have in flight?"
  if (filters.projectId !== undefined) conds.push(eq(estarSubmissions.projectId, filters.projectId));
  const rows = await db
    .select()
    .from(estarSubmissions)
    .where(and(...conds))
    .orderBy(desc(estarSubmissions.updatedAt));
  return rows as EstarSubmissionRow[];
}

export async function getEstarSubmission(
  id: string,
  ctx: { organizationId: number },
): Promise<EstarSubmissionRow> {
  const [row] = await db
    .select()
    .from(estarSubmissions)
    .where(and(eq(estarSubmissions.id, id), eq(estarSubmissions.organizationId, ctx.organizationId)))
    .limit(1);
  if (!row) throw new EstarSubmissionError('NOT_FOUND', 'eSTAR submission not found for this organization.');
  return row as EstarSubmissionRow;
}

export interface AdvanceEstarSubmissionInput {
  toStatus: EstarSubmissionStatus;
  filedAt?: Date;
  fdaTrackingNumber?: string | null;
  decision?: string | null;
}

/**
 * Advance a tracked submission through its lifecycle with a validated
 * transition. Filing stamps the review clock (filedAt + decisionDueAt from the
 * denormalized reviewGoalDays).
 */
export async function advanceEstarSubmission(
  id: string,
  input: AdvanceEstarSubmissionInput,
  ctx: Ctx,
): Promise<EstarSubmissionRow> {
  const current = await getEstarSubmission(id, ctx);
  if (!ESTAR_SUBMISSION_STATUSES.includes(input.toStatus)) {
    throw new EstarSubmissionError('VALIDATION', `Unknown status "${input.toStatus}".`);
  }
  if (!canTransition(current.status as EstarSubmissionStatus, input.toStatus)) {
    throw new EstarSubmissionError(
      'VALIDATION',
      `Cannot move an eSTAR submission from "${current.status}" to "${input.toStatus}".`,
    );
  }

  const patch: Partial<typeof estarSubmissions.$inferInsert> = {
    status: input.toStatus,
    updatedAt: new Date(),
  };
  if (input.fdaTrackingNumber !== undefined) patch.fdaTrackingNumber = input.fdaTrackingNumber;
  if (input.toStatus === 'filed') {
    const filedAt = input.filedAt ?? new Date();
    patch.filedAt = filedAt;
    patch.decisionDueAt = computeDecisionDue(filedAt, current.reviewGoalDays);
  }
  if (input.toStatus === 'decision' && input.decision !== undefined) {
    patch.decision = input.decision;
  }

  const [row] = await db
    .update(estarSubmissions)
    .set(patch)
    .where(and(eq(estarSubmissions.id, id), eq(estarSubmissions.organizationId, ctx.organizationId)))
    .returning();
  if (!row) throw new EstarSubmissionError('NOT_FOUND', 'eSTAR submission not found for this organization.');
  await auditService.logAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'ESTAR_SUBMISSION_ADVANCED',
    resourceType: 'estar_submission',
    resourceId: id,
    details: { from: current.status, to: input.toStatus },
  });
  return row as EstarSubmissionRow;
}

export default {
  canTransition,
  computeDecisionDue,
  createEstarSubmission,
  listEstarSubmissions,
  getEstarSubmission,
  advanceEstarSubmission,
};
