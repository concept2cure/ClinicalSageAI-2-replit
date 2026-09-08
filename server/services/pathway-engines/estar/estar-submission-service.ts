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
import { recordGovernedAction } from '../../../routes/c2c/actions';
import {
  BINDING_BASIS,
  persistGovernedActionSignature,
  type SignatureDbClient,
} from '../../part11/signature-persistence';
import { queryableFromDrizzle } from '../../../db/drizzle-queryable';
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

/**
 * The signature a FILING carries. Declaring a submission made to FDA is the
 * most consequential act in this workflow, and it used to require nothing: a
 * status word, a date the client chose, and a free-text tracking number bound
 * to no artifact.
 *
 * `artifactDocumentId` names the retained eSTAR in the program vault. Its hash
 * is READ FROM THAT ROW, never taken from the caller, so a filing cannot claim
 * a digest nobody stored. `filedAt` is absent by design: the server stamps it.
 */
export interface EstarFilingSignature {
  /** vault.documents id of the retained official eSTAR this filing was made with. */
  artifactDocumentId: string;
  /** Reason-for-signing from the signature form (length enforced at the route). */
  reason: string;
  /** The §11.50 meaning the signer declared. */
  meaning: string;
  /** How the signer re-authenticated (verifyReauth already passed). */
  authenticationMethod: string;
  secondFactorVerified: boolean;
  ipAddress?: string | null;
}

export interface AdvanceEstarSubmissionInput {
  toStatus: EstarSubmissionStatus;
  fdaTrackingNumber?: string | null;
  decision?: string | null;
  /** REQUIRED to reach `filed`; ignored for every other transition. */
  signature?: EstarFilingSignature;
}

export interface SignedFilingParams {
  id: string;
  organizationId: number;
  userId: number;
  /** The status the transition was validated FROM; the UPDATE re-asserts it. */
  fromStatus: EstarSubmissionStatus;
  reviewGoalDays: number | null;
  artifactDocumentId: string;
  reason: string;
  meaning: string;
  authenticationMethod: string;
  secondFactorVerified: boolean;
  ipAddress?: string | null;
  fdaTrackingNumber?: string | null;
  /** The server's clock. Passed in so the write and the signature share one instant. */
  now: Date;
}

/**
 * Apply a SIGNED filing on the caller's transaction client: resolve the
 * artifact, move the row, record the governed action, write the electronic
 * signature. Everything on one client, so the signature lands with the filing
 * or not at all.
 *
 * Order is load-bearing. The artifact is resolved before anything is written —
 * a filing bound to a document this organization does not hold is refused, not
 * signed. The UPDATE re-asserts both the organization and the status it was
 * validated from, so a row that moved underneath us matches nothing and is a
 * NOT_FOUND rather than a signature attesting a transition that did not happen.
 * Only then is the act recorded and signed.
 *
 * Exported for its own tests: the SQL and the two Part 11 writes are observable
 * against a fake client, with no database.
 */
export async function applySignedFiling(
  client: SignatureDbClient,
  p: SignedFilingParams,
): Promise<{ artifactSha256: string }> {
  const artifact = await client.query(
    `SELECT content_hash FROM vault.documents
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
      LIMIT 1`,
    [p.artifactDocumentId, p.organizationId],
  );
  const artifactSha256: string | undefined = artifact.rows[0]?.content_hash;
  if (!artifactSha256) {
    throw new EstarSubmissionError(
      'VALIDATION',
      'The eSTAR named for this filing is not a retained document in your organization vault.',
    );
  }

  const decisionDueAt = computeDecisionDue(p.now, p.reviewGoalDays);
  // COALESCE on the tracking number: filing may supply one, and omitting it
  // leaves whatever is already there. Clearing it is not a filing action.
  const updated = await client.query(
    `UPDATE estar_submissions
        SET status = 'filed',
            filed_at = $3,
            decision_due_at = $4,
            filed_artifact_document_id = $5,
            filed_artifact_sha256 = $6,
            fda_tracking_number = COALESCE($7, fda_tracking_number),
            updated_at = $3
      WHERE id = $1 AND organization_id = $2 AND status = $8
      RETURNING id`,
    [
      p.id,
      p.organizationId,
      p.now,
      decisionDueAt,
      p.artifactDocumentId,
      artifactSha256,
      p.fdaTrackingNumber ?? null,
      p.fromStatus,
    ],
  );
  if (!updated.rows[0]) {
    throw new EstarSubmissionError(
      'NOT_FOUND',
      'The filing changed while it was being signed; nothing was filed and nothing was signed.',
    );
  }

  const target = `estar-submission:${p.id}`;
  const governed = await recordGovernedAction(client, {
    orgId: p.organizationId,
    userId: p.userId,
    command: 'sign',
    target,
    reason: p.reason,
    payload: {
      meaning: p.meaning,
      toStatus: 'filed',
      artifactDocumentId: p.artifactDocumentId,
      artifactSha256,
      filedAt: p.now.toISOString(),
    },
    domain: 'mdx',
    surface: 'estar-filing',
  });

  await persistGovernedActionSignature(client, {
    orgId: p.organizationId,
    userId: p.userId,
    target,
    reason: p.reason,
    payload: { meaning: p.meaning },
    actionId: governed.actionId,
    auditId: governed.auditId,
    sha256Chain: governed.sha256Chain,
    authenticationMethod: p.authenticationMethod,
    secondFactorVerified: p.secondFactorVerified,
    ipAddress: p.ipAddress ?? null,
    occurredAt: p.now,
    binding: {
      digest: artifactSha256,
      basis: BINDING_BASIS.FILED_ESTAR_ARTIFACT,
      note:
        `sha256 of the retained official eSTAR (vault.documents ${p.artifactDocumentId}), ` +
        'read from the stored row at filing time.',
    },
    // An auditor reading the manifest should not have to join a hash back to a
    // document to learn what was filed.
    extraManifest: {
      filedArtifactDocumentId: p.artifactDocumentId,
      filedAt: p.now.toISOString(),
    },
    manifestKind: 'governed-estar-filing',
    command: 'sign',
  });

  return { artifactSha256 };
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

  /* FILING IS A SIGNATURE. Every other transition is a status change this
     service audits; reaching `filed` declares a submission made to FDA, so it
     goes through the governed path: an artifact this organization holds, a
     server-stamped instant, a ledger row and an electronic signature bound to
     the artifact's hash, all on one transaction. */
  if (input.toStatus === 'filed') {
    if (!input.signature) {
      throw new EstarSubmissionError(
        'VALIDATION',
        'Filing an eSTAR requires an electronic signature naming the retained eSTAR it was filed with.',
      );
    }
    const now = new Date();
    await db.transaction(async (tx) => {
      await applySignedFiling(queryableFromDrizzle(tx), {
        id,
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        fromStatus: current.status as EstarSubmissionStatus,
        reviewGoalDays: current.reviewGoalDays,
        artifactDocumentId: input.signature!.artifactDocumentId,
        reason: input.signature!.reason,
        meaning: input.signature!.meaning,
        authenticationMethod: input.signature!.authenticationMethod,
        secondFactorVerified: input.signature!.secondFactorVerified,
        ipAddress: input.signature!.ipAddress ?? null,
        fdaTrackingNumber: input.fdaTrackingNumber ?? null,
        now,
      });
    });
    // Re-read through the same accessor every other path returns, so the
    // response shape cannot drift from the raw UPDATE's column names.
    return getEstarSubmission(id, ctx);
  }

  const patch: Partial<typeof estarSubmissions.$inferInsert> = {
    status: input.toStatus,
    updatedAt: new Date(),
  };
  if (input.fdaTrackingNumber !== undefined) patch.fdaTrackingNumber = input.fdaTrackingNumber;
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
  applySignedFiling,
  canTransition,
  computeDecisionDue,
  createEstarSubmission,
  listEstarSubmissions,
  getEstarSubmission,
  advanceEstarSubmission,
};
